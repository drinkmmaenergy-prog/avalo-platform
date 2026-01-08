/**
 * PACK 178 - Anti-Grooming Protection System
 * Detects adult attempts to psychologically manipulate or groom vulnerable users
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';

const db = admin.firestore();

export interface GroomingDetectionResult {
  detected: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  patterns: string[];
  confidence: number;
  action: 'flag' | 'freeze_chat' | 'lock_account' | 'escalate';
}

export interface GroomingEvent {
  senderId: string;
  recipientId: string;
  conversationId: string;
  messageId: string;
  messageContent: string;
  detectedPatterns: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Timestamp;
  actionTaken: 'flag' | 'freeze_chat' | 'lock_account' | 'escalate';
  escalated: boolean;
  reviewStatus: 'pending' | 'confirmed' | 'false_positive';
  reviewerId?: string;
  reviewNotes?: string;
}

const INFANTILIZATION_REQUESTS = [
  /\b(?:talk|speak|sound)\s*like\s*a\s*(?:little\s*)?(?:girl|boy)\b/i,
  /\bact\s*(?:innocent|young|childish|cute|sweet)\s*(?:for\s*me)?\b/i,
  /\bcall\s*me\s*(?:daddy|mommy|papa|mama)\b/i,
  /\b(?:you'?re|you\s*are)\s*(?:my\s*)?(?:little|baby|sweet)\s*(?:girl|boy)\b/i,
  /\bpretend\s*(?:you'?re|you\s*are)\s*(?:younger|innocent|naive)\b/i,
  /\bchildlike\s*(?:voice|behavior|manner|innocence)\b/i,
  /\b(?:be\s*my|act\s*like\s*my)\s*(?:little|baby)\b/i
];

const DRESS_YOUNGER_REQUESTS = [
  /\bdress\s*(?:more\s*)?(?:younger|like\s*a\s*(?:girl|boy|teen))\b/i,
  /\bwear\s*(?:pigtails|ribbons|bows)\b/i,
  /\bschool\s*uniform\s*(?:for\s*me)?\b/i,
  /\bact\s*underage\s*(?:for\s*me)?\b/i,
  /\blook\s*(?:more\s*)?(?:innocent|younger|childish)\b/i,
  /\bremove\s*(?:your\s*)?makeup\s*to\s*look\s*younger\b/i
];

const CHILDLIKE_PHOTO_REQUESTS = [
  /\bsend\s*(?:me\s*)?(?:cute|innocent|sweet)\s*(?:pics|photos|pictures)\b/i,
  /\b(?:pics|photos|pictures)\s*(?:of\s*you\s*)?(?:looking|dressed)\s*(?:young|innocent)\b/i,
  /\bshow\s*me\s*your\s*(?:innocent|sweet|cute)\s*side\b/i,
  /\b(?:can\s*you\s*)?look\s*younger\s*in\s*(?:pics|photos)\b/i
];

const MANIPULATION_TACTICS = [
  /\bprove\s*(?:your\s*)?(?:love|loyalty|devotion)\b/i,
  /\bif\s*you\s*(?:really\s*)?(?:loved|cared\s*about)\s*me\b/i,
  /\b(?:I'?ll|I\s*will)\s*leave\s*(?:you\s*)?(?:unless|if\s*you\s*don'?t)\b/i,
  /\bno\s*one\s*(?:else\s*)?(?:will\s*)?(?:love|want|accept)\s*you\b/i,
  /\byou\s*owe\s*me\b/i,
  /\bafter\s*(?:all|everything)\s*I'?ve\s*done\s*for\s*you\b/i,
  /\byou'?re\s*(?:mine|my\s*property)\b/i,
  /\bdon'?t\s*tell\s*anyone\s*(?:about\s*(?:this|us))?\b/i,
  /\bthis\s*is\s*(?:our\s*)?(?:secret|special\s*thing)\b/i
];

const ISOLATION_TACTICS = [
  /\bdon'?t\s*talk\s*to\s*(?:other|anyone\s*else)\b/i,
  /\bdelete\s*(?:your\s*)?(?:friends|contacts)\b/i,
  /\byou\s*don'?t\s*need\s*(?:them|anyone\s*else)\b/i,
  /\b(?:they|others)\s*(?:don'?t|won'?t)\s*understand\s*(?:us|you)\b/i,
  /\bI'?m\s*the\s*only\s*one\s*who\s*(?:really\s*)?(?:loves|understands|cares\s*about)\s*you\b/i
];

const FINANCIAL_EMOTIONAL_PRESSURE = [
  /\b(?:send|give)\s*me\s*money\s*(?:or|otherwise)\b/i,
  /\bprove\s*your\s*love\s*with\s*(?:money|payment|gift)\b/i,
  /\bif\s*you\s*(?:really\s*)?loved\s*me\s*you'?d\s*(?:pay|send|give)\b/i,
  /\bI'?ll\s*leave\s*unless\s*you\s*(?:pay|send|give)\b/i,
  /\byou\s*owe\s*me\s*(?:money|payment)\b/i
];

const PROGRESSIVE_BOUNDARY_PUSHING = [
  /\bjust\s*(?:one\s*more|a\s*little)\b.*\b(?:pic|photo|video)\b/i,
  /\byou\s*(?:already\s*)?(?:did|showed|sent)\s*(?:that|it)\s*(?:before|earlier)\b/i,
  /\bif\s*you\s*(?:can|could)\s*do\s*(?:that|it)\s*you\s*can\s*do\s*this\b/i,
  /\blet'?s\s*(?:try|do)\s*something\s*(?:new|different|more)\b/i
];

export async function detectGroomingPattern(
  senderId: string,
  recipientId: string,
  conversationId: string,
  messageId: string,
  messageContent: string
): Promise<GroomingDetectionResult> {
  try {
    const detectedPatterns: { category: string; pattern: string; severity: number }[] = [];

    const infantilizationMatches = INFANTILIZATION_REQUESTS.filter(p => p.test(messageContent));
    infantilizationMatches.forEach(pattern => {
      detectedPatterns.push({
        category: 'infantilization_request',
        pattern: pattern.source,
        severity: 95
      });
    });

    const dressYoungerMatches = DRESS_YOUNGER_REQUESTS.filter(p => p.test(messageContent));
    dressYoungerMatches.forEach(pattern => {
      detectedPatterns.push({
        category: 'dress_younger_request',
        pattern: pattern.source,
        severity: 95
      });
    });

    const childlikePhotoMatches = CHILDLIKE_PHOTO_REQUESTS.filter(p => p.test(messageContent));
    childlikePhotoMatches.forEach(pattern => {
      detectedPatterns.push({
        category: 'childlike_photo_request',
        pattern: pattern.source,
        severity: 98
      });
    });

    const manipulationMatches = MANIPULATION_TACTICS.filter(p => p.test(messageContent));
    manipulationMatches.forEach(pattern => {
      detectedPatterns.push({
        category: 'manipulation_tactic',
        pattern: pattern.source,
        severity: 85
      });
    });

    const isolationMatches = ISOLATION_TACTICS.filter(p => p.test(messageContent));
    isolationMatches.forEach(pattern => {
      detectedPatterns.push({
        category: 'isolation_tactic',
        pattern: pattern.source,
        severity: 90
      });
    });

    const financialPressureMatches = FINANCIAL_EMOTIONAL_PRESSURE.filter(p => p.test(messageContent));
    financialPressureMatches.forEach(pattern => {
      detectedPatterns.push({
        category: 'financial_emotional_pressure',
        pattern: pattern.source,
        severity: 80
      });
    });

    const boundaryPushingMatches = PROGRESSIVE_BOUNDARY_PUSHING.filter(p => p.test(messageContent));
    boundaryPushingMatches.forEach(pattern => {
      detectedPatterns.push({
        category: 'boundary_pushing',
        pattern: pattern.source,
        severity: 75
      });
    });

    if (detectedPatterns.length === 0) {
      return {
        detected: false,
        severity: 'low',
        patterns: [],
        confidence: 0,
        action: 'flag'
      };
    }

    const maxSeverity = Math.max(...detectedPatterns.map(p => p.severity));
    const avgConfidence = detectedPatterns.reduce((sum, p) => sum + p.severity, 0) / detectedPatterns.length;

    let severity: GroomingDetectionResult['severity'];
    let action: GroomingDetectionResult['action'];

    if (maxSeverity >= 95 || detectedPatterns.length >= 3) {
      severity = 'critical';
      action = 'escalate';
    } else if (maxSeverity >= 85 || detectedPatterns.length >= 2) {
      severity = 'high';
      action = 'lock_account';
    } else if (maxSeverity >= 75) {
      severity = 'medium';
      action = 'freeze_chat';
    } else {
      severity = 'low';
      action = 'flag';
    }

    const groomingEvent: Omit<GroomingEvent, 'id'> = {
      senderId,
      recipientId,
      conversationId,
      messageId,
      messageContent: messageContent.substring(0, 500),
      detectedPatterns: detectedPatterns.map(p => `${p.category}: ${p.pattern}`),
      severity,
      detectedAt: Timestamp.now(),
      actionTaken: action,
      escalated: action === 'escalate',
      reviewStatus: 'pending'
    };

    const eventRef = await db.collection('grooming_events').add({
      ...groomingEvent,
      createdAt: Timestamp.now()
    });

    await db.collection('minor_risk_events').add({
      userId: senderId,
      eventType: 'grooming_detected',
      timestamp: Timestamp.now(),
      severity,
      groomingEventId: eventRef.id,
      metadata: {
        recipientId,
        conversationId,
        patternCount: detectedPatterns.length,
        maxSeverity,
        action
      }
    });

    if (action === 'freeze_chat') {
      await freezeConversation(conversationId, senderId, recipientId);
    } else if (action === 'lock_account') {
      await lockSenderAccount(senderId, eventRef.id);
    } else if (action === 'escalate') {
      await escalateCase(eventRef.id, senderId, recipientId);
    }

    return {
      detected: true,
      severity,
      patterns: detectedPatterns.map(p => p.category),
      confidence: avgConfidence,
      action
    };
  } catch (error) {
    logger.error('Grooming detection error:', error);
    throw error;
  }
}

async function freezeConversation(
  conversationId: string,
  senderId: string,
  recipientId: string
): Promise<void> {
  try {
    const conversationRef = db.collection('conversations').doc(conversationId);
    
    await conversationRef.update({
      frozen: true,
      frozenAt: Timestamp.now(),
      frozenReason: 'grooming_pattern_detected',
      frozenBy: 'system',
      messagesDisabled: true,
      updatedAt: Timestamp.now()
    });

    await db.collection('notifications').add({
      userId: recipientId,
      type: 'safety_alert',
      title: 'Conversation Frozen',
      message: 'This conversation has been frozen due to detected safety concerns. Our team is reviewing.',
      priority: 'high',
      read: false,
      createdAt: Timestamp.now()
    });

    logger.info(`Conversation ${conversationId} frozen due to grooming detection`);
  } catch (error) {
    logger.error('Conversation freeze error:', error);
    throw error;
  }
}

async function lockSenderAccount(senderId: string, eventId: string): Promise<void> {
  try {
    const userRef = db.collection('users').doc(senderId);
    
    await userRef.update({
      accountStatus: 'locked',
      lockedAt: Timestamp.now(),
      lockReason: 'grooming_behavior_detected',
      lockedByEventId: eventId,
      requiresManualReview: true,
      updatedAt: Timestamp.now()
    });

    await db.collection('minor_risk_events').add({
      userId: senderId,
      eventType: 'account_locked',
      timestamp: Timestamp.now(),
      severity: 'critical',
      metadata: {
        reason: 'grooming_behavior',
        eventId
      }
    });

    logger.info(`Account ${senderId} locked due to grooming detection`);
  } catch (error) {
    logger.error('Account lock error:', error);
    throw error;
  }
}

async function escalateCase(
  eventId: string,
  senderId: string,
  recipientId: string
): Promise<void> {
  try {
    await lockSenderAccount(senderId, eventId);

    await db.collection('case_escalations').add({
      eventId,
      eventType: 'grooming',
      senderId,
      recipientId,
      severity: 'critical',
      escalatedAt: Timestamp.now(),
      status: 'pending_law_enforcement',
      requiresLawEnforcement: true,
      assignedTo: null,
      notes: 'Critical grooming patterns detected - potential child safety issue',
      createdAt: Timestamp.now()
    });

    await db.collection('minor_risk_events').add({
      userId: senderId,
      eventType: 'case_escalated',
      timestamp: Timestamp.now(),
      severity: 'critical',
      metadata: {
        eventId,
        escalationType: 'law_enforcement',
        recipientId
      }
    });

    logger.warn(`Case escalated for law enforcement: ${eventId}`);
  } catch (error) {
    logger.error('Case escalation error:', error);
    throw error;
  }
}

export async function analyzeConversationHistory(
  conversationId: string,
  senderId: string,
  recipientId: string
): Promise<{
  riskScore: number;
  patterns: string[];
  recommendation: 'safe' | 'monitor' | 'freeze' | 'escalate';
}> {
  try {
    const messages = await db
      .collection('messages')
      .where('conversationId', '==', conversationId)
      .where('senderId', '==', senderId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    let totalPatterns = 0;
    const detectedCategories = new Set<string>();

    for (const messageDoc of messages.docs) {
      const message = messageDoc.data();
      const result = await detectGroomingPattern(
        senderId,
        recipientId,
        conversationId,
        messageDoc.id,
        message.content || ''
      );

      if (result.detected) {
        totalPatterns += result.patterns.length;
        result.patterns.forEach(p => detectedCategories.add(p));
      }
    }

    const riskScore = Math.min(100, totalPatterns * 15 + detectedCategories.size * 10);

    let recommendation: 'safe' | 'monitor' | 'freeze' | 'escalate';
    if (riskScore >= 80) {
      recommendation = 'escalate';
    } else if (riskScore >= 60) {
      recommendation = 'freeze';
    } else if (riskScore >= 30) {
      recommendation = 'monitor';
    } else {
      recommendation = 'safe';
    }

    return {
      riskScore,
      patterns: Array.from(detectedCategories),
      recommendation
    };
  } catch (error) {
    logger.error('Conversation analysis error:', error);
    throw error;
  }
}