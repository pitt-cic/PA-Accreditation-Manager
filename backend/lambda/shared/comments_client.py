"""DynamoDB client for comments table operations."""

import boto3
from boto3.dynamodb.conditions import Key

from .config import Settings, get_settings
from .models import CommentItem


class CommentsDBClient:
    """Client for DynamoDB operations on the comments table."""

    def __init__(self, settings: Settings | None = None):
        self._settings = settings or get_settings()
        self._dynamodb = boto3.resource("dynamodb", region_name=self._settings.aws_region)
        self._table = self._dynamodb.Table(self._settings.comments_table)

    def add_comment(self, comment: CommentItem) -> CommentItem:
        """Add a comment to the table."""
        self._table.put_item(Item=comment.model_dump())
        return comment

    def delete_comment(self, standard_id: str, comment_id: str) -> bool:
        """Delete a comment by ID. Returns True if deleted."""
        response = self._table.delete_item(
            Key={"standard_id": standard_id, "comment_id": comment_id},
            ReturnValues="ALL_OLD",
        )
        return "Attributes" in response

    def get_comments_for_standard(self, standard_id: str, audit_year=None) -> list[dict]:
        """Get comments for a standard, sorted by time.

        Returns live records (audit_year absent) when audit_year is None,
        or stamped records matching the given audit year otherwise.
        """
        response = self._table.query(
            KeyConditionExpression=Key("standard_id").eq(standard_id),
        )
        items = response.get("Items", [])
        if audit_year is not None:
            items = [i for i in items if i.get("audit_year") == audit_year]
        else:
            items = [i for i in items if i.get("audit_year") is None]
        items.sort(key=lambda x: x.get("time", ""))
        return items

    def get_comments_for_target(
        self, standard_id: str, target_type: str, target_index: int
    ) -> list[dict]:
        """Get comments for a specific target using GSI."""
        target_key = f"{target_type}#{target_index}"
        response = self._table.query(
            IndexName="gsi1-target",
            KeyConditionExpression=Key("standard_id").eq(standard_id)
            & Key("target_key").eq(target_key),
        )
        items = response.get("Items", [])
        items.sort(key=lambda x: x.get("time", ""))
        return items

    def get_comment(self, standard_id: str, comment_id: str) -> dict | None:
        """Get a single comment by ID."""
        response = self._table.get_item(
            Key={"standard_id": standard_id, "comment_id": comment_id}
        )
        return response.get("Item")
