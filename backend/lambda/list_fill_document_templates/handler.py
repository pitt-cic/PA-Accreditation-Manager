import json
import logging
import os
import re

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
}

# Matches the standard prefix e.g. "B2.02" from "B2.02a-e" or "B2.03"
_PREFIX_RE = re.compile(r"^([A-Z]\d+\.\d+)")

def _handler(event, context):
    bucket = os.environ["S3_DOCUMENTS_BUCKET"]

    paginator = s3.get_paginator("list_objects_v2")
    templates = []

    for page in paginator.paginate(Bucket=bucket, Prefix="templates/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            filename = key.split("/")[-1]
            if not filename.endswith(".xlsx"):
                continue

            stem = filename[: -len(".xlsx")]
            match = _PREFIX_RE.match(stem)
            if not match:
                logger.warning("Skipping template with unparseable name: %s", key)
                continue

            standard_prefix = match.group(1)
            templates.append({
                "name": stem,
                "key": key,
                "standard_prefix": standard_prefix,
            })

    templates.sort(key=lambda t: t["name"])
    logger.info("Found %d templates", len(templates))

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps({"templates": templates}),
    }

handler = _handler
