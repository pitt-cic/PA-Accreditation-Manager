import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAuditYear } from '../contexts/AuditYearContext';
import { standardsApi } from '../api/standards';
import { LoadingOverlay } from '../components/ui/Spinner';
import { UserMenu } from '../components/UserMenu';
import { Breadcrumbs } from '../components/layout/Breadcrumbs';
import { FrozenYearBanner } from '../components/ui/FrozenYearBanner';
import type { Crumb } from '../components/layout/Breadcrumbs';
import type { CourseAPI, CourseTopicAPI, CourseLearningOutcomeAPI, CourseAssessmentAPI, CourseGoalAPI, CourseCompetencyAPI, StandardItem, CourseEvidenceEntry } from '../types/evidence';

// ── Topic block ───────────────────────────────────────────────────────────────

function TopicBlock({ topic, assessments, standardIds = [], autoOpen, cardRef, breadcrumbs, stdTextMap, auditYear }: {
  topic: CourseTopicAPI;
  assessments: CourseAssessmentAPI[];
  standardIds?: string[];
  autoOpen?: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
  breadcrumbs?: Crumb[];
  stdTextMap?: Map<string, string>;
  auditYear?: string | null;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const topicAssessments = assessments.filter((a) => topic.assessment_ids.includes(a.id));
  const stdCount = standardIds.length;

  return (
    <div ref={cardRef} className="rounded-lg border border-[#e2e8f0] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 bg-[#ccfbf1] hover:bg-[#99f6e4] transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488]"
        onClick={() => setOpen((p) => !p)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold text-[#0d9488] flex-shrink-0">{topic.id}</span>
          <span className="text-xs font-semibold text-[#0d9488] truncate">{topic.name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {topic.ios.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
              {topic.ios.length} IOs
            </span>
          )}
          {stdCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#fef3c7', color: '#d97706' }}>
              {stdCount} standard{stdCount !== 1 ? 's' : ''}
            </span>
          )}
          <svg className={`w-3.5 h-3.5 text-[#0d9488] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="bg-white px-3 py-3 space-y-3">
          {topic.ios.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Learning Objectives</p>
              <ul className="space-y-1">
                {topic.ios.map((io, i) => (
                  <li key={i} className="flex gap-2 text-[11px] text-[#475569]">
                    <span className="text-[#0d9488] font-bold flex-shrink-0">{i + 1}.</span>
                    <span>{io}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {topicAssessments.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Assessments</p>
              <div className="flex flex-wrap gap-1.5">
                {topicAssessments.map((a) => (
                  <div key={a.id} className="px-2 py-1 rounded border border-[#fcd34d] bg-[#fef3c7]">
                    <p className="text-[10px] font-bold text-[#d97706]">{a.id}</p>
                    <p className="text-[10px] text-[#92400e] leading-tight">{a.name}</p>
                    {a.info && <p className="text-[10px] text-[#b45309] italic leading-tight mt-0.5">{a.info}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mapped Standards — shown in body to scale cleanly with many mappings */}
          {stdCount > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Mapped Standards</p>
              <div className="space-y-1">
                {standardIds.map((sid) => (
                  <Link
                    key={sid}
                    to={`/standards/${sid}${auditYear ? `?audit_year=${encodeURIComponent(auditYear)}` : ''}`}
                    state={breadcrumbs ? { breadcrumbs } : undefined}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#fffbeb] transition-colors group"
                    style={{ border: '1px solid #fde68a' }}
                  >
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: '#fef3c7', color: '#d97706' }}>
                      {sid}
                    </span>
                    <span className="flex-1 text-[11px] text-[#475569] truncate">
                      {stdTextMap?.get(sid) ?? ''}
                    </span>
                    <svg className="w-3.5 h-3.5 text-[#d97706] group-hover:text-[#b45309] flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CLO accordion ─────────────────────────────────────────────────────────────

function CloAccordion({ clo, topics, assessments, topicToStandards, topicIdToOpen, cloIdToOpen, targetRef, breadcrumbs, stdTextMap, courseGoals, courseCompetencies, auditYear }: {
  clo: CourseLearningOutcomeAPI;
  topics: CourseTopicAPI[];
  assessments: CourseAssessmentAPI[];
  topicToStandards: Map<string, string[]>;
  topicIdToOpen?: string;
  cloIdToOpen?: string;
  targetRef?: React.Ref<HTMLDivElement>;
  breadcrumbs?: Crumb[];
  stdTextMap?: Map<string, string>;
  courseGoals: CourseGoalAPI[];
  courseCompetencies: CourseCompetencyAPI[];
  auditYear?: string | null;
}) {
  const hasTargetTopic = !!topicIdToOpen && clo.topic_ids.includes(topicIdToOpen);
  const isTargetClo = !!cloIdToOpen && clo.id === cloIdToOpen;
  const [open, setOpen] = useState(hasTargetTopic || isTargetClo);
  const [tab, setTab] = useState<'topics' | 'assessments' | 'goals'>('topics');
  const cloTopics = topics.filter((t) => clo.topic_ids.includes(t.id));
  const cloAssessments = assessments.filter((a) => clo.assessment_ids.includes(a.id));
  const cloGoals = courseGoals.filter((g) => g.clo_ids.includes(clo.id));
  const cloComps = courseCompetencies.filter((c) => c.clo_ids.includes(clo.id));
  const hasGoalsOrComps = cloGoals.length > 0 || cloComps.length > 0;

  return (
    <div ref={isTargetClo ? targetRef as React.Ref<HTMLDivElement> : undefined} className="border border-[#e2e8f0] rounded-lg overflow-hidden">
      <button
        className="w-full flex items-start gap-3 px-4 py-3 bg-white hover:bg-[#f8fafc] transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
        onClick={() => setOpen((p) => !p)}
      >
        <span className="text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 mt-0.5" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
          {clo.id}
        </span>
        <span className="flex-1 text-sm text-[#1e293b] leading-snug">{clo.name}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {cloTopics.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#ccfbf1', color: '#0d9488' }}>
              {cloTopics.length} topic{cloTopics.length !== 1 ? 's' : ''}
            </span>
          )}
          {cloAssessments.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#fef3c7', color: '#d97706' }}>
              {cloAssessments.length} assess.
            </span>
          )}
          {cloGoals.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
              {cloGoals.length} goal{cloGoals.length !== 1 ? 's' : ''}
            </span>
          )}
          {cloComps.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#ede9fe', color: '#7c3aed' }}>
              {cloComps.length} comp{cloComps.length !== 1 ? 's' : ''}.
            </span>
          )}
          <svg className={`w-4 h-4 text-[#94a3b8] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-[#f1f5f9] bg-[#f8fafc]">
          <div className="flex border-b border-[#e2e8f0] bg-white">
            {([
              { id: 'topics' as const, label: `Topics (${cloTopics.length})` },
              { id: 'assessments' as const, label: `Assessments (${cloAssessments.length})` },
              ...(hasGoalsOrComps ? [{ id: 'goals' as const, label: `Goals & Comp. (${cloGoals.length + cloComps.length})` }] : []),
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-4 py-2 text-[11px] font-semibold transition-colors focus:outline-none"
                style={{
                  color: tab === t.id ? '#1a2c4e' : '#64748b',
                  borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
                  background: 'none',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'topics' && (
            <div className="p-3 space-y-2">
              {cloTopics.length === 0
                ? <p className="text-xs text-[#94a3b8] text-center py-4">No topics linked.</p>
                : cloTopics.map((t) => (
                  <TopicBlock
                    key={t.id}
                    topic={t}
                    assessments={assessments}
                    standardIds={topicToStandards.get(t.id) ?? []}
                    autoOpen={t.id === topicIdToOpen}
                    cardRef={t.id === topicIdToOpen ? targetRef : undefined}
                    breadcrumbs={breadcrumbs}
                    stdTextMap={stdTextMap}
                    auditYear={auditYear}
                  />
                ))
              }
            </div>
          )}
          {tab === 'assessments' && (
            <div className="p-3">
              {cloAssessments.length === 0
                ? <p className="text-xs text-[#94a3b8] text-center py-4">No assessments linked.</p>
                : (
                  <div className="space-y-2">
                    {cloAssessments.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 p-3 bg-white rounded border border-[#e2e8f0]">
                        <span className="text-[10px] font-bold text-[#94a3b8] min-w-[60px]">{a.id}</span>
                        <div>
                          <p className="text-xs font-semibold text-[#1e293b]">{a.name}</p>
                          {a.info && <p className="text-[11px] text-[#64748b] italic mt-0.5">{a.info}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          )}
          {tab === 'goals' && (
            <div className="p-3 space-y-4">
              {cloGoals.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-2">Program Goals</p>
                  <div className="space-y-1.5">
                    {cloGoals.map((g) => (
                      <Link
                        key={g.id}
                        to={`/?tab=goals&goalId=${encodeURIComponent(g.id)}${auditYear ? `&audit_year=${encodeURIComponent(auditYear)}` : ''}`}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#eff6ff] transition-colors group"
                        style={{ border: '1px solid #bfdbfe' }}
                      >
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                          {g.id}
                        </span>
                        <span className="flex-1 text-[11px] text-[#475569] leading-snug">{g.name}</span>
                        <svg className="w-3.5 h-3.5 flex-shrink-0 transition-colors" style={{ color: '#93c5fd' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {cloComps.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-2">Competencies</p>
                  <div className="space-y-1.5">
                    {cloComps.map((c) => (
                      <Link
                        key={c.id}
                        to={`/?tab=competencies&compId=${encodeURIComponent(c.id)}${auditYear ? `&audit_year=${encodeURIComponent(auditYear)}` : ''}`}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#f5f3ff] transition-colors group"
                        style={{ border: '1px solid #c4b5fd' }}
                      >
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                          {c.id}
                        </span>
                        <span className="flex-1 text-[11px] text-[#475569] leading-snug">{c.name}</span>
                        <svg className="w-3.5 h-3.5 flex-shrink-0 transition-colors" style={{ color: '#a78bfa' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CourseDetailPage() {
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const [pageSearchParams] = useSearchParams();
  const auditYear = pageSearchParams.get('audit_year');
  const { selectedYear } = useAuditYear();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [course, setCourse] = useState<CourseAPI | null>(null);
  const [standards, setStandards] = useState<StandardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !code) return;
    const decoded = decodeURIComponent(code);
    Promise.all([standardsApi.getCourses(auditYear), standardsApi.getAll(auditYear)])
      .then(([coursesRes, standardsRes]) => {
        const match =
          coursesRes.courses.find((c) => c.course_code === decoded) ??
          coursesRes.courses.find((c) => c.course_code.startsWith(decoded));
        if (!match) setError(`Course "${decoded}" not found.`);
        else setCourse(match);
        setStandards(standardsRes.standards);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load course'))
      .finally(() => setIsLoading(false));
  }, [code, isAuthenticated, authLoading, auditYear]);

  // Reverse map: topic_id → standard_ids[], scoped to THIS course via course_evidence_map.
  // Using course_evidence_map (course_code + topic_id + standard_id) avoids the non-unique
  // topic_id problem — CT-3 in PAS 2401 is distinct from CT-3 in PAS 2406.
  const topicToStandards = useMemo(() => {
    if (!course) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const s of standards) {
      const entry = s.course_evidence_map?.find(
        (e) => course.course_code === e.course_code || course.course_code.startsWith(e.course_code)
      );
      if (!entry) continue;
      for (const eeItem of entry.evidence_items) {
        for (const clo of eeItem.clos) {
          for (const topic of clo.topics) {
            const existing = map.get(topic.topic_id);
            if (existing) {
              if (!existing.includes(s.standard_id)) existing.push(s.standard_id);
            } else {
              map.set(topic.topic_id, [s.standard_id]);
            }
          }
        }
      }
    }
    return map;
  }, [standards, course]);

  // Build per-standard evidence context for this course from course_evidence_map
  const mappedStandards = useMemo(() => {
    if (!course) return [];
    return standards
      .filter((s) => s.course_codes?.some(
        (cc) => course.course_code === cc || course.course_code.startsWith(cc)
      ))
      .map((s) => {
        const entry: CourseEvidenceEntry | undefined = s.course_evidence_map?.find(
          (e) => course.course_code === e.course_code || course.course_code.startsWith(e.course_code)
        );
        return { standard: s, evidenceEntry: entry };
      });
  }, [standards, course]);

  const mappedStandardIds = mappedStandards.map((m) => m.standard.standard_id);

  // Breadcrumb trail — use incoming state if present, otherwise default to Courses
  const crumbs: Crumb[] = useMemo(() => {
    const incoming = (location.state as { breadcrumbs?: Crumb[] } | null)?.breadcrumbs;
    const courseLabel = course?.course_code ?? decodeURIComponent(code ?? '');
    const courseHref = `/courses/${code ?? ''}${auditYear ? `?audit_year=${encodeURIComponent(auditYear)}` : ''}`;
    return incoming
      ? [...incoming, { label: courseLabel, href: courseHref }]
      : [
          { label: 'Courses', href: '/?tab=courses' },
          { label: courseLabel, href: courseHref },
        ];
  }, [location.state, course, code]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0f4f8' }}>
        <LoadingOverlay message="Loading course…" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#f0f4f8' }}>
        <header className="sticky top-0 z-50" style={{ background: 'linear-gradient(135deg, #1a2c4e 0%, #1e3a6e 100%)', borderBottom: '3px solid #2563eb' }}>
          <div className="max-w-[1280px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center text-white font-bold text-sm" style={{ width: 38, height: 38, background: '#2563eb', borderRadius: 8 }}>PA</div>
              <p className="text-white font-semibold text-sm">PA Accreditation Manager</p>
            </div>
            <UserMenu />
          </div>
        </header>
        <main className="max-w-[1280px] mx-auto px-6 py-8">
          <div className="mb-5">
          <Link
            to={crumbs.length > 1 ? crumbs[crumbs.length - 2].href : '/?tab=courses'}
            className="inline-flex items-center gap-1.5 text-[#2563eb] text-sm font-medium hover:underline mb-3"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to {crumbs.length > 1 ? crumbs[crumbs.length - 2].label : 'Courses'}
          </Link>
          <Breadcrumbs crumbs={crumbs} />
        </div>
          {selectedYear && <FrozenYearBanner year={selectedYear} />}
          <div className="bg-white rounded-xl border border-[#fca5a5] p-8 max-w-md text-center shadow-sm">
            <p className="text-[#dc2626] font-medium text-sm">{error ?? 'Course not found.'}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f0f4f8' }}>
      <header
        className="sticky top-0 z-50"
        style={{ background: 'linear-gradient(135deg, #1a2c4e 0%, #1e3a6e 100%)', borderBottom: '3px solid #2563eb', boxShadow: '0 10px 15px -3px rgba(0,0,0,.10)' }}
      >
        <div className="max-w-[1280px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center text-white font-bold text-sm" style={{ width: 38, height: 38, background: '#2563eb', borderRadius: 8, flexShrink: 0 }}>PA</div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">PA Accreditation Manager</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>Course Detail</p>
            </div>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="mb-5">
          <Link
            to={crumbs.length > 1 ? crumbs[crumbs.length - 2].href : '/?tab=courses'}
            className="inline-flex items-center gap-1.5 text-[#2563eb] text-sm font-medium hover:underline mb-3"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to {crumbs.length > 1 ? crumbs[crumbs.length - 2].label : 'Courses'}
          </Link>
          <Breadcrumbs crumbs={crumbs} />
        </div>

        {selectedYear && (
          <div className="mb-5">
            <FrozenYearBanner year={selectedYear} />
          </div>
        )}

        {/* Course header */}
        <div
          className="rounded-xl p-5 mb-6 text-white"
          style={{ background: 'linear-gradient(135deg, #1a2c4e 0%, #1e3a6e 100%)', borderLeft: '4px solid #2563eb' }}
        >
          <p className="text-xs font-semibold opacity-60 uppercase tracking-widest mb-0.5">{course.course_code}</p>
          <p className="text-lg font-semibold">{course.course_name}</p>
          {course.description && (
            <p className="text-xs opacity-65 mt-1 leading-relaxed">{course.description}</p>
          )}
          <div className="flex gap-5 mt-3 text-xs opacity-70 flex-wrap">
            <span>{course.clos.length} CLOs</span>
            <span>{course.cts.length} Topics</span>
            <span>{course.assessments.length} Assessments</span>
            {course.goals.length > 0 && <span>{course.goals.length} Goals</span>}
            {course.competencies.length > 0 && <span>{course.competencies.length} Competencies</span>}
          </div>
          {mappedStandardIds.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/20">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                {mappedStandardIds.length} Mapped Standard{mappedStandardIds.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Goals & Competencies meta row */}
        {(course.goals.length > 0 || course.competencies.length > 0) && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg p-3 mb-5 flex gap-6 flex-wrap">
            {course.goals.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Program Goals</p>
                <div className="flex flex-wrap gap-1">
                  {course.goals.map((g) => (
                    <Link key={g.id} to={`/?tab=goals&goalId=${encodeURIComponent(g.id)}${auditYear ? `&audit_year=${encodeURIComponent(auditYear)}` : ''}`}
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold hover:opacity-75 transition-opacity"
                      style={{ background: '#dbeafe', color: '#1d4ed8' }} title={g.name}>{g.id}</Link>
                  ))}
                </div>
              </div>
            )}
            {course.competencies.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Competencies</p>
                <div className="flex flex-wrap gap-1">
                  {course.competencies.map((c) => (
                    <Link key={c.id} to={`/?tab=competencies&compId=${encodeURIComponent(c.id)}${auditYear ? `&audit_year=${encodeURIComponent(auditYear)}` : ''}`}
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold hover:opacity-75 transition-opacity"
                      style={{ background: '#ede9fe', color: '#7c3aed' }} title={c.name}>{c.id}</Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab bar */}
        <CourseDetailTabs
          course={course}
          mappedStandards={mappedStandards}
          topicToStandards={topicToStandards}
          crumbs={crumbs}
          auditYear={auditYear}
        />
      </main>
    </div>
  );
}

// ── Tab layout ────────────────────────────────────────────────────────────────

const READINESS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  ready:            { bg: '#dcfce7', text: '#16a34a', label: 'Ready' },
  mostly_ready:     { bg: '#fef9c3', text: '#ca8a04', label: 'Mostly Ready' },
  needs_work:       { bg: '#fef3c7', text: '#d97706', label: 'Needs Work' },
  not_ready:        { bg: '#fee2e2', text: '#dc2626', label: 'Not Ready' },
  no_courses_found: { bg: '#f1f5f9', text: '#64748b', label: 'No Courses' },
};

function StandardCard({
  std, evidenceEntry, courseCts, crumbs, auditYear,
}: {
  std: StandardItem;
  evidenceEntry?: CourseEvidenceEntry;
  courseCts: CourseTopicAPI[];
  crumbs: Crumb[];
  auditYear?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const r = std.overall_readiness;
  const rs = r ? (READINESS_STYLE[r] ?? READINESS_STYLE.needs_work) : null;
  const eeCount = evidenceEntry?.evidence_items.length ?? 0;

  return (
    <div ref={cardRef} className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden shadow-sm">
      {/* Header — always visible */}
      <div className="flex items-center gap-0 px-4 py-3">
        {/* Toggle */}
        <button
          className="flex items-center gap-3 flex-1 text-left hover:bg-[#fffbeb] -mx-4 -my-3 px-4 py-3 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d97706]"
          onClick={() => setOpen((p) => !p)}
        >
          <svg
            className="w-4 h-4 text-[#94a3b8] flex-shrink-0 transition-transform"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' }}
            fill="currentColor" viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <span className="text-xs font-bold px-2 py-0.5 rounded flex-shrink-0"
            style={{ background: '#fef3c7', color: '#d97706' }}>
            {std.standard_id}
          </span>
          <span className="flex-1 text-xs text-[#475569] leading-snug">{std.requirement_text}</span>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {eeCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#dcfce7', color: '#16a34a' }}>
                {eeCount} EE
              </span>
            )}
            {rs && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: rs.bg, color: rs.text }}>
                {rs.label}
              </span>
            )}
          </div>
        </button>
        {/* External link — separate from toggle */}
        <Link
          to={`/standards/${std.standard_id}${auditYear ? `?audit_year=${encodeURIComponent(auditYear)}` : ''}`}
          state={{ breadcrumbs: crumbs }}
          className="ml-3 flex-shrink-0 p-1.5 rounded hover:bg-[#fef3c7] transition-colors group"
          title={`Open ${std.standard_id}`}
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-3.5 h-3.5 text-[#d97706] group-hover:text-[#b45309]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>

      {/* Expanded evidence body */}
      {open && (
        <div className="border-t border-[#f1f5f9] bg-[#fafaf7] px-4 py-4 space-y-4">
          {!evidenceEntry || evidenceEntry.evidence_items.length === 0 ? (
            <p className="text-xs text-[#94a3b8] text-center py-2 italic">
              Evidence detail will appear after the next mapping run.
            </p>
          ) : (
            evidenceEntry.evidence_items.map((item) => (
              <div key={item.ee_id} className="space-y-2">
                {/* Evidence item header */}
                <div className="flex gap-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                    style={{ background: '#fef3c7', color: '#d97706' }}>
                    {item.ee_id}
                  </span>
                  <p className="text-[11px] font-medium text-[#1e293b] leading-snug">{item.ee_text}</p>
                </div>

                {/* Map reason */}
                {item.map_reason && (
                  <p className="text-[10px] text-[#64748b] italic leading-relaxed pl-7">
                    {item.map_reason}
                  </p>
                )}

                {/* CLO → Topic → IO chain */}
                {item.clos?.map((clo) => (
                  <div key={clo.clo_id} className="pl-7 border-l-2 border-[#dbeafe] ml-1 space-y-2">
                    <div className="flex items-start gap-1.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                        {clo.clo_id}
                      </span>
                      <span className="text-[11px] text-[#1e293b] leading-snug">{clo.clo_text}</span>
                    </div>

                    {clo.topics.map((topic) => {
                      const fullTopic = courseCts.find((ct) => ct.id === topic.topic_id);
                      return (
                        <div key={topic.topic_id} className="ml-3 pl-2 border-l-2 border-[#ccfbf1] space-y-1.5">
                          <div className="flex items-start gap-1.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{ background: '#ccfbf1', color: '#0d9488' }}>
                              {topic.topic_id}
                            </span>
                            <p className="text-[11px] font-medium text-[#0d9488]">{topic.topic_name}</p>
                          </div>

                          {fullTopic && fullTopic.ios.length > 0 && (
                            <ul className="ml-3 space-y-0.5">
                              {fullTopic.ios.map((io, i) => (
                                <li key={i} className="flex gap-1.5 text-[10px] text-[#475569]">
                                  <span className="text-[#0d9488] font-bold flex-shrink-0">{i + 1}.</span>
                                  <span className="leading-snug">{io}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CourseDetailTabs({
  course, mappedStandards, topicToStandards, crumbs, auditYear,
}: {
  course: CourseAPI;
  mappedStandards: { standard: StandardItem; evidenceEntry?: CourseEvidenceEntry }[];
  topicToStandards: Map<string, string[]>;
  crumbs: Crumb[];
  auditYear: string | null;
}) {
  const [searchParams] = useSearchParams();
  const topicIdFromUrl = searchParams.get('topicId') ?? '';
  const cloIdFromUrl = searchParams.get('cloId') ?? '';

  // Lookup map for standard requirement text — used by TopicBlock's Mapped Standards section
  const stdTextMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const { standard: s } of mappedStandards) {
      m.set(s.standard_id, s.requirement_text ?? '');
    }
    return m;
  }, [mappedStandards]);
  const targetRef = useRef<HTMLDivElement>(null);

  // Switch to CLO view and scroll if arriving with a topicId or cloId
  const [tab, setTab] = useState<'accreditation' | 'clos'>(
    topicIdFromUrl || cloIdFromUrl ? 'clos' : 'accreditation'
  );

  useEffect(() => {
    if ((topicIdFromUrl || cloIdFromUrl) && targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [topicIdFromUrl, cloIdFromUrl]);

  const tabs = [
    { id: 'accreditation' as const, label: 'Accreditation Map', count: mappedStandards.length },
    { id: 'clos' as const, label: 'Full CLO View', count: course.clos.length },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-[#e2e8f0] mb-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none"
            style={{
              color: tab === t.id ? '#1a2c4e' : '#64748b',
              borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none',
            }}
          >
            {t.label}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{
                background: tab === t.id ? '#dbeafe' : '#f1f5f9',
                color: tab === t.id ? '#1d4ed8' : '#94a3b8',
              }}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Accreditation Map */}
      {tab === 'accreditation' && (
        <div className="space-y-3">
          {mappedStandards.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-[#e2e8f0]">
              <p className="text-[#94a3b8] text-sm font-medium">No accreditation mappings yet</p>
              <p className="text-[#94a3b8] text-xs mt-1">Run a standard mapping to see how this course covers ARC-PA requirements.</p>
            </div>
          ) : (
            mappedStandards.map(({ standard: std, evidenceEntry }) => (
              <StandardCard
                key={std.standard_id}
                std={std}
                evidenceEntry={evidenceEntry}
                courseCts={course.cts}
                crumbs={crumbs}
                auditYear={auditYear}
              />
            ))
          )}
        </div>
      )}

      {/* Full CLO View */}
      {tab === 'clos' && (
        <div className="space-y-2">
          {course.clos.map((clo) => (
            <CloAccordion
              key={clo.id}
              clo={clo}
              topics={course.cts}
              assessments={course.assessments}
              topicToStandards={topicToStandards}
              topicIdToOpen={topicIdFromUrl || undefined}
              cloIdToOpen={cloIdFromUrl || undefined}
              targetRef={
                (topicIdFromUrl && clo.topic_ids.includes(topicIdFromUrl)) ||
                (cloIdFromUrl && clo.id === cloIdFromUrl)
                  ? targetRef
                  : undefined
              }
              breadcrumbs={crumbs}
              stdTextMap={stdTextMap}
              courseGoals={course.goals}
              courseCompetencies={course.competencies}
              auditYear={auditYear}
            />
          ))}
          {course.clos.length === 0 && (
            <p className="text-xs text-[#94a3b8] text-center py-8">No CLOs found for this course.</p>
          )}
        </div>
      )}
    </div>
  );
}
