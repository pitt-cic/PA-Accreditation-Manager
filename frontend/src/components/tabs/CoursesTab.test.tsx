import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { CoursesTab } from './CoursesTab';
import { standardsApi } from '../../api/standards';
import type { CourseAPI } from '../../types/evidence';

vi.mock('../../api/standards');
vi.mock('../../api/courses');

// Mock useAuditYear with controllable selectedYear
const mockUseAuditYear = vi.fn();
vi.mock('../../contexts/AuditYearContext', () => ({
  useAuditYear: () => mockUseAuditYear(),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockCourse: CourseAPI = {
  course_id: 'course-1',
  course_code: 'PHAS-501',
  course_name: 'Clinical Medicine I',
  clos: [
    {
      id: 'CLO-1',
      name: 'Describe common diseases',
      topic_ids: ['topic-1'],
      assessment_ids: [],
    },
  ],
  cts: [
    {
      id: 'topic-1',
      name: 'Cardiovascular Diseases',
      ios: ['Identify risk factors for CAD', 'Explain pathophysiology of MI'],
      assessment_ids: ['ASSESS-1'],
    },
  ],
  assessments: [
    { id: 'ASSESS-1', name: 'Midterm Exam', info: 'Written exam' },
  ],
  goals: [],
  competencies: [],
};

const mockGoal = {
  id: 'GOAL-1',
  name: 'Patient Care',
  goal_id: 'GOAL-1',
  goal_name: 'Patient Care',
  mapped_topics: [],
  mapped_courses: [],
};

const mockCompetency = {
  id: 'COMP-1',
  name: 'Medical Knowledge',
  competency_id: 'COMP-1',
  competency_name: 'Medical Knowledge',
  mapped_topics: [],
  mapped_courses: [],
};

describe('CoursesTab - audit_year propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  it('should propagate audit_year to course detail link when in frozen mode', async () => {
    mockUseAuditYear.mockReturnValue({ selectedYear: '2025' });
    vi.mocked(standardsApi.getCourses).mockResolvedValue({ courses: [mockCourse] });
    vi.mocked(standardsApi.getGoals).mockResolvedValue({ goals: [mockGoal] });
    vi.mocked(standardsApi.getCompetencies).mockResolvedValue({ competencies: [mockCompetency] });

    render(
      <BrowserRouter>
        <CoursesTab standards={[]} onViewStandard={vi.fn()} />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PHAS-501')).toBeInTheDocument();
    });

    const courseCard = screen.getByText('PHAS-501').closest('button');
    expect(courseCard).toBeInTheDocument();

    await userEvent.click(courseCard!);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/courses/PHAS-501?audit_year=2025',
      expect.objectContaining({
        state: { breadcrumbs: [{ label: 'Courses', href: '/?tab=courses&audit_year=2025' }] },
      })
    );
  });

  it('should NOT add audit_year to course detail link in live mode', async () => {
    mockUseAuditYear.mockReturnValue({ selectedYear: null });
    vi.mocked(standardsApi.getCourses).mockResolvedValue({ courses: [mockCourse] });
    vi.mocked(standardsApi.getGoals).mockResolvedValue({ goals: [mockGoal] });
    vi.mocked(standardsApi.getCompetencies).mockResolvedValue({ competencies: [mockCompetency] });

    render(
      <BrowserRouter>
        <CoursesTab standards={[]} onViewStandard={vi.fn()} />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PHAS-501')).toBeInTheDocument();
    });

    const courseCard = screen.getByText('PHAS-501').closest('button');
    await userEvent.click(courseCard!);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/courses/PHAS-501',
      expect.objectContaining({
        state: { breadcrumbs: [{ label: 'Courses', href: '/?tab=courses' }] },
      })
    );
  });

  it('should propagate audit_year to Goals tab link in ProgramDataGate', async () => {
    mockUseAuditYear.mockReturnValue({ selectedYear: '2025' });
    vi.mocked(standardsApi.getCourses).mockResolvedValue({ courses: [] });
    vi.mocked(standardsApi.getGoals).mockResolvedValue({ goals: [] });
    vi.mocked(standardsApi.getCompetencies).mockResolvedValue({ competencies: [mockCompetency] });

    render(
      <BrowserRouter>
        <CoursesTab standards={[]} onViewStandard={vi.fn()} />
      </BrowserRouter>
    );

    const goalsButton = await screen.findByRole('button', { name: /Go to Program Goals/i });
    await userEvent.click(goalsButton);

    expect(mockNavigate).toHaveBeenCalledWith('/?tab=goals&audit_year=2025');
  });

  it('should propagate audit_year to Competencies tab link in ProgramDataGate', async () => {
    mockUseAuditYear.mockReturnValue({ selectedYear: '2025' });
    vi.mocked(standardsApi.getCourses).mockResolvedValue({ courses: [] });
    vi.mocked(standardsApi.getGoals).mockResolvedValue({ goals: [mockGoal] });
    vi.mocked(standardsApi.getCompetencies).mockResolvedValue({ competencies: [] });

    render(
      <BrowserRouter>
        <CoursesTab standards={[]} onViewStandard={vi.fn()} />
      </BrowserRouter>
    );

    const competenciesButton = await screen.findByRole('button', { name: /Go to Competencies/i });
    await userEvent.click(competenciesButton);

    expect(mockNavigate).toHaveBeenCalledWith('/?tab=competencies&audit_year=2025');
  });
});
