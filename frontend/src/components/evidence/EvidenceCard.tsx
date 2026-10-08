import { useState } from 'react';
import type { EssentialEvidenceItem, EvidenceExcerpt } from '../../types/evidence';
import { CommentsSection } from '../comments/CommentsSection';
import { ResolveButton } from './ResolveButton';
import { ReevaluateSection } from '../rerun/ReEvaluateSection';

interface EvidenceCardProps {
  item: EssentialEvidenceItem;
  itemIndex: number;
  standardId: string;
  isExpanded: boolean;
  onToggle: () => void;
  currentUserEmail: string;
  onUpdate?: () => void;
}

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  found:     { bg: '#f0fdf4', border: '#86efac', text: '#16a34a', label: 'Found' },
  partial:   { bg: '#fffbeb', border: '#fcd34d', text: '#d97706', label: 'Partial' },
  not_found: { bg: '#fff1f2', border: '#fca5a5', text: '#dc2626', label: 'Not Found' },
  on_site:   { bg: '#faf5ff', border: '#c4b5fd', text: '#7c3aed', label: 'On-Site' },
  resolved:  { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', label: 'Resolved' },
};

export function EvidenceCard({ item, itemIndex, standardId, isExpanded, onToggle, currentUserEmail, onUpdate }: EvidenceCardProps) {
  const displayStatus = item.is_resolved ? 'resolved' : item.status;
  const style = STATUS_STYLE[displayStatus] ?? STATUS_STYLE.not_found;
  const autoEvidence = item.evidence.filter(e => !e.is_manual);
  const manualEvidence = item.evidence.filter(e => e.is_manual);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${style.border}`, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors"
        style={{ background: style.bg }}
      >
        {/* Number badge */}
        <span
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
          style={{ background: style.text, color: '#fff' }}
        >
          {itemIndex + 1}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1e293b] leading-snug">{item.item_text}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: style.text + '1a', color: style.text }}>
              {style.label}
            </span>
            {item.is_resolved && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: '#dbeafe', color: '#1d4ed8' }}>Resolved</span>
            )}
            {item.evidence.length > 0 && (
              <span className="text-[10px] text-[#94a3b8]">{item.evidence.length} source{item.evidence.length !== 1 ? 's' : ''}</span>
            )}
            {item.attached_files.length > 0 && (
              <span className="text-[10px] text-[#94a3b8]">{item.attached_files.length} file{item.attached_files.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        <svg
          className={`w-4 h-4 flex-shrink-0 mt-1 transition-transform`}
          style={{ color: style.text, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div className="bg-white border-t" style={{ borderColor: style.border }}>
          <div className="p-4 space-y-4">

            {/* On-site banner */}
            {item.status === 'on_site' && item.on_site_info && (
              <div className="rounded-lg p-4 flex items-start gap-3" style={{ background: '#faf5ff', border: '1px solid #c4b5fd' }}>
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#7c3aed' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#7c3aed' }}>On-Site Verification Required</p>
                  <p className="text-sm text-[#475569]">{item.on_site_info.description}</p>
                  {item.on_site_info.preparation_tips.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {item.on_site_info.preparation_tips.map((tip, i) => (
                        <li key={i} className="text-[11px] text-[#64748b] flex items-start gap-1.5">
                          <span className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#7c3aed' }} />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Resolution note */}
            {item.is_resolved && item.resolved_note && (
              <div className="rounded-lg p-3" style={{ background: '#eff6ff', border: '1px solid #93c5fd' }}>
                <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#1d4ed8' }}>
                  Resolved by {item.resolved_by || 'Unknown'}{item.resolved_at ? ` · ${item.resolved_at}` : ''}
                </p>
                <p className="text-sm text-[#1e293b]">{item.resolved_note}</p>
              </div>
            )}

            {/* Auto-discovered excerpts */}
            {autoEvidence.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-2">Evidence Found</p>
                <div className="space-y-2">
                  {autoEvidence.map((e, i) => <ExcerptCard key={i} excerpt={e} />)}
                </div>
              </div>
            )}

            {/* Manual evidence */}
            {manualEvidence.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#1d4ed8' }}>Manually Added</p>
                <div className="space-y-2">
                  {manualEvidence.map((e, i) => <ExcerptCard key={i} excerpt={e} isManual />)}
                </div>
              </div>
            )}

            {/* Gap analysis */}
            {item.gap_analysis && item.status !== 'on_site' && (
              <div
                className="rounded-lg p-3"
                style={{
                  background: item.status === 'not_found' ? '#fff1f2' : '#fffbeb',
                  border: `1px solid ${item.status === 'not_found' ? '#fca5a5' : '#fcd34d'}`,
                }}
              >
                <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1" style={{ color: item.status === 'not_found' ? '#dc2626' : '#d97706' }}>
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Gap Analysis
                </p>
                <p className="text-sm text-[#475569]">{item.gap_analysis}</p>
              </div>
            )}

            {/* Suggestions */}
            {item.suggestions.length > 0 && item.status !== 'on_site' && (
              <div className="rounded-lg p-3" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1 text-[#1d4ed8]">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                  </svg>
                  Suggested Actions
                </p>
                <ul className="space-y-1">
                  {item.suggestions.map((s, i) => (
                    <li key={i} className="text-sm text-[#475569] flex items-start gap-2">
                      <span className="w-1 h-1 rounded-full mt-2 flex-shrink-0 bg-[#2563eb]" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Attached files */}
            {item.attached_files.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-2">Attached Files</p>
                <div className="space-y-1.5">
                  {item.attached_files.map((file, i) => (
                    <div key={i} className="flex items-center justify-between bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-[#2563eb]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium text-[#1e293b]">{file.name}</span>
                        <span className="text-xs text-[#94a3b8]">{file.size}</span>
                      </div>
                      <span className="text-[11px] text-[#94a3b8]">Added by {file.added_by}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual resolution */}
            <div className="flex items-center justify-between pt-3 border-t border-[#f1f5f9]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">Manual Resolution</span>
              <ResolveButton
                standardId={standardId}
                targetType="evidence"
                targetIndex={itemIndex}
                isResolved={item.is_resolved}
                resolvedBy={item.resolved_by}
                resolvedAt={item.resolved_at}
                onResolved={onUpdate}
              />
            </div>

            <ReevaluateSection
              standardId={standardId}
              targetType="evidence"
              targetIndex={itemIndex}
              onReevaluationStarted={() => onUpdate?.()}
            />

            <CommentsSection
              comments={item.comments}
              standardId={standardId}
              targetType="evidence"
              targetIndex={itemIndex}
              currentUserEmail={currentUserEmail}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ExcerptCard({ excerpt, isManual = false }: { excerpt: EvidenceExcerpt; isManual?: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-3" style={isManual ? { borderLeft: '3px solid #1d4ed8' } : {}}>
      {/* Source row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <svg className="w-3.5 h-3.5 text-[#2563eb] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
        <span className="text-xs font-semibold text-[#1a2c4e]">{excerpt.document_name}</span>
        {excerpt.page_numbers.length > 0 && (
          <span className="text-[10px] text-[#94a3b8] bg-white border border-[#e2e8f0] px-1.5 py-0.5 rounded">
            p. {excerpt.page_numbers.join(', ')}
          </span>
        )}
        {isManual && (
          <span className="text-[10px] font-semibold text-[#1d4ed8] bg-[#dbeafe] px-1.5 py-0.5 rounded">Manual</span>
        )}
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(excerpt.excerpt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="ml-auto text-[10px] text-[#94a3b8] hover:text-[#1a2c4e] transition-colors"
          title="Copy"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Excerpt */}
      <p className="text-sm text-[#475569] leading-relaxed italic border-l-2 border-[#e2e8f0] pl-3">
        {excerpt.excerpt}
      </p>

      {/* Explanation */}
      {excerpt.explanation && (
        <p className="text-[11px] text-[#94a3b8] mt-1.5">{excerpt.explanation}</p>
      )}
    </div>
  );
}
