import { useEffect } from 'react'
import SubPageHeader from '../components/SubPageHeader'
import '../App.css'
import { trackEvent } from '../analytics'

export default function Framework() {
  useEffect(() => {
    trackEvent({ category: 'navigation', action: 'page_view', label: 'framework' })
    document.title = 'The Framework – HumanAI Convention'
  }, [])

  return (
    <div className="learn-page" data-page="framework">
      <SubPageHeader activePage="framework" />

      <main className="learn-main" id="content">
        <div className="learn-block learn-block--intro" style={{ paddingTop: '4rem', paddingBottom: '2rem' }}>
          <div className="learn-block__inner">
            <h1>The Framework</h1>
            <p className="lede">A unified approach to aligning artificial intelligence with human viability.</p>
          </div>
        </div>
        <section className="learn-block" aria-labelledby="architecture-heading">
          <div className="learn-block__inner">
            <h2 id="architecture-heading" className="learn-heading">Architecture of Alignment</h2>
            <p className="learn-intro">
              The HumanAI Framework integrates theoretical rigor with participatory action. It is composed of three interlocking layers designed to ensure AI systems remain viable partners for humanity.
            </p>
            
            <div className="framework-layers">
              <article className="framework-layer">
                <h3>1. The Conscious Turing Machine (CTM)</h3>
                <p>A theoretically computable substratum that models how awareness and agency emerge from physical processes. By grounding AI in a formal model of consciousness, we move beyond mere pattern matching toward verifiable understanding.</p>
              </article>

              <article className="framework-layer">
                <h3>2. The Viability Interface</h3>
                <p>A consensual data layer where lived human meaning is distilled into machine-navigable grounding signals. This interface ensures that as AI capabilities scale, our capacity for alignment and safety scales with them.</p>
              </article>

              <article className="framework-layer">
                <h3>3. Participatory Semantic Grounding</h3>
                <p>The bridge between mathematical optimization and human value. By anchoring AI models in high-fidelity, consensual human data, we prevent model collapse and hallucination while preserving the nuance of collective lived meaning.</p>
              </article>
            </div>
            
            <div className="cta-row" style={{ marginTop: '2rem' }}>
              <a href="/learn-more" className="cta btn-secondary" onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/learn-more'); window.dispatchEvent(new PopStateEvent('popstate')); }}>Learn more about our vision</a>
            </div>
          </div>
        </section>

        <section className="learn-block learn-block--alt" aria-labelledby="modules-heading">
          <div className="learn-block__inner">
            <h2 id="modules-heading" className="learn-heading">Open Source Modules</h2>
            <p className="mb-8">Active tools and research implementations currently in development.</p>
            
            <div className="grid md:grid-cols-2 gap-6 mt-8">
              {/* Examiner-CTM Card */}
              <a href="/examiner-ctm/" className="framework-card group">
                <div className="framework-card__icon bg-purple-500/20">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                  </svg>
                </div>
                <div className="framework-card__content">
                  <div className="flex justify-between items-start">
                    <h3 className="group-hover:text-purple-400 transition">Examiner-CTM</h3>
                    <span className="text-xs font-mono text-gray-500">v5.1.1</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">Continuous Thought Machine with 7 Sovereign Pillars, Hybrid Loss Architecture, and AMER-RCL curriculum.</p>
                  <div className="framework-card__link text-purple-400 mt-4">
                    <span>View Documentation</span>
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                    </svg>
                  </div>
                </div>
              </a>

              {/* CTM Monitor Card */}
              <a href="/ctm-monitor/" className="framework-card group">
                <div className="framework-card__icon bg-cyan-500/20">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                  </svg>
                </div>
                <div className="framework-card__content">
                  <div className="flex justify-between items-start">
                    <h3 className="group-hover:text-cyan-400 transition">CTM Monitor</h3>
                    <span className="text-xs font-mono text-gray-500">v1.0.0</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">Real-time training dashboard. Live metrics, 7-pillar visualization, liquid lattice topology.</p>
                  <div className="framework-card__link text-cyan-400 mt-4">
                    <span>View Dashboard</span>
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                    </svg>
                  </div>
                </div>
              </a>
            </div>
            
            <div className="mt-12 p-8 rounded-xl border border-dashed border-white/10 bg-black/20 text-center">
              <p className="text-gray-500 italic">More modules coming soon</p>
            </div>
          </div>
        </section>
      </main>
      
      <style>{`
        .framework-layers {
          display: grid;
          gap: 2rem;
          margin-top: 3rem;
        }
        .framework-layer h3 {
          color: #fff;
          font-size: 1.25rem;
          margin-bottom: 0.75rem;
          font-weight: 600;
        }
        .framework-layer p {
          color: #ccc;
          line-height: 1.6;
        }
        .framework-card {
           display: flex;
           gap: 1.5rem;
           padding: 1.5rem;
           background: rgba(255, 255, 255, 0.03);
           border: 1px solid rgba(255, 255, 255, 0.1);
           border-radius: 1rem;
           transition: all 0.3s ease;
           text-decoration: none;
           color: inherit;
        }
        .framework-card:hover {
          background: rgba(255, 255, 255, 0.05);
          transform: translateY(-2px);
          box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
        }
        .framework-card__icon {
          flex-shrink: 0;
          width: 3rem;
          height: 3rem;
          border-radius: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .framework-card__content {
          flex-grow: 1;
        }
        .framework-card__content h3 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
          color: #fff;
        }
        .framework-card__link {
          display: flex;
          items-center;
          gap: 0.5rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
        }
        @media (min-width: 768px) {
          .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .gap-6 { gap: 1.5rem; }
        .mt-8 { margin-top: 2rem; }
        .mb-8 { margin-bottom: 2rem; }
      `}</style>
    </div>
  )
}
