import { useEffect } from 'react'
import '../App.css'
import { trackEvent } from '../analytics'
import { PILLARS } from '../config/pillars'
import SubPageHeader from '../components/SubPageHeader'

export default function LearnMore() {
  // Fire a lightweight analytics pageview (distinct from router-level instrumentation)
  useEffect(() => {
    trackEvent({ category: 'navigation', action: 'page_view', label: 'learn_more' })
  }, [])

  // Minimal SEO/meta augmentation (idempotent)
  useEffect(() => {
    const title = 'Learn More – HumanAI Convention'
    document.title = title
    const ensure = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.querySelector(`[${attr}="${key}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, key)
        document.head.appendChild(el)
      }
      if (el.getAttribute('content') !== content) el.setAttribute('content', content)
    }
    ensure('name', 'description', 'Mission and vision of HumanAI Convention – building ethical, participatory infrastructure for collective intelligence.')
    ensure('property', 'og:title', title)
    ensure('property', 'og:description', 'Mission and vision of HumanAI Convention.')
  }, [])

  return (
    <div className="learn-page" data-page="learn-more">
      <a href="#mission-heading" className="skip-link">Skip to mission</a>
      <a href="#vision-heading" className="skip-link">Skip to vision</a>
      <SubPageHeader activePage="learn-more" />
      
      <main className="learn-main" id="content">
        <div className="learn-block learn-block--intro" style={{ paddingTop: '4rem', paddingBottom: '2rem' }}>
          <div className="learn-block__inner">
            <h1>Learn More</h1>
            <p className="lede">Mission, vision, and the scaffolding we are building for collective intelligence.</p>
            <nav aria-label="Section navigation" className="learn-subnav">
              <ul>
                <li><a href="#mission-heading">Mission</a></li>
                <li><a href="#vision-heading">Vision</a></li>
                <li><a href="#values-heading">Values</a></li>
                <li><a href="/convention">The Convention</a></li>
              </ul>
            </nav>
          </div>
        </div>
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
        <section className="learn-block learn-block--alt" aria-labelledby="vision-heading">
          <div className="learn-block__inner">
            <h2 id="vision-heading" className="learn-heading">Our vision</h2>
            <div className="learn-rich-text">
              <p>We see the development of artificial general intelligence (AGI) and the definition of consciousness not as separate frontiers, but as one shared quest.</p>
              <p>AGI is commonly understood as an intelligence capable of performing any cognitive task a human can, with the ability to learn, adapt, and generalize across domains. Consciousness, meanwhile, remains one of humanity’s most profound open questions — the lived experience of awareness, agency, and meaning.</p>
              <p>At HumanAI Convention, we believe these two challenges are inseparable. To build AGI responsibly, we must deepen our understanding of consciousness. To define consciousness rigorously, we must explore how intelligence emerges, adapts, and interacts with the world.</p>
              <p>Our vision is to create a participatory, open-source commons where researchers, communities, and everyday users can:</p>
              <ul className="vision-list vision-list--compact">
                <li>Model and explore consciousness through modular dashboards and wiki trees.</li>
                <li>Contribute to AGI development by testing, remixing, and refining theories in transparent, reproducible ways.</li>
                <li>Track the evolution of ideas across individuals and communities, building a living knowledge graph of mind and intelligence.</li>
                <li>Anchor progress in ethics and equity, ensuring that the path toward AGI is guided by collective wisdom and public benefit.</li>
              </ul>
              <p>We are not just observers of this quest — we are builders of the scaffolding that allows humanity to approach it together. By weaving rigorous science with playful, participatory design, HumanAI Convention will help transform the defining challenge of our century into a shared, navigable journey.</p>
            </div>
          </div>
        </section>
        <section className="learn-block" aria-labelledby="values-heading">
          <div className="learn-block__inner">
            <h2 id="values-heading" className="learn-heading">Our Values</h2>
            <div className="learn-rich-text">
              <div className="value-item">
                <h3 className="text-xl font-bold text-white mb-2">Informed Agency</h3>
                <p>We believe individuals must have absolute clarity and control over how their data contributes to the collective intelligence. Consent is not a one-time checkbox, but an ongoing, deliberative process.</p>
              </div>
              
              <div className="value-item mt-8">
                <h3 className="text-xl font-bold text-white mb-2">Radical Transparency</h3>
                <p>To build trust in AI, the scaffolding must be visible. We prioritize open-source protocols, reproducible methodologies, and clear accountability for how human input shapes model behavior.</p>
              </div>

              <div className="value-item mt-8">
                <h3 className="text-xl font-bold text-white mb-2">Cognitive Diversity</h3>
                <p>Intelligence thrives on variety. We value data practices that represent the full spectrum of human culture, language, and experience, ensuring AI reflects the many, not just the few.</p>
              </div>

              <div className="value-item mt-8">
                <h3 className="text-xl font-bold text-white mb-2">Epistemic Humility</h3>
                <p>As we explore the frontiers of consciousness and AI, we approach our work with the scientific rigor to admit what we do not yet know, and the cultural sensitivity to listen to the communities we serve.</p>
              </div>

              <div className="value-item mt-8">
                <h3 className="text-xl font-bold text-white mb-2">Collective Benefit</h3>
                <p>Progress in AI should not be a zero-sum game. We align our development with prioritizing outcomes that increase the shared wealth of human knowledge and safety.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'HumanAI Convention',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://www.humanaiconvention.com',
          description: 'Mission and vision of HumanAI Convention – building ethical, participatory infrastructure for collective intelligence.',
          foundingDate: '2025',
          sameAs: [
            'https://github.com/humanaiconvention'
          ],
          mission: 'Catalyzing beneficial artificial intelligence by ethically cultivating robust human data.'
        }) }}
      />
    </div>
  )
}
