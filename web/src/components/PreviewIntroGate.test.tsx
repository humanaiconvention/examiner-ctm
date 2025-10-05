import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import { axe } from 'jest-axe';
import PreviewIntroGate from './PreviewIntroGate';

vi.mock('../analytics', () => ({ trackEvent: vi.fn() }));
import { trackEvent } from '../analytics';

describe('PreviewIntroGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    try { localStorage.clear(); } catch { /* ignore */ }
    (trackEvent as unknown as ReturnType<typeof vi.fn>).mockClear();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('walks through dual prompt sequence and completes', () => {
    const onComplete = vi.fn();
    act(() => { render(<PreviewIntroGate onComplete={onComplete} />); });
    expect(screen.getByText(/what is consciousness/i)).toBeTruthy();
    // Advance past first question dwell + crossfade
    act(() => { vi.advanceTimersByTime(3000); }); // first visible (shortened)
    act(() => { vi.advanceTimersByTime(1000); }); // crossfade
    expect(screen.getByText(/how is it defined/i)).toBeTruthy();
    // CTA not yet
    expect(screen.queryByRole('button', { name: /answer here/i })).toBeNull();
    act(() => { vi.advanceTimersByTime(2500); }); // dwell before CTA
    const btn = screen.getByRole('button', { name: /answer here/i });
    act(() => { fireEvent.click(btn); vi.advanceTimersByTime(600); });
    expect(onComplete).toHaveBeenCalled();
    const calls = (trackEvent as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const completed = calls.find(c => c[0].action === 'intro_completed');
    expect(completed).toBeTruthy();
  });

  it('allows skipping immediately via Skip button analytics consolidated', async () => {
    const onComplete = vi.fn();
    await act(async () => { render(<PreviewIntroGate onComplete={onComplete} />); });
    const skip = screen.getByRole('button', { name: /skip intro and continue/i });
    await act(async () => { fireEvent.click(skip); });
    // allow exit fade
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(onComplete).toHaveBeenCalled();
    const calls = (trackEvent as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const stages = calls.map(c => c[0].metadata?.stage).filter(Boolean);
    expect(stages).toContain('skip_click');
  });

  it('has no basic axe-core violations including Skip button', async () => {
    // Switch to real timers for axe reliability then restore after
    vi.useRealTimers();
    const { container } = render(<PreviewIntroGate onComplete={() => {}} />);
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    // Disable color-contrast rule here for baseline
    const results = await axe(dialog || container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toHaveLength(0);
    expect(screen.getByRole('button', { name: /skip intro and continue/i })).toBeInTheDocument();
    vi.useFakeTimers();
  }, 15000);

  it('completes when pressing Enter on CTA', () => {
    const onComplete = vi.fn();
    act(() => { render(<PreviewIntroGate onComplete={onComplete} />); });
    act(() => { vi.advanceTimersByTime(3000 + 1000 + 2500); });
    expect(screen.getByRole('button', { name: /answer here/i })).toBeInTheDocument();
    act(() => { fireEvent.keyDown(window, { key: 'Enter' }); vi.advanceTimersByTime(600); });
    expect(onComplete).toHaveBeenCalled();
  });

  it('reduced motion mode shows CTA immediately', () => {
    const onComplete = vi.fn();
    // Mock matchMedia
    window.matchMedia = (query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => true });
    act(() => { render(<PreviewIntroGate onComplete={onComplete} />); });
    expect(screen.getByRole('button', { name: /answer here/i })).toBeInTheDocument();
    // Skip exists in DOM though retired (aria-hidden) – use getByLabelText which respects aria-hidden so fallback to querySelector
    const skipDom = document.querySelector('.preview-intro__skip');
    expect(skipDom).toBeTruthy();
  });

  it('axe (contrast-inclusive) has no violations except potential color-contrast', async () => {
    vi.useRealTimers();
    const { container } = render(<PreviewIntroGate onComplete={() => {}} />);
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const results = await axe(dialog || container);
    if (results.violations.length) {
      console.warn('Contrast-inclusive violations:', results.violations.map(v => v.id));
    }
    expect(results.violations.filter(v => v.id !== 'color-contrast')).toHaveLength(0);
    vi.useFakeTimers();
  }, 20000);

  it('emits abandon analytics when page hidden before completion', () => {
    const onComplete = vi.fn();
    act(() => { render(<PreviewIntroGate onComplete={onComplete} visibilityDebounceMs={0} />); });
    // Simulate hiding the document (before user completes)
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      // flush debounce timeout
      vi.advanceTimersByTime(1);
    });
    // Restore
    if (original) Object.defineProperty(document, 'visibilityState', original);
    const calls = (trackEvent as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const abandon = calls.find(c => c[0].metadata?.stage === 'abandon');
    expect(abandon).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('emits linger stage after 10s without action', () => {
    const onComplete = vi.fn();
    act(() => { render(<PreviewIntroGate onComplete={onComplete} lingerMs={50} />); });
    act(() => { vi.advanceTimersByTime(40); });
    let calls = (trackEvent as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.find(c => c[0].metadata?.stage === 'linger')).toBeFalsy();
    act(() => { vi.advanceTimersByTime(20); });
    calls = (trackEvent as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const linger = calls.find(c => c[0].metadata?.stage === 'linger');
    expect(linger).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
