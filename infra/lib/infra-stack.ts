import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import {Construct} from 'constructs';

interface ComponentBoilerplateProps extends cdk.StackProps {
  readonly stackName: string; // e.g., 'myapp-dev-alice-uiux'
  readonly stageName: string;   // e.g., 'dev'
  readonly developerName?: string; // e.g., 'alice' (optional for prod)
  readonly tableRemovalPolicy: cdk.RemovalPolicy; // Injected from app.ts based on stage
}

export class InfraStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ComponentBoilerplateProps) {
        super(scope, id, props);


        // ========== ARCPA Evidence Finder Infrastructure ==========

        // DynamoDB Table for Standards
        // Note to self: Don't change the "StandardsTable" logical ID or the partition/sort keys, as these are referenced in the Lambda code and outputs. You can add new tables or indexes as needed, but keep this stable to avoid breaking changes. - DB
        const standardsTable = new dynamodb.Table(this, `StandardsTable-${props.stackName}`, {
            // tableName: 'arcpa-standards', Removed as I believe CDK will auto-generate a unique name which is safer for deployments across multiple environments (dev/beta/prod) and developers and retain should ensure persistence across deployments even without a fixed name
            partitionKey: {name: 'standard_id', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.tableRemovalPolicy || cdk.RemovalPolicy.RETAIN, // Use injected removal policy
            pointInTimeRecovery: true,
        });

        // GSI1: Status Index for querying by processing status
        standardsTable.addGlobalSecondaryIndex({
            indexName: 'gsi1-status',
            partitionKey: {name: 'gsi1_pk', type: dynamodb.AttributeType.STRING},
            sortKey: {name: 'gsi1_sk', type: dynamodb.AttributeType.STRING},
            projectionType: dynamodb.ProjectionType.ALL,
        });

        // DynamoDB Table for Comments
        const commentsTable = new dynamodb.Table(this, `CommentsTable-${props.stackName}`, {
            // tableName: 'arcpa-comments', Disabling explicit table name for same reasons as above
            partitionKey: {name: 'standard_id', type: dynamodb.AttributeType.STRING},
            sortKey: {name: 'comment_id', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.tableRemovalPolicy || cdk.RemovalPolicy.RETAIN, // Use injected removal policy
            pointInTimeRecovery: true,
        });

        // GSI for querying comments by target (evidence item, question, or standard)
        commentsTable.addGlobalSecondaryIndex({
            indexName: 'gsi1-target',
            partitionKey: {name: 'standard_id', type: dynamodb.AttributeType.STRING},
            sortKey: {name: 'target_key', type: dynamodb.AttributeType.STRING},
            projectionType: dynamodb.ProjectionType.ALL,
        });

    /** S3 bucket for file storage */
    const docsBucket = new s3.Bucket(this, `docsbucket-${props.stackName}`, {
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(365),
        },
      ],
      blockPublicAccess: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [{
        allowedOrigins: ['*'],
        allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
        allowedHeaders: ['*'],
        exposedHeaders: ['ETag'],
        maxAge: 3000,
      }],
    });

        // DynamoDB Table for document classification results
        const documentsTable = new dynamodb.Table(this, `DocumentsTable-${props.stackName}`, {
            partitionKey: { name: 's3_key', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.tableRemovalPolicy || cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });

        // Helper function for Lambda bundling (includes shared code)
        const lambdaBasePath = path.join(__dirname, '../../backend/lambda');
        const createLambdaCode = (lambdaDir: string) =>
            lambda.Code.fromAsset(lambdaBasePath, {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_13.bundlingImage,
                    platform: 'linux/arm64',
                    command: [
                        'bash',
                        '-c',
                        `cd ${lambdaDir} && pip install -r requirements.txt -t /asset-output && ` +
                            `cp -a . /asset-output && ` +
                            `cp -a ../shared /asset-output/shared`,
                    ],
                },
            });

        // ========== Standard Mapping Pipeline (Workflows 4 & 5) ==========

