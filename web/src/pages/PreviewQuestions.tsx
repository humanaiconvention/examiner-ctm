import React, { useEffect, useRef, useState, useCallback } from 'react';

// Simplified static preview page: display two curated preview questions only.
// All prior submission / rate limit / localStorage logic removed per request.
// If future interactivity returns, restore from VCS history.

const STATIC_QUESTIONS: { q: string; a?: string }[] = [
  { q: 'How will humans and AI collaborate here?', a: 'Through transparent tools, open metrics, and community-shaped guidelines.' },
  { q: 'What happens next after the preview?', a: 'We iterate on visual language and release a participation SDK stub.' }
];

const ROTATE_INTERVAL_MS = 6500; // auto-advance timing

const PreviewQuestions: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false); // for future answer overlay placeholder
  const intervalRef = useRef<number | null>(null);

  const advance = useCallback(() => {
    setIndex(i => (i + 1) % STATIC_QUESTIONS.length);
  }, []);

  useEffect(() => {
    if (paused) return; // do not rotate while user interacting
    intervalRef.current = window.setTimeout(advance, ROTATE_INTERVAL_MS);
    return () => { if (intervalRef.current) window.clearTimeout(intervalRef.current); };
  }, [index, paused, advance]);

  const onSkip = () => {
    if (intervalRef.current) window.clearTimeout(intervalRef.current);
    advance();
  };

  return (
    <div className="preview-questions" data-preview-page-version="carousel-1">
      <header className="preview-questions__header">
        <h1 className="preview-questions__title">Preview</h1>
        <p className="preview-questions__lede">Early visual + motion exploration. Two seed questions we posed internally:</p>
      </header>
      <main className="preview-questions__main" aria-live="polite">
        <div className="preview-questions__carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {STATIC_QUESTIONS.map((item, i) => {
            const active = i === index;
            return (
              <div
                key={i}
                className={"preview-questions__slide" + (active ? ' is-active' : '')}
                aria-hidden={!active}
                style={{
                  position: active ? 'relative' : 'absolute',
                  opacity: active ? 1 : 0,
                  transition: 'opacity 600ms ease',
                }}
              >
                <h2 className="preview-questions__q">{item.q}</h2>
                {item.a && <p className="preview-questions__a">{item.a}</p>}
              </div>
            );
          })}
        </div>
        <div className="preview-questions__controls">
          <button type="button" onClick={onSkip} className="preview-questions__skip" aria-label="Skip to next question">Skip ↺</button>
        </div>
        <button
          type="button"
          className="preview-questions__answer-bubble"
          aria-haspopup="dialog"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen(o => !o)}
          style={{ position: 'fixed', right: '1rem', bottom: '1rem', borderRadius: '999px', padding: '0.75rem 1rem', background: '#222', color: '#fff', fontSize: '0.875rem' }}
        >
          Answer here
        </button>
        {panelOpen && (
          <div role="dialog" aria-label="Answer placeholder" className="preview-questions__panel" style={{ position: 'fixed', right: '1rem', bottom: '4.5rem', width: '260px', background: '#111', color: '#fff', padding: '1rem', borderRadius: '0.75rem', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
            <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.3 }}>Interactive Q&A returns later. This bubble demonstrates the placement we explored earlier.</p>
            <button type="button" onClick={() => setPanelOpen(false)} style={{ marginTop: '0.5rem', fontSize: '0.7rem' }}>Close</button>
          </div>
        )}
        <div className="preview-questions__note" style={{ marginTop: '2rem' }}>Motion prototype — no submissions stored.</div>
      </main>
    </div>
  );
};

export default PreviewQuestions;
