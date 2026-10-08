import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from './AppShell';
import { auditApi } from '../../api/audit';

vi.mock('../../api/audit');

const mockUseAuditYear = vi.fn();
vi.mock('../../contexts/AuditYearContext', () => ({
  useAuditYear: () => mockUseAuditYear(),
}));

vi.mock('../UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

const defaultProps = {
  activeTab: 'overview' as const,
  onTabChange: vi.fn(),
  children: <div>tab content</div>,
};

function mockLiveMode(frozenYears: string[] = ['2024-2025']) {
  const mockRefreshYears = vi.fn().mockResolvedValue(undefined);
  const mockSetSelectedYear = vi.fn();
  mockUseAuditYear.mockReturnValue({
    selectedYear: null,
    frozenYears,
    isLoadingYears: false,
    setSelectedYear: mockSetSelectedYear,
    refreshYears: mockRefreshYears,
  });
  return { mockRefreshYears, mockSetSelectedYear };
}

function mockFrozenMode(year = '2024-2025', allYears = ['2024-2025', '2023-2024']) {
  const mockRefreshYears = vi.fn().mockResolvedValue(undefined);
  const mockSetSelectedYear = vi.fn();
  mockUseAuditYear.mockReturnValue({
    selectedYear: year,
    frozenYears: allYears,
    isLoadingYears: false,
    setSelectedYear: mockSetSelectedYear,
    refreshYears: mockRefreshYears,
  });
  return { mockRefreshYears, mockSetSelectedYear };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AppShell – AuditYearSelector trigger button', () => {
  it('shows "Current" when selectedYear is null', () => {
    mockLiveMode([]);
    render(<AppShell {...defaultProps} />);
    expect(screen.getByTestId('year-selector')).toHaveTextContent('Current');
  });

  it('shows the frozen year label when selectedYear is set', () => {
    mockFrozenMode('2024-2025');
    render(<AppShell {...defaultProps} />);
    expect(screen.getByTestId('year-selector')).toHaveTextContent('2024-2025');
  });
});

describe('AppShell – dropdown opens', () => {
  it('clicking the trigger opens the dropdown panel', async () => {
    mockLiveMode(['2024-2025', '2023-2024']);
    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    expect(screen.queryByRole('option', { name: /current/i })).not.toBeInTheDocument();

    await user.click(screen.getByTestId('year-selector'));

    expect(screen.getByRole('option', { name: /current/i })).toBeInTheDocument();
  });
});

