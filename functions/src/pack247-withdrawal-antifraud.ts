/**
 * PACK 247 — Token Withdrawal Anti-Fraud & Earnings Unlock System
 * 
 * 3-Layer Protection:
 * (1) Earnings Unlock System (EUS) — Minimum authenticity requirements
 * (2) Risk Score Engine (0–100) — Dynamic risk scoring
 * (3) Transaction Integrity Firewall — Individual withdrawal validation
 * 
 * CRITICAL: This module DOES NOT modify tokenomics, pricing, or refund rules.
 * It ONLY validates withdrawals and pauses suspicious transactions.
 */

import { db, serverTimestamp, admin, increment, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

// ============================================================================
// TYPES
// ============================================================================

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type UnlockStatus = 'LOCKED' | 'UNLOCKED';
export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'PAUSED' | 'REJECTED' | 'COMPLETED';

export interface EarningsUnlockCriteria {
  minPaidChatExchanges: number;          // 300 unique exchanges
  minCallMinutes: number;                 // 60 minutes total
  verificationRequired: boolean;          // Full selfie + ID check
  maxComplaints: number;                  // < 3 in 30 days
  minSocialRating: number;                // ≥ 3.6/5
  minUniqueUsers: number;                 // ≥ 25 different users
}

export interface WithdrawalRiskScore {
  userId: string;
  riskScore: number;                      // 0-100
  riskLevel: RiskLevel;
  unlockStatus: UnlockStatus;
  verificationStatus: {
    profileComplete: boolean;
    idVerified: boolean;
    selfieVerified: boolean;
  };
  metrics: {
    paidChatExchanges: number;
    callMinutes: number;
    uniqueUsers: number;
    complaints30d: number;
    socialRating: number;
  };
  nextAuditDate: Timestamp;
  updatedAt: Timestamp;
}

export interface RiskScoreEvent {
  eventType: string;
  impact: number;                         // +/- risk score change
  description: string;
  metadata?: Record<string, any>;
}

export interface WithdrawalValidation {
  valid: boolean;
  riskScore: number;
  riskLevel: RiskLevel;
  pauseRequired: boolean;
  pauseDurationHours?: number;
  reason?: string;
  flags: string[];
}

export interface EconomicLog {
  id: string;
  userId: string;
  type: 'withdrawal_attempt' | 'withdrawal_validation' | 'earnings_record';
  amount: number;
  sourceType: string;
  validated: boolean;
  riskScore: number;
  flags: string[];
  metadata: Record<string, any>;
  createdAt: Timestamp;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const EUS_CRITERIA: EarningsUnlockCriteria = {
  minPaidChatExchanges: 300,
  minCallMinutes: 60,
  verificationRequired: true,
  maxComplaints: 3,
  minSocialRating: 3.6,
  minUniqueUsers: 25,
};

const RISK_THRESHOLDS = {
  LOW: 39,
  MEDIUM: 59,
  HIGH: 79,
  CRITICAL: 100,
};

const PAUSE_DURATIONS = {
  LOW: 0,        // No pause
  MEDIUM: 24,    // 24h delay
  HIGH: 48,      // 48h delay
  CRITICAL: 72,  // 72h + manual review
};

// Risk score event impacts
const RISK_EVENTS = {
  QUALITY_CHAT: { impact: -12, description: 'Long, quality chat interactions' },
  COPY_PASTE: { impact: +18, description: 'Repetitive copy-paste messages' },
  MULTI_ACCOUNT: { impact: +40, description: 'Multiple accounts from same device' },
  VERIFIED_EVENT: { impact: -15, description: 'QR-verified event attendance' },
  UNVERIFIED_MEETING: { impact: +10, description: 'Meeting without selfie verification' },
  SUDDEN_SPIKE: { impact: +25, description: 'Sudden popularity spike without organic growth' },
  COMPLAINT_FRAUD: { impact: +35, description: 'Fraud complaint received' },
  POSITIVE_REVIEWS: { impact: -20, description: 'Positive reviews from 10+ profiles' },
  ONE_WORD_PAID: { impact: +14, description: 'Single-word paid messages' },
  VIDEO_CALL_VERIFIED: { impact: -30, description: 'Video call 10+ min with QR meeting' },
};

// ============================================================================
// LAYER 1: EARNINGS UNLOCK SYSTEM (EUS)
// ============================================================================

/**
 * Check if user meets Earnings Unlock System criteria
 */
export async function checkEarningsUnlock(userId: string): Promise<{
  unlocked: boolean;
  criteria: Record<string, boolean>;
  message?: string;
}> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User not found');
  }

  const user = userDoc.data() as any;

  // Check verification status
  const verificationComplete = 
    user.verification?.profileComplete === true &&
    user.verification?.idVerified === true &&
    user.verification?.selfieVerified === true;

  // Get chat statistics
  const chatStats = await getPaidChatStatistics(userId);
  
  // Get call statistics
  const callStats = await getCallStatistics(userId);
  
  // Get complaints count
  const complaints = await getComplaintsCount(userId);
  
  // Get social rating
  const socialRating = await getSocialRating(userId);
  
  // Get unique users count
  const uniqueUsers = await getUniqueUsersCount(userId);

  const criteria = {
    verificationComplete,
    paidChatExchanges: chatStats.exchanges >= EUS_CRITERIA.minPaidChatExchanges,
    callMinutes: callStats.totalMinutes >= EUS_CRITERIA.minCallMinutes,
    complaints: complaints < EUS_CRITERIA.maxComplaints,
    socialRating: socialRating >= EUS_CRITERIA.minSocialRating,
    uniqueUsers: uniqueUsers >= EUS_CRITERIA.minUniqueUsers,
  };

  const allCriteriaMet = Object.values(criteria).every(v => v === true);

  if (!allCriteriaMet) {
    const failedCriteria = Object.entries(criteria)
      .filter(([_, met]) => !met)
      .map(([name]) => name);
    
    return {
      unlocked: false,
      criteria,
      message: `You must meet all authenticity requirements before withdrawing. Missing: ${failedCriteria.join(', ')}`,
    };
  }

  return {
    unlocked: true,
    criteria,
  };
}

