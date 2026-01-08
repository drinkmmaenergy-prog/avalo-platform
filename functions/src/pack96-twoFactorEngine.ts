/**
 * PACK 96 - Two-Factor Authentication & Step-Up Verification
 * Core Engine Logic
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import {
  SensitiveAction,
  StepUpRequirement,
  StepUpPolicyResult,
  User2FAChallenge,
  User2FASettings,
  User2FAEvent,
  TwoFactorEventType,
  ChallengeResult,
  DEFAULT_2FA_CONFIG,
} from './types/twoFactor.types';

const db = getFirestore();

// ============================================================================
// Step-Up Policy Evaluation
// ============================================================================

/**
 * Evaluate whether a user needs step-up verification for a sensitive action
 */
export async function evaluateStepUpRequirement(
  userId: string,
  action: SensitiveAction
): Promise<StepUpPolicyResult> {
  const reasonCodes: string[] = [];
  
  try {
    // Get user's 2FA settings
    const twoFASettings = await get2FASettingsInternal(userId);
    const has2FAEnabled = twoFASettings?.enabled || false;
    
    // Get action policy
    const actionPolicy = DEFAULT_2FA_CONFIG.actionPolicies[action];
    let requirement = actionPolicy.baseRequirement;
    
    // If user has 2FA enabled, check if this action requires it
    if (has2FAEnabled && actionPolicy.requireFor2FAUsers) {
      requirement = 'REQUIRED';
      reasonCodes.push('2FA_ENABLED');
    }
    
    // Check if user has recent strong auth in session
    const hasRecentStrongAuth = await checkRecentStrongAuth(userId, action);
    if (hasRecentStrongAuth) {
      // Downgrade requirement if within strong-auth window
      if (requirement === 'REQUIRED') {
        requirement = 'RECOMMENDED';
        reasonCodes.push('RECENT_STRONG_AUTH');
      } else if (requirement === 'RECOMMENDED') {
        requirement = 'NONE';
        reasonCodes.push('RECENT_STRONG_AUTH');
      }
    }
    
    // Check user's risk profile (PACK 85 integration)
    try {
      const trustProfileDoc = await db
        .collection('user_trust_profile')
        .doc(userId)
        .get();
      
      if (trustProfileDoc.exists) {
        const trustProfile = trustProfileDoc.data();
        const riskScore = trustProfile?.riskScore || 0;
        
        // High-risk users require step-up for sensitive actions
        if (riskScore >= DEFAULT_2FA_CONFIG.highRiskScoreThreshold) {
          if (requirement === 'NONE' || requirement === 'RECOMMENDED') {
            requirement = 'REQUIRED';
          }
          reasonCodes.push('HIGH_RISK_USER');
        }
        
        // Check for specific flags that require step-up
        const flags = trustProfile?.flags || [];
        if (flags.includes('PAYMENT_FRAUD_RISK') && 
            (action === 'PAYOUT_REQUEST_CREATE' || action === 'PAYOUT_METHOD_CREATE')) {
          requirement = 'REQUIRED';
          reasonCodes.push('PAYMENT_FRAUD_RISK');
        }
      }
    } catch (error) {
      console.warn('[2FA] Failed to check trust profile:', error);
      // Don't fail the whole operation, just log
    }
    
    // Check enforcement status (PACK 87 integration)
    try {
      const enforcementDoc = await db
        .collection('user_enforcement_state')
        .doc(userId)
        .get();
      
      if (enforcementDoc.exists) {
        const enforcement = enforcementDoc.data();
        const accountStatus = enforcement?.accountStatus;
        
        // Suspended or hard-restricted accounts cannot bypass with step-up
        if (accountStatus === 'SUSPENDED' || accountStatus === 'HARD_RESTRICTED') {
          // Step-up verification alone cannot unblock these states
          reasonCodes.push('ACCOUNT_RESTRICTED');
        }
      }
    } catch (error) {
      console.warn('[2FA] Failed to check enforcement state:', error);
    }
    
    // High-value action detection
    if (action === 'PAYOUT_REQUEST_CREATE') {
      requirement = 'REQUIRED';
      reasonCodes.push('HIGH_VALUE_ACTION');
    }
    
    return {
      requirement,
      reasonCodes: reasonCodes.length > 0 ? reasonCodes : ['POLICY'],
    };
    
  } catch (error) {
    console.error('[2FA] Error evaluating step-up requirement:', error);
    // Fail-safe: require step-up on error for sensitive actions
    return {
      requirement: 'REQUIRED',
      reasonCodes: ['ERROR_SAFE_DEFAULT'],
    };
  }
}

