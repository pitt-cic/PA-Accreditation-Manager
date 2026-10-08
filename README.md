

https://github.com/user-attachments/assets/c3068e54-1602-4a7b-b611-b4a04e9dcc92

# PA Accreditation Manager

| Index                         | Description                                         |
|:------------------------------|:----------------------------------------------------|
| [Overview](#overview)         | See what this project does and its key capabilities |
| [Demo](#demo)                 | View the demo video                                 |
| [Description](#description)   | Learn about the problem and our approach            |
| [Architecture](#architecture) | View the system architecture diagram                |
| [Tech Stack](#tech-stack)     | Technologies and services used                      |
| [Deployment](#deployment)     | How to install and deploy the solution              |
| [Usage](#usage)               | How to use the application                          |
| [Costs](#costs)               | Estimated AWS costs for running the solution        |
| [Credits](#credits)           | Meet the team behind this project                   |
| [License](#license)           | See the project's license information               |
| [Disclaimers](#disclaimers)   | Important legal disclaimers                         |

---

# Overview

PA Accreditation Manager is an **AI-Powered Accreditation Dashboard** designed to help University Physician Assistant Programs 
maintain and track their accreditation evidence. The solution leverages large language models (LLMs) to understand and create the 
complex mappings between course content and program data, along with how that data corresponds with standards. Program 
data is automatically mapped to current standards and can be traced end-to-end to see which specific pieces of evidence
tie into a standard as a whole.  

**Key capabilities include:**

- **Standards Tracking**: Displays all ARC-PA Accreditation Standards with readiness status indicators so programs can see their compliance status at a glance  
- **Evidence Management**: Links course data, and program data to specific ARC-PA standards, with support for file attachments and comments  
- **Human Reivew Workflow**: Reviewers can verify, flag for revision, or annotate the AI-generated evidence mappings with comments and links for cross-referencing  
- **Multi-year Audit Support**: Supports switching between audit years so programs can maintain several years of history to help with current audits, or to review past ones  
- **Curriculum Search**: A dedicated tab for searching across the curriculum to find coverage or gaps relative to specific parts of standards


---

# Demo

https://github.com/user-attachments/assets/2efb6b13-dd96-41d4-abb1-0b3ff9ac9c99

---

# Description

## Problem Statement

Physician Assistant programs are required to maintain ongoing accreditation through an accrediting body, which demands that the programs continuously map their curriculum evidence to specific accreditation standards. This process is almost entirely manual today, and can take hundreds of hours depending on the size of the program. Without a structured system, it's easy to miss small gaps in a program and it can be a struggle to get a clear picture of where they stand in their compliance coverage. Failing a compliance review can result in being put in a probationary period, which takes even more effort to get out of, or potentially losing accreditation as a whole.

## Our Approach

**Course Processing**  

   Users are able to upload their PA Programs Courses and any corresponding evidence into the system. When a syllabus is uploaded, the system extracts it's information and send it to Claude via AWS Bedrock. The model cross references pieces of the syllabus like Course Learning Outcomes, Instructional Objectives, and Assessments together, and then maps them to Program Goals and Competencies. This complex mapping is then stored into DynamoDB to be used in the next step of the process.

**Standard Mapping**

   When a user triggers mapping for a standard, the backend queues a job and fans out a parallel Claude call for every course in the database. Each call receives the standard's requirements, as well as the full course structure that was detailed in the previous step. Claude identifies specific elements of that class that support the standard, and the individual call returns those chosen elements. A second Claude call then aggregates together those individual calls to build a unified mapping of that standard using all of the data from your Universities Program.

**Human Review**

   After the AI maps a standard, every standard enters a human review workflow to ensure a human-in-the-loop aspect before anything is treated as final. A reviewer clicks a "Start Review", which surfaces the AI's readiness evaluation and evidence summary. The reviewers job is to go through the evidence returned as relevant for proving the standard is ready, then deliver a final verdict on whether the standard is considered ready or not ready. In addition, the reviewer is also able to leave comments on why they thought the standard was ready or not.

**Year Freezing**

   It's important to keep records of your program data from previous years, so there is a functionality to freeze your data at a certain time and label it for future use. When a year is frozen for audit the system takes a complete point-in-time snapshot of all standards, courses, goals, and competencies. After the snapshot is saved, the standard records are purged, giving you a clean slate to run them on the new year. Courses, goals, and competencies are left untouched for the new year, so any data that transitions over year-to-year stays and only new evidence or syllabi need to be put into the system.

## Testing & Validation

The whole process was tested extensively using pre-existing documents outlining a universities accreditation. All mappings were tested against this existing documentation, and every single course being used as supporting evidence for a standard was tested against this information as well.

---

# Architecture

<img src="docs/ARCPA Architecture Diagram.png" alt="Architecture Diagram" width="800">

---

# Tech Stack

| Category                      | Technology                                        | Purpose                               |
|:------------------------------|:--------------------------------------------------|:--------------------------------------|
| **Amazon Web Services (AWS)** | [Lambda](https://aws.amazon.com/lambda/)          | Serverless Inference Compute          |
|                               | [API Gateway](https://aws.amazon.com/api-gateway/)| REST API endpoint                     |
|                               | [Cognito](https://aws.amazon.com/cognito/)        | User authentication                   |
|                               | [Amplify Hosting](https://aws.amazon.com/amplify/)| Frontend hosting                      |
|                               | [DynamoDB](https://docs.aws.amazon.com/dynamodb/) | Database Storage                      |
|                               | [S3](https://docs.aws.amazon.com/s3/)             | Document Storage                      |
|                               | [SQS](https://docs.aws.amazon.com/sqs/)           | Processing Buffer Queue               |
|                               | [Bedrock](https://docs.aws.amazon.com/bedrock/)   | Access Access to Claude Sonnet 4.6 and Haiku 4.5   |
|                               | [Step Functions](https://docs.aws.amazon.com/step-functions/)           | Workflow Management  |
| **Backend**                   | [Python](https://www.python.org/)                 | Lambda function runtime               |
| **Frontend**                  | [React](https://react.dev/)                       | User interface framework              |
|                               | [Vite](https://vitejs.dev/)                       | Build tool and Dev server             |
|                               | [Tailwind CSS](https://tailwindcss.com/)          | Styling                               |
| **IaC**                       | [AWS CDK](https://aws.amazon.com/cdk/)            | Infrastructure as code                |


---

# Deployment

## Prerequisites

1. An [AWS account](https://signin.aws.amazon.com/signup?request_type=register) with appropriate IAM permissions
2. **Node.js v18+** — [Download here](https://nodejs.org/) or use [nvm](https://github.com/nvm-sh/nvm)
3. **AWS CLI** — [Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
4. **Docker** (running) — [Download here](https://www.docker.com/get-started/) — required by CDK to bundle Python Lambda functions
5. **zip** and **curl** — standard system utilities (`brew install zip` / `sudo apt install zip`)
6. **Git** — [Download here](https://git-scm.com/)

> AWS CDK is installed automatically as a local project dependency — no global install needed.

## AWS Configuration

Configure your credentials before running any deploy script:

```bash
aws configure
# or, for SSO:
aws sso login --profile <your-profile>
```

CDK bootstrap (one-time per AWS account/region) is run automatically by `deploy.sh` on first deploy. To skip it on subsequent runs pass `--skip-bootstrap`.

## Quick Start — Full Deploy

The root-level `deploy.sh` script handles everything in order: prerequisites check, AWS identity confirmation, infrastructure (CDK), then frontend (Amplify).

```bash
git clone https://github.com/[org]/[repo].git
cd arc-pa-dashboard

# Install frontend packages
cd frontend/
npm install
cd ..

# First-time production deploy (prompts for confirmation)
./deploy.sh

# Dev deploy with a named profile
./deploy.sh --dev alice --stage dev --profile aws-profile

# Production deploy, no prompts (e.g. CI)
./deploy.sh --stage prod --profile aws-profile --yes
```

**What the script does:**
1. Verifies Node.js, npm, Docker, AWS CLI, zip, and curl are present
2. Warns and confirms if defaulting to a production target
3. Displays and confirms the active AWS identity (once, shared across both phases)
4. Deploys CDK infrastructure — DynamoDB, Lambda, API Gateway, Cognito, S3, SQS, Step Functions, and an Amplify App
5. Builds the React frontend and deploys it to Amplify via zip upload

### `deploy.sh` options

| Flag | Default | Description |
|:-----|:--------|:------------|
| `--dev NAME` | — | Developer name (non-prod stacks) |
| `--stage STAGE` | `prod` | Deployment stage (`dev`, `stage`, `prod`) |
| `--profile NAME` | default | AWS CLI profile |
| `--branch NAME` | `main` | Github branch to deploy the Amplify frontend from |
| `--skip-bootstrap` | off | Skip CDK bootstrap (use after first deploy) |
| `--require-approval LEVEL` | `broadening` | CDK approval level: `never`, `any-change`, `broadening` |
| `--no-wait` | off | Don't poll for Amplify deployment completion |
| `--infra-only` | off | Deploy infrastructure only, skip frontend |
| `--frontend-only` | off | Deploy frontend only (infra must already exist) |
| `--yes` / `-y` | off | Skip all confirmation prompts |

> If neither `--dev` nor `--stage` is provided, the script defaults to a **production** deployment and requires explicit confirmation.

<details>
<summary><strong>Manual Deployment (individual scripts)</strong></summary>

### Infrastructure

```bash
cd infra
./deploy-infra.sh --dev alice --stage dev --profile aws-profile
# or for prod:
./deploy-infra.sh --stage prod --profile production --yes
```

Options mirror `deploy.sh`: `--dev`, `--stage`, `--profile`, `--skip-bootstrap`, `--require-approval`, `--yes`.

### Frontend

The frontend script reads CloudFormation outputs to generate the `.env` file automatically, then builds and uploads to Amplify.

```bash
cd frontend
./deploy-frontend.sh --dev alice --stage dev --profile aws-profile
# or for prod:
./deploy-frontend.sh --stage prod --profile production --yes
```

Additional frontend-only options: `--branch NAME`, `--skip-build`, `--no-wait`, `--cancel`.

</details>

## Local Development

```bash
cd frontend
npm install
./setup-dev.sh --stage dev --dev user
npm run dev
```

The dev server reads from `.env`. Run `frontend/setup-dev.sh` to auto-generate `.env` from an existing CloudFormation stack.

## Backend Scripts

### Getting the Standards

To get the standards to seed the database with, you need to download the latest Compliance Manual found [here](https://www.arc-pa.org/entry-level-program/accreditation-standards/)  

Then you need to give that PDF and the prompt below to any AI model to extract the standards as a JSON file:

```
You are extracting the ARC-PA Compliance Manual, 6th Edition (PDF attached) into a single structured JSON object. Read the entire manual and output only valid JSON — no commentary, no markdown fences.

Top-level object (exactly these keys):

json
{
  "edition": "6th",
  "effective_date": "September 1, 2025",
  "last_updated": null,
  "title": "Accreditation Standards for Physician Assistant Education, 6th Edition",
  "sections": [ ... ]
}

Each section → { "id", "title", "description": null, "standards": [...] }

id is the letter (A–E); title is the section name as printed (e.g., "Administration", "Curriculum and Instruction", "Program Self-Assessment", "Provisional Accreditation", "Accreditation Maintenance"). description is always null.

Each standard → { "id", "title", "description": null, "requirements": [...] }

id like A1, B2. title is literally "Standard " + id (e.g., "Standard A1"). description is always null.

Each requirement → { "id", "text", "sub_requirements", "annotations", "compliance_guidance" }

text: the requirement's stem sentence, verbatim.
sub_requirements: array of { "id", "text" } where id is the letter (a, b, …) or roman numeral (i, ii, …) and text is that item verbatim. Use [] if there are none.
annotations: the superscript annotation reference printed on the standard (e.g., "1B", "99B"), or a special enforcement phrase exactly as printed (e.g., "ENFORCEMENT OF THIS STANDARD IS ON HOLD"), or null if none.
compliance_guidance: either null (if the manual gives no guidance for it) or an object with exactly these three keys, each an array of verbatim strings (use [] for a category that's absent):
json
  { "focused_questions": [...], "essential_evidence": [...], "notes": [...] }

Critical splitting rule for lettered requirements:

If a requirement has lettered sub-points that share one block of compliance guidance, keep it as one entry. Its id spans the range (e.g., A1.01a-d) and sub_requirements holds all the letters.
If each lettered sub-point has its own focused questions / essential evidence / notes in the manual, split it into separate requirement entries:
The first entry's id spans the full range (e.g., A1.02a-h), its text is just the stem, its sub_requirements contains only letter a, and its compliance_guidance + annotations are those of item a/the overall standard.
Each subsequent letter becomes its own entry: id is the single letter form (e.g., A1.02b), text is the stem plus that lettered clause (e.g., "The sponsoring institution is responsible for: b) supporting the program faculty in effective program self-assessment"), sub_requirements contains just that one letter, and it carries that letter's own guidance.
Nested roman-numeral items (i, ii) stay inside their parent letter's entry as sub_requirements.

Preserve all source wording exactly (including symbols like ≥ and %). Output requirements in document order. Return the complete JSON for all five sections A–E in one response.
```

### Seed Standards Data

The `seed_standards.py` script populates the DynamoDB standards table from the standards JSON file.

**Prerequisites:**
- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip
- AWS credentials configured

**Running with uv (recommended):**

```bash
cd backend/scripts

# Create venv and install dependencies
uv venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.txt

# Run the script
uv run python seed_standards.py --stage dev --dev yourname

# Or for production
uv run python seed_standards.py --stage prod
```

**Running with pip:**

```bash
cd backend/scripts
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python seed_standards.py --stage dev --dev yourname
```

**Options:**

| Flag | Description |
|:-----|:------------|
| `--stage` | **Required.** Deployment stage (dev, beta, prod) |
| `--dev` | **Required for non-prod.** Developer name |
| `--region` | AWS region (default: us-east-1) |
| `--profile` | AWS profile name (default: uses AWS_PROFILE env or default) |
| `--standards` | Path to standards JSON file (default: prototype/data/output/standards_6th.json) |
| `--dry-run` | Preview without writing to DynamoDB |

The script will:
1. Display and confirm the AWS identity being used
2. Fetch the correct table name from CloudFormation stack outputs
3. Load and validate the standards data
4. Write items to DynamoDB (with overwrite confirmation if table has existing data)

---

# Usage

1. **Access the Application**:

   Once deployed, access the web interface using the Amplify URL. Run the deploy script (`./deploy.sh`) to view your application URL and other deployment details.

2. **User Registration / Login**:

   User accounts are managed by administrators in Amazon Cognito. Users only need to be added by email, and they will provide their name and set their login details upon their first login.

3. **Upload or Prepare Data**:
   
   Upon first entering the site you will be prompted to add Program Goals and Program Competencies into the site as a PDF format. Once that information has been put into the system then the user is able to upload Class Syllabi, Assessments, and Assignments in the "Courses" tab.

4. **Core Action**:

   To run standards against your evidence you can navigate to the "Standards" tab and go to the "B2: Curriculum" dropdown to view the standards relating to Didactic Curriculum. Click on any standard to view its details, and hit the "Rerun" button to aggregate supporting evidence for that standard. Any supporting evidence from standards can be attached directly using file attachment. Specific parts of the curriculum can be viewed from the "Curriculum Search" tab, where you can search for any topic within the curriculum and see where it is taught.

5. **View / Export Results**:

   An administrator can add the necessary export templates into the s3 bucket inside a "templates/" folder to be accessed from the main site. To export your evidence into ARC-PA complaint xlsx files go to the "Standards" tab, then navigate to the "Export" page at the top and select which template you want to export.

---

# Costs

## Estimated Monthly Recurring Costs

| Service              | Estimated Cost  | Notes                                               |
|:---------------------|----------------:|:----------------------------------------------------|
| AWS Lambda           |             ~$0 | Free tier covers typical usage                      |
| Amazon DynamoDB      |             ~$0 | Pay-per-request; negligible at program scale        |
| Amazon S3            |             <$1 | Storage for syllabi and assessment PDFs             |
| AWS Step Functions   |             ~$0 | Pay-per-state-transition; free tier covers usage    |
| Amazon SQS           |             ~$0 | Free tier covers typical usage                      |
| Amazon Bedrock       |    *see below*  | Billed per token; dominant cost driver              |
| **Total Baseline**   |        **<$2**  | Excluding Bedrock LLM usage                         |

## Per-Invocation Costs (Amazon Bedrock)

All LLM calls use Amazon Bedrock cross-region inference. Pricing as of August 2026.

### Processing one course (upload + syllabus map)

| Step | Model | Input tokens | Output tokens | Cost |
|:-----|:------|-------------:|--------------:|-----:|
| Classify syllabus PDF | Haiku 4.5 | ~8,500 | ~100 | ~$0.007 |
| Classify ~3 assessment PDFs | Haiku 4.5 | ~25,500 | ~300 | ~$0.021 |
| Map ~3 assessments to CLOs | Haiku 4.5 | ~27,000 | ~240 | ~$0.022 |
| Syllabus map — pass 1 (extraction) | Sonnet 4.6 | ~8,600 | ~1,500 | ~$0.049 |
| Syllabus map — pass 2 (cross-reference) | Sonnet 4.6 | ~4,600 | ~3,000 | ~$0.059 |
| **Total per course** | | | | **~$0.16** |

### Mapping one ARC-PA standard (~20 courses in system)

| Step | Model | Input tokens | Output tokens | Cost |
|:-----|:------|-------------:|--------------:|-----:|
| Course→standard mapper × 20 courses | Sonnet 4.6 | ~138,000 | ~24,000 | ~$0.78 |
| Aggregator (synthesize 20 course mappings) | Sonnet 4.6 | ~22,000 | ~2,500 | ~$0.10 |
| **Total per standard** | | | | **~$0.88** |

> **Note:** Actual costs vary based on document length, number of CLOs, and number of relevant courses per standard. Estimates based on AWS Bedrock pricing as of August 2026.

---

# Credits

**ARC-PA Dashboard** is an open-source project developed by the University of Pittsburgh Cloud Innovation Center.

**Development Team:**

- [Sean Milliken](https://www.linkedin.com/in/sean-milliken/)  
- [Dallas Blowers](https://www.linkedin.com/in/dallas-blowers/)  

**Project Leadership:**

- **Technical Lead**: [Maciej Zukowski](https://www.linkedin.com/in/maciejzukowski/) — Solutions Architect, Amazon Web Services (AWS)  
- **Program Manager**: [Dwigth Helfrich](https://www.linkedin.com/in/dwight-helfrich-53a233b/) — Program Leader, University of Pittsburgh Cloud Innovation Center  

**Special Thanks**:

- [Dipu Patel](https://www.linkedin.com/in/dipupatel/) — Vice Chair of Innovation, University of Pittsburgh

> This project is designed and developed with guidance and support from
> the [Health Sciences and Sports Analytics Cloud Innovation Center, powered by AWS](https://digital.pitt.edu/cic).

---

# License

This project is licensed under the [MIT License](./LICENSE).

```plaintext
MIT License

Copyright (c) 2026 University of Pittsburgh Health Sciences and Sports Analytics Cloud Innovation Center

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

For questions, issues, or contributions, please visit our [GitHub repository](https://github.com/pitt-cic/PA-Accreditation-Manager) or
contact the development team.

---

# Disclaimers

**Customers are responsible for making their own independent assessment of the information in this document.**

**This document:**  
(a) is for informational purposes only,  
(b) references AWS product offerings and practices, which are subject to change without notice,  
(c) does not create any commitments or assurances from AWS and its affiliates, suppliers or licensors. AWS products or
services are provided "as is" without warranties, representations, or conditions of any kind, whether express or
implied. The responsibilities and liabilities of AWS to its customers are controlled by AWS agreements, and this
document is not part of, nor does it modify, any agreement between AWS and its customers, and  
(d) is not to be considered a recommendation or viewpoint of AWS.

**Additionally, you are solely responsible for testing, security and optimizing all code and assets on GitHub repo, and
all such code and assets should be considered:**  
(a) as-is and without warranties or representations of any kind,  
(b) not suitable for production environments, or on production or other critical data, and  
(c) to include shortcuts in order to support rapid prototyping such as, but not limited to, relaxed authentication and
authorization and a lack of strict adherence to security best practices.

**All work produced is open source. More information can be found in the GitHub repo.**
