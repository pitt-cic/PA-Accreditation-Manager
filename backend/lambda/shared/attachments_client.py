"""DynamoDB client for reviewer file attachment operations."""

import boto3
from boto3.dynamodb.conditions import Key

from .config import Settings, get_settings
from .models import AttachmentItem


class AttachmentsDBClient:
    """Client for DynamoDB operations on the attachments table."""

    def __init__(self, settings: Settings | None = None):
        self._settings = settings or get_settings()
        self._dynamodb = boto3.resource("dynamodb", region_name=self._settings.aws_region)
        self._table = self._dynamodb.Table(self._settings.attachments_table)

    def add_attachment(self, attachment: AttachmentItem) -> AttachmentItem:
        """Write a new attachment record."""
        self._table.put_item(Item=attachment.model_dump())
        return attachment

    def confirm_attachment(self, standard_id: str, attachment_id: str) -> dict | None:
        """
        Mark an attachment as upload_confirmed=True and remove the TTL.
        Returns the updated item, or None if the record doesn't exist.
        """
        try:
            response = self._table.update_item(
                Key={"standard_id": standard_id, "attachment_id": attachment_id},
                UpdateExpression="SET upload_confirmed = :t REMOVE #ttl",
                ExpressionAttributeValues={":t": True},
                ExpressionAttributeNames={"#ttl": "ttl"},
                ConditionExpression="attribute_exists(standard_id)",
                ReturnValues="ALL_NEW",
            )
            return response.get("Attributes")
        except self._dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
            return None

    def delete_attachment(self, standard_id: str, attachment_id: str) -> dict | None:
        """Delete an attachment record. Returns the deleted item or None if not found."""
        response = self._table.delete_item(
            Key={"standard_id": standard_id, "attachment_id": attachment_id},
            ReturnValues="ALL_OLD",
        )
        return response.get("Attributes")

    def get_attachments_for_standard(self, standard_id: str, audit_year=None) -> list[dict]:
        """
        Get confirmed attachments for a standard, sorted by upload time.

        Returns live records (audit_year absent) when audit_year is None,
        or stamped records matching the given audit year otherwise.
        Paginates through all result pages to avoid silently dropping items
        when the result set exceeds DynamoDB's 1 MB response limit.
        """
        items = []
        kwargs: dict = {
            "KeyConditionExpression": Key("standard_id").eq(standard_id),
        }
        while True:
            response = self._table.query(**kwargs)
            items.extend(response.get("Items", []))
            last_key = response.get("LastEvaluatedKey")
            if not last_key:
                break
            kwargs["ExclusiveStartKey"] = last_key

        # Exclude unconfirmed pending uploads from read responses
        confirmed = [i for i in items if i.get("upload_confirmed", False)]
        if audit_year is not None:
            confirmed = [i for i in confirmed if i.get("audit_year") == audit_year]
        else:
            confirmed = [i for i in confirmed if i.get("audit_year") is None]
        confirmed.sort(key=lambda x: x.get("uploaded_at", ""))
        return confirmed

    def get_attachment(self, standard_id: str, attachment_id: str) -> dict | None:
        """Get a single attachment record (confirmed or pending)."""
        response = self._table.get_item(
            Key={"standard_id": standard_id, "attachment_id": attachment_id}
        )
        return response.get("Item")