/**
 * Check if user has recent strong authentication in their session
 */
async function checkRecentStrongAuth(
  userId: string,
  action: SensitiveAction
): Promise<boolean> {
  try {
    // Get active sessions with lastStrongAuthAt
    const sessionsSnapshot = await db
      .collection('user_sessions')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .orderBy('lastActiveAt', 'desc')
      .limit(1)
      .get();
    
    if (sessionsSnapshot.empty) {
      return false;
    }
    
    const session = sessionsSnapshot.docs[0].data();
    const lastStrongAuthAt = session.lastStrongAuthAt;
    
    if (!lastStrongAuthAt) {
      return false;
    }
    
    // Check if within strong-auth window
    const now = Timestamp.now();
    const windowMinutes = DEFAULT_2FA_CONFIG.strongAuthWindowMinutes;
    const windowMs = windowMinutes * 60 * 1000;
    const timeSinceAuth = now.toMillis() - lastStrongAuthAt.toMillis();
    
    return timeSinceAuth < windowMs;
    
  } catch (error) {
    console.warn('[2FA] Failed to check recent strong auth:', error);
    return false;
  }
}

// ============================================================================
// 2FA Challenge Lifecycle
// ============================================================================

/**
 * Initiate a step-up challenge for a sensitive action
 */
export async function initiateStepUpChallenge(
  userId: string,
  action: SensitiveAction,
  sessionId?: string,
  deviceId?: string
): Promise<{ challengeRequired: boolean; challengeId?: string; requirement?: StepUpRequirement; reasonCodes?: string[] }> {
  try {
    // Evaluate if challenge is needed
    const policyResult = await evaluateStepUpRequirement(userId, action);
    
    if (policyResult.requirement === 'NONE') {
      return {
        challengeRequired: false,
        requirement: 'NONE',
        reasonCodes: policyResult.reasonCodes,
      };
    }
    
    // Generate OTP code
    const otpCode = generateOTP(DEFAULT_2FA_CONFIG.otpLength);
    const codeHash = hashCode(otpCode);
    
    // Create challenge document
    const challengeId = crypto.randomUUID();
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(
      now.toMillis() + (DEFAULT_2FA_CONFIG.otpExpiryMinutes * 60 * 1000)
    );
    
    const challenge: User2FAChallenge = {
      id: challengeId,
      userId,
      action,
      codeHash,
      createdAt: now,
      expiresAt,
      attemptsLeft: DEFAULT_2FA_CONFIG.maxAttempts,
      sessionId,
      deviceId,
      resolved: false,
    };
    
    await db.collection('user_2fa_challenges').doc(challengeId).set(challenge);
    
    // Log event
    await log2FAEvent(userId, 'CHALLENGE_INITIATED', {
      action,
      challengeId,
      sessionId,
      deviceId,
    });
    
    // Send OTP via configured method
    await sendOTPCode(userId, otpCode, action);
    
    return {
      challengeRequired: true,
      challengeId,
      requirement: policyResult.requirement,
      reasonCodes: policyResult.reasonCodes,
    };
    
  } catch (error) {
    console.error('[2FA] Error initiating step-up challenge:', error);
    throw new Error('Failed to initiate verification challenge');
  }
}

/**
 * Verify a step-up challenge with provided code
 */
