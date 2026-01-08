/**
 * PACK 241: Unlockable Chemistry Badges
 * 
 * Cloud Functions for automatic badge unlocking
 * Tracks paid interactions and emotional milestones
 */

import { db, serverTimestamp, increment } from './init';
import { logger } from 'firebase-functions/v2';

// Badge type definitions
type ChemistryBadgeType = 
  | 'spark' | 'flame' | 'vibe' | 'heart' | 'memory' 
  | 'gift' | 'date' | 'adventure' | 'trophy' | 'forever';

interface BadgeUnlockConditions {
  paidWordsExchanged: number;
  microGameRounds: number;
  videoCallMinutes: number;
  voiceCallMinutes: number;
  memoryLogEntries: number;
  giftsExchanged: number;
  completedBookings: number;
  eventsAttended: number;
  trophiesEarned: number;
  matchAgeInDays: number;
}

interface ChemistryBadges {
  unlocked: Record<ChemistryBadgeType, boolean>;
  total: number;
  lastUnlocked: FirebaseFirestore.Timestamp | null;
  showPublic: boolean;
}

// Badge unlock thresholds
const BADGE_THRESHOLDS: Record<ChemistryBadgeType, keyof BadgeUnlockConditions> = {
  spark: 'paidWordsExchanged',      // 500+
  flame: 'microGameRounds',         // 5+
  vibe: 'videoCallMinutes',         // 60+
  heart: 'voiceCallMinutes',        // 120+
  memory: 'memoryLogEntries',       // 3+
  gift: 'giftsExchanged',           // 5+
  date: 'completedBookings',        // 1+
  adventure: 'eventsAttended',      // 1+
  trophy: 'trophiesEarned',         // 10+
  forever: 'matchAgeInDays',        // 365+
};

const BADGE_UNLOCK_VALUES: Record<ChemistryBadgeType, number> = {
  spark: 500,
  flame: 5,
  vibe: 60,
  heart: 120,
  memory: 3,
  gift: 5,
  date: 1,
  adventure: 1,
  trophy: 10,
  forever: 365,
};

/**
 * Check if a badge should be unlocked
 */
function shouldUnlockBadge(
  badgeType: ChemistryBadgeType,
  conditions: BadgeUnlockConditions,
  currentlyUnlocked: Record<ChemistryBadgeType, boolean>
): boolean {
  // Already unlocked?
  if (currentlyUnlocked[badgeType]) {
    return false;
  }

  const conditionKey = BADGE_THRESHOLDS[badgeType];
  const requiredValue = BADGE_UNLOCK_VALUES[badgeType];
  const currentValue = conditions[conditionKey];

  return currentValue >= requiredValue;
}

/**
 * Check badge visibility based on safety rules
 */
async function checkBadgeVisibility(matchId: string): Promise<{
  visible: boolean;
  reason: string;
}> {
  const matchRef = db.collection('matches').doc(matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    return { visible: false, reason: 'match_not_found' };
  }

  const matchData = matchDoc.data();

  // Check sleep mode
  if (matchData?.sleepMode?.active) {
    return { visible: false, reason: 'sleep_mode' };
  }

  // Check breakup recovery
  if (matchData?.breakupRecovery?.active) {
    return { visible: false, reason: 'breakup_recovery' };
  }

  // Check safety flags
  if (matchData?.safetyFlags?.hasSafetyFlag) {
    return { visible: false, reason: 'safety_flag' };
  }

  // Check stalker risk
  if (matchData?.stalkerRisk?.detected) {
    return { visible: false, reason: 'stalker_risk' };
  }

  return { visible: true, reason: 'normal' };
}

/**
 * Get or initialize badge conditions for a match
 */
async function getBadgeConditions(matchId: string): Promise<BadgeUnlockConditions> {
  const conditionsRef = db.collection('matches').doc(matchId).collection('chemistryBadgeConditions').doc('current');
  const conditionsDoc = await conditionsRef.get();

  if (conditionsDoc.exists) {
    return conditionsDoc.data() as BadgeUnlockConditions;
  }

  // Initialize with zeros
  const initialConditions: BadgeUnlockConditions = {
    paidWordsExchanged: 0,
    microGameRounds: 0,
    videoCallMinutes: 0,
    voiceCallMinutes: 0,
    memoryLogEntries: 0,
    giftsExchanged: 0,
    completedBookings: 0,
    eventsAttended: 0,
    trophiesEarned: 0,
    matchAgeInDays: 0,
  };

  await conditionsRef.set(initialConditions);
  return initialConditions;
}