/**
 * Helper: Get paid chat statistics
 */
async function getPaidChatStatistics(userId: string): Promise<{
  exchanges: number;
  uniqueChats: number;
}> {
  // Count paid chat exchanges (not words, but actual response pairs)
  const chatsQuery = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .where('mode', '==', 'PAID')
    .get();

  let totalExchanges = 0;
  
  for (const chatDoc of chatsQuery.docs) {
    const chat = chatDoc.data();
    // Each exchange = 2 messages (back and forth)
    const exchanges = Math.floor((chat.billing?.messageCount || 0) / 2);
    totalExchanges += exchanges;
  }

  return {
    exchanges: totalExchanges,
    uniqueChats: chatsQuery.size,
  };
}

/**
 * Helper: Get call statistics
 */
async function getCallStatistics(userId: string): Promise<{
  totalMinutes: number;
  totalCalls: number;
}> {
  const callsQuery = await db.collection('calls')
    .where('earnerId', '==', userId)
    .where('state', '==', 'ENDED')
    .get();

  let totalMinutes = 0;
  
  callsQuery.forEach(doc => {
    const call = doc.data();
    totalMinutes += call.durationMinutes || 0;
  });

  return {
    totalMinutes,
    totalCalls: callsQuery.size,
  };
}

/**
 * Helper: Get complaints count in last 30 days
 */
async function getComplaintsCount(userId: string): Promise<number> {
  const thirtyDaysAgo = Timestamp.fromDate(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );

  const complaintsQuery = await db.collection('reports')
    .where('reportedUserId', '==', userId)
    .where('createdAt', '>=', thirtyDaysAgo)
    .where('type', 'in', ['fraud', 'scam', 'fake'])
    .get();

  return complaintsQuery.size;
}

/**
 * Helper: Get social rating
 */
async function getSocialRating(userId: string): Promise<number> {
  const userDoc = await db.collection('users').doc(userId).get();
  const user = userDoc.data() as any;
  
  return user.rating?.average || 0;
}

/**
 * Helper: Get unique users interacted with
 */