export async function verifyStepUpChallenge(
  userId: string,
  challengeId: string,
  code: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const challengeDoc = await db
      .collection('user_2fa_challenges')
      .doc(challengeId)
      .get();
    
    if (!challengeDoc.exists) {
      return { success: false, message: 'Invalid or expired verification code' };
    }
    
    const challenge = challengeDoc.data() as User2FAChallenge;
    
    // Validate challenge belongs to user
    if (challenge.userId !== userId) {
      return { success: false, message: 'Invalid verification code' };
    }
    
    // Check if already resolved
    if (challenge.resolved) {
      return { success: false, message: 'Verification code already used' };
    }
    
    // Check expiration
    const now = Timestamp.now();
    if (now.toMillis() > challenge.expiresAt.toMillis()) {
      await db.collection('user_2fa_challenges').doc(challengeId).update({
        resolved: true,
        result: 'EXPIRED',
        resolvedAt: now,
      });
      
      await log2FAEvent(userId, 'CHALLENGE_EXPIRED', {
        challengeId,
        action: challenge.action,
      });
      
      return { success: false, message: 'Verification code expired' };
    }
    
    // Check attempts remaining
    if (challenge.attemptsLeft <= 0) {
      await db.collection('user_2fa_challenges').doc(challengeId).update({
        resolved: true,
        result: 'FAILED',
        resolvedAt: now,
      });
      
      await log2FAEvent(userId, 'CHALLENGE_FAILED', {
        challengeId,
        action: challenge.action,
        reason: 'MAX_ATTEMPTS',
      });
      
      // Log to Trust Engine for abuse detection
      await logToTrustEngine(userId, 'FAILED_2FA_ATTEMPTS', {
        challengeId,
        action: challenge.action,
      });
      
      return { success: false, message: 'Maximum attempts exceeded' };
    }
    
    // Verify code
    const inputHash = hashCode(code);
    if (inputHash !== challenge.codeHash) {
      // Decrement attempts
      await db.collection('user_2fa_challenges').doc(challengeId).update({
        attemptsLeft: FieldValue.increment(-1),
      });
      
      return { 
        success: false, 
        message: `Incorrect code. ${challenge.attemptsLeft - 1} attempts remaining` 
      };
    }
    
    // Success! Mark as resolved
    await db.collection('user_2fa_challenges').doc(challengeId).update({
      resolved: true,
      result: 'SUCCESS',
      resolvedAt: now,
      attemptsLeft: 0,
    });
    
    // Log success event
    await log2FAEvent(userId, 'CHALLENGE_SUCCESS', {
      challengeId,
      action: challenge.action,
      sessionId: challenge.sessionId,
    });
    
    // Update session with strong auth timestamp
    if (challenge.sessionId) {
      await updateSessionStrongAuth(userId, challenge.sessionId);
    }
    
    return { success: true, message: 'Verification successful' };
    
  } catch (error) {
    console.error('[2FA] Error verifying challenge:', error);
    throw new Error('Failed to verify code');
  }
}

// ============================================================================
// 2FA Settings Management
// ============================================================================

/**
 * Enable 2FA for a user
 */
export async function enable2FA(
  userId: string,
  method: 'EMAIL_OTP',
  deliveryAddress: string
): Promise<void> {
  try {
    // Validate delivery address (basic email validation)
    if (method === 'EMAIL_OTP' && !isValidEmail(deliveryAddress)) {
      throw new Error('Invalid email address');
    }
    
    // Optionally: Send verification OTP before enabling
    // For v1, we'll enable directly
    
    const settings: User2FASettings = {
      userId,
      enabled: true,
      method,
      deliveryAddress,
      lastUpdatedAt: Timestamp.now(),
    };
    
    await db.collection('user_2fa_settings').doc(userId).set(settings);
    
    // Log event
    await log2FAEvent(userId, 'ENABLED', {
      method,
      maskedAddress: maskEmail(deliveryAddress),
    });
    
    // Send notification (PACK 92 integration)
    await send2FANotification(userId, 'ENABLED', deliveryAddress);
    
  } catch (error) {
    console.error('[2FA] Error enabling 2FA:', error);
    throw error;
  }
}

/**
 * Disable 2FA for a user (requires step-up verification)
 */
export async function disable2FA(userId: string): Promise<void> {
  try {
    const settingsDoc = await db.collection('user_2fa_settings').doc(userId).get();
    
    if (!settingsDoc.exists || !settingsDoc.data()?.enabled) {
      throw new Error('2FA is not enabled');
    }
    
    await db.collection('user_2fa_settings').doc(userId).update({
      enabled: false,
      lastUpdatedAt: Timestamp.now(),
    });
    
    // Log event
    await log2FAEvent(userId, 'DISABLED', {});
    
    // Send notification
    await send2FANotification(userId, 'DISABLED');
    
  } catch (error) {
    console.error('[2FA] Error disabling 2FA:', error);
    throw error;
  }
}

/**
 * Get 2FA settings for a user (internal, full data)
 */
async function get2FASettingsInternal(userId: string): Promise<User2FASettings | null> {
  try {
    const doc = await db.collection('user_2fa_settings').doc(userId).get();
    return doc.exists ? (doc.data() as User2FASettings) : null;
  } catch (error) {
    console.error('[2FA] Error getting 2FA settings:', error);
    return null;
  }
}

/**
 * Get 2FA settings for a user (sanitized for client)
 */
