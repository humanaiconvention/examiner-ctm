import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import PreLogoSequence from './PreLogoSequence'

// Mock analytics trackEvent to capture calls
vi.mock('../analytics', () => {
  return {
    trackEvent: vi.fn(),
  };
});
import { trackEvent } from '../analytics'

// Advance timers utility
function advance(ms: number) {
  act(() => { vi.advanceTimersByTime(ms) })
}

describe('PreLogoSequence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('progresses through stages and calls onComplete after CTA click', () => {
    const handleComplete = vi.fn()
    render(<PreLogoSequence onComplete={handleComplete} />)

    // initial stage present
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/What if defining consciousness/i)).toBeInTheDocument()

  // fast-forward first stage (~6.4s)
  advance(6500)
    expect(screen.getByText(/What if AGI emerges/i)).toBeInTheDocument()

  advance(6500)
    expect(screen.getByText(/What if data governance/i)).toBeInTheDocument()

  // Jump to CTA by advancing enough total time for remaining stages
  advance(6500 * 3)
    expect(screen.getByText(/Ready to convene/i)).toBeInTheDocument()

    const enterBtn = screen.getByRole('button', { name: /Enter/i })
    enterBtn.click()
    // allow fade wait
    advance(600)
    expect(handleComplete).toHaveBeenCalledTimes(1)

    // Verify telemetry events
    const calls = (trackEvent as unknown as ReturnType<typeof vi.fn>).mock.calls
    const actions = calls.map(c => c[0].action)
    expect(actions).toContain('intro_impression')
    expect(actions).toContain('intro_stage_view')
    expect(actions).toContain('intro_completed')
  })

})
