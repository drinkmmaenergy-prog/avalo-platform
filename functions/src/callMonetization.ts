/**
 * Call Monetization Logic for Avalo
 * 
 * This module implements voice and video call pricing with specific rules:
 * - In heterosexual M↔F interactions, the man ALWAYS pays (regardless of who initiates)
 * - In all other cases, the call initiator pays
 * - Pricing depends on payer's VIP/Royal status
 * - 80% to earner, 20% to Avalo
 * - Billing per minute (any started minute is billed as full minute)
 * 
 * IMPORTANT: This module reuses the role logic from chatMonetization.ts
 * to maintain consistency across chat and call features.
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import { getUserContext, ChatParticipantContext } from './chatMonetization.js';
// Trust Engine Integration (Phase 8)
import { recordRiskEvent, evaluateUserRisk } from './trustEngine.js';
// Account Lifecycle Integration (Phase 9)
import { isAccountActive } from './accountLifecycle.js';
// PACK 220: Fan & Kiss Economy
import { trackTokenSpend } from './fanKissEconomy.js';

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
  warn: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
};

// ============================================================================
// TYPES
// ============================================================================

export type CallType = 'VOICE' | 'VIDEO';
export type UserStatus = 'STANDARD' | 'VIP' | 'ROYAL';
export type CallState = 'ACTIVE' | 'ENDED';

export interface CallSession {
  callId: string;
  callType: CallType;
  payerId: string;
  earnerId: string | null; // null means Avalo earns
  pricePerMinute: number;
  state: CallState;
  startedAt: any; // Timestamp
  endedAt?: any; // Timestamp
  durationMinutes?: number;
  totalTokens?: number;
  lastActivityAt: any; // Timestamp
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
}

export interface CallRoles {
  payerId: string;
  earnerId: string | null;
  pricePerMinute: number;
}

// ============================================================================
// CONSTANTS (from config)
// PACK 278: Updated with subscription discount system
// ============================================================================

const CALL_CONFIG = {
  VOICE: {
    BASE_COST: 10,                    // Base cost for standard users
    VIP_DISCOUNT: 0.30,               // 30% discount for VIP
    ROYAL_DISCOUNT: 0.50,             // 50% discount for Royal
    AVALO_CUT_PERCENT: 20,
    EARNER_CUT_PERCENT: 80,
  },
  VIDEO: {
    BASE_COST: 20,                    // Base cost for standard users
    VIP_DISCOUNT: 0.30,               // 30% discount for VIP
    ROYAL_DISCOUNT: 0.50,             // 50% discount for Royal
    AVALO_CUT_PERCENT: 20,
    EARNER_CUT_PERCENT: 80,
  },
  AUTO_DISCONNECT_IDLE_MINUTES: 6,
};

// ============================================================================
// CORE FUNCTION: determineCallPayerAndEarner
// ============================================================================

/**
 * Determines who pays and who earns for a call.
 * 
 * Rules:
 * 1. Influencer override (same as chat)
 * 2. Heterosexual M↔F: Man ALWAYS pays (regardless of initiator)
 * 3. All other cases: Initiator pays
 * 4. Earner is the person with earnOnChat = true (if any), else Avalo
 * 
 * @param userA - First participant
 * @param userB - Second participant
 * @param context - Additional context (who initiated)
 * @returns Call roles
 */
