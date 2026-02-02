/**
 * Avalo Cloud Functions - Main Entry Point
 * Firebase Functions exports - Full Export Patch
 * 
 * Generated: 2026-01-25T21:15:07.311Z
 * Commit: 91c9eb03829c0caf34296b1bacae6643903f8a40
 * Total files: 571
 * Total functions: 2934
 * 
 * This file exports ALL Cloud Functions from the repository.
 * Functions are grouped by domain (A-Z) for organization.
 */

// Initialize Firebase Admin first
import './init';

console.log('🚀 Avalo Cloud Functions loaded (full export - 571 files, 2934 functions)');

// Re-export init utilities for other modules
export { db, auth, storage, admin, generateId, serverTimestamp } from './init';

// ============================================
// DOMAIN A (27 files)
// ============================================
export * from './abTesting';
export * from './accelerator';
export * from './adminConsole';
export * from './adminPanel';
export * from './adminRateLimit';
export * from './adminSupport';
export * from './affiliate/index';
export * from './aiCharacters';
export * from './aiCompanionFunctions';
export * from './aiCompanions';
export * from './aiCompanionsPack48';
export * from './aiExplainability';
export * from './aiMarketplaceFunctions';
export * from './aiMemory';
export * from './aiModeration';
export { ContentType, RiskCategory, RiskLevel, analyzeContentV1, getModerationQueueV1, resolveModerationItemV1, getAIOversightStatsV1 } from './aiOversight';
export * from './ambassador/ambassador.functions';
export * from './amlMonitoring';
export * from './analytics';
export * from './analytics/api';
export * from './analyticsExport';
export * from './api/configApi';
export * from './api/featureFlags';
export * from './api/health';
export * from './api/offline-presence';
export * from './api/payoutHandlers';
export * from './auditFramework';

// ============================================
// DOMAIN B (6 files)
// ============================================
export * from './boosts.functions';
export * from './brandStrategy/index';
export * from './brands/brandCollaborations';
export * from './brands/brandModeration';
export * from './brands/brandProducts';
export * from './brands/brandProfiles';

// ============================================
// DOMAIN C (39 files)
// ============================================
export * from './cacheManager';
export * from './calendar';
export * from './calendarFunctions';
export * from './callable/team/acceptTeamInvite';
export * from './callable/team/getTeamActivity';
export * from './callable/team/getTeamMembers';
export * from './callable/team/grantDmAccess';
export * from './callable/team/inviteTeamMember';
export * from './callable/team/removeTeamMember';
export * from './callable/team/revokeDmAccess';
export * from './callable/team/updateTeamMemberRole';
export * from './challenges';
export * from './chatMediaFunctions';
export * from './chatSecurity';
export * from './chatSync';
export * from './chatSystemNextGen';
export * from './chats';
export * from './chemistryFeedApi';
export * from './chemistryMatchingApi';
export * from './climate/index';
export { recordContribution, getContributionScores, assignClubRole, createClubChallenge, detectCliqueFormation, resolveToxicityEvent, getClubHealth } from './clubIntelligence';
export * from './clubs';
export * from './compliance';
export { AgeVerificationLevel, AgeVerification, MediaScanStatus, MediaSource, MediaSafetyScan, KYCLevel, AMLProfile, GDPRRequestStatus, GDPRErasureRequest, GDPRExportRequest, PolicyType, PolicyDocument, PolicyAcceptance, getAgeState, ageSoftVerify, triggerMediaSafetyScan, getMediaScanStatus, getAMLState, updateAMLProfile, amlDailyMonitor, requestDataErasure, requestDataExport, getLatestPolicies, getUserPolicyAcceptances, acceptPolicy } from './compliancePack55';
export * from './content/contentUploadProcessor';
export * from './content/engagementEngine';
export * from './content/rankingEngine';
export { ReportReason, reportContent } from './content/safetyReporting';
export * from './content/storiesReelsEngine';
export * from './creator/earnings';
export * from './creator/marketplace';
export * from './creatorAnalytics';
export * from './creatorEarnings';
export { CreatorLevel, QuestType, QuestStatus, CreatorDashboard, Quest, PricingRecommendation, CreatorWithdrawal, FanProfile, getCreatorDashboard, getCreatorQuests, claimQuestReward, requestWithdrawal, getCreatorFanbase, getMessageTemplates, saveMessageTemplate, getPricingRecommendations } from './creatorHub';
// PACK 451 - B2B Creator Agreement
export { acceptCreatorAgreementV1, getCreatorAgreementStatusV1, CREATOR_AGREEMENT_CURRENT_VERSION, enforceCreatorAgreement, checkCreatorAgreementStatus } from './pack451-creator-agreement';
export { CreatorStats, GatedPost, Referral, enableCreatorModeV1, getCreatorDashboardV1, createGatedPostV1, unlockGatedPostV1, setMessagePricingV1, generateReferralCodeV1, applyReferralCodeV1, processReferralReward, requestWithdrawalV1, getWithdrawalHistoryV1, getTopFansV1 } from './creatorMode';
export { ProductType, ProductStatus, ContentRating, CreatorProduct, MediaFile, ProductPurchase, createCreatorProduct, uploadProductMedia, publishCreatorProduct, purchaseCreatorProduct, getProductAccessUrls, getCreatorProducts, getMyPurchases, getCreatorStats, updateCreatorProduct, toggleProductStatus, archiveCreatorProduct } from './creatorShop';
export { createCreatorProductV1, publishCreatorProductV1, getCreatorProductsV1, purchaseCreatorProductV1, getMyPurchasesV1, deactivateProductV1, getCreatorAnalyticsV1 } from './creatorStore';
export * from './cyberstalkingEndpoints';
export * from './cyberstalkingReporting';

