"""Core logic for Workflow 5: aggregate course-standard mappings into a LinkedStandard.

This module is independent of Lambda/SQS/Step Functions and can be tested locally.
"""

import logging
from typing import Callable

from botocore.exceptions import (
    ClientError,
    ConnectTimeoutError,
    ReadTimeoutError,
)
from httpx import ConnectError, HTTPStatusError, TimeoutException
from pydantic import BaseModel, Field, ValidationError, field_validator
from pydantic_ai import Agent
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.models.bedrock import BedrockConverseModel
from pydantic_ai.providers.bedrock import BedrockProvider
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .config import Settings, get_settings
from .course_models import (
    CourseEvidenceCLO,
    CourseEvidenceEntry,
    CourseEvidenceItem,
    CourseEvidenceTopic,
    EssentialEvidenceLinked,
    EvidenceItemMetadata,
    EvidenceItemReviewData,
    IntermediateMapping,
    LinkedArtifact,
    LinkedCourse,
    LinkedCourseCLO,
    LinkedCourseAssessment,
    LinkedCourseCompetency,
    LinkedCourseGoal,
    LinkedCourseIO,
    LinkedCourseTopic,
    LinkedCourseTopicMetadata,
    LinkedStandard,
    SlimLinkedCourse,
    StandardMetadata,
    StandardReviewData,
)

logger = logging.getLogger(__name__)

LogCallback = Callable[[str], None]


# =============================================================================
# Pydantic model for LLM synthesis output
# =============================================================================


class EvidenceCourseLinkage(BaseModel):
    """How a single course maps to a single essential evidence item."""
    course_id: str
    course_name: str
    course_code: str
    map_reason: str = Field(..., description="Why this course supports this evidence item")


class SynthesizedEvidence(BaseModel):
    """LLM synthesis of one essential evidence item across all courses."""
    evidence_id: str = Field(..., description="Generated ID like B2.01-E1")

    @field_validator("evidence_id")
    @classmethod
    def evidence_id_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("evidence_id must be a non-empty string")
        return v.strip()
    evidence_text: str = Field(
        ...,
        description=(
            "MUST be copied VERBATIM from the numbered essential evidence list provided. "
            "Do NOT paraphrase, split, or rewrite this text."
        ),
    )
    support_summary: str = Field(..., description="ONE sentence (25 words max) summarising course support for this item. No lists, no markdown.")
    on_site_only: bool = Field(
        False,
        description=(
            "Set True when this item CANNOT be confirmed from course materials alone — "
            "e.g. 'on-site verification', 'discussions with students/faculty', "
            "or direct observation. These require manual review."
        ),
    )
    linked_courses: list[EvidenceCourseLinkage] = Field(default_factory=list)


class AggregationResult(BaseModel):
    """Complete LLM synthesis output."""
    standard_evidence_summary: str = Field(
        ..., description="Overall summary of how the standard is supported"
    )
    machine_readiness_status: str = Field(
        ...,
        description=(
            "ready | mostly_ready | needs_work | not_ready | not_applicable. "
            "Use not_applicable when the standard is non-curricular (administrative, "
            "policy, governance, faculty credentials) and no course can demonstrate compliance."
        ),
    )
    essential_evidences: list[SynthesizedEvidence] = Field(default_factory=list)


