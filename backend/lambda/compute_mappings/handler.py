"""Lambda handler for the ComputeMappings Step Functions state."""

import json
import logging
import sys

sys.path.insert(0, "/var/task")

from shared.competencies_client import (
    CompetenciesDBClient,
    CourseReferenceForCompetency,
    ProgramCompetency,
)
from shared.courses_client import CoursesDBClient
from shared.goals_client import (
    GoalsDBClient,
    CourseReferenceForGoal,
    ProgramGoal,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
}

def _handler(event, _context):
    try:
        courses = CoursesDBClient().get_all_courses()
        logger.info("Loaded %d courses", len(courses))

        # Build {goal_id: {course_id: [clo_id, ...]}} from course data
        goal_map: dict[str, dict[str, list[str]]] = {}
        comp_map: dict[str, dict[str, list[str]]] = {}

        for course in courses:
            for g in course.goals:
                if not g.clo_ids:
                    continue
                goal_map.setdefault(g.id, {})[course.course_id] = list(g.clo_ids)

            for c in course.competencies:
                if not c.clo_ids:
                    continue
                comp_map.setdefault(c.id, {})[course.course_id] = list(c.clo_ids)

        goals_db = GoalsDBClient()
        goals = goals_db.get_all_goals()
        for goal in goals:
            refs = [
                CourseReferenceForGoal(course_id=cid, clo_ids=clo_ids)
                for cid, clo_ids in goal_map.get(goal.id, {}).items()
            ]
            goals_db.put_goal(ProgramGoal(
                id=goal.id,
                name=goal.name,
                course_references=refs,
            ))
        logger.info("Updated %d goals", len(goals))

        comps_db = CompetenciesDBClient()
        comps = comps_db.get_all_competencies()
        for comp in comps:
            refs = [
                CourseReferenceForCompetency(course_id=cid, clo_ids=clo_ids)
                for cid, clo_ids in comp_map.get(comp.id, {}).items()
            ]
            comps_db.put_competency(ProgramCompetency(
                id=comp.id,
                name=comp.name,
                course_references=refs,
            ))
        logger.info("Updated %d competencies", len(comps))

        return {"message": f"{len(goals)} goals and {len(comps)} competencies updated"}

    except Exception as e:
        logger.error("Error computing mappings: %s", e, exc_info=True)
        return {
            "statusCode": 500,
            "headers": _CORS_HEADERS,
            "body": json.dumps({"error": "Internal server error"}),
        }

handler = _handler