/**
 * Get or initialize chemistry badges for a match
 */
async function getChemistryBadges(matchId: string): Promise<ChemistryBadges> {
  const badgesRef = db.collection('matches').doc(matchId).collection('chemistryBadges').doc(matchId);
  const badgesDoc = await badgesRef.get();

  if (badgesDoc.exists) {
    return badgesDoc.data() as ChemistryBadges;
  }

  // Initialize with no badges unlocked
  const initialBadges: ChemistryBadges = {
    unlocked: {
      spark: false,
      flame: false,
      vibe: false,
      heart: false,
      memory: false,
      gift: false,
      date: false,
      adventure: false,
      trophy: false,
      forever: false,
    },
    total: 0,
    lastUnlocked: null,
    showPublic: false,
  };

  await badgesRef.set(initialBadges);
  return initialBadges;
}

/**
 * Update badge conditions (increment values)
 */
export async function updateBadgeConditions(
  matchId: string,
  updates: Partial<BadgeUnlockConditions>
): Promise<void> {
  const conditionsRef = db.collection('matches').doc(matchId).collection('chemistryBadgeConditions').doc('current');
  
  const incrementUpdates: any = {};
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'number') {
      incrementUpdates[key] = increment(value);
    }
  }

  await conditionsRef.set(incrementUpdates, { merge: true });
}

/**
 * Check and unlock badges for a match
 */
export async function checkAndUnlockBadges(matchId: string): Promise<{
  newlyUnlocked: ChemistryBadgeType[];
  allBadges: ChemistryBadges;
}> {
  const [conditions, badges, visibility] = await Promise.all([
    getBadgeConditions(matchId),
    getChemistryBadges(matchId),
    checkBadgeVisibility(matchId),
  ]);

  // If badges are not visible due to safety rules, return early
  if (!visibility.visible) {
    logger.info(`Badges hidden for match ${matchId}: ${visibility.reason}`);
    return { newlyUnlocked: [], allBadges: badges };
  }

  const newlyUnlocked: ChemistryBadgeType[] = [];
  const allBadgeTypes: ChemistryBadgeType[] = [
    'spark', 'flame', 'vibe', 'heart', 'memory',
    'gift', 'date', 'adventure', 'trophy', 'forever'
  ];

  // Check each badge
  for (const badgeType of allBadgeTypes) {
    if (shouldUnlockBadge(badgeType, conditions, badges.unlocked)) {
      newlyUnlocked.push(badgeType);
      badges.unlocked[badgeType] = true;
    }
  }

  // If new badges unlocked, update Firestore
  if (newlyUnlocked.length > 0) {
    badges.total = Object.values(badges.unlocked).filter(Boolean).length;
    badges.lastUnlocked = serverTimestamp() as FirebaseFirestore.Timestamp;

    const badgesRef = db.collection('matches').doc(matchId).collection('chemistryBadges').doc(matchId);
    await badgesRef.set(badges);

    // Log unlock events
    await Promise.all(newlyUnlocked.map(badgeType => 
      logBadgeUnlockEvent(matchId, badgeType, badges.total)
    ));

    logger.info(`Unlocked ${newlyUnlocked.length} badges for match ${matchId}:`, newlyUnlocked);
  }

  return { newlyUnlocked, allBadges: badges };
}

/**
 * Log a badge unlock event
 */
async function logBadgeUnlockEvent(
  matchId: string,
  badgeType: ChemistryBadgeType,
  newTotal: number
): Promise<void> {
  const matchRef = db.collection('matches').doc(matchId);
  const matchDoc = await matchRef.get();
  
  if (!matchDoc.exists) {
    return;
  }

  const matchData = matchDoc.data();
  const users = [matchData?.user1Id, matchData?.user2Id].filter(Boolean);

  for (const userId of users) {
    const eventRef = db.collection('badgeUnlockEvents').doc();
    await eventRef.set({
      eventId: eventRef.id,
      matchId,
      userId,
      badgeType,
      unlockedAt: serverTimestamp(),
      previousTotal: newTotal - 1,
      newTotal,
    });
  }
}

