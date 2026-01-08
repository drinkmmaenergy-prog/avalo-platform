/**
 * PACK 266: Smart Supporter CRM Engine
 * 
 * Core business logic for the Supporter CRM system that helps creators
 * understand their paying audience, retain supporters, and prioritize engagement.
 * 
 * KEY FEATURES:
 * - Automatic supporter segmentation based on behavior
 * - Conversion probability calculation
 * - CRM inbox prioritization
 * - Supporter profile analytics
 * - Smart automation and alerts
 * 
 * SAFETY GUARDRAILS:
 * - NO free messages or tokens
 * - NO changes to tokenomics
 * - NO identity revelation
 * - NO bulk messaging
 * - Privacy-first design
 */

import { Firestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  SupporterSegment,
  ConversionPotential,
  SupporterSegmentData,
  BehavioralSignals,
  CRMInboxEntry,
  SupporterProfile,
  SmartAlert,
  AlertType,
  CRMActionType,
  SAFETY_RULES
} from './pack266-supporter-crm-types.js';

// ============================================================================
// Constants & Configuration
// ============================================================================

const VIP_THRESHOLD_TOKENS = 1000;
const HOT_LEAD_PROBABILITY_THRESHOLD = 70;
const ACTIVE_PROBABILITY_THRESHOLD = 40;
const DORMANT_DAYS_THRESHOLD = 7;
const COLD_DAYS_THRESHOLD = 30;
const NEW_SUPPORTER_DAYS = 30;

// Signal weights for conversion probability (total = 100%)
const SIGNAL_WEIGHTS = {
  recentChatActivity: 30,
  previousGifting: 30,
  profileViews: 15,
  liveEngagement: 15,
  recentMatch: 7,
  likesWithoutChat: 3
};

// VIP top supporter count
const VIP_TOP_COUNT = 10;

// ============================================================================
// Supporter Segmentation Logic
// ============================================================================

/**
 * Calculate behavioral signals for a supporter
 */
