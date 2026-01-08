/**
 * PACK 430 — STORE COMPLIANCE LAYER (APPLE / GOOGLE)
 * 
 * Ensures app store policy compliance by dynamically adjusting features
 * based on store requirements and user context.
 * 
 * Integrates with PACK 428 Feature Flags.
 * 
 * HARD RULES:
 * - Store policies override user preferences
 * - Safe mode is immutable when enforced
 * - All compliance decisions are audit-logged
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export enum AppStore {
  APPLE = 'APPLE',
  GOOGLE = 'GOOGLE',
  WEB = 'WEB',
  DESKTOP = 'DESKTOP',
}

export enum ComplianceMode {
  STANDARD = 'STANDARD',           // Full features (if jurisdiction allows)
  STORE_SAFE = 'STORE_SAFE',       // Store-friendly content only
  REVIEW_MODE = 'REVIEW_MODE',     // Extra safe during app review
  RESTRICTED = 'RESTRICTED',       // Limited features per store policy
}

export interface StoreComplianceProfile {
  appStore: AppStore;
  complianceMode: ComplianceMode;
  storeVersion: string;
  buildNumber: string;
  blockedFeatures: string[];
  contentFilters: {
    adultContentBlocked: boolean;
    explicitAIBlocked: boolean;
    monetizationHidden: boolean;
    cryptoPaymentsHidden: boolean;
    directMessagingRestricted: boolean;
  };
  uiAdjustments: {
    safeDescriptions: boolean;
    storeFriendlyFeed: boolean;
    hideSensitiveIcons: boolean;
    disableScreenshots: boolean;
  };
  lastUpdated: admin.firestore.Timestamp;
}

export interface StorePolicy {
  allowAdultContent: boolean;
  allowExplicitAI: boolean;
  allowDirectMonetization: boolean;
  allowCryptoPayments: boolean;
  allowUGCSharing: boolean;
  requireContentModeration: boolean;
  requireAgeGate: boolean;
  requireParentalControls: boolean;
}

// ─────────────────────────────────────────────────────────────────
// STORE POLICY DATABASE
// ─────────────────────────────────────────────────────────────────

/**
 * Store-specific policies (simplified for example)
 * In production: Review Apple App Store Review Guidelines & Google Play Policies
 */
const STORE_POLICIES: Record<AppStore, StorePolicy> = {
  [AppStore.APPLE]: {
    allowAdultContent: false,              // Apple is strictest
    allowExplicitAI: false,
    allowDirectMonetization: true,        // With IAP
    allowCryptoPayments: false,           // Must use IAP
    allowUGCSharing: true,
    requireContentModeration: true,
    requireAgeGate: true,
    requireParentalControls: false,
  },
  [AppStore.GOOGLE]: {
    allowAdultContent: false,              // Must comply with rating
    allowExplicitAI: false,
    allowDirectMonetization: true,
    allowCryptoPayments: true,            // More permissive
    allowUGCSharing: true,
    requireContentModeration: true,
    requireAgeGate: true,
    requireParentalControls: false,
  },
  [AppStore.WEB]: {
    allowAdultContent: true,               // Most permissive
    allowExplicitAI: true,
    allowDirectMonetization: true,
    allowCryptoPayments: true,
    allowUGCSharing: true,
    requireContentModeration: true,
    requireAgeGate: true,
    requireParentalControls: false,
  },
  [AppStore.DESKTOP]: {
    allowAdultContent: true,
    allowExplicitAI: true,
    allowDirectMonetization: true,
    allowCryptoPayments: true,
    allowUGCSharing: true,
    requireContentModeration: true,
    requireAgeGate: true,
    requireParentalControls: false,
  },
};

// ─────────────────────────────────────────────────────────────────
// STORE COMPLIANCE ENGINE
// ─────────────────────────────────────────────────────────────────

