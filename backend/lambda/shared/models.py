"""Pydantic models for evidence collection."""

import uuid
from uuid import uuid4, UUID
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

import re
_REF = re.compile(r"^(?P<dom>[A-C])(?P<sec>\d+)\.(?P<sub>\d+)(?P<sl>[a-z]|\([a-z]\))?$")

NodeStatus = Literal["active", "inactive", "deprecated"]
Edition = Literal["5th", "6th"]

def _now() -> datetime:
    return datetime.now(timezone.utc)


class EvidenceStatus(str, Enum):
    """Status of evidence for a specific item."""

    FOUND = "found"  # Evidence directly addresses this item
    PARTIAL = "partial"  # Evidence partially addresses this item
    NOT_FOUND = "not_found"  # No evidence found for this item
    ON_SITE = "on_site"  # Requires on-site verification during ARC-PA visit


class ProcessingStatus(str, Enum):
    """Status of standard processing."""

    UNPROCESSED = "unprocessed"  # Initial state, not yet analyzed
    ANALYZING = "analyzing"  # Currently running AI analysis
    ANALYSIS_COMPLETE = "analysis_complete"  # Analysis finished successfully
    REEVALUATING = "reevaluating"  # Re-running analysis after changes
    ERROR = "error"  # Analysis failed

    # Legacy aliases for backwards compatibility
    QUEUED = "unprocessed"  # Alias
    PROCESSING = "analyzing"  # Alias
    PROCESSED = "analysis_complete"  # Alias


class HumanReviewStatus(str, Enum):
    """Status of human review verification."""

    NEEDS_REVIEW = "needs_review"  # Initial state after AI analysis
    REVIEW_IN_PROGRESS = "review_in_progress"  # Human reviewer is actively reviewing
    HUMAN_VERIFIED = "human_verified"  # Human reviewer verified - standard is ready
    NEEDS_REVISION = "needs_revision"  # Human reviewer rejected - requires changes


class EvidenceExcerpt(BaseModel):
    """A specific excerpt from a document that serves as evidence."""

    document_name: str = Field(..., description="Original PDF filename")
    page_numbers: list[int] = Field(
        default_factory=list, description="Page numbers where excerpt was found"
    )
    excerpt: str = Field(..., description="The relevant text excerpt")
    explanation: str = Field(
        ..., description="How this excerpt addresses the evidence requirement"
    )
    score: float | None = Field(
        None, description="Relevance score from KB retrieval (0-1)"
    )
    is_manual: bool = Field(
        False, description="Whether this excerpt was manually added by a user"
    )


class AttachedFile(BaseModel):
    """A file manually attached by a user as evidence."""

    name: str = Field(..., description="Filename")
    size: str = Field(..., description="Human-readable file size (e.g., '1.2 MB')")
    added_by: str = Field(..., description="Name of user who added the file")
    added_at: str = Field(..., description="When the file was added")


class Comment(BaseModel):
    """A comment on an evidence item."""

    comment_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()), description="Unique comment ID"
    )
    author: str = Field(..., description="Comment author's name")
    initials: str = Field(..., description="Author's initials for avatar display")
    time: str = Field(..., description="ISO timestamp")
    text: str = Field(..., description="Comment text")


class OnSiteInfo(BaseModel):
    """Information for items requiring on-site verification."""

    description: str = Field(
        ..., description="Explanation of why on-site verification is required"
    )
    preparation_tips: list[str] = Field(
        default_factory=list, description="Tips to prepare for the site visit"
    )


