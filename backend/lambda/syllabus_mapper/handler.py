"""Lambda handler for syllabus mapping — Pass 1 (extraction only)."""

import asyncio
import json
import logging
import sys

sys.path.insert(0, "/var/task")

from shared.cio_clo_mapper import map_syllabus, map_syllabus_pass1
from shared.course_models import (
    Course,
    CourseAssessment as CourseAssessmentDB,
    CourseCompetency,
    CourseGoal,
    CourseLearningOutcome,
    CourseTopic as CourseTopicDB,
)
from shared.courses_client import CoursesDBClient
from shared.models import SyllabusOutput

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
        "body": json.dumps(body),
    }

def _to_course(
    result: SyllabusOutput,
    course_id: str,
    course_name: str,
    course_code: str,
) -> Course:
    return Course(
        course_id=course_id,
        course_name=course_name,
        course_code=course_code,
        syllabus=result.syllabus,
        clos=[
            CourseLearningOutcome(
                id=c.id,
                name=c.name,
                topic_ids=c.topic_ids,
                assessment_ids=c.assessment_ids,
            )
            for c in result.clos
        ],
        cts=[
            CourseTopicDB(
                id=t.id,
                name=t.name,
                ios=t.ios,
                assessment_ids=t.assessment_ids,
            )
            for t in result.cts
        ],
        assessments=[
            CourseAssessmentDB(id=a.id, name=a.name, info=a.info)
            for a in result.assessments
        ],
        goals=[
            CourseGoal(id=g.id, name=g.name, clo_ids=g.clo_ids)
            for g in result.goals
        ],
        competencies=[
            CourseCompetency(
                id=c.id,
                name=c.name,
                clo_ids=c.clo_ids,
                topic_ids=c.topic_ids,
            )
            for c in result.competencies
        ],
    )

def _handler(event, _context):
    """
    Two modes depending on caller:

    Step Functions (no 'body' key):
        Input:  { s3_key, course_id, course_name, course_code }
        Output: { course_id, course_name, course_code, inventory: {...} }
        Action: Run Pass 1 only — return extracted inventory for Pass 2 Lambda.

    API Gateway (has 'body' key):
        Input:  POST /syllabi/map body with s3_key, course_id, course_name, course_code
        Output: { course_id, message }
        Action: Run full two-pass pipeline and persist to CoursesTable.
    """
    if "body" in event:
        return _handle_api(event)
    return _handle_step_functions(event)

def _handle_step_functions(event: dict) -> dict:
    s3_key = event.get("s3_key", "").strip()
    course_id = event.get("course_id", "").strip()
    course_name = event.get("course_name", "").strip()
    course_code = event.get("course_code", "").strip()
    syllabus_filename = event.get("syllabus_filename", s3_key).strip()

    logger.info("Pass 1: extracting syllabus %s → course_id=%s", s3_key, course_id)

    inventory = asyncio.run(map_syllabus_pass1(s3_key=s3_key, syllabus_filename=syllabus_filename))

    return {
        "course_id": course_id,
        "course_name": course_name,
        "course_code": course_code,
        "syllabus_filename": syllabus_filename,
        "inventory": inventory.model_dump(),
    }

def _handle_api(event: dict) -> dict:
    try:
        raw_body = event.get("body") or "{}"
        body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON body"})

    s3_key = body.get("s3_key", "").strip()
    course_id = body.get("course_id", "").strip()
    course_name = body.get("course_name", "").strip()
    course_code = body.get("course_code", "").strip()

    missing = [f for f, v in [("s3_key", s3_key), ("course_id", course_id), ("course_name", course_name), ("course_code", course_code)] if not v]
    if missing:
        return _response(400, {"error": f"Missing required fields: {', '.join(missing)}"})

    syllabus_filename = body.get("syllabus_filename", s3_key).strip()
    logger.info("API: full two-pass mapping %s → course_id=%s", s3_key, course_id)

    try:
        result = asyncio.run(map_syllabus(s3_key=s3_key, syllabus_filename=syllabus_filename))
        course = _to_course(result, course_id, course_name, course_code)
        if not course.clos:
            return _response(422, {"error": "Syllabus mapping produced no CLOs — check that the document is a readable syllabus"})
        CoursesDBClient().put_course(course)
        logger.info("Persisted course %s to CoursesTable", course_id)
        return _response(200, {"course_id": course_id, "message": "Syllabus mapped and saved successfully"})
    except ValueError as e:
        logger.error("Validation error mapping syllabus %s: %s", s3_key, e)
        return _response(422, {"error": str(e)})
    except Exception as e:
        logger.error("Error mapping syllabus %s: %s", s3_key, e, exc_info=True)
        return _response(500, {"error": "Syllabus mapping failed"})

handler = _handler
