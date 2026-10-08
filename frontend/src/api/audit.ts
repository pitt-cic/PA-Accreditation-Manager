import { apiRequest } from './client';

export const auditApi = {
  getYears: (): Promise<{ years: string[] }> =>
    apiRequest('/audit/years'),

  freezeYear: (year: string): Promise<{
    year: string;
    frozen_count: number;
    purged_standards_count: number;
    courses_count: number;
    goals_count: number;
    competencies_count: number;
    comments_count: number;
    attachments_count: number;
  }> =>
    apiRequest(`/audit/${encodeURIComponent(year)}/freeze`, { method: 'POST' }),

  amendStandard: (
    year: string,
    standardId: string,
    reason: string
  ): Promise<{ year: string; standard_id: string; timestamp: string; reason: string }> =>
    apiRequest(`/audit/${encodeURIComponent(year)}/standards/${encodeURIComponent(standardId)}/amend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  refreezeStandard: (
    year: string,
    standardId: string
  ): Promise<{ year: string; standard_id: string; message: string }> =>
    apiRequest(`/audit/${encodeURIComponent(year)}/standards/${encodeURIComponent(standardId)}/refreeze`, {
      method: 'POST',
    }),

  getAmendments: (year: string): Promise<{ year: string; amendments: Array<{
    audit_year: string;
    amendment_id: string;
    standard_id: string;
    timestamp: string;
    reason: string;
    action: string;
    previous_snapshot?: any;
  }> }> =>
    apiRequest(`/audit/${encodeURIComponent(year)}/amendments`),
};