AGGREGATOR_SYSTEM_PROMPT = """You are an expert ARC-PA accreditation analyst synthesizing course-to-standard mappings.

You receive:
1. A standard with its essential evidence items (numbered list)
2. Multiple course-standard mappings (each showing which course elements are relevant to the standard)

Your task: Synthesize these mappings into a unified view with ONE output entry PER essential evidence item.

## CRITICAL — Evidence Item Integrity

You MUST produce exactly one SynthesizedEvidence entry for each numbered essential evidence item.
- Copy the evidence_text VERBATIM from the numbered list. Do not paraphrase, split, summarise,
  or combine items. If an item lists multiple domains (e.g. "A, B, and C"), treat that as ONE item
  covering all three — do not create separate entries for A, B, and C.
- The count of essential_evidences in your output MUST equal the count of numbered items given.

## On-Site and Human-Interaction Items

Some essential evidence items CANNOT be confirmed from course materials alone. Set on_site_only=True
for any item that explicitly requires:
- "On-site verification" of any kind
- "Discussions with students" or "discussions with faculty"
- "Observation of" instruction or activities
- Direct interviews or site visits

For on_site_only items: set linked_courses=[] and write a support_summary explaining that this item
requires manual review or site-visit verification — it is NOT a gap in the curriculum.

## Non-Curricular Standards

Some standards govern program administration, governance, policies, faculty qualifications,
facilities, or committee structures — not curriculum content. If the standard falls into this
category and no course can meaningfully demonstrate compliance, set machine_readiness_status
to "not_applicable" and explain this in the standard_evidence_summary.

## Instructions

For each numbered essential evidence item:
1. Copy its text verbatim into evidence_text.
2. Identify which courses (from the mappings) contain relevant elements for that item.
3. Write a support_summary — ONE sentence only (25 words maximum). Name the strongest course and what it provides. No lists.
4. List linked_courses with a map_reason for each.
5. Set on_site_only=True if the item requires human interaction or site visit.

## Readiness Assessment

Exclude on_site_only items from the readiness calculation (they cannot be rated from materials).
For the remaining items, classify each:
- **strong**: At least one course provides direct, specific evidence (CLOs, IOs, or assessments)
- **partial**: Courses touch on the topic but lack direct evidence
- **unsupported**: No course meaningfully addresses this item

Then set machine_readiness_status:
- **ready**: 100% of gradable items have strong support
- **mostly_ready**: ≥75% strong, remainder at least partial, none unsupported
- **needs_work**: ≥50% strong or partial, but some unsupported
- **not_ready**: <50% have strong or partial support
- **not_applicable**: Standard is non-curricular — course evidence is not relevant

## Quality Guidelines
- Be specific — reference course names and actual content
- A course should only appear under an item if its mapped elements address that specific item
- Don't inflate readiness — if coverage is thin, say so
- The standard_evidence_summary should be 1-2 sentences maximum — scannable in 5 seconds
- Write all text fields in plain prose only. Do not use markdown — no asterisks, no bullet points, no headers, no backticks. The output is rendered as plain text, not markdown.
"""


def create_aggregator_model(settings: Settings | None = None) -> BedrockConverseModel:
    """Create a Bedrock model for aggregation synthesis."""
    settings = settings or get_settings()
    provider = BedrockProvider(
        region_name=settings.aws_region,
        aws_read_timeout=settings.read_timeout,
        aws_connect_timeout=settings.connect_timeout,
    )
    return BedrockConverseModel(settings.aggregator_model_id, provider=provider)


def format_mappings_for_prompt(mappings: list[IntermediateMapping]) -> str:
    """Format intermediate mappings for the aggregator prompt."""
    parts = []
    for m in mappings:
        parts.append(f"\n### {m.course_name} ({m.course_code}) — Score: {m.overall_relevance_score:.2f}")
        parts.append(f"Rationale: {m.mapping_rationale}")

        if m.clos:
            parts.append("  CLOs:")
            for clo in m.clos:
                parts.append(f"    - [{clo.id}] {clo.text}")
                parts.append(f"      Reason: {clo.relevance_reason}")
                for topic in clo.mapped_topics:
                    parts.append(f"      Topic: {topic.topic_name} [{topic.topic_id}]")
                    parts.append(f"        Relevance: {topic.relevance_summary}")
                    for io in topic.ios:
                        parts.append(f"        IO [{io.id}]: {io.text} — {io.relevance_reason}")
                    for a in topic.assessments:
                        parts.append(f"        Assessment [{a.id}]: {a.name} ({a.type}) — {a.relevance_reason}")

    return "\n".join(parts)


