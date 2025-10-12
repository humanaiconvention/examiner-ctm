// Deployment trigger: updating comment to publish full app over minimal placeholder
import { useEffect, useState, useRef } from 'react'
import React from 'react'
// Replaced single-question prelogo with dual-question intro gate
import PreviewIntroGate from './components/PreviewIntroGate'

import './App.css'
import './reveal.css'
import { fetchIntegrityData, formatBytes } from './utils/integrity'
import { PRIMARY_TAGLINE } from './config/taglines'
import HeroLogoWordmark from './components/HeroLogoWordmark'
import HeroLogoControls from './components/HeroLogoControls'
import StickyNav from './components/StickyNav'
import { trackEvent } from './analytics'
import VersionFooter from './components/VersionFooter'
import PasswordGate from './components/PasswordGate'
import AnalyticsConsentBanner from './components/AnalyticsConsentBanner'
import AnalyticsDebugOverlay from './components/AnalyticsDebugOverlay.tsx'
import { UpdateToast, BackgroundUpdateSnackbar } from './sw-updates'
import AuthBanner from './components/AuthBanner'

// Quotes moved to lazy component

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches)

    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)

    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  return prefersReducedMotion
}

// (Mission/Vision pillars relocated to /learn-more)



// Lazy heavy quote spotlight (defer hydration until user scrolls / interacts)
// (For now existing logic remains inline; future extraction could move quote block to its own component.)
function App() {
  // Pre-logo intro gating logic
  const INTRO_STORAGE_KEY = 'hq:introComplete'
  const disableIntro = Boolean(import.meta.env && import.meta.env.VITE_DISABLE_PREINTRO)
  const [introComplete, setIntroComplete] = useState(() => {
    if (disableIntro) return true
    try { return localStorage.getItem(INTRO_STORAGE_KEY) === 'true' } catch { return false }
  })
  const handleIntroComplete = () => {
    try { localStorage.setItem(INTRO_STORAGE_KEY, 'true') } catch { /* ignore */ }
    setIntroComplete(true)
    // Activate progressive reveal immediately
    try {
      document.body.classList.remove('intro-pending')
      // Always use slow reveal on completion (applies to refresh as requested)
      document.body.classList.add('reveal-slow')
      document.body.classList.add('reveal-ready')
      document.dispatchEvent(new Event('reveal:ready'))
    } catch { /* ignore */ }
  }
  const [integrity, setIntegrity] = useState<{ version?: string; commit?: string; attestedAt?: string; hashMatch?: boolean; sbomDrift?: number; assetBytes?: number; assetCount?: number }>(() => ({}))
  const integrityLoadedRef = useRef(false)
  const integrityHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const [shouldLoadQuotes, setShouldLoadQuotes] = useState(false)
  const quoteSectionRef = useRef<HTMLElement | null>(null)

  const prefersReducedMotion = usePrefersReducedMotion()

  // Dynamic hero configuration via query params
  interface HeroConfig { layout?: string; gapScale?: number; logoScale?: number; lineGapScale?: number; align?: string; autoStackBreakpoint?: number; }
  const heroConfig: HeroConfig = (() => {
    if (typeof window === 'undefined') return {};
    try {
      const sp = new URLSearchParams(window.location.search);
      const cfg: HeroConfig = {};
      const layout = sp.get('heroLayout'); if (layout) cfg.layout = layout;
      const gap = sp.get('heroGap'); if (gap && !isNaN(+gap)) cfg.gapScale = parseFloat(gap);
      const ls = sp.get('heroLogo'); if (ls && !isNaN(+ls)) cfg.logoScale = parseFloat(ls);
      const line = sp.get('heroLine'); if (line && !isNaN(+line)) cfg.lineGapScale = parseFloat(line);
      const align = sp.get('heroAlign'); if (align) cfg.align = align;
      const bp = sp.get('heroBreakpoint'); if (bp && !isNaN(+bp)) cfg.autoStackBreakpoint = parseInt(bp,10);
      return cfg;
    } catch { return {}; }
  })();

  // Feature flag: show circle unification sample grid via query param ?circleSamples=1
  const [showCircleSamples, setShowCircleSamples] = useState(false);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setShowCircleSamples(sp.get('circleSamples') === '1');
    } catch { /* ignore */ }
  }, []);

  // Lazy load trigger for QuoteSpotlight (intersection + idle + scroll fallback)
  useEffect(() => {
    if (shouldLoadQuotes) return
    let done = false
    const activate = () => { if (!done) { done = true; setShouldLoadQuotes(true) } }
    // IntersectionObserver to trigger just before in-view
    if ('IntersectionObserver' in window && quoteSectionRef.current) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { activate(); io.disconnect() } })
      }, { root: null, rootMargin: '200px 0px', threshold: 0 })
      io.observe(quoteSectionRef.current)
    }
    // Scroll fallback
    const onScroll = () => { if (window.scrollY > 240) activate() }
    window.addEventListener('scroll', onScroll, { passive: true })
    // Idle callback (ensure load even without interaction)
    type RIC = (callback: () => void, opts?: { timeout?: number }) => number
    const ric: RIC | undefined = (window as unknown as { requestIdleCallback?: RIC }).requestIdleCallback
    const idle = (cb: () => void) => (typeof ric === 'function' ? ric(cb, { timeout: 2200 }) : window.setTimeout(cb, 1600))
    const idleId = idle(() => activate())
    return () => { window.removeEventListener('scroll', onScroll); if (typeof idleId === 'number') clearTimeout(idleId) }
  }, [shouldLoadQuotes])

  // Fetch integrity with retry/backoff
  useEffect(() => {
    if (integrityLoadedRef.current) return
    let aborted = false
    const run = async () => {
      const data = await fetchIntegrityData(3)
      if (!aborted) {
        setIntegrity(data)
        integrityLoadedRef.current = true
      }
    }
    const t = setTimeout(run, 600)
    return () => { aborted = true; clearTimeout(t) }
  }, [])

  // Detect scroll to allow future lazy extraction of quote component
  // (Removed old scroll tracking state for quotes)

  // Update document meta tags (hero copy) once on mount
  useEffect(() => {
  const title = `HumanAI Convention – ${PRIMARY_TAGLINE.replace(/\.$/, '')}`
    document.title = title
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute('name', name)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }
    const setProperty = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute('property', property)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }
  // Updated description: set canonical short tagline used for meta tags.
  const description = `HumanAI Convention 0 We will know 	6 together.`
    setMeta('description', description)
    setProperty('og:title', title)
    setProperty('og:description', description)
    setProperty('og:image', `${window.location.origin}/og-image.svg`)
    setProperty('og:image:type', 'image/svg+xml')
    setProperty('og:image:width', '1200')
    setProperty('og:image:height', '630')
    setProperty('twitter:card', 'summary_large_image')
    setProperty('twitter:title', title)
    setProperty('twitter:description', description)
    setProperty('twitter:image', `${window.location.origin}/og-image.svg`)
  }, [])

  return (
    <div className={`page ${prefersReducedMotion ? 'reduced-motion-active' : ''}`} data-reveal data-reveal-order="0">
      {/* Optional floating debug controls for live tuning */}
      {typeof window !== 'undefined' && (() => { try { return new URLSearchParams(window.location.search).get('heroControls') === '1'; } catch { return false; } })() && (
        <HeroLogoControls initial={{
          layout: (heroConfig.layout as 'horizontal-left' | 'horizontal-right' | 'stacked') || 'horizontal-left',
          align: (heroConfig.align as 'start' | 'center') || 'center',
          logoScale: heroConfig.logoScale ?? 1,
            gapScale: heroConfig.gapScale ?? 1,
            lineGapScale: heroConfig.lineGapScale ?? 1,
            autoStackBreakpoint: heroConfig.autoStackBreakpoint ?? 640
        }} />
      )}
      {showCircleSamples && (
        <div style={{ padding: '40px 24px', background:'#050505' }}>
          <h2 style={{ color:'#fff', marginTop:0, fontSize: '1.75rem', fontWeight:600 }}>Circle Unification Variants (A1–B3)</h2>
          <p style={{ color:'#bbb', maxWidth:680, lineHeight:1.4 }}>Quick visual comparison of six geometry strategies. Remove the <code>?circleSamples=1</code> query parameter to return to normal page content.</p>
        </div>
      )}
      {!introComplete && (
        <div className="intro-gate">
          <PreviewIntroGate onComplete={handleIntroComplete} />
        </div>
      )}
      <AnalyticsConsentBanner />
      {import.meta.env.DEV && <AnalyticsDebugOverlay />}
      <AuthBanner />
  <PasswordGate>
  <header className="hero" id="top" role="banner" aria-labelledby="site-hero-heading" data-reveal data-reveal-order="1">
        <div className="hero__inner">
          <h1 id="site-hero-heading">{PRIMARY_TAGLINE}</h1>
          <div className={`hero__logo-wrap hero__logo-wrap--left hero__logo-wrap--left-offset ${!introComplete ? 'hero__logo-wrap--pending' : 'hero__logo-wrap--enter'}`} aria-hidden={false} aria-label="HumanAI Convention logo mark and wordmark">
            <HeroLogoWordmark
              layout={(heroConfig.layout as 'stacked' | 'horizontal-left' | 'horizontal-right') || 'horizontal-right'}
              align={(heroConfig.align as 'start' | 'center') || 'center'}
              logoScale={heroConfig.logoScale ?? 1}
              gapScale={heroConfig.gapScale ?? 1}
              lineGapScale={heroConfig.lineGapScale ?? 1}
              autoStackBreakpoint={heroConfig.autoStackBreakpoint ?? 640}
            />
            <p className="visually-hidden" id="hero-desc">HumanAI Convention — We will know — together.</p>
          </div>
          <nav className="cta-row" aria-label="Primary calls to action" data-reveal data-reveal-order="2">
            <a
              className="cta btn-primary"
              href="/explore"
              data-event="cta_click"
              data-cta="explore"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/explore');
                window.dispatchEvent(new PopStateEvent('popstate'));
                trackEvent({ category: 'interaction', action: 'click', label: 'explore', metadata: { origin: 'hero' } })
              }}
            >
              Explore now
            </a>
            <a
              className="cta btn-secondary"
              href="/learn-more"
              data-event="cta_click"
              data-cta="learn_more"
              onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/learn-more'); window.dispatchEvent(new PopStateEvent('popstate')); trackEvent({ category: 'interaction', action: 'click', label: 'learn_more', metadata: { origin: 'hero' } }) }}
            >
              Learn more
            </a>
            <a
              className="cta btn-tertiary"
              href="/preview"
              data-event="cta_click"
              data-cta="preview_questions"
              onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/preview'); window.dispatchEvent(new PopStateEvent('popstate')); trackEvent({ category: 'interaction', action: 'click', label: 'preview_questions', metadata: { origin: 'hero' } }) }}
            >
              Preview Q&A
            </a>
          </nav>
        </div>
      </header>

  <main data-reveal data-reveal-order="3">
        {/* Variant legend removed */}
        {shouldLoadQuotes ? (
          <React.Suspense fallback={<section className="section section--quote-focus" id="voices" ref={quoteSectionRef}><div className="quote-spotlight skeleton">Loading perspectives…</div></section>}>
            {React.createElement(React.lazy(() => import('./components/QuoteSpotlight')))}
          </React.Suspense>
        ) : (
          <section className="section section--quote-focus" id="voices" aria-label="Perspectives on consciousness" ref={quoteSectionRef} data-lazy="quote-spotlight">
            <div className="quote-spotlight skeleton" aria-hidden="true">Preparing perspectives…</div>
            <noscript><p style={{color:'#ccc', maxWidth:680, margin:'1rem auto 0', textAlign:'center'}}>Enable JavaScript to view rotating perspectives.</p></noscript>
          </section>
        )}
  <StickyNav targets={[
    { href: '#integrity', label: 'Integrity' },
    { href: '#coming-soon', label: 'Roadmap' },
    { href: '/preview', label: 'Preview' }
  ]} />
  <div className="main-column" role="group" aria-label="Project transparency and roadmap">
          <section id="integrity" className="section integrity-preview integrity-preview--after-quotes" aria-labelledby="integrity-heading" data-reveal data-reveal-order="4">
            <h2 id="integrity-heading" ref={integrityHeadingRef} tabIndex={-1}>Transparency &amp; Integrity (Preview)</h2>
            <p className="integrity-blurb integrity-blurb--center">We surface build attestations, software bill of materials changes, and verifiable hashes so anyone can independently confirm what is running. Soon you’ll explore deeper provenance, supply-chain drift insights, and reproducibility proofs here.</p>
            <dl className="integrity-kpis integrity-kpis--center" aria-describedby="integrity-heading">
              <div className="kpi"><dt className="kpi-label">Version</dt><dd className="kpi-value">{integrity.version || <span className="kpi-skel" aria-hidden="true">···</span>}</dd></div>
              <div className="kpi"><dt className="kpi-label">Commit</dt><dd className="kpi-value">{integrity.commit ? integrity.commit.slice(0,7) : <span className="kpi-skel" aria-hidden="true">···</span>}</dd></div>
              <div className="kpi"><dt className="kpi-label">Attested</dt><dd className="kpi-value">{integrity.attestedAt ? new Date(integrity.attestedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : <span className="kpi-skel" aria-hidden="true">···</span>}</dd></div>
              <div className="kpi"><dt className="kpi-label">Hash</dt><dd className="kpi-value">{integrity.hashMatch === true ? 'match ✔' : integrity.hashMatch === false ? 'mismatch ⚠' : <span className="kpi-skel" aria-hidden="true">···</span>}</dd></div>
              <div className="kpi"><dt className="kpi-label">SBOM Drift</dt><dd className="kpi-value">{typeof integrity.sbomDrift === 'number' ? integrity.sbomDrift : <span className="kpi-skel" aria-hidden="true">···</span>}</dd></div>
              <div className="kpi"><dt className="kpi-label">Assets</dt><dd className="kpi-value">{typeof integrity.assetCount === 'number' ? integrity.assetCount : <span className="kpi-skel" aria-hidden="true">···</span>}</dd></div>
              <div className="kpi"><dt className="kpi-label">Asset Bytes</dt><dd className="kpi-value">{integrity.assetBytes ? formatBytes(integrity.assetBytes) : <span className="kpi-skel" aria-hidden="true">···</span>}</dd></div>
            </dl>
          </section>
          <section className="section">
          </section>
          <section className="section section--coming-soon" id="coming-soon" data-reveal data-reveal-order="5">
            <div className="section__header section__header--center">
              <h2>Coming soon</h2>
              <p>We’re preparing an open participation layer: collaborative verification tools, integrity attestations you can fork and reproduce, and pathways to steward high‑trust human–AI knowledge as a shared public good. If this resonates, you’re early — and welcome. More ways to engage are on the horizon.</p>
            </div>
          </section>
        </div>
  </main>
  </PasswordGate>

  <footer className="footer" data-reveal data-reveal-order="6">
        <div className="footer__content">
          <p>© {new Date().getFullYear()} HumanAI Convention. Built for collective intelligence.</p>
          <a href="#top">Back to top</a>
        </div>
        <VersionFooter />
      </footer>
  <UpdateToast />
  <BackgroundUpdateSnackbar />
    </div>
  )
}

export default App