// ============================================
// DOMAIN D (6 files)
// ============================================
export * from './dating-intentions/index';
export * from './deviceTrust';
export * from './digitalProducts';
export * from './discoveryEndpoints';
export * from './discoveryFeed';
export * from './dynamicPricing';

// ============================================
// DOMAIN E (11 files)
// ============================================
export * from './education/education.functions';
export * from './emotionalIntelligence';
export * from './enforcementEndpoints';
export * from './engines/complianceEngine';
export * from './engines/contentEngine';
export * from './engines/economyEngine';
export * from './engines/eventEngine';
export * from './engines/insightEngine';
export { UserRiskProfile, updateRiskProfileTrigger, updateRiskProfileOnReportTrigger, calculateTrustScoreCallable, calculateTrustScore, banUserCallable, isUserRestricted } from './engines/riskEngine';
export * from './events';
export { submitExpertApplication, approveExpertApplication, rejectExpertApplication, createMentorshipOffer, updateMentorshipOffer, listExpertOffers, createCurriculum, enrollInCurriculum, scheduleMentorshipSession, cancelMentorshipSession, leaveExpertReview, getExpertAnalytics, notifyExpertOfBooking, notifyUserOnExpertApproval } from './expertMarketplace';

// ============================================
// DOMAIN F (5 files)
// ============================================
export * from './fanClubs';
export * from './feed';
export * from './feedDiscovery';
export * from './feedInteractions';
export * from './fraudScheduled';

// ============================================
// DOMAIN G (4 files)
// ============================================
export * from './geoshare';
export * from './gifts/sendGift';
export { invalidateFeedCacheV1, refreshGlobalFeedScheduled, FeedPost, FeedParams } from './globalFeed';
export * from './guardian.functions';

// ============================================
// DOMAIN I (4 files)
// ============================================
export * from './i18nExtended';
export * from './integrations/dataAccess';
export * from './integrations/integrationOperations';
export * from './integrations/partnerManagement';

// ============================================
// DOMAIN J (1 files)
// ============================================
export * from './jobs/data-retention.jobs';

// ============================================
// DOMAIN K (1 files)
// ============================================
export * from './kyc';

// ============================================
// DOMAIN L (11 files)
// ============================================
export * from './leaderboardApi';
export * from './leaderboardScheduled';
export * from './legal/pack338a-acceptLegal';
export * from './legalAcceptance';
export * from './lib/alerting';
export { HealthStatus, HealthResponse, ComponentHealth, DeepHealthResponse, healthDeep, healthCheckEndpoints } from './lib/healthChecks';
export * from './lib/metricsAggregation';
export * from './live';
export * from './liveBroadcasts';
export { TipType, SpecialEffect, LivePoll, VIPRoom, VIPRoomSession, startLiveSession, sendLiveTip, endLiveSession, createLivePoll, voteInLivePoll, createVIPRoom, enterVIPRoom, exitVIPRoom, getActiveLiveSessions } from './liveVipRoom';
export * from './loyalty';

// ============================================
// DOMAIN M (7 files)
// ============================================
export * from './matchingEngine';
export * from './media';
export * from './mobile';
export * from './modHub';
export { moderateContentFunction, getModerationStatusFunction, adminModerationDecision, cleanupOldModerationRecords, generateModerationStats } from './moderation';
export * from './moderationConsole';
export { moderation_updateCase, moderation_enforce, moderation_getCase, moderation_getCaseActions, enforcement_getRestrictions } from './moderationEndpoints';

// ============================================
// DOMAIN N (3 files)
// ============================================
export * from './notificationApi';
export * from './notificationScheduled';
export { sendNotification, getUserNotifications, markAllNotificationsRead, archiveNotification, toggleCategoryNotifications, setSnoozeMode, createReminder, getUserReminders, updateReminder, deleteReminder, getUserDigests, processReminders, generateDailyDigests, generateWeeklyDigests, resetPausedReminders, cleanupOldDigests, cleanupOldNotifications } from './notifications/functions';

// ============================================
// DOMAIN O (1 files)
// ============================================
export * from './observabilityEndpoints';

