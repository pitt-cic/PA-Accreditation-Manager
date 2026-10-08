import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { standardsApi } from '../api/standards';

vi.mock('../api/standards', () => ({
  standardsApi: {
    getAll: vi.fn(),
    getCourses: vi.fn().mockResolvedValue({ courses: [] }),
    getGoals: vi.fn().mockResolvedValue({ goals: [] }),
    getCompetencies: vi.fn().mockResolvedValue({ competencies: [] }),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    userAttributes: { email: 'test@example.com' },
    getUserEmail: () => 'test@example.com',
  }),
}));

// Mock useAuditYear with controllable selectedYear
const mockUseAuditYear = vi.fn();
vi.mock('../contexts/AuditYearContext', () => ({
  AuditYearProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAuditYear: () => mockUseAuditYear(),
}));

// Mock auditApi
vi.mock('../api/audit', () => ({
  auditApi: {
    getYears: vi.fn().mockResolvedValue({ years: ['2025', '2024'] }),
  },
}));

// Mock coursesProcessingApi to avoid auth errors during tests
vi.mock('../api/courses', () => ({
  coursesProcessingApi: {
    getActiveProcessing: vi.fn().mockResolvedValue({ executions: [] }),
  },
}));

// Spy on useSearchParams
const mockSetSearchParams = vi.fn();
let currentSearchParams = new URLSearchParams();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [currentSearchParams, mockSetSearchParams],
  };
});

describe('DashboardPage - audit_year propagation in tab navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetSearchParams.mockClear();
    currentSearchParams = new URLSearchParams();
    vi.mocked(standardsApi.getAll).mockResolvedValue({
      standards: [],
      status_summary: { queued: 0, processing: 0, processed: 0, error: 0, total: 0 },
      readiness_summary: { ready: 0, mostly_ready: 0, needs_work: 0, not_ready: 0, no_guidance: 0 },
    });
  });

  it('should propagate audit_year when switching tabs in frozen mode', async () => {
    mockUseAuditYear.mockReturnValue({
      selectedYear: '2025',
      frozenYears: ['2025', '2024'],
      isLoadingYears: false,
      setSelectedYear: vi.fn(),
      refreshYears: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/?tab=overview']}>
        <DashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /overview/i })[0]).toBeInTheDocument();
    });

    const tabButtons = screen.getAllByRole('button');
    const standardsTab = tabButtons.find(btn => btn.textContent === 'Standards');
    expect(standardsTab).toBeDefined();

    await userEvent.click(standardsTab!);

    // Verify setSearchParams was called with both tab and audit_year
    await waitFor(() => {
      expect(mockSetSearchParams).toHaveBeenCalled();
      const call = mockSetSearchParams.mock.calls[0];
      const updaterFn = call[0];
      const options = call[1];

      // Execute the updater function with current params
      const result = updaterFn(currentSearchParams);

      expect(result.get('tab')).toBe('standards');
      expect(result.get('audit_year')).toBe('2025');
      expect(options).toEqual({ replace: true });
    });
  });

  it('should NOT add audit_year when switching tabs in live mode', async () => {
    mockUseAuditYear.mockReturnValue({
      selectedYear: null,
      frozenYears: ['2025', '2024'],
      isLoadingYears: false,
      setSelectedYear: vi.fn(),
      refreshYears: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/?tab=overview']}>
        <DashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /overview/i })[0]).toBeInTheDocument();
    });

    const tabButtons = screen.getAllByRole('button');
    const standardsTab = tabButtons.find(btn => btn.textContent === 'Standards');
    await userEvent.click(standardsTab!);

    // Verify setSearchParams was called with only tab (no audit_year)
    await waitFor(() => {
      expect(mockSetSearchParams).toHaveBeenCalled();
      const call = mockSetSearchParams.mock.calls[0];
      const updaterFn = call[0];
      const options = call[1];

      const result = updaterFn(currentSearchParams);

      expect(result.get('tab')).toBe('standards');
      expect(result.get('audit_year')).toBeNull();
      expect(options).toEqual({ replace: true });
    });
  });

  it('should preserve audit_year when navigating from frozen mode URL', async () => {
    mockUseAuditYear.mockReturnValue({
      selectedYear: '2025',
      frozenYears: ['2025', '2024'],
      isLoadingYears: false,
      setSelectedYear: vi.fn(),
      refreshYears: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/?tab=overview&audit_year=2025']}>
        <DashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /overview/i })[0]).toBeInTheDocument();
    });

    const tabButtons = screen.getAllByRole('button');
    const coursesTab = tabButtons.find(btn => btn.textContent === 'Courses');
    await userEvent.click(coursesTab!);

    // audit_year should be preserved in the new tab
    await waitFor(() => {
      expect(mockSetSearchParams).toHaveBeenCalled();
      const call = mockSetSearchParams.mock.calls[0];
      const updaterFn = call[0];
      const options = call[1];

      // Simulate the URL having audit_year=2025
      currentSearchParams.set('audit_year', '2025');
      const result = updaterFn(currentSearchParams);

      expect(result.get('tab')).toBe('courses');
      expect(result.get('audit_year')).toBe('2025');
      expect(options).toEqual({ replace: true });
    });
  });
});
