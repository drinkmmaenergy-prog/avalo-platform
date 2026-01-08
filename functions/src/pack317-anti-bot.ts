/**
 * PACK 317 — Anti-Bot & Spam Protection
 * 
 * Server-side heuristics and spam detection to prevent abuse:
 * - Disposable email blocking
 * - Same IP/device registration detection
 * - Spam message detection (same text to many users)
 * - Integration with Risk Engine for soft-blocking
 * 
 * CRITICAL: NO tokenomics changes, all decisions are reversible
 */

import { db, serverTimestamp, generateId, increment, arrayUnion } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logTechEvent } from './pack90-logging';
import { writeAuditLog } from './auditLogger';

// ============================================================================
// DISPOSABLE EMAIL DETECTION
// ============================================================================

/**
 * Known disposable email domains (expandable)
 */
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com',
  'guerrillamail.com',
  'mailinator.com',
  '10minutemail.com',
  'throwaway.email',
  'temp-mail.org',
  'fakeinbox.com',
  'trashmail.com',
  'yopmail.com',
  'maildrop.cc',
];

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  
  return DISPOSABLE_EMAIL_DOMAINS.some(disposable => 
    domain === disposable || domain.endsWith('.' + disposable)
  );
}

// ============================================================================
// REGISTRATION ABUSE DETECTION
// ============================================================================

export interface RegistrationCheck {
  allowed: boolean;
  reason?: string;
  riskFlags: string[];
}

/**
 * Check registration for abuse patterns
 */
