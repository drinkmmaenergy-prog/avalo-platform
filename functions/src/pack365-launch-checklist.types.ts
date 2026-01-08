/**
 * PACK 365 — Launch Checklist Types
 * 
 * Purpose: Pre-launch validation and readiness verification
 * Phase: ETAP B — Pre-Launch Hardening
 */

export type LaunchDomain =
  | "auth"
  | "chat"
  | "wallet"
  | "calendar"
  | "events"
  | "safety"
  | "support"
  | "ai"
  | "legal"
  | "infra"
  | "monitoring"
  | "backup";

export interface LaunchChecklistItem {
  /** Unique key for the checklist item */
  key: string;
  
  /** Domain/category of the checklist item */
  domain: LaunchDomain;
  
  /** Human-readable description */
  description: string;
  
  /** Whether the check has passed */
  passed: boolean;
  
  /** Admin who verified this item */
  verifiedBy?: string;
  
  /** Timestamp of verification */
  verifiedAt?: number;
  
  /** Priority level */
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  
  /** Whether this is a blocking item for production launch */
  blocking: boolean;
  
  /** Additional notes or comments */
  notes?: string;
  
  /** Related documentation links */
  docLinks?: string[];
}

export interface LaunchChecklist {
  version: string;
  createdAt: number;
  updatedAt: number;
  items: Record<string, LaunchChecklistItem>;
}

export interface LaunchReadinessReport {
  timestamp: number;
  ready: boolean;
  totalItems: number;
  passedItems: number;
  blockingIssues: string[];
  criticalIssues: string[];
  warnings: string[];
  domains: Record<LaunchDomain, DomainReadiness>;
}

export interface DomainReadiness {
  domain: LaunchDomain;
  total: number;
  passed: number;
  failed: number;
  readyForLaunch: boolean;
}

/**
 * Mandatory Launch Checklist Items
 * These MUST be verified before production launch
 */
