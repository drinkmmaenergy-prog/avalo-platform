/**
 * PACK 423 — In-App Ratings, Sentiment & NPS Engine
 * NPS Service
 */

import * as admin from 'firebase-admin';
import {
  NpsSurveyResponse,
  CreateNpsInput,
  NpsAnalytics,
  NpsCooldown,
  UserSegment,
  ProductArea,
} from '../../shared/types/pack423-ratings.types';

const db = admin.firestore();

const NPS_COOLDOWN_DAYS = 90;

/**
 * Check if user is eligible for NPS survey (90-day cooldown)
 */
export async function checkNpsEligibility(userId: string): Promise<{
  eligible: boolean;
  reason?: string;
  nextEligibleAt?: number;
}> {
  const cooldownRef = db.collection('npsCooldowns').doc(userId);
  const cooldownSnap = await cooldownRef.get();

  if (cooldownSnap.exists) {
    const cooldown = cooldownSnap.data() as NpsCooldown;
    const now = Date.now();
    
    if (now < cooldown.nextEligibleAt) {
      return {
        eligible: false,
        reason: 'User is in cooldown period',
        nextEligibleAt: cooldown.nextEligibleAt,
      };
    }
  }

  return { eligible: true };
}

/**
 * Determine user segment based on activity
 */
async function determineUserSegment(userId: string): Promise<UserSegment> {
  try {
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return 'NEW';
    }

    const userData = userSnap.data();
    const createdAt = userData?.createdAt || 0;
    const lastActiveAt = userData?.lastActiveAt || 0;
    const now = Date.now();

    const daysSinceCreation = (now - createdAt) / (1000 * 60 * 60 * 24);
    const daysSinceActive = (now - lastActiveAt) / (1000 * 60 * 60 * 24);

    // NEW: Less than 7 days since creation
    if (daysSinceCreation < 7) {
      return 'NEW';
    }

    // DORMANT: No activity in 30+ days
    if (daysSinceActive > 30) {
      return 'DORMANT';
    }

    // CHURN_RISK: No activity in 14-30 days
    if (daysSinceActive > 14) {
      return 'CHURN_RISK';
    }

    // RETURNING: Previously dormant but active again
    if (userData?.wasDormant && daysSinceActive < 7) {
      return 'RETURNING';
    }

    // ACTIVE: Regular activity
    return 'ACTIVE';
  } catch (error) {
    console.error('Error determining user segment:', error);
    return 'ACTIVE';
  }
}

/**
 * Create NPS survey response
 */
export async function createNpsResponse(
  payload: CreateNpsInput
): Promise<void> {
  // Validate score (0-10)
  if (payload.score < 0 || payload.score > 10) {
    throw new Error('Invalid NPS score. Must be 0-10');
  }

  // Check eligibility (90-day cooldown)
  const eligibility = await checkNpsEligibility(payload.userId);
  if (!eligibility.eligible) {
    throw new Error(`Not eligible for NPS survey: ${eligibility.reason}`);
  }

  // Determine user segment
  const segment = await determineUserSegment(payload.userId);

  const now = Date.now();
  const responseId = `${payload.userId}-${now}`;

  const response: NpsSurveyResponse = {
    id: responseId,
    createdAt: now,
    userId: payload.userId,
    channel: payload.channel,
    locale: payload.locale,
    score: payload.score,
    comment: payload.comment,
    tagProductArea: payload.tagProductArea,
    segmentAtTime: segment,
    platform: payload.platform,
  };

  // Save response
  await db.collection('npsSurveys').doc(responseId).set(response);

  // Update cooldown
  const nextEligibleAt = now + (NPS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const cooldown: NpsCooldown = {
    userId: payload.userId,
    lastResponseAt: now,
    nextEligibleAt,
  };

  await db.collection('npsCooldowns').doc(payload.userId).set(cooldown);
}

/**
 * Calculate NPS score from responses
 */
function calculateNpsScore(responses: NpsSurveyResponse[]): {
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number;
} {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  responses.forEach(response => {
    if (response.score >= 9) {
      promoters++;
    } else if (response.score >= 7) {
      passives++;
    } else {
      detractors++;
    }
  });

  const total = responses.length;
  const npsScore = total > 0 
    ? ((promoters - detractors) / total) * 100 
    : 0;

  return { promoters, passives, detractors, npsScore };
}

/**
 * Get NPS analytics (aggregated)
 */
export async function getNpsAnalytics(
  startTime: number,
  endTime: number
): Promise<NpsAnalytics> {
  // Get all responses in time range
  const responsesSnap = await db
    .collection('npsSurveys')
    .where('createdAt', '>=', startTime)
    .where('createdAt', '<=', endTime)
    .get();

  const responses = responsesSnap.docs.map(doc => doc.data() as NpsSurveyResponse);

  // Overall NPS
  const overall = calculateNpsScore(responses);

  // By product area
  const byProductArea: { [key: string]: NpsSurveyResponse[] } = {};
  responses.forEach(response => {
    const area = response.tagProductArea || 'GENERAL';
    if (!byProductArea[area]) {
      byProductArea[area] = [];
    }
    byProductArea[area].push(response);
  });

  // By segment
  const bySegment: { [key: string]: NpsSurveyResponse[] } = {};
  responses.forEach(response => {
    const segment = response.segmentAtTime;
    if (!bySegment[segment]) {
      bySegment[segment] = [];
    }
    bySegment[segment].push(response);
  });

  // Score distribution
  const distribution: { [score: number]: number } = {};
  for (let i = 0; i <= 10; i++) {
    distribution[i] = 0;
  }
  responses.forEach(response => {
    distribution[response.score]++;
  });

  const analytics: NpsAnalytics = {
    timeRange: { start: startTime, end: endTime },
    totalResponses: responses.length,
    promoters: overall.promoters,
    passives: overall.passives,
    detractors: overall.detractors,
    npsScore: overall.npsScore,
    byProductArea: Object.entries(byProductArea).reduce((acc, [area, areaResponses]) => {
      const areaMetrics = calculateNpsScore(areaResponses);
      const avgScore = areaResponses.reduce((sum, r) => sum + r.score, 0) / areaResponses.length;
      acc[area as ProductArea] = {
        totalResponses: areaResponses.length,
        avgScore,
        npsScore: areaMetrics.npsScore,
      };
      return acc;
    }, {} as any),
    bySegment: Object.entries(bySegment).reduce((acc, [segment, segmentResponses]) => {
      const segmentMetrics = calculateNpsScore(segmentResponses);
      const avgScore = segmentResponses.reduce((sum, r) => sum + r.score, 0) / segmentResponses.length;
      acc[segment as UserSegment] = {
        totalResponses: segmentResponses.length,
        avgScore,
        npsScore: segmentMetrics.npsScore,
      };
      return acc;
    }, {} as any),
    distribution,
  };

  return analytics;
}

/**
 * Get user's NPS history
 */
export async function getUserNpsHistory(userId: string): Promise<NpsSurveyResponse[]> {
  const responsesSnap = await db
    .collection('npsSurveys')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  return responsesSnap.docs.map(doc => doc.data() as NpsSurveyResponse);
}

/**
 * Check if user should be suppressed from engagement (recent detractor)
 */
export async function isRecentDetractor(userId: string): Promise<boolean> {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  const recentResponseSnap = await db
    .collection('npsSurveys')
    .where('userId', '==', userId)
    .where('createdAt', '>=', thirtyDaysAgo)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (recentResponseSnap.empty) {
    return false;
  }

  const response = recentResponseSnap.docs[0].data() as NpsSurveyResponse;
  return response.score <= 6; // Detractor
}
