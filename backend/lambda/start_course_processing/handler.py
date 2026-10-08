"""Lambda handler for starting the course processing Step Function."""

import json
import logging
import os
import uuid

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
}

STATE_MACHINE_ARN = os.environ.get("COURSE_PROCESSING_STATE_MACHINE_ARN", "")

def _handler(event, _context):
    """
    POST /courses/process

    Body: { "s3_keys": ["uploads/uuid/file.pdf", ...] }

    Starts the CourseProcessingStateMachine and returns the execution ARN.
    """
    try:
        body = json.loads(event.get("body") or "{}") if isinstance(event.get("body"), str) else (event.get("body") or {})
    except json.JSONDecodeError:
        return {"statusCode": 400, "headers": _CORS_HEADERS, "body": json.dumps({"error": "Invalid JSON body"})}

    s3_keys = body.get("s3_keys", [])
    if not isinstance(s3_keys, list) or not s3_keys:
        return {"statusCode": 400, "headers": _CORS_HEADERS, "body": json.dumps({"error": "s3_keys is required and must be a non-empty list"})}

    execution_name = f"course-processing-{uuid.uuid4()}"
    sfn_client = boto3.client("stepfunctions")

    try:
        response = sfn_client.start_execution(
            stateMachineArn=STATE_MACHINE_ARN,
            name=execution_name,
            input=json.dumps({"s3_keys": s3_keys}),
        )
    except Exception as e:
        logger.error("Failed to start Step Function: %s", e, exc_info=True)
        return {"statusCode": 500, "headers": _CORS_HEADERS, "body": json.dumps({"error": "Failed to start processing"})}

    logger.info("Started execution %s for %d keys", execution_name, len(s3_keys))

    return {
        "statusCode": 200,
        "headers": _CORS_HEADERS,
        "body": json.dumps({"execution_arn": response["executionArn"], "status": "started"}),
    }

handler = _handler
