import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CompetenciesTab } from './CompetenciesTab';
import * as AuditYearModule from '../../contexts/AuditYearContext';
import * as StandardsApiModule from '../../api/standards';

vi.mock('../../contexts/AuditYearContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuditYearModule>();
  return { ...actual, useAuditYear: vi.fn() };
});

vi.mock('../../api/standards', async (importOriginal) => {
  const actual = await importOriginal<typeof StandardsApiModule>();
  return {
    ...actual,
    standardsApi: { ...actual.standardsApi, getCompetencies: vi.fn(), uploadCompetencies: vi.fn() },
  };
});

const mockUseAuditYear = vi.mocked(AuditYearModule.useAuditYear);
const mockGetCompetencies = vi.mocked(StandardsApiModule.standardsApi.getCompetencies);

const YEAR = '2024-2025';
const COURSE_CODE = 'PAS2401';
const CLO_ID = 'CL1';
const COMP_ID = 'C1';

function makeCompetency() {
  return {
    id: COMP_ID,
    name: 'Clinical Reasoning',
    mapped_courses: [
      {
        course_id: COURSE_CODE,
        course_code: COURSE_CODE,
        clos: [{ id: CLO_ID, name: 'Perform H&P', topics: [] }],
      },
    ],
  };
}

function setup(selectedYear: string | null) {
  mockUseAuditYear.mockReturnValue({
    selectedYear,
    frozenYears: selectedYear ? [selectedYear] : [],
    isLoadingYears: false,
    setSelectedYear: vi.fn(),
    refreshYears: vi.fn(),
  });
  mockGetCompetencies.mockResolvedValue({ competencies: [makeCompetency()] });

  return render(
    <MemoryRouter>
      <CompetenciesTab standards={[]} onViewStandard={() => {}} />
    </MemoryRouter>
  );
}

describe('CompetenciesTab — CourseRow link propagation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('CourseRow link includes ?audit_year= when frozen year selected', async () => {
    const user = userEvent.setup();
    setup(YEAR);
    const compButton = await screen.findByRole('button', { name: /clinical reasoning/i });
    await user.click(compButton);

    const courseLink = await screen.findByTitle(`View ${COURSE_CODE} course detail`);
    expect(courseLink.getAttribute('href')).toContain(`audit_year=${encodeURIComponent(YEAR)}`);
  });

  it('CourseRow link has NO ?audit_year= in live mode', async () => {
    const user = userEvent.setup();
    setup(null);
    const compButton = await screen.findByRole('button', { name: /clinical reasoning/i });
    await user.click(compButton);

    const courseLink = await screen.findByTitle(`View ${COURSE_CODE} course detail`);
    expect(courseLink.getAttribute('href')).not.toContain('audit_year');
  });
});

describe('CompetenciesTab — CLORow link propagation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('CLORow course link includes ?audit_year= when frozen year selected', async () => {
    const user = userEvent.setup();
    setup(YEAR);
    const compButton = await screen.findByRole('button', { name: /clinical reasoning/i });
    await user.click(compButton);
    const allButtons = await screen.findAllByRole('button');
    const courseExpandBtn = allButtons.find((b) => b.textContent?.includes(COURSE_CODE) && !b.textContent?.includes('Clinical Reasoning'));
    if (!courseExpandBtn) throw new Error(`Could not find expand button for ${COURSE_CODE}`);
    await user.click(courseExpandBtn);

    const cloLink = await screen.findByTitle(new RegExp(`View ${CLO_ID} in ${COURSE_CODE}`));
    expect(cloLink.getAttribute('href')).toContain(`audit_year=${encodeURIComponent(YEAR)}`);
  });

  it('CLORow course link has NO ?audit_year= in live mode', async () => {
    const user = userEvent.setup();
    setup(null);
    const compButton = await screen.findByRole('button', { name: /clinical reasoning/i });
    await user.click(compButton);
    const allButtons = await screen.findAllByRole('button');
    const courseExpandBtn = allButtons.find((b) => b.textContent?.includes(COURSE_CODE) && !b.textContent?.includes('Clinical Reasoning'));
    if (!courseExpandBtn) throw new Error(`Could not find expand button for ${COURSE_CODE}`);
    await user.click(courseExpandBtn);

    const cloLink = await screen.findByTitle(new RegExp(`View ${CLO_ID} in ${COURSE_CODE}`));
    expect(cloLink.getAttribute('href')).not.toContain('audit_year');
  });
});
