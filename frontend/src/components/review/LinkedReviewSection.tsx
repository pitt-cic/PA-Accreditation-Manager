import { useState, useEffect, useRef } from 'react';
import { standardsApi } from '../../api/standards';
import type { LinkedStandard, ReadinessLevel } from '../../types/evidence';

interface LinkedReviewSectionProps {
  linkedData: LinkedStandard;
  standardId: string;
  onUpdate: () => void;
}

const READINESS_OPTIONS: { value: ReadinessLevel; label: string; color: string; bg: string }[] = [
  { value: 'ready',        label: 'Ready',        color: '#16a34a', bg: '#dcfce7' },
  { value: 'mostly_ready', label: 'Mostly Ready', color: '#ca8a04', bg: '#fef9c3' },
  { value: 'needs_work',   label: 'Needs Work',   color: '#d97706', bg: '#fef3c7' },
  { value: 'not_ready',    label: 'Not Ready',    color: '#dc2626', bg: '#fee2e2' },
];

const MACHINE_READINESS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  ready:            { bg: '#dcfce7', text: '#16a34a', label: 'Ready' },
  mostly_ready:     { bg: '#fef9c3', text: '#ca8a04', label: 'Mostly Ready' },
  needs_work:       { bg: '#fef3c7', text: '#d97706', label: 'Needs Work' },
  not_ready:        { bg: '#fee2e2', text: '#dc2626', label: 'Not Ready' },
  no_courses_found: { bg: '#f1f5f9', text: '#64748b', label: 'No Courses Found' },
  not_applicable:   { bg: '#f1f5f9', text: '#64748b', label: 'Not Applicable' },
  pending:          { bg: '#f1f5f9', text: '#94a3b8', label: 'Pending' },
};

