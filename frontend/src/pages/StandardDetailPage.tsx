import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/layout/Breadcrumbs';
import type { Crumb } from '../components/layout/Breadcrumbs';
import { useAuth } from '../hooks/useAuth';
import { standardsApi } from '../api/standards';
import { LoadingOverlay } from '../components/ui/Spinner';
import { EvidenceCard } from '../components/evidence/EvidenceCard';
import { QuestionCard } from '../components/evidence/QuestionCard';
import { LinkedStandardPanel } from '../components/evidence/LinkedStandardPanel';
import { LinkedReviewSection } from '../components/review/LinkedReviewSection';
import { AttachmentPanel } from '../components/evidence/AttachmentPanel';
import { RerunButton } from '../components/rerun/RerunButton';
import { CommentsSection } from '../components/comments/CommentsSection';
import { HumanReviewSection } from '../components/review/HumanReviewSection';
import { UserMenu } from '../components/UserMenu';
import { useToast } from '../contexts/ToastContext';
import type { StandardItem, RequirementEvidence } from '../types/evidence';

const READINESS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  ready:             { bg: '#dcfce7', text: '#16a34a', label: 'Ready' },
  mostly_ready:      { bg: '#fef9c3', text: '#ca8a04', label: 'Mostly Ready' },
  needs_work:        { bg: '#fef3c7', text: '#d97706', label: 'Needs Work' },
  not_ready:         { bg: '#fee2e2', text: '#dc2626', label: 'Not Ready' },
  no_courses_found:  { bg: '#f1f5f9', text: '#64748b', label: 'No Courses Found' },
  needs_review:      { bg: '#f1f5f9', text: '#64748b', label: 'Needs Review' },
  review_in_progress:{ bg: '#dbeafe', text: '#1d4ed8', label: 'In Progress' },
  human_verified:    { bg: '#dcfce7', text: '#16a34a', label: 'Verified' },
  needs_revision:    { bg: '#fef3c7', text: '#d97706', label: 'Needs Revision' },
};

