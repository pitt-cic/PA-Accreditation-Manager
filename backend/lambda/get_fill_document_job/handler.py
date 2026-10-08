import json
import logging
import os
from decimal import Decimal

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
s3_client = boto3.client("s3")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Content-Type": "application/json",
}

PRESIGNED_URL_EXPIRY = 3600  # 1 hour

def _handler(event, context):
    job_id = (event.get("pathParameters") or {}).get("job_id")
    if not job_id:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "job_id path parameter is required"}),
        }

    jobs_table = dynamodb.Table(os.environ["FILL_DOCUMENT_JOBS_TABLE"])
    result = jobs_table.get_item(Key={"job_id": job_id})
    item = result.get("Item")

    if not item:
        return {
            "statusCode": 404,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Job not found"}),
        }

    response_body = {
        "job_id": item["job_id"],
        "status": item["status"],
    }
    if item.get("output_key"):
        response_body["output_key"] = item["output_key"]
    if item.get("cost_usd"):
        response_body["cost_usd"] = item["cost_usd"]
    if item.get("turns"):
        response_body["turns"] = item["turns"]
    if item.get("error"):
        response_body["error"] = item["error"]
    if item.get("created_at"):
        response_body["created_at"] = item["created_at"]

    # Generate presigned download URL when job is complete
    if item.get("status") == "complete" and item.get("output_key"):
        bucket = item.get("bucket") or os.environ.get("S3_DOCUMENTS_BUCKET")
        if bucket:
            presigned_url = s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": item["output_key"]},
                ExpiresIn=PRESIGNED_URL_EXPIRY,
            )
            response_body["presigned_url"] = presigned_url

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps(response_body, default=_decimal_default),
    }

def _decimal_default(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

handler = _handler
