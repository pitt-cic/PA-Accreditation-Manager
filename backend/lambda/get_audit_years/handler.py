"""Lambda handler for GET /audit/years — returns sorted list of frozen audit year labels."""

import json
import logging
import os
import sys

# Add shared module to path
# In Lambda, shared is copied to /asset-output/shared by CDK bundling
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "shared"))

import boto3
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}

TABLE_NAME = os.environ["LINKED_STANDARDS_TABLE"]
INDEX_NAME = os.environ["LINKED_STANDARDS_AUDIT_YEAR_INDEX"]

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))
_table = _dynamodb.Table(TABLE_NAME)

def _handler(event, _context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    try:
        # Scan the GSI projection — only need the audit_year attribute.
        # The GSI only contains items that have audit_year set.
        # Include ALL audit years regardless of is_frozen status, because:
        # - Amendment workflow unfreezes standards (is_frozen=false)
        # - User needs to access the audit year to continue amendment work
        # - Hiding the year on refresh would lock user out of in-progress amendments
        years: set[str] = set()
        response = _table.scan(
            IndexName=INDEX_NAME,
            ProjectionExpression="audit_year",
            # No FilterExpression - include frozen AND amended standards
        )

        page_count = 1
        for item in response.get("Items", []):
            if item.get("audit_year"):
                years.add(item["audit_year"])

        while "LastEvaluatedKey" in response:
            page_count += 1
            response = _table.scan(
                IndexName=INDEX_NAME,
                ProjectionExpression="audit_year",
                # No FilterExpression
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            for item in response.get("Items", []):
                if item.get("audit_year"):
                    years.add(item["audit_year"])

        logger.info("Scanned GSI for audit years page_count=%d unique_years_found=%d", page_count, len(years))

        sorted_years = sorted(years, reverse=True)
        logger.info("Returning audit years count=%d years=%s", len(sorted_years), sorted_years)

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({"years": sorted_years}),
        }

    except Exception as e:
        logger.error("Error fetching audit years error=%s error_type=%s", str(e), type(e).__name__, exc_info=True)
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Internal server error"}),
        }

handler = _handler
