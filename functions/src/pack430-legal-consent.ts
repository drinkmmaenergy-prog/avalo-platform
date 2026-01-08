/**
 * PACK 430 — CONSENT & LEGAL ACCEPTANCE LAYER
 * 
 * Manages user consent for terms, privacy policy, and feature-specific agreements.
 * Creates immutable audit trail for all legal acceptances.
 * 
 * Integrates with PACK 296 (Audit Logs).
 * 
 * HARD RULES:
 * - All consents must be explicitly accepted
 * - Version changes require re-acceptance
 * - Consent history is immutable
 * - Missing consent blocks feature access
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export enum ConsentType {
  TERMS_OF_SERVICE = 'TERMS_OF_SERVICE',
  PRIVACY_POLICY = 'PRIVACY_POLICY',
  COMMUNITY_GUIDELINES = 'COMMUNITY_GUIDELINES',
  MONETIZATION_AGREEMENT = 'MONETIZATION_AGREEMENT',
  ADULT_CONTENT_AGREEMENT = 'ADULT_CONTENT_AGREEMENT',
  PAYOUT_AGREEMENT = 'PAYOUT_AGREEMENT',
  EVENT_HOSTING_AGREEMENT = 'EVENT_HOSTING_AGREEMENT',
  CALENDAR_AGREEMENT = 'CALENDAR_AGREEMENT',
  DATA_PROCESSING = 'DATA_PROCESSING',
  MARKETING_CONSENT = 'MARKETING_CONSENT',
}

export interface ConsentRecord {
  type: ConsentType;
  version: string;
  accepted: boolean;
  acceptedAt: admin.firestore.Timestamp;
  ipAddress?: string;
  userAgent?: string;
  jurisdiction: string;
  method: 'CHECKBOX' | 'BUTTON' | 'SIGNATURE' | 'BIOMETRIC';
  metadata?: Record<string, any>;
}

export interface LegalProfile {
  termsAcceptedVersion: string | null;
  privacyAcceptedVersion: string | null;
  communityGuidelinesAcceptedVersion: string | null;
  monetizationAgreementAccepted: boolean;
  adultContentAgreementAccepted: boolean;
  payoutAgreementAccepted: boolean;
  consentHistory: ConsentRecord[];
  lastConsentUpdate: admin.firestore.Timestamp;
  jurisdictionSnapshot: string;
}

export interface RequiredConsents {
  required: ConsentType[];
  missing: ConsentType[];
  expired: ConsentType[];
}

// ─────────────────────────────────────────────────────────────────
// CURRENT LEGAL DOCUMENT VERSIONS
// ─────────────────────────────────────────────────────────────────

/**
 * Current versions of legal documents
 * Update these when legal documents change
 */
const CURRENT_VERSIONS = {
  TERMS_OF_SERVICE: '2.0.0',
  PRIVACY_POLICY: '2.0.0',
  COMMUNITY_GUIDELINES: '1.5.0',
  MONETIZATION_AGREEMENT: '1.0.0',
  ADULT_CONTENT_AGREEMENT: '1.0.0',
  PAYOUT_AGREEMENT: '1.2.0',
  EVENT_HOSTING_AGREEMENT: '1.0.0',
  CALENDAR_AGREEMENT: '1.0.0',
  DATA_PROCESSING: '1.1.0',
};

// ─────────────────────────────────────────────────────────────────
// LEGAL CONSENT ENGINE
// ─────────────────────────────────────────────────────────────────

