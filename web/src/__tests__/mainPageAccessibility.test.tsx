import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock noisy stateful components to avoid act() warnings unrelated to these layout/accessibility assertions.
vi.mock('../components/AuthBanner', () => ({ __esModule: true, default: () => null }));
vi.mock('../components/PasswordGate', () => ({ __esModule: true, default: (p: { children: React.ReactNode }) => <>{p.children}</> }));

// Basic smoke tests for new semantics & lazy behaviors.

describe('Main page accessibility & semantics', () => {
  beforeEach(() => {
    // Clear localStorage to ensure intro gating doesn't block hero
    try { localStorage.clear(); } catch {/* ignore */}
  });

  it('renders a banner hero with labelled heading', () => {
    render(<App />);
    const hero = screen.getByRole('banner');
    expect(hero).toBeTruthy();
  // Intro prelogo sequence may also render an H1; ensure hero heading is included.
  const h1s = screen.getAllByRole('heading', { level: 1 });
  const heroHeading = h1s.find(h => h.id === 'site-hero-heading');
  expect(heroHeading).toBeTruthy();
  });

  it('renders integrity KPIs as a definition list', () => {
    render(<App />);
    const integritySection = screen.getByRole('heading', { level: 2, name: /Transparency & Integrity/i }).closest('section');
    expect(integritySection).toBeTruthy();
    const dl = integritySection?.querySelector('dl.integrity-kpis');
    expect(dl).toBeTruthy();
    // Expect at least one dt/dd pair
    const dts = dl?.querySelectorAll('dt');
    const dds = dl?.querySelectorAll('dd');
    expect((dts?.length || 0) > 0).toBe(true);
    expect(dts?.length).toBe(dds?.length);
  });

  it('includes skeleton placeholders before integrity data loads', () => {
    render(<App />);
    const skeletons = document.querySelectorAll('.kpi-skel');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('has quote spotlight placeholder prior to lazy load', () => {
    render(<App />);
    const placeholder = screen.getByText(/Preparing perspectives/i);
    expect(placeholder).toBeTruthy();
  });
});
