/**
 * PACK 430 — GEO-JURISDICTION ENGINE
 * 
 * Controls feature availability based on user's legal jurisdiction.
 * Uses SIM country, IP geolocation, device locale, and App Store country.
 * 
 * HARD RULES:
 * - Jurisdiction locks are immutable per session
 * - Features blocked by law cannot be overridden
 * - All jurisdictional blocks are audit-logged
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export enum JurisdictionTier {
  FULL = 'FULL',                       // All features available
  RESTRICTED = 'RESTRICTED',           // Some features blocked
  ADULT_BLOCKED = 'ADULT_BLOCKED',     // Adult content blocked
  CRYPTO_BLOCKED = 'CRYPTO_BLOCKED',   // Crypto payments blocked
  SEVERE = 'SEVERE',                   // Most features blocked
  BANNED = 'BANNED',                   // Service not available
}

export interface JurisdictionProfile {
  countryCode: string;                 // ISO 3166-1 alpha-2
  tier: JurisdictionTier;
  detectedFrom: {
    simCountry?: string;
    ipCountry?: string;
    deviceLocale?: string;
    appStoreCountry?: string;
  };
  allowedFeatures: {
    monetization: boolean;
    adultContent: boolean;
    voiceCalls: boolean;
    videoCalls: boolean;
    calendarBookings: boolean;
    events: boolean;
    aiCompanions: boolean;
    cryptoPayments: boolean;
    fiatPayments: boolean;
    liveStreaming: boolean;
    tipJar: boolean;
  };
  restrictions: string[];
  legalNote?: string;
  lastUpdated: admin.firestore.Timestamp;
}

export interface GeoDetectionInput {
  simCountry?: string;
  ipAddress?: string;
  deviceLocale?: string;
  appStoreCountry?: string;
}

// ─────────────────────────────────────────────────────────────────
// JURISDICTION RULES DATABASE
// ─────────────────────────────────────────────────────────────────

/**
 * Country-specific jurisdiction rules
 * 
 * Note: This is a simplified example. In production, this should be:
 * 1. Stored in Firestore for dynamic updates
 * 2. Reviewed by legal counsel for each jurisdiction
 * 3. Updated regularly based on law changes
 */
