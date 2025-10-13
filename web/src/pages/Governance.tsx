import { useEffect } from 'react'
import '../App.css'
import { trackEvent } from '../analytics'

export default function Governance() {
  useEffect(() => {
    trackEvent({ category: 'navigation', action: 'page_view', label: 'governance' })
  }, [])

  useEffect(() => {
    const title = 'Governance  HumanAI Convention'
    document.title = title
    let el = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute('name', 'description')
      document.head.appendChild(el)
    }
    el.setAttribute('content', 'Governance principles, evaluator rules, and contribution checklist for the HumanAI Convention.')
  }, [])

  return (
    <div className="learn-page" data-page="governance">
      <header className="hero hero--lean">
        <div className="hero__inner hero__inner--narrow">
          <h1>Governance</h1>
          <p className="lede">Principles and processes that guide change and oversight.</p>
        </div>
      </header>
      <main className="learn-main">
        <section className="learn-block">
          <div className="learn-block__inner">
            <h2>Principles & process</h2>
            <p>Changes to core principles require a semantic version bump and must include benefit vs. risk analysis.</p>
            <h3>Automated checks</h3>
            <p>Modules must publish a <code>ModuleEthicsProfile</code> and pass automated evaluator tests that compute reviewLevel.</p>
            <h3>Contribution checklist</h3>
            <ul>
              <li>Provide a ModuleEthicsProfile with declared purposes & data categories.</li>
              <li>Add tests confirming evaluator classification.</li>
              <li>Document export capability & retention.</li>
              <li>Reference the profile from produced tiles.</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  )
}
