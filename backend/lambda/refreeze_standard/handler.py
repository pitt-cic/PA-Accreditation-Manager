"""Lambda handler for POST /audit/{year}/standards/{id}/refreeze.

Re-locks an unlocked standard after edits by setting is_frozen=True.

Returns 400 if year or id path parameter is missing.
Returns 404 if the standard record does not exist.
Returns 409 if the standard is already frozen (is_frozen=True).
Returns 200 on success.
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
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

STANDARDS_TABLE_NAME = os.environ["LINKED_STANDARDS_TABLE"]

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
_standards_table = _dynamodb.Table(STANDARDS_TABLE_NAME)

def _handler(event, _context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    year = (event.get("pathParameters") or {}).get("year")
    standard_id = (event.get("pathParameters") or {}).get("id")

    if not year or not standard_id:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "year and id path parameters are required"}),
        }

    # Validate standard_id does not contain '#' to avoid key ambiguity
    if "#" in standard_id:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "standard_id cannot contain '#' character"}),
        }

    try:
        # Construct the frozen key (original_id#year)
        frozen_key = f"{standard_id}#{year}"

        # Fetch the record
        response = _standards_table.get_item(Key={"standard_id": frozen_key})
        record = response.get("Item")

        if not record:
            logger.warning(f"Standard {frozen_key!r} not found")
            return {
                "statusCode": 404,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Standard {standard_id!r} not found for year {year!r}"}),
            }

        if record.get("is_frozen"):
            logger.info(f"Standard {frozen_key!r} is already frozen")
            return {
                "statusCode": 409,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Standard {standard_id!r} is already frozen"}),
            }

        # Re-lock the record by setting is_frozen=True
        _standards_table.update_item(
            Key={"standard_id": frozen_key},
            UpdateExpression="SET is_frozen = :true",
            ExpressionAttributeValues={":true": True},
        )
        logger.info(f"Standard {frozen_key!r} re-frozen")

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "year": year,
                "standard_id": standard_id,
                "message": "Standard re-frozen successfully",
            }),
        }

    except Exception as e:
        logger.error(f"Error re-freezing standard: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Internal server error"}),
        }

handler = _handler
