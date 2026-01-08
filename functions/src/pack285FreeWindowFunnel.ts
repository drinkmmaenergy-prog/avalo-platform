/**
 * PACK 285 — Chat Free Windows & Funnel
 *
 * Implements full free-message funnel for chats:
 * - 6/10 free messages per person (per match)
 * - Special rules for low-popularity profiles
 * - Special case where 100% of tokens go to Avalo (earn OFF profiles)
 * - No changes to core 65/35 and 80/20 economics
 *
 * Depends on:
 * - PACK 267 (global economics & free-messages constants)
 * - PACK 273 (Chat Engine & payer logic)
 *
 * @package avaloapp
 * @version 1.0.0
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Pack273ChatParticipant, Pack273ChatRoles } from './pack273ChatEngine.js';

// Re-export Pack273ChatParticipant for convenience
export type { Pack273ChatParticipant, Pack273ChatRoles } from './pack273ChatEngine.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type FreeWindowMode = 
  | 'STANDARD'              // Regular free window (6/8/10 messages per person)
  | 'LOW_POP_FREE'          // Entire chat is free (low-popularity profiles)
  | 'EARN_OFF_AVALO_100';   // Earn OFF, but Avalo earns 100% after free window

export type FreeWindowState = 
  | 'FREE'                  // Free window active
  | 'PAID'                  // Paywall active, payer is billed per word bucket
  | 'FULL_FREE';            // Whole chat is free forever (no paywall at all)

export interface FreeWindow {
  mode: FreeWindowMode;
  perUserLimit: {
    [userId: string]: number;  // Free messages each user can send
  };
  used: {
    [userId: string]: number;  // Free messages each user has used
  };
  state: FreeWindowState;
}

export interface Pack285ChatMetadata {
  chatId: string;
  userA: string;
  userB: string;
  
  // From PACK 273
  earningProfileId: string | null;  // Who is allowed to earn in this relation
  payerId: string | null;            // Who pays once chat is paid
  
  // PACK 285 Free Window
  freeWindow: FreeWindow;
  
  createdAt: any;
  updatedAt: any;
}

export interface LowPopularityPromoConfig {
  enabled: boolean;
  maxPromoPerDay: number;         // Max N free-promos per day per region
  maxPromoPerRegion: number;      // Max simultaneous free chats per region
}

// ============================================================================
// CONSTANTS (from PACK 267) - Exported for tests
// ============================================================================

export const FREE_MESSAGES_LOW_POPULARITY_PER_USER = 10;  // 20 total
export const FREE_MESSAGES_ROYAL_PER_USER = 6;            // 12 total
export const FREE_MESSAGES_STANDARD_PER_USER = 8;         // 16 total

const AVALO_SPLIT_CHAT_PLATFORM = 35;
const AVALO_SPLIT_CHAT_CREATOR = 65;

// ============================================================================
// FUNCTION: Determine Free Window Configuration
// ============================================================================

/**
 * Determines the free window mode and limits for a new chat.
 * Called during match creation before chat initialization.
 */
