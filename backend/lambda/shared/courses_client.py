"""DynamoDB client for the Courses table."""

import os
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Attr, Key

from .course_models import Course


def _convert_decimals(obj: Any) -> Any:
    """Recursively convert Decimals to floats for Pydantic."""
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {k: _convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_decimals(item) for item in obj]
    return obj


class CoursesDBClient:
    """Client for the Courses DynamoDB table."""

    def __init__(self, table_name: str | None = None):
        self._table_name = table_name or os.environ.get("COURSES_TABLE", "")
        self._dynamodb = boto3.resource("dynamodb")
        self._table = self._dynamodb.Table(self._table_name)

    def get_all_courses(self) -> list[Course]:
        """Scan live courses from the table (excludes frozen copies)."""
        live_filter = Attr("audit_year").not_exists()
        items = []
        response = self._table.scan(FilterExpression=live_filter)
        items.extend(response.get("Items", []))

        while "LastEvaluatedKey" in response:
            response = self._table.scan(
                FilterExpression=live_filter,
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))

        return [Course(**_convert_decimals(item)) for item in items]

    def get_course(self, course_id: str) -> Course | None:
        """Get a single course by ID."""
        response = self._table.get_item(Key={"course_id": course_id})
        item = response.get("Item")
        if not item:
            return None
        return Course(**_convert_decimals(item))

    def get_all_by_audit_year(self, audit_year: str) -> list[Course]:
        """Query frozen courses by audit year via GSI; strips #{year} suffix from course_id."""
        index_name = os.environ.get("COURSES_AUDIT_YEAR_INDEX", "gsi1-audit-year")
        items = []
        kwargs: dict = {
            "IndexName": index_name,
            "KeyConditionExpression": Key("audit_year").eq(audit_year),
        }
        while True:
            response = self._table.query(**kwargs)
            items.extend(response.get("Items", []))
            last_key = response.get("LastEvaluatedKey")
            if not last_key:
                break
            kwargs["ExclusiveStartKey"] = last_key

        courses = []
        for item in items:
            item = dict(item)
            raw_id = item.get("course_id", "")
            suffix = f"#{audit_year}"
            if raw_id.endswith(suffix):
                item["course_id"] = raw_id[: -len(suffix)]
            courses.append(Course(**_convert_decimals(item)))
        return courses

    def put_course(self, course: Course) -> None:
        """Write a course to the table."""
        item = course.model_dump()
        self._table.put_item(Item=_convert_floats(item))


def _convert_floats(obj: Any) -> Any:
    """Recursively convert floats to Decimals for DynamoDB."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: _convert_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_floats(item) for item in obj]
    return obj
