import type { StandardItem } from '../../types/evidence';
import { StatusDot, StatusBadge } from '../ui/Badge';

interface StandardCardProps {
  standard: StandardItem;
  onClick: () => void;
  selectedYear?: string | null;
  onAmendStandard?: (standard: StandardItem) => void;
  isAmended?: boolean;
  isRefrozen?: boolean;
}

export function StandardCard({
  standard,
  onClick,
  selectedYear: _selectedYear,
  onAmendStandard,
  isAmended,
  isRefrozen,
}: StandardCardProps) {
  const { standard_id, requirement_text, status, evidence_data } = standard;

  // Determine display status - check both top-level (list API) and nested (detail API)
  const readiness = standard.overall_readiness || evidence_data?.overall_readiness || 'no_guidance';
  const humanReviewStatus = standard.human_review_status || evidence_data?.human_review_status || 'needs_review';
  const isAnalysisComplete = status === 'analysis_complete' && readiness !== 'no_guidance';
  const isHumanVerified = humanReviewStatus === 'human_verified';
  const isAnalyzing = status === 'analyzing' || status === 'reevaluating';
  const isError = status === 'error';

  // Truncate text
  const truncatedText = requirement_text.length > 120
    ? requirement_text.slice(0, 120) + '...'
    : requirement_text;

  const displayStatus = isAnalyzing ? status
    : isError ? 'error'
    : isAnalysisComplete ? (readiness || 'no_guidance')
    : isHumanVerified ? (standard.human_readiness_assessment ?? standard.evidence_data?.human_readiness_assessment ?? 'ready')
    : 'unprocessed';

  const eeFound = standard.essential_evidence_found ?? evidence_data?.essential_evidence_found;
  const eeTotal = standard.essential_evidence_total ?? evidence_data?.essential_evidence_total;
  const showBar = isAnalysisComplete && eeTotal != null && eeTotal > 0;
  const eePct = showBar ? Math.round(((eeFound ?? 0) / eeTotal!) * 100) : 0;

  // Pill D.2 - Temporarily disable amend feature UI (for potential reimplementation later)
  const showAmendButton = false;

  const handleAmendClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAmendStandard) onAmendStandard(standard);
  };

  return (
    <div className="w-full flex items-center gap-3 px-3 py-2.5 bg-offwhite border border-border rounded-lg hover:bg-bg-secondary hover:border-border-dark transition-all group relative">
      <button
        onClick={onClick}
        className="flex items-center gap-3 flex-1 text-left"
      >
      {/* Status indicator */}
      <StatusDot status={displayStatus} />

      {/* ID */}
      <span className="font-display text-sm font-semibold text-accent min-w-[60px]">
        {standard_id}
      </span>

      {/* Text */}
      <span className="flex-1 text-xs text-text-secondary truncate">
        {truncatedText}
      </span>

      {/* EE Progress bar */}
      {showBar && (
        <div className="flex flex-col gap-0.5 min-w-[80px]">
          <div className="h-1.5 rounded-full bg-[#e2e8f0] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${eePct}%`, backgroundColor: eePct >= 80 ? '#16a34a' : eePct >= 40 ? '#d97706' : '#dc2626' }}
            />
          </div>
          <span className="text-[9px] text-[#94a3b8] text-right">{eeFound}/{eeTotal} EE</span>
        </div>
      )}

      {/* Badges Container */}
      <div className="flex flex-col gap-1 items-end">
        {isAnalyzing ? (
          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase bg-primary-100 text-primary-700 rounded flex items-center gap-1">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {status === 'reevaluating' ? 'Reevaluating' : 'Analyzing'}
          </span>
        ) : isError ? (
          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase bg-missing-bg text-missing rounded">
            Error
          </span>
        ) : isHumanVerified && !isAnalysisComplete ? (
          <StatusBadge
            status={standard.human_readiness_assessment ?? standard.evidence_data?.human_readiness_assessment ?? 'ready'}
            size="sm"
          />
        ) : isAnalysisComplete ? (
          // Show single badge if human review is complete (verified or needs_revision)
          // Use human's assessment if available, otherwise fall back to AI readiness
          // Show dual badges if still in review (needs_review or review_in_progress)
          humanReviewStatus === 'human_verified' || humanReviewStatus === 'needs_revision' ? (
            <StatusBadge
              status={
                evidence_data?.human_readiness_assessment ||
                standard.human_readiness_assessment ||
                (humanReviewStatus === 'human_verified' ? readiness : 'not_ready')
              }
              size="sm"
            />
          ) : (
            <div className="flex flex-col gap-1 items-end">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-medium text-text-muted uppercase tracking-wider">AI:</span>
                <StatusBadge status={readiness} size="sm" />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-medium text-text-muted uppercase tracking-wider">Human:</span>
                <StatusBadge status={humanReviewStatus} size="sm" />
              </div>
            </div>
          )
        ) : (
          <span className="px-2 py-0.5 text-[10px] font-semibold uppercase bg-bg-secondary text-text-muted rounded">
            Unprocessed
          </span>
        )}
      </div>

        {/* Arrow */}
        <svg
          className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Amendment controls (frozen year only) */}
      {showAmendButton && (
        <button
          onClick={handleAmendClick}
          className="px-3 py-1.5 text-xs font-semibold rounded transition-colors"
          style={{ background: '#fef3c7', color: '#92400e' }}
          title="Unlock this frozen standard for editing"
        >
          Amend
        </button>
      )}

      {/* Amended badge */}
      {isAmended && !isRefrozen && (
        <span
          className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded"
          style={{ background: '#fee2e2', color: '#dc2626' }}
        >
          Unlocked
        </span>
      )}

      {/* Revised badge (after refreeze) */}
      {isRefrozen && (
        <span
          className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded"
          style={{ background: '#dbeafe', color: '#1e40af' }}
        >
          Revised
        </span>
      )}
    </div>
  );
}
