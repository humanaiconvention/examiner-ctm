import React, { useState, useEffect } from 'react';
import { useSession } from '../hooks/useSession';

// Gate behavior:
// - If neither VITE_ACCESS_PASSWORD nor VITE_ACCESS_PASSWORD_HASH is defined, gate is transparent (renders children).
// - If password/hash provided, user must enter password. We compare either plain match or SHA-256 hex (lowercase) of input against provided hash.
// - On success, set localStorage flag 'haic:pw-unlock' (scoped to current hash/plain) to skip future prompts until storage cleared or password changes.

function getPlain() { return import.meta.env.VITE_ACCESS_PASSWORD as string | undefined }
function getHash() { return import.meta.env.VITE_ACCESS_PASSWORD_HASH as string | undefined }

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function gateStorageKey(plain: string | undefined, hash: string | undefined) {
  return `haic:pw-unlock:${hash || plain || 'none'}`;
}

export interface PasswordGateProps {
  children: React.ReactNode;
  // Test hook / future extensibility: allow overriding password & hash (plain takes precedence when both provided)
  testConfig?: { password?: string; hash?: string };
}

export const PasswordGate: React.FC<PasswordGateProps> = ({ children, testConfig }) => {
  const session = useSession();
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [plain, setPlain] = useState<string | undefined>(() => testConfig?.password ?? getPlain());
  const [hash, setHash] = useState<string | undefined>(() => testConfig?.hash ?? getHash());

  useEffect(() => {
    const p = testConfig?.password ?? getPlain();
    const h = testConfig?.hash ?? getHash();
    setPlain(p); setHash(h);
    if (!p && !h) { setUnlocked(true); setChecking(false); return; }
    try {
      const v = localStorage.getItem(gateStorageKey(p, h));
      if (v === '1') setUnlocked(true);
    } catch { /* ignore */ }
    setChecking(false);
  }, [testConfig?.password, testConfig?.hash]);

  if (checking) {
    return <div className="gate-loading" aria-busy="true">Loading…</div>;
  }
  if (session.authenticated) {
    return <>{children}</>;
  }
  if (unlocked) {
    return <>{children}</>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const candidate = input.trim();
    if (!candidate) { setError('Enter password'); return; }
    try {
      if (plain && candidate === plain) {
        localStorage.setItem(gateStorageKey(plain, hash), '1');
        setUnlocked(true); return;
      }
      if (hash) {
        const digest = await sha256Hex(candidate);
        if (digest === hash.toLowerCase()) {
          localStorage.setItem(gateStorageKey(plain, hash), '1');
          setUnlocked(true); return;
        }
      }
      setError('Incorrect password');
    } catch {
      setError('Error verifying');
    }
  }

  return (
    <div className="password-gate" role="dialog" aria-modal="true" aria-label="Access Gate">
      <form className="password-gate__form" onSubmit={handleSubmit}>
        <h2 className="password-gate__title">Restricted Preview</h2>
        <p className="password-gate__hint">Enter access password to continue.</p>
        <label className="password-gate__label">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            className="password-gate__input"
            value={input}
            onChange={e => setInput(e.target.value)}
            aria-required="true"
            aria-invalid={error ? 'true' : 'false'}
          />
        </label>
        {error && <div className="password-gate__error" role="alert">{error}</div>}
        <button type="submit" className="password-gate__submit">Enter</button>
      </form>
    </div>
  );
};

export default PasswordGate;
