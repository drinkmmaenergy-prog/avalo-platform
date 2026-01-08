/**
 * PACK 175 — Cyberstalking & Location Safety Defender
 * Stalking Behavior Detection Engine
 * 
 * Detects patterns of invasive monitoring, territorial jealousy, and obsessive behavior.
 * Zero tolerance policy - privacy always wins over romance or control.
 */

import * as admin from 'firebase-admin';
import {
  StalkingBehavior,
  StalkingBehaviorType,
  StalkingBehaviorSeverity,
  StalkingCase,
  StalkingCaseStatus,
  MitigationAction,
  MitigationType,
  StalkingDetectionConfig,
} from './types/cyberstalking.types';

const db = admin.firestore();

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: StalkingDetectionConfig = {
  // Behavior thresholds
  invasiveMonitoringThreshold: 5,           // 5+ location questions per day
  territorialJealousyKeywords: [
    'who are you with',
    'where are you',
    'send me your location',
    'prove it',
    'show me',
    'why didnt you answer',
    'why are you ignoring',
    'you better respond',
    'i need to know',
  ],
  isolationAttemptThreshold: 3,             // 3+ isolation attempts per week
  surveillanceRequestThreshold: 2,          // 2+ surveillance requests
  
  // Time windows (minutes)
  shortTermWindow: 60,                      // 1 hour
  mediumTermWindow: 1440,                   // 24 hours
  longTermWindow: 10080,                    // 7 days
  
  // Automatic mitigation
  autoWarningEnabled: true,
  autoChatFreezeEnabled: true,
  autoTimeoutEnabled: true,
  autoBanEnabled: false,                    // Manual review required for bans
  
  // Thresholds for automatic actions
  warningThreshold: 2,                      // 2 behaviors trigger warning
  freezeThreshold: 4,                       // 4 behaviors freeze chat
  timeoutThreshold: 6,                      // 6 behaviors apply timeout
  banThreshold: 10,                         // 10+ behaviors for ban consideration
};

// ============================================================================
// STALKING BEHAVIOR DETECTION
// ============================================================================

/**
 * Detect stalking behavior from message content and patterns
 */
export async function detectStalkingBehavior(
  senderId: string,
  recipientId: string,
  messageContent: string,
  conversationId: string
): Promise<StalkingBehavior[]> {
  const behaviors: StalkingBehavior[] = [];
  const now = admin.firestore.Timestamp.now();
  
  try {
    // Get recent message history for pattern detection
    const recentMessages = await getRecentMessages(senderId, recipientId, 60); // Last hour
    
    // Check for invasive monitoring
    const invasiveMonitoring = await detectInvasiveMonitoring(
      senderId,
      recipientId,
      messageContent,
      recentMessages
    );
    if (invasiveMonitoring) {
      behaviors.push(invasiveMonitoring);
    }
    
    // Check for territorial jealousy
    const territorialJealousy = await detectTerritorialJealousy(
      senderId,
      recipientId,
      messageContent
    );
    if (territorialJealousy) {
      behaviors.push(territorialJealousy);
    }
    
    // Check for surveillance requests
    const surveillanceRequest = await detectSurveillanceRequest(
      senderId,
      recipientId,
      messageContent
    );
    if (surveillanceRequest) {
      behaviors.push(surveillanceRequest);
    }
    
    // Check for guilt trip control
    const guiltTrip = await detectGuiltTripControl(
      senderId,
      recipientId,
      messageContent,
      recentMessages
    );
    if (guiltTrip) {
      behaviors.push(guiltTrip);
    }
    
    // Check for threatening escalation
    const threat = await detectThreateningEscalation(
      senderId,
      recipientId,
      messageContent
    );
    if (threat) {
      behaviors.push(threat);
    }
    
    // Store detected behaviors
    for (const behavior of behaviors) {
      await storeBehavior(behavior);
    }
    
    // Check if case needs to be created or updated
    if (behaviors.length > 0) {
      await updateOrCreateStalkingCase(senderId, recipientId, behaviors);
    }
    
    return behaviors;
  } catch (error) {
    console.error('[CyberstalkingDetection] Error detecting stalking behavior:', error);
    return [];
  }
}

