"""DynamoDB client for the Documents table (document classification results)."""

import os
from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr

from .doc_classifier import DocumentClassification


class DocumentsDBClient:
    """Client for the Documents DynamoDB table."""

    def __init__(self, table_name: str | None = None):
        self._table_name = table_name or os.environ.get("DOCUMENTS_TABLE", "")
        self._dynamodb = boto3.resource("dynamodb")
        self._table = self._dynamodb.Table(self._table_name)

    def put_document(self, s3_key: str, classification: DocumentClassification) -> None:
        """Write or overwrite a classification result keyed by s3_key."""
        item: dict[str, Any] = {"s3_key": s3_key, **classification.model_dump()}
        self._table.put_item(Item=item)

    def get_document(self, s3_key: str) -> DocumentClassification | None:
        """Get a classification result by s3_key."""
        response = self._table.get_item(Key={"s3_key": s3_key})
        item = response.get("Item")
        if not item:
            return None
        item.pop("s3_key")
        return DocumentClassification(**item)

    def get_assessments_for_course(self, course_id: str) -> list[tuple[str, DocumentClassification]]:
        """Scan for all assessment documents linked to a course_id.

        Returns a list of (s3_key, DocumentClassification) tuples.
        """
        items = []
        response = self._table.scan(
            FilterExpression=Attr("file_type").eq("assessment") & Attr("course").eq(course_id)
        )
        items.extend(response.get("Items", []))
        while "LastEvaluatedKey" in response:
            response = self._table.scan(
                FilterExpression=Attr("file_type").eq("assessment") & Attr("course").eq(course_id),
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))

        result = []
        for item in items:
            s3_key = item.pop("s3_key")
            result.append((s3_key, DocumentClassification(**item)))
        return result
