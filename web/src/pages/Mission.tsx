import { useEffect } from 'react'
import '../App.css'
import { trackEvent } from '../analytics'
import { PILLARS } from '../config/pillars'

export default function Mission() {
  useEffect(() => {
    trackEvent({ category: 'navigation', action: 'page_view', label: 'mission' })
  }, [])

  useEffect(() => {
    document.title = 'Mission – HumanAI Convention'
  }, [])

  return (
    <div className="learn-page" data-page="mission">
      <header className="hero hero--lean" role="banner">
        <div className="hero__inner hero__inner--narrow">
          <h1>Our mission</h1>
          <p className="lede">Catalyzing beneficial artificial intelligence by ethically cultivating robust human data.</p>
        </div>
      </header>
      <main className="learn-main" id="content">
        <section className="learn-block" aria-labelledby="mission-heading">
          <div className="learn-block__inner">
            <h2 id="mission-heading" className="learn-heading">Our mission</h2>
            <p className="learn-intro">Catalyzing beneficial artificial intelligence by ethically cultivating robust human data.</p>
            <div className="pillars pillars--centered" role="list" aria-label="Mission pillars">
              {PILLARS.map(p => (
                <article key={p.title} className="pillar pillar--elevated" role="listitem">
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
