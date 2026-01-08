/**
 * PACK 422 — Global Trust, Reputation & Moderation Intelligence (Tier-2)
 * 
 * Reputation Engine Service
 * Calculates weighted reputation scores from cross-platform signals
 */

import * as admin from 'firebase-admin';
import {
  ReputationProfile,
  ReputationSignals,
  ReputationWeights,
  DEFAULT_REPUTATION_WEIGHTS,
  RiskLabel,
  ReputationHistoryEvent,
} from '../../shared/types/pack422-reputation.types';

const db = admin.firestore();

/**
 * Initialize a new reputation profile with default values
 */
export function createDefaultReputationProfile(userId: string): ReputationProfile {
  const now = Date.now();
  return {
    userId,
    updatedAt: now,
    reputationScore: 50, // Start neutral
    
    // Component scores - all start at 50 (neutral)
    chatQuality: 50,
    callQuality: 50,
    meetingReliability: 50,
    cancellationBehavior: 50,
    disputeHistory: 50,
    paymentTrust: 50,
    socialPresence: 50,
    supportInteractionQuality: 50,
    safetySignalRisk: 50,
    
    // Flags
    manualReview: false,
    limitedMode: false,
    riskLabel: 'MEDIUM',
    
    // Aggregates
    totalReports: 0,
    totalSafetyIncidents: 0,
    cancellationsAsProvider: 0,
    cancellationsAsClient: 0,
    disputesFiled: 0,
    disputesReceived: 0,
    lateArrivals: 0,
    missedMeetings: 0,
    
    // History
    lastPositiveEvent: now,
    lastNegativeEvent: 0,
  };
}

/**
 * Gather raw signals from various PACK systems
 */
async function gatherReputationSignals(userId: string): Promise<ReputationSignals> {
  const signals: ReputationSignals = {
    totalMessages: 0,
    reportedMessages: 0,
    successfulCalls: 0,
    droppedCalls: 0,
    meetingsCompleted: 0,
    meetingsCancelled: 0,
    meetingsNoShow: 0,
    meetingsLate: 0,
    qrVerifications: 0,
    successfulPayments: 0,
    failedPayments: 0,
    payoutsRejected: 0,
    disputesAsProvider: 0,
    disputesAsClient: 0,
    profileCompleteness: 0,
    verificationLevel: 0,
    positiveRatings: 0,
    supportTickets: 0,
    aggressiveTickets: 0,
    resolvedPositively: 0,
    safetyIncidents: 0,
    panicEvents: 0,
    nsfwViolations: 0,
    blockedByAI: 0,
    fraudAlerts: 0,
  };

  // Gather signals in parallel
  await Promise.all([
    gatherChatCallSignals(userId, signals),
    gatherMeetingSignals(userId, signals),
    gatherPaymentSignals(userId, signals),
    gatherSocialSignals(userId, signals),
    gatherSupportSignals(userId, signals),
    gatherSafetySignals(userId, signals),
  ]);

  return signals;
}

async function gatherChatCallSignals(userId: string, signals: ReputationSignals): Promise<void> {
  // PACK 273–280: Chat/Call billing and quality
  const billingRef = db.collection('billing').where('userId', '==', userId).limit(1000);
  const billingSnap = await billingRef.get();
  
  billingSnap.forEach(doc => {
    const data = doc.data();
    if (data.type === 'MESSAGE') {
      signals.totalMessages++;
    } else if (data.type === 'CALL' && data.status === 'COMPLETED') {
      signals.successfulCalls++;
    } else if (data.type === 'CALL' && data.status === 'FAILED') {
      signals.droppedCalls++;
    }
  });

  // PACK 190: Abuse reports on messages
  const reportsRef = db.collection('reports')
    .where('reportedUserId', '==', userId)
    .where('type', '==', 'MESSAGE');
  const reportsSnap = await reportsRef.get();
  signals.reportedMessages = reportsSnap.size;
}

async function gatherMeetingSignals(userId: string, signals: ReputationSignals): Promise<void> {
  // PACK 240+: Meetings attendance & cancellations
  const meetingsRef = db.collection('meetings').where('participantIds', 'array-contains', userId);
  const meetingsSnap = await meetingsRef.get();
  
  meetingsSnap.forEach(doc => {
    const data = doc.data();
    const userStatus = data.participantStatuses?.[userId];
    
    if (data.status === 'COMPLETED') {
      signals.meetingsCompleted++;
      if (userStatus?.qrVerified) {
        signals.qrVerifications++;
      }
      if (userStatus?.arrivedLate) {
        signals.meetingsLate++;
      }
    } else if (data.status === 'CANCELLED') {
      signals.meetingsCancelled++;
    } else if (data.status === 'NO_SHOW' && userStatus?.noShow) {
      signals.meetingsNoShow++;
    }
  });
}

