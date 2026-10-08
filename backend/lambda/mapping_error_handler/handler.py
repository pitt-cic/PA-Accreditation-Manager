"""Lambda handler: called by Step Function Catch when mapping pipeline fails.

Writes 'error' status back to StandardsTable so the UI reflects the failure
rather than leaving the standard stuck in 'analyzing' forever.
"""

import logging
import sys

sys.path.insert(0, "/var/task")

from shared.db_client import DynamoDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _handler(event, _context):
    """
    Write error status for a standard whose mapping pipeline failed.

    Input (from Step Function Catch):
        {
            "standard_id": "C1.03",         # passed via Parameters
            "error": "AttributeError",       # Step Function error name
            "cause": "..."                   # error detail string
        }
    """
    standard_id = event.get("standard_id", "unknown")
    error = event.get("error", "UnknownError")
    cause = event.get("cause", "")

    # Truncate cause to avoid DynamoDB 400KB item size limits
    error_message = f"{error}: {cause}"[:1000]

    logger.error(f"Mapping pipeline failed for {standard_id}: {error_message}")

    try:
        db = DynamoDBClient()
        db.update_status(standard_id, "error", error_message=error_message)
        logger.info(f"Marked {standard_id} as error in StandardsTable")
    except Exception as e:
        # Log but don't raise — we don't want the error handler itself to fail
        logger.error(f"Failed to write error status for {standard_id}: {e}")

    return {"standard_id": standard_id, "status": "error"}

handler = _handler
