import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({
  region: "europe-west1",
  memory: "512MiB",
  timeoutSeconds: 60,
  maxInstances: 10
});
/**
 * ============================================================================
 * AVALO FIREBASE FUNCTIONS ENTRYPOINT
 * ============================================================================
 *
 * Master index file for Firebase Cloud Functions deployment.
 * Restored in controlled batches to avoid Cloud Run boot crashes.
 *
 * Architecture: PACK-based modular organization
 * Target: Firebase Functions Node >=20 + TypeScript
 * Region: europe-west1 (default)
 *
 * @version 3.0.0 — Incremental restore
 */

// ============================================================================
// INITIALIZATION (Must be first — side-effect imports only)
// ============================================================================
import './runtime';
import './init';

// ============================================================================
// HEALTH & SMOKE (always present)
// ============================================================================
export { smokeCheck } from './api/smokeCheck';
export { healthCheck } from './healthCheck';

// ============================================================================
// BATCH A: AUTH, WALLET, STRIPE, ECONOMY CONFIG
// ============================================================================

// --- AUTH & ACCOUNT LIFECYCLE ---
export * from './adminAuth';
export * from './adminCalls';
export * from './adminConsole';
export * from './adminPanel';
export * from './adminSupport';
export * from './accountLifecycle';
export {
  applySanctions,
  getAccountStatus as getAccountStatus_engine,
  getAccountStatusRecord,
  account_getStatus,
  onContentViolation,
  onCsamDetection,
  onSafeMeetSOS,
  onTrustCriticalEvent,
  canPerformAction,
} from './accountStatusEngine';
export * from './deviceTrust';
export * from './compliance';
export * from './compliancePack55';
export * from './amlMonitoring';

// PACK 306: VERIFICATION SYSTEM
export {
  onUserCreate,
  startVerification,
  verifySelfie,
  verifyProfilePhotos,
  verifyMeetingSelfie,
  adminVerificationOverride,
  cleanupOldVerificationData,
} from './pack306-verification';

// PACK 314: REGISTRATION
export {
  validateRegistration,
  completeUserProfile,
  getUserFeatures,
} from './pack314-registration';

// PACK 317: RATE LIMITING & SECURITY
export {
  pack317_checkRateLimit,
  pack317_checkRegistration,
  pack317_checkMessageSpam,
  pack317_getLaunchConfig,
  pack317_updateLaunchConfig,
  pack317_getLaunchConfigHistory,
  pack317_querySecurityEvents,
  pack317_getSecurityStats,
  pack317_testSanitization,
} from './pack317-endpoints';

// --- STRIPE & PAYMENTS ---

// CORE PAYMENT SYSTEM
export {
  stripeWebhook,
  creditTokensCallable,
  requestPayoutCallable,
} from './payments';

export {
  createStripeCheckoutSession,
  stripeWebhookV2,
  validateAppleReceipt,
  initiateChat,
  releaseEscrowIncremental,
  autoRefundInactiveEscrows,
  generateMonthlySettlements,
  getWalletBalance,
  getTransactionHistory,
  createCalendarBooking,
  completeCalendarBooking,
  cancelCalendarBooking,
  requestPayout,
  getCreatorSettlements,
  getPendingSettlements,
} from './paymentsComplete';

// PACK 278: SUBSCRIPTION ENGINE
export {
  pack278_stripeWebhook,
} from './pack278-subscription-endpoints';

// PACK 288: WEB STRIPE TOKENS
export {
  tokens_createCheckoutSession,
  tokens_stripeWebhook,
  tokens_getPurchaseBySession,
  tokens_fulfillCheckout,
  tokens_getPurchaseHistory,
} from './pack288-web-stripe';

// PACK 289: KYC SYSTEM
export {
  kyc_submit,
  kyc_getStatus,
  kyc_admin_review,
  kyc_admin_listPending,
} from './pack289-kyc';

// PACK 350: SUBSCRIPTION ENDPOINTS
export {
  pack350_getMySubscription,
  pack350_getSubscriptionProducts,
  pack350_syncStripeSubscription,
  pack350_syncAppleSubscription,
  pack350_syncGoogleSubscription,
  pack350_cancelSubscription,
  pack350_stripeWebhook,
  pack350_appleWebhook,
  pack350_googleWebhook,
} from './pack350-endpoints';

