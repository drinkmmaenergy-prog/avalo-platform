/**
 * PACK 367 — ASO, Reviews, Reputation & Store Defense Engine
 * Store Policy Validator
 * 
 * Validates store listings against platform policies to prevent
 * app store violations and rejections.
 */

import { firestore } from "firebase-admin";
import {
  StorePolicyConfig,
  PolicyViolation,
  PolicyValidationResult,
  StoreComplianceIncident,
} from "./pack367-policy-config.types";
import { StoreListingConfig, StorePlatform } from "./pack367-aso.types";

const db = firestore();

/**
 * Policy Validator Service
 */
export class PolicyValidatorService {
  
  /**
   * Get policy config for platform
   */
  async getPolicyConfig(platform: StorePlatform): Promise<StorePolicyConfig | null> {
    const doc = await db
      .collection("ops")
      .doc("storePolicy")
      .collection("configs")
      .doc(platform)
      .get();
    
    return doc.exists ? doc.data() as StorePolicyConfig : null;
  }

  /**
   * Validate store listing against policy
   */
  async validateListing(
    listing: StoreListingConfig
  ): Promise<PolicyValidationResult> {
    const violations: PolicyViolation[] = [];
    const warnings: PolicyViolation[] = [];
    
    const policyConfig = await this.getPolicyConfig(listing.platform);
    
    if (!policyConfig) {
      return {
        valid: false,
        violations: [{
          field: "platform",
          violationType: "missing_required_url",
          severity: "blocking",
          message: "No policy configuration found for platform",
        }],
        warnings: [],
        validatedAt: Date.now(),
      };
    }
    
    // Validate each locale
    for (let i = 0; i < listing.locales.length; i++) {
      const locale = listing.locales[i];
      
      // Check title
      await this.validateTitle(locale.title, policyConfig, violations, warnings, i);
      
      // Check descriptions
      await this.validateDescription(
        locale.shortDescription,
        "shortDescription",
        policyConfig,
        violations,
        warnings,
        i
      );
      await this.validateDescription(
        locale.fullDescription,
        "fullDescription",
        policyConfig,
        violations,
        warnings,
        i
      );
      
      // Check keywords
      if (locale.keywords) {
        await this.validateKeywords(locale.keywords, policyConfig, violations, warnings, i);
      }
      
      // Check for 18+ requirement
      await this.check18PlusRequirement(locale, policyConfig, violations, i);
    }
    
    // Validate screenshots
    await this.validateScreenshots(listing.screenshots, policyConfig, violations, warnings);
    
    return {
      valid: violations.filter(v => v.severity === "blocking").length === 0,
      violations,
      warnings,
      validatedAt: Date.now(),
    };
  }

  /**
   * Validate title
   */
  private async validateTitle(
    title: string,
    config: StorePolicyConfig,
    violations: PolicyViolation[],
    warnings: PolicyViolation[],
    localeIndex: number
  ): Promise<void> {
    // Length check
    if (title.length > config.titleMaxLength) {
      violations.push({
        field: `locales[${localeIndex}].title`,
        violationType: "length_exceeded",
        severity: "blocking",
        message: `Title exceeds maximum length (${title.length}/${config.titleMaxLength})`,
        suggestedFix: `Shorten title to ${config.titleMaxLength} characters`,
      });
    }
    
    // NSFW word check
    const nsfwWord = this.containsNSFWWords(title, config.nsfwWordsBlacklist);
    if (nsfwWord) {
      violations.push({
        field: `locales[${localeIndex}].title`,
        violationType: "nsfw_content",
        severity: "blocking",
        message: `Title contains prohibited word: "${nsfwWord}"`,
        suggestedFix: "Remove or replace prohibited word",
      });
    }
  }

