import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuditYear } from '../../contexts/AuditYearContext';
import { standardsApi } from '../../api/standards';
import type { CourseAPI, CourseAssessmentAPI } from '../../types/evidence';

interface MatchedIO {
  text: string;
  index: number;
}

interface TopicHit {
  topicId: string;
  topicName: string;
  matchedIOs: MatchedIO[];
  assessments: CourseAssessmentAPI[];
  linkedCLOs: { id: string; name: string }[];
}

interface CLOGroup {
  cloId: string;
  cloName: string;
  topicHits: TopicHit[];
}

interface CourseResult {
  courseId: string;
  courseName: string;
  courseCode: string;
  cloGroups: CLOGroup[];
  unmappedTopicHits: TopicHit[];
}

function buildResults(courses: CourseAPI[], query: string): CourseResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const results: CourseResult[] = [];

  for (const course of courses) {
    const topicHits: TopicHit[] = [];

    for (const ct of course.cts) {
      const nameMatch = ct.name.toLowerCase().includes(q);
      const matchedIOs: MatchedIO[] = ct.ios
        .map((text, index) => ({ text, index }))
        .filter(({ text }) => text.toLowerCase().includes(q));

      if (!nameMatch && matchedIOs.length === 0) continue;

      const assessments = course.assessments.filter((a) =>
        ct.assessment_ids.includes(a.id)
      );
      const linkedCLOs = course.clos
        .filter((clo) => clo.topic_ids.includes(ct.id))
        .map((clo) => ({ id: clo.id, name: clo.name }));

      topicHits.push({
        topicId: ct.id,
        topicName: ct.name,
        matchedIOs: nameMatch ? ct.ios.map((text, index) => ({ text, index })) : matchedIOs,
        assessments,
        linkedCLOs,
      });
    }

    if (topicHits.length === 0) continue;

    const cloMap = new Map<string, CLOGroup>();
    const unmappedTopicHits: TopicHit[] = [];

    for (const hit of topicHits) {
      if (hit.linkedCLOs.length === 0) {
        unmappedTopicHits.push(hit);
      } else {
        for (const clo of hit.linkedCLOs) {
          if (!cloMap.has(clo.id)) {
            cloMap.set(clo.id, { cloId: clo.id, cloName: clo.name, topicHits: [] });
          }
          cloMap.get(clo.id)!.topicHits.push(hit);
        }
      }
    }

    results.push({
      courseId: course.course_id,
      courseName: course.course_name,
      courseCode: course.course_code,
      cloGroups: Array.from(cloMap.values()),
      unmappedTopicHits,
    });
  }

  return results;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className="w-3.5 h-3.5 flex-shrink-0 text-[#94a3b8] transition-transform"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

const SEARCH_BREADCRUMB = [{ label: 'Search', href: '/?tab=search' }];