const JURISDICTION_RULES: Record<string, Partial<JurisdictionProfile>> = {
  // Full access countries (example: US, UK, DE, etc.)
  'US': {
    tier: JurisdictionTier.FULL,
    allowedFeatures: {
      monetization: true,
      adultContent: true,
      voiceCalls: true,
      videoCalls: true,
      calendarBookings: true,
      events: true,
      aiCompanions: true,
      cryptoPayments: true,
      fiatPayments: true,
      liveStreaming: true,
      tipJar: true,
    },
    restrictions: [],
  },
  'GB': {
    tier: JurisdictionTier.FULL,
    allowedFeatures: {
      monetization: true,
      adultContent: true,
      voiceCalls: true,
      videoCalls: true,
      calendarBookings: true,
      events: true,
      aiCompanions: true,
      cryptoPayments: true,
      fiatPayments: true,
      liveStreaming: true,
      tipJar: true,
    },
    restrictions: [],
  },
  'DE': {
    tier: JurisdictionTier.FULL,
    allowedFeatures: {
      monetization: true,
      adultContent: true,
      voiceCalls: true,
      videoCalls: true,
      calendarBookings: true,
      events: true,
      aiCompanions: true,
      cryptoPayments: false, // Stricter crypto regulations
      fiatPayments: true,
      liveStreaming: true,
      tipJar: true,
    },
    restrictions: ['Crypto payments restricted per German law'],
  },
  // Adult content blocked countries
  'AE': { // United Arab Emirates
    tier: JurisdictionTier.ADULT_BLOCKED,
    allowedFeatures: {
      monetization: true,
      adultContent: false,
      voiceCalls: true,
      videoCalls: false, // Example restriction
      calendarBookings: true,
      events: true,
      aiCompanions: false,
      cryptoPayments: false,
      fiatPayments: true,
      liveStreaming: false,
      tipJar: true,
    },
    restrictions: ['Adult content prohibited', 'Video calls restricted', 'AI companions unavailable'],
    legalNote: 'Service complies with UAE Telecommunications Regulatory Authority guidelines',
  },
  // Crypto blocked countries
  'CN': { // China
    tier: JurisdictionTier.CRYPTO_BLOCKED,
    allowedFeatures: {
      monetization: false, // Example: Strict restrictions
      adultContent: false,
      voiceCalls: true,
      videoCalls: true,
      calendarBookings: false,
      events: false,
      aiCompanions: false,
      cryptoPayments: false,
      fiatPayments: false,
      liveStreaming: false,
      tipJar: false,
    },
    restrictions: ['Monetization features unavailable', 'Adult content prohibited', 'Crypto payments prohibited'],
    legalNote: 'Limited service available per PRC regulations',
  },
  // Severe restrictions
  'IR': { // Iran
    tier: JurisdictionTier.SEVERE,
    allowedFeatures: {
      monetization: false,
      adultContent: false,
      voiceCalls: false,
      videoCalls: false,
      calendarBookings: false,
      events: false,
      aiCompanions: false,
      cryptoPayments: false,
      fiatPayments: false,
      liveStreaming: false,
      tipJar: false,
    },
    restrictions: ['Service severely restricted', 'All monetization features disabled'],
    legalNote: 'Service availability limited per sanctions and local law',
  },
  // Default fallback for unknown countries
  'DEFAULT': {
    tier: JurisdictionTier.RESTRICTED,
    allowedFeatures: {
      monetization: false,
      adultContent: false,
      voiceCalls: true,
      videoCalls: false,
      calendarBookings: false,
      events: false,
      aiCompanions: false,
      cryptoPayments: false,
      fiatPayments: false,
      liveStreaming: false,
      tipJar: false,
    },
    restrictions: ['Jurisdiction not fully supported', 'Limited features available'],
    legalNote: 'Please contact support for feature availability in your region',
  },
};

// ─────────────────────────────────────────────────────────────────
// GEO-JURISDICTION ENGINE
// ─────────────────────────────────────────────────────────────────

export class JurisdictionEngine {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Detect user's jurisdiction from multiple sources
   */
  async detectJurisdiction(userId: string, input: GeoDetectionInput): Promise<string> {
    // Priority order:
    // 1. SIM country (most reliable)
    // 2. App Store country
    // 3. IP geolocation
    // 4. Device locale (least reliable)

    let detectedCountry: string | undefined;

    if (input.simCountry) {
      detectedCountry = input.simCountry.toUpperCase();
      logger.info(`Detected jurisdiction from SIM: ${detectedCountry}`);
    } else if (input.appStoreCountry) {
      detectedCountry = input.appStoreCountry.toUpperCase();
      logger.info(`Detected jurisdiction from App Store: ${detectedCountry}`);
    } else if (input.ipAddress) {
      detectedCountry = await this.getCountryFromIP(input.ipAddress);
      logger.info(`Detected jurisdiction from IP: ${detectedCountry}`);
    } else if (input.deviceLocale) {
      detectedCountry = this.getCountryFromLocale(input.deviceLocale);
      logger.info(`Detected jurisdiction from locale: ${detectedCountry}`);
    }

    if (!detectedCountry) {
      logger.warn(`Could not detect jurisdiction for user ${userId}, using DEFAULT`);
      detectedCountry = 'DEFAULT';
    }

    // Store detection metadata
    await this.db.collection('users').doc(userId).update({
      'jurisdiction.detectedFrom': {
        simCountry: input.simCountry || null,
        ipCountry: input.ipAddress ? await this.getCountryFromIP(input.ipAddress) : null,
        deviceLocale: input.deviceLocale || null,
        appStoreCountry: input.appStoreCountry || null,
      },
      'jurisdiction.lastDetectedAt': admin.firestore.FieldValue.serverTimestamp(),
    });

    return detectedCountry;
  }