function ReadinessPill({ status }: { status: string }) {
  const s = READINESS_STYLE[status] ?? { bg: '#f1f5f9', text: '#64748b', label: status };
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

export default function StandardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const auditYear = searchParams.get('audit_year');
  const { isAuthenticated, isLoading: authLoading, userAttributes } = useAuth();
  const currentUserEmail = userAttributes?.email || '';
  const [standard, setStandard] = useState<StandardItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStandard = useCallback(async (preserveScroll = false) => {
    if (!id) return;
    const scrollY = preserveScroll ? window.scrollY : 0;
    try {
      setError(null);
      if (!preserveScroll) setIsLoading(true);
      const response = await standardsApi.getById(id, auditYear);
      setStandard(response);
      if (preserveScroll && scrollY > 0) {
        setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'instant' }), 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load standard');
    } finally {
      if (!preserveScroll) setIsLoading(false);
    }
  }, [id, auditYear]);

  // Clear poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Start/stop 5s poll whenever status changes to/from analyzing
  useEffect(() => {
    if (!standard) return;
    const isActive = standard.status === 'analyzing' || standard.status === 'reevaluating';
    if (isActive && !pollRef.current) {
      pollRef.current = setInterval(() => fetchStandard(true), 5000);
    } else if (!isActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [standard, fetchStandard]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) { navigate('/login', { replace: true }); return; }
    fetchStandard();
  }, [isAuthenticated, authLoading, navigate, fetchStandard]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0f4f8' }}>
        <LoadingOverlay message="Loading standard..." />
      </div>
    );
  }

  if (error || !standard) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#f0f4f8' }}>
        <PageHeader />
        <div className="max-w-[1100px] mx-auto px-6 py-8">
          <BackLink standardId={id ?? ''} auditYear={auditYear} />
          <div className="p-6 rounded-xl bg-[#fee2e2] border border-[#fca5a5] text-center">
            <p className="text-[#dc2626] font-medium">{error || 'Standard not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  const evidence = standard.evidence_data;
  const hasEvidence = standard.status === 'analysis_complete' && evidence;
  const aiReadiness = evidence?.overall_readiness ?? standard.overall_readiness;
  const humanReadiness = evidence?.human_readiness_assessment ?? standard.human_readiness_assessment;
  const humanReviewStatus = evidence?.human_review_status ?? standard.human_review_status;

  // Standard is read-only if viewing frozen year AND standard hasn't been amended
  const isReadOnly = auditYear !== null && standard.is_frozen !== false;

  const incomingCrumbs = (location.state as { breadcrumbs?: Crumb[] } | null)?.breadcrumbs;
  const defaultStandardsHref = auditYear ? `/?tab=standards&audit_year=${encodeURIComponent(auditYear)}` : '/?tab=standards';
  const currentStandardHref = auditYear
    ? `/standards/${id ?? ''}?audit_year=${encodeURIComponent(auditYear)}`
    : `/standards/${id ?? ''}`;

  const crumbs: Crumb[] = incomingCrumbs
    ? [...incomingCrumbs, { label: id ?? '', href: currentStandardHref }]
    : [
        { label: 'Standards', href: defaultStandardsHref },
        { label: id ?? '', href: currentStandardHref },
      ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f0f4f8' }}>
      <PageHeader />

      <main className="max-w-[1100px] mx-auto px-6 py-6">
        <BackLink standardId={id ?? ''} auditYear={auditYear} />

        {/* ── Frozen year banner ── */}
        {isReadOnly && auditYear && (
          <div
            data-testid="frozen-banner"
            className="mb-5 px-4 py-3 rounded-lg border"
            style={{ background: '#dbeafe', borderColor: '#93c5fd' }}
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" style={{ color: '#1d4ed8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium" style={{ color: '#1e3a8a' }}>
                Viewing frozen snapshot: <strong>{auditYear}</strong> — all data is read-only and cannot be modified or rerun
              </p>
            </div>
          </div>
        )}

        {/* ── Standard header card ── */}
        <div
          className="rounded-xl overflow-hidden mb-6"
          style={{ background: 'linear-gradient(135deg, #1a2c4e 0%, #1e3a6e 100%)', boxShadow: '0 4px 6px -1px rgba(0,0,0,.12)' }}
        >
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 rounded text-xs font-bold" style={{ background: '#2563eb', color: '#fff' }}>
                    {standard.standard_id}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    ARC-PA 6th Edition
                  </span>
                </div>
                <p className="text-white text-base font-semibold leading-snug max-w-2xl">
                  {standard.requirement_text}
                </p>
                {standard.sub_requirement_text && (
                  <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.70)' }}>
                    {standard.sub_requirement_text}
                  </p>
                )}
                {hasEvidence && standard.last_processed_at && (
                  <p className="text-[11px] mt-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    Last analyzed {new Date(standard.last_processed_at).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Readiness + actions */}
              <div className="flex flex-col items-end gap-3 flex-shrink-0">
                {hasEvidence && (
                  <div className="flex flex-col gap-1.5 items-end">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.50)' }}>AI</span>
                      {aiReadiness && <ReadinessPill status={aiReadiness} />}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.50)' }}>Human</span>
                      <ReadinessPill status={humanReadiness ?? humanReviewStatus ?? 'needs_review'} />
                    </div>
                  </div>
                )}
                {!hasEvidence && !standard.section_id?.startsWith('B') && standard.evidence_data?.human_review_status === 'human_verified' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.50)' }}>Human</span>
                    <ReadinessPill status={standard.evidence_data.human_readiness_assessment ?? 'ready'} />
                  </div>
                )}
                {/* Hide rerun button when viewing frozen year - rerun doesn't respect audit year context yet (Slice 6) */}
                {auditYear === null && standard.section_id?.startsWith('B') && (
                  <RerunButton
                    scope={standard.standard_id}
                    label="Rerun"
                    onSuccess={() => setTimeout(fetchStandard, 1000)}
                  />
                )}
                {/* Hide mark complete button when viewing frozen year */}
                {auditYear === null && !standard.section_id?.startsWith('B') && (
                  <MarkCompleteButton
                    standard={standard}
                    onSuccess={() => setTimeout(fetchStandard, 1000)}
                  />
                )}
              </div>
            </div>

            {/* In-progress banner */}
            {(standard.status === 'analyzing' || standard.status === 'reevaluating') && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <svg className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#93c5fd' }} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm font-medium" style={{ color: '#bfdbfe' }}>
                  {standard.status === 'reevaluating' ? 'Re-mapping in progress…' : 'Mapping in progress…'}
                </span>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.40)' }}>Page will update automatically</span>
              </div>
            )}

            {/* EE stats bar */}
            {hasEvidence && evidence.essential_evidence_total > 0 && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <div className="flex items-center gap-6 flex-wrap">
                  <Stat value={evidence.essential_evidence_found} total={evidence.essential_evidence_total} label="Essential Evidence" />
                  <Stat value={evidence.questions_answerable} total={evidence.questions_total} label="Questions Answerable" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Content ── */}
        <ContentSection
          standard={standard}
          evidence={evidence || undefined}
          hasEvidence={!!hasEvidence}
          currentUserEmail={currentUserEmail}
          onRefresh={() => fetchStandard(true)}
          crumbs={crumbs}
          isReadOnly={isReadOnly}
        />

        {/* ── Supporting Files ── */}
        {!isReadOnly && (
          <div className="mt-8">
            <SectionHeading title="Supporting Files" />
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-4">
              <p className="text-xs text-[#64748b] mb-1">
                Attach documents that support this standard's evidence — syllabi, policies, site visit notes, or any supplemental material.
              </p>
              <AttachmentPanel
                standardId={standard.standard_id}
                targetType="standard"
                attachments={standard.attachments || []}
                onUpdate={() => fetchStandard(true)}
              />
            </div>
          </div>
        )}

        {/* ── Standard Discussion ── */}
        {!isReadOnly && (
          <div className="mt-8">
            <SectionHeading title="Standard Discussion" />
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-4">
              <CommentsSection
                comments={standard.comments || []}
                standardId={standard.standard_id}
                targetType="standard"
                targetIndex={null}
                currentUserEmail={currentUserEmail}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: 'linear-gradient(135deg, #1a2c4e 0%, #1e3a6e 100%)', borderBottom: '3px solid #2563eb', boxShadow: '0 10px 15px -3px rgba(0,0,0,.10)' }}
    >
      <div className="max-w-[1100px] mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-lg bg-[#2563eb] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">PA</div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">PA Accreditation Manager</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>Standard Detail</p>
          </div>
        </div>
        <UserMenu />
      </div>
    </header>
  );
}

