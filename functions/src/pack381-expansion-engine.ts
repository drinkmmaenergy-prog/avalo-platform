/**
 * PACK 381 — Regional Expansion Engine
 * Regional Expansion Tracking & Readiness Scoring
 * 
 * Tracks rollout stages, growth metrics, and expansion readiness
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export interface RegionExpansionStatus {
  regionId: string;
  countryCode: string;
  countryName: string;
  
  // Rollout Stage
  stage: 'planned' | 'preparation' | 'beta' | 'soft-launch' | 'public' | 'mature';
  launchDate?: string;
  betaStartDate?: string;
  publicLaunchDate?: string;
  
  // Growth Metrics
  growth: {
    totalUsers: number;
    activeUsers: number; // last 30 days
    newUsersToday: number;
    newUsersThisWeek: number;
    newUsersThisMonth: number;
    growthRate: number; // percentage
    organicGrowth: number; // percentage of organic vs paid
  };
  
  // Engagement
  engagement: {
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
    avgSessionDuration: number; // minutes
    avgSessionsPerUser: number;
    retentionDay1: number; // percentage
    retentionDay7: number;
    retentionDay30: number;
  };
  
  // Revenue
  revenue: {
    totalRevenue: number;
    monthlyRevenue: number;
    averageRevenuePerUser: number;
    payingUsers: number;
    conversionRate: number; // percentage
    lifetimeValue: number;
  };
  
  // Acquisition
  acquisition: {
    totalInstalls: number;
    organicInstalls: number;
    paidInstalls: number;
    costPerAcquisition: number;
    costPerInstall: number;
    installToRegistration: number; // percentage
  };
  
  // Churn
  churn: {
    dailyChurnRate: number;
    weeklyChurnRate: number;
    monthlyChurnRate: number;
    topChurnReasons: Array<{ reason: string; count: number }>;
  };
  
  // Creator Economy
  creators: {
    totalCreators: number;
    activeCreators: number;
    monetizedCreators: number;
    totalEarnings: number;
    avgEarningsPerCreator: number;
  };
  
  // Influencer Activity (from PACK 380)
  influencers: {
    totalInfluencers: number;
    activeInfluencers: number;
    totalReach: number;
    totalEngagement: number;
    conversionRate: number;
  };
  
  // Store Performance (from PACK 379)
  store: {
    averageRating: number;
    totalReviews: number;
    positiveReviews: number;
    negativeReviews: number;
    responseRate: number;
  };
  
  // PR Activity (from PACK 380)
  pr: {
    totalCampaigns: number;
    activeCampaigns: number;
    mediaReach: number;
    brandMentions: number;
    sentiment: 'positive' | 'neutral' | 'negative';
  };
  
  // Support & Compliance  
  support: {
    totalTickets: number;
    openTickets: number;
    avgResponseTime: number; // minutes
    avgResolutionTime: number; // hours
    satisfactionScore: number; // 1-5
  };
  
  metadata: {
    lastUpdated: string;
    updatedBy: string;
    notes?: string;
  };
}

export interface ExpansionReadinessScore {
  regionId: string;
  overallScore: number; // 0-100
  stage: 'not-ready' | 'preparation' | 'beta-ready' | 'launch-ready' | 'scaling';
  
  scores: {
    legal: { score: number; weight: number; details: string[] };
    product: { score: number; weight: number; details: string[] };
    support: { score: number; weight: number; details: string[] };
    market: { score: number; weight: number; details: string[] };
    infrastructure: { score: number; weight: number; details: string[] };
  };
  
  blockers: Array<{ category: string; issue: string; severity: 'low' | 'medium' | 'high' | 'critical' }>;
  recommendations: string[];
  
  calculatedAt: string;
}

/**
 * Update regional expansion status
 */