// PACK 383: CHARGEBACK & PAYOUT ROUTER
export {
  pack383_detectChargebackRisk,
  pack383_applyPayoutFreeze,
  pack383_createReserveHold,
  pack383_releaseExpiredHolds,
  pack383_handleChargebackNotification,
} from './pack383-chargeback-firewall';

export {
  pack383_resolveOptimalPayoutRoute,
  pack383_initiatePayout,
  pack383_processPayoutQueue,
} from './pack383-payout-router';

// PACK 390: AML & PAYOUTS
export {
  pack390_runAMLScan,
  pack390_autoAMLScanOnPayout,
  pack390_escalateFinancialRisk,
} from './pack390-aml';

export {
  pack390_requestBankPayout,
  pack390_executeBankPayout,
  pack390_reverseFailedTransfer,
  pack390_getPayoutHistory,
} from './pack390-payouts';

// PACK 395: INVOICING & TAX ENGINE
export {
  generatePurchaseInvoice,
  generateCreatorPayoutStatement,
  emailInvoiceToUser,
  getUserInvoices,
  getCreatorPayoutStatements,
  generateMonthlyStatementsForAllCreators,
} from './pack395-invoicing';

export {
  calculatePurchaseTax,
  updateVATRates,
  validateVATNumber,
} from './pack395-tax-engine';

// PACK 92: PUSH NOTIFICATIONS (auth-adjacent)
export {
  registerPushToken,
  unregisterPushToken,
  getNotificationSettings,
  updateNotificationSettings,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
} from './pack92-endpoints';

// --- WALLET & ECONOMY ---
export * from './currency';
export * from './earningsIntegration';
export * from './dynamicPricing';

// --- UNIFIED WALLET + LEDGER + PAYOUT (canonical path: wallets/{userId}) ---
export {
  transactTokens,
  creditTokens,
  debitForPayout,
  getBalance,
  getWallet,
  getPlatformBalance,
  replayLedger,
  verifyLedgerConsistency,
  verifyPlatformWalletSum,
  requestUnifiedPayout,
  approvePayout,
  rejectPayout,
  processPayout,
  retryPayout,
  getPayoutRequest,
  getUserPayoutRequests,
  getUnifiedPendingPayouts,
  calculatePayoutBreakdown,
  PLATFORM_WALLET_ID,
  WALLETS_COLLECTION,
  LEDGER_COLLECTION,
} from './wallet';

// PACK 246: ECONOMY CONTRACT VALIDATION
export {
  economyContractValidator,
  getContractStats,
  getAuditLogs,
  getSuspiciousAnomalies,
  resolveAnomaly,
  nightlyContractAuditor,
  weeklyContractReport,
} from './pack246-cloud-functions';

// --- API ENDPOINTS (core infra) ---
export * from './api/health';
export * from './api/configApi';
export * from './api/featureFlags';
export * from './api/payoutHandlers';
export * from './api/search.api';

// --- ENGINES (core infra) ---
export * from './engines/economyEngine';
export * from './engines/complianceEngine';
export {
  updateRiskProfileTrigger,
  updateRiskProfileOnReportTrigger,
  calculateTrustScoreCallable,
  calculateTrustScore,
  banUserCallable,
  isUserRestricted,
} from './engines/riskEngine';

// ============================================================================
// BATCH B: CHAT, DISCOVERY, FEED
// ============================================================================

// --- CHAT & MESSAGING ---
export * from './chats';
export * from './chatSync';
export * from './chatSecurity';
export * from './chatMonetization';
export * from './chatMediaFunctions';
export * from './chatMediaMonetization';
export * from './chatSystemNextGen';
export * from './dynamicChatPricing';

// --- DISCOVERY & MATCHING ---
export * from './discoveryEndpoints';
export * from './discoveryFeed';
export {
  filterShadowbannedUsers,
  filterIncognitoUsers,
  applyDiscoveryFilters,
  isUserVisibleInDiscovery as isUserVisibleInDiscovery_filters,
  getDiscoveryQueryFilters,
  calculateVisibilityMultiplier,
  enrichUsersWithTrustData,
  applyVisibilityWeighting,
} from './discoveryFilters';
export {
  getDiscoveryFeed as getDiscoveryFeed_v2,
  searchProfiles,
} from './discoveryEngineV2';
export * from './discoveryProfileBuilder';