        // DynamoDB Table for Courses (WF2/3 output — enriched course data from syllabus + assessment mappers)
        const coursesTable = new dynamodb.Table(this, `CoursesTable-${props.stackName}`, {
            partitionKey: {name: 'course_id', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.tableRemovalPolicy || cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });
        coursesTable.addGlobalSecondaryIndex({
            indexName: 'gsi1-audit-year',
            partitionKey: {name: 'audit_year', type: dynamodb.AttributeType.STRING},
            projectionType: dynamodb.ProjectionType.ALL,
        });

        // DynamoDB Table for Program Goals
        const goalsTable = new dynamodb.Table(this, `GoalsTable-${props.stackName}`, {
            partitionKey: {name: 'id', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.tableRemovalPolicy || cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });
        goalsTable.addGlobalSecondaryIndex({
            indexName: 'gsi1-audit-year',
            partitionKey: {name: 'audit_year', type: dynamodb.AttributeType.STRING},
            projectionType: dynamodb.ProjectionType.ALL,
        });

        // DynamoDB Table for Program Competencies
        const competenciesTable = new dynamodb.Table(this, `CompetenciesTable-${props.stackName}`, {
            partitionKey: {name: 'id', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.tableRemovalPolicy || cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });
        competenciesTable.addGlobalSecondaryIndex({
            indexName: 'gsi1-audit-year',
            partitionKey: {name: 'audit_year', type: dynamodb.AttributeType.STRING},
            projectionType: dynamodb.ProjectionType.ALL,
        });

        // DynamoDB Table for Linked Standards (WF5 output)
        const linkedStandardsTable = new dynamodb.Table(this, `LinkedStandardsTable-${props.stackName}`, {
            partitionKey: {name: 'standard_id', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.tableRemovalPolicy || cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });

        // GSI for querying linked standards by audit year (frozen snapshots)
        linkedStandardsTable.addGlobalSecondaryIndex({
            indexName: 'gsi1-audit-year',
            partitionKey: {name: 'audit_year', type: dynamodb.AttributeType.STRING},
            projectionType: dynamodb.ProjectionType.ALL,
        });

        // DynamoDB Table for audit year amendment log — append-only, permanent records
        const auditAmendmentsTable = new dynamodb.Table(this, `AuditAmendmentsTable-${props.stackName}`, {
            partitionKey: {name: 'audit_year', type: dynamodb.AttributeType.STRING},
            sortKey: {name: 'amendment_id', type: dynamodb.AttributeType.STRING}, // Format: {standard_id}#{timestamp}
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.tableRemovalPolicy || cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });

        // DynamoDB Table for reviewer file attachments (TTL auto-expires unconfirmed uploads)
        const attachmentsTable = new dynamodb.Table(this, `AttachmentsTable-${props.stackName}`, {
            partitionKey: {name: 'standard_id', type: dynamodb.AttributeType.STRING},
            sortKey: {name: 'attachment_id', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.tableRemovalPolicy || cdk.RemovalPolicy.RETAIN,
            timeToLiveAttribute: 'ttl',
            pointInTimeRecovery: true,
        });

        // DynamoDB Table for intermediate WF4 mapping results — keeps Step Functions state small.
        // PK: mapping_key (<standard_id>-<timestamp>), SK: course_id. TTL auto-expires rows after 24h.
        const mappingResultsTable = new dynamodb.Table(this, `MappingResultsTable-${props.stackName}`, {
            partitionKey: {name: 'mapping_key', type: dynamodb.AttributeType.STRING},
            sortKey: {name: 'course_id', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'ttl',
        });

        // DynamoDB Table for fill-document async job status. TTL auto-expires rows after 24h.
        const fillDocumentJobsTable = new dynamodb.Table(this, `FillDocumentJobsTable-${props.stackName}`, {
            partitionKey: {name: 'job_id', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'ttl',
        });

        const LINKED_STANDARDS_AUDIT_YEAR_INDEX_NAME = 'gsi1-audit-year';

        // Environment variables shared by get_standards, get_standard, and other read/write Lambdas
        const lambdaEnv = {
            STANDARDS_TABLE: standardsTable.tableName,
            COMMENTS_TABLE: commentsTable.tableName,
            LINKED_STANDARDS_TABLE: linkedStandardsTable.tableName,
            LINKED_STANDARDS_AUDIT_YEAR_INDEX: LINKED_STANDARDS_AUDIT_YEAR_INDEX_NAME,
            ATTACHMENTS_TABLE: attachmentsTable.tableName,
            S3_DOCUMENTS_BUCKET: docsBucket.bucketName,
            QUERY_MODEL_ID: 'us.anthropic.claude-sonnet-4-6',
            ANALYSIS_MODEL_ID: 'us.anthropic.claude-opus-4-5-20251101-v1:0',
            SYLLABUS_MODEL_ID: 'us.anthropic.claude-sonnet-4-6',
            CLASSIFIER_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
            DOCUMENTS_TABLE: documentsTable.tableName,
        };

        // SQS DLQ for standard mapping failures
        const standardMappingDlq = new sqs.Queue(this, `StandardMappingDLQ-${props.stackName}`, {
            retentionPeriod: cdk.Duration.days(14),
        });

        // SQS Queue for standard mapping requests (one message = one standard to process)
        const standardMappingQueue = new sqs.Queue(this, `StandardMappingQueue-${props.stackName}`, {
            visibilityTimeout: cdk.Duration.minutes(15),
            retentionPeriod: cdk.Duration.days(4),
            deadLetterQueue: {
                queue: standardMappingDlq,
                maxReceiveCount: 3,
            },
        });

        // Lambda: Course-Standard Mapper (WF4 — invoked by Step Functions Map state)
        const courseStandardMapperFunction = new lambda.Function(this, `CourseStandardMapperFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('course_standard_mapper'),
            timeout: cdk.Duration.minutes(15),
            memorySize: 512,
            environment: {
                MAPPER_MODEL_ID: 'us.anthropic.claude-sonnet-4-6',
                AWS_REGION_NAME: this.region,
                COURSES_TABLE: coursesTable.tableName,
                MAPPING_RESULTS_TABLE: mappingResultsTable.tableName,
                READ_TIMEOUT: '840',
            },
        });

        // Lambda: Mapping Aggregator (WF5 — invoked after Map state collects results)
        const mappingAggregatorFunction = new lambda.Function(this, `MappingAggregatorFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('mapping_aggregator'),
            timeout: cdk.Duration.minutes(10),
            memorySize: 1024,
            environment: {
                AGGREGATOR_MODEL_ID: 'us.anthropic.claude-sonnet-4-6',
                LINKED_STANDARDS_TABLE: linkedStandardsTable.tableName,
                STANDARDS_TABLE: standardsTable.tableName,
                MAPPING_RESULTS_TABLE: mappingResultsTable.tableName,
                S3_DOCUMENTS_BUCKET: docsBucket.bucketName,
                AWS_REGION_NAME: this.region,
            },
        });

        // Step Function: Map all courses to a standard, then aggregate
        const mapCoursesState = new tasks.LambdaInvoke(this, `MapCourseToStandard-${props.stackName}`, {
            lambdaFunction: courseStandardMapperFunction,
            outputPath: '$.Payload',
            retryOnServiceExceptions: true,
        });
        mapCoursesState.addRetry({
            errors: ['States.TaskFailed'],
            interval: cdk.Duration.seconds(10),
            maxAttempts: 2,
            backoffRate: 2,
        });

        const fanOutCourses = new sfn.Map(this, `FanOutCourses-${props.stackName}`, {
            itemsPath: '$.courses',
            parameters: {
                'standard.$': '$.standard',
                'course.$': '$$.Map.Item.Value',
                'mapping_key.$': '$.mapping_key',
            },
            maxConcurrency: 10,
            resultPath: '$.mapping_results',
        });
        fanOutCourses.itemProcessor(mapCoursesState);

        const aggregateState = new tasks.LambdaInvoke(this, `AggregateMappings-${props.stackName}`, {
            lambdaFunction: mappingAggregatorFunction,
            outputPath: '$.Payload',
            retryOnServiceExceptions: true,
        });
        aggregateState.addRetry({
            errors: ['States.TaskFailed'],
            interval: cdk.Duration.seconds(10),
            maxAttempts: 2,
            backoffRate: 2,
        });

        const mappingWorkflowDefinition = fanOutCourses.next(aggregateState);

        const mappingStateMachine = new sfn.StateMachine(this, `MappingStateMachine-${props.stackName}`, {
            definitionBody: sfn.DefinitionBody.fromChainable(mappingWorkflowDefinition),
            timeout: cdk.Duration.hours(1),
        });

        // Lambda: Kickoff (SQS-triggered, starts the Step Function)
        const triggerMapStandardFunction = new lambda.Function(this, `TriggerMapStandardFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('trigger_map_standard'),
            timeout: cdk.Duration.seconds(30),
            environment: {
                STANDARDS_TABLE: standardsTable.tableName,
                COURSES_TABLE: coursesTable.tableName,
                STATE_MACHINE_ARN: mappingStateMachine.stateMachineArn,
                AWS_REGION_NAME: this.region,
            },
        });

        // SQS triggers the kickoff Lambda — maxConcurrency caps simultaneous Bedrock calls
        triggerMapStandardFunction.addEventSource(
            new lambdaEventSources.SqsEventSource(standardMappingQueue, {
                batchSize: 1,
                maxConcurrency: 2,
            })
        );

        // Lambda: DLQ handler — marks standards as error after SQS retries are exhausted
        const mappingDlqHandlerFunction = new lambda.Function(this, `MappingDlqHandlerFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('mapping_dlq_handler'),
            timeout: cdk.Duration.seconds(30),
            environment: {
                STANDARDS_TABLE: standardsTable.tableName,
            },
        });
        standardsTable.grantReadWriteData(mappingDlqHandlerFunction);

        // DLQ triggers the DLQ handler
        mappingDlqHandlerFunction.addEventSource(
            new lambdaEventSources.SqsEventSource(standardMappingDlq, {
                batchSize: 10,
            })
        );

        // Lambda: Mapping Error Handler — writes 'error' status when Step Function fails
        const mappingErrorHandlerFunction = new lambda.Function(this, `MappingErrorHandlerFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('mapping_error_handler'),
            timeout: cdk.Duration.seconds(10),
            environment: {
                STANDARDS_TABLE: standardsTable.tableName,
            },
        });
        standardsTable.grantReadWriteData(mappingErrorHandlerFunction);

        // Step Function Catch: on aggregator failure, write error status then fail the execution
        const markErrorState = new tasks.LambdaInvoke(this, `MarkMappingError-${props.stackName}`, {
            lambdaFunction: mappingErrorHandlerFunction,
            payload: sfn.TaskInput.fromObject({
                'standard_id': sfn.JsonPath.stringAt('$.standard.standard_id'),
                'error': sfn.JsonPath.stringAt('$.error.Error'),
                'cause': sfn.JsonPath.stringAt('$.error.Cause'),
            }),
        });

        // After marking the error, transition to a Fail state so the execution is clearly FAILED
        const failState = new sfn.Fail(this, `MappingFailed-${props.stackName}`, {
            error: 'MappingPipelineFailed',
            cause: 'Aggregation step failed after retries — status written to StandardsTable',
        });
        markErrorState.next(failState);

        aggregateState.addCatch(markErrorState, {
            errors: ['States.ALL'],
            resultPath: '$.error',
        });

        fanOutCourses.addCatch(markErrorState, {
            errors: ['States.ALL'],
            resultPath: '$.error',
        });

        // IAM: Bedrock invoke for mapper and aggregator
        const bedrockInvokePolicy = new iam.PolicyStatement({
            actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
            resources: ['*'],
        });
        courseStandardMapperFunction.addToRolePolicy(bedrockInvokePolicy);
        mappingAggregatorFunction.addToRolePolicy(bedrockInvokePolicy);

        // Lambda: Map Section (API-facing, fans out one SQS message per standard in the section)
        const mapSectionFunction = new lambda.Function(this, `MapSectionFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('map_section'),
            timeout: cdk.Duration.seconds(30),
            environment: {
                STANDARDS_TABLE: standardsTable.tableName,
                STANDARD_MAPPING_QUEUE_URL: standardMappingQueue.queueUrl,
            },
        });
        standardsTable.grantReadData(mapSectionFunction);
        standardMappingQueue.grantSendMessages(mapSectionFunction);

        // Lambda: Queue Standard Mapping (API-facing, puts message on SQS)
        const queueStandardMappingFunction = new lambda.Function(this, `QueueStandardMappingFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('queue_standard_mapping'),
            timeout: cdk.Duration.seconds(30),
            environment: {
                STANDARDS_TABLE: standardsTable.tableName,
                STANDARD_MAPPING_QUEUE_URL: standardMappingQueue.queueUrl,
            },
        });

        // Lambda: Get Linked Standard (reads WF5 output from LinkedStandardsTable)
        const getLinkedStandardFunction = new lambda.Function(this, `GetLinkedStandardFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_linked_standard'),
            timeout: cdk.Duration.seconds(30),
            environment: {
                LINKED_STANDARDS_TABLE: linkedStandardsTable.tableName,
                S3_DOCUMENTS_BUCKET: docsBucket.bucketName,
            },
        });

        // IAM: Table and service permissions for mapping pipeline
        standardsTable.grantReadWriteData(triggerMapStandardFunction);
        standardsTable.grantReadWriteData(queueStandardMappingFunction);
        queueStandardMappingFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['states:DescribeExecution'],
            resources: [
                this.formatArn({
                    service: 'states',
                    resource: 'execution',
                    resourceName: `${mappingStateMachine.stateMachineName}:*`,
                    arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
                }),
            ],
        }));
        coursesTable.grantReadData(triggerMapStandardFunction);
        coursesTable.grantReadData(courseStandardMapperFunction);
        mappingResultsTable.grantWriteData(courseStandardMapperFunction);
        mappingResultsTable.grantReadData(mappingAggregatorFunction);
        linkedStandardsTable.grantReadWriteData(mappingAggregatorFunction);
        standardsTable.grantReadWriteData(mappingAggregatorFunction);
        linkedStandardsTable.grantReadData(getLinkedStandardFunction);
        mappingStateMachine.grantStartExecution(triggerMapStandardFunction);
        standardMappingQueue.grantSendMessages(queueStandardMappingFunction);
        standardMappingQueue.grantConsumeMessages(triggerMapStandardFunction);

