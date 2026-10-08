"""Lambda handler for GET /competencies - list all program competencies."""

import logging
import re
import sys

sys.path.insert(0, "/var/task")

from shared import json_dumps
from shared.competencies_client import (
    CompetenciesDBClient,
    MappedCloForCompetency,
    MappedCourseForCompetency,
    MappedTopicForCompetency,
    ProgramCompetencyHydrated,
)
from shared.courses_client import CoursesDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _natural_sort_key(comp_id: str) -> tuple:
    """Extract numeric suffix for natural sorting (handles C1, Comp-1, CO1, etc)."""
    match = re.search(r'(\d+)$', comp_id)
    return (int(match.group(1)), '') if match else (float('inf'), comp_id)

def _hydrate_competency(competency, courses_lookup):
    """Hydrate a ProgramCompetency with full nested course data from CoursesTable."""
    mapped_courses = []
    for ref in competency.course_references:
        course = courses_lookup.get(ref.course_id)
        if not course:
            continue

        clo_lookup = {clo.id: clo for clo in course.clos}
        topic_lookup = {t.id: t for t in course.cts}

        mapped_clos = []
        for clo_id in ref.clo_ids:
            clo_obj = clo_lookup.get(clo_id)
            if not clo_obj:
                continue

            mapped_topics = []
            for topic_id in clo_obj.topic_ids:
                topic = topic_lookup.get(topic_id)
                if topic:
                    mapped_topics.append(MappedTopicForCompetency(
                        id=topic.id,
                        name=topic.name,
                        ios=topic.ios,
                    ))

            mapped_clos.append(MappedCloForCompetency(
                id=clo_obj.id,
                name=clo_obj.name,
                topics=mapped_topics,
            ))

        mapped_courses.append(MappedCourseForCompetency(
            course_id=course.course_id,
            course_code=course.course_code,
            clos=mapped_clos,
        ))

    return ProgramCompetencyHydrated(
        id=competency.id,
        name=competency.name,
        mapped_courses=mapped_courses,
    )

def _handler(event, _context):
    """List all program competencies from the CompetenciesTable. Filter by audit_year if provided."""
    logger.info("GET /competencies request received")

    try:
        query_params = event.get("queryStringParameters") or {}
        audit_year = query_params.get("audit_year")

        competencies_db = CompetenciesDBClient()
        courses_db = CoursesDBClient()

        if audit_year:
            logger.info(f"Querying frozen competencies via GSI for audit_year={audit_year}")
            competencies = competencies_db.get_all_by_audit_year(audit_year)
            competencies.sort(key=lambda c: _natural_sort_key(c.id))

            frozen_courses = courses_db.get_all_by_audit_year(audit_year)
            courses_lookup = {c.course_id: c for c in frozen_courses}
            logger.info(f"Fetched {len(frozen_courses)} frozen courses for hydration")
        else:
            competencies = competencies_db.get_all_competencies()
            competencies.sort(key=lambda c: _natural_sort_key(c.id))

            course_ids = set()
            for competency in competencies:
                for ref in competency.course_references:
                    course_ids.add(ref.course_id)

            courses_lookup = {}
            for course_id in course_ids:
                course = courses_db.get_course(course_id)
                if course:
                    courses_lookup[course_id] = course
            logger.info(f"Fetched {len(courses_lookup)} courses for hydration")

        hydrated_competencies = [_hydrate_competency(c, courses_lookup) for c in competencies]

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization",
            },
            "body": json_dumps({"competencies": [c.model_dump() for c in hydrated_competencies]}),
        }

    except Exception as e:
        logger.error(f"Error listing competencies: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json_dumps({"error": "Internal server error"}),
        }

handler = _handler