export const MANDATORY_CHECKLIST_ITEMS: Record<string, Partial<LaunchChecklistItem>> = {
  // Auth & Verification
  "auth.signup.tested": {
    domain: "auth",
    description: "User signup flow tested and working",
    priority: "CRITICAL",
    blocking: true,
  },
  "auth.login.tested": {
    domain: "auth",
    description: "User login flow tested and working",
    priority: "CRITICAL",
    blocking: true,
  },
  "auth.password-reset.tested": {
    domain: "auth",
    description: "Password reset flow tested and working",
    priority: "HIGH",
    blocking: true,
  },
  "auth.verification.working": {
    domain: "auth",
    description: "Identity verification system operational (PACK 157)",
    priority: "CRITICAL",
    blocking: true,
  },

  // Wallet & Payouts
  "wallet.creation.tested": {
    domain: "wallet",
    description: "Wallet creation and initialization working",
    priority: "CRITICAL",
    blocking: true,
  },
  "wallet.deposits.tested": {
    domain: "wallet",
    description: "Token deposits tested and functional",
    priority: "CRITICAL",
    blocking: true,
  },
  "wallet.spending.tested": {
    domain: "wallet",
    description: "Token spending mechanisms tested",
    priority: "CRITICAL",
    blocking: true,
  },
  "wallet.withdrawals.tested": {
    domain: "wallet",
    description: "Withdrawal system tested with test payouts",
    priority: "CRITICAL",
    blocking: true,
  },
  "wallet.refunds.tested": {
    domain: "wallet",
    description: "Refund mechanisms tested (PACK 209)",
    priority: "HIGH",
    blocking: true,
  },

  // Chat Billing & Refunds
  "chat.paid-messages.tested": {
    domain: "chat",
    description: "Paid chat messages billing tested (PACK 277)",
    priority: "CRITICAL",
    blocking: true,
  },
  "chat.subscriptions.tested": {
    domain: "chat",
    description: "Chat subscriptions billing tested",
    priority: "CRITICAL",
    blocking: true,
  },
  "chat.refunds.working": {
    domain: "chat",
    description: "Chat refund system operational",
    priority: "HIGH",
    blocking: true,
  },

  // AI Billing & Safety
  "ai.voice-billing.tested": {
    domain: "ai",
    description: "AI voice call billing tested (PACK 279)",
    priority: "CRITICAL",
    blocking: true,
  },
  "ai.content-moderation.active": {
    domain: "ai",
    description: "AI content moderation active (PACK 159)",
    priority: "CRITICAL",
    blocking: true,
  },
  "ai.safety-limits.configured": {
    domain: "ai",
    description: "AI safety limits and rate limiting configured",
    priority: "CRITICAL",
    blocking: true,
  },

  // Calendar & Events Revenue
  "calendar.booking.tested": {
    domain: "calendar",
    description: "Calendar booking system tested (PACK 218)",
    priority: "CRITICAL",
    blocking: true,
  },
  "calendar.cancellation.tested": {
    domain: "calendar",
    description: "Booking cancellation and refunds tested",
    priority: "HIGH",
    blocking: true,
  },
  "events.booking.tested": {
    domain: "events",
    description: "Event booking system tested",
    priority: "CRITICAL",
    blocking: true,
  },

  // Panic & GPS
  "panic.system.operational": {
    domain: "safety",
    description: "Panic button system fully operational (PACK 281)",
    priority: "CRITICAL",
    blocking: true,
  },
  "panic.gps.working": {
    domain: "safety",
    description: "GPS integration for panic system working",
    priority: "CRITICAL",
    blocking: true,
  },
  "panic.emergency-contacts.configured": {
    domain: "safety",
    description: "Emergency response contacts configured",
    priority: "CRITICAL",
    blocking: true,
  },

  // Support Ticket Handling
  "support.ticket-creation.tested": {
    domain: "support",
    description: "Support ticket creation tested (PACK 296)",
    priority: "HIGH",
    blocking: true,
  },
  "support.escalation.working": {
    domain: "support",
    description: "Ticket escalation system working",
    priority: "HIGH",
    blocking: true,
  },
  "support.auto-responses.configured": {
    domain: "support",
    description: "Automatic support responses configured",
    priority: "MEDIUM",
    blocking: false,
  },

  // Legal Docs
  "legal.tos.published": {
    domain: "legal",
    description: "Terms of Service published and accessible",
    priority: "CRITICAL",
    blocking: true,
  },
  "legal.privacy.published": {
    domain: "legal",
    description: "Privacy Policy published and accessible",
    priority: "CRITICAL",
    blocking: true,
  },
  "legal.refund-policy.published": {
    domain: "legal",
    description: "Refund Policy published and accessible",
    priority: "CRITICAL",
    blocking: true,
  },
  "legal.age-verification.working": {
    domain: "legal",
    description: "Age verification system working (PACK 178)",
    priority: "CRITICAL",
    blocking: true,
  },

  // Feature Flag Defaults
  "flags.defaults.configured": {
    domain: "infra",
    description: "All default feature flags configured",
    priority: "CRITICAL",
    blocking: true,
  },
  "flags.kill-switches.verified": {
    domain: "infra",
    description: "All kill-switches verified and functional",
    priority: "CRITICAL",
    blocking: true,
  },

  // Backup & Recovery
  "backup.firestore.configured": {
    domain: "backup",
    description: "Firestore backup system configured",
    priority: "CRITICAL",
    blocking: true,
  },
  "backup.recovery.tested": {
    domain: "backup",
    description: "Disaster recovery procedures tested",
    priority: "HIGH",
    blocking: true,
  },

  // Monitoring & Alerts
  "monitoring.telemetry.active": {
    domain: "monitoring",
    description: "Telemetry system active (PACK 364)",
    priority: "CRITICAL",
    blocking: true,
  },
  "monitoring.alerts.configured": {
    domain: "monitoring",
    description: "Critical alerts configured and tested",
    priority: "CRITICAL",
    blocking: true,
  },
  "monitoring.dashboards.deployed": {
    domain: "monitoring",
    description: "Monitoring dashboards deployed and accessible",
    priority: "HIGH",
    blocking: false,
  },

  // Infrastructure
  "infra.cdn.configured": {
    domain: "infra",
    description: "CDN configured for static assets",
    priority: "HIGH",
    blocking: false,
  },
  "infra.rate-limiting.active": {
    domain: "infra",
    description: "Rate limiting active for all APIs",
    priority: "CRITICAL",
    blocking: true,
  },
  "infra.ddos-protection.active": {
    domain: "infra",
    description: "DDoS protection active",
    priority: "CRITICAL",
    blocking: true,
  },
};

export type ChecklistOperation = "verify" | "reset" | "view" | "report";
