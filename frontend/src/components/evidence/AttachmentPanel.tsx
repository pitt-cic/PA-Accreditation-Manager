import { useState } from 'react';
import { standardsApi } from '../../api/standards';
import type { ReviewAttachment } from '../../types/evidence';
import { AttachFileModal } from './AttachFileModal';

interface AttachmentPanelProps {
  standardId: string;
  targetType: 'standard' | 'linked_ee';
  targetPath?: string;
  attachments: ReviewAttachment[];
  onUpdate: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPanel({
  standardId, targetType, targetPath, attachments, onUpdate,
}: AttachmentPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (attachmentId: string) => {
    setDeletingId(attachmentId);
    setError(null);
    try {
      await standardsApi.deleteAttachment(standardId, attachmentId);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {/* File list */}
      {attachments.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {attachments.map((att) => (
            <div
              key={att.attachment_id}
              className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-[#e2e8f0] bg-[#f8fafc]"
            >
              <svg className="w-4 h-4 text-[#2563eb] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#1e293b] truncate">{att.file_name}</p>
                <p className="text-[10px] text-[#94a3b8]">
                  {att.file_size > 0 ? `${formatBytes(att.file_size)} · ` : ''}{att.uploader} · {new Date(att.uploaded_at).toLocaleDateString()}
                </p>
                {att.note && (
                  <p className="text-[11px] text-[#475569] mt-0.5 italic">"{att.note}"</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(att.attachment_id)}
                disabled={deletingId === att.attachment_id}
                className="text-[#94a3b8] hover:text-[#dc2626] transition-colors disabled:opacity-40 flex-shrink-0"
                title="Remove attachment"
              >
                {deletingId === att.attachment_id ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-[#dc2626] mb-2">{error}</p>}

      {/* Attach button */}
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#2563eb] text-[#2563eb] rounded-lg hover:bg-[#2563eb] hover:text-white transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
        </svg>
        Attach File
      </button>

      {modalOpen && (
        <AttachFileModal
          standardId={standardId}
          targetType={targetType}
          targetPath={targetPath}
          existingAttachments={attachments}
          onClose={() => setModalOpen(false)}
          onAttached={() => { setModalOpen(false); onUpdate(); }}
        />
      )}
    </>
  );
}