@retry(
    retry=retry_if_exception_type((
        HTTPStatusError,
        ModelHTTPError,
        TimeoutException,
        ConnectError,
        ClientError,
        ReadTimeoutError,
        ConnectTimeoutError,
    )),
    wait=wait_exponential(multiplier=5, min=5, max=300),
    stop=stop_after_attempt(10),
    reraise=True,
)
async def _aggregate_with_retry(agent: Agent, prompt: str) -> AggregationResult:
    result = await agent.run(prompt)
    return result.output


def _build_linked_topic(topic) -> LinkedCourseTopic:
    """Convert a MappedTopic into a LinkedCourseTopic."""
    return LinkedCourseTopic(
        topic_metadata=LinkedCourseTopicMetadata(
            id=topic.topic_id,
            name=topic.topic_name,
            relevance_summary=topic.relevance_summary,
        ),
        ios=[
            LinkedCourseIO(id=io.id, text=io.text, relevance_reason=io.relevance_reason)
            for io in topic.ios
        ],
        goals=[
            LinkedCourseGoal(id=g.id, text=g.text, relevance_reason=g.relevance_reason)
            for g in topic.goals
        ],
        comps=[
            LinkedCourseCompetency(id=c.id, text=c.text, relevance_reason=c.relevance_reason)
            for c in topic.competencies
        ],
        assessments=[
            LinkedCourseAssessment(id=a.id, name=a.name, type=a.type, relevance_reason=a.relevance_reason)
            for a in topic.assessments
        ],
    )


def _build_linked_course(link: EvidenceCourseLinkage, source: IntermediateMapping) -> LinkedCourse:
    """Build a LinkedCourse preserving the CLO → Topics hierarchy from WF4."""
    clos = [
        LinkedCourseCLO(
            clo_id=clo.id,
            clo_text=clo.text,
            topics=[_build_linked_topic(topic) for topic in clo.mapped_topics],
        )
        for clo in source.clos
    ]

    return LinkedCourse(
        course_id=link.course_id,
        course_name=link.course_name,
        course_code=link.course_code,
        map_reason=link.map_reason,
        clos=clos,
    )


