import { apiRequest } from './client';

export interface FillDocumentTemplate {
  name: string;
  key: string;
  standard_prefix: string;
}

export interface FillDocumentJob {
  job_id: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  output_key?: string;
  presigned_url?: string;
  cost_usd?: string;
  turns?: number;
  error?: string;
  created_at?: number;
}

export const fillDocumentApi = {
  listTemplates: (): Promise<{ templates: FillDocumentTemplate[] }> =>
    apiRequest('/fill-document/templates'),

  startExport: (templateKey: string, standardPrefix: string, auditYear?: string | null): Promise<{ job_id: string }> =>
    apiRequest('/fill-document', {
      method: 'POST',
      body: JSON.stringify({
        template_key: templateKey,
        standard_prefix: standardPrefix,
        ...(auditYear ? { audit_year: auditYear } : {}),
      }),
    }),

  getJobStatus: (jobId: string): Promise<FillDocumentJob> =>
    apiRequest(`/fill-document-jobs/${jobId}`),
};
