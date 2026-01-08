/**
 * PACK 245: Audience Classification & VIP Segmenting
 * Segment computation engine and Cloud Functions
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Timestamp } from 'firebase-admin/firestore';
import {
  AudienceSegment,
  BudgetTier,
  IntentType,
  ProximityClass,
  PassionSignals,
  RiskLevel,
  BudgetClassificationCache,
  IntentClassificationCache,
  ProximityCache,
  PassionSignalsDocument,
  RiskAssessmentCache,
  CreatorAudienceAnalytics,
  SegmentUpdateEvent,
  SegmentComputationQueue,
  SegmentConfiguration,
  SegmentUpdateTrigger,
  BudgetThresholds,
  IntentThresholds,
  ProximityThresholds,
  PassionThresholds
} from './pack245-audience-segments-types';

// ========================================================================
// Configuration and Constants
// ========================================================================

const DEFAULT_BUDGET_THRESHOLDS: BudgetThresholds = {
  lowToMid: 5000, // 5000 tokens
  midToHigh: 20000, // 20000 tokens
  midFrequency: 2, // 2 purchases per 30 days
  highFrequency: 5 // 5 purchases per 30 days
};

const DEFAULT_INTENT_THRESHOLDS: IntentThresholds = {
  minActivityCount: 3,
  strongIntentRatio: 0.5
};

const DEFAULT_PROXIMITY_THRESHOLDS: ProximityThresholds = {
  localRadiusKm: 50,
  nearbyRadiusKm: 200
};

const DEFAULT_PASSION_THRESHOLDS: PassionThresholds = {
  minSharedInterests: 3,
  minVisualAttractionScore: 60,
  minLoyaltyScore: 70,
  minVisitsForLoyalty: 10
};

// ========================================================================
// Helper Functions
// ========================================================================

/**
 * Calculate distance between two points using Haversine formula
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get active segment configuration or defaults
 */
async function getSegmentConfig(
  configType: string
): Promise<SegmentConfiguration | null> {
  const configSnap = await db
    .collection('segment_configuration')
    .where('configType', '==', configType)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  return configSnap.empty ? null : configSnap.docs[0].data() as SegmentConfiguration;
}

// ========================================================================
// Budget Classification
// ========================================================================

/**
 * Compute budget classification for a user
 */
