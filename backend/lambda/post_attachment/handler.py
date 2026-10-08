"""Lambda handler for POST /standards/{id}/attachments.

Generates a presigned S3 PUT URL for direct browser upload and writes
the attachment metadata record to DynamoDB. The client uploads the file
directly to S3 using the returned URL, then calls GET /standards/{id}
to see the attachment in the response.
"""

import json
import logging
import os
import sys
import time

sys.path.insert(0, "/var/task")

import boto3

from shared import json_dumps
from shared.attachments_client import AttachmentsDBClient
from shared.models import AttachmentItem, ATTACHMENT_TARGET_TYPES

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
PRESIGNED_URL_EXPIRY = 300        # 5 minutes
UNCONFIRMED_TTL_SECONDS = 86400   # 24 hours — unconfirmed records auto-expire

def _handler(event, _context):
    """
    POST /standards/{id}/attachments

    Body:
        {
            "file_name": "syllabus.pdf",
            "file_size": 102400,
            "content_type": "application/pdf",
            "target_type": "standard" | "linked_ee",
            "target_path": "B2.03-E1",   (required for linked_ee)
            "note": "Supporting evidence for E1"  (optional)
        }

    Returns:
        {
            "attachment_id": "...",
            "upload_url": "https://s3.amazonaws.com/...",
            "s3_key": "attachments/B2.03/uuid.pdf"
        }
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    standard_id = (event.get("pathParameters") or {}).get("id")
    if not standard_id:
        return {"statusCode": 400, "headers": CORS_HEADERS,
                "body": json.dumps({"error": "standard_id path parameter is required"})}

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {"statusCode": 400, "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Invalid JSON in request body"})}

    file_name = (body.get("file_name") or "").strip()
    file_size = body.get("file_size", 0)
    content_type = (body.get("content_type") or "application/octet-stream").strip()
    target_type = (body.get("target_type") or "").strip()
    target_path = (body.get("target_path") or "").strip() or None
    note = (body.get("note") or "").strip() or None
    existing_s3_key = (body.get("existing_s3_key") or "").strip() or None

    if existing_s3_key and ".." in existing_s3_key:
        return {"statusCode": 400, "headers": CORS_HEADERS,
                "body": json.dumps({"error": "existing_s3_key is invalid"})}

    if not file_name:
        return {"statusCode": 400, "headers": CORS_HEADERS,
                "body": json.dumps({"error": "file_name is required"})}

    if target_type not in ATTACHMENT_TARGET_TYPES:
        return {"statusCode": 400, "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"target_type must be one of: {', '.join(sorted(ATTACHMENT_TARGET_TYPES))}"})}

    if target_type == "linked_ee" and not target_path:
        return {"statusCode": 400, "headers": CORS_HEADERS,
                "body": json.dumps({"error": "target_path is required for linked_ee attachments"})}

    # New-file path requires a valid size; existing-file path does not
    if not existing_s3_key:
        if not isinstance(file_size, int) or file_size <= 0:
            return {"statusCode": 400, "headers": CORS_HEADERS,
                    "body": json.dumps({"error": "file_size must be a positive integer (bytes) for new uploads"})}
        if file_size > MAX_FILE_SIZE:
            return {"statusCode": 400, "headers": CORS_HEADERS,
                    "body": json.dumps({"error": f"File exceeds maximum size of {MAX_FILE_SIZE // (1024*1024)} MB"})}

    claims = ((event.get("requestContext") or {}).get("authorizer") or {}).get("claims") or {}
    uploader = claims.get("email", "unknown")

    is_linked = bool(existing_s3_key)

    attachment = AttachmentItem(
        standard_id=standard_id,
        target_type=target_type,
        target_path=target_path,
        file_name=file_name,
        file_size=file_size,
        content_type=content_type,
        uploader=uploader,
        note=note,
        s3_key=existing_s3_key or "",  # filled below for new uploads
        is_linked=is_linked,
        # Linked files are immediately confirmed — no S3 upload step.
        # New uploads start unconfirmed with a TTL; confirmed via POST /confirm.
        upload_confirmed=is_linked,
        ttl=None if is_linked else int(time.time()) + UNCONFIRMED_TTL_SECONDS,
    )

    if existing_s3_key:
        db = AttachmentsDBClient()
        db.add_attachment(attachment)
        logger.info(f"Existing file linked as attachment {attachment.attachment_id} for {standard_id} by {uploader}")
        return {
            "statusCode": 201,
            "headers": CORS_HEADERS,
            "body": json_dumps({
                "attachment_id": attachment.attachment_id,
                "upload_url": None,
                "s3_key": existing_s3_key,
            }),
        }

    # New file — generate presigned PUT URL, write pending record
    s3_key = f"attachments/{standard_id}/{attachment.attachment_id}/{os.path.basename(file_name)}"
    attachment.s3_key = s3_key

    bucket = os.environ["S3_DOCUMENTS_BUCKET"]
    s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": s3_key, "ContentType": content_type},
        ExpiresIn=PRESIGNED_URL_EXPIRY,
    )

    db = AttachmentsDBClient()
    db.add_attachment(attachment)

    logger.info(f"Attachment {attachment.attachment_id} pending confirmation for {standard_id} by {uploader}")

    return {
        "statusCode": 201,
        "headers": CORS_HEADERS,
        "body": json_dumps({
            "attachment_id": attachment.attachment_id,
            "upload_url": upload_url,
            "s3_key": s3_key,
        }),
    }

handler = _handler
