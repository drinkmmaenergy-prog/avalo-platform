/**
 * PACK 382 — Dynamic Pricing Recommender
 * AI-powered pricing optimization based on market, demand, and creator performance
 */

import * as functions from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  PricingRecommendation,
  RecommendOptimalPricingInput,
  RecommendOptimalPricingOutput,
  CreatorEarningProfile,
} from './types/pack382-types';
import { v4 as uuidv4 } from 'uuid';

const db = getFirestore();

/**
 * Recommend optimal pricing for a service
 */
export const pack382_recommendOptimalPricing = functions.https.onCall(
  async (
    data: RecommendOptimalPricingInput,
    context
  ): Promise<RecommendOptimalPricingOutput> => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { userId = context.auth.uid, serviceType, regionCode } = data;

    // Only allow users to get their own recommendations (or admins)
    const isAdmin = context.auth.token?.role === 'admin';
    if (userId !== context.auth.uid && !isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Can only get own pricing recommendations'
      );
    }

    try {
      // Get creator profile
      const profileDoc = await db
        .collection('creatorEarningProfiles')
        .doc(userId)
        .get();

      const profile = profileDoc.exists
        ? (profileDoc.data() as CreatorEarningProfile)
        : null;

      // Get current pricing
      const currentPrice = await getCurrentPrice(userId, serviceType);

      // Get market data
      const marketData = await getMarketData(serviceType, regionCode);

      // Calculate recommended price
      const recommended = calculateOptimalPrice({
        serviceType,
        currentPrice,
        profile,
        marketData,
        regionCode,
      });

      // Build recommendation
      const recommendation: PricingRecommendation = {
        recommendationId: uuidv4(),
        userId,
        serviceType,
        currentPrice,
        recommendedPrice: recommended.price,
        priceChange: recommended.price - currentPrice,
        priceChangePercentage: ((recommended.price - currentPrice) / currentPrice) * 100,
        reasoning: recommended.reasoning,
        factors: recommended.factors,
        marketData,
        confidenceScore: recommended.confidence,
        forecast: recommended.forecast,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      // Save recommendation
      await db
        .collection('pricingRecommendations')
        .doc(recommendation.recommendationId)
        .set(recommendation);

      const confidence = 
        recommended.confidence > 80
          ? 'high'
          : recommended.confidence > 50
          ? 'medium'
          : 'low';

      return { recommendation, confidence };
    } catch (error) {
      console.error('Error generating pricing recommendation:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to generate recommendation'
      );
    }
  }
);

/**
 * Get current price for a service
 */
async function getCurrentPrice(
  userId: string,
  serviceType: string
): Promise<number> {
  const pricingDoc = await db
    .collection('creatorPricing')
    .doc(userId)
    .get();

  if (!pricingDoc.exists) {
    // Return default pricing
    const defaults = {
      chat: 50,
      voice: 100,
      video: 150,
      calendar: 75,
      event: 200,
      subscription: 299,
    };
    return defaults[serviceType] || 50;
  }

  const pricing = pricingDoc.data();
  return pricing?.[`${serviceType}Price`] || 50;
}

/**
 * Get market data for pricing
 */
async function getMarketData(serviceType: string, regionCode?: string) {
  const region = regionCode || 'global';

  // Query recent pricing from similar creators
  const recentPricing = await db
    .collection('creatorPricing')
    .where('isActive', '==', true)
    .get();

  const prices: number[] = [];

  recentPricing.forEach((doc) => {
    const data = doc.data();
    const price = data[`${serviceType}Price`];

    // Filter by region if specified
    if (regionCode && data.regionCode !== regionCode) {
      return;
    }

    if (price && price > 0) {
      prices.push(price);
    }
  });

  // Calculate statistics
  prices.sort((a, b) => a - b);
  const min = prices[0] || 10;
  const max = prices[prices.length - 1] || 500;
  const median = prices[Math.floor(prices.length / 2)] || 50;
  const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 50;

  // Estimate demand level based on market activity
  const demandLevel = estimateDemandLevel(serviceType, region);

  return {
    regionCode: region,
    regionalAvgPrice: avg,
    competitorPriceRange: { min, max, median },
    demandLevel,
  };
}

function estimateDemandLevel(serviceType: string, region: string): 'low' | 'medium' | 'high' | 'very-high' {
  // In production, this would analyze real-time market data
  // For now, return reasonable estimates
  
  const demandMap = {
    chat: 'high' as const,
    voice: 'medium' as const,
    video: 'medium' as const,
    calendar: 'low' as const,
    event: 'medium' as const,
    subscription: 'high' as const,
  };

  return demandMap[serviceType] || 'medium';
}

/**
 * Calculate optimal price
 */