export async function computeBudgetClassification(
  userId: string
): Promise<BudgetClassificationCache> {
  const config = await getSegmentConfig('budget');
  const thresholds = config?.budgetThresholds || DEFAULT_BUDGET_THRESHOLDS;

  // Query spending data from transactions
  const now = serverTimestamp();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get all transactions for this user
  const transactionsSnap = await db
    .collection('transactions')
    .where('userId', '==', userId)
    .where('status', '==', 'completed')
    .where('createdAt', '>', thirtyDaysAgo)
    .get();

  const spending = {
    chat: { total: 0, count: 0, last: null as Timestamp | null },
    call: { total: 0, count: 0, last: null as Timestamp | null },
    meeting: { total: 0, count: 0, last: null as Timestamp | null },
    event: { total: 0, count: 0, last: null as Timestamp | null },
    gift: { total: 0, count: 0, last: null as Timestamp | null }
  };

  let totalSpending = 0;
  let totalCount = 0;

  transactionsSnap.forEach(doc => {
    const tx = doc.data();
    const amount = tx.amount || 0;
    const type = tx.type || 'chat';
    const timestamp = tx.createdAt;

    totalSpending += amount;
    totalCount += 1;

    if (type in spending) {
      spending[type as keyof typeof spending].total += amount;
      spending[type as keyof typeof spending].count += 1;
      if (!spending[type as keyof typeof spending].last ||
          timestamp > spending[type as keyof typeof spending].last!) {
        spending[type as keyof typeof spending].last = timestamp;
      }
    }
  });

  // Determine budget tier
  let budgetTier: BudgetTier = 'low';
  const purchaseFrequency = totalCount;

  if (totalSpending >= thresholds.midToHigh && purchaseFrequency >= thresholds.highFrequency) {
    budgetTier = 'high';
  } else if (totalSpending >= thresholds.lowToMid && purchaseFrequency >= thresholds.midFrequency) {
    budgetTier = 'mid';
  }

  const cache: BudgetClassificationCache = {
    userId,
    budgetTier,
    chatSpending: {
      totalSpent: spending.chat.total,
      purchaseCount: spending.chat.count,
      avgPurchaseSize: spending.chat.count > 0 ? spending.chat.total / spending.chat.count : 0,
      lastPurchaseAt: spending.chat.last,
      purchaseFrequency: spending.chat.count
    },
    callSpending: {
      totalSpent: spending.call.total,
      purchaseCount: spending.call.count,
      avgPurchaseSize: spending.call.count > 0 ? spending.call.total / spending.call.count : 0,
      lastPurchaseAt: spending.call.last,
      purchaseFrequency: spending.call.count
    },
    meetingSpending: {
      totalSpent: spending.meeting.total,
      purchaseCount: spending.meeting.count,
      avgPurchaseSize: spending.meeting.count > 0 ? spending.meeting.total / spending.meeting.count : 0,
      lastPurchaseAt: spending.meeting.last,
      purchaseFrequency: spending.meeting.count
    },
    eventSpending: {
      totalSpent: spending.event.total,
      purchaseCount: spending.event.count,
      avgPurchaseSize: spending.event.count > 0 ? spending.event.total / spending.event.count : 0,
      lastPurchaseAt: spending.event.last,
      purchaseFrequency: spending.event.count
    },
    giftSpending: {
      totalSpent: spending.gift.total,
      purchaseCount: spending.gift.count,
      avgPurchaseSize: spending.gift.count > 0 ? spending.gift.total / spending.gift.count : 0,
      lastPurchaseAt: spending.gift.last,
      purchaseFrequency: spending.gift.count
    },
    totalSpending,
    lastUpdated: serverTimestamp() as any
  };

  // Save to cache
  await db.collection('budget_classification_cache').doc(userId).set(cache);

  return cache;
}

// ========================================================================
// Intent Classification
// ========================================================================

/**
 * Compute intent classification for a user
 */
