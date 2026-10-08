import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GoalsTab } from './GoalsTab';
import * as AuditYearModule from '../../contexts/AuditYearContext';
import * as StandardsApiModule from '../../api/standards';

vi.mock('../../contexts/AuditYearContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuditYearModule>();
  return { ...actual, useAuditYear: vi.fn() };
});

vi.mock('../../api/standards', async (importOriginal) => {
  const actual = await importOriginal<typeof StandardsApiModule>();
  return { ...actual, standardsApi: { ...actual.standardsApi, getGoals: vi.fn(), uploadGoals: vi.fn() } };
});

const mockUseAuditYear = vi.mocked(AuditYearModule.useAuditYear);
const mockGetGoals = vi.mocked(StandardsApiModule.standardsApi.getGoals);

const YEAR = '2024-2025';
const COURSE_CODE = 'PAS2401';
const CLO_ID = 'CL1';
const GOAL_ID = 'G1';

function makeGoal() {
  return {
    id: GOAL_ID,
    name: 'Patient Care',
    mapped_courses: [
      {
        course_id: COURSE_CODE,
        course_code: COURSE_CODE,
        clos: [{ id: CLO_ID, name: 'Perform history', topics: [] }],
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
  mockGetGoals.mockResolvedValue({ goals: [makeGoal()] });

  return render(
    <MemoryRouter>
      <GoalsTab />
    </MemoryRouter>
  );
}

describe('GoalsTab — CourseRow link propagation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('CourseRow link includes ?audit_year= when frozen year selected', async () => {
    const user = userEvent.setup();
    setup(YEAR);
    // expand goal card
    const goalButton = await screen.findByRole('button', { name: /patient care/i });
    await user.click(goalButton);

    const courseLink = await screen.findByTitle(`View ${COURSE_CODE} course detail`);
    expect(courseLink.getAttribute('href')).toContain(`audit_year=${encodeURIComponent(YEAR)}`);
  });

  it('CourseRow link has NO ?audit_year= in live mode', async () => {
    const user = userEvent.setup();
    setup(null);
    const goalButton = await screen.findByRole('button', { name: /patient care/i });
    await user.click(goalButton);

    const courseLink = await screen.findByTitle(`View ${COURSE_CODE} course detail`);
    expect(courseLink.getAttribute('href')).not.toContain('audit_year');
  });
});

describe('GoalsTab — CLORow link propagation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('CLORow course link includes ?audit_year= when frozen year selected', async () => {
    const user = userEvent.setup();
    setup(YEAR);
    // expand goal card, then expand course row to reveal CLO links
    const goalButton = await screen.findByRole('button', { name: /patient care/i });
    await user.click(goalButton);
    // CourseRow expand button contains course code text — find by accessible text
    const allButtons = await screen.findAllByRole('button');
    const courseExpandBtn = allButtons.find((b) => b.textContent?.includes(COURSE_CODE) && !b.textContent?.includes('Patient Care'));
    if (!courseExpandBtn) throw new Error(`Could not find expand button for ${COURSE_CODE}`);
    await user.click(courseExpandBtn);

    const cloLink = await screen.findByTitle(new RegExp(`View ${CLO_ID} in ${COURSE_CODE}`));
    expect(cloLink.getAttribute('href')).toContain(`audit_year=${encodeURIComponent(YEAR)}`);
  });

  it('CLORow course link has NO ?audit_year= in live mode', async () => {
    const user = userEvent.setup();
    setup(null);
    const goalButton = await screen.findByRole('button', { name: /patient care/i });
    await user.click(goalButton);
    const allButtons = await screen.findAllByRole('button');
    const courseExpandBtn = allButtons.find((b) => b.textContent?.includes(COURSE_CODE) && !b.textContent?.includes('Patient Care'));
    if (!courseExpandBtn) throw new Error(`Could not find expand button for ${COURSE_CODE}`);
    await user.click(courseExpandBtn);

    const cloLink = await screen.findByTitle(new RegExp(`View ${CLO_ID} in ${COURSE_CODE}`));
    expect(cloLink.getAttribute('href')).not.toContain('audit_year');
  });
});
