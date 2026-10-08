#!/usr/bin/env bash
set -euo pipefail

#
# deploy-frontend.sh - Deploy frontend to AWS Amplify
#
# Usage: npm run deploy [options]
#
# Options:
#   --profile NAME   AWS profile to use for deployment
#   --branch NAME    Branch name for deployment (default: main)
#   --dev NAME       Developer name (omitted if stage is prod)
#   --stage STAGE    Deployment stage (e.g. dev, prod)
#   --skip-build     Skip the build step (use existing dist/)
#   --no-wait        Don't wait for deployment to complete
#   --cancel         Cancel any in-progress deployments before starting
#   --yes            Skip AWS identity confirmation prompt
#   --help           Show this help message
#

# Configuration
STACK_NAME_BASE="ArcpaEvidenceFinderStack"
DEFAULT_BRANCH="main"
DIST_DIR="dist"
ZIP_FILE="/tmp/amplify-deploy-$$.zip"

# Output helper - all display output goes to stderr
out() {
    echo "$@" >&2
}

print_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1" >&2
}

print_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1" >&2
}

print_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1" >&2
}

print_warning() {
    echo -e "\033[0;33m[WARNING]\033[0m $1" >&2
}

# Show help message
show_help() {
    cat >&2 << 'EOF'
Usage: npm run deploy [-- options]

Deploys the frontend to AWS Amplify hosting.

Options:
  --profile NAME   AWS profile to use for deployment
  --branch NAME    Branch name for deployment (default: main)
  --dev NAME       Developer name (omitted if stage is prod)
  --stage STAGE    Deployment stage (e.g. dev, stage, prod)
  --skip-build     Skip the build step (use existing dist/)
  --no-wait        Don't wait for deployment to complete
  --cancel         Cancel any in-progress deployments before starting
  --yes            Skip AWS identity confirmation prompt
  --help           Show this help message

Examples:
  npm run deploy                     # Build and deploy to main branch
  npm run deploy -- --profile myprofile --dev john --stage dev
  npm run deploy -- --profile production --stage prod
  npm run deploy -- --skip-build    # Deploy existing build
EOF
    exit 0
}

# Cleanup function
cleanup() {
    if [[ -f "$ZIP_FILE" ]]; then
        rm -f "$ZIP_FILE"
    fi
}
trap cleanup EXIT

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed."
        out "  Install from: https://aws.amazon.com/cli/"
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured or are invalid."
        out ""
        out "  Please configure your AWS credentials:"
        out "    aws configure"
        out ""
        exit 1
    fi

    # Check zip command
    if ! command -v zip &> /dev/null; then
        print_error "zip command is not installed."
        out "  Install with: sudo apt install zip (Ubuntu/Debian)"
        out "             or: brew install zip (macOS)"
        exit 1
    fi

    # Check curl command
    if ! command -v curl &> /dev/null; then
        print_error "curl command is not installed."
        exit 1
    fi

    print_success "Prerequisites check passed"
}

