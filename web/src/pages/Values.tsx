import { useEffect } from 'react'
import '../App.css'
import { trackEvent } from '../analytics'

export default function Values() {
  useEffect(() => {
    trackEvent({ category: 'navigation', action: 'page_view', label: 'values' })
  }, [])

  useEffect(() => {
    const title = 'Our Values  HumanAI Convention'
    document.title = title
    let el = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute('name', 'description')
      document.head.appendChild(el)
    }
    el.setAttribute('content', 'Values and ethical commitments of the HumanAI Convention. Transparency, consent, and accountability at the center of our work.')
  }, [])

  return (
    <div className="learn-page" data-page="values">
      <header className="hero hero--lean">
        <div className="hero__inner hero__inner--narrow">
          <h1>Our values</h1>
          <p className="lede">Principles guiding every module, dataset, and interaction.</p>
        </div>
      </header>
      <main className="learn-main">
        <section className="learn-block">
          <div className="learn-block__inner">
            <h2>Ethical commitments</h2>
            <ul>
              <li><strong>Bounded consent:</strong> Scope, retention, and purpose are explicit and minimal.</li>
              <li><strong>Informed:</strong> Plain-language disclosures of what is collected and shared.</li>
              <li><strong>Transparent:</strong> Source code, provenance, and decision criteria are inspectable.</li>
              <li><strong>Revocable:</strong> Participants can withdraw future participation without punitive consequences.</li>
              <li><strong>Proportional:</strong> Safeguards aligned with data and model sensitivity.</li>
              <li><strong>Accountable:</strong> Verifiable event trails for audit (non-PII by default).</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  )
}
