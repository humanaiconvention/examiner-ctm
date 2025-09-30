import { useEffect, useState } from 'react';
import { hasAnalyticsConsent, setAnalyticsConsent, onConsentGranted, onConsentDenied, setUserContext } from '../analytics';

interface Props {
  storageKeyEmail?: string;
}

// Lightweight consent banner with optional email/handle capture.
// Appears only if no prior consent stored (granted or denied).
export default function AnalyticsConsentBanner({ storageKeyEmail = 'haic:userEmail' }: Props) {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [hasDecision, setHasDecision] = useState(false);

  useEffect(() => {
    try {
      const persisted = localStorage.getItem('haic:analyticsConsent');
      if (!persisted) {
        setVisible(true);
      }
      const storedEmail = localStorage.getItem(storageKeyEmail);
      if (storedEmail) setEmail(storedEmail);
    } catch { /* ignore */ }
  }, [storageKeyEmail]);

  if (!visible || hasAnalyticsConsent()) return null;

  const persistEmail = (val: string) => {
    try { localStorage.setItem(storageKeyEmail, val); } catch { /* ignore */ }
  };

  const applyConsent = (granted: boolean) => {
    setAnalyticsConsent(granted);
    if (granted) {
      if (email.trim()) {
        persistEmail(email.trim());
        setUserContext(email.trim(), { source: 'consent_banner' });
      }
      onConsentGranted();
    } else {
      onConsentDenied();
    }
    setHasDecision(true);
    setTimeout(() => setVisible(false), 250);
  };

  return (
    <div className={`analytics-consent-banner ${hasDecision ? 'is-hiding' : ''}`} role="dialog" aria-live="polite" aria-label="Analytics consent">
      <div className="analytics-consent-banner__content">
        <p className="analytics-consent-banner__text">
          We use lightweight, sampled analytics (no ads) to understand engagement and improve the experience. You can opt in or decline. Optional: share an email/handle so we can correlate feedback.
        </p>
        <div className="analytics-consent-banner__fields">
          <label>
            <span className="sr-only">Email or handle (optional)</span>
            <input
              type="text"
              inputMode="email"
              placeholder="Email or handle (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <div className="analytics-consent-banner__actions">
            <button type="button" className="btn btn--decline" onClick={() => applyConsent(false)}>Decline</button>
            <button type="button" className="btn btn--accept" onClick={() => applyConsent(true)}>Allow</button>
          </div>
        </div>
      </div>
    </div>
  );
}