// PACK 294: DISCOVERY ANALYTICS
export {
  logDiscoveryProfileView,
  logDiscoveryProfileLike,
  logDiscoveryOpenChat,
  logDiscoveryOpenCalendar,
  aggregateDiscoveryAnalytics,
} from './pack294-discovery-analytics';

// CHEMISTRY MATCHING
export * from './chemistryMatchingApi';
export * from './chemistryMatchingEngine';
export * from './chemistryFeedApi';
export * from './engines/chemistryLockIn';
export * from './triggers/chemistryLockInTriggers';

// --- FEED ---

// PACK 282: FEED ENGINE
export {
  createPost,
  updatePost,
  deletePost,
  getFeed,
  getPost,
} from './pack282-feed-engine';

// PACK 298: UNIFIED ENGINE
export {
  calculateFeedRankings,
  generateSwipePool,
  updateLowPopularityStatus,
  validateContentSafety,
} from './pack298-unified-engine';

// --- CALLS & CALENDAR ---
export * from './calls';
export * from './callBilling';
export {
  determineCallPayerAndEarner,
  getCallMinuteCost,
  startCall as startCallMonetized,
  updateCallActivity,
  endCall as endCallMonetized,
  autoDisconnectIdleCalls,
  getActiveCallForUser,
  checkCallBalance as checkCallBalance_monetization,
} from './callMonetization';
export * from './callPricing';
export * from './calendar';
export * from './calendarEngine';
export * from './calendarFunctions';

// --- DATING FUNNEL ---
export * from './datingFunnel';
export {
  initializeConnectionSession,
  updateConnectionAfterCall,
  scheduleDatingEvent,
  createMeetingVerification,
  verifyMeetingCheckIn,
  createPanicAlert,
  completeMeeting as completeMeeting_funnel,
  createPaidTimeBooking,
  completePaidTimeBooking,
  getUserFunnelProgress,
  getFunnelAnalytics,
  calculateRetentionMetrics,
} from './datingFunnelPhases';

// --- CLUBS & SOCIAL ---
export * from './clubs';
export * from './clubIntelligence';
export * from './challenges';

// --- NOTIFICATIONS (v2) ---
export {
  sendNotification,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  getNotificationSettings as getNotificationSettings_v2,
  updateNotificationSettings as updateNotificationSettings_v2,
  toggleCategoryNotifications,
  setSnoozeMode,
  createReminder,
  getUserReminders,
  updateReminder,
  deleteReminder,
  getUserDigests,
  processReminders,
  generateDailyDigests,
  generateWeeklyDigests,
  resetPausedReminders,
  cleanupOldDigests,
  cleanupOldNotifications,
} from './notifications/functions';

// ============================================================================
// BATCH C: CREATOR TOOLS, ANALYTICS
// ============================================================================

// --- CREATOR ECONOMY ---
export * from './earnerAnalytics';
export * from './creatorEarnings';
export {
  getCreatorDashboard,
  getCreatorQuests,
  claimQuestReward,
  requestWithdrawal,
  getCreatorFanbase,
  getMessageTemplates,
  saveMessageTemplate,
  getPricingRecommendations,
} from './earnerHub';

export {
  enableCreatorModeV1,
  getCreatorDashboardV1,
  createGatedPostV1,
  unlockGatedPostV1,
  setMessagePricingV1,
  generateReferralCodeV1,
  applyReferralCodeV1,
  processReferralReward,
  requestWithdrawalV1,
  getWithdrawalHistoryV1,
  getTopFansV1,
} from './earnerMode';

export {
  createCreatorProduct,
  uploadProductMedia,
  publishCreatorProduct,
  purchaseCreatorProduct,
  getProductAccessUrls,
  getCreatorProducts,
  getMyPurchases,
  getCreatorStats,
  updateCreatorProduct,
  toggleProductStatus,
  archiveCreatorProduct,
} from './earnerShop';

export {
  createCreatorProductV1,
  publishCreatorProductV1,
  getCreatorProductsV1,
  purchaseCreatorProductV1,
  getMyPurchasesV1,
  deactivateProductV1,
  getCreatorAnalyticsV1,
} from './earnerStore';
export * from './digitalProducts';
export * from './digitalProductNotifications';
export * from './dropsEngine';

// --- ANALYTICS & ACTIVITY ---

