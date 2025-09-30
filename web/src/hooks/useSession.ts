/** Owner session hook */
import { useEffect, useState } from 'react';

export interface SessionState {
  loading: boolean;
  authenticated: boolean;
  email?: string;
  exp?: number;
  refresh: () => void;
}

export function useSession(pollMs = 0): SessionState {
  const [state, setState] = useState<SessionState>({ loading: true, authenticated: false, refresh: () => {} });
  useEffect(() => {
    let cancelled = false;
  let timer: ReturnType<typeof setInterval> | undefined;
    const fetchSession = () => {
      fetch('/session', { headers: { 'Accept': 'application/json' } })
        .then(r => r.ok ? r.json() : { authenticated: false })
        .then(data => {
          if (cancelled) return;
          setState(s => ({ ...s, loading: false, authenticated: !!data.authenticated, email: data.email, exp: data.exp, refresh: fetchSession }));
        })
        .catch(() => { if (!cancelled) setState(s => ({ ...s, loading: false, authenticated: false, refresh: fetchSession })); });
    };
    fetchSession();
    if (pollMs > 0) {
      timer = setInterval(fetchSession, pollMs);
    }
  return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [pollMs]);
  return state;
}
