import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Crumb } from '../layout/Breadcrumbs';
import { standardsApi } from '../../api/standards';
import { useAuditYear } from '../../contexts/AuditYearContext';
import type {
  MappedCloForCompetency,
  MappedCourseForCompetency,
  MappedTopicForCompetency,
  ProgramCompetencyAPI,
} from '../../types/evidence';

interface CompetenciesTabProps {
  standards: unknown[];
  onViewStandard: (id: string) => void;
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

function TopicRow({ topic }: { topic: MappedTopicForCompetency }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border border-[#e2e8f0] rounded-md bg-white">
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0" style={{ background: '#fef9c3', color: '#854d0e' }}>
        {topic.id}
      </span>
      <span className="flex-1 text-xs text-[#334155] leading-snug">{topic.name}</span>
    </div>
  );
}

function CLORow({ clo, courseCode, competencyId }: { clo: MappedCloForCompetency; courseCode: string; competencyId: string }) {
  const [open, setOpen] = useState(false);
  const { selectedYear } = useAuditYear();
  const yearSuffix = selectedYear ? `&audit_year=${encodeURIComponent(selectedYear)}` : '';
  const yearCrumbSuffix = selectedYear ? `&audit_year=${encodeURIComponent(selectedYear)}` : '';
  const breadcrumbs: Crumb[] = [
    { label: 'Competencies', href: `/?tab=competencies${yearCrumbSuffix}` },
    { label: competencyId, href: `/?tab=competencies&compId=${encodeURIComponent(competencyId)}${yearCrumbSuffix}` },
  ];
  return (
    <div className="border border-[#e2e8f0] rounded-md overflow-hidden">
      <div className="flex items-center bg-white">
        <button
          className="flex items-center gap-2 flex-1 px-3 py-1.5 text-left hover:bg-[#eff6ff] transition-colors"
          onClick={() => setOpen((p) => !p)}
        >
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
            {clo.id}
          </span>
          <span className="flex-1 text-xs text-[#334155] leading-snug">{clo.name}</span>
          {clo.topics.length > 0 && (
            <span className="text-[10px] text-[#94a3b8] mr-1">{clo.topics.length} topic{clo.topics.length !== 1 ? 's' : ''}</span>
          )}
          <Chevron open={open} />
        </button>
        <Link
          to={`/courses/${encodeURIComponent(courseCode)}?cloId=${encodeURIComponent(clo.id)}${yearSuffix}`}
          state={{ breadcrumbs }}
          className="flex-shrink-0 px-2 py-1.5 border-l border-[#e2e8f0] hover:bg-[#dbeafe] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] group"
          title={`View ${clo.id} in ${courseCode} course detail`}
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-3.5 h-3.5 text-[#2563eb] group-hover:text-[#1d4ed8] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>
      {open && (
        <div className="border-t border-[#f1f5f9] bg-[#f8fafc] px-3 py-2 space-y-1.5">
          {clo.topics.length === 0 ? (
            <p className="text-xs text-[#94a3b8]">No topics linked to this CLO.</p>
          ) : (
            clo.topics.map((topic) => <TopicRow key={topic.id} topic={topic} />)
          )}
        </div>
      )}
    </div>
  );
}

function CourseRow({ mc, competencyId }: { mc: MappedCourseForCompetency; competencyId: string }) {
  const [open, setOpen] = useState(false);
  const { selectedYear } = useAuditYear();
  const yearParam = selectedYear ? `?audit_year=${encodeURIComponent(selectedYear)}` : '';
  const yearCrumbSuffix = selectedYear ? `&audit_year=${encodeURIComponent(selectedYear)}` : '';
  const breadcrumbs: Crumb[] = [
    { label: 'Competencies', href: `/?tab=competencies${yearCrumbSuffix}` },
    { label: competencyId, href: `/?tab=competencies&compId=${encodeURIComponent(competencyId)}${yearCrumbSuffix}` },
  ];
  return (
    <div className="border border-[#e2e8f0] rounded-md overflow-hidden">
      <div className="flex items-center bg-white">
        <button
          className="flex items-center gap-2 flex-1 px-3 py-2 text-left hover:bg-[#f0fdf4] transition-colors"
          onClick={() => setOpen((p) => !p)}
        >
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: '#ccfbf1', color: '#0d9488' }}>
            {mc.course_code}
          </span>
          <span className="flex-1 text-xs text-[#334155]">
            {mc.clos.length} CLO{mc.clos.length !== 1 ? 's' : ''}
          </span>
          <Chevron open={open} />
        </button>
        <Link
          to={`/courses/${encodeURIComponent(mc.course_code)}${yearParam}`}
          state={{ breadcrumbs }}
          className="flex-shrink-0 px-2 py-2 border-l border-[#e2e8f0] hover:bg-[#ccfbf1] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0d9488] group"
          title={`View ${mc.course_code} course detail`}
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-3.5 h-3.5 text-[#0d9488] group-hover:text-[#047857] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>
      {open && (
        <div className="border-t border-[#f1f5f9] bg-[#f8fafc] px-3 py-2 space-y-1.5">
          {mc.clos.length === 0 ? (
            <p className="text-xs text-[#94a3b8]">No CLOs mapped for this course.</p>
          ) : (
            mc.clos.map((clo) => <CLORow key={clo.id} clo={clo} courseCode={mc.course_code} competencyId={competencyId} />)
          )}
        </div>
      )}
    </div>
  );
}

function CompetencyCard({ competency, isTarget, cardRef }: { competency: ProgramCompetencyAPI; isTarget?: boolean; cardRef?: React.Ref<HTMLDivElement> }) {
  const [open, setOpen] = useState(isTarget ?? false);

  const cloCount = competency.mapped_courses.reduce((n, mc) => n + mc.clos.length, 0);
  const courseNames = competency.mapped_courses.map((mc) => mc.course_code);

  return (
    <div ref={cardRef} className="bg-white rounded-lg border border-[#e2e8f0] overflow-hidden shadow-sm" style={{ boxShadow: '0 1px 3px rgba(0,0,0,.10)' }}>
      <button
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#f8fafc] transition-colors"
        onClick={() => setOpen((p) => !p)}
      >
        <span
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
          style={{ background: '#ede9fe', color: '#7c3aed' }}
        >
          {competency.id}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1e293b] leading-snug">{competency.name}</p>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {cloCount > 0 ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                {cloCount} CLO{cloCount !== 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#f1f5f9', color: '#94a3b8' }}>
                No CLOs mapped
              </span>
            )}
            {courseNames.slice(0, 3).map((c) => (
              <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#ccfbf1', color: '#0d9488' }}>
                {c}
              </span>
            ))}
          </div>
        </div>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="border-t border-[#f1f5f9] bg-[#f8fafc] px-4 py-3 space-y-2">
          {competency.mapped_courses.length === 0 ? (
            <p className="text-xs text-[#94a3b8] text-center py-2">No courses mapped yet. Run "Recompute Mapping" after uploading courses.</p>
          ) : (
            competency.mapped_courses.map((mc) => <CourseRow key={mc.course_id} mc={mc} competencyId={competency.id} />)
          )}
        </div>
      )}
    </div>
  );
}

