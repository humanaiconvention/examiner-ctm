import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { axe } from 'jest-axe'
import PreLogoSequence from './PreLogoSequence'

// Mock analytics trackEvent to capture calls
vi.mock('../analytics', () => {
  return {
    trackEvent: vi.fn(),
  };
});
import { trackEvent } from '../analytics'


describe('PreLogoSequence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows single prompt and completes on CTA click', () => {
    vi.useFakeTimers()
    const handleComplete = vi.fn()
    render(<PreLogoSequence onComplete={handleComplete} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/What do we need to understand, to shape the future we want\?/i)).toBeInTheDocument()
  const enterBtn = screen.getByRole('button', { name: /Answer with us/i })
    act(() => {
      enterBtn.click()
      vi.advanceTimersByTime(600)
    })
    vi.useRealTimers()
    expect(handleComplete).toHaveBeenCalledTimes(1)
    const calls = (trackEvent as unknown as ReturnType<typeof vi.fn>).mock.calls
    const actions = calls.map(c => c[0].action)
    expect(actions).toContain('intro_impression')
    expect(actions).toContain('intro_completed')
    // stage_view no longer emitted in single prompt mode
  })

  it('exposes accessible dialog semantics and labels', () => {
    const handleComplete = vi.fn()
    render(<PreLogoSequence onComplete={handleComplete} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Ensure heading serves as accessible name source
    const heading = screen.getByRole('heading', { name: /what do we need to understand/i })
    expect(heading).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: /answer with us/i })
    expect(cta).toBeInTheDocument()
  })

  it('matches initial render snapshot', () => {
    const { container } = render(<PreLogoSequence onComplete={() => {}} />)
    // Strip dynamic attributes if any in future (placeholder for stability)
    expect(container.firstChild).toMatchSnapshot()
  })

  it('has no basic axe-core violations', async () => {
    // Use real timers to avoid jsdom + fake timer interaction delaying MutationObserver flushes
    const { container } = render(<PreLogoSequence onComplete={() => {}} />)
    const root = container.querySelector('[role="dialog"]') as HTMLElement
    const results = await axe(root || container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results).toHaveNoViolations()
  }, 15000)

})
