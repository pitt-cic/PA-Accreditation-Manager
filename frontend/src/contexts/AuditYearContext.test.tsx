import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuditYearProvider, useAuditYear } from './AuditYearContext';
import { auditApi } from '../api/audit';
import type { ReactNode } from 'react';

vi.mock('../api/audit', () => ({
  auditApi: {
    getYears: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    userAttributes: { email: 'test@example.com' },
  }),
}));


describe('AuditYearContext - URL as single source of truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  const createWrapper = (initialUrl: string = '/') => {
    return ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="*" element={<AuditYearProvider>{children}</AuditYearProvider>} />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Reading selectedYear from URL', () => {
    it('should read selectedYear from audit_year URL parameter', async () => {
      vi.mocked(auditApi.getYears).mockResolvedValue({ years: ['2025', '2024'] });

      const { result } = renderHook(() => useAuditYear(), {
        wrapper: createWrapper('/?audit_year=2025'),
      });

      await waitFor(() => {
        expect(result.current.isLoadingYears).toBe(false);
      });

      expect(result.current.selectedYear).toBe('2025');
    });

    it('should default to null when no audit_year in URL', async () => {
      vi.mocked(auditApi.getYears).mockResolvedValue({ years: ['2025', '2024'] });

      const { result } = renderHook(() => useAuditYear(), {
        wrapper: createWrapper('/'),
      });

      await waitFor(() => {
        expect(result.current.isLoadingYears).toBe(false);
      });

      expect(result.current.selectedYear).toBeNull();
    });

    it('should validate selectedYear against frozenYears and default to null if invalid', async () => {
      vi.mocked(auditApi.getYears).mockResolvedValue({ years: ['2025', '2024'] });

      const { result } = renderHook(() => useAuditYear(), {
        wrapper: createWrapper('/?audit_year=2099'),
      });

      await waitFor(() => {
        expect(result.current.isLoadingYears).toBe(false);
      });

      // Invalid year should be treated as null (live mode)
      expect(result.current.selectedYear).toBeNull();
    });
  });

  describe('Edge case: no frozen years available', () => {
    it('should handle empty frozenYears list gracefully', async () => {
      vi.mocked(auditApi.getYears).mockResolvedValue({ years: [] });

      const { result } = renderHook(() => useAuditYear(), {
        wrapper: createWrapper('/?audit_year=2025'),
      });

      await waitFor(() => {
        expect(result.current.isLoadingYears).toBe(false);
      });

      // Should default to null when no frozen years exist
      expect(result.current.selectedYear).toBeNull();
      expect(result.current.frozenYears).toEqual([]);
    });

    it('should default to null when frozenYears is empty and no URL param', async () => {
      vi.mocked(auditApi.getYears).mockResolvedValue({ years: [] });

      const { result } = renderHook(() => useAuditYear(), {
        wrapper: createWrapper('/'),
      });

      await waitFor(() => {
        expect(result.current.isLoadingYears).toBe(false);
      });

      expect(result.current.selectedYear).toBeNull();
      expect(result.current.frozenYears).toEqual([]);
    });
  });

  describe('setSelectedYear updates URL', () => {
    it('should update URL when setSelectedYear is called', async () => {
      vi.mocked(auditApi.getYears).mockResolvedValue({ years: ['2025', '2024'] });

      const { result } = renderHook(() => useAuditYear(), {
        wrapper: createWrapper('/'),
      });

      await waitFor(() => {
        expect(result.current.isLoadingYears).toBe(false);
      });

      expect(result.current.selectedYear).toBeNull();

      // Actually call setSelectedYear and verify the year is updated
      result.current.setSelectedYear('2025');

      await waitFor(() => {
        expect(result.current.selectedYear).toBe('2025');
      });
    });

    it('should remove audit_year from URL when set to null', async () => {
      vi.mocked(auditApi.getYears).mockResolvedValue({ years: ['2025', '2024'] });

      const { result } = renderHook(() => useAuditYear(), {
        wrapper: createWrapper('/?audit_year=2025'),
      });

      await waitFor(() => {
        expect(result.current.isLoadingYears).toBe(false);
      });

      expect(result.current.selectedYear).toBe('2025');

      // Actually call setSelectedYear(null) and verify the year is cleared
      result.current.setSelectedYear(null);

      await waitFor(() => {
        expect(result.current.selectedYear).toBeNull();
      });
    });
  });

  describe('Backward compatibility with sessionStorage', () => {
    it('should fall back to sessionStorage when URL has no audit_year (migration path)', async () => {
      vi.mocked(auditApi.getYears).mockResolvedValue({ years: ['2025', '2024'] });
      sessionStorage.setItem('arcpa-selected-audit-year', '2024');

      const { result } = renderHook(() => useAuditYear(), {
        wrapper: createWrapper('/'),
      });

      await waitFor(() => {
        expect(result.current.isLoadingYears).toBe(false);
      });

      // Should read from sessionStorage as fallback
      expect(result.current.selectedYear).toBe('2024');
    });

    it('should prefer URL over sessionStorage when both exist', async () => {
      vi.mocked(auditApi.getYears).mockResolvedValue({ years: ['2025', '2024'] });
      sessionStorage.setItem('arcpa-selected-audit-year', '2024');

      const { result } = renderHook(() => useAuditYear(), {
        wrapper: createWrapper('/?audit_year=2025'),
      });

      await waitFor(() => {
        expect(result.current.isLoadingYears).toBe(false);
      });

      // URL should take precedence
      expect(result.current.selectedYear).toBe('2025');
    });
  });

  describe('frozenYears loading', () => {
    it('should load frozenYears from API', async () => {
      vi.mocked(auditApi.getYears).mockResolvedValue({ years: ['2025', '2024', '2023'] });

      const { result } = renderHook(() => useAuditYear(), {
        wrapper: createWrapper('/'),
      });

      await waitFor(() => {
        expect(result.current.isLoadingYears).toBe(false);
      });

      expect(result.current.frozenYears).toEqual(['2025', '2024', '2023']);
    });

    it('should handle API errors gracefully', async () => {
      vi.mocked(auditApi.getYears).mockRejectedValue(new Error('API Error'));

      const { result } = renderHook(() => useAuditYear(), {
        wrapper: createWrapper('/'),
      });

      await waitFor(() => {
        expect(result.current.isLoadingYears).toBe(false);
      });

      expect(result.current.frozenYears).toEqual([]);
      expect(result.current.selectedYear).toBeNull();
    });
  });
});
