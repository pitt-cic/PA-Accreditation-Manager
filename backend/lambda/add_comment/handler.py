"""Lambda handler for adding comments to standards."""

import json
import logging

from shared import json_dumps
from shared.comments_client import CommentsDBClient
from shared.models import CommentItem, WF5_TARGET_TYPES

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _handler(event, _context):
    """
    Add a comment to a standard.

    POST /standards/{id}/comments
    Body: {
        "target_type": "evidence" | "question" | "standard",
        "target_index": 0,  // index of evidence/question, null for standard-level
        "text": "Comment text"
    }
    """
    logger.info(f"Event: {json.dumps(event)}")

    # Get standard ID from path
    path_params = event.get("pathParameters", {}) or {}
    standard_id = path_params.get("id")

    if not standard_id:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Missing standard ID"}),
        }

    # Parse request body
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
    target_path = body.get("target_path")
    text = body.get("text", "").strip()

    valid_types = {"evidence", "question", "standard"} | WF5_TARGET_TYPES
    if target_type not in valid_types:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {"error": f"target_type must be one of: {', '.join(sorted(valid_types))}"}
            ),
        }

    if target_type in WF5_TARGET_TYPES and not target_path:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {"error": "target_path required for linked (WF5) comments"}
            ),
        }

    if target_type not in WF5_TARGET_TYPES and target_type != "standard" and target_index is None:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(
                {"error": "target_index required for evidence/question comments"}
            ),
        }

    if not text:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Comment text is required"}),
        }

    # Get user email from Cognito authorizer
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})
    claims = authorizer.get("claims", {})
    user_email = claims.get("email", "unknown")

    # Generate initials from email
    email_prefix = user_email.split("@")[0] if "@" in user_email else user_email
    initials = email_prefix[:2].upper()

    # WF5 types use target_path for routing; all others use target_index
    if target_type in WF5_TARGET_TYPES:
        effective_target_index = -1
    elif target_type == "standard":
        effective_target_index = -1
    else:
        effective_target_index = target_index

    # Create comment item for DynamoDB
    comment_item = CommentItem(
        standard_id=standard_id,
        target_type=target_type,
        target_index=effective_target_index,
        target_path=target_path,
        author=user_email,
        initials=initials,
        text=text,
    )

    logger.info(
        f"Adding comment to {standard_id} - type: {target_type}, "
        f"index: {effective_target_index}, author: {user_email}, text: {text}"
    )

    # Add comment to comments table
    db = CommentsDBClient()
    created_comment = db.add_comment(comment_item)

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json_dumps({"comment": created_comment.model_dump()}),
    }

handler = _handler