export async function computeIntentClassification(
  userId: string
): Promise<IntentClassificationCache> {
  const config = await getSegmentConfig('intent');
  const thresholds = config?.intentThresholds || DEFAULT_INTENT_THRESHOLDS;

  const now = serverTimestamp();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Query activities from various collections
  const activities = {
    chat: { count: 0, tokens: 0, last: null as Timestamp | null },
    call: { count: 0, tokens: 0, last: null as Timestamp | null },
    meeting: { count: 0, tokens: 0, last: null as Timestamp | null },
    event: { count: 0, tokens: 0, last: null as Timestamp | null }
  };

  // Get chat activities
  const chatsSnap = await db
    .collection('chats')
    .where('participantIds', 'array-contains', userId)
    .where('createdAt', '>', thirtyDaysAgo)
    .get();

  chatsSnap.forEach(doc => {
    const chat = doc.data();
    activities.chat.count += 1;
    activities.chat.tokens += chat.totalCost || 0;
    if (!activities.chat.last || chat.createdAt > activities.chat.last) {
      activities.chat.last = chat.createdAt;
    }
  });

  // Get call activities
  const callsSnap = await db
    .collection('calls')
    .where('participantIds', 'array-contains', userId)
    .where('startedAt', '>', thirtyDaysAgo)
    .get();

  callsSnap.forEach(doc => {
    const call = doc.data();
    activities.call.count += 1;
    activities.call.tokens += call.totalCost || 0;
    if (!activities.call.last || call.startedAt > activities.call.last) {
      activities.call.last = call.startedAt;
    }
  });

  // Get meeting activities
  const meetingsSnap = await db
    .collection('calendar_bookings')
    .where('attendeeId', '==', userId)
    .where('status', '==', 'completed')
    .where('bookingDate', '>', thirtyDaysAgo)
    .get();

  meetingsSnap.forEach(doc => {
    const meeting = doc.data();
    activities.meeting.count += 1;
    activities.meeting.tokens += meeting.cost || 0;
    if (!activities.meeting.last || meeting.bookingDate > activities.meeting.last) {
      activities.meeting.last = meeting.bookingDate;
    }
  });

  // Get event activities
  const eventsSnap = await db
    .collection('event_attendees')
    .where('userId', '==', userId)
    .where('status', '==', 'attended')
    .where('attendedAt', '>', thirtyDaysAgo)
    .get();

  eventsSnap.forEach(doc => {
    const event = doc.data();
    activities.event.count += 1;
    activities.event.tokens += event.cost || 0;
    if (!activities.event.last || event.attendedAt > activities.event.last) {
      activities.event.last = event.attendedAt;
    }
  });

  // Calculate frequencies (0-100 scale)
  const totalActivities = activities.chat.count + activities.call.count +
                         activities.meeting.count + activities.event.count;

  const chatFrequency = totalActivities > 0 ? (activities.chat.count / totalActivities) * 100 : 0;
  const callFrequency = totalActivities > 0 ? (activities.call.count / totalActivities) * 100 : 0;
  const meetingFrequency = totalActivities > 0 ? (activities.meeting.count / totalActivities) * 100 : 0;
  const eventFrequency = totalActivities > 0 ? (activities.event.count / totalActivities) * 100 : 0;

  // Determine primary intent
  let primaryIntent: IntentType = 'chat';
  let maxFrequency = chatFrequency;

  if (callFrequency > maxFrequency) {
    primaryIntent = 'call';
    maxFrequency = callFrequency;
  }
  if (meetingFrequency > maxFrequency) {
    primaryIntent = 'meeting';
    maxFrequency = meetingFrequency;
  }
  if (eventFrequency > maxFrequency) {
    primaryIntent = 'event';
  }

  // Determine secondary intent
  const frequencies = [
    { type: 'chat' as IntentType, freq: chatFrequency },
    { type: 'call' as IntentType, freq: callFrequency },
    { type: 'meeting' as IntentType, freq: meetingFrequency },
    { type: 'event' as IntentType, freq: eventFrequency }
  ].filter(f => f.type !== primaryIntent).sort((a, b) => b.freq - a.freq);

  const secondaryIntent = frequencies.length > 0 && frequencies[0].freq >= 20 ?
    frequencies[0].type : null;

  const cache: IntentClassificationCache = {
    userId,
    primaryIntent,
    secondaryIntent,
    chatActivity: {
      count: activities.chat.count,
      tokensSpent: activities.chat.tokens,
      lastActivityAt: activities.chat.last,
      frequency: activities.chat.count
    },
    callActivity: {
      count: activities.call.count,
      tokensSpent: activities.call.tokens,
      lastActivityAt: activities.call.last,
      frequency: activities.call.count
    },
    meetingActivity: {
      count: activities.meeting.count,
      tokensSpent: activities.meeting.tokens,
      lastActivityAt: activities.meeting.last,
      frequency: activities.meeting.count
    },
    eventActivity: {
      count: activities.event.count,
      tokensSpent: activities.event.tokens,
      lastActivityAt: activities.event.last,
      frequency: activities.event.count
    },
    chatFrequency,
    callFrequency,
    meetingFrequency,
    eventFrequency,
    lastUpdated: serverTimestamp() as any
  };

  // Save to cache
  await db.collection('intent_classification_cache').doc(userId).set(cache);

  return cache;
}

// ========================================================================
// Proximity Classification
// ========================================================================

/**
 * Compute proximity between viewer and creator
 */
