"""Lambda handler for assessment mapping."""

import asyncio
import json
import logging
import sys

sys.path.insert(0, "/var/task")

from shared.assessment_mapper import map_assessment
from shared.course_models import Course, CourseAssessment
from shared.courses_client import CoursesDBClient
from shared.doc_classifier import get_media_type
from shared.documents_client import DocumentsDBClient
from shared.s3_client import S3Client

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

def _next_assessment_id(assessments: list[CourseAssessment]) -> str:
    nums = [int(a.id[2:]) for a in assessments if a.id.startswith("AS") and a.id[2:].isdigit()]
    return f"AS{max(nums) + 1}" if nums else "AS1"

def _find_matching_assessment(assessments: list[CourseAssessment], name: str, filename: str) -> CourseAssessment | None:
    name_lower = name.lower()
    filename_stem = filename.rsplit(".", 1)[0].lower().replace("_", " ").replace("-", " ")
    for entry in assessments:
        entry_name = entry.name.lower()
        if entry_name in name_lower or name_lower in entry_name:
            return entry
        if entry_name in filename_stem or filename_stem in entry_name:
            return entry
    return None

def _merge_enrichment(course: Course, enrichment, filename: str) -> str:
    """Upsert one AssessmentEnrichment into the course. Returns the assessment id."""
    match = _find_matching_assessment(course.assessments, enrichment.name, filename)
    if match:
        match.name = enrichment.name
        if enrichment.info:
            match.info = enrichment.info
        assessment_id = match.id
        logger.info(f"Updated existing assessment {assessment_id}")
    else:
        assessment_id = _next_assessment_id(course.assessments)
        course.assessments.append(CourseAssessment(id=assessment_id, name=enrichment.name, info=enrichment.info))
        logger.info(f"Created new assessment {assessment_id}")

    for clo in course.clos:
        if clo.id in enrichment.clo_ids and assessment_id not in clo.assessment_ids:
            clo.assessment_ids.append(assessment_id)

    for topic in course.cts:
        if topic.id in enrichment.topic_ids and assessment_id not in topic.assessment_ids:
            topic.assessment_ids.append(assessment_id)

    return assessment_id

async def _map_all(docs: list[tuple[str, object]], course: Course) -> list[str]:
    """Fetch + map all assessment documents concurrently. Returns list of assessment ids."""
    s3 = S3Client()
    course_dict = course.model_dump()

    async def process(s3_key: str, doc) -> str:
        filename = s3_key.split("/")[-1]
        file_bytes = s3.get_file_bytes(s3_key)
        media_type = get_media_type(filename)
        enrichment = await map_assessment(filename, file_bytes, media_type, course_dict)
        return _merge_enrichment(course, enrichment, filename)

    results = await asyncio.gather(*[process(s3_key, doc) for s3_key, doc in docs], return_exceptions=True)
    assessment_ids = []
    for s3_key, result in zip([k for k, _ in docs], results):
        if isinstance(result, Exception):
            logger.warning("Failed to map assessment %s: %s", s3_key, result)
        else:
            assessment_ids.append(result)
    return assessment_ids

def _handler(event, _context):
    """
    POST /courses/{course_id}/assessments/map

    Discovers all assessment documents linked to the course in DocumentsTable,
    maps each one against the course CLOs/topics, and persists the enriched
    Course back to CoursesTable.
    """
    # Support both API Gateway (pathParameters) and direct Step Function invocation
    path_params = event.get("pathParameters") or {}
    course_id = path_params.get("course_id", "").strip() or event.get("course_id", "").strip()
    if not course_id:
        return _response(400, {"error": "Missing path parameter: course_id"})

    logger.info(f"Mapping assessments for course_id={course_id}")

    course = CoursesDBClient().get_course(course_id)
    if not course:
        return _response(404, {"error": f"No course record for {course_id} — syllabus has not been mapped yet"})

    docs = DocumentsDBClient().get_assessments_for_course(course_id)
    if not docs:
        return _response(400, {"error": f"No assessment documents found for course_id={course_id}"})

    logger.info(f"Found {len(docs)} assessment document(s) for {course_id}")

    try:
        assessment_ids = asyncio.run(_map_all(docs, course))
        CoursesDBClient().put_course(course)
        logger.info(f"Persisted {len(assessment_ids)} assessment(s) for {course_id}")
        return _response(200, {
            "course_id": course_id,
            "assessments_mapped": len(assessment_ids),
            "message": "Assessments mapped and saved successfully",
        })
    except Exception as e:
        logger.error(f"Error mapping assessments for {course_id}: {e}", exc_info=True)
        return _response(500, {"error": "Assessment mapping failed"})

handler = _handler
