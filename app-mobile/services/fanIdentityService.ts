/**
 * Fan Identity Service
 * Pack 33-13: Unified Fan Identity Engine
 * 
 * UI-only, local persistence via AsyncStorage.
 * Tracks viewer-to-creator relationship metrics and computes loyalty tags.
 * 
 * CONSTRAINTS:
 * - Mobile only (app-mobile)
 * - AsyncStorage for all persistence
 * - NO Firebase/Firestore/Functions calls
 * - NO network calls
 * - Deterministic, rule-based logic only
 * - Safe, non-creepy language
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type RelationshipTag =
  | "NEW"
  | "WARMING_UP"
  | "LOYAL"
  | "VIP_FAN"
  | "ROYAL_FAN";

export interface FanIdentityRecord {
  viewerId: string;
  targetId: string;

  // Interaction counters
  totalProfileViews: number;
  totalChatMessagesSent: number;
  totalChatMessagesReceived: number;
  totalPaidMessagesSent: number;
  totalTokensSpentApprox: number;
  totalPPVPurchases: number;
  totalLiveJoins: number;
  totalAiCompanionSessions: number;
  totalDaysActiveTogether: number;

  // Temporal data
  lastInteractionAt: number | null;
  lastVisitAt: number | null;
  lastWeekInteractionCount: number;

  // Computed scores
  relationshipTag: RelationshipTag;
  emotionalScore: number; // 0-100
  favoriteTopicTags: string[]; // max 5

  lastUpdatedAt: number;
}

export type FanEventType =
  | "PROFILE_VIEWED"
  | "CHAT_SENT"
  | "CHAT_RECEIVED"
  | "PAID_MESSAGE_SENT"
  | "PPV_PURCHASED"
  | "LIVE_JOINED"
  | "AI_COMPANION_SESSION"
  | "FOLLOWED";

export interface FanEvent {
  type: FanEventType;
  viewerId: string;
  targetId: string;
  tokensSpentApprox?: number;
  timestamp?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_PREFIX = 'fan_identity_v1_';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getStorageKey(viewerId: string, targetId: string): string {
  return `${STORAGE_PREFIX}${viewerId}_${targetId}`;
}

function createDefaultRecord(viewerId: string, targetId: string): FanIdentityRecord {
  return {
    viewerId,
    targetId,
    totalProfileViews: 0,
    totalChatMessagesSent: 0,
    totalChatMessagesReceived: 0,
    totalPaidMessagesSent: 0,
    totalTokensSpentApprox: 0,
    totalPPVPurchases: 0,
    totalLiveJoins: 0,
    totalAiCompanionSessions: 0,
    totalDaysActiveTogether: 0,
    lastInteractionAt: null,
    lastVisitAt: null,
    lastWeekInteractionCount: 0,
    relationshipTag: "NEW",
    emotionalScore: 0,
    favoriteTopicTags: [],
    lastUpdatedAt: Date.now(),
  };
}

/**
 * Calculate emotional score (0-100) based on engagement metrics
 * This is a simple heuristic, not psychological profiling
 */
