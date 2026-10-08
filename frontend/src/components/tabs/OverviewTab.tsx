import { useMemo, useState } from 'react';
import type { StandardItem, ReadinessLevel } from '../../types/evidence';
import { SECTION_GROUPS, SECTION_TITLES } from '../../data/programData';

interface OverviewTabProps {
  standards: StandardItem[];
  onViewStandard: (id: string) => void;
  selectedYear: string | null;
}

function computeStats(standards: StandardItem[]) {
  let ready = 0, mostly_ready = 0, needs_work = 0, not_ready = 0, no_guidance = 0, no_courses_found = 0;
  let hr_verified = 0, hr_progress = 0, hr_pending = 0, hr_revision = 0;
  let unscored = 0;

  for (const std of standards) {
    const readiness: ReadinessLevel | string | undefined =
      std.human_readiness_assessment ??
      std.evidence_data?.human_readiness_assessment ??
      std.overall_readiness ??
      std.evidence_data?.overall_readiness;

    if (!readiness || std.status !== 'analysis_complete') {
      unscored++;
    } else if (readiness === 'no_courses_found') {
      no_courses_found++;
    } else {
      if (readiness === 'ready') ready++;
      else if (readiness === 'mostly_ready') mostly_ready++;
      else if (readiness === 'needs_work') needs_work++;
      else if (readiness === 'not_ready') not_ready++;
      else no_guidance++;
    }

    const hr = std.human_review_status ?? std.evidence_data?.human_review_status;
    if (hr === 'human_verified') hr_verified++;
    else if (hr === 'review_in_progress') hr_progress++;
    else if (hr === 'needs_revision') hr_revision++;
    else hr_pending++;
  }

  return { ready, mostly_ready, needs_work, not_ready, no_guidance, no_courses_found, unscored, hr_verified, hr_progress, hr_pending, hr_revision };
}

// Color used for "mapped but no relevant courses found" — distinct from unscored (lighter gray)
const NO_COURSES_COLOR = '#64748b';

