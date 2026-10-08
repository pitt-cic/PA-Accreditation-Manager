import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { auditApi } from '../api/audit';
import { useAuth } from '../hooks/useAuth';

interface AuditYearContextValue {
  selectedYear: string | null;
  frozenYears: string[];
  isLoadingYears: boolean;
  setSelectedYear: (year: string | null) => void;
  refreshYears: () => Promise<void>;
}

const AuditYearContext = createContext<AuditYearContextValue>({
  selectedYear: null,
  frozenYears: [],
  isLoadingYears: false,
  setSelectedYear: () => {},
  refreshYears: async () => {},
});

const SELECTED_YEAR_KEY = 'arcpa-selected-audit-year';

export function AuditYearProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [frozenYears, setFrozenYears] = useState<string[]>([]);
  const [isLoadingYears, setIsLoadingYears] = useState(true);

  // Read selectedYear from URL (primary source) or sessionStorage (fallback)
  const selectedYear = (() => {
    const urlYear = searchParams.get('audit_year');
    if (urlYear) {
      // Validate against frozenYears if available
      if (frozenYears.length > 0 && !frozenYears.includes(urlYear)) {
        return null;
      }
      return urlYear;
    }
    // Fallback to sessionStorage for backward compatibility
    const storedYear = sessionStorage.getItem(SELECTED_YEAR_KEY);
    if (storedYear && frozenYears.length > 0 && !frozenYears.includes(storedYear)) {
      return null;
    }
    return storedYear || null;
  })();

  const setSelectedYear = useCallback(
    (year: string | null) => {
      // Update URL as primary storage
      setSearchParams(
        (prev) => {
          const newParams = new URLSearchParams(prev);
          if (year) {
            newParams.set('audit_year', year);
          } else {
            newParams.delete('audit_year');
          }
          return newParams;
        },
        { replace: true }
      );

      // Also persist to sessionStorage for backward compatibility
      if (year) {
        sessionStorage.setItem(SELECTED_YEAR_KEY, year);
      } else {
        sessionStorage.removeItem(SELECTED_YEAR_KEY);
      }
    },
    [setSearchParams]
  );

  const refreshYears = useCallback(
    async () => {
      setIsLoadingYears(true);
      try {
        const { years } = await auditApi.getYears();
        setFrozenYears(years);

        // Validate URL year against available years
        // Use functional update to read current searchParams without dependency
        setSearchParams(
          (prev) => {
            const urlYear = prev.get('audit_year');
            if (urlYear && !years.includes(urlYear)) {
              const newParams = new URLSearchParams(prev);
              newParams.delete('audit_year');
              return newParams;
            }
            return prev;
          },
          { replace: true }
        );

        // Also validate and clean up sessionStorage
        const stored = sessionStorage.getItem(SELECTED_YEAR_KEY);
        if (stored && !years.includes(stored)) {
          sessionStorage.removeItem(SELECTED_YEAR_KEY);
        }
      } catch (error) {
        console.error('Failed to refresh audit years', error);
        // Header still renders without year selector
      } finally {
        setIsLoadingYears(false);
      }
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) {
      refreshYears();
    } else {
      setIsLoadingYears(false);
    }
  }, [authLoading, isAuthenticated, refreshYears]);

  return (
    <AuditYearContext.Provider value={{ selectedYear, frozenYears, isLoadingYears, setSelectedYear, refreshYears }}>
      {children}
    </AuditYearContext.Provider>
  );
}

export function useAuditYear() {
  return useContext(AuditYearContext);
}
