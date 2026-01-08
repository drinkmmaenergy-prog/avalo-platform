/**
 * PACK 410 - Analytics Event Ingestion
 * Core event logging and processing system
 */

import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { AnalyticsEvent, AnalyticsEventType } from '../../types/analytics.types';

const db = admin.firestore();

/**
 * Log analytics event with audit trail
 * Server-only execution, immutable writes
 */
export async function logAnalyticsEvent(eventPayload: Partial<AnalyticsEvent>): Promise<string> {
  try {
    // Generate event ID if not provided
    const eventId = eventPayload.eventId || generateEventId();
    
    // Hash user ID for GDPR compliance
    const hashedUserId = eventPayload.userId ? hashUserId(eventPayload.userId) : '';
    
    // Create audit hash
    const auditHash = generateAuditHash(eventId, hashedUserId, eventPayload.timestamp || Date.now());
    
    // Validate required fields
    if (!eventPayload.eventType) {
      throw new Error('eventType is required');
    }
    
    // Build complete event
    const event: AnalyticsEvent = {
      eventId,
      userId: hashedUserId,
      creatorId: eventPayload.creatorId,
      aiId: eventPayload.aiId,
      timestamp: eventPayload.timestamp || Date.now(),
      eventType: eventPayload.eventType,
      sourcePack: eventPayload.sourcePack || 'unknown',
      geo: eventPayload.geo || { country: 'unknown' },
      device: eventPayload.device || { platform: 'web', version: 'unknown' },
      sessionId: eventPayload.sessionId || generateSessionId(),
      revenueImpact: eventPayload.revenueImpact || 0,
      riskScore: eventPayload.riskScore || 0,
      metadata: eventPayload.metadata || {},
      auditHash,
    };
    
    // Write to Firestore (immutable)
    await db.collection('analytics_events').doc(eventId).set(event);
    
    // Trigger async processing
    await triggerEventProcessing(event);
    
    return eventId;
  } catch (error) {
    console.error('Failed to log analytics event:', error);
    // Log to error collection for monitoring
    await db.collection('analytics_errors').add({
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : String(error),
      payload: eventPayload,
    });
    throw error;
  }
}

/**
 * Generate unique event ID
 */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Hash user ID for GDPR compliance
 */
function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex');
}

/**
 * Generate session ID
 */
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate audit hash for immutability verification
 */