function calculateOptimalPrice(params: {
  serviceType: string;
  currentPrice: number;
  profile: CreatorEarningProfile | null;
  marketData: any;
  regionCode?: string;
}): {
  price: number;
  reasoning: string;
  factors: Array<{
    factor: string;
    weight: number;
    impact: 'increase' | 'decrease' | 'neutral';
  }>;
  confidence: number;
  forecast: {
    expectedRevenueChange: number;
    expectedDemandChange: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
} {
  const { serviceType, currentPrice, profile, marketData } = params;

  const factors: Array<{
    factor: string;
    weight: number;
    impact: 'increase' | 'decrease' | 'neutral';
  }> = [];

  let priceMultiplier = 1.0;
  let confidence = 50;

  // Factor 1: Market positioning
  const marketAvg = marketData.regionalAvgPrice;
  const marketMedian = marketData.competitorPriceRange.median;

  if (currentPrice < marketMedian * 0.7) {
    // Significantly underpriced
    priceMultiplier *= 1.25;
    factors.push({
      factor: 'Below market average - room to increase',
      weight: 0.3,
      impact: 'increase',
    });
    confidence += 15;
  } else if (currentPrice > marketMedian * 1.3) {
    // Significantly overpriced
    priceMultiplier *= 0.9;
    factors.push({
      factor: 'Above market average - consider reduction',
      weight: 0.2,
      impact: 'decrease',
    });
    confidence += 10;
  }

  // Factor 2: Creator performance
  if (profile) {
    // High conversion rate = can charge more
    if (profile.metrics.chatConversionRate > 60) {
      priceMultiplier *= 1.1;
      factors.push({
        factor: 'High conversion rate supports premium pricing',
        weight: 0.25,
        impact: 'increase',
      });
      confidence += 20;
    } else if (profile.metrics.chatConversionRate < 20) {
      priceMultiplier *= 0.95;
      factors.push({
        factor: 'Low conversion suggests lower pricing',
        weight: 0.15,
        impact: 'decrease',
      });
      confidence += 15;
    }

    // High satisfaction = can charge more
    if (profile.metrics.chatSatisfactionRate > 80) {
      priceMultiplier *= 1.05;
      factors.push({
        factor: 'Excellent satisfaction ratings',
        weight: 0.15,
        impact: 'increase',
      });
      confidence += 15;
    }

    // Skill tier impact
    const tierMultipliers = {
      ELITE: 1.2,
      PRO: 1.1,
      ADVANCED: 1.0,
      BEGINNER: 0.9,
    };
    priceMultiplier *= tierMultipliers[profile.skillTier] || 1.0;
    factors.push({
      factor: `${profile.skillTier} tier pricing adjustment`,
      weight: 0.2,
      impact: profile.skillTier === 'BEGINNER' ? 'decrease' : 'increase',
    });
    confidence += 15;
  } else {
    // No profile data - be conservative
    factors.push({
      factor: 'Limited performance data - conservative pricing',
      weight: 0.5,
      impact: 'neutral',
    });
  }

  // Factor 3: Market demand
  const demandMultipliers = {
    'very-high': 1.15,
    'high': 1.05,
    'medium': 1.0,
    'low': 0.95,
  };
  priceMultiplier *= demandMultipliers[marketData.demandLevel];
  factors.push({
    factor: `Market demand is ${marketData.demandLevel}`,
    weight: 0.1,
    impact: marketData.demandLevel === 'low' ? 'decrease' : marketData.demandLevel === 'very-high' ? 'increase' : 'neutral',
  });

  // Calculate final price
  let recommendedPrice = Math.round(currentPrice * priceMultiplier);

  // Ensure reasonable bounds
  const bounds = {
    chat: { min: 20, max: 500 },
    voice: { min: 50, max: 1000 },
    video: { min: 100, max: 2000 },
    calendar: { min: 30, max: 500 },
    event: { min: 50, max: 5000 },
    subscription: { min: 99, max: 1999 },
  };

  const serviceBounds = bounds[serviceType] || { min: 20, max: 500 };
  recommendedPrice = Math.max(serviceBounds.min, Math.min(serviceBounds.max, recommendedPrice));

  // Round to nice numbers
  recommendedPrice = Math.round(recommendedPrice / 5) * 5;

  // Build reasoning
  const direction = recommendedPrice > currentPrice ? 'increase' : recommendedPrice < currentPrice ? 'decrease' : 'maintain';
  const percentage = Math.abs(((recommendedPrice - currentPrice) / currentPrice) * 100).toFixed(0);

  let reasoning = '';
  if (direction === 'increase') {
    reasoning = `Recommend ${percentage}% price increase to ${recommendedPrice} tokens. `;
  } else if (direction === 'decrease') {
    reasoning = `Recommend ${percentage}% price decrease to ${recommendedPrice} tokens. `;
  } else {
    reasoning = `Current pricing of ${currentPrice} tokens is optimal. `;
  }

  reasoning += `Based on market position, ${profile ? 'performance metrics' : 'market standards'}, and ${marketData.demandLevel} demand.`;

  // Forecast impact
  const priceChangePercent = ((recommendedPrice - currentPrice) / currentPrice) * 100;

  let expectedRevenueChange = priceChangePercent * 0.7; // Assumes 30% demand elasticity
  let expectedDemandChange = -priceChangePercent * 0.3;

  if (profile && profile.metrics.chatConversionRate > 60) {
    // Less elastic demand for high performers
    expectedRevenueChange = priceChangePercent * 0.85;
    expectedDemandChange = -priceChangePercent * 0.15;
  }

  const riskLevel: 'low' | 'medium' | 'high' =
    Math.abs(priceChangePercent) < 10
      ? 'low'
      : Math.abs(priceChangePercent) < 25
      ? 'medium'
      : 'high';

  return {
    price: recommendedPrice,
    reasoning,
    factors,
    confidence: Math.min(confidence, 100),
    forecast: {
      expectedRevenueChange,
      expectedDemandChange,
      riskLevel,
    },
  };
}

/**
 * Apply pricing recommendation
 */
export const pack382_applyPricingRecommendation = functions.https.onCall(
  async (data: { recommendationId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { recommendationId } = data;
    const userId = context.auth.uid;

    try {
      // Get recommendation
      const recDoc = await db
        .collection('pricingRecommendations')
        .doc(recommendationId)
        .get();

      if (!recDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Recommendation not found'
        );
      }

      const rec = recDoc.data() as PricingRecommendation;

      // Verify ownership
      if (rec.userId !== userId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Not your recommendation'
        );
      }

      // Apply the pricing
      const priceField = `${rec.serviceType}Price`;
      await db
        .collection('creatorPricing')
        .doc(userId)
        .set(
          {
            [priceField]: rec.recommendedPrice,
            [`${priceField}UpdatedAt`]: Timestamp.now(),
            isActive: true,
          },
          { merge: true }
        );

      return {
        success: true,
        newPrice: rec.recommendedPrice,
        serviceType: rec.serviceType,
      };
    } catch (error) {
      console.error('Error applying pricing recommendation:', error);
      throw new functions.https.HttpsError('internal', 'Failed to apply pricing');
    }
  }
);

