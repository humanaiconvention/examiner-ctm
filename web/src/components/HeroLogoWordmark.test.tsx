import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import HeroLogoWordmark from './HeroLogoWordmark';

describe('HeroLogoWordmark', () => {
  it('renders horizontal-left layout classes', () => {
    const { container } = render(<HeroLogoWordmark layout="horizontal-left" />);
    const root = container.querySelector('.hero-logo');
    expect(root).toBeTruthy();
    expect(root?.classList.contains('hero-logo--horizontal-left')).toBe(true);
  });

  it('applies stacked layout', () => {
    const { container } = render(<HeroLogoWordmark layout="stacked" />);
    const root = container.querySelector('.hero-logo');
    expect(root?.classList.contains('hero-logo--stacked')).toBe(true);
  });

  it('respects custom scaling props', () => {
    const { container } = render(<HeroLogoWordmark layout="horizontal-right" gapScale={2} logoScale={1.5} lineGapScale={2} />);
    const root = container.querySelector('.hero-logo') as HTMLElement;
    expect(root.style.getPropertyValue('--hero-logo-gap')).toContain('rem');
    expect(root.style.getPropertyValue('--hero-logo-width')).toContain('px');
  });

  it('auto stacks below breakpoint', () => {
    const original = window.matchMedia;
    const mockList: MediaQueryList = {
      matches: true,
      media: '(max-width: 1200px)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true
    } as MediaQueryList;
    Object.defineProperty(window, 'matchMedia', { value: () => mockList, configurable: true });
    const { container } = render(<HeroLogoWordmark layout="horizontal-left" autoStackBreakpoint={1200} />);
    const root = container.querySelector('.hero-logo');
    expect(root?.classList.contains('hero-logo--stacked')).toBe(true);
    Object.defineProperty(window, 'matchMedia', { value: original, configurable: true });
  });
});
