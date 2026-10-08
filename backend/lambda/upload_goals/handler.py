"""Lambda handler for POST /goals/upload - extract goals from a PDF and persist them."""

import asyncio
import json
import logging
import sys

sys.path.insert(0, "/var/task")

from shared import json_dumps
from shared.goals_client import GoalsDBClient, ProgramGoal
from shared.goals_extractor import extract_goals

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
}

def _response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": _CORS_HEADERS,
        "body": json_dumps(body),
    }

def _handler(event, _context):
    """
    POST /goals/upload

    Request body:
        { "s3_key": "uploads/<uuid>/goals.pdf" }

    Extracts program goals from the uploaded PDF using Claude Haiku and writes
    them to the GoalsTable. Existing records are overwritten (idempotent by id).
    """
    try:
        raw_body = event.get("body") or "{}"
        body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON body"})

    s3_key = body.get("s3_key", "").strip()
    if not s3_key:
        return _response(400, {"error": "Missing required field: s3_key"})

    logger.info(f"Extracting goals from: {s3_key}")

    try:
        result = asyncio.run(extract_goals(s3_key))
        db = GoalsDBClient()
        for item in result.goals:
            db.put_goal(ProgramGoal(id=item.id, name=item.name))

        count = len(result.goals)
        logger.info(f"Loaded {count} goals from {s3_key}")
        return _response(200, {"message": f"{count} goals loaded successfully"})

    except Exception as e:
        logger.error(f"Error extracting goals from {s3_key}: {e}", exc_info=True)
        return _response(500, {"error": "Goals extraction failed"})

handler = _handler
