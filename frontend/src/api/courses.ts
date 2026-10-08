/**
 * Courses processing API — upload, processing pipeline, status polling
 */

import { apiRequest } from './client';

export interface UploadUrlResponse {
  upload_url: string;
  s3_key: string;
}

export interface StartProcessingResponse {
  execution_arn: string;
  status: string;
}

export type ProcessingStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
export type ProcessingStep = 'classifying' | 'processing_courses' | 'done' | 'failed';

export interface CourseProcessingStatusResponse {
  status: ProcessingStatus;
  current_step: ProcessingStep;
  courses: { course_id: string; step: string; status: string }[];
  error_detail?: string;
}

export type JobStatus = 'completed' | 'in_progress' | 'pending';

export interface ActiveProcessingCourse {
  course_id: string;
  course_name: string;
  status: JobStatus;
}

export interface ActiveProcessingJob {
  name: string;
  label: string;
  status: JobStatus;
  courses?: ActiveProcessingCourse[];
}

export interface ActiveProcessingExecution {
  execution_arn: string;
  started_at: string;
  jobs: ActiveProcessingJob[];
  error?: string;
}

export interface ActiveProcessingResponse {
  executions: ActiveProcessingExecution[];
}

export const coursesProcessingApi = {
  /** GET /upload-url — get a presigned S3 PUT URL for a file */
  getUploadUrl: (filename: string, contentType: string) =>
    apiRequest<UploadUrlResponse>(
      `/upload-url?filename=${encodeURIComponent(filename)}&content_type=${encodeURIComponent(contentType)}`
    ),

  /** PUT directly to S3 using a presigned URL — no auth header */
  uploadToS3: async (uploadUrl: string, file: File, contentType: string): Promise<void> => {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': contentType },
    });
    if (!response.ok) {
      throw new Error(`S3 upload failed: ${response.status} ${response.statusText}`);
    }
  },

  /** POST /courses/process — start the Step Function */
  startProcessing: (s3Keys: string[]) =>
    apiRequest<StartProcessingResponse>('/courses/process', {
      method: 'POST',
      body: JSON.stringify({ s3_keys: s3Keys }),
    }),

  /** GET /courses/process-status — poll execution status */
  getProcessingStatus: (executionArn: string) =>
    apiRequest<CourseProcessingStatusResponse>(
      `/courses/process-status?execution_arn=${encodeURIComponent(executionArn)}`
    ),

  /** GET /courses/active-processing — list all running executions with per-step job progress */
  getActiveProcessing: () =>
    apiRequest<ActiveProcessingResponse>('/courses/active-processing'),
};
