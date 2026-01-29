import { useEffect, useState, useRef, useCallback } from 'react'
import { trackEvent } from '../analytics'
import '../prelogo.css'

// Simplified single-question intro. Original multi-stage questions preserved in config/conveneQuestions.ts
const SINGLE_PROMPT = 'What do we need to understand, to shape the future we want?'

export interface PreLogoSequenceProps {
  onComplete: () => void
}

export default function PreLogoSequence({ onComplete }: PreLogoSequenceProps) {
  const [done, setDone] = useState(false)
  const progressedRef = useRef(false)
  const startTimeRef = useRef<number>(performance.now())

  // Impression (once) – queue if no consent yet (handled by analytics core)
  useEffect(() => {
    trackEvent({ category: 'intro', action: 'intro_impression', metadata: { mode: 'single_prompt' } })
  }, [])
  // No staged progression now.

  const handleProceed = useCallback(() => {
    if (progressedRef.current) return
    progressedRef.current = true
    setDone(true)
    const totalMs = performance.now() - startTimeRef.current
    trackEvent({ category: 'intro', action: 'intro_completed', value: Math.round(totalMs), metadata: { durationMs: Math.round(totalMs), stagesViewed: 1, mode: 'single_prompt' } })
    setTimeout(() => onComplete(), 450) // allow fade-out
  }, [onComplete])

  // keyboard accessibility: Enter/Space triggers proceed
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleProceed()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleProceed])
  const currentText = SINGLE_PROMPT

  return (
    <div className={`prelogo ${done ? 'prelogo--done' : ''}`} aria-live="polite" aria-atomic="true" role="dialog" aria-modal="true" aria-labelledby="prelogo-heading">
      <div className="prelogo__backdrop" />
      <div className="prelogo__content">
        <div className="prelogo__stage">
          <h1 id="prelogo-heading" className="prelogo__text">{currentText}</h1>
          <button type="button" className="prelogo__cta" onClick={handleProceed} autoFocus>
            Answer with us
          </button>
        </div>
        {/* Progress indicator removed in single prompt mode */}
      </div>
    </div>
  )
}