async function gatherPaymentSignals(userId: string, signals: ReputationSignals): Promise<void> {
  // PACK 255/277: Wallet usage
  const paymentsRef = db.collection('transactions').where('userId', '==', userId).limit(1000);
  const paymentsSnap = await paymentsRef.get();
  
  paymentsSnap.forEach(doc => {
    const data = doc.data();
    if (data.status === 'COMPLETED') {
      signals.successfulPayments++;
    } else if (data.status === 'FAILED') {
      signals.failedPayments++;
    } else if (data.type === 'PAYOUT' && data.status === 'REJECTED') {
      signals.payoutsRejected++;
    }
  });

  // PACK 302/352: Fraud detection
  const fraudRef = db.collection('fraudAlerts').where('userId', '==', userId);
  const fraudSnap = await fraudRef.get();
  signals.fraudAlerts = fraudSnap.size;

  // Disputes
  const disputesAsProviderRef = db.collection('disputes')
    .where('providerId', '==', userId)
    .where('status', '==', 'OPEN');
  const disputesAsProviderSnap = await disputesAsProviderRef.get();
  signals.disputesAsProvider = disputesAsProviderSnap.size;

  const disputesAsClientRef = db.collection('disputes')
    .where('clientId', '==', userId)
    .where('status', '==', 'OPEN');
  const disputesAsClientSnap = await disputesAsClientRef.get();
  signals.disputesAsClient = disputesAsClientSnap.size;
}

async function gatherSocialSignals(userId: string, signals: ReputationSignals): Promise<void> {
  // PACK 110: Identity/KYC
  const profileRef = db.collection('users').doc(userId);
  const profileSnap = await profileRef.get();
  
  if (profileSnap.exists) {
    const data = profileSnap.data()!;
    
    // Calculate profile completeness
    let completeness = 0;
    if (data.displayName) completeness += 20;
    if (data.bio) completeness += 20;
    if (data.photoURL) completeness += 20;
    if (data.location) completeness += 20;
    if (data.interests?.length > 0) completeness += 20;
    signals.profileCompleteness = completeness;
    
    // Verification level
    signals.verificationLevel = data.verificationLevel || 0;
    
    // Positive ratings (if available)
    signals.positiveRatings = data.positiveRatingsCount || 0;
  }
}

async function gatherSupportSignals(userId: string, signals: ReputationSignals): Promise<void> {
  // PACK 300/300A: Support system
  const ticketsRef = db.collection('supportTickets').where('userId', '==', userId);
  const ticketsSnap = await ticketsRef.get();
  
  signals.supportTickets = ticketsSnap.size;
  
  ticketsSnap.forEach(doc => {
    const data = doc.data();
    if (data.adminNotes?.includes('toxic') || 
        data.adminNotes?.includes('aggressive') ||
        data.adminNotes?.includes('threatening')) {
      signals.aggressiveTickets++;
    }
    if (data.status === 'RESOLVED' && data.resolution === 'POSITIVE') {
      signals.resolvedPositively++;
    }
  });
}

async function gatherSafetySignals(userId: string, signals: ReputationSignals): Promise<void> {
  // PACK 267–268: Safety engine
  const safetyRef = db.collection('safetyIncidents').where('userId', '==', userId);
  const safetySnap = await safetyRef.get();
  signals.safetyIncidents = safetySnap.size;
  
  safetySnap.forEach(doc => {
    const data = doc.data();
    if (data.type === 'PANIC') {
      signals.panicEvents++;
    }
  });

  // PACK 279: AI Companions
  const aiViolationsRef = db.collection('aiViolations').where('userId', '==', userId);
  const aiViolationsSnap = await aiViolationsRef.get();
  
  aiViolationsSnap.forEach(doc => {
    const data = doc.data();
    if (data.type === 'NSFW') {
      signals.nsfwViolations++;
    } else if (data.type === 'BLOCKED') {
      signals.blockedByAI++;
    }
  });
}

