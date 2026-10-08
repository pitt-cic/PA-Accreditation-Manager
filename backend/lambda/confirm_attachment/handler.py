"""Lambda handler for POST /standards/{id}/attachments/{attachmentId}/confirm.

Called by the frontend after a successful S3 presigned PUT upload.
Flips upload_confirmed=True and removes the TTL, making the attachment
visible in GET /standards/{id} responses.
"""

import json
import logging
import sys

sys.path.insert(0, "/var/task")

from shared import json_dumps
from shared.attachments_client import AttachmentsDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}

def _handler(event, _context):
    """
    POST /standards/{id}/attachments/{attachmentId}/confirm

    No request body required. Returns the confirmed attachment record.
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    path_params = event.get("pathParameters") or {}
    standard_id = path_params.get("id")
    attachment_id = path_params.get("attachmentId")

    if not standard_id or not attachment_id:
        return {"statusCode": 400, "headers": CORS_HEADERS,
                "body": json.dumps({"error": "standard_id and attachmentId are required"})}

    db = AttachmentsDBClient()
    updated = db.confirm_attachment(standard_id, attachment_id)

    if updated is None:
        return {"statusCode": 404, "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Attachment {attachment_id} not found"})}

    logger.info(f"Attachment {attachment_id} confirmed for {standard_id}")

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json_dumps(updated),
    }

handler = _handler