export class StoreComplianceEngine {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Build store compliance profile for user
   */
  async buildComplianceProfile(
    userId: string,
    appStore: AppStore,
    storeVersion: string,
    buildNumber: string
  ): Promise<StoreComplianceProfile> {
    const policy = STORE_POLICIES[appStore];
    const complianceMode = await this.determineComplianceMode(appStore, buildNumber);

    // Build blocked features list
    const blockedFeatures: string[] = [];
    if (!policy.allowAdultContent) blockedFeatures.push('adult_content');
    if (!policy.allowExplicitAI) blockedFeatures.push('explicit_ai_companions');
    if (!policy.allowCryptoPayments) blockedFeatures.push('crypto_payments');

    // Build content filters
    const contentFilters = {
      adultContentBlocked: !policy.allowAdultContent,
      explicitAIBlocked: !policy.allowExplicitAI,
      monetizationHidden: complianceMode === ComplianceMode.REVIEW_MODE,
      cryptoPaymentsHidden: !policy.allowCryptoPayments,
      directMessagingRestricted: complianceMode === ComplianceMode.REVIEW_MODE,
    };

    // Build UI adjustments
    const uiAdjustments = {
      safeDescriptions: complianceMode !== ComplianceMode.STANDARD,
      storeFriendlyFeed: complianceMode !== ComplianceMode.STANDARD,
      hideSensitiveIcons: complianceMode === ComplianceMode.REVIEW_MODE,
      disableScreenshots: policy.requireContentModeration,
    };

    const profile: StoreComplianceProfile = {
      appStore,
      complianceMode,
      storeVersion,
      buildNumber,
      blockedFeatures,
      contentFilters,
      uiAdjustments,
      lastUpdated: admin.firestore.Timestamp.now(),
    };

    // Store profile
    await this.db.collection('users').doc(userId).update({
      storeCompliance: profile,
    });

    // Log to audit
    await this.logAudit(userId, 'STORE_COMPLIANCE_PROFILE_BUILT', {
      appStore,
      complianceMode,
      blockedFeatures,
    });

    logger.info(`Built store compliance profile for user ${userId}: ${appStore} (${complianceMode})`);

    return profile;
  }

