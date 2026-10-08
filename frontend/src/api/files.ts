/**
 * S3 Files API endpoint
 */

import { apiRequest } from './client';
import type { S3FilesResponse } from '../types/evidence';

export const filesApi = {
  /** GET /files - List S3 bucket files */
  getAll: () => apiRequest<S3FilesResponse>('/files'),
};
