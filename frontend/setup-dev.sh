#!/usr/bin/env bash
set -euo pipefail

#
# setup-dev.sh - Frontend development environment setup script
#
# Usage: npm run setup-dev [options]
#
# Options:
#   --skip-env    Skip CloudFormation fetch and .env generation
#   --help        Show this help message
#   --dev         Developer name
#   --stage       Deployment stage (e.g. dev, prod)
#

# Configuration
STACK_NAME_BASE="ArcpaEvidenceFinderStack"
ENV_FILE=".env"
ENV_BACKUP=".env.backup"

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
    echo "Usage: npm run setup-dev [-- options]"
    echo ""
    echo "Sets up the frontend development environment by:"
    echo "  1. Checking prerequisites (node, npm, aws cli)"
    echo "  2. Installing npm dependencies"
    echo "  3. Fetching CloudFormation outputs and generating .env file"
    echo "  4. Building the frontend"
    echo ""
    echo "Options:
      --skip-env       Skip CloudFormation fetch and .env generation
      --dev <name>     Developer name (omitted if stage is prod)
      --stage <stage>  Deployment stage (e.g. dev, stage, prod)
      --help, -h       Show this help message"
    echo ""
    echo "Examples:"
    echo "  npm run setup-dev"
    echo "  npm run setup-dev -- --dev john --stage dev"
    echo "  npm run setup-dev -- --stage prod"
    exit 0
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

    # Check AWS CLI (warning only)
    if ! command -v aws &> /dev/null; then
        print_warning "AWS CLI is not installed."
        echo "  AWS CLI is required to fetch CloudFormation outputs."
        echo "  Install from: https://aws.amazon.com/cli/"
        echo "  You can use --skip-env to proceed without AWS integration."
        return 1
    fi
    local aws_version
    aws_version=$(aws --version 2>&1 | cut -d' ' -f1)
    print_success "AWS CLI found: $aws_version"
    return 0
}

# Handle existing .env file
handle_existing_env() {
    if [[ ! -f "$ENV_FILE" ]]; then
        return 0
    fi

    print_warning "Existing $ENV_FILE file found."
    echo ""
    echo "What would you like to do?"
    echo "  [b] Backup existing file and create new one"
    echo "  [o] Overwrite existing file"
    echo "  [s] Skip .env generation (keep existing)"
    echo "  [q] Quit"
    echo ""

    while true; do
        read -rp "Choice [b/o/s/q]: " choice
        case "$choice" in
            b|B)
                cp "$ENV_FILE" "$ENV_BACKUP"
                print_success "Backed up existing .env to $ENV_BACKUP"
                return 0
                ;;
            o|O)
                print_info "Will overwrite existing .env file"
                return 0
                ;;
            s|S)
                print_info "Skipping .env generation, keeping existing file"
                return 1
                ;;
            q|Q)
                print_info "Setup cancelled by user"
                exit 0
                ;;
            *)
                echo "Invalid choice. Please enter b, o, s, or q."
                ;;
        esac
    done
}

# Get a single CloudFormation output value
get_cfn_output() {
    local output_key="$1"
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query "Stacks[0].Outputs[?OutputKey==\`$output_key\`].OutputValue" \
        --output text 2>/dev/null
}

# Fetch CloudFormation outputs
fetch_cloudformation_outputs() {
    print_info "Fetching CloudFormation outputs from stack: $STACK_NAME"

    # Check if stack exists
    if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" &> /dev/null; then
        print_error "CloudFormation stack '$STACK_NAME' not found."
        echo ""
        echo "  The infrastructure stack must be deployed first."
        echo "  To deploy the stack, run:"
        echo ""
        echo "    cd ../infra"
        echo "    npm install"
        echo "    cdk deploy"
        echo ""
        exit 1
    fi

    # Fetch each output
    API_URL=$(get_cfn_output "ApiUrl")
    USER_POOL_ID=$(get_cfn_output "UserPoolId")
    USER_POOL_CLIENT_ID=$(get_cfn_output "UserPoolClientId")
    COGNITO_REGION=$(get_cfn_output "CognitoRegion")

    # Validate outputs
    if [[ -z "$API_URL" || -z "$USER_POOL_ID" || -z "$USER_POOL_CLIENT_ID" || -z "$COGNITO_REGION" ]]; then
        print_error "Failed to fetch all required CloudFormation outputs."
        echo "  Please ensure the stack has been deployed successfully."
        exit 1
    fi

    print_success "CloudFormation outputs fetched successfully"
}

# Generate .env file
generate_env_file() {
    print_info "Generating $ENV_FILE file..."

    cat > "$ENV_FILE" << EOF
VITE_API_URL=$API_URL
VITE_USER_POOL_ID=$USER_POOL_ID
VITE_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID
VITE_AWS_REGION=$COGNITO_REGION
EOF

    print_success "Generated $ENV_FILE file"
}

# Install dependencies
install_dependencies() {
    print_info "Installing npm dependencies..."
    npm install
    print_success "Dependencies installed"
}

# Build frontend
build_frontend() {
    print_info "Building frontend..."
    npm run build
    print_success "Frontend built successfully"
}

# Main function
main() {
    local skip_env=false
    local dev_name=""
    local stage_name=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --skip-env)
                skip_env=true
                shift
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
            --profile)
                if [[ -z "${2:-}" ]]; then
                    print_error "--profile requires a profile name argument."
                    exit 1
                fi
                export AWS_PROFILE="$2"
                shift 2
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

    # Dynamic Stack Name construction
    STACK_NAME="$STACK_NAME_BASE"
    if [[ "$stage_name" == "prod" ]]; then
        # Production ignores dev name entirely
        STACK_NAME="${STACK_NAME}-prod"
    else
        # Standard flow: Base -> Dev -> Stage
        if [[ -n "$dev_name" ]]; then
            STACK_NAME="${STACK_NAME}-${dev_name}"
        fi
        if [[ -n "$stage_name" ]]; then
            STACK_NAME="${STACK_NAME}-${stage_name}"
        fi
    fi

    echo ""
    echo "=================================="
    echo "  Frontend Development Setup"
    echo "  Target Stack: $STACK_NAME"
    echo "=================================="
    echo ""

    # Check prerequisites
    aws_available=true
    if ! check_prerequisites; then
        aws_available=false
    fi
    echo ""

    # Handle .env generation
    if [[ "$skip_env" == true ]]; then
        print_info "Skipping .env generation (--skip-env flag)"
        if [[ ! -f "$ENV_FILE" ]]; then
            print_warning "No $ENV_FILE file exists. You may need to create one manually."
            echo "  See .env.example for the required variables."
        fi
    elif [[ "$aws_available" == false ]]; then
        print_warning "AWS CLI not available, skipping .env generation"
        if [[ ! -f "$ENV_FILE" ]]; then
            print_warning "No $ENV_FILE file exists. You may need to create one manually."
            echo "  See .env.example for the required variables."
        fi
    else
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

        if handle_existing_env; then
            fetch_cloudformation_outputs
            generate_env_file
        fi
    fi
    echo ""

    # Install dependencies
    install_dependencies
    echo ""

    # Build frontend
    build_frontend
    echo ""

    # Final success message
    echo "=================================="
    print_success "Setup complete!"
    echo "=================================="
    echo ""
    echo "To start the development server, run:"
    echo ""
    echo "  npm run dev"
    echo ""
}

# Run main
main "$@"