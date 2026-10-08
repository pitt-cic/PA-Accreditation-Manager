"""Lambda handler for GET /standards - list all standards with status summary."""

import logging
import os
import sys
# Add shared module to path
sys.path.insert(0, "/var/task")

from shared import json_dumps
from shared.db_client import DynamoDBClient
from shared.linked_standards_client import LinkedStandardsDBClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

AUDIT_YEAR_INDEX = os.environ.get("LINKED_STANDARDS_AUDIT_YEAR_INDEX", "gsi1-audit-year")

def _handler(event, _context):
    """
    List all standards with their status and readiness summary.

    Accepts optional ?audit_year= query param. When provided, linked-readiness
    data is sourced from frozen records for that year via GSI rather than a full scan.

    Returns:
        {
            "standards": [...],
            "status_summary": {"queued": N, "processing": N, "processed": N, "error": N, "total": N},
            "readiness_summary": {"ready": N, "mostly_ready": N, ...}
        }
    """
    query_params = event.get("queryStringParameters") or {}
    audit_year = query_params.get("audit_year") or None
    logger.info("GET /standards request received (audit_year=%r)", audit_year)
    logger.info("GET /standards request audit_year=%s", audit_year or "live")

    try:
        db = DynamoDBClient()

        # Get all standards
        standards = db.get_all_standards()
        logger.info("Fetched standards count=%d", len(standards))

        # Overlay WF5 linked readiness and human review (keyed by standard_id).
        # In frozen mode, query the GSI for the requested audit year; live mode scans all.
        try:
            linked_db = LinkedStandardsDBClient()
            if audit_year:
                linked_items = linked_db.get_linked_standards_by_year(audit_year, AUDIT_YEAR_INDEX)
            else:
                linked_items = linked_db.get_all_linked_standards()
            linked_review_data: dict[str, dict] = {}
            for item in linked_items:
                sid = item.get("standard_id")
                if not sid:
                    continue
                # Frozen standard_ids are keyed as "{original_id}#{year}" — strip suffix for overlay lookup.
                # Use rsplit to handle standard IDs that might contain '#' characters
                lookup_sid = sid.rsplit("#", 1)[0] if audit_year else sid
                srd = item.get("standard_review_data") or {}
                linked_review_data[lookup_sid] = {
                    "machine_readiness_status": srd.get("machine_readiness_status"),
                    "human_review_status":      srd.get("human_review_status"),
                    "human_readiness_status":   srd.get("human_readiness_status"),
                    "course_codes":             item.get("course_codes") or [],
                    "course_evidence_map":      item.get("course_evidence_map") or [],
                    "is_frozen":                item.get("is_frozen"),
                    "audit_year":               item.get("audit_year"),
                }
        except Exception as e:
            logger.error("Failed to fetch linked standards error=%s", str(e))
            logger.warning(f"Could not fetch linked standards: {e}")
            linked_review_data = {}

        # Format response
        formatted_standards = []
        for item in standards:
            sid = item.get("standard_id")
            formatted = {
                "standard_id": sid,
                "section_id": item.get("section_id"),
                "requirement_text": item.get("requirement_text"),
                "status": item.get("status", "queued"),
                "status_updated_at": item.get("status_updated_at"),
                "last_processed_at": item.get("last_processed_at"),
            }

            # Add evidence summary if processed (old pipeline)
            evidence_data = item.get("evidence_data")
            if evidence_data:
                raw_readiness = evidence_data.get("overall_readiness")
                # Top-level human review fields (new storage) take precedence over evidence_data (legacy)
                human_assessment = item.get("human_readiness_assessment") or evidence_data.get("human_readiness_assessment")
                formatted["overall_readiness"] = raw_readiness or human_assessment or "not_ready"
                formatted["human_review_status"] = (
                    item.get("human_review_status")
                    or evidence_data.get("human_review_status", "needs_review")
                )
                formatted["human_readiness_assessment"] = human_assessment
                formatted["essential_evidence_found"] = evidence_data.get(
                    "essential_evidence_found", 0
                )
                formatted["essential_evidence_total"] = evidence_data.get(
                    "essential_evidence_total", 0
                )

            # Overlay WF5 linked readiness and human review when available
            # WF5 values take precedence over WF1 evidence_data for mapped standards
            linked_r = linked_review_data.get(sid, {})
            if linked_r.get("machine_readiness_status"):
                formatted["overall_readiness"] = linked_r["machine_readiness_status"]
                formatted["linked_mapping_status"] = "complete"
                if formatted.get("status") not in ("analyzing", "reevaluating"):
                    formatted["status"] = "analysis_complete"
            if linked_r.get("human_review_status"):
                formatted["human_review_status"] = linked_r["human_review_status"]
            if linked_r.get("human_readiness_status"):
                formatted["human_readiness_assessment"] = linked_r["human_readiness_status"]
            if linked_r.get("course_codes"):
                formatted["course_codes"] = linked_r["course_codes"]
            if linked_r.get("course_evidence_map"):
                formatted["course_evidence_map"] = linked_r["course_evidence_map"]

            # Include frozen state when querying audit year
            if audit_year:
                formatted["is_frozen"] = linked_r.get("is_frozen")
                formatted["audit_year"] = linked_r.get("audit_year")

            # Add error message if present
            if item.get("error_message"):
                formatted["error_message"] = item.get("error_message")

            formatted_standards.append(formatted)

        # Sort by standard_id
        formatted_standards.sort(key=lambda x: x.get("standard_id", ""))

        # Get summaries. In frozen mode derive from already-assembled standards so
        # counts reflect the selected year, not the live program state.
        if audit_year:
            from collections import Counter
            _status_counts = Counter(s.get("status", "unprocessed") for s in formatted_standards)
            _readiness_counts = Counter(s.get("overall_readiness", "not_ready") for s in formatted_standards)
            status_summary: dict = {
                "unprocessed": _status_counts.get("unprocessed", 0),
                "analyzing": _status_counts.get("analyzing", 0),
                "analysis_complete": _status_counts.get("analysis_complete", 0),
                "reevaluating": _status_counts.get("reevaluating", 0),
                "error": _status_counts.get("error", 0),
                "total": len(formatted_standards),
            }
            readiness_summary: dict = {
                "ready": _readiness_counts.get("ready", 0),
                "mostly_ready": _readiness_counts.get("mostly_ready", 0),
                "needs_work": _readiness_counts.get("needs_work", 0),
                "not_ready": _readiness_counts.get("not_ready", 0),
                "no_guidance": _readiness_counts.get("no_guidance", 0),
            }
        else:
            status_summary = db.get_status_summary()
            readiness_summary = db.get_readiness_summary()

        response_body = {
            "standards": formatted_standards,
            "status_summary": status_summary,
            "readiness_summary": readiness_summary,
        }

        logger.info(
            f"Returning {len(formatted_standards)} standards, "
            f"status: {status_summary}, readiness: {readiness_summary}"
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
        logger.error(f"Error listing standards: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json_dumps({"error": "Internal server error"}),
        }

handler = _handler