// PACK 301: ACTIVITY & RETENTION HOOKS
export {
  trackActivity,
  onSwipeCreated,
  onChatMessageCreated,
  onTokenPurchaseCreated,
  onCalendarBookingCreated,
  onEventTicketCreated,
  trackCallActivity as trackCallActivity_pack301,
  batchUpdateActivities,
  getActivitySummary,
} from './pack301-activity-hook';

export {
  dailyWinBackSequence,
  markWinBackReturn,
  getWinBackStatistics,
  triggerWinBackMessage,
} from './pack301-winback';

// PACK 303: EARNINGS DASHBOARD
export {
  getEarningsDashboardCallable,
  getMonthlyStatementCallable,
  exportStatementCallable,
  checkEarningsCapabilityCallable,
  adminTriggerAggregation,
  adminBackfillAggregation,
  adminViewUserEarnings,
  cronDailyEarningsAggregation,
  httpTriggerAggregation,
} from './pack303-endpoints';

// PACK 336: AGGREGATION & EXPERIMENTS
export {
  pack336_generateDailyKPIs,
  pack336_manualAggregation,
} from './pack336-aggregation-cron';

export {
  pack336_createExperiment,
  pack336_updateExperimentResults,
  pack336_getExperiments,
  pack336_getExperiment,
  pack336_deleteExperiment,
  pack336_getExperimentStatistics,
} from './pack336-experiments';

// PACK 346: ALERT ROUTING & KPI AGGREGATION
export {
  acknowledgeAlert,
  resolveAlert,
  checkKPIThresholds,
} from './pack346-alert-routing';

export {
  aggregateDailyKPIs,
  aggregateHourlyKPIs,
  triggerKPIAggregation,
} from './pack346-kpi-aggregation';

// PACK 349: ADS SYSTEM
export {
  createAd,
  updateAd,
  deleteAd,
  activateAd,
  pauseAd,
  reportAd,
  createBrandCampaign,
  addAdToCampaign,
  activateCampaign,
  pauseCampaign,
  endCampaign,
  getCampaignAnalytics,
  getAdForFeed,
  getAdsForDiscovery,
  recordAdPlacement,
  recordAdClick,
  recordAdView,
  recordAdConversion,
  createAdvertiserAccount,
  addAdvertiserTokens,
  createCreatorSponsorship,
  endCreatorSponsorship,
  getCreatorAnalytics as getCreatorAnalytics_ads,
  requestCreatorPayout,
  processScheduledCampaigns,
  processMinimumGuarantees,
} from './pack349-endpoints';

// PACK 356: AD TRACKING & ROAS
export {
  trackAdEvent,
  createAdCampaign,
  updateCampaignStatus,
  updateCampaignBudget,
  adPlatformWebhook,
} from './pack356-ad-tracking';

export {
  dailyROASOptimization,
  getROASHistory,
  runManualROASOptimization,
  getROASDashboard,
  calculateCountryROAS,
} from './pack356-roas-engine';

// PACK 358: BURN RATE & STRESS SCENARIOS
export {
  calculateMonthlyBurnRate,
  calculateBurnRateOnDemand,
  getFinancialRunway,
  getBurnRateHistory,
} from './pack358-burnrate-engine';

export {
  runMonthlyStressScenarios,
  runStressScenario,
  getAvailableScenarios,
  getScenarioResults,
} from './pack358-stress-scenarios';

// PACK 402: KPI FUNCTIONS
export {
  pack402_buildHourlyKpis,
  pack402_buildDailyKpis,
  pack402_getKpis,
  pack402_backfillDailyKpis,
  pack402_getKpisHttp,
} from './pack402-kpi-functions';

// PACK 411: RATING TRIGGER & STORE REVIEW INGESTION
export {
  pack411_ratingPromptDecision,
  pack411_logRatingPrompt,
  pack411_createFeedbackTicket,
} from './pack411-rating-trigger';

export {
  pack411_importStoreReviewsGoogle,
  pack411_importStoreReviewsApple,
} from './pack411-store-reviews-ingestion';

// --- MODERATION & SAFETY ---
export * from './csamShield';
export * from './cyberstalkingDetection';
export * from './cyberstalkingEndpoints';
export * from './cyberstalkingReporting';

