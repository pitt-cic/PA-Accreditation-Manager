#!/usr/bin/env bash
set -euo pipefail

#
# deploy-infra.sh - Deploy CDK infrastructure to AWS
#
# Usage: npm run deploy [options]
#
# Options:
#   --dev NAME                Developer name (omitted if stage is prod)
#   --stage STAGE             Deployment stage (e.g. dev, prod)
#   --profile NAME            AWS CLI profile name (optional)
#   --skip-bootstrap          Skip the CDK bootstrap step
#   --require-approval LEVEL  Approval level for CDK deploy (never/any-change/broadening)
#   --yes                     Skip AWS identity confirmation prompt
#   --help                    Show this help message
#

# Configuration
STACK_NAME_BASE="ArcpaEvidenceFinderStack"
DEFAULT_APPROVAL="broadening"
CDK_CONTEXT=() # Holds context variables passed down to CDK

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

# Show help message
show_help() {
    cat << 'EOF'
Usage: npm run deploy [-- options]

Deploys the CDK infrastructure to AWS.

Steps performed:
  1. Check prerequisites (node, npm, aws cli, credentials)
  2. Install npm dependencies
  3. Build TypeScript
  4. Run CDK bootstrap (unless --skip-bootstrap)
  5. Run CDK deploy

Options:
  --dev NAME                Developer name (omitted if stage is prod)
  --stage STAGE             Deployment stage (e.g. dev, stage, prod)
  --profile NAME            AWS CLI profile name (optional)
  --skip-bootstrap          Skip the CDK bootstrap step (for subsequent deploys)
  --require-approval LEVEL  Approval level for CDK deploy (default: broadening)
                            Values: never, any-change, broadening
  --yes                     Skip AWS identity confirmation prompt
  --help, -h                Show this help message

Examples:
  npm run deploy                                        # Full deployment with bootstrap
  npm run deploy -- --dev john --stage dev
  npm run deploy -- --dev dallas --stage dev --profile arcpa
  npm run deploy -- --stage prod --profile production
  npm run deploy -- --skip-bootstrap                    # Deploy without bootstrap
  npm run deploy -- --require-approval never            # Deploy without approval prompts
EOF
    exit 0
}

