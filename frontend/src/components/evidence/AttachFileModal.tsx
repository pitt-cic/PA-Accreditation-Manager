import { useEffect, useRef, useState } from 'react';
import { filesApi } from '../../api/files';
import { standardsApi } from '../../api/standards';
import type { ReviewAttachment, S3File } from '../../types/evidence';

interface AttachFileModalProps {
  standardId: string;
  targetType: 'standard' | 'linked_ee';
  targetPath?: string;
  existingAttachments: ReviewAttachment[];
  onClose: () => void;
  onAttached: () => void;
}

type Tab = 'upload' | 'store';
type FileCategory = 'all' | 'syllabus' | 'assessment' | 'other';

const ACCEPTED_TYPES = '.pdf,.txt,.html,.htm,.md,.csv,.png,.jpg,.jpeg';
const MAX_MB = 50;

const MIME_BY_EXT: Record<string, string> = {
  pdf:  'application/pdf',
  txt:  'text/plain',
  html: 'text/html',
  htm:  'text/html',
  md:   'text/markdown',
  csv:  'text/csv',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
};

function mimeFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categorize(file: S3File): FileCategory {
  const name = file.name.toLowerCase();
  if (name.includes('syllabus') || name.includes('syll')) return 'syllabus';
  if (name.includes('assessment') || name.includes('assess') || name.includes('exam') || name.includes('quiz')) return 'assessment';
  return 'other';
}

const CATEGORY_LABELS: Record<FileCategory, string> = {
  all: 'All', syllabus: 'Syllabi', assessment: 'Assessments', other: 'Other',
};

const CAT_COLORS: Record<FileCategory, { bg: string; text: string }> = {
  syllabus:   { bg: '#dbeafe', text: '#1d4ed8' },
  assessment: { bg: '#fef3c7', text: '#d97706' },
  other:      { bg: '#f1f5f9', text: '#64748b' },
  all:        { bg: '#f1f5f9', text: '#64748b' },
};

