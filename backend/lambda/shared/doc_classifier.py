"""Document classifier using Haiku to categorize S3 documents."""

import logging
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field
from pydantic_ai import Agent, BinaryContent
from pydantic_ai.models.bedrock import BedrockConverseModel
from pydantic_ai.providers.bedrock import BedrockProvider

from .config import Settings, get_settings

logger = logging.getLogger(__name__)

MEDIA_TYPES: dict[str, str] = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}

CLASSIFIER_PROMPT = """You are a document classifier for a PA (Physician Assistant) program accreditation system.

Classify the document into one of three types:
- "syllabus": A course syllabus. Identify the course code/ID from the filename or content (e.g. "PAS-2403") and set that as `course`. Use the same format as for assessments (e.g. "PAS-2403", not the full filename).
- "assessment": An exam, quiz, assignment, or rubric. Identify the course code/ID it belongs to from the filename or content (e.g. "PAS-2403") and set that as `course`. Use the format from the filename if present (e.g. "PAS2403_Exam1.pdf" → "PAS-2403").
- "other": Anything that is not a syllabus or assessment (e.g. policy docs, handbooks, misc forms). Set `course` to an empty string.

For `course_name`, extract the human-readable course title only — strip the course code prefix and any document-type suffix like "Syllabus", "Exam", "Quiz", etc. (e.g. "PAS 2404 Interpreting and Evaluating the Medical Literature Syllabus - finalized (1_8_23).pdf" → "Interpreting and Evaluating the Medical Literature"). Set to empty string for 'other' documents.

For `preview`, extract the first ~300 characters of readable text from the document body (skip headers/metadata if possible).

Return only the structured classification — no extra commentary."""


class _ClassifierOutput(BaseModel):
    filename: str = Field(..., description="The original filename")
    file_type: Literal["syllabus", "assessment", "other"] = Field(
        ..., description="Type of document"
    )
    course: str = Field(
        ...,
        description="The course code/ID (e.g. 'PAS-2403'). Empty string for 'other'.",
    )
    course_name: str = Field(
        ...,
        description="Human-readable course title, no code prefix or document-type suffix. Empty string for 'other'.",
    )
    preview: str = Field(..., description="First ~300 characters of readable content")


class DocumentClassification(BaseModel):
    id: str
    filename: str
    file_type: Literal["syllabus", "assessment", "other"]
    course: str
    course_name: str = ""
    preview: str


def get_media_type(filename: str) -> str:
    """Infer MIME type from file extension."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return MEDIA_TYPES.get(ext, "application/octet-stream")


def create_classifier_model(settings: Settings) -> BedrockConverseModel:
    provider = BedrockProvider(region_name=settings.aws_region)
    return BedrockConverseModel(settings.classifier_model_id, provider=provider)


async def classify_document(
    filename: str,
    file_bytes: bytes,
    media_type: str,
    settings: Settings | None = None,
) -> DocumentClassification:
    """Classify a document using its filename and raw bytes."""
    settings = settings or get_settings()
    model = create_classifier_model(settings)
    agent = Agent(model, output_type=_ClassifierOutput, system_prompt=CLASSIFIER_PROMPT)

    result = await agent.run(
        [
            f"Filename: {filename}\n\nClassify this document.",
            BinaryContent(data=file_bytes, media_type=media_type),
        ]
    )
    logger.info("Classified %s as %s", filename, result.output.file_type)
    return DocumentClassification(id=str(uuid4()), **result.output.model_dump())
