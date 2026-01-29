// React 19 JSX runtime: no explicit import needed

export default function ComingSoonSection() {
  if (typeof performance !== 'undefined') {
    performance.mark('section:coming-soon:mounted')
  }
  return (
    <section className="section section--coming-soon" id="coming-soon">
      <div className="section__header">
        <h2>Coming soon</h2>
        <p>We’re finalizing public touchpoints. Stay tuned for launch details and participation pathways.</p>
      </div>
    </section>
  )
}
