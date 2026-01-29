// React 19 JSX runtime: no explicit import needed

import { PILLARS } from '../config/pillars'

export default function VisionSection() {
  if (typeof performance !== 'undefined') {
    performance.mark('section:vision:mounted')
  }
  return (
    <section className="section" id="vision">
      <div className="section__header">
        <h2>Our vision</h2>
        <p>
          An equitable network where every community can interrogate, shape, and steward the AI systems that affect
          their futures.
        </p>
      </div>
      <div className="pillars">
  {PILLARS.map((pillar) => (
          <article key={pillar.title} className="pillar">
            <h3>{pillar.title}</h3>
            <p>{pillar.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
