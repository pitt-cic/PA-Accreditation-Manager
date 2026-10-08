"""DynamoDB client for the Goals table."""

import os
from typing import Optional

import boto3
from boto3.dynamodb.conditions import Attr, Key
from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# Storage Models (lightweight references stored in DynamoDB)
# =============================================================================


class CourseReferenceForGoal(BaseModel):
    """Lightweight reference to a course that maps to this goal."""
    model_config = ConfigDict(extra='ignore')
    course_id: str
    clo_ids: list[str] = Field(default_factory=list)  # Which CLOs reference this goal


class ProgramGoal(BaseModel):
    """Goal record stored in DynamoDB - lightweight references only."""
    model_config = ConfigDict(extra='ignore')
    id: str
    name: str
    course_references: list[CourseReferenceForGoal] = Field(default_factory=list)


# =============================================================================
# API Response Models (rich hydrated data for frontend)
# =============================================================================


class MappedTopicForGoal(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    name: str
    ios: list[str] = Field(default_factory=list)


class MappedCloForGoal(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    name: str
    topics: list[MappedTopicForGoal] = []


class MappedCourseForGoal(BaseModel):
    model_config = ConfigDict(extra='ignore')
    course_id: str
    course_code: str
    clos: list[MappedCloForGoal] = []


class ProgramGoalHydrated(BaseModel):
    """Hydrated goal with full nested course data for API response."""
    model_config = ConfigDict(extra='ignore')
    id: str
    name: str
    mapped_courses: list[MappedCourseForGoal] = []


class GoalsDBClient:
    """Client for the Goals DynamoDB table."""

    def __init__(self, table_name: str | None = None):
        self._table_name = table_name or os.environ.get("GOALS_TABLE", "")
        self._dynamodb = boto3.resource("dynamodb")
        self._table = self._dynamodb.Table(self._table_name)

    def get_all_goals(self) -> list[ProgramGoal]:
        """Scan live goals from the table (excludes frozen copies)."""
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

        return [ProgramGoal(**item) for item in items]

    def get_goal(self, goal_id: str) -> Optional[ProgramGoal]:
        """Get a single goal by ID (returns lightweight storage model)."""
        response = self._table.get_item(Key={"id": goal_id})
        item = response.get("Item")
        if not item:
            return None
        return ProgramGoal(**item)

    def get_all_by_audit_year(self, audit_year: str) -> list[ProgramGoal]:
        """Query frozen goals by audit year via GSI; strips #{year} suffix from id and course_references."""
        index_name = os.environ.get("GOALS_AUDIT_YEAR_INDEX", "gsi1-audit-year")
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

        suffix = f"#{audit_year}"
        goals = []
        for item in items:
            item = dict(item)
            if item.get("id", "").endswith(suffix):
                item["id"] = item["id"][: -len(suffix)]
            refs = []
            for ref in item.get("course_references", []):
                ref = dict(ref)
                if ref.get("course_id", "").endswith(suffix):
                    ref["course_id"] = ref["course_id"][: -len(suffix)]
                refs.append(ref)
            item["course_references"] = refs
            goals.append(ProgramGoal(**item))
        return goals

    def put_goal(self, goal: ProgramGoal) -> None:
        """Write a goal to the table."""
        self._table.put_item(Item=goal.model_dump())