class EssentialEvidenceItem(BaseModel):
    """Evidence status for a single essential evidence bullet point."""

    id: int = Field(0, description="Numeric ID for frontend display")
    item_text: str = Field(..., description="The essential evidence requirement text")
    status: EvidenceStatus = Field(
        ..., description="Whether evidence was found for this item"
    )
    evidence: list[EvidenceExcerpt] = Field(
        default_factory=list, description="Excerpts that address this item"
    )
    gap_analysis: Optional[str] = Field(
        None, description="If not found/partial, what's missing"
    )
    # Manual resolution fields
    is_resolved: bool = Field(False, description="Whether manually marked as resolved")
    resolved_by: Optional[str] = Field(
        None, description="Name of user who resolved this item"
    )
    resolved_at: Optional[str] = Field(None, description="When the item was resolved")
    resolved_note: Optional[str] = Field(
        None, description="Note explaining the resolution"
    )
    # User-added content
    attached_files: list[AttachedFile] = Field(
        default_factory=list, description="Files manually uploaded as evidence"
    )
    comments: list[Comment] = Field(
        default_factory=list, description="Discussion comments on this item"
    )
    # Actionable suggestions
    suggestions: list[str] = Field(
        default_factory=list, description="Suggested actions for incomplete evidence"
    )
    # On-site verification info
    on_site_info: Optional[OnSiteInfo] = Field(
        None, description="Info for items requiring on-site verification"
    )


class FocusedQuestionItem(BaseModel):
    """Evidence status for a single focused question."""

    question: str = Field(..., description="The focused question text")
    status: EvidenceStatus = Field(
        ..., description="Whether the question can be answered from evidence"
    )
    answer_evidence: list[EvidenceExcerpt] = Field(
        default_factory=list, description="Excerpts that help answer this question"
    )
    suggested_answer: Optional[str] = Field(
        None, description="Suggested answer based on evidence found"
    )
    comments: list[Comment] = Field(
        default_factory=list, description="Discussion comments on this question"
    )
    # Manual resolution fields
    is_resolved: bool = Field(False, description="Whether manually marked as resolved")
    resolved_by: Optional[str] = Field(
        None, description="Name of user who resolved this item"
    )
    resolved_at: Optional[str] = Field(None, description="When the item was resolved")
    resolved_note: Optional[str] = Field(
        None, description="Note explaining the resolution"
    )


class RequirementEvidence(BaseModel):
    """Complete evidence assessment for a single requirement."""

    requirement_id: str = Field(..., description="Requirement ID (e.g., 'B3.01b')")
    requirement_text: str = Field(..., description="Full text of the requirement")
    sub_requirement_text: Optional[str] = Field(
        None, description="Text of the specific sub-requirement if applicable"
    )

    # Compliance guidance evidence mapping
    essential_evidence: list[EssentialEvidenceItem] = Field(
        default_factory=list,
        description="Evidence status for each essential evidence bullet",
    )
    focused_questions: list[FocusedQuestionItem] = Field(
        default_factory=list,
        description="Evidence status for each focused question",
    )
    compliance_notes: list[str] = Field(
        default_factory=list,
        description="Additional compliance notes from the guidance",
    )

    # Summary metrics
    essential_evidence_found: int = Field(
        0, description="Count of essential evidence items with FOUND status"
    )
    essential_evidence_total: int = Field(
        0, description="Total essential evidence items"
    )
    questions_answerable: int = Field(
        0, description="Count of focused questions that can be answered"
    )
    questions_total: int = Field(0, description="Total focused questions")

    overall_readiness: str = Field(
        "not_ready",
        description="Overall readiness: ready, mostly_ready, needs_work, not_ready",
    )
    summary: str = Field("", description="Summary of evidence gaps and recommendations")
    # Manual resolution at requirement level
    is_resolved: bool = Field(
        False, description="Whether the entire requirement is marked resolved"
    )
    # Human review fields
    human_review_status: str = Field(
        "needs_review",
        description="Human review status: needs_review, review_in_progress, human_verified, needs_revision",
    )
    human_readiness_assessment: Optional[str] = Field(
        None, description="Human reviewer's readiness assessment: ready, mostly_ready, needs_work, not_ready"
    )
    human_reviewed_by: Optional[str] = Field(
        None, description="Email of user who performed human review"
    )
    human_reviewed_at: Optional[str] = Field(
        None, description="ISO timestamp of when human review was completed"
    )
    human_review_note: Optional[str] = Field(
        None, description="Note from human reviewer explaining their decision"
    )
    # Standard-level comments
    comments: list[Comment] = Field(
        default_factory=list, description="Discussion comments on this requirement"
    )

    def compute_metrics(self) -> None:
        """Calculate summary metrics from evidence items."""
        self.essential_evidence_total = len(self.essential_evidence)
        # Count both FOUND and ON_SITE as "ready" - on_site items are verified during visit
        self.essential_evidence_found = sum(
            1
            for item in self.essential_evidence
            if item.status in (EvidenceStatus.FOUND, EvidenceStatus.ON_SITE)
        )

        self.questions_total = len(self.focused_questions)
        self.questions_answerable = sum(
            1 for q in self.focused_questions if q.status == EvidenceStatus.FOUND
        )

        # Calculate overall readiness
        if self.essential_evidence_total == 0:
            self.overall_readiness = "no_guidance"
        else:
            ratio = self.essential_evidence_found / self.essential_evidence_total
            if ratio == 1.0:
                self.overall_readiness = "ready"
            elif ratio >= 0.75:
                self.overall_readiness = "mostly_ready"
            elif ratio >= 0.5:
                self.overall_readiness = "needs_work"
            else:
                self.overall_readiness = "not_ready"


