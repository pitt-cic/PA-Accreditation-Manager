import { useState, useRef, useEffect } from 'react';
import type { StandardItem } from '../../types/evidence';
import { StandardCard } from './StandardCard';
import { standardsApi } from '../../api/standards';
import { useToast } from '../../contexts/ToastContext';

interface SectionAccordionProps {
  sectionId: string;
  sectionTitle: string;
  standards: StandardItem[];
  isExpanded: boolean;
  onToggle: () => void;
  onStandardClick: (standardId: string) => void;
  selectedYear: string | null;
  onAmendStandard: (standard: StandardItem) => void;
  amendedStandards: Set<string>;
  refrozenStandards: Set<string>;
}

export function SectionAccordion({
  sectionId,
  sectionTitle,
  standards,
  isExpanded,
  onToggle,
  onStandardClick,
  selectedYear,
  onAmendStandard,
  amendedStandards,
  refrozenStandards,
}: SectionAccordionProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleConfirmMap = async () => {
    setIsMapping(true);
    try {
      const res = await standardsApi.mapSection(sectionId);
      showToast(`Queued ${res.queued} standard(s) for mapping`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to queue section mapping', 'error');
    } finally {
      setIsMapping(false);
      setShowConfirm(false);
    }
  };

  const stats = { ready: 0, mostly_ready: 0, needs_work: 0, not_ready: 0 };
  for (const std of standards) {
    const humanVerified = std.human_review_status === 'human_verified';
    const r = (humanVerified
        ? (std.human_readiness_assessment ?? std.evidence_data?.human_readiness_assessment ?? std.overall_readiness)
        : std.overall_readiness)
      ?? std.evidence_data?.overall_readiness;
    if (r === 'ready') stats.ready++;
    else if (r === 'mostly_ready') stats.mostly_ready++;
    else if (r === 'needs_work') stats.needs_work++;
    else if (r === 'not_ready') stats.not_ready++;
  }

  return (
    <>
      {/* Confirmation modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#1a2c4e] mb-2">
              Map Section {sectionId}?
            </h3>
            <p className="text-sm text-[#64748b] mb-5">
              This will queue all {standards.length} standard{standards.length !== 1 ? 's' : ''} in
              section {sectionId} for WF4/5 course mapping. Each standard will be processed
              independently — this may take several minutes.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isMapping}
                className="px-4 py-2 text-sm font-medium text-[#64748b] hover:text-[#1e293b] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMap}
                disabled={isMapping}
                className="px-4 py-2 text-sm font-medium text-white bg-[#1a2c4e] rounded-lg hover:bg-[#1e3a6e] disabled:opacity-50 transition-colors"
              >
                {isMapping ? 'Queueing…' : `Queue ${standards.length} Standard${standards.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-border rounded-lg">
        {/* Header */}
        <button
          data-testid={`section-header-${sectionId}`}
          onClick={onToggle}
          className="w-full flex items-center justify-between px-4 py-3 bg-bg-secondary hover:bg-bg-secondary/80 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="bg-accent text-white text-xs font-semibold px-2 py-1 rounded">
              {sectionId}
            </span>
            <span className="font-display text-base font-semibold text-accent">
              {sectionTitle.replace(`${sectionId} - `, '')}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {/* Mini stat chips */}
            <div className="hidden sm:flex items-center gap-1">
              {stats.ready > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-found-bg text-found rounded">{stats.ready}</span>
              )}
              {stats.mostly_ready > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-found-bg text-found rounded">{stats.mostly_ready}</span>
              )}
              {stats.needs_work > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-partial-bg text-partial rounded">{stats.needs_work}</span>
              )}
              {stats.not_ready > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-missing-bg text-missing rounded">{stats.not_ready}</span>
              )}
            </div>
            <span className="text-xs text-text-muted">
              {standards.length} standard{standards.length !== 1 ? 's' : ''}
            </span>

            {/* Section options menu — only B standards support the mapping workflow */}
            {sectionId.startsWith('B') && <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen((p) => !p); }}
                className="p-1.5 text-text-muted hover:text-accent hover:bg-white rounded transition-colors"
                title="Section options"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#e2e8f0] rounded-lg shadow-lg z-10">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setShowConfirm(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#475569] hover:bg-[#f8fafc] hover:text-[#1a2c4e] transition-colors rounded-lg"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Map Section {sectionId}
                  </button>
                </div>
              )}
            </div>}

            <svg
              className={`w-5 h-5 text-text-muted transition-transform ${isExpanded ? '' : '-rotate-90'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </button>

        {/* Content — standard card rows */}
        {isExpanded && (
          <div className="p-3 space-y-1.5 animate-[slideDown_0.2s_ease-out]">
            {standards.map((std) => (
              <StandardCard
                key={std.standard_id}
                standard={std}
                onClick={() => onStandardClick(std.standard_id)}
                selectedYear={selectedYear}
                onAmendStandard={onAmendStandard}
                isAmended={amendedStandards.has(std.standard_id)}
                isRefrozen={refrozenStandards.has(std.standard_id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