  /**
   * Get user's current store compliance profile
   */
  async getComplianceProfile(userId: string): Promise<StoreComplianceProfile | null> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData || !userData.storeCompliance) {
      return null;
    }

    return userData.storeCompliance as StoreComplianceProfile;
  }

  /**
   * Determine compliance mode based on app state
   */
  private async determineComplianceMode(
    appStore: AppStore,
    buildNumber: string
  ): Promise<ComplianceMode> {
    // Check if app is in review mode
    const reviewModeEnabled = await this.isReviewModeEnabled();
    if (reviewModeEnabled) {
      logger.warn(`Review mode enabled for ${appStore}`);
      return ComplianceMode.REVIEW_MODE;
    }

    // Check if store requires safe mode
    const storeSafeModeRequired = await this.isStoreSafeModeRequired(appStore);
    if (storeSafeModeRequired) {
      logger.info(`Store safe mode required for ${appStore}`);
      return ComplianceMode.STORE_SAFE;
    }

    return ComplianceMode.STANDARD;
  }

  /**
   * Check if app is in review mode (extra strict)
   */
  private async isReviewModeEnabled(): Promise<boolean> {
    try {
      const configDoc = await this.db.collection('systemConfig').doc('storeCompliance').get();
      const config = configDoc.data();
      return config?.reviewModeEnabled === true;
    } catch (error) {
      logger.error('Failed to check review mode:', error);
      return false;
    }
  }

  /**
   * Check if store requires safe mode
   */
  private async isStoreSafeModeRequired(appStore: AppStore): Promise<boolean> {
    try {
      const configDoc = await this.db.collection('systemConfig').doc('storeCompliance').get();
      const config = configDoc.data();
      return config?.storeSafeMode?.[appStore] === true;
    } catch (error) {
      logger.error('Failed to check store safe mode:', error);
      return false;
    }
  }

  /**
   * Check if specific feature is allowed by store policy
   */
  async isFeatureAllowedByStore(
    userId: string,
    feature: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const profile = await this.getComplianceProfile(userId);

    if (!profile) {
      logger.warn(`No compliance profile for user ${userId}, denying feature: ${feature}`);
      return {
        allowed: false,
        reason: 'Store compliance not determined',
      };
    }

    if (profile.blockedFeatures.includes(feature)) {
      const reason = `${feature} not allowed by ${profile.appStore} store policy`;

      await this.logAudit(userId, 'FEATURE_BLOCKED_BY_STORE_POLICY', {
        feature,
        appStore: profile.appStore,
        reason,
      });

      return { allowed: false, reason };
    }

    return { allowed: true };
  }

  /**
   * Get content filters for user
   */
  async getContentFilters(userId: string): Promise<StoreComplianceProfile['contentFilters']> {
    const profile = await this.getComplianceProfile(userId);

    if (!profile) {
      // Return most restrictive filters if no profile
      return {
        adultContentBlocked: true,
        explicitAIBlocked: true,
        monetizationHidden: true,
        cryptoPaymentsHidden: true,
        directMessagingRestricted: true,
      };
    }

    return profile.contentFilters;
  }

  /**
   * Get UI adjustments for user
   */
  async getUIAdjustments(userId: string): Promise<StoreComplianceProfile['uiAdjustments']> {
    const profile = await this.getComplianceProfile(userId);

    if (!profile) {
      // Return most restrictive adjustments if no profile
      return {
        safeDescriptions: true,
        storeFriendlyFeed: true,
        hideSensitiveIcons: true,
        disableScreenshots: true,
      };
    }

    return profile.uiAdjustments;
  }

  /**
   * Admin: Enable review mode (during app store review)
   */
  async enableReviewMode(adminId: string, reason: string): Promise<void> {
    logger.warn(`Admin ${adminId} enabling review mode: ${reason}`);

    await this.db.collection('systemConfig').doc('storeCompliance').set({
      reviewModeEnabled: true,
      reviewModeEnabledBy: adminId,
      reviewModeEnabledAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewModeReason: reason,
    }, { merge: true });

    await this.logAudit('SYSTEM', 'REVIEW_MODE_ENABLED', {
      adminId,
      reason,
    });
  }

  /**
   * Admin: Disable review mode
   */
  async disableReviewMode(adminId: string): Promise<void> {
    logger.info(`Admin ${adminId} disabling review mode`);

    await this.db.collection('systemConfig').doc('storeCompliance').set({
      reviewModeEnabled: false,
      reviewModeDisabledBy: adminId,
      reviewModeDisabledAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await this.logAudit('SYSTEM', 'REVIEW_MODE_DISABLED', {
      adminId,
    });
  }

  /**
   * Admin: Force store safe mode for specific store
   */
  async forceStoreSafeMode(
    appStore: AppStore,
    enabled: boolean,
    adminId: string,
    reason: string
  ): Promise<void> {
    logger.warn(`Admin ${adminId} forcing store safe mode for ${appStore}: ${enabled}`);

    await this.db.collection('systemConfig').doc('storeCompliance').set({
      storeSafeMode: {
        [appStore]: enabled,
      },
      [`storeSafeMode_${appStore}_by`]: adminId,
      [`storeSafeMode_${appStore}_at`]: admin.firestore.FieldValue.serverTimestamp(),
      [`storeSafeMode_${appStore}_reason`]: reason,
    }, { merge: true });

    await this.logAudit('SYSTEM', 'STORE_SAFE_MODE_FORCED', {
      appStore,
      enabled,
      adminId,
      reason,
    });
  }

  /**
   * Check if user is using app during store review (special handling)
   */
  async isAppInReview(): Promise<boolean> {
    return await this.isReviewModeEnabled();
  }

  /**
   * Filter content for store compliance
   */
  async filterContent(
    userId: string,
    content: {
      title?: string;
      description?: string;
      tags?: string[];
      isAdult?: boolean;
      isExplicit?: boolean;
    }
  ): Promise<{
    filtered: boolean;
    reason?: string;
    safeContent?: typeof content;
  }> {
    const filters = await this.getContentFilters(userId);

    // Block adult content if required
    if (filters.adultContentBlocked && content.isAdult) {
      return {
        filtered: true,
        reason: 'Adult content blocked by store policy',
      };
    }

    // Block explicit AI if required
    if (filters.explicitAIBlocked && content.isExplicit) {
      return {
        filtered: true,
        reason: 'Explicit content blocked by store policy',
      };
    }

    // Apply safe descriptions if required
    if (filters.adultContentBlocked || filters.explicitAIBlocked) {
      const safeContent = {
        ...content,
        title: this.sanitizeText(content.title),
        description: this.sanitizeText(content.description),
        tags: content.tags?.filter(tag => !this.isExplicitTag(tag)),
      };

      return {
        filtered: false,
        safeContent,
      };
    }

    return { filtered: false };
  }

  /**
   * Sanitize text for store compliance
   */
  private sanitizeText(text?: string): string | undefined {
    if (!text) return text;

    const explicitWords = ['explicit', 'adult', 'nsfw', '18+', 'xxx', 'sexy', 'hot'];
    let sanitized = text;

    for (const word of explicitWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      sanitized = sanitized.replace(regex, '***');
    }

    return sanitized;
  }

  /**
   * Check if tag is explicit
   */
  private isExplicitTag(tag: string): boolean {
    const explicitTags = ['nsfw', 'adult', '18+', 'xxx', 'explicit'];
    return explicitTags.some(explicit => tag.toLowerCase().includes(explicit));
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
        category: 'STORE_COMPLIANCE',
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
 * Check if adult content is allowed for user's store
 */
export async function canShowAdultContent(userId: string): Promise<boolean> {
  const engine = new StoreComplianceEngine();
  const filters = await engine.getContentFilters(userId);
  return !filters.adultContentBlocked;
}

/**
 * Check if crypto payments are allowed for user's store
 */
export async function canUseCryptoPayments(userId: string): Promise<boolean> {
  const engine = new StoreComplianceEngine();
  const filters = await engine.getContentFilters(userId);
  return !filters.cryptoPaymentsHidden;
}

/**
 * Get store-safe version of content
 */
export async function getStoreSafeContent(
  userId: string,
  content: any
): Promise<any> {
  const engine = new StoreComplianceEngine();
  const result = await engine.filterContent(userId, content);
  return result.safeContent || content;
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

export default StoreComplianceEngine;
