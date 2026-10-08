"""Pydantic models for course-standard mapping (Workflows 4 & 5)."""

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# Course Input Models (from WF2/3 output — flat/relational with ID references)
# =============================================================================


class CourseAssessment(BaseModel):
    """Assessment at course level, referenced by CLOs and topics via assessment_ids."""
    id: str
    name: str
    info: Optional[str] = None


class CourseTopic(BaseModel):
    """Course topic (ct) with IOs as plain strings and assessment references."""
    id: str
    name: str
    ios: list[str] = Field(default_factory=list)
    assessment_ids: list[str] = Field(default_factory=list)


class CourseLearningOutcome(BaseModel):
    """CLO referencing topics and assessments by ID."""
    id: str
    name: str
    topic_ids: list[str] = Field(default_factory=list)
    assessment_ids: list[str] = Field(default_factory=list)


class CourseGoal(BaseModel):
    """Program goal referencing CLOs by ID."""
    id: str
    name: str
    clo_ids: list[str] = Field(default_factory=list)


class CourseCompetency(BaseModel):
    """Competency referencing CLOs and topics by ID."""
    id: str
    name: str
    clo_ids: list[str] = Field(default_factory=list)
    topic_ids: list[str] = Field(default_factory=list)


class Course(BaseModel):
    """Course as output by WF2/3. Flat structure with ID-based cross-references."""
    model_config = ConfigDict(extra='ignore')

    course_id: str
    course_name: str
    course_code: str
    description: Optional[str] = None
    syllabus: Optional[str] = None
    clos: list[CourseLearningOutcome] = Field(default_factory=list)
    cts: list[CourseTopic] = Field(default_factory=list)
    assessments: list[CourseAssessment] = Field(default_factory=list)
    goals: list[CourseGoal] = Field(default_factory=list)
    competencies: list[CourseCompetency] = Field(default_factory=list)


# =============================================================================
# Workflow 4: Intermediate Mapping (1 course x 1 standard)
# =============================================================================


class MappedIO(BaseModel):
    id: str
    text: str
    relevance_reason: str


class MappedGoal(BaseModel):
    id: str
    text: str
    relevance_reason: str


class MappedCompetency(BaseModel):
    id: str
    text: str
    relevance_reason: str


class MappedAssessment(BaseModel):
    id: str
    name: str
    type: str
    relevance_reason: str


class MappedTopic(BaseModel):
    topic_id: str
    topic_name: str
    relevance_summary: str
    ios: list[MappedIO] = Field(default_factory=list)
    goals: list[MappedGoal] = Field(default_factory=list)
    competencies: list[MappedCompetency] = Field(default_factory=list)
    assessments: list[MappedAssessment] = Field(default_factory=list)


class MappedCLO(BaseModel):
    """A CLO mapped to the standard, with its relevant topics nested beneath."""
    id: str
    text: str
    relevance_reason: str
    mapped_topics: list[MappedTopic] = Field(default_factory=list)


class MappedArtifact(BaseModel):
    """A source artifact/file that supports the mapping to this standard."""
    id: str
    file_name: str
    artifact_type: str
    relevance_reason: str = Field(..., description="Why this artifact supports compliance with the standard")


class IntermediateMapping(BaseModel):
    """Workflow 4 output: mapping between ONE course and ONE standard.

    Structure: course → CLOs → topics → IOs/goals/comps/assessments
               course → artifacts (source documents supporting the mapping)
    """

    course_id: str
    course_name: str
    course_code: str
    overall_relevance_score: float = Field(..., ge=0.0, le=1.0)
    mapping_rationale: str
    clos: list[MappedCLO] = Field(default_factory=list)
    artifacts: list[MappedArtifact] = Field(default_factory=list)


# =============================================================================
# Workflow 5: Final LinkedStandard Output
# =============================================================================


class StandardMetadata(BaseModel):
    id: str
    section: str
    standard_desc: str
    arc_pa_version: Optional[str] = None
    effective_date: Optional[str] = None
    standard_evidence_summary: Optional[str] = None


class StandardReviewData(BaseModel):
    machine_review_status: str = "pending"
    machine_readiness_status: str = "pending"
    human_review_status: str = "needs_review"
    human_readiness_status: Optional[str] = None
    reviewer: Optional[str] = None
    review_date: Optional[str] = None
    review_notes: Optional[str] = None