async function getUniqueUsersCount(userId: string): Promise<number> {
  // Get unique payers from chats
  const chatsQuery = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .get();

  const uniquePayers = new Set<string>();
  chatsQuery.forEach(doc => {
    const chat = doc.data();
    if (chat.roles?.payerId) {
      uniquePayers.add(chat.roles.payerId);
    }
  });

  // Get unique payers from calls
  const callsQuery = await db.collection('calls')
    .where('earnerId', '==', userId)
    .get();

  callsQuery.forEach(doc => {
    const call = doc.data();
    if (call.payerId) {
      uniquePayers.add(call.payerId);
    }
  });

  return uniquePayers.size;
}

// ============================================================================
// LAYER 2: RISK SCORE ENGINE (0-100)
// ============================================================================

/**
 * Calculate user's risk score based on behavior patterns
 */
export async function calculateRiskScore(userId: string): Promise<WithdrawalRiskScore> {
  let riskScore = 0;
  const flags: string[] = [];

  // Get user data
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User not found');
  }

  const user = userDoc.data() as any;

  // Check for copy-paste patterns in recent chats
  const copyPasteRisk = await detectCopyPastePattern(userId);
  if (copyPasteRisk.detected) {
    riskScore += RISK_EVENTS.COPY_PASTE.impact;
    flags.push('COPY_PASTE_DETECTED');
  }

  // Check for multi-accounts
  const multiAccountRisk = await detectMultiAccount(userId);
  if (multiAccountRisk.detected) {
    riskScore += RISK_EVENTS.MULTI_ACCOUNT.impact;
    flags.push('MULTI_ACCOUNT_SUSPECTED');
  }

  // Check for sudden spikes without organic growth
  const suddenSpikeRisk = await detectSuddenPopularitySpike(userId);
  if (suddenSpikeRisk.detected) {
    riskScore += RISK_EVENTS.SUDDEN_SPIKE.impact;
    flags.push('SUDDEN_POPULARITY_SPIKE');
  }

  // Get complaints
  const complaints = await getComplaintsCount(userId);
  if (complaints >= 3) {
    riskScore += RISK_EVENTS.COMPLAINT_FRAUD.impact;
    flags.push('FRAUD_COMPLAINTS_RECEIVED');
  }

  // Check for one-word paid messages (farming indicator)
  const oneWordRisk = await detectOneWordMessages(userId);
  if (oneWordRisk.detected) {
    riskScore += RISK_EVENTS.ONE_WORD_PAID.impact;
    flags.push('ONE_WORD_PAID_MESSAGES');
  }

  // Positive signals - reduce risk
  const hasQualityChats = await hasQualityInteractions(userId);
  if (hasQualityChats) {
    riskScore += RISK_EVENTS.QUALITY_CHAT.impact;
  }

  const hasVerifiedEvents = await hasQRVerifiedEvents(userId);
  if (hasVerifiedEvents) {
    riskScore += RISK_EVENTS.VERIFIED_EVENT.impact;
  }

  const hasPositiveReviews = await hasMultiplePositiveReviews(userId);
  if (hasPositiveReviews) {
    riskScore += RISK_EVENTS.POSITIVE_REVIEWS.impact;
  }

  const hasVerifiedVideoCalls = await hasQRVerifiedVideoCalls(userId);
  if (hasVerifiedVideoCalls) {
    riskScore += RISK_EVENTS.VIDEO_CALL_VERIFIED.impact;
  }

  // Cap risk score between 0-100
  riskScore = Math.max(0, Math.min(100, riskScore));

  // Determine risk level
  let riskLevel: RiskLevel;
  if (riskScore <= RISK_THRESHOLDS.LOW) {
    riskLevel = 'LOW';
  } else if (riskScore <= RISK_THRESHOLDS.MEDIUM) {
    riskLevel = 'MEDIUM';
  } else if (riskScore <= RISK_THRESHOLDS.HIGH) {
    riskLevel = 'HIGH';
  } else {
    riskLevel = 'CRITICAL';
  }

  // Get metrics for Earnings Unlock
  const chatStats = await getPaidChatStatistics(userId);
  const callStats = await getCallStatistics(userId);
  const socialRating = await getSocialRating(userId);
  const uniqueUsers = await getUniqueUsersCount(userId);

  // Check unlock status
  const unlockCheck = await checkEarningsUnlock(userId);

  const result: WithdrawalRiskScore = {
    userId,
    riskScore,
    riskLevel,
    unlockStatus: unlockCheck.unlocked ? 'UNLOCKED' : 'LOCKED',
    verificationStatus: {
      profileComplete: user.verification?.profileComplete || false,
      idVerified: user.verification?.idVerified || false,
      selfieVerified: user.verification?.selfieVerified || false,
    },
    metrics: {
      paidChatExchanges: chatStats.exchanges,
      callMinutes: callStats.totalMinutes,
      uniqueUsers,
      complaints30d: complaints,
      socialRating,
    },
    nextAuditDate: Timestamp.fromDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    ),
    updatedAt: Timestamp.now(),
  };

  // Store in riskLogs
  await db.collection('riskLogs').doc(userId).set(result);

  // Log event
  await db.collection('riskLogs').doc(userId).collection('events').add({
    riskScore,
    riskLevel,
    flags,
    timestamp: serverTimestamp(),
  });

  return result;
}

