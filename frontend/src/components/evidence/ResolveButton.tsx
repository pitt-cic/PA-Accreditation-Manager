import { useState } from 'react';
import { standardsApi } from '../../api/standards';
import type { ResolveTargetType } from '../../types/evidence';

interface ResolveButtonProps {
  standardId: string;
  targetType: ResolveTargetType;
  targetIndex: number;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  onResolved?: () => void;
}

export function ResolveButton({
  standardId,
  targetType,
  targetIndex,
  isResolved,
  resolvedBy,
  resolvedAt,
  onResolved,
}: ResolveButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async () => {
    if (!note.trim()) {
      setError('Please provide a note explaining the resolution.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await standardsApi.resolveItem(standardId, targetType, targetIndex, note.trim());
      setShowModal(false);
      setNote('');
      onResolved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnresolve = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await standardsApi.resolveItem(standardId, targetType, targetIndex, '', true);
      onResolved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo resolution.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isResolved) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-muted">
          Resolved by {resolvedBy || 'Unknown'}
          {resolvedAt ? ` · ${new Date(resolvedAt).toLocaleDateString()}` : ''}
        </span>
        <button
          onClick={handleUnresolve}
          disabled={isSubmitting}
          className="text-xs text-text-muted hover:text-missing underline disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Undoing…' : 'Undo resolve'}
        </button>
        {error && <span className="text-xs text-missing">{error}</span>}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-resolved text-resolved rounded hover:bg-resolved hover:text-white transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        Mark Resolved
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-display text-lg font-semibold text-text-primary mb-1">
              Mark as Resolved
            </h3>
            <p className="text-sm text-text-muted mb-4">
              Explain how this {targetType === 'evidence' ? 'evidence item' : 'question'} has been addressed.
            </p>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Confirmed in the 2024 self-study document, page 12."
              rows={4}
              className="w-full border border-border rounded-lg p-3 text-sm text-text-primary resize-none focus:outline-none focus:ring-2 focus:ring-resolved/50 focus:border-resolved"
            />

            {error && (
              <p className="text-xs text-missing mt-2">{error}</p>
            )}

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowModal(false); setNote(''); setError(null); }}
                className="px-4 py-2 text-sm text-text-secondary border border-border rounded-lg hover:border-accent hover:text-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResolve}
                disabled={isSubmitting || !note.trim()}
                className="px-4 py-2 text-sm font-medium bg-resolved text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isSubmitting ? 'Saving…' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