export async function calculateBehavioralSignals(
  db: Firestore,
  creatorId: string,
  supporterId: string
): Promise<BehavioralSignals> {
  const now = Timestamp.now();
  const sevenDaysAgo = Timestamp.fromMillis(now.toMillis() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = Timestamp.fromMillis(now.toMillis() - 30 * 24 * 60 * 60 * 1000);

  // Fetch chat activity
  const chatsQuery = await db
    .collection('chats')
    .where('participants', 'array-contains', supporterId)
    .where('roles.earnerId', '==', creatorId)
    .get();

  let recentChatActivity = 0;
  let totalChatsInitiated = 0;
  let totalResponseTimes: number[] = [];
  let lastChatAt: Timestamp | undefined;

  chatsQuery.forEach(doc => {
    const chat = doc.data();
    if (chat.createdAt && chat.createdAt.seconds > sevenDaysAgo.seconds) {
      // Count messages from supporter in last 7 days
      recentChatActivity += chat.messageCount || 0;
    }
    if (chat.initiatorId === supporterId) {
      totalChatsInitiated++;
    }
    if (!lastChatAt || (chat.lastActivityAt && chat.lastActivityAt.seconds > lastChatAt.seconds)) {
      lastChatAt = chat.lastActivityAt;
    }
  });

  // Fetch gifting behavior
  const giftsQuery = await db
    .collection('gifts')
    .where('senderId', '==', supporterId)
    .where('recipientId', '==', creatorId)
    .get();

  let totalGiftsSent = 0;
  let giftsLast7Days = 0;
  let giftsLast30Days = 0;
  let totalGiftValue = 0;
  let giftsInLive = 0;
  let lastGiftAt: Timestamp | undefined;

  giftsQuery.forEach(doc => {
    const gift = doc.data();
    totalGiftsSent++;
    totalGiftValue += gift.tokenValue || 0;
    
    if (gift.createdAt && gift.createdAt.seconds > sevenDaysAgo.seconds) {
      giftsLast7Days++;
    }
    if (gift.createdAt && gift.createdAt.seconds > thirtyDaysAgo.seconds) {
      giftsLast30Days++;
    }
    if (gift.context === 'live') {
      giftsInLive++;
    }
    if (!lastGiftAt || (gift.createdAt && gift.createdAt.seconds > lastGiftAt.seconds)) {
      lastGiftAt = gift.createdAt;
    }
  });

  const avgGiftValue = totalGiftsSent > 0 ? totalGiftValue / totalGiftsSent : 0;

  // Fetch profile views
  const profileViewsQuery = await db
    .collection('profileViews')
    .where('viewerId', '==', supporterId)
    .where('profileOwnerId', '==', creatorId)
    .get();

  let profileViewsLast7Days = 0;
  let profileViewsLast30Days = 0;

  profileViewsQuery.forEach(doc => {
    const view = doc.data();
    if (view.viewedAt && view.viewedAt.seconds > sevenDaysAgo.seconds) {
      profileViewsLast7Days++;
    }
    if (view.viewedAt && view.viewedAt.seconds > thirtyDaysAgo.seconds) {
      profileViewsLast30Days++;
    }
  });

  // Fetch live stream engagement
  const liveAttendanceQuery = await db
    .collection('liveStreamAttendance')
    .where('userId', '==', supporterId)
    .where('creatorId', '==', creatorId)
    .get();

  let liveStreamsAttended = 0;
  let liveStreamsAttendedLast7Days = 0;
  let totalLiveWatchTime = 0;
  let lastLiveAt: Timestamp | undefined;

  liveAttendanceQuery.forEach(doc => {
    const attendance = doc.data();
    liveStreamsAttended++;
    totalLiveWatchTime += attendance.watchTime || 0;
    
    if (attendance.joinedAt && attendance.joinedAt.seconds > sevenDaysAgo.seconds) {
      liveStreamsAttendedLast7Days++;
    }
    if (!lastLiveAt || (attendance.joinedAt && attendance.joinedAt.seconds > lastLiveAt.seconds)) {
      lastLiveAt = attendance.joinedAt;
    }
  });

  const avgLiveWatchTime = liveStreamsAttended > 0 ? totalLiveWatchTime / liveStreamsAttended : 0;

  // Fetch PPV purchases
  const ppvQuery = await db
    .collection('ppvPurchases')
    .where('buyerId', '==', supporterId)
    .where('creatorId', '==', creatorId)
    .get();

  let ppvPurchases = 0;
  let ppvLast30Days = 0;
  let lastPurchaseAt: Timestamp | undefined;

  ppvQuery.forEach(doc => {
    const purchase = doc.data();
    ppvPurchases++;
    
    if (purchase.purchasedAt && purchase.purchasedAt.seconds > thirtyDaysAgo.seconds) {
      ppvLast30Days++;
    }
    if (!lastPurchaseAt || (purchase.purchasedAt && purchase.purchasedAt.seconds > lastPurchaseAt.seconds)) {
      lastPurchaseAt = purchase.purchasedAt;
    }
  });

  // Fetch fan club membership
  const fanClubDoc = await db
    .doc(`fanClubMemberships/${creatorId}_${supporterId}`)
    .get();

  let isFanClubMember = false;
  let fanClubTier: 'silver' | 'gold' | 'diamond' | 'royal_elite' | undefined;
  let fanClubJoinedAt: Timestamp | undefined;

  if (fanClubDoc.exists) {
    const membership = fanClubDoc.data();
    if (membership && membership.status === 'active') {
      isFanClubMember = true;
      fanClubTier = membership.tier;
      fanClubJoinedAt = membership.joinedAt;
    }
  }

  // Fetch events
  const eventsQuery = await db
    .collection('eventAttendance')
    .where('userId', '==', supporterId)
    .where('creatorId', '==', creatorId)
    .get();

  let eventsAttended = 0;
  let eventsRegistered = 0;
  let lastEventAt: Timestamp | undefined;

  eventsQuery.forEach(doc => {
    const event = doc.data();
    eventsRegistered++;
    if (event.attended) {
      eventsAttended++;
    }
    if (!lastEventAt || (event.eventDate && event.eventDate.seconds > lastEventAt.seconds)) {
      lastEventAt = event.eventDate;
    }
  });

  // Check online status
  const userStatusDoc = await db.doc(`userStatus/${supporterId}`).get();
  const isCurrentlyOnline = userStatusDoc.exists && userStatusDoc.data()?.online === true;

  // Calculate preferred contact times (simplified - would use ML in production)
  const preferredContactTimes: number[] = [];
  // This would analyze chat/gift timestamps to find peak activity hours

  // Calculate average online hours (simplified)
  const avgOnlineHoursPerDay = 4; // Default estimate

  return {
    // Chat activity
    recentChatActivity,
    avgChatResponseTime: totalResponseTimes.length > 0 
      ? totalResponseTimes.reduce((a, b) => a + b, 0) / totalResponseTimes.length 
      : 0,
    totalChatsInitiated,
    
    // Gifting behavior
    totalGiftsSent,
    giftsLast7Days,
    giftsLast30Days,
    avgGiftValue,
    
    // Profile engagement
    profileViewsLast7Days,
    profileViewsLast30Days,
    
    // Live engagement
    liveStreamsAttended,
    liveStreamsAttendedLast7Days,
    avgLiveWatchTime,
    giftsInLive,
    
    // PPV purchases
    ppvPurchases,
    ppvLast30Days,
    
    // Fan Club
    isFanClubMember,
    fanClubTier,
    fanClubJoinedAt,
    
    // Events
    eventsAttended,
    eventsRegistered,
    
    // Recency
    lastChatAt,
    lastGiftAt,
    lastLiveAt,
    lastPurchaseAt,
    
    // Online presence
    isCurrentlyOnline,
    avgOnlineHoursPerDay,
    preferredContactTimes
  };
}

/**
 * Calculate conversion probability based on behavioral signals
 */
export function calculateConversionProbability(signals: BehavioralSignals): number {
  let score = 0;

  // Recent chat activity (0-30%)
  if (signals.recentChatActivity >= 10) score += 30;
  else if (signals.recentChatActivity >= 5) score += 20;
  else if (signals.recentChatActivity >= 1) score += 10;

  // Previous gifting (0-30%)
  if (signals.totalGiftsSent >= 10) score += 30;
  else if (signals.totalGiftsSent >= 5) score += 20;
  else if (signals.totalGiftsSent >= 1) score += 10;

  // Profile views (0-15%)
  if (signals.profileViewsLast7Days >= 5) score += 15;
  else if (signals.profileViewsLast7Days >= 3) score += 10;
  else if (signals.profileViewsLast7Days >= 1) score += 5;

  // Live engagement (0-15%)
  if (signals.liveStreamsAttendedLast7Days >= 2) score += 15;
  else if (signals.liveStreamsAttendedLast7Days >= 1) score += 10;

  // Recent activity (0-7%)
  const lastActivity = getLastActivity(signals);
  if (lastActivity && lastActivity.seconds > Timestamp.now().seconds - 7 * 24 * 60 * 60) {
    score += 7;
  } else if (lastActivity && lastActivity.seconds > Timestamp.now().seconds - 14 * 24 * 60 * 60) {
    score += 4;
  }

  // Bonus: Currently online
  if (signals.isCurrentlyOnline) score += 10;

  // Bonus: Fan club member
  if (signals.isFanClubMember) score += 10;

  // Cap at 100
  return Math.min(100, score);
}

/**
 * Get the most recent activity timestamp
 */
function getLastActivity(signals: BehavioralSignals): Timestamp | undefined {
  const times = [
    signals.lastChatAt,
    signals.lastGiftAt,
    signals.lastLiveAt,
    signals.lastPurchaseAt
  ].filter(t => t !== undefined) as Timestamp[];

  if (times.length === 0) return undefined;

  return times.reduce((latest, current) => 
    current.seconds > latest.seconds ? current : latest
  );
}

/**
 * Determine supporter segment based on signals and spending
 */
export function determineSegment(
  signals: BehavioralSignals,
  lifetimeSpent: number,
  conversionProbability: number
): SupporterSegment {
  const lastActivity = getLastActivity(signals);
  const daysSinceLastActivity = lastActivity
    ? (Timestamp.now().seconds - lastActivity.seconds) / (24 * 60 * 60)
    : 999;

  // VIP: High lifetime spending
  if (lifetimeSpent >= VIP_THRESHOLD_TOKENS) {
    return 'vip';
  }

  // Hot Lead: High conversion probability
  if (conversionProbability >= HOT_LEAD_PROBABILITY_THRESHOLD) {
    return 'hot_lead';
  }

  // Cold: No activity in 30+ days
  if (daysSinceLastActivity >= COLD_DAYS_THRESHOLD) {
    return 'cold';
  }

  // Dormant: No activity in 7-30 days
  if (daysSinceLastActivity >= DORMANT_DAYS_THRESHOLD) {
    return 'dormant';
  }

  // Active: Regular engagement
  if (conversionProbability >= ACTIVE_PROBABILITY_THRESHOLD) {
    return 'active';
  }

  // Default to active if they have any spending
  return 'active';
}

/**
 * Map conversion probability to potential level
 */
export function getConversionPotential(probability: number): ConversionPotential {
  if (probability >= 90) return 'extremely_high';
  if (probability >= 70) return 'very_high';
  if (probability >= 50) return 'high';
  if (probability >= 30) return 'medium';
  return 'low';
}

/**
 * Segment all supporters for a creator
 */
export async function segmentSupporters(
  db: Firestore,
  creatorId: string
): Promise<SupporterSegmentData[]> {
  // Get all supporters (users who have spent tokens with this creator)
  const supportersSet = new Set<string>();

  // From gifts
  const giftsQuery = await db
    .collection('gifts')
    .where('recipientId', '==', creatorId)
    .get();
  
  giftsQuery.forEach(doc => {
    supportersSet.add(doc.data().senderId);
  });

  // From chats
  const chatsQuery = await db
    .collection('chats')
    .where('roles.earnerId', '==', creatorId)
    .where('state', '!=', 'FREE_ACTIVE')
    .get();

  chatsQuery.forEach(doc => {
    const chat = doc.data();
    if (chat.roles && chat.roles.payerId) {
      supportersSet.add(chat.roles.payerId);
    }
  });

  // From PPV
  const ppvQuery = await db
    .collection('ppvPurchases')
    .where('creatorId', '==', creatorId)
    .get();

  ppvQuery.forEach(doc => {
    supportersSet.add(doc.data().buyerId);
  });

  // From fan clubs
  const fanClubQuery = await db
    .collection('fanClubMemberships')
    .where('creatorId', '==', creatorId)
    .where('status', '==', 'active')
    .get();

  fanClubQuery.forEach(doc => {
    supportersSet.add(doc.data().memberId);
  });

  const supporters = Array.from(supportersSet);
  const segmentedData: SupporterSegmentData[] = [];

  // Process each supporter
  for (const supporterId of supporters) {
    // Calculate lifetime spending
    const lifetimeSpent = await calculateLifetimeSpending(db, creatorId, supporterId);
    const monthlySpent = await calculateMonthlySpending(db, creatorId, supporterId);

    // Calculate behavioral signals
    const signals = await calculateBehavioralSignals(db, creatorId, supporterId);

    // Calculate conversion probability
    const conversionProbability = calculateConversionProbability(signals);

    // Determine segment
    const segment = determineSegment(signals, lifetimeSpent, conversionProbability);

    // Get conversion potential
    const conversionPotential = getConversionPotential(conversionProbability);

    // Calculate days since last activity
    const lastActivity = getLastActivity(signals);
    const daysSinceLastActivity = lastActivity
      ? (Timestamp.now().seconds - lastActivity.seconds) / (24 * 60 * 60)
      : 999;

    segmentedData.push({
      supporterId,
      creatorId,
      segment,
      conversionPotential,
      conversionProbability,
      lastActivityAt: lastActivity || Timestamp.now(),
      daysSinceLastActivity,
      lifetimeTokensSpent: lifetimeSpent,
      monthlyTokensSpent: monthlySpent,
      calculatedAt: Timestamp.now(),
      signals
    });
  }

  // Save to Firestore
  const batch = db.batch();
  for (const data of segmentedData) {
    const ref = db
      .doc(`supporterSegments/${creatorId}/supporters/${data.supporterId}`);
    batch.set(ref, data);
  }
  await batch.commit();

  // Update summary
  const summary = {
    vip: segmentedData.filter(s => s.segment === 'vip').length,
    hot_leads: segmentedData.filter(s => s.segment === 'hot_lead').length,
    active: segmentedData.filter(s => s.segment === 'active').length,
    dormant: segmentedData.filter(s => s.segment === 'dormant').length,
    cold: segmentedData.filter(s => s.segment === 'cold').length,
    total: segmentedData.length,
    updatedAt: Timestamp.now()
  };

  await db.doc(`supporterSegmentSummary/${creatorId}`).set(summary);

  return segmentedData;
}

/**
 * Calculate lifetime spending for a supporter with a creator
 */
async function calculateLifetimeSpending(
  db: Firestore,
  creatorId: string,
  supporterId: string
): Promise<number> {
  let total = 0;

  // Gifts
  const giftsQuery = await db
    .collection('gifts')
    .where('senderId', '==', supporterId)
    .where('recipientId', '==', creatorId)
    .get();

  giftsQuery.forEach(doc => {
    total += doc.data().tokenValue || 0;
  });

  // Chat
  const chatsQuery = await db
    .collection('chats')
    .where('participants', 'array-contains', supporterId)
    .where('roles.earnerId', '==', creatorId)
    .get();

  chatsQuery.forEach(doc => {
    total += doc.data().billing?.totalConsumed || 0;
  });

  // PPV
  const ppvQuery = await db
    .collection('ppvPurchases')
    .where('buyerId', '==', supporterId)
    .where('creatorId', '==', creatorId)
    .get();

  ppvQuery.forEach(doc => {
    total += doc.data().tokenPrice || 0;
  });

  // Fan club
  const fanClubQuery = await db
    .collection('fanClubTransactions')
    .where('memberId', '==', supporterId)
    .where('creatorId', '==', creatorId)
    .get();

  fanClubQuery.forEach(doc => {
    total += doc.data().amount || 0;
  });

  return total;
}

/**
 * Calculate monthly spending (last 30 days)
 */
async function calculateMonthlySpending(
  db: Firestore,
  creatorId: string,
  supporterId: string
): Promise<number> {
  const thirtyDaysAgo = Timestamp.fromMillis(
    Timestamp.now().toMillis() - 30 * 24 * 60 * 60 * 1000
  );

  let total = 0;

  // Gifts
  const giftsQuery = await db
    .collection('gifts')
    .where('senderId', '==', supporterId)
    .where('recipientId', '==', creatorId)
    .where('createdAt', '>=', thirtyDaysAgo)
    .get();

  giftsQuery.forEach(doc => {
    total += doc.data().tokenValue || 0;
  });

  // Other transactions would be similar...

  return total;
}

// ============================================================================
// CRM Inbox Management
// ============================================================================

/**
 * Generate CRM inbox entries for a specific tab
 */
export async function generateInboxEntries(
  db: Firestore,
  creatorId: string,
  tab: string,
  limit: number = 50
): Promise<CRMInboxEntry[]> {
  const segmentsRef = db.collection(`supporterSegments/${creatorId}/supporters`);
  let query = segmentsRef.orderBy('conversionProbability', 'desc');

  // Filter by tab
  switch (tab) {
    case 'vip':
      query = segmentsRef
        .where('segment', '==', 'vip')
        .orderBy('lifetimeTokensSpent', 'desc')
        .limit(VIP_TOP_COUNT);
      break;
    
    case 'hot_leads':
      query = segmentsRef
        .where('segment', '==', 'hot_lead')
        .orderBy('conversionProbability', 'desc')
        .limit(limit);
      break;
    
    case 'all_supporters':
      query = segmentsRef
        .orderBy('lastActivityAt', 'desc')
        .limit(limit);
      break;
    
    case 'dormant':
      query = segmentsRef
        .where('segment', '==', 'dormant')
        .orderBy('lastActivityAt', 'desc')
        .limit(limit);
      break;
    
    case 'new':
      // New supporters (first purchase within last 30 days)
      const thirtyDaysAgo = Timestamp.fromMillis(
        Timestamp.now().toMillis() - NEW_SUPPORTER_DAYS * 24 * 60 * 60 * 1000
      );
      query = segmentsRef
        .where('calculatedAt', '>=', thirtyDaysAgo)
        .orderBy('calculatedAt', 'desc')
        .limit(limit);
      break;
  }

  const snapshot = await query.get();
  const entries: CRMInboxEntry[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() as SupporterSegmentData;
    
    // Get user profile for display info
    const userDoc = await db.doc(`users/${data.supporterId}`).get();
    const user = userDoc.data();

    if (!user) continue;

    // Check for unread messages
    const unreadQuery = await db
      .collection('chats')
      .where('participants', 'array-contains', data.supporterId)
      .where('roles.earnerId', '==', creatorId)
      .where(`unreadCount.${creatorId}`, '>', 0)
      .get();

    const unreadMessages = unreadQuery.size;

    // Calculate priority score
    const priorityScore = calculatePriorityScore(data);

    // Check for recent live interaction
    const hasRecentLiveInteraction = data.signals.liveStreamsAttendedLast7Days > 0;

    // Get badges
    const badges: string[] = [];
    if (data.signals.isFanClubMember) {
      badges.push(`fan_club_${data.signals.fanClubTier}`);
    }
    if (data.signals.eventsAttended > 0) {
      badges.push('event_attendee');
    }

    entries.push({
      supporterId: data.supporterId,
      displayName: user.displayName || 'User',
      avatarUrl: user.avatarUrl,
      segment: data.segment,
      conversionPotential: data.conversionPotential,
      isOnline: data.signals.isCurrentlyOnline,
      lastActivityAt: data.lastActivityAt,
      lifetimeSpent: data.lifetimeTokensSpent,
      monthlySpent: data.monthlyTokensSpent,
      unreadMessages,
      priorityScore,
      hasRecentLiveInteraction,
      badges
    });
  }

  // Sort by priority score
  entries.sort((a, b) => b.priorityScore - a.priorityScore);

  // Save to Firestore for caching
  const batch = db.batch();
  entries.forEach(entry => {
    const ref = db.doc(`crmInboxEntries/${creatorId}/entries/${entry.supporterId}`);
    batch.set(ref, { ...entry, tab, updatedAt: Timestamp.now() });
  });
  await batch.commit();

  return entries;
}

/**
 * Calculate priority score for inbox sorting
 */
function calculatePriorityScore(data: SupporterSegmentData): number {
  let score = data.conversionProbability;

  // Boost for online status
  if (data.signals.isCurrentlyOnline) score += 20;

  // Boost for VIP
  if (data.segment === 'vip') score += 15;

  // Boost for recent live interaction
  if (data.signals.liveStreamsAttendedLast7Days > 0) score += 10;

  // Boost for recent gifting
  if (data.signals.giftsLast7Days > 0) score += 10;

  return Math.min(150, score);
}

// ============================================================================
// Supporter Profile Analytics
// ============================================================================

/**
 * Build complete supporter profile with analytics
 */
export async function buildSupporterProfile(
  db: Firestore,
  creatorId: string,
  supporterId: string
): Promise<SupporterProfile> {
  const signals = await calculateBehavioralSignals(db, creatorId, supporterId);
  const lifetimeSpent = await calculateLifetimeSpending(db, creatorId, supporterId);
  const monthlySpent = await calculateMonthlySpending(db, creatorId, supporterId);
  const weeklySpent = await calculateWeeklySpending(db, creatorId, supporterId);

  // Calculate feature usage breakdown
  const featureUsage = await calculateFeatureUsage(db, creatorId, supporterId, signals);

  // Calculate attendance metrics
  const attendance = await calculateAttendanceMetrics(db, creatorId, supporterId);

  // Calculate DM response score
  const dmResponseScore = await calculateDMResponseScore(db, creatorId, supporterId);

  // Calculate best contact time using AI
  const bestContactTime = calculateBestContactTime(signals);

  // Identify behavioral patterns
  const patterns = await identifyBehavioralPatterns(db, creatorId, supporterId, signals);

  // Get first purchase date
  const firstPurchaseAt = await getFirstPurchaseDate(db, creatorId, supporterId);

  // Calculate lifetime days
  const lifetimeDays = firstPurchaseAt
    ? (Timestamp.now().seconds - firstPurchaseAt.seconds) / (24 * 60 * 60)
    : 0;

  const profile: SupporterProfile = {
    supporterId,
    creatorId,
    lifetimeTokensSpent: lifetimeSpent,
    monthlyTokensSpent: monthlySpent,
    weeklyTokensSpent: weeklySpent,
    avgSpendPerMonth: lifetimeDays > 30 ? (lifetimeSpent / lifetimeDays) * 30 : monthlySpent,
    featureUsage,
    attendance,
    dmResponseScore,
    bestContactTime,
    patterns,
    firstPurchaseAt,
    lastActivityAt: getLastActivity(signals) || Timestamp.now(),
    lifetimeDays: Math.floor(lifetimeDays),
    updatedAt: Timestamp.now()
  };

  // Save to Firestore
  await db
    .doc(`supporterProfiles/${creatorId}/profiles/${supporterId}`)
    .set(profile);

  return profile;
}

async function calculateWeeklySpending(
  db: Firestore,
  creatorId: string,
  supporterId: string
): Promise<number> {
  const sevenDaysAgo = Timestamp.fromMillis(
    Timestamp.now().toMillis() - 7 * 24 * 60 * 60 * 1000
  );

  let total = 0;

  const giftsQuery = await db
    .collection('gifts')
    .where('senderId', '==', supporterId)
    .where('recipientId', '==', creatorId)
    .where('createdAt', '>=', sevenDaysAgo)
    .get();

  giftsQuery.forEach(doc => {
    total += doc.data().tokenValue || 0;
  });

  return total;
}

async function calculateFeatureUsage(
  db: Firestore,
  creatorId: string,
  supporterId: string,
  signals: BehavioralSignals
) {
  // Feature usage is partially calculated from signals
  return {
    chat: {
      totalMessages: signals.recentChatActivity,
      tokensSpent: 0, // Would calculate from chat billing
      avgResponseTime: signals.avgChatResponseTime,
      lastChatAt: signals.lastChatAt
    },
    live: {
      streamsAttended: signals.liveStreamsAttended,
      totalGifts: signals.giftsInLive,
      tokensSpent: 0, // Calculate from gifts in live
      avgWatchTime: signals.avgLiveWatchTime,
      lastAttendedAt: signals.lastLiveAt
    },
    ppv: {
      itemsPurchased: signals.ppvPurchases,
      tokensSpent: 0,
      categories: [],
      lastPurchaseAt: signals.lastPurchaseAt
    },
    fanClub: {
      isMember: signals.isFanClubMember,
      tier: signals.fanClubTier,
      joinedAt: signals.fanClubJoinedAt,
      totalMonths: 0,
      tokensSpent: 0
    },
    events: {
      attended: signals.eventsAttended,
      registered: signals.eventsRegistered,
      tokensSpent: 0,
      lastEventAt: undefined
    }
  };
}

async function calculateAttendanceMetrics(
  db: Firestore,
  creatorId: string,
  supporterId: string
) {
  // Simplified - would need full calculation
  return {
    liveStreamsAttended: 0,
    liveStreamsTotal: 0,
    attendanceRate: 0,
    eventsAttended: 0,
    eventsInvited: 0
  };
}

async function calculateDMResponseScore(
  db: Firestore,
  creatorId: string,
  supporterId: string
) {
  return {
    avgResponseTime: 0,
    responseRate: 0,
    conversationStarters: 0,
    repliesReceived: 0
  };
}

function calculateBestContactTime(signals: BehavioralSignals) {
  // AI-based calculation would analyze activity patterns
  // For now, return a simplified version
  return {
    hourOfDay: 20, // 8 PM default
    dayOfWeek: 6, // Saturday
    confidence: 75,
    timezone: 'UTC'
  };
}

async function identifyBehavioralPatterns(
  db: Firestore,
  creatorId: string,
  supporterId: string,
  signals: BehavioralSignals
) {
  // Analyze trends
  const spendingTrend = signals.giftsLast7Days > signals.giftsLast30Days / 4
    ? 'increasing'
    : signals.giftsLast7Days < signals.giftsLast30Days / 6
    ? 'decreasing'
    : 'stable';

  const engagementTrend = signals.recentChatActivity > 5
    ? 'increasing'
    : 'stable';

  // Calculate days since last activity for retention risk
  const lastActivity = getLastActivity(signals);
  const daysSinceLastActivity = lastActivity
    ? (Timestamp.now().seconds - lastActivity.seconds) / (24 * 60 * 60)
    : 999;

  const retentionRisk = daysSinceLastActivity > 14
    ? 'high'
    : daysSinceLastActivity > 7
    ? 'medium'
    : 'low';

  return {
    preferredFeatures: ['chat', 'live'], // Would analyze actual usage
    spendingTrend: spendingTrend as 'increasing' | 'stable' | 'decreasing',
    engagementTrend: engagementTrend as 'increasing' | 'stable' | 'decreasing',
    retentionRisk: retentionRisk as 'low' | 'medium' | 'high',
    likelyToUpgrade: signals.isFanClubMember && signals.giftsLast7Days > 5
  };
}

async function getFirstPurchaseDate(
  db: Firestore,
  creatorId: string,
  supporterId: string
): Promise<Timestamp> {
  // Find earliest transaction
  return Timestamp.now(); // Simplified
}

// ============================================================================
// Safety & Privacy Checks
// ============================================================================

/**
 * Validate CRM action for safety compliance
 */
export function validateCRMAction(actionType: CRMActionType): { valid: boolean; reason?: string } {
  // Check against forbidden actions
  if (SAFETY_RULES.FORBIDDEN_ACTIONS.includes(actionType as any)) {
    return {
      valid: false,
      reason: `Action type '${actionType}' is forbidden for safety reasons`
    };
  }

  // All defined CRM actions are allowed
  const allowedActions: CRMActionType[] = [
    'dm_reminder',
    'invite_to_live',
    'offer_fan_club',
    'event_early_access',
    'prioritize_reply'
  ];

  if (!allowedActions.includes(actionType)) {
    return {
      valid: false,
      reason: `Unknown action type '${actionType}'`
    };
  }

  return { valid: true };
}

/**
 * Sanitize supporter data to remove forbidden fields
 */
export function sanitizeSupporterData(data: any): any {
  const sanitized = { ...data };

  // Remove forbidden data fields
  SAFETY_RULES.FORBIDDEN_DATA.forEach(field => {
    delete sanitized[field];
  });

  return sanitized;
}