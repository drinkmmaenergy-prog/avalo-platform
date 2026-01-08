/**
 * PACK 430 — AGE-GATE ENFORCEMENT (18+ ONLY)
 * 
 * Enforces 100% 18+ access only across all monetization features.
 * Integrates with PACK 110 (Identity & KYC) and PACK 296 (Audit Logs).
 * 
 * HARD RULES:
 * - Age verification required before ANY monetization
 * - User must pass ONE verification method
 * - Incomplete verification = AGE_RESTRICTED mode
 * - All actions audit-logged
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export enum AgeVerificationMethod {
  SELFIE = 'SELFIE',           // Live selfie age estimation (AI)
  ID = 'ID',                   // Government ID verification (KYC)
  BANK = 'BANK',               // Bank card verification (age check)
  MANUAL = 'MANUAL',           // Manual admin review
}

export enum AgeVerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export interface AgeVerificationProfile {
  status: AgeVerificationStatus;
  method?: AgeVerificationMethod;
  verifiedAt?: admin.firestore.Timestamp;
  expiresAt?: admin.firestore.Timestamp;
  estimatedAge?: number;
  verificationProvider?: string;
  verificationId?: string;
  rejectionReason?: string;
  manualReviewedBy?: string;
  lastAttemptAt?: admin.firestore.Timestamp;
  attemptCount: number;
}

export interface AgeRestriction {
  isRestricted: boolean;
  reason: string;
  blockedFeatures: string[];
  requiredAction?: string;
}

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const MINIMUM_AGE = 18;
const VERIFICATION_EXPIRY_DAYS = 365; // Re-verify every year
const MAX_ATTEMPTS_PER_DAY = 3;

// Features blocked when age unverified
const BLOCKED_FEATURES = [
  'chat',
  'calendar',
  'earnings',
  'payouts',
  'voice_calls',
  'video_calls',
  'events',
  'adult_content',
  'ai_companions',
  'monetization',
  'discovery_adult',
];

// ─────────────────────────────────────────────────────────────────
// AGE-GATE ENFORCEMENT ENGINE
// ─────────────────────────────────────────────────────────────────

export class AgeGateEnforcer {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Check if user requires age verification
   */
  async requiresAgeVerification(userId: string, action: string): Promise<boolean> {
    const profile = await this.getAgeVerificationProfile(userId);

    // Never verified
    if (profile.status === AgeVerificationStatus.UNVERIFIED) {
      logger.info(`User ${userId} requires age verification for action: ${action}`);
      return true;
    }

    // Verification pending
    if (profile.status === AgeVerificationStatus.PENDING) {
      logger.info(`User ${userId} has pending age verification for action: ${action}`);
      return true;
    }

    // Verification rejected
    if (profile.status === AgeVerificationStatus.REJECTED) {
      logger.warn(`User ${userId} age verification rejected for action: ${action}`);
      return true;
    }

    // Verification expired
    if (profile.status === AgeVerificationStatus.EXPIRED) {
      logger.info(`User ${userId} age verification expired for action: ${action}`);
      return true;
    }

    // Check expiry date
    if (profile.expiresAt && profile.expiresAt.toDate() < new Date()) {
      await this.expireVerification(userId);
      return true;
    }

    return false;
  }

  /**
   * Get user's age verification profile
   */
  async getAgeVerificationProfile(userId: string): Promise<AgeVerificationProfile> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData || !userData.ageVerification) {
      return {
        status: AgeVerificationStatus.UNVERIFIED,
        attemptCount: 0,
      };
    }

    return userData.ageVerification as AgeVerificationProfile;
  }

  /**
   * Check if user is age-restricted
   */
  async getAgeRestriction(userId: string): Promise<AgeRestriction> {
    const profile = await this.getAgeVerificationProfile(userId);

    if (profile.status === AgeVerificationStatus.VERIFIED) {
      return {
        isRestricted: false,
        reason: '',
        blockedFeatures: [],
      };
    }

    let reason = 'Age verification required';
    let requiredAction = 'Complete age verification to unlock all features';

    if (profile.status === AgeVerificationStatus.PENDING) {
      reason = 'Age verification pending review';
      requiredAction = 'Please wait for verification to complete';
    } else if (profile.status === AgeVerificationStatus.REJECTED) {
      reason = 'Age verification rejected';
      requiredAction = profile.rejectionReason || 'Please contact support';
    } else if (profile.status === AgeVerificationStatus.EXPIRED) {
      reason = 'Age verification expired';
      requiredAction = 'Please re-verify your age';
    }

    return {
      isRestricted: true,
      reason,
      blockedFeatures: BLOCKED_FEATURES,
      requiredAction,
    };
  }

  /**
   * Start age verification process
   */
  async startVerification(
    userId: string,
    method: AgeVerificationMethod,
    estimatedAge?: number
  ): Promise<{ success: boolean; verificationId?: string; error?: string }> {
    try {
      const profile = await this.getAgeVerificationProfile(userId);

      // Check daily attempt limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (
        profile.lastAttemptAt &&
        profile.lastAttemptAt.toDate() >= today &&
        profile.attemptCount >= MAX_ATTEMPTS_PER_DAY
      ) {
        return {
          success: false,
          error: 'Maximum verification attempts reached for today',
        };
      }

      const verificationId = `age_verify_${userId}_${Date.now()}`;
      const now = admin.firestore.Timestamp.now();

      // Update verification profile
      await this.db.collection('users').doc(userId).update({
        'ageVerification.status': AgeVerificationStatus.PENDING,
        'ageVerification.method': method,
        'ageVerification.verificationId': verificationId,
        'ageVerification.lastAttemptAt': now,
        'ageVerification.attemptCount': admin.firestore.FieldValue.increment(1),
        'ageVerification.estimatedAge': estimatedAge || null,
      });

      // Log to audit
      await this.logAudit(userId, 'AGE_VERIFICATION_STARTED', {
        method,
        verificationId,
        estimatedAge,
      });

      logger.info(`Age verification started for user ${userId} with method ${method}`);

      return { success: true, verificationId };
    } catch (error) {
      logger.error(`Failed to start age verification for user ${userId}:`, error);
      return { success: false, error: 'Failed to start verification' };
    }
  }

  /**
   * Complete age verification (called by KYC provider webhook)
   */
  async completeVerification(
    userId: string,
    verificationId: string,
    approved: boolean,
    data: {
      estimatedAge?: number;
      provider?: string;
      rejectionReason?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const profile = await this.getAgeVerificationProfile(userId);

      if (profile.verificationId !== verificationId) {
        return { success: false, error: 'Invalid verification ID' };
      }

      const now = admin.firestore.Timestamp.now();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + VERIFICATION_EXPIRY_DAYS);

      if (approved && (!data.estimatedAge || data.estimatedAge >= MINIMUM_AGE)) {
        // Verification approved
        await this.db.collection('users').doc(userId).update({
          'ageVerified': true,
          'ageVerification.status': AgeVerificationStatus.VERIFIED,
          'ageVerification.verifiedAt': now,
          'ageVerification.expiresAt': admin.firestore.Timestamp.fromDate(expiresAt),
          'ageVerification.estimatedAge': data.estimatedAge || null,
          'ageVerification.verificationProvider': data.provider || 'unknown',
        });

        await this.logAudit(userId, 'AGE_VERIFICATION_APPROVED', {
          verificationId,
          estimatedAge: data.estimatedAge,
          provider: data.provider,
        });

        logger.info(`Age verification approved for user ${userId}`);
        return { success: true };
      } else {
        // Verification rejected
        await this.db.collection('users').doc(userId).update({
          'ageVerified': false,
          'ageVerification.status': AgeVerificationStatus.REJECTED,
          'ageVerification.rejectionReason': data.rejectionReason || 'Age requirement not met',
          'ageVerification.estimatedAge': data.estimatedAge || null,
        });

        await this.logAudit(userId, 'AGE_VERIFICATION_REJECTED', {
          verificationId,
          reason: data.rejectionReason,
          estimatedAge: data.estimatedAge,
        });

        logger.warn(`Age verification rejected for user ${userId}`);
        return { success: true }; // Success = processed, not approved
      }
    } catch (error) {
      logger.error(`Failed to complete age verification for user ${userId}:`, error);
      return { success: false, error: 'Failed to complete verification' };
    }
  }

  /**
   * Manual age verification by admin
   */
  async manualVerification(
    userId: string,
    approved: boolean,
    adminId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const now = admin.firestore.Timestamp.now();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + VERIFICATION_EXPIRY_DAYS);

      if (approved) {
        await this.db.collection('users').doc(userId).update({
          'ageVerified': true,
          'ageVerification.status': AgeVerificationStatus.VERIFIED,
          'ageVerification.method': AgeVerificationMethod.MANUAL,
          'ageVerification.verifiedAt': now,
          'ageVerification.expiresAt': admin.firestore.Timestamp.fromDate(expiresAt),
          'ageVerification.manualReviewedBy': adminId,
        });
      } else {
        await this.db.collection('users').doc(userId).update({
          'ageVerified': false,
          'ageVerification.status': AgeVerificationStatus.REJECTED,
          'ageVerification.method': AgeVerificationMethod.MANUAL,
          'ageVerification.rejectionReason': reason,
          'ageVerification.manualReviewedBy': adminId,
        });
      }

      await this.logAudit(userId, 'AGE_VERIFICATION_MANUAL', {
        approved,
        adminId,
        reason,
      });

      logger.info(`Manual age verification for user ${userId} by admin ${adminId}: ${approved ? 'APPROVED' : 'REJECTED'}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed manual age verification for user ${userId}:`, error);
      return { success: false, error: 'Failed to process manual verification' };
    }
  }

  /**
   * Expire age verification
   */
  async expireVerification(userId: string): Promise<void> {
    try {
      await this.db.collection('users').doc(userId).update({
        'ageVerified': false,
        'ageVerification.status': AgeVerificationStatus.EXPIRED,
      });

      await this.logAudit(userId, 'AGE_VERIFICATION_EXPIRED', {});
      logger.info(`Age verification expired for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to expire age verification for user ${userId}:`, error);
    }
  }

  /**
   * Enforce age gate at critical actions
   */
  async enforceAgeGate(
    userId: string,
    action: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const requiresVerification = await this.requiresAgeVerification(userId, action);

    if (requiresVerification) {
      const restriction = await this.getAgeRestriction(userId);
      
      await this.logAudit(userId, 'AGE_GATE_BLOCKED', {
        action,
        reason: restriction.reason,
      });

      return {
        allowed: false,
        reason: restriction.reason,
      };
    }

    return { allowed: true };
  }

  /**
   * Log audit trail (integrates with PACK 296)
   */
  private async logAudit(
    userId: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.collection('auditLogs').add({
        userId,
        action,
        category: 'AGE_GATE',
        metadata,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        ip: null, // Can be added from context
        userAgent: null, // Can be added from context
      });
    } catch (error) {
      logger.error(`Failed to log audit for user ${userId}:`, error);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// GATE CHECKPOINTS
// ─────────────────────────────────────────────────────────────────

/**
 * Age gate checkpoint: Registration
 */
export async function checkAgeGateRegistration(userId: string): Promise<boolean> {
  const enforcer = new AgeGateEnforcer();
  const result = await enforcer.enforceAgeGate(userId, 'REGISTRATION');
  return result.allowed;
}

/**
 * Age gate checkpoint: First Withdrawal
 */
export async function checkAgeGateWithdrawal(userId: string): Promise<boolean> {
  const enforcer = new AgeGateEnforcer();
  const result = await enforcer.enforceAgeGate(userId, 'WITHDRAWAL');
  return result.allowed;
}

/**
 * Age gate checkpoint: Calendar Monetization
 */
export async function checkAgeGateCalendar(userId: string): Promise<boolean> {
  const enforcer = new AgeGateEnforcer();
  const result = await enforcer.enforceAgeGate(userId, 'CALENDAR_MONETIZATION');
  return result.allowed;
}

/**
 * Age gate checkpoint: Adult Content
 */
export async function checkAgeGateAdultContent(userId: string): Promise<boolean> {
  const enforcer = new AgeGateEnforcer();
  const result = await enforcer.enforceAgeGate(userId, 'ADULT_CONTENT');
  return result.allowed;
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

export default AgeGateEnforcer;