def _build_linked_standard(
    standard: dict,
    aggregation: AggregationResult,
    mappings: list[IntermediateMapping],
) -> LinkedStandard:
    """Convert the LLM aggregation result into the final LinkedStandard structure.

    Course CLO/topic/IO data is stored once in course_details (keyed by course_id),
    not duplicated inside every evidence item. Each EE item holds only a slim course
    reference (course_id, course_code, course_name, map_reason).
    """
    mappings_by_course: dict[str, IntermediateMapping] = {}
    for m in mappings:
        mappings_by_course[m.course_id] = m
        mappings_by_course[m.course_code] = m

    # Build deduplicated course_details: full CLO/topic/IO tree per course_id (stored once)
    course_details: dict[str, LinkedCourse] = {}
    for m in mappings:
        if m.course_id not in course_details:
            clos = [
                LinkedCourseCLO(
                    clo_id=clo.id,
                    clo_text=clo.text,
                    topics=[_build_linked_topic(topic) for topic in clo.mapped_topics],
                )
                for clo in m.clos
            ]
            course_details[m.course_id] = LinkedCourse(
                course_id=m.course_id,
                course_name=m.course_name,
                course_code=m.course_code,
                map_reason="",
                clos=clos,
            )

    essential_evidences = []
    for ev in aggregation.essential_evidences:
        slim_courses: list[SlimLinkedCourse] = []
        linked_artifacts = []
        seen_artifact_ids: set[str] = set()

        for link in ev.linked_courses:
            source_mapping = (
                mappings_by_course.get(link.course_id)
                or mappings_by_course.get(link.course_code)
            )
            slim_courses.append(SlimLinkedCourse(
                course_id=link.course_id,
                course_code=link.course_code,
                course_name=link.course_name,
                map_reason=link.map_reason,
            ))
            if source_mapping:
                for artifact in source_mapping.artifacts:
                    if artifact.id not in seen_artifact_ids:
                        seen_artifact_ids.add(artifact.id)
                        linked_artifacts.append(LinkedArtifact(
                            artifact_id=artifact.id,
                            name=artifact.file_name,
                            type=artifact.artifact_type,
                            reason=artifact.relevance_reason,
                        ))

        essential_evidences.append(EssentialEvidenceLinked(
            evidence_metadata=EvidenceItemMetadata(
                id=ev.evidence_id,
                text=ev.evidence_text,
                support_summary=ev.support_summary,
            ),
            evidence_review_data=EvidenceItemReviewData(
                review_status="on_site_only" if ev.on_site_only else "pending",
            ),
            linked_courses=slim_courses,
            linked_artifacts=linked_artifacts,
        ))

    # Build flat course_codes list and course_evidence_map in one pass
    seen_cc: set[str] = set()
    flat_course_codes: list[str] = []
    course_map: dict[str, CourseEvidenceEntry] = {}

    for ev in essential_evidences:
        ee_id = ev.evidence_metadata.id
        ee_text = ev.evidence_metadata.text
        for lc in ev.linked_courses:
            cc = lc.course_code
            if cc not in seen_cc:
                seen_cc.add(cc)
                flat_course_codes.append(cc)
                course_map[cc] = CourseEvidenceEntry(
                    course_code=cc,
                    course_name=lc.course_name,
                )
            # Store CLO and topic IDs only — fetch full IO text from CoursesTable in the UI
            full_course = course_details.get(lc.course_id)
            slim_clos = [
                CourseEvidenceCLO(
                    clo_id=clo.clo_id,
                    clo_text=clo.clo_text,
                    topics=[
                        CourseEvidenceTopic(
                            topic_id=topic.topic_metadata.id,
                            topic_name=topic.topic_metadata.name,
                        )
                        for topic in clo.topics
                    ],
                )
                for clo in (full_course.clos if full_course else [])
            ]
            course_map[cc].evidence_items.append(
                CourseEvidenceItem(
                    ee_id=ee_id,
                    ee_text=ee_text,
                    map_reason=lc.map_reason,
                    clos=slim_clos,
                )
            )

    return LinkedStandard(
        standard_metadata=StandardMetadata(
            id=standard.get("standard_id", ""),
            section=standard.get("section_id", ""),
            standard_desc=standard.get("requirement_text", ""),
            standard_evidence_summary=aggregation.standard_evidence_summary,
        ),
        standard_review_data=StandardReviewData(
            machine_review_status="complete",
            machine_readiness_status=aggregation.machine_readiness_status,
        ),
        essential_evidences=essential_evidences,
        course_codes=flat_course_codes,
        course_evidence_map=list(course_map.values()),
        course_details=course_details,
    )


async def aggregate_mappings(
    standard: dict,
    mappings: list[IntermediateMapping],
    settings: Settings | None = None,
    log: LogCallback | None = None,
) -> LinkedStandard:
    """
    Synthesize all intermediate mappings for a standard into a LinkedStandard.

    Args:
        standard: Standard dict with standard_id, requirement_text, compliance_guidance
        mappings: List of non-null IntermediateMapping objects from Workflow 4
        settings: Settings override
        log: Optional logging callback

    Returns:
        A complete LinkedStandard ready to write to DynamoDB
    """
    settings = settings or get_settings()

    def _log(msg: str) -> None:
        if log:
            log(msg)
        logger.info(msg)

    standard_id = standard.get("standard_id", "unknown")
    _log(f"Aggregating {len(mappings)} mappings for {standard_id}")

    model = create_aggregator_model(settings)
    agent = Agent(
        model,
        output_type=AggregationResult,
        system_prompt=AGGREGATOR_SYSTEM_PROMPT,
    )

    # Build prompt
    guidance = standard.get("compliance_guidance") or {}
    ee_items = guidance.get("essential_evidence", [])
    ee_text = "\n".join(f"  {i}. {item}" for i, item in enumerate(ee_items, 1))

    fq_items = guidance.get("focused_questions", [])
    fq_text = "\n".join(f"  {i}. {item}" for i, item in enumerate(fq_items, 1))

    mappings_text = format_mappings_for_prompt(mappings)

    prompt = f"""## STANDARD
ID: {standard_id}
Requirement: {standard.get('requirement_text', 'N/A')}

Essential Evidence Items:
{ee_text}

Focused Questions (reviewers will ask these — ensure your synthesis addresses them):
{fq_text}

## COURSE-STANDARD MAPPINGS ({len(mappings)} courses with relevant content)
{mappings_text}

---

Synthesize these mappings into a unified AggregationResult organized by essential evidence item.
For each evidence item, identify which courses support it and why.
Consider the focused questions when writing support summaries — if a question asks "how does the
program ensure X?", your summary should demonstrate how the mapped courses collectively answer that.
"""

    aggregation = await _aggregate_with_retry(agent, prompt)

    _log(
        f"Aggregation complete for {standard_id}: "
        f"readiness={aggregation.machine_readiness_status}, "
        f"{len(aggregation.essential_evidences)} evidence items"
    )

    linked_standard = _build_linked_standard(standard, aggregation, mappings)
    return linked_standard


