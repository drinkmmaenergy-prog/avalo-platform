/**
 * PACK 141 - AI Companion Safety Filter
 * 
 * Enforces STRICT safety rules:
 * - Zero romance monetization
 * - Zero NSFW content
 * - Zero emotional dependency loops
 * - Zero consent/safety bypasses
 */

import { db, serverTimestamp, increment } from './init';
import {
  EmotionalSafetyCheck,
  SafetyConcern,
  SafetyAction,
  BlockedPhrase,
  BLOCKED_ROMANTIC_PHRASES,
  BLOCKED_NSFW_PHRASES,
  DEPENDENCY_WARNING_PHRASES,
  WELLNESS_TRIGGER_PHRASES,
  WellnessEscalation,
} from './types/pack141-types';

// ============================================================================
// SAFETY FILTER ENGINE
// ============================================================================

/**
 * Main safety filter - checks message for prohibited content
 */
export async function checkMessageSafety(
  userId: string,
  companionId: string,
  messageText: string
): Promise<EmotionalSafetyCheck> {
  const checkId = `safety_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const detectedConcerns: SafetyConcern[] = [];
  
  // Normalize text for checking
  const normalizedText = messageText.toLowerCase().trim();
  
  // Check 1: Romantic/intimacy requests (BLOCK)
  for (const blockedPhrase of BLOCKED_ROMANTIC_PHRASES) {
    if (normalizedText.includes(blockedPhrase.phrase.toLowerCase())) {
      detectedConcerns.push(blockedPhrase.category);
    }
  }
  
  // Check 2: NSFW requests (BLOCK)
  for (const blockedPhrase of BLOCKED_NSFW_PHRASES) {
    if (normalizedText.includes(blockedPhrase.phrase.toLowerCase())) {
      detectedConcerns.push(blockedPhrase.category);
    }
  }
  
  // Check 3: Dependency patterns (WARN)
  for (const blockedPhrase of DEPENDENCY_WARNING_PHRASES) {
    if (normalizedText.includes(blockedPhrase.phrase.toLowerCase())) {
      detectedConcerns.push(blockedPhrase.category);
    }
  }
  
  // Check 4: Wellness triggers (ESCALATE)
  const hasWellnessTrigger = WELLNESS_TRIGGER_PHRASES.some(phrase =>
    normalizedText.includes(phrase)
  );
  
  if (hasWellnessTrigger) {
    // Emergency escalation
    await createWellnessEscalation(userId, companionId, messageText, 'CRITICAL');
    detectedConcerns.push('EMOTIONAL_MANIPULATION');
  }
  
  // Check 5: Consent violation attempts
  if (normalizedText.includes('bypass') || 
      normalizedText.includes('ignore safety') ||
      normalizedText.includes('disable filter')) {
    detectedConcerns.push('CONSENT_VIOLATION');
  }
  
  // Determine risk level and action
  const { riskLevel, action } = determineRiskLevelAndAction(detectedConcerns, hasWellnessTrigger);
  
  // Store safety check
  const safetyCheck: EmotionalSafetyCheck = {
    checkId,
    userId,
    companionId,
    messageText,
    detectedConcerns,
    riskLevel,
    action,
    timestamp: serverTimestamp() as any,
  };
  
  // Log to Firestore
  await db.collection('ai_companion_safety_checks').doc(checkId).set(safetyCheck);
  
  // Log to PACK 130 (Patrol AI) if high risk
  if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
    await logToPatrolAI(userId, companionId, detectedConcerns, riskLevel);
  }
  
  return safetyCheck;
}

/**
 * Determine risk level and appropriate action
 */
function determineRiskLevelAndAction(
  concerns: SafetyConcern[],
  hasWellnessTrigger: boolean
): { riskLevel: EmotionalSafetyCheck['riskLevel']; action: SafetyAction } {
  // Wellness triggers = CRITICAL
  if (hasWellnessTrigger) {
    return { riskLevel: 'CRITICAL', action: 'ESCALATE' };
  }
  
  // No concerns = NONE
  if (concerns.length === 0) {
    return { riskLevel: 'NONE', action: 'ALLOW' };
  }
  
  // Consent violations or multiple NSFW/romantic = HIGH
  if (concerns.includes('CONSENT_VIOLATION') ||
      concerns.includes('BYPASSING_RESTRICTIONS') ||
      concerns.filter(c => c.includes('NSFW') || c.includes('ROMANTIC')).length >= 2) {
    return { riskLevel: 'HIGH', action: 'BLOCK' };
  }
  
  // Any romantic/NSFW/intimacy request = MEDIUM
  if (concerns.includes('ROMANTIC_REQUEST') ||
      concerns.includes('INTIMACY_REQUEST') ||
      concerns.includes('NSFW_REQUEST') ||
      concerns.includes('FLIRT_REQUEST') ||
      concerns.includes('BODY_SEXUALIZATION')) {
    return { riskLevel: 'MEDIUM', action: 'BLOCK' };
  }
  
  // Dependency pattern only = LOW
  if (concerns.includes('DEPENDENCY_PATTERN')) {
    return { riskLevel: 'LOW', action: 'WARN' };
  }
  
  // Default for other concerns
  return { riskLevel: 'LOW', action: 'REDIRECT' };
}

/**
 * Get appropriate response message based on detected concerns
 */
export function getBlockedMessageResponse(concerns: SafetyConcern[]): string {
  // Priority order: wellness > consent > romantic > nsfw > dependency
  
  if (concerns.includes('EMOTIONAL_MANIPULATION')) {
    return 'I notice you might be struggling emotionally. Would you like me to connect you with support resources that can help?';
  }
  
  if (concerns.includes('CONSENT_VIOLATION') || concerns.includes('BYPASSING_RESTRICTIONS')) {
    return 'I can\'t help with bypassing safety features. These protections are here for everyone\'s wellbeing. How can I help you with your goals instead?';
  }
  
  if (concerns.includes('ROMANTIC_REQUEST') || concerns.includes('INTIMACY_REQUEST')) {
    return 'I\'m here as a supportive companion, not for romance or intimacy. How can I help with your goals instead?';
  }
  
  if (concerns.includes('FLIRT_REQUEST')) {
    return 'I\'m an AI assistant focused on helping you achieve your goals. What would you like to work on today?';
  }
  
  if (concerns.includes('NSFW_REQUEST') || concerns.includes('BODY_SEXUALIZATION')) {
    return 'This type of content isn\'t available. I can help with productivity, learning, fitness, or other safe topics instead.';
  }
  
  if (concerns.includes('DEPENDENCY_PATTERN')) {
    return 'I\'m glad I can help, but building real human connections is important too. Have you considered joining a community or reaching out to friends?';
  }
  
  return 'Let\'s keep our conversation helpful and appropriate. What would you like to work on today?';
}

/**
 * Find matching blocked phrase for detailed response
 */
export function findBlockedPhrase(messageText: string): BlockedPhrase | null {
  const normalizedText = messageText.toLowerCase().trim();
  
  // Check romantic phrases
  for (const phrase of BLOCKED_ROMANTIC_PHRASES) {
    if (normalizedText.includes(phrase.phrase.toLowerCase())) {
      return phrase;
    }
  }
  
  // Check NSFW phrases
  for (const phrase of BLOCKED_NSFW_PHRASES) {
    if (normalizedText.includes(phrase.phrase.toLowerCase())) {
      return phrase;
    }
  }
  
  // Check dependency phrases
  for (const phrase of DEPENDENCY_WARNING_PHRASES) {
    if (normalizedText.includes(phrase.phrase.toLowerCase())) {
      return phrase;
    }
  }
  
  return null;
}

// ============================================================================
// WELLNESS ESCALATION
// ============================================================================

/**
 * Create wellness escalation for users expressing distress
 */
async function createWellnessEscalation(
  userId: string,
  companionId: string,
  triggerMessage: string,
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
): Promise<void> {
  const escalationId = `wellness_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const escalation: WellnessEscalation = {
    escalationId,
    userId,
    companionId,
    triggerReason: 'User expressed emotional distress or self-harm thoughts',
    riskLevel,
    suggestedResources: await getWellnessResources(userId),
    requiresModeratorReview: riskLevel === 'CRITICAL' || riskLevel === 'HIGH',
    escalatedAt: serverTimestamp() as any,
  };
  
  await db.collection('ai_companion_wellness_escalations').doc(escalationId).set(escalation);
  
  // If critical, also create PACK 130 case
  if (riskLevel === 'CRITICAL') {
    await createPatrolAICase(userId, companionId, triggerMessage);
  }
}

