/**
 * PACK 273 — Full Chat Logic System
 * 
 * Complete Avalo chat engine with:
 * - Payment rules (heterosexual, same-gender, nonbinary, influencer)
 * - Free message limits (10/6 messages)
 * - Prepaid bucket system with word-based billing
 * - Token refunds for unused words
 * - Expiration rules (48h/72h)
 * - Media support (photos, voice, video)
 * - Copy/paste abuse prevention
 * - Safety & mismatch selfie logic
 * 
 * This REPLACES all previous chat logic packs.
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { UserProfile } from './types.js';

// Simple error class for compatibility
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// Simple logger
const logger = {
  info: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
};

// ============================================================================
// TYPES
// ============================================================================

export type ChatMode = 'FREE_LP' | 'PAID';  // Low-Popularity Free or Paid
export type ChatState = 
  | 'FREE_ACTIVE'           // Free messages phase
  | 'AWAITING_PREPAID'      // Waiting for prepaid deposit
  | 'PAID_ACTIVE'           // Active with prepaid bucket
  | 'EXPIRED'               // Chat expired
  | 'CLOSED';               // Chat manually closed

export type ProfilePopularity = 'low' | 'normal' | 'royal';
export type MediaType = 'text' | 'photo' | 'voice' | 'video';

export interface Pack273ChatRoles {
  payerId: string;
  earnerId: string | null;  // null means Avalo is the earner
  wordsPerToken: number;    // 11 for standard, 7 for Royal
  mode: ChatMode;
  freeMessageLimit: number; // 10 for low-pop, 6 for Royal, 0 for paid
  price: number;            // Base price: 100-500 tokens
  avaloSplit: number;       // 35% platform share
  earnerSplit: number;      // 65% earner share
}

export interface Pack273ChatParticipant {
  userId: string;
  gender: 'male' | 'female' | 'nonbinary';
  earnMode: boolean;        // Earn Mode ON/OFF
  influencerBadge: boolean;
  isRoyalMember: boolean;
  popularity: ProfilePopularity;
  priceModeration?: {       // For women with unlocked price moderation
    enabled: boolean;
    customPrice?: number;   // 100-500 tokens
  };
}

export interface Pack273PrepaidBucket {
  totalTokens: number;      // Total prepaid
  remainingTokens: number;  // Unused tokens
  wordsPerToken: number;    // Conversion rate
  remainingWords: number;   // Unused words
  usedWords: number;        // Words consumed
}

export interface Pack273ChatSession {
  chatId: string;
  participants: string[];
  roles: Pack273ChatRoles;
  mode: ChatMode;
  state: ChatState;
  freeMessagesUsed: {
    [userId: string]: number;
  };
  freeMessageLimit: number;
  prepaidBucket?: Pack273PrepaidBucket;
  messageCount: number;
  createdAt: any;
  lastActivityAt: any;
  firstPaidMessageAt?: any;
  expiresAt?: any;
  closedAt?: any;
  closedBy?: string;
  refundAmount?: number;
}

export interface Pack273MessageData {
  messageId: string;
  senderId: string;
  receiverId: string;
  type: MediaType;
  text?: string;
  mediaUrl?: string;
  wordCount?: number;
  tokensCost: number;
  timestamp: any;
  blurred?: boolean;        // For NSFW content
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WORDS_PER_TOKEN_STANDARD = 11;
const WORDS_PER_TOKEN_ROYAL = 7;
const FREE_MESSAGES_LOW_POP = 10;     // 20 total exchange
const FREE_MESSAGES_ROYAL = 6;         // 12 total exchange
const BASE_CHAT_PRICE = 100;
const MAX_CHAT_PRICE = 500;
const AVALO_REVENUE_PERCENT = 35;
const EARNER_REVENUE_PERCENT = 65;
const INACTIVITY_TIMEOUT_48H = 48 * 60 * 60 * 1000;
const TOTAL_INACTIVITY_TIMEOUT_72H = 72 * 60 * 60 * 1000;
const COPY_PASTE_WINDOW_MS = 60 * 1000;  // 60 seconds

// ============================================================================
// CORE FUNCTION: Determine Chat Roles
// ============================================================================

/**
 * Determines who pays, who earns, and pricing based on PACK 273 rules.
 * 
 * Priority Order:
 * 1. Male Influencer Exception (NEW)
 * 2. Heterosexual Rule (Male ALWAYS pays)
 * 3. Same-gender/Nonbinary Rules
 * 4. Low-Popularity Free Chats
 */