# Display and confirm AWS identity
confirm_aws_identity() {
    local skip_confirm="${1:-false}"

    echo ""
    echo "=================================================="
    echo "  AWS Identity Check"
    echo "=================================================="

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

    echo "  Profile: $profile_display"
    echo "  Account: $account"
    echo "  ARN:     $arn"
    echo "=================================================="
    echo ""

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

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed."
        echo "  Please install Node.js from https://nodejs.org/"
        echo "  Or use a version manager like nvm: https://github.com/nvm-sh/nvm"
        exit 1
    fi
    local node_version
    node_version=$(node --version)
    print_success "Node.js found: $node_version"

    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed."
        echo "  npm should be included with Node.js. Please reinstall Node.js."
        exit 1
    fi
    local npm_version
    npm_version=$(npm --version)
    print_success "npm found: v$npm_version"

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed."
        echo "  Install from: https://aws.amazon.com/cli/"
        exit 1
    fi
    local aws_version
    aws_version=$(aws --version 2>&1 | cut -d' ' -f1)
    print_success "AWS CLI found: $aws_version"

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials are not configured or are invalid."
        echo ""
        echo "  Please configure your AWS credentials:"
        echo "    aws configure"
        echo ""
        echo "  Or set environment variables:"
        echo "    export AWS_ACCESS_KEY_ID=your_key"
        echo "    export AWS_SECRET_ACCESS_KEY=your_secret"
        echo "    export AWS_REGION=us-east-1"
        echo ""
        exit 1
    fi

    local caller_identity
    caller_identity=$(aws sts get-caller-identity --query 'Account' --output text)
    print_success "AWS credentials configured (Account: $caller_identity)"

    # Auto-load Logfire token from backend/.logfire/logfire_credentials.json if not already set
    if [[ -z "${LOGFIRE_TOKEN:-}" ]]; then
        local credentials_file="../backend/.logfire/logfire_credentials.json"
        if [[ -f "$credentials_file" ]]; then
            LOGFIRE_TOKEN=$(grep '"token"' "$credentials_file" | sed -E 's/.*"token"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
            if [[ -n "$LOGFIRE_TOKEN" ]]; then
                export LOGFIRE_TOKEN
                print_success "Auto-loaded LOGFIRE_TOKEN from backend/.logfire/logfire_credentials.json"
            fi
        fi
    fi

    # Note about Logfire (optional observability)
    if [[ -z "${LOGFIRE_TOKEN:-}" ]]; then
        print_warning "LOGFIRE_TOKEN not set - Lambdas will not send traces to Logfire"
        echo "  To enable: run 'logfire auth' in backend/ directory or export LOGFIRE_TOKEN"
        echo ""
    fi
}

# Install dependencies
install_dependencies() {
    print_info "Installing npm dependencies..."
    npm install
    print_success "Dependencies installed"
}

# Build TypeScript
build_package() {
    print_info "Building TypeScript..."
    npm run build
    print_success "TypeScript compiled successfully"
}

# Bootstrap CDK
bootstrap_cdk() {
    print_info "Bootstrapping CDK..."
    npx cdk bootstrap "${CDK_CONTEXT[@]}"
    print_success "CDK bootstrap complete"
}

# Deploy CDK
deploy_cdk() {
    local approval_level="$1"
    print_info "Deploying CDK stack (require-approval: $approval_level)..."
    npx cdk deploy --require-approval "$approval_level" "${CDK_CONTEXT[@]}"
    print_success "CDK deployment complete"
}

# Main function
main() {
    local skip_bootstrap=false
    local require_approval="$DEFAULT_APPROVAL"
    local dev_name=""
    local stage_name=""
    local skip_confirm=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
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
            --profile)
                if [[ -z "${2:-}" ]]; then
                    print_error "--profile requires a profile name argument."
                    exit 1
                fi
                export AWS_PROFILE="$2"
                shift 2
                ;;
            --yes|-y)
                skip_confirm=true
                shift
                ;;
            --skip-bootstrap)
                skip_bootstrap=true
                shift
                ;;
            --require-approval)
                if [[ -n "${2:-}" ]]; then
                    case "$2" in
                        never|any-change|broadening)
                            require_approval="$2"
                            shift 2
                            ;;
                        *)
                            print_error "Invalid approval level: $2"
                            echo "  Valid values: never, any-change, broadening"
                            exit 1
                            ;;
                    esac
                else
                    print_error "--require-approval requires a level (never/any-change/broadening)"
                    exit 1
                fi
                ;;
            --help|-h)
                show_help
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information."
                exit 1
                ;;
        esac
    done

    # Dynamic Stack Name construction & CDK Context compilation
    if [[ "$stage_name" == "prod" ]]; then
        STACK_NAME="${STACK_NAME_BASE}-prod"
        CDK_CONTEXT+=("-c" "stageName=prod")
    else
        STACK_NAME="${STACK_NAME_BASE}-${dev_name}-${stage_name}"
        # Native cleanup to trim missing flags cleanly (e.g. fixes '--' or trailing '-')
        STACK_NAME="${STACK_NAME//--/-}"
        STACK_NAME="${STACK_NAME%-}"

        if [[ -n "$dev_name" ]]; then
            CDK_CONTEXT+=("-c" "devName=$dev_name")
        fi
        if [[ -n "$stage_name" ]]; then
            CDK_CONTEXT+=("-c" "stageName=$stage_name")
        fi
    fi

    echo ""
    echo "=================================="
    echo "  CDK Infrastructure Deployment"
    echo "  Target Stack: $STACK_NAME"
    echo "=================================="
    echo ""

    # Check prerequisites
    check_prerequisites
    echo ""

    # Confirm AWS identity
    confirm_aws_identity "$skip_confirm"
    echo ""

    # Install dependencies
    install_dependencies
    echo ""

    # Build TypeScript
    build_package
    echo ""

    # Bootstrap CDK (unless skipped)
    if [[ "$skip_bootstrap" == false ]]; then
        bootstrap_cdk
        echo ""
    else
        print_info "Skipping CDK bootstrap (--skip-bootstrap flag)"
        echo ""
    fi

    # Deploy CDK
    deploy_cdk "$require_approval"
    echo ""

    # Final success message
    echo "=================================="
    print_success "Infrastructure deployment complete!"
    echo "=================================="
    echo ""
    echo "Next steps:"
    echo "  - View your resources in the AWS Console"
    echo "  - Run 'npx cdk diff' to see pending changes"
    echo "  - Run 'npx cdk destroy' to tear down the stack"
    echo ""
}

# Run main
main "$@"