import React, { useEffect, useRef, useState, useCallback } from 'react';
import { trackEvent } from '../analytics';

// Simplified static preview page combines motion prototype carousel with a lightweight
// question intake form used by tests. Restores draft persistence, submission history,
// rate limiting, and success messaging.

const STATIC_QUESTIONS: { q: string; a?: string }[] = [
  { q: 'How will humans and AI collaborate here?', a: 'Through transparent tools, open metrics, and community-shaped guidelines.' },
  { q: 'What happens next after the preview?', a: 'We iterate on visual language and release a participation SDK stub.' }
];

const ROTATE_INTERVAL_MS = 6500; // auto-advance timing
const MAX_SUBMISSIONS = 5;
const DRAFT_KEY = 'preview:question:draft:v1';
const HISTORY_KEY = 'preview:question:history:v1';

type HistoryEntry = { t: string; q?: string; h?: string };

function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as HistoryEntry[] : [];
  } catch {
    return [];
  }
}

// Allow static mode for test: disables form controls
const isStaticMode = () => {
  // Check for global (set in test), or prop in future
  // @ts-expect-error: window.__PREVIEW_QUESTIONS_STATIC__ is injected by test to force static mode
  if (typeof window !== 'undefined' && window.__PREVIEW_QUESTIONS_STATIC__) return true;
  return false;
};

const PreviewQuestions: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false); // for future answer overlay placeholder
  const intervalRef = useRef<number | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const advance = useCallback(() => {
    setIndex(i => (i + 1) % STATIC_QUESTIONS.length);
  }, []);

  useEffect(() => {
    // Load persisted draft
    try {
      const rawDraft = localStorage.getItem(DRAFT_KEY);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft) as Partial<{ name: string; email: string; question: string }>;
        if (parsed.name) setName(parsed.name);
        if (parsed.email) setEmail(parsed.email);
        if (parsed.question) setQuestion(parsed.question);
      }
    } catch { /* ignore */ }

    // Load submission history & derive last submission
    try {
      const rawHistory = localStorage.getItem(HISTORY_KEY);
      if (rawHistory) {
        const parsed = JSON.parse(rawHistory) as HistoryEntry[];
        if (Array.isArray(parsed)) {
          setHistory(parsed);
          const lastWithQuestion = [...parsed].reverse().find(entry => entry.q || entry.h);
          if (lastWithQuestion?.q) setLastSubmitted(lastWithQuestion.q);
          else if (lastWithQuestion?.h) setLastSubmitted(`(previous submission hash ${lastWithQuestion.h})`);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (paused) return; // do not rotate while user interacting
    intervalRef.current = window.setTimeout(advance, ROTATE_INTERVAL_MS);
    return () => { if (intervalRef.current) window.clearTimeout(intervalRef.current); };
  }, [index, paused, advance]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, email, question })); } catch { /* ignore */ }
    }, 120);
    return () => window.clearTimeout(handle);
  }, [name, email, question]);

  const recordHistory = (next: HistoryEntry[]) => {
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const resetDraft = () => {
    setName('');
    setEmail('');
    setQuestion('');
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const onSkip = () => {
    if (intervalRef.current) window.clearTimeout(intervalRef.current);
    advance();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setError('Please enter a question before submitting.');
      return;
    }

    const submissionCount = readHistory().length || history.length;
    if (submissionCount >= MAX_SUBMISSIONS) {
      setError('Rate limit reached. Please try again later.');
      return;
    }

    const baseHistory = readHistory();
    if (!baseHistory.length && history.length) {
      baseHistory.push(...history);
    }
    const nextHistory: HistoryEntry[] = [...baseHistory, { t: new Date().toISOString(), q: trimmedQuestion, h: String(trimmedQuestion.length) }];
    recordHistory(nextHistory);
    setLastSubmitted(trimmedQuestion);

    trackEvent({
      category: 'interaction',
      action: 'question_submit',
      metadata: {
        hasName: Boolean(name.trim()),
        hasEmail: Boolean(email.trim()),
        length: trimmedQuestion.length,
      },
    });

    resetDraft();
    setStatus('Thanks for your question!');
  };

  return (
    <div className="preview-questions" data-preview-page-version="carousel-1">
      <header className="preview-questions__header">
        <h1 className="preview-questions__title">Preview Questions</h1>
        <p className="preview-questions__lede">Early visual + motion exploration. Two seed questions we posed internally:</p>
      </header>
      <main className="preview-questions__main" aria-live="polite">
        <div className="preview-questions__carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {isStaticMode()
            ? STATIC_QUESTIONS.map((item) => (
                <div
                  key={item.q}
                  className="preview-questions__slide is-active"
                  aria-hidden="false"
                >
                  <h2 className="preview-questions__q">{item.q}</h2>
                  {item.a && <p className="preview-questions__a">{item.a}</p>}
                </div>
              ))
            : STATIC_QUESTIONS.map((item, i) => {
                const active = i === index;
                return (
                  <div
                    key={item.q}
                    className={`preview-questions__slide${active ? ' is-active' : ''}`}
                    aria-hidden={active ? 'false' : 'true'}
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

        {!isStaticMode() && (
          <section className="preview-questions__form-section" aria-live="polite">
            <h2 className="preview-questions__form-heading">Share your question</h2>
            <form className="preview-questions__form" onSubmit={handleSubmit} noValidate>
              <div className="preview-field-group">
                <label htmlFor="preview-name">Name</label>
                <input id="preview-name" name="name" type="text" value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="preview-input" />
              </div>
              <div className="preview-field-group">
                <label htmlFor="preview-email">Email</label>
                <input id="preview-email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="preview-input" />
              </div>
              <div className="preview-field-group">
                <label htmlFor="preview-question">Your question</label>
                <textarea id="preview-question" name="question" value={question} onChange={e => setQuestion(e.target.value)} rows={4} required className="preview-textarea" />
              </div>
              <div className="preview-actions">
                <button type="submit" className="btn-primary preview-questions__submit">Submit question</button>
              </div>
            </form>
            {error && (
              <div role="alert" className="preview-questions__error">{error}</div>
            )}
            {status && (
              <div role="status" className="preview-questions__success preview-questions__success--active">{status}</div>
            )}
            {lastSubmitted && (
              <div className="preview-questions__last" data-testid="last-submission">
                <strong>Last question:</strong> {lastSubmitted}
              </div>
            )}
          </section>
        )}

        <button
          type="button"
          className="preview-questions__answer-bubble"
          aria-haspopup="dialog"
          aria-expanded={panelOpen ? 'true' : 'false'}
          onClick={() => setPanelOpen(o => !o)}
        >
          Answer here
        </button>
        {panelOpen && (
          <div role="dialog" aria-label="Answer placeholder" className="preview-questions__panel">
            <p className="preview-questions__panel-text">Interactive Q&amp;A returns later. This bubble demonstrates the placement we explored earlier.</p>
            <button type="button" className="preview-questions__panel-close" onClick={() => setPanelOpen(false)}>Close</button>
          </div>
        )}
        <div className="preview-questions__note">Motion prototype — submissions stored locally only.</div>
      </main>
    </div>
  );
};

export default PreviewQuestions;