class NoMappingSummary(BaseModel):
    """Plain-text summary when no courses were relevant."""
    standard_evidence_summary: str = Field(
        ...,
        description=(
            "A 2-4 sentence explanation of why no courses matched this standard, "
            "what the standard actually requires, and what types of evidence or "
            "courses would be needed to satisfy it."
        ),
    )


async def summarize_no_mappings(
    standard: dict,
    rejected_mappings: list[IntermediateMapping],
    settings: Settings | None = None,
    log: LogCallback | None = None,
) -> str:
    """
    Generate a human-readable explanation when no courses matched a standard.

    Uses the rejected mapping rationales (low-score courses) to explain what was
    looked for and why it wasn't found. Falls back to a deterministic description
    if the LLM call fails.

    Returns:
        A plain-text summary string for standard_evidence_summary.
    """
    settings = settings or get_settings()

    def _log(msg: str) -> None:
        if log:
            log(msg)
        logger.info(msg)

    standard_id = standard.get("standard_id", "unknown")
    requirement = standard.get("requirement_text", "")
    guidance = standard.get("compliance_guidance") or {}
    ee_items = guidance.get("essential_evidence", [])
    ee_text = "\n".join(f"  {i}. {item}" for i, item in enumerate(ee_items, 1)) if ee_items else "  (none)"

    if rejected_mappings:
        rationale_text = "\n".join(
            f"  - {m.course_code} ({m.course_name}): {m.mapping_rationale}"
            for m in rejected_mappings
        )
    else:
        rationale_text = "  No courses were available in the curriculum database."

    _log(f"Generating no-mapping summary for {standard_id}")

    model = create_aggregator_model(settings)
    agent = Agent(
        model,
        output_type=NoMappingSummary,
        system_prompt=(
            "You are an ARC-PA accreditation analyst. "
            "Write a concise, factual explanation of why no curriculum courses were "
            "found to be relevant to a given standard. Be specific about what the standard "
            "requires and what gaps exist. Do not inflate or speculate — if courses were "
            "reviewed and none matched, say so clearly and explain what would be needed. "
            "Use plain prose only — no markdown, no asterisks, no bullet points, no headers."
        ),
    )

    prompt = f"""## STANDARD
ID: {standard_id}
Requirement: {requirement}

Essential Evidence Items:
{ee_text}

## COURSES REVIEWED (all below relevance threshold)
{rationale_text}

---

Explain why none of the reviewed courses were relevant to this standard. Reference the specific
evidence items and what would be needed to satisfy them. 2-4 sentences maximum."""

    try:
        result = await agent.run(prompt)
        _log(f"No-mapping summary generated for {standard_id}")
        return result.output.standard_evidence_summary
    except Exception as e:
        _log(f"LLM summary failed for {standard_id}, using fallback: {e}")
        course_list = ", ".join(m.course_code for m in rejected_mappings) if rejected_mappings else "no courses"
        return (
            f"No curriculum courses were found to be relevant to this standard. "
            f"Courses reviewed: {course_list}. "
            f"This standard may require administrative documentation, policy evidence, "
            f"or course syllabi that have not yet been uploaded and processed."
        )
