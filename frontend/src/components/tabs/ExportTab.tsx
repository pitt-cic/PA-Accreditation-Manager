import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { fillDocumentApi, type FillDocumentJob, type FillDocumentTemplate } from '../../api/fillDocument';
import { useAuditYear } from '../../contexts/AuditYearContext';

interface TemplateCardState {
  jobId: string | null;
  job: FillDocumentJob | null;
  loading: boolean;
  error: string | null;
}

export function ExportTab() {
  const { selectedYear } = useAuditYear();

  const [templates, setTemplates] = useState<FillDocumentTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [cardStates, setCardStates] = useState<Record<string, TemplateCardState>>({});
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const [templateSectionExpanded, setTemplateSectionExpanded] = useState(true);

  useEffect(() => {
    fillDocumentApi
      .listTemplates()
      .then((res) => setTemplates(res.templates))
      .catch(() => setTemplatesError('Failed to load templates'))
      .finally(() => setTemplatesLoading(false));

    return () => {
      Object.values(pollRefs.current).forEach(clearInterval);
    };
  }, []);

function startPolling(templateKey: string, jobId: string) {
    pollRefs.current[templateKey] = setInterval(async () => {
      try {
        const job = await fillDocumentApi.getJobStatus(jobId);
        setCardStates((prev) => ({
          ...prev,
          [templateKey]: { ...prev[templateKey], job },
        }));
        if (job.status === 'complete' || job.status === 'error') {
          clearInterval(pollRefs.current[templateKey]);
          delete pollRefs.current[templateKey];
          setCardStates((prev) => ({
            ...prev,
            [templateKey]: { ...prev[templateKey], loading: false },
          }));
        }
      } catch {
        // keep polling on transient errors
      }
    }, 5000);
  }

  async function handleExport(template: FillDocumentTemplate) {
    setCardStates((prev) => ({
      ...prev,
      [template.key]: { jobId: null, job: null, loading: true, error: null },
    }));
    try {
      const { job_id } = await fillDocumentApi.startExport(template.key, template.standard_prefix, selectedYear);
      setCardStates((prev) => ({
        ...prev,
        [template.key]: { jobId: job_id, job: null, loading: true, error: null },
      }));
      startPolling(template.key, job_id);
    } catch (err) {
      let message = 'Failed to start export';
      if (err instanceof ApiError && err.data && typeof err.data === 'object' && 'error' in err.data) {
        message = String((err.data as { error: string }).error);
      }
      setCardStates((prev) => ({
        ...prev,
        [template.key]: { jobId: null, job: null, loading: false, error: message },
      }));
    }
  }


  function renderTemplateSection() {
    if (templatesLoading) {
      return (
        <div className="flex items-center justify-center py-16 text-[#64748b] text-sm">
          Loading templates…
        </div>
      );
    }
    if (templatesError) {
      return (
        <div className="py-8 text-center text-sm" style={{ color: '#dc2626' }}>
          {templatesError}
        </div>
      );
    }
    if (templates.length === 0) {
      return (
        <div className="py-8 text-center text-sm text-[#64748b]">
          No templates found. Upload xlsx templates to the <code>templates/</code> folder in S3.
        </div>
      );
    }
    return (
      <>
        <button
          onClick={() => setTemplateSectionExpanded(!templateSectionExpanded)}
          className="w-full text-left mb-5"
        >
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#64748b] flex items-center gap-2">
            <svg
              className="w-4 h-4 transition-transform"
              style={{ transform: templateSectionExpanded ? 'rotate(90deg)' : 'none' }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Export Templates
            <span className="flex-1 border-t border-[#e2e8f0]" />
            <span className="text-xs font-normal">({templates.length})</span>
          </h2>
        </button>
        {templateSectionExpanded && (
          <>
            <p className="mb-4 text-sm text-[#64748b]">
              Select a template to generate a filled xlsx report using your accreditation evidence.
            </p>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {templates.map((template) => {
                const state = cardStates[template.key];
                const isRunning = state?.loading || (state?.job && (state.job.status === 'pending' || state.job.status === 'running'));
                const isDone = state?.job?.status === 'complete';
                const isFailed = state?.job?.status === 'error' || !!state?.error;
                return (
                  <div
                    key={template.key}
                    className="rounded-lg border p-5 flex flex-col gap-3"
                    style={{ borderColor: '#e2e8f0', background: '#fff' }}
                  >
                    <div>
                      <div className="text-sm font-semibold text-[#1a2c4e]">{template.name}</div>
                      <div className="text-xs text-[#64748b] mt-0.5">Standard {template.standard_prefix}</div>
                    </div>
                    {!state && (
                      <button
                        onClick={() => handleExport(template)}
                        className="mt-auto px-4 py-2 rounded text-sm font-medium text-white transition-colors"
                        style={{ background: '#2563eb' }}
                      >
                        Export
                      </button>
                    )}
                    {isRunning && (
                      <div className="mt-auto flex items-center gap-2 text-sm text-[#64748b]">
                        <Spinner />
                        {state?.job?.status === 'running' ? 'Filling document…' : 'Starting…'}
                      </div>
                    )}
                    {isDone && state?.job?.presigned_url && (
                      <a
                        href={state.job.presigned_url}
                        download
                        className="mt-auto inline-block px-4 py-2 rounded text-sm font-medium text-center text-white"
                        style={{ background: '#16a34a', textDecoration: 'none' }}
                      >
                        Download
                      </a>
                    )}
                    {isDone && !state?.job?.presigned_url && (
                      <div className="mt-auto text-sm text-[#16a34a] font-medium">Complete</div>
                    )}
                    {isFailed && (
                      <div className="mt-auto text-sm" style={{ color: '#dc2626' }}>
                        {state?.job?.error || state?.error || 'Export failed'}
                      </div>
                    )}
                    {(isDone || isFailed) && (
                      <button
                        onClick={() => {
                          if (pollRefs.current[template.key]) {
                            clearInterval(pollRefs.current[template.key]);
                            delete pollRefs.current[template.key];
                          }
                          setCardStates((prev) => {
                            const next = { ...prev };
                            delete next[template.key];
                            return next;
                          });
                        }}
                        className="text-xs text-[#64748b] underline text-left"
                        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Export again
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div>
      {/* Read-only banner — frozen year mode */}
      {selectedYear !== null && (
        <div
          className="mb-6 flex items-center gap-3 rounded-lg border px-5 py-3"
          style={{ borderColor: '#bfdbfe', background: '#eff6ff' }}
        >
          <span className="text-sm font-medium" style={{ color: '#1d4ed8' }}>
            Viewing frozen snapshot:
          </span>
          <span
            className="text-sm font-semibold px-2 py-0.5 rounded"
            style={{ background: '#dbeafe', color: '#1e40af' }}
          >
            {selectedYear}
          </span>
          <span className="text-xs text-[#64748b]">— editing is disabled in frozen mode</span>
        </div>
      )}

      {renderTemplateSection()}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
