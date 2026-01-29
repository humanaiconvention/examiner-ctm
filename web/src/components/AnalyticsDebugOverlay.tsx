import { useEffect, useState } from 'react';
import { getAnalyticsDebugInfo } from '../analytics';

export default function AnalyticsDebugOverlay() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(() => getAnalyticsDebugInfo());

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      setInfo(getAnalyticsDebugInfo());
    }, 2000);
    return () => clearInterval(id);
  }, [open]);

  return (
    <div className="analytics-debug-overlay" style={{ position: 'fixed', bottom: 8, right: 8, zIndex: 9999, fontFamily: 'monospace' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ padding: '4px 8px', fontSize: 12 }}>
        {open ? 'Close analytics debug' : 'Analytics debug'}
      </button>
      {open && (
        <div style={{ marginTop: 4, background: 'rgba(0,0,0,0.8)', color: '#fff', padding: 8, maxWidth: 320, fontSize: 11, lineHeight: 1.4 }}>
          <div>consent: {String(info.consent)}</div>
            <div>lowQ: {info.lowPriorityQueue} preQ: {info.preConsentQueue}</div>
            <div>backendQ: {info.backendTransport.queueLength}</div>
            <div>lastFlush: {info.lastFlushTs ? new Date(info.lastFlushTs).toLocaleTimeString() : '—'}</div>
            <div>breaker: {info.backendTransport.breaker.open ? 'OPEN' : 'closed'} fails: {info.backendTransport.breaker.consecutiveFailures}</div>
            <div>transport: {info.backendTransport.enabled ? 'on' : 'off'} ({info.backendTransport.endpoint || 'no-endpoint'})</div>
            <details style={{ marginTop: 4 }}>
              <summary>sampling</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(info.sampling, null, 2)}</pre>
            </details>
        </div>
      )}
    </div>
  );
}