export function AttachFileModal({
  standardId, targetType, targetPath, existingAttachments, onClose, onAttached,
}: AttachFileModalProps) {
  const alreadyAttachedKeys = new Set(existingAttachments.map((a) => a.s3_key));
  const [tab, setTab] = useState<Tab>('store');
  const [note, setNote] = useState('');

  // Upload tab
  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Store tab
  const [files, setFiles] = useState<S3File[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FileCategory>('all');

  // Selection state — keys of selected files
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    filesApi.getAll()
      .then((res) => setFiles(res.files))
      .catch(() => setFilesError('Could not load file store.'))
      .finally(() => setFilesLoading(false));
  }, []);

  const filteredFiles = files.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || categorize(f) === category;
    return matchesSearch && matchesCategory;
  });

  const counts: Record<FileCategory, number> = {
    all: files.length,
    syllabus: files.filter((f) => categorize(f) === 'syllabus').length,
    assessment: files.filter((f) => categorize(f) === 'assessment').length,
    other: files.filter((f) => categorize(f) === 'other').length,
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const selectedFiles = files.filter((f) => selected.has(f.key));

  const handleConfirmAttach = async () => {
    if (selected.size === 0) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      for (const file of selectedFiles) {
        await standardsApi.postAttachment(standardId, {
          file_name: file.name,
          file_size: file.size,
          content_type: mimeFromFilename(file.name),
          target_type: targetType,
          target_path: targetPath,
          note: note.trim() || undefined,
          existing_s3_key: file.key,
        });
      }
      onAttached();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to attach files.');
      setIsSubmitting(false);
    }
  };

  const doUpload = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`File exceeds ${MAX_MB} MB limit.`);
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    try {
      // Derive content type from filename so the presigned URL and the PUT
      // header match exactly — S3 rejects the upload if they differ.
      const contentType = mimeFromFilename(file.name);
      const { attachment_id, upload_url } = await standardsApi.postAttachment(standardId, {
        file_name: file.name,
        file_size: file.size,
        content_type: contentType,
        target_type: targetType,
        target_path: targetPath,
        note: note.trim() || undefined,
      });
      await standardsApi.uploadFileToS3(upload_url!, file, contentType);
      await standardsApi.confirmAttachment(standardId, attachment_id);
      onAttached();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (file) doUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) doUpload(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <p className="text-sm font-semibold text-[#1e293b]">Attach Supporting File</p>
            <p className="text-xs text-[#94a3b8]">
              {targetType === 'linked_ee' && targetPath ? `Evidence item ${targetPath}` : 'Standard level'}
            </p>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#475569] transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#e2e8f0] px-5 flex-shrink-0">
          {([['store', 'From File Store'], ['upload', 'Upload New File']] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); setSelected(new Set()); setSubmitError(null); }}
              className="px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none mr-2"
              style={{
                color: tab === id ? '#1a2c4e' : '#64748b',
                borderBottom: tab === id ? '2px solid #2563eb' : '2px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Shared note field */}
        <div className="px-5 pt-4 flex-shrink-0">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note for this attachment (optional)…"
            className="w-full px-3 py-2 text-xs border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-[#2563eb]"
          />
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">

          {/* ── From File Store ── */}
          {tab === 'store' && (
            <div className="space-y-4">

              {/* Selected files — shown at top when anything is chosen */}
              {selectedFiles.length > 0 && (
                <div className="rounded-xl border-2 border-[#2563eb] overflow-hidden" style={{ background: '#f0f6ff' }}>
                  <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid #bfdbfe' }}>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-[#2563eb]">
                      To be attached ({selectedFiles.length})
                    </p>
                    <button
                      onClick={() => setSelected(new Set())}
                      className="text-[11px] text-[#94a3b8] hover:text-[#dc2626] transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="p-2 space-y-1">
                    {selectedFiles.map((f) => (
                      <div key={f.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-[#bfdbfe]">
                        <svg className="w-3.5 h-3.5 text-[#2563eb] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <p className="text-xs text-[#1e293b] flex-1 truncate">{f.name}</p>
                        <p className="text-[10px] text-[#94a3b8] flex-shrink-0">{formatBytes(f.size)}</p>
                        <button
                          onClick={() => toggleSelect(f.key)}
                          className="text-[#94a3b8] hover:text-[#dc2626] transition-colors flex-shrink-0"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search and filter */}
              <div>
                <div className="relative mb-2.5">
                  <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search files…"
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#e2e8f0] rounded-lg focus:outline-none focus:border-[#2563eb]"
                  />
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  {(Object.keys(CATEGORY_LABELS) as FileCategory[]).map((cat) => (
                    (counts[cat] > 0 || cat === 'all') ? (
                      <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors"
                        style={{
                          background: category === cat ? '#1a2c4e' : '#f1f5f9',
                          color:      category === cat ? '#fff'     : '#64748b',
                        }}
                      >
                        {CATEGORY_LABELS[cat]}
                        <span className="ml-1 opacity-70">{counts[cat]}</span>
                      </button>
                    ) : null
                  ))}
                </div>
              </div>

              {/* File list */}
              {filesLoading ? (
                <div className="text-center py-8 text-xs text-[#94a3b8]">Loading file store…</div>
              ) : filesError ? (
                <div className="text-center py-8 text-xs text-[#dc2626]">{filesError}</div>
              ) : filteredFiles.length === 0 ? (
                <div className="text-center py-8 text-xs text-[#94a3b8]">
                  {search ? 'No files match your search.' : 'No files in this category.'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredFiles.map((file) => {
                    const cat = categorize(file);
                    const isSelected = selected.has(file.key);
                    const isAlreadyAttached = alreadyAttachedKeys.has(file.key);
                    return (
                      <button
                        key={file.key}
                        onClick={() => !isAlreadyAttached && toggleSelect(file.key)}
                        disabled={isAlreadyAttached}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 transition-all text-left"
                        style={{
                          borderColor: isAlreadyAttached ? '#e2e8f0' : isSelected ? '#2563eb' : '#e2e8f0',
                          background:  isAlreadyAttached ? '#f8fafc'  : isSelected ? '#eff6ff' : '#fff',
                          opacity:     isAlreadyAttached ? 0.6 : 1,
                          cursor:      isAlreadyAttached ? 'not-allowed' : 'pointer',
                        }}
                        title={isAlreadyAttached ? 'Already attached to this standard' : undefined}
                      >
                        {/* Checkbox / already-attached indicator */}
                        {isAlreadyAttached ? (
                          <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center" style={{ background: '#dcfce7', border: '2px solid #86efac' }}>
                            <svg className="w-2.5 h-2.5 text-[#16a34a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        ) : (
                          <div
                            className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center transition-colors"
                            style={{
                              background: isSelected ? '#2563eb' : '#fff',
                              border:     isSelected ? '2px solid #2563eb' : '2px solid #cbd5e1',
                            }}
                          >
                            {isSelected && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        )}
                        <svg className="w-4 h-4 text-[#64748b] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#1e293b] truncate">{file.name}</p>
                          <p className="text-[10px] text-[#94a3b8]">
                            {isAlreadyAttached ? 'Already attached' : formatBytes(file.size)}
                          </p>
                        </div>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: CAT_COLORS[cat].bg, color: CAT_COLORS[cat].text }}
                        >
                          {CATEGORY_LABELS[cat]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Upload New ── */}
          {tab === 'upload' && (
            <div>
              {uploadError && <p className="text-xs text-[#dc2626] mb-3">{uploadError}</p>}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !isUploading && fileRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-colors py-10"
                style={{
                  borderColor: dragOver ? '#2563eb' : '#cbd5e1',
                  background:  dragOver ? '#eff6ff'  : '#f8fafc',
                }}
              >
                {isUploading ? (
                  <>
                    <svg className="w-8 h-8 animate-spin text-[#2563eb] mb-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-sm text-[#2563eb] font-medium">Uploading…</p>
                  </>
                ) : (
                  <>
                    <svg className="w-8 h-8 text-[#94a3b8] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <p className="text-sm font-medium text-[#475569]">Drop a file here, or click to browse</p>
                    <p className="text-xs text-[#94a3b8] mt-1">PDF, text, HTML, Markdown, CSV, images — up to {MAX_MB} MB</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept={ACCEPTED_TYPES} onChange={handleFileInput} className="hidden" />
            </div>
          )}
        </div>

        {/* ── Sticky footer — only shown on store tab when files are selected ── */}
        {tab === 'store' && (
          <div
            className="flex-shrink-0 px-5 py-4 flex flex-col gap-3"
            style={{ borderTop: '1px solid #e2e8f0', background: selected.size > 0 ? '#f8faff' : '#fff' }}
          >
            {/* Selected file chips */}
            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedFiles.map((f) => (
                  <div
                    key={f.key}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                    style={{ background: '#dbeafe', color: '#1d4ed8' }}
                  >
                    <span className="truncate max-w-[160px]">{f.name}</span>
                    <button
                      onClick={() => toggleSelect(f.key)}
                      className="flex-shrink-0 hover:text-[#dc2626] transition-colors ml-0.5"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {submitError && <p className="text-xs text-[#dc2626]">{submitError}</p>}

            <div className="flex items-center justify-between">
              <p className="text-xs text-[#94a3b8]">
                {selected.size === 0
                  ? 'Select files above to attach'
                  : `${selected.size} file${selected.size !== 1 ? 's' : ''} selected`}
              </p>
              <button
                onClick={handleConfirmAttach}
                disabled={selected.size === 0 || isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#2563eb' }}
              >
                {isSubmitting
                  ? 'Attaching…'
                  : selected.size === 0
                    ? 'Attach Files'
                    : `Attach ${selected.size} File${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
