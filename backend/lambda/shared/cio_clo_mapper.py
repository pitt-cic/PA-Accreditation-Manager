"""Extract and map CLOs and course topics from a syllabus PDF using a two-pass pipeline."""

import io
import logging
import time
from typing import Union

from botocore.exceptions import ClientError
from pydantic import BaseModel, Field
from pydantic_ai import Agent, BinaryContent
from pydantic_ai.models.bedrock import BedrockConverseModel, BedrockModelSettings
from pydantic_ai.providers.bedrock import BedrockProvider
from pypdf import PdfReader
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from .competencies_client import CompetenciesDBClient
from .config import Settings, get_settings
from .goals_client import GoalsDBClient
from .models import SyllabusOutput
from .s3_client import S3Client

logger = logging.getLogger(__name__)


# =============================================================================
# Pass 1 extraction schemas — minimal, no cross-references
# =============================================================================

class _ExtractedCLO(BaseModel):
    id: str = Field(..., description="Sequential ID, e.g. CL1. Must be unique.")
    name: str = Field(..., description="Full verbatim CLO text from the syllabus.")


class _ExtractedTopic(BaseModel):
    id: str = Field(..., description="Sequential ID, e.g. CT1. Must be unique.")
    name: str = Field(..., description="Section or topic name verbatim.")
    ios: list[str] = Field(
        default_factory=list,
        description=(
            "Each instructional objective verbatim — typically a bullet point, "
            "numbered item, or indented line under this topic's heading. "
            "Include every sub-item even if formatting is inconsistent. "
            "Do NOT omit items because their indentation or nesting is unclear."
        ),
    )


class _ExtractedAssessment(BaseModel):
    id: str = Field(..., description="Sequential ID, e.g. AS1 or EX1. Must be unique.")
    name: str = Field(..., description="Assessment name verbatim.")
    info: str = Field("", description="Any additional details.")


class _ExtractedInventory(BaseModel):
    syllabus: str = Field(..., description="Filename exactly as provided.")
    clos: list[_ExtractedCLO] = Field(default_factory=list)
    cts: list[_ExtractedTopic] = Field(default_factory=list)
    assessments: list[_ExtractedAssessment] = Field(default_factory=list)


# =============================================================================
# Prompts
# =============================================================================

MAPPING_PROMPT_TEMPLATE = """
You are an expert curriculum analyst for a Physician Assitant Program.

You will recieve a syllabus PDF, and your job is to extract its structure and generate a complete mapping in one pass.

Go through each Course Learning Outcome (CLO) and assign it an ID sequentially (CL1, CL2, CL3), and record the full text of each CLO
Go through each Course Instructional Objective topic and assign it and ID sequentially (CT1, CT2, CT3), and preserve each sections Instructional Objectives (IOs)
Link any relevant assessments to CLOs

Set the syllabus field the the filename of the attached PDF

Map each CLO to the course topic IDs whose IOs contribute to achieving that CLO

Cross-reference rule
- The values in each CLOs 'topic-ids' list MUST exactly match the 'id' strings you assigned to the course topics above. Do not put the topic name or anything other than the ID string.

Mapping Rules for CLO -> topic_ids
- A topic maps to a CLO when the topic's IOs directly contribute to achieving that CLO or cover whatever competency it measures.
- A single CLO may map to multiple topics, and a single topic may appear in multiple CLOs.

Program Goals (program-wide, IDs are fixed — do not change them):
{goals_block}

For each goal, populate its clo_ids with the IDs of CLOs from this syllabus that contribute to that goal. Only include a goal in the output if at least one CLO maps to it — omit goals with no relevant CLOs entirely.

Program Competencies (program-wide, IDs are fixed — do not change them):
{competencies_block}

For each competency, populate its clo_ids with the IDs of CLOs that address it, and topic_ids with the IDs of CourseTopics whose IOs directly contribute to it. Only include a competency in the output if at least one CLO or topic maps to it — omit competencies with no relevant mappings entirely.

Reasoning fields
Every CLO, CourseTopic, goal, competency, and the top-level SyllabusOutput object has a 'reasoning' field. Populate each with clear, specific rationale:
- CLO reasoning: cite the specific syllabus language (IOs, topic titles, assessment descriptions) that drove the topic and assessment linkages.
- CourseTopic reasoning: explain what content or IOs anchor this topic and why the section belongs as a distinct unit.
- Goal reasoning: identify which aspects of the mapped CLOs connect to the goal definition and why.
- Competency reasoning: explain how the mapped CLOs and/or topics satisfy the competency definition.
- SyllabusOutput reasoning: write a 2-3 sentence overall narrative summarising the course's key themes, which competencies and goals it primarily advances, and any notable mapping decisions made for the syllabus as a whole.

Output
- Return a JSON object that strictly conforms to the SyllabusOutput schema.
"""

