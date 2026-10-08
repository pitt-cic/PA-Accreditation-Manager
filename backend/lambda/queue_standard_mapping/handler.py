"""Lambda handler for POST /standards/{id}/map: queues a standard for mapping.

Validates the standard exists, then puts a message on the StandardMappingQueue.
The SQS consumer (trigger_map_standard) handles the actual Step Function kickoff.
"""

import json
import logging
import os
import sys

sys.path.insert(0, "/var/task")

import boto3
from botocore.exceptions import ClientError

from shared.db_client import DynamoDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

def _handler(event, _context):
    """
    Queue a standard for mapping processing.

    Path: POST /standards/{id}/map
    Body (optional):
        { "triggered_by": "user@example.com" }

    Returns 202 with queue confirmation.
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    standard_id = event.get("pathParameters", {}).get("id")
    if not standard_id:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "standard_id path parameter is required"}),
        }

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        body = {}

    triggered_by = body.get("triggered_by", "unknown")

    # Validate standard exists and is not already being processed
    db = DynamoDBClient()
    standard_item = db.get_standard(standard_id)
    if not standard_item:
        return {
            "statusCode": 404,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": f"Standard {standard_id} not found"}),
        }

    if standard_item.get("status") == "analyzing":
        execution_arn = standard_item.get("execution_arn")
        still_running = False
        if execution_arn:
            try:
                sfn_client = boto3.client("stepfunctions")
                exec_status = sfn_client.describe_execution(executionArn=execution_arn)["status"]
                still_running = exec_status == "RUNNING"
                if not still_running:
                    db.update_status(
                        standard_id,
                        "error",
                        error_message=f"Execution {exec_status.lower()} without updating status — auto-reset",
                    )
            except ClientError as e:
                code = e.response["Error"]["Code"]
                if code == "ExecutionDoesNotExist":
                    logger.warning("Execution %s no longer exists — allowing re-queue", execution_arn)
                    db.update_status(standard_id, "error", error_message="Execution not found — auto-reset")
                else:
                    logger.error("describe_execution failed for %s (%s): %s", execution_arn, code, e)
                    return {
                        "statusCode": 502,
                        "headers": CORS_HEADERS,
                        "body": json.dumps({"error": "Could not verify existing execution status"}),
                    }
        else:
            db.update_status(standard_id, "error", error_message="Status reset: no execution ARN recorded")

        if still_running:
            return {
                "statusCode": 409,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Standard {standard_id} is already being processed"}),
            }

    # Send to SQS
    queue_url = os.environ["STANDARD_MAPPING_QUEUE_URL"]
    sqs_client = boto3.client("sqs")

    message = {
        "standard_id": standard_id,
        "triggered_by": triggered_by,
    }

    sqs_client.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(message),
    )

    logger.info(f"Queued mapping for {standard_id} (triggered by {triggered_by})")

    return {
        "statusCode": 202,
        "headers": CORS_HEADERS,
        "body": json.dumps({
            "standard_id": standard_id,
            "status": "queued",
            "message": "Standard mapping has been queued for processing",
        }),
    }

handler = _handler