export async function computeProximity(
  viewerId: string,
  creatorId: string
): Promise<ProximityCache> {
  const config = await getSegmentConfig('proximity');
  const thresholds = config?.proximityThresholds || DEFAULT_PROXIMITY_THRESHOLDS;

  // Get viewer location
  const viewerDoc = await db.collection('users').doc(viewerId).get();
  const viewerData = viewerDoc.data();
  const viewerLoc = viewerData?.location;

  // Get creator location
  const creatorDoc = await db.collection('users').doc(creatorId).get();
  const creatorData = creatorDoc.data();
  const creatorLoc = creatorData?.location;

  if (!viewerLoc || !creatorLoc || !viewerLoc.lat || !creatorLoc.lat) {
    // Default to remote if location data unavailable
    return {
      id: `${viewerId}_${creatorId}`,
      viewerId,
      creatorId,
      proximityClass: 'remote',
      distanceKm: 999999,
      sameCity: false,
      sameRegion: false,
      sameCountry: false,
      viewerLocation: {
        city: null,
        region: null,
        countryCode: viewerLoc?.countryCode || 'XX',
        lat: 0,
        lng: 0,
        lastUpdated: serverTimestamp() as any
      },
      creatorLocation: {
        city: null,
        region: null,
        countryCode: creatorLoc?.countryCode || 'XX',
        lat: 0,
        lng: 0,
        lastUpdated: serverTimestamp() as any
      },
      lastUpdated: serverTimestamp() as any
    };
  }

  // Calculate distance
  const distanceKm = calculateDistance(
    viewerLoc.lat,
    viewerLoc.lng,
    creatorLoc.lat,
    creatorLoc.lng
  );

  // Determine proximity class
  let proximityClass: ProximityClass = 'remote';
  if (distanceKm <= thresholds.localRadiusKm) {
    proximityClass = 'local';
  } else if (distanceKm <= thresholds.nearbyRadiusKm) {
    proximityClass = 'nearby';
  }

  const cache: ProximityCache = {
    id: `${viewerId}_${creatorId}`,
    viewerId,
    creatorId,
    proximityClass,
    distanceKm,
    sameCity: viewerLoc.city === creatorLoc.city,
    sameRegion: viewerLoc.region === creatorLoc.region,
    sameCountry: viewerLoc.countryCode === creatorLoc.countryCode,
    viewerLocation: {
      city: viewerLoc.city || null,
      region: viewerLoc.region || null,
      countryCode: viewerLoc.countryCode,
      lat: viewerLoc.lat,
      lng: viewerLoc.lng,
      lastUpdated: serverTimestamp() as any
    },
    creatorLocation: {
      city: creatorLoc.city || null,
      region: creatorLoc.region || null,
      countryCode: creatorLoc.countryCode,
      lat: creatorLoc.lat,
      lng: creatorLoc.lng,
      lastUpdated: serverTimestamp() as any
    },
    lastUpdated: serverTimestamp() as any
  };

  // Save to cache
  await db.collection('proximity_cache').doc(`${viewerId}_${creatorId}`).set(cache);

  return cache;
}

// ========================================================================
// Passion Signals Computation
// ========================================================================

/**
 * Compute passion signals between viewer and creator
 */
