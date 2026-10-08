"""Lambda handler for syllabus mapping — Pass 2 (map + reason, persist)."""

import asyncio
import logging
import sys

sys.path.insert(0, "/var/task")

from shared.cio_clo_mapper import _ExtractedInventory, map_syllabus_pass2
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
    Step Functions invocation only.

    Input (from Pass 1 output):
        {
            course_id, course_name, course_code, syllabus_filename,
            inventory: { syllabus, clos, cts, assessments }
        }

    Action: Run Pass 2, persist course to CoursesTable.
    Output: { course_id, message }
    """
    course_id = event.get("course_id", "").strip()
    course_name = event.get("course_name", "").strip()
    course_code = event.get("course_code", "").strip()
    inventory_data = event.get("inventory")

    if not all([course_id, course_name, course_code, inventory_data]):
        raise ValueError(f"Missing required fields in Pass 2 input: {event.keys()}")

    inventory = _ExtractedInventory(**inventory_data)
    logger.info("Pass 2: mapping %s → course_id=%s clos=%d topics=%d",
                inventory.syllabus, course_id, len(inventory.clos), len(inventory.cts))

    result = asyncio.run(map_syllabus_pass2(inventory=inventory))
    course = _to_course(result, course_id, course_name, course_code)
    CoursesDBClient().put_course(course)
    logger.info("Persisted course %s to CoursesTable", course_id)

    return {"course_id": course_id, "message": "Syllabus mapped and saved successfully"}

handler = _handler
