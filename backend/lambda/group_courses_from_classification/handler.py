"""Lambda handler for grouping classified documents by course."""

import logging
import sys

sys.path.insert(0, "/var/task")

from shared.documents_client import DocumentsDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _handler(event, _context):
    """
    Step Function task: groups classified documents by course.

    Input:  { "s3_keys": ["uploads/.../syllabus.pdf", ...] }
    Output: list of course dicts:
        [
          {
            "course_id": "PAS-2403",
            "course_name": "Interpreting and Evaluating the Medical Literature",
            "course_code": "PAS-2403",
            "syllabus_key": "uploads/.../syllabus.pdf",
            "s3_keys": ["uploads/.../syllabus.pdf", ...]
          },
          ...
        ]

    Files classified as "other" or with an empty course are skipped.
    If no syllabus is found for a course group, that course is still returned
    (syllabus_key will be null) — syllabus_mapper will fail gracefully.
    """
    s3_keys = event.get("s3_keys", [])
    logger.info("Grouping %d keys by course", len(s3_keys))

    db = DocumentsDBClient()
    groups: dict[str, dict] = {}

    for s3_key in s3_keys:
        doc = db.get_document(s3_key)
        if doc is None:
            logger.warning("No classification found for %s — skipping", s3_key)
            continue

        if doc.file_type == "other" or not doc.course:
            logger.info("Skipping %s (type=%s, course=%r)", s3_key, doc.file_type, doc.course)
            continue

        course_id = doc.course
        if course_id not in groups:
            groups[course_id] = {
                "course_id": course_id,
                "course_name": doc.course_name or course_id,
                "course_code": course_id,
                "syllabus_key": None,
                "s3_keys": [],
            }

        groups[course_id]["s3_keys"].append(s3_key)
        if doc.file_type == "syllabus":
            groups[course_id]["syllabus_key"] = s3_key

    result = list(groups.values())
    logger.info("Discovered %d course group(s): %s", len(result), [g["course_id"] for g in result])
    return result

handler = _handler
