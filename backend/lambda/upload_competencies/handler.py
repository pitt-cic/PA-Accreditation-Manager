"""Lambda handler for POST /competencies/upload - extract competencies from a PDF and persist them."""

import asyncio
import json
import logging
import sys

sys.path.insert(0, "/var/task")

from shared import json_dumps
from shared.competencies_client import CompetenciesDBClient, ProgramCompetency
from shared.competencies_extractor import extract_competencies

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
    POST /competencies/upload

    Request body:
        { "s3_key": "uploads/<uuid>/competencies.pdf" }

    Extracts program competencies from the uploaded PDF using Claude Haiku and
    writes them to the CompetenciesTable. Existing records are overwritten (idempotent by id).
    """
    try:
        raw_body = event.get("body") or "{}"
        body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON body"})

    s3_key = body.get("s3_key", "").strip()
    if not s3_key:
        return _response(400, {"error": "Missing required field: s3_key"})

    logger.info(f"Extracting competencies from: {s3_key}")

    try:
        result = asyncio.run(extract_competencies(s3_key))
        db = CompetenciesDBClient()
        for item in result.competencies:
            db.put_competency(ProgramCompetency(id=item.id, name=item.name))

        count = len(result.competencies)
        logger.info(f"Loaded {count} competencies from {s3_key}")
        return _response(200, {"message": f"{count} competencies loaded successfully"})

    except Exception as e:
        logger.error(f"Error extracting competencies from {s3_key}: {e}", exc_info=True)
        return _response(500, {"error": "Competencies extraction failed"})

handler = _handler