// ============================================
// DOMAIN P (398 files)
// ============================================
export { publishEvent, purchaseEventTicket, submitQuestion, createPoll, sendEventMessage, uploadEventMaterial, generateEventCertificate, moderateEventContent, completeEventTicketPayment } from './pack-198-webinars/functions';
export * from './pack-227-desire-loop-triggers';
export * from './pack-230-endpoints';
export * from './pack100-disaster-recovery';
export { SystemHealthStatus, ComponentStatus, RateLimiterStatus, BackgroundJobStatus, DiscoveryIndexStatus, getSystemHealthSummary, admin_getSystemDiagnostics } from './pack100-health-monitoring';
export * from './pack100-launch-mode';
export * from './pack100-launch-readiness';
export * from './pack101-success-endpoints';
export * from './pack102-audience-endpoints';
export * from './pack104-scheduled';
export * from './pack105-admin';
export * from './pack105-reconciliation';
export * from './pack105-revenue-export';
export * from './pack106-admin';
export * from './pack106-client-endpoints';
export * from './pack106-currency-management';
export * from './pack107-membership';
export * from './pack109-admin';
export * from './pack109-campaigns';
export * from './pack110-admin';
export * from './pack110-feedback';
export * from './pack110-scheduled';
export * from './pack112-achievements';
export * from './pack113-abuse-detection';
export * from './pack113-api-endpoints';
export * from './pack113-mobile-integration';
export * from './pack113-webhooks';
export * from './pack114-agency-engine';
export * from './pack114-analytics-api';
export * from './pack114-api-integration';
export * from './pack114-safety-enforcement';
export * from './pack115-reputation-endpoints';
export { uploadAsset, deleteAsset, listAssets, schedulePost, cancelScheduledTask } from './pack119-agency-saas';
export { getAgencyOverview, dailyAnalyticsAggregation } from './pack119-analytics';
export * from './pack119-portfolio';
export * from './pack120-brand-campaigns';
export * from './pack126-endpoints';
export * from './pack127-endpoints';
export * from './pack130-endpoints';
export * from './pack132-analytics-cloud';
export * from './pack133-endpoints';
export * from './pack134-api-endpoints';
export * from './pack138-vip-access';
export * from './pack141-api-endpoints';
export * from './pack142-endpoints';
export * from './pack143-endpoints';
export * from './pack145-endpoints';
export * from './pack146-anti-recording';
export * from './pack146-copyright';
export * from './pack146-downloads';
export * from './pack146-scheduled';
export * from './pack147-endpoints';
export * from './pack147-scheduled';
export * from './pack148-endpoints';
export { approveAmbassador, scheduleAmbassadorEvent, registerAttendance, evaluateAmbassadorPerformance, revokeAmbassadorAccess, reportComplianceIncident } from './pack152-ambassadors/functions';
export * from './pack153-endpoints';
export * from './pack154-endpoints';
export * from './pack157-business-partners';
export * from './pack157-venue-events';
export * from './pack158-endpoints';
export * from './pack159-safety-endpoints';
export { CourseFormat, CourseCategory, CourseStatus, CourseVisibility, PurchaseType, createCourse, publishCourse, publishEpisode, purchaseEpisode, trackCourseProgress, reviewCourse, createCourseBundle, onCourseProgressUpdate, pack162_createCourse, pack162_publishCourse, pack162_publishEpisode, pack162_purchaseCourse, pack162_purchaseEpisode, pack162_trackCourseProgress, pack162_reviewCourse, pack162_issueCertificate, pack162_createCourseBundle, pack162_onCourseProgressUpdate } from './pack162-courses';
export * from './pack162-quizzes';
export { assignAcceleratorTrack, completeMilestone, issueAcceleratorGrant, issueAcceleratorCertificate, checkMilestoneDeadlines, calculateAcceleratorAnalytics } from './pack164-accelerator';
export * from './pack166-scalability';
export * from './pack167-affiliates';
export * from './pack168-schedulers';
export { updateSettings, updateConsent, getConsentHistory, terminateSession, exportUserData, requestAccountDeletion, getSessionDevices, updatePaymentSettings } from './pack171-settings-functions';
export * from './pack174-fraud-shield/crypto-scam-detection';
export * from './pack174-fraud-shield/dispute-resolution';
export * from './pack174-fraud-shield/emotional-manipulation-detection';
export * from './pack174-fraud-shield/fraud-detection';
export * from './pack174-fraud-shield/fraud-mitigation';
export * from './pack174-fraud-shield/impersonation-detection';
export * from './pack174-fraud-shield/message-filtering';
export * from './pack174-fraud-shield/payment-fraud-detection';
export * from './pack174-fraud-shield/schedulers';
export * from './pack179-reputation';
export * from './pack183-endpoints';
export * from './pack186-ai-evolution-endpoints';
export * from './pack187-multilingual';
export * from './pack188-narrative-engine';
export * from './pack190-sync/index';
export * from './pack191-collab-streams';
export { StreamStatus, StreamCategory, LiveStream, StreamReaction, StreamPoll, PollOption, StreamChallenge, ModerationEvent, joinLiveStream, sendStreamReaction, createStreamPoll, voteOnPoll, createStreamChallenge, submitToChallenge, reportStream, monitorStreamHealth, createStreamReplay, updateViewerActivity } from './pack191-live-arena';
export * from './pack191-safety-monitor';
export * from './pack193-sexuality-consent-functions';
export * from './pack195-legal-tax/index';
export * from './pack196-endpoints';
export * from './pack200-auto-heal-runtime';
export * from './pack200-auto-scale-traffic';
export * from './pack200-firestore-rules-validator';
export * from './pack200-resolve-stability-conflict';
export * from './pack200-stress-test-suite';
export * from './pack200-track-metrics';
export * from './pack206c-adult-mode';
export * from './pack209-admin-endpoints';
export * from './pack209-events-refund';
export * from './pack210-safety-tracking-functions';
export * from './pack211-adaptive-safety-functions';
export * from './pack212-reputation-functions';
export * from './pack213-functions';
export * from './pack214-functions';
export { generateReferralLink, onSelfieVerified, onMeetingBooked, processAudienceImport, processPayerViralMoment, claimViralReward, aggregateViralMetrics } from './pack215-viral-loop';
export { getMySchedule, aggregateMeetingToSchedule, aggregateEventToSchedule, getMyReminders, dismissReminder, getCancellationDeadlines, generateAttendeeQR, scanAttendeeQR, getEventAttendees, issueVoluntaryEventRefund, getMeetingSummary, logSafetyPanelAccess, getScheduleItemSafetyInfo, discoverEvents, saveEventFilter, getMySavedFilters, sendPendingReminders, updateScheduleStatuses } from './pack218-calendar-events';
export * from './pack228-sleep-mode';
export * from './pack233-royal-challenges';
export * from './pack234-anniversary';
export * from './pack242Functions';
export * from './pack243-creator-dashboard';
export * from './pack244-creator-league';
export * from './pack245-audience-segments-engine';
export * from './pack246-cloud-functions';
export { UnlockStatus, WithdrawalStatus, EarningsUnlockCriteria, WithdrawalRiskScore, RiskScoreEvent, WithdrawalValidation, EconomicLog, checkEarningsUnlock, calculateRiskScore, validateWithdrawal, getUserRiskStatus, resetMonthlyRiskScores, processPendingReviews } from './pack247-withdrawal-antifraud';
export * from './pack253-royal-endpoints';
export * from './pack255-endpoints';
export * from './pack256Callable';
export { getEarningsOverview, getEngagementMetrics, getConversationAnalytics, getMediaSalesAnalytics, getPerformanceLevel, getOptimizationSuggestions, getRoyalAdvancedAnalytics, actOnSuggestion } from './pack257-creatorDashboard';
export { onTokenSpending, onCreatorViewsProfile, onCreatorOnlineStatus, onNewStory, onNewPaidMedia, processRetentionTriggersScheduled, resetMonthlySpendingScheduled, getSupporterAnalytics, getFanLevel } from './pack258-supporterAnalytics';
export { requestPayout, computeAnalytics, getEarningsDashboard, notifyTopSupporterActive } from './pack261-earnings';
export { EarningsNotification, notifyLargeGift, notifyRecordBreaking, notifyPayoutStatus, notifyVIPActive, sendWeeklySummary, notifyMilestoneApproaching, batchNotifyCreators, getUnreadCount } from './pack261-notifications';
export * from './pack261-payout-service';
export { LevelConfig, LevelBenefits, LEVEL_CONFIGS, LP_RATES, CreatorLevelProfile, LPActivity, CreatorRewards, BoostInstance, initializeCreatorLevel, recordLPActivity, activateBoost, resetWeeklyBoosts, expireInactiveBoosts, checkAndSendMilestoneNotifications, notifyTopSupporterOnline, getCreatorLevel, getLPActivityHistory } from './pack262-creator-levels';
export { MissionType, MissionStatus, MissionTemplate, ActiveMission, CreatorMissionProfile, MissionProgress, initializeCreatorMissions, getCreatorMissions, recordMissionProgress, claimMissionReward, updateMissionSlotsOnLevelChange, resetDailyMissions, resetWeeklyMissions, assignDailyMissions, assignWeeklyMissions, completeMission, validateActivity, awardMissionLP, sendMissionNotification } from './pack263-creator-missions';
export { getSupporterRanking, getSupporterLeaderboard, updateSupporterProfile, getSupporterNotifications, getCreatorSupporterAnalytics, recalculateSupporterRankings } from './pack264-supporters-endpoints';
export * from './pack264-supporters-engine';
export { generateDailySuggestions, getCreatorSuggestions, calculateDMPriorities, getDMPriority, dailySuggestionGeneration } from './pack265-ai-earn-assist-endpoints';
export * from './pack266-supporter-crm-endpoints';
export * from './pack277-wallet-endpoints';
export * from './pack278-perks-endpoints';
export * from './pack278-subscription-endpoints';
export * from './pack279-ai-chat-runtime';
export * from './pack279-ai-voice-runtime';
export { getLegalDocuments, checkLegalCompliance, getUserLegalAcceptances, adminCreateLegalDocument } from './pack281-legal-system';
export { createPost, updatePost, getPost, onLikeCreated, onLikeDeleted } from './pack282-feed-engine';
export { likePost, unlikePost, getPostLikes, updateComment, getPostComments, savePost, unsavePost, getSavedPosts, trackPostView } from './pack282-feed-interactions';
export * from './pack283-discovery';
export * from './pack284-swipe-engine';
export * from './pack288-mobile-purchases';
export * from './pack288-web-stripe';
export * from './pack289-kyc';
export * from './pack289-payout-providers';
export * from './pack289-withdrawals-admin';
export * from './pack289-withdrawals';
export * from './pack290-creator-analytics';
export * from './pack290-daily-aggregation';
export * from './pack291-ai-assist';
export { getNotifications, dismissNotificationFunc, registerDeviceForPush, unregisterDeviceFromPush, updateDeviceActivity, processNotification, processBatchedNotifications, sendNotificationToUser, getNotificationAnalytics } from './pack293-notification-functions';
export * from './pack294-discovery-analytics';
export * from './pack294-discovery-search';
export * from './pack294-profile-search';
export * from './pack296-admin-management';
export * from './pack296-audit-api';
export * from './pack296-data-retention';
export { HealthCheckResponse, healthCheckDetailed } from './pack297-health-check';
export * from './pack298-unified-engine';
export * from './pack300-support-functions';
export * from './pack301-activity-hook';
export * from './pack301-analytics';
export * from './pack301-daily-churn';
export * from './pack301-nudges';
export * from './pack301-onboarding';
export * from './pack301-retention-functions';
export * from './pack301-winback';
export * from './pack302-mobile-billing';
export * from './pack302-web-billing';
export * from './pack303-endpoints';
export * from './pack304-endpoints';
export * from './pack305-legal-snapshots/api';
export * from './pack306-verification';
export { CatfishRiskProfile, RiskComputationInput, ImageAnalysisResult, recomputeUserCatfishRisk, recomputeCatfishRisk, cronRecomputeCatfishRiskDaily, onProfilePhotoUpdate, onVerificationComplete, onCatfishReport, adminOverrideCatfishRisk, getCatfishRiskDashboard } from './pack307-catfish-risk';
export * from './pack312-support-actions';
export * from './pack312-support-console';
export * from './pack312-support-context';
export * from './pack314-registration';
export * from './pack315-notifications/growth-funnels';
export * from './pack315-notifications/sender';
export * from './pack316-review-mode/endpoints';
export * from './pack317-endpoints';
export * from './pack317-launch-check';
export { dailyModerationAnalyticsRollup, getModerationAnalytics } from './pack320-analytics';
export * from './pack320-auto-flagging';
export * from './pack320-moderation-actions';
export * from './pack322-ai-video-runtime';
export { ContentVisibility, FeedReel, FeedStory, FeedLike, FeedView, FeedComment, pack323_createFeedPost, pack323_createFeedReel, pack323_createFeedStory, pack323_likeContent, pack323_addComment, pack323_reportContent, pack323_storyExpiryJob } from './pack323-feed-engine';
export * from './pack324a-kpi-endpoints';
export * from './pack324b-fraud-endpoints';
export * from './pack324c-trust-endpoints';
export { BoostSize, BoostStatus, Gender, FeedBoost, pack325_createFeedBoost, pack325_cancelFeedBoost, pack325_getUserBoosts, pack325_trackBoostImpression, pack325_trackBoostClick, pack325_trackBoostProfileVisit, pack325_expireFeedBoosts, getActiveBoostForContent } from './pack325-feed-boosts';
export * from './pack326-ad-delivery';
export * from './pack326-admin-controls';
export * from './pack326-campaign-management';
export * from './pack326-tracking-billing';
export * from './pack327-analytics';
export * from './pack327-promo-bundles';
export * from './pack328a-identity-verification';
export * from './pack328c-selfie-verification-functions';
export * from './pack329-policy-endpoints';
export * from './pack330-export-hooks';
export * from './pack330-platform-reports';
export * from './pack330-tax-profile';
export * from './pack330-tax-reports';
export * from './pack331-ai-avatar-marketplace';
export * from './pack335-support-ai';
export * from './pack335-support-engine';
export * from './pack336-aggregation-cron';
export { createAlert, resolveAlert, pack336_getRecentAlerts, pack336_acknowledgeAlert, pack336_resolveAlert, pack336_getAlertThresholds, pack336_updateAlertThresholds } from './pack336-alerting';
export * from './pack336-dashboard';
export * from './pack336-experiments';
export * from './pack336-investor-export';
export * from './pack337a-exports';
export * from './pack339-disaster-recovery';
export * from './pack344-ai-helpers';
export * from './pack345-compliance-middleware';
export * from './pack345-country-config';
export * from './pack345-launch-audit';
export * from './pack346-abuse-detection';
export { checkKPIThresholds } from './pack346-alert-routing';
export * from './pack346-churn-engine';
export * from './pack346-creator-kpi';
export * from './pack346-kpi-aggregation';
export * from './pack348-ranking-engine/index';
export { createAd, updateAd, deleteAd, activateAd, pauseAd, addAdToCampaign, activateCampaign, pauseCampaign, endCampaign, getAdForFeed, getAdsForDiscovery, recordAdPlacement, createAdvertiserAccount, addAdvertiserTokens, createCreatorSponsorship, endCreatorSponsorship, requestCreatorPayout, processScheduledCampaigns, processMinimumGuarantees } from './pack349-endpoints';
export * from './pack350-endpoints';
export * from './pack352-creator-metrics-sync';
export * from './pack352-daily-aggregator';
export { pack352_logKpiEvent, logKpiEvent, logKpiEventsBatch, logSignupEvent, logChatPaidStarted, logCallEvent, logCalendarBooking, logPanicEvent, logSupportTicket, logFraudFlag } from './pack352-kpi-events';
export { applyAsInfluencer, getInfluencerApplicationStatus, adminGetInfluencerApplications, adminReviewInfluencerApplication, adminUpdateCreatorTier, adminToggleCreatorCapability, adminForceCreatorKYC, adminToggleWalletFreeze, adminBanDeviceAndIP, adminGetCreatorAnalytics, adminCreateRegionalProgram, dailyCreatorRiskAssessment, dailyRegionalProgramUpdate } from './pack354-influencer-endpoints';
export * from './pack355-referral-endpoints';
export * from './pack356-ad-attribution';
export { CampaignType, CampaignObjective, CampaignStatus, AdEventType, AdCampaign, AdEvent, DeviceFraudCheck, trackAdEvent, updateCampaignBudget, adPlatformWebhook } from './pack356-ad-tracking';
export * from './pack356-kpi-extensions';
export * from './pack356-retargeting';
export * from './pack356-roas-engine';
export * from './pack358-burnrate-engine';
export * from './pack358-financial-forecast';
export * from './pack358-ltv-model';
export * from './pack358-stress-scenarios';
export * from './pack359-creator-tax-statements';
export * from './pack359-dsa-reports';
export { DataRetentionPolicy, DataErasureRequest, DataExportRequest, UserDataPackage, enforceRetentionPolicies, requestErasure, requestExport, checkDataRequestStatus } from './pack359-gdpr-retention';
export * from './pack359-jurisdiction-engine';
export * from './pack359-tax-calculator';
export { CulturalSafetyProfile, ContentModerationResult, getCulturalSafetyProfile, moderateContent, checkFeatureAvailability, adminUpdateCulturalSafetyProfile, adminGetAllSafetyProfiles } from './pack360-cultural-safety';
export { CurrencyProfile, TokenPriceConfig, CurrencyConversion, updateExchangeRates, getUserCurrency, convertTokenPriceToLocal, convertPayoutToLocal, adminSetRegionalPricing, adminToggleCurrency, formatCurrency, initializeCurrencyRates } from './pack360-currency-engine';
export { LanguageProfile, TranslationPhrase, UserLanguagePreference, getSupportedLanguages, setUserLanguage, getTranslationPhrases, adminUpdateTranslationPhrase, adminToggleLanguage, onUserCountryChange, cacheTranslations } from './pack360-language-engine';
export { LegalDocument, UserLegalAcceptance, LegalUpdateNotification, getUserLegalDocuments, acceptLegalDocument, checkMandatoryAcceptances, checkUserLegalCompliance, adminGetAllLegalDocuments, adminGetLegalAcceptanceStats, onUserLogin, onUserCountryChangeLegal } from './pack360-legal-text-engine';
export * from './pack360-regional-ux';
export { ScalingMetrics, ScalingRule, BurstProtection, collectServiceMetrics, updateMetrics, evaluateScaling, enableBurstProtection, disableBurstProtection, evaluateAllServices, detectViralTraffic, getScalingStatus, getScalingHistory, manualScale } from './pack361-autoscaling';
export * from './pack361-cdn-control';
export * from './pack361-cost-control';
export { RecoveryPoint, RecoveryOperation, FailoverStatus, createHourlyBackup, createDailyBackup, createColdStorageBackup, recoverWallet, recoverChat, recoverSupportTicket, recoverAiSession, initiateRegionFailover, monitorBackupHealth } from './pack361-failover';
export { Region, RegionNode, UserRegionMapping, HealthCheckResult, FailoverEvent, getOptimalRegion, getRegionHealth, runHealthChecks, performFailover, getRouting, forceFailover, getRegionStatuses, initializeRegions } from './pack361-load-balancer';
export { SystemMetrics, PerformanceAlert, trackChatDelivery, trackWalletTransaction, trackEventCheckout, trackAiResponse, trackVideoCallQuality, trackPanicButton, runHealthCheck, getSystemHealth, getMetricsHistory, getActiveAlerts, getDashboardData, cleanupOldMetrics } from './pack361-monitoring';
export { trackLatency, aggregateMetricsHourly, generateDashboardData } from './pack363-realtime-metrics';
export * from './pack367-store-defense/index';
export * from './pack368-referral-functions';
export * from './pack370-ltv-engine';
export * from './pack372-global-launch';
export * from './pack373-marketing-automation';
export * from './pack374-viral-growth';
export * from './pack376-app-store-defense';
export * from './pack377-launch-orchestration';
export * from './pack379-aso-reputation';
export * from './pack380-brand-engine';
export * from './pack380-influencer-engine';
export * from './pack380-localization-engine';
export * from './pack380-pr-engine';
export * from './pack381-expansion-engine';
export * from './pack381-moderation';
export * from './pack381-region-config';
export * from './pack381-regional-pricing';
export * from './pack381-regional-risk';
export * from './pack382-burnout-prevention';
export * from './pack382-creator-academy';
export * from './pack382-earnings-optimizer';
export * from './pack382-pricing-recommender';
export * from './pack382-skill-scoring';
export * from './pack383-chargeback-firewall';
export * from './pack383-fx-engine';
export * from './pack383-kyc-aml';
export * from './pack383-payout-limits';
export * from './pack383-payout-router';
export * from './pack383-tax-engine';
export * from './pack384-aso-monitor';
export * from './pack384-paid-review-detection';
export * from './pack384-review-defense';
export * from './pack384-store-policy-monitor';
export * from './pack384-trust-score';
export * from './pack385-ambassadors';
export * from './pack385-launch-payout-safety';
export * from './pack385-launch-phase';
export { MarketStatus, pack385_activateMarket, pack385_getMarketConfig, pack385_checkMarketFeature, pack385_suspendMarket, pack385_getActiveMarkets, pack385_monitorMarketHealth } from './pack385-market-activation';
export * from './pack385-referrals';
export * from './pack385-traffic-guard';
export * from './pack386-attribution';
export * from './pack386-budget-guardian';
export * from './pack386-campaigns';
export * from './pack386-influencers';
export * from './pack386-marketing-fraud';
export * from './pack386-review-trigger';
export * from './pack387-crisis-orchestration';
export * from './pack387-incidents';
export * from './pack387-influencer-risk';
export * from './pack387-public-statements';
export * from './pack387-reputation-ingest';
export * from './pack387-store-shield';
export * from './pack388-age-verification';
export * from './pack388-gdpr';
export { KYCStatus, AMLRiskLevel, pack388_runKYCCheck, pack388_monitorAMLPatterns, pack388_blacklistWallet, pack388_getKYCStatus } from './pack388-kyc-aml';
export * from './pack388-regulatory-response';
export * from './pack388-retention';
export * from './pack390-aml';
export * from './pack390-bank';
export * from './pack390-fx';
export * from './pack390-payouts';
export * from './pack390-tax';
export * from './pack393-influencer-engine';
export * from './pack393-marketing-orchestrator';
export * from './pack395-invoicing';
export { submitKYCLevel1, submitKYCLevel2, submitKYB, validatePaymentMethod, getVerificationStatus } from './pack395-kyc-compliance';
export { VAT_RATES, calculatePurchaseTax, updateVATRates, validateVATNumber, calculateTransactionTax } from './pack395-tax-engine';
export * from './pack397-review-intelligence';
export * from './pack398-aso-engine';
export * from './pack398-launch-orchestrator';
export { Campaign, InfluencerCohort, LTVPrediction, CACTracking, CampaignROI, createCampaign, trackCampaignPerformance, createInfluencerCohort, predictUserLTV, monitorCampaigns, calculateCampaignROI, getCampaignDashboard } from './pack398-traffic-sync';
export { ReferralStatus, ReferralRewardType, ViralInvite, InviteReward, ViralLeaderboardEntry, generateReferralCode, createReferral, completeReferral, sendViralInvite, getReferralStats, getViralLeaderboard, calculateLeaderboardRanks } from './pack398-viral-engine';
export * from './pack399-influencer-engine';
export * from './pack401-fraud-correlation-functions';
export * from './pack402-kpi-functions';
export * from './pack411-rating-trigger';
export * from './pack411-reputation-defense';
export * from './pack411-store-reviews-ingestion';
export * from './pack412-launch-orchestrator';
export * from './pack413-kpi-command-center';
export * from './pack413-panic-modes';
export * from './pack414-health';
export * from './pack414-integration-audit';
export * from './pack415-rate-limiter';
export * from './pack416-audit-integration';
export * from './pack417-incident.triggers';
export * from './pack421-health.controller';
export * from './pack422-reputation.policy';
export { onBillingEvent, onMeetingStatusChange, onQRVerification, onTransactionComplete, onDisputeCreated, onFraudAlert, onPanicEvent, onUserRestrictionChange, onSupportTicketCreated, onSupportTicketUpdated, onAIViolation, onAIUserBlocked, onUserChurn, forceReputationRecalc } from './pack422-reputation.triggers';
export * from './pack423-ratings.http';
export * from './pack424-aso.service';
export * from './pack424-review-ai.service';
export * from './pack424-review-retention';
export * from './pack424-store-reviews.scheduler';
export * from './pack424-trust-score.service';
export * from './pack425-functions';
export * from './pack426-ai-regional-engine';
export { FraudRiskProfile, FraudFactor, ThrottleConfig, ThrottleResult, calculateFraudRisk, checkFraudThrottle, getRegionalFraudStats, updateRegionalRiskFactor, autoEscalateHighRisk, cacheFraudProfile, getCachedFraudProfile, checkFraudThrottleHTTP, getFraudRiskHTTP } from './pack426-fraud-throttle';
export { UserRegionAssignment, REGION_CONFIGS, routeRegion, getOptimalRegionConfig, routeFeature, getFailoverOrder, checkRegionHealth, updateRegionHealth, assignUserRegion, setUserRegionOverride, getRegionConfig, regionHealthCheck } from './pack426-global-router';
export { RateLimitResult, RateLimitAction, BASE_RATE_LIMITS, checkBurstProtection, checkRegionalRateLimit, checkIPRateLimit, hasRateLimitBypass, grantRateLimitBypass, getUserRateLimitStats, checkRateLimitHTTP } from './pack426-rate-limit';
export * from './pack427-realtime-signals';
export * from './pack427-sync-endpoints';
export { UserJourney, JourneyEvent, CohortAnalysis, trackInstall, trackJourneyEvent, calculateUserLTV, generateCohortAnalysis, updateCampaignLTVOptimization, getLTVReport, attributionEngine } from './pack432-attribution';
export * from './pack432-google-connector';
export * from './pack432-meta-connector';
export * from './pack432-tiktok-connector';
export { FraudSignal, FraudBlock, captureDeviceFingerprint, detectDeviceFarms, detectCPIManipulation, detectRefundAbuse, reviewFraudSignal, getFraudDashboard, checkFraudBlock, uaFraud } from './pack432-ua-fraud';
export { CampaignConfig, CampaignPerformance, BudgetAllocation, monitorCampaignHealth, calculateBudgetAllocation, autoExpandTopCampaigns, uaOrchestrator } from './pack432-ua-orchestrator';
export * from './pack432-ugc-engine';
export { CreatorAttribution, AttributionEvent, UserAttributionLock, createAttribution, trackFirstChat, trackFirstPurchase, getDealAttributions, checkAttributionLock, onWalletTransactionCreated } from './pack433-attribution';
export { FraudSignalType, FraudSeverity, FraudStatus, CreatorRiskScore, onAttributionCreated, getCreatorFraudSignals, getCreatorRiskScore, dailyFraudScan, cleanupOldFraudSignals } from './pack433-creator-fraud';
export { CreatorPlatform, CreatorCategory, CreatorStatus, PlatformConnection, TrafficSource, CreatorDiscoveryFilters, registerCreator, updateCreatorProfile, addPlatformConnection, discoverCreators, registerTrafficSource, approveCreator, updateCreatorStatus } from './pack433-creator-marketplace';
export * from './pack433-deal-engine';
export { PayoutStatus, PayoutMethod, CreatorPayoutAccount, CreatorPayout, PayoutCalculation, addPayoutAccount, getPayoutAccounts, calculatePayoutAmount, getPayoutHistory, processPayout, holdPayoutForFraud, processWeeklyPayouts } from './pack433-payouts';
export * from './pack436-metadata-safeguard';
export * from './pack436-review-boost';
export * from './pack440/functions';
export * from './pack448-incident-functions';
export { getLegalRequirementsForUser, admin_uploadLegalDocument, getAllLegalDocuments, getUserLegalStatus, validateLegalAcceptance, checkLegalRequirements } from './pack89-legal-center';
export * from './pack90-admin';
export * from './pack91-admin';
export { unregisterPushToken, markNotificationAsRead, markAllNotificationsAsRead } from './pack92-endpoints';
export { DataExportStatus, DeletionRequestStatus, UserDataExport, UserDeletionRequest, ExportedUserData, processPendingDataExports, getMyDataExports, processPendingDeletionRequests, getMyDeletionStatus } from './pack93-data-rights';
export { registerDeviceAndSession, logoutSession, logoutAllSessions } from './pack95-session-security';
export * from './pack96-twoFactorEndpoints';
export { ContentAnalyticsDaily, EarningsTimeseriesPoint, EarningsTimeseries, TopContentItem, TopContentResult, rebuildContentAnalyticsForDay, dailyContentAnalyticsJob, getCreatorEarningsTimeseries, getTopPerformingContent } from './pack97-creatorAnalytics';
export * from './pack98-helpCenter';
export * from './pack98-seedHelpContent';
export * from './pack99-admin';
export * from './pack99-client';
export * from './paidMedia';
export * from './payments.providers';
export { creditTokensCallable } from './payments';
export { TokenPack, TOKEN_PACKS, Transaction, UserWallet, EscrowRecord, Settlement, createStripeCheckoutSession, stripeWebhookV2, validateAppleReceipt, initiateChat, releaseEscrowIncremental, autoRefundInactiveEscrows, generateMonthlySettlements, getWalletBalance, getTransactionHistory, completeCalendarBooking, getCreatorSettlements, getPendingSettlements } from './paymentsComplete';
export { TransactionType, TransactionStatus, purchaseTokensV2, getTransactionHistoryV2, getUserWalletsV2, getExchangeRatesV1, syncExchangeRatesScheduler, generateComplianceReportsScheduler } from './paymentsV2';
// PHASE 3.1: Stripe webhook with treasury invariants (NO_DISCOUNTS, NO_FREE_TOKENS, idempotency)
export { stripeWebhookV1, CANONICAL_TOKEN_PACKS } from './payments/stripe';
export * from './payoutRequests';
export * from './personalization';
export * from './predictiveAnalytics';
export * from './premiumStories';
export * from './presence';
export { requestDataExportV1, requestAccountDeletionV1, cancelAccountDeletionV1, getPrivacyRequestStatusV1 } from './privacy';
export { ExportJobStatus, ExportJob, DeletionJobStatus, DeletionJob, getExportStatus, downloadExport, requestDeletion, getDeletionStatus, reviewDeletion, processExportJobs, processDeletionJobs } from './privacyCenter';
export { updateCampaign, addBudget, fetchPromotionsForPlacement, logPromotionImpression, logPromotionClick } from './promotions';

