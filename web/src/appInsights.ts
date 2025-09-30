// App Insights browser SDK
// Types provided by the package; if editor cannot resolve prior to install, run npm install.
import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { hasAnalyticsConsent } from './analytics';

let appInsights: ApplicationInsights | null = null;
let vitalsStarted = false;
let startVitalsFn: (() => void) | null = null;
let contextInitializerInstalled = false;

interface InitOptions { instrumentationKey?: string; connectionString?: string; samplingPercentage?: number }

export function initAppInsights(opts: InitOptions = {}) {
  if (appInsights) return;
  // Prefer explicit connectionString over instrumentationKey if provided
  const env = (import.meta as unknown as { env?: { VITE_APPINSIGHTS_CONNECTION_STRING?: string; VITE_APPINSIGHTS_KEY?: string; VITE_APPINSIGHTS_SAMPLE?: string } }).env || {};
  const connectionString = opts.connectionString || env.VITE_APPINSIGHTS_CONNECTION_STRING;
  const key = opts.instrumentationKey || env.VITE_APPINSIGHTS_KEY;
  if (!connectionString && !key) return; // nothing to initialize
  // Allow env override for sampling
  const envSample = (import.meta as unknown as { env?: { VITE_APPINSIGHTS_SAMPLE?: string } }).env?.VITE_APPINSIGHTS_SAMPLE;
  const samplePct = envSample ? Number(envSample) : (opts.samplingPercentage ?? 50);
  const baseConfig: Record<string, unknown> = {
    enableAutoRouteTracking: true,
    samplingPercentage: Number.isFinite(samplePct) ? samplePct : 50,
    disableTelemetry: !hasAnalyticsConsent(),
    enableUnhandledPromiseRejectionTracking: false,
  };
  if (connectionString) {
    baseConfig.connectionString = connectionString;
  } else if (key) {
    baseConfig.instrumentationKey = key;
  }
  // Cast through unknown to satisfy strict exactOptionalPropertyTypes without using any
  appInsights = new ApplicationInsights({ config: baseConfig as unknown as import('@microsoft/applicationinsights-web').IConfiguration });
  appInsights.loadAppInsights();
  if (!contextInitializerInstalled && appInsights) {
    try {
      interface VersionMeta { commit?: string; fullCommit?: string }
      interface TelemetryEnvelope { data?: { baseData?: { properties?: Record<string, unknown> } } }
      const w = window as unknown as { __SESSION_ID__?: string; __APP_VERSION__?: VersionMeta };
      const sessionId = w.__SESSION_ID__;
      const buildCommit = w.__APP_VERSION__?.commit || w.__APP_VERSION__?.fullCommit;
      appInsights.addTelemetryInitializer((envelope: TelemetryEnvelope) => {
        if (!sessionId && !buildCommit) return;
        if (!envelope.data) envelope.data = {};
        if (!envelope.data.baseData) envelope.data.baseData = { properties: {} };
        if (!envelope.data.baseData.properties) envelope.data.baseData.properties = {};
  interface AugmentedProps extends Record<string, unknown> { sessionId?: string; buildCommit?: string }
  const props = envelope.data.baseData.properties as AugmentedProps;
  if (sessionId && props.sessionId == null) props.sessionId = sessionId;
  if (buildCommit && props.buildCommit == null) props.buildCommit = buildCommit;
      });
      contextInitializerInstalled = true;
    } catch { /* ignore */ }
  }
}

export function enableAppInsightsTelemetry() {
  if (appInsights) {
    try {
      // The SDK config type doesn't expose mutable disableTelemetry, but runtime allows it.
      (appInsights as unknown as { config: { disableTelemetry?: boolean } }).config.disableTelemetry = false;
    } catch { /* ignore */ }
  }
  if (startVitalsFn && !vitalsStarted) {
    startVitalsFn();
    vitalsStarted = true;
  }
}

export function registerVitalsStarter(fn: () => void) {
  startVitalsFn = fn;
  if (hasAnalyticsConsent() && !vitalsStarted) {
    fn();
    vitalsStarted = true;
  }
}

export function trackAiEvent(name: string, properties?: Record<string, unknown>) {
  try { appInsights?.trackEvent({ name }, properties); } catch { /* ignore */ }
}

export function trackAiMetric(name: string, value: number, properties?: Record<string, unknown>) {
  try { appInsights?.trackMetric({ name, average: value }, properties); } catch { /* ignore */ }
}

export function getAppInsightsInstance() { return appInsights; }
