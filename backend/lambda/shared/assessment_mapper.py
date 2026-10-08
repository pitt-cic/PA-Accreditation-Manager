"""Assessment mapper — reads an assessment file and maps it to course CLOs and topics."""

import json
import logging

from pydantic import BaseModel, Field
from pydantic_ai import Agent, BinaryContent

from .config import Settings, get_settings
from .doc_classifier import create_classifier_model

logger = logging.getLogger(__name__)

MAPPER_PROMPT = """You are a curriculum mapping assistant for a PA (Physician Assistant) program.

You will be given an assessment document (exam, quiz, assignment, etc.) and a list of the course's
CLOs (Course Learning Objectives) and topics (with their individual instructional objectives).

Your job is to identify which CLOs and topics are genuinely assessed by this document.
- Only include IDs where there is a clear, direct connection to the assessment content.
- Prefer precision over recall — do not include a CLO or topic just because it is vaguely related.
- Use the exact ID strings provided (e.g. "CL1", "CT3").

Return only the structured output — no extra commentary."""


class AssessmentEnrichment(BaseModel):
    name: str = Field(..., description="Assessment name as understood from the document")
    info: str = Field(..., description="Concise description of what the assessment covers and is worth")
    clo_ids: list[str] = Field(default_factory=list, description="CLO IDs directly addressed by this assessment")
    topic_ids: list[str] = Field(default_factory=list, description="Topic IDs directly addressed by this assessment")


async def map_assessment(
    filename: str,
    file_bytes: bytes,
    media_type: str,
    course_structure: dict,
    settings: Settings | None = None,
) -> AssessmentEnrichment:
    """Map an assessment file to the CLOs and topics it covers."""
    settings = settings or get_settings()
    model = create_classifier_model(settings)
    agent = Agent(model, output_type=AssessmentEnrichment, system_prompt=MAPPER_PROMPT)

    clos = [{"id": c["id"], "name": c["name"]} for c in course_structure.get("clos", [])]
    topics = [{"id": t["id"], "name": t["name"], "ios": t.get("ios", [])} for t in course_structure.get("cts", [])]

    course_context = json.dumps({"clos": clos, "topics": topics}, indent=None)

    result = await agent.run(
        [
            (
                f"Filename: {filename}\n\n"
                f"Course structure (CLOs and topics):\n{course_context}\n\n"
                "Map this assessment to the CLOs and topics it evaluates."
            ),
            BinaryContent(data=file_bytes, media_type=media_type),
        ]
    )
    logger.info("Mapped %s → %d CLOs, %d topics", filename, len(result.output.clo_ids), len(result.output.topic_ids))
    return result.output