// --- DISPUTES & ENFORCEMENT ---
export * from './disputes';
export * from './disputeCenter';
export * from './disputeEndpoints';
export * from './disputeEngine';
export * from './enforcementEndpoints';
export * from './enforcementEngine';
export * from './enforcementHelpers';
export * from './enforcementIntegrations';

// --- OPERATIONS PACKS ---

// PACK 320: AUTO-FLAGGING
export {
  onMeetingMismatchReport,
} from './pack320-auto-flagging';

// PACK 324B: FRAUD DETECTION
export {
  pack324b_getFraudSignals,
  pack324b_getHighRiskUsers,
  pack324b_getUserRiskScore,
  pack324b_getUserFraudSignals,
  pack324b_getFraudDashboardStats,
  pack324b_recalculateUserRiskScore,
  pack324b_getSignalContext,
} from './pack324b-fraud-endpoints';

// PACK 326: CAMPAIGN MANAGEMENT
export {
  pack326_createAdsCampaign,
  pack326_createAdCreative,
  pack326_activateCampaign,
  pack326_pauseCampaign,
  pack326_resumeCampaign,
  pack326_getCampaignDetails,
  pack326_listMyCampaigns,
} from './pack326-campaign-management';

// PACK 329: POLICY ENFORCEMENT
export {
  pack329_validateContent,
  pack329_getPolicy,
  pack329_reportViolation,
  pack329_getViolations,
  pack329_admin_updatePolicy,
  pack329_admin_seedPolicy,
} from './pack329-policy-endpoints';

// PACK 330: EXPORT HOOKS
export {
  pack330_exportUserReportToPDF,
  pack330_exportUserReportToCSV,
  pack330_exportPlatformReportCSV,
  pack330_emailTaxReport,
} from './pack330-export-hooks';

// PACK 335: SUPPORT ENGINE
export {
  pack335_createSupportTicket,
  pack335_addTicketMessage,
  pack335_updateTicketStatus,
  pack335_handleRefundDispute,
  pack335_closeTicket,
} from './pack335-support-engine';

// PACK 359: GDPR RETENTION
export {
  enforceRetentionPolicies,
  requestErasure,
  requestExport,
  checkDataRequestStatus,
} from './pack359-gdpr-retention';

// PACK 360: CULTURAL SAFETY & LEGAL TEXT
export {
  getCulturalSafetyProfile,
  moderateContent,
  checkFeatureAvailability,
  adminUpdateCulturalSafetyProfile,
  adminGetAllSafetyProfiles,
  onContentCreated,
} from './pack360-cultural-safety';

export {
  getUserLegalDocuments,
  acceptLegalDocument,
  checkUserLegalCompliance,
  adminCreateLegalDocument,
  adminGetAllLegalDocuments,
  adminGetLegalAcceptanceStats,
  onUserLogin,
  onUserCountryChangeLegal,
} from './pack360-legal-text-engine';

// PACK 361: CDN CONTROL & LOAD BALANCER
export {
  uploadImage,
  uploadVideo,
  getProgressiveImage,
  optimizeVoice,
  cacheAiAvatar,
  getCdnStats,
  updateCdnMetrics,
  purgeCache,
  purgeAllCache,
  monitorBandwidth,
} from './pack361-cdn-control';

export {
  runHealthChecks,
  getRouting,
  forceFailover,
  getRegionStatuses,
  initializeRegions,
} from './pack361-load-balancer';

// PACK 368: REFERRAL SYSTEM
export {
  generateInviteCodeCallable,
  processReferralCallable,
  getReferralStatsCallable,
  revokeReferralPrivilegesCallable,
  cleanupExpiredRewards,
} from './pack368-referral-functions';

// PACK 373: MARKETING AUTOMATION
export {
  pack373_rotateASOVariants,
  pack373_trackStoreConversion,
  pack373_finalizeASOExperiments,
  pack373_trackPartnerInstall,
  pack373_calculatePartnerCommission,
  pack373_autoPauseCampaign,
  pack373_updateCampaignMetrics,
  pack373_validateInstall,
  pack373_checkRegionalLimits,
  pack373_budgetFirewall,
} from './pack373-marketing-automation';

