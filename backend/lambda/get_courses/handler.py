"""Lambda handler for GET /courses - list all courses."""

import logging
import sys

sys.path.insert(0, "/var/task")

from shared import json_dumps
from shared.courses_client import CoursesDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _handler(event, _context):
    """List all courses from the CoursesTable. Filter by audit_year if provided."""
    logger.info("GET /courses request received")

    try:
        query_params = event.get("queryStringParameters") or {}
        audit_year = query_params.get("audit_year")

        courses_db = CoursesDBClient()

        if audit_year:
            logger.info(f"Querying frozen courses via GSI for audit_year={audit_year}")
            courses = courses_db.get_all_by_audit_year(audit_year)
            logger.info(f"Found {len(courses)} frozen courses")
        else:
            courses = courses_db.get_all_courses()

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization",
            },
            "body": json_dumps({"courses": [c.model_dump() for c in courses]}),
        }

    except Exception as e:
        logger.error(f"Error listing courses: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json_dumps({"error": "Internal server error"}),
        }

handler = _handler
