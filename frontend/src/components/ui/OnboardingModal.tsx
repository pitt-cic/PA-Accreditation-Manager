import { useRef, useState } from 'react';
import { standardsApi } from '../../api/standards';
import type { TabId } from '../layout/AppShell';

interface OnboardingModalProps {
  onClose: () => void;
  onNavigateTab: (tab: TabId) => void;
}

interface UploadState {
  status: 'idle' | 'uploading' | 'done' | 'error';
  message: string;
}

const IDLE: UploadState = { status: 'idle', message: '' };

function UploadButton({
  uploadState,
  onTrigger,
  label,
}: {
  uploadState: UploadState;
  onTrigger: () => void;
  label: string;
}) {
  const { status, message } = uploadState;

  if (status === 'done') {
    return (
      <div className="flex items-center gap-2 mt-4">
        <span
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg"
          style={{ background: '#dcfce7', color: '#16a34a' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {message || 'Uploaded successfully'}
        </span>
        <button
          onClick={onTrigger}
          className="text-xs text-[#94a3b8] hover:text-[#64748b] underline transition-colors cursor-pointer"
        >
          Replace
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-1.5">
      <button
        onClick={onTrigger}
        disabled={status === 'uploading'}
        className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        style={{ color: '#1e293b' }}
      >
        {status === 'uploading' ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin text-[#64748b]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Uploading…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5 text-[#64748b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {label}
          </>
        )}
      </button>
      {status === 'error' && (
        <p className="text-xs" style={{ color: '#dc2626' }}>{uploadState.message || 'Upload failed. Please try again.'}</p>
      )}
    </div>
  );
}

export function OnboardingModal({ onClose, onNavigateTab }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [goalsUpload, setGoalsUpload] = useState<UploadState>(IDLE);
  const [competenciesUpload, setCompetenciesUpload] = useState<UploadState>(IDLE);
  const goalsFileRef = useRef<HTMLInputElement>(null);
  const competenciesFileRef = useRef<HTMLInputElement>(null);
  const isLast = step === 4;

  const handleGoalsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Validate file type
    if (file.type !== 'application/pdf') {
      setGoalsUpload({ status: 'error', message: 'Please upload a PDF file' });
      return;
    }

    setGoalsUpload({ status: 'uploading', message: '' });
    try {
      const result = await standardsApi.uploadGoals(file);
      setGoalsUpload({ status: 'done', message: result.message });
    } catch (err) {
      setGoalsUpload({ status: 'error', message: err instanceof Error ? err.message : 'Upload failed' });
    }
  };

  const handleCompetenciesFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Validate file type
    if (file.type !== 'application/pdf') {
      setCompetenciesUpload({ status: 'error', message: 'Please upload a PDF file' });
      return;
    }

    setCompetenciesUpload({ status: 'uploading', message: '' });
    try {
      const result = await standardsApi.uploadCompetencies(file);
      setCompetenciesUpload({ status: 'done', message: result.message });
    } catch (err) {
      setCompetenciesUpload({ status: 'error', message: err instanceof Error ? err.message : 'Upload failed' });
    }
  };

  const steps = [
    {
      icon: '👋',
      title: 'Welcome to PA Accreditation Manager',
      description:
        "This dashboard helps you track your program's compliance with ARC-PA standards. It maps your courses, competencies, and goals to accreditation requirements — and shows you exactly where you stand. This short walkthrough will get you set up in a few steps.",
      uploadContent: null,
      navLabel: null,
      navTab: null as TabId | null,
    },
    {
      icon: '🎯',
      title: 'Step 1 — Upload Program Goals',
      description:
        'Start by uploading your Program Goals as a PDF. These are the high-level outcomes your program aims to achieve. Goals form the foundation that everything else maps to — competencies and courses are linked against them.',
      uploadContent: (
        <>
          <input ref={goalsFileRef} type="file" accept=".pdf" className="hidden" onChange={handleGoalsFile} />
          <UploadButton
            uploadState={goalsUpload}
            onTrigger={() => goalsFileRef.current?.click()}
            label="Upload Goals PDF"
          />
        </>
      ),
      navLabel: 'Go to Program Goals',
      navTab: 'goals' as TabId,
    },
    {
      icon: '📋',
      title: 'Step 2 — Upload Competencies',
      description:
        'Next, upload your Competencies PDF. Competencies are the specific skills and knowledge areas students must demonstrate. Once uploaded, the system maps them to your program goals, courses, and standards.',
      uploadContent: (
        <>
          <input ref={competenciesFileRef} type="file" accept=".pdf" className="hidden" onChange={handleCompetenciesFile} />
          <UploadButton
            uploadState={competenciesUpload}
            onTrigger={() => competenciesFileRef.current?.click()}
            label="Upload Competencies PDF"
          />
        </>
      ),
      navLabel: 'Go to Competencies',
      navTab: 'competencies' as TabId,
    },
    {
      icon: '📚',
      title: 'Step 3 — Upload Courses',
      description:
        "Upload your course syllabi or content PDFs from the Courses tab. The system will analyze each course and map its learning outcomes to your goals, and competencies. Make sure Goals and Competencies are uploaded first — the Courses tab will guide you if they're missing. Once processing is complete, results will appear automatically in the Courses tab.",
      uploadContent: null,
      navLabel: 'Go to Courses',
      navTab: 'courses' as TabId,
    },
    {
      icon: '📊',
      title: 'Step 4 — Review Your Standards',
      description:
        "The Standards tab is where it all comes together. It lists all ARC-PA standards, each scored by readiness — Ready, Needs Work, or Not Ready. Once your courses are processed, you can run the workflow to map each standard, so you can see exactly where your program stands and what still needs attention.",
      uploadContent: null,
      navLabel: 'Go to Standards',
      navTab: 'standards' as TabId,
    },
  ];

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/40 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full animate-[slideUp_0.25s_ease-out]">

        {/* Body */}
        <div className="px-6 pt-7 pb-2">
          <div className="text-4xl mb-4">{current.icon}</div>
          <h2 className="font-display text-lg font-semibold text-[#1e293b] leading-snug mb-3">
            {current.title}
          </h2>
          <p className="text-sm text-[#475569] leading-relaxed">
            {current.description}
          </p>

          {/* Inline upload (steps 1 & 2 only) */}
          {current.uploadContent}

          {/* Tab navigation link */}
          {current.navLabel && current.navTab && (
            <button
              onClick={() => onNavigateTab(current.navTab!)}
              className="mt-3 flex items-center gap-1 text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8] underline underline-offset-2 transition-colors cursor-pointer"
            >
              {current.navLabel}
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 py-5">
          {steps.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-200"
              style={{
                width: i === step ? 20 : 8,
                height: 8,
                background: i === step ? '#2563eb' : i < step ? '#93c5fd' : '#e2e8f0',
              }}
            />
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-4 border-t border-[#f1f5f9]"
          style={{ background: '#f8fafc', borderRadius: '0 0 12px 12px' }}
        >
          <button
            onClick={onClose}
            className="text-sm text-[#94a3b8] hover:text-[#64748b] transition-colors cursor-pointer"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-3 py-1.5 text-sm font-medium text-[#475569] border border-[#e2e8f0] bg-white rounded-lg hover:bg-[#f1f5f9] transition-colors cursor-pointer"
              >
                Back
              </button>
            )}
            <button
              onClick={isLast ? onClose : () => setStep((s) => s + 1)}
              className="px-4 py-1.5 text-sm font-medium text-white rounded-lg transition-colors cursor-pointer"
              style={{ background: '#2563eb' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1d4ed8'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2563eb'; }}
            >
              {isLast ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