export function CompetenciesTab(_props: CompetenciesTabProps) {
  const { selectedYear } = useAuditYear();
  const [searchParams] = useSearchParams();
  const targetId = searchParams.get('compId') ?? '';
  const targetRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [competencies, setCompetencies] = useState<ProgramCompetencyAPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCompetencies = () => {
    setError(null);
    setLoading(true);
    standardsApi.getCompetencies(selectedYear)
      .then((res) => setCompetencies(res.competencies))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load competencies'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCompetencies(); }, [selectedYear]);

  useEffect(() => {
    if (targetId && targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [targetId, competencies]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    setUploadStatus(null);
    try {
      const result = await standardsApi.uploadCompetencies(file);
      setUploadStatus({ type: 'success', message: result.message });
      fetchCompetencies();
    } catch (err) {
      setUploadStatus({ type: 'error', message: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const filtered = competencies.filter(
    (c) => !search || c.id.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="w-5 h-5 animate-spin text-[#7c3aed]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="ml-2 text-sm text-[#64748b]">Loading competencies…</span>
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
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#64748b] flex items-center gap-2">
          Program Competencies
          <span className="border-t border-[#e2e8f0] w-24" />
        </h2>
        <div className="flex items-center gap-3">
          {uploadStatus && (
            <span
              className="text-xs px-2 py-1 rounded-md font-medium"
              style={uploadStatus.type === 'success' ? { background: '#dcfce7', color: '#16a34a' } : { background: '#fee2e2', color: '#dc2626' }}
            >
              {uploadStatus.message}
            </span>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <><svg className="w-3.5 h-3.5 animate-spin text-[#64748b]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Uploading…</>
            ) : (
              <><svg className="w-3.5 h-3.5 text-[#64748b]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>Upload Competencies PDF</>
            )}
          </button>
        </div>
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
          <span className="text-xs text-[#64748b]">— competencies filtered to those mapped to courses in frozen standards</span>
        </div>
      )}

      <div className="relative max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          type="text"
          placeholder="Search competencies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10"
        />
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="bg-white rounded-lg px-3 py-2 border border-[#e2e8f0] shadow-sm">
          <div className="text-xl font-extrabold text-[#7c3aed]">{competencies.length}</div>
          <div className="text-[10px] uppercase tracking-widest text-[#64748b]">Total Competencies</div>
        </div>
        <div className="bg-white rounded-lg px-3 py-2 border border-[#e2e8f0] shadow-sm">
          <div className="text-xl font-extrabold text-[#0d9488]">
            {competencies.reduce((n, c) => n + c.mapped_courses.reduce((m, mc) => m + mc.clos.length, 0), 0)}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[#64748b]">Mapped CLOs</div>
        </div>
        <div className="bg-white rounded-lg px-3 py-2 border border-[#e2e8f0] shadow-sm">
          <div className="text-xl font-extrabold text-[#1d4ed8]">
            {new Set(competencies.flatMap((c) => c.mapped_courses.map((mc) => mc.course_id))).size}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[#64748b]">Courses</div>
        </div>
      </div>

      {competencies.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-[#e2e8f0]">
          <p className="text-[#94a3b8] text-sm">No program competencies found.</p>
          <p className="text-[#94a3b8] text-xs mt-1">Upload a competencies PDF to populate this tab.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((comp) => (
            <CompetencyCard
              key={comp.id}
              competency={comp}
              isTarget={!!targetId && comp.id === targetId}
              cardRef={comp.id === targetId ? targetRef : undefined}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg border border-[#e2e8f0]">
              <p className="text-[#94a3b8] text-sm">No competencies match your search.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