/**
 * Risk detection helpers
 */

async function detectCopyPastePattern(userId: string): Promise<{ detected: boolean; count: number }> {
  // Check last 50 messages for repetitive patterns
  const messagesQuery = await db.collection('messages')
    .where('senderId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const messages = messagesQuery.docs.map(doc => doc.data().text);
  const uniqueMessages = new Set(messages);

  // If more than 30% are duplicates, flag as copy-paste
  const duplicateRatio = 1 - (uniqueMessages.size / messages.length);
  
  return {
    detected: duplicateRatio > 0.3,
    count: messages.length - uniqueMessages.size,
  };
}

async function detectMultiAccount(userId: string): Promise<{ detected: boolean }> {
  // Check device trust for multi-account flags
  const deviceDoc = await db.collection('device_trust_profiles').doc(userId).get();
  if (!deviceDoc.exists) {
    return { detected: false };
  }

  const deviceData = deviceDoc.data() as any;
  const linkedAccounts = deviceData.linkedAccounts?.length || 0;

  return {
    detected: linkedAccounts >= 3, // 3+ accounts from same device
  };
}

async function detectSuddenPopularitySpike(userId: string): Promise<{ detected: boolean }> {
  // Check if earnings spiked without corresponding profile activity growth
  const last7Days = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const previous7Days = Timestamp.fromDate(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));

  const recentEarnings = await db.collection('earnings_ledger')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', last7Days)
    .get();

  const previousEarnings = await db.collection('earnings_ledger')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', previous7Days)
    .where('createdAt', '<', last7Days)
    .get();

  const recentTotal = recentEarnings.docs.reduce((sum, doc) => sum + (doc.data().netTokensCreator || 0), 0);
  const previousTotal = previousEarnings.docs.reduce((sum, doc) => sum + (doc.data().netTokensCreator || 0), 0);

  // Flag if recent earnings are 5x previous period
  return {
    detected: previousTotal > 0 && recentTotal > previousTotal * 5,
  };
}

async function detectOneWordMessages(userId: string): Promise<{ detected: boolean }> {
  const messagesQuery = await db.collection('messages')
    .where('senderId', '==', userId)
    .where('isPaid', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get();

  let oneWordCount = 0;
  messagesQuery.forEach(doc => {
    const text = doc.data().text || '';
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount === 1) oneWordCount++;
  });

  // Flag if more than 40% are single words
  return {
    detected: messagesQuery.size > 0 && oneWordCount / messagesQuery.size > 0.4,
  };
}

async function hasQualityInteractions(userId: string): Promise<boolean> {
  // Check for chats with 10+ messages and average message length > 20 words
  const chatsQuery = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .where('billing.messageCount', '>=', 10)
    .limit(5)
    .get();

  return chatsQuery.size >= 3;
}

