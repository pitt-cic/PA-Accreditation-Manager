"""Lambda handler: SQS-triggered kickoff for the standard mapping Step Function.

Receives a message from the StandardMappingQueue containing a standard_id,
fetches the standard and courses, then starts the Step Function execution.
"""

import json
import logging
import os
import sys
import time

sys.path.insert(0, "/var/task")

import boto3

from shared.courses_client import CoursesDBClient
from shared.db_client import DynamoDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _process_record(record: dict) -> None:
    """Start a mapping Step Function execution for one SQS record."""
    body = json.loads(record["body"])
    standard_id = body["standard_id"]
    triggered_by = body.get("triggered_by", "unknown")

    logger.info(f"Processing mapping request for {standard_id} (triggered by {triggered_by})")

    db = DynamoDBClient()
    standard_item = db.get_standard(standard_id)
    if not standard_item:
        raise ValueError(f"Standard {standard_id} not found in DynamoDB")

    courses_db = CoursesDBClient()
    courses = courses_db.get_all_courses()

    if not courses:
        raise ValueError("No courses found in CoursesTable — has WF2/3 been run?")

    db.update_status(standard_id, "analyzing")

    logger.info(f"Found {len(courses)} courses to map against {standard_id}")

    # Build Step Function input — pass only course_ids to stay within the
    # 256KB Step Functions state size limit. CourseStandardMapper fetches
    # the full course object from DynamoDB using the course_id.
    # mapping_key is a stable per-execution identifier used by the mapper to
    # write results to MappingResultsTable (avoiding large state on the way back).
    mapping_key = f"{standard_id}-{int(time.time())}".replace(".", "-")
    execution_input = {
        "standard": {
            "standard_id": standard_item["standard_id"],
            "section_id": standard_item.get("section_id", ""),
            "requirement_text": standard_item.get("requirement_text", ""),
            "sub_requirement_text": standard_item.get("sub_requirement_text"),
            "compliance_guidance": standard_item.get("compliance_guidance"),
        },
        "courses": [{"course_id": c.course_id} for c in courses],
        "mapping_key": mapping_key,
    }

    state_machine_arn = os.environ["STATE_MACHINE_ARN"]
    sfn_client = boto3.client("stepfunctions")
    execution_name = f"map-{standard_id}-{int(time.time())}".replace(".", "-")

    response = sfn_client.start_execution(
        stateMachineArn=state_machine_arn,
        name=execution_name,
        input=json.dumps(execution_input, default=str),
    )

    execution_arn = response["executionArn"]
    db.update_execution_arn(standard_id, execution_arn)

    logger.info(
        f"Started Step Function for {standard_id}: {execution_arn} "
        f"({len(courses)} courses)"
    )

def _handler(event, _context):
    """
    Process SQS messages to start mapping workflow executions.

    SQS message body:
        {
            "standard_id": "B2.07a",
            "triggered_by": "user@example.com"
        }

    Uses partial batch failure reporting so a bad record doesn't cause
    successful records to be retried.
    """
    failures = []
    for record in event.get("Records", []):
        try:
            _process_record(record)
        except Exception as e:
            logger.error(
                "Failed to process SQS record %s: %s",
                record.get("messageId"),
                e,
                exc_info=True,
            )
            # Roll back "analyzing" status if it was set before the failure
            try:
                body = json.loads(record["body"])
                standard_id = body.get("standard_id")
                if standard_id:
                    DynamoDBClient().update_status(standard_id, "error", error_message=str(e))
            except Exception:
                pass
            failures.append({"itemIdentifier": record["messageId"]})

    if failures:
        return {"batchItemFailures": failures}

handler = _handler
