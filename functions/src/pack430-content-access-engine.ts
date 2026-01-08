/**
 * PACK 430 — CONTENT ACCESS BY LEGAL STATUS
 * 
 * Controls content and feature access based on:
 * - Age verification status
 * - Jurisdiction profile
 * - Subscription level
 * - Abuse history
 * 
 * Integrates with:
 * - PACK 430 Age Gate
 * - PACK 430 Jurisdiction Engine
 * - PACK 430 Legal Consent
 * - PACK 240+ (Safety)
 * 
 * HARD RULES:
 * - Legal restrictions override all other factors
 * - Access denials are audit-logged
 * - Multi-factor checks (age + jurisdiction + consent)
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import AgeGateEnforcer from './pack430-age-gate';
import JurisdictionEngine from './pack430-jurisdiction-engine';
import LegalConsentEngine from './pack430-legal-consent';

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export enum ContentCategory {
  DISCOVERY = 'DISCOVERY',
  CHAT_MEDIA = 'CHAT_MEDIA',
  VOICE_CALLS = 'VOICE_CALLS',
  VIDEO_CALLS = 'VIDEO_CALLS',
  AI_COMPANIONS = 'AI_COMPANIONS',
  EVENTS = 'EVENTS',
  CALENDAR_MONETIZATION = 'CALENDAR_MONETIZATION',
  ADULT_CONTENT = 'ADULT_CONTENT',
  EXPLICIT_CONTENT = 'EXPLICIT_CONTENT',
  LIVE_STREAMING = 'LIVE_STREAMING',
  CRYPTO_FEATURES = 'CRYPTO_FEATURES',
}

export enum AccessDenialReason {
  AGE_NOT_VERIFIED = 'AGE_NOT_VERIFIED',
  AGE_VERIFICATION_REJECTED = 'AGE_VERIFICATION_REJECTED',
  JURISDICTION_BLOCKED = 'JURISDICTION_BLOCKED',
  STORE_POLICY_BLOCKED = 'STORE_POLICY_BLOCKED',
  CONSENT_MISSING = 'CONSENT_MISSING',
  CONSENT_EXPIRED = 'CONSENT_EXPIRED',
  ABUSE_HISTORY = 'ABUSE_HISTORY',
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED',
  ACCOUNT_RESTRICTED = 'ACCOUNT_RESTRICTED',
}

export interface AccessCheckResult {
  allowed: boolean;
  reason?: AccessDenialReason;
  description?: string;
  requiredAction?: string;
  blockedBy?: string[];
}

export interface ContentAccessProfile {
  userId: string;
  allowedCategories: ContentCategory[];
  blockedCategories: ContentCategory[];
  restrictions: {
    category: ContentCategory;
    reason: AccessDenialReason;
    description: string;
  }[];
  lastChecked: admin.firestore.Timestamp;
}

// ─────────────────────────────────────────────────────────────────
// CONTENT ACCESS ENGINE
// ─────────────────────────────────────────────────────────────────

export class ContentAccessEngine {
  private db: admin.firestore.Firestore;
  private ageGate: AgeGateEnforcer;
  private jurisdictionEngine: JurisdictionEngine;
  private legalConsent: LegalConsentEngine;

  constructor() {
    this.db = admin.firestore();
    this.ageGate = new AgeGateEnforcer();
    this.jurisdictionEngine = new JurisdictionEngine();
    this.legalConsent = new LegalConsentEngine();
  }

  /**
   * Check if user can access specific content category
   */
  async checkAccess(
    userId: string,
    category: ContentCategory
  ): Promise<AccessCheckResult> {
    logger.info(`Checking access for user ${userId} to category ${category}`);

    // Run all checks in parallel
    const [
      ageCheck,
      jurisdictionCheck,
      consentCheck,
      abuseCheck,
      subscriptionCheck,
    ] = await Promise.all([
      this.checkAge(userId, category),
      this.checkJurisdiction(userId, category),
      this.checkConsent(userId, category),
      this.checkAbuseHistory(userId, category),
      this.checkSubscription(userId, category),
    ]);

    // Aggregate results (any denial blocks access)
    const checks = [
      ageCheck,
      jurisdictionCheck,
      consentCheck,
      abuseCheck,
      subscriptionCheck,
    ];

    const denied = checks.find(check => !check.allowed);

    if (denied) {
      // Log denial
      await this.logAudit(userId, 'CONTENT_ACCESS_DENIED', {
        category,
        reason: denied.reason,
        description: denied.description,
      });

      return denied;
    }

    // Access granted
    return {
      allowed: true,
    };
  }

  /**
   * Check age verification for content category
   */
  private async checkAge(
    userId: string,
    category: ContentCategory
  ): Promise<AccessCheckResult> {
    // Categories that require age verification
    const ageRestrictedCategories = [
      ContentCategory.CHAT_MEDIA,
      ContentCategory.VOICE_CALLS,
      ContentCategory.VIDEO_CALLS,
      ContentCategory.CALENDAR_MONETIZATION,
      ContentCategory.EVENTS,
      ContentCategory.ADULT_CONTENT,
      ContentCategory.EXPLICIT_CONTENT,
      ContentCategory.AI_COMPANIONS,
    ];

    if (!ageRestrictedCategories.includes(category)) {
      return { allowed: true };
    }

    const requiresVerification = await this.ageGate.requiresAgeVerification(
      userId,
      category
    );

    if (requiresVerification) {
      const restriction = await this.ageGate.getAgeRestriction(userId);

      return {
        allowed: false,
        reason: AccessDenialReason.AGE_NOT_VERIFIED,
        description: restriction.reason,
        requiredAction: restriction.requiredAction,
        blockedBy: ['AGE_GATE'],
      };
    }

    return { allowed: true };
  }

  /**
   * Check jurisdiction restrictions for content category
   */
  private async checkJurisdiction(
    userId: string,
    category: ContentCategory
  ): Promise<AccessCheckResult> {
    // Map content categories to jurisdiction features
    const featureMap: Record<ContentCategory, string> = {
      [ContentCategory.DISCOVERY]: 'monetization',
      [ContentCategory.CHAT_MEDIA]: 'monetization',
      [ContentCategory.VOICE_CALLS]: 'voiceCalls',
      [ContentCategory.VIDEO_CALLS]: 'videoCalls',
      [ContentCategory.AI_COMPANIONS]: 'aiCompanions',
      [ContentCategory.EVENTS]: 'events',
      [ContentCategory.CALENDAR_MONETIZATION]: 'calendarBookings',
      [ContentCategory.ADULT_CONTENT]: 'adultContent',
      [ContentCategory.EXPLICIT_CONTENT]: 'adultContent',
      [ContentCategory.LIVE_STREAMING]: 'liveStreaming',
      [ContentCategory.CRYPTO_FEATURES]: 'cryptoPayments',
    };

    const jurisdictionFeature = featureMap[category];
    if (!jurisdictionFeature) {
      return { allowed: true };
    }

    const result = await this.jurisdictionEngine.isFeatureAllowed(
      userId,
      jurisdictionFeature as any
    );

    if (!result.allowed) {
      return {
        allowed: false,
        reason: AccessDenialReason.JURISDICTION_BLOCKED,
        description: result.reason || 'Feature not available in your region',
        requiredAction: 'This feature is restricted in your jurisdiction',
        blockedBy: ['JURISDICTION'],
      };
    }

    return { allowed: true };
  }

  /**
   * Check legal consent for content category
   */
  private async checkConsent(
    userId: string,
    category: ContentCategory
  ): Promise<AccessCheckResult> {
    // Map content categories to required actions
    const actionMap: Record<ContentCategory, string> = {
      [ContentCategory.CALENDAR_MONETIZATION]: 'CALENDAR_SESSION',
      [ContentCategory.EVENTS]: 'EVENT_CREATION',
      [ContentCategory.ADULT_CONTENT]: 'ADULT_CONTENT_ACCESS',
      [ContentCategory.EXPLICIT_CONTENT]: 'ADULT_CONTENT_ACCESS',
      [ContentCategory.CHAT_MEDIA]: 'WALLET_TOPUP',
      [ContentCategory.VOICE_CALLS]: 'WALLET_TOPUP',
      [ContentCategory.VIDEO_CALLS]: 'WALLET_TOPUP',
      [ContentCategory.AI_COMPANIONS]: 'WALLET_TOPUP',
      [ContentCategory.DISCOVERY]: 'REGISTRATION',
      [ContentCategory.LIVE_STREAMING]: 'WALLET_TOPUP',
      [ContentCategory.CRYPTO_FEATURES]: 'WALLET_TOPUP',
    };

    const requiredAction = actionMap[category];
    if (!requiredAction) {
      return { allowed: true };
    }

    const result = await this.legalConsent.enforceConsentGate(
      userId,
      requiredAction
    );

    if (!result.allowed) {
      const missing = result.missingConsents || [];
      const expired = result.expiredConsents || [];

      return {
        allowed: false,
        reason: missing.length > 0
          ? AccessDenialReason.CONSENT_MISSING
          : AccessDenialReason.CONSENT_EXPIRED,
        description: 'Please accept required legal agreements',
        requiredAction: `Accept: ${[...missing, ...expired].join(', ')}`,
        blockedBy: ['LEGAL_CONSENT'],
      };
    }

    return { allowed: true };
  }

  /**
   * Check abuse history for content category
   */
  private async checkAbuseHistory(
    userId: string,
    category: ContentCategory
  ): Promise<AccessCheckResult> {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      if (!userData) {
        return { allowed: true };
      }

      // Check if account is restricted due to abuse
      if (userData.accountStatus === 'RESTRICTED') {
        const restrictedCategories = userData.restrictedCategories || [];

        if (restrictedCategories.includes(category)) {
          return {
            allowed: false,
            reason: AccessDenialReason.ACCOUNT_RESTRICTED,
            description: 'Your account has been restricted from this feature',
            requiredAction: 'Please contact support for more information',
            blockedBy: ['ABUSE_HISTORY'],
          };
        }
      }

      // Check if account is banned
      if (userData.accountStatus === 'BANNED') {
        return {
          allowed: false,
          reason: AccessDenialReason.ACCOUNT_RESTRICTED,
          description: 'Your account has been banned',
          requiredAction: 'Please contact support',
          blockedBy: ['ABUSE_HISTORY'],
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error(`Failed to check abuse history for user ${userId}:`, error);
      return { allowed: true }; // Fail open
    }
  }

  /**
   * Check subscription level for content category
   */
  private async checkSubscription(
    userId: string,
    category: ContentCategory
  ): Promise<AccessCheckResult> {
    // Categories that require premium subscription
    const premiumCategories = [
      // ContentCategory.AI_COMPANIONS, // Example: Premium-only feature
    ];

    if (!premiumCategories.includes(category)) {
      return { allowed: true };
    }

    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      if (!userData || !userData.subscriptionLevel || userData.subscriptionLevel === 'FREE') {
        return {
          allowed: false,
          reason: AccessDenialReason.SUBSCRIPTION_REQUIRED,
          description: 'This feature requires a premium subscription',
          requiredAction: 'Upgrade to Premium to unlock this feature',
          blockedBy: ['SUBSCRIPTION'],
        };
      }

      return { allowed: true };
    } catch (error) {
      logger.error(`Failed to check subscription for user ${userId}:`, error);
      return { allowed: true }; // Fail open
    }
  }

  /**
   * Build complete content access profile for user
   */
  async buildAccessProfile(userId: string): Promise<ContentAccessProfile> {
    const allCategories = Object.values(ContentCategory);
    const allowed: ContentCategory[] = [];
    const blocked: ContentCategory[] = [];
    const restrictions: ContentAccessProfile['restrictions'] = [];

    for (const category of allCategories) {
      const result = await this.checkAccess(userId, category);

      if (result.allowed) {
        allowed.push(category);
      } else {
        blocked.push(category);
        restrictions.push({
          category,
          reason: result.reason!,
          description: result.description || 'Access denied',
        });
      }
    }

    const profile: ContentAccessProfile = {
      userId,
      allowedCategories: allowed,
      blockedCategories: blocked,
      restrictions,
      lastChecked: admin.firestore.Timestamp.now(),
    };

    // Store profile (cache for 5 minutes)
    await this.db.collection('contentAccessProfiles').doc(userId).set({
      ...profile,
      expiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 5 * 60 * 1000)
      ),
    });

    logger.info(
      `Built content access profile for user ${userId}: ${allowed.length} allowed, ${blocked.length} blocked`
    );

    return profile;
  }

  /**
   * Get cached content access profile (or build new one)
   */
  async getAccessProfile(userId: string): Promise<ContentAccessProfile> {
    try {
      const profileDoc = await this.db.collection('contentAccessProfiles').doc(userId).get();
      const profileData = profileDoc.data();

      if (profileData && profileData.expiresAt.toDate() > new Date()) {
        return profileData as ContentAccessProfile;
      }
    } catch (error) {
      logger.warn(`Failed to get cached access profile for user ${userId}:`, error);
    }

    // Build new profile
    return await this.buildAccessProfile(userId);
  }

  /**
   * Batch check multiple categories at once (performance optimization)
   */
  async batchCheckAccess(
    userId: string,
    categories: ContentCategory[]
  ): Promise<Record<ContentCategory, AccessCheckResult>> {
    const results: Record<ContentCategory, AccessCheckResult> = {} as any;

    // Use cached profile if available
    const profile = await this.getAccessProfile(userId);

    for (const category of categories) {
      if (profile.allowedCategories.includes(category)) {
        results[category] = { allowed: true };
      } else {
        const restriction = profile.restrictions.find(r => r.category === category);
        results[category] = {
          allowed: false,
          reason: restriction?.reason || AccessDenialReason.ACCOUNT_RESTRICTED,
          description: restriction?.description || 'Access denied',
        };
      }
    }

    return results;
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
        category: 'CONTENT_ACCESS',
        metadata,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.error(`Failed to log audit for user ${userId}:`, error);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// CONVENIENCE FUNCTIONS
// ─────────────────────────────────────────────────────────────────

/**
 * Check if user can access adult content
 */
export async function canAccessAdultContent(userId: string): Promise<boolean> {
  const engine = new ContentAccessEngine();
  const result = await engine.checkAccess(userId, ContentCategory.ADULT_CONTENT);
  return result.allowed;
}

/**
 * Check if user can use video calls
 */
export async function canUseVideoCalls(userId: string): Promise<boolean> {
  const engine = new ContentAccessEngine();
  const result = await engine.checkAccess(userId, ContentCategory.VIDEO_CALLS);
  return result.allowed;
}

/**
 * Check if user can monetize calendar
 */
export async function canMonetizeCalendar(userId: string): Promise<boolean> {
  const engine = new ContentAccessEngine();
  const result = await engine.checkAccess(userId, ContentCategory.CALENDAR_MONETIZATION);
  return result.allowed;
}

/**
 * Get user's full content access profile
 */
export async function getUserAccessProfile(userId: string): Promise<ContentAccessProfile> {
  const engine = new ContentAccessEngine();
  return await engine.getAccessProfile(userId);
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

export default ContentAccessEngine;