class EvidenceReport(BaseModel):
    """Complete evidence collection report."""

    timestamp: str = Field(
        default_factory=lambda: datetime.now().isoformat(),
        description="When the report was generated",
    )
    standards_file: str = Field(..., description="Path to standards JSON used")
    documents_searched: list[str] = Field(
        default_factory=list, description="List of documents that were searched"
    )
    requirements_evaluated: int = Field(
        ..., description="Number of requirements evaluated"
    )
    evidence: list[RequirementEvidence] = Field(
        default_factory=list, description="Evidence for each requirement"
    )
    readiness_summary: dict[str, int] = Field(
        default_factory=dict,
        description="Count of requirements by readiness level",
    )

    def compute_readiness_summary(self) -> None:
        """Calculate readiness summary from evidence list."""
        self.readiness_summary = {
            "ready": 0,
            "mostly_ready": 0,
            "needs_work": 0,
            "not_ready": 0,
            "no_guidance": 0,
        }
        for req_evidence in self.evidence:
            self.readiness_summary[req_evidence.overall_readiness] += 1


# DynamoDB item models


class StandardItem(BaseModel):
    """DynamoDB item for a standard."""

    standard_id: str = Field(..., description="Primary key - standard ID")
    section_id: str = Field(..., description="Section ID for GSI2 queries")
    requirement_text: str = Field(..., description="Full requirement text")
    sub_requirement_text: Optional[str] = Field(
        None, description="Sub-requirement text if applicable"
    )
    status: ProcessingStatus = Field(
        ProcessingStatus.QUEUED, description="Processing status"
    )
    status_updated_at: str = Field(
        default_factory=lambda: datetime.now().isoformat(),
        description="When status was last updated",
    )
    error_message: Optional[str] = Field(
        None, description="Error message if status is error"
    )
    evidence_data: Optional[dict] = Field(
        None, description="Full RequirementEvidence as dict"
    )
    last_processed_at: Optional[str] = Field(
        None, description="When last successfully processed"
    )
    # GSI1 attributes
    gsi1_pk: str = Field("STATUS", description="GSI1 partition key")
    gsi1_sk: str = Field(..., description="GSI1 sort key: status#timestamp")

    # Original requirement data for reprocessing
    compliance_guidance: Optional[dict] = Field(
        None, description="Original compliance guidance from standards JSON"
    )
    sub_requirements: Optional[list[dict]] = Field(
        None, description="Original sub-requirements from standards JSON"
    )


WF5_TARGET_TYPES = {"linked_ee", "linked_course", "linked_clo", "linked_ct"}