// PACK 379: ASO REPUTATION
export {
  pack379_reviewAttackDetector,
  pack379_fakeReviewClassifier,
  pack379_reviewVelocityGuard,
  pack379_storeDisputeGenerator,
  pack379_storeAppealAutoSubmit,
  pack379_asoBoostOptimizer,
  pack379_keywordClusteringEngine,
  pack379_storeAlgorithmResponse,
  pack379_trustScoreEngine,
  pack379_storePolicyWatcher,
  pack379_preemptiveRiskAlert,
  pack379_crisisReputationShield,
  pack379_storeSafeReviewTrigger,
  pack379_recordReviewCompletion,
  pack379_execReputationDashboard,
  pack379_dailyExecutiveReport,
} from './pack379-aso-reputation';

// PACK 381: REGION CONFIG
export {
  pack381_updateRegionConfig,
  pack381_getRegionConfig,
  pack381_listAvailableRegions,
  pack381_adminGetRegionConfig,
  pack381_detectUserRegion,
  pack381_validateFeatureAvailability,
} from './pack381-region-config';

// PACK 382: BURNOUT PREVENTION & PRICING
export {
  pack382_detectCreatorBurnout,
  pack382_resolveBurnout,
  pack382_dailyBurnoutMonitoring,
} from './pack382-burnout-prevention';

export {
  pack382_recommendOptimalPricing,
  pack382_applyPricingRecommendation,
  pack382_weeklyPricingReview,
} from './pack382-pricing-recommender';

// PACK 384: REVIEW DEFENSE
export {
  detectReviewBombing,
  recordStoreReviewSignal,
  requestStoreReview,
  detectCopyPasteReviews,
} from './pack384-review-defense';

// PACK 385: AMBASSADORS, LAUNCH PHASE, TRAFFIC GUARD
export {
  pack385_assignLaunchAmbassador,
  pack385_getAmbassadorData,
  pack385_applyAmbassadorMultiplier,
  pack385_activateAmbassadorBoost,
  pack385_trackAmbassadorPerformance,
  pack385_getAmbassadorLeaderboard,
  pack385_removeAmbassador,
  pack385_calculateAmbassadorScores,
} from './pack385-ambassadors';

export {
  pack385_setLaunchPhase,
  pack385_getLaunchPhase,
  pack385_checkFeatureEnabled,
  pack385_getUserLimits,
  pack385_enforcePhaseLimits,
} from './pack385-launch-phase';

export {
  pack385_setTrafficLevel,
  pack385_getTrafficGuard,
  pack385_checkTrafficLimit,
  pack385_dynamicTrafficProtection,
  pack385_throttleUser,
  pack385_monitorTrafficLoad,
  pack385_cleanupThrottles,
} from './pack385-traffic-guard';

// PACK 386: INFLUENCERS
export {
  pack386_registerInfluencer,
  pack386_assignInfluencerCampaign,
  pack386_setInfluencerPayoutModel,
  pack386_trackInfluencerAttribution,
  pack386_updateInfluencerConversion,
  pack386_calculateInfluencerROI,
  pack386_getInfluencerAnalytics,
} from './pack386-influencers';

// PACK 387: PR INCIDENTS & PUBLIC STATEMENTS
export {
  pack387_createIncident,
  pack387_updateIncidentStatus,
  pack387_closeIncidentWithReport,
  pack387_addLegalReview,
  pack387_linkSupportTickets,
  pack387_linkFraudCases,
  pack387_getIncidentDetails,
} from './pack387-incidents';

export {
  pack387_preparePublicStatement,
  pack387_updateStatement,
  pack387_submitForLegalReview,
  pack387_legalApproveStatement,
  pack387_executiveApproveStatement,
  pack387_releasePublicStatement,
  pack387_getIncidentStatements,
  pack387_getPendingStatements,
} from './pack387-public-statements';

export {
  pack387_ingestReputationSignal,
  pack387_analyzeReputationTrends,
} from './pack387-reputation-ingest';

// PACK 388: GDPR
export {
  pack388_requestDataExport,
  pack388_processDataExport,
  pack388_executeRightToBeForgotten,
  pack388_executeDataDeletion,
  pack388_restrictProcessing,
  pack388_cancelDeletionRequest,
} from './pack388-gdpr';

// PACK 392: ASO, REVIEW INTEL, STORE DEFENSE, TRUST SCORE
export {
  pack392_asoOptimizationEngine,
  pack392_runASOAnalysis,
  pack392_getASODashboard,
  pack392_addKeyword,
  pack392_removeKeyword,
} from './pack392-aso-engine';