# Display and confirm AWS identity
confirm_aws_identity() {
    local skip_confirm="${1:-false}"

    out ""
    out "=================================================="
    out "  AWS Identity Check"
    out "=================================================="

    local profile_display="${AWS_PROFILE:-(default)}"
    local identity
    identity=$(aws sts get-caller-identity --output json 2>/dev/null)

    if [[ -z "$identity" ]]; then
        print_error "Could not retrieve AWS identity."
        exit 1
    fi

    local account
    local arn
    account=$(echo "$identity" | grep -o '"Account"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    arn=$(echo "$identity" | grep -o '"Arn"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

    out "  Profile: $profile_display"
    out "  Account: $account"
    out "  ARN:     $arn"
    out "  Region:  $AWS_REGION"
    out "=================================================="
    out ""

    if [[ "$skip_confirm" == true ]]; then
        print_info "Skipping confirmation (--yes flag)"
        return 0
    fi

    read -r -p "Proceed with this AWS identity? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_info "Aborted by user."
        exit 0
    fi
}

# Get CloudFormation output
get_cfn_output() {
    local output_key="$1"
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query "Stacks[0].Outputs[?OutputKey==\`$output_key\`].OutputValue" \
        --output text 2>/dev/null
}

# Get Amplify App ID
get_amplify_app_id() {
    print_info "Fetching Amplify App ID from CloudFormation..."

    if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" &> /dev/null; then
        print_error "CloudFormation stack '$STACK_NAME' not found."
        out ""
        out "  The infrastructure stack must be deployed first."
        out "  To deploy the stack, run:"
        out ""
        out "    cd ../infra"
        out "    npm install"
        out "    cdk deploy"
        out ""
        exit 1
    fi

    AMPLIFY_APP_ID=$(get_cfn_output "AmplifyAppId")

    if [[ -z "$AMPLIFY_APP_ID" ]]; then
        print_error "Failed to get Amplify App ID from CloudFormation outputs."
        exit 1
    fi

    print_success "Amplify App ID: $AMPLIFY_APP_ID"
}

# Get AWS region
get_aws_region() {
    AWS_REGION=$(aws configure get region 2>/dev/null || echo "")
    if [[ -z "$AWS_REGION" ]]; then
        AWS_REGION=$(get_cfn_output "CognitoRegion")
    fi
    if [[ -z "$AWS_REGION" ]]; then
        AWS_REGION="us-east-1"
    fi
    print_info "Using AWS region: $AWS_REGION"
}

# Ensure branch exists
ensure_branch_exists() {
    local branch_name="$1"
    local sanitized_branch="${branch_name//\//-}"

    print_info "Checking if branch '$branch_name' exists..."

    # Check if branch exists with original name
    if aws amplify get-branch --app-id "$AMPLIFY_APP_ID" --branch-name "$branch_name" &> /dev/null; then
        print_success "Branch '$branch_name' exists"
        return 0
    fi

    # If original had slashes, check sanitized version too
    if [[ "$branch_name" != "$sanitized_branch" ]]; then
        if aws amplify get-branch --app-id "$AMPLIFY_APP_ID" --branch-name "$sanitized_branch" &> /dev/null; then
            print_success "Branch '$sanitized_branch' exists (sanitized version)"
            print_info "Using sanitized branch name: '$branch_name' -> '$sanitized_branch'"
            # Update the branch_name to use the sanitized version going forward
            echo "$sanitized_branch"
            return 0
        fi
        print_info "Creating branch with sanitized name: '$branch_name' -> '$sanitized_branch'"
    else
        print_info "Creating branch '$sanitized_branch'..."
    fi

    aws amplify create-branch \
        --app-id "$AMPLIFY_APP_ID" \
        --branch-name "$sanitized_branch" \
        --stage PRODUCTION \
        --no-enable-auto-build \
        --output text > /dev/null

    print_success "Branch '$sanitized_branch' created"

    # Return the sanitized name if it differs from original
    if [[ "$branch_name" != "$sanitized_branch" ]]; then
        echo "$sanitized_branch"
    fi
}

# Generate .env file from CloudFormation stack outputs
generate_env_file() {
    local stage="$1"
    local dev="${2:-}"

    print_info "Generating .env file from stack outputs..."

    local user_pool_id
    local user_pool_client_id
    local api_url
    local cognito_region

    user_pool_id=$(get_cfn_output "UserPoolId")
    user_pool_client_id=$(get_cfn_output "UserPoolClientId")
    api_url=$(get_cfn_output "ApiUrl")
    cognito_region=$(get_cfn_output "CognitoRegion")

    if [[ -z "$user_pool_id" || -z "$user_pool_client_id" || -z "$api_url" ]]; then
        print_error "Failed to fetch required outputs from CloudFormation stack."
        out "  Missing outputs: UserPoolId, UserPoolClientId, or ApiUrl"
        exit 1
    fi

    # Use AWS_REGION if CognitoRegion output is not available
    if [[ -z "$cognito_region" ]]; then
        cognito_region="$AWS_REGION"
    fi

    # Write .env file
    cat > .env << EOF
# Generated by deploy-frontend.sh
# Stack: $STACK_NAME
# Stage: $stage
# Dev: ${dev:-N/A (prod)}
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

VITE_USER_POOL_ID=$user_pool_id
VITE_USER_POOL_CLIENT_ID=$user_pool_client_id
VITE_API_URL=$api_url
VITE_AWS_REGION=$cognito_region
EOF

    print_success ".env file generated:"
    out "  VITE_USER_POOL_ID=$user_pool_id"
    out "  VITE_USER_POOL_CLIENT_ID=$user_pool_client_id"
    out "  VITE_API_URL=$api_url"
    out "  VITE_AWS_REGION=$cognito_region"
}

# Build frontend
build_frontend() {
    print_info "Building frontend..."

    npm run build
    print_success "Frontend built successfully"
}

# Create deployment package
create_deployment_package() {
    print_info "Creating deployment package..."

    if [[ ! -d "$DIST_DIR" ]]; then
        print_error "Build directory '$DIST_DIR' not found."
        out "  Run 'npm run build' first or remove --skip-build flag."
        exit 1
    fi

    # Create zip file
    (cd "$DIST_DIR" && zip -r -q "$ZIP_FILE" .)

    local zip_size
    zip_size=$(du -h "$ZIP_FILE" | cut -f1)
    print_success "Deployment package created ($zip_size)"
}

# Deploy to Amplify
deploy_to_amplify() {
    local branch_name="$1"
    print_info "Creating Amplify deployment..."

    # Create deployment and get upload URL
    local deployment_response
    deployment_response=$(aws amplify create-deployment \
        --app-id "$AMPLIFY_APP_ID" \
        --branch-name "$branch_name" \
        --output json)

    local job_id
    local zip_upload_url
    job_id=$(echo "$deployment_response" | grep -o '"jobId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    zip_upload_url=$(echo "$deployment_response" | grep -o '"zipUploadUrl"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

    if [[ -z "$job_id" || -z "$zip_upload_url" ]]; then
        print_error "Failed to create deployment. Response:"
        out "$deployment_response"
        exit 1
    fi

    print_info "Job ID: $job_id"
    print_info "Uploading deployment package..."

    # Upload zip to presigned URL
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        --request PUT \
        --upload-file "$ZIP_FILE" \
        "$zip_upload_url")

    if [[ "$http_code" != "200" ]]; then
        print_error "Failed to upload deployment package. HTTP status: $http_code"
        exit 1
    fi

    print_success "Deployment package uploaded"

    # Start deployment
    print_info "Starting deployment..."
    aws amplify start-deployment \
        --app-id "$AMPLIFY_APP_ID" \
        --branch-name "$branch_name" \
        --job-id "$job_id" \
        --output text > /dev/null

    print_success "Deployment started"

    # Return job ID for status checking (stdout, will be captured)
    echo "$job_id"
}

# Wait for deployment to complete
wait_for_deployment() {
    local branch_name="$1"
    local job_id="$2"
    local max_attempts=60
    local attempt=0

    print_info "Waiting for deployment to complete..."

    while [[ $attempt -lt $max_attempts ]]; do
        local status
        status=$(aws amplify get-job \
            --app-id "$AMPLIFY_APP_ID" \
            --branch-name "$branch_name" \
            --job-id "$job_id" \
            --query 'job.summary.status' \
            --output text 2>/dev/null || echo "UNKNOWN")

        case "$status" in
            SUCCEED)
                out ""
                print_success "Deployment completed successfully!"
                return 0
                ;;
            FAILED)
                out ""
                print_error "Deployment failed."
                out ""
                out "  View logs in AWS Console:"
                out "  https://$AWS_REGION.console.aws.amazon.com/amplify/home?region=$AWS_REGION#/$AMPLIFY_APP_ID/$branch_name/$job_id"
                exit 1
                ;;
            CANCELLED)
                out ""
                print_error "Deployment was cancelled."
                exit 1
                ;;
            PENDING|PROVISIONING|RUNNING|UNKNOWN)
                printf "." >&2
                sleep 5
                ((++attempt))
                ;;
            *)
                printf "." >&2
                sleep 5
                ((++attempt))
                ;;
        esac
    done

    out ""
    print_warning "Timeout waiting for deployment to complete."
    out "  Check status in AWS Console:"
    out "  https://$AWS_REGION.console.aws.amazon.com/amplify/home?region=$AWS_REGION#/$AMPLIFY_APP_ID/$branch_name/$job_id"
}

