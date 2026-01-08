/**
 * PACK 367 — ASO, Reviews, Reputation & Store Defense Engine
 * Store Policy Configuration Types
 * 
 * Defines policy compliance rules to prevent app store violations
 * and automatic rejection.
 */

import { StorePlatform } from "./pack367-aso.types";

/**
 * Store policy configuration for compliance enforcement
 */
export interface StorePolicyConfig {
  platform: StorePlatform;
  lastUpdatedAt: number;
  updatedBy: string;                    // adminId
  
  // Content restrictions
  nsfwWordsBlacklist: string[];         // Forbidden in store metadata
  mustIncludeAge18Plus: boolean;        // Require 18+ wording
  allowedScreenshotTypes: string[];     // e.g., ["profile", "chat", "event"]
  
  // Metadata requirements
  titleMaxLength: number;               // Platform-specific limits
  shortDescMaxLength: number;
  fullDescMaxLength: number;
  keywordsMax: number;
  
  // Compliance flags
  requirePrivacyPolicyUrl: boolean;
  requireTermsOfServiceUrl: boolean;
  requireAgeGate: boolean;
  
  // Content rating
  contentRating: {
    android?: string;                   // e.g., "Mature 17+"
    ios?: string;                       // e.g., "17+"
  };
}

/**
 * Policy violation detected during validation
 */
export interface PolicyViolation {
  field: string;                        // e.g., "title", "screenshots[2]"
  violationType: 
    | "nsfw_content"
    | "missing_age_restriction"
    | "length_exceeded"
    | "prohibited_keyword"
    | "missing_required_url"
    | "inappropriate_screenshot";
  severity: "warning" | "blocking";     // Blocking prevents save
  message: string;
  suggestedFix?: string;
}

/**
 * Policy validation result
 */
export interface PolicyValidationResult {
  valid: boolean;
  violations: PolicyViolation[];
  warnings: PolicyViolation[];          // Non-blocking issues
  validatedAt: number;
  validatedBy?: string;                 // System or adminId
}

/**
 * Screenshot analysis metadata
 */
export interface ScreenshotAnalysis {
  url: string;
  approved: boolean;
  analysisMethod: "manual" | "automated" | "ml_classifier";
  issues: string[];                     // Detected issues
  analyzedAt: number;
  analyzedBy?: string;                  // adminId if manual
}

/**
 * Store compliance incident/alert
 */
export interface StoreComplianceIncident {
  id: string;
  platform: StorePlatform;
  country?: string;
  createdAt: number;
  incidentType: 
    | "policy_violation_detected"
    | "store_warning_received"
    | "app_rejected"
    | "app_removed"
    | "developer_account_warning";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedAssets: string[];             // e.g., ["title", "screenshot_3"]
  status: "new" | "investigating" | "fixing" | "resolved";
  assignedTo?: string;                  // adminId
  resolutionPlan?: string;
  resolvedAt?: number;
  externalReference?: string;           // Store case number
}

/**
 * Automated policy check schedule
 */
export interface PolicyCheckSchedule {
  platform: StorePlatform;
  enabled: boolean;
  frequency: "daily" | "weekly" | "on_change";
  lastCheckAt?: number;
  nextCheckAt?: number;
  notifyOnViolation: string[];          // adminIds to notify
}

/**
 * Regional policy variations
 */
export interface RegionalPolicyOverride {
  country: string;                      // ISO code
  platform: StorePlatform;
  overrides: Partial<StorePolicyConfig>;
  reason: string;                       // Why this region differs
  effectiveFrom: number;
  effectiveUntil?: number;
}

/**
 * Policy compliance audit log entry
 */
export interface PolicyAuditLog {
  id: string;
  timestamp: number;
  action: 
    | "validation_run"
    | "violation_detected"
    | "violation_resolved"
    | "config_updated"
    | "incident_created";
  performedBy: string;                  // adminId or "system"
  platform: StorePlatform;
  country?: string;
  details: Record<string, any>;
  result: "success" | "failure" | "warning";
}
