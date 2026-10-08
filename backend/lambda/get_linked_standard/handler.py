"""Lambda handler for GET /standards/{id}/linked: fetch the linked standard (WF5 output)."""

import json
import logging
import sys

sys.path.insert(0, "/var/task")

from shared.linked_standards_client import LinkedStandardsDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}

def _decimal_default(obj):
    """Handle Decimal serialization from DynamoDB."""
    from decimal import Decimal
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def _handler(event, _context):
    """
    Return the linked standard for a given standard_id.

    Path: GET /standards/{id}/linked
    Returns the full LinkedStandard object from LinkedStandardsTable, or 404.
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    standard_id = event.get("pathParameters", {}).get("id")
    if not standard_id:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "standard_id path parameter is required"}),
        }

    db = LinkedStandardsDBClient()
    item = db.get_linked_standard(standard_id)

    if not item:
        return {
            "statusCode": 404,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "error": f"No linked standard found for {standard_id}",
                "hint": "The standard may not have been mapped yet. Use POST /standards/{id}/map to trigger mapping.",
            }),
        }

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps(item, default=_decimal_default),
    }

handler = _handler
