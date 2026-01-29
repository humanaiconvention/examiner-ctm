// React 19 JSX runtime: no explicit import needed

const contactChannels = [
  { label: 'Join the conversation', href: '#coming-soon' },
  { label: 'Request a pilot partnership', href: '#coming-soon' },
  { label: 'Subscribe for updates', href: '#coming-soon' }
]

export default function ParticipateSection() {
  if (typeof performance !== 'undefined') {
    performance.mark('section:participate:mounted')
  }
  return (
    <section className="section" id="participate">
      <div className="section__header">
        <h2>Participate</h2>
        <p>Bring your lived experience, legal insight, scientific rigor, or design practice to the table.</p>
      </div>
      <div className="channels">
        {contactChannels.map((channel) => (
          <a key={channel.label} className="channel" href={channel.href}>
            <span>{channel.label}</span>
            <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M6 5h9v9M15 5l-10 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        ))}
      </div>
    </section>
  )
}