export async function determineCallPayerAndEarner(
  userA: ChatParticipantContext,
  userB: ChatParticipantContext,
  context: { initiatorId: string; callType: CallType }
): Promise<CallRoles> {
  
  const initiator = userA.userId === context.initiatorId ? userA : userB;
  const receiver = userA.userId === context.initiatorId ? userB : userA;

  // ====================================================================
  // PRIORITY 1: INFLUENCER OVERRIDE
  // ====================================================================
  const aIsInfluencerEarner = userA.influencerBadge && userA.earnOnChat;
  const bIsInfluencerEarner = userB.influencerBadge && userB.earnOnChat;
  
  if (aIsInfluencerEarner && !bIsInfluencerEarner) {
    const pricePerMinute = await getCallMinuteCost({
      payerStatus: getUserStatus(userB),
      callType: context.callType
    });
    return {
      payerId: userB.userId,
      earnerId: userA.userId,
      pricePerMinute
    };
  }
  
  if (bIsInfluencerEarner && !aIsInfluencerEarner) {
    const pricePerMinute = await getCallMinuteCost({
      payerStatus: getUserStatus(userA),
      callType: context.callType
    });
    return {
      payerId: userA.userId,
      earnerId: userB.userId,
      pricePerMinute
    };
  }

  // ====================================================================
  // PRIORITY 2: HETEROSEXUAL RULE - MAN ALWAYS PAYS FOR CALLS
  // ====================================================================
  const isHeterosexual = 
    (userA.gender === 'male' && userB.gender === 'female') ||
    (userA.gender === 'female' && userB.gender === 'male');
  
  if (isHeterosexual) {
    const man = userA.gender === 'male' ? userA : userB;
    const woman = userA.gender === 'male' ? userB : userA;
    
    // Man is ALWAYS the payer for calls in heterosexual interactions
    const pricePerMinute = await getCallMinuteCost({
      payerStatus: getUserStatus(man),
      callType: context.callType
    });
    
    // Determine earner
    let earnerId: string | null = null;
    if (woman.earnOnChat) {
      earnerId = woman.userId;
    } else if (man.earnOnChat) {
      earnerId = man.userId;
    }
    // If neither has earnOnChat, earnerId stays null (Avalo earns)
    
    return {
      payerId: man.userId,
      earnerId,
      pricePerMinute
    };
  }

  // ====================================================================
  // PRIORITY 3: MM / FF / OTHER - INITIATOR PAYS
  // ====================================================================
  
  // Determine earner
  let earnerId: string | null = null;
  
  // Only ONE has earnOnChat ON → that person earns
  if (userA.earnOnChat && !userB.earnOnChat) {
    earnerId = userA.userId;
  } else if (userB.earnOnChat && !userA.earnOnChat) {
    earnerId = userB.userId;
  } else if (userA.earnOnChat && userB.earnOnChat) {
    // Both have earnOnChat ON → receiver earns
    earnerId = receiver.userId;
  }
  // If both have earnOnChat OFF, earnerId stays null (Avalo earns)
  
  const pricePerMinute = await getCallMinuteCost({
    payerStatus: getUserStatus(initiator),
    callType: context.callType
  });
  
  return {
    payerId: initiator.userId,
    earnerId,
    pricePerMinute
  };
}

// ============================================================================
// HELPER: getUserStatus
// ============================================================================

/**
 * Determines user's subscription status
 */
function getUserStatus(user: ChatParticipantContext): UserStatus {
  if (user.isRoyalMember) {
    return 'ROYAL';
  }
  // Check for VIP status - we'll need to check the user profile
  // For now, default to STANDARD if not Royal
  return 'STANDARD';
}

/**
 * Get user status from database (includes VIP check)
 * PACK 278: Now checks subscription tier from subscriptions collection
 * PACK 50: Also checks Royal Club membership from royal_memberships collection
 */
