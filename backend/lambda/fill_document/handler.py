import asyncio
import glob
import json
import logging
import os
import shutil
import time
import uuid

import boto3
from claude_code_sdk import (
    AssistantMessage,
    ClaudeCodeOptions,
    ResultMessage,
    TextBlock,
    query,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

BASE_WORK_DIR = "/tmp/work"

def _handler(event, context):
    return asyncio.run(_handler_async(event, context))

async def _handler_async(event, context):
    # Accept both direct async invocation (has job_id) and API GW proxy shape
    if "job_id" in event:
        job_id = event["job_id"]
        body = event
    elif "body" in event:
        body = json.loads(event["body"]) if isinstance(event["body"], str) else event["body"]
        job_id = body.get("job_id")
    else:
        body = event
        job_id = body.get("job_id")

    bucket = body["bucket"]
    template_key = body["template_key"]
    evidence_key = body["evidence_key"]
    output_key = body.get("output_key") or _default_output_key(template_key)

    jobs_table_name = os.environ.get("FILL_DOCUMENT_JOBS_TABLE")
    jobs_table = dynamodb.Table(jobs_table_name) if jobs_table_name and job_id else None

    if jobs_table:
        jobs_table.update_item(
            Key={"job_id": job_id},
            UpdateExpression="SET #s = :s",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "running"},
        )

    request_id = context.aws_request_id if context else str(uuid.uuid4())
    work_dir = os.path.join(BASE_WORK_DIR, request_id)
    os.makedirs(work_dir, exist_ok=True)

    try:
        template_filename = os.path.basename(template_key)
        evidence_filename = "standard_evidence_json_ddb_pulled.txt"

        template_path = os.path.join(work_dir, template_filename)
        evidence_path = os.path.join(work_dir, evidence_filename)

        logger.info(
            "Downloading s3://%s/%s and s3://%s/%s",
            bucket, template_key, bucket, evidence_key,
        )
        s3.download_file(bucket, template_key, template_path)
        s3.download_file(bucket, evidence_key, evidence_path)

        output_filename = os.path.basename(output_key)
        prompt = (
            f"In the current directory there is an Excel template called "
            f"`{template_filename}` and a proof/evidence file called "
            f"`{evidence_filename}`. Create a filled-in xlsx file from the "
            f"template using the data in the evidence file, and save the "
            f"completed workbook as `{output_filename}` in this same "
            f"directory. Only read and write files in this directory."
            f"Do not say to refer to the syllabus, and explicitly list "
            f"all instructional objectives that apply for that template and "
            f"make sure to put the course name for every instructional objective too. "
            f"Copy everything in the template including any images over to the "
            f"filled out version."
        )

        options = ClaudeCodeOptions(
            cwd=work_dir,
            permission_mode="bypassPermissions",
            allowed_tools=["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            max_turns=40,
            env={
                "HOME": "/tmp",
                "CLAUDE_CONFIG_DIR": "/tmp/.claude-config",
                "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1",
                "CLAUDE_CODE_USE_BEDROCK": "1",
                "AWS_REGION": os.environ.get("AWS_REGION", "us-east-1"),
                "ANTHROPIC_MODEL": "us.anthropic.claude-sonnet-4-6",
            },
        )

        result = None
        async for message in query(prompt=prompt, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        logger.info("claude: %s", block.text)
            elif isinstance(message, ResultMessage):
                result = message
                logger.info(
                    "result subtype=%s is_error=%s cost=$%.4f turns=%s",
                    message.subtype,
                    message.is_error,
                    message.total_cost_usd or 0.0,
                    message.num_turns,
                )

        if result is None or result.is_error:
            raise RuntimeError(
                f"Claude agent run failed: "
                f"{result.subtype if result else 'no result message received'}"
            )

        output_path = os.path.join(work_dir, output_filename)
        if not os.path.exists(output_path):
            candidates = [
                p
                for p in glob.glob(os.path.join(work_dir, "*.xlsx"))
                if os.path.basename(p) != template_filename
            ]
            if not candidates:
                raise RuntimeError("No output .xlsx file found after the agent run")
            output_path = candidates[0]

        logger.info("Uploading %s to s3://%s/%s", output_path, bucket, output_key)
        s3.upload_file(output_path, bucket, output_key)

        if jobs_table:
            jobs_table.update_item(
                Key={"job_id": job_id},
                UpdateExpression="SET #s = :s, output_key = :ok, cost_usd = :c, turns = :t",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":s": "complete",
                    ":ok": output_key,
                    ":c": str(result.total_cost_usd or 0),
                    ":t": result.num_turns,
                },
            )

        return {
            "statusCode": 200,
            "bucket": bucket,
            "output_key": output_key,
            "cost_usd": result.total_cost_usd,
            "turns": result.num_turns,
        }

    except Exception as e:
        logger.exception("fill_document failed: %s", e)
        if jobs_table:
            jobs_table.update_item(
                Key={"job_id": job_id},
                UpdateExpression="SET #s = :s, #e = :e",
                ExpressionAttributeNames={"#s": "status", "#e": "error"},
                ExpressionAttributeValues={":s": "error", ":e": str(e)},
            )
        raise

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

def _default_output_key(template_key: str) -> str:
    root, ext = os.path.splitext(template_key)
    return f"{root}_filled{ext or '.xlsx'}"

handler = _handler
