"""Lambda handler for GET /files - list S3 files for evidence attachment."""

import json
import logging
import sys

# Add shared module to path
sys.path.insert(0, "/var/task")

from shared.s3_client import S3Client

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _handler(event, _context):
    """
    List files in the S3 bucket.

    Query parameters:
        prefix: Optional prefix to filter files

    Returns:
        {"bucket": "...", "files": [{"name": "...", "key": "...", "size": N, "last_modified": "..."}]}
    """
    logger.info("GET /files request received")

    try:
        # Get optional prefix from query parameters
        query_params = event.get("queryStringParameters", {}) or {}
        prefix = query_params.get("prefix", "")

        s3 = S3Client()

        # Get files
        files = s3.list_files(prefix)

        logger.info(f"Found {len(files)} files in bucket")

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization",
            },
            "body": json.dumps(
                {
                    "bucket": s3._bucket,
                    "files": files,
                    "count": len(files),
                }
            ),
        }

    except Exception as e:
        logger.error(f"Error listing files: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({"error": "Internal server error"}),
        }

handler = _handler
