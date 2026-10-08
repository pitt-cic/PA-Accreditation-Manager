"""Configuration for Lambda functions using environment variables."""

import os
from dataclasses import dataclass


@dataclass
class Settings:
    """Application settings loaded from environment variables."""

    # AWS Configuration (Lambda uses execution role, no profile needed)
    aws_region: str

    # DynamoDB
    standards_table: str
    comments_table: str
    linked_standards_table: str
    attachments_table: str
    courses_table: str
    documents_table: str
    goals_table: str
    competencies_table: str

    # SQS
    processing_queue_url: str

    # S3 Configuration
    s3_documents_bucket: str

    # Model Configuration
    query_model_id: str
    mapper_model_id: str
    aggregator_model_id: str
    syllabus_model_id: str
    classifier_model_id: str
    goals_model_id: str
    competencies_model_id: str

    # Step Functions
    state_machine_arn: str

    # Timeout Configuration
    read_timeout: float
    connect_timeout: float


def get_settings() -> Settings:
    """Get settings from environment variables."""
    return Settings(
        aws_region=os.environ.get("AWS_REGION", "us-east-1"),
        standards_table=os.environ.get("STANDARDS_TABLE", ""),
        comments_table=os.environ.get("COMMENTS_TABLE", ""),
        linked_standards_table=os.environ.get("LINKED_STANDARDS_TABLE", ""),
        attachments_table=os.environ.get("ATTACHMENTS_TABLE", ""),
        courses_table=os.environ.get("COURSES_TABLE", ""),
        documents_table=os.environ.get("DOCUMENTS_TABLE", ""),
        goals_table=os.environ.get("GOALS_TABLE", ""),
        competencies_table=os.environ.get("COMPETENCIES_TABLE", ""),
        processing_queue_url=os.environ.get("PROCESSING_QUEUE_URL", ""),
        s3_documents_bucket=os.environ.get("S3_DOCUMENTS_BUCKET", ""),
        query_model_id=os.environ.get(
            "QUERY_MODEL_ID", "us.anthropic.claude-sonnet-4-6"
        ),
        mapper_model_id=os.environ.get(
            "MAPPER_MODEL_ID", "us.anthropic.claude-sonnet-4-6"
        ),
        aggregator_model_id=os.environ.get(
            "AGGREGATOR_MODEL_ID", "us.anthropic.claude-sonnet-4-6"
        ),
        syllabus_model_id=os.environ.get(
            "SYLLABUS_MODEL_ID", "us.anthropic.claude-sonnet-4-6"
        ),
        classifier_model_id=os.environ.get(
            "CLASSIFIER_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        ),
        goals_model_id=os.environ.get(
            "GOALS_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        ),
        competencies_model_id=os.environ.get(
            "COMPETENCIES_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        ),
        state_machine_arn=os.environ.get("STATE_MACHINE_ARN", ""),
        read_timeout=float(os.environ.get("READ_TIMEOUT", "300.0")),
        connect_timeout=float(os.environ.get("CONNECT_TIMEOUT", "30.0")),
    )
