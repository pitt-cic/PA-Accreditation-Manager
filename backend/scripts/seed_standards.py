#!/usr/bin/env python3
"""
Seed DynamoDB standards table from standards_6th.json.

Usage:
    python seed_standards.py --stage STAGE [--dev NAME] [--dry-run]

Example:
    python seed_standards.py --stage dev --dev maciej
    python seed_standards.py --stage prod
    python seed_standards.py --stage dev --dev maciej --dry-run
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

import boto3
from botocore.exceptions import ClientError


STACK_NAME_BASE = "ArcpaEvidenceFinderStack"


def get_aws_identity(profile: Optional[str], region: str) -> Optional[dict]:
    """Get current AWS identity (account, user/role)."""
    session = boto3.Session(profile_name=profile, region_name=region)
    sts = session.client("sts")
    try:
        return sts.get_caller_identity()
    except ClientError as e:
        print(f"Error getting AWS identity: {e}")
        return None


def get_stack_name(stage: str, dev: Optional[str]) -> str:
    """
    Build CloudFormation stack name matching infra/bin/app.ts logic.

    Prod: ArcpaEvidenceFinderStack-prod
    Non-prod: ArcpaEvidenceFinderStack-{devName}-{stageName}
    """
    if stage == "prod":
        return f"{STACK_NAME_BASE}-{stage}"
    return f"{STACK_NAME_BASE}-{dev}-{stage}"


def get_cfn_output(stack_name: str, output_key: str, region: str, profile: Optional[str]) -> Optional[str]:
    """Fetch a specific output value from a CloudFormation stack."""
    session = boto3.Session(profile_name=profile, region_name=region)
    cf = session.client("cloudformation")
    try:
        response = cf.describe_stacks(StackName=stack_name)
        stacks = response.get("Stacks", [])
        if not stacks:
            return None
        outputs = stacks[0].get("Outputs", [])
        for output in outputs:
            if output.get("OutputKey") == output_key:
                return output.get("OutputValue")
    except ClientError as e:
        print(f"Error fetching stack output: {e}")
    return None


def extract_section_id(standard_id: str) -> str:
    """
    Extract section ID from a standard ID.

    Examples:
        "B2.07a" -> "B2"
        "A1.01a-d" -> "A1"
    """
    match = re.match(r"([A-Za-z]\d+)", standard_id)
    if match:
        return match.group(1).upper()
    return ""


def load_standards(standards_path: Path) -> list[dict]:
    """
    Load and flatten requirements from standards JSON.

    Returns a list of requirement dicts ready for DynamoDB.
    """
    with open(standards_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    items = []
    now = datetime.now().isoformat()

    for section in data.get("sections", []):
        for standard in section.get("standards", []):
            for req in standard.get("requirements", []):
                standard_id = req.get("id", "")
                if not standard_id:
                    continue

                section_id = extract_section_id(standard_id)

                # Build sub-requirements list
                sub_reqs = req.get("sub_requirements", [])
                if sub_reqs:
                    # Convert to list of dicts if needed
                    sub_requirements = [
                        {"id": sr.get("id", ""), "text": sr.get("text", "")}
                        for sr in sub_reqs
                    ]
                else:
                    sub_requirements = None

                # Build compliance guidance dict
                guidance = req.get("compliance_guidance")
                if guidance:
                    compliance_guidance = {
                        "essential_evidence": guidance.get("essential_evidence", []),
                        "focused_questions": guidance.get("focused_questions", []),
                        "notes": guidance.get("notes", []),
                    }
                else:
                    compliance_guidance = None

                # Get sub-requirement text if present
                sub_req_text = None
                if sub_reqs:
                    sub_req_text = sub_reqs[0].get("text")

                # Build the DynamoDB item
                item = {
                    "standard_id": standard_id,
                    "section_id": section_id,
                    "requirement_text": req.get("text", ""),
                    "sub_requirement_text": sub_req_text,
                    "status": "unprocessed",
                    "status_updated_at": now,
                    "gsi1_pk": "STATUS",
                    "gsi1_sk": f"unprocessed#{now}",
                    "sub_requirements": sub_requirements,
                    "compliance_guidance": compliance_guidance,
                }

                # Remove None values
                item = {k: v for k, v in item.items() if v is not None}

                items.append(item)

    return items


def seed_dynamodb(
    items: list[dict],
    table_name: str,
    region: str,
    profile: Optional[str] = None,
    dry_run: bool = False,
) -> None:
    """
    Write items to DynamoDB table.

    Args:
        items: List of items to write
        table_name: DynamoDB table name
        region: AWS region
        profile: AWS profile name
        dry_run: If True, only preview without writing
    """
    if dry_run:
        print(f"\n[DRY RUN] Would write {len(items)} items to {table_name}")
        print("\nSample items:")
        for item in items[:3]:
            print(f"\n  {item['standard_id']}:")
            print(f"    section_id: {item.get('section_id')}")
            print(f"    requirement_text: {item.get('requirement_text', '')[:80]}...")
            print(f"    has_compliance_guidance: {item.get('compliance_guidance') is not None}")
        return

    session = boto3.Session(profile_name=profile, region_name=region)
    dynamodb = session.resource("dynamodb")
    table = dynamodb.Table(table_name)

    # Check if table exists and is empty
    try:
        response = table.scan(Limit=1)
        if response.get("Count", 0) > 0:
            print(f"WARNING: Table {table_name} already has items.")
            confirm = input("Do you want to continue and overwrite? (y/N): ")
            if confirm.lower() != "y":
                print("Aborted.")
                return
    except ClientError as e:
        print(f"Error accessing table: {e}")
        return

    # Write items in batches
    print(f"\nWriting {len(items)} items to {table_name}...")

    with table.batch_writer() as batch:
        for i, item in enumerate(items, 1):
            batch.put_item(Item=item)
            if i % 50 == 0:
                print(f"  Written {i}/{len(items)} items...")

    print(f"Done! Wrote {len(items)} items to {table_name}")


def main():
    parser = argparse.ArgumentParser(
        description="Seed DynamoDB standards table from standards JSON"
    )
    parser.add_argument(
        "--stage",
        required=True,
        help="Deployment stage (dev, beta, prod)",
    )
    parser.add_argument(
        "--dev",
        help="Developer name (required for non-prod stages)",
    )
    parser.add_argument(
        "--standards",
        type=Path,
        default=Path(__file__).parent.parent.parent.parent
        / "prototype/data/output/standards_6th.json",
        help="Path to standards JSON file",
    )
    parser.add_argument(
        "--region",
        default="us-east-1",
        help="AWS region (default: us-east-1)",
    )
    parser.add_argument(
        "--profile",
        help="AWS profile name (default: uses AWS_PROFILE env or default profile)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview without writing to DynamoDB",
    )

    args = parser.parse_args()

    # Display and confirm AWS identity
    print("=" * 50)
    print("AWS Identity Check")
    print("=" * 50)
    profile_display = args.profile or os.environ.get("AWS_PROFILE") or "(default)"
    print(f"Profile: {profile_display}")
    print(f"Region:  {args.region}")

    identity = get_aws_identity(args.profile, args.region)
    if not identity:
        print("\nError: Could not authenticate with AWS.")
        print("  Check your credentials and profile settings.")
        sys.exit(1)

    print(f"Account: {identity.get('Account')}")
    print(f"ARN:     {identity.get('Arn')}")
    print("=" * 50)

    if not args.dry_run:
        confirm = input("\nProceed with this AWS identity? (y/N): ")
        if confirm.lower() != "y":
            print("Aborted.")
            sys.exit(0)

    # Validate stage/dev arguments (matching infra/bin/app.ts)
    if args.stage != "prod" and not args.dev:
        print("Error: --dev is required for non-prod stages")
        print(f"  Example: python {sys.argv[0]} --stage {args.stage} --dev yourname")
        sys.exit(1)

    # Build stack name
    stack_name = get_stack_name(args.stage, args.dev)
    print(f"\nTarget stack: {stack_name}")

    # Fetch table name from CloudFormation outputs
    print(f"Fetching table name from stack outputs...")
    table_name = get_cfn_output(stack_name, "StandardsTableName", args.region, args.profile)

    if not table_name:
        print(f"Error: Could not fetch StandardsTableName from stack '{stack_name}'")
        print("  Make sure the infrastructure stack is deployed:")
        print("    cd ../infra && cdk deploy -c stageName={} -c devName={}".format(
            args.stage, args.dev or ""
        ))
        sys.exit(1)

    print(f"Standards table: {table_name}")

    # Check standards file exists
    if not args.standards.exists():
        print(f"Error: Standards file not found: {args.standards}")
        sys.exit(1)

    print(f"Loading standards from: {args.standards}")

    # Load standards
    items = load_standards(args.standards)
    print(f"Found {len(items)} requirements")

    # Group by section for summary
    sections = {}
    for item in items:
        section = item.get("section_id", "?")
        sections[section] = sections.get(section, 0) + 1

    print("\nRequirements by section:")
    for section in sorted(sections.keys()):
        print(f"  {section}: {sections[section]}")

    # Seed DynamoDB
    seed_dynamodb(items, table_name, args.region, args.profile, args.dry_run)


if __name__ == "__main__":
    main()
