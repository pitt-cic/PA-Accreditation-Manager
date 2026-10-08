import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CourseDetailPage from './CourseDetailPage';
import * as StandardsApiModule from '../api/standards';
import * as AuthModule from '../hooks/useAuth';

vi.mock('../api/standards', async (importOriginal) => {
  const actual = await importOriginal<typeof StandardsApiModule>();
  return {
    ...actual,
    standardsApi: {
      ...actual.standardsApi,
      getCourses: vi.fn(),
      getAll: vi.fn(),
    },
  };
});

vi.mock('../hooks/useAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthModule>();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

// Mock useAuditYear
const mockUseAuditYear = vi.fn();
vi.mock('../contexts/AuditYearContext', () => ({
  useAuditYear: () => mockUseAuditYear(),
}));

const mockGetCourses = vi.mocked(StandardsApiModule.standardsApi.getCourses);
const mockGetAll = vi.mocked(StandardsApiModule.standardsApi.getAll);
const mockUseAuth = vi.mocked(AuthModule.useAuth);

const YEAR = '2024-2025';
const COURSE_CODE = 'PAS2401';
const STANDARD_ID = 'B2.07a';
const GOAL_ID = 'G1';
const COMP_ID = 'C1';
const CLO_ID = 'CLO1';
const TOPIC_ID = 'T1';

function makeCourse(withClo = false) {
  return {
    course_id: COURSE_CODE,
    course_code: COURSE_CODE,
    course_name: 'Introduction to PA Practice',
    description: '',
    // cts = topics; used by CloAccordion's TopicBlock
    cts: withClo
      ? [{ id: TOPIC_ID, name: 'History Taking', ios: ['Demonstrate patient interviewing'], assessment_ids: [] }]
      : [],
    clos: withClo
      ? [{
          id: CLO_ID,
          name: 'Perform a complete patient history',
          topic_ids: [TOPIC_ID],
          assessment_ids: [],
        }]
      : [],
    assessments: [],
    goals: [{ id: GOAL_ID, name: 'Patient Care', clo_ids: withClo ? [CLO_ID] : [] }],
    competencies: [{ id: COMP_ID, name: 'Clinical Reasoning', clo_ids: withClo ? [CLO_ID] : [] }],
  };
}

function makeStandard(withTopicMapping = false) {
  return {
    standard_id: STANDARD_ID,
    section_id: 'B2',
    requirement_text: 'Test requirement',
    status: 'analysis_complete',
    status_updated_at: '',
    course_codes: [COURSE_CODE],
    course_evidence_map: withTopicMapping
      ? [{
          course_code: COURSE_CODE,
          evidence_items: [{
            ee_id: 'EE1',
            ee_text: 'Evidence text',
            clos: [{
              clo_id: CLO_ID,
              topics: [{ topic_id: TOPIC_ID }],
            }],
          }],
        }]
      : [],
  };
}

function setupAuth() {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    userAttributes: { email: 'test@test.com' },
    error: null,
    cognitoUser: null,
    login: vi.fn(),
    logout: vi.fn(),
    completeNewPasswordChallenge: vi.fn(),
    clearError: vi.fn(),
    getToken: vi.fn(),
    getUserEmail: vi.fn(),
  } as unknown as ReturnType<typeof AuthModule.useAuth>);
}

function setupAuditYear(selectedYear: string | null) {
  mockUseAuditYear.mockReturnValue({
    selectedYear,
    frozenYears: ['2025-2026', '2024-2025'],
    isLoadingYears: false,
    setSelectedYear: vi.fn(),
    refreshYears: vi.fn(),
  });
}

function setup(auditYear: string | null, withClo = false, withTopicMapping = false) {
  setupAuth();
  setupAuditYear(auditYear);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockGetCourses.mockResolvedValue({ courses: [makeCourse(withClo)] } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockGetAll.mockResolvedValue({ standards: [makeStandard(withTopicMapping)] } as any);

  const search = auditYear ? `?audit_year=${encodeURIComponent(auditYear)}` : '';

  return render(
    <MemoryRouter initialEntries={[`/courses/${COURSE_CODE}${search}`]}>
      <Routes>
        <Route path="/courses/:code" element={<CourseDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CourseDetailPage — getCourses audit_year forwarding', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('passes audit_year to getCourses when URL contains ?audit_year=', async () => {
    setup(YEAR);
    await screen.findByText('Introduction to PA Practice');
    expect(mockGetCourses).toHaveBeenCalledWith(YEAR);
  });

  it('calls getCourses with no audit_year in live mode', async () => {
    setup(null);
    await screen.findByText('Introduction to PA Practice');
    expect(mockGetCourses).toHaveBeenCalledWith(null);
  });
});

describe('CourseDetailPage — goal pill link propagation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('goal pill link includes ?audit_year= when URL has audit_year', async () => {
    setup(YEAR);
    await screen.findByText('Introduction to PA Practice');

    const goalPill = screen.getByTitle('Patient Care');
    expect(goalPill.getAttribute('href')).toContain(`audit_year=${encodeURIComponent(YEAR)}`);
  });

  it('goal pill link has NO ?audit_year= in live mode', async () => {
    setup(null);
    await screen.findByText('Introduction to PA Practice');

    const goalPill = screen.getByTitle('Patient Care');
    expect(goalPill.getAttribute('href')).not.toContain('audit_year');
  });
});

