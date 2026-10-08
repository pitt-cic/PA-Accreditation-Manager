import { useState } from 'react';
import { ApiError } from '../api/client';
import { auditApi } from '../api/audit';
import type { StandardItem } from '../types/evidence';

interface AmendStandardModalProps {
  isOpen: boolean;
  standard: StandardItem | null;
  auditYear: string;
  onClose: () => void;
  onAmendSuccess: (standardId: string) => void;
}

export function AmendStandardModal({
  isOpen,
  standard,
  auditYear,
  onClose,
  onAmendSuccess,
}: AmendStandardModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !standard) return null;

  function handleClose() {
    setReason('');
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    if (!reason.trim() || !standard) return;
    setLoading(true);
    setError(null);
    try {
      await auditApi.amendStandard(auditYear, standard.standard_id, reason.trim());
      onAmendSuccess(standard.standard_id);
      handleClose();
    } catch (err) {
      let message = 'Failed to amend standard';
      if (err instanceof ApiError && err.data && typeof err.data === 'object' && 'error' in err.data) {
        message = String((err.data as { error: string }).error);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="rounded-lg border p-6 max-w-md w-full mx-4"
        style={{ background: '#fff', borderColor: '#e2e8f0' }}
      >
        <h3 className="text-lg font-semibold text-[#1a2c4e] mb-3">
          Amend Frozen Standard
        </h3>
        <div className="mb-4 p-3 rounded" style={{ background: '#fef3c7' }}>
          <p className="text-sm text-[#92400e] font-medium mb-1">
            ⚠️ Warning
          </p>
          <p className="text-sm text-[#92400e]">
            Unlocking this standard will create an audit trail entry. You must provide a reason for this amendment.
          </p>
        </div>
        <div className="mb-2">
          <div className="text-sm font-medium text-[#1a2c4e] mb-1">Standard</div>
          <div className="text-sm text-[#64748b]">{standard.standard_id}</div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-[#1a2c4e] mb-2">
            Reason for amendment <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(null); }}
            placeholder="Explain why this standard needs to be amended..."
            rows={4}
            className="w-full px-3 py-2 rounded-md text-sm border focus:outline-none"
            style={{
              borderColor: error ? '#fca5a5' : '#cbd5e1',
              background: '#f8fafc',
            }}
          />
        </div>
        {error && (
          <p className="mb-3 text-sm" style={{ color: '#dc2626' }}>{error}</p>
        )}
        <div className="flex gap-3 justify-end">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 rounded text-sm font-medium transition-colors"
            style={{ background: '#f1f5f9', color: '#475569' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            className="px-4 py-2 rounded text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: '#f59e0b' }}
          >
            {loading ? 'Unlocking…' : 'Unlock Standard'}
          </button>
        </div>
      </div>
    </div>
  );
}
