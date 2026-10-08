#!/usr/bin/env bash
set -euo pipefail

#
# deploy.sh - Full-stack deployment: infrastructure + frontend
#
# Runs infra/deploy-infra.sh first, then frontend/deploy-frontend.sh.
# Safe for a first-time (from-scratch) AWS deployment.
#
# Defaults:
#   - If neither --dev nor --stage is given, deploys to PRODUCTION
#     and prompts for confirmation.
#   - CDK approval level defaults to 'broadening'.
#   - Amplify branch defaults to 'main'.
#
# Usage: ./deploy.sh [options]
#
# Options:
#   --dev NAME                Developer name (non-prod deployments)
#   --stage STAGE             Deployment stage (e.g. dev, prod) — defaults to prod
#   --profile NAME            AWS CLI profile name (optional)
#   --branch NAME             Amplify branch for frontend (default: main)
#   --skip-bootstrap          Skip the CDK bootstrap step
#   --require-approval LEVEL  CDK approval level (default: broadening)
#                             Values: never, any-change, broadening
#   --no-wait                 Don't wait for Amplify deployment to finish
#   --infra-only              Deploy infrastructure only (skip frontend)
#   --frontend-only           Deploy frontend only (skip infrastructure)
#   --yes                     Skip all confirmation prompts
#   --help                    Show this help message
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_APPROVAL="broadening"
DEFAULT_BRANCH="main"

# Color output helpers
print_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

print_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

print_warning() {
    echo -e "\033[0;33m[WARNING]\033[0m $1"
}

print_step() {
    echo ""
    echo -e "\033[1;36m━━━ $1 ━━━\033[0m"
    echo ""
}

# Show help message
show_help() {
    cat << 'EOF'
Usage: ./deploy.sh [options]

Full-stack deployment: deploys AWS infrastructure via CDK, then deploys
the frontend to Amplify. Safe for a first-time (from-scratch) deployment.

If neither --dev nor --stage is provided, the script assumes PRODUCTION
and will prompt for confirmation before proceeding.

Steps performed:
  1. Check prerequisites (node, npm, docker, aws cli, zip, curl)
  2. Confirm deployment target (production warning if no --dev/--stage given)
  3. Confirm AWS identity (once, shared across both deploys)
  4. Deploy infrastructure  (infra/deploy-infra.sh)
  5. Deploy frontend        (frontend/deploy-frontend.sh)

Options:
  --dev NAME                Developer name (non-prod deployments)
  --stage STAGE             Deployment stage (e.g. dev, stage, prod)
                            Defaults to 'prod' if neither --dev nor --stage given
  --profile NAME            AWS CLI profile name (optional)
  --branch NAME             Amplify branch name for frontend (default: main)
  --skip-bootstrap          Skip the CDK bootstrap step (for re-deploys)
  --require-approval LEVEL  CDK approval level (default: broadening)
                            Values: never, any-change, broadening
  --no-wait                 Don't wait for Amplify deployment to complete
  --infra-only              Deploy infrastructure only, skip frontend
  --frontend-only           Deploy frontend only (infra must already exist)
  --yes                     Skip all confirmation prompts
  --help, -h                Show this help message

Examples:
  ./deploy.sh                                            # Production deploy (prompts)
  ./deploy.sh --yes                                      # Production deploy, no prompts
  ./deploy.sh --dev alice --stage dev --profile arcpa    # Dev deploy
  ./deploy.sh --stage prod --profile production --yes    # Prod, specific profile
  ./deploy.sh --infra-only --dev bob --stage dev         # Infrastructure only
  ./deploy.sh --frontend-only --yes                      # Frontend only, no prompts
  ./deploy.sh --skip-bootstrap --require-approval never  # Fast re-deploy
EOF
    exit 0
}