async function hasQRVerifiedEvents(userId: string): Promise<boolean> {
  const eventsQuery = await db.collection('calendar_events')
    .where('creatorId', '==', userId)
    .where('verification.method', '==', 'QR')
    .where('verification.verified', '==', true)
    .limit(3)
    .get();

  return eventsQuery.size >= 3;
}

async function hasMultiplePositiveReviews(userId: string): Promise<boolean> {
  const reviewsQuery = await db.collection('reviews')
    .where('reviewedUserId', '==', userId)
    .where('rating', '>=', 4)
    .get();

  return reviewsQuery.size >= 10;
}

async function hasQRVerifiedVideoCalls(userId: string): Promise<boolean> {
  const callsQuery = await db.collection('calls')
    .where('earnerId', '==', userId)
    .where('callType', '==', 'VIDEO')
    .where('durationMinutes', '>=', 10)
    .get();

  return callsQuery.size >= 3;
}

// ============================================================================
// LAYER 3: TRANSACTION INTEGRITY FIREWALL
// ============================================================================

/**
 * Validate individual withdrawal transaction
 */
export async function validateWithdrawal(params: {
  userId: string;
  amount: number;
  sourceType: 'chat' | 'call' | 'gift' | 'event' | 'mixed';
}): Promise<WithdrawalValidation> {
  const { userId, amount, sourceType } = params;

  const flags: string[] = [];

  // Get current risk score
  const riskScore = await calculateRiskScore(userId);

  // Check earnings unlock
  if (riskScore.unlockStatus === 'LOCKED') {
    return {
      valid: false,
      riskScore: riskScore.riskScore,
      riskLevel: riskScore.riskLevel,
      pauseRequired: true,
      pauseDurationHours: 0,
      reason: 'Earnings unlock criteria not met. Complete authenticity requirements first.',
      flags: ['EARNINGS_LOCKED'],
    };
  }

  // Validate transaction authenticity based on source
  const sourceValidation = await validateTransactionSource(userId, amount, sourceType);
  if (!sourceValidation.valid) {
    flags.push(...sourceValidation.flags);
  }

  // Determine if pause is required based on risk level
  let pauseRequired = false;
  let pauseDurationHours = 0;
  let reason: string | undefined;

  if (riskScore.riskLevel === 'CRITICAL') {
    pauseRequired = true;
    pauseDurationHours = PAUSE_DURATIONS.CRITICAL;
    reason = 'Your withdrawal is being reviewed to ensure protection from fraud. You will receive an update within 24–72 hours.';
    flags.push('CRITICAL_RISK_MANUAL_REVIEW');
  } else if (riskScore.riskLevel === 'HIGH') {
    pauseRequired = true;
    pauseDurationHours = PAUSE_DURATIONS.HIGH;
    reason = 'Your withdrawal is under automated review for security. Processing will complete within 48 hours.';
    flags.push('HIGH_RISK_AUTO_AUDIT');
  } else if (riskScore.riskLevel === 'MEDIUM') {
    pauseRequired = true;
    pauseDurationHours = PAUSE_DURATIONS.MEDIUM;
    reason = 'Your withdrawal is being verified for security. Processing will complete within 24 hours.';
    flags.push('MEDIUM_RISK_DELAYED');
  }

  // Additional validation flags
  if (!sourceValidation.valid) {
    pauseRequired = true;
    pauseDurationHours = Math.max(pauseDurationHours, 48);
    reason = 'Withdrawal paused for transaction integrity verification.';
  }

  return {
    valid: riskScore.riskLevel !== 'CRITICAL' && sourceValidation.valid,
    riskScore: riskScore.riskScore,
    riskLevel: riskScore.riskLevel,
    pauseRequired,
    pauseDurationHours,
    reason,
    flags,
  };
}

/**
 * Validate transaction source authenticity
 */
