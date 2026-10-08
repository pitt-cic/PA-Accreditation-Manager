import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAuditYear } from '../contexts/AuditYearContext';
import { standardsApi } from '../api/standards';
import { LoadingOverlay } from '../components/ui/Spinner';
import { AppShell, type TabId } from '../components/layout/AppShell';
import { OverviewTab } from '../components/tabs/OverviewTab';
import { StandardsTab } from '../components/tabs/StandardsTab';
import { CoursesTab } from '../components/tabs/CoursesTab';
import { CompetenciesTab } from '../components/tabs/CompetenciesTab';
import { GoalsTab } from '../components/tabs/GoalsTab';
import { CurriculumSearchTab } from '../components/tabs/CurriculumSearchTab';
import { OnboardingModal } from '../components/ui/OnboardingModal';
import type { StandardItem } from '../types/evidence';

const VALID_TABS: TabId[] = ['overview', 'standards', 'courses', 'competencies', 'goals', 'search'];

// Inner component — must live inside AuditYearProvider to consume selectedYear.
function DashboardContent({
  activeTab,
  setActiveTab,
  selectedYear,
  userEmail,
}: {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  selectedYear: string | null;
  userEmail: string | null;
}) {
  const navigate = useNavigate();
  const [standards, setStandards] = useState<StandardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !userEmail || !localStorage.getItem(`arc-pa-onboarding-seen-${userEmail}`)
  );

  const fetchStandards = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      setError(null);
      const response = await standardsApi.getAll(selectedYear);
      setStandards(response.standards);
      return response.standards;
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load standards');
      return null;
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [selectedYear]);

  // Re-fetch whenever the selected year changes.
  useEffect(() => {
    setIsLoading(true);
    fetchStandards();
  }, [fetchStandards]);

  // Poll every 5 s while any standard is actively processing (live mode only).
  useEffect(() => {
    if (selectedYear !== null) return;
    const hasActive = standards.some(
      (s) => s.status === 'analyzing' || s.status === 'reevaluating'
    );
    if (!hasActive) return;

    const id = setInterval(() => { fetchStandards(true); }, 5000);
    return () => clearInterval(id);
  }, [standards, fetchStandards, selectedYear]);

  const handleStandardClick = (standardId: string) => {
    const path = `/standards/${standardId}`;
    if (selectedYear) {
      navigate(`${path}?audit_year=${encodeURIComponent(selectedYear)}`);
    } else {
      navigate(path);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0f4f8' }}>
        <LoadingOverlay message="Loading dashboard..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0f4f8' }}>
        <div className="bg-white rounded-xl border border-[#fca5a5] p-8 max-w-md text-center shadow-sm">
          <p className="text-[#dc2626] font-medium mb-4">{error}</p>
          <button
            onClick={() => fetchStandards()}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
            style={{ background: '#1a2c4e' }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const handleOnboardingClose = () => {
    if (userEmail) {
      localStorage.setItem(`arc-pa-onboarding-seen-${userEmail}`, '1');
    }
    setShowOnboarding(false);
  };

  return (
    <>
    {showOnboarding && (
      <OnboardingModal onClose={handleOnboardingClose} onNavigateTab={setActiveTab} />
    )}
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'overview' && (
        <OverviewTab standards={standards} onViewStandard={handleStandardClick} selectedYear={selectedYear} />
      )}
      {activeTab === 'standards' && (
        <StandardsTab standards={standards} onStandardClick={handleStandardClick} />
      )}
      {activeTab === 'courses' && (
        <CoursesTab standards={standards} onViewStandard={handleStandardClick} />
      )}
      {activeTab === 'competencies' && (
        <CompetenciesTab standards={standards} onViewStandard={handleStandardClick} />
      )}
      {activeTab === 'goals' && (
        <GoalsTab />
      )}
      {activeTab === 'search' && <CurriculumSearchTab />}
    </AppShell>
    </>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, isLoading: authLoading, getUserEmail } = useAuth();
  const { selectedYear } = useAuditYear();
  const userEmail = getUserEmail();

  const rawTab = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'overview';

  const setActiveTab = (tab: TabId) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set('tab', tab);
      // Sync audit_year with context state
      if (selectedYear) {
        newParams.set('audit_year', selectedYear);
      } else {
        newParams.delete('audit_year');
      }
      return newParams;
    }, { replace: true });
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) navigate('/login', { replace: true });
  }, [isAuthenticated, authLoading, navigate]);

  if (authLoading) return <LoadingOverlay message="Authenticating..." />;
  if (!isAuthenticated) return null;

  // AuditYearProvider now at App-level, so just render DashboardContent
  return <DashboardContent activeTab={activeTab} setActiveTab={setActiveTab} selectedYear={selectedYear} userEmail={userEmail} />;
}
