// src/components/rerun/ReevaluateSection.tsx
import { useState, useEffect } from 'react';
import { filesApi } from '../../api/files';
import { standardsApi } from '../../api/standards';
import { useToast } from '../../contexts/ToastContext';
import type { S3File, CommentTargetType } from '../../types/evidence';

interface ReevaluateSectionProps {
  standardId: string;
  targetType: CommentTargetType;
  targetIndex: number;
  //currentVersion: number; future proposed change to track versions for attached files and runs
  onReevaluationStarted: () => void;
}

export function ReevaluateSection({ 
  standardId, 
  targetType,
  targetIndex, 
  // currentVersion, Future proposed change to track versions for attached files and runs
  onReevaluationStarted 
}: ReevaluateSectionProps) {
  const [files, setFiles] = useState<S3File[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [justification, setJustification] = useState('');
  const [triggerReanalysis, setTriggerReanalysis] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    // Only load files when the user explicitly opens this section
    if (!isExpanded) return;
    
    async function loadFiles() {
      try {
        setIsLoadingFiles(true);
        const response = await filesApi.getAll();
        setFiles(response.files);
      } catch (err) {
        showToast('Failed to load available documents', 'error');
      } finally {
        setIsLoadingFiles(false);
      }
    }
    loadFiles();
  }, [isExpanded, showToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!justification.trim() || !selectedFile || isSubmitting) return;

    setIsSubmitting(true);
    
    const fullCommentText = `[Attached Document: ${selectedFile}]\n\n${justification.trim()}`;

    try {
      await standardsApi.addComment(
        standardId,
        targetType,
        targetIndex,
        fullCommentText,
        /* Future proposed change
        {
          trigger_reevaluation: triggerReanalysis,
          version: currentVersion,
          attached_files: [selectedFile]
        }
          */
      );

      if (triggerReanalysis) {
        showToast('Document appended. Re-analysis started.', 'success');
      } else {
        showToast('Document note added successfully.', 'success');
      }

      // Always refresh to show the new comment
      onReevaluationStarted();

      setJustification('');
      setSelectedFile('');
      setTriggerReanalysis(false);
      setIsExpanded(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to trigger re-evaluation', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isExpanded) {
    return (
      <div className="pt-2 border-t border-border">
        <button
          onClick={() => setIsExpanded(true)}
          className="text-xs font-semibold text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Append Document Note
        </button>
      </div>
    );
  }

  return (
    <div className="border border-accent/20 bg-white rounded-lg p-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Append Document for AI
        </h3>
        <button 
          onClick={() => setIsExpanded(false)}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="text-xs text-text-secondary mb-3">
        Select an existing document and instruct the AI on where to look for this specific requirement.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            disabled={isLoadingFiles || isSubmitting}
            className="w-full border border-border rounded p-2 text-xs text-text-primary bg-white focus:outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="">{isLoadingFiles ? 'Loading files...' : '-- Select a file --'}</option>
            {files.map((file) => (
              <option key={file.key} value={file.name}>
                {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </option>
            ))}
          </select>
        </div>

        <div>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="e.g., 'Check page 43, it details the clinical hours for this item.'"
            rows={2}
            disabled={isSubmitting}
            className="w-full border border-border rounded p-2 text-xs text-text-primary resize-none focus:outline-none focus:border-accent disabled:opacity-50"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={triggerReanalysis}
              onChange={(e) => setTriggerReanalysis(e.target.checked)}
              disabled={isSubmitting}
              className="w-3.5 h-3.5 text-accent border-border rounded focus:ring-accent focus:ring-offset-0"
            />
            <span>Trigger re-analysis after appending</span>
          </label>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={!selectedFile || !justification.trim() || isSubmitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-accent rounded hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Saving...' : triggerReanalysis ? 'Append & Reanalyze' : 'Append Note'}
          </button>
        </div>
      </form>
    </div>
  );
}