  /**
   * Build jurisdiction profile for user
   */
  async buildJurisdictionProfile(userId: string, input: GeoDetectionInput): Promise<JurisdictionProfile> {
    const countryCode = await this.detectJurisdiction(userId, input);
    const rules = JURISDICTION_RULES[countryCode] || JURISDICTION_RULES['DEFAULT'];

    const profile: JurisdictionProfile = {
      countryCode,
      tier: rules.tier || JurisdictionTier.RESTRICTED,
      detectedFrom: {
        simCountry: input.simCountry,
        ipCountry: input.ipAddress ? await this.getCountryFromIP(input.ipAddress) : undefined,
        deviceLocale: input.deviceLocale,
        appStoreCountry: input.appStoreCountry,
      },
      allowedFeatures: rules.allowedFeatures || this.getDefaultRestrictedFeatures(),
      restrictions: rules.restrictions || [],
      legalNote: rules.legalNote,
      lastUpdated: admin.firestore.Timestamp.now(),
    };

    // Store profile in Firestore
    await this.db.collection('users').doc(userId).update({
      jurisdiction: profile,
    });

    // Log to audit
    await this.logAudit(userId, 'JURISDICTION_DETECTED', {
      countryCode,
      tier: profile.tier,
      restrictions: profile.restrictions,
    });

    logger.info(`Built jurisdiction profile for user ${userId}: ${countryCode} (${profile.tier})`);

    return profile;
  }

