"""Lambda handler for Workflow 4: map one course to one standard.

Invoked by Step Functions Map state. Receives a single course + standard pair.
Writes the full mapping result to MappingResultsTable and returns only a slim
pointer back through Step Functions state to stay within the 256KB limit.
"""

import asyncio
import json
import logging
import os
import sys
import time
from decimal import Decimal

sys.path.insert(0, "/var/task")

import boto3

from shared.course_mapper import map_course_to_standard
from shared.courses_client import CoursesDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _floats_to_decimal(obj):
    """Recursively convert float values to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _floats_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_floats_to_decimal(i) for i in obj]
    return obj

def _write_result(mapping_key: str, course_id: str, payload: dict) -> None:
    """Write the full mapping payload to MappingResultsTable with a 24h TTL."""
    table_name = os.environ["MAPPING_RESULTS_TABLE"]
    table = boto3.resource("dynamodb").Table(table_name)
    table.put_item(Item=_floats_to_decimal({
        "mapping_key": mapping_key,
        "course_id": course_id,
        "ttl": int(time.time()) + 86400,
        **payload,
    }))

def _handler(event, _context):
    """
    Map a single course to a single standard.

    Input (from Step Functions):
        {
            "standard": { "standard_id", "section_id", "requirement_text", ... },
            "course": { "course_id": "..." },
            "mapping_key": "<standard_id>-<timestamp>"  ← partition key for MappingResultsTable
        }

    Output (slim — full data written to DynamoDB):
        { "course_id": "...", "mapping_key": "...", "has_mapping": bool, "is_rejected": bool }
    """
    standard = event["standard"]
    course_ref = event["course"]
    course_id = course_ref["course_id"]
    mapping_key = event["mapping_key"]

    courses_db = CoursesDBClient()
    course = courses_db.get_course(course_id)
    if not course:
        raise ValueError(f"Course {course_id} not found in CoursesTable")

    standard_id = standard.get("standard_id", "unknown")
    logger.info(f"Workflow 4: mapping {course.course_code} -> {standard_id}")

    def log_callback(msg: str) -> None:
        logger.info(f"[{standard_id}:{course.course_code}] {msg}")

    try:
        mapping = asyncio.run(
            map_course_to_standard(
                standard=standard,
                course=course,
                log=log_callback,
            )
        )

        if mapping is None:
            logger.info(f"Workflow 4: no mapping for {course.course_code} -> {standard_id}")
            _write_result(mapping_key, course_id, {"has_mapping": False, "is_rejected": False})
            return {"course_id": course_id, "mapping_key": mapping_key, "has_mapping": False, "is_rejected": False}

        is_rejected = mapping.overall_relevance_score < 0.2
        result = mapping.model_dump()

        # Write full payload to DynamoDB — keeps Step Functions state small
        _write_result(mapping_key, course_id, {
            "mapping": result,
            "has_mapping": not is_rejected,
            "is_rejected": is_rejected,
        })

        if is_rejected:
            logger.info(
                f"Workflow 4: below-threshold {course.course_code} -> {standard_id} "
                f"(score={mapping.overall_relevance_score:.2f})"
            )
        else:
            logger.info(
                f"Workflow 4 complete: {course.course_code} -> {standard_id} "
                f"(score={mapping.overall_relevance_score:.2f})"
            )

        return {"course_id": course_id, "mapping_key": mapping_key, "has_mapping": not is_rejected, "is_rejected": is_rejected}

    except Exception as e:
        course_code = course.course_code if course else course_id
        logger.error(
            f"Error mapping {course_code} -> {standard_id}: {e}",
            exc_info=True,
        )
        raise

handler = _handler
