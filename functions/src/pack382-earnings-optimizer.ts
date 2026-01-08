/**
 * PACK 382 — AI Earnings Optimizer
 * Automated earnings optimization suggestions
 */

import * as functions from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  EarningsOptimization,
  OptimizationType,
  GenerateOptimizationsInput,
  GenerateOptimizationsOutput,
  CreatorEarningProfile,
} from './types/pack382-types';
import { v4 as uuidv4 } from 'uuid';

const db = getFirestore();

/**
 * Generate AI-powered earnings optimizations for a creator
 */
export const pack382_generateEarningsOptimizations = functions.https.onCall(
  async (
    data: GenerateOptimizationsInput,
    context
  ): Promise<GenerateOptimizationsOutput> => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { userId = context.auth.uid, regionCode, limit = 10 } = data;

    // Only allow users to get their own optimizations (or admins)
    const isAdmin = context.auth.token?.role === 'admin';
    if (userId !== context.auth.uid && !isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Can only get own optimizations'
      );
    }

    try {
      // Get creator profile
      const profileDoc = await db
        .collection('creatorEarningProfiles')
        .doc(userId)
        .get();

      if (!profileDoc.exists) {
        // Generate profile first
        throw new functions.https.HttpsError(
          'not-found',
          'Creator profile not found - calculate skill score first'
        );
      }

      const profile = profileDoc.data() as CreatorEarningProfile;

      // Generate optimizations
      const optimizations: EarningsOptimization[] = [];

      // 1. Pricing optimizations
      const pricingOpts = await analyzePricingOpportunities(userId, profile, regionCode);
      optimizations.push(...pricingOpts);

      // 2. Service expansion opportunities
      const serviceOpts = await analyzeServiceExpansion(userId, profile);
      optimizations.push(...serviceOpts);

      // 3. Quality improvements
      const qualityOpts = await analyzeQualityImprovements(userId, profile);
      optimizations.push(...qualityOpts);

      // 4. Schedule optimizations
      const scheduleOpts = await analyzeScheduleOptimizations(userId, profile);
      optimizations.push(...scheduleOpts);

      // 5. Safety improvements
      const safetyOpts = await analyzeSafetyImprovements(userId, profile);
      optimizations.push(...safetyOpts);

      // 6. Burnout prevention
      if (profile.burnoutRiskScore > 60) {
        const burnoutOpts = await generateBurnoutPreventionOpts(userId, profile);
        optimizations.push(...burnoutOpts);
      }

      // Sort by priority
      optimizations.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

      // Save top optimizations
      const topOptimizations = optimizations.slice(0, limit);

      for (const opt of topOptimizations) {
        await db
          .collection('earningsOptimizations')
          .doc(opt.optimizationId)
          .set(opt);
      }

      return {
        optimizations: topOptimizations,
        totalCount: optimizations.length,
      };
    } catch (error) {
      console.error('Error generating optimizations:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to generate optimizations'
      );
    }
  }
);

/**
 * Analyze pricing opportunities
 */
async function analyzePricingOpportunities(
  userId: string,
  profile: CreatorEarningProfile,
  regionCode?: string
): Promise<EarningsOptimization[]> {
  const optimizations: EarningsOptimization[] = [];

  // Check chat pricing
  const chatDemand = profile.metrics.chatConversionRate;
  if (chatDemand > 60 && profile.metrics.avgRevenuePerUser > 30) {
    optimizations.push({
      optimizationId: uuidv4(),
      userId,
      type: 'pricing-increase',
      priority: 'high',
      title: 'Increase Chat Pricing',
      description: 'Your high conversion rate supports a +15% price increase',
      actionSteps: [
        'Go to Settings > Pricing',
        'Increase chat price by 15%',
        'Monitor demand for 7 days',
      ],
      predictedImpact: {
        revenueIncreasePercentage: 12,
        conversionRateImprovement: -5, // Expected slight drop
        retentionImprovement: 0,
      },
      insight:
        'Your 60%+ conversion rate indicates strong demand that can support higher pricing',
      dataPoints: {
        currentConversionRate: chatDemand,
        avgRevenue: profile.metrics.avgRevenuePerUser,
      },
      regionCode,
      regionSpecific: !!regionCode,
      status: 'pending',
      validUntil: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: Timestamp.now(),
    });
  }

  // Check if pricing is too high (low conversion)
  if (chatDemand < 20 && profile.activityStats.totalChatsLast30Days > 50) {
    optimizations.push({
      optimizationId: uuidv4(),
      userId,
      type: 'pricing-decrease',
      priority: 'medium',
      title: 'Reduce Chat Pricing',
      description: 'Low conversion suggests pricing may be too high',
      actionSteps: [
        'Test a 20% price reduction',
        'Track conversion rate changes',
        'Find optimal price point',
      ],
      predictedImpact: {
        revenueIncreasePercentage: 15,
        conversionRateImprovement: 40,
      },
      insight: 'Lower pricing could increase volume and overall revenue',
      dataPoints: {
        currentConversionRate: chatDemand,
        totalChats: profile.activityStats.totalChatsLast30Days,
      },
      regionCode,
      regionSpecific: !!regionCode,
      status: 'pending',
      validUntil: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: Timestamp.now(),
    });
  }

  return optimizations;
}

