"""Lambda handler for deleting comments."""

import json
import logging

from shared.comments_client import CommentsDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _handler(event, _context):
    """
    Delete a comment from a standard.

    DELETE /standards/{id}/comments/{commentId}
    """
    logger.info(f"Event: {json.dumps(event)}")

    path_params = event.get("pathParameters", {}) or {}
    standard_id = path_params.get("id")
    comment_id = path_params.get("commentId")

    if not standard_id or not comment_id:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Missing standard ID or comment ID"}),
        }

    # Get user email from Cognito authorizer
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})
    claims = authorizer.get("claims", {})
    user_email = claims.get("email", "unknown")

    db = CommentsDBClient()

    # Get comment to verify ownership
    comment = db.get_comment(standard_id, comment_id)
    if not comment:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Comment not found"}),
        }

    # Check ownership - only author can delete their own comments
    if comment.get("author") != user_email:
        return {
            "statusCode": 403,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "You can only delete your own comments"}),
        }

    logger.info(f"Deleting comment {comment_id} from {standard_id} by {user_email}")

    deleted = db.delete_comment(standard_id, comment_id)

    if not deleted:
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Comment not found"}),
        }

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps({"deleted": True, "comment_id": comment_id}),
    }

handler = _handler