export async function computePassionSignals(
  viewerId: string,
  creatorId: string
): Promise<PassionSignalsDocument> {
  const config = await getSegmentConfig('passion');
  const thresholds = config?.passionThresholds || DEFAULT_PASSION_THRESHOLDS;

  // Get viewer and creator profiles
  const viewerDoc = await db.collection('users').doc(viewerId).get();
  const creatorDoc = await db.collection('users').doc(creatorId).get();

  const viewerData = viewerDoc.data();
  const creatorData = creatorDoc.data();

  const viewerInterests = viewerData?.interests || [];
  const creatorInterests = creatorData?.interests || [];

  // Calculate interest overlap
  const sharedInterestsList = viewerInterests.filter((interest: string) =>
    creatorInterests.includes(interest)
  );
  const sharedCount = sharedInterestsList.length;
  const overlapScore = Math.min(100, (sharedCount / Math.max(1, creatorInterests.length)) * 100);

  // Get engagement metrics
  const engagementSnap = await db
    .collection('attraction_signals')
    .where('userId', '==', viewerId)
    .where('targetUserId', '==', creatorId)
    .limit(1)
    .get();

  let engagement = {
    profileViews: 0,
    mediaViews: 0,
    totalLikes: 0,
    avgSessionDuration: 0,
    lastEngagementAt: null as Timestamp | null
  };

  if (!engagementSnap.empty) {
    const data = engagementSnap.docs[0].data();
    engagement = {
      profileViews: data.profileViews || 0,
      mediaViews: data.mediaViews || 0,
      totalLikes: data.totalLikes || 0,
      avgSessionDuration: data.avgDwellTime || 0,
      lastEngagementAt: data.lastInteractionAt || null
    };
  }

  // Calculate visual attraction score
  const visualAttractionScore = Math.min(100,
    (engagement.profileViews * 2 + engagement.mediaViews + engagement.totalLikes * 5) / 10
  );

  // Get loyalty metrics
  const interactionsSnap = await db
    .collection('user_interactions')
    .where('fromUserId', '==', viewerId)
    .where('toUserId', '==', creatorId)
    .orderBy('timestamp', 'asc')
    .get();

  let loyalty = {
    totalVisits: interactionsSnap.size,
    recentVisits: 0,
    daysSinceFirstContact: 0,
    streakDays: 0,
    avgDaysBetweenVisits: 0
  };

  if (!interactionsSnap.empty) {
    const firstInteraction = interactionsSnap.docs[0].data().timestamp;
    const nowDate = new Date();
    loyalty.daysSinceFirstContact = Math.floor(
      (nowDate.getTime() - firstInteraction.toDate().getTime()) / (1000 * 60 * 60 * 24)
    );

    // Count recent visits (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    loyalty.recentVisits = interactionsSnap.docs.filter(doc =>
      doc.data().timestamp > thirtyDaysAgo
    ).length;

    // Calculate average days between visits
    if (interactionsSnap.size > 1) {
      loyalty.avgDaysBetweenVisits = loyalty.daysSinceFirstContact / (interactionsSnap.size - 1);
    }
  }

  // Calculate loyalty score
  const loyaltyScore = Math.min(100,
    (loyalty.totalVisits * 2 + loyalty.recentVisits * 5) / 2
  );

  // Determine flags
  const sharedInterests = sharedCount >= thresholds.minSharedInterests;
  const visualAttraction = visualAttractionScore >= thresholds.minVisualAttractionScore;
  const loyalFollower = loyaltyScore >= thresholds.minLoyaltyScore &&
                       loyalty.totalVisits >= thresholds.minVisitsForLoyalty;

  const signals: PassionSignalsDocument = {
    id: `${viewerId}_${creatorId}`,
    viewerId,
    creatorId,
    interestOverlap: {
      sharedCount,
      sharedInterests: sharedInterestsList,
      overlapScore
    },
    engagement,
    loyalty,
    sharedInterests,
    visualAttractionScore,
    visualAttraction,
    loyaltyScore,
    loyalFollower,
    lastUpdated: serverTimestamp() as any
  };

  // Save to cache
  await db.collection('passion_signals').doc(`${viewerId}_${creatorId}`).set(signals);

  return signals;
}

// ========================================================================
// Audience Segment Computation (Main)
// ========================================================================

/**
 * Compute complete audience segment for viewer-creator relationship
 */
export async function computeAudienceSegment(
  viewerId: string,
  creatorId: string
): Promise<AudienceSegment> {
  // Get or compute all classifications
  const [budgetCache, intentCache, proximityCache, passionSignals] = await Promise.all([
    computeBudgetClassification(viewerId),
    computeIntentClassification(viewerId),
    computeProximity(viewerId, creatorId),
    computePassionSignals(viewerId, creatorId)
  ]);

  // Build passion signals summary
  const passion: PassionSignals = {
    sharedInterests: passionSignals.sharedInterests,
    visualAttraction: passionSignals.visualAttraction,
    loyalFollower: passionSignals.loyalFollower
  };

  // Risk assessment (simplified for now)
  const risk: RiskLevel = 'normal';

  const segment: AudienceSegment = {
    id: `${viewerId}_${creatorId}`,
    viewerId,
    creatorId,
    budget: budgetCache.budgetTier,
    intent: intentCache.primaryIntent,
    proximity: proximityCache.proximityClass,
    passion,
    risk,
    lastUpdated: serverTimestamp() as any,
    version: 1
  };

  // Save segment
  await db.collection('audience_segments').doc(segment.id).set(segment);

  // Log update event
  await logSegmentUpdate(viewerId, creatorId, 'initial_classification', [], 'computed');

  return segment;
}

