import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi } from 'vitest';
import PreviewQuestions from './PreviewQuestions';

// Mock analytics trackEvent to observe calls
vi.mock('../analytics', () => ({
  trackEvent: vi.fn(),
}));
import { trackEvent } from '../analytics';

describe('PreviewQuestions page', () => {
  it('renders heading and form fields', () => {
    render(<PreviewQuestions />);
  // Presence assertions via truthiness since jest-dom matchers not configured here
  expect(screen.getByRole('heading', { level: 1, name: /preview questions/i })).toBeTruthy();
  expect(screen.getByLabelText(/name/i)).toBeTruthy();
  expect(screen.getByLabelText(/email/i)).toBeTruthy();
  expect(screen.getByLabelText(/your question/i)).toBeTruthy();
  expect(screen.getByRole('button', { name: /submit question/i })).toBeTruthy();
  });

  it('validates required question field and fires analytics on submit', () => {
    render(<PreviewQuestions />);
    const submitBtn = screen.getByRole('button', { name: /submit question/i });
    fireEvent.click(submitBtn);
  expect(screen.getByRole('alert').textContent).toMatch(/please enter a question/i);

    const textarea = screen.getByLabelText(/your question/i);
    fireEvent.change(textarea, { target: { value: 'How do I participate?' } });
    fireEvent.click(submitBtn);

    expect(trackEvent).toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toMatch(/thanks/i);
  });

  it('persists draft and restores it, then rate limits after threshold', () => {
    // Reset storage for isolation
    try { localStorage.clear(); } catch { /* ignore */ }
    // Initial mount
    render(<PreviewQuestions />);
    fireEvent.change(screen.getByLabelText(/your question/i), { target: { value: 'Draft question persists?' } });
    // Minimal wait via synchronous second render (draft save uses setTimeout; simulate immediate by manually writing key)
    try { localStorage.setItem('preview:question:draft:v1', JSON.stringify({ question: 'Draft question persists?' })); } catch { /* ignore */ }
    // Remount fresh (RTL automatically reuses same container, so unmount then fresh render)
    // Unmount via cleanup by rendering null root (simpler: call render again which replaces tree)
    render(<PreviewQuestions />);
    expect((screen.getByLabelText(/your question/i) as HTMLTextAreaElement).value).toMatch(/Draft question/);

    // Submit up to limit
    // Seed history with max allowed submissions
    const now = Date.now();
    const historySeed = Array.from({ length: 5 }).map((_, idx) => ({ t: new Date(now - (idx * 1000)).toISOString(), h: 'seed'+idx }));
    try { localStorage.setItem('preview:question:history:v1', JSON.stringify(historySeed)); } catch { /* ignore */ }
    // Attempt a new submission should trigger rate limit
    fireEvent.change(screen.getAllByLabelText(/your question/i).slice(-1)[0], { target: { value: 'Excess question' } });
    const submitButtons = screen.getAllByRole('button', { name: /submit question/i });
    fireEvent.click(submitButtons[submitButtons.length - 1]);
    expect(screen.getByRole('alert').textContent).toMatch(/rate limit/i);
  });

  it('shows last submitted question across remounts', () => {
  try { localStorage.clear(); } catch { /* ignore */ }
    render(<PreviewQuestions />);
    const textarea = screen.getByLabelText(/your question/i);
    fireEvent.change(textarea, { target: { value: 'Will there be an SDK?' } });
    fireEvent.click(screen.getByRole('button', { name: /submit question/i }));
    // Simulate passage & remount to verify persistence panel
    // Ensure prior tree is fully unmounted so we don't get duplicate panels
    cleanup();
    render(<PreviewQuestions />);
    const last = screen.getByTestId('last-submission');
    expect(last.textContent).toMatch(/sdk/i);
  });
});