  /**
   * Validate description
   */
  private async validateDescription(
    description: string,
    fieldName: string,
    config: StorePolicyConfig,
    violations: PolicyViolation[],
    warnings: PolicyViolation[],
    localeIndex: number
  ): Promise<void> {
    const maxLength = fieldName === "shortDescription" 
      ? config.shortDescMaxLength 
      : config.fullDescMaxLength;
    
    // Length check
    if (description.length > maxLength) {
      violations.push({
        field: `locales[${localeIndex}].${fieldName}`,
        violationType: "length_exceeded",
        severity: "blocking",
        message: `Description exceeds maximum length (${description.length}/${maxLength})`,
        suggestedFix: `Shorten to ${maxLength} characters`,
      });
    }
    
    // NSFW word check
    const nsfwWord = this.containsNSFWWords(description, config.nsfwWordsBlacklist);
    if (nsfwWord) {
      violations.push({
        field: `locales[${localeIndex}].${fieldName}`,
        violationType: "nsfw_content",
        severity: "blocking",
        message: `Description contains prohibited word: "${nsfwWord}"`,
        suggestedFix: "Remove or replace prohibited word",
      });
    }
  }

  /**
   * Validate keywords
   */
  private async validateKeywords(
    keywords: string[],
    config: StorePolicyConfig,
    violations: PolicyViolation[],
    warnings: PolicyViolation[],
    localeIndex: number
  ): Promise<void> {
    // Count check
    if (keywords.length > config.keywordsMax) {
      violations.push({
        field: `locales[${localeIndex}].keywords`,
        violationType: "length_exceeded",
        severity: "blocking",
        message: `Too many keywords (${keywords.length}/${config.keywordsMax})`,
        suggestedFix: `Reduce to ${config.keywordsMax} keywords`,
      });
    }
    
    // Check each keyword for NSFW
    for (const keyword of keywords) {
      const nsfwWord = this.containsNSFWWords(keyword, config.nsfwWordsBlacklist);
      if (nsfwWord) {
        violations.push({
          field: `locales[${localeIndex}].keywords`,
          violationType: "prohibited_keyword",
          severity: "blocking",
          message: `Keyword contains prohibited word: "${nsfwWord}"`,
          suggestedFix: "Remove prohibited keyword",
        });
      }
    }
  }

  /**
   * Check 18+ requirement
   */
  private async check18PlusRequirement(
    locale: { fullDescription: string },
    config: StorePolicyConfig,
    violations: PolicyViolation[],
    localeIndex: number
  ): Promise<void> {
    if (config.mustIncludeAge18Plus) {
      const has18Plus = /18\+|18 plus|adults only|mature/i.test(locale.fullDescription);
      if (!has18Plus) {
        violations.push({
          field: `locales[${localeIndex}].fullDescription`,
          violationType: "missing_age_restriction",
          severity: "blocking",
          message: "Description must include 18+ age restriction notice",
          suggestedFix: 'Add text like "For adults 18+ only" to description',
        });
      }
    }
  }

  /**
   * Validate screenshots
   */
  private async validateScreenshots(
    screenshots: string[],
    config: StorePolicyConfig,
    violations: PolicyViolation[],
    warnings: PolicyViolation[]
  ): Promise<void> {
    if (screenshots.length === 0) {
      warnings.push({
        field: "screenshots",
        violationType: "inappropriate_screenshot",
        severity: "warning",
        message: "No screenshots provided",
        suggestedFix: "Add at least 3-5 screenshots",
      });
    }
    
    // Note: Actual screenshot content validation would require
    // image analysis (ML or manual review)
    // This is a placeholder for integration with such systems
  }

  /**
   * Check if text contains NSFW words
   */
  private containsNSFWWords(text: string, blacklist: string[]): string | null {
    const lowerText = text.toLowerCase();
    for (const word of blacklist) {
      if (lowerText.includes(word.toLowerCase())) {
        return word;
      }
    }
    return null;
  }

