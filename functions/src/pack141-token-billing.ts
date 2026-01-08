/**
 * PACK 141 - AI Companion Token Billing
 * 
 * 100% AVALO REVENUE - NO CREATOR INVOLVED
 * - No discounts
 * - No bonus free messages
 * - No variable pricing based on emotional topics
 * - No "romantic unlocks" or "intimacy upgrades"
 */

import { db, serverTimestamp } from './init';
import {
  InteractionMedium,
  AI_COMPANION_PRICING,
  UserCompanionSession,
} from './types/pack141-types';

// ============================================================================
// TOKEN CHARGING
// ============================================================================

/**
 * Charge tokens for AI companion interaction
 * Revenue goes 100% to Avalo (no 65/35 split)
 */
export async function chargeTokensForAIInteraction(
  userId: string,
  companionId: string,
  medium: InteractionMedium,
  quantity: number = 1 // messages, minutes, or generations
): Promise<{
  success: boolean;
  tokensCharged: number;
  newBalance: number;
  transactionId: string;
  error?: string;
}> {
  // Get pricing for medium
  const pricing = AI_COMPANION_PRICING[medium];
  
  // Calculate tokens to charge
  let tokensToCharge = 0;
  switch (medium) {
    case 'TEXT':
      tokensToCharge = (pricing.tokensPerMessage || 0) * quantity;
      break;
    case 'VOICE':
      tokensToCharge = (pricing.tokensPerMinute || 0) * quantity;
      break;
    case 'VIDEO':
      tokensToCharge = (pricing.tokensPerMinute || 0) * quantity;
      break;
    case 'MEDIA':
      tokensToCharge = (pricing.tokensPerGeneration || 0) * quantity;
      break;
  }
  
  // Verify no discount/bonus allowed (safety check)
  if (pricing.discountAllowed || pricing.bonusAllowed || pricing.emotionalPaywallAllowed) {
    throw new Error('PRICING VIOLATION: Discounts/bonuses/emotional paywalls are forbidden');
  }
  
  // Get user's token balance
  const userWalletRef = db.collection('user_wallets').doc(userId);
  const walletDoc = await userWalletRef.get();
  
  if (!walletDoc.exists) {
    return {
      success: false,
      tokensCharged: 0,
      newBalance: 0,
      transactionId: '',
      error: 'User wallet not found',
    };
  }
  
  const wallet = walletDoc.data()!;
  const currentBalance = wallet.tokenBalance || 0;
  
  // Check sufficient balance
  if (currentBalance < tokensToCharge) {
    return {
      success: false,
      tokensCharged: 0,
      newBalance: currentBalance,
      transactionId: '',
      error: 'Insufficient token balance',
    };
  }
  
  // Create transaction ID
  const transactionId = `ai_txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Deduct tokens from wallet
  const newBalance = currentBalance - tokensToCharge;
  await userWalletRef.update({
    tokenBalance: newBalance,
    updatedAt: serverTimestamp(),
  });
  
  // Record transaction (100% to Avalo)
  await db.collection('transactions').doc(transactionId).set({
    transactionId,
    userId,
    type: 'AI_COMPANION_CHARGE',
    amount: tokensToCharge,
    medium,
    companionId,
    quantity,
    revenueAllocation: {
      avalo: tokensToCharge,      // 100% to Avalo
      creator: 0,                  // 0% to creators (no creator involved)
    },
    timestamp: serverTimestamp(),
    status: 'COMPLETED',
  });
  
  // Log to analytics
  await logAICompanionTransaction(userId, companionId, medium, tokensToCharge);
  
  return {
    success: true,
    tokensCharged: tokensToCharge,
    newBalance,
    transactionId,
  };
}

/**
 * Check if user has sufficient balance
 */
export async function checkSufficientBalance(
  userId: string,
  medium: InteractionMedium,
  quantity: number = 1
): Promise<{
  sufficient: boolean;
  currentBalance: number;
  required: number;
  shortfall: number;
}> {
  const pricing = AI_COMPANION_PRICING[medium];
  
  let tokensRequired = 0;
  switch (medium) {
    case 'TEXT':
      tokensRequired = (pricing.tokensPerMessage || 0) * quantity;
      break;
    case 'VOICE':
      tokensRequired = (pricing.tokensPerMinute || 0) * quantity;
      break;
    case 'VIDEO':
      tokensRequired = (pricing.tokensPerMinute || 0) * quantity;
      break;
    case 'MEDIA':
      tokensRequired = (pricing.tokensPerGeneration || 0) * quantity;
      break;
  }
  
  const walletDoc = await db.collection('user_wallets').doc(userId).get();
  const currentBalance = walletDoc.exists ? (walletDoc.data()!.tokenBalance || 0) : 0;
  
  return {
    sufficient: currentBalance >= tokensRequired,
    currentBalance,
    required: tokensRequired,
    shortfall: Math.max(0, tokensRequired - currentBalance),
  };
}

/**
 * Get pricing for display to user
 */
export function getAICompanionPricing(): typeof AI_COMPANION_PRICING {
  // Return pricing (all forbidden flags verified)
  return AI_COMPANION_PRICING;
}

// ============================================================================
// SESSION BILLING
// ============================================================================

/**
 * Start billable session
 */
export async function startBillableSession(
  userId: string,
  companionId: string,
  medium: InteractionMedium,
  goals: string[] = []
): Promise<UserCompanionSession> {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const session: UserCompanionSession = {
    sessionId,
    userId,
    companionId,
    startedAt: serverTimestamp() as any,
    medium,
    messageCount: 0,
    durationSeconds: 0,
    tokensSpent: 0,
    goals,
    safetyViolations: 0,
  };
  
  await db.collection('ai_companion_sessions').doc(sessionId).set(session);
  
  return session;
}

/**
 * Update session with charges
 */
export async function updateSessionBilling(
  sessionId: string,
  tokensCharged: number,
  messageCount: number = 0,
  durationSeconds: number = 0
): Promise<void> {
  const sessionRef = db.collection('ai_companion_sessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();
  
  if (!sessionDoc.exists) {
    throw new Error('Session not found');
  }
  
  const session = sessionDoc.data() as UserCompanionSession;
  
  await sessionRef.update({
    tokensSpent: session.tokensSpent + tokensCharged,
    messageCount: session.messageCount + messageCount,
    durationSeconds: session.durationSeconds + durationSeconds,
  });
}

/**
 * End session
 */
export async function endBillableSession(
  sessionId: string,
  emergencyStopReason?: string
): Promise<void> {
  const sessionRef = db.collection('ai_companion_sessions').doc(sessionId);
  const updates: any = {
    endedAt: serverTimestamp(),
  };
  
  if (emergencyStopReason) {
    updates.emergencyStopReason = emergencyStopReason;
  }
  
  await sessionRef.update(updates);
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

/**
 * Log AI companion transaction for analytics
 */
async function logAICompanionTransaction(
  userId: string,
  companionId: string,
  medium: InteractionMedium,
  tokens: number
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const analyticsId = `${companionId}_${today}`;
  
  const analyticsRef = db.collection('ai_companion_daily_analytics').doc(analyticsId);
  const analyticsDoc = await analyticsRef.get();
  
  if (analyticsDoc.exists) {
    const data = analyticsDoc.data()!;
    await analyticsRef.update({
      totalTokens: data.totalTokens + tokens,
      totalSessions: data.totalSessions + 1,
      [`tokensByMedium.${medium}`]: (data.tokensByMedium?.[medium] || 0) + tokens,
      updatedAt: serverTimestamp(),
    });
  } else {
    await analyticsRef.set({
      companionId,
      date: today,
      totalTokens: tokens,
      totalSessions: 1,
      tokensByMedium: {
        [medium]: tokens,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Get AI companion revenue statistics (admin only)
 */
export async function getAICompanionRevenueStats(
  startDate: Date,
  endDate: Date
): Promise<{
  totalRevenue: number;
  revenueByMedium: Record<InteractionMedium, number>;
  totalSessions: number;
  averageSessionRevenue: number;
}> {
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  const snapshot = await db.collection('ai_companion_daily_analytics')
    .where('date', '>=', startDateStr)
    .where('date', '<=', endDateStr)
    .get();
  
  let totalRevenue = 0;
  let totalSessions = 0;
  const revenueByMedium: Record<InteractionMedium, number> = {
    TEXT: 0,
    VOICE: 0,
    VIDEO: 0,
    MEDIA: 0,
  };
  
  snapshot.forEach(doc => {
    const data = doc.data();
    totalRevenue += data.totalTokens || 0;
    totalSessions += data.totalSessions || 0;
    
    if (data.tokensByMedium) {
      Object.keys(data.tokensByMedium).forEach(medium => {
        revenueByMedium[medium as InteractionMedium] += data.tokensByMedium[medium] || 0;
      });
    }
  });
  
  return {
    totalRevenue,
    revenueByMedium,
    totalSessions,
    averageSessionRevenue: totalSessions > 0 ? totalRevenue / totalSessions : 0,
  };
}

// ============================================================================
// REVENUE VERIFICATION (Audit Trail)
// ============================================================================

/**
 * Verify NO creator revenue split for AI companions
 */
export async function verifyAIRevenueCompliance(
  transactionId: string
): Promise<{
  compliant: boolean;
  violations: string[];
}> {
  const txnDoc = await db.collection('transactions').doc(transactionId).get();
  
  if (!txnDoc.exists) {
    return {
      compliant: false,
      violations: ['Transaction not found'],
    };
  }
  
  const txn = txnDoc.data()!;
  const violations: string[] = [];
  
  // Verify 100% Avalo revenue
  if (txn.revenueAllocation?.creator !== 0) {
    violations.push(`Creator revenue should be 0, got ${txn.revenueAllocation?.creator}`);
  }
  
  if (txn.revenueAllocation?.avalo !== txn.amount) {
    violations.push(`Avalo revenue should be ${txn.amount}, got ${txn.revenueAllocation?.avalo}`);
  }
  
  // Verify no discounts/bonuses
  if (txn.discount || txn.bonus) {
    violations.push('Discounts/bonuses are forbidden for AI companions');
  }
  
  return {
    compliant: violations.length === 0,
    violations,
  };
}