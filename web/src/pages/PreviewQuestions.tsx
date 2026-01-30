import React from 'react';
import SubPageHeader from '../components/SubPageHeader';
import { trackEvent } from '../analytics';

// Minimalist technical entry point.
// "High-end research lab" vibe: sparse, precise, functional.

const PreviewQuestions: React.FC = () => {
  return (
    <div className="preview-questions" data-preview-page-version="lab-entry">
      <SubPageHeader activePage="preview" />
      <main className="preview-questions__main" style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        padding: '2rem'
      }}>
        
        <h1 className="preview-questions__title" style={{ 
          fontSize: '2.5rem', 
          fontWeight: 500, 
          letterSpacing: '-0.03em',
          marginBottom: '3rem' 
        }}>
          Research Preview
        </h1>

        <section className="preview-questions__cta-section" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.5rem',
            maxWidth: '600px',
        }}>
           <a
             href="/technical-deep-dive"
             style={{
               display: 'inline-flex',
               alignItems: 'center',
               gap: '0.85rem',
               padding: '1.2rem 2.8rem',
               backgroundColor: '#fff',
               color: '#050505',
               fontWeight: 600,
               fontSize: '1rem',
               textDecoration: 'none',
               borderRadius: '2px', // Sharp, technical feel
               transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
               letterSpacing: '0.02em',
               border: '1px solid #fff'
             }}
             onMouseOver={(e) => {
               (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
               (e.currentTarget as HTMLAnchorElement).style.color = '#fff';
             }}
             onMouseOut={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#fff';
                (e.currentTarget as HTMLAnchorElement).style.color = '#050505';
             }}
             onClick={(e) => {
               e.preventDefault();
               window.history.pushState({}, '', '/technical-deep-dive');
               window.dispatchEvent(new PopStateEvent('popstate'));
               trackEvent({ category: 'navigation', action: 'click', label: 'technical_deep_dive' });
             }}
           >
             <span>Technical Deep Dive</span>
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
           </a>
           
           <p style={{ 
             color: '#555', 
             fontFamily: '"JetBrains Mono", monospace', 
             fontSize: '0.75rem', 
             letterSpacing: '0.08em',
             textTransform: 'uppercase',
             opacity: 0.7
           }}>
             Architectural Specifications & Live Telemetry
           </p>
           
           <a href="/convention" style={{
             marginTop: '1rem',
             color: '#444',
             textDecoration: 'none',
             fontSize: '0.8rem',
             opacity: 0.6,
             transition: 'opacity 0.2s',
             borderBottom: '1px solid transparent'
           }}
           onMouseOver={(e) => (e.currentTarget as HTMLAnchorElement).style.opacity = '1'}
           onMouseOut={(e) => (e.currentTarget as HTMLAnchorElement).style.opacity = '0.6'}
           >
             The Convention
           </a>
        </section>
      </main>
    </div>
  );
};

export default PreviewQuestions;
