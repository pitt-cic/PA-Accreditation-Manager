import type { FocusedQuestionItem } from '../../types/evidence';
import { CommentsSection } from '../comments/CommentsSection';
import { ResolveButton } from './ResolveButton';
import { ReevaluateSection } from '../rerun/ReEvaluateSection';

interface QuestionCardProps {
  question: FocusedQuestionItem;
  questionIndex: number;
  standardId: string;
  isExpanded: boolean;
  onToggle: () => void;
  currentUserEmail: string;
  onUpdate?: () => void;
}

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  found:     { bg: '#f0fdf4', border: '#86efac', text: '#16a34a', label: 'Answerable' },
  partial:   { bg: '#fffbeb', border: '#fcd34d', text: '#d97706', label: 'Partial' },
  not_found: { bg: '#fff1f2', border: '#fca5a5', text: '#dc2626', label: 'Not Found' },
  on_site:   { bg: '#faf5ff', border: '#c4b5fd', text: '#7c3aed', label: 'On-Site' },
  resolved:  { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', label: 'Resolved' },
};

export function QuestionCard({ question, questionIndex, standardId, isExpanded, onToggle, currentUserEmail, onUpdate }: QuestionCardProps) {
  const displayStatus = question.is_resolved ? 'resolved' : question.status;
  const style = STATUS_STYLE[displayStatus] ?? STATUS_STYLE.not_found;

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
        <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: style.text }} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1e293b] leading-snug">{question.question}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: style.text + '1a', color: style.text }}>
              {style.label}
            </span>
            {question.is_resolved && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: '#dbeafe', color: '#1d4ed8' }}>Resolved</span>
            )}
            {question.answer_evidence.length > 0 && (
              <span className="text-[10px] text-[#94a3b8]">{question.answer_evidence.length} source{question.answer_evidence.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        <svg
          className="w-4 h-4 flex-shrink-0 mt-1 transition-transform"
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

            {/* Resolution note */}
            {question.is_resolved && question.resolved_note && (
              <div className="rounded-lg p-3" style={{ background: '#eff6ff', border: '1px solid #93c5fd' }}>
                <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#1d4ed8' }}>
                  Resolved by {question.resolved_by || 'Unknown'}{question.resolved_at ? ` · ${new Date(question.resolved_at).toLocaleDateString()}` : ''}
                </p>
                <p className="text-sm text-[#1e293b]">{question.resolved_note}</p>
              </div>
            )}

            {/* Suggested answer */}
            {question.suggested_answer && (
              <div className="rounded-lg p-3" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
                <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5 text-[#16a34a]">Suggested Response</p>
                <p className="text-sm text-[#1e293b] leading-relaxed">{question.suggested_answer}</p>
              </div>
            )}

            {/* Supporting evidence */}
            {question.answer_evidence.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8] mb-2">Supporting Evidence</p>
                <div className="space-y-2">
                  {question.answer_evidence.map((excerpt, i) => (
                    <div key={i} className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-3">
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
                      </div>
                      <p className="text-sm text-[#475569] leading-relaxed italic border-l-2 border-[#e2e8f0] pl-3">
                        {excerpt.excerpt}
                      </p>
                      {excerpt.explanation && (
                        <p className="text-[11px] text-[#94a3b8] mt-1.5">{excerpt.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No evidence warning */}
            {question.status === 'not_found' && question.answer_evidence.length === 0 && (
              <div className="rounded-lg p-3" style={{ background: '#fff1f2', border: '1px solid #fca5a5' }}>
                <p className="text-sm text-[#dc2626]">No evidence found to answer this question. Consider preparing documentation or talking points for site visitors.</p>
              </div>
            )}

            {/* Manual resolution */}
            <div className="flex items-center justify-between pt-3 border-t border-[#f1f5f9]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#94a3b8]">Manual Resolution</span>
              <ResolveButton
                standardId={standardId}
                targetType="question"
                targetIndex={questionIndex}
                isResolved={question.is_resolved}
                resolvedBy={question.resolved_by}
                resolvedAt={question.resolved_at}
                onResolved={onUpdate}
              />
            </div>

            <ReevaluateSection
              standardId={standardId}
              targetType="question"
              targetIndex={questionIndex}
              onReevaluationStarted={() => onUpdate?.()}
            />

            <CommentsSection
              comments={question.comments || []}
              standardId={standardId}
              targetType="question"
              targetIndex={questionIndex}
              currentUserEmail={currentUserEmail}
            />
          </div>
        </div>
      )}
    </div>
  );
}
