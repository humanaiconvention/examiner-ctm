import { useEffect, useMemo, useState, type ChangeEvent } from 'react'

import './App.css'
import { consciousnessQuotes } from './config/quotes'

const MAX_AUTOPLAY_QUOTES = 30
const AUTOPLAY_PRESETS = [
  { label: 'Relaxed', value: 10000 },
  { label: 'Standard', value: 7000 },
  { label: 'Energetic', value: 4500 },
]

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

const contactChannels = [
  {
    label: 'Join the conversation',
    href: '#coming-soon',
  },
  {
    label: 'Request a pilot partnership',
    href: '#coming-soon',
  },
  {
    label: 'Subscribe for updates',
    href: '#coming-soon',
  },
]

function App() {
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  const [autoAdvanceMs, setAutoAdvanceMs] = useState(AUTOPLAY_PRESETS[1]?.value ?? 7000)

  const prefersReducedMotion = usePrefersReducedMotion()

  const quotePool = useMemo(() => consciousnessQuotes.slice(0, MAX_AUTOPLAY_QUOTES), [])
  const quoteCount = quotePool.length
  const boundedIndex = useMemo(
    () => (quoteCount === 0 ? 0 : ((quoteIndex % quoteCount) + quoteCount) % quoteCount),
    [quoteIndex, quoteCount],
  )
  const activeQuote = useMemo(() => {
    if (quoteCount === 0) return null
    return quotePool[boundedIndex]
  }, [boundedIndex, quoteCount, quotePool])

  useEffect(() => {
    if (prefersReducedMotion) {
      setAutoPlayEnabled(false)
    }
  }, [prefersReducedMotion])

  useEffect(() => {
    if (!autoPlayEnabled || quoteCount === 0) return

    const intervalId = window.setInterval(() => {
      setQuoteIndex((current) => (current + 1) % quoteCount)
    }, autoAdvanceMs)

    return () => window.clearInterval(intervalId)
  }, [autoPlayEnabled, autoAdvanceMs, quoteCount])

  const advanceQuote = (direction: 'forward' | 'backward') => {
    if (quoteCount === 0) return
    setQuoteIndex((current) => {
      if (direction === 'forward') {
        return (current + 1) % quoteCount
      }
      return (current - 1 + quoteCount) % quoteCount
    })
  }

  const handleSpeedChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = Number(event.target.value)
    setAutoAdvanceMs(Number.isFinite(nextValue) && nextValue > 0 ? nextValue : AUTOPLAY_PRESETS[1]?.value ?? 7000)
  }

  return (
    <div className="page">
      <header className="hero" id="top">
        <div className="hero__inner">
          <p className="eyebrow">Solving real AI problems</p>
          <h1>Solving real AI problems with human-led insight.</h1>
          <p className="lede">
            We turn collective lived experience into reliable, ethical training data so intelligent systems work for
            people.
          </p>
          <div className="hero__actions">
            <a className="cta" href="#coming-soon">Explore the framework</a>
            <a className="cta cta--ghost" href="#coming-soon">
              Join the discussion
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="section" id="vision">
          <div className="section__header">
            <h2>Our vision</h2>
            <p>
              An equitable network where every community can interrogate, shape, and steward the AI systems that affect
              their futures.
            </p>
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

        <section className="section section--quote-focus" id="voices" aria-label="Perspectives on consciousness">
          <div className="quote-spotlight">
            {activeQuote && (
              <article className="quote-spotlight__card">
                <p className="quote-spotlight__text">{activeQuote.text}</p>
                <footer className="quote-spotlight__meta">
                  <div className="quote-spotlight__author">{activeQuote.author}</div>
                  {(activeQuote.source || activeQuote.year) && (
                  <div className="quote-spotlight__source">
                    {[activeQuote.source, activeQuote.year].filter(Boolean).join(' · ')}
                  </div>
                )}
                  {activeQuote.context && <p className="quote-spotlight__context">{activeQuote.context}</p>}
                </footer>
              </article>
            )}
            <div className="quote-spotlight__controls">
              <div className="quote-spotlight__nav">
                <button
                  type="button"
                  className="quote-spotlight__control"
                  onClick={() => advanceQuote('backward')}
                  aria-label="Show previous quote"
                >
                  ←
                </button>
                <div className="quote-spotlight__progress" aria-live="polite">
                  {quoteCount === 0 ? '0 / 0' : `${boundedIndex + 1} / ${quoteCount}`}
                </div>
                <button
                  type="button"
                  className="quote-spotlight__control"
                  onClick={() => advanceQuote('forward')}
                  aria-label="Show next quote"
                >
                  →
                </button>
              </div>
              <div className="quote-spotlight__autoplay" role="group" aria-label="Automatic quote scrolling">
                <button
                  type="button"
                  className="quote-spotlight__toggle"
                  onClick={() => setAutoPlayEnabled((current) => !current)}
                >
                  {autoPlayEnabled ? 'Pause' : 'Play'}
                </button>
                <label className="quote-spotlight__speed">
                  <span className="sr-only">Auto-scroll speed</span>
                  <select value={autoAdvanceMs} onChange={handleSpeedChange}>
                    {AUTOPLAY_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="participate">
          <div className="section__header">
            <h2>Participate</h2>
            <p>Bring your lived experience, legal insight, scientific rigor, or design practice to the table.</p>
          </div>
          <div className="channels">
            {contactChannels.map((channel) => (
              <a key={channel.label} className="channel" href={channel.href}>
                <span>{channel.label}</span>
                <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M6 5h9v9M15 5l-10 10"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            ))}
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
      </footer>
    </div>
  )
}

export default App