export const pack381_updateExpansionStatus = functions.https.onCall(
  async (data: Partial<RegionExpansionStatus>, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'admin' && userData?.role !== 'super_admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { regionId } = data;
    if (!regionId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'regionId is required'
      );
    }

    const statusRef = db.collection('regionExpansionStatus').doc(regionId);

    const now = new Date().toISOString();
    const statusData = {
      ...data,
      metadata: {
        ...data.metadata,
        lastUpdated: now,
        updatedBy: context.auth.uid,
      },
    };

    await statusRef.set(statusData, { merge: true });

    return {
      success: true,
      regionId,
      message: 'Expansion status updated',
    };
  }
);

/**
 * Automatically calculate and update growth metrics
 */
export const pack381_calculateGrowthMetrics = functions.https.onCall(
  async (data: { regionId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { regionId } = data;

    // Get users in region
    const usersSnapshot = await db
      .collection('users')
      .where('detectedRegion', '==', regionId)
      .get();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    let totalUsers = 0;
    let activeUsers = 0;
    let newUsersToday = 0;
    let newUsersThisWeek = 0;
    let newUsersThisMonth = 0;

    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      totalUsers++;

      const createdAt = new Date(userData.createdAt);
      if (createdAt >= today) newUsersToday++;
      if (createdAt >= weekAgo) newUsersThisWeek++;
      if (createdAt >= monthAgo) newUsersThisMonth++;

      const lastActive = userData.lastActiveAt ? new Date(userData.lastActiveAt) : null;
      if (lastActive && lastActive >= monthAgo) {
        activeUsers++;
      }
    });

    // Calculate growth rate
    const prevMonthUsers = totalUsers - newUsersThisMonth;
    const growthRate = prevMonthUsers > 0
      ? ((newUsersThisMonth / prevMonthUsers) * 100)
      : 0;

    // Update expansion status
    await db.collection('regionExpansionStatus').doc(regionId).set({
      regionId,
      growth: {
        totalUsers,
        activeUsers,
        newUsersToday,
        newUsersThisWeek,
        newUsersThisMonth,
        growthRate: Math.round(growthRate * 100) / 100,
      },
      metadata: {
        lastUpdated: now.toISOString(),
        updatedBy: 'system',
      },
    }, { merge: true });

    return {
      success: true,
      regionId,
      metrics: {
        totalUsers,
        activeUsers,
        newUsersToday,
        newUsersThisWeek,
        newUsersThisMonth,
        growthRate,
      },
    };
  }
);

/**
 * Calculate expansion readiness score
 */
