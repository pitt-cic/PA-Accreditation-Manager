import { useState, useRef, useEffect } from 'react';
import { StatusBadge } from '../ui/Badge';
import { standardsApi } from '../../api/standards';
import type { RequirementEvidence, ReadinessLevel } from '../../types/evidence';

interface HumanReviewSectionProps {
  evidence: RequirementEvidence;
  standardId: string;
  onUpdate: () => void;
}

export function HumanReviewSection({
  evidence,
  standardId,
  onUpdate,
}: HumanReviewSectionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewNote, setReviewNote] = useState(evidence.human_review_note || '');
  const [selectedVerdict, setSelectedVerdict] = useState<ReadinessLevel>(
    evidence.human_readiness_assessment || evidence.overall_readiness
  );
  const sectionRef = useRef<HTMLElement>(null);
  const prevStatusRef = useRef(evidence.human_review_status);

  const humanReviewStatus = evidence.human_review_status || 'needs_review';
  const isReviewComplete = humanReviewStatus === 'human_verified' || humanReviewStatus === 'needs_revision';

  // Use human's assessment if available, otherwise default to AI's
  const displayedAssessment = evidence.human_readiness_assessment || evidence.overall_readiness;

  // Sync local state when evidence updates (e.g., after reopening a completed review)
  useEffect(() => {
    setReviewNote(evidence.human_review_note || '');
    setSelectedVerdict(evidence.human_readiness_assessment || evidence.overall_readiness);
  }, [evidence.human_review_note, evidence.human_readiness_assessment, evidence.overall_readiness]);

  // Scroll to section when status changes to review_in_progress
  useEffect(() => {
    if (
      prevStatusRef.current === 'needs_review' &&
      humanReviewStatus === 'review_in_progress' &&
      sectionRef.current
    ) {
      sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    prevStatusRef.current = humanReviewStatus;
  }, [humanReviewStatus]);

  const handleStartReview = async () => {
    setIsSubmitting(true);
    try {
      await standardsApi.updateHumanReview(standardId, {
        human_review_status: 'review_in_progress',
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to start review:', error);
      alert('Failed to start review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitReview = async (status: 'human_verified' | 'needs_revision') => {
    setIsSubmitting(true);
    try {
      await standardsApi.updateHumanReview(standardId, {
        human_review_status: status,
        human_readiness_assessment: selectedVerdict,
        human_review_note: reviewNote.trim() || undefined,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to submit review:', error);
      alert('Failed to submit review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopenReview = async () => {
    setIsSubmitting(true);
    try {
      await standardsApi.updateHumanReview(standardId, {
        human_review_status: 'review_in_progress',
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to reopen review:', error);
      alert('Failed to reopen review. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section ref={sectionRef}>
      <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
        <span className="w-1 h-5 bg-accent rounded" />
        Human Review
      </h2>

      <div className="bg-white border border-border rounded-lg p-6">
        {/* Status Display */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-text-muted">Status:</span>
            <StatusBadge status={humanReviewStatus} />
          </div>
          {isReviewComplete && (
            <button
              onClick={handleReopenReview}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-sm font-medium text-accent border border-accent rounded hover:bg-accent hover:text-white transition-colors disabled:opacity-50"
            >
              Reopen for Review
            </button>
          )}
        </div>

        {/* Review Actions */}
        {!isReviewComplete && (
          <div className="space-y-4">
            {humanReviewStatus === 'needs_review' && (
              <button
                onClick={handleStartReview}
                disabled={isSubmitting}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Start Review
              </button>
            )}

            {humanReviewStatus === 'review_in_progress' && (
              <>
                {/* AI Verdict Reference */}
                <div className="p-4 bg-bg-secondary rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-text-muted">AI Evaluation:</span>
                    <StatusBadge status={evidence.overall_readiness} size="sm" />
                  </div>
                  <p className="text-xs text-text-secondary">{evidence.summary}</p>
                </div>

                {/* Human Verdict Selection */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Your Assessment:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['ready', 'mostly_ready', 'needs_work', 'not_ready'] as ReadinessLevel[]).map((level) => (
                      <button
                        key={level}
                        onClick={() => setSelectedVerdict(level)}
                        className={`px-3 py-2 text-sm font-medium border rounded-lg transition-colors ${
                          selectedVerdict === level
                            ? 'border-accent bg-accent text-white'
                            : 'border-border bg-white text-text-secondary hover:border-accent'
                        }`}
                      >
                        {level === 'ready' && 'Ready'}
                        {level === 'mostly_ready' && 'Mostly Ready'}
                        {level === 'needs_work' && 'Needs Work'}
                        {level === 'not_ready' && 'Not Ready'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Review Notes */}
                <div>
                  <label htmlFor="review-note" className="block text-sm font-medium text-text-primary mb-2">
                    Review Notes (Optional):
                  </label>
                  <textarea
                    id="review-note"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    rows={4}
                    placeholder="Add any notes about your assessment..."
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
                  />
                </div>

                {/* Submit Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSubmitReview('human_verified')}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    Submit Review
                  </button>
                  <button
                    onClick={() => handleSubmitReview('needs_revision')}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
                  >
                    Needs Revision
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Completed Review Display */}
        {isReviewComplete && (
          <div className="space-y-4">
            <div className="p-4 bg-bg-secondary rounded-lg">
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1">
                    AI Evaluation
                  </span>
                  <StatusBadge status={evidence.overall_readiness} size="sm" />
                </div>
                <div>
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1">
                    Human Assessment
                  </span>
                  <StatusBadge status={displayedAssessment} size="sm" />
                </div>
              </div>
              <div className="pt-3 border-t border-border mb-3">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1">
                  Review Status
                </span>
                <StatusBadge status={humanReviewStatus} size="sm" />
              </div>

              {evidence.human_review_note && (
                <div className="pt-3 border-t border-border">
                  <span className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1">
                    Reviewer Notes
                  </span>
                  <p className="text-sm text-text-secondary">{evidence.human_review_note}</p>
                </div>
              )}
            </div>

            {/* Reviewer Info */}
            <div className="flex items-center gap-4 text-xs text-text-muted">
              {evidence.human_reviewed_by && (
                <span>
                  <strong>Reviewer:</strong> {evidence.human_reviewed_by}
                </span>
              )}
              {evidence.human_reviewed_at && (
                <span>
                  <strong>Reviewed:</strong> {new Date(evidence.human_reviewed_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
