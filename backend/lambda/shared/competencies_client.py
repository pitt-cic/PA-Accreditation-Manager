"""DynamoDB client for the Competencies table."""

import os
from typing import Optional

import boto3
from boto3.dynamodb.conditions import Attr, Key
from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# Storage Models (lightweight references stored in DynamoDB)
# =============================================================================


class CourseReferenceForCompetency(BaseModel):
    """Lightweight reference to a course that maps to this competency."""
    model_config = ConfigDict(extra='ignore')
    course_id: str
    clo_ids: list[str] = Field(default_factory=list)  # Which CLOs reference this competency


class ProgramCompetency(BaseModel):
    """Competency record stored in DynamoDB - lightweight references only."""
    model_config = ConfigDict(extra='ignore')
    id: str
    name: str
    course_references: list[CourseReferenceForCompetency] = Field(default_factory=list)


# =============================================================================
# API Response Models (rich hydrated data for frontend)
# =============================================================================


class MappedTopicForCompetency(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    name: str
    ios: list[str] = Field(default_factory=list)


class MappedCloForCompetency(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    name: str
    topics: list[MappedTopicForCompetency] = []


class MappedCourseForCompetency(BaseModel):
    model_config = ConfigDict(extra='ignore')
    course_id: str
    course_code: str
    clos: list[MappedCloForCompetency] = []


class ProgramCompetencyHydrated(BaseModel):
    """Hydrated competency with full nested course data for API response."""
    model_config = ConfigDict(extra='ignore')
    id: str
    name: str
    mapped_courses: list[MappedCourseForCompetency] = []


class CompetenciesDBClient:
    """Client for the Competencies DynamoDB table."""

    def __init__(self, table_name: str | None = None):
        self._table_name = table_name or os.environ.get("COMPETENCIES_TABLE", "")
        self._dynamodb = boto3.resource("dynamodb")
        self._table = self._dynamodb.Table(self._table_name)

    def get_all_competencies(self) -> list[ProgramCompetency]:
        """Scan live competencies from the table (excludes frozen copies)."""
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

        return [ProgramCompetency(**item) for item in items]

    def get_competency(self, competency_id: str) -> Optional[ProgramCompetency]:
        """Get a single competency by ID (returns lightweight storage model)."""
        response = self._table.get_item(Key={"id": competency_id})
        item = response.get("Item")
        if not item:
            return None
        return ProgramCompetency(**item)

    def get_all_by_audit_year(self, audit_year: str) -> list[ProgramCompetency]:
        """Query frozen competencies by audit year via GSI; strips #{year} suffix from id and course_references."""
        index_name = os.environ.get("COMPETENCIES_AUDIT_YEAR_INDEX", "gsi1-audit-year")
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
        competencies = []
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
            competencies.append(ProgramCompetency(**item))
        return competencies

    def put_competency(self, competency: ProgramCompetency) -> None:
        """Write a competency to the table."""
        self._table.put_item(Item=competency.model_dump())