function ReadinessPill({ status }: { status: string }) {
  const s = MACHINE_READINESS_STYLE[status] ?? MACHINE_READINESS_STYLE.pending;
  return (
    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

export function LinkedReviewSection({ linkedData, standardId, onUpdate }: LinkedReviewSectionProps) {
  const srd = linkedData.standard_review_data;
  const reviewStatus = srd.human_review_status ?? 'needs_review';
  const isComplete = reviewStatus === 'human_verified' || reviewStatus === 'needs_revision';

  // Reviewer must actively choose — no pre-selection of AI verdict
  const [selectedReadiness, setSelectedReadiness] = useState<ReadinessLevel | null>(
    (srd.human_readiness_status as ReadinessLevel) ?? null
  );
  const [reviewNote, setReviewNote] = useState(srd.review_notes ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const prevStatusRef = useRef(reviewStatus);

  // Sync local state when linkedData refreshes
  useEffect(() => {
    setSelectedReadiness((srd.human_readiness_status as ReadinessLevel) ?? null);
    setReviewNote(srd.review_notes ?? '');
  }, [srd.human_readiness_status, srd.review_notes]);

  // Scroll into view when review starts
  useEffect(() => {
    if (prevStatusRef.current === 'needs_review' && reviewStatus === 'review_in_progress' && sectionRef.current) {
      sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    prevStatusRef.current = reviewStatus;
  }, [reviewStatus]);

  const callApi = async (status: string, readiness?: ReadinessLevel | null, note?: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await standardsApi.updateLinkedReview(standardId, {
        human_review_status: status as 'needs_review' | 'review_in_progress' | 'human_verified' | 'needs_revision',
        ...(readiness ? { human_readiness_status: readiness } : {}),
        ...(note?.trim() ? { human_review_note: note.trim() } : {}),
      });
      onUpdate();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to save: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const machineReadiness = srd.machine_readiness_status;
  const summary = linkedData.standard_metadata.standard_evidence_summary;

  return (
    <section ref={sectionRef} className="mt-8">
      {/* Section heading */}
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#64748b] flex items-center gap-2 mb-4">
        Human Review
        <span className="flex-1 border-t border-[#e2e8f0]" />
      </h2>

      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
        {/* Status header bar */}
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <div className="flex items-center gap-3">
            <ReviewStatusIndicator status={reviewStatus} />
            {isComplete && srd.reviewer && (
              <span className="text-xs text-[#94a3b8]">
                by <span className="text-[#475569] font-medium">{srd.reviewer}</span>
                {srd.review_date && (
                  <> on {new Date(srd.review_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                )}
              </span>
            )}
          </div>
          {isComplete && (
            <button
              onClick={() => callApi('review_in_progress')}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs font-semibold border border-[#2563eb] text-[#2563eb] rounded-lg hover:bg-[#2563eb] hover:text-white transition-colors disabled:opacity-50"
            >
              Reopen Review
            </button>
          )}
        </div>

        <div className="px-5 py-5">
          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-[#fee2e2] border border-[#fca5a5] text-sm text-[#dc2626]">{error}</div>
          )}

          {/* ── needs_review: single CTA ── */}
          {reviewStatus === 'needs_review' && (
            <div className="text-center py-6">
              <p className="text-sm text-[#64748b] mb-4 max-w-md mx-auto">
                Review the AI course mapping above, then begin your assessment of this standard's evidence readiness.
              </p>
              <button
                onClick={() => callApi('review_in_progress')}
                disabled={isSubmitting}
                className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50"
                style={{ background: '#2563eb' }}
              >
                {isSubmitting ? 'Starting…' : 'Begin Review'}
              </button>
            </div>
          )}

          {/* ── review_in_progress: full form ── */}
          {reviewStatus === 'review_in_progress' && (
            <div className="space-y-5">
              {/* AI Assessment reference (read-only) */}
              <div className="rounded-lg p-4" style={{ background: '#f0f4f8', border: '1px solid #e2e8f0' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-2.5">AI Assessment</p>
                <div className="flex items-center gap-2 mb-2.5">
                  <ReadinessPill status={machineReadiness} />
                  <span className="text-[11px] text-[#94a3b8]">machine-generated — use as reference only</span>
                </div>
                {summary && (
                  <p className="text-xs text-[#475569] leading-relaxed italic">"{summary}"</p>
                )}
              </div>

              {/* Human readiness assessment — no default, deliberate selection required */}
              <div>
                <p className="text-sm font-semibold text-[#1e293b] mb-1">Your Readiness Assessment</p>
                <p className="text-xs text-[#94a3b8] mb-3">Select the readiness level that best reflects your independent evaluation of the evidence.</p>
                <div className="grid grid-cols-2 gap-2">
                  {READINESS_OPTIONS.map((opt) => {
                    const isSelected = selectedReadiness === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedReadiness(opt.value)}
                        className="px-3 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all text-left"
                        style={{
                          borderColor: isSelected ? opt.color : '#e2e8f0',
                          background:  isSelected ? opt.bg : '#fff',
                          color:        isSelected ? opt.color : '#64748b',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional notes */}
              <div>
                <label htmlFor="linked-review-note" className="block text-sm font-semibold text-[#1e293b] mb-1">
                  Reviewer Notes <span className="text-[#94a3b8] font-normal">(optional)</span>
                </label>
                <textarea
                  id="linked-review-note"
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  rows={3}
                  placeholder="Note any concerns, gaps, or observations for this standard…"
                  className="w-full px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg resize-none focus:outline-none focus:border-[#2563eb] focus:ring-2"
                  style={{ '--tw-ring-color': 'rgba(37,99,235,0.12)' } as React.CSSProperties}
                />
              </div>

              {/* Submit actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => callApi('human_verified', selectedReadiness, reviewNote)}
                  disabled={isSubmitting || !selectedReadiness}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#16a34a' }}
                  title={!selectedReadiness ? 'Select a readiness level first' : undefined}
                >
                  {isSubmitting ? 'Saving…' : 'Confirm — Verified'}
                </button>
                <button
                  onClick={() => callApi('needs_revision', selectedReadiness, reviewNote)}
                  disabled={isSubmitting || !selectedReadiness}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#d97706' }}
                  title={!selectedReadiness ? 'Select a readiness level first' : undefined}
                >
                  {isSubmitting ? 'Saving…' : 'Flag — Needs Revision'}
                </button>
              </div>
              {!selectedReadiness && (
                <p className="text-xs text-center text-[#94a3b8]">Select a readiness level above to enable submission.</p>
              )}
            </div>
          )}

          {/* ── human_verified / needs_revision: completed summary ── */}
          {isComplete && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">AI Assessment</p>
                  <ReadinessPill status={machineReadiness} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Human Assessment</p>
                  {srd.human_readiness_status
                    ? <ReadinessPill status={srd.human_readiness_status} />
                    : <span className="text-xs text-[#94a3b8]">—</span>
                  }
                </div>
              </div>
              {srd.review_notes && (
                <div className="px-4 py-3 rounded-lg" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1.5">Reviewer Notes</p>
                  <p className="text-sm text-[#475569] leading-relaxed">{srd.review_notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewStatusIndicator({ status }: { status: string }) {
  const configs: Record<string, { label: string; dot: string; text: string }> = {
    needs_review:      { label: 'Needs Review',    dot: '#94a3b8', text: '#64748b' },
    review_in_progress:{ label: 'In Progress',     dot: '#2563eb', text: '#1d4ed8' },
    human_verified:    { label: 'Verified',         dot: '#16a34a', text: '#15803d' },
    needs_revision:    { label: 'Needs Revision',   dot: '#d97706', text: '#b45309' },
  };
  const c = configs[status] ?? configs.needs_review;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      <span className="text-xs font-semibold" style={{ color: c.text }}>{c.label}</span>
    </div>
  );
}
