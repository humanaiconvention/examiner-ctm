// Deployment trigger: updating comment to publish full app over minimal placeholder
import { useEffect, useMemo, useState, useRef, type ChangeEvent } from 'react'
import PreLogoSequence from './components/PreLogoSequence'

import './App.css'
import { trackEvent, trackQuoteTransition } from './analytics'
import VersionFooter from './components/VersionFooter'
import AnalyticsConsentBanner from './components/AnalyticsConsentBanner'
import AnalyticsDebugOverlay from './components/AnalyticsDebugOverlay.tsx'
import { consciousnessQuotes } from './config/quotes'
import { UpdateToast, BackgroundUpdateSnackbar } from './sw-updates'

const MAX_AUTOPLAY_QUOTES = 30
const AUTOPLAY_PRESETS = [
  { label: 'Relaxed', value: 10000 },
  { label: 'Standard', value: 6000 },
  { label: 'Energetic', value: 4000 },
]

// Crossfade animation configuration profiles
const QUOTE_ANIMATION_CONFIG = {
  subtle: {
    totalMs: 900,
    easingIn: 'cubic-bezier(.5,.08,.25,1)',
    easingOut: 'cubic-bezier(.6,.02,.4,1)',
    blurStart: 6,
    blurEnd: 0,
  },
  instant: {
    totalMs: 0,
    easingIn: 'linear',
    easingOut: 'linear',
    blurStart: 0,
    blurEnd: 0,
  },
  cinematic: {
    totalMs: 1800, // 1.8s mid-range of requested 1.5–2s
    easingIn: 'cubic-bezier(.4,0,.2,1)',
    easingOut: 'cubic-bezier(.65,.05,.36,1)',
    blurStart: 10,
    blurEnd: 0,
  },
  gentleLong: {
    totalMs: 2000,
    easingIn: 'cubic-bezier(.42,0,.1,1)',
    easingOut: 'cubic-bezier(.7,0,.3,1)',
    blurStart: 14,
    blurEnd: 1,
  },
} as const
type CrossfadeProfileKey = keyof typeof QUOTE_ANIMATION_CONFIG

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

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

