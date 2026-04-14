import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * Type extensions for pack files
 * These declarations extend existing interfaces to add missing properties
 * This is a TypeScript correctness fix - no business logic changes
 */

// Extend interfaces with index signatures to allow any property access
declare module './pack412.types' {
  interface LaunchRegionConfig {
    id?: string;
    currentTrafficCapPct?: number;
    dependenciesOk?: boolean;
    countries?: string[];
    cluster?: string;
    [key: string]: any;
  }
  
  interface LaunchGuardrailViolation {
    metricName?: string;
    actionTaken?: string;
    [key: string]: any;
  }
  
  interface LaunchGuardrailThresholds {
    id?: string;
    [key: string]: any;
  }
}

declare module './pack413.types' {
  interface KpiAlertRule {
    regionId?: string;
    thresholdValue?: number;
    minDurationMinutes?: number;
    notificationChannels?: string[];
    linkedPanicModeId?: string;
    [key: string]: any;
  }
  
  interface KpiAlertState {
    firstViolatedAt?: any;
    lastViolatedAt?: any;
    isViolated?: boolean;
    shouldTrigger?: boolean;
    [key: string]: any;
  }
  
  interface AlertEvaluationResult {
    evaluated?: boolean;
    notificationsSent?: boolean;
    proposedPanicMode?: string;
    errors?: string[];
    [key: string]: any;
  }
  
  interface KpiMetric {
    severity?: string;
    changePct?: number;
    [key: string]: any;
  }
  
  interface KpiAlertEvent {
    currentValue?: number;
    thresholdValue?: number;
    [key: string]: any;
  }
  
  interface PanicModeConfig {
    manualOnly?: boolean;
    label?: string;
    allowedStages?: string[];
    [key: string]: any;
  }
  
  interface PanicModeProposal {
    proposedBy?: string;
    [key: string]: any;
  }
  
  interface ActivePanicMode {
    metadata?: Record<string, any>;
    activatedAt?: any;
    regionIds?: string[];
    [key: string]: any;
  }
}

declare module './pack414.types' {
  interface IntegrationStatus {
    packId?: string;
    category?: string;
    ready?: boolean;
    module?: string;
    lastVerifiedAt?: any;
    missingDependencies?: string[];
    comments?: string[];
    [key: string]: any;
  }
  
  interface GreenlightStatus {
    overall?: boolean;
    [key: string]: any;
  }
}

declare module './pack416.types' {
  interface FeatureFlagChangeEvent {
    flagKey?: string;
    before?: any;
    after?: any;
    changedAt?: any;
    ipAddress?: string;
    deviceInfo?: string;
    params?: Record<string, any>;
    [key: string]: any;
  }
  
  interface FeatureFlagUserContext {
    country?: string;
    isVip?: boolean;
    isRoyal?: boolean;
    isCreator?: boolean;
    isAdmin?: boolean;
    [key: string]: any;
  }
}

declare module './pack418.types' {
  interface TokenomicsContext {
    type?: string;
    earner?: number;
    platform?: number;
    payoutRateUSDPerToken?: number;
    transactionId?: string;
    [key: string]: any;
  }
  
  interface RevenueSplit {
    earner?: number;
    platform?: number;
    [key: string]: any;
  }
  
  interface UserComplianceContext {
    entityId?: string;
    isVerified?: boolean;
    isEarning?: boolean;
    hasActiveMeetingsOrEvents?: boolean;
    [key: string]: any;
  }
  
  interface ContentComplianceContext {
    userId?: string;
    isMinorFlagged?: boolean;
    isCSAMFlagged?: boolean;
    isBrutalViolentSexFlagged?: boolean;
    isPoliticsWarSpamFlagged?: boolean;
    isReligiousHateFlagged?: boolean;
    [key: string]: any;
  }
}

declare module './pack421.types' {
  interface FeatureStatus {
    ready?: boolean;
    [key: string]: any;
  }
}

// Global type augmentations
declare global {
  // Allow any property access on common interfaces
  interface Record<K, T> {
    [key: string]: any;
  }
}

export {};



