function TopicHitRow({ hit, courseCode, auditYear }: { hit: TopicHit; courseCode: string; auditYear: string | null }) {
  const [open, setOpen] = useState(false);
  const courseLink = auditYear
    ? `/courses/${encodeURIComponent(courseCode)}?audit_year=${encodeURIComponent(auditYear)}`
    : `/courses/${encodeURIComponent(courseCode)}`;

  return (
    <div className="border border-[#e2e8f0] rounded-md overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#f0fdf4] transition-colors bg-[#ccfbf1]"
        onClick={() => setOpen((p) => !p)}
      >
        <span className="flex-1 text-xs font-medium text-[#0f766e] leading-snug">{hit.topicName}</span>
        <span className="text-[10px] text-[#0d9488] mr-1">
          {hit.matchedIOs.length} IO{hit.matchedIOs.length !== 1 ? 's' : ''}
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="bg-white px-3 py-3 space-y-3 border-t border-[#e2e8f0]">
          {hit.matchedIOs.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Matched Objectives</p>
              <ul className="space-y-1">
                {hit.matchedIOs.map(({ text, index }) => (
                  <li key={index} className="flex gap-2 text-[11px] text-[#475569]">
                    <span className="text-[#0d9488] font-bold flex-shrink-0">{index + 1}.</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hit.assessments.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Assessments</p>
              <div className="flex flex-wrap gap-1.5">
                {hit.assessments.map((a) => (
                  <div key={a.id} className="px-2 py-1 rounded border border-[#fcd34d] bg-[#fef3c7]">
                    <p className="text-[10px] font-bold text-[#d97706]">{a.id}</p>
                    <p className="text-[10px] text-[#92400e] leading-tight">{a.name}</p>
                    {a.info && <p className="text-[10px] text-[#b45309] italic leading-tight mt-0.5">{a.info}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <Link
              to={courseLink}
              state={{ breadcrumbs: SEARCH_BREADCRUMB }}
              className="text-[10px] text-[#0d9488] hover:underline"
            >
              View full topic in course →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function CLOGroupRow({ group, courseCode, auditYear }: { group: CLOGroup; courseCode: string; auditYear: string | null }) {
  const [open, setOpen] = useState(false);
  const cloLink = auditYear
    ? `/courses/${encodeURIComponent(courseCode)}?cloId=${encodeURIComponent(group.cloId)}&audit_year=${encodeURIComponent(auditYear)}`
    : `/courses/${encodeURIComponent(courseCode)}?cloId=${encodeURIComponent(group.cloId)}`;

  return (
    <div className="border border-[#e2e8f0] rounded-md overflow-hidden">
      <div className="flex items-center bg-white">
        <button
          className="flex items-center gap-2 flex-1 px-3 py-1.5 text-left hover:bg-[#eff6ff] transition-colors"
          onClick={() => setOpen((p) => !p)}
        >
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
            {group.cloId}
          </span>
          <span className="flex-1 text-xs text-[#334155] leading-snug">{group.cloName}</span>
          <span className="text-[10px] text-[#94a3b8] mr-1">
            {group.topicHits.length} topic{group.topicHits.length !== 1 ? 's' : ''}
          </span>
          <Chevron open={open} />
        </button>
        <Link
          to={cloLink}
          state={{ breadcrumbs: SEARCH_BREADCRUMB }}
          className="flex-shrink-0 px-2 py-1.5 border-l border-[#e2e8f0] hover:bg-[#dbeafe] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] group"
          title={`View ${group.cloId} in ${courseCode} course detail`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLinkIcon className="w-3.5 h-3.5 text-[#2563eb] group-hover:text-[#1d4ed8] transition-colors" />
        </Link>
      </div>
      {open && (
        <div className="border-t border-[#f1f5f9] bg-[#f8fafc] px-3 py-2 space-y-1.5">
          {group.topicHits.map((hit) => (
            <TopicHitRow key={hit.topicId} hit={hit} courseCode={courseCode} auditYear={auditYear} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseResultCard({ result, autoExpand, auditYear }: { result: CourseResult; autoExpand: boolean; auditYear: string | null }) {
  const [open, setOpen] = useState(autoExpand);
  const totalTopics =
    result.cloGroups.reduce((n, g) => n + g.topicHits.length, 0) +
    result.unmappedTopicHits.length;

  const courseLink = auditYear
    ? `/courses/${encodeURIComponent(result.courseCode)}?audit_year=${encodeURIComponent(auditYear)}`
    : `/courses/${encodeURIComponent(result.courseCode)}`;

  return (
    <div className="bg-white rounded-lg border border-[#e2e8f0] overflow-hidden shadow-sm">
      <div className="flex items-center">
        <button
          className="flex items-center gap-2 flex-1 px-4 py-3 text-left hover:bg-[#f0fdf4] transition-colors"
          onClick={() => setOpen((p) => !p)}
        >
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: '#ccfbf1', color: '#0d9488' }}>
            {result.courseCode}
          </span>
          <span className="flex-1 text-sm font-medium text-[#1e293b]">{result.courseName}</span>
          <span className="text-[10px] text-[#94a3b8] mr-1">
            {totalTopics} topic{totalTopics !== 1 ? 's' : ''}
          </span>
          <Chevron open={open} />
        </button>
        <Link
          to={courseLink}
          state={{ breadcrumbs: SEARCH_BREADCRUMB }}
          className="flex-shrink-0 px-3 py-3 border-l border-[#e2e8f0] hover:bg-[#ccfbf1] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488] group"
          title={`View ${result.courseCode} course detail`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLinkIcon className="w-3.5 h-3.5 text-[#0d9488] group-hover:text-[#047857] transition-colors" />
        </Link>
      </div>
      {open && (
        <div className="border-t border-[#f1f5f9] bg-[#f8fafc] px-4 py-3 space-y-2">
          {result.cloGroups.map((group) => (
            <CLOGroupRow key={group.cloId} group={group} courseCode={result.courseCode} auditYear={auditYear} />
          ))}
          {result.unmappedTopicHits.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5 mt-1">Uncategorized Topics</p>
              <div className="space-y-1.5">
                {result.unmappedTopicHits.map((hit) => (
                  <TopicHitRow key={hit.topicId} hit={hit} courseCode={result.courseCode} auditYear={auditYear} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CurriculumSearchTab() {
  const { selectedYear } = useAuditYear();
  const [query, setQuery] = useState('');
  const [courses, setCourses] = useState<CourseAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    standardsApi.getCourses(selectedYear)
      .then((res) => setCourses(res.courses))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load courses'))
      .finally(() => setLoading(false));
  }, [selectedYear]);

  const results = useMemo(() => buildResults(courses, query), [courses, query]);

  const totalTopics = results.reduce(
    (n, r) =>
      n +
      r.cloGroups.reduce((m, g) => m + g.topicHits.length, 0) +
      r.unmappedTopicHits.length,
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="w-5 h-5 animate-spin text-[#0d9488]" fill="none" viewBox="0 0 24 24">
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

  if (courses.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-lg border border-[#e2e8f0]">
        <p className="text-[#94a3b8] text-sm">No course data available.</p>
        <p className="text-[#94a3b8] text-xs mt-1">
          Upload syllabi in the{' '}
          <Link to="/?tab=courses" className="text-[#0d9488] hover:underline">Courses tab</Link>
          {' '}to populate search.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#64748b] flex items-center gap-2">
          Curriculum Search
          <span className="border-t border-[#e2e8f0] w-24" />
        </h2>
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
          <span className="text-xs text-[#64748b]">
            — search results filtered to frozen-year courses
          </span>
        </div>
      )}

      <div className="relative max-w-lg">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          type="text"
          placeholder="Search topics, objectives, assessments…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:border-[#0d9488] focus:ring-2 focus:ring-[#0d9488]/10"
        />
      </div>

      {query.trim().length < 2 && (
        <div className="text-center py-16 bg-white rounded-lg border border-[#e2e8f0]">
          <p className="text-[#94a3b8] text-sm">Type at least 2 characters to search.</p>
          <p className="text-[#94a3b8] text-xs mt-1">Try a clinical topic like "appendicitis" or a policy term like "Medicaid".</p>
        </div>
      )}

      {query.trim().length >= 2 && results.length === 0 && (
        <div className="text-center py-16 bg-white rounded-lg border border-[#e2e8f0]">
          <p className="text-[#94a3b8] text-sm">No results for "{query.trim()}".</p>
          <p className="text-[#94a3b8] text-xs mt-1">Try a different term or check the spelling.</p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <p className="text-xs text-[#64748b]">
            {totalTopics} topic{totalTopics !== 1 ? 's' : ''} across {results.length} course{results.length !== 1 ? 's' : ''} matched
          </p>
          <div className="space-y-2">
            {results.map((result) => (
              <CourseResultCard
                key={result.courseId}
                result={result}
                autoExpand={results.length <= 3}
                auditYear={selectedYear}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
