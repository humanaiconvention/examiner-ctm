// Core analytics primitives extracted from legacy monolith.
export type { AnalyticsCategory, AnalyticsAction, TrackEventOptions } from '../analytics';
export {
  trackEvent,
  flushPreConsentQueue,
  hasAnalyticsConsent,
  setAnalyticsConsent,
  setUserContext,
  getAnalyticsDebugInfo,
  initAnalyticsSession,
  trackHashNavigation,
} from '../analytics';
