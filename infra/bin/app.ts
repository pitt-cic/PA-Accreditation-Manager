#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {InfraStack} from '../lib/infra-stack';

const app = new cdk.App();

// Adapted from AWS Documentation + Student Onboarding

/*
// Get student name from context (passed via -c studentName=yourname)
const studentName = app.node.tryGetContext('studentName');
if (!studentName) {
  throw new Error('Please provide your name: cdk deploy -c studentName=yourname');
}

new PortfolioCdkStack(app, `Portfolio-${studentName}`, {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: 'us-east-1' 
  },
  studentName,
});

*/

// 1. Determine the dynamic values (Explicitly cast as strings)
const devName = app.node.tryGetContext('devName') as string | undefined;
const stageName = app.node.tryGetContext('stageName') as string;

if ((!devName && stageName != 'prod') || !stageName) {
    throw new Error('Please provide devName and stageName: cdk deploy -c devName=yourname -c stageName=dev|beta|prod');
}

const isProd = stageName === 'prod';
const stackName = isProd 
    ? `ArcpaEvidenceFinderStack-${stageName}` 
    : `ArcpaEvidenceFinderStack-${devName}-${stageName}`;

// 2. Determine the removal policy based on the stage
const removalPolicy = isProd 
    ? cdk.RemovalPolicy.RETAIN 
    : cdk.RemovalPolicy.DESTROY;

// 3. Pass everything explicitly via your custom Props
new InfraStack(app, stackName, {
    stackName, // <-- ADDED: Shorthand for stackName: stackName
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    description: 'ARCPA Evidence Finder Infrastructure',
    developerName: isProd ? undefined : devName,
    stageName: stageName,
    tableRemovalPolicy: removalPolicy, 
});