/**
 * Detect invasive monitoring (repeatedly asking where someone is)
 */
async function detectInvasiveMonitoring(
  senderId: string,
  recipientId: string,
  messageContent: string,
  recentMessages: any[]
): Promise<StalkingBehavior | null> {
  const config = DEFAULT_CONFIG;
  const locationKeywords = ['where are you', 'where r u', 'location', 'send location', 'share location'];
  
  // Check if message contains location inquiry
  const containsLocationKeyword = locationKeywords.some(keyword =>
    messageContent.toLowerCase().includes(keyword)
  );
  
  if (!containsLocationKeyword) {
    return null;
  }
  
  // Count how many location-related messages in recent history
  const locationMessageCount = recentMessages.filter(msg =>
    locationKeywords.some(keyword => msg.content?.toLowerCase().includes(keyword))
  ).length;
  
  if (locationMessageCount >= config.invasiveMonitoringThreshold) {
    return {
      id: generateId(),
      victimUserId: recipientId,
      stalkerUserId: senderId,
      behaviorType: 'INVASIVE_MONITORING',
      severity: locationMessageCount >= 10 ? 'CRITICAL' : locationMessageCount >= 7 ? 'HIGH' : 'MEDIUM',
      detectedAt: admin.firestore.Timestamp.now(),
      evidence: {
        messageCount: locationMessageCount,
        timeSpan: 60,
        pattern: 'repeated_location_inquiries',
        context: messageContent.substring(0, 100),
      },
      actionTaken: 'NONE',
      resolved: false,
    };
  }
  
  return null;
}

/**
 * Detect territorial jealousy (aggression about who user interacts with)
 */
async function detectTerritorialJealousy(
  senderId: string,
  recipientId: string,
  messageContent: string
): Promise<StalkingBehavior | null> {
  const config = DEFAULT_CONFIG;
  const jealousyPatterns = [
    'who are you with',
    'who is that',
    'are you with someone',
    'why are you talking to',
    'stop talking to',
    'i dont want you',
    'you shouldnt',
  ];
  
  const containsJealousyPattern = jealousyPatterns.some(pattern =>
    messageContent.toLowerCase().includes(pattern)
  );
  
  if (!containsJealousyPattern) {
    return null;
  }
  
  // Check for aggressive tone (exclamation marks, caps, threatening language)
  const isAggressive =
    /[!]{2,}/.test(messageContent) ||
    messageContent === messageContent.toUpperCase() && messageContent.length > 10 ||
    /\b(better|should|must|have to|need to)\b/i.test(messageContent);
  
  if (isAggressive && containsJealousyPattern) {
    return {
      id: generateId(),
      victimUserId: recipientId,
      stalkerUserId: senderId,
      behaviorType: 'TERRITORIAL_JEALOUSY',
      severity: 'HIGH',
      detectedAt: admin.firestore.Timestamp.now(),
      evidence: {
        pattern: 'jealous_interrogation',
        context: messageContent.substring(0, 100),
      },
      actionTaken: 'NONE',
      resolved: false,
    };
  }
  
  return null;
}

/**
 * Detect surveillance requests ("show me your room", "prove it")
 */
async function detectSurveillanceRequest(
  senderId: string,
  recipientId: string,
  messageContent: string
): Promise<StalkingBehavior | null> {
  const surveillanceKeywords = [
    'prove it',
    'show me',
    'send a photo',
    'take a picture',
    'video call now',
    'share your screen',
    'let me see',
    'show your',
  ];
  
  const containsSurveillance = surveillanceKeywords.some(keyword =>
    messageContent.toLowerCase().includes(keyword)
  );
  
  if (!containsSurveillance) {
    return null;
  }
  
  return {
    id: generateId(),
    victimUserId: recipientId,
    stalkerUserId: senderId,
    behaviorType: 'SURVEILLANCE_REQUESTS',
    severity: 'HIGH',
    detectedAt: admin.firestore.Timestamp.now(),
    evidence: {
      pattern: 'surveillance_demand',
      context: messageContent.substring(0, 100),
    },
    actionTaken: 'NONE',
    resolved: false,
  };
}

