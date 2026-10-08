"""DynamoDB client for the LinkedStandards table."""

import json
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

from .config import get_settings, Settings

logger = logging.getLogger(__name__)

# DynamoDB hard limit is 400KB; stay well under it.
_DYNAMO_ITEM_LIMIT = 350_000  # bytes
# S3 prefix for offloaded course_details blobs
_S3_PREFIX = "linked-standard-overflow"
# Marker attribute stored in the DynamoDB item when course_details is in S3
_S3_KEY_ATTR = "_course_details_s3_key"


def _convert_floats(obj: Any) -> Any:
    """Recursively convert floats to Decimals for DynamoDB."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: _convert_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_floats(item) for item in obj]
    return obj


def _item_size(item: dict) -> int:
    """Rough byte-size estimate for a DynamoDB item (JSON encoding)."""
    return len(json.dumps(item, default=str).encode("utf-8"))


def _normalize_linked_standard(item: dict) -> dict:
    """Fill in missing array defaults for records written before all fields existed."""
    for ee in item.get("essential_evidences", []):
        ee.setdefault("linked_artifacts", [])
        ee.setdefault("linked_courses", [])
        for course in ee.get("linked_courses", []):
            course.setdefault("clos", [])
            for clo in course.get("clos", []):
                clo.setdefault("topics", [])
                for topic in clo.get("topics", []):
                    topic.setdefault("ios", [])
                    topic.setdefault("goals", [])
                    topic.setdefault("comps", [])
                    topic.setdefault("assessments", [])
    for course in item.get("course_details", {}).values():
        course.setdefault("clos", [])
        for clo in course.get("clos", []):
            clo.setdefault("topics", [])
            for topic in clo.get("topics", []):
                topic.setdefault("ios", [])
                topic.setdefault("goals", [])
                topic.setdefault("comps", [])
                topic.setdefault("assessments", [])
    return item


class LinkedStandardsDBClient:
    """Client for the LinkedStandards DynamoDB table."""

    def __init__(self, settings: Settings | None = None):
        self._settings = settings or get_settings()
        self._dynamodb = boto3.resource(
            "dynamodb", region_name=self._settings.aws_region
        )
        self._table = self._dynamodb.Table(self._settings.linked_standards_table)
        self._s3 = boto3.client("s3", region_name=self._settings.aws_region)
        self._bucket = self._settings.s3_documents_bucket

    def put_linked_standard(self, standard_id: str, data: dict) -> None:
        """Write a linked standard to DynamoDB, offloading course_details to S3 if needed.

        Each write uses a timestamp-keyed S3 object so frozen copies always
        reference the snapshot that existed at freeze time, even if the standard
        is later re-processed.
        """
        item = {"standard_id": standard_id, **data}
        converted = _convert_floats(item)

        if _item_size(converted) > _DYNAMO_ITEM_LIMIT:
            course_details = converted.pop("course_details", None)
            if course_details is not None:
                ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                s3_key = f"{_S3_PREFIX}/{standard_id}/{ts}.json"
                self._s3.put_object(
                    Bucket=self._bucket,
                    Key=s3_key,
                    Body=json.dumps(course_details, default=str).encode("utf-8"),
                    ContentType="application/json",
                )
                converted[_S3_KEY_ATTR] = s3_key
                logger.info(
                    "Offloaded course_details for %s to s3://%s/%s (%d bytes)",
                    standard_id, self._bucket, s3_key, _item_size(converted),
                )

        self._table.put_item(Item=converted)

    def get_linked_standard(self, standard_id: str) -> dict | None:
        """Get a linked standard, transparently fetching S3 overflow if present."""
        response = self._table.get_item(Key={"standard_id": standard_id})
        item = response.get("Item")
        if not item:
            return None

        s3_key = item.pop(_S3_KEY_ATTR, None)
        if s3_key:
            try:
                resp = self._s3.get_object(Bucket=self._bucket, Key=s3_key)
                item["course_details"] = json.loads(resp["Body"].read().decode("utf-8"))
            except Exception as e:
                logger.warning(
                    "Could not fetch course_details from S3 for %s: %s", standard_id, e
                )

        return _normalize_linked_standard(item)

    def delete_linked_standard(self, standard_id: str) -> None:
        """Delete a linked standard by ID."""
        self._table.delete_item(Key={"standard_id": standard_id})

    def update_review(self, standard_id: str, review_data: dict) -> dict | None:
        """
        Update human review fields on standard_review_data without overwriting
        machine-generated fields or essential_evidences.

        review_data may contain any subset of:
            human_review_status, human_readiness_status, reviewer,
            review_date, review_notes
        """
        # Map Python field names to ExpressionAttributeNames aliases.
        # Using aliases for every field avoids DynamoDB reserved-word collisions.
        FIELD_ALIASES = {
            "human_review_status":    "#hrs",
            "human_readiness_status": "#hras",
            "reviewer":               "#rvwr",
            "review_date":            "#rdate",
            "review_notes":           "#rnotes",
        }

        names:  dict[str, str] = {"#srd": "standard_review_data", "#ua": "updated_at"}
        values: dict[str, Any] = {":ua": datetime.now(timezone.utc).isoformat()}
        clauses: list[str] = ["#ua = :ua"]

        for field, alias in FIELD_ALIASES.items():
            val = review_data.get(field)
            if val is not None:
                names[alias] = field
                values[f":{field}"] = val
                clauses.append(f"#srd.{alias} = :{field}")

        try:
            self._table.update_item(
                Key={"standard_id": standard_id},
                UpdateExpression="SET " + ", ".join(clauses),
                ExpressionAttributeNames=names,
                ExpressionAttributeValues=values,
                ConditionExpression="attribute_exists(standard_id)",
            )
        except self._dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
            return None

        return self.get_linked_standard(standard_id)

    def get_all_linked_standards(self) -> list[dict]:
        """Scan and return all linked standards (summary fields only — no essential_evidences)."""
        items = []
        response = self._table.scan(
            ProjectionExpression="standard_id, standard_review_data, course_codes, course_evidence_map, is_frozen, audit_year"
        )
        items.extend(response.get("Items", []))
        while "LastEvaluatedKey" in response:
            response = self._table.scan(
                ProjectionExpression="standard_id, standard_review_data, course_codes, course_evidence_map, is_frozen, audit_year",
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))
        return items

    def get_linked_standards_by_year(self, audit_year: str, index_name: str) -> list[dict]:
        """Query frozen linked standards for a specific audit year via GSI."""
        items = []
        kwargs: dict = {
            "IndexName": index_name,
            "KeyConditionExpression": Key("audit_year").eq(audit_year),
            "ProjectionExpression": "standard_id, standard_review_data, course_codes, course_evidence_map, is_frozen, audit_year",
        }
        while True:
            response = self._table.query(**kwargs)
            items.extend(response.get("Items", []))
            last_key = response.get("LastEvaluatedKey")
            if not last_key:
                break
            kwargs["ExclusiveStartKey"] = last_key
        return items

    def get_all_standards_by_audit_year(self, audit_year: str) -> list[dict]:
        """Query frozen standards by audit year using default GSI name from environment."""
        index_name = os.environ.get("LINKED_STANDARDS_AUDIT_YEAR_INDEX", "gsi1-audit-year")
        return self.get_linked_standards_by_year(audit_year, index_name)
