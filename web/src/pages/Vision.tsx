import { useEffect } from 'react'
import '../App.css'
import { trackEvent } from '../analytics'

export default function Vision() {
  useEffect(() => {
    trackEvent({ category: 'navigation', action: 'page_view', label: 'vision' })
  }, [])

  useEffect(() => {
    document.title = 'Vision – HumanAI Convention'
  }, [])

  return (
    <div className="learn-page" data-page="vision">
      <header className="hero hero--lean" role="banner">
        <div className="hero__inner hero__inner--narrow">
          <h1>Our vision</h1>
          <p className="lede">An equitable network where every community can interrogate, shape, and steward the AI systems that affect their futures.</p>
        </div>
      </header>
      <main className="learn-main" id="content">
        <section className="learn-block learn-block--alt" aria-labelledby="vision-heading">
          <div className="learn-block__inner">
            <h2 id="vision-heading" className="learn-heading">Our vision</h2>
            <div className="learn-rich-text">
              <p>We see the development of artificial general intelligence (AGI) and the definition of consciousness not as separate frontiers, but as one shared quest.</p>
              <p>At HumanAI Convention, we believe these two challenges are inseparable. To build AGI responsibly, we must deepen our understanding of consciousness. To define consciousness rigorously, we must explore how intelligence emerges, adapts, and interacts with the world.</p>
              <p>Our vision is to create a participatory, open-source commons where researchers, communities, and everyday users can:</p>
              <ul className="vision-list vision-list--compact">
                <li>Model and explore consciousness through modular dashboards and wiki trees.</li>
                <li>Contribute to AGI development by testing, remixing, and refining theories in transparent, reproducible ways.</li>
                <li>Track the evolution of ideas across individuals and communities, building a living knowledge graph of mind and intelligence.</li>
                <li>Anchor progress in ethics and equity, ensuring that the path toward AGI is guided by collective wisdom and public benefit.</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
