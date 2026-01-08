/**
 * PACK 441 — Growth Safety Net & Viral Abuse Control
 * Main Entry Point
 * 
 * Exports all modules and provides initialization function.
 */

export * from './types';
export { ViralLoopRiskScorer } from './ViralLoopRiskScorer';
export { ReferralAbuseDetector } from './ReferralAbuseDetector';
export { AdaptiveGrowthThrottle } from './AdaptiveGrowthThrottle';
export { AbuseRetentionCorrelationModel } from './AbuseRetentionCorrelationModel';
export { GrowthSafetyDashboard } from './GrowthSafetyDashboard';

import { Firestore } from 'firebase-admin/firestore';
import { Pack441Config } from './types';
import { ViralLoopRiskScorer } from './ViralLoopRiskScorer';
import { ReferralAbuseDetector } from './ReferralAbuseDetector';
import { AdaptiveGrowthThrottle } from './AdaptiveGrowthThrottle';
import { AbuseRetentionCorrelationModel } from './AbuseRetentionCorrelationModel';
import { GrowthSafetyDashboard } from './GrowthSafetyDashboard';

/**
 * Default configuration for Pack 441
 */
export const defaultConfig: Pack441Config = {
  riskScoring: {
    entropyThreshold: 0.5, // Low entropy threshold
    reuseThreshold: 5, // Max device/IP reuse before flagging
    velocityThreshold: 10, // Max invites per hour before flagging
    weights: {
      entropy: 0.35,
      reuse: 0.35,
      velocity: 0.30,
    },
  },
  fraudDetection: {
    ringDetectionEnabled: true,
    selfReferralCheckEnabled: true,
    farmDetectionEnabled: true,
    confidenceThreshold: 70, // Trigger action if confidence >= 70%
  },
  throttling: {
    defaultLimits: {
      invitesPerDay: 10,
      invitesPerWeek: 50,
      rewardsPerDay: 5,
      referralPayoutsPerMonth: 10,
    },
    trustScoreScaling: true,
    minimumTrustScore: 20, // Minimum trust score before blocking all activity
  },
  correlation: {
    minCohortSize: 10, // Minimum users needed for source analysis
    analysisWindowDays: 30, // Analyze last 30 days
    disableThreshold: 20, // Disable source if quality score < 20
  },
  dashboard: {
    metricsRetentionDays: 90,
    alertRetentionDays: 180,
    topVectorsLimit: 20,
  },
};

/**
 * Initialize Pack 441 modules
 */
export function initializePack441(
  db: Firestore,
  config: Partial<Pack441Config> = {}
): {
  riskScorer: ViralLoopRiskScorer;
  abuseDetector: ReferralAbuseDetector;
  throttle: AdaptiveGrowthThrottle;
  correlationModel: AbuseRetentionCorrelationModel;
  dashboard: GrowthSafetyDashboard;
  config: Pack441Config;
} {
  // Merge provided config with defaults
  const finalConfig: Pack441Config = {
    riskScoring: { ...defaultConfig.riskScoring, ...config.riskScoring },
    fraudDetection: { ...defaultConfig.fraudDetection, ...config.fraudDetection },
    throttling: { ...defaultConfig.throttling, ...config.throttling },
    correlation: { ...defaultConfig.correlation, ...config.correlation },
    dashboard: { ...defaultConfig.dashboard, ...config.dashboard },
  };

  // Initialize modules
  const riskScorer = new ViralLoopRiskScorer(db, finalConfig);
  const abuseDetector = new ReferralAbuseDetector(db, finalConfig);
  const throttle = new AdaptiveGrowthThrottle(db, finalConfig);
  const correlationModel = new AbuseRetentionCorrelationModel(db, finalConfig);
  const dashboard = new GrowthSafetyDashboard(
    db,
    finalConfig,
    riskScorer,
    abuseDetector,
    throttle,
    correlationModel
  );

  return {
    riskScorer,
    abuseDetector,
    throttle,
    correlationModel,
    dashboard,
    config: finalConfig,
  };
}

/**
 * Helper function to check if user can perform growth action
 */
export async function canPerformGrowthAction(
  userId: string,
  actionType: 'invite' | 'reward' | 'payout',
  modules: ReturnType<typeof initializePack441>
): Promise<{ allowed: boolean; reason?: string }> {
  const { riskScorer, abuseDetector, throttle } = modules;

  // Check fraud status first
  const fraudAction = await abuseDetector.getFraudAction(userId);
  if (fraudAction && ['manual_review', 'account_flag'].includes(fraudAction.actionType)) {
    return {
      allowed: false,
      reason: 'Account under review for suspected fraud',
    };
  }

  // Check throttle limits
  let throttleCheck;
  if (actionType === 'invite') {
    throttleCheck = await throttle.canSendInvite(userId);
  } else if (actionType === 'reward') {
    throttleCheck = await throttle.canClaimReward(userId);
  } else if (actionType === 'payout') {
    throttleCheck = await throttle.canProcessPayout(userId);
  }

  if (throttleCheck && !throttleCheck.allowed) {
    return throttleCheck;
  }

  // Check risk score for additional gating
  const riskScore = await riskScorer.getOrCalculateRiskScore(userId);
  if (riskScore.classification === 'abusive') {
    return {
      allowed: false,
      reason: 'Action temporarily restricted due to abuse patterns',
    };
  }

  return { allowed: true };
}

/**
 * Helper function to record growth action
 */
export async function recordGrowthAction(
  userId: string,
  actionType: 'invite' | 'reward' | 'payout',
  modules: ReturnType<typeof initializePack441>,
  blocked: boolean = false,
  reason?: string
): Promise<void> {
  const { throttle } = modules;

  if (actionType === 'invite') {
    await throttle.recordInviteEvent(userId, blocked, reason);
  } else if (actionType === 'reward') {
    await throttle.recordRewardEvent(userId, blocked, reason);
  } else if (actionType === 'payout') {
    await throttle.recordPayoutEvent(userId, blocked, reason);
  }
}

/**
 * Scheduled job: Daily abuse analysis
 */
export async function runDailyAbuseAnalysis(
  modules: ReturnType<typeof initializePack441>
): Promise<void> {
  const { riskScorer, abuseDetector, correlationModel } = modules;

  console.log('[Pack441] Starting daily abuse analysis...');

  // Analyze all sources
  const sourceResults = await correlationModel.batchAnalyzeAllSources();
  console.log(`[Pack441] Analyzed ${sourceResults.size} sources`);

  // Get high-risk users from last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Note: Would need to implement batch user fetching

  console.log('[Pack441] Daily abuse analysis complete');
}

/**
 * Scheduled job: Weekly quality report
 */
export async function generateWeeklyQualityReport(
  modules: ReturnType<typeof initializePack441>
): Promise<any> {
  const { dashboard } = modules;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const report = await dashboard.exportDashboardData(sevenDaysAgo, now);

  console.log('[Pack441] Weekly quality report generated');

  return report;
}