        // Lambda: Get Courses (list all)
        const getCoursesFunction = new lambda.Function(this, `GetCoursesFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_courses'),
            timeout: cdk.Duration.seconds(30),
            environment: {
                COURSES_TABLE: coursesTable.tableName,
                COURSES_AUDIT_YEAR_INDEX: 'gsi1-audit-year',
            },
        });
        coursesTable.grantReadData(getCoursesFunction);

        // Lambda: Get Goals (list all)
        const getGoalsFunction = new lambda.Function(this, `GetGoalsFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_goals'),
            timeout: cdk.Duration.seconds(30),
            environment: {
                GOALS_TABLE: goalsTable.tableName,
                GOALS_AUDIT_YEAR_INDEX: 'gsi1-audit-year',
                COURSES_TABLE: coursesTable.tableName,
                COURSES_AUDIT_YEAR_INDEX: 'gsi1-audit-year',
            },
        });
        goalsTable.grantReadData(getGoalsFunction);
        coursesTable.grantReadData(getGoalsFunction);

        // Lambda: Upload Goals (extract from PDF and persist to GoalsTable)
        const uploadGoalsFunction = new lambda.Function(this, `UploadGoalsFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('upload_goals'),
            timeout: cdk.Duration.seconds(60),
            environment: {
                S3_DOCUMENTS_BUCKET: docsBucket.bucketName,
                GOALS_TABLE: goalsTable.tableName,
            },
        });
        docsBucket.grantRead(uploadGoalsFunction);
        goalsTable.grantWriteData(uploadGoalsFunction);

        // Lambda: Upload Competencies (extract from PDF and persist to CompetenciesTable)
        const uploadCompetenciesFunction = new lambda.Function(this, `UploadCompetenciesFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('upload_competencies'),
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            environment: {
                S3_DOCUMENTS_BUCKET: docsBucket.bucketName,
                COMPETENCIES_TABLE: competenciesTable.tableName,
            },
        });
        docsBucket.grantRead(uploadCompetenciesFunction);
        competenciesTable.grantWriteData(uploadCompetenciesFunction);

        // Lambda: Compute Mappings (aggregate CLO→goal/competency from all courses)
        const computeMappingsFunction = new lambda.Function(this, `ComputeMappingsFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('compute_mappings'),
            timeout: cdk.Duration.minutes(5),
            environment: {
                GOALS_TABLE: goalsTable.tableName,
                COMPETENCIES_TABLE: competenciesTable.tableName,
                COURSES_TABLE: coursesTable.tableName,
            },
        });
        goalsTable.grantReadWriteData(computeMappingsFunction);
        competenciesTable.grantReadWriteData(computeMappingsFunction);
        coursesTable.grantReadData(computeMappingsFunction);

        // Lambda: Get Competencies (list all)
        const getCompetenciesFunction = new lambda.Function(this, `GetCompetenciesFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_competencies'),
            timeout: cdk.Duration.seconds(30),
            environment: {
                COMPETENCIES_TABLE: competenciesTable.tableName,
                COMPETENCIES_AUDIT_YEAR_INDEX: 'gsi1-audit-year',
                COURSES_TABLE: coursesTable.tableName,
                COURSES_AUDIT_YEAR_INDEX: 'gsi1-audit-year',
            },
        });
        competenciesTable.grantReadData(getCompetenciesFunction);
        coursesTable.grantReadData(getCompetenciesFunction);

        // Lambda: Get Standards (list all)
        const getStandardsFunction = new lambda.Function(this, `GetStandardsFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_standards'),
            // functionName: 'arcpa-get-standards', Disabling explicit function name for same reasons as above - I believe this is a case where using the stack name to dynamically name would be fine, but don't know which is a better practice.
            timeout: cdk.Duration.seconds(30),
            environment: lambdaEnv,
        });

        // Lambda: Get Standard (single)
        const getStandardFunction = new lambda.Function(this, `GetStandardFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_standard'),
            // functionName: 'arcpa-get-standard', Disabling explicit function name for same reasons as above - I believe this is a case where using the stack name to dynamically name would be fine, but don't know which is a better practice.
            timeout: cdk.Duration.seconds(30),
            environment: lambdaEnv,
        });

        // Lambda: List Files
        const listFilesFunction = new lambda.Function(this, `ListFilesFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('list_files'),
            // functionName: 'arcpa-list-files', Disabling explicit function name for same reasons as above - I believe this is a case where using the stack name to dynamically name would be fine, but don't know which is a better practice.
            timeout: cdk.Duration.seconds(30),
            environment: lambdaEnv,
        });

        // Lambda: Add Comment
        const addCommentFunction = new lambda.Function(this, `AddCommentFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('add_comment'),
            // functionName: 'arcpa-add-comment', Disabling explicit function name for same reasons as above - I believe this is a case where using the stack name to dynamically name would be fine, but don't know which is a better practice.
            timeout: cdk.Duration.seconds(30),
            environment: lambdaEnv,
        });

        // Lambda: Delete Comment
        const deleteCommentFunction = new lambda.Function(this, `DeleteCommentFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('delete_comment'),
            // functionName: 'arcpa-delete-comment', Disabling explicit function name for same reasons as above - I believe this is a case where using the stack name to dynamically name would be fine, but don't know which is a better practice.
            timeout: cdk.Duration.seconds(30),
            environment: lambdaEnv,
        });

        // Lambda: Resolve Item
        const resolveItemFunction = new lambda.Function(this, `ResolveItemFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('resolve_item'),
            // functionName: 'arcpa-resolve-item', Disabling explicit function name for same reasons as above - I believe this is a case where using the stack name to dynamically name would be fine, but don't know which is a better practice.
            timeout: cdk.Duration.seconds(30),
            environment: lambdaEnv,
        });

        // Lambda: Update Human Review
        const updateHumanReviewFunction = new lambda.Function(this, `UpdateHumanReviewFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('update_human_review'),
            timeout: cdk.Duration.seconds(30),
            environment: lambdaEnv,
        });

        // Lambda: Update Linked Review (WF5 human review on LinkedStandardsTable)
        const updateLinkedReviewFunction = new lambda.Function(this, `UpdateLinkedReviewFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('update_linked_review'),
            timeout: cdk.Duration.seconds(30),
            environment: {
                LINKED_STANDARDS_TABLE: linkedStandardsTable.tableName,
            },
        });
        linkedStandardsTable.grantReadWriteData(updateLinkedReviewFunction);

        // Lambda: Post Attachment (generate presigned upload URL + write metadata)
        const postAttachmentFunction = new lambda.Function(this, `PostAttachmentFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('post_attachment'),
            timeout: cdk.Duration.seconds(30),
            environment: lambdaEnv,
        });
        attachmentsTable.grantReadWriteData(postAttachmentFunction);
        docsBucket.grantPut(postAttachmentFunction);

        // Lambda: Delete Attachment (remove S3 object + DynamoDB record)
        const deleteAttachmentFunction = new lambda.Function(this, `DeleteAttachmentFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('delete_attachment'),
            timeout: cdk.Duration.seconds(30),
            environment: lambdaEnv,
        });
        attachmentsTable.grantReadWriteData(deleteAttachmentFunction);
        docsBucket.grantDelete(deleteAttachmentFunction);

        // Lambda: Confirm Attachment (mark upload_confirmed=True after S3 PUT succeeds)
        const confirmAttachmentFunction = new lambda.Function(this, `ConfirmAttachmentFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('confirm_attachment'),
            timeout: cdk.Duration.seconds(30),
            environment: lambdaEnv,
        });
        attachmentsTable.grantReadWriteData(confirmAttachmentFunction);

        // Lambda: Document Classifier
        const docClassifierFunction = new lambda.Function(this, `DocClassifierFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('doc_classifier'),
            timeout: cdk.Duration.minutes(2),
            environment: lambdaEnv,
        });

        // DynamoDB Permissions
        standardsTable.grantReadData(getStandardsFunction);
        standardsTable.grantReadData(getStandardFunction);
        linkedStandardsTable.grantReadData(getStandardsFunction);
        linkedStandardsTable.grantReadData(getStandardFunction);
        standardsTable.grantReadWriteData(addCommentFunction);
        standardsTable.grantReadWriteData(resolveItemFunction);
        standardsTable.grantReadWriteData(updateHumanReviewFunction);

        // Comments table permissions
        commentsTable.grantReadWriteData(addCommentFunction);
        commentsTable.grantReadWriteData(deleteCommentFunction);
        commentsTable.grantReadData(getStandardFunction);
        attachmentsTable.grantReadData(getStandardFunction);

        // Documents table permissions
        documentsTable.grantReadWriteData(docClassifierFunction);

        // S3 Permissions for listing and getting files
        docsBucket.grantRead(listFilesFunction);
        docsBucket.grantRead(docClassifierFunction);

        // S3 access for course_details overflow: aggregator writes, readers fetch
        docsBucket.grantReadWrite(mappingAggregatorFunction);
        docsBucket.grantRead(getStandardFunction);
        docsBucket.grantRead(getLinkedStandardFunction);

        // Lambda: Syllabus Mapper — Pass 1 (extraction only)
        const syllabusMapperFunction = new lambda.Function(this, `SyllabusMapperFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('syllabus_mapper'),
            timeout: cdk.Duration.minutes(15),
            memorySize: 2048,
            reservedConcurrentExecutions: 4,
            environment: {
                ...lambdaEnv,
                COURSES_TABLE: coursesTable.tableName,
                GOALS_TABLE: goalsTable.tableName,
                COMPETENCIES_TABLE: competenciesTable.tableName,
                READ_TIMEOUT: '870',
            },
        });

        docsBucket.grantRead(syllabusMapperFunction);
        coursesTable.grantReadWriteData(syllabusMapperFunction);
        goalsTable.grantReadData(syllabusMapperFunction);
        competenciesTable.grantReadData(syllabusMapperFunction);

        // Lambda: Syllabus Mapper — Pass 2 (map + reason + persist)
        const syllabusMapperPass2Function = new lambda.Function(this, `SyllabusMapperPass2Function-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('syllabus_mapper_pass2'),
            timeout: cdk.Duration.minutes(15),
            memorySize: 2048,
            reservedConcurrentExecutions: 4,
            environment: {
                ...lambdaEnv,
                COURSES_TABLE: coursesTable.tableName,
                GOALS_TABLE: goalsTable.tableName,
                COMPETENCIES_TABLE: competenciesTable.tableName,
                READ_TIMEOUT: '870',
            },
        });

        coursesTable.grantReadWriteData(syllabusMapperPass2Function);
        goalsTable.grantReadData(syllabusMapperPass2Function);
        competenciesTable.grantReadData(syllabusMapperPass2Function);

        // Lambda: Assessment Mapper
        const assessmentMapperFunction = new lambda.Function(this, `AssessmentMapperFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('assessment_mapper'),
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            environment: {
                COURSES_TABLE: coursesTable.tableName,
                DOCUMENTS_TABLE: documentsTable.tableName,
                S3_DOCUMENTS_BUCKET: docsBucket.bucketName,
                CLASSIFIER_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
                AWS_REGION_NAME: this.region,
            },
        });

        docsBucket.grantRead(assessmentMapperFunction);
        coursesTable.grantReadWriteData(assessmentMapperFunction);
        documentsTable.grantReadData(assessmentMapperFunction);

        // ========== Course Processing Pipeline (Workflows 1–3) ==========

        // Lambda: Get Upload URL (generates presigned S3 PUT URL)
        const getUploadUrlFunction = new lambda.Function(this, `GetUploadUrlFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_upload_url'),
            timeout: cdk.Duration.seconds(10),
            environment: {
                S3_DOCUMENTS_BUCKET: docsBucket.bucketName,
            },
        });
        docsBucket.grantPut(getUploadUrlFunction);

        // Lambda: Group Courses From Classification (Step Function task)
        const groupCoursesFunction = new lambda.Function(this, `GroupCoursesFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('group_courses_from_classification'),
            timeout: cdk.Duration.seconds(30),
            environment: {
                DOCUMENTS_TABLE: documentsTable.tableName,
            },
        });
        documentsTable.grantReadData(groupCoursesFunction);

        // Course Processing Step Function states
        const classifyFileState = new tasks.LambdaInvoke(this, `ClassifyFile-${props.stackName}`, {
            lambdaFunction: docClassifierFunction,
            outputPath: '$.Payload',
            retryOnServiceExceptions: true,
        });
        classifyFileState.addRetry({
            errors: ['Lambda.TooManyRequestsException', 'Lambda.ServiceException', 'States.TaskFailed'],
            interval: cdk.Duration.seconds(5),
            maxAttempts: 3,
            backoffRate: 2,
        });

        const classifyAllFilesState = new sfn.Map(this, `ClassifyAllFiles-${props.stackName}`, {
            itemsPath: '$.s3_keys',
            parameters: { 's3_key.$': '$$.Map.Item.Value' },
            maxConcurrency: 10,
            resultPath: sfn.JsonPath.DISCARD,
        });
        classifyAllFilesState.itemProcessor(classifyFileState);

        const groupCoursesState = new tasks.LambdaInvoke(this, `GroupCourses-${props.stackName}`, {
            lambdaFunction: groupCoursesFunction,
            payload: sfn.TaskInput.fromObject({ 's3_keys.$': '$$.Execution.Input.s3_keys' }),
            outputPath: '$.Payload',
            retryOnServiceExceptions: true,
        });

        // Lambda: Validate Program Data (goals + competencies must be populated before processing)
        const validateProgramDataFunction = new lambda.Function(this, `ValidateProgramDataFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('validate_program_data'),
            timeout: cdk.Duration.seconds(15),
            environment: {
                GOALS_TABLE: goalsTable.tableName,
                COMPETENCIES_TABLE: competenciesTable.tableName,
            },
        });
        goalsTable.grantReadData(validateProgramDataFunction);
        competenciesTable.grantReadData(validateProgramDataFunction);

        const validateProgramDataState = new tasks.LambdaInvoke(this, `ValidateProgramData-${props.stackName}`, {
            lambdaFunction: validateProgramDataFunction,
            outputPath: '$.Payload',
        });

        const mapSyllabusPass1State = new tasks.LambdaInvoke(this, `MapSyllabusPass1-${props.stackName}`, {
            lambdaFunction: syllabusMapperFunction,
            payload: sfn.TaskInput.fromObject({
                's3_key.$': '$.syllabus_key',
                'course_id.$': '$.course_id',
                'course_name.$': '$.course_name',
                'course_code.$': '$.course_code',
            }),
            outputPath: '$.Payload',
            retryOnServiceExceptions: true,
        });
        mapSyllabusPass1State.addRetry({
            errors: ['Lambda.TooManyRequestsException', 'Lambda.ServiceException'],
            interval: cdk.Duration.seconds(30),
            maxAttempts: 3,
            backoffRate: 2,
        });

        const mapSyllabusPass2State = new tasks.LambdaInvoke(this, `MapSyllabusPass2-${props.stackName}`, {
            lambdaFunction: syllabusMapperPass2Function,
            outputPath: '$.Payload',
            retryOnServiceExceptions: true,
        });
        mapSyllabusPass2State.addRetry({
            errors: ['Lambda.TooManyRequestsException', 'Lambda.ServiceException'],
            interval: cdk.Duration.seconds(30),
            maxAttempts: 3,
            backoffRate: 2,
        });

        const mapSyllabusState = mapSyllabusPass1State.next(mapSyllabusPass2State);

        const mapAssessmentsState = new tasks.LambdaInvoke(this, `MapAssessments-${props.stackName}`, {
            lambdaFunction: assessmentMapperFunction,
            payload: sfn.TaskInput.fromObject({ 'course_id.$': '$.course_id' }),
            outputPath: '$.Payload',
            retryOnServiceExceptions: true,
        });
        mapAssessmentsState.addRetry({
            errors: ['Lambda.TooManyRequestsException', 'Lambda.ServiceException'],
            interval: cdk.Duration.seconds(15),
            maxAttempts: 3,
            backoffRate: 2,
        });

        const skipAssessmentMappingState = new sfn.Pass(this, `SkipAssessmentMapping-${props.stackName}`, {
            comment: 'No course record exists yet (syllabus not mapped) — assessment documents will be orphaned until the syllabus is uploaded and the pipeline is re-run',
        });

        mapAssessmentsState.addCatch(skipAssessmentMappingState, {
            errors: ['States.ALL'],
            resultPath: '$.assessmentSkipReason',
        });

        const syllabusKeyPresentChoice = new sfn.Choice(this, `HasSyllabusKey-${props.stackName}`)
            .when(
                sfn.Condition.isNotNull('$.syllabus_key'),
                mapSyllabusState.next(mapAssessmentsState),
            )
            .otherwise(mapAssessmentsState);

        const processCourseChain = syllabusKeyPresentChoice;

        const processEachCourseState = new sfn.Map(this, `ProcessEachCourse-${props.stackName}`, {
            maxConcurrency: 3,
        });
        processEachCourseState.itemProcessor(processCourseChain);

        const computeMappingsState = new tasks.LambdaInvoke(this, `ComputeMappings-${props.stackName}`, {
            lambdaFunction: computeMappingsFunction,
            payload: sfn.TaskInput.fromObject({}),
            outputPath: '$.Payload',
        });
        computeMappingsState.addRetry({
            errors: ['Lambda.TooManyRequestsException', 'Lambda.ServiceException', 'States.TaskFailed'],
            interval: cdk.Duration.seconds(10),
            maxAttempts: 2,
            backoffRate: 2,
        });

        const courseProcessingDefinition = classifyAllFilesState
            .next(groupCoursesState)
            .next(validateProgramDataState)
            .next(processEachCourseState)
            .next(computeMappingsState);

        const courseProcessingStateMachine = new sfn.StateMachine(this, `CourseProcessingStateMachine-${props.stackName}`, {
            definitionBody: sfn.DefinitionBody.fromChainable(courseProcessingDefinition),
            timeout: cdk.Duration.hours(2),
        });

        // Lambda: Start Course Processing (API-facing, starts the Step Function)
        const startCourseProcessingFunction = new lambda.Function(this, `StartCourseProcessingFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('start_course_processing'),
            timeout: cdk.Duration.seconds(15),
            environment: {
                COURSE_PROCESSING_STATE_MACHINE_ARN: courseProcessingStateMachine.stateMachineArn,
            },
        });
        courseProcessingStateMachine.grantStartExecution(startCourseProcessingFunction);

        // Lambda: Get Course Processing Status (API-facing, polls Step Function)
        const getCourseProcessingStatusFunction = new lambda.Function(this, `GetCourseProcessingStatusFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_course_processing_status'),
            timeout: cdk.Duration.seconds(15),
        });
        getCourseProcessingStatusFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['states:DescribeExecution', 'states:GetExecutionHistory'],
            resources: [
                courseProcessingStateMachine.stateMachineArn,
                this.formatArn({
                    service: 'states',
                    resource: 'execution',
                    resourceName: `${courseProcessingStateMachine.stateMachineName}:*`,
                    arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
                }),
            ],
        }));

        // Lambda: Get Active Processing — lists all running executions with per-step job progress
        const getActiveProcessingFunction = new lambda.Function(this, `GetActiveProcessingFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_active_processing'),
            timeout: cdk.Duration.seconds(29),
            environment: {
                COURSE_PROCESSING_STATE_MACHINE_ARN: courseProcessingStateMachine.stateMachineArn,
            },
        });
        getActiveProcessingFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'states:ListExecutions',
                'states:DescribeExecution',
                'states:GetExecutionHistory',
                'states:DescribeStateMachine',
            ],
            resources: [
                courseProcessingStateMachine.stateMachineArn,
                this.formatArn({
                    service: 'states',
                    resource: 'execution',
                    resourceName: `${courseProcessingStateMachine.stateMachineName}:*`,
                    arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
                }),
            ],
        }));

        new cdk.CfnOutput(this, 'CourseProcessingStateMachineArn', {
            value: courseProcessingStateMachine.stateMachineArn,
            description: 'Course Processing Step Function State Machine ARN',
        });

        // Bedrock Permissions for pipeline Lambdas
        const bedrockPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'bedrock:Retrieve',
                'bedrock:RetrieveAndGenerate',
                'bedrock:InvokeModel',
                'bedrock:Converse',
            ],
            resources: [
                `arn:aws:bedrock:${this.region}::foundation-model/anthropic.*`,
                `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
                `arn:aws:bedrock:us:${this.account}:inference-profile/*`,
                `arn:aws:bedrock:*::foundation-model/*`,
            ],
        });
        syllabusMapperFunction.addToRolePolicy(bedrockPolicy);
        syllabusMapperPass2Function.addToRolePolicy(bedrockPolicy);
        docClassifierFunction.addToRolePolicy(bedrockPolicy);
        assessmentMapperFunction.addToRolePolicy(bedrockPolicy);
        uploadGoalsFunction.addToRolePolicy(bedrockPolicy);
        uploadCompetenciesFunction.addToRolePolicy(bedrockPolicy);

        // Lambda: Fill Document (Docker image — bundles Node.js + Claude Code CLI)
        // Build context is backend/lambda/ so the Dockerfile can COPY the shared/ sibling directory.
        const fillDocumentFunction = new lambda.DockerImageFunction(this, `FillDocumentFunction-${props.stackName}`, {
            code: lambda.DockerImageCode.fromImageAsset(
                path.join(__dirname, '../../backend/lambda'),
                {
                    file: 'fill_document/Dockerfile',
                    platform: ecrAssets.Platform.LINUX_ARM64,
                }
            ),
            architecture: lambda.Architecture.ARM_64,
            timeout: cdk.Duration.minutes(10),
            memorySize: 1024,
            environment: {
                S3_DOCUMENTS_BUCKET: docsBucket.bucketName,
                FILL_DOCUMENT_JOBS_TABLE: fillDocumentJobsTable.tableName,
            },
        });
        docsBucket.grantReadWrite(fillDocumentFunction);
        fillDocumentFunction.addToRolePolicy(bedrockInvokePolicy);
        fillDocumentJobsTable.grantReadWriteData(fillDocumentFunction);

        // Lambda: Start Fill Document — fast handler that creates a job record and invokes FillDocumentFunction async
        const startFillDocumentFunction = new lambda.Function(this, `StartFillDocumentFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('start_fill_document'),
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            environment: {
                FILL_DOCUMENT_JOBS_TABLE: fillDocumentJobsTable.tableName,
                FILL_DOCUMENT_FUNCTION_NAME: fillDocumentFunction.functionName,
                LINKED_STANDARDS_TABLE: linkedStandardsTable.tableName,
                LINKED_STANDARDS_AUDIT_YEAR_INDEX: LINKED_STANDARDS_AUDIT_YEAR_INDEX_NAME,
                S3_DOCUMENTS_BUCKET: docsBucket.bucketName,
            },
        });
        fillDocumentJobsTable.grantReadWriteData(startFillDocumentFunction);
        fillDocumentFunction.grantInvoke(startFillDocumentFunction);
        linkedStandardsTable.grantReadData(startFillDocumentFunction);
        docsBucket.grantReadWrite(startFillDocumentFunction);

        // Lambda: Get Fill Document Job — polls job status from DynamoDB
        const getFillDocumentJobFunction = new lambda.Function(this, `GetFillDocumentJobFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_fill_document_job'),
            timeout: cdk.Duration.seconds(10),
            memorySize: 256,
            environment: {
                FILL_DOCUMENT_JOBS_TABLE: fillDocumentJobsTable.tableName,
                S3_DOCUMENTS_BUCKET: docsBucket.bucketName,
            },
        });
        fillDocumentJobsTable.grantReadData(getFillDocumentJobFunction);
        docsBucket.grantRead(getFillDocumentJobFunction);

        // Lambda: Get Audit Years — returns list of frozen audit year labels
        const getAuditYearsFunction = new lambda.Function(this, `GetAuditYearsFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_audit_years'),
            timeout: cdk.Duration.seconds(15),
            environment: {
                LINKED_STANDARDS_TABLE: linkedStandardsTable.tableName,
                LINKED_STANDARDS_AUDIT_YEAR_INDEX: 'gsi1-audit-year',
            },
        });
        linkedStandardsTable.grantReadData(getAuditYearsFunction);

        // Lambda: Freeze Audit Year — copies live records from all four tables as frozen snapshots
        const freezeAuditYearFunction = new lambda.Function(this, `FreezeAuditYearFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('freeze_audit_year'),
            timeout: cdk.Duration.seconds(60),
            environment: {
                LINKED_STANDARDS_TABLE: linkedStandardsTable.tableName,
                LINKED_STANDARDS_AUDIT_YEAR_INDEX: 'gsi1-audit-year',
                COURSES_TABLE: coursesTable.tableName,
                GOALS_TABLE: goalsTable.tableName,
                COMPETENCIES_TABLE: competenciesTable.tableName,
                COMMENTS_TABLE: commentsTable.tableName,
                ATTACHMENTS_TABLE: attachmentsTable.tableName,
            },
        });
        linkedStandardsTable.grantReadWriteData(freezeAuditYearFunction);
        coursesTable.grantReadWriteData(freezeAuditYearFunction);
        goalsTable.grantReadWriteData(freezeAuditYearFunction);
        competenciesTable.grantReadWriteData(freezeAuditYearFunction);
        commentsTable.grantReadWriteData(freezeAuditYearFunction);
        attachmentsTable.grantReadWriteData(freezeAuditYearFunction);

        // Lambda: Amend Standard — unlocks a frozen standard and writes an amendment log entry
        const amendStandardFunction = new lambda.Function(this, `AmendStandardFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('amend_standard'),
            timeout: cdk.Duration.seconds(10),
            environment: {
                LINKED_STANDARDS_TABLE: linkedStandardsTable.tableName,
                AUDIT_AMENDMENTS_TABLE: auditAmendmentsTable.tableName,
            },
        });
        linkedStandardsTable.grantReadWriteData(amendStandardFunction);
        auditAmendmentsTable.grantWriteData(amendStandardFunction);

        // Lambda: Refreeze Standard — re-locks an amended standard
        const refreezeStandardFunction = new lambda.Function(this, `RefreezeStandardFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('refreeze_standard'),
            timeout: cdk.Duration.seconds(10),
            environment: {
                LINKED_STANDARDS_TABLE: linkedStandardsTable.tableName,
            },
        });
        linkedStandardsTable.grantReadWriteData(refreezeStandardFunction);

        // Lambda: Get Amendments — fetches all amendment log entries for a given audit year
        const getAmendmentsFunction = new lambda.Function(this, `GetAmendmentsFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('get_amendments'),
            timeout: cdk.Duration.seconds(10),
            environment: {
                AUDIT_AMENDMENTS_TABLE: auditAmendmentsTable.tableName,
            },
        });
        auditAmendmentsTable.grantReadData(getAmendmentsFunction);

        // Lambda: List Fill Document Templates — lists xlsx files under templates/ in S3
        const listFillDocumentTemplatesFunction = new lambda.Function(this, `ListFillDocumentTemplatesFunction-${props.stackName}`, {
            runtime: lambda.Runtime.PYTHON_3_13,
            architecture: lambda.Architecture.ARM_64,
            handler: 'handler.handler',
            code: createLambdaCode('list_fill_document_templates'),
            timeout: cdk.Duration.seconds(10),
            memorySize: 256,
            environment: {
                S3_DOCUMENTS_BUCKET: docsBucket.bucketName,
            },
        });
        docsBucket.grantRead(listFillDocumentTemplatesFunction);

        const api = new apigateway.RestApi(this, `ARCPA-API-${props.stackName}`, {
            //restApiName: `ARCPA-API-${props.stackName}`, // e.g., ARCPA-API-[stackName]
            description: 'API Gateway',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key'],
            },
        });

        new cdk.CfnOutput(this, 'ApiUrl', {
            value: api.url,
            description: 'API Gateway URL',
        });

        // Cognito User Pool for authentication
        const userPool = new cognito.UserPool(this, `UserPool-${props.stackName}`, {
            // userPoolName: 'arcpa-user-pool', Disabling explicit user pool name for same reasons as above
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
            },
            autoVerify: {
                email: true,
            },
            passwordPolicy: {
                minLength: 8,
                requireUppercase: true,
                requireLowercase: true,
                requireDigits: true,
                requireSymbols: false,
            },
            mfa: cognito.Mfa.OFF,
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: props.tableRemovalPolicy || cdk.RemovalPolicy.RETAIN, // Use injected removal policy
        });

        // User Pool Client
        const userPoolClient = new cognito.UserPoolClient(this, `UserPoolClient-${props.stackName}`, {
            userPool,
            // userPoolClientName: 'arcpa-app-client', Disabling explicit user pool client name for same reasons as above
            authFlows: {
                userSrp: true,
                userPassword: true,
            },
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                },
                scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
                callbackUrls: ['http://localhost:5173/', 'http://localhost:3000/'],
                logoutUrls: ['http://localhost:5173/', 'http://localhost:3000/'],
            },
            preventUserExistenceErrors: true,
        });

        // Cognito Authorizer for API Gateway
        const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
            this,
            `CognitoAuthorizer-${props.stackName}`,
            {
                cognitoUserPools: [userPool],
                // authorizerName: 'arcpa-cognito-authorizer', Disabling explicit authorizer name for same reasons as above
            }
        );

        // API Gateway Resources for ARCPA Evidence Finder
        const standardsResource = api.root.addResource('standards');
        const singleStandardResource = standardsResource.addResource('{id}');
        const statusResource = singleStandardResource.addResource('status');
        const filesResource = api.root.addResource('files');
        const classifyResource = api.root.addResource('classify');

        const authMethodOptions: apigateway.MethodOptions = {
            authorizer: cognitoAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        };

        // GET /standards - List all standards
        standardsResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getStandardsFunction),
            authMethodOptions
        );

        // GET /standards/{id} - Get single standard
        singleStandardResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getStandardFunction),
            authMethodOptions
        );

        // GET /standards/{id}/status - Get processing status
        statusResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getStandardFunction),
            authMethodOptions
        );

        // GET /files - List S3 files
        filesResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(listFilesFunction),
            authMethodOptions
        );

        // POST /classify - Classify a document
        classifyResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(docClassifierFunction),
            authMethodOptions
        );

        // POST /standards/{id}/comments - Add comment
        const commentsResource = singleStandardResource.addResource('comments');
        commentsResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(addCommentFunction),
            authMethodOptions
        );

        // DELETE /standards/{id}/comments/{commentId} - Delete comment
        const singleCommentResource = commentsResource.addResource('{commentId}');
        singleCommentResource.addMethod(
            'DELETE',
            new apigateway.LambdaIntegration(deleteCommentFunction),
            authMethodOptions
        );

        // POST /standards/{id}/resolve - Manually resolve an evidence item or question
        const resolveResource = singleStandardResource.addResource('resolve');
        resolveResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(resolveItemFunction),
            authMethodOptions
        );

        // POST /standards/{id}/human-review - Update human review status
        const humanReviewResource = singleStandardResource.addResource('human-review');
        humanReviewResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(updateHumanReviewFunction),
            authMethodOptions
        );

        // POST /standards/{id}/map - Queue a standard for course mapping
        const mapResource = singleStandardResource.addResource('map');
        mapResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(queueStandardMappingFunction),
            authMethodOptions
        );

        // GET /standards/{id}/linked - Get the linked standard (WF5 output)
        const linkedResource = singleStandardResource.addResource('linked');
        linkedResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getLinkedStandardFunction),
            authMethodOptions
        );

        // POST /standards/{id}/linked-review - Update WF5 human review fields
        const linkedReviewResource = singleStandardResource.addResource('linked-review');
        linkedReviewResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(updateLinkedReviewFunction),
            authMethodOptions
        );

        // POST /standards/{id}/attachments - Upload a reviewer file attachment
        // DELETE /standards/{id}/attachments/{attachmentId} - Remove an attachment
        const attachmentsResource = singleStandardResource.addResource('attachments');
        attachmentsResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(postAttachmentFunction),
            authMethodOptions
        );
        const singleAttachmentResource = attachmentsResource.addResource('{attachmentId}');
        singleAttachmentResource.addMethod(
            'DELETE',
            new apigateway.LambdaIntegration(deleteAttachmentFunction),
            authMethodOptions
        );
        // POST /standards/{id}/attachments/{attachmentId}/confirm
        const confirmAttachmentResource = singleAttachmentResource.addResource('confirm');
        confirmAttachmentResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(confirmAttachmentFunction),
            authMethodOptions
        );

        // POST /syllabi/map - Trigger syllabus CLO/CIO mapping
        const syllabiResource = api.root.addResource('syllabi');
        const syllabusMapResource = syllabiResource.addResource('map');
        syllabusMapResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(syllabusMapperFunction),
            authMethodOptions
        );

        // POST /courses/{course_id}/assessments/map - Map assessment docs to a course
        // GET /courses - List all courses
        const coursesResource = api.root.addResource('courses');
        coursesResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getCoursesFunction),
            authMethodOptions
        );
        const singleCourseResource = coursesResource.addResource('{course_id}');
        const assessmentsResource = singleCourseResource.addResource('assessments');
        const assessmentMapResource = assessmentsResource.addResource('map');
        assessmentMapResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(assessmentMapperFunction),
            authMethodOptions
        );

        // GET /upload-url - Generate presigned S3 PUT URL
        const uploadUrlResource = api.root.addResource('upload-url');
        uploadUrlResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getUploadUrlFunction),
            authMethodOptions
        );

        // POST /courses/process - Start course processing pipeline
        const courseProcessResource = coursesResource.addResource('process');
        courseProcessResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(startCourseProcessingFunction),
            authMethodOptions
        );

        // GET /courses/process-status - Poll course processing Step Function
        const courseProcessStatusResource = coursesResource.addResource('process-status');
        courseProcessStatusResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getCourseProcessingStatusFunction),
            authMethodOptions
        );

        // GET /courses/active-processing - List all running executions with per-step progress
        const courseActiveProcessingResource = coursesResource.addResource('active-processing');
        courseActiveProcessingResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getActiveProcessingFunction),
            authMethodOptions
        );

        // GET /goals - List all program goals
        const goalsResource = api.root.addResource('goals');
        goalsResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getGoalsFunction),
            authMethodOptions
        );

        // POST /goals/upload - Extract goals from PDF and persist to GoalsTable
        goalsResource.addResource('upload').addMethod(
            'POST',
            new apigateway.LambdaIntegration(uploadGoalsFunction),
            authMethodOptions
        );

        // GET /competencies - List all program competencies
        // POST /competencies/upload - Extract competencies from PDF and persist to CompetenciesTable
        const competenciesResource = api.root.addResource('competencies');
        competenciesResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getCompetenciesFunction),
            authMethodOptions
        );
        competenciesResource.addResource('upload').addMethod(
            'POST',
            new apigateway.LambdaIntegration(uploadCompetenciesFunction),
            authMethodOptions
        );

        // POST /sections/{id}/map - Fan out WF4/5 mapping for all standards in a section
        const sectionsResource = api.root.addResource('sections');
        const singleSectionResource = sectionsResource.addResource('{id}');
        const sectionMapResource = singleSectionResource.addResource('map');
        sectionMapResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(mapSectionFunction),
            authMethodOptions
        );

        // GET /audit/years - List frozen audit year labels
        const auditResource = api.root.addResource('audit');
        auditResource.addResource('years').addMethod(
            'GET',
            new apigateway.LambdaIntegration(getAuditYearsFunction),
            authMethodOptions
        );

        // POST /audit/{year}/freeze - Freeze live standards as a named audit year snapshot
        const auditYearResource = auditResource.addResource('{year}');
        auditYearResource.addResource('freeze').addMethod(
            'POST',
            new apigateway.LambdaIntegration(freezeAuditYearFunction),
            authMethodOptions
        );

        // POST /audit/{year}/standards/{id}/amend - Unlock a frozen standard with audit log
        // POST /audit/{year}/standards/{id}/refreeze - Re-lock an amended standard
        const auditYearStandardsResource = auditYearResource.addResource('standards');
        const auditYearStandardIdResource = auditYearStandardsResource.addResource('{id}');

        auditYearStandardIdResource.addResource('amend').addMethod(
            'POST',
            new apigateway.LambdaIntegration(amendStandardFunction),
            authMethodOptions
        );

        auditYearStandardIdResource.addResource('refreeze').addMethod(
            'POST',
            new apigateway.LambdaIntegration(refreezeStandardFunction),
            authMethodOptions
        );

        // GET /audit/{year}/amendments - Fetch all amendment log entries for a given audit year
        auditYearResource.addResource('amendments').addMethod(
            'GET',
            new apigateway.LambdaIntegration(getAmendmentsFunction),
            authMethodOptions
        );

        // POST /fill-document - Enqueue a fill-document job; returns 202 + job_id immediately
        // GET /fill-document/templates - List available xlsx templates from S3
        const fillDocumentResource = api.root.addResource('fill-document');
        fillDocumentResource.addMethod(
            'POST',
            new apigateway.LambdaIntegration(startFillDocumentFunction),
            authMethodOptions
        );
        const fillDocumentTemplatesResource = fillDocumentResource.addResource('templates');
        fillDocumentTemplatesResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(listFillDocumentTemplatesFunction),
            authMethodOptions
        );

        // GET /fill-document-jobs/{job_id} - Poll job status
        const fillDocumentJobsResource = api.root.addResource('fill-document-jobs');
        const fillDocumentJobResource = fillDocumentJobsResource.addResource('{job_id}');
        fillDocumentJobResource.addMethod(
            'GET',
            new apigateway.LambdaIntegration(getFillDocumentJobFunction),
            authMethodOptions
        );

        // Amplify App (ready for Git connection)
        const amplifyApp = new amplify.CfnApp(this, `AmplifyApp-${props.stackName}`, {
            // Dynamically naming it using the stackName to prevent collisions!
            name: `arcpa-frontend-${props.stackName}`, 
            environmentVariables: [
                {name: 'VITE_USER_POOL_ID', value: userPool.userPoolId},
                {name: 'VITE_USER_POOL_CLIENT_ID', value: userPoolClient.userPoolClientId},
                {name: 'VITE_API_URL', value: api.url},
                {name: 'VITE_AWS_REGION', value: this.region},
            ],
            buildSpec: `version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd frontend
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: frontend/dist
    files:
      - '**/*'
  cache:
    paths:
      - frontend/node_modules/**/*`,
            customRules: [
                {
                    source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>',
                    target: '/index.html',
                    status: '200',
                },
            ],
        });

        // Cognito Outputs
        new cdk.CfnOutput(this, 'UserPoolId', {
            value: userPool.userPoolId,
            description: 'Cognito User Pool ID',
        });

        new cdk.CfnOutput(this, 'UserPoolClientId', {
            value: userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
        });

        new cdk.CfnOutput(this, 'CognitoRegion', {
            value: this.region,
            description: 'AWS Region for Cognito',
        });

        // Amplify Output
        new cdk.CfnOutput(this, 'AmplifyAppId', {
            value: amplifyApp.attrAppId,
            description: 'Amplify App ID',
        });

        // ARCPA Evidence Finder Outputs
        new cdk.CfnOutput(this, 'StandardsTableName', {
            value: standardsTable.tableName,
            description: 'DynamoDB Standards Table Name',
        });

        // Standard Mapping Pipeline Outputs
        new cdk.CfnOutput(this, 'DocumentsTableName', {
            value: documentsTable.tableName,
            description: 'DynamoDB Documents Table Name',
        });

        new cdk.CfnOutput(this, 'CoursesTableName', {
            value: coursesTable.tableName,
            description: 'DynamoDB Courses Table Name',
        });

        new cdk.CfnOutput(this, 'LinkedStandardsTableName', {
            value: linkedStandardsTable.tableName,
            description: 'DynamoDB Linked Standards Table Name',
        });

        new cdk.CfnOutput(this, 'AuditAmendmentsTableName', {
            value: auditAmendmentsTable.tableName,
            description: 'DynamoDB Audit Amendments Table Name',
        });

        new cdk.CfnOutput(this, 'GoalsTableName', {
            value: goalsTable.tableName,
            description: 'DynamoDB Program Goals Table Name',
        });

        new cdk.CfnOutput(this, 'CompetenciesTableName', {
            value: competenciesTable.tableName,
            description: 'DynamoDB Program Competencies Table Name',
        });

        new cdk.CfnOutput(this, 'StandardMappingQueueUrl', {
            value: standardMappingQueue.queueUrl,
            description: 'SQS Standard Mapping Queue URL',
        });

        new cdk.CfnOutput(this, 'StandardMappingDlqUrl', {
            value: standardMappingDlq.queueUrl,
            description: 'SQS Standard Mapping DLQ URL',
        });

        new cdk.CfnOutput(this, 'MappingStateMachineArn', {
            value: mappingStateMachine.stateMachineArn,
            description: 'Step Function State Machine ARN',
        });

    }
}