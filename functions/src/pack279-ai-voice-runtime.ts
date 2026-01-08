/**
 * PACK 279B — AI Voice Session Runtime + Minute Billing
 * Real-time AI companion voice sessions with per-minute token billing
 * 
 * Features:
 * - Per-minute billing: 10 / 7 / 5 tokens per minute (Standard / VIP / Royal)
 * - Correct revenue splits: 65/35 for user-owned AI, 100% for Avalo AI
 * - Safety enforcement (age, verification, blocking)
 * - Automatic billing tick system
 * - Integration with PACK 277/321 wallet
 */

import { https } from 'firebase-functions';
import { db, serverTimestamp, increment, generateId } from './init';
import { spendTokens } from './pack277-wallet-service';
import { getAiVoicePricePerMinuteTokens, AiVoiceTier } from './pack279-ai-voice-pricing';

// ============================================================================
// TYPES
// ============================================================================

interface AiVoiceCallSession {
  sessionId: string;
  userId: string;
  companionId: string;
  ownerUserId: string | null;
  isAvaloAI: boolean;
  tier: AiVoiceTier;
  status: "PENDING" | "ACTIVE" | "ENDED" | "CANCELLED";
  startedAt: string | null;
  endedAt: string | null;
  billedMinutes: number;
  totalTokensCharged: number;
  contextRef: string;
  createdAt: any;
  updatedAt: any;
}

interface StartSessionRequest {
  userId: string;
  companionId: string;
}

interface StartSessionResponse {
  success: boolean;
  sessionId?: string;
  pricePerMinuteTokens?: number;
  tier?: AiVoiceTier;
  error?: string;
  errorCode?: string;
}

interface TickBillingRequest {
  sessionId: string;
}

interface TickBillingResponse {
  success: boolean;
  minutesBilled?: number;
  tokensCharged?: number;
  billedMinutes?: number;
  error?: string;
  errorCode?: string;
}

interface EndSessionRequest {
  sessionId: string;
  userId: string;
}

interface EndSessionResponse {
  success: boolean;
  totalMinutes?: number;
  totalTokens?: number;
  error?: string;
  errorCode?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_AGE = 18;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get user age
 */
async function getUserAge(userId: string): Promise<number | null> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return null;
  
  const userData = userDoc.data();
  const birthDate = userData?.birthDate;
  
  if (!birthDate) return null;
  
