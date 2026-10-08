import json
import logging
import os
import time
import uuid
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")
s3_client = boto3.client("s3")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
}

AUDIT_YEAR_INDEX = os.environ.get("LINKED_STANDARDS_AUDIT_YEAR_INDEX", "gsi1-audit-year")

def _assemble_evidence(linked_table, standard_prefix: str, audit_year: str | None) -> list[dict]:
    """
    Return LinkedStandard items matching standard_prefix.

    Frozen mode: queries the GSI by audit_year then filters by prefix client-side
    (GSI has no range key, so full prefix filtering must happen after the query).
    Live mode: scans with a begins_with filter and excludes frozen copies.
    """
    items: list[dict] = []
    if audit_year:
        # Single-pass GSI query with field projection to reduce data transfer
        # Excludes heavy essential_evidences field from export evidence
        kwargs: dict = {
            "IndexName": AUDIT_YEAR_INDEX,
            "KeyConditionExpression": Key("audit_year").eq(audit_year),
            "ProjectionExpression": "standard_id, standard_review_data, course_codes, course_evidence_map, is_frozen, audit_year",
        }
        while True:
            response = linked_table.query(**kwargs)
            for item in response.get("Items", []):
                original_id = item.get("standard_id", "").rsplit("#", 1)[0]
                if original_id.startswith(standard_prefix):
                    items.append(item)
            last_key = response.get("LastEvaluatedKey")
            if not last_key:
                break
            kwargs["ExclusiveStartKey"] = last_key
    else:
        kwargs = {
            "FilterExpression": (
                Attr("standard_id").begins_with(standard_prefix)
                & Attr("audit_year").not_exists()
            ),
        }
        while True:
            response = linked_table.scan(**kwargs)
            items.extend(response.get("Items", []))
            last_key = response.get("LastEvaluatedKey")
            if not last_key:
                break
            kwargs["ExclusiveStartKey"] = last_key
    return items

def _handler(event, context):
    if "body" in event:
        body = json.loads(event["body"]) if isinstance(event["body"], str) else event["body"]
    else:
        body = event

    template_key = body.get("template_key")
    standard_prefix = body.get("standard_prefix")
    audit_year = body.get("audit_year") or None

    if not template_key or not standard_prefix:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "template_key and standard_prefix are required"}),
        }

    bucket = os.environ["S3_DOCUMENTS_BUCKET"]
    job_id = str(uuid.uuid4())

    # Assemble evidence from LinkedStandardsTable
    linked_table = dynamodb.Table(os.environ["LINKED_STANDARDS_TABLE"])
    evidence_items = _assemble_evidence(linked_table, standard_prefix, audit_year)

    logger.info(
        "Assembled %d linked standard items for prefix %s (audit_year=%r)",
        len(evidence_items), standard_prefix, audit_year,
    )

    if not evidence_items:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "No evidence data found for this standard. Please fill out evidence before exporting."}),
        }

    evidence_key = f"evidence/{job_id}.json"
    evidence_json = json.dumps(evidence_items, default=_json_default)
    s3_client.put_object(
        Bucket=bucket,
        Key=evidence_key,
        Body=evidence_json.encode("utf-8"),
        ContentType="application/json",
    )
    logger.info("Uploaded evidence to s3://%s/%s", bucket, evidence_key)

    ttl = int(time.time()) + 86400  # 24 hours
    job_item = {
        "job_id": job_id,
        "status": "pending",
        "bucket": bucket,
        "template_key": template_key,
        "evidence_key": evidence_key,
        "standard_prefix": standard_prefix,
        "output_key": "",
        "created_at": int(time.time()),
        "ttl": ttl,
    }
    if audit_year:
        job_item["audit_year"] = audit_year
    jobs_table = dynamodb.Table(os.environ["FILL_DOCUMENT_JOBS_TABLE"])
    jobs_table.put_item(Item=job_item)
    logger.info("Created job %s", job_id)

    output_key = _default_output_key(template_key, job_id)
    payload = {
        "job_id": job_id,
        "bucket": bucket,
        "template_key": template_key,
        "evidence_key": evidence_key,
        "output_key": output_key,
    }

    lambda_client.invoke(
        FunctionName=os.environ["FILL_DOCUMENT_FUNCTION_NAME"],
        InvocationType="Event",
        Payload=json.dumps(payload),
    )
    logger.info("Invoked fill_document async for job %s", job_id)

    return {
        "statusCode": 202,
        "headers": CORS_HEADERS,
        "body": json.dumps({"job_id": job_id}),
    }

def _default_output_key(template_key: str, job_id: str) -> str:
    filename = template_key.split("/")[-1].rsplit(".", 1)[0]
    return f"exports/{filename}_filled_{job_id}.xlsx"

def _json_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

handler = _handler
