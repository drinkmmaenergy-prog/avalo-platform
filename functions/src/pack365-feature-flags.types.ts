/**
 * PACK 365 — Feature Flags & Kill-Switch Types
 * 
 * Purpose: Global emergency control, rollout safety, and zero-downtime launch control
 * Phase: ETAP B — Pre-Launch Hardening
 */

export type FeatureEnvironment = "dev" | "staging" | "prod";

export type FeatureDomain =
  | "system"
  | "auth"
  | "chat"
  | "wallet"
  | "calendar"
  | "events"
  | "panic"
  | "ai"
  | "feed"
  | "discovery"
  | "subscriptions"
  | "verification"
  | "support"
  | "withdrawals"
  | "registrations";

export interface FeatureFlag {
  /** Unique key (e.g. "chat.enabled", "ai.voice.enabled") */
  key: string;
  
  /** Feature enabled/disabled state */
  enabled: boolean;
  
  /** Target environment */
  environment: FeatureEnvironment;
  
  /** Gradual rollout percentage (0-100) */
  rolloutPercent?: number;
  
  /** Target user segments (e.g. ["VIP", "ROYAL"]) */
  userSegments?: string[];
  
  /** Target regions (e.g. ["PL", "DE"]) */
  regions?: string[];
  
  /** Last update timestamp */
  updatedAt: number;
  
  /** Admin who made the change */
  updatedBy: string;
  
  /** Optional description */
  description?: string;
  
  /** Feature domain */
  domain?: FeatureDomain;
  
  /** Reason for last change */
  changeReason?: string;
}

export interface FeatureFlagHistory {
  flagKey: string;
  changes: FeatureFlagChange[];
}

export interface FeatureFlagChange {
  timestamp: number;
  changedBy: string;
  previousState: Partial<FeatureFlag>;
  newState: Partial<FeatureFlag>;
  reason?: string;
}

export interface FeatureFlagCheckContext {
  userId?: string;
  region?: string;
  segment?: string;
  isAdmin?: boolean;
  environment?: FeatureEnvironment;
}

/**
 * Hard Kill-Switches (GLOBAL)
 * These MUST exist in production at all times
 */
export const CRITICAL_KILL_SWITCHES = {
  // Global freeze - stops all spending & bookings
  GLOBAL_FREEZE: "system.global.freeze",
  
  // Wallet controls
  WALLET_SPEND: "wallet.spend.disabled",
  WITHDRAWALS: "withdrawals.disabled",
  
  // Chat controls
  CHAT_PAID: "chat.paid.disabled",
  
  // AI controls
  AI_VOICE: "ai.voice.disabled",
  
  // Calendar & Events
  CALENDAR_BOOKING: "calendar.booking.disabled",
  EVENTS_BOOKING: "events.booking.disabled",
  
  // Panic (must NEVER be disabled in prod)
  PANIC_SYSTEM: "panic.system.disabled",
  
  // User registrations
  REGISTRATIONS: "registrations.disabled",
  
  // Master production switch
  PRODUCTION_LAUNCH: "launch.production.enabled",
} as const;

/**
 * Default feature flags configuration
 */
export const DEFAULT_FEATURE_FLAGS: Record<string, Partial<FeatureFlag>> = {
  [CRITICAL_KILL_SWITCHES.GLOBAL_FREEZE]: {
    enabled: false,
    description: "Global emergency freeze - stops all spending & bookings",
    domain: "system",
  },
  [CRITICAL_KILL_SWITCHES.WALLET_SPEND]: {
    enabled: false,
    description: "Disable all token spending",
    domain: "wallet",
  },
  [CRITICAL_KILL_SWITCHES.WITHDRAWALS]: {
    enabled: false,
    description: "Freeze all payouts",
    domain: "wallet",
  },
  [CRITICAL_KILL_SWITCHES.CHAT_PAID]: {
    enabled: false,
    description: "Disable paid chat features",
    domain: "chat",
  },
  [CRITICAL_KILL_SWITCHES.AI_VOICE]: {
    enabled: false,
    description: "Disable AI voice calls",
    domain: "ai",
  },
  [CRITICAL_KILL_SWITCHES.CALENDAR_BOOKING]: {
    enabled: false,
    description: "Disable calendar bookings",
    domain: "calendar",
  },
  [CRITICAL_KILL_SWITCHES.EVENTS_BOOKING]: {
    enabled: false,
    description: "Disable event bookings",
    domain: "events",
  },
  [CRITICAL_KILL_SWITCHES.PANIC_SYSTEM]: {
    enabled: false,
    description: "Panic system control (must NEVER be disabled in prod)",
    domain: "panic",
  },
  [CRITICAL_KILL_SWITCHES.REGISTRATIONS]: {
    enabled: false,
    description: "Stop new user registrations",
    domain: "registrations",
  },
  [CRITICAL_KILL_SWITCHES.PRODUCTION_LAUNCH]: {
    enabled: false,
    description: "Master production launch switch",
    domain: "system",
  },
};

export interface FeatureFlagValidationResult {
  valid: boolean;
  violations: FeatureFlagViolation[];
}

export interface FeatureFlagViolation {
  severity: "CRITICAL" | "ERROR" | "WARNING";
  flagKey: string;
  message: string;
  recommendation: string;
}

export type FeatureFlagOperation = "read" | "write" | "delete" | "history";