export {
  pack392_reviewIntelligenceEngine,
  pack392_analyzeReviewManual,
  pack392_getReviewThreats,
  pack392_escalateReviews,
} from './pack392-review-intel';

export {
  pack392_storeDefenseEngine,
  pack392_analyzeStoreThreat,
  pack392_getStoreDefenseStatus,
} from './pack392-store-defense';

export {
  pack392_calculateTrustScore,
  pack392_trackUserTrustImpact,
  pack392_calculateStoreSafetyRating,
  pack392_getTrustScore,
  pack392_getStoreSafetyRating,
  pack392_recalculateTrustScore,
} from './pack392-trust-score';

// PACK 398: LAUNCH ORCHESTRATOR
export {
  initializeLaunchControl,
  configureCountryRollout,
  updateCountryState,
  emergencyStopLaunch,
  resumeLaunch,
  monitorLaunchHealth,
  resetDailyBudgets,
  getLaunchStatus,
} from './pack398-launch-orchestrator';

// PACK 399: INFLUENCER ENGINE
export {
  createInfluencerProfile,
  verifyInfluencer,
  trackInfluencerInstall,
  trackInfluencerCommission,
  detectInfluencerFraud,
  createInfluencerPayout,
  getRegionalPlaybook,
  getInfluencerAnalytics,
} from './pack399-influencer-engine';

// PACK 412: LAUNCH ORCHESTRATOR V2
export {
  pack412_createOrUpdateRegionConfig,
  pack412_setRegionStage,
  pack412_updateRegionTrafficCap,
  pack412_updateGuardrailThresholds,
  pack412_monitorLaunchGuardrails,
  pack412_proposeNextLaunchRegions,
} from './pack412-launch-orchestrator';

// PACK 414: INTEGRATION AUDIT
export {
  pack414_runFullAudit,
  pack414_runPackAudit,
  pack414_getGreenlightMatrix,
  pack414_scheduledDailyAudit,
  pack414_scheduledHealthCheck,
} from './pack414-integration-audit';

// PACK 421: HEALTH CONTROLLER
export {
  pack421_health_public,
  pack421_health_internal,
  pack421_health_featureMatrix,
  pack421_health_featureMatrix_http,
} from './pack421-health.controller';

// PACK 422: REPUTATION POLICY
export {
  onReputationChange,
  checkUserPolicy,
} from './pack422-reputation.policy';

// PACK 423: RATINGS HTTP
export {
  pack423_createInteractionRating,
  pack423_getMyInteractionRatings,
  pack423_getUserRatingSummary,
  pack423_getCompanionRatingSummary,
  pack423_checkRatingEligibility,
  pack423_createNpsResponse,
  pack423_checkNpsEligibility,
  pack423_getUserNpsHistory,
  pack423_getNpsAnalytics,
  pack423_flagRatingAsAbuse,
  pack423_isRecentDetractor,
} from './pack423-ratings.http';

// PACK 424: REVIEW RETENTION & TRUST SCORE
export {
  processNewReviewForRetention,
  triggerRetentionForReview,
} from './pack424-review-retention';

export {
  scheduledTrustScoreCalculation,
  getTrustScore as getTrustScore_pack424,
} from './pack424-trust-score.service';

// PACK 425: COUNTRY EXPANSION
export {
  getCountryProfile,
  listCountries,
  getCountriesByStrategy,
  updateCountryReadiness,
  getCountryFeatureFlags,
  updateCountryFeatureFlags,
  getCountryPricing,
  getExpansionDashboard,
  initializeCountry,
  launchCountry,
  getBootstrapStatus,
  getLocalizationReport,
  validateCountryLaunch,
  recomputeAllReadiness,
} from './pack425-functions';

// PACK 432: AD PLATFORM CONNECTORS
export {
  syncGoogleCampaign,
  updateGoogleCampaignBudget,
  uploadGoogleAssets,
  syncGoogleStats,
  trackGoogleConversion,
} from './pack432-google-connector';

export {
  syncTikTokCampaign,
  updateTikTokCampaignBudget,
  rotateTikTokCreatives,
  syncTikTokReports,
  trackTikTokEvent,
} from './pack432-tiktok-connector';

export {
  submitUGCCreative,
  reviewUGCSubmission,
  startCreativeTesting,
  rotateTopCreatives,
  updateCreativePerformance,
  generateAICreative,
  importFromUGCPlatform,
  getCreativeAnalytics,
} from './pack432-ugc-engine';