/**
 * Calculate match age in days
 */
export async function updateMatchAge(matchId: string): Promise<void> {
  const matchRef = db.collection('matches').doc(matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    return;
  }

  const matchData = matchDoc.data();
  const createdAt = matchData?.createdAt?.toDate();

  if (!createdAt) {
    return;
  }

  const now = new Date();
  const ageInDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

  await updateBadgeConditions(matchId, { matchAgeInDays: ageInDays });
  await checkAndUnlockBadges(matchId);
}

/**
 * Track paid words exchanged (from Economy Engine)
 */
export async function trackPaidWords(matchId: string, wordCount: number): Promise<void> {
  await updateBadgeConditions(matchId, { paidWordsExchanged: wordCount });
  await checkAndUnlockBadges(matchId);
}

/**
 * Track micro-game rounds (from Micro-Games Engine)
 */
export async function trackMicroGameRound(matchId: string): Promise<void> {
  await updateBadgeConditions(matchId, { microGameRounds: 1 });
  await checkAndUnlockBadges(matchId);
}

/**
 * Track call duration (from Call Monetization)
 */
export async function trackCallDuration(
  matchId: string,
  minutes: number,
  callType: 'video' | 'voice'
): Promise<void> {
  const updates = callType === 'video'
    ? { videoCallMinutes: minutes }
    : { voiceCallMinutes: minutes };

  await updateBadgeConditions(matchId, updates);
  await checkAndUnlockBadges(matchId);
}

/**
 * Track memory log entry (from Memory Log)
 */
export async function trackMemoryLogEntry(matchId: string): Promise<void> {
  await updateBadgeConditions(matchId, { memoryLogEntries: 1 });
  await checkAndUnlockBadges(matchId);
}

/**
 * Track gift exchange (from Economy Engine)
 */
export async function trackGiftExchange(matchId: string): Promise<void> {
  await updateBadgeConditions(matchId, { giftsExchanged: 1 });
  await checkAndUnlockBadges(matchId);
}

/**
 * Track calendar booking completion (from Calendar Engine)
 */
export async function trackBookingCompletion(matchId: string): Promise<void> {
  await updateBadgeConditions(matchId, { completedBookings: 1 });
  await checkAndUnlockBadges(matchId);
}

/**
 * Track event attendance (from Events)
 */
export async function trackEventAttendance(matchId: string): Promise<void> {
  await updateBadgeConditions(matchId, { eventsAttended: 1 });
  await checkAndUnlockBadges(matchId);
}

/**
 * Track trophy earning (from Trophy Engine)
 */
export async function trackTrophyEarned(matchId: string): Promise<void> {
  await updateBadgeConditions(matchId, { trophiesEarned: 1 });
  await checkAndUnlockBadges(matchId);
}

/**
 * Get cosmetic reward tiers unlocked for a match
 */
export function getCosmeticRewardsUnlocked(badgeTotal: number): string[] {
  const rewards: string[] = [];

  if (badgeTotal >= 1) rewards.push('first_badge');     // unique chat highlight border
  if (badgeTotal >= 3) rewards.push('three_badges');    // animated message tail effect
  if (badgeTotal >= 5) rewards.push('five_badges');     // glowing profile frame
  if (badgeTotal >= 8) rewards.push('eight_badges');    // animated couple intro
  if (badgeTotal >= 10) rewards.push('ten_badges');     // exclusive mini-avatar icon

  return rewards;
}

/**
 * Get badge display data for UI
 */
export async function getBadgeDisplayData(matchId: string): Promise<{
  badges: ChemistryBadges;
  cosmeticRewards: string[];
  visibility: { visible: boolean; reason: string };
}> {
  const [badges, visibility] = await Promise.all([
    getChemistryBadges(matchId),
    checkBadgeVisibility(matchId),
  ]);

  const cosmeticRewards = getCosmeticRewardsUnlocked(badges.total);

  return {
    badges,
    cosmeticRewards,
    visibility,
  };
}