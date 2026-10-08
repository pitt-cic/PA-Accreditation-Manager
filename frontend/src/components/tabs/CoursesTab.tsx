import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { standardsApi } from '../../api/standards';
import { useAuditYear } from '../../contexts/AuditYearContext';
import { coursesProcessingApi } from '../../api/courses';
import { UploadContentPanel } from '../courses/UploadContentPanel';
import type { CourseAPI, StandardItem } from '../../types/evidence';
import type { ActiveProcessingExecution } from '../../api/courses';

interface CoursesTabProps {
  standards: StandardItem[];
  onViewStandard: (id: string) => void;
}

function ExecutionBanner({ execution }: { execution: ActiveProcessingExecution }) {
  const currentLabel = execution.jobs.find((j) => j.status === 'in_progress')?.label ?? null;

  const mapStep = execution.jobs.find((j) => j.name === 'ProcessEachCourse' && j.status === 'in_progress' && j.courses && j.courses.length > 0);
  const courseCount = mapStep?.courses
    ? `${mapStep.courses.filter((c) => c.status === 'completed').length}/${mapStep.courses.length} courses`
    : null;

  const startedAt = execution.started_at
    ? new Date(execution.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
      style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}
    >
      <svg className="w-4 h-4 flex-shrink-0 animate-spin" style={{ color: '#2563eb' }} fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <span className="font-semibold text-xs" style={{ color: '#1d4ed8' }}>Processing…</span>
      {currentLabel && (
        <>
          <span className="text-[#bfdbfe] select-none">·</span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
            {currentLabel}
          </span>
        </>
      )}
      {courseCount && (
        <>
          <span className="text-[#bfdbfe] select-none">·</span>
          <span className="text-[11px]" style={{ color: '#64748b' }}>{courseCount}</span>
        </>
      )}
      {startedAt && (
        <>
          <span className="text-[#bfdbfe] select-none">·</span>
          <span className="text-[11px]" style={{ color: '#94a3b8' }}>started {startedAt}</span>
        </>
      )}
    </div>
  );
}

function ActiveProcessingPanel() {
  const [executions, setExecutions] = useState<ActiveProcessingExecution[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await coursesProcessingApi.getActiveProcessing();
        if (!cancelled) setExecutions(res.executions);
      } catch {
        if (!cancelled) setExecutions((prev) => prev ?? []);
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!executions || executions.length === 0) return null;
  return (
    <div className="space-y-2">
      {executions.map((ex) => (
        <ExecutionBanner key={ex.execution_arn} execution={ex} />
      ))}
    </div>
  );
}

function CourseCard({ course }: { course: CourseAPI }) {
  const navigate = useNavigate();
  const { selectedYear } = useAuditYear();

  const handleClick = () => {
    const basePath = `/courses/${encodeURIComponent(course.course_code)}`;
    const path = selectedYear ? `${basePath}?audit_year=${encodeURIComponent(selectedYear)}` : basePath;
    const breadcrumbHref = selectedYear ? `/?tab=courses&audit_year=${encodeURIComponent(selectedYear)}` : '/?tab=courses';

    navigate(path, {
      state: { breadcrumbs: [{ label: 'Courses', href: breadcrumbHref }] },
    });
  };

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border border-[#e2e8f0] rounded-lg text-left hover:bg-[#f8fafc] hover:border-[#93c5fd] hover:translate-x-1 transition-all group"
    >
      <span
        className="text-xs font-bold px-2 py-0.5 rounded flex-shrink-0"
        style={{ background: '#dbeafe', color: '#1d4ed8' }}
      >
        {course.course_code}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1e293b] truncate">{course.course_name}</p>
        <div className="flex gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
            {course.clos.length} CLO{course.clos.length !== 1 ? 's' : ''}
          </span>
          {course.cts.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#ccfbf1', color: '#0d9488' }}>
              {course.cts.length} topic{course.cts.length !== 1 ? 's' : ''}
            </span>
          )}
          {course.assessments.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#fef3c7', color: '#d97706' }}>
              {course.assessments.length} assessments
            </span>
          )}
        </div>
      </div>
      <svg
        className="w-4 h-4 text-[#94a3b8] group-hover:text-[#2563eb] transition-colors flex-shrink-0"
        fill="currentColor" viewBox="0 0 20 20"
      >
        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
      </svg>
    </button>
  );
}

