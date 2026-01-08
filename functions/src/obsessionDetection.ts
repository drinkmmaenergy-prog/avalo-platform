/**
 * PACK 175 — Cyberstalking & Location Safety Defender
 * Obsession Pattern Recognition System
 * 
 * Analyzes long-term behavioral patterns to detect obsessive attention,
 * social isolation attempts, and emotional manipulation.
 */

import * as admin from 'firebase-admin';
import {
  ObsessionPattern,
  ObsessionPatternType,
  ObsessionMetrics,
  MitigationAction,
  MitigationType,
} from './types/cyberstalking.types';

const db = admin.firestore();

// ============================================================================
// CONFIGURATION
// ============================================================================

const OBSESSION_THRESHOLDS = {
  excessiveMessaging: {
    messagesPerDay: 50,           // 50+ messages per day
    daysToTrack: 7,
  },
  socialIsolation: {
    monopolyPercentage: 70,       // 70%+ of recipient's conversation time
    daysToTrack: 14,
  },
  guiltManipulation: {
    guiltyMessagesThreshold: 10,  // 10+ guilt trip messages
    daysToTrack: 7,
  },
  surveillance: {
    requestsThreshold: 5,         // 5+ surveillance requests
    daysToTrack: 7,
  },
  threatening: {
    threatsThreshold: 2,          // 2+ threatening messages
    daysToTrack: 30,
  },
};

// ============================================================================
// OBSESSION PATTERN DETECTION
// ============================================================================

/**
 * Analyze user behavior patterns to detect obsession
 */
export async function analyzeObsessionPatterns(
  observedUserId: string,
  targetUserId: string
): Promise<ObsessionPattern[]> {
  const patterns: ObsessionPattern[] = [];
  
  try {
    // Analyze excessive messaging
    const excessiveMessaging = await detectExcessiveMessaging(observedUserId, targetUserId);
    if (excessiveMessaging) {
      patterns.push(excessiveMessaging);
    }
    
    // Analyze social isolation attempts
    const socialIsolation = await detectSocialIsolation(observedUserId, targetUserId);
    if (socialIsolation) {
      patterns.push(socialIsolation);
    }
    
    // Analyze guilt manipulation
    const guiltManipulation = await detectGuiltManipulation(observedUserId, targetUserId);
    if (guiltManipulation) {
      patterns.push(guiltManipulation);
    }
    
    // Analyze surveillance demands
    const surveillance = await detectSurveillanceDemands(observedUserId, targetUserId);
    if (surveillance) {
      patterns.push(surveillance);
    }
    
    // Analyze threatening escalation
    const threatening = await detectThreateningAccessLoss(observedUserId, targetUserId);
    if (threatening) {
      patterns.push(threatening);
    }
    
    // Store detected patterns
    for (const pattern of patterns) {
      await storeObsessionPattern(pattern);
      
      // Apply mitigation if risk is high or critical
      if (pattern.riskLevel === 'HIGH' || pattern.riskLevel === 'CRITICAL') {
        await applyObsessionMitigation(pattern);
      }
    }
    
    return patterns;
  } catch (error) {
    console.error('[ObsessionDetection] Error analyzing patterns:', error);
    return [];
  }
}

/**
 * Detect excessive messaging pattern
 */
async function detectExcessiveMessaging(
  senderId: string,
  recipientId: string
): Promise<ObsessionPattern | null> {
  const config = OBSESSION_THRESHOLDS.excessiveMessaging;
  const cutoffDate = admin.firestore.Timestamp.fromMillis(
    Date.now() - config.daysToTrack * 24 * 60 * 60 * 1000
  );
  
  try {
    // Get message count for the period
    const messagesSnapshot = await db.collection('messages')
      .where('senderId', '==', senderId)
      .where('recipientId', '==', recipientId)
      .where('createdAt', '>=', cutoffDate)
      .get();
    
    const totalMessages = messagesSnapshot.size;
    const dailyAverage = totalMessages / config.daysToTrack;
    
    if (dailyAverage >= config.messagesPerDay) {
      // Calculate response metrics
      const messages = messagesSnapshot.docs.map(doc => doc.data());
      const responseMetrics = calculateResponseMetrics(messages);
      
      const metrics: ObsessionMetrics = {
        dailyMessageAttempts: Math.round(dailyAverage),
        averageResponseTime: responseMetrics.avgResponseTime,
        demandingResponseTime: responseMetrics.expectedResponseTime,
        isolationAttempts: 0,
        guiltTripCount: 0,
        surveillanceRequestCount: 0,
        threatCount: 0,
        timeSpanDays: config.daysToTrack,
      };
      
      const riskLevel = dailyAverage >= 100 ? 'CRITICAL' :
                       dailyAverage >= 75 ? 'HIGH' :
                       dailyAverage >= 50 ? 'MEDIUM' : 'LOW';
      
      return {
        id: generateId(),
        targetUserId: recipientId,
        observedUserId: senderId,
        patternType: 'EXCESSIVE_MESSAGING',
        detectedAt: admin.firestore.Timestamp.now(),
        metrics,
        riskLevel,
        mitigationApplied: false,
      };
    }
  } catch (error) {
    console.error('[ObsessionDetection] Error detecting excessive messaging:', error);
  }
  
  return null;
}

