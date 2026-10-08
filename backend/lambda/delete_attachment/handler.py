"""Lambda handler for DELETE /standards/{id}/attachments/{attachmentId}.

Removes the S3 object and the DynamoDB metadata record. Only the uploader
or an admin can delete — for prototype simplicity we allow any authenticated
user to delete (access control can be tightened post-prototype).
"""

import json
import logging
import os
import sys

sys.path.insert(0, "/var/task")

import boto3
from botocore.exceptions import ClientError

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
    DELETE /standards/{id}/attachments/{attachmentId}

    Returns 204 on success, 404 if not found.
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
    existing = db.get_attachment(standard_id, attachment_id)
    if not existing:
        return {"statusCode": 404, "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Attachment {attachment_id} not found"})}

    # Delete from S3 only for exclusively-owned uploads.
    # Linked attachments (is_linked=True) point to shared objects in the docs
    # bucket that may be referenced by other attachments or pipeline processes.
    s3_key = existing.get("s3_key", "")
    is_linked = existing.get("is_linked", False)
    if s3_key and not is_linked:
        bucket = os.environ["S3_DOCUMENTS_BUCKET"]
        s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        try:
            s3.delete_object(Bucket=bucket, Key=s3_key)
        except ClientError as e:
            logger.warning(f"S3 delete failed for {s3_key}: {e} — continuing to remove DynamoDB record")
    elif is_linked:
        logger.info(f"Skipping S3 delete for linked attachment {attachment_id} — shared object at {s3_key}")

    # Delete from DynamoDB
    db.delete_attachment(standard_id, attachment_id)

    logger.info(f"Deleted attachment {attachment_id} for {standard_id}")

    return {"statusCode": 200, "headers": CORS_HEADERS,
            "body": json.dumps({"deleted": True, "attachment_id": attachment_id})}

handler = _handler
