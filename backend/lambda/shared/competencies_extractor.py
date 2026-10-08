"""Extract program competencies from a PDF document."""

import logging

from pydantic import BaseModel
from pydantic_ai import Agent, BinaryContent
from pydantic_ai.models.bedrock import BedrockConverseModel
from pydantic_ai.providers.bedrock import BedrockProvider

from .config import Settings, get_settings
from .s3_client import S3Client

logger = logging.getLogger(__name__)


class CompetencyItem(BaseModel):
    id: str
    name: str


class CompetenciesOutput(BaseModel):
    competencies: list[CompetencyItem]


EXTRACTION_PROMPT = """
You are extracting program competencies from a Physician Assistant program document.

For each program competency in the document:
- Identify its ID (e.g. C1, C2, C3, etc.)
- Extract the full competency text

Return all competencies found in the document. If no explicit IDs are present, assign them sequentially (C1, C2, ...).
"""


async def extract_competencies(s3_key: str, settings: Settings | None = None) -> CompetenciesOutput:
    settings = settings or get_settings()
    pdf_bytes = S3Client(settings).get_file_bytes(s3_key)

    provider = BedrockProvider(
        region_name=settings.aws_region,
        aws_read_timeout=settings.read_timeout,
        aws_connect_timeout=settings.connect_timeout,
    )
    model = BedrockConverseModel(settings.competencies_model_id, provider=provider)
    agent = Agent(model, output_type=CompetenciesOutput, system_prompt=EXTRACTION_PROMPT)

    result = await agent.run([
        BinaryContent(data=pdf_bytes, media_type='application/pdf'),
        "Extract all program competencies from this document as instructed.",
    ])
    return result.output