export const pack381_expansionReadinessScore = functions.https.onCall(
  async (data: { regionId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    const { regionId } = data;

    // Get region configuration
    const configDoc = await db.collection('regionConfigs').doc(regionId).get();
    const pricingDoc = await db.collection('regionalPricePolicies').doc(regionId).get();
    const riskDoc = await db.collection('regionalRiskProfiles').doc(regionId).get();
    const rulesDoc = await db.collection('regionalContentRules').doc(regionId).get();

    const blockers: Array<{ category: string; issue: string; severity: 'low' | 'medium' | 'high' | 'critical' }> = [];
    const recommendations: string[] = [];

    // 1. Legal Compliance Score (25% weight)
    let legalScore = 0;
    const legalDetails: string[] = [];

    if (configDoc.exists) {
      const config = configDoc.data();
      legalScore += 30; // Base for having config
      legalDetails.push('✓ Region configuration exists');

      if (config.legal?.gdprApplies !== undefined) {
        legalScore += 20;
        legalDetails.push('✓ GDPR compliance configured');
      }

      if (config.legal?.requiredDisclamers?.length > 0) {
        legalScore += 20;
        legalDetails.push('✓ Legal disclaimers defined');
      }

      if (config.legal?.minAge > 0) {
        legalScore += 30;
        legalDetails.push('✓ Age restrictions configured');
      }
    } else {
      blockers.push({
        category: 'legal',
        issue: 'Region configuration missing',
        severity: 'critical',
      });
      legalDetails.push('✗ Region configuration required');
    }

    // 2. Product Readiness Score (20% weight)
    let productScore = 0;
    const productDetails: string[] = [];

    if (configDoc.exists) {
      const config = configDoc.data();
      const features = config.features || {};
      const enabledFeatures = Object.values(features).filter(Boolean).length;
      const totalFeatures = Object.keys(features).length;

      if (totalFeatures > 0) {
        productScore = (enabledFeatures / totalFeatures) * 100;
        productDetails.push(`✓ ${enabledFeatures}/${totalFeatures} features enabled`);
      }

      if (enabledFeatures < totalFeatures * 0.5) {
        recommendations.push('Enable more product features for better user experience');
      }
    }

    if (pricingDoc.exists) {
      productScore = Math.min(100, productScore + 20);
      productDetails.push('✓ Regional pricing configured');
    } else {
      blockers.push({
        category: 'product',
        issue: 'Regional pricing not configured',
        severity: 'high',
      });
      productDetails.push('✗ Pricing configuration required');
    }

    // 3. Support Readiness Score (15% weight)
    let supportScore = 0;
    const supportDetails: string[] = [];

    const expansionDoc = await db.collection('regionExpansionStatus').doc(regionId).get();
    if (expansionDoc.exists) {
      const expansion = expansionDoc.data() as RegionExpansionStatus;
      
      if (expansion.support) {
        if (expansion.support.avgResponseTime < 60) {
          supportScore += 40;
          supportDetails.push('✓ Fast response times');
        } else {
          supportDetails.push('⚠ Response times need improvement');
          recommendations.push('Improve support response times');
        }

        if (expansion.support.satisfactionScore >= 4) {
          supportScore += 40;
          supportDetails.push('✓ High satisfaction score');
        }

        if (expansion.support.openTickets < 10) {
          supportScore += 20;
          supportDetails.push('✓ Low open ticket count');
        }
      }
    }

    const localizationComplete = configDoc.exists && configDoc.data()?.localization?.languages?.length > 0;
    if (localizationComplete) {
      supportScore = Math.min(100, supportScore + 20);
      supportDetails.push('✓ Localization configured');
    } else {
      blockers.push({
        category: 'support',
        issue: 'Localization not configured',
        severity: 'high',
      });
      supportDetails.push('✗ Language support required');
    }

    // 4. Market Readiness Score (20% weight)
    let marketScore = 0;
    const marketDetails: string[] = [];

    if (expansionDoc.exists) {
      const expansion = expansionDoc.data() as RegionExpansionStatus;

      if (expansion.influencers?.totalInfluencers > 0) {
        marketScore += 30;
        marketDetails.push(`✓ ${expansion.influencers.totalInfluencers} influencers onboarded`);
      } else {
        recommendations.push('Onboard local influencers before launch');
        marketDetails.push('⚠ No influencers yet');
      }

      if (expansion.pr?.activeCampaigns > 0) {
        marketScore += 30;
        marketDetails.push('✓ PR campaigns active');
      } else {
        recommendations.push('Launch PR campaigns');
        marketDetails.push('⚠ No PR activity');
      }

      if (expansion.store?.averageRating >= 4) {
        marketScore += 40;
        marketDetails.push('✓ Good store ratings');
      }
    } else {
      marketDetails.push('⚠ No market data available');
    }

    // 5. Infrastructure Score (20% weight)
    let infrastructureScore = 0;
    const infrastructureDetails: string[] = [];

    if (riskDoc.exists) {
      infrastructureScore += 30;
      infrastructureDetails.push('✓ Risk profile configured');
    } else {
      blockers.push({
        category: 'infrastructure',
        issue: 'Risk profile not configured',
        severity: 'medium',
      });
      infrastructureDetails.push('✗ Risk configuration required');
    }

    if (rulesDoc.exists) {
      infrastructureScore += 30;
      infrastructureDetails.push('✓ Content moderation rules configured');
    } else {
      blockers.push({
        category: 'infrastructure',
        issue: 'Content moderation rules not configured',
        severity: 'high',
      });
      infrastructureDetails.push('✗ Moderation rules required');
    }

    if (pricingDoc.exists && pricingDoc.data()?.payout?.enabled) {
      infrastructureScore += 40;
      infrastructureDetails.push('✓ Payout system enabled');
    } else {
      infrastructureDetails.push('⚠ Payouts not enabled');
    }

    // Calculate weighted overall score
    const weights = {
      legal: 0.25,
      product: 0.20,
      support: 0.15,
      market: 0.20,
      infrastructure: 0.20,
    };

    const overallScore = Math.round(
      legalScore * weights.legal +
      productScore * weights.product +
      supportScore * weights.support +
      marketScore * weights.market +
      infrastructureScore * weights.infrastructure
    );

    // Determine stage
    let stage: ExpansionReadinessScore['stage'];
    if (overallScore < 40) {
      stage = 'not-ready';
    } else if (overallScore < 60) {
      stage = 'preparation';
    } else if (overallScore < 75) {
      stage = 'beta-ready';
    } else if (overallScore < 90) {
      stage = 'launch-ready';
    } else {
      stage = 'scaling';
    }

    const readinessScore: ExpansionReadinessScore = {
      regionId,
      overallScore,
      stage,
      scores: {
        legal: { score: legalScore, weight: weights.legal, details: legalDetails },
        product: { score: productScore, weight: weights.product, details: productDetails },
        support: { score: supportScore, weight: weights.support, details: supportDetails },
        market: { score: marketScore, weight: weights.market, details: marketDetails },
        infrastructure: { score: infrastructureScore, weight: weights.infrastructure, details: infrastructureDetails },
      },
      blockers,
      recommendations,
      calculatedAt: new Date().toISOString(),
    };

    // Store the readiness score
    await db.collection('expansionReadinessScores').doc(regionId).set(readinessScore);

    return readinessScore;
  }
);

/**
 * Get expansion overview for all regions
 */
export const pack381_getExpansionOverview = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    
    if (userData?.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    // Get all regions
    const regionsSnapshot = await db.collection('regionConfigs').get();
    const regions: any[] = [];

    for (const regionDoc of regionsSnapshot.docs) {
      const regionConfig = regionDoc.data();
      const regionId = regionDoc.id;

      // Get expansion status
      const statusDoc = await db.collection('regionExpansionStatus').doc(regionId).get();
      const expansionStatus = statusDoc.exists ? statusDoc.data() : null;

      // Get readiness score
      const readinessDoc = await db.collection('expansionReadinessScores').doc(regionId).get();
      const readinessScore = readinessDoc.exists ? readinessDoc.data() : null;

      regions.push({
        regionId,
        countryCode: regionConfig.countryCode,
        countryName: regionConfig.countryName,
        enabled: regionConfig.enabled,
        stage: regionConfig.market?.stage || 'planned',
        totalUsers: expansionStatus?.growth?.totalUsers || 0,
        activeUsers: expansionStatus?.growth?.activeUsers || 0,
        growthRate: expansionStatus?.growth?.growthRate || 0,
        revenue: expansionStatus?.revenue?.monthlyRevenue || 0,
        readinessScore: readinessScore?.overallScore || 0,
        readinessStage: readinessScore?.stage || 'not-ready',
        blockers: readinessScore?.blockers?.length || 0,
      });
    }

    // Sort by readiness score (descending)
    regions.sort((a, b) => b.readinessScore - a.readinessScore);

    return { regions };
  }
);

/**
 * Language availability matrix
 */
export const pack381_languageAvailabilityMatrix = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    // Get all regions
    const regionsSnapshot = await db.collection('regionConfigs').get();
    const matrix: any = {};

    regionsSnapshot.docs.forEach(doc => {
      const regionData = doc.data();
      const regionId = doc.id;
      
      if (regionData.localization?.languages) {
        matrix[regionId] = {
          countryName: regionData.countryName,
          primaryLanguage: regionData.localization.primaryLanguage,
          supportedLanguages: regionData.localization.languages,
          features: regionData.features || {},
        };
      }
    });

    return { matrix };
  }
);