describe('CourseDetailPage — competency pill link propagation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('competency pill link includes ?audit_year= when URL has audit_year', async () => {
    setup(YEAR);
    await screen.findByText('Introduction to PA Practice');

    const compPill = screen.getByTitle('Clinical Reasoning');
    expect(compPill.getAttribute('href')).toContain(`audit_year=${encodeURIComponent(YEAR)}`);
  });

  it('competency pill link has NO ?audit_year= in live mode', async () => {
    setup(null);
    await screen.findByText('Introduction to PA Practice');

    const compPill = screen.getByTitle('Clinical Reasoning');
    expect(compPill.getAttribute('href')).not.toContain('audit_year');
  });
});

describe('CourseDetailPage — StandardCard external link propagation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('StandardCard link includes ?audit_year= when URL has audit_year', async () => {
    setup(YEAR);
    await screen.findByText('Introduction to PA Practice');

    const stdLink = screen.getByTitle(`Open ${STANDARD_ID}`);
    expect(stdLink.getAttribute('href')).toContain(`audit_year=${encodeURIComponent(YEAR)}`);
  });

  it('StandardCard link has NO ?audit_year= in live mode', async () => {
    setup(null);
    await screen.findByText('Introduction to PA Practice');

    const stdLink = screen.getByTitle(`Open ${STANDARD_ID}`);
    expect(stdLink.getAttribute('href')).not.toContain('audit_year');
  });
});

describe('CourseDetailPage — CloAccordion goal/competency link propagation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function openCloGoalsTab(auditYear: string | null) {
    setup(auditYear, true);
    await screen.findByText('Introduction to PA Practice');

    // Navigate to Full CLO View tab
    fireEvent.click(screen.getByText('Full CLO View'));
    // Expand the CLO accordion
    fireEvent.click(await screen.findByText('Perform a complete patient history'));
    // Switch to Goals & Competencies tab within the CLO (label is "Goals & Comp. (N)")
    fireEvent.click(await screen.findByText(/Goals & Comp\./));
  }

  it('CloAccordion goal link includes audit_year in frozen mode', async () => {
    await openCloGoalsTab(YEAR);
    const goalLink = await screen.findByText('Patient Care');
    expect(goalLink.closest('a')?.getAttribute('href')).toContain(`audit_year=${encodeURIComponent(YEAR)}`);
  });

  it('CloAccordion goal link has NO audit_year in live mode', async () => {
    await openCloGoalsTab(null);
    const goalLink = await screen.findByText('Patient Care');
    expect(goalLink.closest('a')?.getAttribute('href')).not.toContain('audit_year');
  });

  it('CloAccordion competency link includes audit_year in frozen mode', async () => {
    await openCloGoalsTab(YEAR);
    const compLink = await screen.findByText('Clinical Reasoning');
    expect(compLink.closest('a')?.getAttribute('href')).toContain(`audit_year=${encodeURIComponent(YEAR)}`);
  });

  it('CloAccordion competency link has NO audit_year in live mode', async () => {
    await openCloGoalsTab(null);
    const compLink = await screen.findByText('Clinical Reasoning');
    expect(compLink.closest('a')?.getAttribute('href')).not.toContain('audit_year');
  });
});

describe('CourseDetailPage — TopicBlock standard link propagation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function openTopicStandardLinks(auditYear: string | null) {
    setup(auditYear, true, true);
    await screen.findByText('Introduction to PA Practice');

    // Navigate to Full CLO View tab
    fireEvent.click(screen.getByText('Full CLO View'));
    // Expand the CLO accordion to reveal TopicBlock
    fireEvent.click(await screen.findByText('Perform a complete patient history'));
    // Expand the topic
    fireEvent.click(await screen.findByText('History Taking'));
  }

  it('TopicBlock standard link includes audit_year in frozen mode', async () => {
    await openTopicStandardLinks(YEAR);
    const stdLink = await screen.findByText(STANDARD_ID);
    expect(stdLink.closest('a')?.getAttribute('href')).toContain(`audit_year=${encodeURIComponent(YEAR)}`);
  });

  it('TopicBlock standard link has NO audit_year in live mode', async () => {
    await openTopicStandardLinks(null);
    const stdLink = await screen.findByText(STANDARD_ID);
    expect(stdLink.closest('a')?.getAttribute('href')).not.toContain('audit_year');
  });
});

describe('CourseDetailPage — frozen year banner', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should display frozen year banner when viewing frozen data', async () => {
    setup(YEAR);
    await screen.findByText('Introduction to PA Practice');

    // Should show the frozen year banner
    expect(screen.getByText(/viewing frozen data from audit year/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(YEAR))).toBeInTheDocument();
  });

  it('should NOT display frozen year banner in live mode', async () => {
    setup(null);
    await screen.findByText('Introduction to PA Practice');

    // Should NOT show the frozen year banner
    expect(screen.queryByText(/viewing frozen data/i)).not.toBeInTheDocument();
  });

  it('should display frozen year banner in error state when frozen year in URL', async () => {
    setupAuth();
    setupAuditYear(YEAR);

    mockGetCourses.mockRejectedValue(new Error('Network error'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetAll.mockResolvedValue({ standards: [] } as any);

    const search = `?audit_year=${encodeURIComponent(YEAR)}`;
    render(
      <MemoryRouter initialEntries={[`/courses/${COURSE_CODE}${search}`]}>
        <Routes>
          <Route path="/courses/:code" element={<CourseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText(/Network error/i);

    // Should still show the frozen year banner even in error state
    expect(screen.getByText(/viewing frozen data from audit year/i)).toBeInTheDocument();
  });
});