// ============================================
// DOMAIN R (9 files)
// ============================================
export * from './realtimeEngine';
export * from './recommender';
export { ReferralProfile, ReferralEvent, UserAttribution, createOrGetReferralCode, attributionOnSignup, trackMilestone, getReferralProfile, aggregateReferralProfiles, admin_getReferralProfile } from './referrals';
export * from './remoteConfig';
export * from './reputation-endpoints';
export * from './reputationEngine';
export { MeetingMode, ReservationStatus, EscrowStatus, WeeklyBlock, WeeklySlot, DateOverride, CreatorAvailability, Reservation, ReservationEscrow, getAvailability, setAvailability, createReservation, cancelReservation, confirmReservation, listReservations, cleanupPendingReservations, autoTimeoutReservations } from './reservations';
export { ConnectionType, FraudPattern, analyzeUserRiskGraphV1, detectClustersV1, getClusterMembersV1, blockClusterV1, detectFraudClustersDaily } from './riskGraph';
export * from './royalEndpoints';

// ============================================
// DOMAIN S (18 files)
// ============================================
export { QuestDifficulty, QuestCategory, BadgeRarity, getAvailableQuestsV1, startQuestV1, completeQuestStepV1, claimQuestRewardsV1, getSafetyProfileV1, getSafetyLeaderboardV1, seedQuestDefinitions } from './safetyGamification';
export * from './safetyRelationship';
export { createSafetyTimer, checkInSafetyTimer, cancelSafetyTimer, triggerPanic, getUserSafetyTimers, checkExpiredSafetyTimers, cleanupOldSafetyRecords } from './safetyTimers';
export { ShardConfig, LoadMetrics, CacheStrategy, RegionalConfig, getShardId, writeToShardedCollection, readFromShardedCollection, bulkWrite, getLoadMetrics, configureSharding } from './scalingInfrastructure';
export * from './scheduled';
export { securityMonitoringScheduler, getSecurityIncidentsV1, updateSecurityIncidentV1 } from './secops';
export * from './security';
export { getUserRiskAssessmentV1, trainFraudDetectionModel } from './securityAI';
export { SecurityCheckResult, SecurityThreat, MediaWatermark, LeakAlert, RateLimitBucket, performSecurityCheck, watermarkMedia, reportLeakedMedia, detectScreenshot, blockDevice, generateMediaFingerprint, checkGlobalRateLimit } from './securityLayer';
export * from './smartSocialGraph/index';
export { sharePreferenceAcrossAis, getSharedPreferencesForAi, storeUserStoryProgress, blockPreferenceSharing, resolvePreferenceConflict, getMemoryAnalytics, wipeUserMemory } from './socialMemoryHub';
export * from './socialVerification';
export * from './sponsorships/index';
// SKIP: all exports duplicate - export * from './support/addMessage';
// SKIP: all exports duplicate - export * from './support/createTicket';
// SKIP: all exports duplicate - export * from './support/searchHelpArticles';
// SKIP: all exports duplicate - export * from './support/updateTicket';
export { SupportCategory, SupportSeverity, TicketStatus, AssignedTeam, listMyTickets, replyToTicket, getHelpArticles } from './supportCenter';

