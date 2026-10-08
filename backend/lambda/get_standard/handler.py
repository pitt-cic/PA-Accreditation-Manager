"""Lambda handler for GET /standards/{id} and GET /standards/{id}/status."""

import logging
import sys

# Add shared module to path
sys.path.insert(0, "/var/task")

from shared import json_dumps
from shared.attachments_client import AttachmentsDBClient
from shared.comments_client import CommentsDBClient
from shared.db_client import DynamoDBClient
from shared.linked_standards_client import LinkedStandardsDBClient
from shared.models import WF5_TARGET_TYPES

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def merge_comments_into_evidence_data(evidence_data: dict, comments: list[dict]) -> dict:
    """
    Merge comments from comments table into evidence_data structure.

    Groups comments by target_type and target_index and inserts them into
    the appropriate places in evidence_data.
    """
    if not evidence_data:
        return evidence_data

    # Initialize comments arrays if not present
    if "comments" not in evidence_data:
        evidence_data["comments"] = []

    # Group comments by target
    for comment in comments:
        target_type = comment.get("target_type", "standard")
        target_index = int(comment.get("target_index", -1))  # DynamoDB returns Decimal

        # Convert to Comment format (remove DynamoDB-specific fields)
        comment_data = {
            "comment_id": comment.get("comment_id"),
            "author": comment.get("author"),
            "initials": comment.get("initials"),
            "time": comment.get("time"),
            "text": comment.get("text"),
        }

        if target_type == "standard":
            evidence_data["comments"].append(comment_data)
        elif target_type == "evidence":
            evidence_items = evidence_data.get("essential_evidence", [])
            if 0 <= target_index < len(evidence_items):
                if "comments" not in evidence_items[target_index]:
                    evidence_items[target_index]["comments"] = []
                evidence_items[target_index]["comments"].append(comment_data)
        elif target_type == "question":
            questions = evidence_data.get("focused_questions", [])
            if 0 <= target_index < len(questions):
                if "comments" not in questions[target_index]:
                    questions[target_index]["comments"] = []
                questions[target_index]["comments"].append(comment_data)

    return evidence_data

def merge_comments_into_linked_data(linked_data: dict, comments: list[dict]) -> dict:
    """
    Merge WF5 comments (target_type in WF5_TARGET_TYPES) into the linked_data structure.

    Routes by target_path which encodes the nesting as slash-separated IDs:
      linked_ee:     "EE_001"
      linked_course: "EE_001/PA1001"
      linked_clo:    "EE_001/PA1001/CL1"
      linked_ct:     "EE_001/PA1001/CL1/CT3"
    """
    if not linked_data:
        return linked_data

    evidences = linked_data.get("essential_evidences", [])
    # Build lookup: ee_id -> index
    ee_index = {e.get("evidence_metadata", {}).get("id"): i for i, e in enumerate(evidences)}

    for comment in comments:
        target_type = comment.get("target_type")
        target_path = comment.get("target_path", "")
        if not target_path:
            continue

        comment_data = {
            "comment_id": comment.get("comment_id"),
            "author": comment.get("author"),
            "initials": comment.get("initials"),
            "time": comment.get("time"),
            "text": comment.get("text"),
        }

        parts = target_path.split("/")
        ee_id = parts[0] if len(parts) > 0 else None
        course_id = parts[1] if len(parts) > 1 else None
        clo_id = parts[2] if len(parts) > 2 else None
        ct_id = parts[3] if len(parts) > 3 else None

        if ee_id is None or ee_id not in ee_index:
            continue
        ee = evidences[ee_index[ee_id]]

        if target_type == "linked_ee":
            ee.setdefault("comments", []).append(comment_data)
            continue

        course = next((c for c in ee.get("linked_courses", []) if c.get("course_id") == course_id), None)
        if course is None:
            continue

        if target_type == "linked_course":
            course.setdefault("comments", []).append(comment_data)
            continue

        # CLO/topic comments: prefer course_details (new deduplicated format),
        # fall back to clos embedded in the course ref (legacy format)
        course_detail = linked_data.get("course_details", {}).get(course_id)
        clo_source = course_detail if course_detail else course
        clo = next((cl for cl in clo_source.get("clos", []) if cl.get("clo_id") == clo_id), None)
        if clo is None:
            continue

        if target_type == "linked_clo":
            clo.setdefault("comments", []).append(comment_data)
            continue

        ct = next(
            (t for t in clo.get("topics", []) if t.get("topic_metadata", {}).get("id") == ct_id),
            None,
        )
        if ct is None:
            continue

        if target_type == "linked_ct":
            ct.setdefault("comments", []).append(comment_data)

    return linked_data

def merge_attachments(
    standard_attachments: list[dict],
    linked_data: dict | None,
) -> tuple[list[dict], dict | None]:
    """
    Partition attachments by target_type and merge into the response structures.

    standard-level attachments go onto a top-level 'attachments' list.
    linked_ee attachments are injected into the matching evidence item.
    Returns (standard_attachments_list, updated_linked_data).
    """
    std_attachments = []
    ee_attachments: dict[str, list[dict]] = {}

    for a in standard_attachments:
        att = {
            "attachment_id": a.get("attachment_id"),
            "file_name":     a.get("file_name"),
            "file_size":     a.get("file_size"),
            "content_type":  a.get("content_type"),
            "s3_key":        a.get("s3_key"),
            "uploader":      a.get("uploader"),
            "uploaded_at":   a.get("uploaded_at"),
            "note":          a.get("note"),
            "target_type":   a.get("target_type"),
            "target_path":   a.get("target_path"),
        }
        if a.get("target_type") == "linked_ee" and a.get("target_path"):
            ee_attachments.setdefault(a["target_path"], []).append(att)
        else:
            std_attachments.append(att)

    if linked_data and ee_attachments:
        for ee in linked_data.get("essential_evidences", []):
            ee_id = ee.get("evidence_metadata", {}).get("id")
            if ee_id and ee_id in ee_attachments:
                ee.setdefault("attachments", []).extend(ee_attachments[ee_id])

    return std_attachments, linked_data

