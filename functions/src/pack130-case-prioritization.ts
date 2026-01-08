/**
 * PACK 130 — Case Prioritization Model
 * 
 * Priority matrix based on harm potential, not creator importance
 * Ensures child safety and threats get maximum priority
 */

import { db } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  PatrolCase,
  CasePriority,
  PatrolEventType,
  CreatePatrolCaseInput,
  NotifyModerationTeamInput,
  DEFAULT_PATROL_CONFIG,
} from './types/pack130-types';

const PATROL_CASES_COLLECTION = 'patrol_cases';
const FROZEN_CONVERSATIONS_COLLECTION = 'patrol_frozen_conversations';

// ============================================================================
// CASE CREATION WITH PRIORITIZATION
// ============================================================================

/**
 * Create patrol case with automatic prioritization
 */
export async function createPatrolCase(input: CreatePatrolCaseInput): Promise<string> {
  const { subjectUserId, category, detectionSignals, reportedBy, behaviorLogIds } = input;
  
  // Calculate priority based on category
  const priority = calculateCasePriority(category, detectionSignals);
  
  // Calculate harm potential and urgency
  const harmPotential = calculateHarmPotential(category, detectionSignals);
  const urgencyScore = calculateUrgencyScore(category, harmPotential, detectionSignals);
  
  // Get risk score from detection signals
  const riskScore = calculateRiskScoreFromSignals(detectionSignals);
  
  const patrolCase: PatrolCase = {
    caseId: `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    subjectUserId,
    reportedBy,
    priority,
    harmPotential,
    urgencyScore,
    category,
    triggeredBy: reportedBy ? 'USER_REPORT' : 'PATROL_AI',
    detectionSignals,
    riskScore,
    behaviorLogIds,
    status: 'PENDING',
    conversationFrozen: false,
    consentRevoked: false,
    accountLocked: false,
    createdAt: Timestamp.now(),
  };
  
  const caseRef = await db.collection(PATROL_CASES_COLLECTION).add(patrolCase);
  patrolCase.caseId = caseRef.id;
  
  await caseRef.update({ caseId: caseRef.id });
  
  console.log(`[Case Prioritization] Created ${priority} priority case ${caseRef.id} for user ${subjectUserId} (category: ${category})`);
  
  // Notify moderation team based on priority
  await notifyModerationTeam({
    caseId: caseRef.id,
    priority,
    category,
    urgencyScore,
  });
  
  // Take immediate action for critical cases
  if (priority === 'CRITICAL') {
    await takeImmediateAction(patrolCase);
  }
  
  return caseRef.id;
}

/**
 * Calculate case priority based on category
 */
function calculateCasePriority(
  category: PatrolCase['category'],
  detectionSignals: PatrolEventType[]
): CasePriority {
  const weights = DEFAULT_PATROL_CONFIG.priorityWeights;
  
  // Category-based priority
  switch (category) {
    case 'CHILD_SAFETY':
      return 'CRITICAL';  // Always maximum priority
    
    case 'THREATS_VIOLENCE':
      // Check for specific threat signals
      if (detectionSignals.includes('COORDINATED_ATTACK')) {
        return 'CRITICAL';
      }
      return 'VERY_HIGH';
    
    case 'SEXUAL_COERCION':
      return 'HIGH';
    
    case 'PIRACY':
      return 'HIGH';
    
    case 'HARASSMENT':
      // Escalate if multiple harassment signals
      if (detectionSignals.length >= 3) {
        return 'HIGH';
      }
      return 'MEDIUM';
    
    case 'SPAM':
      return 'LOW';
    
    default:
      return 'MEDIUM';
  }
}

/**
 * Calculate harm potential (0-100)
 */
function calculateHarmPotential(
  category: PatrolCase['category'],
  detectionSignals: PatrolEventType[]
): number {
  const categoryHarm: Record<PatrolCase['category'], number> = {
    'CHILD_SAFETY': 100,
    'THREATS_VIOLENCE': 90,
    'SEXUAL_COERCION': 80,
    'PIRACY': 60,
    'HARASSMENT': 50,
    'SPAM': 20,
  };
  
  let baseHarm = categoryHarm[category] || 50;
  
  // Increase harm for multiple signals
  if (detectionSignals.length >= 3) {
    baseHarm = Math.min(baseHarm * 1.3, 100);
  }
  
  // Specific signal adjustments
  if (detectionSignals.includes('COORDINATED_ATTACK')) {
    baseHarm = Math.min(baseHarm + 20, 100);
  }
  
  if (detectionSignals.includes('LOCATION_STALKING')) {
    baseHarm = Math.min(baseHarm + 15, 100);
  }
  
  return Math.round(baseHarm);
}

/**
 * Calculate urgency score (0-100)
 */
function calculateUrgencyScore(
  category: PatrolCase['category'],
  harmPotential: number,
  detectionSignals: PatrolEventType[]
): number {
  // Base urgency on harm potential
  let urgency = harmPotential;
  
  // Increase urgency for active threats
  const activeThreats = [
    'COORDINATED_ATTACK',
    'LOCATION_STALKING',
    'BAN_EVASION',
  ];
  
  const hasActiveThreats = detectionSignals.some(signal => activeThreats.includes(signal));
  if (hasActiveThreats) {
    urgency = Math.min(urgency + 20, 100);
  }
  
  // Child safety is always urgent
  if (category === 'CHILD_SAFETY') {
    urgency = 100;
  }
  
  return Math.round(urgency);
}

/**
 * Calculate risk score from detection signals
 */
function calculateRiskScoreFromSignals(detectionSignals: PatrolEventType[]): number {
  const signalWeights: Record<PatrolEventType, number> = {
    'HARASSMENT_CYCLE': 20,
    'NSFW_BYPASS_ATTEMPT': 15,
    'BAN_EVASION': 35,
    'DECEPTIVE_MONETIZATION': 20,
    'PIRACY_ATTEMPT': 25,
    'MULTI_ACCOUNT_ABUSE': 30,
    'CONSENT_VIOLATION': 25,
    'PAYMENT_FRAUD': 30,
    'LOCATION_STALKING': 35,
    'COORDINATED_ATTACK': 40,
  };
  
  let totalScore = 0;
  for (const signal of detectionSignals) {
    totalScore += signalWeights[signal] || 10;
  }
  
  return Math.min(totalScore, 100);
}

// ============================================================================
// IMMEDIATE ACTIONS FOR CRITICAL CASES
// ============================================================================

/**
 * Take immediate action for critical cases
 */
async function takeImmediateAction(patrolCase: PatrolCase): Promise<void> {
  console.log(`[Case Prioritization] Taking immediate action for critical case ${patrolCase.caseId}`);
  
  // Freeze all active conversations involving this user
  await freezeUserConversations(patrolCase.subjectUserId, patrolCase.caseId);
  
  // Update case status
  await db.collection(PATROL_CASES_COLLECTION).doc(patrolCase.caseId).update({
    conversationFrozen: true,
  });
  
  // For specific categories, take additional actions
  if (patrolCase.category === 'CHILD_SAFETY' || patrolCase.category === 'THREATS_VIOLENCE') {
    // Lock account immediately
    await lockAccountPendingReview(patrolCase.subjectUserId);
    
    await db.collection(PATROL_CASES_COLLECTION).doc(patrolCase.caseId).update({
      accountLocked: true,
    });
  }
}

/**
 * Freeze all conversations for a user
 */
export async function freezeUserConversations(
  userId: string,
  caseId: string
): Promise<number> {
  // Get all active conversations
  const conversations = await db.collection('conversations')
    .where('participantIds', 'array-contains', userId)
    .where('status', '==', 'ACTIVE')
    .get();
  
  if (conversations.empty) {
    return 0;
  }
  
  let frozenCount = 0;
  
  for (const conversationDoc of conversations.docs) {
    const conversationId = conversationDoc.id;
    const participantIds = conversationDoc.data().participantIds;
    
    await freezeConversation({
      conversationId,
      reason: 'Safety review in progress',
      caseId,
      participantIds,
    });
    
    frozenCount++;
  }
  
  console.log(`[Case Prioritization] Frozen ${frozenCount} conversations for user ${userId}`);
  
  return frozenCount;
}

/**
 * Freeze a specific conversation
 */
export async function freezeConversation(input: {
  conversationId: string;
  reason: string;
  caseId: string;
  participantIds: string[];
}): Promise<void> {
  const { conversationId, reason, caseId, participantIds } = input;
  
  const frozenConversation = {
    conversationId,
    participantIds,
    frozenBy: 'PATROL_AI' as const,
    reason,
    relatedCaseId: caseId,
    frozenAt: Timestamp.now(),
    neutralBannerShown: true,
    bannerMessage: 'Some recent actions triggered a safety review; we\'ve paused messaging temporarily while we verify.',
    status: 'FROZEN' as const,
  };
  
  await db.collection(FROZEN_CONVERSATIONS_COLLECTION).doc(conversationId).set(frozenConversation);
  
  // Update conversation status
  await db.collection('conversations').doc(conversationId).update({
    status: 'FROZEN',
    frozenAt: Timestamp.now(),
  });
}

/**
 * Unfreeze a conversation
 */
export async function unfreezeConversation(conversationId: string): Promise<void> {
  await db.collection(FROZEN_CONVERSATIONS_COLLECTION).doc(conversationId).update({
    unfrozenAt: Timestamp.now(),
    status: 'UNFROZEN',
  });
  
  await db.collection('conversations').doc(conversationId).update({
    status: 'ACTIVE',
    frozenAt: null,
  });
  
  console.log(`[Case Prioritization] Unfroze conversation ${conversationId}`);
}

/**
 * Lock account pending review
 */
async function lockAccountPendingReview(userId: string): Promise<void> {
  await db.collection('user_enforcement_state').doc(userId).set({
    accountStatus: 'HARD_RESTRICTED',
    reasonCodes: ['CRITICAL_SAFETY_CASE'],
    restrictedAt: Timestamp.now(),
    requiresManualReview: true,
  }, { merge: true });
}

// ============================================================================
// MODERATION TEAM NOTIFICATIONS
// ============================================================================

/**
 * Notify moderation team based on priority
 */
export async function notifyModerationTeam(input: NotifyModerationTeamInput): Promise<void> {
  const { caseId, priority, category, urgencyScore } = input;
  
  // Determine notification channel based on priority
  const notificationChannel = getNotificationChannel(priority);
  
  const notification = {
    type: 'PATROL_CASE_CREATED',
    caseId,
    priority,
    category,
    urgencyScore,
    channel: notificationChannel,
    createdAt: Timestamp.now(),
    requiresImmediate: priority === 'CRITICAL',
  };
  
  await db.collection('moderation_notifications').add(notification);
  
  console.log(`[Case Prioritization] Notified moderation team via ${notificationChannel} for ${priority} case ${caseId}`);
}

/**
 * Get notification channel based on priority
 */
function getNotificationChannel(priority: CasePriority): string {
  switch (priority) {
    case 'CRITICAL':
      return 'EMERGENCY_ALERT';  // SMS/phone
    case 'VERY_HIGH':
      return 'HIGH_PRIORITY_QUEUE';  // Push notification
    case 'HIGH':
      return 'PRIORITY_QUEUE';
    case 'MEDIUM':
      return 'STANDARD_QUEUE';
    case 'LOW':
      return 'BACKGROUND_QUEUE';
  }
}

// ============================================================================
// CASE MANAGEMENT
// ============================================================================

/**
 * Get cases by priority
 */
export async function getCasesByPriority(
  priority: CasePriority,
  limit: number = 50
): Promise<PatrolCase[]> {
  const snapshot = await db.collection(PATROL_CASES_COLLECTION)
    .where('priority', '==', priority)
    .where('status', 'in', ['PENDING', 'IN_REVIEW'])
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PatrolCase);
}

/**
 * Get cases by category
 */
export async function getCasesByCategory(
  category: PatrolCase['category'],
  limit: number = 50
): Promise<PatrolCase[]> {
  const snapshot = await db.collection(PATROL_CASES_COLLECTION)
    .where('category', '==', category)
    .where('status', 'in', ['PENDING', 'IN_REVIEW'])
    .orderBy('urgencyScore', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PatrolCase);
}

/**
 * Get unassigned cases ordered by urgency
 */
export async function getUnassignedCases(limit: number = 50): Promise<PatrolCase[]> {
  const snapshot = await db.collection(PATROL_CASES_COLLECTION)
    .where('status', '==', 'PENDING')
    .orderBy('urgencyScore', 'desc')
    .orderBy('createdAt', 'asc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data() as PatrolCase);
}

/**
 * Assign case to moderator
 */
export async function assignCase(
  caseId: string,
  moderatorId: string
): Promise<void> {
  await db.collection(PATROL_CASES_COLLECTION).doc(caseId).update({
    assignedTo: moderatorId,
    assignedAt: Timestamp.now(),
    status: 'IN_REVIEW',
  });
  
  console.log(`[Case Prioritization] Assigned case ${caseId} to moderator ${moderatorId}`);
}

/**
 * Resolve case
 */
export async function resolveCase(
  caseId: string,
  resolution: PatrolCase['resolution'],
  resolutionNotes?: string
): Promise<void> {
  await db.collection(PATROL_CASES_COLLECTION).doc(caseId).update({
    status: 'RESOLVED',
    resolution,
    resolutionNotes,
    resolvedAt: Timestamp.now(),
  });
  
  // If false positive, unfreeze conversations
  if (resolution === 'FALSE_POSITIVE' || resolution === 'NO_ACTION') {
    const caseDoc = await db.collection(PATROL_CASES_COLLECTION).doc(caseId).get();
    const caseData = caseDoc.data() as PatrolCase;
    
    if (caseData.conversationFrozen) {
      // Unfreeze all conversations frozen by this case
      const frozenConversations = await db.collection(FROZEN_CONVERSATIONS_COLLECTION)
        .where('relatedCaseId', '==', caseId)
        .where('status', '==', 'FROZEN')
        .get();
      
      for (const frozenDoc of frozenConversations.docs) {
        await unfreezeConversation(frozenDoc.id);
      }
    }
    
    // Unlock account if it was locked
    if (caseData.accountLocked && resolution === 'FALSE_POSITIVE') {
      await db.collection('user_enforcement_state').doc(caseData.subjectUserId).update({
        accountStatus: 'ACTIVE',
        reasonCodes: [],
      });
    }
  }
  
  console.log(`[Case Prioritization] Resolved case ${caseId} with ${resolution}`);
}

/**
 * Escalate case to higher priority
 */
export async function escalateCase(
  caseId: string,
  newPriority: CasePriority,
  escalationReason: string
): Promise<void> {
  await db.collection(PATROL_CASES_COLLECTION).doc(caseId).update({
    priority: newPriority,
    status: 'ESCALATED',
  });
  
  // Notify moderation team of escalation
  await db.collection('moderation_notifications').add({
    type: 'CASE_ESCALATED',
    caseId,
    newPriority,
    escalationReason,
    createdAt: Timestamp.now(),
    requiresImmediate: newPriority === 'CRITICAL',
  });
  
  console.log(`[Case Prioritization] Escalated case ${caseId} to ${newPriority}`);
}

/**
 * Get case statistics
 */
export async function getCaseStatistics(daysBack: number = 30): Promise<{
  totalCases: number;
  byPriority: Record<CasePriority, number>;
  byCategory: Record<string, number>;
  averageResolutionTime: number;
  pendingCases: number;
}> {
  const cutoffDate = Timestamp.fromMillis(
    Date.now() - (daysBack * 24 * 60 * 60 * 1000)
  );
  
  const snapshot = await db.collection(PATROL_CASES_COLLECTION)
    .where('createdAt', '>', cutoffDate)
    .get();
  
  const byPriority: Record<CasePriority, number> = {
    CRITICAL: 0,
    VERY_HIGH: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  
  const byCategory: Record<string, number> = {};
  let totalResolutionTime = 0;
  let resolvedCount = 0;
  let pendingCases = 0;
  
  for (const doc of snapshot.docs) {
    const caseData = doc.data() as PatrolCase;
    
    byPriority[caseData.priority]++;
    
    byCategory[caseData.category] = (byCategory[caseData.category] || 0) + 1;
    
    if (caseData.status === 'PENDING' || caseData.status === 'IN_REVIEW') {
      pendingCases++;
    }
    
    if (caseData.resolvedAt) {
      const resolutionTime = caseData.resolvedAt.toMillis() - caseData.createdAt.toMillis();
      totalResolutionTime += resolutionTime;
      resolvedCount++;
    }
  }
  
  return {
    totalCases: snapshot.size,
    byPriority,
    byCategory,
    averageResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount / (1000 * 60 * 60) : 0,  // hours
    pendingCases,
  };
}