_PASS1_SYSTEM = """
You are extracting raw content from a PA program course syllabus.
Your ONLY job is to copy content verbatim and assign sequential IDs.

1. Assign each CLO a sequential ID (CL1, CL2, …) and copy its full text.
2. Assign each topic/section a sequential ID (CT1, CT2, …) and copy each IO verbatim.
3. Assign each assessment a sequential ID (AS1/EX1, …) and copy its name and details.
   Omit grading policies — named assessments only.

Do NOT assign any cross-references, topic_ids, assessment_ids, or mappings.
Do NOT map to goals or competencies.
Output a JSON object conforming to _ExtractedInventory.
"""

_PASS1_USER_TEMPLATE = """The syllabus filename is: {filename}

=== SYLLABUS TEXT ===
{syllabus_text}

Extract verbatim and output as _ExtractedInventory.
"""

_PASS2_SYSTEM = """
You are an expert curriculum analyst for a Physician Assistant Program.

You will receive the extracted structure from a course syllabus (CLOs, topics with IOs,
and assessments), plus the program goals and competencies.

Your job is to produce a fully mapped SyllabusOutput in one pass:

1. For each CLO, populate topic_ids with CT-prefixed IDs of topics whose IOs contribute to it.
2. For each CLO, populate assessment_ids with AS-prefixed IDs of linked assessments.
   All IDs MUST exactly match the IDs provided in the extracted structure — do not create new ones.
3. For each program goal, populate clo_ids with CLO IDs that contribute to it.
   Only include goals with at least one mapping.
4. For each program competency, populate clo_ids and topic_ids that address it.
   Only include competencies with at least one mapping.
5. Populate all reasoning fields with specific rationale:
   - CLO reasoning: cite the specific IOs and topics that drove the topic_ids linkages.
   - CourseTopic reasoning: explain what IOs anchor this topic as a distinct unit.
   - Goal reasoning: explain which aspects of the mapped CLOs connect to this goal.
   - Competency reasoning: explain how the mapped CLOs and topics satisfy this competency.
   - SyllabusOutput reasoning: 2-3 sentence narrative of the course's key themes.

Output a JSON object conforming to SyllabusOutput.
"""

_PASS2_USER_TEMPLATE = """=== EXTRACTED CLOs ===
{clos_block}

=== EXTRACTED TOPICS ===
{topics_block}

=== EXTRACTED ASSESSMENTS ===
{assessments_block}

=== PROGRAM GOALS (IDs fixed — do not change them) ===
{goals_block}

=== PROGRAM COMPETENCIES (IDs fixed — do not change them) ===
{comps_block}

The syllabus filename is: {filename}

Map cross-references, goal/competency linkages, and populate all reasoning fields.
"""


# =============================================================================
# Helpers
# =============================================================================


def _is_throttle_error(exc: BaseException) -> bool:
    if isinstance(exc, ClientError):
        code = exc.response.get("Error", {}).get("Code", "")
        return code in ("ThrottlingException", "TooManyRequestsException", "ServiceUnavailableException")
    return False


def _make_retry(fn):
    return retry(
        retry=retry_if_exception(_is_throttle_error),
        wait=wait_exponential(multiplier=2, min=2, max=60),
        stop=stop_after_attempt(5),
        reraise=True,
    )(fn)


def _extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text(extraction_mode="layout") or ""
        if text.strip():
            pages.append(f"--- Page {i + 1} ---\n{text}")
    return "\n\n".join(pages)


def _inventory_to_text(inv: _ExtractedInventory) -> tuple[str, str, str]:
    clos_block = "\n".join(f"  {c.id}: {c.name}" for c in inv.clos)
    topics_block = "\n".join(
        f"  {t.id}: {t.name}" + "".join(f"\n    - {io}" for io in t.ios)
        for t in inv.cts
    )
    assessments_block = "\n".join(
        f"  {a.id}: {a.name}" + (f" — {a.info}" if a.info else "")
        for a in inv.assessments
    )
    return clos_block, topics_block, assessments_block


