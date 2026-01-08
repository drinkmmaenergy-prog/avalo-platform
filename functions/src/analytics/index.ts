/**
 * PACK 299 — Analytics Engine + Safety Monitor + Creator Metrics
 * 
 * Comprehensive analytics system tracking:
 * - User KPIs (DAU/WAU/MAU, registration funnel, conversions)
 * - Chat & Monetization KPIs
 * - Calendar & Event KPIs
 * - Safety Monitoring (NSFW, catfish, blocks/reports, behavior anomalies)
 * - Creator Metrics (exposure, engagement, earnings, rankings)
 * - Fraud Detection (multi-account, device fingerprinting, chargeback prediction)
 */

// User KPIs
export {
  trackUserActivity,
  trackRegistration,
  trackProfileUpdate,
  trackVerification,
  trackSwipe,
  trackMatch,
  trackProfileView,
  aggregateDailyUserKPIs
} from './userKPIs';

// Chat & Monetization KPIs
export {
  trackChatStart,
  trackChatMessage,
  trackChatPayment,
  trackChatEnd,
  trackRefund,
  aggregateChatMonetizationKPIs
} from './chatMonetizationKPIs';

// Calendar & Event KPIs
export {
  trackCalendarBooking,
  trackBookingCancellation,
  trackQRVerification,
  trackMismatchClaim,
  trackEventCompletion,
  aggregateCalendarEventKPIs
} from './calendarEventKPIs';

// Safety Monitoring
export {
  analyzeContentForNSFW,
  analyzeCatfishProbability,
  trackBlockReport,
  detectBehaviorAnomalies,
  calculateUserRiskLevel,
  aggregateSafetyMetrics
} from './safetyMonitoring';

// Creator Metrics
export {
  trackCreatorExposure,
  trackCreatorEngagement,
  trackCreatorChatEarnings,
  trackCreatorCalendarEarnings,
  aggregateCreatorMetrics,
  calculateCreatorTrends
} from './creatorMetrics';

// Fraud Detection
export {
  detectMultipleAccounts,
  analyzeDeviceFingerprint,
  predictChargebackRisk,
  calculateOverallFraudRisk,
  aggregateFraudMetrics
} from './fraudDetection';

// API Endpoints
export {
  getAnalyticsDashboard,
  getCreatorMetrics,
  getSafetyAlerts,
  getFraudAlerts,
  getRealtimeMetrics
} from './api';