/**
 * Detect guilt trip control ("why didn't you answer all day?")
 */
async function detectGuiltTripControl(
  senderId: string,
  recipientId: string,
  messageContent: string,
  recentMessages: any[]
): Promise<StalkingBehavior | null> {
  const guiltTripPatterns = [
    'why didnt you',
    'why havent you',
    'you never',
    'you always ignore',
    'you dont care',
    'if you cared',
    'i guess im not',
  ];
  
  const containsGuiltTrip = guiltTripPatterns.some(pattern =>
    messageContent.toLowerCase().includes(pattern)
  );
  
  if (!containsGuiltTrip) {
    return null;
  }
  
  // Count frequency of guilt trip messages
  const guiltTripCount = recentMessages.filter(msg =>
    guiltTripPatterns.some(pattern => msg.content?.toLowerCase().includes(pattern))
  ).length;
  
  if (guiltTripCount >= 2) {
    return {
      id: generateId(),
      victimUserId: recipientId,
      stalkerUserId: senderId,
      behaviorType: 'GUILT_TRIP_CONTROL',
      severity: guiltTripCount >= 5 ? 'HIGH' : 'MEDIUM',
      detectedAt: admin.firestore.Timestamp.now(),
      evidence: {
        messageCount: guiltTripCount,
        pattern: 'guilt_manipulation',
        context: messageContent.substring(0, 100),
      },
      actionTaken: 'NONE',
      resolved: false,
    };
  }
  
  return null;
}

/**
 * Detect threatening escalation
 */
async function detectThreateningEscalation(
  senderId: string,
  recipientId: string,
  messageContent: string
): Promise<StalkingBehavior | null> {
  const threatKeywords = [
    'you will regret',
    'youll be sorry',
    'ill make you',
    'better watch',
    'or else',
    'you better',
    'im warning you',
  ];
  
  const containsThreat = threatKeywords.some(keyword =>
    messageContent.toLowerCase().includes(keyword)
  );
  
  if (containsThreat) {
    return {
      id: generateId(),
      victimUserId: recipientId,
      stalkerUserId: senderId,
      behaviorType: 'THREATENING_ESCALATION',
      severity: 'CRITICAL',
      detectedAt: admin.firestore.Timestamp.now(),
      evidence: {
        pattern: 'explicit_threat',
        context: messageContent.substring(0, 100),
      },
      actionTaken: 'NONE',
      resolved: false,
    };
  }
  
  return null;
}

// ============================================================================
// CASE MANAGEMENT
// ============================================================================

/**
 * Update or create stalking case based on detected behaviors
 */
async function updateOrCreateStalkingCase(
  stalkerId: string,
  victimId: string,
  newBehaviors: StalkingBehavior[]
): Promise<void> {
  try {
    // Check if active case exists
    const casesRef = db.collection('stalking_cases');
    const existingCases = await casesRef
      .where('stalkerUserId', '==', stalkerId)
      .where('victimUserId', '==', victimId)
      .where('status', 'in', ['ACTIVE', 'ESCALATED'])
      .limit(1)
      .get();
    
    if (existingCases.empty) {
      // Create new case
      await createStalkingCase(stalkerId, victimId, newBehaviors);
    } else {
      // Update existing case
      const caseDoc = existingCases.docs[0];
      await updateStalkingCase(caseDoc.id, newBehaviors);
    }
  } catch (error) {
    console.error('[CyberstalkingDetection] Error updating case:', error);
  }
}

/**
 * Create new stalking case
 */
