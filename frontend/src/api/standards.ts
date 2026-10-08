/**
 * Standards API endpoints
 */

import { apiRequest } from './client';
import { coursesProcessingApi } from './courses';
import type {
  StandardsListResponse,
  StandardDetailResponse,
  StatusResponse,
  UpdateLinkedReviewRequest,
  LinkedStandard,
  CommentTargetType,
  ResolveTargetType,
  AddCommentResponse,
  DeleteCommentResponse,
  UpdateHumanReviewRequest,
  UpdateHumanReviewResponse,
  CoursesListResponse,
  GoalsListResponse,
  CompetenciesListResponse,
  PostAttachmentRequest,
  PostAttachmentResponse,
} from '../types/evidence';

export const standardsApi = {
  /** GET /standards - List all standards with status summary. Pass auditYear to fetch a frozen snapshot. */
  getAll: (auditYear?: string | null) => {
    const url = auditYear ? `/standards?audit_year=${encodeURIComponent(auditYear)}` : '/standards';
    return apiRequest<StandardsListResponse>(url);
  },

  /** GET /standards/{id} - Get single standard with evidence. Pass auditYear to fetch frozen record. */
  getById: (id: string, auditYear?: string | null) => {
    const url = auditYear
      ? `/standards/${encodeURIComponent(id)}?audit_year=${encodeURIComponent(auditYear)}`
      : `/standards/${encodeURIComponent(id)}`;
    return apiRequest<StandardDetailResponse>(url);
  },

  /** GET /standards/{id}/status - Processing status for polling */
  getStatus: (id: string) => apiRequest<StatusResponse>(`/standards/${encodeURIComponent(id)}/status`),

  /** POST /standards/{id}/map - Queue a standard for WF4/5 course mapping */
  mapStandard: (standardId: string) =>
    apiRequest<{ standard_id: string; status: string; message: string }>(
      `/standards/${encodeURIComponent(standardId)}/map`,
      { method: 'POST', body: JSON.stringify({}) }
    ),

  /** POST /sections/{id}/map - Fan out WF4/5 mapping for all standards in a section */
  mapSection: (sectionId: string) =>
    apiRequest<{ section_id: string; queued: number; standard_ids: string[]; message: string }>(
      `/sections/${encodeURIComponent(sectionId)}/map`,
      { method: 'POST', body: JSON.stringify({}) }
    ),

  /** POST /standards/{id}/comments - Add a comment */
  addComment: (
    standardId: string,
    targetType: CommentTargetType,
    targetIndex: number | null,
    text: string,
    targetPath?: string,
  ) =>
    apiRequest<AddCommentResponse>(`/standards/${encodeURIComponent(standardId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        target_type: targetType,
        target_index: targetIndex,
        target_path: targetPath,
        text,
      }),
    }),

  /** DELETE /standards/{id}/comments/{commentId} - Delete a comment */
  deleteComment: (standardId: string, commentId: string) =>
    apiRequest<DeleteCommentResponse>(
      `/standards/${encodeURIComponent(standardId)}/comments/${encodeURIComponent(commentId)}`,
      { method: 'DELETE' }
    ),

  /** POST /standards/{id}/resolve - Mark an evidence item or question as resolved */
  resolveItem: (
    standardId: string,
    targetType: ResolveTargetType,
    targetIndex: number,
    resolvedNote: string,
    unresolve = false,
  ) =>
    apiRequest<StandardDetailResponse>(`/standards/${encodeURIComponent(standardId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({
        target_type: targetType,
        target_index: targetIndex,
        resolved_note: resolvedNote,
        unresolve,
      }),
    }),

  /** POST /standards/{id}/human-review - Update human review status */
  updateHumanReview: (standardId: string, request: UpdateHumanReviewRequest) =>
    apiRequest<UpdateHumanReviewResponse>(`/standards/${encodeURIComponent(standardId)}/human-review`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  /** GET /courses - List all courses. Pass auditYear to filter by frozen snapshot. */
  getCourses: (auditYear?: string | null) => {
    const url = auditYear ? `/courses?audit_year=${encodeURIComponent(auditYear)}` : '/courses';
    return apiRequest<CoursesListResponse>(url);
  },

  /** GET /goals - List all program goals. Pass auditYear to filter by frozen snapshot. */
  getGoals: (auditYear?: string | null) => {
    const url = auditYear ? `/goals?audit_year=${encodeURIComponent(auditYear)}` : '/goals';
    return apiRequest<GoalsListResponse>(url);
  },

  /** GET /competencies - List all program competencies. Pass auditYear to filter by frozen snapshot. */
  getCompetencies: (auditYear?: string | null) => {
    const url = auditYear ? `/competencies?audit_year=${encodeURIComponent(auditYear)}` : '/competencies';
    return apiRequest<CompetenciesListResponse>(url);
  },

  /** POST /goals/upload - Upload a PDF and extract goals into GoalsTable */
  uploadGoals: async (file: File): Promise<{ message: string }> => {
    const { upload_url, s3_key } = await coursesProcessingApi.getUploadUrl(file.name, 'application/pdf');
    await standardsApi.uploadFileToS3(upload_url, file, 'application/pdf');
    return apiRequest<{ message: string }>('/goals/upload', {
      method: 'POST',
      body: JSON.stringify({ s3_key }),
    });
  },

  /** POST /competencies/upload - Upload a PDF and extract competencies into CompetenciesTable */
  uploadCompetencies: async (file: File): Promise<{ message: string }> => {
    const { upload_url, s3_key } = await coursesProcessingApi.getUploadUrl(file.name, 'application/pdf');
    await standardsApi.uploadFileToS3(upload_url, file, 'application/pdf');
    return apiRequest<{ message: string }>('/competencies/upload', {
      method: 'POST',
      body: JSON.stringify({ s3_key }),
    });
  },

  /** POST /standards/{id}/linked-review - Update WF5 human review fields */
  updateLinkedReview: (standardId: string, request: UpdateLinkedReviewRequest) =>
    apiRequest<LinkedStandard>(
      `/standards/${encodeURIComponent(standardId)}/linked-review`,
      { method: 'POST', body: JSON.stringify(request) }
    ),

  /** POST /standards/{id}/attachments - Register attachment and get presigned upload URL */
  postAttachment: (standardId: string, request: PostAttachmentRequest) =>
    apiRequest<PostAttachmentResponse>(
      `/standards/${encodeURIComponent(standardId)}/attachments`,
      { method: 'POST', body: JSON.stringify(request) }
    ),

  /** DELETE /standards/{id}/attachments/{attachmentId} - Remove an attachment */
  deleteAttachment: (standardId: string, attachmentId: string) =>
    apiRequest<void>(
      `/standards/${encodeURIComponent(standardId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { method: 'DELETE' }
    ),

  /** POST /standards/{id}/attachments/{attachmentId}/confirm - Confirm S3 upload completed */
  confirmAttachment: (standardId: string, attachmentId: string) =>
    apiRequest<void>(
      `/standards/${encodeURIComponent(standardId)}/attachments/${encodeURIComponent(attachmentId)}/confirm`,
      { method: 'POST', body: '{}' }
    ),

  /** Upload file directly to S3 using a presigned URL.
   *  contentType must match what was used to sign the URL. */
  uploadFileToS3: async (uploadUrl: string, file: File, contentType: string): Promise<void> => {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': contentType },
    });
    if (!response.ok) throw new Error(`S3 upload failed: ${response.status}`);
  },
};