function generateAuditHash(eventId: string, userId: string, timestamp: number): string {
  const data = `${eventId}:${userId}:${timestamp}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Trigger async event processing
 */
async function triggerEventProcessing(event: AnalyticsEvent): Promise<void> {
  const tasks: Promise<void>[] = [];
  
  // Update user lifecycle
  if (event.userId) {
    tasks.push(updateUserLifecycle(event));
  }
  
  // Update creator earnings
  if (event.creatorId && event.revenueImpact > 0) {
    tasks.push(updateCreatorEarnings(event));
  }
  
  // Update AI usage
  if (event.aiId) {
    tasks.push(updateAIUsage(event));
  }
  
  // Check for fraud signals
  if (event.riskScore > 50) {
    tasks.push(createFraudSignal(event));
  }
  
  // Record safety events
  if (isSafetyEvent(event.eventType)) {
    tasks.push(recordSafetyEvent(event));
  }
  
  // Update marketing attribution
  if (event.eventType === AnalyticsEventType.USER_SIGNUP) {
    tasks.push(recordMarketingAttribution(event));
  }
  
  // Update wallet flow
  if (isWalletEvent(event.eventType)) {
    tasks.push(recordWalletFlow(event));
  }
  
  // Execute all tasks in parallel
  await Promise.allSettled(tasks);
}

/**
 * Update user lifecycle metrics
 */
async function updateUserLifecycle(event: AnalyticsEvent): Promise<void> {
  const lifecycleRef = db.collection('analytics_user_lifecycle').doc(event.userId);
  
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(lifecycleRef);
    
    if (!doc.exists) {
      // New user
      transaction.set(lifecycleRef, {
        userId: event.userId,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        totalSessions: 1,
        totalRevenue: event.revenueImpact,
        totalTokensSpent: 0,
        lifetimeValue: event.revenueImpact,
        cohort: getCohort(event.timestamp),
        status: 'active',
        riskLevel: getRiskLevel(event.riskScore),
        segment: 'new',
      });
    } else {
      // Existing user
      const data = doc.data()!;
      transaction.update(lifecycleRef, {
        lastSeen: event.timestamp,
        totalSessions: admin.firestore.FieldValue.increment(1),
        totalRevenue: admin.firestore.FieldValue.increment(event.revenueImpact),
        lifetimeValue: admin.firestore.FieldValue.increment(event.revenueImpact),
        status: getUpdatedStatus(data.lastSeen, event.timestamp),
        riskLevel: getRiskLevel(Math.max(data.riskScore || 0, event.riskScore)),
      });
    }
  });
}

/**
 * Update creator earnings
 */
async function updateCreatorEarnings(event: AnalyticsEvent): Promise<void> {
  const date = new Date(event.timestamp).toISOString().split('T')[0];
  const earningsRef = db
    .collection('analytics_creator_earnings')
    .doc(`${event.creatorId}_${date}`);
  
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(earningsRef);
    
    if (!doc.exists) {
      transaction.set(earningsRef, {
        creatorId: event.creatorId,
        date,
        totalEarnings: event.revenueImpact,
        meetingEarnings: isMeetingEvent(event.eventType) ? event.revenueImpact : 0,
        chatEarnings: isChatEvent(event.eventType) ? event.revenueImpact : 0,
        aiEarnings: isAIEvent(event.eventType) ? event.revenueImpact : 0,
        tokenEarnings: isTokenEvent(event.eventType) ? event.revenueImpact : 0,
        conversionRate: 0,
        activeFollowers: 0,
        disputes: 0,
        refunds: 0,
        netEarnings: event.revenueImpact,
      });
    } else {
      const updates: any = {
        totalEarnings: admin.firestore.FieldValue.increment(event.revenueImpact),
        netEarnings: admin.firestore.FieldValue.increment(event.revenueImpact),
      };
      
      if (isMeetingEvent(event.eventType)) {
        updates.meetingEarnings = admin.firestore.FieldValue.increment(event.revenueImpact);
      }
      if (isChatEvent(event.eventType)) {
        updates.chatEarnings = admin.firestore.FieldValue.increment(event.revenueImpact);
      }
      if (isAIEvent(event.eventType)) {
        updates.aiEarnings = admin.firestore.FieldValue.increment(event.revenueImpact);
      }
      if (isTokenEvent(event.eventType)) {
        updates.tokenEarnings = admin.firestore.FieldValue.increment(event.revenueImpact);
      }
      
      transaction.update(earningsRef, updates);
    }
  });
}

/**
 * Update AI usage metrics
 */
async function updateAIUsage(event: AnalyticsEvent): Promise<void> {
  const date = new Date(event.timestamp).toISOString().split('T')[0];
  const usageRef = db.collection('analytics_ai_usage').doc(`${event.aiId}_${date}`);
  
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(usageRef);
    
    if (!doc.exists) {
      transaction.set(usageRef, {
        aiId: event.aiId,
        date,
        interactions: 1,
        revenue: event.revenueImpact,
        activeUsers: 1,
        avgSessionLength: 0,
        satisfactionScore: 0,
        trainingEvents: event.eventType === AnalyticsEventType.AI_TRAINING ? 1 : 0,
        errorRate: 0,
      });
    } else {
      transaction.update(usageRef, {
        interactions: admin.firestore.FieldValue.increment(1),
        revenue: admin.firestore.FieldValue.increment(event.revenueImpact),
        trainingEvents: event.eventType === AnalyticsEventType.AI_TRAINING 
          ? admin.firestore.FieldValue.increment(1) 
          : admin.firestore.FieldValue.increment(0),
      });
    }
  });
}

/**
 * Create fraud signal
 */
async function createFraudSignal(event: AnalyticsEvent): Promise<void> {
  await db.collection('fraud_signals').add({
    userId: event.userId,
    timestamp: event.timestamp,
    signalType: 'analytics_event',
    severity: event.riskScore,
    indicators: [event.eventType],
    metadata: {
      eventId: event.eventId,
      sourcePack: event.sourcePack,
      ...event.metadata,
    },
    actionRequired: event.riskScore > 75,
  });
}

/**
 * Record safety event
 */
async function recordSafetyEvent(event: AnalyticsEvent): Promise<void> {
  await db.collection('analytics_safety_events').add({
    eventId: event.eventId,
    timestamp: event.timestamp,
    reportedUserId: event.metadata.reportedUserId,
    reportedCreatorId: event.metadata.reportedCreatorId,
    reportedAiId: event.metadata.reportedAiId,
    category: event.metadata.category || 'unknown',
    severity: event.metadata.severity || 'medium',
    actionTaken: event.metadata.actionTaken || 'pending',
  });
}

/**
 * Record marketing attribution
 */
async function recordMarketingAttribution(event: AnalyticsEvent): Promise<void> {
  await db.collection('analytics_marketing_attribution').doc(event.userId).set({
    userId: event.userId,
    installSource: event.metadata.installSource || 'organic',
    campaignId: event.metadata.campaignId,
    influencerId: event.metadata.influencerId,
    referralChain: event.metadata.referralChain || [],
    country: event.geo.country,
    cpi: 0,
    cac: 0,
    ltv: 0,
    roi: 0,
    installedAt: event.timestamp,
  });
}

/**
 * Record wallet flow
 */
async function recordWalletFlow(event: AnalyticsEvent): Promise<void> {
  const flowType = getWalletFlowType(event.eventType);
  
  await db.collection('analytics_wallet_flow').add({
    userId: event.userId,
    timestamp: event.timestamp,
    type: flowType,
    amount: Math.abs(event.revenueImpact),
    currency: event.metadata.currency || 'USD',
    source: event.metadata.source || 'unknown',
    destination: event.metadata.destination || 'unknown',
    category: event.eventType,
    flagged: event.riskScore > 60,
    flagReason: event.riskScore > 60 ? 'high_risk_score' : undefined,
  });
}

// Helper functions

function getCohort(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getRiskLevel(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
  if (riskScore < 25) return 'low';
  if (riskScore < 50) return 'medium';
  if (riskScore < 75) return 'high';
  return 'critical';
}

function getUpdatedStatus(lastSeen: number, currentTime: number): 'active' | 'inactive' | 'churned' {
  const daysSinceLastSeen = (currentTime - lastSeen) / (1000 * 60 * 60 * 24);
  if (daysSinceLastSeen < 7) return 'active';
  if (daysSinceLastSeen < 30) return 'inactive';
  return 'churned';
}

function isSafetyEvent(eventType: AnalyticsEventType): boolean {
  return [
    AnalyticsEventType.SAFETY_REPORT,
    AnalyticsEventType.SAFETY_ACTION,
    AnalyticsEventType.ACCOUNT_SUSPENDED,
  ].includes(eventType);
}

function isWalletEvent(eventType: AnalyticsEventType): boolean {
  return [
    AnalyticsEventType.WALLET_DEPOSIT,
    AnalyticsEventType.WALLET_WITHDRAWAL,
    AnalyticsEventType.TOKEN_PURCHASE,
    AnalyticsEventType.TOKEN_BURN,
    AnalyticsEventType.PAYOUT_INITIATED,
    AnalyticsEventType.PAYOUT_COMPLETED,
  ].includes(eventType);
}

function isMeetingEvent(eventType: AnalyticsEventType): boolean {
  return [
    AnalyticsEventType.MEETING_CREATED,
    AnalyticsEventType.MEETING_BOOKED,
    AnalyticsEventType.MEETING_COMPLETED,
  ].includes(eventType);
}

function isChatEvent(eventType: AnalyticsEventType): boolean {
  return [
    AnalyticsEventType.CHAT_MESSAGE_SENT,
    AnalyticsEventType.CHAT_UNLOCK,
    AnalyticsEventType.CHAT_TOKEN_SPENT,
  ].includes(eventType);
}

function isAIEvent(eventType: AnalyticsEventType): boolean {
  return [
    AnalyticsEventType.AI_CREATED,
    AnalyticsEventType.AI_INTERACTION,
    AnalyticsEventType.AI_REVENUE,
  ].includes(eventType);
}

function isTokenEvent(eventType: AnalyticsEventType): boolean {
  return [
    AnalyticsEventType.TOKEN_PURCHASE,
    AnalyticsEventType.TOKEN_BURN,
    AnalyticsEventType.TOKEN_EARN,
  ].includes(eventType);
}

function getWalletFlowType(eventType: AnalyticsEventType): 'inflow' | 'outflow' {
  const inflowEvents = [
    AnalyticsEventType.WALLET_DEPOSIT,
    AnalyticsEventType.TOKEN_PURCHASE,
    AnalyticsEventType.TOKEN_EARN,
  ];
  return inflowEvents.includes(eventType) ? 'inflow' : 'outflow';
}