class LinkedCourseIO(BaseModel):
    id: str
    text: str
    relevance_reason: str
    is_manual: bool = False


class LinkedCourseGoal(BaseModel):
    id: str
    text: str
    relevance_reason: str
    is_manual: bool = False


class LinkedCourseCompetency(BaseModel):
    id: str
    text: str
    relevance_reason: str
    is_manual: bool = False


class LinkedCourseAssessment(BaseModel):
    id: str
    name: str
    type: str
    relevance_reason: str
    is_manual: bool = False


class LinkedCourseTopicMetadata(BaseModel):
    id: str
    name: str
    relevance_summary: str
    is_manual: bool = False


class LinkedCourseTopic(BaseModel):
    topic_metadata: LinkedCourseTopicMetadata
    ios: list[LinkedCourseIO] = Field(default_factory=list)
    goals: list[LinkedCourseGoal] = Field(default_factory=list)
    comps: list[LinkedCourseCompetency] = Field(default_factory=list)
    assessments: list[LinkedCourseAssessment] = Field(default_factory=list)
    comments: list[dict] = Field(default_factory=list)


class LinkedCourseCLO(BaseModel):
    clo_id: str
    clo_text: str
    is_manual: bool = False
    topics: list[LinkedCourseTopic] = Field(default_factory=list)
    comments: list[dict] = Field(default_factory=list)


class LinkedCourse(BaseModel):
    course_id: str
    course_name: str
    course_code: str
    is_manual: bool = False
    map_reason: str
    clos: list[LinkedCourseCLO] = Field(default_factory=list)
    comments: list[dict] = Field(default_factory=list)


class EvidenceItemMetadata(BaseModel):
    id: str
    text: str
    support_summary: str


class EvidenceItemReviewData(BaseModel):
    review_status: str = "pending"
    reviewer: Optional[str] = None
    review_date: Optional[str] = None
    review_notes: Optional[str] = None


class LinkedArtifact(BaseModel):
    artifact_id: str
    name: str
    type: str
    reason: Optional[str] = None


class SlimLinkedCourse(BaseModel):
    """Slim per-EE course reference. Full CLO/topic/IO data lives in LinkedStandard.course_details."""
    course_id: str
    course_code: str
    course_name: str
    map_reason: str
    is_manual: bool = False
    comments: list[dict] = Field(default_factory=list)


class EssentialEvidenceLinked(BaseModel):
    evidence_metadata: EvidenceItemMetadata
    evidence_review_data: EvidenceItemReviewData = Field(
        default_factory=EvidenceItemReviewData
    )
    linked_courses: list[SlimLinkedCourse] = Field(default_factory=list)
    linked_artifacts: list[LinkedArtifact] = Field(default_factory=list)
    comments: list[dict] = Field(default_factory=list)


# =============================================================================
# Course evidence map — pre-computed by WF5 for cheap reads on course detail page
# =============================================================================


class CourseEvidenceTopic(BaseModel):
    topic_id: str
    topic_name: str


class CourseEvidenceCLO(BaseModel):
    clo_id: str
    clo_text: str
    topics: list[CourseEvidenceTopic] = Field(default_factory=list)


class CourseEvidenceItem(BaseModel):
    ee_id: str
    ee_text: str
    map_reason: str
    clos: list[CourseEvidenceCLO] = Field(default_factory=list)


class CourseEvidenceEntry(BaseModel):
    """One course's contribution to a standard, keyed by course_code."""
    course_code: str
    course_name: str
    evidence_items: list[CourseEvidenceItem] = Field(default_factory=list)


class LinkedStandard(BaseModel):
    """Final output of Workflow 5, written to LinkedStandardsTable."""

    standard_metadata: StandardMetadata
    standard_review_data: StandardReviewData = Field(
        default_factory=StandardReviewData
    )
    essential_evidences: list[EssentialEvidenceLinked] = Field(default_factory=list)
    # Flat list of course codes for cheap reverse lookup without scanning essential_evidences
    course_codes: list[str] = Field(default_factory=list)
    # Per-course evidence linkage — pre-computed for cheap reads on the course detail page
    course_evidence_map: list[CourseEvidenceEntry] = Field(default_factory=list)
    # Deduplicated full CLO/topic/IO data per course — keyed by course_id.
    # linked_courses within each EssentialEvidenceLinked are slim refs; full detail lives here.
    course_details: dict[str, LinkedCourse] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