// ============================================
// DOMAIN T (12 files)
// ============================================
export * from './tax-calculation';
export { tax_issueInvoice, tax_generateReport, tax_getDocuments } from './tax-documents';
export * from './tax-engine-functions';
export * from './tax-profile';
export * from './tools/generateTestData';
export * from './treasury-audit';
export * from './treasury-payout-safety';
export * from './treasury-wallet';
export * from './treasury';
export { onMessageCreated, dailyLockInMaintenance, sendDailyChemistryReminders, triggerChemistryDetection, disableChemistryNotifications } from './triggers/chemistryLockInTriggers';
export * from './triggers/teamSecurityMonitoring';
export * from './trustRiskEndpoints';

// ============================================
// DOMAIN U (1 files)
// ============================================
export * from './userControlCenter';

// ============================================
// DOMAIN V (2 files)
// ============================================
export * from './vibeRecommendationEngine';
export * from './vipPayerProgram';

// ============================================
// DOMAIN W (5 files)
// ============================================
export * from './walletBridge';
export { TokenPackTier, AutoLoad, Cashback, SeasonalEvent, EarningsDashboard, SettlementReport, Invoice, getTokenPacks, purchaseTokens, configureAutoLoad, applyPromoCode, generateSettlementReport, generateInvoice, getCashbackStatus } from './walletFintech';
export * from './webOperations';
export * from './webrtcSignaling';
export { checkPayoutStatus } from './workers/payoutProcessor';