async function createStalkingCase(
  stalkerId: string,
  victimId: string,
  behaviors: StalkingBehavior[]
): Promise<string> {
  const caseId = generateId();
  const now = admin.firestore.Timestamp.now();
  
  // Calculate severity based on behaviors
  const criticalCount = behaviors.filter(b => b.severity === 'CRITICAL').length;
  const highCount = behaviors.filter(b => b.severity === 'HIGH').length;
  
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  if (criticalCount > 0) severity = 'CRITICAL';
  else if (highCount >= 2) severity = 'HIGH';
  else if (highCount >= 1 || behaviors.length >= 3) severity = 'MEDIUM';
  
  const stalkingCase: StalkingCase = {
    id: caseId,
    victimUserId: victimId,
    stalkerUserId: stalkerId,
    status: severity === 'CRITICAL' ? 'ESCALATED' : 'ACTIVE',
    severity,
    behaviors,
    obsessionPatterns: [],
    locationViolations: [],
    mediaRequests: [],
    firstDetectedAt: now,
    lastActivityAt: now,
    warningsSent: 0,
    chatsFrozen: 0,
    timeoutsApplied: 0,
    reportFiled: false,
    reviewedByModerator: false,
  };
  
  await db.collection('stalking_cases').doc(caseId).set(stalkingCase);
  
  console.log(`[CyberstalkingDetection] Created stalking case ${caseId} for victim ${victimId}`);
  
  // Apply automatic mitigation if enabled
  await applyAutoMitigation(caseId, stalkingCase);
  
  return caseId;
}

/**
 * Update existing stalking case with new behaviors
 */
async function updateStalkingCase(
  caseId: string,
  newBehaviors: StalkingBehavior[]
): Promise<void> {
  const caseRef = db.collection('stalking_cases').doc(caseId);
  const caseDoc = await caseRef.get();
  
  if (!caseDoc.exists) {
    return;
  }
  
  const caseData = caseDoc.data() as StalkingCase;
  const updatedBehaviors = [...caseData.behaviors, ...newBehaviors];
  
  // Recalculate severity
  const criticalCount = updatedBehaviors.filter(b => b.severity === 'CRITICAL').length;
  const highCount = updatedBehaviors.filter(b => b.severity === 'HIGH').length;
  
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = caseData.severity;
  if (criticalCount > 0) severity = 'CRITICAL';
  else if (highCount >= 2) severity = 'HIGH';
  else if (highCount >= 1 || updatedBehaviors.length >= 3) severity = 'MEDIUM';
  
  const updates: Partial<StalkingCase> = {
    behaviors: updatedBehaviors,
    severity,
    status: severity === 'CRITICAL' ? 'ESCALATED' : caseData.status,
    lastActivityAt: admin.firestore.Timestamp.now(),
  };
  
  await caseRef.update(updates);
  
  console.log(`[CyberstalkingDetection] Updated stalking case ${caseId}`);
  
  // Check if mitigation escalation needed
  const updatedCase = { ...caseData, ...updates } as StalkingCase;
  await applyAutoMitigation(caseId, updatedCase);
}

// ============================================================================
// AUTOMATIC MITIGATION
// ============================================================================

/**
 * Apply automatic mitigation based on case severity and behavior count
 */
async function applyAutoMitigation(
  caseId: string,
  stalkingCase: StalkingCase
): Promise<void> {
  const config = DEFAULT_CONFIG;
  const behaviorCount = stalkingCase.behaviors.length;
  
  try {
    // Warning (first offense)
    if (config.autoWarningEnabled && behaviorCount >= config.warningThreshold && stalkingCase.warningsSent === 0) {
      await applyMitigation(caseId, stalkingCase, 'WARNING', 'Automatic warning for stalking behavior pattern');
    }
    
    // Chat freeze (escalation)
    if (config.autoChatFreezeEnabled && behaviorCount >= config.freezeThreshold && stalkingCase.chatsFrozen === 0) {
      await applyMitigation(caseId, stalkingCase, 'CHAT_FREEZE', 'Chat frozen due to repeated stalking behavior', 1440); // 24 hours
    }
    
    // Global timeout (serious escalation)
    if (config.autoTimeoutEnabled && behaviorCount >= config.timeoutThreshold && stalkingCase.timeoutsApplied === 0) {
      await applyMitigation(caseId, stalkingCase, 'GLOBAL_TIMEOUT', 'Global messaging timeout for persistent stalking', 4320); // 3 days
    }
    
    // Critical cases escalate to manual review
    if (stalkingCase.severity === 'CRITICAL' && !stalkingCase.reviewedByModerator) {
      console.log(`[CyberstalkingDetection] CRITICAL case ${caseId} requires manual review`);
      // Could trigger notification to moderators here
    }
  } catch (error) {
    console.error('[CyberstalkingDetection] Error applying mitigation:', error);
  }
}

