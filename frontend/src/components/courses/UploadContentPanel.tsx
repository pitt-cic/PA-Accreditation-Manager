import { useRef, useState } from 'react';
import { coursesProcessingApi } from '../../api/courses';
import { useToast } from '../../contexts/ToastContext';

interface UploadedFile {
  id: string;
  file: File;
  s3Key: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

interface UploadContentPanelProps {
  onComplete: () => void;
}

export function UploadContentPanel({ onComplete }: UploadContentPanelProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const handleRemove = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const uploadFile = async (file: File) => {
    const id = crypto.randomUUID();
    setUploadedFiles(prev => [...prev, { id, file, s3Key: '', status: 'uploading' }]);

    try {
      const contentType = file.type || 'application/octet-stream';
      const { upload_url, s3_key } = await coursesProcessingApi.getUploadUrl(
        file.name,
        contentType,
      );
      await coursesProcessingApi.uploadToS3(upload_url, file, contentType);
      setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, s3Key: s3_key, status: 'done' } : f));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: msg } : f));
      showToast(`Failed to upload ${file.name}: ${msg}`, 'error');
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleProcess = async () => {
    const doneKeys = uploadedFiles.filter(f => f.status === 'done').map(f => f.s3Key);
    if (!doneKeys.length) return;

    setIsStarting(true);
    try {
      await coursesProcessingApi.startProcessing(doneKeys);
      onComplete();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start processing', 'error');
    } finally {
      setIsStarting(false);
    }
  };

  const doneCount = uploadedFiles.filter(f => f.status === 'done').length;
  const uploadingCount = uploadedFiles.filter(f => f.status === 'uploading').length;
  const canProcess = doneCount > 0 && !isStarting;

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-[#f1f5f9]" style={{ background: 'linear-gradient(135deg, #1a2c4e 0%, #1e3a6e 100%)' }}>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Upload Program Content
        </p>
        <p className="text-sm font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.9)' }}>
          Drop syllabi and assessments — the system classifies and processes them automatically
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Drop zone */}
        <div
          className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors"
          style={{
            borderColor: isDragging ? '#2563eb' : '#e2e8f0',
            background: isDragging ? '#eff6ff' : '#f8fafc',
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <svg className="w-8 h-8 mx-auto mb-2 text-[#94a3b8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm font-medium text-[#475569]">Drop PDFs here or click to browse</p>
          <p className="text-[11px] text-[#94a3b8] mt-1">Syllabi and assessment documents</p>
        </div>

        {/* File list */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-1.5">
            {uploadedFiles.map((f) => (
              <div key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
                <svg className="w-4 h-4 text-[#94a3b8] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="flex-1 text-xs text-[#475569] truncate">{f.file.name}</span>
                {f.status === 'uploading' && (
                  <span className="text-[10px] text-[#1d4ed8] font-medium">uploading…</span>
                )}
                {f.status === 'done' && (
                  <span className="text-[10px] text-[#16a34a] font-bold">✓</span>
                )}
                {f.status === 'error' && (
                  <span className="text-[10px] text-[#dc2626] font-medium" title={f.error}>✗ error</span>
                )}
                {f.status !== 'uploading' && (
                  <button
                    onClick={() => handleRemove(f.id)}
                    className="text-[#94a3b8] hover:text-red-500 transition-colors p-1 -mr-1"
                    title="Remove"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Process button */}
        <button
          onClick={handleProcess}
          disabled={!canProcess || uploadingCount > 0}
          className="w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: canProcess && uploadingCount === 0 ? '#2563eb' : '#94a3b8' }}
        >
          {isStarting ? 'Starting…' : uploadingCount > 0 ? `Uploading ${uploadingCount} file${uploadingCount !== 1 ? 's' : ''}…` : `Process ${doneCount} file${doneCount !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
