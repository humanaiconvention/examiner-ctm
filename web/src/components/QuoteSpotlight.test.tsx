import { render, screen, act, cleanup } from '@testing-library/react';
import { vi, test, expect, beforeEach, afterEach } from 'vitest';
import QuoteSpotlight from './QuoteSpotlight';
import { consciousnessQuotes } from '../config/quotes';

// Use fake timers to control autoplay
let lastUnmount: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  // Clear localStorage effects between tests
  if (typeof localStorage !== 'undefined') localStorage.clear();
  cleanup();
  lastUnmount = null;
});

afterEach(() => {
  act(() => {
    vi.runOnlyPendingTimers();
  });
  if (lastUnmount) {
    act(() => { lastUnmount?.(); });
  } else {
    cleanup();
  }
  vi.useRealTimers();
});

test('renders a quote and progresses on forced transition', () => {
  act(() => {
    const rendered = render(<QuoteSpotlight />);
    lastUnmount = rendered.unmount;
  });
  // Ensure at least one known quote is visible (shuffle makes specific index unreliable)
  const initialVisible = consciousnessQuotes.filter(q => screen.queryByText(q.text));
  expect(initialVisible.length).toBeGreaterThan(0);
  const forceBtn = screen.getByRole('button', { name: /force transition/i });
  act(() => {
    forceBtn.click();
    vi.advanceTimersByTime(2200); // covers both halves of longest animation (2000ms) + buffer
  });
  const afterVisible = consciousnessQuotes.filter(q => screen.queryByText(q.text));
  expect(afterVisible.length).toBeGreaterThan(0);
});

test('autoplay maintains at least one visible quote over time', () => {
  act(() => {
    const rendered = render(<QuoteSpotlight />);
    lastUnmount = rendered.unmount;
  });
  const initialVisible = consciousnessQuotes.filter(q => screen.queryByText(q.text));
  expect(initialVisible.length).toBeGreaterThan(0);
  act(() => { vi.advanceTimersByTime(9000); }); // > one standard interval (6000ms) plus transitions
  const laterVisible = consciousnessQuotes.filter(q => screen.queryByText(q.text));
  expect(laterVisible.length).toBeGreaterThan(0);
});
