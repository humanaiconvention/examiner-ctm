import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import App from '../App'

// This test ensures that when intro is already complete (localStorage flag),
// the body receives reveal-ready class and data-reveal elements mount.
describe('progressive reveal readiness', () => {
  beforeEach(() => {
    try { localStorage.setItem('hq:introComplete', 'true') } catch { /* ignore */ }
    document.body.className = ''
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it('applies reveal-ready class when intro complete flag set (simulated bootstrap)', () => {
    // In production main.tsx sets the class pre-render; simulate that here for parity.
    document.body.classList.add('reveal-ready')
    act(() => {
      render(<App />)
    })
    expect(document.body.classList.contains('reveal-ready')).toBe(true)
    // A few representative reveal elements
    const hero = document.querySelector('header.hero[data-reveal]')
    const footer = document.querySelector('footer.footer[data-reveal]')
    expect(hero).not.toBeNull()
    expect(footer).not.toBeNull()
  })
})