export async function determinePack273ChatRoles(
  participantA: Pack273ChatParticipant,
  participantB: Pack273ChatParticipant,
  initiatorId: string
): Promise<Pack273ChatRoles> {
  
  const initiator = participantA.userId === initiatorId ? participantA : participantB;
  const receiver = participantA.userId === initiatorId ? participantB : participantA;

  // ====================================================================
  // RULE 1B: MALE INFLUENCER EXCEPTION
  // ====================================================================
  // Male can earn ONLY if ALL conditions match:
  // - Male has Influencer Badge
  // - Female initiates the chat (female sends first message)
  // - Female has Earn OFF
  
  if (initiator.gender === 'female' && receiver.gender === 'male') {
    if (receiver.influencerBadge && !initiator.earnMode) {
      // Male becomes the earner
      return {
        payerId: initiator.userId,
        earnerId: receiver.userId,
        wordsPerToken: receiver.isRoyalMember ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD,
        mode: 'PAID',
        freeMessageLimit: receiver.isRoyalMember ? FREE_MESSAGES_ROYAL : FREE_MESSAGES_LOW_POP,
        price: BASE_CHAT_PRICE,
        avaloSplit: AVALO_REVENUE_PERCENT,
        earnerSplit: EARNER_REVENUE_PERCENT
      };
    }
  }

  // ====================================================================
  // RULE 1A: HETEROSEXUAL INTERACTIONS - MALE ALWAYS PAYS
  // ====================================================================
  
  const isHeterosexual = 
    (participantA.gender === 'male' && participantB.gender === 'female') ||
    (participantA.gender === 'female' && participantB.gender === 'male');
  
  if (isHeterosexual) {
    const male = participantA.gender === 'male' ? participantA : participantB;
    const female = participantA.gender === 'male' ? participantB : participantA;
    
    // Check if female has price moderation unlocked
    const price = female.priceModeration?.enabled && female.priceModeration.customPrice
      ? Math.min(Math.max(female.priceModeration.customPrice, BASE_CHAT_PRICE), MAX_CHAT_PRICE)
      : BASE_CHAT_PRICE;
    
    // Check free message limit based on female's status
    const freeMessageLimit = female.isRoyalMember ? FREE_MESSAGES_ROYAL : FREE_MESSAGES_LOW_POP;
    
    // Female has Earn Mode ON → she earns
    if (female.earnMode) {
      return {
        payerId: male.userId,
        earnerId: female.userId,
        wordsPerToken: female.isRoyalMember ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD,
        mode: 'PAID',
        freeMessageLimit,
        price,
        avaloSplit: AVALO_REVENUE_PERCENT,
        earnerSplit: EARNER_REVENUE_PERCENT
      };
    }
    
    // Female has Earn Mode OFF → Avalo earns
    return {
      payerId: male.userId,
      earnerId: null,  // Avalo earns
      wordsPerToken: WORDS_PER_TOKEN_STANDARD,
      mode: 'PAID',
      freeMessageLimit,
      price,
      avaloSplit: 100,  // Avalo gets 100% when female has Earn OFF
      earnerSplit: 0
    };
  }

  // ====================================================================
  // RULE 1C: SAME-GENDER OR NONBINARY INTERACTIONS
  // ====================================================================
  
  // Check for low-popularity free chat (Earn OFF + low popularity)
  if (!initiator.earnMode && initiator.popularity === 'low') {
    return {
      payerId: receiver.userId,
      earnerId: null,  // Free chat - Avalo earns nothing
      wordsPerToken: WORDS_PER_TOKEN_STANDARD,
      mode: 'FREE_LP',
      freeMessageLimit: Infinity,  // 100% free until popularity increases
      price: 0,
      avaloSplit: 0,
      earnerSplit: 0
    };
  }
  
  if (!receiver.earnMode && receiver.popularity === 'low') {
    return {
      payerId: initiator.userId,
      earnerId: null,  // Free chat - Avalo earns nothing
      wordsPerToken: WORDS_PER_TOKEN_STANDARD,
      mode: 'FREE_LP',
      freeMessageLimit: Infinity,  // 100% free until popularity increases
      price: 0,
      avaloSplit: 0,
      earnerSplit: 0
    };
  }
  
  // The person with Earn Mode ON earns
  if (participantA.earnMode && !participantB.earnMode) {
    return {
      payerId: participantB.userId,
      earnerId: participantA.userId,
      wordsPerToken: participantA.isRoyalMember ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD,
      mode: 'PAID',
      freeMessageLimit: participantA.isRoyalMember ? FREE_MESSAGES_ROYAL : FREE_MESSAGES_LOW_POP,
      price: BASE_CHAT_PRICE,
      avaloSplit: AVALO_REVENUE_PERCENT,
      earnerSplit: EARNER_REVENUE_PERCENT
    };
  }
  
  if (participantB.earnMode && !participantA.earnMode) {
    return {
      payerId: participantA.userId,
      earnerId: participantB.userId,
      wordsPerToken: participantB.isRoyalMember ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD,
      mode: 'PAID',
      freeMessageLimit: participantB.isRoyalMember ? FREE_MESSAGES_ROYAL : FREE_MESSAGES_LOW_POP,
      price: BASE_CHAT_PRICE,
      avaloSplit: AVALO_REVENUE_PERCENT,
      earnerSplit: EARNER_REVENUE_PERCENT
    };
  }
  
  // Both Earn ON → initiator pays, receiver earns
  if (participantA.earnMode && participantB.earnMode) {
    return {
      payerId: initiator.userId,
      earnerId: receiver.userId,
      wordsPerToken: receiver.isRoyalMember ? WORDS_PER_TOKEN_ROYAL : WORDS_PER_TOKEN_STANDARD,
      mode: 'PAID',
      freeMessageLimit: receiver.isRoyalMember ? FREE_MESSAGES_ROYAL : FREE_MESSAGES_LOW_POP,
      price: BASE_CHAT_PRICE,
      avaloSplit: AVALO_REVENUE_PERCENT,
      earnerSplit: EARNER_REVENUE_PERCENT
    };
  }
  
  // Both Earn OFF → check low-popularity, then initiator pays
  // If both have Earn OFF after free messages, paid by initiator
  const freeMessageLimit = initiator.isRoyalMember ? FREE_MESSAGES_ROYAL : FREE_MESSAGES_LOW_POP;
  
  return {
    payerId: initiator.userId,
    earnerId: null,  // Avalo earns
    wordsPerToken: WORDS_PER_TOKEN_STANDARD,
    mode: 'PAID',
    freeMessageLimit,
    price: BASE_CHAT_PRICE,
    avaloSplit: 100,
    earnerSplit: 0
  };
}