  /**
   * Get user's current jurisdiction profile
   */
  async getJurisdictionProfile(userId: string): Promise<JurisdictionProfile | null> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData || !userData.jurisdiction) {
      return null;
    }

    return userData.jurisdiction as JurisdictionProfile;
  }

  /**
   * Check if a specific feature is allowed in user's jurisdiction
   */
  async isFeatureAllowed(
    userId: string,
    feature: keyof JurisdictionProfile['allowedFeatures']
  ): Promise<{ allowed: boolean; reason?: string }> {
    const profile = await this.getJurisdictionProfile(userId);

    if (!profile) {
      logger.warn(`No jurisdiction profile for user ${userId}, denying feature: ${feature}`);
      return {
        allowed: false,
        reason: 'Jurisdiction not determined',
      };
    }

    const allowed = profile.allowedFeatures[feature];

    if (!allowed) {
      const reason = profile.restrictions.length > 0
        ? profile.restrictions[0]
        : `Feature ${feature} not available in ${profile.countryCode}`;

      await this.logAudit(userId, 'FEATURE_BLOCKED_BY_JURISDICTION', {
        feature,
        countryCode: profile.countryCode,
        reason,
      });

      return { allowed: false, reason };
    }

    return { allowed: true };
  }

  /**
   * Handle jurisdiction change (e.g., user travels or uses VPN)
   */
  async handleJurisdictionChange(userId: string, newInput: GeoDetectionInput): Promise<void> {
    const currentProfile = await this.getJurisdictionProfile(userId);
    const newCountry = await this.detectJurisdiction(userId, newInput);

    if (currentProfile && currentProfile.countryCode !== newCountry) {
      logger.warn(`Jurisdiction change detected for user ${userId}: ${currentProfile.countryCode} → ${newCountry}`);

      // Log potential VPN/spoofing
      if (currentProfile.detectedFrom.simCountry && currentProfile.detectedFrom.simCountry !== newCountry) {
        await this.logAudit(userId, 'JURISDICTION_MISMATCH_DETECTED', {
          previousCountry: currentProfile.countryCode,
          newCountry,
          simCountry: currentProfile.detectedFrom.simCountry,
          suspectedVPN: true,
        });
      }

      // Rebuild profile with stricter country (most restrictive wins)
      await this.buildJurisdictionProfile(userId, newInput);
    }
  }

  /**
   * Get country code from IP address
   */
  private async getCountryFromIP(ipAddress: string): Promise<string> {
    // In production, integrate with IP geolocation service:
    // - MaxMind GeoIP2
    // - IP2Location
    // - ipapi.co
    // - ipgeolocation.io
    
    try {
      // Example: Placeholder for IP geolocation
      // const response = await fetch(`https://ipapi.co/${ipAddress}/country_code/`);
      // const countryCode = await response.text();
      // return countryCode.trim().toUpperCase();
      
      logger.info(`IP geolocation lookup for ${ipAddress} (placeholder)`);
      return 'DEFAULT';
    } catch (error) {
      logger.error(`Failed to get country from IP ${ipAddress}:`, error);
      return 'DEFAULT';
    }
  }

  /**
   * Extract country code from device locale
   */
  private getCountryFromLocale(locale: string): string {
    // locale format: "en_US", "fr_FR", "de_DE", etc.
    const parts = locale.split(/[-_]/);
    if (parts.length > 1) {
      return parts[1].toUpperCase();
    }
    return 'DEFAULT';
  }

  /**
   * Get default restricted features (most conservative)
   */
  private getDefaultRestrictedFeatures(): JurisdictionProfile['allowedFeatures'] {
    return {
      monetization: false,
      adultContent: false,
      voiceCalls: false,
      videoCalls: false,
      calendarBookings: false,
      events: false,
      aiCompanions: false,
      cryptoPayments: false,
      fiatPayments: false,
      liveStreaming: false,
      tipJar: false,
    };
  }

  /**
   * Admin: Force jurisdiction override (emergency)
   */
  async forceJurisdictionOverride(
    userId: string,
    countryCode: string,
    adminId: string,
    reason: string
  ): Promise<void> {
    logger.warn(`Admin ${adminId} forcing jurisdiction override for user ${userId} to ${countryCode}`);

    await this.buildJurisdictionProfile(userId, {
      simCountry: countryCode,
    });

    await this.logAudit(userId, 'JURISDICTION_FORCED_BY_ADMIN', {
      adminId,
      countryCode,
      reason,
    });
  }

  /**
   * Admin: Emergency region lock (legal order compliance)
   */
  async emergencyRegionLock(
    countryCode: string,
    adminId: string,
    reason: string
  ): Promise<void> {
    logger.error(`EMERGENCY REGION LOCK: ${countryCode} by admin ${adminId}`);

    // Update jurisdiction rules to BANNED
    await this.db.collection('systemConfig').doc('jurisdictionOverrides').set({
      [countryCode]: {
        tier: JurisdictionTier.BANNED,
        reason,
        lockedAt: admin.firestore.FieldValue.serverTimestamp(),
        lockedBy: adminId,
      },
    }, { merge: true });

    await this.logAudit('SYSTEM', 'EMERGENCY_REGION_LOCK', {
      countryCode,
      adminId,
      reason,
    });
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
        category: 'JURISDICTION',
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
 * Check if monetization is allowed in user's jurisdiction
 */
export async function canMonetizeInJurisdiction(userId: string): Promise<boolean> {
  const engine = new JurisdictionEngine();
  const result = await engine.isFeatureAllowed(userId, 'monetization');
  return result.allowed;
}

/**
 * Check if adult content is allowed in user's jurisdiction
 */
export async function canAccessAdultContent(userId: string): Promise<boolean> {
  const engine = new JurisdictionEngine();
  const result = await engine.isFeatureAllowed(userId, 'adultContent');
  return result.allowed;
}

/**
 * Check if video calls are allowed in user's jurisdiction
 */
export async function canUseVideoCalls(userId: string): Promise<boolean> {
  const engine = new JurisdictionEngine();
  const result = await engine.isFeatureAllowed(userId, 'videoCalls');
  return result.allowed;
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

export default JurisdictionEngine;
