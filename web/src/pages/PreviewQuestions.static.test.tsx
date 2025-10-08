import { render, screen } from '@testing-library/react';
import PreviewQuestions from './PreviewQuestions';

// New static page test ensuring two curated questions render and no form elements exist.

describe('Static PreviewQuestions page', () => {
  beforeEach(() => {
    // @ts-expect-error: test global for static mode
    window.__PREVIEW_QUESTIONS_STATIC__ = true;
  });
  afterEach(() => {
    // @ts-expect-error: cleanup test global
    delete window.__PREVIEW_QUESTIONS_STATIC__;
  });

  it('renders heading and the two static questions', () => {
    render(<PreviewQuestions />);
    expect(screen.getByRole('heading', { level: 1, name: /preview/i })).toBeTruthy();
    const items = screen.getAllByRole('heading', { level: 2 });
    // Expect two H2 question headings
    expect(items.length).toBe(2);
    expect(items[0].textContent?.toLowerCase()).toContain('collaborate');
    expect(items[1].textContent?.toLowerCase()).toContain('next');
  });

  it('has no submission form controls', () => {
    render(<PreviewQuestions />);
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull();
    expect(screen.queryByLabelText(/your question/i)).toBeNull();
  });
});