async function getUserStatusFromDb(userId: string): Promise<UserStatus> {
  // PACK 278: Check subscription tier first
  try {
    const subSnap = await db.collection('subscriptions').doc(userId).get();
    if (subSnap.exists) {
      const subData = subSnap.data() as any;
      if (subData.active) {
        const now = new Date();
        const renewalDate = new Date(subData.renewalDate);
        if (renewalDate >= now) {
          if (subData.tier === 'royal') {
            return 'ROYAL';
          }
          if (subData.tier === 'vip') {
            return 'VIP';
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to check subscription:', error);
  }
  
  const userSnap = await db.collection('users').doc(userId).get();
  if (!userSnap.exists) {
    return 'STANDARD';
  }
  
  const user = userSnap.data() as any;
  
  // PACK 50: Check Royal Club membership from royal_memberships collection
  try {
    const royalMembershipSnap = await db.collection('royal_memberships').doc(userId).get();
    if (royalMembershipSnap.exists) {
      const royalData = royalMembershipSnap.data();
      if (royalData?.tier !== 'NONE') {
        return 'ROYAL';
      }
    }
  } catch (error) {
    // Non-blocking - if Royal check fails, continue with other checks
    console.error('Failed to check Royal membership:', error);
  }
  
  // Check for VIP (legacy check for backwards compatibility)
  if (user.roles?.vip || user.vipSubscription?.status === 'active') {
    return 'VIP';
  }
  
  return 'STANDARD';
}

// ============================================================================
// PRICING
// PACK 278: Apply subscription discounts
// ============================================================================

/**
 * Get per-minute cost for a call based on payer's status
 * PACK 278: Applies subscription discounts (VIP 30%, Royal 50%)
 */
export async function getCallMinuteCost(params: {
  payerStatus: UserStatus;
  callType: CallType;
}): Promise<number> {
  const { payerStatus, callType } = params;
  
  const config = callType === 'VOICE' ? CALL_CONFIG.VOICE : CALL_CONFIG.VIDEO;
  const baseCost = config.BASE_COST;
  
  switch (payerStatus) {
    case 'ROYAL':
      // Apply 50% discount
      return Math.ceil(baseCost * (1 - config.ROYAL_DISCOUNT));
    case 'VIP':
      // Apply 30% discount
      return Math.ceil(baseCost * (1 - config.VIP_DISCOUNT));
    case 'STANDARD':
    default:
      // No discount
      return baseCost;
  }
}

// ============================================================================
// CALL LIFECYCLE
// ============================================================================

/**
 * Start a call session
 *
 * Validates:
 * - Both users have active accounts
 * - Payer has enough tokens for at least 1 minute
 * - Creates call session record
 *
 * Phase 9: Added account status checks
 */
export async function startCall(params: {
  userAId: string;
  userBId: string;
  initiatorId: string;
  callType: CallType;
}): Promise<{ callId: string; pricePerMinute: number; payerId: string }> {
  
  const { userAId, userBId, initiatorId, callType } = params;
  
  // Phase 9: Check both users have active accounts
  const userAActive = await isAccountActive(userAId);
  const userBActive = await isAccountActive(userBId);
  
  if (!userAActive || !userBActive) {
    throw new HttpsError(
      'failed-precondition',
      'Cannot start call: one or more participants have inactive accounts'
    );
  }
  
  // Get user contexts
  const userA = await getUserContext(userAId);
  const userB = await getUserContext(userBId);
  
  // Determine roles
  const roles = await determineCallPayerAndEarner(userA, userB, {
    initiatorId,
    callType
  });
  
  // Check payer balance
  const walletRef = db.collection('users').doc(roles.payerId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  const wallet = walletSnap.data();
  
  if (!wallet || wallet.balance < roles.pricePerMinute) {
    throw new HttpsError(
      'failed-precondition',
      `Insufficient tokens. Need at least ${roles.pricePerMinute} tokens for 1 minute.`
    );
  }
  
  // Create call session
  const callId = generateId();
  const now = serverTimestamp();
  
  const callSession: Partial<CallSession> = {
    callId,
    callType,
    payerId: roles.payerId,
    earnerId: roles.earnerId,
    pricePerMinute: roles.pricePerMinute,
    state: 'ACTIVE',
    startedAt: now,
    lastActivityAt: now,
    createdAt: now,
    updatedAt: now
  };
  
  await db.collection('calls').doc(callId).set(callSession);
  
  logger.info(`Call started: ${callId} (${callType}) - Payer: ${roles.payerId}, Earner: ${roles.earnerId}, Rate: ${roles.pricePerMinute}/min`);
  
  return {
    callId,
    pricePerMinute: roles.pricePerMinute,
    payerId: roles.payerId
  };
}

/**
 * Update call activity timestamp (prevents auto-disconnect)
 */
export async function updateCallActivity(callId: string): Promise<void> {
  await db.collection('calls').doc(callId).update({
    lastActivityAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

/**
 * End a call and process billing
 *
 * - Calculates duration in minutes (ceiling)
 * - Deducts tokens from payer
 * - Applies 80/20 split to earner/Avalo
 *
 * Phase 8: Records risk event and evaluates user risk
 */
export async function endCall(params: {
  callId: string;
  endedBy: string;
  deviceId?: string;
  ipHash?: string;
}): Promise<{
  durationMinutes: number;
  totalTokens: number;
  earnerReceived: number;
  avaloReceived: number;
}> {
  
  const { callId, endedBy, deviceId, ipHash } = params;
  
  const callRef = db.collection('calls').doc(callId);
  const callSnap = await callRef.get();
  
  if (!callSnap.exists) {
    throw new HttpsError('not-found', 'Call not found');
  }
  
  const call = callSnap.data() as CallSession;
  
  if (call.state === 'ENDED') {
    throw new HttpsError('failed-precondition', 'Call already ended');
  }
  
  // Calculate duration
  const startTime = call.startedAt.toDate();
  const endTime = new Date();
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMinutes = Math.ceil(durationMs / (1000 * 60)); // Ceiling - any started minute is billed
  
  // Calculate total cost
  const totalTokens = durationMinutes * call.pricePerMinute;
  
  // Calculate split
  const config = call.callType === 'VOICE' ? CALL_CONFIG.VOICE : CALL_CONFIG.VIDEO;
  const earnerReceived = call.earnerId
    ? Math.floor(totalTokens * (config.EARNER_CUT_PERCENT / 100))
    : 0;
  const avaloReceived = totalTokens - earnerReceived;
  
  // Process transaction
  await db.runTransaction(async (transaction) => {
    // Update call record
    transaction.update(callRef, {
      state: 'ENDED',
      endedAt: serverTimestamp(),
      durationMinutes,
      totalTokens,
      endedBy,
      updatedAt: serverTimestamp()
    });
    
    // Deduct from payer
    const payerWalletRef = db.collection('users').doc(call.payerId).collection('wallet').doc('current');
    transaction.update(payerWalletRef, {
      balance: increment(-totalTokens)
    });
    
    // Credit earner if exists
    if (call.earnerId && earnerReceived > 0) {
      const earnerWalletRef = db.collection('users').doc(call.earnerId).collection('wallet').doc('current');
      transaction.update(earnerWalletRef, {
        balance: increment(earnerReceived),
        earned: increment(earnerReceived)
      });
      
      // Record earner transaction
      const earnerTxRef = db.collection('transactions').doc(generateId());
      transaction.set(earnerTxRef, {
        userId: call.earnerId,
        type: 'call_earning',
        amount: earnerReceived,
        metadata: {
          callId,
          callType: call.callType,
          durationMinutes,
          ratePerMinute: call.pricePerMinute
        },
        createdAt: serverTimestamp()
      });
    }
    
    // Record payer transaction
    const payerTxRef = db.collection('transactions').doc(generateId());
    transaction.set(payerTxRef, {
      userId: call.payerId,
      type: 'call_charge',
      amount: -totalTokens,
      metadata: {
        callId,
        callType: call.callType,
        durationMinutes,
        ratePerMinute: call.pricePerMinute,
        earnerId: call.earnerId
      },
      createdAt: serverTimestamp()
    });
    
    // Record Avalo revenue transaction
    if (avaloReceived > 0) {
      const avaloTxRef = db.collection('transactions').doc(generateId());
      transaction.set(avaloTxRef, {
        userId: 'avalo_platform',
        type: 'call_fee',
        amount: avaloReceived,
        metadata: {
          callId,
          callType: call.callType,
          fromUserId: call.payerId
        },
        createdAt: serverTimestamp()
      });
    }
  });
  
  logger.info(`Call ended: ${callId} - Duration: ${durationMinutes}min, Cost: ${totalTokens} tokens, Earner: ${earnerReceived}, Avalo: ${avaloReceived}`);
  
  // Phase 8: Record risk event (async, non-blocking)
  try {
    await recordRiskEvent({
      userId: call.payerId,
      eventType: 'call',
      metadata: {
        payerId: call.payerId,
        earnerId: call.earnerId,
        totalTokens: earnerReceived,
        callType: call.callType,
        durationMinutes,
        deviceId,
        ipHash,
      },
    });
    
    // Evaluate risk for both participants (async)
    if (call.payerId) {
      evaluateUserRisk(call.payerId).catch(() => {});
    }
    if (call.earnerId) {
      evaluateUserRisk(call.earnerId).catch(() => {});
    }
  } catch (error) {
    // Non-blocking - don't fail call end if risk recording fails
  }
  
  // PACK 50: Record Royal spend (async, non-blocking)
  trackRoyalSpendAsync(call.payerId, totalTokens, 'call');
  
  // PACK 220: Track fan milestone progression (async, non-blocking)
  if (call.earnerId && earnerReceived > 0) {
    trackTokenSpend(call.payerId, call.earnerId, earnerReceived, 'call')
      .catch(err => logger.error('Failed to track fan spend:', err));
  }
  
  return {
    durationMinutes,
    totalTokens,
    earnerReceived,
    avaloReceived
  };
}

/**
 * PACK 50: Track Royal spend asynchronously
 */
async function trackRoyalSpendAsync(userId: string, amount: number, source: string): Promise<void> {
  try {
    const { trackRoyalSpend } = await import('./royalSpendTracking');
    await trackRoyalSpend(userId, amount, source);
  } catch (error) {
    // Silent failure - Royal tracking should never block call operations
    console.error('[CallMonetization] Royal spend tracking failed:', error);
  }
}

/**
 * Check and auto-disconnect idle calls
 * 
 * Should be called by scheduled function (e.g., every 5 minutes)
 */
export async function autoDisconnectIdleCalls(): Promise<number> {
  const cutoffTime = Date.now() - (CALL_CONFIG.AUTO_DISCONNECT_IDLE_MINUTES * 60 * 1000);
  
  const idleCalls = await db.collection('calls')
    .where('state', '==', 'ACTIVE')
    .where('lastActivityAt', '<', new Date(cutoffTime))
    .limit(50)
    .get();
  
  let disconnectedCount = 0;
  
  for (const callDoc of idleCalls.docs) {
    try {
      await endCall({
        callId: callDoc.id,
        endedBy: 'system_auto_disconnect'
      });
      disconnectedCount++;
    } catch (error) {
      logger.error(`Failed to auto-disconnect call ${callDoc.id}:`, error);
    }
  }
  
  if (disconnectedCount > 0) {
    logger.info(`Auto-disconnected ${disconnectedCount} idle calls`);
  }
  
  return disconnectedCount;
}

/**
 * Get active call for a user (if any)
 */
export async function getActiveCallForUser(userId: string): Promise<CallSession | null> {
  const callsSnap = await db.collection('calls')
    .where('state', '==', 'ACTIVE')
    .where('payerId', '==', userId)
    .orderBy('startedAt', 'desc')
    .limit(1)
    .get();
  
  if (!callsSnap.empty) {
    return callsSnap.docs[0].data() as CallSession;
  }
  
  // Check as earner too
  const callsSnap2 = await db.collection('calls')
    .where('state', '==', 'ACTIVE')
    .where('earnerId', '==', userId)
    .orderBy('startedAt', 'desc')
    .limit(1)
    .get();
  
  if (!callsSnap2.empty) {
    return callsSnap2.docs[0].data() as CallSession;
  }
  
  return null;
}

/**
 * Check if user has sufficient balance for call
 */
export async function checkCallBalance(params: {
  userId: string;
  callType: CallType;
  durationMinutes?: number;
}): Promise<{
  hasBalance: boolean;
  userBalance: number;
  requiredTokens: number;
  pricePerMinute: number;
}> {
  const { userId, callType, durationMinutes = 1 } = params;
  
  // Get user status
  const userStatus = await getUserStatusFromDb(userId);
  
  // Get price per minute
  const pricePerMinute = await getCallMinuteCost({
    payerStatus: userStatus,
    callType
  });
  
  const requiredTokens = pricePerMinute * durationMinutes;
  
  // Check wallet
  const walletRef = db.collection('users').doc(userId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  const wallet = walletSnap.data();
  const userBalance = wallet?.balance || 0;
  
  return {
    hasBalance: userBalance >= requiredTokens,
    userBalance,
    requiredTokens,
    pricePerMinute
  };
}