class CommentItem(BaseModel):
    """DynamoDB item for comments table."""

    standard_id: str = Field(..., description="Standard this comment belongs to")
    comment_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()), description="Unique comment ID"
    )
    target_type: str = Field(
        ...,
        description=(
            "'standard', 'evidence', 'question' (WF1), "
            "or 'linked_ee', 'linked_course', 'linked_clo', 'linked_ct' (WF5)"
        ),
    )
    target_index: int = Field(
        -1, description="Index for evidence/question; -1 for all other types"
    )
    target_path: Optional[str] = Field(
        None,
        description=(
            "Path for WF5 comments, e.g. 'EE_001', 'EE_001/PA1001', "
            "'EE_001/PA1001/CL1', 'EE_001/PA1001/CL1/CT3'"
        ),
    )
    target_key: str = Field(
        "", description="Composite GSI key: '{target_type}#{target_index_or_path}'"
    )
    author: str = Field(..., description="Author email")
    initials: str = Field(..., description="Display initials")
    text: str = Field(..., description="Comment text")
    time: str = Field(
        default_factory=lambda: datetime.now().isoformat(),
        description="ISO timestamp",
    )

    def __init__(self, **data):
        # Auto-generate target_key if not provided
        if "target_key" not in data or not data.get("target_key"):
            target_type = data.get("target_type", "standard")
            if target_type in WF5_TARGET_TYPES:
                target_path = data.get("target_path", "")
                data["target_key"] = f"{target_type}#{target_path}"
            else:
                target_index = data.get("target_index", -1)
                data["target_key"] = f"{target_type}#{target_index}"
        super().__init__(**data)


ATTACHMENT_TARGET_TYPES = {"standard", "linked_ee"}


class AttachmentItem(BaseModel):
    """DynamoDB item for reviewer file attachments."""

    standard_id: str = Field(..., description="Standard this attachment belongs to")
    attachment_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()), description="Unique attachment ID"
    )
    target_type: str = Field(
        ..., description="'standard' or 'linked_ee'"
    )
    target_path: Optional[str] = Field(
        None, description="Evidence item ID for linked_ee attachments, e.g. 'B2.03-E1'"
    )
    file_name: str = Field(..., description="Original filename")
    file_size: int = Field(..., description="File size in bytes")
    s3_key: str = Field(..., description="S3 object key")
    content_type: str = Field("application/octet-stream", description="MIME type")
    uploader: str = Field(..., description="Uploader email from Cognito claims")
    uploaded_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO timestamp",
    )
    note: Optional[str] = Field(None, description="Optional reviewer note")
    is_linked: bool = Field(
        False,
        description=(
            "True when s3_key points to a shared file in the docs bucket "
            "(existing_s3_key path). S3 object must not be deleted on removal "
            "because other attachments or pipeline processes may reference it."
        ),
    )
    upload_confirmed: bool = Field(
        False,
        description=(
            "True once the client has confirmed the S3 PUT completed. "
            "Records with upload_confirmed=False are treated as pending and "
            "excluded from GET responses. They expire automatically via TTL."
        ),
    )
    ttl: Optional[int] = Field(
        None,
        description=(
            "Unix timestamp for DynamoDB TTL. Set to now+24h on new uploads "
            "so unconfirmed records auto-expire. Cleared on confirmation."
        ),
    )


CROSS_ORG_DOMAINS = {
    "Knowledge for Practice", "Interpersonal and Communication Skills",
    "Person-centered Care", "Interprofessional Collaboration",
    "Professional Ethics", "Practice-based Learning and Quality Improvement",
    "Society and Population Health",
}

