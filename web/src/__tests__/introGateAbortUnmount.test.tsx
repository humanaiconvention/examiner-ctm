import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import PreviewIntroGate from '../components/PreviewIntroGate'

// We spy on trackEvent to verify unmount abort emission.
vi.mock('../analytics', () => {
  return {
    trackEvent: vi.fn()
  }
})

import { trackEvent as realTrackEvent } from '../analytics'
// Cast to mocked function type (provided by vi.mock above)
const trackEvent = realTrackEvent as unknown as ReturnType<typeof vi.fn>

// Helper to simulate body gating state as in bootstrap
const primeBody = () => {
  document.body.classList.add('intro-pending')
  document.body.classList.remove('reveal-ready')
}

describe('PreviewIntroGate unmount abort', () => {
  beforeEach(() => {
  trackEvent.mockClear()
    document.body.className = ''
    primeBody()
  })

  it('clears intro-pending and emits unmount_abort stage when unmounted before completion', () => {
    const { unmount } = render(<PreviewIntroGate onComplete={() => { /* noop */ }} />)
    // Immediately unmount before timers fire
    unmount()
    expect(document.body.classList.contains('intro-pending')).toBe(false)
    expect(document.body.classList.contains('reveal-ready')).toBe(true)
    // Look for stage: unmount_abort metadata in any intro_impression call
    let abortDetected = false
    interface IntroMeta { stage?: string }
    for (const call of trackEvent.mock.calls) {
      const arg = call[0] as { category?: string; action?: string; metadata?: IntroMeta }
      if (arg?.category === 'intro' && arg?.action === 'intro_impression' && arg.metadata?.stage === 'unmount_abort') {
        abortDetected = true
        break
      }
    }
    expect(abortDetected).toBe(true)
  })
})