export async function determinePack285FreeWindow(
  earningProfile: Pack273ChatParticipant | null,
  payerProfile: Pack273ChatParticipant,
  userAId: string,
  userBId: string
): Promise<FreeWindow> {
  
  // ====================================================================
  // CASE A: Low-popularity profile with promo free chats
  // ====================================================================
  if (earningProfile && !earningProfile.earnMode) {
    // This is earn OFF case - check if it's low-pop promo eligible
    const isLowPopPromo = await isLowPopularityPromoEligible(earningProfile.userId);
    
    if (isLowPopPromo && earningProfile.popularity === 'low') {
      return {
        mode: 'LOW_POP_FREE',
        perUserLimit: {
          [userAId]: 9999,
          [userBId]: 9999
        },
        used: {
          [userAId]: 0,
          [userBId]: 0
        },
        state: 'FULL_FREE'
      };
    }
  }
  
  // ====================================================================
  // CASE B: Earn ON (normal paid chat, with free window)
  // ====================================================================
  if (earningProfile && earningProfile.earnMode) {
    let perUserLimit: number;
    
    // Determine limit based on earning profile tier
    if (earningProfile.popularity === 'royal') {
      perUserLimit = FREE_MESSAGES_ROYAL_PER_USER;  // 6
    } else if (earningProfile.popularity === 'low') {
      perUserLimit = FREE_MESSAGES_LOW_POPULARITY_PER_USER;  // 10
    } else {
      perUserLimit = FREE_MESSAGES_STANDARD_PER_USER;  // 8
    }
    
    return {
      mode: 'STANDARD',
      perUserLimit: {
        [userAId]: perUserLimit,
        [userBId]: perUserLimit
      },
      used: {
        [userAId]: 0,
        [userBId]: 0
      },
      state: 'FREE'
    };
  }
  
  // ====================================================================
  // CASE C: Earn OFF but not low-pop, Avalo 100%
  // ====================================================================
  if (earningProfile && !earningProfile.earnMode) {
    return {
      mode: 'EARN_OFF_AVALO_100',
      perUserLimit: {
        [userAId]: FREE_MESSAGES_LOW_POPULARITY_PER_USER,
        [userBId]: FREE_MESSAGES_LOW_POPULARITY_PER_USER
      },
      used: {
        [userAId]: 0,
        [userBId]: 0
      },
      state: 'FREE'
    };
  }
  
  // ====================================================================
  // DEFAULT: Standard free window
  // ====================================================================
  return {
    mode: 'STANDARD',
    perUserLimit: {
      [userAId]: FREE_MESSAGES_STANDARD_PER_USER,
      [userBId]: FREE_MESSAGES_STANDARD_PER_USER
    },
    used: {
      [userAId]: 0,
      [userBId]: 0
    },
    state: 'FREE'
  };
}

// ============================================================================
// FUNCTION: Initialize Chat with Free Window
// ============================================================================

/**
 * Initialize chat with PACK 285 free window structure.
 * Called after match creation.
 */