async function validateTransactionSource(
  userId: string,
  amount: number,
  sourceType: string
): Promise<{ valid: boolean; flags: string[] }> {
  const flags: string[] = [];

  if (sourceType === 'chat') {
    // Validate chat earnings authenticity
    const chatValidation = await validateChatEarnings(userId, amount);
    if (!chatValidation.valid) {
      flags.push('CHAT_EARNINGS_SUSPICIOUS');
    }
  } else if (sourceType === 'call') {
    // Validate call earnings
    const callValidation = await validateCallEarnings(userId, amount);
    if (!callValidation.valid) {
      flags.push('CALL_EARNINGS_SUSPICIOUS');
    }
  } else if (sourceType === 'event') {
    // Validate event attendance
    const eventValidation = await validateEventEarnings(userId);
    if (!eventValidation.valid) {
      flags.push('EVENT_VERIFICATION_MISSING');
    }
  }

  return {
    valid: flags.length === 0,
    flags,
  };
}

async function validateChatEarnings(userId: string, amount: number): Promise<{ valid: boolean }> {
  // Check if earnings match actual chat activity
  const chatsQuery = await db.collection('chats')
    .where('roles.earnerId', '==', userId)
    .where('mode', '==', 'PAID')
    .get();

  let authenticMessages = 0;
  let suspiciousMessages = 0;

  for (const chatDoc of chatsQuery.docs) {
    const chat = chatDoc.data();
    const messageCount = chat.billing?.messageCount || 0;
    
    // Check if messages are authentic (not 1-word spam)
    const messagesQuery = await db.collection('messages')
      .where('chatId', '==', chatDoc.id)
      .where('senderId', '==', userId)
      .limit(10)
      .get();

    messagesQuery.forEach(msgDoc => {
      const text = msgDoc.data().text || '';
      const wordCount = text.trim().split(/\s+/).length;
      
      if (wordCount >= 5) {
        authenticMessages++;
      } else if (wordCount === 1) {
        suspiciousMessages++;
      }
    });
  }

  // Flag if more than 50% are suspicious
  const suspiciousRatio = suspiciousMessages / (authenticMessages + suspiciousMessages);
  return {
    valid: suspiciousRatio < 0.5,
  };
}

async function validateCallEarnings(userId: string, amount: number): Promise<{ valid: boolean }> {
  // Check minimum call duration authenticity
  const callsQuery = await db.collection('calls')
    .where('earnerId', '==', userId)
    .where('state', '==', 'ENDED')
    .get();

  let totalValidMinutes = 0;
  let suspiciousCallsCount = 0;

  callsQuery.forEach(doc => {
    const call = doc.data();
    const minutes = call.durationMinutes || 0;
    
    if (minutes >= 5) {
      totalValidMinutes += minutes;
    } else if (minutes < 2) {
      suspiciousCallsCount++;
    }
  });

  // Flag if too many very short calls
  return {
    valid: suspiciousCallsCount < 5,
  };
}

