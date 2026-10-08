"""Lambda handler for updating human review status of a standard."""

import json
import logging
from datetime import datetime

from shared import json_dumps
from shared.db_client import DynamoDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _handler(event, _context):
    """
    Update human review status for a standard.

    POST /standards/{id}/human-review
    Body: {
        "human_review_status": "needs_review" | "review_in_progress" | "human_verified" | "needs_revision",
        "human_readiness_assessment": "ready" | "mostly_ready" | "needs_work" | "not_ready" (optional),
        "human_review_note": "Optional explanation text"
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

    human_review_status = body.get("human_review_status")
    human_readiness_assessment = body.get("human_readiness_assessment")
    human_review_note = body.get("human_review_note", "").strip()

    if human_review_status not in ("needs_review", "review_in_progress", "human_verified", "needs_revision"):
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "error": "human_review_status must be 'needs_review', 'review_in_progress', 'human_verified', or 'needs_revision'"
            }),
        }

    # Get user email from Cognito authorizer
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})
    claims = authorizer.get("claims", {})
    user_email = claims.get("email", "unknown")

    human_reviewed_at = datetime.now().isoformat()

    logger.info(
        f"Updating human review for {standard_id} - status: {human_review_status}, user: {user_email}"
    )

    db = DynamoDBClient()
    updated_item = db.update_human_review(
        standard_id=standard_id,
        human_review_status=human_review_status,
        human_readiness_assessment=human_readiness_assessment,
        human_reviewed_by=user_email,
        human_reviewed_at=human_reviewed_at,
        human_review_note=human_review_note,
    )

    if not updated_item:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Standard not found or no evidence data"}),
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
