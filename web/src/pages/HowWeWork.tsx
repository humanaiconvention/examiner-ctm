import { useEffect } from 'react'
import '../App.css'
import { trackEvent } from '../analytics'

export default function HowWeWork() {
  useEffect(() => {
    trackEvent({ category: 'navigation', action: 'page_view', label: 'how_we_work' })
  }, [])

  useEffect(() => {
    const title = 'How we work  HumanAI Convention'
    document.title = title
    let el = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute('name', 'description')
      document.head.appendChild(el)
    }
    el.setAttribute('content', 'How HumanAI Convention collaborates: participatory research, reproducible pipelines, and open stewardship.')
  }, [])

  return (
    <div className="learn-page" data-page="how-we-work">
      <header className="hero hero--lean">
        <div className="hero__inner hero__inner--narrow">
          <h1>How we work</h1>
          <p className="lede">Practical scaffolding for participatory, reproducible research.</p>
        </div>
      </header>
      <main className="learn-main">
        <section className="learn-block">
          <div className="learn-block__inner">
            <h2>Approach</h2>
            <p>We combine open-source tools, rigorous evaluation, and community governance to ensure research is reproducible and aligned with public benefit.</p>
            <h3>Key practices</h3>
            <ul>
              <li>Publish machine-readable ModuleEthicsProfiles for every new module.</li>
              <li>Include tests that exercise evaluator rules before merge.</li>
              <li>Estimate resource budgets (energy, network) per interaction.</li>
              <li>Provide exportable artifacts and provenance for user-contributed data.</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  )
}
