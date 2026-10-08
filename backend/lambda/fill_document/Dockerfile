FROM --platform=linux/arm64 public.ecr.aws/lambda/python:3.13

# Node.js is required by the claude CLI binary bundled inside claude-code-sdk
RUN dnf install -y nodejs npm && dnf clean all

# Install the Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Install Python dependencies
COPY fill_document/requirements.txt .
RUN pip install -r requirements.txt -t /var/task

# Copy handler and shared utilities
# Build context is backend/lambda/ so both fill_document/ and shared/ are accessible
COPY fill_document/handler.py /var/task/
COPY shared/ /var/task/shared/

CMD ["handler.handler"]
