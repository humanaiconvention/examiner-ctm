import { useEffect } from 'react'
import '../App.css'
import { trackEvent } from '../analytics'

export default function Roadmap() {
  useEffect(() => {
    trackEvent({ category: 'navigation', action: 'page_view', label: 'roadmap' })
  }, [])

  useEffect(() => {
    const title = 'Roadmap  HumanAI Convention'
    document.title = title
    let el = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute('name', 'description')
      document.head.appendChild(el)
    }
    el.setAttribute('content', 'Indicative roadmap: evaluator, energy estimation, bundle-level compliance, attestations, and privacy modules.')
  }, [])

  return (
    <div className="learn-page" data-page="roadmap">
      <header className="hero hero--lean">
        <div className="hero__inner hero__inner--narrow">
          <h1>Roadmap</h1>
          <p className="lede">Indicative phases of work and target artifacts.</p>
        </div>
      </header>
      <main className="learn-main">
        <section className="learn-block">
          <div className="learn-block__inner">
            <h2>Phases</h2>
            <ol>
              <li>Baseline evaluator + machine-readable profiles (ethics.ts, tests).</li>
              <li>Refine energy and network estimation models.</li>
              <li>Bundle-level compliance summaries and monitoring.</li>
              <li>Cryptographic attestation of evaluator integrity.</li>
              <li>Differential privacy modules (optional).</li>
            </ol>
            <h3>Engagement</h3>
            <p>We welcome contributors from law, ethics, technical design, and community governance.</p>
          </div>
        </section>
      </main>
    </div>
  )
}