  /**
   * Update policy configuration
   */
  async updatePolicyConfig(
    platform: StorePlatform,
    config: Partial<StorePolicyConfig>,
    adminId: string
  ): Promise<void> {
    const docRef = db
      .collection("ops")
      .doc("storePolicy")
      .collection("configs")
      .doc(platform);
    
    await docRef.set({
      ...config,
      platform,
      lastUpdatedAt: Date.now(),
      updatedBy: adminId,
    }, { merge: true });
    
    // Log to audit (PACK 296)
    await this.logToAudit({
      action: "policy_config_updated",
      platform,
      updatedBy: adminId,
      changes: config,
    });
  }

  /**
   * Create compliance incident
   */
  async createComplianceIncident(
    incident: Omit<StoreComplianceIncident, "id" | "createdAt">
  ): Promise<string> {
    const docRef = db
      .collection("ops")
      .doc("storeCompliance")
      .collection("incidents")
      .doc();
    
    const fullIncident: StoreComplianceIncident = {
      ...incident,
      id: docRef.id,
      createdAt: Date.now(),
    };
    
    await docRef.set(fullIncident);
    
    // Notify admins if critical
    if (incident.severity === "critical" || incident.severity === "high") {
      await this.notifyCompliance(fullIncident);
    }
    
    return docRef.id;
  }

  /**
   * Notify compliance team
   */
  private async notifyCompliance(incident: StoreComplianceIncident): Promise<void> {
    await db.collection("notifications").doc("admin").collection("queue").add({
      type: "compliance_incident",
      severity: incident.severity,
      title: `Store Compliance: ${incident.incidentType}`,
      message: incident.description,
      data: {
        incidentId: incident.id,
        platform: incident.platform,
        country: incident.country,
      },
      createdAt: Date.now(),
      read: false,
    });
  }

  /**
   * Log to audit system
   */
  private async logToAudit(data: Record<string, any>): Promise<void> {
    await db.collection("audit").doc("logs").collection("entries").add({
      ...data,
      timestamp: Date.now(),
      source: "pack367_policy_validator",
    });
  }

  /**
   * Get default policy config for a platform
   */
  getDefaultPolicyConfig(platform: StorePlatform): StorePolicyConfig {
    const baseConfig = {
      platform,
      lastUpdatedAt: Date.now(),
      updatedBy: "system",
      nsfwWordsBlacklist: [
        "sex",
        "porn",
        "nude",
        "naked",
        "explicit",
        "xxx",
        "adult",
        // Add more as needed
      ],
      mustIncludeAge18Plus: true,
      allowedScreenshotTypes: ["profile", "chat", "explore", "event", "meeting"],
      requirePrivacyPolicyUrl: true,
      requireTermsOfServiceUrl: true,
      requireAgeGate: true,
      contentRating: {},
    };
    
    if (platform === "android") {
      return {
        ...baseConfig,
        titleMaxLength: 50,
        shortDescMaxLength: 80,
        fullDescMaxLength: 4000,
        keywordsMax: 50,
        contentRating: {
          android: "Mature 17+",
        },
      };
    } else {
      // iOS
      return {
        ...baseConfig,
        titleMaxLength: 30,
        shortDescMaxLength: 170,
        fullDescMaxLength: 4000,
        keywordsMax: 100,
        contentRating: {
          ios: "17+",
        },
      };
    }
  }
}

export const policyValidatorService = new PolicyValidatorService();

/**
 * Validate listing before save (middleware function)
 */
export async function validateListingBeforeSave(
  listing: StoreListingConfig
): Promise<PolicyValidationResult> {
  const result = await policyValidatorService.validateListing(listing);
  
  // Log validation attempt
  await db.collection("audit").doc("logs").collection("entries").add({
    action: "listing_validation",
    platform: listing.platform,
    country: listing.country,
    valid: result.valid,
    violationsCount: result.violations.length,
    warningsCount: result.warnings.length,
    timestamp: Date.now(),
    source: "pack367_policy_validator",
  });
  
  return result;
}
