import { useEffect, useState, useRef, useCallback } from 'react'
import { trackEvent } from '../analytics'
import '../prelogo.css'

interface Stage {
  id: string
  text: string
  sub?: string
  durationMs?: number // optional per-stage override
}

const STAGES: Stage[] = [
  { id: 'q1', text: 'What if defining consciousness required all of us?', sub: 'A collective inquiry.' },
  { id: 'q2', text: 'What if AGI emerges from shared understanding?', sub: 'Not just models — meaning.' },
  { id: 'q3', text: 'What if data governance felt participatory?', sub: 'Agency, transparency, consent.' },
  { id: 'q4', text: 'What if alignment started with culture?', sub: 'Embedded context → resilient systems.' },
  { id: 'cta', text: 'Ready to convene?', durationMs: 5000 },
]

// Slowed pacing: doubled from 3200ms -> 6400ms
const DEFAULT_STAGE_MS = 6400

export interface PreLogoSequenceProps {
  onComplete: () => void
}

export default function PreLogoSequence({ onComplete }: PreLogoSequenceProps) {
  const [stageIndex, setStageIndex] = useState(0)
  const [done, setDone] = useState(false)
  const progressedRef = useRef(false)
  const startTimeRef = useRef<number>(performance.now())
  const lastStageRef = useRef<string | null>(null)

  // Impression (once) – queue if no consent yet (handled by analytics core)
  useEffect(() => {
    trackEvent({ category: 'intro', action: 'intro_impression', metadata: { totalStages: STAGES.length } })
  }, [])

  // Stage view events
  useEffect(() => {
    const current = STAGES[stageIndex]
    if (!current) return
    if (lastStageRef.current === current.id) return
    lastStageRef.current = current.id
    // Exclude CTA in the generic stage_view? We'll still emit with stage type.
    trackEvent({ category: 'intro', action: 'intro_stage_view', label: current.id, metadata: { index: stageIndex, isCta: current.id === 'cta' } })
  }, [stageIndex])

  // advance stages with timing
  useEffect(() => {
    if (done) return
    const stage = STAGES[stageIndex]
    if (!stage) return
    if (stage.id === 'cta') return // wait for user

    const timeout = setTimeout(() => {
      setStageIndex(i => Math.min(i + 1, STAGES.length - 1))
    }, stage.durationMs ?? DEFAULT_STAGE_MS)
    return () => clearTimeout(timeout)
  }, [stageIndex, done])

  const handleProceed = useCallback(() => {
    if (progressedRef.current) return
    progressedRef.current = true
    setDone(true)
    const totalMs = performance.now() - startTimeRef.current
    trackEvent({ category: 'intro', action: 'intro_completed', value: Math.round(totalMs), metadata: { durationMs: Math.round(totalMs), stagesViewed: stageIndex + 1 } })
    setTimeout(() => onComplete(), 450) // allow fade-out
  }, [onComplete, stageIndex])

  // keyboard accessibility: Enter/Space on CTA stage
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (STAGES[stageIndex]?.id === 'cta' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        handleProceed()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [stageIndex, handleProceed])

  const current = STAGES[stageIndex]

  return (
    <div className={`prelogo ${done ? 'prelogo--done' : ''}`} aria-live="polite" aria-atomic="true" role="dialog" aria-modal="true">
      <div className="prelogo__backdrop" />
      <div className="prelogo__content">
        <div className="prelogo__stage" key={current.id}>
          <h1 className="prelogo__text">{current.text}</h1>
          {current.sub && current.id !== 'cta' && <p className="prelogo__sub">{current.sub}</p>}
          {current.id === 'cta' && (
            <button type="button" className="prelogo__cta" onClick={handleProceed} autoFocus>
              Enter
            </button>
          )}
        </div>
        {current.id !== 'cta' && (
          <div className="prelogo__progress" aria-label="Intro progression">
            {stageIndex + 1} / {STAGES.length}
          </div>
        )}
      </div>
    </div>
  )
}
