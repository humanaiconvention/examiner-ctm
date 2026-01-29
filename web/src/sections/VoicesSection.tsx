import React, { useEffect, useMemo, useState } from 'react'
import type { ConsciousnessQuote } from '@/config/quotes'

const MAX_AUTOPLAY_QUOTES = 30
const AUTOPLAY_PRESETS = [
  { label: 'Relaxed', value: 10000 },
  { label: 'Standard', value: 7000 },
  { label: 'Energetic', value: 4500 }
]

function usePrefersReducedMotion() {
  const [prefers, setPrefers] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefers(mq.matches)
    update(); mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return prefers
}

export default function VoicesSection() {
  if (typeof performance !== 'undefined') {
    performance.mark('section:voices:mounted')
  }
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  const [autoAdvanceMs, setAutoAdvanceMs] = useState(AUTOPLAY_PRESETS[1]?.value ?? 7000)
  const [quotes, setQuotes] = useState<ConsciousnessQuote[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const prefersReducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (status !== 'idle') return
    if (typeof window === 'undefined') return
    if (typeof process !== 'undefined' && process.env?.VITEST) return
    const load = () => {
      import('@/config/quotes')
        .then((mod) => {
          setQuotes(mod.consciousnessQuotes.slice(0, MAX_AUTOPLAY_QUOTES))
          setStatus('ready')
        })
        .catch(() => setStatus('error'))
    }
    setStatus('loading')
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback?: (cb: IdleRequestCallback, opts?: { timeout: number }) => void })
        .requestIdleCallback?.(load, { timeout: 1500 })
    } else {
      setTimeout(load, 0)
    }
  }, [status])

  const pool = useMemo(() => quotes ?? [], [quotes])
  const count = pool.length
  const boundedIndex = useMemo(() => (count === 0 ? 0 : ((quoteIndex % count) + count) % count), [quoteIndex, count])
  const activeQuote = useMemo(() => (count === 0 ? null : pool[boundedIndex]), [boundedIndex, count, pool])

  useEffect(() => {
    if (prefersReducedMotion) setAutoPlayEnabled(false)
  }, [prefersReducedMotion])

  useEffect(() => {
    if (!autoPlayEnabled || count === 0) return
    const id = window.setInterval(() => setQuoteIndex((c) => (c + 1) % count), autoAdvanceMs)
    return () => window.clearInterval(id)
  }, [autoPlayEnabled, autoAdvanceMs, count])

  const advanceQuote = (dir: 'forward' | 'backward') => {
    if (count === 0) return
    setQuoteIndex((c) => (dir === 'forward' ? (c + 1) % count : (c - 1 + count) % count))
  }
  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = Number(e.target.value)
    setAutoAdvanceMs(Number.isFinite(next) && next > 0 ? next : AUTOPLAY_PRESETS[1]?.value ?? 7000)
  }

  return (
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
        {!activeQuote && status === 'loading' && (
          <div className="quote-spotlight__loading" aria-live="polite">Loading quotes…</div>
        )}
        {!activeQuote && status === 'error' && (
          <div className="quote-spotlight__error" role="alert">Failed to load quotes.</div>
        )}
        <div className="quote-spotlight__controls">
          <div className="quote-spotlight__nav">
            <button type="button" className="quote-spotlight__control" onClick={() => advanceQuote('backward')} aria-label="Show previous quote">←</button>
            <div className="quote-spotlight__progress" aria-live="polite">
              {count === 0 ? (status === 'loading' ? '…' : '0 / 0') : `${boundedIndex + 1} / ${count}`}
            </div>
            <button type="button" className="quote-spotlight__control" onClick={() => advanceQuote('forward')} aria-label="Show next quote">→</button>
          </div>
          <div className="quote-spotlight__autoplay" role="group" aria-label="Automatic quote scrolling">
            <button type="button" className="quote-spotlight__toggle" onClick={() => setAutoPlayEnabled((c) => !c)}>
              {autoPlayEnabled ? 'Pause' : 'Play'}
            </button>
            <label className="quote-spotlight__speed">
              <span className="sr-only">Auto-scroll speed</span>
              <select value={autoAdvanceMs} onChange={handleSpeedChange}>
                {AUTOPLAY_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </section>
  )
}