# Cancel in-progress deployments
cancel_in_progress_deployments() {
    local branch_name="$1"
    print_info "Checking for in-progress deployments..."

    # List recent jobs and find any that are in progress
    local jobs
    jobs=$(aws amplify list-jobs \
        --app-id "$AMPLIFY_APP_ID" \
        --branch-name "$branch_name" \
        --max-results 10 \
        --output json 2>/dev/null || echo '{"jobSummaries":[]}')

    local in_progress_jobs
    in_progress_jobs=$(echo "$jobs" | grep -o '"jobId"[[:space:]]*:[[:space:]]*"[^"]*"' | head -10 || echo "")

    local cancelled_count=0
    while IFS= read -r job_line; do
        [[ -z "$job_line" ]] && continue
        local job_id
        job_id=$(echo "$job_line" | cut -d'"' -f4)
        [[ -z "$job_id" ]] && continue

        # Check job status
        local status
        status=$(aws amplify get-job \
            --app-id "$AMPLIFY_APP_ID" \
            --branch-name "$branch_name" \
            --job-id "$job_id" \
            --query 'job.summary.status' \
            --output text 2>/dev/null || echo "UNKNOWN")

        if [[ "$status" == "PENDING" || "$status" == "PROVISIONING" || "$status" == "RUNNING" ]]; then
            print_info "Cancelling job $job_id (status: $status)..."
            aws amplify stop-job \
                --app-id "$AMPLIFY_APP_ID" \
                --branch-name "$branch_name" \
                --job-id "$job_id" \
                --output text > /dev/null 2>&1 || true
            ((++cancelled_count))
        fi
    done <<< "$in_progress_jobs"

    if [[ $cancelled_count -gt 0 ]]; then
        print_success "Cancelled $cancelled_count in-progress deployment(s)"
        # Wait a moment for cancellation to take effect
        sleep 2
    else
        print_info "No in-progress deployments found"
    fi
}