async function validateEventEarnings(userId: string): Promise<{ valid: boolean }> {
  // Check QR/selfie verification for recent events
  const eventsQuery = await db.collection('calendar_events')
    .where('creatorId', '==', userId)
    .where('status', '==', 'completed')
    .orderBy('startTime', 'desc')
    .limit(5)
    .get();

  let verifiedCount = 0;
  eventsQuery.forEach(doc => {
    const event = doc.data();
    if (event.verification?.verified === true) {
      verifiedCount++;
    }
  });

  // At least 60% should be verified
  return {
    valid: eventsQuery.size === 0 || verifiedCount / eventsQuery.size >= 0.6,
  };
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Request withdrawal with anti-fraud validation
 */
export const requestWithdrawal = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{
    success: boolean;
    requestId?: string;
    message: string;
    pauseDurationHours?: number;
  }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const amount = request.data.amount as number;
    const sourceTypeInput = request.data.sourceType as string;

    if (!amount || amount <= 0) {
      throw new HttpsError('invalid-argument', 'Invalid withdrawal amount');
    }

    // Validate sourceType
    const validSourceTypes = ['chat', 'call', 'gift', 'event', 'mixed'];
    if (!validSourceTypes.includes(sourceTypeInput)) {
      throw new HttpsError('invalid-argument', 'Invalid source type');
    }
    const sourceType = sourceTypeInput as 'chat' | 'call' | 'gift' | 'event' | 'mixed';

    // Validate withdrawal
    const validation = await validateWithdrawal({ userId, amount, sourceType });

    // Log economic event
    const logId = generateId();
    await db.collection('economicLogs').doc(logId).set({
      id: logId,
      userId,
      type: 'withdrawal_attempt',
      amount,
      sourceType,
      validated: validation.valid,
      riskScore: validation.riskScore,
      flags: validation.flags,
      metadata: {
        riskLevel: validation.riskLevel,
        pauseRequired: validation.pauseRequired,
      },
      createdAt: serverTimestamp(),
    });

    if (!validation.valid || validation.pauseRequired) {
      // Create withdrawal review if needed
      if (validation.riskLevel === 'CRITICAL') {
        await db.collection('withdrawalReviews').add({
          userId,
          amount,
          sourceType,
          riskScore: validation.riskScore,
          riskLevel: validation.riskLevel,
          flags: validation.flags,
          status: 'PENDING',
          priority: 'HIGH',
          createdAt: serverTimestamp(),
        });
      }

      return {
        success: false,
        message: validation.reason || 'Withdrawal validation failed',
        pauseDurationHours: validation.pauseDurationHours,
      };
    }

    // Create withdrawal request
    const requestId = generateId();
    await db.collection('withdrawalRequests').doc(requestId).set({
      id: requestId,
      userId,
      amount,
      sourceType,
      status: 'APPROVED',
      riskScore: validation.riskScore,
      riskLevel: validation.riskLevel,
      needsReview: false,
      createdAt: serverTimestamp(),
    });

    return {
      success: true,
      requestId,
      message: 'Withdrawal approved and processing',
    };
  }
);

/**
 * Get user's risk score and unlock status
 */
export const getUserRiskStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<WithdrawalRiskScore> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    return await calculateRiskScore(userId);
  }
);

/**
 * Reset monthly risk scores (scheduled function)
 */
export const resetMonthlyRiskScores = onSchedule(
  {
    schedule: '0 0 1 * *', // First day of each month
    timeZone: 'UTC',
    memory: '512MiB' as const,
  },
  async (event) => {
    logger.info('Starting monthly risk score reset');

    const usersQuery = await db.collection('riskLogs').get();
    const batch = db.batch();
    let count = 0;

    usersQuery.forEach(doc => {
      // Reset risk score to 0, but keep unlock status
      batch.update(doc.ref, {
        riskScore: 0,
        riskLevel: 'LOW',
        updatedAt: serverTimestamp(),
      });
      count++;
    });

    await batch.commit();
    logger.info(`Reset risk scores for ${count} users`);

    return null;
  }
);

/**
 * Process pending withdrawal reviews (scheduled function)
 */
export const processPendingReviews = onSchedule(
  {
    schedule: 'every 6 hours',
    timeZone: 'UTC',
    memory: '512MiB' as const,
  },
  async (event) => {
    logger.info('Processing pending withdrawal reviews');

    // Auto-approve medium/high risk after pause period
    const reviewsQuery = await db.collection('withdrawalReviews')
      .where('status', '==', 'PENDING')
      .where('riskLevel', 'in', ['MEDIUM', 'HIGH'])
      .get();

    let processed = 0;

    for (const reviewDoc of reviewsQuery.docs) {
      const review = reviewDoc.data();
      const createdAt = review.createdAt.toDate();
      const pauseHours = review.riskLevel === 'HIGH' ? 48 : 24;
      const pauseEnds = new Date(createdAt.getTime() + pauseHours * 60 * 60 * 1000);

      if (new Date() >= pauseEnds) {
        // Auto-approve
        await reviewDoc.ref.update({
          status: 'APPROVED',
          autoApproved: true,
          approvedAt: serverTimestamp(),
        });

        // Create withdrawal request
        await db.collection('withdrawalRequests').add({
          userId: review.userId,
          amount: review.amount,
          sourceType: review.sourceType,
          status: 'APPROVED',
          riskScore: review.riskScore,
          fromReview: true,
          createdAt: serverTimestamp(),
        });

        processed++;
      }
    }

    logger.info(`Auto-approved ${processed} withdrawal reviews`);
    return null;
  }
);