/**
 * Log segment update event
 */
async function logSegmentUpdate(
  viewerId: string,
  creatorId: string,
  changeType: string,
  changes: any[],
  trigger: string
): Promise<void> {
  const event: SegmentUpdateEvent = {
    id: `${viewerId}_${creatorId}_${Date.now()}`,
    viewerId,
    creatorId,
    changeType: changeType as any,
    changes,
    reason: `Segment ${changeType}`,
    trigger,
    createdAt: serverTimestamp() as any
  };

  await db.collection('segment_update_events').add(event);
}

// ========================================================================
// Creator Analytics Aggregation
// ========================================================================

/**
 * Compute aggregated analytics for a creator
 */
export async function computeCreatorAudienceAnalytics(
  creatorId: string
): Promise<CreatorAudienceAnalytics> {
  // Get all segments for this creator
  const segmentsSnap = await db
    .collection('audience_segments')
    .where('creatorId', '==', creatorId)
    .get();

  const segments = segmentsSnap.docs.map(doc => doc.data() as AudienceSegment);

  // Count distributions
  const budgetDist = { low: 0, mid: 0, high: 0 };
  const intentDist = { chat: 0, call: 0, meeting: 0, event: 0 };
  const proximityDist = { local: 0, nearby: 0, remote: 0 };
  const passionDist = { sharedInterests: 0, visualAttraction: 0, loyalFollower: 0 };

  const segmentCombinations = new Map<string, {
    budget: BudgetTier;
    intent: IntentType;
    proximity: ProximityClass;
    count: number;
    totalRevenue: number;
  }>();

  for (const segment of segments) {
    // Budget distribution
    budgetDist[segment.budget] += 1;

    // Intent distribution
    intentDist[segment.intent] += 1;

    // Proximity distribution
    proximityDist[segment.proximity] += 1;

    // Passion distribution
    if (segment.passion.sharedInterests) passionDist.sharedInterests += 1;
    if (segment.passion.visualAttraction) passionDist.visualAttraction += 1;
    if (segment.passion.loyalFollower) passionDist.loyalFollower += 1;

    // Track segment combinations
    const key = `${segment.budget}_${segment.intent}_${segment.proximity}`;
    if (!segmentCombinations.has(key)) {
      segmentCombinations.set(key, {
        budget: segment.budget,
        intent: segment.intent,
        proximity: segment.proximity,
        count: 0,
        totalRevenue: 0
      });
    }
    const combo = segmentCombinations.get(key)!;
    combo.count += 1;
  }

  const totalSize = segments.length;

  // Calculate percentages
  const analytics: CreatorAudienceAnalytics = {
    creatorId,
    totalAudienceSize: totalSize,
    payingAudienceSize: totalSize, // All segmented viewers are considered potential payers
    budgetDistribution: {
      lowBudget: totalSize > 0 ? (budgetDist.low / totalSize) * 100 : 0,
      midBudget: totalSize > 0 ? (budgetDist.mid / totalSize) * 100 : 0,
      highBudget: totalSize > 0 ? (budgetDist.high / totalSize) * 100 : 0
    },
    intentDistribution: {
      chatFocused: totalSize > 0 ? (intentDist.chat / totalSize) * 100 : 0,
      callFocused: totalSize > 0 ? (intentDist.call / totalSize) * 100 : 0,
      meetingFocused: totalSize > 0 ? (intentDist.meeting / totalSize) * 100 : 0,
      eventExplorer: totalSize > 0 ? (intentDist.event / totalSize) * 100 : 0
    },
    proximityDistribution: {
      local: totalSize > 0 ? (proximityDist.local / totalSize) * 100 : 0,
      nearby: totalSize > 0 ? (proximityDist.nearby / totalSize) * 100 : 0,
      remote: totalSize > 0 ? (proximityDist.remote / totalSize) * 100 : 0
    },
    passionDistribution: {
      sharedInterests: totalSize > 0 ? (passionDist.sharedInterests / totalSize) * 100 : 0,
      visualAttraction: totalSize > 0 ? (passionDist.visualAttraction / totalSize) * 100 : 0,
      loyalFollower: totalSize > 0 ? (passionDist.loyalFollower / totalSize) * 100 : 0
    },
    topSegments: Array.from(segmentCombinations.values())
      .map(combo => ({
        ...combo,
        percentage: totalSize > 0 ? (combo.count / totalSize) * 100 : 0,
        avgRevenue: combo.count > 0 ? combo.totalRevenue / combo.count : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    mostValuableSegment: Array.from(segmentCombinations.values())
      .map(combo => ({
        ...combo,
        percentage: totalSize > 0 ? (combo.count / totalSize) * 100 : 0,
        avgRevenue: combo.count > 0 ? combo.totalRevenue / combo.count : 0
      }))
      .sort((a, b) => b.avgRevenue - a.avgRevenue)[0] || {
        budget: 'mid' as BudgetTier,
        intent: 'chat' as IntentType,
        proximity: 'remote' as ProximityClass,
        count: 0,
        percentage: 0,
        avgRevenue: 0
      },
    growingSegment: null, // Would need historical data
    calculatedAt: serverTimestamp() as any,
    nextUpdateAt: new Date(Date.now() + 24 * 60 * 60 * 1000) as any // 24 hours
  };

  // Save analytics
  await db.collection('creator_audience_analytics').doc(creatorId).set(analytics);

  return analytics;
}

// ========================================================================
// Cloud Functions
// ========================================================================

/**
 * Scheduled function to update segments (runs daily)
 */
export const scheduledSegmentUpdate = functions.pubsub
  .schedule('0 2 * * *') // 2 AM daily
  .onRun(async (context) => {
    const batchSize = 100;
    let lastDoc: any = null;

    while (true) {
      let query = db.collection('audience_segments')
        .orderBy('lastUpdated', 'asc')
        .limit(batchSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      const updatePromises = snapshot.docs.map(async (doc) => {
        const segment = doc.data() as AudienceSegment;
        try {
          await computeAudienceSegment(segment.viewerId, segment.creatorId);
        } catch (error) {
          console.error(`Failed to update segment ${segment.id}:`, error);
        }
      });

      await Promise.all(updatePromises);
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    console.log('Scheduled segment update completed');
  });

/**
 * HTTP endpoint to trigger segment computation
 */
export const triggerSegmentComputation = functions.https.onCall(
  async (data: SegmentUpdateTrigger, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId, creatorId, source, priority } = data;

    if (creatorId) {
      // Single relationship
      await computeAudienceSegment(userId, creatorId);
    } else {
      // All relationships for user
      const segmentsSnap = await db
        .collection('audience_segments')
        .where('viewerId', '==', userId)
        .get();

      await Promise.all(
        segmentsSnap.docs.map(doc =>
          computeAudienceSegment(userId, doc.data().creatorId)
        )
      );
    }

    return { success: true };
  }
);

/**
 * HTTP endpoint to get creator analytics
 */
export const getCreatorAudienceAnalytics = functions.https.onCall(
  async (data: { creatorId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { creatorId } = data;

    // Check authorization
    if (context.auth.uid !== creatorId) {
      // Check if user is admin
      const userDoc = await db.collection('users').doc(context.auth.uid).get();
      const userData = userDoc.data();
      if (!userData?.roles?.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Not authorized');
      }
    }

    const analytics = await computeCreatorAudienceAnalytics(creatorId);
    return analytics;
  }
);