# =============================================================================
# Main entry points — split for independent Lambda invocation
# =============================================================================


async def map_syllabus_pass1(
    s3_key: str,
    syllabus_filename: str,
    settings: Settings | None = None,
) -> _ExtractedInventory:
    """Pass 1 — extract CLOs, topics, IOs, and assessments verbatim from PDF."""
    settings = settings or get_settings()
    pdf_bytes = S3Client(settings).get_file_bytes(s3_key)

    provider = BedrockProvider(
        region_name=settings.aws_region,
        aws_read_timeout=settings.read_timeout,
        aws_connect_timeout=settings.connect_timeout,
    )
    model = BedrockConverseModel(settings.syllabus_model_id, provider=provider)

    t1 = time.perf_counter()
    raw_text = _extract_text(pdf_bytes)
    agent1 = Agent(model, output_type=_ExtractedInventory, system_prompt=_PASS1_SYSTEM)
    user1 = _PASS1_USER_TEMPLATE.format(filename=syllabus_filename, syllabus_text=raw_text)

    @_make_retry
    async def _run():
        return await agent1.run(user1, model_settings=BedrockModelSettings(thinking=False, temperature=0))

    r1 = await _run()
    inventory: _ExtractedInventory = r1.output
    elapsed1 = time.perf_counter() - t1
    logger.info(
        "syllabus_mapper pass1 complete: file=%s clos=%d topics=%d assessments=%d elapsed=%.1fs",
        syllabus_filename, len(inventory.clos), len(inventory.cts), len(inventory.assessments), elapsed1,
    )
    return inventory


async def map_syllabus_pass2(
    inventory: _ExtractedInventory,
    settings: Settings | None = None,
) -> SyllabusOutput:
    """Pass 2 — cross-reference and reason over the extracted inventory."""
    settings = settings or get_settings()

    goals = GoalsDBClient(settings.goals_table).get_all_goals()
    competencies = CompetenciesDBClient(settings.competencies_table).get_all_competencies()

    if not goals:
        raise ValueError("GoalsTable is empty — upload program goals before running the syllabus mapper")
    if not competencies:
        raise ValueError("CompetenciesTable is empty — upload program competencies before running the syllabus mapper")

    goals_block = "\n".join(f"  {g.id}: {g.name}" for g in goals)
    comps_block = "\n".join(f"  {c.id}: {c.name}" for c in competencies)

    provider = BedrockProvider(
        region_name=settings.aws_region,
        aws_read_timeout=settings.read_timeout,
        aws_connect_timeout=settings.connect_timeout,
    )
    model = BedrockConverseModel(settings.syllabus_model_id, provider=provider)

    t2 = time.perf_counter()
    clos_block, topics_block, assessments_block = _inventory_to_text(inventory)
    agent2 = Agent(model, output_type=SyllabusOutput, system_prompt=_PASS2_SYSTEM)
    user2 = _PASS2_USER_TEMPLATE.format(
        clos_block=clos_block,
        topics_block=topics_block,
        assessments_block=assessments_block,
        goals_block=goals_block,
        comps_block=comps_block,
        filename=inventory.syllabus,
    )

    @_make_retry
    async def _run():
        return await agent2.run(user2, model_settings=BedrockModelSettings(thinking=False, temperature=1))

    r2 = await _run()
    elapsed2 = time.perf_counter() - t2
    logger.info(
        "syllabus_mapper pass2 complete: file=%s clos=%d topics=%d goals=%d competencies=%d elapsed=%.1fs",
        inventory.syllabus, len(r2.output.clos), len(r2.output.cts), len(r2.output.goals), len(r2.output.competencies), elapsed2,
    )
    return r2.output


async def map_syllabus(
    s3_key: str,
    syllabus_filename: str,
    settings: Settings | None = None,
) -> SyllabusOutput:
    """Full two-pass pipeline. Used by the direct API path (POST /syllabi/map)."""
    settings = settings or get_settings()
    inventory = await map_syllabus_pass1(s3_key, syllabus_filename, settings)
    return await map_syllabus_pass2(inventory, settings)