/**
 * Get wellness resources for user's region (PACK 122 integration)
 */
async function getWellnessResources(userId: string): Promise<string[]> {
  try {
    // Get user's region
    const userDoc = await db.collection('users').doc(userId).get();
    const region = userDoc.data()?.profile?.country || 'US';
    
    // Get regional safety resources (PACK 122)
    const resourcesSnapshot = await db.collection('safety_resources')
      .where('region', '==', region)
      .where('type', 'in', ['CRISIS_HOTLINE', 'MENTAL_HEALTH'])
      .where('enabled', '==', true)
      .limit(5)
      .get();
    
    const resources: string[] = [];
    resourcesSnapshot.forEach(doc => {
      const data = doc.data();
      resources.push(`${data.name}: ${data.phoneNumber || data.website}`);
    });
    
    // Fallback to global resources if none found
    if (resources.length === 0) {
      resources.push('National Suicide Prevention Lifeline: 988');
      resources.push('Crisis Text Line: Text HOME to 741741');
    }
    
    return resources;
  } catch (error) {
    console.error('Error getting wellness resources:', error);
    return [
      'National Suicide Prevention Lifeline: 988',
      'Crisis Text Line: Text HOME to 741741',
    ];
  }
}

// ============================================================================
// CONVERSATION LIMITER (DEPENDENCY PREVENTION)
// ============================================================================

