"""Lambda handler for GET /goals - list all program goals."""

import logging
import re
import sys

sys.path.insert(0, "/var/task")

from shared import json_dumps
from shared.courses_client import CoursesDBClient
from shared.goals_client import (
    GoalsDBClient,
    MappedCloForGoal,
    MappedCourseForGoal,
    MappedTopicForGoal,
    ProgramGoalHydrated,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _natural_sort_key(goal_id: str) -> tuple:
    """Extract numeric suffix for natural sorting (handles G1, Goal-1, CO1, etc)."""
    match = re.search(r'(\d+)$', goal_id)
    return (int(match.group(1)), '') if match else (float('inf'), goal_id)

def _hydrate_goal(goal, courses_lookup):
    """Hydrate a ProgramGoal with full nested course data from CoursesTable."""
    mapped_courses = []
    for ref in goal.course_references:
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
                    mapped_topics.append(MappedTopicForGoal(
                        id=topic.id,
                        name=topic.name,
                        ios=topic.ios,
                    ))

            mapped_clos.append(MappedCloForGoal(
                id=clo_obj.id,
                name=clo_obj.name,
                topics=mapped_topics,
            ))

        mapped_courses.append(MappedCourseForGoal(
            course_id=course.course_id,
            course_code=course.course_code,
            clos=mapped_clos,
        ))

    return ProgramGoalHydrated(
        id=goal.id,
        name=goal.name,
        mapped_courses=mapped_courses,
    )

def _handler(event, _context):
    """List all program goals from the GoalsTable. Filter by audit_year if provided."""
    logger.info("GET /goals request received")

    try:
        query_params = event.get("queryStringParameters") or {}
        audit_year = query_params.get("audit_year")

        goals_db = GoalsDBClient()
        courses_db = CoursesDBClient()

        if audit_year:
            logger.info(f"Querying frozen goals via GSI for audit_year={audit_year}")
            goals = goals_db.get_all_by_audit_year(audit_year)
            goals.sort(key=lambda g: _natural_sort_key(g.id))

            frozen_courses = courses_db.get_all_by_audit_year(audit_year)
            courses_lookup = {c.course_id: c for c in frozen_courses}
            logger.info(f"Fetched {len(frozen_courses)} frozen courses for hydration")
        else:
            goals = goals_db.get_all_goals()
            goals.sort(key=lambda g: _natural_sort_key(g.id))

            course_ids = set()
            for goal in goals:
                for ref in goal.course_references:
                    course_ids.add(ref.course_id)

            courses_lookup = {}
            for course_id in course_ids:
                course = courses_db.get_course(course_id)
                if course:
                    courses_lookup[course_id] = course
            logger.info(f"Fetched {len(courses_lookup)} courses for hydration")

        hydrated_goals = [_hydrate_goal(g, courses_lookup) for g in goals]

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization",
            },
            "body": json_dumps({"goals": [g.model_dump() for g in hydrated_goals]}),
        }

    except Exception as e:
        logger.error(f"Error listing goals: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json_dumps({"error": "Internal server error"}),
        }

handler = _handler