/**
 * Normalize signals into 0-100 component scores
 */
function calculateComponentScores(signals: ReputationSignals): Omit<ReputationProfile, 'userId' | 'updatedAt' | 'reputationScore' | 'riskLabel' | 'manualReview' | 'limitedMode' | 'totalReports' | 'totalSafetyIncidents' | 'cancellationsAsProvider' | 'cancellationsAsClient' | 'disputesFiled' | 'disputesReceived' | 'lateArrivals' | 'missedMeetings' | 'lastPositiveEvent' | 'lastNegativeEvent'> {
  // Chat Quality (0-100)
  let chatQuality = 50;
  if (signals.totalMessages > 0) {
    const reportRate = signals.reportedMessages / signals.totalMessages;
    chatQuality = Math.max(0, 100 - (reportRate * 300)); // Penalize reports heavily
  }

  // Call Quality (0-100)
  let callQuality = 50;
  const totalCalls = signals.successfulCalls + signals.droppedCalls;
  if (totalCalls > 0) {
    const successRate = signals.successfulCalls / totalCalls;
    callQuality = successRate * 100;
  }

  // Meeting Reliability (0-100)
  let meetingReliability = 50;
  const totalScheduled = signals.meetingsCompleted + signals.meetingsNoShow + signals.meetingsLate;
  if (totalScheduled > 0) {
    const reliabilityRate = (signals.meetingsCompleted - signals.meetingsLate * 0.5) / totalScheduled;
    meetingReliability = Math.max(0, reliabilityRate * 100);
    
    // Heavy penalty for no-shows
    meetingReliability -= signals.meetingsNoShow * 10;
    meetingReliability = Math.max(0, meetingReliability);
  }

  // Cancellation Behavior (0-100)
  let cancellationBehavior = 50;
  const totalMeetings = totalScheduled + signals.meetingsCancelled;
  if (totalMeetings > 0) {
    const cancellationRate = signals.meetingsCancelled / totalMeetings;
    cancellationBehavior = Math.max(0, 100 - (cancellationRate * 200));
  }

  // Dispute History (0-100)
  let disputeHistory = 100;
  const totalDisputes = signals.disputesAsProvider + signals.disputesAsClient;
  disputeHistory = Math.max(0, 100 - (totalDisputes * 15));

  // Payment Trust (0-100)
  let paymentTrust = 50;
  const totalPayments = signals.successfulPayments + signals.failedPayments;
  if (totalPayments > 0) {
    const successRate = signals.successfulPayments / totalPayments;
    paymentTrust = successRate * 100;
  }
  paymentTrust = Math.max(0, paymentTrust - (signals.payoutsRejected * 10) - (signals.fraudAlerts * 20));

  // Social Presence (0-100)
  const socialPresence = Math.min(100, 
    signals.profileCompleteness * 0.5 +
    signals.verificationLevel * 0.3 +
    Math.min(signals.positiveRatings * 2, 20)
  );

  // Support Interaction Quality (0-100)
  let supportInteractionQuality = 100;
  if (signals.supportTickets > 0) {
    const aggressiveRate = signals.aggressiveTickets / signals.supportTickets;
    const resolvedRate = signals.resolvedPositively / signals.supportTickets;
    supportInteractionQuality = Math.max(0, 100 - (aggressiveRate * 150) + (resolvedRate * 20));
  }

  // Safety Signal Risk (0-100, where 100 = safest)
  let safetySignalRisk = 100;
  safetySignalRisk -= signals.safetyIncidents * 15;
  safetySignalRisk -= signals.panicEvents * 25;
  safetySignalRisk -= signals.nsfwViolations * 10;
  safetySignalRisk -= signals.blockedByAI * 20;
  safetySignalRisk = Math.max(0, safetySignalRisk);

  return {
    chatQuality: Math.round(chatQuality),
    callQuality: Math.round(callQuality),
    meetingReliability: Math.round(meetingReliability),
    cancellationBehavior: Math.round(cancellationBehavior),
    disputeHistory: Math.round(disputeHistory),
    paymentTrust: Math.round(paymentTrust),
    socialPresence: Math.round(socialPresence),
    supportInteractionQuality: Math.round(supportInteractionQuality),
    safetySignalRisk: Math.round(safetySignalRisk),
  };
}

/**
 * Calculate weighted reputation score
 */
