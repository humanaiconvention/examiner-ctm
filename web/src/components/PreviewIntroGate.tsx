import { useCallback, useEffect, useRef, useState } from 'react';
import { trackEvent } from '../analytics';
import '../previewIntro.css';

export interface PreviewIntroGateProps {
  onComplete: () => void;
  lingerMs?: number; // override linger threshold for testing
  visibilityDebounceMs?: number; // override visibility debounce
}

// Timings (ms) – configurable constants
const FIRST_QUESTION_VISIBLE_MS = 3000; // shortened per new requirement
const INTER_QUESTION_FADE_MS = 1000;    // main crossfade duration
const SECOND_QUESTION_BEFORE_CTA_MS = 2500; // delay after second fully visible before CTA
const EXIT_FADE_MS = 600;               // fade out when leaving (general fade duration)
const DEFAULT_LINGER_MS = 10000;        // emit linger stage if still in intro after this time
const DEFAULT_VIS_DEBOUNCE_MS = 120;    // debounce for visibility hidden detection

const Q1 = 'What is consciousness?';
const Q2 = 'How is it defined?';

type Phase = 'q1' | 'xfade' | 'q2' | 'cta' | 'exiting';

export default function PreviewIntroGate({ onComplete, lingerMs, visibilityDebounceMs }: PreviewIntroGateProps) {
  const [phase, setPhase] = useState<Phase>('q1');
  const [showQ2, setShowQ2] = useState(false); // when true, Q2 span participates in crossfade
  const [removeQ1, setRemoveQ1] = useState(false); // remove Q1 from DOM after crossfade ends
  const [ctaVisible, setCtaVisible] = useState(false);
  const morphStartRef = useRef<number | null>(null);
  const progressedRef = useRef(false);
  const startRef = useRef<number>(performance.now());
  const introKey = 'hq:introComplete';

  // Accessibility: detect prefers-reduced-motion
  const prefersReducedMotion = (() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  })();

  // Impression event (fire once on mount)
  useEffect(() => {
    // Reuse existing allowed action 'intro_impression' with stage metadata
    trackEvent({ category: 'intro', action: 'intro_impression', metadata: { mode: 'dual_prompt', stage: 'q1_show', index: 0, text: Q1 } });
    try { document.dispatchEvent(new Event('intro:gate-mounted')); } catch { /* ignore */ }
    return () => {
      // If unmount occurs before completion, ensure we don't strand the page hidden
      if (!progressedRef.current) {
        try {
          if (document.body.classList.contains('intro-pending')) {
            document.body.classList.remove('intro-pending');
            document.body.classList.add('reveal-ready');
            document.body.classList.add('reveal-slow');
            document.dispatchEvent(new Event('reveal:ready'));
          }
          trackEvent({ category: 'intro', action: 'intro_impression', metadata: { mode: 'dual_prompt', stage: 'unmount_abort' } });
        } catch { /* ignore */ }
      }
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      // Skip timing, show CTA immediately
      setPhase('cta');
      setShowQ2(true);
      setRemoveQ1(true);
      setCtaVisible(true);
  trackEvent({ category: 'intro', action: 'intro_impression', metadata: { mode: 'dual_prompt', stage: 'q2_show', index: 1, text: Q2, reducedMotion: true } });
      return;
    }

    // Schedule transition from Q1 to Q2
    const localTimeouts: number[] = [];
    const t1 = window.setTimeout(() => {
      setPhase('xfade');
      setShowQ2(true); // start crossfade – both visible
  trackEvent({ category: 'intro', action: 'intro_impression', metadata: { mode: 'dual_prompt', stage: 'transition_start', from: 0, to: 1, durationMs: INTER_QUESTION_FADE_MS } });
      // End of crossfade
      const tX = window.setTimeout(() => {
        setRemoveQ1(true);
        setPhase('q2');
  trackEvent({ category: 'intro', action: 'intro_impression', metadata: { mode: 'dual_prompt', stage: 'q2_show', index: 1, text: Q2 } });
        // After second question dwell, reveal CTA
        const t2 = window.setTimeout(() => {
          // Begin morph: record start & fire analytics
          morphStartRef.current = performance.now();
          trackEvent({ category: 'intro', action: 'intro_impression', metadata: { mode: 'dual_prompt', stage: 'morph_start' } });
          setPhase('cta');
          setCtaVisible(true);
        }, SECOND_QUESTION_BEFORE_CTA_MS);
        timeouts.current.push(t2); localTimeouts.push(t2);
      }, INTER_QUESTION_FADE_MS);
      timeouts.current.push(tX); localTimeouts.push(tX);
    }, FIRST_QUESTION_VISIBLE_MS);
    timeouts.current.push(t1); localTimeouts.push(t1);
    return () => { localTimeouts.forEach(id => clearTimeout(id)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timeouts = useRef<number[]>([]);
  const abandonedRef = useRef(false);
  const lingerFiredRef = useRef(false);

  // Abandonment + Linger: visibility + long dwell signals
  useEffect(() => {
    const ABANDON_MS = 15000; // 15s soft window; if they haven't completed by then and hide, mark abandon
    const markAbandon = (reason: string) => {
      if (progressedRef.current || abandonedRef.current) return;
      abandonedRef.current = true;
      trackEvent({ category: 'intro', action: 'intro_impression', metadata: { mode: 'dual_prompt', stage: 'abandon', reason } });
    };
    const visDelay = visibilityDebounceMs ?? DEFAULT_VIS_DEBOUNCE_MS;
    const LINGER_MS = lingerMs ?? DEFAULT_LINGER_MS;
    let visDebounce: number | null = null;
    const visibilityHandler = () => {
      if (visDebounce) window.clearTimeout(visDebounce);
      visDebounce = window.setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          markAbandon('visibility_hidden');
        }
      }, visDelay); // small debounce to avoid transient tab throttling flickers
    };
    document.addEventListener('visibilitychange', visibilityHandler, { passive: true });

    // Linger timer (fires once if user still hasn't completed after LINGER_MS)
    const lingerTimer = window.setTimeout(() => {
      if (!progressedRef.current && !lingerFiredRef.current) {
        lingerFiredRef.current = true;
        trackEvent({ category: 'intro', action: 'intro_impression', metadata: { mode: 'dual_prompt', stage: 'linger', atMs: LINGER_MS } });
      }
    }, LINGER_MS);
    timeouts.current.push(lingerTimer);
    const t = window.setTimeout(() => {
      // If at/after threshold they hide, we'll still capture via handler; if they already hid earlier we rely on handler.
      // Optional future: if still visible after threshold and no progress, could emit a 'linger' stage.
    }, ABANDON_MS);
    timeouts.current.push(t);
    return () => {
      document.removeEventListener('visibilitychange', visibilityHandler);
      if (visDebounce) window.clearTimeout(visDebounce);
    };
  }, [lingerMs, visibilityDebounceMs]);

  const complete = useCallback((opts?: { skip?: boolean }) => {
    if (progressedRef.current) return;
    progressedRef.current = true;
    const totalMs = Math.round(performance.now() - startRef.current);
    try { localStorage.setItem(introKey, 'true'); } catch { /* ignore */ }
    setPhase('exiting');
    const morphLatency = morphStartRef.current ? Math.round(performance.now() - morphStartRef.current) : undefined;
    const meta = { durationMs: totalMs, questionsShown: showQ2 ? 2 : 1, mode: 'dual_prompt', skip: !!opts?.skip, morphLatencyMs: morphLatency };
    if (opts?.skip) {
      trackEvent({ category: 'intro', action: 'intro_impression', metadata: { stage: 'skip_click', mode: 'dual_prompt' } });
    }
    // Consolidated completion event only
    trackEvent({ category: 'intro', action: 'intro_completed', value: totalMs, metadata: meta });
    // Cancel outstanding timers to avoid post-complete state updates (reduces act warnings in tests)
    timeouts.current.forEach(id => clearTimeout(id));
    timeouts.current.length = 0;
    const t = window.setTimeout(() => onComplete(), EXIT_FADE_MS);
    timeouts.current.push(t);
  }, [onComplete, showQ2]);

  // Keyboard accessibility for proceed (listener only active during CTA phase)
  useEffect(() => {
    if (phase !== 'cta') return;
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && phase === 'cta') { e.preventDefault(); complete(); }
    };
    window.addEventListener('keydown', handler, { passive: false });
    return () => window.removeEventListener('keydown', handler);
  }, [phase, complete]);

  const containerClass = [
    'preview-intro',
    phase === 'xfade' ? 'preview-intro--xfade' : '',
    phase === 'exiting' ? 'preview-intro--exiting' : '',
    prefersReducedMotion ? 'preview-intro--reduced' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClass} role="dialog" aria-modal="true" aria-labelledby="preview-intro-heading" aria-live="polite" data-phase={phase}>
      <div className="preview-intro__backdrop" />
      <div className="preview-intro__content">
        <h1 id="preview-intro-heading" className="preview-intro__heading" aria-label={showQ2 ? Q2 : Q1}>
          {/* Layered questions for crossfade */}
          {!removeQ1 && (
            <span className={['intro-question', showQ2 ? 'intro-question--fade-out' : 'intro-question--active'].join(' ')}>{Q1}</span>
          )}
          <span className={['intro-question', showQ2 ? 'intro-question--active' : ''].join(' ')} aria-hidden={!showQ2}>{Q2}</span>
        </h1>
        <div className="preview-intro__actions">
          <div className="preview-intro__morph" onAnimationEnd={(e) => {
            if (e.animationName === 'skipRetire') {
              // Retire end no longer separately emitted (consolidated analytics)
            }
          }}>
            <button
              type="button"
              className={`preview-intro__skip ${ctaVisible ? 'preview-intro__skip--retire' : 'preview-intro__skip--bloom'}`}
              onClick={() => complete({ skip: true })}
              aria-label="Skip intro and continue"
              aria-hidden={ctaVisible || undefined}
              tabIndex={ctaVisible ? -1 : 0}
            >
              Skip
            </button>
            {ctaVisible && (
              <button type="button" className="preview-intro__cta" onClick={() => complete()} autoFocus>
                Answer here
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
