"""Extract program goals from a PDF document."""

import logging

from pydantic import BaseModel
from pydantic_ai import Agent, BinaryContent
from pydantic_ai.models.bedrock import BedrockConverseModel
from pydantic_ai.providers.bedrock import BedrockProvider

from .config import Settings, get_settings
from .s3_client import S3Client

logger = logging.getLogger(__name__)


class GoalItem(BaseModel):
    id: str
    name: str


class GoalsOutput(BaseModel):
    goals: list[GoalItem]


EXTRACTION_PROMPT = """
You are extracting program goals from a Physician Assistant program document.

For each program goal in the document:
- Identify its ID (e.g. G1, G2, G3, etc.)
- Extract the full goal text

Return all goals found in the document. If no explicit IDs are present, assign them sequentially (G1, G2, ...).
"""


async def extract_goals(s3_key: str, settings: Settings | None = None) -> GoalsOutput:
    settings = settings or get_settings()
    pdf_bytes = S3Client(settings).get_file_bytes(s3_key)

    provider = BedrockProvider(
        region_name=settings.aws_region,
        aws_read_timeout=settings.read_timeout,
        aws_connect_timeout=settings.connect_timeout,
    )
    model = BedrockConverseModel(settings.goals_model_id, provider=provider)
    agent = Agent(model, output_type=GoalsOutput, system_prompt=EXTRACTION_PROMPT)

    result = await agent.run([
        BinaryContent(data=pdf_bytes, media_type='application/pdf'),
        "Extract all program goals from this document as instructed.",
    ])
    return result.output
