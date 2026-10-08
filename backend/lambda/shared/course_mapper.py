"""Core logic for Workflow 4: mapping a single course to a single standard.

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
from .course_models import Course, IntermediateMapping

logger = logging.getLogger(__name__)

LogCallback = Callable[[str], None]

MAPPER_SYSTEM_PROMPT = """You are an expert in PA (Physician Assistant) program accreditation standards (ARC-PA).

Your task: Given one ARC-PA standard (with its essential evidence items) and one course object
(with CLOs, topics, IOs, goals, competencies, and assessments), determine which elements of
the course are relevant to demonstrating compliance with the standard.

## Input Data Format:

The course data uses a FLAT/RELATIONAL structure with ID-based cross-references:
- CLOs reference topics via topic_ids and assessments via assessment_ids
- Topics contain IOs as plain text strings (not objects with IDs)
- Assessments are at course level, referenced by ID from CLOs and topics
- Goals reference CLOs via clo_ids
- Competencies reference CLOs via clo_ids and topics via topic_ids
- The syllabus is a filename string

## Output Structure (CRITICAL):

The output must follow this hierarchy:
  IntermediateMapping
    ├─ clos[]  (each CLO relevant to the standard)
    │    └─ mapped_topics[]  (topics that fall under THIS CLO and are relevant)
    │         ├─ ios[]  (each IO needs an id like "io_1", the text, and relevance_reason)
    │         ├─ goals[]
    │         ├─ competencies[]
    │         └─ assessments[]
    └─ artifacts[]  (source documents — use syllabus filename if present)

Each CLO contains its own mapped_topics. A topic should be nested under the CLO it references
(via topic_ids). If a topic is referenced by multiple relevant CLOs, include it under each.
For IOs (which are plain strings in the input), generate a sequential id (e.g. "io_1", "io_2")
and use the text string directly.

Artifacts are SOURCE DOCUMENTS that can be submitted as accreditation evidence:
- The syllabus (artifact_type="syllabus") documents what is taught
- Written assessments like exams, papers, and problem sets (artifact_type="assessment") document
  how students are evaluated — these are files that exist and prove active teaching of the content
- Do NOT include live/practical assessments (OSCEs, simulations) as artifacts unless they have a
  documented rubric — the artifact must be a submittable file

## Know When a Course Cannot Help

Some ARC-PA standards are not curriculum standards — they govern program administration, policies,
governance, faculty qualifications, facilities, or other non-curricular requirements. If the
standard is primarily administrative or structural in nature (e.g., requires written policies,
committee structures, affiliation agreements, or faculty credentials), no course can meaningfully
demonstrate compliance. Score these 0.0 and explain clearly in mapping_rationale.

Some essential evidence items CANNOT be confirmed from course materials alone — they require
on-site verification or direct interaction with people. These include items that explicitly call for:
- "On-site verification" of any kind
- "Discussions with students" or "discussions with faculty"
- "Observation of" instruction or clinical activities
- Direct faculty or student interviews

Do NOT attempt to map course elements to these items. They require manual review and should be
noted as such in your mapping_rationale so the aggregator can flag them appropriately.

## Instructions:

1. Read the standard description, its essential evidence items, AND its focused questions carefully.
   - Essential evidence items define WHAT must be demonstrated.
   - Focused questions indicate HOW reviewers will probe compliance.
   - Identify any items that require on-site verification or human interaction (see above).