export async function checkRegistrationAbuse(params: {
  email: string;
  ipHash: string;
  deviceId?: string;
}): Promise<RegistrationCheck> {
  const riskFlags: string[] = [];
  
  // Check disposable email
  if (isDisposableEmail(params.email)) {
    riskFlags.push('DISPOSABLE_EMAIL');
  }
  
  // Check for multiple accounts from same IP (last 24h)
  const ipRegistrations = await db
    .collection('pack317_registrations')
    .where('ipHash', '==', params.ipHash)
    .where('createdAt', '>=', Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
    .limit(10)
    .get();
  
  if (ipRegistrations.size >= 5) {
    riskFlags.push('EXCESSIVE_IP_REGISTRATIONS');
  }
  
  // Check for multiple accounts from same device
  if (params.deviceId) {
    const deviceRegistrations = await db
      .collection('pack317_registrations')
      .where('deviceId', '==', params.deviceId)
      .where('createdAt', '>=', Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .limit(5)
      .get();
    
    if (deviceRegistrations.size >= 3) {
      riskFlags.push('EXCESSIVE_DEVICE_REGISTRATIONS');
    }
  }
  
  // Log registration attempt
  await db.collection('pack317_registrations').add({
    email: params.email,
    ipHash: params.ipHash,
    deviceId: params.deviceId || null,
    riskFlags,
    createdAt: serverTimestamp(),
  });
  
  // Decision: Allow but flag for Risk Engine if suspicious
  const allowed = riskFlags.length < 2; // Block if 2+ red flags
  
  if (!allowed) {
    await logTechEvent({
      level: 'WARN',
      category: 'SECURITY',
      functionName: 'checkRegistrationAbuse',
      message: 'Registration blocked due to abuse patterns',
      context: {
        email: params.email.substring(0, 3) + '***', // Partial for privacy
        riskFlags,
      },
    });
  }
  
  return {
    allowed,
    reason: allowed ? undefined : 'Registration blocked due to suspicious activity',
    riskFlags,
  };
}

// ============================================================================
// SPAM MESSAGE DETECTION
// ============================================================================

interface SpamCheckResult {
  isSpam: boolean;
  reason?: string;
  action: 'ALLOW' | 'THROTTLE' | 'SOFT_BLOCK';
}

/**
 * Check if message is spam
 */
export async function checkMessageSpam(params: {
  userId: string;
  messageText: string;
  recipientId: string;
}): Promise<SpamCheckResult> {
  
  // Check for identical messages to multiple users (last hour)
  const messageHash = hashMessage(params.messageText);
  
  const recentMessages = await db
    .collection('pack317_message_tracking')
    .where('userId', '==', params.userId)
    .where('messageHash', '==', messageHash)
    .where('createdAt', '>=', Timestamp.fromMillis(Date.now() - 60 * 60 * 1000))
    .limit(10)
    .get();
  
  const uniqueRecipients = new Set(
    recentMessages.docs.map(doc => doc.data().recipientId)
  );
  
  // Log this message
  await db.collection('pack317_message_tracking').add({
    userId: params.userId,
    messageHash,
    recipientId: params.recipientId,
    createdAt: serverTimestamp(),
  });
  
  // Same message to 5+ different users = spam
  if (uniqueRecipients.size >= 5) {
    await logSpamDetection(params.userId, 'SAME_MESSAGE_MULTIPLE_USERS', {
      uniqueRecipients: uniqueRecipients.size,
      timeWindow: '1h',
    });
    
    return {
      isSpam: true,
      reason: 'Identical message sent to multiple users',
      action: 'SOFT_BLOCK',
    };
  }
  
  // Same message to 3-4 users = throttle
  if (uniqueRecipients.size >= 3) {
    return {
      isSpam: false,
      reason: 'Similar messaging pattern detected',
      action: 'THROTTLE',
    };
  }
  
  return {
    isSpam: false,
    action: 'ALLOW',
  };
}

function hashMessage(text: string): string {
  const crypto = require('crypto');
  // Normalize text (lowercase, remove extra spaces)
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return crypto.createHash('md5').update(normalized).digest('hex');
}

async function logSpamDetection(
  userId: string,
  type: string,
  metadata: Record<string, any>
): Promise<void> {
  try {
    await db.collection('pack317_spam_detections').add({
      userId,
      type,
      metadata,
      timestamp: serverTimestamp(),
    });
    
    await logTechEvent({
      level: 'WARN',
      category: 'SECURITY',
      functionName: 'checkMessageSpam',
      message: `Spam detected: ${type}`,
      context: { userId, ...metadata },
    });
  } catch (error) {
    console.error('[Pack317] Failed to log spam detection:', error);
  }
}

// ============================================================================
// RISK ENGINE INTEGRATION
// ============================================================================

export interface RiskEngineAction {
  action: 'LIMIT_MODE' | 'REVIEW' | 'NONE';
  reason: string;
  duration?: number; // milliseconds
}

/**
 * Trigger risk engine action for spam/abuse
 */
export async function triggerRiskEngineAction(
  userId: string,
  action: RiskEngineAction
): Promise<void> {
  try {
    // Create risk event in existing risk engine (PACK 268)
    await db.collection('risk_events').add({
      userId,
      eventType: 'SPAM_DETECTED',
      action: action.action,
      reason: action.reason,
      duration: action.duration,
      createdAt: serverTimestamp(),
      source: 'PACK317_ANTI_BOT',
    });
    
    // If LIMIT_MODE, update user enforcement
    if (action.action === 'LIMIT_MODE') {
      const expiresAt = action.duration 
        ? Timestamp.fromMillis(Date.now() + action.duration)
        : null;
      
      await db.collection('enforcement_states').doc(userId).set({
        limitedMode: true,
        limitedModeReason: action.reason,
        limitedModeExpiresAt: expiresAt,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      // Log enforcement change
      await logTechEvent({
        level: 'WARN',
        category: 'SECURITY',
        functionName: 'triggerRiskEngineAction',
        message: 'User placed in limited mode',
        context: { userId, reason: action.reason, duration: action.duration },
      });
    }
  } catch (error) {
    console.error('[Pack317] Failed to trigger risk engine:', error);
  }
}

// ============================================================================
// SPAM SUSPECT FLAGGING
// ============================================================================

/**
 * Flag user as spam suspect (integrates with existing safety engine)
 */
export async function flagSpamSuspect(
  userId: string,
  reason: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    // Increment risk score in existing trust/risk system
    await db.collection('trust_risk_profiles').doc(userId).set({
      riskScore: increment(10), // Small increment
      riskFlags: arrayUnion('SPAM_SUSPECT'),
      lastSpamFlag: serverTimestamp(),
      spamReason: reason,
      spamMetadata: metadata || {},
      updatedAt: serverTimestamp(),
    }, { merge: true });
    
    await logTechEvent({
      level: 'WARN',
      category: 'SECURITY',
      functionName: 'flagSpamSuspect',
      message: 'User flagged as spam suspect',
      context: { userId, reason, ...metadata },
    });
  } catch (error) {
    console.error('[Pack317] Failed to flag spam suspect:', error);
  }
}