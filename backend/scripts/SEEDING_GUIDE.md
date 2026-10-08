# Standards Seeding Guide

This guide explains how to prepare and seed standards data into DynamoDB.

## Prerequisites

1. Python 3.11+ installed
2. boto3 library: `pip install boto3`
3. AWS credentials configured
4. Infrastructure stack deployed

## Step 1: Prepare Your JSON

The seeding script expects a nested JSON structure:

```json
{
  "edition": "6th",
  "title": "Accreditation Standards...",
  "sections": [
    {
      "id": "A",
      "title": "Administration",
      "standards": [
        {
          "id": "A1",
          "title": "Standard A1",
          "requirements": [
            {
              "id": "A1.01a",
              "text": "Requirement text...",
              "sub_requirements": [...],
              "compliance_guidance": {
                "essential_evidence": [...],
                "focused_questions": [...],
                "notes": [...]
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### Validate Your JSON

```bash
# Navigate to scripts directory
cd backend/scripts

# Validate your JSON file
python prepare_standards_json.py path/to/your/standards.json --validate-only

# Clean and prepare JSON for seeding
python prepare_standards_json.py path/to/your/standards.json \
  --output standards_cleaned.json
```

## Step 2: Review the Output

The validation script will show:
- Total sections, standards, and requirements
- Requirements broken down by section
- Requirements with compliance guidance

Example output:
```
Content Summary:
  Sections:                  5
  Standards:                 25
  Requirements:              143
  With compliance guidance:  140

Requirements by section:
  A: 32
  B: 45
  C: 28
  D: 21
  E: 17
```

## Step 3: Seed DynamoDB (Dry Run First!)

Always test with `--dry-run` first:

```bash
# Dry run to preview what will be seeded
python seed_standards.py \
  --stage dev \
  --dev YOUR_NAME \
  --profile YOUR_AWS_PROFILE \
  --standards standards_cleaned.json \
  --dry-run
```

The dry run will show:
- AWS account and identity being used
- Target CloudFormation stack
- DynamoDB table name
- Sample items that would be written

## Step 4: Seed for Real

Once you've verified the dry run looks correct:

```bash
# Remove --dry-run to actually seed the database
python seed_standards.py \
  --stage dev \
  --dev YOUR_NAME \
  --profile YOUR_AWS_PROFILE \
  --standards standards_cleaned.json
```

**Important**: The script will warn if the table already has items and ask for confirmation before overwriting.

## Command Reference

### prepare_standards_json.py

```bash
python prepare_standards_json.py INPUT_FILE [OPTIONS]

Options:
  --output, -o PATH       Output cleaned JSON to this file
  --validate-only         Only validate, don't output
  --profile PROFILE       AWS profile (for future enhancements)

Examples:
  # Just validate
  python prepare_standards_json.py standards.json --validate-only

  # Validate and clean
  python prepare_standards_json.py standards.json -o cleaned.json

  # With AWS profile
  python prepare_standards_json.py standards.json -o cleaned.json --profile my-profile
```

### seed_standards.py

```bash
python seed_standards.py --stage STAGE [OPTIONS]

Required:
  --stage STAGE          Deployment stage (dev, beta, prod)

Optional:
  --dev NAME             Developer name (required for non-prod)
  --profile PROFILE      AWS profile name
  --standards PATH       Path to JSON file (default: auto-detected)
  --region REGION        AWS region (default: us-east-1)
  --dry-run              Preview without writing

Examples:
  # Dev deployment with dry run
  python seed_standards.py --stage dev --dev john --dry-run

  # Dev deployment with custom profile and file
  python seed_standards.py \
    --stage dev \
    --dev john \
    --profile my-aws-profile \
    --standards ./standards_6th.json

  # Production deployment
  python seed_standards.py \
    --stage prod \
    --profile production-profile \
    --standards ./standards_6th.json
```

## Troubleshooting

### Error: "Could not fetch StandardsTableName from stack"

**Cause**: Infrastructure stack not deployed or wrong stage/dev name.

**Solution**: 
1. Check stack exists: `aws cloudformation list-stacks --profile YOUR_PROFILE`
2. Deploy infrastructure first: `cd ../../infra && npm run deploy -- --dev YOUR_NAME --stage dev --profile YOUR_PROFILE`

### Error: "User pool does not exist"

**Cause**: Wrong AWS account/profile.

**Solution**: Verify you're using the correct profile with `aws sts get-caller-identity --profile YOUR_PROFILE`

### Warning: "Table already has items"

**Cause**: Table is not empty.

**Solution**: 
- Type `y` to overwrite existing standards (use with caution!)
- Type `N` to abort and manually clear the table if needed

### Validation errors

**Cause**: JSON structure doesn't match expected format.

**Solution**: Review the error messages and fix the JSON structure. Common issues:
- Missing `id` or `text` fields in requirements
- `sections`, `standards`, or `requirements` not being lists
- Incorrect nesting level

## Best Practices

1. **Always use --dry-run first** to preview changes
2. **Validate JSON** with prepare_standards_json.py before seeding
3. **Use the correct profile** to avoid seeding the wrong account
4. **Backup existing data** if re-seeding a table with important data
5. **Match dev/stage names** between infra deployment and seeding

## File Locations

- **Seed script**: `backend/scripts/seed_standards.py`
- **Validation script**: `backend/scripts/prepare_standards_json.py`
- **Default JSON location**: `../../arc-pa-dashboard-extraction/data/standards_6th.json`

## Integration with Infrastructure

The seeding scripts automatically:
1. Build the correct stack name from `--stage` and `--dev` flags
2. Query CloudFormation for the DynamoDB table name
3. Use the specified AWS profile for all operations

This ensures consistency between infrastructure deployment and data seeding.