function BackLink({ standardId, auditYear }: { standardId: string; auditYear: string | null }) {
  const location = useLocation();
  const incoming = (location.state as { breadcrumbs?: Crumb[] } | null)?.breadcrumbs;

  // Append audit_year to parent crumb if present
  const defaultParentHref = auditYear ? `/?tab=standards&audit_year=${encodeURIComponent(auditYear)}` : '/?tab=standards';
  const parentCrumb = incoming?.[incoming.length - 1] ?? { label: 'Standards', href: defaultParentHref };

  // Build breadcrumbs with audit_year in hrefs
  const currentStandardHref = auditYear
    ? `/standards/${standardId}?audit_year=${encodeURIComponent(auditYear)}`
    : `/standards/${standardId}`;

  const crumbs: Crumb[] = incoming
    ? [...incoming, { label: standardId, href: currentStandardHref }]
    : [
        { label: 'Standards', href: defaultParentHref },
        { label: standardId, href: currentStandardHref },
      ];

  return (
    <div className="mb-5">
      <Link
        to={parentCrumb.href}
        className="inline-flex items-center gap-1.5 text-[#2563eb] text-sm font-medium hover:underline mb-3"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to {parentCrumb.label}
      </Link>
      <Breadcrumbs crumbs={crumbs} />
    </div>
  );
}

function Stat({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div>
        <span className="text-white text-lg font-bold">{value}</span>
        <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>/{total}</span>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.50)' }}>{label}</div>
        <div className="w-28 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 80 ? '#4ade80' : pct >= 40 ? '#fbbf24' : '#f87171' }} />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-widest text-[#64748b] flex items-center gap-2 mb-4">
      {title}
      <span className="flex-1 border-t border-[#e2e8f0]" />
    </h2>
  );
}

