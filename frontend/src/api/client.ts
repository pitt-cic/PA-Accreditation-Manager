/**
 * Base API client with Cognito JWT authentication
 */

import { userPool } from '../config/cognito';
import type { CognitoUserSession } from 'amazon-cognito-identity-js';

class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
  ) {
    super(`API Error: ${status}`);
    this.name = 'ApiError';
  }
}

async function getAuthToken(): Promise<string> {
  const user = userPool.getCurrentUser();
  if (!user) {
    throw new Error('No user session');
  }

  return new Promise((resolve, reject) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) {
        reject(new Error('Failed to get session'));
        return;
      }
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAuthToken();

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText };
    }
    throw new ApiError(response.status, errorData);
  }

  const contentLength = response.headers.get('content-length');
  const contentType = response.headers.get('content-type') ?? '';

  if (response.status === 204 || contentLength === '0' || !contentType.includes('application/json')) {
    return undefined as T;
  }

  return response.json();
}

export { ApiError };
