"""Lambda handler for generating presigned S3 upload URLs."""

import json
import logging
import os
import uuid

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
}

BUCKET = os.environ.get("S3_DOCUMENTS_BUCKET", "")
EXPIRY = 300  # seconds

def _handler(event, _context):
    """
    GET /upload-url?filename=<name>&content_type=<mime>

    Returns a presigned S3 PUT URL and the S3 key the file will be stored at.
    The client should PUT the file bytes directly to upload_url (no auth header).
    """
    params = event.get("queryStringParameters") or {}
    filename = params.get("filename", "").strip()
    content_type = params.get("content_type", "application/octet-stream").strip()

    if not filename:
        return {
            "statusCode": 400,
            "headers": _CORS_HEADERS,
            "body": json.dumps({"error": "filename query parameter is required"}),
        }

    s3_key = f"uploads/{uuid.uuid4()}/{os.path.basename(filename)}"

    s3_client = boto3.client("s3")
    upload_url = s3_client.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": s3_key, "ContentType": content_type},
        ExpiresIn=EXPIRY,
    )

    logger.info("Generated presigned URL for %s → %s", filename, s3_key)

    return {
        "statusCode": 200,
        "headers": _CORS_HEADERS,
        "body": json.dumps({"upload_url": upload_url, "s3_key": s3_key}),
    }

handler = _handler
