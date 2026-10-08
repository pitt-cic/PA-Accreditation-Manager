"""Lambda handler for listing all active course-processing Step Function executions with per-step progress."""

import json
import logging
import os
import re

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
}

STATE_MACHINE_ARN = os.environ.get("COURSE_PROCESSING_STATE_MACHINE_ARN", "")

# Friendly labels for each top-level state (prefix match, suffix stripped at runtime)
_STEP_DISPLAY_LABELS = {
    "ClassifyAllFiles": "Classify Files",
    "GroupCourses": "Group Courses",
    "ValidateProgramData": "Validate Program Data",
    "ProcessEachCourse": "Process Each Course",
}

# Cached parsed step order so we only call DescribeStateMachine once per cold start
_STEP_ORDER_CACHE: list[str] | None = None


def _strip_suffix(state_name: str) -> str:
    """Remove the stack-name env suffix from a state name (e.g. 'ClassifyAllFiles-ArcpaEvidenceFinderStack-test-dev' → 'ClassifyAllFiles')."""
    return re.split(r"-[A-Z]", state_name)[0]


def _get_step_order(sfn) -> list[str]:
    """Return ordered list of top-level state base-names by walking StartAt → Next links."""
    global _STEP_ORDER_CACHE
    if _STEP_ORDER_CACHE is not None:
        return _STEP_ORDER_CACHE

    try:
        desc = sfn.describe_state_machine(stateMachineArn=STATE_MACHINE_ARN)
        definition = json.loads(desc["definition"])
    except Exception as e:
        logger.warning("Could not describe state machine: %s", e)
        # Fall back to known order
        return list(_STEP_DISPLAY_LABELS.keys())

    states = definition.get("States", {})
    current = definition.get("StartAt", "")
    order: list[str] = []
    seen: set[str] = set()

    while current and current not in seen:
        seen.add(current)
        order.append(_strip_suffix(current))
        state = states.get(current, {})
        current = state.get("Next", "")

    _STEP_ORDER_CACHE = order
    return order


def _build_execution_progress(sfn, execution_arn: str, step_order: list[str]) -> dict:
    """Build progress dict for a single execution."""
    events: list[dict] = []
    kwargs: dict = {"executionArn": execution_arn, "maxResults": 1000, "reverseOrder": False}
    try:
        while True:
            resp = sfn.get_execution_history(**kwargs)
            events.extend(resp.get("events", []))
            next_token = resp.get("nextToken")
            if not next_token:
                break
            kwargs["nextToken"] = next_token
    except ClientError as e:
        logger.warning("get_execution_history failed for %s: %s", execution_arn, e)
        return {"execution_arn": execution_arn, "error": "could not fetch history"}

    entered: set[str] = set()
    exited: set[str] = set()
    succeeded_iterations: set[int] = set()
    course_list: list[dict] | None = None

    for ev in events:
        ev_type = ev.get("type", "")

        if "StateEntered" in ev_type:
            details = ev.get("stateEnteredEventDetails", {})
            name = _strip_suffix(details.get("name", ""))
            if name in step_order:
                entered.add(name)

            # Capture course list from ProcessEachCourse input
            if _strip_suffix(details.get("name", "")) == "ProcessEachCourse":
                try:
                    items = json.loads(details.get("input", "[]"))
                    if isinstance(items, list):
                        course_list = items
                except Exception:
                    pass

        elif "StateExited" in ev_type:
            details = ev.get("stateExitedEventDetails", {})
            name = _strip_suffix(details.get("name", ""))
            if name in step_order:
                exited.add(name)

        elif ev_type == "MapIterationSucceeded":
            details = ev.get("mapIterationSucceededEventDetails", {})
            # Filter to only count iterations from ProcessEachCourse, not ClassifyAllFiles
            if _strip_suffix(details.get("name", "")) == "ProcessEachCourse":
                succeeded_iterations.add(details.get("index", -1))

    # Build per-job status
    jobs = []
    for step_name in step_order:
        label = _STEP_DISPLAY_LABELS.get(step_name, step_name)

        if step_name in exited:
            status = "completed"
        elif step_name in entered:
            status = "in_progress"
        else:
            status = "pending"

        job: dict = {"name": step_name, "label": label, "status": status}

        # Attach per-course detail for the map step
        if step_name == "ProcessEachCourse" and course_list is not None:
            courses_out = []
            for idx, course in enumerate(course_list):
                if idx in succeeded_iterations:
                    c_status = "completed"
                elif status == "in_progress":
                    c_status = "in_progress"
                else:
                    c_status = "pending"
                courses_out.append({
                    "course_id": course.get("course_id", ""),
                    "course_name": course.get("course_name", ""),
                    "status": c_status,
                })
            job["courses"] = courses_out

        jobs.append(job)

    return {"execution_arn": execution_arn, "jobs": jobs}


def handler(event, _context):
    """GET /courses/active-processing — returns all currently running course-processing executions with job progress."""
    if not STATE_MACHINE_ARN:
        return {
            "statusCode": 500,
            "headers": _CORS_HEADERS,
            "body": json.dumps({"error": "COURSE_PROCESSING_STATE_MACHINE_ARN not configured"}),
        }

    sfn = boto3.client("stepfunctions")

    # Discover running executions
    try:
        list_resp = sfn.list_executions(
            stateMachineArn=STATE_MACHINE_ARN,
            statusFilter="RUNNING",
            maxResults=10,
        )
    except ClientError as e:
        logger.error("list_executions failed: %s", e)
        return {"statusCode": 502, "headers": _CORS_HEADERS, "body": json.dumps({"error": "Internal server error"})}

    executions = list_resp.get("executions", [])

    if not executions:
        return {
            "statusCode": 200,
            "headers": _CORS_HEADERS,
            "body": json.dumps({"executions": []}),
        }

    step_order = _get_step_order(sfn)

    results = []
    for ex in executions[:5]:  # cap at 5 to stay within Lambda timeout
        arn = ex["executionArn"]
        started_at = ex.get("startDate", "").isoformat() if hasattr(ex.get("startDate", ""), "isoformat") else str(ex.get("startDate", ""))
        progress = _build_execution_progress(sfn, arn, step_order)
        progress["started_at"] = started_at
        results.append(progress)

    return {
        "statusCode": 200,
        "headers": _CORS_HEADERS,
        "body": json.dumps({"executions": results}),
    }
