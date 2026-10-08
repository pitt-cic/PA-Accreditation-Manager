"""Lambda handler for GET /audit/{year}/amendments.

Fetches all amendment log entries for a given audit year from AuditAmendmentsTable.

Returns 400 if year path parameter is missing.
Returns 200 with a list of amendment entries on success.
"""

import json
import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}

AMENDMENTS_TABLE_NAME = os.environ["AUDIT_AMENDMENTS_TABLE"]

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
_amendments_table = _dynamodb.Table(AMENDMENTS_TABLE_NAME)

def _handler(event, _context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    year = (event.get("pathParameters") or {}).get("year")

    if not year:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "year path parameter is required"}),
        }

    try:
        # Query all amendments for this audit year
        items = []
        response = _amendments_table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key("audit_year").eq(year),
        )
        items.extend(response.get("Items", []))

        # Handle pagination if necessary
        while "LastEvaluatedKey" in response:
            response = _amendments_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key("audit_year").eq(year),
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))

        # Parse previous_snapshot JSON strings back to objects if stored as strings
        for item in items:
            if "previous_snapshot" in item and isinstance(item["previous_snapshot"], str):
                try:
                    item["previous_snapshot"] = json.loads(item["previous_snapshot"])
                except (json.JSONDecodeError, TypeError):
                    pass  # Leave as-is if not valid JSON

        logger.info(f"Found {len(items)} amendment entries for year {year!r}")

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "year": year,
                "amendments": items,
            }, default=str),
        }

    except Exception as e:
        logger.error(f"Error fetching amendments: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Internal server error"}),
        }

handler = _handler