/**
 * Scheduled job: Generate pricing recommendations for all active creators
 */
export const pack382_weeklyPricingReview = functions.pubsub
  .schedule('0 3 * * 1') // Monday 3 AM
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[PACK382] Starting weekly pricing review...');

    // Get active creators
    const activeCreators = await db
      .collection('creatorEarningProfiles')
      .where('updatedAt', '>', Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .get();

    const serviceTypes = ['chat', 'voice', 'video', 'calendar', 'event', 'subscription'];
    let recommendationsGenerated = 0;

    for (const creatorDoc of activeCreators.docs) {
      const profile = creatorDoc.data() as CreatorEarningProfile;
      const userId = profile.userId;

      // Generate recommendations for each service type
      for (const serviceType of serviceTypes) {
        try {
          const currentPrice = await getCurrentPrice(userId, serviceType as any);

          // Only generate if service is active
          if (currentPrice > 0) {
            const marketData = await getMarketData(serviceType, profile.regionalPerformance ? Object.keys(profile.regionalPerformance)[0] : undefined);
            const recommended = calculateOptimalPrice({
              serviceType,
              currentPrice,
              profile,
              marketData,
            });

            // Only save if meaningful change (>10%)
            if (Math.abs((recommended.price - currentPrice) / currentPrice) > 0.1) {
              const recommendation: PricingRecommendation = {
                recommendationId: uuidv4(),
                userId,
                serviceType: serviceType as any,
                currentPrice,
                recommendedPrice: recommended.price,
                priceChange: recommended.price - currentPrice,
                priceChangePercentage: ((recommended.price - currentPrice) / currentPrice) * 100,
                reasoning: recommended.reasoning,
                factors: recommended.factors,
                marketData,
                confidenceScore: recommended.confidence,
                forecast: recommended.forecast,
                createdAt: Timestamp.now(),
                expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
              };

              await db
                .collection('pricingRecommendations')
                .doc(recommendation.recommendationId)
                .set(recommendation);

              recommendationsGenerated++;
            }
          }
        } catch (error) {
          console.error(`Error generating recommendation for ${userId}:`, error);
        }
      }
    }

    console.log(`[PACK382] Generated ${recommendationsGenerated} pricing recommendations`);
    return null;
  });