/**
 * Check if user has exceeded conversation limits
 */
export async function checkConversationLimits(
  userId: string,
  companionId: string
): Promise<{
  allowed: boolean;
  reason?: string;
  cooldownUntil?: Date;
}> {
  const limitsDoc = await db.collection('ai_companion_conversation_limits')
    .doc(`${userId}_${companionId}`)
    .get();
  
  if (!limitsDoc.exists) {
    // No limits yet, create default
    await initializeConversationLimits(userId, companionId);
    return { allowed: true };
  }
  
  const limits = limitsDoc.data()!;
  
  // Check if cooldown is active
  if (limits.cooldownRequired && limits.cooldownUntil) {
    const cooldownEnd = limits.cooldownUntil.toDate();
    if (new Date() < cooldownEnd) {
      return {
        allowed: false,
        reason: 'Taking a break helps maintain healthy usage patterns. Please try again later.',
        cooldownUntil: cooldownEnd,
      };
    }
  }
  
  // Check daily message limit
  const today = new Date().toISOString().split('T')[0];
  const dailyCountDoc = await db.collection('ai_companion_daily_usage')
    .doc(`${userId}_${companionId}_${today}`)
    .get();
  
  if (dailyCountDoc.exists) {
    const dailyCount = dailyCountDoc.data()!.messageCount || 0;
    if (dailyCount >= limits.dailyMessageLimit) {
      return {
        allowed: false,
        reason: 'You\'ve reached today\'s message limit. This helps maintain balance. Try again tomorrow!',
      };
    }
  }
  
  // Check consecutive usage time
  const lastInteraction = limits.lastInteractionAt?.toDate() || new Date(0);
  const minutesSinceLastInteraction = (Date.now() - lastInteraction.getTime()) / 60000;
  
  // If user has been chatting for too long, enforce break
  if (minutesSinceLastInteraction < 0.5 && limits.consecutiveMinutesUsed >= limits.consecutiveMinuteLimit) {
    const cooldownMinutes = 30;
    const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60000);
    
    await db.collection('ai_companion_conversation_limits')
      .doc(`${userId}_${companionId}`)
      .update({
        cooldownRequired: true,
        cooldownUntil,
        updatedAt: serverTimestamp(),
      });
    
    return {
      allowed: false,
      reason: 'Taking regular breaks is important. Let\'s pause for 30 minutes.',
      cooldownUntil,
    };
  }
  
  return { allowed: true };
}

