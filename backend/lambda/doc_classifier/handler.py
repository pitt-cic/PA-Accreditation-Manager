"""Lambda handler for manual document classification."""

import asyncio
import json
import logging
import sys

sys.path.insert(0, "/var/task")

from botocore.exceptions import ClientError

from shared.doc_classifier import classify_document, get_media_type
from shared.documents_client import DocumentsDBClient
from shared.s3_client import S3Client

logger = logging.getLogger(__name__)

# Configure Logfire at module level
def _handler(event, _context):
    if "body" in event:
        try:
            body = json.loads(event["body"]) if isinstance(event["body"], str) else event["body"]
        except (json.JSONDecodeError, TypeError):
            body = {}
    else:
        body = event

    s3_key = body.get("s3_key")
    if not s3_key:
        return {"statusCode": 400, "body": json.dumps({"error": "s3_key is required"})}

    filename = s3_key.split("/")[-1]
    media_type = get_media_type(filename)

    s3_client = S3Client()
    try:
        file_bytes = s3_client.get_file_bytes(s3_key)
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code in ("NoSuchKey", "404"):
            return {"statusCode": 404, "body": json.dumps({"error": f"File not found: {s3_key}"})}
        logger.exception("S3 error fetching %s", s3_key)
        return {"statusCode": 502, "body": json.dumps({"error": "Failed to retrieve file from storage"})}

    classification = asyncio.run(classify_document(filename, file_bytes, media_type))

    DocumentsDBClient().put_document(s3_key, classification)

    return {"statusCode": 200, "body": classification.model_dump_json()}

handler = _handler
