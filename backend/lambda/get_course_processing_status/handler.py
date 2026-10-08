"""Lambda handler for polling course processing Step Function status."""

import json
import logging

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
}

# Map Step Function state names to friendly current_step strings
_STEP_LABELS = {
    "ClassifyAllFiles": "classifying",
    "GroupCourses": "classifying",
    "ValidateProgramData": "classifying",
    "ProcessEachCourse": "processing_courses",
    "MapSyllabus": "processing_courses",
    "MapAssessments": "processing_courses",
}

def _handler(event, _context):
    """
    GET /courses/process-status?execution_arn=<arn>

    Returns:
    {
      "status": "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "ABORTED",
      "current_step": "classifying" | "processing_courses" | "done" | "failed",
      "courses": [{ "course_id": str, "step": str, "status": str }]
    }
    """
    params = event.get("queryStringParameters") or {}
    execution_arn = params.get("execution_arn", "").strip()

    if not execution_arn:
        return {"statusCode": 400, "headers": _CORS_HEADERS, "body": json.dumps({"error": "execution_arn query parameter is required"})}

    sfn = boto3.client("stepfunctions")

    try:
        desc = sfn.describe_execution(executionArn=execution_arn)
    except ClientError as e:
        if e.response["Error"]["Code"] == "ExecutionDoesNotExist":
            return {"statusCode": 404, "headers": _CORS_HEADERS, "body": json.dumps({"error": "Execution not found"})}
        logger.error("describe_execution failed: %s", e)
        return {"statusCode": 502, "headers": _CORS_HEADERS, "body": json.dumps({"error": "Internal server error"})}
    except Exception as e:
        logger.error("describe_execution failed: %s", e)
        return {"statusCode": 502, "headers": _CORS_HEADERS, "body": json.dumps({"error": "Internal server error"})}

    sfn_status = desc["status"]  # RUNNING, SUCCEEDED, FAILED, TIMED_OUT, ABORTED

    # Determine friendly current_step and per-course details from execution history
    current_step = "classifying"
    courses = []
    error_detail = None

    if sfn_status == "SUCCEEDED":
        current_step = "done"
        try:
            # Final output is the ProcessEachCourse Map result: list of MapAssessments Payloads
            # Each item: { "statusCode": int, "headers": {...}, "body": "{\"course_id\": ...}" }
            items = json.loads(desc.get("output", "[]"))
            for item in items if isinstance(items, list) else []:
                try:
                    body = json.loads(item.get("body", "{}"))
                    course_id = body.get("course_id", "")
                    status = "succeeded" if item.get("statusCode") == 200 else "failed"
                    if course_id:
                        courses.append({"course_id": course_id, "step": "done", "status": status})
                except Exception:
                    pass
        except Exception:
            pass
    elif sfn_status in ("FAILED", "TIMED_OUT", "ABORTED"):
        current_step = "failed"
        cause_str = desc.get("cause", "")
        error_detail = cause_str
        try:
            cause_obj = json.loads(cause_str)
            error_detail = cause_obj.get("errorMessage", cause_str)
        except (json.JSONDecodeError, TypeError):
            pass
        if not error_detail:
            error_detail = desc.get("error", "Unknown error")
    else:
        # Running — inspect history to find current state
        try:
            kwargs: dict = {"executionArn": execution_arn, "maxResults": 100, "reverseOrder": True}
            found = False
            while not found:
                history = sfn.get_execution_history(**kwargs)
                for event_item in history.get("events", []):
                    event_type = event_item.get("type", "")
                    if "StateEntered" in event_type:
                        state_name = event_item.get("stateEnteredEventDetails", {}).get("name", "")
                        for prefix, step in _STEP_LABELS.items():
                            if state_name.startswith(prefix):
                                current_step = step
                                break
                        found = True
                        break
                next_token = history.get("nextToken")
                if not next_token:
                    break
                kwargs["nextToken"] = next_token
        except Exception as e:
            logger.warning("Could not fetch execution history: %s", e)

    body: dict = {
        "status": sfn_status,
        "current_step": current_step,
        "courses": courses,
    }
    if sfn_status in ("FAILED", "TIMED_OUT", "ABORTED"):
        body["error_detail"] = error_detail

    return {
        "statusCode": 200,
        "headers": _CORS_HEADERS,
        "body": json.dumps(body),
    }

handler = _handler