/**
 * Initialize conversation limits for new user-companion pair
 */
async function initializeConversationLimits(
  userId: string,
  companionId: string
): Promise<void> {
  await db.collection('ai_companion_conversation_limits')
    .doc(`${userId}_${companionId}`)
    .set({
      userId,
      companionId,
      dailyMessageLimit: 200,
      consecutiveMinuteLimit: 120,
      cooldownRequired: false,
      consecutiveMinutesUsed: 0,
      healthCheckRequired: false,
      lastInteractionAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
}

/**
 * Update usage tracking
 */
export async function updateUsageTracking(
  userId: string,
  companionId: string,
  messageCount: number = 1
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const dailyUsageRef = db.collection('ai_companion_daily_usage')
    .doc(`${userId}_${companionId}_${today}`);
  
  const limitsRef = db.collection('ai_companion_conversation_limits')
    .doc(`${userId}_${companionId}`);
  
  // Update daily count
  const dailyDoc = await dailyUsageRef.get();
  if (dailyDoc.exists) {
    await dailyUsageRef.update({
      messageCount: (dailyDoc.data()!.messageCount || 0) + messageCount,
      lastMessageAt: serverTimestamp(),
    });
  } else {
    await dailyUsageRef.set({
      userId,
      companionId,
      date: today,
      messageCount,
      lastMessageAt: serverTimestamp(),
    });
  }
  
  // Update limits
  await limitsRef.update({
    lastInteractionAt: serverTimestamp(),
    consecutiveMinutesUsed: increment(1),
  });
}

// ============================================================================
// INTEGRATION WITH PACK 126 (SAFETY) AND PACK 130 (PATROL AI)
// ============================================================================

/**
 * Log high-risk behavior to PACK 130 Patrol AI
 */
async function logToPatrolAI(
  userId: string,
  companionId: string,
  concerns: SafetyConcern[],
  riskLevel: string
): Promise<void> {
  try {
    // Log to PACK 130 patrol_behavior_log
    await db.collection('patrol_behavior_log').add({
      userId,
      eventType: 'AI_COMPANION_SAFETY_VIOLATION',
      confidence: riskLevel === 'CRITICAL' ? 0.95 : 0.85,
      evidence: {
        companionId,
        concerns: concerns.join(', '),
        source: 'AI_COMPANION',
      },
      detectedAt: serverTimestamp(),
      totalOccurrences: 1,
    });
  } catch (error) {
    console.error('Error logging to Patrol AI:', error);
  }
}

/**
 * Create PACK 130 case for critical incidents
 */
async function createPatrolAICase(
  userId: string,
  companionId: string,
  triggerMessage: string
): Promise<void> {
  try {
    // Create PACK 130 patrol case
    await db.collection('patrol_cases').add({
      userId,
      priority: 'CRITICAL',
      category: 'CHILD_SAFETY_OR_WELLNESS',
      harmPotential: 100,
      urgency: 'IMMEDIATE',
      detectionSignals: {
        source: 'AI_COMPANION',
        companionId,
        wellnessTrigger: true,
      },
      status: 'PENDING',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error creating Patrol AI case:', error);
  }
}

// All functions are already exported above