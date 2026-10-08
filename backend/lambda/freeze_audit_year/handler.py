"""Lambda handler for POST /audit/{year}/freeze.

Copies all live LinkedStandard records (audit_year=None) into frozen
snapshots keyed as {standard_id}#{year}, with audit_year={year} and
is_frozen=True set on each copy.  Live records are never modified.

Also copies all live records from CoursesTable, GoalsTable, and
CompetenciesTable using the same pattern ({pk}#{year} key, audit_year,
is_frozen=True).

CommentsTable and AttachmentsTable use composite keys (standard_id +
comment_id / attachment_id) that cannot be changed, so they are stamped
in-place via update_item (audit_year set on each live record) rather
than copied.

Returns 409 if any record for the given year already exists.
Returns 400 if the year path parameter is missing.
Returns 200 with per-table frozen counts on success.
"""

import json
import logging
import os

import boto3
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

TABLE_NAME = os.environ["LINKED_STANDARDS_TABLE"]
INDEX_NAME = os.environ["LINKED_STANDARDS_AUDIT_YEAR_INDEX"]

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
_table = _dynamodb.Table(TABLE_NAME)

# Secondary tables frozen alongside standards (module-level for testability)
_courses_table = _dynamodb.Table(os.environ.get("COURSES_TABLE", ""))
_goals_table = _dynamodb.Table(os.environ.get("GOALS_TABLE", ""))
_competencies_table = _dynamodb.Table(os.environ.get("COMPETENCIES_TABLE", ""))
_comments_table = _dynamodb.Table(os.environ.get("COMMENTS_TABLE", ""))
_attachments_table = _dynamodb.Table(os.environ.get("ATTACHMENTS_TABLE", ""))


def _year_already_frozen(year: str) -> bool:
    """Return True if at least one record with this audit_year exists."""
    response = _table.query(
        IndexName=INDEX_NAME,
        KeyConditionExpression=boto3.dynamodb.conditions.Key("audit_year").eq(year),
        Limit=1,
        ProjectionExpression="standard_id",
    )
    return len(response.get("Items", [])) > 0


def _scan_live_records() -> list[dict]:
    """Return all records where audit_year is not set (live/draft records)."""
    items: list[dict] = []
    response = _table.scan(
        FilterExpression=Attr("audit_year").not_exists(),
    )
    items.extend(response.get("Items", []))
    while "LastEvaluatedKey" in response:
        response = _table.scan(
            FilterExpression=Attr("audit_year").not_exists(),
            ExclusiveStartKey=response["LastEvaluatedKey"],
        )
        items.extend(response.get("Items", []))
    return items


def _freeze_records(records: list[dict], year: str) -> int:
    """Write frozen copies of standards in batches of 25. Returns count written."""
    with _table.batch_writer() as batch:
        for record in records:
            frozen = dict(record)
            original_id = record["standard_id"]
            if "#" in original_id:
                logger.warning(f"standard_id {original_id!r} contains '#' — frozen key will have multiple segments")
            frozen["standard_id"] = f"{original_id}#{year}"
            frozen["audit_year"] = year
            frozen["is_frozen"] = True
            batch.put_item(Item=frozen)
    return len(records)


def _freeze_secondary_table(table, pk_field: str, year: str) -> int:
    """Scan live records in a secondary table and write frozen copies. Returns count."""
    live_filter = Attr("audit_year").not_exists()
    items: list[dict] = []
    response = table.scan(FilterExpression=live_filter)
    items.extend(response.get("Items", []))
    while "LastEvaluatedKey" in response:
        response = table.scan(
            FilterExpression=live_filter,
            ExclusiveStartKey=response["LastEvaluatedKey"],
        )
        items.extend(response.get("Items", []))

    if not items:
        return 0

    with table.batch_writer() as batch:
        for record in items:
            frozen = dict(record)
            original_id = record[pk_field]
            frozen[pk_field] = f"{original_id}#{year}"
            frozen["audit_year"] = year
            frozen["is_frozen"] = True
            batch.put_item(Item=frozen)
    return len(items)


def _purge_live_linked_standards(live_records: list[dict]) -> int:
    """Delete the live LinkedStandards records that were just frozen. Returns count deleted."""
    if not live_records:
        return 0
    with _table.batch_writer() as batch:
        for record in live_records:
            batch.delete_item(Key={"standard_id": record["standard_id"]})
    return len(live_records)


def _stamp_table_with_audit_year(table, pk_field: str, sk_field: str, year: str) -> int:
    """Scan live records (audit_year absent) and stamp them in-place. Returns count stamped."""
    live_filter = Attr("audit_year").not_exists()
    items = []
    response = table.scan(FilterExpression=live_filter)
    items.extend(response.get("Items", []))
    while "LastEvaluatedKey" in response:
        response = table.scan(FilterExpression=live_filter, ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))
    stamped = 0
    for item in items:
        try:
            table.update_item(
                Key={pk_field: item[pk_field], sk_field: item[sk_field]},
                UpdateExpression="SET audit_year = :year",
                ExpressionAttributeValues={":year": year},
            )
            stamped += 1
        except Exception as e:
            logger.warning(f"Failed to stamp {pk_field}={item.get(pk_field)}: {e}")
    return stamped


def _handler(event, _context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    year = (event.get("pathParameters") or {}).get("year")
    if not year:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "year path parameter is required"}),
        }

    try:
        if _year_already_frozen(year):
            logger.info(f"Freeze rejected — year {year!r} already has records")
            return {
                "statusCode": 409,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": f"Audit year {year!r} has already been frozen"}),
            }

        live_records = _scan_live_records()
        if not live_records:
            return {
                "statusCode": 422,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "No live standard records found to freeze"}),
            }

        frozen_count = _freeze_records(live_records, year)
        purged_standards_count = _purge_live_linked_standards(live_records)
        courses_count = _freeze_secondary_table(_courses_table, "course_id", year)
        goals_count = _freeze_secondary_table(_goals_table, "id", year)
        competencies_count = _freeze_secondary_table(_competencies_table, "id", year)
        comments_count = _stamp_table_with_audit_year(_comments_table, "standard_id", "comment_id", year)
        attachments_count = _stamp_table_with_audit_year(_attachments_table, "standard_id", "attachment_id", year)

        logger.info(
            f"Froze {frozen_count} standards (purged {purged_standards_count} live), "
            f"{courses_count} courses, {goals_count} goals, {competencies_count} competencies, "
            f"{comments_count} comments, {attachments_count} attachments for year {year!r}"
        )

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "year": year,
                "frozen_count": frozen_count,
                "purged_standards_count": purged_standards_count,
                "courses_count": courses_count,
                "goals_count": goals_count,
                "competencies_count": competencies_count,
                "comments_count": comments_count,
                "attachments_count": attachments_count,
            }),
        }

    except Exception as e:
        logger.error(f"Error freezing audit year: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Internal server error"}),
        }

handler = _handler
