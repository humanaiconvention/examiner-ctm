import { useEffect, useState } from 'react';
import { shouldAutoRefresh, type ManifestDiffResult } from './sw-logic';
import SW_CONFIG from './sw-config';
import { trackEvent } from './analytics';
// AI telemetry is now lazy-loaded; defer import until needed to keep initial chunk lean
let _trackAiEvent: ((name: string, props?: Record<string, unknown>) => void) | null = null;
async function lazyTrackAiEvent(name: string, props?: Record<string, unknown>) {
  try {
    if (!_trackAiEvent) {
      const mod = await import('./appInsights');
      _trackAiEvent = mod.trackAiEvent;
    }
    _trackAiEvent?.(name, props);
  } catch { /* ignore */ }
}

type UpdateInfo = ManifestDiffResult;

const AUTO_REFRESH_PREF_KEY = 'sw:autoRefreshEnabled';
const DEFAULT_AUTO_REFRESH_ENABLED = SW_CONFIG.autoRefresh.enabledByDefault;

const BG_UPDATE_FLAG = 'sw:bgUpdated'; // sessionStorage flag indicating a silent refresh occurred

export function useServiceWorkerUpdates() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [forceReloading, setForceReloading] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(AUTO_REFRESH_PREF_KEY);
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    } catch { /* ignore */ }
    return DEFAULT_AUTO_REFRESH_ENABLED;
  });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    function handler(event: MessageEvent) {
      const data = event.data;
      if (data?.type === 'update-available') {
        const diff: ManifestDiffResult = {
          added: data.added || [],
            removed: data.removed || [],
            ratio: data.ratio || 0,
            previousSize: data.previousSize || 0,
            total: data.total || 0
        };
        // Track decision metadata (strategy + reason) from SW
        if (data.strategy) {
          trackEvent({ category: 'interaction', action: 'sw_update_decision', label: data.strategy, metadata: { reason: data.decisionReason, ratio: diff.ratio, added: diff.added.length, removed: diff.removed.length } });
        }
        // Decide if we auto refresh silently
  const auto = shouldAutoRefresh(diff, { enabled: autoRefreshEnabled, maxRatio: SW_CONFIG.autoRefresh.maxRatio, maxAdded: SW_CONFIG.autoRefresh.maxAdded });
        if (auto) {
          try { sessionStorage.setItem(BG_UPDATE_FLAG, '1'); } catch {/* ignore */}
          // Use generic interaction category to conform to existing analytics typing
          trackEvent({ category: 'interaction', action: 'sw_auto_refresh', label: 'silent', metadata: { ratio: diff.ratio, added: diff.added.length, removed: diff.removed.length } });
          navigator.serviceWorker.controller?.postMessage('force-reload');
        } else {
          setUpdateInfo(diff);
        }
      }
      if (data?.type === 'force-reload') {
        // Received confirmation from SW to reload now
        window.location.reload();
      }
      if (data?.type === 'hard-bust-complete') {
        const metadata = { ratio: data.ratio, total: data.total };
        trackEvent({ category: 'interaction', action: 'sw_hard_bust_complete', label: 'hard', metadata });
  lazyTrackAiEvent('sw_hard_bust_complete', metadata);
      }
    }
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [autoRefreshEnabled]);

  function dismiss() { setUpdateInfo(null); }

  function applyUpdate() {
    if (!navigator.serviceWorker.controller) return;
    setForceReloading(true);
    navigator.serviceWorker.controller.postMessage('force-reload');
  }

  // Persist preference when toggled
  useEffect(() => {
    try { localStorage.setItem(AUTO_REFRESH_PREF_KEY, String(autoRefreshEnabled)); } catch { /* ignore */ }
  }, [autoRefreshEnabled]);

  return { updateInfo, dismiss, applyUpdate, forceReloading, autoRefreshEnabled, setAutoRefreshEnabled };
}

export function UpdateToast() {
  const { updateInfo, dismiss, applyUpdate, forceReloading, autoRefreshEnabled, setAutoRefreshEnabled } = useServiceWorkerUpdates();
  if (!updateInfo) return null;
  const changed = updateInfo.added.length + updateInfo.removed.length;
  return (
    <div style={toastStyle} role="status" aria-live="polite">
      <strong>Update available</strong><br />
      {changed} assets changed ({(updateInfo.ratio * 100).toFixed(1)}%).
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={applyUpdate} disabled={forceReloading} style={btnPrimaryStyle}>{forceReloading ? 'Refreshing…' : 'Refresh now'}</button>
        <button onClick={dismiss} style={btnSecondaryStyle}>Later</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#d1d5db', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoRefreshEnabled}
            onChange={e => setAutoRefreshEnabled(e.target.checked)}
            style={{ margin: 0 }}
          />
          auto-refresh small updates
        </label>
      </div>
      {updateInfo.added.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer' }}>Details</summary>
          <div style={{ maxHeight: 120, overflow: 'auto', fontSize: 12 }}>
            {updateInfo.added.length > 0 && <div><strong>Added:</strong><ul>{updateInfo.added.map(a => <li key={a}>{a}</li>)}</ul></div>}
            {updateInfo.removed.length > 0 && <div><strong>Removed:</strong><ul>{updateInfo.removed.map(a => <li key={a}>{a}</li>)}</ul></div>}
          </div>
        </details>
      )}
    </div>
  );
}

// Inline styles to avoid new CSS bundle fragmentation
const toastStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  background: 'rgba(32,32,32,0.92)',
  color: '#fff',
  padding: '12px 14px',
  borderRadius: 8,
  boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
  fontSize: 14,
  zIndex: 9999,
  maxWidth: 320,
  lineHeight: 1.3,
  backdropFilter: 'blur(4px)'
};

const btnBase: React.CSSProperties = {
  fontSize: 13,
  cursor: 'pointer',
  padding: '6px 10px',
  borderRadius: 4,
  border: '1px solid',
  lineHeight: 1.2
};

const btnPrimaryStyle: React.CSSProperties = {
  ...btnBase,
  background: '#3b82f6',
  color: '#fff',
  borderColor: '#2563eb'
};

const btnSecondaryStyle: React.CSSProperties = {
  ...btnBase,
  background: 'transparent',
  color: '#e5e7eb',
  borderColor: '#4b5563'
};

export default UpdateToast;

// Lightweight snackbar for background updates (silent auto-refresh)
export function BackgroundUpdateSnackbar() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Show after mount if flag exists
    let timer: number | undefined;
    try {
      if (sessionStorage.getItem(BG_UPDATE_FLAG) === '1') {
        // Reset to avoid duplicate display after navigation within SPA (until next refresh)
        sessionStorage.removeItem(BG_UPDATE_FLAG);
        setVisible(true);
  timer = window.setTimeout(() => setVisible(false), SW_CONFIG.autoRefresh.snackbarDurationMs);
  trackEvent({ category: 'interaction', action: 'sw_background_notice', label: 'updated_in_background' });
      }
    } catch { /* ignore */ }
    return () => { if (timer) window.clearTimeout(timer); };
  }, []);
  if (!visible) return null;
  return (
    <div style={bgSnackStyle} role="status" aria-live="polite">
      Updated in background.
    </div>
  );
}

const bgSnackStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  left: 16,
  background: 'rgba(28,28,28,0.9)',
  color: '#fff',
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 6,
  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
  zIndex: 9999,
  backdropFilter: 'blur(4px)'
};
