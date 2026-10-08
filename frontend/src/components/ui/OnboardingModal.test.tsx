import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnboardingModal } from './OnboardingModal';
import { standardsApi } from '../../api/standards';

vi.mock('../../api/standards', () => ({
  standardsApi: {
    uploadGoals: vi.fn(),
    uploadCompetencies: vi.fn(),
  },
}));

describe('OnboardingModal PDF Validation', () => {
  const mockOnClose = vi.fn();
  const mockOnNavigateTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Goals file validation', () => {
    it('should reject non-PDF files with error message for goals', async () => {
      const { container } = render(<OnboardingModal onClose={mockOnClose} onNavigateTab={mockOnNavigateTab} />);

      // Navigate to step 1 (Goals upload)
      fireEvent.click(screen.getByText('Next'));

      // Create a non-PDF file (e.g., a text file)
      const nonPdfFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

      // Trigger file selection
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [nonPdfFile],
          configurable: true,
        });
        fireEvent.change(fileInput);
      }

      // Wait for error message to appear
      await waitFor(() => {
        expect(screen.getByText('Please upload a PDF file')).toBeInTheDocument();
      });

      // Verify API was never called
      expect(standardsApi.uploadGoals).not.toHaveBeenCalled();
    });

    it('should accept PDF files and call API for goals', async () => {
      const mockResult = { message: 'Goals uploaded successfully' };
      vi.mocked(standardsApi.uploadGoals).mockResolvedValueOnce(mockResult);

      const { container } = render(<OnboardingModal onClose={mockOnClose} onNavigateTab={mockOnNavigateTab} />);

      // Navigate to step 1 (Goals upload)
      fireEvent.click(screen.getByText('Next'));

      // Create a PDF file
      const pdfFile = new File(['pdf content'], 'goals.pdf', { type: 'application/pdf' });
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

      // Trigger file selection
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [pdfFile],
          configurable: true,
        });
        fireEvent.change(fileInput);
      }

      // Wait for API call
      await waitFor(() => {
        expect(standardsApi.uploadGoals).toHaveBeenCalledWith(pdfFile);
      });

      // Verify success message
      await waitFor(() => {
        expect(screen.getByText('Goals uploaded successfully')).toBeInTheDocument();
      });
    });
  });

  describe('Competencies file validation', () => {
    it('should reject non-PDF files with error message for competencies', async () => {
      const { container } = render(<OnboardingModal onClose={mockOnClose} onNavigateTab={mockOnNavigateTab} />);

      // Navigate to step 2 (Competencies upload)
      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));

      // Create a non-PDF file (e.g., a DOCX file)
      const nonPdfFile = new File(['test content'], 'competencies.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const fileInputs = container.querySelectorAll('input[type="file"]');
      const fileInput = fileInputs[0] as HTMLInputElement;

      // Trigger file selection
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [nonPdfFile],
          configurable: true,
        });
        fireEvent.change(fileInput);
      }

      // Wait for error message to appear
      await waitFor(() => {
        expect(screen.getByText('Please upload a PDF file')).toBeInTheDocument();
      });

      // Verify API was never called
      expect(standardsApi.uploadCompetencies).not.toHaveBeenCalled();
    });

    it('should accept PDF files and call API for competencies', async () => {
      const mockResult = { message: 'Competencies uploaded successfully' };
      vi.mocked(standardsApi.uploadCompetencies).mockResolvedValueOnce(mockResult);

      const { container } = render(<OnboardingModal onClose={mockOnClose} onNavigateTab={mockOnNavigateTab} />);

      // Navigate to step 2 (Competencies upload)
      fireEvent.click(screen.getByText('Next'));
      fireEvent.click(screen.getByText('Next'));

      // Create a PDF file
      const pdfFile = new File(['pdf content'], 'competencies.pdf', { type: 'application/pdf' });
      const fileInputs = container.querySelectorAll('input[type="file"]');
      const fileInput = fileInputs[0] as HTMLInputElement;

      // Trigger file selection
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [pdfFile],
          configurable: true,
        });
        fireEvent.change(fileInput);
      }

      // Wait for API call
      await waitFor(() => {
        expect(standardsApi.uploadCompetencies).toHaveBeenCalledWith(pdfFile);
      });

      // Verify success message
      await waitFor(() => {
        expect(screen.getByText('Competencies uploaded successfully')).toBeInTheDocument();
      });
    });
  });

  describe('Edge cases', () => {
    it('should reject files with empty type string', async () => {
      const { container } = render(<OnboardingModal onClose={mockOnClose} onNavigateTab={mockOnNavigateTab} />);

      // Navigate to step 1 (Goals upload)
      fireEvent.click(screen.getByText('Next'));

      // Create a file with empty type (simulating bypassed file picker)
      const fileWithEmptyType = new File(['content'], 'file.pdf', { type: '' });
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [fileWithEmptyType],
          configurable: true,
        });
        fireEvent.change(fileInput);
      }

      // Should show error since type is not 'application/pdf'
      await waitFor(() => {
        expect(screen.getByText('Please upload a PDF file')).toBeInTheDocument();
      });

      expect(standardsApi.uploadGoals).not.toHaveBeenCalled();
    });

    it('should validate file type before any API call', async () => {
      const { container } = render(<OnboardingModal onClose={mockOnClose} onNavigateTab={mockOnNavigateTab} />);

      // Navigate to step 1 (Goals upload)
      fireEvent.click(screen.getByText('Next'));

      // Create a non-PDF file
      const nonPdfFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [nonPdfFile],
          configurable: true,
        });
        fireEvent.change(fileInput);
      }

      // Error should appear immediately without any API call
      await waitFor(() => {
        expect(screen.getByText('Please upload a PDF file')).toBeInTheDocument();
      });

      // Verify API was never called
      expect(standardsApi.uploadGoals).not.toHaveBeenCalled();
    });
  });
});
