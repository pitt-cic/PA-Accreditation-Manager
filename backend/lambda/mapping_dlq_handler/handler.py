"""Lambda handler: drains StandardMappingDLQ and writes 'error' status.

Triggered by SQS event source mapping on the DLQ. Each record is a mapping
request that exhausted all SQS retries (maxReceiveCount = 3). We mark the
standard as error so the UI stops showing a spinner.
"""

import json
import logging
import sys

sys.path.insert(0, "/var/task")

from shared.db_client import DynamoDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _handler(event, _context):
    """
    Input: SQS event with one or more DLQ records.

    Each record body is the original mapping message:
        {"standard_id": "C1.03", "triggered_by": "user@example.com"}
    """
    db = DynamoDBClient()
    processed = []
    failed = []

    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            standard_id = body.get("standard_id")
            if not standard_id:
                logger.warning(f"DLQ record missing standard_id: {record['body']}")
                continue

            db.update_status(
                standard_id,
                "error",
                error_message="Mapping failed after retries. Please try rerunning.",
            )
            logger.info(f"Marked {standard_id} as error via DLQ handler")
            processed.append(standard_id)

        except Exception as e:
            logger.error(f"Failed to process DLQ record: {e}")
            failed.append(record.get("messageId", "unknown"))

    logger.info(f"DLQ handler complete: {len(processed)} marked error, {len(failed)} failed")
    return {"processed": processed, "failed": failed}

handler = _handler
