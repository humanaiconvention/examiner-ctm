import React from 'react';
import { PRESERVED_INTRO_QUESTIONS, PUBLIC_CONVENE_LABEL, INTERNAL_CONVENE_NAME } from '../config/conveneQuestions';
import { trackEvent } from '../analytics';

// Early scaffold for future modular dashboard ("Convene" internal name, public label "Explore").
// Provides a placeholder surface and reuses preserved intro questions as a conceptual seed list.

const Explore: React.FC = () => {
  return (
    <div className="explore-shell" data-explore-version="0.1">
      <header className="explore-header">
        <h1>{PUBLIC_CONVENE_LABEL}</h1>
        <p className="explore-sub">
          Prototype space for collaborative integrity & knowledge tooling. (Internal module codename: {INTERNAL_CONVENE_NAME}).
        </p>
      </header>
      <section aria-labelledby="explore-questions-heading" className="explore-section">
        <h2 id="explore-questions-heading">Preserved inception questions</h2>
        <ul className="explore-question-list">
          {PRESERVED_INTRO_QUESTIONS.map(q => (
            <li key={q.id} className="explore-question-item">
              <strong>{q.text}</strong>{q.sub && <span className="explore-question-sub"> — {q.sub}</span>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="explore-roadmap-heading" className="explore-section">
        <h2 id="explore-roadmap-heading">What will land here</h2>
        <ul className="explore-roadmap">
          <li>Interactive integrity artifact explorer (attestations, SBOM drift, file hashes).</li>
          <li>Reproducibility & provenance comparison sandbox.</li>
          <li>Collaborative annotation & evidence threads.</li>
          <li>Participatory governance experiment surfaces.</li>
        </ul>
      </section>
      <section className="explore-section">
        <button
          className="btn-secondary"
          onClick={() => trackEvent({ category: 'interaction', action: 'click', label: 'explore_placeholder_interest' })}
        >
          I want to help shape this
        </button>
      </section>
    </div>
  );
};

export default Explore;