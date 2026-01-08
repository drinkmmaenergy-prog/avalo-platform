/**
 * PACK 178 - Vulnerable Adults Safety Support
 * Protects vulnerable adults from financial and emotional exploitation
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';

const db = admin.firestore();

export interface VulnerableUserProfile {
  userId: string;
  vulnerabilityFactors: {
    disability?: boolean;
    mentalHealthChallenges?: boolean;
    recentGrief?: boolean;
    severeIsolation?: boolean;
    addictionHistory?: boolean;
    recentTrauma?: boolean;
    financialVulnerability?: boolean;
  };
  protectionLevel: 'standard' | 'enhanced' | 'maximum';
  enabledProtections: {
    spendingLimits: boolean;
    highPressureChatFlags: boolean;
    emotionalManipulationTriggers: boolean;
    abusiveChatReview: boolean;
    psychologicalResources: boolean;
  };
  spendingLimit?: {
    dailyLimit: number;
    weeklyLimit: number;
    monthlyLimit: number;
    requireApproval: boolean;
  };
  supportResources: {
    country: string;
    hotlineNumbers: string[];
    resourceLinks: string[];
  };
  lastReviewDate: Timestamp;
  optInDate: Timestamp;
  createdBy: 'user' | 'system' | 'admin';
}

export interface ExploitationDetectionEvent {
  userId: string;
  targetUserId: string;
  eventType: 'financial_pressure' | 'love_bombing' | 'loyalty_test' | 'emotional_blackmail' | 'isolation_attempt';
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Timestamp;
  content: string;
  contentType: 'message' | 'transaction_request' | 'behavior_pattern';
  actionTaken: 'flag' | 'block_transaction' | 'redirect_chat' | 'alert_support';
  metadata: {
    confidence: number;
    matchedPatterns: string[];
    [key: string]: any;
  };
}

const FINANCIAL_PRESSURE_PATTERNS = [
  /\b(?:send|give|pay)\s*me\s*money\s*(?:now|urgently|immediately)\b/i,
  /\bI\s*need\s*(?:money|cash|payment)\s*(?:urgently|desperately|badly)\b/i,
  /\bif\s*you\s*(?:don'?t|won'?t)\s*(?:pay|send|give)\s*me\b/i,
  /\byou\s*(?:must|have\s*to|need\s*to)\s*(?:pay|send|give)\b/i,
  /\b(?:emergency|crisis|urgent)\s*(?:money|payment|help)\b/i
];

const LOVE_BOMBING_PATTERNS = [
  /\byou'?re\s*(?:my\s*)?(?:everything|whole\s*world|only\s*one|soulmate)\b/i,
  /\bI\s*(?:can'?t|cannot)\s*live\s*without\s*you\b/i,
  /\byou'?re\s*(?:perfect|amazing|incredible|the\s*best)\b/i,
  /\bI'?ve\s*never\s*felt\s*this\s*way\b/i,
  /\bwe'?re\s*(?:meant\s*to\s*be|destined|soulmates)\b/i
];

const LOYALTY_TEST_PATTERNS = [
  /\bprove\s*your\s*(?:love|loyalty|devotion|commitment)\b/i,
  /\bif\s*you\s*(?:really|truly)\s*loved\s*me\b/i,
  /\btest\s*(?:your|our)\s*(?:love|relationship)\b/i,
  /\bshow\s*me\s*you\s*care\s*by\b/i,
  /\bdemonstrate\s*your\s*(?:love|commitment)\b/i
];

const EMOTIONAL_BLACKMAIL_PATTERNS = [
  /\bI'?ll\s*(?:leave|end\s*this|break\s*up)\s*(?:if|unless)\b/i,
  /\byou'?ll\s*regret\s*(?:this|it)\b/i,
  /\byou\s*(?:hurt|betrayed|abandoned)\s*me\b/i,
  /\bafter\s*(?:all|everything)\s*I'?ve\s*done\b/i,
  /\byou\s*(?:owe|must)\s*me\b/i,
  /\byou'?re\s*being\s*(?:selfish|ungrateful|cruel)\b/i
];

const ISOLATION_PATTERNS = [
  /\b(?:don'?t|stop)\s*(?:talk|speak)\s*(?:to|with)\s*(?:them|others|anyone)\b/i,
  /\b(?:they|others)\s*(?:don'?t|won'?t)\s*understand\s*(?:us|you)\b/i,
  /\byou\s*only\s*need\s*me\b/i,
  /\bI'?m\s*(?:all|everything)\s*you\s*need\b/i,
  /\b(?:delete|remove|block)\s*(?:them|your\s*friends)\b/i
];

export async function setupVulnerableUserProtection(
  userId: string,
  options: {
    vulnerabilityFactors: VulnerableUserProfile['vulnerabilityFactors'];
    protectionLevel?: VulnerableUserProfile['protectionLevel'];
    spendingLimits?: VulnerableUserProfile['spendingLimit'];
    country?: string;
  },
  createdBy: 'user' | 'system' | 'admin' = 'user'
): Promise<void> {
  try {
    const protectionLevel = options.protectionLevel || determineProtectionLevel(options.vulnerabilityFactors);
    
    const enabledProtections = {
      spendingLimits: protectionLevel !== 'standard',
      highPressureChatFlags: true,
      emotionalManipulationTriggers: true,
      abusiveChatReview: protectionLevel === 'maximum',
      psychologicalResources: true
    };

    const defaultSpendingLimits = {
      dailyLimit: protectionLevel === 'maximum' ? 100 : 500,
      weeklyLimit: protectionLevel === 'maximum' ? 500 : 2000,
      monthlyLimit: protectionLevel === 'maximum' ? 2000 : 5000,
      requireApproval: protectionLevel === 'maximum'
    };

    const supportResources = await getSupportResources(options.country || 'US');

    const profile: Omit<VulnerableUserProfile, 'id'> = {
      userId,
      vulnerabilityFactors: options.vulnerabilityFactors,
      protectionLevel,
      enabledProtections,
      spendingLimit: options.spendingLimits || defaultSpendingLimits,
      supportResources,
      lastReviewDate: Timestamp.now(),
      optInDate: Timestamp.now(),
      createdBy
    };

    await db.collection('vulnerable_user_protection_profiles').doc(userId).set({
      ...profile,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    await db.collection('users').doc(userId).update({
      vulnerableUserProtection: true,
      protectionLevel,
      updatedAt: Timestamp.now()
    });

    await db.collection('minor_risk_events').add({
      userId,
      eventType: 'vulnerable_protection_enabled',
      timestamp: Timestamp.now(),
      metadata: {
        protectionLevel,
        createdBy
      }
    });

    logger.info(`Vulnerable user protection enabled for ${userId} at ${protectionLevel} level`);
  } catch (error) {
    logger.error('Setup vulnerable user protection error:', error);
    throw error;
  }
}

function determineProtectionLevel(
  factors: VulnerableUserProfile['vulnerabilityFactors']
): VulnerableUserProfile['protectionLevel'] {
  const factorCount = Object.values(factors).filter(v => v === true).length;
  
  if (factorCount >= 3 || factors.recentTrauma || factors.severeIsolation) {
    return 'maximum';
  } else if (factorCount >= 2 || factors.mentalHealthChallenges || factors.addictionHistory) {
    return 'enhanced';
  } else {
    return 'standard';
  }
}

async function getSupportResources(country: string): Promise<VulnerableUserProfile['supportResources']> {
  const resources: Record<string, VulnerableUserProfile['supportResources']> = {
    'US': {
      country: 'United States',
      hotlineNumbers: [
        '988 (Suicide & Crisis Lifeline)',
        '1-800-799-7233 (Domestic Violence)',
        '1-800-656-4673 (Sexual Assault)'
      ],
      resourceLinks: [
        'https://www.samhsa.gov',
        'https://www.mentalhealth.gov',
        'https://www.thehotline.org'
      ]
    },
    'UK': {
      country: 'United Kingdom',
      hotlineNumbers: [
        '116 123 (Samaritans)',
        '0808 2000 247 (Domestic Abuse)',
        '0800 1111 (Childline)'
      ],
      resourceLinks: [
        'https://www.mind.org.uk',
        'https://www.nhs.uk/mental-health',
        'https://www.refuge.org.uk'
      ]
    },
    'default': {
      country: 'International',
      hotlineNumbers: ['Local emergency services'],
      resourceLinks: [
        'https://findahelpline.com',
        'https://www.befrienders.org'
      ]
    }
  };

  return resources[country] || resources['default'];
}

export async function detectExploitation(
  senderId: string,
  targetUserId: string,
  content: string,
  contentType: 'message' | 'transaction_request' | 'behavior_pattern'
): Promise<ExploitationDetectionEvent | null> {
  try {
    const targetProfile = await db
      .collection('vulnerable_user_protection_profiles')
      .doc(targetUserId)
      .get();

    if (!targetProfile.exists) {
      return null;
    }

    const profile = targetProfile.data() as VulnerableUserProfile;

    if (!profile.enabledProtections.emotionalManipulationTriggers && 
        !profile.enabledProtections.highPressureChatFlags) {
      return null;
    }

    const detections: {
      type: ExploitationDetectionEvent['eventType'];
      severity: number;
      patterns: string[];
    }[] = [];

    const financialMatches = FINANCIAL_PRESSURE_PATTERNS.filter(p => p.test(content));
    if (financialMatches.length > 0) {
      detections.push({
        type: 'financial_pressure',
        severity: 95,
        patterns: financialMatches.map(p => p.source)
      });
    }

    const loveBombingMatches = LOVE_BOMBING_PATTERNS.filter(p => p.test(content));
    if (loveBombingMatches.length > 0) {
      detections.push({
        type: 'love_bombing',
        severity: 75,
        patterns: loveBombingMatches.map(p => p.source)
      });
    }

    const loyaltyTestMatches = LOYALTY_TEST_PATTERNS.filter(p => p.test(content));
    if (loyaltyTestMatches.length > 0) {
      detections.push({
        type: 'loyalty_test',
        severity: 85,
        patterns: loyaltyTestMatches.map(p => p.source)
      });
    }

    const blackmailMatches = EMOTIONAL_BLACKMAIL_PATTERNS.filter(p => p.test(content));
    if (blackmailMatches.length > 0) {
      detections.push({
        type: 'emotional_blackmail',
        severity: 90,
        patterns: blackmailMatches.map(p => p.source)
      });
    }

    const isolationMatches = ISOLATION_PATTERNS.filter(p => p.test(content));
    if (isolationMatches.length > 0) {
      detections.push({ 
        type: 'isolation_attempt',
        severity: 88,
        patterns: isolationMatches.map(p => p.source)
      });
    }

    if (detections.length === 0) {
      return null;
    }

    const maxSeverityDetection = detections.sort((a, b) => b.severity - a.severity)[0];
    const avgConfidence = detections.reduce((sum, d) => sum + d.severity, 0) / detections.length;

    let severity: ExploitationDetectionEvent['severity'];
    let actionTaken: ExploitationDetectionEvent['actionTaken'];

    if (maxSeverityDetection.severity >= 90 || detections.length >= 3) {
      severity = 'critical';
      actionTaken = 'alert_support';
    } else if (maxSeverityDetection.severity >= 80) {
      severity = 'high';
      actionTaken = 'redirect_chat';
    } else if (maxSeverityDetection.severity >= 70) {
      severity = 'medium';
      actionTaken = contentType === 'transaction_request' ? 'block_transaction' : 'flag';
    } else {
      severity = 'low';
      actionTaken = 'flag';
    }

    const event: Omit<ExploitationDetectionEvent, 'id'> = {
      userId: senderId,
      targetUserId,
      eventType: maxSeverityDetection.type,
      severity,
      detectedAt: Timestamp.now(),
      content: content.substring(0, 500),
      contentType,
      actionTaken,
      metadata: {
        confidence: avgConfidence,
        matchedPatterns: detections.flatMap(d => d.patterns),
        allDetections: detections
      }
    };

    const eventRef = await db.collection('exploitation_detection_events').add({
      ...event,
      createdAt: Timestamp.now()
    });

    await db.collection('minor_risk_events').add({
      userId: targetUserId,
      eventType: 'exploitation_detected',
      timestamp: Timestamp.now(),
      severity,
      exploitationEventId: eventRef.id,
      metadata: {
        senderId,
        eventType: maxSeverityDetection.type,
        confidence: avgConfidence
      }
    });

    if (actionTaken === 'block_transaction') {
      await blockTransaction(senderId, targetUserId, eventRef.id);
    } else if (actionTaken === 'redirect_chat') {
      await redirectToSupport(targetUserId, eventRef.id);
    } else if (actionTaken === 'alert_support') {
      await alertSupportTeam(senderId, targetUserId, eventRef.id);
    }

    return { ...event, id: eventRef.id } as ExploitationDetectionEvent;
  } catch (error) {
    logger.error('Exploitation detection error:', error);
    throw error;
  }
}

async function blockTransaction(
  senderId: string,
  targetUserId: string,
  eventId: string
): Promise<void> {
  try {
    await db.collection('blocked_transactions').add({
      senderId,
      targetUserId,
      blockedAt: Timestamp.now(),
      reason: 'exploitation_detected',
      eventId,
      createdAt: Timestamp.now()
    });

    await db.collection('notifications').add({
      userId: targetUserId,
      type: 'transaction_blocked',
      title: 'Transaction Blocked',
      message: 'A transaction was blocked for your safety. If you need help, please contact support.',
      priority: 'high',
      read: false,
      createdAt: Timestamp.now()
    });

    logger.info(`Transaction blocked from ${senderId} to ${targetUserId}`);
  } catch (error) {
    logger.error('Block transaction error:', error);
  }
}

async function redirectToSupport(
  userId: string,
  eventId: string
): Promise<void> {
  try {
    const profile = await db
      .collection('vulnerable_user_protection_profiles')
      .doc(userId)
      .get();

    if (!profile.exists) return;

    const profileData = profile.data() as VulnerableUserProfile;

    await db.collection('notifications').add({
      userId,
      type: 'safety_resources',
      title: 'Safety Alert',
      message: 'We detected potentially harmful content. Here are some resources that may help.',
      priority: 'high',
      read: false,
      metadata: {
        resources: profileData.supportResources,
        eventId
      },
      createdAt: Timestamp.now()
    });

    logger.info(`Support resources sent to ${userId}`);
  } catch (error) {
    logger.error('Redirect to support error:', error);
  }
}

async function alertSupportTeam(
  senderId: string,
  targetUserId: string,
  eventId: string
): Promise<void> {
  try {
    await db.collection('support_alerts').add({
      type: 'vulnerable_user_exploitation',
      priority: 'critical',
      senderId,
      targetUserId,
      eventId,
      status: 'pending',
      assignedTo: null,
      createdAt: Timestamp.now()
    });

    logger.warn(`Critical exploitation alert created for event ${eventId}`);
  } catch (error) {
    logger.error('Alert support team error:', error);
  }
}

export async function checkSpendingLimit(
  userId: string,
  amount: number,
  period: 'daily' | 'weekly' | 'monthly'
): Promise<{ allowed: boolean; reason?: string; currentSpending?: number; limit?: number }> {
  try {
    const profile = await db
      .collection('vulnerable_user_protection_profiles')
      .doc(userId)
      .get();

    if (!profile.exists || !profile.data()!.enabledProtections.spendingLimits) {
      return { allowed: true };
    }

    const profileData = profile.data() as VulnerableUserProfile;
    const limits = profileData.spendingLimit!;

    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const transactions = await db
      .collection('transactions')
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .where('status', '==', 'completed')
      .get();

    const currentSpending = transactions.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
    
    let limit: number;
    switch (period) {
      case 'daily':
        limit = limits.dailyLimit;
        break;
      case 'weekly':
        limit = limits.weeklyLimit;
        break;
      case 'monthly':
        limit = limits.monthlyLimit;
        break;
    }

    if (currentSpending + amount > limit) {
      return {
        allowed: false,
        reason: `${period} spending limit exceeded`,
        currentSpending,
        limit
      };
    }

    return { allowed: true, currentSpending, limit };
  } catch (error) {
    logger.error('Check spending limit error:', error);
    return { allowed: false, reason: 'Error checking spending limit' };
  }
}