describe('AppShell – dropdown lists years and marks active', () => {
  it('lists "Current" and all frozenYears; active selection has aria-selected=true', async () => {
    mockLiveMode(['2024-2025', '2023-2024']);
    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    await user.click(screen.getByTestId('year-selector'));

    const currentOption = screen.getByRole('option', { name: /^current$/i });
    const year1Option = screen.getByRole('option', { name: '2024-2025' });
    const year2Option = screen.getByRole('option', { name: '2023-2024' });

    expect(currentOption).toBeInTheDocument();
    expect(year1Option).toBeInTheDocument();
    expect(year2Option).toBeInTheDocument();

    // "Current" is active (selectedYear is null)
    expect(currentOption).toHaveAttribute('aria-selected', 'true');
    expect(year1Option).toHaveAttribute('aria-selected', 'false');
    expect(year2Option).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the active frozen year with aria-selected=true', async () => {
    mockFrozenMode('2024-2025');
    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    await user.click(screen.getByTestId('year-selector'));

    expect(screen.getByRole('option', { name: /^current$/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('option', { name: '2024-2025' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('AppShell – selecting a year', () => {
  it('clicking a year option calls setSelectedYear with that year and closes the dropdown', async () => {
    const { mockSetSelectedYear } = mockLiveMode(['2024-2025', '2023-2024']);
    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    await user.click(screen.getByTestId('year-selector'));
    await user.click(screen.getByRole('option', { name: '2024-2025' }));

    expect(mockSetSelectedYear).toHaveBeenCalledWith('2024-2025');
    expect(screen.queryByRole('option', { name: '2024-2025' })).not.toBeInTheDocument();
  });

  it('clicking "Current" calls setSelectedYear(null)', async () => {
    const { mockSetSelectedYear } = mockFrozenMode('2024-2025');
    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    await user.click(screen.getByTestId('year-selector'));
    await user.click(screen.getByRole('option', { name: /^current$/i }));

    expect(mockSetSelectedYear).toHaveBeenCalledWith(null);
  });
});

describe('AppShell – Add New Year action', () => {
  it('"Add New Year" appears in the dropdown (not "Freeze audit year")', async () => {
    mockLiveMode(['2024-2025']);
    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    await user.click(screen.getByTestId('year-selector'));

    expect(screen.queryByText('Freeze audit year')).not.toBeInTheDocument();
    expect(screen.getByText('Add New Year')).toBeInTheDocument();
  });

  it('in live mode: "Add New Year" is interactive', async () => {
    mockLiveMode(['2024-2025']);
    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    await user.click(screen.getByTestId('year-selector'));

    expect(screen.getByText('Add New Year').closest('button')).not.toBeDisabled();
  });

  it('in frozen mode: "Add New Year" is disabled', async () => {
    mockFrozenMode('2024-2025');
    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    await user.click(screen.getByTestId('year-selector'));

    expect(screen.getByText('Add New Year').closest('button')).toBeDisabled();
  });

  it('clicking "Add New Year" opens a modal with warning copy and year input', async () => {
    mockLiveMode(['2024-2025']);
    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    await user.click(screen.getByTestId('year-selector'));
    await user.click(screen.getByText('Add New Year'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/standard mappings will be cleared/i)).toBeInTheDocument();
    expect(screen.getByText(/courses.*goals.*competencies/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\./i)).toBeInTheDocument();
  });

  it('submitting calls auditApi.freezeYear and refreshYears then shows success step', async () => {
    const { mockRefreshYears, mockSetSelectedYear } = mockLiveMode(['2024-2025']);
    vi.mocked(auditApi.freezeYear).mockResolvedValue({
      year: '2025-2026',
      frozen_count: 10,
      purged_standards_count: 10,
      courses_count: 5,
      goals_count: 3,
      competencies_count: 2,
      comments_count: 1,
      attachments_count: 0,
    });

    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    await user.click(screen.getByTestId('year-selector'));
    await user.click(screen.getByText('Add New Year'));

    await user.type(screen.getByPlaceholderText(/e\.g\./i), '2025-2026');
    await user.click(screen.getByRole('button', { name: /^create year$/i }));

    await waitFor(() => expect(vi.mocked(auditApi.freezeYear)).toHaveBeenCalledWith('2025-2026'));
    await waitFor(() => expect(mockRefreshYears).toHaveBeenCalled());
    await waitFor(() => expect(mockSetSelectedYear).toHaveBeenCalledWith('2025-2026'));

    expect(screen.getByText(/2025-2026.*created/i)).toBeInTheDocument();
    expect(screen.getByText(/10.*standards.*frozen/i)).toBeInTheDocument();
    expect(screen.getByText(/10.*standard mappings cleared/i)).toBeInTheDocument();
  });

  it('shows an error message when freezeYear fails', async () => {
    mockLiveMode(['2024-2025']);
    vi.mocked(auditApi.freezeYear).mockRejectedValue(
      Object.assign(new Error(), { data: { error: 'Year already frozen' } })
    );

    const user = userEvent.setup();
    render(<AppShell {...defaultProps} />);

    await user.click(screen.getByTestId('year-selector'));
    await user.click(screen.getByText('Add New Year'));

    await user.type(screen.getByPlaceholderText(/e\.g\./i), '2024-2025');
    await user.click(screen.getByRole('button', { name: /^create year$/i }));

    await waitFor(() => expect(screen.getByText(/year already frozen/i)).toBeInTheDocument());
  });
});