  const age = Math.floor((Date.now() - birthDate.toDate().getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return age;
}

/**
 * Check if user is verified
 */
async function isUserVerified(userId: string): Promise<boolean> {
  const verificationDoc = await db.collection('verifications').doc(userId).get();
  if (!verificationDoc.exists) return false;
  
  const verificationData = verificationDoc.data();
  return verificationData?.status === 'VERIFIED';
}

/**
 * Check if user is banned or restricted
 */
async function isUserBanned(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;
  
  const userData = userDoc.data();
  return userData?.banned === true || userData?.status === 'BANNED';
}

/**
 * Check if wallet is in review-only mode
 */
async function isWalletReviewOnly(userId: string): Promise<boolean> {
  const walletDoc = await db.collection('wallets').doc(userId).get();
  if (!walletDoc.exists) return false;
  
  const walletData = walletDoc.data();
  return walletData?.reviewOnlyMode === true;
}

/**
 * Resolve user subscription tier
 */
async function getUserTier(userId: string): Promise<AiVoiceTier> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return "STANDARD";
  
  const userData = userDoc.data();
  
  // Check Royal Club membership
  if (userData?.royalClubTier !== undefined || userData?.roles?.royal === true) {
    return "ROYAL";
  }
  
  // Check VIP subscription
  const subscriptionDoc = await db.collection('subscriptions').doc(userId).get();
  if (subscriptionDoc.exists) {
    const subscriptionData = subscriptionDoc.data();
    if (subscriptionData?.status === 'ACTIVE' && subscriptionData?.tier === 'VIP') {
      return "VIP";
    }
  }
  
  return "STANDARD";
}

/**
 * Load AI companion details
 */
async function loadCompanion(companionId: string) {
  const companionDoc = await db.collection('aiCompanions').doc(companionId).get();
  if (!companionDoc.exists) return null;
  
  return companionDoc.data();
}

/**
 * Load voice session
 */
async function loadSession(sessionId: string): Promise<AiVoiceCallSession | null> {
  const sessionDoc = await db.collection('aiVoiceCallSessions').doc(sessionId).get();
  if (!sessionDoc.exists) return null;
  
  return sessionDoc.data() as AiVoiceCallSession;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Start AI voice session
 */
export const pack279_aiVoiceStartSession = https.onCall(
  async (request): Promise<StartSessionResponse> => {
    
    const { userId, companionId } = request.data as StartSessionRequest;
    const auth = request.auth;
    
    // ========================================================================
    // 1. AUTHENTICATION
    // ========================================================================
    
    if (!auth || auth.uid !== userId) {
      return {
        success: false,
        error: 'Unauthorized',
        errorCode: 'UNAUTHORIZED',
      };
    }
    
    if (!companionId) {
      return {
        success: false,
        error: 'Missing companion ID',
        errorCode: 'INVALID_REQUEST',
      };
    }
    
    // ========================================================================
    // 2. SAFETY ENFORCEMENT
    // ========================================================================
    
    // Check age
    const userAge = await getUserAge(userId);
    if (userAge === null || userAge < MIN_AGE) {
      return {
        success: false,
        error: 'You must be 18 or older to use AI voice',
        errorCode: 'AGE_RESTRICTED',
      };
    }
    
    // Check verification
    const isVerified = await isUserVerified(userId);
    if (!isVerified) {
      return {
        success: false,
        error: 'Account verification required',
        errorCode: 'VERIFICATION_REQUIRED',
      };
    }
    
    // Check if banned
    const isBanned = await isUserBanned(userId);
    if (isBanned) {
      return {
        success: false,
        error: 'Account is banned',
        errorCode: 'ACCOUNT_BANNED',
      };
    }
    
    // Check wallet review mode
    const isReviewOnly = await isWalletReviewOnly(userId);
    if (isReviewOnly) {
      return {
        success: false,
        error: 'Wallet is in review mode',
        errorCode: 'WALLET_REVIEW_MODE',
      };
    }
    
    // ========================================================================
    // 3. LOAD COMPANION
    // ========================================================================
    
    const companion = await loadCompanion(companionId);
    if (!companion) {
      return {
        success: false,
        error: 'AI companion not found',
        errorCode: 'COMPANION_NOT_FOUND',
      };
    }
    
    // ========================================================================
    // 4. RESOLVE USER TIER
    // ========================================================================
    
    const tier = await getUserTier(userId);
    const pricePerMinute = getAiVoicePricePerMinuteTokens(tier);
    
    // ========================================================================
    // 5. CREATE SESSION
    // ========================================================================
    
    const sessionId = generateId();
    const now = new Date().toISOString();
    
    const session: AiVoiceCallSession = {
      sessionId,
      userId,
      companionId,
      ownerUserId: companion.ownerUserId || null,
      isAvaloAI: companion.isAvaloAI || false,
      tier,
      status: "ACTIVE",
      startedAt: now,
      endedAt: null,
      billedMinutes: 0,
      totalTokensCharged: 0,
      contextRef: `aiVoice:${sessionId}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await db.collection('aiVoiceCallSessions').doc(sessionId).set(session);
    
    return {
      success: true,
      sessionId,
      pricePerMinuteTokens: pricePerMinute,
      tier,
    };
  }
);

/**
 * Internal billing logic - can be called from anywhere
 */
async function processTickBilling(sessionId: string): Promise<TickBillingResponse> {
  // ========================================================================
  // 1. LOAD SESSION
  // ========================================================================
  
  const session = await loadSession(sessionId);
  if (!session) {
    return {
      success: false,
      error: 'Session not found',
      errorCode: 'SESSION_NOT_FOUND',
    };
  }
  
  if (session.status !== "ACTIVE") {
    return {
      success: true,
      minutesBilled: 0,
      tokensCharged: 0,
      billedMinutes: session.billedMinutes,
    };
  }
  
  // ========================================================================
  // 2. CALCULATE MINUTES TO BILL
  // ========================================================================
  
  if (!session.startedAt) {
    return {
      success: false,
      error: 'Session has no start time',
      errorCode: 'INVALID_SESSION',
    };
  }
  
  const startTime = new Date(session.startedAt).getTime();
  const now = Date.now();
  const totalMinutesElapsed = Math.floor((now - startTime) / 60000);
  const minutesToBill = totalMinutesElapsed - session.billedMinutes;
  
  if (minutesToBill <= 0) {
    return {
      success: true,
      minutesBilled: 0,
      tokensCharged: 0,
      billedMinutes: session.billedMinutes,
    };
  }
  
  // ========================================================================
  // 3. CALCULATE TOKENS
  // ========================================================================
  
  const pricePerMinute = getAiVoicePricePerMinuteTokens(session.tier);
  const tokensToCharge = minutesToBill * pricePerMinute;
  
  // ========================================================================
  // 4. DETERMINE WALLET CONTEXT
  // ========================================================================
  
  let earnerUserId: string | undefined = undefined;
  
  if (!session.isAvaloAI && session.ownerUserId) {
    // User-owned AI: creator earns 65%
    earnerUserId = session.ownerUserId;
  }
  // For Avalo AI: earnerUserId stays undefined (100% Avalo)
  
  // ========================================================================
  // 5. CHARGE TOKENS
  // ========================================================================
  
  try {
    const spendResult = await spendTokens({
      userId: session.userId,
      amountTokens: tokensToCharge,
      source: 'CALL', // Use CALL source for voice sessions
      relatedId: sessionId,
      creatorId: earnerUserId,
      metadata: {
        sessionId,
        companionId: session.companionId,
        isAvaloAI: session.isAvaloAI,
        minutesBilled: minutesToBill,
        tier: session.tier,
        pricePerMinute,
        contextRef: session.contextRef,
      },
    });
    
    if (!spendResult.success) {
      // Insufficient balance - end session
      await db.collection('aiVoiceCallSessions').doc(sessionId).update({
        status: "ENDED",
        endedAt: new Date().toISOString(),
        endReason: 'INSUFFICIENT_TOKENS',
        updatedAt: serverTimestamp(),
      });
      
      return {
        success: false,
        error: 'Insufficient tokens - session ended',
        errorCode: 'INSUFFICIENT_TOKENS',
      };
    }
    
    // ========================================================================
    // 6. UPDATE SESSION
    // ========================================================================
    
    await db.collection('aiVoiceCallSessions').doc(sessionId).update({
      billedMinutes: increment(minutesToBill),
      totalTokensCharged: increment(tokensToCharge),
      updatedAt: serverTimestamp(),
    });
    
    return {
      success: true,
      minutesBilled: minutesToBill,
      tokensCharged: tokensToCharge,
      billedMinutes: session.billedMinutes + minutesToBill,
    };
    
  } catch (error: any) {
    console.error('Tick billing error:', error);
    return {
      success: false,
      error: error.message || 'Failed to bill session',
      errorCode: 'BILLING_ERROR',
    };
  }
}

/**
 * Tick billing - called every minute to bill active session
 */
export const pack279_aiVoiceTickBilling = https.onCall(
  async (request): Promise<TickBillingResponse> => {
    
    const { sessionId } = request.data as TickBillingRequest;
    
    if (!sessionId) {
      return {
        success: false,
        error: 'Missing session ID',
        errorCode: 'INVALID_REQUEST',
      };
    }
    
    return processTickBilling(sessionId);
  }
);

/**
 * End AI voice session
 */
export const pack279_aiVoiceEndSession = https.onCall(
  async (request): Promise<EndSessionResponse> => {
    
    const { sessionId, userId } = request.data as EndSessionRequest;
    const auth = request.auth;
    
    // ========================================================================
    // 1. AUTHENTICATION
    // ========================================================================
    
    if (!auth || auth.uid !== userId) {
      return {
        success: false,
        error: 'Unauthorized',
        errorCode: 'UNAUTHORIZED',
      };
    }
    
    if (!sessionId) {
      return {
        success: false,
        error: 'Missing session ID',
        errorCode: 'INVALID_REQUEST',
      };
    }
    
    // ========================================================================
    // 2. LOAD SESSION
    // ========================================================================
    
    const session = await loadSession(sessionId);
    if (!session) {
      return {
        success: false,
        error: 'Session not found',
        errorCode: 'SESSION_NOT_FOUND',
      };
    }
    
    if (session.userId !== userId) {
      return {
        success: false,
        error: 'Session does not belong to user',
        errorCode: 'UNAUTHORIZED',
      };
    }
    
    if (session.status === "ENDED" || session.status === "CANCELLED") {
      return {
        success: true,
        totalMinutes: session.billedMinutes,
        totalTokens: session.totalTokensCharged,
      };
    }
    
    // ========================================================================
    // 3. FINAL BILLING TICK
    // ========================================================================
    
    // Bill any remaining full minutes before ending
    try {
      // Call internal billing logic directly
      await processTickBilling(sessionId);
    } catch (error) {
      console.error('Final billing tick error (non-blocking):', error);
    }
    
    // Reload session to get updated billing
    const updatedSession = await loadSession(sessionId);
    const finalMinutes = updatedSession?.billedMinutes || session.billedMinutes;
    const finalTokens = updatedSession?.totalTokensCharged || session.totalTokensCharged;
    
    // ========================================================================
    // 4. END SESSION
    // ========================================================================
    
    await db.collection('aiVoiceCallSessions').doc(sessionId).update({
      status: "ENDED",
      endedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
    
    return {
      success: true,
      totalMinutes: finalMinutes,
      totalTokens: finalTokens,
    };
  }
);

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  pack279_aiVoiceStartSession,
  pack279_aiVoiceTickBilling,
  pack279_aiVoiceEndSession,
};