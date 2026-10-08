"""Lambda handler for manually resolving evidence items and focused questions."""

import json
import logging
from datetime import datetime

from shared import json_dumps
from shared.db_client import DynamoDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _handler(event, _context):
    """
    Mark an essential evidence item or focused question as manually resolved.

    POST /standards/{id}/resolve
    Body: {
        "target_type": "evidence" | "question",
        "target_index": 0,
        "resolved_note": "Explanation text",
        "unresolve": false  // optional, set true to undo resolution
    }
    """
    logger.info(f"Event: {json.dumps(event)}")

    path_params = event.get("pathParameters", {}) or {}
    standard_id = path_params.get("id")

    if not standard_id:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Missing standard ID"}),
        }

    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Invalid JSON body"}),
        }

    target_type = body.get("target_type")
    target_index = body.get("target_index")
    resolved_note = body.get("resolved_note", "").strip()
    unresolve = bool(body.get("unresolve", False))

    if target_type not in ("evidence", "question"):
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "target_type must be 'evidence' or 'question'"}),
        }

    if target_index is None or not isinstance(target_index, int):
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "target_index (integer) is required"}),
        }

    if not unresolve and not resolved_note:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "resolved_note is required when resolving an item"}),
        }

    # Get user email from Cognito authorizer
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})
    claims = authorizer.get("claims", {})
    user_email = claims.get("email", "unknown")

    resolved_at = datetime.now().isoformat()

    logger.info(
        f"Resolving {standard_id} - type: {target_type}, index: {target_index}, "
        f"unresolve: {unresolve}, user: {user_email}"
    )

    db = DynamoDBClient()
    updated_item = db.resolve_item(
        standard_id=standard_id,
        target_type=target_type,
        target_index=target_index,
        resolved_by=user_email,
        resolved_at=resolved_at,
        resolved_note=resolved_note,
        unresolve=unresolve,
    )

    if not updated_item:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Standard not found, no evidence data, or index out of range"}),
        }

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json_dumps(updated_item),
    }

handler = _handler