# Check all prerequisites needed by both sub-scripts
check_prerequisites() {
    print_info "Checking prerequisites..."

    local missing=0

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed."
        echo "  Install from: https://nodejs.org/ or via nvm: https://github.com/nvm-sh/nvm"
        missing=1
    else
        print_success "Node.js found: $(node --version)"
    fi

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed (should ship with Node.js)."
        missing=1
    else
        print_success "npm found: v$(npm --version)"
    fi

    # Docker is required by CDK to bundle Python Lambda functions
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed."
        echo "  Install from: https://docs.docker.com/get-docker/"
        echo "  CDK uses Docker to bundle Python Lambda functions."
        missing=1
    elif ! docker info &> /dev/null; then
        print_error "Docker is installed but the daemon is not running."
        echo "  Start Docker and re-run this script."
        missing=1
    else
        print_success "Docker found and running: $(docker --version | cut -d' ' -f3 | tr -d ',')"
    fi

    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed."
        echo "  Install from: https://aws.amazon.com/cli/"
        missing=1
    else
        print_success "AWS CLI found: $(aws --version 2>&1 | cut -d' ' -f1)"
    fi

    if ! command -v zip &> /dev/null; then
        print_error "zip is not installed."
        echo "  Install with: sudo apt install zip  (Ubuntu/Debian)"
        echo "             or: brew install zip      (macOS)"
        missing=1
    else
        print_success "zip found"
    fi

    if ! command -v curl &> /dev/null; then
        print_error "curl is not installed."
        missing=1
    else
        print_success "curl found"
    fi

    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured or are invalid."
        echo ""
        echo "  Configure credentials with one of:"
        echo "    aws configure"
        echo "    export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=..."
        echo "    aws sso login --profile <profile>"
        missing=1
    else
        local account
        account=$(aws sts get-caller-identity --query 'Account' --output text)
        print_success "AWS credentials valid (Account: $account)"
    fi

    if [[ "$missing" -ne 0 ]]; then
        echo ""
        print_error "One or more prerequisites are missing. Fix the above and re-run."
        exit 1
    fi
}

# Warn and confirm when defaulting to a production deploy
confirm_production_default() {
    local skip_confirm="$1"

    echo ""
    print_warning "No --dev or --stage specified — defaulting to PRODUCTION deployment."
    echo ""

    if [[ "$skip_confirm" == true ]]; then
        print_warning "Proceeding with production deploy (--yes flag set)."
        return 0
    fi

    read -r -p "This will deploy to PRODUCTION. Continue? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_info "Aborted by user."
        exit 0
    fi
}

# Confirm AWS identity once, shared across both sub-scripts
confirm_aws_identity() {
    local skip_confirm="$1"

    echo ""
    echo "=================================================="
    echo "  AWS Identity"
    echo "=================================================="

    local identity
    identity=$(aws sts get-caller-identity --output json 2>/dev/null)

    local account arn region
    account=$(echo "$identity" | grep -o '"Account"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    arn=$(echo "$identity"    | grep -o '"Arn"[[:space:]]*:[[:space:]]*"[^"]*"'     | cut -d'"' -f4)
    region=$(aws configure get region 2>/dev/null || echo "us-east-1")

    echo "  Profile: ${AWS_PROFILE:-(default)}"
    echo "  Account: $account"
    echo "  ARN:     $arn"
    echo "  Region:  $region"
    echo "=================================================="
    echo ""

    if [[ "$skip_confirm" == true ]]; then
        print_info "Skipping confirmation (--yes)"
        return 0
    fi

    read -r -p "Proceed with this AWS identity? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        print_info "Aborted by user."
        exit 0
    fi
}

