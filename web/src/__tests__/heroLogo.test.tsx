import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import App from '../App'

// Mock stateful banner/gate components to avoid act() warnings unrelated to logo rendering.
vi.mock('../components/AuthBanner', () => ({ __esModule: true, default: () => null }))
vi.mock('../components/PasswordGate', () => ({ __esModule: true, default: (p: { children: React.ReactNode }) => <>{p.children}</> }))

describe('Hero Logo', () => {
  it('renders the HumanAI Convention logo with aria-label', () => {
    // Render app; intro sequence may gate content. Ensure localStorage flag to skip intro.
    try { localStorage.setItem('hq:introComplete', 'true') } catch { /* ignore */ }
    render(<App />)
  // There may now be multiple elements mentioning the logo (wrapper + svg). Select the SVG role img.
  const logoImg = screen.getByRole('img', { name: /HumanAI Convention logo/i })
  expect(logoImg).toBeTruthy()
  const titleEl = logoImg.querySelector('title')
  expect(titleEl?.textContent).toMatch(/HumanAI Convention/i)
  })
})
