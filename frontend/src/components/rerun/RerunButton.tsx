import { useState } from 'react';
import { standardsApi } from '../../api/standards';
import { useToast } from '../../contexts/ToastContext';

interface RerunButtonProps {
  scope: string; // standard ID, e.g. "B2.02a"
  label?: string;
  size?: 'sm' | 'md';
  onSuccess?: () => void;
}

export function RerunButton({ scope, label, size = 'md', onSuccess }: RerunButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  const handleRun = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await standardsApi.mapStandard(scope);
      showToast('Standard mapping queued — check back in a few minutes', 'success');
      onSuccess?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to queue mapping', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs gap-1' : 'px-3 py-1.5 text-sm gap-1.5';

  return (
    <button
      onClick={handleRun}
      disabled={isLoading}
      className={`
        inline-flex items-center font-medium rounded-md border
        border-accent text-accent bg-white
        hover:bg-accent hover:text-white
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors ${sizeClasses}
      `}
    >
      {isLoading ? (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )}
      {label || 'Run Mapping'}
    </button>
  );
}