// PACK 433: DEAL ENGINE
export {
  createDeal,
  acceptDealContract,
  getCreatorDeals,
  toggleDealStatus,
  expireDealsDaily,
  updateDealStatsDaily,
} from './pack433-deal-engine';

// PACK 436: REPUTATION ENGINE
export {
  calculateGARS,
  calculateCountryScores,
  calculateVisibilityScores,
  monitorReputationAnomalies,
  generateWeeklyReport,
} from './pack436-reputation-engine';

// PACK 460: PAID VISIBILITY ENGINE (Boost Campaigns)
export {
  createBoostCampaignV1,
  pauseBoostCampaignV1,
  resumeBoostCampaignV1,
  getMyBoostCampaignsV1,
  getBoostCampaignV1,
  confirmBoostImpressionV1,
  getBoostCampaignImpressionsV1,
  validateBoostLedgerV1,
  boostCampaignExpiryJob,
  boostBudgetRefundJob,
} from './pack460-boost-visibility-endpoints';

// --- A/B TESTING & ACCELERATOR ---
export * from './abTesting';
export * from './accelerator';

// --- ADS ENGINE ---
export * from './adsEngine';
export * from './adRewardsEngine';

// --- SCHEDULED JOBS ---
export * from './scheduled/aggregateInvestorMetrics';
export * from './scheduled/secondChanceScan';

// --- DATA RETENTION ---
export * from './jobs/data-retention.jobs';

// --- TRIGGERS ---
export * from './triggers/teamSecurityMonitoring';

// --- ENGINES (remaining) ---
export * from './engines/contentEngine';
export * from './engines/eventEngine';
export * from './engines/insightEngine';

// ============================================================================
// BATCH D: AI MODULES
// ============================================================================

// --- AI COMPANIONS & CHARACTERS ---
export * from './aiCompanions';
export * from './aiCompanionsPack48';
export * from './aiCompanionFunctions';
export * from './aiCharacters';
export * from './aiBotEngine';
export * from './aiChatEngine';
export * from './aiGenerationService';
export * from './aiMarketplaceFunctions';
export * from './aiMarketplaceRanking';
export {
  storeMemory,
  getRelevantMemories,
  extractMemoriesFromConversation,
  summarizeConversation,
  buildAIContext,
  pruneOldMemories,
  getUserContext as getUserContext_aiMemory,
  rebuildAiUserMemory,
  getAiUserMemory,
  rebuildAiUserMemoryEndpoint,
  scheduledMemoryRebuild,
} from './aiMemory';
export {
  extractTextFromImage,
  detectNSFW,
  detectToxicity as detectToxicity_ai,
  scoreSexualContent,
  containsBannedTerms,
  moderateText as moderateText_ai,
  moderateImage,
  moderateVideo,
  logModerationResult,
  getModerationStats,
  moderateContentV1,
} from './aiModeration';
export * from './aiRouter';
export {
  analyzeContentV1,
  getModerationQueueV1,
  resolveModerationItemV1,
  getAIOversightStatsV1,
} from './aiOversight';
export * from './aiExplainability';

// --- MODERATION ENGINES ---
export * from './aiModerationEngine';
export {
  moderateText as moderateText_content,
  logModerationIncident,
  getUserModerationStats,
} from './contentModerationEngine';

// --- EMOTIONAL INTELLIGENCE ---
export * from './emotionalIntelligence';

// PACK 426: AI REGIONAL ENGINE & RATE LIMIT
export {
  getAIConfig,
} from './pack426-ai-regional-engine';

export {
  checkRateLimitHTTP,
} from './pack426-rate-limit';

// ============================================================================
// DIAGNOSTICS LOG
// ============================================================================
console.log('✅ AVALO Firebase Functions entrypoint loaded successfully');
console.log('📦 All PACK modules exported and ready for deployment');

export { ciHealth } from './ciHealth';
import * as functions from 'firebase-functions';

export const ping = functions.https.onRequest((req, res) => {
  res.send("OK");
});


























// MULTI-ROOM CHAT
export * from './chat/multiChatRoom';
export * from './chat/priorityReply';

// MULTI-ROOM CHAT MONETIZATION
export * from './chat/multiChatRoom';
export * from './chat/priorityReply';


