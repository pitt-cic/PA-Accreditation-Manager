import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  LinkedStandard,
  EssentialEvidenceLinked,
  LinkedCourse,
  LinkedCourseCLO,
  LinkedCourseTopic,
} from '../../types/evidence';
import type { Crumb } from '../layout/Breadcrumbs';
import { CommentsSection } from '../comments/CommentsSection';
import { AttachmentPanel } from './AttachmentPanel';

const READINESS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  ready:             { bg: '#dcfce7', text: '#16a34a', label: 'Ready' },
  mostly_ready:      { bg: '#fef9c3', text: '#ca8a04', label: 'Mostly Ready' },
  needs_work:        { bg: '#fef3c7', text: '#d97706', label: 'Needs Work' },
  not_ready:         { bg: '#fee2e2', text: '#dc2626', label: 'Not Ready' },
  no_courses_found:  { bg: '#f1f5f9', text: '#64748b', label: 'No Courses Found' },
  pending:           { bg: '#f1f5f9', text: '#64748b', label: 'Pending' },
};

function ReadinessPill({ status }: { status: string }) {
  const s = READINESS_STYLE[status] ?? READINESS_STYLE.pending;
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

// ── Topic row with IOs, assessments, goals, comps ────────────────────────────

function TopicRow({
  topic, standardId, currentUserEmail, targetPath, courseCode, breadcrumbs,
}: {
  topic: LinkedCourseTopic;
  standardId: string;
  currentUserEmail: string;
  targetPath: string;
  courseCode?: string;
  breadcrumbs?: Crumb[];
}) {
  const [open, setOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const auditYear = searchParams.get('audit_year');
  const yearSuffix = auditYear ? `&audit_year=${encodeURIComponent(auditYear)}` : '';
  const m = topic.topic_metadata;

  return (
    <div className="border border-[#e2e8f0] rounded-lg overflow-hidden">
      <div className="flex items-center" style={{ background: open ? '#ecfdf5' : '#f0fdf4' }}>
        <button
          className="flex items-start gap-2 flex-1 px-3 py-2.5 text-left transition-colors cursor-pointer hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488]"
          onClick={() => setOpen((p) => !p)}
        >
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5" style={{ background: '#ccfbf1', color: '#0d9488' }}>
            {m.id}
          </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[#1e293b]">{m.name}</p>
          {m.relevance_summary && (
            <p className="text-[11px] text-[#64748b] italic mt-0.5 leading-relaxed">{m.relevance_summary}</p>
          )}
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {(topic.ios?.length ?? 0) > 0 && (
              <span className="text-[9px] px-1 py-0.5 rounded font-semibold" style={{ background: '#dbeafe', color: '#1d4ed8' }}>{topic.ios.length} IOs</span>
            )}
            {(topic.assessments?.length ?? 0) > 0 && (
              <span className="text-[9px] px-1 py-0.5 rounded font-semibold" style={{ background: '#fef3c7', color: '#d97706' }}>{topic.assessments.length} assess.</span>
            )}
            {(topic.comps?.length ?? 0) > 0 && (
              <span className="text-[9px] px-1 py-0.5 rounded font-semibold" style={{ background: '#ede9fe', color: '#7c3aed' }}>{topic.comps.length} comps</span>
            )}
          </div>
        </div>
          <svg
            className="w-3.5 h-3.5 text-[#0d9488] flex-shrink-0 mt-1 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {courseCode && (
          <Link
            to={`/courses/${encodeURIComponent(courseCode)}?topicId=${encodeURIComponent(m.id)}${yearSuffix}`}
            state={{ breadcrumbs: breadcrumbs ?? [
              { label: 'Standards', href: '/?tab=standards' },
              { label: standardId, href: `/standards/${standardId}${auditYear ? `?audit_year=${encodeURIComponent(auditYear)}` : ''}` },
            ] }}
            className="flex-shrink-0 px-2 py-2.5 border-l border-[#ccfbf1] hover:bg-[#ccfbf1] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488] group"
            title={`View ${m.name} in course detail`}
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-3.5 h-3.5 text-[#0d9488] group-hover:text-[#047857] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        )}
      </div>

      {open && (
        <div className="border-t border-[#d1fae5] bg-white px-3 py-3 space-y-3">
          {/* Learning Objectives */}
          {(topic.ios?.length ?? 0) > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Learning Objectives</p>
              <ul className="space-y-1">
                {topic.ios.map((io) => (
                  <li key={io.id} className="flex gap-2 text-[11px] text-[#475569]">
                    <span className="text-[#0d9488] font-bold flex-shrink-0">{io.id}</span>
                    <span className="flex-1">{io.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Assessments */}
          {(topic.assessments?.length ?? 0) > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Assessments</p>
              <div className="flex flex-wrap gap-1.5">
                {topic.assessments.map((a) => (
                  <span key={a.id} className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: '#fef3c7', color: '#d97706' }}>
                    {a.name} ({a.type})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Competencies */}
          {(topic.comps?.length ?? 0) > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Competencies</p>
              <div className="flex flex-wrap gap-1.5">
                {topic.comps.map((c) => (
                  <Link
                    key={c.id}
                    to={`/?tab=competencies&compId=${encodeURIComponent(c.id)}${yearSuffix}`}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium hover:opacity-75 transition-opacity"
                    style={{ background: '#ede9fe', color: '#7c3aed' }}
                    title={c.text}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.id}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Goals */}
          {(topic.goals?.length ?? 0) > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Goals</p>
              <div className="flex flex-wrap gap-1.5">
                {topic.goals.map((g) => (
                  <span key={g.id} className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: '#dcfce7', color: '#16a34a' }}>
                    {g.id}
                  </span>
                ))}
              </div>
            </div>
          )}

          <CommentsSection
            comments={topic.comments ?? []}
            standardId={standardId}
            targetType="linked_ct"
            targetIndex={null}
            targetPath={targetPath}
            currentUserEmail={currentUserEmail}
          />
        </div>
      )}
    </div>
  );
}

// ── CLO row ───────────────────────────────────────────────────────────────────

function CLORow({
  clo, standardId, currentUserEmail, eeId, courseId, courseCode, breadcrumbs,
}: {
  clo: LinkedCourseCLO;
  standardId: string;
  currentUserEmail: string;
  eeId: string;
  courseId: string;
  courseCode: string;
  breadcrumbs?: Crumb[];
}) {
  const [open, setOpen] = useState(false);
  const cloPath = `${eeId}/${courseId}/${clo.clo_id}`;

  return (
    <div className="border border-[#e2e8f0] rounded-lg overflow-hidden">
      <button
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left bg-white hover:bg-[#f8fafc] transition-colors"
        onClick={() => setOpen((p) => !p)}
      >
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
          {clo.clo_id}
        </span>
        <span className="flex-1 text-xs text-[#1e293b] leading-snug">{clo.clo_text}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {(clo.topics?.length ?? 0) > 0 && (
            <span className="text-[10px] text-[#94a3b8]">{clo.topics.length} topic{clo.topics.length !== 1 ? 's' : ''}</span>
          )}
          <svg
            className="w-3.5 h-3.5 text-[#94a3b8] transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-[#f1f5f9] bg-[#f8fafc] p-3 space-y-2">
          {(clo.topics ?? []).map((topic) => (
            <TopicRow
              key={topic.topic_metadata.id}
              topic={topic}
              standardId={standardId}
              currentUserEmail={currentUserEmail}
              targetPath={`${cloPath}/${topic.topic_metadata.id}`}
              courseCode={courseCode}
              breadcrumbs={breadcrumbs}
            />
          ))}
          <CommentsSection
            comments={clo.comments ?? []}
            standardId={standardId}
            targetType="linked_clo"
            targetIndex={null}
            targetPath={cloPath}
            currentUserEmail={currentUserEmail}
          />
        </div>
      )}
    </div>
  );
}

// ── Course card ───────────────────────────────────────────────────────────────

function CourseCard({
  course, standardId, currentUserEmail, eeId, breadcrumbs,
}: {
  course: LinkedCourse;
  standardId: string;
  currentUserEmail: string;
  eeId: string;
  breadcrumbs?: Crumb[];
}) {
  const [open, setOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const auditYear = searchParams.get('audit_year');
  const yearParam = auditYear ? `?audit_year=${encodeURIComponent(auditYear)}` : '';
  const coursePath = `${eeId}/${course.course_id}`;

  return (
    <div className="border border-[#e2e8f0] rounded-xl overflow-hidden">
      <div className="flex items-center bg-white">
        {/* Expand toggle — takes up most of the row */}
        <button
          className="flex items-center gap-3 flex-1 px-4 py-3 text-left hover:bg-[#f8fafc] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
          onClick={() => setOpen((p) => !p)}
        >
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0"
            style={{ background: '#dbeafe', color: '#1d4ed8' }}
          >
            {course.course_code}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#1e293b] truncate">{course.course_name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-[#94a3b8]">{course.clos?.length ?? 0} CLO{(course.clos?.length ?? 0) !== 1 ? 's' : ''}</span>
            <svg
              className="w-3.5 h-3.5 text-[#94a3b8] transition-transform"
              style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {/* Navigate to course detail — clearly separated from expand toggle */}
        <Link
          to={`/courses/${encodeURIComponent(course.course_code)}${yearParam}`}
          state={{ breadcrumbs: breadcrumbs ?? [
            { label: 'Standards', href: '/?tab=standards' },
            { label: standardId, href: `/standards/${standardId}${auditYear ? `?audit_year=${encodeURIComponent(auditYear)}` : ''}` },
          ] }}
          className="flex-shrink-0 px-3 py-3 border-l border-[#f1f5f9] hover:bg-[#eff6ff] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] group"
          title={`Open ${course.course_name} detail`}
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-4 h-4 text-[#2563eb] group-hover:text-[#1d4ed8] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>

      {open && (
        <div className="border-t border-[#f1f5f9] bg-[#f8fafc] px-4 py-3 space-y-2">
          {/* Full map reason */}
          {course.map_reason && (
            <p className="text-[11px] text-[#64748b] italic mb-3 leading-relaxed">{course.map_reason}</p>
          )}
          {(course.clos ?? []).map((clo) => (
            <CLORow
              key={clo.clo_id}
              clo={clo}
              standardId={standardId}
              currentUserEmail={currentUserEmail}
              eeId={eeId}
              courseId={course.course_id}
              courseCode={course.course_code}
              breadcrumbs={breadcrumbs}
            />
          ))}
          <CommentsSection
            comments={course.comments ?? []}
            standardId={standardId}
            targetType="linked_course"
            targetIndex={null}
            targetPath={coursePath}
            currentUserEmail={currentUserEmail}
          />
        </div>
      )}
    </div>
  );
}

// ── Support summary with clamp ───────────────────────────────────────────────

function SupportSummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 120;
  return (
    <span className="block mt-1">
      <span
        className="text-[11px] text-[#64748b] leading-relaxed italic"
        style={!expanded && long ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}
      >
        {text}
      </span>
      {long && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((p) => !p); }}
          className="text-[10px] text-[#94a3b8] hover:text-[#475569] transition-colors ml-1"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </span>
  );
}

// ── Essential Evidence card ───────────────────────────────────────────────────

function EvidenceLinkedCard({
  ev, index, standardId, currentUserEmail, onRefresh, machineReadiness, breadcrumbs, courseDetails,
}: {
  ev: EssentialEvidenceLinked;
  index: number;
  standardId: string;
  currentUserEmail: string;
  onRefresh?: () => void;
  machineReadiness?: string;
  breadcrumbs?: Crumb[];
  courseDetails?: Record<string, LinkedCourse>;
}) {
  const [open, setOpen] = useState(false);
  const courseCount = ev.linked_courses.length;
  const eeId = ev.evidence_metadata.id;
  const isOnSite = ev.evidence_review_data?.review_status === 'on_site_only';
  const hasSupport = courseCount > 0;

  // A mapped evidence item is only "strong" (green) when the standard-level
  // readiness is ready or mostly_ready. If the AI rated the standard as
  // needs_work or not_ready, individual items show amber even when courses
  // are present — the mapping exists but coverage is insufficient.
  const isWeakSupport = hasSupport && (
    machineReadiness === 'needs_work' || machineReadiness === 'not_ready'
  );

  const borderColor = isOnSite   ? '#c4b5fd'
    : isWeakSupport              ? '#fde68a'
    : hasSupport                 ? '#86efac'
    :                              '#fca5a5';
  const bgColor     = isOnSite   ? '#faf5ff'
    : isWeakSupport              ? '#fffbeb'
    : hasSupport                 ? '#f0fdf4'
    :                              '#fff1f2';
  const badgeBg     = isOnSite   ? '#7c3aed'
    : isWeakSupport              ? '#d97706'
    : hasSupport                 ? '#16a34a'
    :                              '#dc2626';

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${borderColor}`, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}
    >
      {/* Header */}
      <button
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors cursor-pointer hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563eb]"
        style={{ background: bgColor }}
        onClick={() => setOpen((p) => !p)}
      >
        <span
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
          style={{ background: badgeBg, color: '#fff' }}
        >
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1e293b] leading-snug">{ev.evidence_metadata.text}</p>
          {ev.evidence_metadata.support_summary && (
            <SupportSummary text={ev.evidence_metadata.support_summary} />
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {isOnSite ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                On-site / manual review
              </span>
            ) : isWeakSupport ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#d97706' }}>
                {courseCount} course{courseCount !== 1 ? 's' : ''} mapped — weak coverage
              </span>
            ) : hasSupport ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#16a34a' }}>
                {courseCount} course{courseCount !== 1 ? 's' : ''} mapped
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#fee2e2', color: '#dc2626' }}>
                No mapping found
              </span>
            )}
            {(ev.linked_artifacts?.length ?? 0) > 0 && (
              <span className="text-[10px] text-[#94a3b8]">{ev.linked_artifacts.length} artifact{ev.linked_artifacts.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        <svg
          className="w-4 h-4 flex-shrink-0 mt-1 transition-transform"
          style={{ color: badgeBg, transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t bg-white px-4 py-4 space-y-3" style={{ borderColor }}>
          {/* Source artifacts */}
          {(ev.linked_artifacts?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-2">Source Artifacts</p>
              <div className="flex flex-wrap gap-1.5">
                {ev.linked_artifacts.map((a) => (
                  <span key={a.artifact_id} className="text-[11px] px-2 py-0.5 rounded border border-[#e2e8f0] text-[#475569] bg-[#f8fafc]" title={a.reason}>
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Mapped courses */}
          {ev.linked_courses.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">Mapped Courses</p>
              {ev.linked_courses.map((slim) => {
                // Resolve full course: prefer course_details (new format), fall back to embedded clos (legacy)
                const detail = courseDetails?.[slim.course_id];
                const fullCourse: LinkedCourse = {
                  ...slim,
                  clos: detail?.clos ?? (slim as unknown as LinkedCourse).clos ?? [],
                  comments: slim.comments ?? [],
                };
                return (
                  <CourseCard
                    key={slim.course_id}
                    course={fullCourse}
                    standardId={standardId}
                    currentUserEmail={currentUserEmail}
                    eeId={eeId}
                    breadcrumbs={breadcrumbs}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#94a3b8] text-center py-3">No course mappings for this evidence item.</p>
          )}

          <CommentsSection
            comments={ev.comments ?? []}
            standardId={standardId}
            targetType="linked_ee"
            targetIndex={null}
            targetPath={eeId}
            currentUserEmail={currentUserEmail}
          />
          <AttachmentPanel
            standardId={standardId}
            targetType="linked_ee"
            targetPath={eeId}
            attachments={ev.attachments ?? []}
            onUpdate={() => onRefresh?.()}
          />
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface LinkedStandardPanelProps {
  linkedData: LinkedStandard;
  standardId: string;
  currentUserEmail: string;
  onRefresh?: () => void;
  breadcrumbs?: Crumb[];
}

export function LinkedStandardPanel({ linkedData, standardId, currentUserEmail, onRefresh, breadcrumbs }: LinkedStandardPanelProps) {
  const meta = linkedData.standard_metadata;
  const review = linkedData.standard_review_data;
  const evidences = linkedData.essential_evidences;
  const onSiteCount = evidences.filter((e) => e.evidence_review_data?.review_status === 'on_site_only').length;
  const gradableEvidences = evidences.filter((e) => e.evidence_review_data?.review_status !== 'on_site_only');
  const supportedCount = gradableEvidences.filter((e) => e.linked_courses.length > 0).length;
  const totalCount = gradableEvidences.length;

  // Weighted coverage: each item scores 0–1 based on mapping depth.
  // 0 courses = 0, 1 course no CLOs = 0.4, 1 course with CLOs = 0.7, 2+ courses = 1.0
  const weightedScore = totalCount > 0
    ? gradableEvidences.reduce((sum, e) => {
        const courses = e.linked_courses.length;
        if (courses === 0) return sum;
        if (courses === 1) {
          const courseId = e.linked_courses[0]?.course_id;
          const detail = courseId ? linkedData.course_details?.[courseId] : undefined;
          // new format: look up in course_details; legacy format: clos embedded on slim ref
          const hasClos = detail
            ? detail.clos.length > 0
            : ((e.linked_courses[0] as unknown as LinkedCourse).clos?.length ?? 0) > 0;
          return sum + (hasClos ? 0.7 : 0.4);
        }
        return sum + 1.0;
      }, 0) / totalCount
    : 0;
  const coveragePct = Math.round(weightedScore * 100);

  // Bar color anchored to machine readiness so it stays consistent with the pill
  const readiness = review.machine_readiness_status;
  const barColor = readiness === 'ready' || readiness === 'mostly_ready' ? '#4ade80'
    : readiness === 'needs_work'  ? '#fbbf24'
    : readiness === 'not_ready'   ? '#f87171'
    : '#94a3b8';

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <div
        className="rounded-xl p-4 text-white"
        style={{ background: 'linear-gradient(135deg, #1a2c4e 0%, #1e3a6e 100%)', borderLeft: '4px solid #2563eb' }}
      >
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug" style={{ color: 'rgba(255,255,255,0.90)' }}>
              {meta.standard_evidence_summary || 'Mapping complete'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <ReadinessPill status={review.machine_readiness_status} />
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {supportedCount}/{totalCount} mapped
              {onSiteCount > 0 && ` · ${onSiteCount} on-site`}
            </span>
          </div>
        </div>

        {/* Coverage bar */}
        {totalCount > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.50)' }}>
              <span>Weighted Evidence Coverage</span>
              <span>{coveragePct}%</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${coveragePct}%`,
                  background: barColor,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Evidence items */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#64748b] flex items-center gap-2 mb-3">
          Essential Evidence Mapping
          <span className="flex-1 border-t border-[#e2e8f0]" />
        </h3>
        {evidences.length === 0 ? (
          <p className="text-sm text-[#94a3b8] text-center py-8">No essential evidence items in the mapping output.</p>
        ) : (
          <div className="space-y-3">
            {evidences.map((ev, i) => (
              <EvidenceLinkedCard
                key={ev.evidence_metadata.id || i}
                ev={ev}
                index={i}
                standardId={standardId}
                currentUserEmail={currentUserEmail}
                onRefresh={onRefresh}
                machineReadiness={review.machine_readiness_status}
                breadcrumbs={breadcrumbs}
                courseDetails={linkedData.course_details}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