# Main
main() {
    # --- Declare all variables before parsing args ---
    # The defaulted-to-prod logic runs *after* the while loop, so all flags
    # are fully parsed before it executes. These booleans just track whether
    # --dev / --stage were explicitly passed.
    local dev_name=""
    local stage_name=""
    local profile_name=""
    local branch_name="$DEFAULT_BRANCH"
    local skip_bootstrap=false
    local require_approval="$DEFAULT_APPROVAL"
    local no_wait=false
    local infra_only=false
    local frontend_only=false
    local skip_confirm=false
    local dev_explicitly_set=false
    local stage_explicitly_set=false

    # --- Parse arguments ---
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dev)
                [[ -z "${2:-}" ]] && { print_error "--dev requires a name"; exit 1; }
                dev_name="$2"; dev_explicitly_set=true; shift 2 ;;
            --stage)
                [[ -z "${2:-}" ]] && { print_error "--stage requires a value"; exit 1; }
                stage_name="$2"; stage_explicitly_set=true; shift 2 ;;
            --profile)
                [[ -z "${2:-}" ]] && { print_error "--profile requires a name"; exit 1; }
                profile_name="$2"; shift 2 ;;
            --branch)
                [[ -z "${2:-}" ]] && { print_error "--branch requires a name"; exit 1; }
                branch_name="$2"; shift 2 ;;
            --skip-bootstrap)
                skip_bootstrap=true; shift ;;
            --require-approval)
                case "${2:-}" in
                    never|any-change|broadening) require_approval="$2"; shift 2 ;;
                    *) print_error "--require-approval must be: never, any-change, or broadening"; exit 1 ;;
                esac ;;
            --no-wait)
                no_wait=true; shift ;;
            --infra-only)
                infra_only=true; shift ;;
            --frontend-only)
                frontend_only=true; shift ;;
            --yes|-y)
                skip_confirm=true; shift ;;
            --help|-h)
                show_help ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information."
                exit 1 ;;
        esac
    done

    # --- Post-parse validation and defaults ---
    # (All args are fully parsed at this point.)

    if [[ "$infra_only" == true && "$frontend_only" == true ]]; then
        print_error "--infra-only and --frontend-only are mutually exclusive."
        exit 1
    fi

    # Default to prod when neither --dev nor --stage was provided
    local defaulted_to_prod=false
    if [[ "$dev_explicitly_set" == false && "$stage_explicitly_set" == false ]]; then
        stage_name="prod"
        defaulted_to_prod=true
    fi

    # Apply AWS profile so all subsequent aws calls use it
    if [[ -n "$profile_name" ]]; then
        export AWS_PROFILE="$profile_name"
    fi

    # Derive stack name for display (sub-scripts derive it independently)
    local stack_display
    if [[ "$stage_name" == "prod" ]]; then
        stack_display="ArcpaEvidenceFinderStack-prod"
    else
        stack_display="ArcpaEvidenceFinderStack-${dev_name}-${stage_name}"
        stack_display="${stack_display//--/-}"
        stack_display="${stack_display%-}"
    fi

    local phases_display
    if [[ "$infra_only" == true ]]; then
        phases_display="infra only"
    elif [[ "$frontend_only" == true ]]; then
        phases_display="frontend only"
    else
        phases_display="infra → frontend"
    fi

    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║     PA Accreditation Manager Deployment      ║"
    echo "╠══════════════════════════════════════════════╣"
    printf  "║  Stack:      %-32s║\n" "$stack_display"
    printf  "║  Profile:    %-32s║\n" "${AWS_PROFILE:-(default)}"
    printf  "║  Approval:   %-32s║\n" "$require_approval"
    printf  "║  Branch:     %-32s║\n" "$branch_name"
    printf  "║  Phases:     %-32s║\n" "$phases_display"
    echo "╚══════════════════════════════════════════════╝"

    # ── Step 1: Prerequisites ─────────────────────────────────────────────────
    print_step "Step 1 — Prerequisites"
    check_prerequisites

    # ── Step 2: Production default warning ───────────────────────────────────
    if [[ "$defaulted_to_prod" == true ]]; then
        print_step "Step 2 — Deployment Target"
        confirm_production_default "$skip_confirm"
    fi

    # ── Step 3: AWS identity ──────────────────────────────────────────────────
    print_step "Step 3 — AWS Identity"
    confirm_aws_identity "$skip_confirm"

    # ── Build argument arrays for sub-scripts ────────────────────────────────
    local common_args=()
    [[ -n "$dev_name"     ]] && common_args+=(--dev     "$dev_name")
    [[ -n "$stage_name"   ]] && common_args+=(--stage   "$stage_name")
    [[ -n "$profile_name" ]] && common_args+=(--profile "$profile_name")

    local infra_args=("${common_args[@]}")
    [[ "$skip_bootstrap" == true ]] && infra_args+=(--skip-bootstrap)
    infra_args+=(--require-approval "$require_approval")
    infra_args+=(--yes)   # identity already confirmed above

    local frontend_args=("${common_args[@]}")
    frontend_args+=(--branch "$branch_name")
    [[ "$no_wait" == true ]] && frontend_args+=(--no-wait)
    frontend_args+=(--yes)   # identity already confirmed above

    # ── Step 4: Infrastructure ────────────────────────────────────────────────
    if [[ "$frontend_only" == false ]]; then
        print_step "Step 4 — Infrastructure (CDK)"
        (cd "$SCRIPT_DIR/infra" && bash deploy-infra.sh "${infra_args[@]}")
        print_success "Infrastructure deployment complete."
    else
        print_step "Step 4 — Infrastructure (skipped)"
        print_info "Skipping infrastructure deploy (--frontend-only)"
    fi

    echo ""

    # ── Step 5: Frontend ──────────────────────────────────────────────────────
    if [[ "$infra_only" == false ]]; then
        print_step "Step 5 — Frontend (Amplify)"
        (cd "$SCRIPT_DIR/frontend" && bash deploy-frontend.sh "${frontend_args[@]}")
        print_success "Frontend deployment complete."
    else
        print_step "Step 5 — Frontend (skipped)"
        print_info "Skipping frontend deploy (--infra-only)"
    fi

    echo ""
    echo "╔══════════════════════════════════════════════╗"
    print_success "Full-stack deployment complete!"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
}

main "$@"