/**
 * Apply specific mitigation action
 */
async function applyMitigation(
  caseId: string,
  stalkingCase: StalkingCase,
  actionType: MitigationType,
  reason: string,
  durationMinutes?: number
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const mitigationId = generateId();
  
  const mitigation: MitigationAction = {
    id: mitigationId,
    caseId,
    stalkerUserId: stalkingCase.stalkerUserId,
    victimUserId: stalkingCase.victimUserId,
    actionType,
    appliedAt: now,
    duration: durationMinutes,
    expiresAt: durationMinutes ? admin.firestore.Timestamp.fromMillis(now.toMillis() + durationMinutes * 60 * 1000) : undefined,
    reason,
    autoApplied: true,
  };
  
  // Store mitigation
  await db.collection('stalking_mitigations').doc(mitigationId).set(mitigation);
  
  // Update case counters
  const updates: Partial<StalkingCase> = {};
  if (actionType === 'WARNING') updates.warningsSent = (stalkingCase.warningsSent || 0) + 1;
  if (actionType === 'CHAT_FREEZE') updates.chatsFrozen = (stalkingCase.chatsFrozen || 0) + 1;
  if (actionType === 'GLOBAL_TIMEOUT') updates.timeoutsApplied = (stalkingCase.timeoutsApplied || 0) + 1;
  
  if (Object.keys(updates).length > 0) {
    await db.collection('stalking_cases').doc(caseId).update(updates);
  }
  
  console.log(`[CyberstalkingDetection] Applied ${actionType} mitigation for case ${caseId}`);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get recent messages between two users
 */
async function getRecentMessages(
  senderId: string,
  recipientId: string,
  minutesBack: number
): Promise<any[]> {
  const cutoffTime = admin.firestore.Timestamp.fromMillis(
    Date.now() - minutesBack * 60 * 1000
  );
  
  try {
    const messagesSnapshot = await db.collection('messages')
      .where('senderId', '==', senderId)
      .where('recipientId', '==', recipientId)
      .where('createdAt', '>=', cutoffTime)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    
    return messagesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('[CyberstalkingDetection] Error fetching messages:', error);
    return [];
  }
}

/**
 * Store behavior in database
 */
async function storeBehavior(behavior: StalkingBehavior): Promise<void> {
  await db.collection('stalking_behaviors').doc(behavior.id).set(behavior);
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return db.collection('_').doc().id;
}

/**
 * Check if user has active stalking restrictions
 */
export async function checkStalkingRestrictions(userId: string): Promise<{
  isRestricted: boolean;
  restrictions: MitigationAction[];
}> {
  try {
    const now = admin.firestore.Timestamp.now();
    
    const restrictionsSnapshot = await db.collection('stalking_mitigations')
      .where('stalkerUserId', '==', userId)
      .where('actionType', 'in', ['CHAT_FREEZE', 'GLOBAL_TIMEOUT', 'PERMANENT_BAN'])
      .get();
    
    const activeRestrictions = restrictionsSnapshot.docs
      .map(doc => doc.data() as MitigationAction)
      .filter(m => !m.expiresAt || m.expiresAt.toMillis() > now.toMillis());
    
    return {
      isRestricted: activeRestrictions.length > 0,
      restrictions: activeRestrictions,
    };
  } catch (error) {
    console.error('[CyberstalkingDetection] Error checking restrictions:', error);
    return { isRestricted: false, restrictions: [] };
  }
}