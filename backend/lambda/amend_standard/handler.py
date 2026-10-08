"""Lambda handler for POST /audit/{year}/standards/{id}/amend.

Unlocks a frozen standard for editing by:
1. Verifying the record is currently frozen (is_frozen=True)
2. Writing a full snapshot to AuditAmendmentsTable with timestamp and reason
3. Setting is_frozen=False on the LinkedStandard record

Uses DynamoDB transactions to ensure atomicity (log write and is_frozen update succeed or fail together).

Returns 400 if year or id path parameter is missing, if reason is empty, or if standard_id contains '#'.
Returns 404 if the frozen standard record does not exist.
Returns 409 if the standard is already unlocked (is_frozen=False).
Returns 200 with the amendment log entry on success.
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, "/var/task")

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

STANDARDS_TABLE_NAME = os.environ["LINKED_STANDARDS_TABLE"]
AMENDMENTS_TABLE_NAME = os.environ["AUDIT_AMENDMENTS_TABLE"]

_dynamodb_resource = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
_dynamodb_client = boto3.client("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
_standards_table = _dynamodb_resource.Table(STANDARDS_TABLE_NAME)
_amendments_table = _dynamodb_resource.Table(AMENDMENTS_TABLE_NAME)


def _handler(event, _context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    year = (event.get("pathParameters") or {}).get("year")
    standard_id = (event.get("pathParameters") or {}).get("id")

    logger.info("Amend standard request year=%s standard_id=%s", year, standard_id)

    if not year or not standard_id:
        logger.warning("Missing path parameters year=%s standard_id=%s", year, standard_id)
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "year and id path parameters are required"}),
        }

    if "#" in standard_id:
        logger.warning("Invalid standard_id contains '#' standard_id=%s", standard_id)
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "standard_id cannot contain '#' character"}),
        }

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        logger.error("Invalid JSON body body=%s", event.get("body", "")[:200])
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Invalid JSON body"}),
        }

    reason = body.get("reason", "").strip()
    if not reason:
        logger.warning("Empty reason provided year=%s standard_id=%s", year, standard_id)
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "reason is required and cannot be empty"}),
        }

    try:
        frozen_key = f"{standard_id}#{year}"

        response = _standards_table.get_item(Key={"standard_id": frozen_key})
        record = response.get("Item")

        if not record:
            logger.warning("Frozen standard not found frozen_key=%s", frozen_key)
            return {
                "statusCode": 404,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Frozen standard {standard_id!r} not found for year {year!r}"}),
            }

        if not record.get("is_frozen"):
            logger.warning("Standard already unlocked frozen_key=%s is_frozen=%s", frozen_key, record.get("is_frozen"))
            return {
                "statusCode": 409,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Standard {standard_id!r} is already unlocked"}),
            }

        timestamp = datetime.now(timezone.utc).isoformat()
        amendment_id = f"{frozen_key}#{timestamp}"

        amendment_entry = {
            "audit_year": {"S": year},
            "amendment_id": {"S": amendment_id},
            "standard_id": {"S": frozen_key},
            "timestamp": {"S": timestamp},
            "reason": {"S": reason},
            "previous_snapshot": {"S": json.dumps(record, default=str)},
            "action": {"S": "unlock"},
        }

        try:
            _dynamodb_client.transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": AMENDMENTS_TABLE_NAME,
                            "Item": amendment_entry,
                        }
                    },
                    {
                        "Update": {
                            "TableName": STANDARDS_TABLE_NAME,
                            "Key": {"standard_id": {"S": frozen_key}},
                            "UpdateExpression": "SET is_frozen = :false",
                            "ConditionExpression": "attribute_exists(standard_id) AND is_frozen = :true",
                            "ExpressionAttributeValues": {
                                ":false": {"BOOL": False},
                                ":true": {"BOOL": True},
                            },
                        }
                    },
                ]
            )
            logger.info(
                "Amendment successful frozen_key=%s timestamp=%s reason_length=%d",
                frozen_key, timestamp, len(reason),
            )

            return {
                "statusCode": 200,
                "headers": CORS_HEADERS,
                "body": json.dumps({
                    "year": year,
                    "standard_id": standard_id,
                    "timestamp": timestamp,
                    "reason": reason,
                }),
            }

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code == "TransactionCanceledException":
                logger.warning("Transaction cancelled frozen_key=%s error_code=%s", frozen_key, error_code)
                return {
                    "statusCode": 409,
                    "headers": CORS_HEADERS,
                    "body": json.dumps({"error": "Standard is already unlocked or state changed during operation"}),
                }
            raise

    except Exception as e:
        logger.error("Error amending standard error=%s error_type=%s year=%s standard_id=%s", str(e), type(e).__name__, year, standard_id, exc_info=True)
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Internal server error"}),
        }


handler = _handler
