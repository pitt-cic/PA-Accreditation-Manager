"""Lambda handler for Workflow 5 aggregation: synthesize all mappings into a LinkedStandard.

Invoked by Step Functions after the Map state completes. Fetches full mapping
payloads from MappingResultsTable using the slim pointers returned by WF4 mappers,
avoiding the 256KB Step Functions state limit.
"""

import asyncio
import logging
import os
import sys
from decimal import Decimal

sys.path.insert(0, "/var/task")

import boto3

from shared.course_models import (
    IntermediateMapping,
    LinkedStandard,
    StandardMetadata,
    StandardReviewData,
    EssentialEvidenceLinked,
    EvidenceItemMetadata,
)
from shared.db_client import DynamoDBClient
from shared.linked_standards_client import LinkedStandardsDBClient
from shared.mapping_aggregator import aggregate_mappings, summarize_no_mappings

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def _decimals_to_float(obj):
    """Recursively convert Decimal values back to float after DynamoDB read."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _decimals_to_float(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_decimals_to_float(i) for i in obj]
    return obj

def _fetch_mapping(mapping_key: str, course_id: str) -> dict | None:
    """Fetch one mapping record from MappingResultsTable."""
    table_name = os.environ["MAPPING_RESULTS_TABLE"]
    table = boto3.resource("dynamodb").Table(table_name)
    response = table.get_item(Key={"mapping_key": mapping_key, "course_id": course_id})
    item = response.get("Item")
    return _decimals_to_float(item) if item else None

def _handler(event, _context):
    """
    Aggregate all course-standard mappings into a LinkedStandard.

    Input (from Step Functions — slim pointers only):
        {
            "standard": { "standard_id", "section_id", "requirement_text", "compliance_guidance", ... },
            "mapping_results": [
                { "course_id": "...", "mapping_key": "...", "has_mapping": bool, "is_rejected": bool },
                ...
            ]
        }

    Output:
        { "standard_id": "...", "status": "complete"|"no_mappings" }
    """
    standard = event["standard"]
    mapping_results = event["mapping_results"]
    standard_id = standard.get("standard_id", "unknown")

    logger.info(
        f"Workflow 5: aggregating {len(mapping_results)} results for {standard_id}"
    )

    # Fetch full payloads from DynamoDB for courses that produced a result
    valid_mappings = []
    rejected_mappings = []
    expected_refs = [r for r in mapping_results if r.get("has_mapping") or r.get("is_rejected")]
    missing_count = 0

    for ref in mapping_results:
        if not ref.get("has_mapping") and not ref.get("is_rejected"):
            continue
        item = _fetch_mapping(ref["mapping_key"], ref["course_id"])
        if not item:
            logger.warning(f"No mapping record found for {ref['course_id']} / {ref['mapping_key']} — may have expired via TTL")
            missing_count += 1
            continue
        raw_mapping = item.get("mapping")
        if not raw_mapping:
            logger.warning(
                f"Mapping record for {ref['course_id']} / {ref['mapping_key']} has no 'mapping' key — skipping"
            )
            continue
        mapping = IntermediateMapping(**raw_mapping)
        if ref.get("is_rejected"):
            rejected_mappings.append(mapping)
        else:
            valid_mappings.append(mapping)

    logger.info(
        f"Found {len(valid_mappings)} valid, {len(rejected_mappings)} rejected mappings for {standard_id}"
    )
    if missing_count:
        logger.warning(
            f"{missing_count}/{len(expected_refs)} mapping records missing for {standard_id} "
            f"— records may have expired via TTL before aggregation ran"
        )

    standards_db = DynamoDBClient()

    if not valid_mappings:
        logger.info(f"No relevant course mappings for {standard_id} — generating explanation")

        def log_callback(msg: str) -> None:
            logger.info(f"[{standard_id}] {msg}")

        try:
            summary = asyncio.run(
                summarize_no_mappings(
                    standard=standard,
                    rejected_mappings=rejected_mappings,
                    log=log_callback,
                )
            )

            # Build evidence items from compliance guidance so the UI shows each
            # item as unsupported rather than an empty list.

            guidance = standard.get("compliance_guidance") or {}
            ee_items = guidance.get("essential_evidence", [])
            essential_evidences = [
                EssentialEvidenceLinked(
                    evidence_metadata=EvidenceItemMetadata(
                        id=f"{standard_id}_EE{i}",
                        text=item,
                        support_summary=(
                            "No supporting course evidence was found. "
                            "Relevant course syllabi may not yet have been uploaded, "
                            "or this item may require on-site verification."
                        ),
                    ),
                    linked_courses=[],
                    linked_artifacts=[],
                )
                for i, item in enumerate(ee_items, 1)
            ]

            stub = LinkedStandard(
                standard_id=standard_id,
                standard_metadata=StandardMetadata(
                    id=standard_id,
                    section=standard.get("section_id", ""),
                    standard_desc=standard.get("requirement_text", ""),
                    standard_evidence_summary=summary,
                ),
                standard_review_data=StandardReviewData(
                    machine_review_status="complete",
                    machine_readiness_status="not_applicable",
                ),
                essential_evidences=essential_evidences,
            )
            linked_db = LinkedStandardsDBClient()
            linked_db.put_linked_standard(standard_id, stub.model_dump())
            standards_db.update_status(standard_id, "analysis_complete")
            return {"standard_id": standard_id, "status": "no_mappings"}

        except Exception as e:
            logger.error(f"Error writing no-mappings stub for {standard_id}: {e}", exc_info=True)
            standards_db.update_status(standard_id, "error", error_message=str(e))
            raise

    def log_callback(msg: str) -> None:
        logger.info(f"[{standard_id}] {msg}")

    try:
        linked_standard = asyncio.run(
            aggregate_mappings(
                standard=standard,
                mappings=valid_mappings,
                log=log_callback,
            )
        )

        linked_db = LinkedStandardsDBClient()
        linked_db.put_linked_standard(standard_id, linked_standard.model_dump())

        standards_db.update_status(standard_id, "analysis_complete")

        logger.info(
            f"Workflow 5 complete: {standard_id} written to LinkedStandardsTable "
            f"({len(linked_standard.essential_evidences)} evidence items)"
        )
        return {"standard_id": standard_id, "status": "complete"}

    except Exception as e:
        logger.error(f"Error aggregating {standard_id}: {e}", exc_info=True)
        standards_db.update_status(standard_id, "error", error_message=str(e))
        raise

handler = _handler