function ProgramDataGate({ missingGoals, missingCompetencies }: { missingGoals: boolean; missingCompetencies: boolean }) {
  const navigate = useNavigate();
  const { selectedYear } = useAuditYear();

  const missing = [
    ...(missingGoals ? ['Program Goals'] : []),
    ...(missingCompetencies ? ['Competencies'] : []),
  ];

  const buildTabLink = (tab: string) => {
    return selectedYear ? `/?tab=${tab}&audit_year=${encodeURIComponent(selectedYear)}` : `/?tab=${tab}`;
  };

  return (
    <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-6 text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-[#fef3c7] flex items-center justify-center mx-auto">
        <svg className="w-6 h-6 text-[#d97706]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-[#92400e]">Program data required before uploading courses</p>
        <p className="text-xs text-[#b45309] mt-1">
          {missing.join(' and ')} {missing.length === 1 ? 'has' : 'have'} not been uploaded yet.
          Course processing needs this data to map CLOs and assess standards.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        {missingGoals && (
          <button
            onClick={() => navigate(buildTabLink('goals'))}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
            style={{ background: '#1a2c4e' }}
          >
            Go to Program Goals
          </button>
        )}
        {missingCompetencies && (
          <button
            onClick={() => navigate(buildTabLink('competencies'))}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
            style={{ background: '#1a2c4e' }}
          >
            Go to Competencies
          </button>
        )}
      </div>
    </div>
  );
}

export function CoursesTab(_props: CoursesTabProps) {
  const { selectedYear } = useAuditYear();
  const [courses, setCourses] = useState<CourseAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [missingGoals, setMissingGoals] = useState(true);
  const [missingCompetencies, setMissingCompetencies] = useState(true);
  const loadData = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      standardsApi.getCourses(selectedYear),
      standardsApi.getGoals(selectedYear),
      standardsApi.getCompetencies(selectedYear),
    ])
      .then(([coursesResult, goalsResult, competenciesResult]) => {
        if (coursesResult.status === 'fulfilled') {
          const sorted = [...coursesResult.value.courses].sort((a, b) => a.course_code.localeCompare(b.course_code));
          setCourses(sorted);
        } else {
          setError(coursesResult.reason instanceof Error ? coursesResult.reason.message : 'Failed to load courses');
        }
        if (goalsResult.status === 'rejected') {
          setError(goalsResult.reason instanceof Error ? goalsResult.reason.message : 'Failed to load program goals');
          setMissingGoals(true);
        } else {
          setMissingGoals(goalsResult.value.goals.length === 0);
        }
        if (competenciesResult.status === 'rejected') {
          setError(competenciesResult.reason instanceof Error ? competenciesResult.reason.message : 'Failed to load program competencies');
          setMissingCompetencies(true);
        } else {
          setMissingCompetencies(competenciesResult.value.competencies.length === 0);
        }
      })
      .finally(() => setLoading(false));
  }, [selectedYear]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUploadComplete = useCallback(() => {
    setShowUpload(false);
    loadData();
  }, [loadData]);

  const programDataReady = !missingGoals && !missingCompetencies;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="w-5 h-5 animate-spin text-[#2563eb]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="ml-2 text-sm text-[#64748b]">Loading courses…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-[#fee2e2] border border-[#fca5a5] text-center">
        <p className="text-[#dc2626] font-medium text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ActiveProcessingPanel />
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#64748b] flex items-center gap-2">
          Courses
          <span className="border-t border-[#e2e8f0] w-16" />
        </h2>
        {programDataReady && (
          <button
            onClick={() => setShowUpload((p) => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border"
            style={showUpload
              ? { background: '#1a2c4e', color: '#fff', borderColor: '#1a2c4e' }
              : { background: '#fff', color: '#1a2c4e', borderColor: '#1a2c4e' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {showUpload ? 'Hide Upload' : 'Upload Content'}
          </button>
        )}
      </div>

      {selectedYear !== null && (
        <div
          data-testid="frozen-banner"
          className="flex items-center gap-3 rounded-lg border px-5 py-3"
          style={{ borderColor: '#bfdbfe', background: '#eff6ff' }}
        >
          <span className="text-sm font-medium" style={{ color: '#1d4ed8' }}>
            Viewing frozen snapshot:
          </span>
          <span
            className="text-sm font-semibold px-2 py-0.5 rounded"
            style={{ background: '#dbeafe', color: '#1e40af' }}
          >
            {selectedYear}
          </span>
          <span className="text-xs text-[#64748b]">— courses filtered to those referenced in frozen standards</span>
        </div>
      )}

      {!programDataReady && (
        <ProgramDataGate missingGoals={missingGoals} missingCompetencies={missingCompetencies} />
      )}

      {programDataReady && showUpload && (
        <UploadContentPanel onComplete={handleUploadComplete} />
      )}

      {courses.length === 0 && programDataReady && (
        <div className="text-center py-16 bg-white rounded-lg border border-[#e2e8f0]">
          <p className="text-[#94a3b8] text-sm">No course data available yet.</p>
          <p className="text-[#94a3b8] text-xs mt-1">Upload syllabi to generate CLO mappings.</p>
        </div>
      )}

      {courses.length > 0 && (
        <div className="space-y-1.5">
          {courses.map((c) => <CourseCard key={c.course_id} course={c} />)}
        </div>
      )}
    </div>
  );
}