// ============================================================================
// FUNCTION: Initialize Chat
// ============================================================================

/**
 * Initialize a new chat session with free messages
 */
export async function initializePack273Chat(
  chatId: string,
  roles: Pack273ChatRoles,
  participantIds: string[]
): Promise<void> {
  
  const now = serverTimestamp();
  
  const chatData: any = {
    chatId,
    participants: participantIds,
    roles: {
      payerId: roles.payerId,
      earnerId: roles.earnerId,
      wordsPerToken: roles.wordsPerToken,
      price: roles.price,
      avaloSplit: roles.avaloSplit,
      earnerSplit: roles.earnerSplit
    },
    mode: roles.mode,
    state: 'FREE_ACTIVE',
    freeMessagesUsed: {
      [participantIds[0]]: 0,
      [participantIds[1]]: 0
    },
    freeMessageLimit: roles.freeMessageLimit,
    messageCount: 0,
    createdAt: now,
    lastActivityAt: now,
    updatedAt: now
  };
  
  await db.collection('pack273_chats').doc(chatId).set(chatData);
}

// ============================================================================
// FUNCTION: Process Message
// ============================================================================

/**
 * Process a message send with billing, free message tracking, and abuse prevention
 */
export async function processPack273Message(
  chatId: string,
  senderId: string,
  messageData: {
    type: MediaType;
    text?: string;
    mediaUrl?: string;
  }
): Promise<{ allowed: boolean; reason?: string; tokensCost: number }> {
  
  // STEP 1: Check copy/paste abuse
  if (messageData.type === 'text' && messageData.text) {
    const isAbuse = await checkCopyPasteAbuse(senderId, messageData.text);
    if (isAbuse) {
      return {
        allowed: false,
        reason: 'Copy/paste abuse detected. Please send unique messages.',
        tokensCost: 0
      };
    }
  }
  
  // STEP 2: Load chat session
  const chatRef = db.collection('pack273_chats').doc(chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', 'Chat not found');
  }
  
  const chat = chatSnap.data() as Pack273ChatSession;
  
  // STEP 3: Check if chat is expired or closed
  if (chat.state === 'EXPIRED' || chat.state === 'CLOSED') {
    return {
      allowed: false,
      reason: 'Chat has ended',
      tokensCost: 0
    };
  }
  
  // STEP 4: Check free messages (applies to TEXT only)
  const senderFreeUsed = chat.freeMessagesUsed[senderId] || 0;
  const receiverId = chat.participants.find(p => p !== senderId)!;
  
  if (messageData.type === 'text' && senderFreeUsed < chat.freeMessageLimit) {
    // Still in free message phase
    await chatRef.update({
      [`freeMessagesUsed.${senderId}`]: increment(1),
      messageCount: increment(1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // Record copy/paste tracking
    if (messageData.text) {
      await recordMessageForCopyPaste(senderId, messageData.text);
    }
    
    return { allowed: true, tokensCost: 0 };
  }
  
  // STEP 5: Transition to paid if needed
  const totalFreeUsed = Object.values(chat.freeMessagesUsed).reduce((sum, v) => sum + v, 0);
  const totalFreeLimit = chat.freeMessageLimit * 2;  // Both participants
  
  if (chat.state === 'FREE_ACTIVE' && totalFreeUsed >= totalFreeLimit) {
    if (chat.mode === 'FREE_LP') {
      // Low-popularity chat stays free forever
      await chatRef.update({
        messageCount: increment(1),
        lastActivityAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { allowed: true, tokensCost: 0 };
    }
    
    // Transition to paid mode - require prepaid
    await chatRef.update({
      state: 'AWAITING_PREPAID',
      updatedAt: serverTimestamp()
    });
    
    return {
      allowed: false,
      reason: 'Free messages used. Prepaid deposit required.',
      tokensCost: 0
    };
  }
  
  // STEP 6: Check if prepaid bucket exists
  if (chat.state === 'AWAITING_PREPAID') {
    return {
      allowed: false,
      reason: 'Waiting for prepaid deposit',
      tokensCost: 0
    };
  }
  
  if (!chat.prepaidBucket || chat.state !== 'PAID_ACTIVE') {
    return {
      allowed: false,
      reason: 'No active prepaid bucket',
      tokensCost: 0
    };
  }
  
  // STEP 7: Calculate billing (only bill EARNER's messages)
  if (senderId !== chat.roles.earnerId && chat.roles.earnerId !== null) {
    // Payer sending - no charge
    await chatRef.update({
      messageCount: increment(1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return { allowed: true, tokensCost: 0 };
  }
  
  // STEP 8: Count words (for earner's messages)
  const wordCount = messageData.type === 'text' && messageData.text
    ? countBillableWords(messageData.text)
    : 0;
  
  // Media always counts as equivalent tokens
  const tokensCost = messageData.type === 'text'
    ? Math.ceil(wordCount / chat.prepaidBucket.wordsPerToken)
    : 1;  // Media messages cost 1 token minimum
  
  // STEP 9: Check bucket balance
  if (chat.prepaidBucket.remainingTokens < tokensCost) {
    return {
      allowed: false,
      reason: 'Insufficient prepaid balance',
      tokensCost
    };
  }
  
  // STEP 10: Deduct from bucket and credit earner
  await db.runTransaction(async (transaction) => {
    const chatDoc = await transaction.get(chatRef);
    const currentBucket = chatDoc.data()!.prepaidBucket as Pack273PrepaidBucket;
    
    transaction.update(chatRef, {
      'prepaidBucket.remainingTokens': increment(-tokensCost),
      'prepaidBucket.usedWords': increment(wordCount),
      'prepaidBucket.remainingWords': increment(-wordCount),
      messageCount: increment(1),
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // Credit earner if exists
    if (chat.roles.earnerId) {
      const walletRef = db.collection('users').doc(chat.roles.earnerId)
        .collection('wallet').doc('current');
      
      transaction.update(walletRef, {
        balance: increment(tokensCost),
        earned: increment(tokensCost)
      });
    }
  });
  
  // Record copy/paste tracking
  if (messageData.text) {
    await recordMessageForCopyPaste(senderId, messageData.text);
  }
  
  return { allowed: true, tokensCost };
}

// ============================================================================
// FUNCTION: Process Prepaid Deposit
// ============================================================================

/**
 * Handle prepaid bucket deposit
 */
export async function processPack273Deposit(
  chatId: string,
  payerId: string
): Promise<{ success: boolean; escrowAmount: number; platformFee: number }> {
  
  const chatRef = db.collection('pack273_chats').doc(chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', 'Chat not found');
  }
  
  const chat = chatSnap.data() as Pack273ChatSession;
  
  if (chat.roles.payerId !== payerId) {
    throw new HttpsError('permission-denied', 'Only payer can make deposit');
  }
  
  const depositAmount = chat.roles.price;
  const platformFee = Math.floor(depositAmount * (chat.roles.avaloSplit / 100));
  const escrowAmount = depositAmount - platformFee;
  
  // Check wallet balance
  const walletRef = db.collection('users').doc(payerId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  const wallet = walletSnap.data();
  
  if (!wallet || wallet.balance < depositAmount) {
    throw new HttpsError('failed-precondition', `Insufficient tokens (need ${depositAmount})`);
  }
  
  // Calculate word bucket
  const wordsPerToken = chat.roles.wordsPerToken;
  const totalWords = escrowAmount * wordsPerToken;
  
  await db.runTransaction(async (transaction) => {
    // Deduct from payer
    transaction.update(walletRef, {
      balance: increment(-depositAmount)
    });
    
    // Update chat with prepaid bucket
    transaction.update(chatRef, {
      state: 'PAID_ACTIVE',
      prepaidBucket: {
        totalTokens: escrowAmount,
        remainingTokens: escrowAmount,
        wordsPerToken,
        remainingWords: totalWords,
        usedWords: 0
      },
      deposit: {
        amount: depositAmount,
        platformFee,
        escrowAmount,
        paidAt: serverTimestamp()
      },
      firstPaidMessageAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + INACTIVITY_TIMEOUT_48H),
      updatedAt: serverTimestamp()
    });
    
    // Record platform fee transaction
    const txRef = db.collection('transactions').doc(generateId());
    transaction.set(txRef, {
      userId: payerId,
      type: 'chat_platform_fee',
      amount: -platformFee,
      metadata: { chatId, purpose: 'platform_fee_pack273' },
      createdAt: serverTimestamp()
    });
  });
  
  return { success: true, escrowAmount, platformFee };
}

// ============================================================================
// FUNCTION: Close Chat and Refund
// ============================================================================

/**
 * Close chat and refund unused words
 * PACK 273: Refund = unused words cost, Avalo keeps 35% of used words
 */
export async function closePack273Chat(
  chatId: string,
  closedBy: string,
  reason: 'manual' | 'expiration' | 'mismatch_selfie'
): Promise<{ refundAmount: number }> {
  
  const chatRef = db.collection('pack273_chats').doc(chatId);
  const chatSnap = await chatRef.get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', 'Chat not found');
  }
  
  const chat = chatSnap.data() as Pack273ChatSession;
  
  // Calculate refund
  let refundAmount = 0;
  let avaloForfeit = 0;
  
  if (chat.prepaidBucket) {
    refundAmount = chat.prepaidBucket.remainingTokens;
    
    // Special case: mismatch selfie - Avalo forfeits its 35% share
    if (reason === 'mismatch_selfie') {
      const usedTokens = chat.prepaidBucket.totalTokens - chat.prepaidBucket.remainingTokens;
      const avaloShare = Math.floor(usedTokens * (AVALO_REVENUE_PERCENT / 100));
      refundAmount += avaloShare;  // Return Avalo's share too
      avaloForfeit = avaloShare;
    }
  }
  
  await db.runTransaction(async (transaction) => {
    // Refund to payer
    if (refundAmount > 0) {
      const payerWalletRef = db.collection('users').doc(chat.roles.payerId)
        .collection('wallet').doc('current');
      
      transaction.update(payerWalletRef, {
        balance: increment(refundAmount)
      });
      
      // Record refund transaction
      const txRef = db.collection('transactions').doc(generateId());
      transaction.set(txRef, {
        userId: chat.roles.payerId,
        type: reason === 'mismatch_selfie' ? 'chat_refund_mismatch' : 'chat_refund',
        amount: refundAmount,
        metadata: {
          chatId,
          reason,
          avaloForfeit
        },
        createdAt: serverTimestamp()
      });
    }
    
    // Close chat
    transaction.update(chatRef, {
      state: reason === 'expiration' ? 'EXPIRED' : 'CLOSED',
      closedAt: serverTimestamp(),
      closedBy,
      refundAmount,
      closeReason: reason,
      updatedAt: serverTimestamp()
    });
  });
  
  return { refundAmount };
}

// ============================================================================
// FUNCTION: Auto-Expire Chats
// ============================================================================

/**
 * Auto-expire chats based on PACK 273 rules:
 * - 48h without response after paid phase starts
 * - 72h total inactivity
 */
export async function autoExpirePack273Chats(): Promise<number> {
  
  const now = Date.now();
  const cutoff48h = new Date(now - INACTIVITY_TIMEOUT_48H);
  const cutoff72h = new Date(now - TOTAL_INACTIVITY_TIMEOUT_72H);
  
  // Find chats that expired
  const expiredChats = await db.collection('pack273_chats')
    .where('state', 'in', ['FREE_ACTIVE', 'PAID_ACTIVE', 'AWAITING_PREPAID'])
    .get();
  
  let expiredCount = 0;
  
  for (const chatDoc of expiredChats.docs) {
    const chat = chatDoc.data() as Pack273ChatSession;
    
    const lastActivity = chat.lastActivityAt?.toDate?.() || new Date(0);
    const firstPaid = chat.firstPaidMessageAt?.toDate?.();
    
    let shouldExpire = false;
    
    // Rule 1: 48h without response after paid phase
    if (firstPaid && (now - lastActivity.getTime()) > INACTIVITY_TIMEOUT_48H) {
      shouldExpire = true;
    }
    
    // Rule 2: 72h total inactivity
    if ((now - lastActivity.getTime()) > TOTAL_INACTIVITY_TIMEOUT_72H) {
      shouldExpire = true;
    }
    
    if (shouldExpire) {
      try {
        await closePack273Chat(chatDoc.id, 'system', 'expiration');
        expiredCount++;
      } catch (error) {
        logger.error(`Failed to expire chat ${chatDoc.id}:`, error);
      }
    }
  }
  
  return expiredCount;
}

// ============================================================================
// FUNCTION: Safety - Mismatch Selfie
// ============================================================================

/**
 * Handle selfie mismatch verification
 * PACK 273: 100% refund + Avalo forfeits 35%
 */
export async function handleMismatchSelfie(
  chatId: string,
  reporterId: string,
  suspectUserId: string
): Promise<{ terminated: boolean; refundAmount: number }> {
  
  // Verify mismatch (placeholder - integrate with actual verification service)
  const isMismatch = await verifySelfieMatch(suspectUserId);
  
  if (!isMismatch) {
    return { terminated: false, refundAmount: 0 };
  }
  
  // Terminate chat with full refund
  const result = await closePack273Chat(chatId, 'system', 'mismatch_selfie');
  
  // Flag suspect user
  await db.collection('users').doc(suspectUserId).update({
    'safety.mismatchFlags': increment(1),
    'safety.lastMismatchAt': serverTimestamp(),
    'safety.underReview': true
  });
  
  // Create safety incident
  await db.collection('safety_incidents').doc(generateId()).set({
    type: 'selfie_mismatch',
    chatId,
    reporterId,
    suspectUserId,
    action: 'chat_terminated_full_refund',
    refundAmount: result.refundAmount,
    createdAt: serverTimestamp()
  });
  
  return {
    terminated: true,
    refundAmount: result.refundAmount
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Count billable words (excluding URLs and emojis)
 */
function countBillableWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  
  // Remove URLs
  let cleaned = text.replace(/https?:\/\/[^\s]+/gi, '');
  
  // Remove emojis (basic emoji ranges without unicode flag)
  cleaned = cleaned.replace(/[\uD800-\uDFFF]/g, '');
  
  // Split and count
  const words = cleaned.trim().split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

/**
 * Check copy/paste abuse
 */
async function checkCopyPasteAbuse(
  userId: string,
  text: string
): Promise<boolean> {
  
  const textHash = simpleHash(text);
  const now = Date.now();
  const windowStart = now - COPY_PASTE_WINDOW_MS;
  
  // Check recent messages
  const recentMessages = await db.collection('pack273_copy_paste_tracking')
    .where('userId', '==', userId)
    .where('timestamp', '>', new Date(windowStart))
    .get();
  
  // Count identical messages in window
  let identicalCount = 0;
  for (const doc of recentMessages.docs) {
    if (doc.data().textHash === textHash) {
      identicalCount++;
    }
  }
  
  // Block if 3+ identical messages within 60 seconds
  return identicalCount >= 3;
}

/**
 * Record message for copy/paste tracking
 */
async function recordMessageForCopyPaste(
  userId: string,
  text: string
): Promise<void> {
  
  const textHash = simpleHash(text);
  
  await db.collection('pack273_copy_paste_tracking').add({
    userId,
    textHash,
    timestamp: serverTimestamp(),
    expiresAt: new Date(Date.now() + COPY_PASTE_WINDOW_MS)
  });
}

/**
 * Simple hash function for text comparison
 */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Verify selfie match (placeholder)
 */
async function verifySelfieMatch(userId: string): Promise<boolean> {
  // TODO: Integrate with actual face verification service
  // For now, return false (no mismatch)
  return false;
}

/**
 * Load participant context from database
 */
export async function getPack273ParticipantContext(
  userId: string
): Promise<Pack273ChatParticipant> {
  
  const userSnap = await db.collection('users').doc(userId).get();
  
  if (!userSnap.exists) {
    throw new HttpsError('not-found', `User ${userId} not found`);
  }
  
  const user = userSnap.data() as any;
  
  // Check Royal membership
  let isRoyalMember = false;
  try {
    const royalSnap = await db.collection('royal_memberships').doc(userId).get();
    if (royalSnap.exists) {
      const royalData = royalSnap.data();
      isRoyalMember = royalData?.tier !== 'NONE';
    }
  } catch (error) {
    isRoyalMember = false;
  }
  
  // Determine popularity
  let popularity: ProfilePopularity = 'normal';
  const swipeStats = user.stats?.swipes || {};
  const leftRate = swipeStats.left / (swipeStats.total || 1);
  
  if (leftRate > 0.7 || swipeStats.total < 50) {
    popularity = 'low';
  } else if (isRoyalMember) {
    popularity = 'royal';
  }
  
  return {
    userId: user.uid,
    gender: user.gender === 'male' ? 'male' : 
            user.gender === 'female' ? 'female' : 'nonbinary',
    earnMode: user.modes?.earnFromChat || false,
    influencerBadge: user.badges?.some((b: any) => b.type === 'influencer') || false,
    isRoyalMember,
    popularity,
    priceModeration: user.priceModeration || { enabled: false }
  };
}