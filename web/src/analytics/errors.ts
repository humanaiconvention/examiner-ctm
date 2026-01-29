// Import directly from core to avoid a circular dependency chain.
// Historical cycle (now prevented by an ESLint rule):
//   index -> core -> ../analytics (legacy root) -> errors -> index
// By depending only on './core' we keep the errors chunk minimal and tree-shakeable.
// If additional helpers are needed, add focused exports in core instead of reaching
// back through the aggregated index barrel.
import { trackEvent } from './core';

let errorHooksInstalled = false;
export function installErrorHooks(): void {
  if (typeof window === 'undefined') return;
  if (errorHooksInstalled) return;
  errorHooksInstalled = true;
  window.addEventListener('error', (e) => {
    trackEvent({ category: 'error', action: 'exception', priority: 'high', metadata: {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: (e.error && (e.error as Error).stack) || undefined,
      name: (e.error && (e.error as Error).name) || undefined,
    }});
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reasonAny = (e as PromiseRejectionEvent).reason as unknown;
    let reasonMsg = 'unknown';
    let stack: string | undefined;
    if (reasonAny) {
      if (typeof reasonAny === 'string') reasonMsg = reasonAny;
      else if (reasonAny instanceof Error) { reasonMsg = reasonAny.message; stack = reasonAny.stack; }
      else if (typeof (reasonAny as { message?: unknown }).message === 'string') {
        reasonMsg = String((reasonAny as { message?: unknown }).message);
      }
    }
    trackEvent({ category: 'error', action: 'unhandled_rejection', priority: 'high', metadata: {
      reason: reasonMsg,
      stack,
      name: reasonAny instanceof Error ? reasonAny.name : undefined,
    }});
  });
}