export async function get2FASettings(userId: string): Promise<{
  enabled: boolean;
  method?: string;
  maskedAddress?: string;
}> {
  try {
    const settings = await get2FASettingsInternal(userId);
    
    if (!settings) {
      return { enabled: false };
    }
    
    return {
      enabled: settings.enabled,
      method: settings.method,
      maskedAddress: maskEmail(settings.deliveryAddress),
    };
    
  } catch (error) {
    console.error('[2FA] Error getting 2FA settings:', error);
    return { enabled: false };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate numeric OTP code
 */
function generateOTP(length: number): string {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, digits.length);
    otp += digits[randomIndex];
  }
  
  return otp;
}

/**
 * Hash OTP code for storage
 */
function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Mask email for display
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  
  const visibleChars = Math.min(2, Math.floor(local.length / 3));
  const masked = local.substring(0, visibleChars) + '***';
  return `${masked}@${domain}`;
}

/**
 * Basic email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Update session with strong auth timestamp
 */
async function updateSessionStrongAuth(userId: string, sessionId: string): Promise<void> {
  try {
    const sessionQuery = await db
      .collection('user_sessions')
      .where('userId', '==', userId)
      .where('id', '==', sessionId)
      .limit(1)
      .get();
    
    if (!sessionQuery.empty) {
      await sessionQuery.docs[0].ref.update({
        lastStrongAuthAt: Timestamp.now(),
      });
    }
  } catch (error) {
    console.warn('[2FA] Failed to update session strong auth:', error);
  }
}

/**
 * Log 2FA event to audit trail
 */
async function log2FAEvent(
  userId: string,
  type: TwoFactorEventType,
  context: Record<string, any>
): Promise<void> {
  try {
    const event: User2FAEvent = {
      id: crypto.randomUUID(),
      userId,
      type,
      context,
      createdAt: Timestamp.now(),
    };
    
    await db.collection('user_2fa_events').add(event);
  } catch (error) {
    console.error('[2FA] Error logging event:', error);
  }
}

/**
 * Send OTP code via configured method
 */
async function sendOTPCode(
  userId: string,
  code: string,
  action: SensitiveAction
): Promise<void> {
  try {
    const settings = await get2FASettingsInternal(userId);
    
    if (!settings || !settings.enabled) {
      throw new Error('2FA not configured');
    }
    
    // For EMAIL_OTP, send via notification service
    // In production, use proper email service (SendGrid, etc.)
    console.log(`[2FA] Would send OTP ${code} to ${settings.deliveryAddress} for action ${action}`);
    
    // TODO: Integrate with email service
    // For now, log the code (only in development!)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[2FA DEV] OTP Code for ${userId}: ${code}`);
    }
    
  } catch (error) {
    console.error('[2FA] Error sending OTP:', error);
    throw new Error('Failed to send verification code');
  }
}

/**
 * Send 2FA status notification (PACK 92 integration)
 */
async function send2FANotification(
  userId: string,
  type: 'ENABLED' | 'DISABLED',
  deliveryAddress?: string
): Promise<void> {
  try {
    // Import notification function from PACK 92
    const { sendSystemNotification } = require('./pack92-notifications');
    
    const title = type === 'ENABLED' 
      ? 'Two-Factor Authentication Enabled'
      : 'Two-Factor Authentication Disabled';
    
    const body = type === 'ENABLED'
      ? `Two-factor authentication was enabled on your Avalo account${deliveryAddress ? ` using ${maskEmail(deliveryAddress)}` : ''}.`
      : 'Two-factor authentication was disabled. If this wasn\'t you, secure your account immediately.';
    
    await sendSystemNotification({
      userId,
      title,
      body,
      deepLink: 'avalo://security/two-factor',
    });
    
  } catch (error) {
    console.warn('[2FA] Failed to send notification:', error);
  }
}

/**
 * Log to Trust Engine for abuse detection (PACK 85 integration)
 */
async function logToTrustEngine(
  userId: string,
  eventType: string,
  metadata: Record<string, any>
): Promise<void> {
  try {
    // Import trust risk function from PACK 85
    const { logTrustEvent } = require('./trustRiskEngine');
    
    await logTrustEvent({
      userId,
      type: 'SECURITY_INCIDENT',
      weight: 5, // Failed 2FA attempts are moderately suspicious
      meta: {
        ...metadata,
        securityEvent: eventType,
        sourceModule: 'PACK_96_2FA',
      },
    });
    
  } catch (error) {
    console.warn('[2FA] Failed to log to trust engine:', error);
  }
}