/**
 * Analyze service expansion opportunities
 */
async function analyzeServiceExpansion(
  userId: string,
  profile: CreatorEarningProfile
): Promise<EarningsOptimization[]> {
  const optimizations: EarningsOptimization[] = [];

  // Suggest voice calls if not offering
  if (
    profile.metrics.callAcceptanceRate === 0 &&
    profile.metrics.chatConversionRate > 40
  ) {
    optimizations.push({
      optimizationId: uuidv4(),
      userId,
      type: 'add-service',
      priority: 'high',
      title: 'Add Voice Calls',
      description: 'Increase ARPPU by +32% with voice calls',
      actionSteps: [
        'Enable voice calls in settings',
        'Set competitive pricing',
        'Promote in your profile',
      ],
      predictedImpact: {
        revenueIncreasePercentage: 32,
      },
      insight:
        'Your strong chat performance indicates followers would purchase voice calls',
      dataPoints: {
        chatConversion: profile.metrics.chatConversionRate,
        avgRevenue: profile.metrics.avgRevenuePerUser,
      },
      regionCode: undefined,
      regionSpecific: false,
      status: 'pending',
      validUntil: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: Timestamp.now(),
    });
  }

  // Suggest events if high engagement
  if (
    profile.metrics.eventFillRatio === 0 &&
    profile.metrics.avgRevenuePerUser > 50
  ) {
    optimizations.push({
      optimizationId: uuidv4(),
      userId,
      type: 'add-service',
      priority: 'medium',
      title: 'Host Paid Events',
      description: 'Your followers support group experiences',
      actionSteps: [
        'Create your first event',
        'Set group pricing',
        'Announce to followers',
      ],
      predictedImpact: {
        revenueIncreasePercentage: 25,
      },
      insight: 'High ARPPU suggests followers would attend paid events',
      dataPoints: {
        avgRevenue: profile.metrics.avgRevenuePerUser,
      },
      regionCode: undefined,
      regionSpecific: false,
      status: 'pending',
      validUntil: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: Timestamp.now(),
    });
  }

  return optimizations;
}

/**
 * Analyze quality improvements
 */
async function analyzeQualityImprovements(
  userId: string,
  profile: CreatorEarningProfile
): Promise<EarningsOptimization[]> {
  const optimizations: EarningsOptimization[] = [];

  // High refund rate
  if (profile.metrics.refundRatio > 15) {
    optimizations.push({
      optimizationId: uuidv4(),
      userId,
      type: 'improve-quality',
      priority: 'critical',
      title: 'Reduce Refund Rate',
      description: 'High refund rate detected - improve preview quality',
      actionSteps: [
        'Update profile preview messages',
        'Set clear expectations',
        'Review recent refund reasons',
      ],
      predictedImpact: {
        revenueIncreasePercentage: 10,
        retentionImprovement: 20,
      },
      insight: 'Refund rate above 15% indicates expectation mismatch',
      dataPoints: {
        refundRate: profile.metrics.refundRatio,
      },
      regionCode: undefined,
      regionSpecific: false,
      status: 'pending',
      validUntil: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: Timestamp.now(),
    });
  }

  // Low satisfaction rate
  if (profile.metrics.chatSatisfactionRate < 70) {
    optimizations.push({
      optimizationId: uuidv4(),
      userId,
      type: 'improve-quality',
      priority: 'high',
      title: 'Improve Response Quality',
      description: 'Satisfaction rate below target - focus on engagement',
      actionSteps: [
        'Respond faster to messages',
        'Use more personalized responses',
        'Complete "Elite Chat Pro" course',
      ],
      predictedImpact: {
        retentionImprovement: 30,
        revenueIncreasePercentage: 15,
      },
      insight: 'Higher satisfaction leads to better retention and revenue',
      dataPoints: {
        satisfactionRate: profile.metrics.chatSatisfactionRate,
      },
      regionCode: undefined,
      regionSpecific: false,
      status: 'pending',
      validUntil: Timestamp.fromMillis(Date.now() + 14 * 24 * 60 * 60 * 1000),
      createdAt: Timestamp.now(),
    });
  }

  return optimizations;
}