/**
 * Detect social isolation attempts
 */
async function detectSocialIsolation(
  observedUserId: string,
  targetUserId: string
): Promise<ObsessionPattern | null> {
  const config = OBSESSION_THRESHOLDS.socialIsolation;
  const cutoffDate = admin.firestore.Timestamp.fromMillis(
    Date.now() - config.daysToTrack * 24 * 60 * 60 * 1000
  );
  
  try {
    // Get target's total conversation activity
    const targetMessagesSnapshot = await db.collection('messages')
      .where('senderId', '==', targetUserId)
      .where('createdAt', '>=', cutoffDate)
      .get();
    
    // Get messages between observed and target
    const observedMessagesSnapshot = await db.collection('messages')
      .where('senderId', '==', targetUserId)
      .where('recipientId', '==', observedUserId)
      .where('createdAt', '>=', cutoffDate)
      .get();
    
    const totalMessages = targetMessagesSnapshot.size;
    const messagesToObserved = observedMessagesSnapshot.size;
    
    if (totalMessages > 0) {
      const monopolyPercentage = (messagesToObserved / totalMessages) * 100;
      
      // Also check for isolation keywords
      const isolationKeywords = ['dont talk to', 'stop talking to', 'only talk to me', 'i should be enough'];
      let isolationAttempts = 0;
      
      const conversationSnapshot = await db.collection('messages')
        .where('senderId', '==', observedUserId)
        .where('recipientId', '==', targetUserId)
        .where('createdAt', '>=', cutoffDate)
        .get();
      
      conversationSnapshot.docs.forEach(doc => {
        const content = doc.data().content?.toLowerCase() || '';
        if (isolationKeywords.some(keyword => content.includes(keyword))) {
          isolationAttempts++;
        }
      });
      
      if (monopolyPercentage >= config.monopolyPercentage || isolationAttempts >= 3) {
        const metrics: ObsessionMetrics = {
          dailyMessageAttempts: 0,
          averageResponseTime: 0,
          demandingResponseTime: 0,
          isolationAttempts,
          guiltTripCount: 0,
          surveillanceRequestCount: 0,
          threatCount: 0,
          timeSpanDays: config.daysToTrack,
        };
        
        const riskLevel = (monopolyPercentage >= 90 || isolationAttempts >= 5) ? 'CRITICAL' :
                         (monopolyPercentage >= 80 || isolationAttempts >= 4) ? 'HIGH' :
                         'MEDIUM';
        
        return {
          id: generateId(),
          targetUserId,
          observedUserId,
          patternType: 'SOCIAL_ISOLATION',
          detectedAt: admin.firestore.Timestamp.now(),
          metrics,
          riskLevel,
          mitigationApplied: false,
        };
      }
    }
  } catch (error) {
    console.error('[ObsessionDetection] Error detecting social isolation:', error);
  }
  
  return null;
}

/**
 * Detect guilt manipulation patterns
 */