function calculateReputationScore(
  components: ReturnType<typeof calculateComponentScores>,
  weights: ReputationWeights = DEFAULT_REPUTATION_WEIGHTS
): number {
  const score = 
    components.chatQuality * weights.chatQuality +
    components.callQuality * weights.callQuality +
    components.meetingReliability * weights.meetingReliability +
    components.cancellationBehavior * weights.cancellationBehavior +
    components.disputeHistory * weights.disputeHistory +
    components.paymentTrust * weights.paymentTrust +
    components.socialPresence * weights.socialPresence +
    components.supportInteractionQuality * weights.supportInteractionQuality +
    components.safetySignalRisk * weights.safetySignalRisk;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Determine risk label from reputation score
 */
function determineRiskLabel(score: number): RiskLabel {
  if (score > 80) return 'LOW';
  if (score >= 50) return 'MEDIUM';
  if (score >= 25) return 'HIGH';
  return 'CRITICAL';
}

/**
 * Main function: Recalculate reputation for a user
 */
export async function recalculateReputation(
  userId: string,
  options: { forceUpdate?: boolean; triggerType?: string } = {}
): Promise<ReputationProfile> {
  const { forceUpdate = false, triggerType = 'MANUAL' } = options;

  // Check for existing profile
  const profileRef = db.collection('reputationProfiles').doc(userId);
  const profileSnap = await profileRef.get();
  
  // Debounce: Don't update more than once per 10 minutes unless forced
  if (!forceUpdate && profileSnap.exists) {
    const existingProfile = profileSnap.data() as ReputationProfile;
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    if (existingProfile.updatedAt > tenMinutesAgo) {
      console.log(`[PACK422] Debouncing reputation recalc for user ${userId}`);
      return existingProfile;
    }
  }

  // Gather signals from all systems
  const signals = await gatherReputationSignals(userId);
  
  // Calculate component scores
  const components = calculateComponentScores(signals);
  
  // Calculate final weighted score
  const reputationScore = calculateReputationScore(components);
  
  // Determine risk label
  const riskLabel = determineRiskLabel(reputationScore);
  
  // Build updated profile
  const now = Date.now();
  const profile: ReputationProfile = {
    userId,
    updatedAt: now,
    reputationScore,
    riskLabel,
    ...components,
    
    // Preserve or initialize flags
    manualReview: profileSnap.exists ? (profileSnap.data() as ReputationProfile).manualReview : false,
    limitedMode: profileSnap.exists ? (profileSnap.data() as ReputationProfile).limitedMode : false,
    
    // Aggregates
    totalReports: signals.reportedMessages,
    totalSafetyIncidents: signals.safetyIncidents,
    cancellationsAsProvider: signals.meetingsCancelled, // Could split by role
    cancellationsAsClient: signals.meetingsCancelled,
    disputesFiled: signals.disputesAsClient,
    disputesReceived: signals.disputesAsProvider,
    lateArrivals: signals.meetingsLate,
    missedMeetings: signals.meetingsNoShow,
    
    // History stamps
    lastPositiveEvent: profileSnap.exists ? (profileSnap.data() as ReputationProfile).lastPositiveEvent : now,
    lastNegativeEvent: profileSnap.exists ? (profileSnap.data() as ReputationProfile).lastNegativeEvent : 0,
  };

  // Save to Firestore
  await profileRef.set(profile, { merge: true });
  
  // Log history event
  const historyEvent: ReputationHistoryEvent = {
    timestamp: now,
    eventType: triggerType,
    module: 'REPUTATION_ENGINE',
    impact: 'NEUTRAL',
    scoreBefore: profileSnap.exists ? (profileSnap.data() as ReputationProfile).reputationScore : 50,
    scoreAfter: reputationScore,
  };
  
  await profileRef.collection('history').add(historyEvent);
  
  console.log(`[PACK422] Reputation recalculated for user ${userId}: ${reputationScore} (${riskLabel})`);
  
  return profile;
}

/**
 * Get reputation profile (or initialize if doesn't exist)
 */
export async function getReputationProfile(userId: string): Promise<ReputationProfile> {
  const profileRef = db.collection('reputationProfiles').doc(userId);
  const profileSnap = await profileRef.get();
  
  if (!profileSnap.exists) {
    const newProfile = createDefaultReputationProfile(userId);
    await profileRef.set(newProfile);
    return newProfile;
  }
  
  return profileSnap.data() as ReputationProfile;
}
