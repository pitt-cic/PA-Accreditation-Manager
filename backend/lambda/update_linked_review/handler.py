"""Lambda handler for POST /standards/{id}/linked-review.

Updates the human review fields on a LinkedStandard record without
overwriting machine-generated fields or essential_evidences.
"""

import json
import logging
import sys
from datetime import datetime, timezone

sys.path.insert(0, "/var/task")

from shared.linked_standards_client import LinkedStandardsDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}

VALID_REVIEW_STATUSES = {
    "needs_review",
    "review_in_progress",
    "human_verified",
    "needs_revision",
}

VALID_READINESS_STATUSES = {
    "ready",
    "mostly_ready",
    "needs_work",
    "not_ready",
}

def _handler(event, _context):
    """
    Update human review fields on a WF5 LinkedStandard.

    Path: POST /standards/{id}/linked-review
    Body:
        {
            "human_review_status": "needs_review|review_in_progress|human_verified|needs_revision",
            "human_readiness_status": "ready|mostly_ready|needs_work|not_ready",  (optional)
            "human_review_note": "string"  (optional)
        }
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    standard_id = (event.get("pathParameters") or {}).get("id")
    if not standard_id:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "standard_id path parameter is required"}),
        }

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Invalid JSON in request body"}),
        }

    human_review_status = body.get("human_review_status")
    if not human_review_status:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "human_review_status is required"}),
        }
    if human_review_status not in VALID_REVIEW_STATUSES:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"Invalid human_review_status: {human_review_status}"}),
        }

    human_readiness_status = body.get("human_readiness_status")
    if human_readiness_status and human_readiness_status not in VALID_READINESS_STATUSES:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"Invalid human_readiness_status: {human_readiness_status}"}),
        }

    human_review_note = body.get("human_review_note", "").strip() or None

    # Extract reviewer identity from Cognito authorizer
    request_context = event.get("requestContext", {})
    claims = (request_context.get("authorizer") or {}).get("claims") or {}
    reviewer_email = claims.get("email", "unknown")

    logger.info(
        f"Linked review update for {standard_id}: status={human_review_status} "
        f"by {reviewer_email}"
    )

    review_data: dict = {
        "human_review_status": human_review_status,
        "reviewer":            reviewer_email,
        "review_date":         datetime.now(timezone.utc).isoformat(),
    }
    if human_readiness_status:
        review_data["human_readiness_status"] = human_readiness_status
    if human_review_note:
        review_data["review_notes"] = human_review_note

    db = LinkedStandardsDBClient()
    updated = db.update_review(standard_id, review_data)

    if updated is None:
        return {
            "statusCode": 404,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"No linked standard found for {standard_id}"}),
        }

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps(updated, default=str),
    }

handler = _handler