async function detectGuiltManipulation(
  observedUserId: string,
  targetUserId: string
): Promise<ObsessionPattern | null> {
  const config = OBSESSION_THRESHOLDS.guiltManipulation;
  const cutoffDate = admin.firestore.Timestamp.fromMillis(
    Date.now() - config.daysToTrack * 24 * 60 * 60 * 1000
  );
  
  try {
    const guiltKeywords = [
      'why didnt you',
      'you never',
      'you always ignore',
      'you dont care',
      'if you cared',
      'i guess im not important',
      'you make me feel',
    ];
    
    const messagesSnapshot = await db.collection('messages')
      .where('senderId', '==', observedUserId)
      .where('recipientId', '==', targetUserId)
      .where('createdAt', '>=', cutoffDate)
      .get();
    
    let guiltTripCount = 0;
    
    messagesSnapshot.docs.forEach(doc => {
      const content = doc.data().content?.toLowerCase() || '';
      if (guiltKeywords.some(keyword => content.includes(keyword))) {
        guiltTripCount++;
      }
    });
    
    if (guiltTripCount >= config.guiltyMessagesThreshold) {
      const metrics: ObsessionMetrics = {
        dailyMessageAttempts: 0,
        averageResponseTime: 0,
        demandingResponseTime: 0,
        isolationAttempts: 0,
        guiltTripCount,
        surveillanceRequestCount: 0,
        threatCount: 0,
        timeSpanDays: config.daysToTrack,
      };
      
      const riskLevel = guiltTripCount >= 20 ? 'HIGH' :
                       guiltTripCount >= 15 ? 'MEDIUM' : 'LOW';
      
      return {
        id: generateId(),
        targetUserId,
        observedUserId,
        patternType: 'GUILT_MANIPULATION',
        detectedAt: admin.firestore.Timestamp.now(),
        metrics,
        riskLevel,
        mitigationApplied: false,
      };
    }
  } catch (error) {
    console.error('[ObsessionDetection] Error detecting guilt manipulation:', error);
  }
  
  return null;
}

/**
 * Detect surveillance demands
 */
async function detectSurveillanceDemands(
  observedUserId: string,
  targetUserId: string
): Promise<ObsessionPattern | null> {
  const config = OBSESSION_THRESHOLDS.surveillance;
  const cutoffDate = admin.firestore.Timestamp.fromMillis(
    Date.now() - config.daysToTrack * 24 * 60 * 60 * 1000
  );
  
  try {
    const surveillanceKeywords = [
      'prove it',
      'show me',
      'send a photo',
      'video call now',
      'share your screen',
      'let me see',
      'where are you',
      'send location',
    ];
    
    const messagesSnapshot = await db.collection('messages')
      .where('senderId', '==', observedUserId)
      .where('recipientId', '==', targetUserId)
      .where('createdAt', '>=', cutoffDate)
      .get();
    
    let surveillanceRequestCount = 0;
    
    messagesSnapshot.docs.forEach(doc => {
      const content = doc.data().content?.toLowerCase() || '';
      if (surveillanceKeywords.some(keyword => content.includes(keyword))) {
        surveillanceRequestCount++;
      }
    });
    
    if (surveillanceRequestCount >= config.requestsThreshold) {
      const metrics: ObsessionMetrics = {
        dailyMessageAttempts: 0,
        averageResponseTime: 0,
        demandingResponseTime: 0,
        isolationAttempts: 0,
        guiltTripCount: 0,
        surveillanceRequestCount,
        threatCount: 0,
        timeSpanDays: config.daysToTrack,
      };
      
      const riskLevel = surveillanceRequestCount >= 15 ? 'CRITICAL' :
                       surveillanceRequestCount >= 10 ? 'HIGH' :
                       surveillanceRequestCount >= 5 ? 'MEDIUM' : 'LOW';
      
      return {
        id: generateId(),
        targetUserId,
        observedUserId,
        patternType: 'SURVEILLANCE_DEMANDS',
        detectedAt: admin.firestore.Timestamp.now(),
        metrics,
        riskLevel,
        mitigationApplied: false,
      };
    }
  } catch (error) {
    console.error('[ObsessionDetection] Error detecting surveillance demands:', error);
  }
  
  return null;
}

/**
 * Detect threatening behavior when access is restricted
 */
async function detectThreateningAccessLoss(
  observedUserId: string,
  targetUserId: string
): Promise<ObsessionPattern | null> {
  const config = OBSESSION_THRESHOLDS.threatening;
  const cutoffDate = admin.firestore.Timestamp.fromMillis(
    Date.now() - config.daysToTrack * 24 * 60 * 60 * 1000
  );
  
  try {
    const threatKeywords = [
      'you will regret',
      'youll be sorry',
      'ill make you',
      'better watch',
      'or else',
      'you better',
      'im warning you',
      'last chance',
    ];
    
    const messagesSnapshot = await db.collection('messages')
      .where('senderId', '==', observedUserId)
      .where('recipientId', '==', targetUserId)
      .where('createdAt', '>=', cutoffDate)
      .get();
    
    let threatCount = 0;
    
    messagesSnapshot.docs.forEach(doc => {
      const content = doc.data().content?.toLowerCase() || '';
      if (threatKeywords.some(keyword => content.includes(keyword))) {
        threatCount++;
      }
    });
    
    if (threatCount >= config.threatsThreshold) {
      const metrics: ObsessionMetrics = {
        dailyMessageAttempts: 0,
        averageResponseTime: 0,
        demandingResponseTime: 0,
        isolationAttempts: 0,
        guiltTripCount: 0,
        surveillanceRequestCount: 0,
        threatCount,
        timeSpanDays: config.daysToTrack,
      };
      
      // Threats are always high or critical risk
      const riskLevel = threatCount >= 5 ? 'CRITICAL' : 'HIGH';
      
      return {
        id: generateId(),
        targetUserId,
        observedUserId,
        patternType: 'THREATENING_ACCESS_LOSS',
        detectedAt: admin.firestore.Timestamp.now(),
        metrics,
        riskLevel,
        mitigationApplied: false,
      };
    }
  } catch (error) {
    console.error('[ObsessionDetection] Error detecting threatening behavior:', error);
  }
  
  return null;
}