def _handler(event, _context):
    """
    Get a single standard by ID.

    For GET /standards/{id}/status - returns just status info
    For GET /standards/{id} - returns full standard with evidence

    Path parameters:
        id: Standard ID (e.g., "B2.07a")
    """
    # Get standard ID from path parameters
    path_params = event.get("pathParameters", {}) or {}
    standard_id = path_params.get("id")
    query_params = event.get("queryStringParameters") or {}
    audit_year = query_params.get("audit_year")

    if not standard_id:
        return {
            "statusCode": 400,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json_dumps({"error": "Missing standard ID"}),
        }

    # Check if this is a status request
    path = event.get("path", "")
    is_status_request = path.endswith("/status")

    logger.info(
        f"GET /standards/{standard_id}"
        + ("/status" if is_status_request else "")
    )

    try:
        db = DynamoDBClient()

        # Get the standard
        item = db.get_standard(standard_id)

        if not item:
            return {
                "statusCode": 404,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json_dumps({"error": f"Standard {standard_id} not found"}),
            }

        if is_status_request:
            # Return just status info for polling
            response_body = {
                "standard_id": item.get("standard_id"),
                "status": item.get("status", "queued"),
                "status_updated_at": item.get("status_updated_at"),
                "error_message": item.get("error_message"),
            }
        else:
            # Fetch comments from comments table
            comments_db = CommentsDBClient()
            comments = comments_db.get_comments_for_standard(standard_id, audit_year)

            # Partition comments by target type
            standard_comments = [c for c in comments if c.get("target_type") == "standard"]
            wf5_comments = [c for c in comments if c.get("target_type") in WF5_TARGET_TYPES]
            wf1_comments = [
                c for c in comments
                if c.get("target_type") not in WF5_TARGET_TYPES
                and c.get("target_type") != "standard"
            ]

            # Merge WF1 evidence/question comments into evidence_data
            evidence_data = item.get("evidence_data")
            evidence_data = merge_comments_into_evidence_data(evidence_data, wf1_comments)

            # Format standard-level comments for the always-present top-level field
            top_level_comments = [
                {
                    "comment_id": c.get("comment_id"),
                    "author": c.get("author"),
                    "initials": c.get("initials"),
                    "time": c.get("time"),
                    "text": c.get("text"),
                }
                for c in standard_comments
            ]

            # Fetch WF5 linked data if available
            # Query frozen record when audit_year present
            linked_data = None
            try:
                linked_db = LinkedStandardsDBClient()
                if audit_year:
                    frozen_key = f"{standard_id}#{audit_year}"
                    linked_data = linked_db.get_linked_standard(frozen_key)
                else:
                    linked_data = linked_db.get_linked_standard(standard_id)
                linked_data = merge_comments_into_linked_data(linked_data, wf5_comments)
            except Exception as e:
                logger.warning(f"Could not fetch linked standard for {standard_id}: {e}")

            # Fetch and merge reviewer file attachments
            std_file_attachments: list[dict] = []
            try:
                att_db = AttachmentsDBClient()
                raw_attachments = att_db.get_attachments_for_standard(standard_id, audit_year)
                std_file_attachments, linked_data = merge_attachments(raw_attachments, linked_data)
            except Exception as e:
                logger.warning(f"Could not fetch attachments for {standard_id}: {e}")

            # Determine effective status — if linked mapping exists, treat as complete
            effective_status = item.get("status", "queued")
            if linked_data and effective_status not in ("analyzing", "reevaluating", "error", "failed"):
                effective_status = "analysis_complete"

            # Return full standard with evidence
            response_body = {
                "standard_id": item.get("standard_id"),
                "section_id": item.get("section_id"),
                "requirement_text": item.get("requirement_text"),
                "sub_requirement_text": item.get("sub_requirement_text"),
                "status": effective_status,
                "status_updated_at": item.get("status_updated_at"),
                "last_processed_at": item.get("last_processed_at"),
                "error_message": item.get("error_message"),
                "evidence_data": evidence_data,
                "linked_data": linked_data,
                "comments": top_level_comments,
                "attachments": std_file_attachments,
                # Include original compliance guidance for reference
                "compliance_guidance": item.get("compliance_guidance"),
                "sub_requirements": item.get("sub_requirements"),
                # Human review fields stored as top-level attributes (new) with evidence_data fallback (legacy)
                "human_review_status": (
                    item["human_review_status"] if item.get("human_review_status") is not None
                    else (evidence_data or {}).get("human_review_status", "needs_review")
                ),
                "human_readiness_assessment": (
                    item["human_readiness_assessment"] if item.get("human_readiness_assessment") is not None
                    else (evidence_data or {}).get("human_readiness_assessment")
                ),
                "human_reviewed_by": item.get("human_reviewed_by"),
                "human_reviewed_at": item.get("human_reviewed_at"),
                "human_review_note": item.get("human_review_note"),
                # Include frozen state when querying audit year
                "is_frozen": linked_data.get("is_frozen") if linked_data else None,
                "audit_year": linked_data.get("audit_year") if linked_data else None,
            }

        logger.info(
            f"Returning standard {standard_id}, status: {item.get('status')}"
        )

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type,Authorization",
            },
            "body": json_dumps(response_body),
        }

    except Exception as e:
        logger.error(f"Error getting standard {standard_id}: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json_dumps({"error": "Internal server error"}),
        }

handler = _handler