const pillars = [
  {
    title: 'Ethical Infrastructure',
    description:
      'Scalable and replicable protocols for useful, transparent, accountable AI systems.',
  },
  {
    title: 'Participatory Data',
    description:
      'Human-centered data practices rooted in informed, bounded consent and deliberative engagement (inspired by the Danish model) scaled to enable statistically significant, ethically grounded AI systems designed to benefit humanity.',
  },
  {
    title: 'Science- and Culture- informed Research',
    description:
      'Responsible data practices and methodologies that maximize engagement for mutual benefit, with long-term individual and collective human safety at the root.',
  },
]



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
  }
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  const [autoAdvanceMs, setAutoAdvanceMs] = useState(AUTOPLAY_PRESETS[1]?.value ?? 6000)
  // Pause length after manual navigation (ms)
  const MANUAL_PAUSE_AFTER_NAV_MS = 7000
  const [manualPauseUntil, setManualPauseUntil] = useState<number | null>(null)
  const [shuffledQuotes, setShuffledQuotes] = useState<typeof consciousnessQuotes>([])
  // Keep previous active quote for smooth crossfade
  const [previousQuote, setPreviousQuote] = useState<null | typeof consciousnessQuotes[number]>(null)
  const [isCrossfading, setIsCrossfading] = useState(false)
  const [animationPhase, setAnimationPhase] = useState<'quote' | 'meta' | 'context'>('quote')
  const [crossfadeProfile, setCrossfadeProfile] = useState<CrossfadeProfileKey>('subtle')
  const [forceTransitionCounter, setForceTransitionCounter] = useState(0)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [controlsHidden, setControlsHidden] = useState(false)

  // Track last scroll position for hide/show logic
  const lastScrollYRef = useRef<number>(0)

  // Debounce refs for persistence
  const speedDebounceRef = useRef<number | null>(null)
  const profileDebounceRef = useRef<number | null>(null)

  const prefersReducedMotion = usePrefersReducedMotion()

  // Initialize and reshuffle quotes
  useEffect(() => {
    const initialPool = consciousnessQuotes.slice(0, MAX_AUTOPLAY_QUOTES)
    setShuffledQuotes(shuffleArray(initialPool))
  }, [])

  // Load persisted user preferences (speed & profile) once
  useEffect(() => {
    try {
      const storedSpeed = localStorage.getItem('hq:autoAdvanceMs')
      if (storedSpeed) {
        const num = Number(storedSpeed)
        if (Number.isFinite(num) && num > 0) setAutoAdvanceMs(num)
      }
      const storedProfile = localStorage.getItem('hq:crossfadeProfile') as CrossfadeProfileKey | null
      if (storedProfile && storedProfile in QUOTE_ANIMATION_CONFIG) {
        setCrossfadeProfile(storedProfile)
      }
    } catch {
      // localStorage read unavailable (private mode / SSR)
    }
  }, [])

  // Persist speed (debounced)
  useEffect(() => {
    if (speedDebounceRef.current) window.clearTimeout(speedDebounceRef.current)
    speedDebounceRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem('hq:autoAdvanceMs', String(autoAdvanceMs))
      } catch {
        // ignore persistence failure
      }
    }, 400)
  }, [autoAdvanceMs])

  // Persist crossfade profile (debounced)
  useEffect(() => {
    if (profileDebounceRef.current) window.clearTimeout(profileDebounceRef.current)
    profileDebounceRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem('hq:crossfadeProfile', crossfadeProfile)
      } catch {
        // ignore persistence failure
      }
    }, 400)
  }, [crossfadeProfile])

  const quoteCount = shuffledQuotes.length
  const boundedIndex = useMemo(
    () => (quoteCount === 0 ? 0 : ((quoteIndex % quoteCount) + quoteCount) % quoteCount),
    [quoteIndex, quoteCount],
  )
  const activeQuote = useMemo(() => {
    if (quoteCount === 0) return null
    return shuffledQuotes[boundedIndex]
  }, [boundedIndex, quoteCount, shuffledQuotes])

  useEffect(() => {
    if (prefersReducedMotion) {
      setAutoPlayEnabled(false)
    }
  }, [prefersReducedMotion])

  // Scroll hide/show for desktop (ignore small screens < 800px)
  useEffect(() => {
    const MIN_WIDTH = 800
    if (typeof window === 'undefined') return
    if (window.innerWidth < MIN_WIDTH) return

    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        window.requestAnimationFrame(() => {
          const currentY = window.scrollY
          const lastY = lastScrollYRef.current
          const delta = currentY - lastY
          if (Math.abs(delta) > 6) { // threshold to avoid noise
            if (delta > 0) {
              // scrolling down
              setControlsHidden(true)
            } else {
              // scrolling up
              setControlsHidden(false)
            }
            lastScrollYRef.current = currentY
          }
          ticking = false
        })
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [prefersReducedMotion])

  const activeProfile = QUOTE_ANIMATION_CONFIG[crossfadeProfile]
  const halfDuration = Math.round(activeProfile.totalMs / 2)

  const lastTransitionStartRef = useRef<number | null>(null)
  useEffect(() => {
    if (!autoPlayEnabled || quoteCount === 0) return
    if (manualPauseUntil && Date.now() < manualPauseUntil) {
      const resumeIn = manualPauseUntil - Date.now()
      const resumeTimer = setTimeout(() => {
        // trigger effect rerun by clearing pause
        setManualPauseUntil(null)
      }, resumeIn)
      return () => clearTimeout(resumeTimer)
    }

    let switchTimer: ReturnType<typeof setTimeout> | null = null
    const intervalId = window.setInterval(() => {
      if (prefersReducedMotion) {
        setQuoteIndex((current) => (current + 1) % quoteCount)
        return
      }
      setIsCrossfading(true)
      setPreviousQuote(activeQuote)
      lastTransitionStartRef.current = performance.now()
      switchTimer = setTimeout(() => {
        setQuoteIndex((current) => {
          const nextIndex = (current + 1) % quoteCount
          if (nextIndex === 0) {
            setShuffledQuotes(prevQuotes => shuffleArray(prevQuotes))
          }
          return nextIndex
        })
        setTimeout(() => {
          setIsCrossfading(false)
          setPreviousQuote(null)
          if (lastTransitionStartRef.current != null) {
            const duration = performance.now() - lastTransitionStartRef.current
            trackQuoteTransition(duration)
            lastTransitionStartRef.current = null
          }
        }, halfDuration)
      }, halfDuration)
    }, autoAdvanceMs)

    return () => {
      if (switchTimer) clearTimeout(switchTimer)
      window.clearInterval(intervalId)
    }
  }, [autoPlayEnabled, autoAdvanceMs, quoteCount, activeQuote, prefersReducedMotion, manualPauseUntil, halfDuration, forceTransitionCounter])

  // Animation phase management
  useEffect(() => {
    if (prefersReducedMotion) return
    
    setAnimationPhase('quote')
    const metaTimer = setTimeout(() => setAnimationPhase('meta'), 300)
    const contextTimer = setTimeout(() => setAnimationPhase('context'), 600)
    
    return () => {
      clearTimeout(metaTimer)
      clearTimeout(contextTimer)
    }
  }, [activeQuote, prefersReducedMotion])

  const advanceQuote = (direction: 'forward' | 'backward') => {
    if (quoteCount === 0) return
    // manual navigation triggers crossfade too
    setManualPauseUntil(Date.now() + MANUAL_PAUSE_AFTER_NAV_MS)
    if (prefersReducedMotion) {
      setQuoteIndex((current) => {
        if (direction === 'forward') {
          const nextIndex = (current + 1) % quoteCount
          if (nextIndex === 0) setShuffledQuotes(prevQuotes => shuffleArray(prevQuotes))
          return nextIndex
        }
        return (current - 1 + quoteCount) % quoteCount
      })
      return
    }
    setIsCrossfading(true)
    setPreviousQuote(activeQuote)
    lastTransitionStartRef.current = performance.now()
    const applyAdvance = () => {
      setQuoteIndex((current) => {
        if (direction === 'forward') {
          const nextIndex = (current + 1) % quoteCount
            if (nextIndex === 0) {
              setShuffledQuotes(prevQuotes => shuffleArray(prevQuotes))
            }
          return nextIndex
        }
        return (current - 1 + quoteCount) % quoteCount
      })
      setTimeout(() => {
        setIsCrossfading(false)
        setPreviousQuote(null)
        if (lastTransitionStartRef.current != null) {
          const duration = performance.now() - lastTransitionStartRef.current
            trackQuoteTransition(duration)
            lastTransitionStartRef.current = null
        }
      }, halfDuration)
    }
    setTimeout(applyAdvance, halfDuration)
  }

  // Force a transition immediately (used by test button)
  const triggerTestTransition = () => {
    if (!activeQuote || quoteCount === 0) return
    // If instant profile just advance without crossfade
    if (crossfadeProfile === 'instant' || prefersReducedMotion) {
      setQuoteIndex((c) => (c + 1) % quoteCount)
      return
    }
    setIsCrossfading(true)
    setPreviousQuote(activeQuote)
    lastTransitionStartRef.current = performance.now()
    setTimeout(() => {
      setQuoteIndex((current) => (current + 1) % quoteCount)
      setTimeout(() => {
        setIsCrossfading(false)
        setPreviousQuote(null)
        if (lastTransitionStartRef.current != null) {
          const duration = performance.now() - lastTransitionStartRef.current
          trackQuoteTransition(duration)
          lastTransitionStartRef.current = null
        }
      }, halfDuration)
    }, halfDuration)
    // bump counter to keep autoplay effect from ignoring this custom change timing if needed
    setForceTransitionCounter(c => c + 1)
  }

  const markInteracted = () => {
    if (!hasInteracted) setHasInteracted(true)
  }

  const handleSpeedChange = (event: ChangeEvent<HTMLSelectElement>) => {
    markInteracted()
    const nextValue = Number(event.target.value)
    setAutoAdvanceMs(Number.isFinite(nextValue) && nextValue > 0 ? nextValue : AUTOPLAY_PRESETS[1]?.value ?? 6000)
  }

  return (
    <div className={`page ${prefersReducedMotion ? 'reduced-motion-active' : ''}`}>
      {!introComplete && (
        <PreLogoSequence onComplete={handleIntroComplete} />
      )}
      <AnalyticsConsentBanner />
      {import.meta.env.DEV && <AnalyticsDebugOverlay />}
      <header className="hero" id="top">
        <div className="hero__inner">
          <h1>Solving real AI problems with human-led insight.</h1>
          <p className="lede">
            We turn collective lived experience into reliable, ethical training data so intelligent systems work for
            people.
          </p>
          <div className="hero__actions">
            <a
              className="cta"
              href="#coming-soon"
              data-track-category="hero"
              data-track-action="click"
              data-track-label="explore_framework"
              onClick={() => trackEvent({ category: 'interaction', action: 'click', label: 'explore_framework', metadata: { origin: 'hero' } })}
            >
              Explore the framework
            </a>
            <a
              className="cta cta--ghost"
              href="#coming-soon"
              data-track-category="hero"
              data-track-action="click"
              data-track-label="join_discussion"
              onClick={() => trackEvent({ category: 'interaction', action: 'click', label: 'join_discussion', metadata: { origin: 'hero' } })}
            >
              Join the discussion
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="section section--quote-focus" id="voices" aria-label="Perspectives on consciousness">
          <div className="quote-spotlight">
            <div className={`quote-spotlight__stage ${isCrossfading ? 'is-crossfading' : ''}`}>
              {previousQuote && (
                <article className="quote-spotlight__card quote-layer previous">
                  <p className="quote-spotlight__text is-outgoing">{previousQuote.text}</p>
                  <footer className="quote-spotlight__meta is-outgoing">
                    <div className="quote-spotlight__author">{previousQuote.author}</div>
                    {(previousQuote.source || previousQuote.year) && (
                      <div className="quote-spotlight__source">{[previousQuote.source, previousQuote.year].filter(Boolean).join(' · ')}</div>
                    )}
                    {previousQuote.context && (
                      <p className="quote-spotlight__context is-outgoing">{previousQuote.context}</p>
                    )}
                  </footer>
                </article>
              )}
              {activeQuote && (
                <article className="quote-spotlight__card quote-layer active">
                  <p className={`quote-spotlight__text ${isCrossfading ? 'is-incoming' : ''} ${animationPhase === 'quote' || !prefersReducedMotion ? 'animate-in' : ''}`}>{activeQuote.text}</p>
                  <footer className={`quote-spotlight__meta ${isCrossfading ? 'is-incoming' : ''} ${animationPhase === 'meta' || animationPhase === 'context' || prefersReducedMotion ? 'animate-in' : ''}`}>
                    <div className="quote-spotlight__author">{activeQuote.author}</div>
                    {(activeQuote.source || activeQuote.year) && (
                      <div className="quote-spotlight__source">{[activeQuote.source, activeQuote.year].filter(Boolean).join(' · ')}</div>
                    )}
                    {activeQuote.context && (
                      <p className={`quote-spotlight__context ${isCrossfading ? 'is-incoming' : ''} ${animationPhase === 'context' || prefersReducedMotion ? 'animate-in' : ''}`}>{activeQuote.context}</p>
                    )}
                  </footer>
                </article>
              )}
            </div>
            <div
              className={`quote-spotlight__controls quote-spotlight__controls--after animate-on-interact ${hasInteracted ? 'is-visible' : ''} ${controlsHidden && !prefersReducedMotion ? 'is-hidden-by-scroll' : ''}`}
              onFocus={markInteracted}
              onMouseEnter={markInteracted}
              onTouchStart={markInteracted}
            >
              <div className="quote-spotlight__nav">
                <button
                  type="button"
                  className="quote-spotlight__control"
                  onClick={() => advanceQuote('backward')}
                  aria-label="Show previous quote"
                  title="Previous quote"
                  onFocus={markInteracted}
                  onClickCapture={markInteracted}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M15.7 5.3a1 1 0 0 1 0 1.4L10.4 12l5.3 5.3a1 1 0 1 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z"/></svg>
                </button>
                <div className="quote-spotlight__progress" aria-live="polite">
                  {quoteCount === 0 ? '0 / 0' : `${boundedIndex + 1} / ${quoteCount}`}
                </div>
                <button
                  type="button"
                  className="quote-spotlight__control"
                  onClick={() => advanceQuote('forward')}
                  aria-label="Show next quote"
                  title="Next quote"
                  onFocus={markInteracted}
                  onClickCapture={markInteracted}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8.3 18.7a1 1 0 0 1 0-1.4L13.6 12L8.3 6.7A1 1 0 0 1 9.7 5.3l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4 0Z"/></svg>
                </button>
              </div>
              <div className="quote-spotlight__autoplay" role="group" aria-label="Automatic quote scrolling and timing">
                <button
                  type="button"
                  className="quote-spotlight__toggle"
                  onClick={() => setAutoPlayEnabled((current) => !current)}
                  title={autoPlayEnabled ? 'Pause autoplay' : 'Play autoplay'}
                  onFocus={markInteracted}
                  onClickCapture={markInteracted}
                >
                  {autoPlayEnabled ? 'Pause' : 'Play'}
                </button>
                <label className="quote-spotlight__speed">
                  <span className="sr-only">Auto-scroll speed</span>
                  <select value={autoAdvanceMs} onChange={handleSpeedChange} title="Autoplay speed" onFocus={markInteracted}>
                    {AUTOPLAY_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="quote-spotlight__speed">
                  <span className="sr-only">Crossfade profile</span>
                  <select
                    value={crossfadeProfile}
                    onChange={(e) => { setCrossfadeProfile(e.target.value as CrossfadeProfileKey); markInteracted(); }}
                    title="Crossfade timing profile"
                    onFocus={markInteracted}
                  >
                    <option value="instant">Instant</option>
                    <option value="subtle">Subtle (0.9s)</option>
                    <option value="cinematic">Cinematic (1.8s)</option>
                    <option value="gentleLong">Gentle Long (2.0s)</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="quote-spotlight__toggle"
                  onClick={triggerTestTransition}
                  aria-label="Test transition now"
                  title="Trigger test transition"
                  onFocus={markInteracted}
                  onClickCapture={markInteracted}
                >
                  Test transition
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="mission">
          <div className="section__header">
            <h2>Our mission</h2>
            <p>Catalyzing beneficial artificial intelligence by ethically cultivating robust human data.</p>
          </div>
          <div className="pillars">
            {pillars.map((pillar) => (
              <article key={pillar.title} className="pillar">
                <h3>{pillar.title}</h3>
                <p>{pillar.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section section--vision-rich" id="vision">
          <div className="section__header section__header--spaced">
            <h2>Our vision</h2>
            <p>We see the development of artificial general intelligence (AGI) and the definition of consciousness not as separate frontiers, but as one shared quest.</p>
            <p>AGI is commonly understood as an intelligence capable of performing any cognitive task a human can, with the ability to learn, adapt, and generalize across domains. Consciousness, meanwhile, remains one of humanity’s most profound open questions — the lived experience of awareness, agency, and meaning.</p>
            <p>At HumanAI Convention, we believe these two challenges are inseparable. To build AGI responsibly, we must deepen our understanding of consciousness. To define consciousness rigorously, we must explore how intelligence emerges, adapts, and interacts with the world.</p>
            <p>Our vision is to create a participatory, open-source commons where researchers, communities, and everyday users can:</p>
            <ul className="vision-list">
              <li>Model and explore consciousness through modular dashboards and wiki trees.</li>
              <li>Contribute to AGI development by testing, remixing, and refining theories in transparent, reproducible ways.</li>
              <li>Track the evolution of ideas across individuals and communities, building a living knowledge graph of mind and intelligence.</li>
              <li>Anchor progress in ethics and equity, ensuring that the path toward AGI is guided by collective wisdom and public benefit.</li>
            </ul>
            <p>We are not just observers of this quest — we are builders of the scaffolding that allows humanity to approach it together. By weaving rigorous science with playful, participatory design, HumanAI Convention will help transform the defining challenge of our century into a shared, navigable journey.</p>
            <p id="vision-cta-desc" className="sr-only">Navigate to the coming soon section to learn how to participate.</p>
            <div className="vision-cta" id="get-involved"
              data-track-scope="vision"
            >
              <a
                href="#coming-soon"
                className="cta cta--vision"
                aria-describedby="vision-cta-desc"
                data-track-category="vision"
                data-track-action="click"
                data-track-label="get_involved_primary"
                onClick={() => trackEvent({ category: 'interaction', action: 'click', label: 'get_involved_primary', metadata: { origin: 'vision' } })}
              >
                Get involved
              </a>
              <a
                href="#coming-soon"
                className="cta cta--vision-secondary"
                aria-describedby="vision-cta-desc"
                data-track-category="vision"
                data-track-action="click"
                data-track-label="why_it_matters"
                onClick={() => trackEvent({ category: 'interaction', action: 'click', label: 'why_it_matters', metadata: { origin: 'vision' } })}
              >
                Why it matters
              </a>
            </div>
          </div>
        </section>

        <section className="section section--coming-soon" id="coming-soon">
          <div className="section__header">
            <h2>Coming soon</h2>
            <p>We’re finalizing public touchpoints. Stay tuned for launch details and participation pathways.</p>
          </div>
        </section>
      </main>

      <footer className="footer">
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
