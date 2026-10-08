import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportTab } from './ExportTab';
import { fillDocumentApi } from '../../api/fillDocument';
import { standardsApi } from '../../api/standards';

vi.mock('../../api/fillDocument');
vi.mock('../../api/standards');

const mockUseAuditYear = vi.fn();
vi.mock('../../contexts/AuditYearContext', () => ({
  useAuditYear: () => mockUseAuditYear(),
}));

const mockTemplate = {
  key: 'template-a',
  name: 'Section A Report',
  standard_prefix: 'A',
};

const mockStandard = {
  standard_id: 'A1.01',
  section_id: 'A',
  requirement_text: 'The program must do X.',
  status: 'analysis_complete' as const,
  status_updated_at: '2024-01-01T00:00:00Z',
  is_frozen: true,
};

function mockLiveMode() {
  mockUseAuditYear.mockReturnValue({
    selectedYear: null,
    refreshYears: vi.fn(),
    setSelectedYear: vi.fn(),
  });
}

function mockFrozenMode(year = '2024-2025') {
  mockUseAuditYear.mockReturnValue({
    selectedYear: year,
    refreshYears: vi.fn(),
    setSelectedYear: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fillDocumentApi.listTemplates).mockResolvedValue({ templates: [mockTemplate] });
  vi.mocked(standardsApi.getAll).mockResolvedValue({
    standards: [mockStandard],
    status_summary: { queued: 0, processing: 0, processed: 1, error: 0, total: 1 },
    readiness_summary: { ready: 1, mostly_ready: 0, needs_work: 0, not_ready: 0, no_guidance: 0 },
  });
});

describe('ExportTab – frozen mode: clean standards list', () => {
  it('does not render the "Freeze Audit Year" panel in frozen mode', async () => {
    mockFrozenMode('2024-2025');
    render(<ExportTab />);

    await waitFor(() => {
      expect(screen.getByText('Section A Report')).toBeInTheDocument();
    });

    expect(screen.queryByText(/freeze audit year/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/e\.g\./i)).not.toBeInTheDocument();
  });
});

describe('ExportTab – live mode: template export', () => {
  it('renders the template list and clicking Export calls fillDocumentApi.startExport', async () => {
    mockLiveMode();
    vi.mocked(fillDocumentApi.startExport).mockResolvedValue({ job_id: 'job-abc' });

    const user = userEvent.setup();
    render(<ExportTab />);

    await waitFor(() => {
      expect(screen.getByText('Section A Report')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => {
      expect(vi.mocked(fillDocumentApi.startExport)).toHaveBeenCalledWith(
        'template-a',
        'A',
        null
      );
    });
  });
});