class Competency(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str = Field(..., description="Name of the Competency")
    description: str = Field(..., description="Cross-Organization and/or PAEA core description")
    edition: Edition = "6th"
    status: NodeStatus = "active"
    created_at: datetime = Field(default_factory=_now)

    @model_validator(mode="after")
    def name_in_current_framework(self) -> "Competency":
        # The 2022 revision expanded the domains from six to seven.
        if self.edition == "6th" and self.name not in CROSS_ORG_DOMAINS:
            raise ValueError(f"'{self.name}' is not one of the seven 6th-edition domains.")
        return self

class Standard(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    ref: str = Field(..., description="Overall Standard (e.g. B2.07f)")
    edition: Edition = "6th"
    domain: str = Field(..., description="The overall letter (e.g. A, B, C)")      # the letter, e.g. "B"
    section: str = Field(..., description="The section of the given domain (e.g. B2)")      # e.g. "B2"
    subsection: str = Field(..., description="The subsection (e.g. 07(f))")   # e.g. "07" or "07(f)"
    full_text: str = Field(..., description="Full standard text")
    status: Literal["active", "rescinded"] = "active"
    created_at: datetime = Field(default_factory=_now)
    created_by: str = ""
    # Perhaps enumerate the above statuses if good into the literal class.
    approval_status: str = ""
    readiness_level: str = ""
    human_review_status: str = ""
    processing_status: str = ""


    @model_validator(mode="before")
    @classmethod
    def derive_parts(cls, v: dict) -> dict:
        m = _REF.match(v.get("ref", ""))
        if m:
            v.setdefault("domain", m.group("dom"))
            v.setdefault("section", f"{m.group('dom')}{m.group('sec')}")
            v.setdefault("subsection", m.group("sub") + (m.group("sl") or ""))
        return v

    @field_validator("ref")
    @classmethod
    def valid_ref(cls, v: str) -> str:
        if not _REF.match(v):
            raise ValueError(f"'{v}' is not a valid ARC-PA ref (e.g. 'B2.07' or 'B2.07(f)').")
        return v

class Goal(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    ref: str = Field(..., description="The internal label (e.g 1, G1, etc.)")
    label: str = Field(..., description="The main title (e.g Goal 1: Students will X, Y, Z)")
    description: str = Field(..., description="The full description / context associated with the goal")
    status: NodeStatus = "active"
    created_at: datetime = Field(default_factory=_now)

class PLO(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    ref: str = Field(..., description="The internal reference (e.g. 1, C1, PLO1, etc.)")
    description: str = Field(..., description="The full description of the program learning objective")
    status: NodeStatus = "active"
    created_at: datetime = Field(default_factory=_now)

class Course(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    ref: str = Field(..., description="Short ID (e.g. PAS-2401)")
    course_name: str = Field(..., description="Full course name")
    course_phase: Literal["didactic", "clinical", "mixed"]
    status: NodeStatus = "active"
    created_at: datetime = Field(default_factory=_now)

class CLO(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    ref: str
    text: str = Field(min_length=10)
    course_id: UUID
    status: NodeStatus = "active"
    created_at: datetime = Field(default_factory=_now)

_NON_VERB = {"the","a","an","students","learners","this","that","we","they"}

class ILO(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    ref: str | None = None
    text: str = Field(min_length=10)
    course_id: UUID
    # The below are kept for reference and in case needed, but OOS for current prototype
    #bloom_level: Literal["remember","understand","apply","analyze","evaluate","create"]
    #mastery_level: Literal["I","R","M"]
    status: NodeStatus = "active"
    created_at: datetime = Field(default_factory=_now)

    @field_validator("text")
    @classmethod
    def starts_with_verb(cls, v: str) -> str:
        if v.strip().split()[0].lower().rstrip(".,;:") in _NON_VERB:
            raise ValueError("ILO text should begin with an action verb.")
        return v

class Artifact(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    file_name: str = Field(..., description="The full file name of the uploaded file")
    file_type: str = Field(..., description="Syllabus, Exam, Presentation, etc.")           # Syllabus, Exam, Presentation, ...
    s3_uri: str | None = None
    status: NodeStatus = "active"
    created_at: datetime = Field(default_factory=_now)

class Evidence(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    ref: str = Field(..., description="Internal Reference (e.g. Exam 1 Question 1)")                # e.g. "E1Q1"
    text: str = Field(..., description="The full snippet (e.g. the full test question)")
    artifact_id: UUID
    evidence_type: str       # Question, assessment, ...
    status: NodeStatus = "active"
    created_at: datetime = Field(default_factory=_now)

RelationshipType = Literal[
    "sub_of",     # SubStandard → Standard
    "addresses",  # ILO / CLO   → Standard / SubStandard
    "rollup",     # ILO         → CLO
    "supports",   # CLO         → PLO
    "advances",   # PLO         → Goal
    "in_course",  # (grouping)  → Course
    "documents",  # Evidence / Artifact → ILO / CLO / Standard
]

class MappingEdge(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    from_id: UUID
    from_type: str
    to_id: UUID
    to_type: str
    relationship: RelationshipType
    confidence: Literal["confirmed", "inferred", "provisional"] = "provisional"
    asserted_by: str         # user ID or system actor, e.g. "system:csv-ingest"
    asserted_at: datetime = Field(default_factory=_now)
    notes: str | None = None # rationale, e.g. which ILO language triggered the citation

    @model_validator(mode="after")
    def no_self_edge(self) -> "MappingEdge":
        if self.from_id == self.to_id:
            raise ValueError("from_id and to_id must differ.")
        return self


# =============================================================================
# Syllabus output models
# =============================================================================


class ProgramGoalOutput(BaseModel):
    id: str = Field(..., description="Short identifier, e.g. 'G1'")
    name: str = Field(..., description="Full goal text")
    clo_ids: list[str] = Field(default_factory=list, description="CLO IDs this goal maps to in this course")
    reasoning: str = Field("", description="Why these CLOs were mapped to this goal")


class ProgramCompetencyOutput(BaseModel):
    id: str = Field(..., description="Short identifier, e.g. 'C1'")
    name: str = Field(..., description="Full competency text")
    clo_ids: list[str] = Field(default_factory=list, description="CLO IDs this competency maps to in this course")
    topic_ids: list[str] = Field(default_factory=list, description="CourseTopic IDs this competency maps to in this course")
    reasoning: str = Field("", description="Why these CLOs and topics were mapped to this competency")



class CLOOutput(BaseModel):
    id: str = Field(..., description="Short identifier, e.g. 'CL1'")
    name: str = Field(..., description="Full CLO text")
    topic_ids: list[str] = Field(default_factory=list, description="IDs of CourseTopic entries that map to this CLO")
    assessment_ids: list[str] = Field(default_factory=list, description="IDs of CourseAssessment entries linked to this CLO")
    reasoning: str = Field("", description="Why these topics and assessments were mapped to this CLO")


class CourseTopic(BaseModel):
    id: str = Field(..., description="Short identifier, e.g. 'CT1'")
    name: str = Field(..., description="Section or topic name")
    ios: list[str] = Field(
        default_factory=list,
        description=(
            "Copy ALL instructional objectives verbatim from the extracted topics block, "
            "preserving the exact order they appear. Do NOT summarise, truncate, reorder, "
            "or omit any items — every bullet or numbered item must be reproduced in full, "
            "exactly as provided, regardless of length or apparent redundancy."
        ),
    )
    assessment_ids: list[str] = Field(default_factory=list, description="IDs of CourseAssessment entries linked to this topic")
    reasoning: str = Field("", description="Why these IOs and assessments anchor this topic")


class CourseAssessment(BaseModel):
    id: str = Field(..., description="Short identifier, e.g. 'AS1' or 'EX1'")
    name: str = Field(..., description="Assessment name, e.g. 'Exam 1: Health Care Policy'")
    info: str = Field("", description="Additional details about the assessment")


class SyllabusOutput(BaseModel):
    syllabus: str = Field(..., description="Filename of the source syllabus PDF")
    clos: list[CLOOutput] = Field(default_factory=list, description="Course Learning Outcomes with their mapped topics and assessments")
    cts: list[CourseTopic] = Field(default_factory=list, description="Course topics with their instructional objectives")
    assessments: list[CourseAssessment] = Field(default_factory=list, description="Assessments referenced across the syllabus")
    goals: list[ProgramGoalOutput] = Field(default_factory=list, description="Program goals with CLO mappings for this course")
    competencies: list[ProgramCompetencyOutput] = Field(default_factory=list, description="Program competencies with CLO and topic mappings for this course")
    reasoning: str = Field("", description="Overall narrative summarising the course's key themes, which competencies and goals it primarily advances, and any notable mapping decisions")