2. Examine ALL elements of the course: CLOs, topics (and their IOs, goals, comps), and assessments.
3. Use the CLO → topic_ids relationship to determine which topics belong under which CLOs.
4. For each CLO that is relevant to the standard:
   a. Include it with a relevance_reason explaining HOW it supports compliance.
   b. Nest the relevant topics under that CLO in mapped_topics (only topics in that CLO's topic_ids).
   c. Within each topic, include the relevant IOs, goals, competencies, and assessments.
5. Assign an overall_relevance_score (0.0 to 1.0):
   - 0.0-0.2: No meaningful connection, OR standard is non-curricular / administrative
   - 0.3-0.5: Tangential relevance, only a few elements connect
   - 0.6-0.8: Moderate relevance, several elements directly address the standard
   - 0.9-1.0: Strong relevance, the course is a primary source of evidence for this standard

6. If the overall_relevance_score would be below 0.2, still return a valid IntermediateMapping
   but with an empty clos list and a mapping_rationale explaining why there is no connection
   (including whether the standard is non-curricular or requires on-site verification).

7. If you cannot identify any specific CLOs to include in the clos list, the overall_relevance_score
   MUST be below 0.2. A score of 0.2 or above with an empty clos list is a contradiction —
   relevance must be demonstrated through specific mappable CLOs, not asserted in the rationale alone.

## Quality Guidelines:
- Be specific in relevance_reason — cite what aspect of the standard the element addresses
- Keep every relevance_reason to 1-2 sentences maximum — precise, not exhaustive
- Keep mapping_rationale to 2-3 sentences maximum — summarize the overall connection or lack thereof
- Include ALL relevant IOs, not just the first match
- Assessments are strong evidence of active teaching; include them when they test relevant content
- A topic is relevant if ANY of its IOs or assessments connect to the standard
- Don't stretch — if the connection is speculative, don't include it
- ALWAYS nest topics under their parent CLO — never leave topics as orphans
- For artifacts, include the syllabus file if the course is relevant to the standard
"""


def create_mapper_model(settings: Settings | None = None) -> BedrockConverseModel:
    """Create a Bedrock model for course-standard mapping."""
    settings = settings or get_settings()
    provider = BedrockProvider(
        region_name=settings.aws_region,
        aws_read_timeout=settings.read_timeout,
        aws_connect_timeout=settings.connect_timeout,
    )
    return BedrockConverseModel(settings.mapper_model_id, provider=provider)


def format_standard_for_prompt(standard: dict) -> str:
    """Format standard data for the LLM prompt."""
    parts = [
        f"Standard ID: {standard.get('standard_id', 'unknown')}",
        f"Section: {standard.get('section_id', 'unknown')}",
        f"Requirement: {standard.get('requirement_text', 'N/A')}",
    ]

    sub_req = standard.get("sub_requirement_text")
    if sub_req:
        parts.append(f"Sub-requirement: {sub_req}")

    guidance = standard.get("compliance_guidance") or {}
    if guidance:
        ee = guidance.get("essential_evidence", [])
        if ee:
            parts.append("\nEssential Evidence Items:")
            for i, item in enumerate(ee, 1):
                parts.append(f"  {i}. {item}")

        fq = guidance.get("focused_questions", [])
        if fq:
            parts.append("\nFocused Questions:")
            for i, q in enumerate(fq, 1):
                parts.append(f"  {i}. {q}")

    return "\n".join(parts)


def format_course_for_prompt(course: Course) -> str:
    """Format course data (flat/relational WF2/3 format) for the LLM prompt.

    Resolves ID references so the LLM sees the full relationships inline.
    """
    parts = [
        f"Course: {course.course_name} ({course.course_code})",
        f"ID: {course.course_id}",
    ]

    if course.description:
        parts.append(f"Description: {course.description}")

    # Build lookup dicts for cross-referencing
    topics_by_id = {ct.id: ct for ct in course.cts}
    assessments_by_id = {a.id: a for a in course.assessments}

    if course.clos:
        parts.append("\nCourse Learning Outcomes (CLOs):")
        for clo in course.clos:
            parts.append(f"  - [{clo.id}] {clo.name}")
            if clo.topic_ids:
                topic_names = [topics_by_id[tid].name for tid in clo.topic_ids if tid in topics_by_id]
                if topic_names:
                    parts.append(f"    Topics: {', '.join(topic_names)}")
            if clo.assessment_ids:
                assess_names = [assessments_by_id[aid].name for aid in clo.assessment_ids if aid in assessments_by_id]
                if assess_names:
                    parts.append(f"    Assessments: {', '.join(assess_names)}")

    if course.cts:
        parts.append("\nCourse Topics:")
        for ct in course.cts:
            parts.append(f"\n  Topic: {ct.name} [{ct.id}]")
            if ct.ios:
                parts.append("    Instructional Objectives:")
                for io in ct.ios:
                    parts.append(f"      - {io}")
            if ct.assessment_ids:
                parts.append("    Assessments:")
                for aid in ct.assessment_ids:
                    a = assessments_by_id.get(aid)
                    if a:
                        info_str = f" — {a.info}" if a.info else ""
                        parts.append(f"      - [{a.id}] {a.name}{info_str}")

    if course.goals:
        parts.append("\nProgram Goals:")
        for g in course.goals:
            parts.append(f"  - [{g.id}] {g.name}")

    if course.competencies:
        parts.append("\nCompetencies:")
        for c in course.competencies:
            parts.append(f"  - [{c.id}] {c.name}")

    if course.assessments or course.syllabus:
        parts.append("\nLinkable Source Documents (artifacts that can be submitted as evidence):")
        if course.syllabus:
            parts.append(f"  - [syllabus] {course.syllabus} (type: syllabus)")
        for a in course.assessments:
            info_str = f" — {a.info}" if a.info else ""
            parts.append(f"  - [{a.id}] {a.name}{info_str} (type: assessment)")

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
async def _map_with_retry(agent: Agent, prompt: str) -> IntermediateMapping:
    result = await agent.run(prompt)
    return result.output


async def map_course_to_standard(
    standard: dict,
    course: Course,
    settings: Settings | None = None,
    log: LogCallback | None = None,
) -> IntermediateMapping | None:
    """
    Map a single course to a single standard via LLM.

    Returns an IntermediateMapping if the course has relevance (score >= 0.2),
    or None if no meaningful connection exists.
    """
    settings = settings or get_settings()

    def _log(msg: str) -> None:
        if log:
            log(msg)
        logger.info(msg)

    standard_id = standard.get("standard_id", "unknown")
    _log(f"Mapping {course.course_code} -> {standard_id}")

    model = create_mapper_model(settings)
    agent = Agent(
        model,
        output_type=IntermediateMapping,
        system_prompt=MAPPER_SYSTEM_PROMPT,
    )

    standard_text = format_standard_for_prompt(standard)
    course_text = format_course_for_prompt(course)

    prompt = f"""## STANDARD
{standard_text}

## COURSE
{course_text}

---

Analyze this course against the standard and return an IntermediateMapping.
For each relevant CLO, nest the relevant topics (with their IOs, goals, competencies, assessments)
under that CLO's mapped_topics field. The hierarchy is: clos[] → mapped_topics[] → ios/goals/comps/assessments.
For IOs (plain strings in the input), assign sequential ids (io_1, io_2, etc.) and use the string as the text field.

ARTIFACTS: Include all source documents that could be submitted as evidence of compliance.
- The syllabus (artifact_type="syllabus") — always include if the course is relevant.
- Assessments that are documented/written artifacts (exams, rubrics, problem sets, papers) should ALSO
  be included as artifacts (artifact_type="assessment") since they are physical files demonstrating
  that the program actively teaches and evaluates the standard's content. Use the assessment's id and name.
- Do NOT include practical/live assessments (OSCEs, simulations) as artifacts unless they have a written rubric.
"""

    mapping = await _map_with_retry(agent, prompt)

    total_topics = sum(len(clo.mapped_topics) for clo in mapping.clos)
    _log(
        f"Mapped {course.course_code} -> {standard_id}: "
        f"score={mapping.overall_relevance_score:.2f}, "
        f"{len(mapping.clos)} CLOs, {total_topics} topics"
    )
    return mapping