# Get deployment URL
get_deployment_url() {
    local branch_name="$1"
    # Always sanitize branch name for URL (URLs cannot contain /)
    local sanitized_branch="${branch_name//\//-}"

    # Construct default Amplify URL
    local app_domain
    app_domain=$(aws amplify get-app \
        --app-id "$AMPLIFY_APP_ID" \
        --query 'app.defaultDomain' \
        --output text 2>/dev/null || echo "")

    if [[ -n "$app_domain" && "$app_domain" != "None" ]]; then
        echo "https://$sanitized_branch.$app_domain"
    fi
}

# Main function
main() {
    local branch_name="$DEFAULT_BRANCH"
    local skip_build=false
    local wait_for_complete=true
    local cancel_in_progress=false
    local dev_name=""
    local stage_name=""
    local profile_name=""
    local skip_confirm=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --profile)
                if [[ -z "${2:-}" ]]; then
                    print_error "--profile requires a profile name argument."
                    exit 1
                fi
                profile_name="$2"
                shift 2
                ;;
            --branch)
                if [[ -n "${2:-}" ]]; then
                    branch_name="$2"
                    shift 2
                else
                    print_error "--branch requires a branch name"
                    exit 1
                fi
                ;;
            --dev)
                if [[ -z "${2:-}" ]]; then
                    print_error "--dev requires a developer name argument."
                    exit 1
                fi
                dev_name="$2"
                shift 2
                ;;
            --stage)
                if [[ -z "${2:-}" ]]; then
                    print_error "--stage requires a stage argument."
                    exit 1
                fi
                stage_name="$2"
                shift 2
                ;;
            --skip-build)
                skip_build=true
                shift
                ;;
            --no-wait)
                wait_for_complete=false
                shift
                ;;
            --cancel)
                cancel_in_progress=true
                shift
                ;;
            --yes|-y)
                skip_confirm=true
                shift
                ;;
            --help|-h)
                show_help
                ;;
            *)
                print_error "Unknown option: $1"
                out "Use --help for usage information."
                exit 1
                ;;
        esac
    done

    # Dynamic Stack Name construction: Base-dev-stage OR Base-prod
    if [[ "$stage_name" == "prod" ]]; then
        STACK_NAME="${STACK_NAME_BASE}-prod"
    else
        STACK_NAME="${STACK_NAME_BASE}-${dev_name}-${stage_name}"
        # Native cleanup to trim missing flags cleanly (e.g. fixes '--' or trailing '-')
        STACK_NAME="${STACK_NAME//--/-}"
        STACK_NAME="${STACK_NAME%-}"
    fi

    # Set AWS profile if provided
    if [[ -n "$profile_name" ]]; then
        export AWS_PROFILE="$profile_name"
        print_info "Using AWS profile: $profile_name"
    fi

    out ""
    out "=================================="
    out "  Frontend Amplify Deployment"
    out "  Target Stack: $STACK_NAME"
    out "=================================="
    out ""

    # Check prerequisites
    check_prerequisites
    out ""

    # Get AWS region
    get_aws_region

    # Display and confirm AWS identity
    confirm_aws_identity "$skip_confirm"
    out ""

    # Get Amplify App ID
    get_amplify_app_id
    out ""

    # Ensure branch exists (may return sanitized branch name)
    local actual_branch
    actual_branch=$(ensure_branch_exists "$branch_name")
    if [[ -n "$actual_branch" ]]; then
        branch_name="$actual_branch"
    fi
    out ""

    # Cancel in-progress deployments if requested
    if [[ "$cancel_in_progress" == true ]]; then
        cancel_in_progress_deployments "$branch_name"
        out ""
    fi

    # Generate .env file from stack outputs (unless skipping build)
    if [[ "$skip_build" == false ]]; then
        generate_env_file "$stage_name" "$dev_name"
        out ""
    fi

    # Build frontend (unless skipped)
    if [[ "$skip_build" == false ]]; then
        build_frontend
        out ""
    else
        print_info "Skipping build (--skip-build flag)"
        out ""
    fi

    # Create deployment package
    create_deployment_package
    out ""

    # Deploy to Amplify
    job_id=$(deploy_to_amplify "$branch_name")
    out ""

    # Wait for deployment
    if [[ "$wait_for_complete" == true ]]; then
        wait_for_deployment "$branch_name" "$job_id"
        out ""
    else
        print_info "Deployment in progress (--no-wait flag)"
        out "  Check status in AWS Console"
        out ""
    fi

    # Get and display deployment URL
    local deployment_url
    deployment_url=$(get_deployment_url "$branch_name")

    out "=================================="
    print_success "Deployment complete!"
    out "=================================="
    out ""
    if [[ -n "$deployment_url" ]]; then
        out "Your app is available at:"
        out ""
        out "  $deployment_url"
        out ""
    fi
}

# Run main
main "$@"