function ScoreRing({ ready, mostly, work, notReady, noCoursesFound, total }: { ready: number; mostly: number; work: number; notReady: number; noCoursesFound: number; total: number }) {
  const scored = ready + mostly + work + notReady + noCoursesFound;
  if (scored === 0) return <div className="w-28 h-28 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-400">No data</div>;

  const R = 50;
  const circ = 2 * Math.PI * R;
  const pct = (n: number) => (n / total) * circ;

  const segments = [
    { val: ready,          color: '#16a34a' },
    { val: mostly,         color: '#4ade80' },
    { val: work,           color: '#d97706' },
    { val: notReady,       color: '#dc2626' },
    { val: noCoursesFound, color: NO_COURSES_COLOR },
    { val: total - scored, color: '#e2e8f0' },
  ];

  let offset = 0;
  const arcs = segments.map((s) => {
    const dash = pct(s.val);
    const el = (
      <circle
        key={s.color}
        cx="60" cy="60" r={R}
        fill="none"
        stroke={s.color}
        strokeWidth="10"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={-offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px' }}
      />
    );
    offset += dash;
    return el;
  });

  const readyPct = Math.round(((ready + mostly) / total) * 100);

  return (
    <svg viewBox="0 0 120 120" className="w-28 h-28">
      {arcs}
      <text x="60" y="56" textAnchor="middle" fontSize="18" fontWeight="800" fill="#1e293b">{readyPct}%</text>
      <text x="60" y="70" textAnchor="middle" fontSize="9" fill="#64748b">Ready</text>
    </svg>
  );
}

function KpiCard({ label, value, kpiClass, sub }: { label: string; value: number; kpiClass: string; sub?: string }) {
  return (
    <div className={`bg-white rounded-lg p-4 shadow-sm ${kpiClass}`} style={{ boxShadow: '0 1px 3px rgba(0,0,0,.10)' }}>
      <div className="text-3xl font-extrabold text-[#1e293b]">{value}</div>
      <div className="text-[11px] uppercase tracking-widest font-semibold text-[#64748b] mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-[#94a3b8] mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionProgressRow({
  groupId,
  groupTitle,
  sections,
  standards,
  onNavigate,
}: {
  groupId: string;
  groupTitle: string;
  sections: string[];
  standards: StandardItem[];
  onNavigate: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const sectionStds = standards.filter((s) => sections.includes(s.section_id));
  const total = sectionStds.length;
  if (total === 0) return null;

  let ready = 0, mostly = 0, work = 0, notReady = 0, noCoursesFound = 0, unscored = 0;
  for (const s of sectionStds) {
    const r = s.human_readiness_assessment ?? s.overall_readiness ?? s.evidence_data?.overall_readiness;
    if (!r || s.status !== 'analysis_complete') { unscored++; continue; }
    if (r === 'ready') ready++;
    else if (r === 'mostly_ready') mostly++;
    else if (r === 'needs_work') work++;
    else if (r === 'not_ready') notReady++;
    else if (r === 'no_courses_found') noCoursesFound++;
    // no_guidance / not_applicable fall through to unscored
    else unscored++;
  }

  const badgeClass = `badge-${groupId}`;
  const readyWidth       = ((ready + mostly) / total) * 100;
  const workWidth        = (work          / total) * 100;
  const notReadyWidth    = (notReady      / total) * 100;
  const noCoursesWidth   = (noCoursesFound / total) * 100;
  const unscoredWidth    = (unscored      / total) * 100;

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.10)' }}>
      <button
        data-testid={`section-group-${groupId}`}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setOpen((p) => !p)}
      >
        <span className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${badgeClass}`}>
          {groupId}
        </span>
        <span className="flex-1 text-sm font-semibold text-[#1e293b]">{groupTitle}</span>
        <span className="text-xs text-[#64748b] mr-2">{total} standards</span>
        {/* Mini progress bar */}
        <div className="w-24 h-2 rounded-full bg-[#e2e8f0] overflow-hidden flex">
          <div style={{ width: `${readyWidth}%`,     background: '#16a34a' }} />
          <div style={{ width: `${workWidth}%`,      background: '#d97706' }} />
          <div style={{ width: `${notReadyWidth}%`,  background: '#dc2626' }} />
          <div style={{ width: `${noCoursesWidth}%`, background: NO_COURSES_COLOR }} />
        </div>
        <svg className={`w-4 h-4 text-[#94a3b8] transition-transform ml-2 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Progress bar full-width */}
      <div className="h-1.5 flex" style={{ backgroundColor: '#e2e8f0' }}>
        <div style={{ width: `${readyWidth}%`,     background: '#16a34a',        transition: 'width .4s' }} />
        <div style={{ width: `${workWidth}%`,      background: '#d97706',        transition: 'width .4s' }} />
        <div style={{ width: `${notReadyWidth}%`,  background: '#dc2626',        transition: 'width .4s' }} />
        <div style={{ width: `${noCoursesWidth}%`, background: NO_COURSES_COLOR, transition: 'width .4s' }} />
        <div style={{ width: `${unscoredWidth}%`,  background: '#e2e8f0' }} />
      </div>

      {/* Expanded sub-section rows */}
      {open && (
        <div className="divide-y divide-[#f1f5f9]">
          {sections.map((secId) => {
            const secStds = standards.filter((s) => s.section_id === secId);
            if (secStds.length === 0) return null;
            return (
              <div key={secId} className="px-4 py-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-[#475569]">{secId} — {SECTION_TITLES[secId]}</span>
                  <span className="text-[10px] text-[#94a3b8]">{secStds.length} stds</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {secStds.map((std) => {
                    const r = std.human_readiness_assessment ?? std.overall_readiness ?? std.evidence_data?.overall_readiness;
                    const dotColor = r === 'ready' || r === 'mostly_ready' ? '#16a34a'
                      : r === 'needs_work'      ? '#d97706'
                      : r === 'not_ready'       ? '#dc2626'
                      : r === 'no_courses_found' ? NO_COURSES_COLOR
                      : '#94a3b8';
                    return (
                      <button
                        key={std.standard_id}
                        data-testid={`standard-button-${std.standard_id}`}
                        onClick={() => onNavigate(std.standard_id)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[#f1f5f9] hover:bg-[#dbeafe] transition-colors text-[#1e293b]"
                        title={std.requirement_text}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor, flexShrink: 0 }} />
                        {std.standard_id}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function OverviewTab({ standards, onViewStandard, selectedYear }: OverviewTabProps) {
  const stats = useMemo(() => computeStats(standards), [standards]);
  const total = standards.length;

  const readyPct      = total > 0 ? Math.round(((stats.ready + stats.mostly_ready) / total) * 100) : 0;
  const workPct       = total > 0 ? Math.round((stats.needs_work      / total) * 100) : 0;
  const notPct        = total > 0 ? Math.round((stats.not_ready       / total) * 100) : 0;
  const noCoursesPct  = total > 0 ? Math.round((stats.no_courses_found / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Frozen year banner */}
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
            — all metrics and quick-nav links reflect frozen year data
          </span>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        <KpiCard label="Ready" value={stats.ready + stats.mostly_ready} kpiClass="kpi-ready" sub="incl. mostly ready" />
        <KpiCard label="Needs Work" value={stats.needs_work} kpiClass="kpi-partial" />
        <KpiCard label="Not Ready" value={stats.not_ready} kpiClass="kpi-notready" />
        <KpiCard label="Unscored" value={stats.unscored} kpiClass="kpi-unscored" />
        <KpiCard label="No Courses Found" value={stats.no_courses_found} kpiClass="kpi-unscored" sub="mapped but 0 relevant" />
        <KpiCard label="HR Verified" value={stats.hr_verified} kpiClass="kpi-teal" />
        <KpiCard label="In Review" value={stats.hr_progress} kpiClass="kpi-purple" />
        <KpiCard label="Needs Revision" value={stats.hr_revision} kpiClass="kpi-notready" />
        <KpiCard label="Total" value={total} kpiClass="kpi-unscored" />
      </div>

      {/* Overall progress strip */}
      <div className="bg-white rounded-lg border border-[#e2e8f0] shadow-sm px-5 py-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.10)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#64748b]">Overall Progress — All Standards</span>
          <span className="text-xs font-semibold text-[#1e293b]">{readyPct}% ready</span>
        </div>
        <div className="h-2.5 rounded-full bg-[#e2e8f0] overflow-hidden flex">
          <div style={{ width: `${readyPct}%`,     background: '#16a34a',         transition: 'width .4s' }} />
          <div style={{ width: `${workPct}%`,      background: '#d97706',         transition: 'width .4s' }} />
          <div style={{ width: `${notPct}%`,       background: '#dc2626',         transition: 'width .4s' }} />
          <div style={{ width: `${noCoursesPct}%`, background: NO_COURSES_COLOR,  transition: 'width .4s' }} />
        </div>
        <div className="flex gap-5 mt-2 flex-wrap">
          {[
            { color: '#16a34a',        label: `Ready (${stats.ready + stats.mostly_ready})` },
            { color: '#d97706',        label: `Needs Work (${stats.needs_work})` },
            { color: '#dc2626',        label: `Not Ready (${stats.not_ready})` },
            { color: NO_COURSES_COLOR, label: `No Courses Found (${stats.no_courses_found})` },
            { color: '#94a3b8',        label: `Unscored (${stats.unscored})` },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] text-[#64748b]">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Two column layout */}
      <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 300px' }}>
        {/* Left: section breakdown */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#64748b] flex items-center gap-2">
            Standards by Section
            <span className="flex-1 border-t border-[#e2e8f0]" />
          </h2>
          {Object.entries(SECTION_GROUPS).map(([groupId, group]) => (
            <SectionProgressRow
              key={groupId}
              groupId={groupId}
              groupTitle={group.title}
              sections={group.sections}
              standards={standards}
              onNavigate={onViewStandard}
            />
          ))}
        </div>

        {/* Right: score ring + legend */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-5 shadow-sm" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.10)' }}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#64748b] mb-4">Readiness Overview</h3>
            <div className="flex justify-center mb-4">
              <ScoreRing
                ready={stats.ready}
                mostly={stats.mostly_ready}
                work={stats.needs_work}
                notReady={stats.not_ready}
                noCoursesFound={stats.no_courses_found}
                total={total}
              />
            </div>
            <div className="space-y-1.5 text-sm">
              {[
                { label: 'Ready', count: stats.ready, color: '#16a34a' },
                { label: 'Mostly Ready', count: stats.mostly_ready, color: '#4ade80' },
                { label: 'Needs Work', count: stats.needs_work, color: '#d97706' },
                { label: 'Not Ready', count: stats.not_ready, color: '#dc2626' },
                { label: 'No Courses Found', count: stats.no_courses_found, color: '#64748b' },
                { label: 'Unscored', count: stats.unscored, color: '#94a3b8' },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[#475569] text-xs">{label}</span>
                  </div>
                  <span className="text-xs font-semibold text-[#1e293b]">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Human review ring */}
          <div className="bg-white rounded-lg p-5 shadow-sm" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.10)' }}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#64748b] mb-3">Human Review Status</h3>
            <div className="space-y-1.5">
              {[
                { label: 'Verified', count: stats.hr_verified, color: '#0d9488' },
                { label: 'In Progress', count: stats.hr_progress, color: '#7c3aed' },
                { label: 'Needs Revision', count: stats.hr_revision, color: '#dc2626' },
                { label: 'Pending', count: stats.hr_pending, color: '#94a3b8' },
              ].map(({ label, count, color }) => {
                const width = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-[#475569]">{label}</span>
                      <span className="text-[11px] font-semibold text-[#1e293b]">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#f1f5f9] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-lg p-4 shadow-sm" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.10)' }}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#64748b] mb-3">Needs Attention</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {standards
                .filter((s) => {
                  const r = s.human_readiness_assessment ?? s.overall_readiness ?? s.evidence_data?.overall_readiness;
                  return r === 'not_ready' || r === 'needs_work' || r === 'no_courses_found';
                })
                .slice(0, 20)
                .map((s) => {
                  const r = s.human_readiness_assessment ?? s.overall_readiness ?? s.evidence_data?.overall_readiness;
                  const dotColor = r === 'not_ready' ? '#dc2626' : r === 'needs_work' ? '#d97706' : '#64748b';
                  return (
                    <button
                      key={s.standard_id}
                      data-testid={`standard-button-${s.standard_id}`}
                      onClick={() => onViewStandard(s.standard_id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#f1f5f9] transition-colors text-left"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: dotColor }}
                      />
                      <span className="text-xs font-medium text-[#1e293b]">{s.standard_id}</span>
                      <span className="text-[10px] text-[#94a3b8] truncate flex-1">{s.requirement_text}</span>
                    </button>
                  );
                })}
              {standards.filter((s) => {
                const r = s.human_readiness_assessment ?? s.overall_readiness ?? s.evidence_data?.overall_readiness;
                return r === 'not_ready' || r === 'needs_work' || r === 'no_courses_found';
              }).length === 0 && (
                <p className="text-xs text-[#94a3b8] text-center py-2">No standards need attention</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
