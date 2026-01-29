import React from 'react';
// Use static exported logo.svg instead of programmatic LogoHumanAI in the hero

export type HeroLogoLayout = 'stacked' | 'horizontal-left' | 'horizontal-right';

interface HeroLogoWordmarkProps {
  layout?: HeroLogoLayout;
  align?: 'start' | 'center';
  gapScale?: number;          // multiplier for logo <-> wordmark gap
  logoScale?: number;         // multiplier relative to 140px base (horizontal) or previous stacked size
  lineGapScale?: number;      // multiplier for gap between primary and secondary wordmark lines
  showConvention?: boolean;   // allow hiding second line
  className?: string;
  logoVariant?: 'mono-light' | 'mono-dark' | 'accent';
  /** Respect prefers-reduced-motion; if false always animate */
  respectReducedMotion?: boolean;
  /** Provide custom accessible label; default "HumanAI Convention" */
  ariaLabel?: string;
  /** Breakpoint (px) below which horizontal variants auto-convert to stacked. Disabled if undefined. */
  autoStackBreakpoint?: number;
  /** When true, clamp logo width to a viewport-relative max (e.g., 46vw) on very small screens. */
  allowDynamicScaling?: boolean;
}

/**
 * Composite hero logo + wordmark with variant layouts and adjustable spacing via CSS variables.
 * Uses CSS variables to minimize DOM changes and allow runtime tuning / theming.
 */
const HeroLogoWordmark: React.FC<HeroLogoWordmarkProps> = ({
  layout = 'stacked',
  align = 'center',
  gapScale = 1,
  logoScale = 1,
  lineGapScale = 1,
  showConvention = true,
  className = '',
  // logoVariant intentionally removed: static asset used
  respectReducedMotion = true,
  ariaLabel = 'HumanAI Convention',
  autoStackBreakpoint,
  allowDynamicScaling = true
}) => {
  const [isAutoStacked, setIsAutoStacked] = React.useState(false);
  React.useEffect(() => {
    if (!autoStackBreakpoint || layout === 'stacked') { setIsAutoStacked(false); return; }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') { setIsAutoStacked(false); return; }
    const mq = window.matchMedia(`(max-width: ${autoStackBreakpoint}px)`);
    const apply = () => setIsAutoStacked(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [autoStackBreakpoint, layout]);

  const rootClasses = [
    'hero-logo',
    `hero-logo--${isAutoStacked ? 'stacked' : layout}`,
    align === 'center' ? 'hero-logo--align-center' : 'hero-logo--align-start',
    respectReducedMotion ? 'hero-logo--respect-rm' : 'hero-logo--force-animate',
    isAutoStacked ? 'hero-logo--auto-stacked' : '',
    className
  ].filter(Boolean).join(' ');

  // Clamp scales to sane bounds
  const clampedGap = Math.max(0.4, Math.min(3, gapScale));
  const clampedLogo = Math.max(0.4, Math.min(2.2, logoScale));
  const clampedLineGap = Math.max(0.3, Math.min(3, lineGapScale));

  // Base sizes: horizontal logo width baseline 140px; stacked previous large mark 560px.
  const effectiveLayout = isAutoStacked ? 'stacked' : layout;
  const baseLogoWidth = effectiveLayout === 'stacked' ? 560 : 140;
  const computedLogoWidth = baseLogoWidth * clampedLogo;

  const style: React.CSSProperties = {
    // CSS custom properties for spacing/scales
    ['--hero-logo-gap' as string]: `${clampedGap}rem`,
    ['--hero-logo-width' as string]: `${computedLogoWidth}px`,
    ['--hero-wordmark-line-gap' as string]: `${0.15 * clampedLineGap}rem`
  };

  if (allowDynamicScaling && effectiveLayout !== 'stacked') {
    // Let width never exceed 48vw on very narrow screens (soft cap) while keeping explicit px for baseline.
    style.maxWidth = 'min(var(--hero-logo-width), 48vw)';
  }

  return (
  <div className={rootClasses} style={style} aria-hidden={false} aria-label={`${ariaLabel} logo mark and wordmark`}>
      <div className="hero-logo__mark">
        {/* Use static exported SVG so the exact wordmark (Human AI / Convention) is preserved as a single asset */}
        <img
          src="/logo.svg"
          alt={ariaLabel}
          className={`hero__logo hero__logo--v3 ${layout !== 'stacked' ? 'hero__logo--scaled' : ''}`}
          width={computedLogoWidth}
        />
      </div>
      {/* The SVG already contains the embedded wordmark; keep the structure for accessibility fallbacks */}
  <div className="hero-logo__wordmark visually-hidden" aria-hidden="true" role="presentation">
        <div className="hero-logo__line hero-logo__line--primary">
          <span className="wordmark-human">Human</span>
          <span className="wordmark-ai">AI</span>
        </div>
        {showConvention && (
          <div className="hero-logo__line hero-logo__line--secondary">
            <span className="wordmark-convention">Convention</span>
          </div>
        )}
      </div>
      <p className="visually-hidden" id="hero-desc-alt">HumanAI Convention – A public, verifiable framework for human–AI knowledge collaboration.</p>
    </div>
  );
};

export default HeroLogoWordmark;