// ============================================================================
// MITIGATION
// ============================================================================

/**
 * Apply mitigation for detected obsession pattern
 */
async function applyObsessionMitigation(pattern: ObsessionPattern): Promise<void> {
  try {
    let actionType: MitigationType;
    let duration: number | undefined;
    let reason: string;
    
    // Determine mitigation based on pattern type and risk level
    if (pattern.riskLevel === 'CRITICAL') {
      if (pattern.patternType === 'THREATENING_ACCESS_LOSS') {
        actionType = 'PERMANENT_BAN';
        reason = `Critical threat pattern detected: ${pattern.metrics.threatCount} threats`;
      } else {
        actionType = 'GLOBAL_TIMEOUT';
        duration = 7 * 24 * 60; // 7 days
        reason = `Critical ${pattern.patternType} pattern detected`;
      }
    } else if (pattern.riskLevel === 'HIGH') {
      actionType = 'GLOBAL_TIMEOUT';
      duration = 3 * 24 * 60; // 3 days
      reason = `High risk ${pattern.patternType} pattern detected`;
    } else {
      actionType = 'WARNING';
      reason = `Medium risk ${pattern.patternType} pattern detected`;
    }
    
    const mitigation: MitigationAction = {
      id: generateId(),
      caseId: `obsession_${pattern.id}`,
      stalkerUserId: pattern.observedUserId,
      victimUserId: pattern.targetUserId,
      actionType,
      appliedAt: admin.firestore.Timestamp.now(),
      duration,
      expiresAt: duration ? 
        admin.firestore.Timestamp.fromMillis(Date.now() + duration * 60 * 1000) : 
        undefined,
      reason,
      autoApplied: true,
    };
    
    await db.collection('stalking_mitigations').doc(mitigation.id).set(mitigation);
    
    // Update pattern to mark mitigation applied
    await db.collection('obsession_patterns').doc(pattern.id).update({
      mitigationApplied: true,
      mitigationDetails: mitigation,
    });
    
    console.log(`[ObsessionDetection] Applied ${actionType} for pattern ${pattern.id}`);
  } catch (error) {
    console.error('[ObsessionDetection] Error applying mitigation:', error);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate response time metrics
 */
function calculateResponseMetrics(messages: any[]): {
  avgResponseTime: number;
  expectedResponseTime: number;
} {
  // Simple calculation - in production, this would be more sophisticated
  const avgResponseTime = 30; // 30 minutes average (placeholder)
  const expectedResponseTime = 5; // Demanding response within 5 minutes (placeholder)
  
  return { avgResponseTime, expectedResponseTime };
}

/**
 * Store obsession pattern in database
 */
async function storeObsessionPattern(pattern: ObsessionPattern): Promise<void> {
  await db.collection('obsession_patterns').doc(pattern.id).set(pattern);
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return db.collection('_').doc().id;
}

/**
 * Get user's obsession patterns (for reporting/analysis)
 */
export async function getUserObsessionPatterns(
  userId: string,
  role: 'target' | 'observed'
): Promise<ObsessionPattern[]> {
  try {
    const field = role === 'target' ? 'targetUserId' : 'observedUserId';
    const patternsSnapshot = await db.collection('obsession_patterns')
      .where(field, '==', userId)
      .orderBy('detectedAt', 'desc')
      .limit(50)
      .get();
    
    return patternsSnapshot.docs.map(doc => doc.data() as ObsessionPattern);
  } catch (error) {
    console.error('[ObsessionDetection] Error getting patterns:', error);
    return [];
  }
}