/**
 * Analyze schedule optimizations
 */
async function analyzeScheduleOptimizations(
  userId: string,
  profile: CreatorEarningProfile
): Promise<EarningsOptimization[]> {
  const optimizations: EarningsOptimization[] = [];

  // Low online hours but good performance
  if (
    profile.activityStats.avgHoursOnlinePerDay < 4 &&
    profile.metrics.chatConversionRate > 50
  ) {
    optimizations.push({
      optimizationId: uuidv4(),
      userId,
      type: 'schedule-optimization',
      priority: 'medium',
      title: 'Increase Online Hours',
      description: 'Your performance supports more earning time',
      actionSteps: [
        'Add 2 hours to peak times',
        'Focus on high-demand hours',
        'Monitor energy levels',
      ],
      predictedImpact: {
        revenueIncreasePercentage: 40,
      },
      insight: 'Strong performance with limited hours suggests growth potential',
      dataPoints: {
        currentHours: profile.activityStats.avgHoursOnlinePerDay,
        conversionRate: profile.metrics.chatConversionRate,
      },
      regionCode: undefined,
      regionSpecific: false,
      status: 'pending',
      validUntil: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: Timestamp.now(),
    });
  }

  return optimizations;
}

/**
 * Analyze safety improvements
 */
async function analyzeSafetyImprovements(
  userId: string,
  profile: CreatorEarningProfile
): Promise<EarningsOptimization[]> {
  const optimizations: EarningsOptimization[] = [];

  if (profile.riskSignals.safetyReports > 2) {
    optimizations.push({
      optimizationId: uuidv4(),
      userId,
      type: 'safety-improvement',
      priority: 'critical',
      title: 'Address Safety Concerns',
      description: 'Multiple safety reports detected',
      actionSteps: [
        'Review recent safety reports',
        'Update content guidelines',
        'Complete "Safety & Risk Awareness" course',
      ],
      predictedImpact: {
        retentionImprovement: 100, // Prevents account issues
      },
      insight: 'Safety reports can impact account standing',
      dataPoints: {
        safetyReports: profile.riskSignals.safetyReports,
      },
      regionCode: undefined,
      regionSpecific: false,
      status: 'pending',
      validUntil: Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000),
      createdAt: Timestamp.now(),
    });
  }

  return optimizations;
}

/**
 * Generate burnout prevention optimizations
 */
async function generateBurnoutPreventionOpts(
  userId: string,
  profile: CreatorEarningProfile
): Promise<EarningsOptimization[]> {
  return [
    {
      optimizationId: uuidv4(),
      userId,
      type: 'burnout-prevention',
      priority: 'critical',
      title: 'Burnout Risk Detected',
      description: 'Take immediate action to prevent burnout',
      actionSteps: [
        'Reduce daily hours by 20%',
        'Take mandatory rest days',
        'Enable AI companion support',
        'Consider temporary away mode',
      ],
      predictedImpact: {
        burnoutReduction: 50,
        retentionImprovement: 100,
      },
      insight: 'Burnout leads to poor quality and potential account abandonment',
      dataPoints: {
        burnoutScore: profile.burnoutRiskScore,
        hoursPerDay: profile.activityStats.avgHoursOnlinePerDay,
      },
      regionCode: undefined,
      regionSpecific: false,
      status: 'pending',
      validUntil: Timestamp.fromMillis(Date.now() + 1 * 24 * 60 * 60 * 1000),
      createdAt: Timestamp.now(),
    },
  ];
}

/**
 * Mark optimization as viewed
 */
export const pack382_markOptimizationViewed = functions.https.onCall(
  async (data: { optimizationId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { optimizationId } = data;

    try {
      await db
        .collection('earningsOptimizations')
        .doc(optimizationId)
        .update({
          status: 'viewed',
          viewedAt: Timestamp.now(),
        });

      return { success: true };
    } catch (error) {
      console.error('Error marking optimization viewed:', error);
      throw new functions.https.HttpsError('internal', 'Failed to update');
    }
  }
);

/**
 * Mark optimization as applied
 */
export const pack382_markOptimizationApplied = functions.https.onCall(
  async (data: { optimizationId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { optimizationId } = data;

    try {
      await db
        .collection('earningsOptimizations')
        .doc(optimizationId)
        .update({
          status: 'applied',
          appliedAt: Timestamp.now(),
        });

      return { success: true };
    } catch (error) {
      console.error('Error marking optimization applied:', error);
      throw new functions.https.HttpsError('internal', 'Failed to update');
    }
  }
);