function calculateEmotionalScore(record: FanIdentityRecord): number {
  let score = 0;

  // Days active together (capped at 30 days)
  score += Math.min(record.totalDaysActiveTogether, 30) * 5;

  // Chat messages (capped at 50 messages)
  score += Math.min(record.totalChatMessagesSent, 50) * 1;

  // Tokens spent (capped at 1000 tokens)
  score += Math.min(record.totalTokensSpentApprox, 1000) * 0.1;

  // LIVE joins (capped at 20 joins)
  score += Math.min(record.totalLiveJoins, 20) * 3;

  // PPV purchases (capped at 10 purchases)
  score += Math.min(record.totalPPVPurchases, 10) * 5;

  // AI companion sessions (capped at 15 sessions)
  score += Math.min(record.totalAiCompanionSessions, 15) * 2;

  // Profile views (capped at 30 views)
  score += Math.min(record.totalProfileViews, 30) * 0.5;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Determine relationship tag based on emotional score
 */
function calculateRelationshipTag(score: number): RelationshipTag {
  if (score < 15) return "NEW";
  if (score < 40) return "WARMING_UP";
  if (score < 70) return "LOYAL";
  if (score < 90) return "VIP_FAN";
  return "ROYAL_FAN";
}

/**
 * Update days active together
 * Simple day-based logic: if last interaction was on a different day, increment
 */
function updateDaysActive(record: FanIdentityRecord, now: number): number {
  if (!record.lastInteractionAt) {
    return 1; // First day
  }

  const lastDate = new Date(record.lastInteractionAt);
  const nowDate = new Date(now);

  // Check if same date (ignoring time)
  const sameDay =
    lastDate.getFullYear() === nowDate.getFullYear() &&
    lastDate.getMonth() === nowDate.getMonth() &&
    lastDate.getDate() === nowDate.getDate();

  if (sameDay) {
    return record.totalDaysActiveTogether; // Same day, no increment
  } else {
    return record.totalDaysActiveTogether + 1;
  }
}

/**
 * Update last week interaction count
 * Count interactions within the last 7 days
 */
function updateLastWeekCount(record: FanIdentityRecord, now: number): number {
  if (!record.lastInteractionAt) {
    return 1; // First interaction
  }

  const timeSinceLastInteraction = now - record.lastInteractionAt;

  if (timeSinceLastInteraction > ONE_WEEK_MS) {
    // More than a week, reset to 1
    return 1;
  } else {
    // Within the week, increment
    return record.lastWeekInteractionCount + 1;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get fan identity record for viewer-target pair
 */
export async function getFanIdentity(
  viewerId: string,
  targetId: string
): Promise<FanIdentityRecord | null> {
  try {
    const key = getStorageKey(viewerId, targetId);
    const data = await AsyncStorage.getItem(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as FanIdentityRecord;
  } catch (error) {
    console.error('Error reading fan identity:', error);
    return null;
  }
}

/**
 * Upsert fan identity record with partial update
 */
export async function upsertFanIdentity(
  viewerId: string,
  targetId: string,
  update: Partial<FanIdentityRecord>
): Promise<FanIdentityRecord> {
  try {
    const key = getStorageKey(viewerId, targetId);
    const existing = await getFanIdentity(viewerId, targetId);

    const record: FanIdentityRecord = {
      ...(existing || createDefaultRecord(viewerId, targetId)),
      ...update,
      viewerId, // Always enforce correct IDs
      targetId,
      lastUpdatedAt: Date.now(),
    };

    await AsyncStorage.setItem(key, JSON.stringify(record));
    return record;
  } catch (error) {
    console.error('Error upserting fan identity:', error);
    throw error;
  }
}

/**
 * Register a fan event and update the identity record
 */
export async function registerFanEvent(event: FanEvent): Promise<FanIdentityRecord> {
  const now = event.timestamp || Date.now();
  const existing = await getFanIdentity(event.viewerId, event.targetId);
  const record = existing || createDefaultRecord(event.viewerId, event.targetId);

  // Update counters based on event type
  switch (event.type) {
    case "PROFILE_VIEWED":
      record.totalProfileViews += 1;
      record.lastVisitAt = now;
      break;

    case "CHAT_SENT":
      record.totalChatMessagesSent += 1;
      break;

    case "CHAT_RECEIVED":
      record.totalChatMessagesReceived += 1;
      break;

    case "PAID_MESSAGE_SENT":
      record.totalPaidMessagesSent += 1;
      if (event.tokensSpentApprox) {
        record.totalTokensSpentApprox += event.tokensSpentApprox;
      }
      break;

    case "PPV_PURCHASED":
      record.totalPPVPurchases += 1;
      if (event.tokensSpentApprox) {
        record.totalTokensSpentApprox += event.tokensSpentApprox;
      }
      break;

    case "LIVE_JOINED":
      record.totalLiveJoins += 1;
      if (event.tokensSpentApprox) {
        record.totalTokensSpentApprox += event.tokensSpentApprox;
      }
      break;

    case "AI_COMPANION_SESSION":
      record.totalAiCompanionSessions += 1;
      if (event.tokensSpentApprox) {
        record.totalTokensSpentApprox += event.tokensSpentApprox;
      }
      break;

    case "FOLLOWED":
      // No specific counter, but counts as interaction
      break;
  }

  // Update temporal data
  record.lastInteractionAt = now;
  record.totalDaysActiveTogether = updateDaysActive(record, now);
  record.lastWeekInteractionCount = updateLastWeekCount(record, now);

  // Recompute scores
  record.emotionalScore = calculateEmotionalScore(record);
  record.relationshipTag = calculateRelationshipTag(record.emotionalScore);

  // Update timestamp
  record.lastUpdatedAt = now;

  // Persist
  const key = getStorageKey(event.viewerId, event.targetId);
  await AsyncStorage.setItem(key, JSON.stringify(record));

  return record;
}

/**
 * Clear all fan identity data (for testing/debugging)
 */
export async function clearAllFanIdentities(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const fanIdentityKeys = keys.filter(key => key.startsWith(STORAGE_PREFIX));
    await AsyncStorage.multiRemove(fanIdentityKeys);
  } catch (error) {
    console.error('Error clearing fan identities:', error);
    throw error;
  }
}

export default {
  getFanIdentity,
  upsertFanIdentity,
  registerFanEvent,
  clearAllFanIdentities,
};