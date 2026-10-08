import { useEffect, useRef, useState } from 'react';
import { UserMenu } from '../UserMenu';
import { useAuditYear } from '../../contexts/AuditYearContext';
import { auditApi } from '../../api/audit';

export type TabId = 'overview' | 'standards' | 'courses' | 'competencies' | 'goals' | 'search';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'standards', label: 'Standards' },
  { id: 'courses', label: 'Courses' },
  { id: 'competencies', label: 'Competencies' },
  { id: 'goals', label: 'Programme Goals' },
  { id: 'search', label: 'Curriculum Search' },
];

interface AppShellProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: React.ReactNode;
}

function ChevronDown() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 ml-auto flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

type FreezeResult = {
  year: string;
  frozen_count: number;
  purged_standards_count: number;
  courses_count: number;
  goals_count: number;
  competencies_count: number;
  comments_count: number;
  attachments_count: number;
};

function AddNewYearModal({ onClose }: { onClose: () => void }) {
  const { setSelectedYear, refreshYears } = useAuditYear();
  const [yearInput, setYearInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FreezeResult | null>(null);

  async function handleCreate() {
    const year = yearInput.trim();
    if (!year) return;
    setLoading(true);
    setError(null);
    try {
      const data = await auditApi.freezeYear(year);
      await refreshYears();
      setSelectedYear(year);
      setResult(data);
    } catch (err) {
      let message = 'Failed to create year';
      const apiData = (err as { data?: { error?: string } } | null)?.data;
      if (apiData?.error) {
        message = String(apiData.error);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add new audit year"
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-xl shadow-2xl p-6"
        style={{ background: '#1a2c4e', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
      >
        {result ? (
          <>
            <h2 className="text-lg font-semibold mb-3">
              {result.year} created
            </h2>
            <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {result.frozen_count} standards frozen
            </p>
            <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {result.purged_standards_count} standard mappings cleared
            </p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 rounded text-sm font-medium text-white"
              style={{ background: '#2563eb' }}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-1">Add New Year</h2>
            <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Standard mappings will be cleared for the new year. Courses, goals, and competencies are preserved.
            </p>
            <input
              type="text"
              placeholder="e.g. 2025-2026"
              value={yearInput}
              onChange={(e) => { setYearInput(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && yearInput.trim() && !loading) handleCreate(); }}
              disabled={loading}
              className="w-full px-3 py-2 rounded text-sm text-[#1a2c4e] focus:outline-none mb-3"
              style={{ background: '#fff' }}
            />
            {error && (
              <p className="mb-3 text-xs" style={{ color: '#fca5a5' }}>{error}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={loading || !yearInput.trim()}
                className="flex-1 px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50"
                style={{ background: '#2563eb' }}
              >
                {loading ? 'Creating…' : 'Create Year'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AuditYearSelector() {
  const { selectedYear, frozenYears, setSelectedYear } = useAuditYear();
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const isLiveMode = selectedYear === null;
  const triggerLabel = selectedYear ?? 'Current';

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          data-testid="year-selector"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center gap-1.5 text-sm font-medium rounded-md px-3 py-1.5 focus:outline-none"
          style={{
            background: 'rgba(255,255,255,0.1)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <span>{triggerLabel}</span>
          <ChevronDown />
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-1 w-56 rounded-lg shadow-xl z-50 overflow-hidden"
            style={{ background: '#1a2c4e', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <div role="listbox" aria-label="Audit year" className="py-1">
              <button
                role="option"
                aria-selected={isLiveMode}
                onClick={() => { setSelectedYear(null); setOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-white/10 transition-colors text-left"
                style={{ color: '#fff', background: 'transparent' }}
              >
                <span className="flex-1">Current</span>
                {isLiveMode && <CheckIcon />}
              </button>

              {frozenYears.map((year) => (
                <button
                  key={year}
                  role="option"
                  aria-selected={selectedYear === year}
                  onClick={() => { setSelectedYear(year); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-white/10 transition-colors text-left"
                  style={{ color: '#fff', background: 'transparent' }}
                >
                  <span className="flex-1">{year}</span>
                  {selectedYear === year && <CheckIcon />}
                </button>
              ))}
            </div>

            <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />

            <div className="py-1">
              {isLiveMode ? (
                <button
                  onClick={() => { setOpen(false); setModalOpen(true); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-white/10 transition-colors text-left"
                  style={{ color: 'rgba(255,255,255,0.75)', background: 'transparent' }}
                >
                  Add New Year
                </button>
              ) : (
                <button
                  disabled
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left cursor-not-allowed"
                  style={{ color: 'rgba(255,255,255,0.35)', background: 'transparent' }}
                >
                  Add New Year
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {modalOpen && <AddNewYearModal onClose={() => setModalOpen(false)} />}
    </>
  );
}

export function AppShell({ activeTab, onTabChange, children }: AppShellProps) {
  const { isLoadingYears } = useAuditYear();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f0f4f8' }}>
      {/* Sticky gradient header */}
      <header
        className="sticky top-0 z-50"
        style={{
          background: 'linear-gradient(135deg, #1a2c4e 0%, #1e3a6e 100%)',
          borderBottom: '3px solid #2563eb',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,.10), 0 4px 6px -4px rgba(0,0,0,.06)',
        }}
      >
        <div className="max-w-[1280px] mx-auto px-6">
          {/* Top bar: brand + user */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center text-white font-bold text-sm"
                style={{
                  width: 38,
                  height: 38,
                  background: '#2563eb',
                  borderRadius: 8,
                  flexShrink: 0,
                }}
              >
                PA
              </div>
              <div>
                <p className="text-white font-semibold text-base leading-tight" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                  PA Accreditation Manager
                </p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  6th Edition Standards Compliance
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isLoadingYears ? (
                <div className="animate-pulse bg-white/20 rounded h-8 w-32" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    Audit Year
                  </span>
                  <AuditYearSelector />
                </div>
              )}
              <UserMenu />
            </div>
          </div>

          {/* Tab navigation */}
          <nav className="flex gap-1 -mb-px">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  data-testid={`${tab.id}-tab`}
                  onClick={() => onTabChange(tab.id)}
                  className="px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none"
                  style={{
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                    borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                    background: 'none',
                    borderRadius: '4px 4px 0 0',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-[1280px] mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
