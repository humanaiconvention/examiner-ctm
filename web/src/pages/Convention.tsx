import { useEffect, useState } from 'react'
import SubPageHeader from '../components/SubPageHeader'
import '../App.css'
import { trackEvent } from '../analytics'

const FAQ_ITEMS = [
  {
    q: "Why us?",
    a: "True stewardship must come from independent citizens, not institutions with political or profit pressures. Only a diverse, unaffiliated group can guarantee neutrality, fresh perspectives, and trust."
  },
  {
    q: "How is representation ensured?",
    a: "Through layered sampling: regional population weighting, within‑region demographic stratification, and random selection in each stratum, with adjustments for clustering effects to maximize diversity and fairness."
  },
  {
    q: "How will deliberation work?",
    a: "Participants move between plenary briefings and small, facilitated panels. Discussions combine lived experience with expert input, iterating draft language until broad consensus is reached."
  },
  {
    q: "How is consent handled?",
    a: "Through a modular consent framework allowing participants to choose which data, quotes, and media can be shared — using AES-256 encrypted anonymization and k-anonymity protections."
  }
];

export default function Convention() {
  useEffect(() => {
    trackEvent({ category: 'navigation', action: 'page_view', label: 'convention' })
    document.title = 'The Convention – HumanAI Convention'
  }, [])

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    setOpenIndex(openIndex === i ? null : i);
  }

  return (
    <div className="learn-page" data-page="convention">
      <SubPageHeader activePage="convention" />
      
      <main className="learn-main" id="content">
        <div className="learn-block learn-block--intro" style={{ paddingTop: '4rem', paddingBottom: '2rem' }}>
          <div className="learn-block__inner">
            <h1>The Convention</h1>
            <p className="lede">A commitment to alignment between human intent and machine execution.</p>
          </div>
        </div>
        <section className="learn-block">
          <div className="learn-block__inner">
            <div className="learn-rich-text">
              <div style={{ marginBottom: '4rem' }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#fff', marginBottom: '1.5rem' }}>Why "convention"?</h2>
                <p style={{ fontSize: '1.2rem', lineHeight: 1.5, color: '#eee' }}>
                  Because a convention between humans and AI is necessary to establish true alignment.
                </p>
                <p style={{ fontSize: '1.2rem', lineHeight: 1.5, color: '#eee', marginTop: '1.5rem' }}>
                  What would that even look like?
                </p>
                <p style={{ fontSize: '1.1rem', color: '#888', fontStyle: 'italic', marginTop: '1rem' }}>
                  Something like this...
                </p>
              </div>

              <div className="proposal-box" style={{ 
                background: 'rgba(255,255,255,0.03)', 
                padding: '2.5rem', 
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                marginBottom: '5rem'
              }}>
                <h3 style={{ marginTop: 0, color: '#fff' }}>The Viability Constraint</h3>
                <p>
                  One proposed starting point for the HumanAI Convention is a simple constraint: 
                  <strong> Systems stay stable only when they can correct themselves at least as fast as they accumulate error.</strong>
                </p>
                
                <p style={{ marginTop: '1.5rem' }}>
                  Every lossy compression leaves a residue. When lived experience is reduced to engagement metrics or transactional data, meaning is discarded. 
                  This discarded meaning re-enters the system as <em>Entropy (E)</em>: noise, hallucinations, and misalignment.
                </p>

                <ul style={{ marginTop: '1.5rem', listStyle: 'none', padding: 0 }}>
                  <li style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
                    <span style={{ color: '#fff', fontWeight: 'bold' }}>•</span>
                    <span>If <strong>Correction (C) ≤ Entropy (E)</strong>, instability grows. Error compounds faster than institutions can respond.</span>
                  </li>
                  <li style={{ display: 'flex', gap: '1rem' }}>
                    <span style={{ color: '#fff', fontWeight: 'bold' }}>•</span>
                    <span>If <strong>Correction (C) ≥ Entropy (E)</strong>, the system can reach homeostasis. Feedback closes the loop.</span>
                  </li>
                </ul>

                <p style={{ marginTop: '2rem' }}>
                  The HumanAI Convention provides the scaffolding for <strong>Participatory Semantic Grounding</strong>: turning human narration and felt meaning back into a valid signal that keeps AI systems viable as complexity grows.
                </p>
              </div>

              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#fff', marginBottom: '2rem' }}>Operational FAQ</h2>
              
              <div className="faq-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {FAQ_ITEMS.map((item, i) => {
                  const isOpen = openIndex === i;
                  return (
                    <div key={i} className="faq-item" style={{ 
                      border: '1px solid rgba(255,255,255,0.06)', 
                      borderRadius: '4px',
                      background: isOpen ? 'rgba(255,255,255,0.02)' : 'transparent',
                    }}>
                      <button 
                        onClick={() => toggle(i)}
                        aria-expanded={isOpen}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '1rem 1.25rem',
                          background: 'none',
                          border: 'none',
                          color: isOpen ? '#fff' : '#aaa',
                          fontSize: '1rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span>{item.q}</span>
                        <span style={{ 
                          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                          fontSize: '0.8rem',
                          opacity: 0.5
                        }}>▶</span>
                      </button>
                      {isOpen && (
                        <div 
                          className="faq-answer" 
                          style={{ 
                            padding: '0.5rem 1.25rem 1.25rem',
                            color: '#999',
                            lineHeight: 1.6,
                            fontSize: '0.95rem'
                          }}
                        >
                          {item.a}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
