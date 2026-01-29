import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import App from '../App'

// Minimal mock for gate component structure if lazy loaded within App
// Objective: Ensure that while body has intro-pending the intro gate wrapper is present & not display:none

describe('intro gate visibility during pending phase', () => {
  beforeEach(() => {
    // Simulate first visit: ensure flag not set
    try { localStorage.removeItem('hq:introComplete') } catch { /* ignore */ }
    document.body.className = ''
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a visible intro gate wrapper early in initial load', () => {
    act(() => {
      render(<App />)
    })
    const gate = document.querySelector('.intro-gate') as HTMLElement | null
    expect(gate).not.toBeNull()
    if (gate) {
      const style = getComputedStyle(gate)
      // We only assert it is not fully hidden; allow opacity transitions
      expect(style.display).not.toBe('none')
      expect(style.visibility).not.toBe('hidden')
    }
  })
})
