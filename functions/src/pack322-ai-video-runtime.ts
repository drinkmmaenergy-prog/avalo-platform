/**
 * PACK 322 — AI Video Session Runtime + Per-Minute Billing
 * Real-time AI companion video sessions with per-minute token billing
 * 
 * Features:
 * - Per-minute billing: 20 / 14 / 10 tokens per minute (Standard / VIP / Royal)
 * - Correct revenue splits: 65/35 for user-owned AI, 100% for Avalo AI
 * - Safety enforcement (age, verification, blocking)
 * - Automatic billing tick system
 * - Integration with PACK 277/321 wallet
 */

import { https } from 'firebase-functions';
import { db, serverTimestamp, increment, generateId } from './init';
import { spendTokens } from './pack277-wallet-service';
import { getAiVideoPricePerMinuteTokens, AiVideoTier } from './pack322-ai-video-pricing';

// ============================================================================
// TYPES
// ============================================================================

interface AiVideoCallSession {
  sessionId: string;
  userId: string;
  companionId: string;
  ownerUserId: string | null;
  isAvaloAI: boolean;
  tier: AiVideoTier;
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
  tier?: AiVideoTier;
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
async function getUserTier(userId: string): Promise<AiVideoTier> {
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
 * Load video session
 */
async function loadSession(sessionId: string): Promise<AiVideoCallSession | null> {
  const sessionDoc = await db.collection('aiVideoCallSessions').doc(sessionId).get();
  if (!sessionDoc.exists) return null;
  
  return sessionDoc.data() as AiVideoCallSession;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Start AI video session
 */
export const pack322_aiVideoStartSession = https.onCall(
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
        error: 'You must be 18 or older to use AI video',
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
    const pricePerMinute = getAiVideoPricePerMinuteTokens(tier);
    
    // ========================================================================
    // 5. CREATE SESSION
    // ========================================================================
    
    const sessionId = generateId();
    const now = new Date().toISOString();
    
    const session: AiVideoCallSession = {
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
      contextRef: `aiVideo:${sessionId}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    await db.collection('aiVideoCallSessions').doc(sessionId).set(session);
    
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
  
  const pricePerMinute = getAiVideoPricePerMinuteTokens(session.tier);
  const tokensToCharge = minutesToBill * pricePerMinute;
  
  // ========================================================================
  // 4. DETERMINE WALLET CONTEXT
  // ========================================================================
  
  let contextType: 'AI_SESSION' | 'AVALO_ONLY_VIDEO';
  let creatorId: string | undefined = undefined;
  
  if (!session.isAvaloAI && session.ownerUserId) {
    // User-owned AI: creator earns 65%
    contextType = 'AI_SESSION';
    creatorId = session.ownerUserId;
  } else {
    // Avalo AI: 100% Avalo via AVALO_ONLY_VIDEO
    contextType = 'AVALO_ONLY_VIDEO';
  }
  
  // ========================================================================
  // 5. CHARGE TOKENS
  // ========================================================================
  
  try {
    const spendResult = await spendTokens({
      userId: session.userId,
      amountTokens: tokensToCharge,
      source: 'CALL', // Use CALL source for video sessions
      relatedId: sessionId,
      creatorId,
      contextType,
      contextRef: session.contextRef,
      metadata: {
        sessionId,
        companionId: session.companionId,
        isAvaloAI: session.isAvaloAI,
        minutesBilled: minutesToBill,
        tier: session.tier,
        pricePerMinute,
        sessionType: 'ai_video',
      },
    });
    
    if (!spendResult.success) {
      // Insufficient balance - end session
      await db.collection('aiVideoCallSessions').doc(sessionId).update({
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
    
    await db.collection('aiVideoCallSessions').doc(sessionId).update({
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
export const pack322_aiVideoTickBilling = https.onCall(
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
 * End AI video session
 */
export const pack322_aiVideoEndSession = https.onCall(
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
    
    await db.collection('aiVideoCallSessions').doc(sessionId).update({
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
  pack322_aiVideoStartSession,
  pack322_aiVideoTickBilling,
  pack322_aiVideoEndSession,
};