export class LegalConsentEngine {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Get user's legal profile
   */
  async getLegalProfile(userId: string): Promise<LegalProfile | null> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData || !userData.legalProfile) {
      return {
        termsAcceptedVersion: null,
        privacyAcceptedVersion: null,
        communityGuidelinesAcceptedVersion: null,
        monetizationAgreementAccepted: false,
        adultContentAgreementAccepted: false,
        payoutAgreementAccepted: false,
        consentHistory: [],
        lastConsentUpdate: admin.firestore.Timestamp.now(),
        jurisdictionSnapshot: 'UNKNOWN',
      };
    }

    return userData.legalProfile as LegalProfile;
  }

  /**
   * Record user consent
   */
  async recordConsent(
    userId: string,
    consentType: ConsentType,
    version: string,
    context: {
      ipAddress?: string;
      userAgent?: string;
      jurisdiction: string;
      method?: 'CHECKBOX' | 'BUTTON' | 'SIGNATURE' | 'BIOMETRIC';
      metadata?: Record<string, any>;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const now = admin.firestore.Timestamp.now();
      
      const consentRecord: ConsentRecord = {
        type: consentType,
        version,
        accepted: true,
        acceptedAt: now,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        jurisdiction: context.jurisdiction,
        method: context.method || 'BUTTON',
        metadata: context.metadata,
      };

      // Update legal profile
      const updateData: any = {
        'legalProfile.lastConsentUpdate': now,
        'legalProfile.jurisdictionSnapshot': context.jurisdiction,
        'legalProfile.consentHistory': admin.firestore.FieldValue.arrayUnion(consentRecord),
      };

      // Update specific consent fields
      switch (consentType) {
        case ConsentType.TERMS_OF_SERVICE:
          updateData['legalProfile.termsAcceptedVersion'] = version;
          break;
        case ConsentType.PRIVACY_POLICY:
          updateData['legalProfile.privacyAcceptedVersion'] = version;
          break;
        case ConsentType.COMMUNITY_GUIDELINES:
          updateData['legalProfile.communityGuidelinesAcceptedVersion'] = version;
          break;
        case ConsentType.MONETIZATION_AGREEMENT:
          updateData['legalProfile.monetizationAgreementAccepted'] = true;
          updateData['legalProfile.monetizationAgreementVersion'] = version;
          break;
        case ConsentType.ADULT_CONTENT_AGREEMENT:
          updateData['legalProfile.adultContentAgreementAccepted'] = true;
          updateData['legalProfile.adultContentAgreementVersion'] = version;
          break;
        case ConsentType.PAYOUT_AGREEMENT:
          updateData['legalProfile.payoutAgreementAccepted'] = true;
          updateData['legalProfile.payoutAgreementVersion'] = version;
          break;
      }

      await this.db.collection('users').doc(userId).update(updateData);

      // Create immutable consent record in separate collection
      await this.db.collection('legalConsents').add({
        userId,
        ...consentRecord,
        recordedAt: now,
      });

      // Log to audit
      await this.logAudit(userId, 'CONSENT_RECORDED', {
        consentType,
        version,
        jurisdiction: context.jurisdiction,
      });

      logger.info(`Consent recorded for user ${userId}: ${consentType} v${version}`);

      return { success: true };
    } catch (error) {
      logger.error(`Failed to record consent for user ${userId}:`, error);
      return { success: false, error: 'Failed to record consent' };
    }
  }

  /**
   * Check if user has accepted required consents for an action
   */
  async checkRequiredConsents(
    userId: string,
    action: string
  ): Promise<RequiredConsents> {
    const profile = await this.getLegalProfile(userId);
    const required = this.getRequiredConsentsForAction(action);
    const missing: ConsentType[] = [];
    const expired: ConsentType[] = [];

    for (const consentType of required) {
      const hasConsent = await this.hasValidConsent(userId, consentType, profile);
      
      if (!hasConsent.valid) {
        if (hasConsent.reason === 'expired') {
          expired.push(consentType);
        } else {
          missing.push(consentType);
        }
      }
    }

    return { required, missing, expired };
  }

  /**
   * Check if user has valid consent for specific type
   */
  private async hasValidConsent(
    userId: string,
    consentType: ConsentType,
    profile: LegalProfile | null
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!profile) {
      return { valid: false, reason: 'no_profile' };
    }

    const currentVersion = CURRENT_VERSIONS[consentType];

    switch (consentType) {
      case ConsentType.TERMS_OF_SERVICE:
        if (!profile.termsAcceptedVersion) {
          return { valid: false, reason: 'not_accepted' };
        }
        if (profile.termsAcceptedVersion !== currentVersion) {
          return { valid: false, reason: 'expired' };
        }
        return { valid: true };

      case ConsentType.PRIVACY_POLICY:
        if (!profile.privacyAcceptedVersion) {
          return { valid: false, reason: 'not_accepted' };
        }
        if (profile.privacyAcceptedVersion !== currentVersion) {
          return { valid: false, reason: 'expired' };
        }
        return { valid: true };

      case ConsentType.COMMUNITY_GUIDELINES:
        if (!profile.communityGuidelinesAcceptedVersion) {
          return { valid: false, reason: 'not_accepted' };
        }
        if (profile.communityGuidelinesAcceptedVersion !== currentVersion) {
          return { valid: false, reason: 'expired' };
        }
        return { valid: true };

      case ConsentType.MONETIZATION_AGREEMENT:
        return {
          valid: profile.monetizationAgreementAccepted === true,
          reason: profile.monetizationAgreementAccepted ? undefined : 'not_accepted',
        };

      case ConsentType.ADULT_CONTENT_AGREEMENT:
        return {
          valid: profile.adultContentAgreementAccepted === true,
          reason: profile.adultContentAgreementAccepted ? undefined : 'not_accepted',
        };

      case ConsentType.PAYOUT_AGREEMENT:
        return {
          valid: profile.payoutAgreementAccepted === true,
          reason: profile.payoutAgreementAccepted ? undefined : 'not_accepted',
        };

      default:
        return { valid: false, reason: 'unknown_type' };
    }
  }

  /**
   * Get required consents for specific action
   */
  private getRequiredConsentsForAction(action: string): ConsentType[] {
    const baseConsents = [
      ConsentType.TERMS_OF_SERVICE,
      ConsentType.PRIVACY_POLICY,
      ConsentType.COMMUNITY_GUIDELINES,
    ];

    switch (action) {
      case 'REGISTRATION':
        return baseConsents;

      case 'WALLET_TOPUP':
        return [...baseConsents, ConsentType.MONETIZATION_AGREEMENT];

      case 'PAYOUT':
        return [
          ...baseConsents,
          ConsentType.MONETIZATION_AGREEMENT,
          ConsentType.PAYOUT_AGREEMENT,
        ];

      case 'EVENT_CREATION':
        return [
          ...baseConsents,
          ConsentType.MONETIZATION_AGREEMENT,
          ConsentType.EVENT_HOSTING_AGREEMENT,
        ];

      case 'CALENDAR_SESSION':
        return [
          ...baseConsents,
          ConsentType.MONETIZATION_AGREEMENT,
          ConsentType.CALENDAR_AGREEMENT,
        ];

      case 'ADULT_CONTENT_ACCESS':
        return [
          ...baseConsents,
          ConsentType.ADULT_CONTENT_AGREEMENT,
        ];

      default:
        return baseConsents;
    }
  }

  /**
   * Enforce consent gate at critical actions
   */
  async enforceConsentGate(
    userId: string,
    action: string
  ): Promise<{ allowed: boolean; missingConsents?: ConsentType[]; expiredConsents?: ConsentType[] }> {
    const consents = await this.checkRequiredConsents(userId, action);

    if (consents.missing.length > 0 || consents.expired.length > 0) {
      await this.logAudit(userId, 'CONSENT_GATE_BLOCKED', {
        action,
        missing: consents.missing,
        expired: consents.expired,
      });

      return {
        allowed: false,
        missingConsents: consents.missing,
        expiredConsents: consents.expired,
      };
    }

    return { allowed: true };
  }

  /**
   * Revoke user consent
   */
  async revokeConsent(
    userId: string,
    consentType: ConsentType,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const now = admin.firestore.Timestamp.now();

      // Update legal profile
      const updateData: any = {
        'legalProfile.lastConsentUpdate': now,
      };

      switch (consentType) {
        case ConsentType.TERMS_OF_SERVICE:
          updateData['legalProfile.termsAcceptedVersion'] = null;
          break;
        case ConsentType.PRIVACY_POLICY:
          updateData['legalProfile.privacyAcceptedVersion'] = null;
          break;
        case ConsentType.COMMUNITY_GUIDELINES:
          updateData['legalProfile.communityGuidelinesAcceptedVersion'] = null;
          break;
        case ConsentType.MONETIZATION_AGREEMENT:
          updateData['legalProfile.monetizationAgreementAccepted'] = false;
          break;
        case ConsentType.ADULT_CONTENT_AGREEMENT:
          updateData['legalProfile.adultContentAgreementAccepted'] = false;
          break;
        case ConsentType.PAYOUT_AGREEMENT:
          updateData['legalProfile.payoutAgreementAccepted'] = false;
          break;
      }

      await this.db.collection('users').doc(userId).update(updateData);

      // Log revocation
      await this.db.collection('legalConsents').add({
        userId,
        type: consentType,
        accepted: false,
        revokedAt: now,
        revokeReason: reason,
        recordedAt: now,
      });

      await this.logAudit(userId, 'CONSENT_REVOKED', {
        consentType,
        reason,
      });

      logger.info(`Consent revoked for user ${userId}: ${consentType}`);

      return { success: true };
    } catch (error) {
      logger.error(`Failed to revoke consent for user ${userId}:`, error);
      return { success: false, error: 'Failed to revoke consent' };
    }
  }

  /**
   * Export user's consent history (GDPR compliance)
   */
  async exportConsentHistory(userId: string): Promise<ConsentRecord[]> {
    const profile = await this.getLegalProfile(userId);
    
    if (!profile) {
      return [];
    }

    // Also get from immutable collection
    const consentsSnapshot = await this.db
      .collection('legalConsents')
      .where('userId', '==', userId)
      .orderBy('recordedAt', 'desc')
      .get();

    const immutableRecords = consentsSnapshot.docs.map(doc => doc.data() as ConsentRecord);

    // Combine and deduplicate
    const allRecords = [...profile.consentHistory, ...immutableRecords];
    
    return allRecords;
  }

  /**
   * Admin: Force consent invalidation (legal document update)
   */
  async invalidateConsentsForUpdate(
    consentType: ConsentType,
    newVersion: string,
    adminId: string,
    reason: string
  ): Promise<void> {
    logger.warn(`Admin ${adminId} invalidating all ${consentType} consents for version update to ${newVersion}`);

    // Update current version
    CURRENT_VERSIONS[consentType] = newVersion;

    await this.logAudit('SYSTEM', 'CONSENTS_INVALIDATED', {
      consentType,
      newVersion,
      adminId,
      reason,
    });

    // Note: Users will be prompted to re-accept on next access
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
        category: 'LEGAL_CONSENT',
        metadata,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.error(`Failed to log audit for user ${userId}:`, error);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// CONSENT CHECKPOINTS
// ─────────────────────────────────────────────────────────────────

/**
 * Consent checkpoint: Registration
 */
export async function checkConsentsForRegistration(userId: string): Promise<boolean> {
  const engine = new LegalConsentEngine();
  const result = await engine.enforceConsentGate(userId, 'REGISTRATION');
  return result.allowed;
}

/**
 * Consent checkpoint: Wallet Top-up
 */
export async function checkConsentsForWalletTopup(userId: string): Promise<boolean> {
  const engine = new LegalConsentEngine();
  const result = await engine.enforceConsentGate(userId, 'WALLET_TOPUP');
  return result.allowed;
}

/**
 * Consent checkpoint: Payout
 */
export async function checkConsentsForPayout(userId: string): Promise<boolean> {
  const engine = new LegalConsentEngine();
  const result = await engine.enforceConsentGate(userId, 'PAYOUT');
  return result.allowed;
}

/**
 * Consent checkpoint: Event Creation
 */
export async function checkConsentsForEventCreation(userId: string): Promise<boolean> {
  const engine = new LegalConsentEngine();
  const result = await engine.enforceConsentGate(userId, 'EVENT_CREATION');
  return result.allowed;
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

export default LegalConsentEngine;
