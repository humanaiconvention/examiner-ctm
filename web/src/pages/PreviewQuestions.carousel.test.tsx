import { render, screen, fireEvent, act } from '@testing-library/react';
import PreviewQuestions from './PreviewQuestions';
import { vi } from 'vitest';

// Use modern timers to simulate auto-advance.
vi.useFakeTimers();

describe('PreviewQuestions carousel (non-submitting)', () => {
  it('renders first question then auto-rotates to second after interval', () => {
    render(<PreviewQuestions />);
    const first = screen.getByRole('heading', { level: 2, name: /collaborate/i });
    expect(first.closest('.preview-questions__slide')?.getAttribute('aria-hidden')).toBe('false');
    act(() => { vi.advanceTimersByTime(6600); });
    // After rotation, the visible active slide heading text should now match second question text
    const activeHeading = screen.getByRole('heading', { level: 2, name: /what happens next/i });
    expect(activeHeading.closest('.preview-questions__slide')?.getAttribute('aria-hidden')).toBe('false');
  });

  it('skip button advances immediately', () => {
    render(<PreviewQuestions />);
    const skip = screen.getByRole('button', { name: /skip/i });
    const first = screen.getByRole('heading', { level: 2, name: /collaborate/i });
    fireEvent.click(skip);
    expect(first.closest('.preview-questions__slide')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('answer bubble toggles panel', () => {
    render(<PreviewQuestions />);
    const bubble = screen.getByRole('button', { name: /answer here/i });
    fireEvent.click(bubble);
    expect(screen.getByRole('dialog', { name: /answer placeholder/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog', { name: /answer placeholder/i })).toBeNull();
  });
});
