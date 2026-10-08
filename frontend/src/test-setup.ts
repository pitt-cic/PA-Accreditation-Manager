import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Prevent CognitoUserPool constructor from throwing when env vars are absent
vi.mock('./config/cognito', () => ({
  userPool: { getCurrentUser: vi.fn(() => null) },
  cognitoConfig: { region: 'us-east-1', userPoolId: 'test-pool', clientId: 'test-client' },
}));
