"""Lambda handler for POST /sections/{id}/map.

Fans out one StandardMappingQueue message per standard in the section,
kicking off the WF4/5 Step Function pipeline for each.
"""

import json
import logging
import os
import re
import sys

sys.path.insert(0, "/var/task")

import boto3

from shared.db_client import DynamoDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

def _handler(event, _context):
    """
    Queue all standards in a section for WF4/5 mapping.

    Path: POST /sections/{id}/map
    {id} is a section ID such as "B2", "A1", etc.

    Returns 202 with count of queued standards.
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    section_id = (event.get("pathParameters") or {}).get("id", "").strip().upper()
    if not section_id or not re.match(r"^[A-E]\d+$", section_id):
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Valid section ID required (e.g. B2, A1)"}),
        }

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        body = {}

    triggered_by = body.get("triggered_by", "unknown")

    # Get authorizer email if available
    request_context = event.get("requestContext", {})
    claims = (request_context.get("authorizer") or {}).get("claims") or {}
    triggered_by = claims.get("email", triggered_by)

    db = DynamoDBClient()
    all_standards = db.get_all_standards()
    section_standards = [s for s in all_standards if s.get("section_id") == section_id]

    if not section_standards:
        return {
            "statusCode": 404,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"No standards found for section '{section_id}'"}),
        }

    queue_url = os.environ["STANDARD_MAPPING_QUEUE_URL"]
    sqs = boto3.client("sqs")

    queued = []
    skipped = []
    for std in section_standards:
        standard_id = std.get("standard_id")
        if std.get("status") == "analyzing":
            logger.warning(f"Skipping {standard_id} — already in 'analyzing' state")
            skipped.append(standard_id)
            continue
        sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps({"standard_id": standard_id, "triggered_by": triggered_by}),
        )
        queued.append(standard_id)
        logger.info(f"Queued mapping for {standard_id}")

    logger.info(f"Queued {len(queued)} standards in section {section_id} (by {triggered_by}), skipped {len(skipped)} already analyzing")

    return {
        "statusCode": 202,
        "headers": CORS_HEADERS,
        "body": json.dumps({
            "section_id": section_id,
            "queued": len(queued),
            "skipped_analyzing": len(skipped),
            "standard_ids": sorted(queued),
            "message": f"Queued {len(queued)} standard(s) for mapping",
        }),
    }

handler = _handler
