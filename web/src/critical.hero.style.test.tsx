import { describe, it, expect, beforeEach, vi } from 'vitest';

// We'll simulate main entry behavior that injects the critical hero CSS. Instead of executing the full React app,
// we import main.tsx (which performs the injection) after setting up a root element.


describe('critical hero CSS injection', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body><div id="root"></div></body>';
    vi.resetModules();
  });

  it('adds a single style[data-critical="hero"] tag only once', async () => {
    await import('./main');
    const styles = document.querySelectorAll('style[data-critical="hero"]');
    expect(styles.length).toBe(1);
    const firstText = styles[0].textContent || '';
    // importing again should not duplicate
    await import('./main');
    const styles2 = document.querySelectorAll('style[data-critical="hero"]');
    expect(styles2.length).toBe(1);
    expect(styles2[0].textContent).toBe(firstText);
  });
});