export async function initializePack285Chat(
  chatId: string,
  userAId: string,
  userBId: string,
  roles: Pack273ChatRoles,
  freeWindow: FreeWindow
): Promise<void> {
  
  const chatData: Pack285ChatMetadata = {
    chatId,
    userA: userAId,
    userB: userBId,
    earningProfileId: roles.earnerId,
    payerId: roles.payerId,
    freeWindow,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  await db.collection('chats').doc(chatId).set(chatData);
}

// ============================================================================
// FUNCTION: Process Message with Free Window Logic
// ============================================================================

/**
 * Process message with PACK 285 free window funnel.
 * Handles FREE → PAID transition and token routing.
 */
export async function processPack285Message(
  chatId: string,
  senderId: string,
  messageText: string,
  wordCount: number
): Promise<{
  allowed: boolean;
  isFree: boolean;
  tokensCost: number;
  reason?: string;
  requiresDeposit?: boolean;
}> {
  
  const chatRef = db.collection('chats').doc(chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    return {
      allowed: false,
      isFree: false,
      tokensCost: 0,
      reason: 'Chat not found'
    };
  }
  
  const chat = chatSnap.data() as Pack285ChatMetadata;
  
  // ====================================================================
  // CASE 1: FULL_FREE mode (low-pop promo)
  // ====================================================================
  if (chat.freeWindow.state === 'FULL_FREE') {
    // Save message, no billing
    await chatRef.update({
      [`freeWindow.used.${senderId}`]: increment(1),
      updatedAt: serverTimestamp()
    });
    
    return {
      allowed: true,
      isFree: true,
      tokensCost: 0
    };
  }
  
  // ====================================================================
  // CASE 2: FREE phase
  // ====================================================================
  if (chat.freeWindow.state === 'FREE') {
    const senderUsed = chat.freeWindow.used[senderId] || 0;
    const senderLimit = chat.freeWindow.perUserLimit[senderId] || 0;
    
    // Check if sender still has free messages
    if (senderUsed < senderLimit) {
      // Message is free
      await chatRef.update({
        [`freeWindow.used.${senderId}`]: increment(1),
        updatedAt: serverTimestamp()
      });
      
      // Check if BOTH users hit their limits
      const newSenderUsed = senderUsed + 1;
      const otherUserId = chat.userA === senderId ? chat.userB : chat.userA;
      const otherUsed = chat.freeWindow.used[otherUserId] || 0;
      const otherLimit = chat.freeWindow.perUserLimit[otherUserId] || 0;
      
      const senderDone = newSenderUsed >= senderLimit;
      const otherDone = otherUsed >= otherLimit;
      
      if (senderDone && otherDone) {
        // Both users exhausted their free messages - switch to PAID
        await chatRef.update({
          'freeWindow.state': 'PAID',
          updatedAt: serverTimestamp()
        });
      }
      
      return {
        allowed: true,
        isFree: true,
        tokensCost: 0
      };
    } else {
      // Sender exhausted free messages, but other user hasn't
      // Transition to paid for this sender
      return {
        allowed: false,
        isFree: false,
        tokensCost: 0,
        reason: 'Free messages exhausted. Waiting for other user to use their free messages.',
        requiresDeposit: false
      };
    }
  }
  
  // ====================================================================
  // CASE 3: PAID phase
  // ====================================================================
  if (chat.freeWindow.state === 'PAID') {
    // Check if sender is the payer
    if (senderId !== chat.payerId) {
      // Non-payer (earner) sending - message is free for them
      await chatRef.update({
        updatedAt: serverTimestamp()
      });
      
      return {
        allowed: true,
        isFree: true,
        tokensCost: 0
      };
    }
    
    // Payer sending - need to check prepaid bucket
    // This requires integration with PACK 273's prepaid bucket system
    // For now, return requirement for deposit
    return {
      allowed: false,
      isFree: false,
      tokensCost: 0,
      reason: 'Prepaid deposit required',
      requiresDeposit: true
    };
  }
  
  return {
    allowed: false,
    isFree: false,
    tokensCost: 0,
    reason: 'Invalid chat state'
  };
}

// ============================================================================
// FUNCTION: Process Token Routing (STANDARD vs EARN_OFF_AVALO_100)
// ============================================================================

/**
 * Route tokens based on free window mode.
 * Implements special logic for EARN_OFF_AVALO_100.
 */
export async function routePack285Tokens(
  chatId: string,
  grossTokens: number,
  earningProfileId: string | null,
  mode: FreeWindowMode
): Promise<{
  creatorShare: number;
  platformShare: number;
  earningProfileId: string | null;
}> {
  
  // ====================================================================
  // STANDARD mode: Normal 65/35 split
  // ====================================================================
  if (mode === 'STANDARD') {
    if (earningProfileId) {
      const creatorShare = Math.floor(grossTokens * (AVALO_SPLIT_CHAT_CREATOR / 100));
      const platformShare = grossTokens - creatorShare;
      
      return {
        creatorShare,
        platformShare,
        earningProfileId
      };
    }
  }
  
  // ====================================================================
  // EARN_OFF_AVALO_100 mode: 100% to Avalo, 0 to profile
  // ====================================================================
  if (mode === 'EARN_OFF_AVALO_100') {
    return {
      creatorShare: 0,
      platformShare: grossTokens,  // 100% to Avalo
      earningProfileId: null
    };
  }
  
  // ====================================================================
  // LOW_POP_FREE mode: Should never reach here (no billing)
  // ====================================================================
  if (mode === 'LOW_POP_FREE') {
    return {
      creatorShare: 0,
      platformShare: 0,
      earningProfileId: null
    };
  }
  
  // Default: platform gets all
  return {
    creatorShare: 0,
    platformShare: grossTokens,
    earningProfileId: null
  };
}

// ============================================================================
// FUNCTION: Check Low-Popularity Promo Eligibility
// ============================================================================

/**
 * Determine if a user is eligible for low-popularity promo free chats.
 * 
 * Eligibility criteria:
 * - Low swipeRightRate (as defined in PACK 267)
 * - Few matches per day/week
 * - Few active chats per week
 * - Not exceeded daily/regional promo limits
 */
export async function isLowPopularityPromoEligible(
  userId: string
): Promise<boolean> {
  
  // Load user profile and stats
  const userSnap = await db.collection('users').doc(userId).get();
  
  if (!userSnap.exists) {
    return false;
  }
  
  const user = userSnap.data() as any;
  const stats = user.stats || {};
  
  // ====================================================================
  // Check popularity metrics (from PACK 267 thresholds)
  // ====================================================================
  const swipeStats = stats.swipes || {};
  const swipeRightRate = swipeStats.right / (swipeStats.total || 1);
  const matchesPerDay = stats.matchesPerDay || 0;
  const activeChatsPerWeek = stats.activeChatsPerWeek || 0;
  
  const LOW_POPULARITY_THRESHOLD = {
    swipeRightRate: 0.05,      // 5% or less
    matchesPerDay: 1,
    activeChatsPerWeek: 2
  };
  
  const isLowPopularity = 
    swipeRightRate <= LOW_POPULARITY_THRESHOLD.swipeRightRate ||
    matchesPerDay <= LOW_POPULARITY_THRESHOLD.matchesPerDay ||
    activeChatsPerWeek <= LOW_POPULARITY_THRESHOLD.activeChatsPerWeek;
  
  if (!isLowPopularity) {
    return false;
  }
  
  // ====================================================================
  // Check promo pool limits
  // ====================================================================
  const promoConfig: LowPopularityPromoConfig = {
    enabled: true,
    maxPromoPerDay: 100,        // Max 100 free promos per day per region
    maxPromoPerRegion: 1000     // Max 1000 simultaneous free chats per region
  };
  
  if (!promoConfig.enabled) {
    return false;
  }
  
  // Check daily limit
  const today = new Date().toISOString().split('T')[0];
  const userRegion = user.location?.region || 'default';
  
  const dailyPromoKey = `${userRegion}_${today}`;
  const dailyPromoRef = db.collection('promo_limits').doc(dailyPromoKey);
  const dailyPromoSnap = await dailyPromoRef.get();
  const dailyPromoCount = dailyPromoSnap.exists ? (dailyPromoSnap.data()?.count || 0) : 0;
  
  if (dailyPromoCount >= promoConfig.maxPromoPerDay) {
    return false;
  }
  
  // Check regional limit
  const regionalPromoRef = db.collection('promo_limits').doc(`region_${userRegion}`);
  const regionalPromoSnap = await regionalPromoRef.get();
  const regionalPromoCount = regionalPromoSnap.exists ? (regionalPromoSnap.data()?.count || 0) : 0;
  
  if (regionalPromoCount >= promoConfig.maxPromoPerRegion) {
    return false;
  }
  
  // User is eligible - increment counters
  await db.runTransaction(async (transaction) => {
    transaction.set(dailyPromoRef, {
      count: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    transaction.set(regionalPromoRef, {
      count: increment(1),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
  
  return true;
}

// ============================================================================
// FUNCTION: Get Free Window Status
// ============================================================================

/**
 * Get current free window status for display in UI.
 */
export async function getPack285FreeWindowStatus(
  chatId: string,
  userId: string
): Promise<{
  mode: FreeWindowMode;
  state: FreeWindowState;
  myFreeRemaining: number;
  theirFreeRemaining: number;
  myFreeLimit: number;
  theirFreeLimit: number;
}> {
  
  const chatSnap = await db.collection('chats').doc(chatId).get();
  
  if (!chatSnap.exists) {
    throw new Error('Chat not found');
  }
  
  const chat = chatSnap.data() as Pack285ChatMetadata;
  const otherUserId = chat.userA === userId ? chat.userB : chat.userA;
  
  const myUsed = chat.freeWindow.used[userId] || 0;
  const myLimit = chat.freeWindow.perUserLimit[userId] || 0;
  const myRemaining = Math.max(0, myLimit - myUsed);
  
  const theirUsed = chat.freeWindow.used[otherUserId] || 0;
  const theirLimit = chat.freeWindow.perUserLimit[otherUserId] || 0;
  const theirRemaining = Math.max(0, theirLimit - theirUsed);
  
  return {
    mode: chat.freeWindow.mode,
    state: chat.freeWindow.state,
    myFreeRemaining: myRemaining,
    theirFreeRemaining: theirRemaining,
    myFreeLimit: myLimit,
    theirFreeLimit: theirLimit
  };
}

// ============================================================================
// HELPER: Word Count
// ============================================================================

/**
 * Count billable words in a message.
 */
export function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  
  // Remove URLs
  let cleaned = text.replace(/https?:\/\/[^\s]+/gi, '');
  
  // Remove emojis (basic)
  cleaned = cleaned.replace(/[\uD800-\uDFFF]/g, '');
  
  // Split and count
  const words = cleaned.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}