// ── Content section (tab switcher when both WF5 + WF1 present) ───────────────

function ContentSection({
  standard, evidence, hasEvidence, currentUserEmail, onRefresh, crumbs, isReadOnly,
}: {
  standard: StandardItem;
  evidence: RequirementEvidence | undefined;
  hasEvidence: boolean;
  currentUserEmail: string;
  onRefresh: () => void;
  crumbs: Crumb[];
  isReadOnly: boolean;
}) {
  const hasLinked = !!standard.linked_data;
  const [tab, setTab] = useState<'linked' | 'evidence'>(hasLinked ? 'linked' : 'evidence');

  if (!standard.section_id?.startsWith('B') && !hasLinked) return null;

  if (!hasLinked && !hasEvidence) {
    if (standard.section_id?.startsWith('B')) return <NoEvidenceState standard={standard} />;
    return null;
  }

  return (
    <div>
      {/* Tab switcher when both available */}
      {hasLinked && hasEvidence && (
        <div className="flex gap-1 mb-5 border-b border-[#e2e8f0]">
          {[
            { id: 'linked' as const, label: 'Accreditation Analysis' },
            { id: 'evidence' as const, label: 'Legacy Evidence' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 text-sm font-medium transition-colors focus:outline-none"
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
      )}

      {hasLinked && !hasEvidence && (
        <div className="mb-5 flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold" style={{ background: '#dbeafe', color: '#1d4ed8' }}>Accreditation Analysis</span>
        </div>
      )}

      {tab === 'linked' && standard.linked_data && (
        <>
          <LinkedStandardPanel
            linkedData={standard.linked_data}
            standardId={standard.standard_id}
            currentUserEmail={currentUserEmail}
            onRefresh={onRefresh}
            breadcrumbs={crumbs}
          />
          {/* Human Review - show when started/completed (preserve audit trail), hide when needs_review */}
          {(() => {
            const reviewStatus = standard.linked_data.standard_review_data.human_review_status || 'needs_review';
            const hasStarted = reviewStatus !== 'needs_review';
            // Show if: not frozen OR has started review (preserve audit trail)
            if (!isReadOnly || hasStarted) {
              return (
                <LinkedReviewSection
                  linkedData={standard.linked_data}
                  standardId={standard.standard_id}
                  onUpdate={onRefresh}
                />
              );
            }
            return null;
          })()}
        </>
      )}

      {tab === 'evidence' && hasEvidence && evidence && (
        <EvidenceContent
          evidence={evidence}
          standardId={standard.standard_id}
          currentUserEmail={currentUserEmail}
          onRefresh={onRefresh}
          isReadOnly={isReadOnly}
        />
      )}
    </div>
  );
}

function NoEvidenceState({ standard }: { standard: StandardItem }) {
  if (standard.status === 'analyzing' || standard.status === 'reevaluating') {
    return (
      <div className="text-center py-14 bg-white rounded-xl border border-[#e2e8f0]">
        <div className="flex items-center justify-center gap-2 mb-2">
          <svg className="w-5 h-5 animate-spin text-[#2563eb]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-[#2563eb] font-medium text-sm">
            {standard.status === 'reevaluating' ? 'Reevaluating' : 'Analyzing'}…
          </span>
        </div>
        <p className="text-[#94a3b8] text-sm">Evidence analysis is in progress.</p>
      </div>
    );
  }
  if (standard.status === 'error') {
    return (
      <div className="p-5 bg-[#fee2e2] border border-[#fca5a5] rounded-xl">
        <p className="text-[#dc2626] font-medium text-sm">Processing Error</p>
        {standard.error_message && <p className="text-sm text-[#b91c1c] mt-1">{standard.error_message}</p>}
      </div>
    );
  }
  return (
    <div className="text-center py-14 bg-white rounded-xl border border-[#e2e8f0]">
      <p className="text-[#94a3b8] text-sm">No evidence has been collected for this requirement yet.</p>
      <p className="text-xs text-[#94a3b8] mt-1">Trigger a rerun to analyze this standard.</p>
    </div>
  );
}

// ── Evidence content (WF1) ────────────────────────────────────────────────────

function EvidenceContent({
  evidence, standardId, currentUserEmail, onRefresh, isReadOnly,
}: {
  evidence: RequirementEvidence;
  standardId: string;
  currentUserEmail: string;
  onRefresh: () => void;
  isReadOnly: boolean;
}) {
  const [expandedEvidence, setExpandedEvidence] = useState<Set<number>>(new Set());
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());

  const toggleEvidence = (i: number) => setExpandedEvidence((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });
  const toggleQuestion = (i: number) => setExpandedQuestions((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  return (
    <div className="space-y-8">
      {/* AI summary */}
      {evidence.summary && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl px-5 py-4" style={{ borderLeft: '4px solid #2563eb' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] mb-1.5">AI Summary</p>
          <p className="text-sm text-[#1e293b] leading-relaxed">{evidence.summary}</p>
        </div>
      )}

      {/* Essential Evidence */}
      {evidence.essential_evidence.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionHeading title="Essential Evidence" />
            <div className="flex gap-2">
              <button
                onClick={() => setExpandedEvidence(new Set(evidence.essential_evidence.map((_, i) => i)))}
                className="px-2.5 py-1 text-[11px] font-medium border border-[#2563eb] text-[#2563eb] rounded hover:bg-[#2563eb] hover:text-white transition-colors"
              >Expand All</button>
              <button
                onClick={() => setExpandedEvidence(new Set())}
                className="px-2.5 py-1 text-[11px] font-medium border border-[#e2e8f0] text-[#64748b] rounded hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
              >Collapse All</button>
            </div>
          </div>
          <div className="space-y-2">
            {evidence.essential_evidence.map((item, i) => (
              <EvidenceCard
                key={i}
                item={item}
                itemIndex={i}
                standardId={standardId}
                isExpanded={expandedEvidence.has(i)}
                onToggle={() => toggleEvidence(i)}
                currentUserEmail={currentUserEmail}
                onUpdate={onRefresh}
              />
            ))}
          </div>
        </section>
      )}

      {/* Focused Questions */}
      {evidence.focused_questions.length > 0 && (
        <section>
          <SectionHeading title="Focused Questions" />
          <div className="space-y-2">
            {evidence.focused_questions.map((q, i) => (
              <QuestionCard
                key={i}
                question={q}
                questionIndex={i}
                standardId={standardId}
                isExpanded={expandedQuestions.has(i)}
                onToggle={() => toggleQuestion(i)}
                currentUserEmail={currentUserEmail}
                onUpdate={onRefresh}
              />
            ))}
          </div>
        </section>
      )}

      {/* Compliance Notes */}
      {evidence.compliance_notes.length > 0 && (
        <section>
          <SectionHeading title="Compliance Notes" />
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 space-y-2">
            {evidence.compliance_notes.map((note, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-[#f8fafc] rounded-lg border-l-2 border-[#2563eb]">
                <svg className="w-4 h-4 text-[#2563eb] flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-[#475569]">{note}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Human Review - show when started/completed (preserve audit trail), hide when needs_review */}
      {(() => {
        const reviewStatus = evidence.human_review_status || 'needs_review';
        const hasStarted = reviewStatus !== 'needs_review';
        // Show if: not frozen OR has started review (preserve audit trail)
        if (!isReadOnly || hasStarted) {
          return (
            <HumanReviewSection
              evidence={evidence}
              standardId={standardId}
              onUpdate={onRefresh}
            />
          );
        }
        return null;
      })()}
    </div>
  );
}

function MarkCompleteButton({ standard, onSuccess }: { standard: StandardItem; onSuccess: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const isComplete = (standard.evidence_data?.human_review_status ?? standard.human_review_status) === 'human_verified';

  if (isComplete) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold"
        style={{ background: '#dcfce7', color: '#16a34a' }}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Complete
      </span>
    );
  }

  const handleClick = async () => {
    setIsLoading(true);
    try {
      await standardsApi.updateHumanReview(standard.standard_id, {
        human_review_status: 'human_verified',
        human_readiness_assessment: 'ready',
      });
      onSuccess();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to mark as complete', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-60"
      style={{ background: '#2563eb', color: '#fff' }}
    >
      {isLoading ? (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      Mark as Complete
    </button>
  );
}
