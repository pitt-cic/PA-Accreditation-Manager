"""DynamoDB client for standards table operations."""

import json
from datetime import datetime
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr

from .config import Settings, get_settings
from .models import Comment, StandardItem


def convert_floats_to_decimals(obj: Any) -> Any:
    """Recursively convert floats to Decimals for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimals(item) for item in obj]
    return obj


class DynamoDBClient:
    """Client for DynamoDB operations on the standards table."""

    def __init__(self, settings: Settings | None = None):
        """Initialize the DynamoDB client."""
        self._settings = settings or get_settings()
        self._dynamodb = boto3.resource(
            "dynamodb", region_name=self._settings.aws_region
        )
        self._table = self._dynamodb.Table(self._settings.standards_table)

    def get_standard(self, standard_id: str) -> dict | None:
        """
        Get a single standard by ID.

        Args:
            standard_id: The standard ID (e.g., "B2.07a")

        Returns:
            Standard item dict or None if not found
        """
        response = self._table.get_item(Key={"standard_id": standard_id})
        return response.get("Item")

    def get_all_standards(self) -> list[dict]:
        """
        Get all standards from the table.

        Returns:
            List of all standard items
        """
        items = []
        response = self._table.scan()
        items.extend(response.get("Items", []))

        # Handle pagination
        while "LastEvaluatedKey" in response:
            response = self._table.scan(
                ExclusiveStartKey=response["LastEvaluatedKey"]
            )
            items.extend(response.get("Items", []))

        return items

    def update_status(self, standard_id: str, status: str, error_message: str | None = None) -> None:
        """Update the processing status of a standard."""
        now = datetime.now().isoformat()
        set_clause = "SET #status = :status, status_updated_at = :updated_at"
        expression_values: dict[str, Any] = {
            ":status": status,
            ":updated_at": now,
        }
        if error_message:
            set_clause += ", error_message = :error_msg"
            expression_values[":error_msg"] = error_message
            update_expression = set_clause
        elif status != "error":
            # SET and REMOVE must be separate top-level clauses
            update_expression = set_clause + " REMOVE error_message"
        else:
            update_expression = set_clause

        self._table.update_item(
            Key={"standard_id": standard_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues=expression_values,
        )

    def update_execution_arn(self, standard_id: str, execution_arn: str) -> None:
        """Persist the Step Function execution ARN for a standard."""
        self._table.update_item(
            Key={"standard_id": standard_id},
            UpdateExpression="SET execution_arn = :arn",
            ExpressionAttributeValues={":arn": execution_arn},
        )

    def put_standard(self, item: StandardItem) -> None:
        """
        Put a standard item into the table.

        Args:
            item: The StandardItem to store
        """
        self._table.put_item(Item=item.model_dump(exclude_none=True))

    def batch_put_standards(self, items: list[StandardItem]) -> None:
        """
        Batch write multiple standard items.

        Args:
            items: List of StandardItem objects to store
        """
        with self._table.batch_writer() as batch:
            for item in items:
                batch.put_item(Item=item.model_dump(exclude_none=True))

    def get_status_summary(self) -> dict[str, int]:
        """
        Get a summary of standards by status.

        Returns:
            Dict mapping status to count
        """
        summary = {
            "unprocessed": 0,
            "analyzing": 0,
            "analysis_complete": 0,
            "reevaluating": 0,
            "error": 0,
            "total": 0,
        }

        # Scan with projection for efficiency
        response = self._table.scan(
            ProjectionExpression="#status",
            ExpressionAttributeNames={"#status": "status"},
        )

        for item in response.get("Items", []):
            status = item.get("status", "unprocessed")
            if status in summary:
                summary[status] += 1
            summary["total"] += 1

        # Handle pagination
        while "LastEvaluatedKey" in response:
            response = self._table.scan(
                ProjectionExpression="#status",
                ExpressionAttributeNames={"#status": "status"},
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            for item in response.get("Items", []):
                status = item.get("status", "unprocessed")
                if status in summary:
                    summary[status] += 1
                summary["total"] += 1

        return summary

    def get_readiness_summary(self) -> dict[str, int]:
        """
        Get a summary of overall readiness across processed standards.

        Returns:
            Dict mapping readiness level to count
        """
        summary = {
            "ready": 0,
            "mostly_ready": 0,
            "needs_work": 0,
            "not_ready": 0,
            "no_guidance": 0,
        }

        # Scan for analysis_complete standards only
        response = self._table.scan(
            FilterExpression=Attr("status").eq("analysis_complete"),
            ProjectionExpression="evidence_data.overall_readiness",
        )

        for item in response.get("Items", []):
            evidence = item.get("evidence_data", {})
            readiness = evidence.get("overall_readiness", "not_ready")
            if readiness in summary:
                summary[readiness] += 1

        # Handle pagination
        while "LastEvaluatedKey" in response:
            response = self._table.scan(
                FilterExpression=Attr("status").eq("analysis_complete"),
                ProjectionExpression="evidence_data.overall_readiness",
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            for item in response.get("Items", []):
                evidence = item.get("evidence_data", {})
                readiness = evidence.get("overall_readiness", "not_ready")
                if readiness in summary:
                    summary[readiness] += 1

        return summary

    def add_comment(
        self,
        standard_id: str,
        target_type: str,
        target_index: int | None,
        comment: Comment,
    ) -> dict | None:
        """
        Add a comment to a standard's evidence data.

        Args:
            standard_id: The standard ID
            target_type: "evidence", "question", or "standard"
            target_index: Index of evidence/question item (None for standard-level)
            comment: The Comment to add

        Returns:
            Updated standard item or None if not found/no evidence_data
        """
        # Get current standard
        item = self.get_standard(standard_id)
        if not item or not item.get("evidence_data"):
            return None

        evidence_data = item["evidence_data"]
        comment_dict = comment.model_dump()

        # Add comment to appropriate location
        if target_type == "standard":
            # Standard-level comment
            if "comments" not in evidence_data:
                evidence_data["comments"] = []
            evidence_data["comments"].append(comment_dict)
        elif target_type == "evidence":
            # Evidence item comment
            if target_index is None or target_index >= len(
                evidence_data.get("essential_evidence", [])
            ):
                return None
            if "comments" not in evidence_data["essential_evidence"][target_index]:
                evidence_data["essential_evidence"][target_index]["comments"] = []
            evidence_data["essential_evidence"][target_index]["comments"].append(
                comment_dict
            )
        elif target_type == "question":
            # Focused question comment
            if target_index is None or target_index >= len(
                evidence_data.get("focused_questions", [])
            ):
                return None
            if "comments" not in evidence_data["focused_questions"][target_index]:
                evidence_data["focused_questions"][target_index]["comments"] = []
            evidence_data["focused_questions"][target_index]["comments"].append(
                comment_dict
            )
        else:
            return None

        # Update DynamoDB
        self._table.update_item(
            Key={"standard_id": standard_id},
            UpdateExpression="SET evidence_data = :evidence",
            ExpressionAttributeValues={
                ":evidence": convert_floats_to_decimals(evidence_data)
            },
        )

        # Return updated item
        return self.get_standard(standard_id)

    def resolve_item(
        self,
        standard_id: str,
        target_type: str,
        target_index: int,
        resolved_by: str,
        resolved_at: str,
        resolved_note: str,
        unresolve: bool = False,
    ) -> dict | None:
        """
        Mark an evidence item or focused question as manually resolved (or undo it).

        Args:
            standard_id: The standard ID
            target_type: "evidence" or "question"
            target_index: Index of the item to resolve
            resolved_by: User email who is resolving
            resolved_at: ISO timestamp of resolution
            resolved_note: Explanation for the resolution
            unresolve: If True, clear resolution fields

        Returns:
            Updated standard item or None if not found
        """
        item = self.get_standard(standard_id)
        if not item or not item.get("evidence_data"):
            return None

        evidence_data = item["evidence_data"]

        if target_type == "evidence":
            items_list = evidence_data.get("essential_evidence", [])
        elif target_type == "question":
            items_list = evidence_data.get("focused_questions", [])
        else:
            return None

        if target_index < 0 or target_index >= len(items_list):
            return None

        target = items_list[target_index]
        if unresolve:
            target["is_resolved"] = False
            target.pop("resolved_by", None)
            target.pop("resolved_at", None)
            target.pop("resolved_note", None)
        else:
            target["is_resolved"] = True
            target["resolved_by"] = resolved_by
            target["resolved_at"] = resolved_at
            target["resolved_note"] = resolved_note

        self._table.update_item(
            Key={"standard_id": standard_id},
            UpdateExpression="SET evidence_data = :evidence",
            ExpressionAttributeValues={
                ":evidence": convert_floats_to_decimals(evidence_data)
            },
        )

        return self.get_standard(standard_id)

    def update_human_review(
        self,
        standard_id: str,
        human_review_status: str,
        human_readiness_assessment: str | None,
        human_reviewed_by: str,
        human_reviewed_at: str,
        human_review_note: str = "",
    ) -> dict | None:
        """
        Update human review status for a standard's evidence data.

        Args:
            standard_id: The standard ID
            human_review_status: "needs_review", "review_in_progress", "human_verified", or "needs_revision"
            human_readiness_assessment: Human's readiness verdict (ready, mostly_ready, needs_work, not_ready)
            human_reviewed_by: User email who performed the review
            human_reviewed_at: ISO timestamp of review
            human_review_note: Optional explanation for the review decision

        Returns:
            Updated standard item or None if not found
        """
        item = self.get_standard(standard_id)
        if not item:
            return None

        update_expr_parts = [
            "#hrs = :human_review_status",
            "#hrb = :human_reviewed_by",
            "#hrat = :human_reviewed_at",
        ]
        expr_attr_names = {
            "#hrs": "human_review_status",
            "#hrb": "human_reviewed_by",
            "#hrat": "human_reviewed_at",
        }
        expr_attr_values = {
            ":human_review_status": human_review_status,
            ":human_reviewed_by": human_reviewed_by,
            ":human_reviewed_at": human_reviewed_at,
        }

        if human_readiness_assessment:
            update_expr_parts.append("#hra = :human_readiness_assessment")
            expr_attr_names["#hra"] = "human_readiness_assessment"
            expr_attr_values[":human_readiness_assessment"] = human_readiness_assessment

        if human_review_note:
            update_expr_parts.append("#hrn = :human_review_note")
            expr_attr_names["#hrn"] = "human_review_note"
            expr_attr_values[":human_review_note"] = human_review_note

        self._table.update_item(
            Key={"standard_id": standard_id},
            UpdateExpression="SET " + ", ".join(update_expr_parts),
            ExpressionAttributeNames=expr_attr_names,
            ExpressionAttributeValues=expr_attr_values,
        )

        return self.get_standard(standard_id)
