/**
 * PACK 107 — VIP Memberships, Royal Club & Prestige Identity Types
 * 
 * Type definitions for:
 * - Membership tiers (VIP, Royal Club)
 * - Membership subscriptions
 * - Cosmetic identity features
 * - Membership analytics
 * 
 * NON-NEGOTIABLE RULES:
 * - NO free tokens or bonus tokens
 * - NO cashback or discounts on token purchases
 * - NO influence on discovery algorithm or monetization logic
 * - NO faster earnings or pay-to-get-more-visibility
 * - Token price and 65/35 split remain untouched
 * - Purely cosmetic and experiential, ZERO economic advantages
 */

import { Timestamp } from 'firebase-admin/firestore';
import { BusinessAuditEventType } from './pack105-types';

// ============================================================================
// MEMBERSHIP TIERS
// ============================================================================

/**
 * Available membership tiers
 * NONE = Standard (free) user
 * VIP = Paid monthly subscription
 * ROYAL_CLUB = Ultra-premium monthly or annual subscription
 */
export type MembershipTier = 'NONE' | 'VIP' | 'ROYAL_CLUB';

/**
 * Membership billing cycle
 */
export type MembershipBillingCycle = 'MONTHLY' | 'ANNUAL';

/**
 * Membership subscription status
 */
export type MembershipStatus = 
  | 'ACTIVE'           // Currently active and paid
  | 'EXPIRED'          // Subscription has expired
  | 'CANCELLED'        // User cancelled, will expire at end of period
  | 'PAYMENT_FAILED';  // Payment failed, grace period

// ============================================================================
// USER MEMBERSHIP RECORD
// ============================================================================

/**
 * User membership record stored in user_membership collection
 * One record per user
 */
export interface UserMembership {
  /** User ID */
  userId: string;
  
  /** Current membership tier */
  tier: MembershipTier;
  
  /** When membership was purchased */
  purchasedAt?: Timestamp;
  
  /** When membership expires */
  expiresAt?: Timestamp;
  
  /** Whether auto-renewal is enabled */
  autoRenew: boolean;
  
  /** Subscription status */
  status: MembershipStatus;
  
  /** Billing cycle */
  billingCycle?: MembershipBillingCycle;
  
  /** Stripe subscription ID */
  stripeSubscriptionId?: string;
  
  /** Stripe customer ID */
  stripeCustomerId?: string;
  
  /** Payment currency */
  currency?: string;
  
  /** Monthly price paid */
  monthlyPrice?: number;
  
  /** Last payment timestamp */
  lastPaymentAt?: Timestamp;
  
  /** Next billing date */
  nextBillingDate?: Timestamp;
  
  /** Grace period expiry (for failed payments) */
  gracePeriodExpiresAt?: Timestamp;
  
  /** Lifetime value (total paid) */
  lifetimeValue?: number;
  
  /** Total active days */
  totalActiveDays?: number;
  
  /** Created timestamp */
  createdAt: Timestamp;
  
  /** Last updated */
  updatedAt: Timestamp;
  
  /** Cancellation info if applicable */
  cancellation?: {
    cancelledAt: Timestamp;
    reason?: string;
    willExpireAt: Timestamp;
  };
  
  /** Metadata */
  metadata?: Record<string, any>;
}

// ============================================================================
// MEMBERSHIP PRICING
// ============================================================================

/**
 * Membership pricing tiers (fixed prices)
 * Prices are subscription-only, NO tokens included
 */
export interface MembershipPricing {
  /** Tier name */
  tier: MembershipTier;
  
  /** Monthly price in EUR (base currency) */
  monthlyPriceEUR: number;
  
  /** Annual price in EUR (simply 12 × monthly, no discount) */
  annualPriceEUR: number;
  
  /** Stripe price ID for monthly */
  stripePriceIdMonthly?: string;
  
  /** Stripe price ID for annual */
  stripePriceIdAnnual?: string;
  
  /** Feature summary for display */
  features: string[];
  
  /** Whether this tier is available */
  enabled: boolean;
}

/**
 * Standard membership pricing (FIXED)
 */
export const MEMBERSHIP_PRICING: Record<Exclude<MembershipTier, 'NONE'>, Omit<MembershipPricing, 'tier' | 'stripePriceIdMonthly' | 'stripePriceIdAnnual' | 'enabled'>> = {
  VIP: {
    monthlyPriceEUR: 9.99,
    annualPriceEUR: 119.88, // 12 × 9.99, no discount
    features: [
      'VIP badge on profile',
      'Premium profile themes',
      'VIP styling in feed',
      'Priority support',
    ],
  },
  ROYAL_CLUB: {
    monthlyPriceEUR: 29.99,
    annualPriceEUR: 359.88, // 12 × 29.99, no discount
    features: [
      'Royal Club animated badge',
      'Exclusive profile frames',
      'Custom profile intro animation',
      'Royal styling in feed',
      'Priority support',
      'Invitation to closed events',
      'Early access to new features',
    ],
  },
};

// ============================================================================
// MEMBERSHIP COSMETIC FEATURES
// ============================================================================

/**
 * Profile badge configuration
 */
export interface MembershipBadge {
  /** Badge type */
  type: 'VIP' | 'ROYAL_CLUB';
  
  /** Badge icon URL */
  iconUrl: string;
  
  /** Whether badge is animated */
  animated: boolean;
  
  /** Animation URL (Lottie JSON) */
  animationUrl?: string;
  
  /** Badge color theme */
  colorTheme: {
    primary: string;
    secondary: string;
    gradient?: string[];
  };
  
  /** Display priority */
  priority: number;
}

/**
 * Profile theme/frame configuration
 */
export interface MembershipProfileTheme {
  /** Theme ID */
  id: string;
  
  /** Theme name */
  name: string;
  
  /** Required tier */
  requiredTier: MembershipTier;
  
  /** Frame/border configuration */
  frame?: {
    type: 'solid' | 'gradient' | 'animated';
    colors: string[];
    width: number;
  };
  
  /** Background style */
  background?: {
    type: 'solid' | 'gradient' | 'pattern';
    colors: string[];
    patternUrl?: string;
  };
  
  /** Profile intro animation (Royal only) */
  introAnimation?: {
    lottieUrl: string;
    duration: number;
  };
  
  /** Whether this theme is enabled */
  enabled: boolean;
}

/**
 * Feed styling configuration
 */
export interface MembershipFeedStyling {
  /** Tier this applies to */
  tier: MembershipTier;
  
  /** Post frame/border */
  postFrame?: {
    type: 'solid' | 'gradient' | 'glow';
    colors: string[];
    width: number;
  };
  
  /** Author name styling */
  authorNameStyle?: {
    color: string;
    fontWeight: 'normal' | 'bold';
    badge?: string; // Icon to show next to name
  };
  
  /** Highlight effect */
  highlightEffect?: {
    type: 'none' | 'subtle' | 'prominent';
    color?: string;
  };
}

// ============================================================================
// MEMBERSHIP SUBSCRIPTION FLOW
// ============================================================================

/**
 * Membership purchase request
 */
export interface MembershipPurchaseRequest {
  /** User ID */
  userId: string;
  
  /** Selected tier */
  tier: Exclude<MembershipTier, 'NONE'>;
  
  /** Billing cycle */
  billingCycle: MembershipBillingCycle;
  
  /** User's currency preference */
  currency: string;
  
  /** User's country code */
  countryCode?: string;
  
  /** Success URL (redirect after payment) */
  successUrl: string;
  
  /** Cancel URL (redirect if cancelled) */
  cancelUrl: string;
}

/**
 * Membership subscription session (Stripe Checkout)
 */
export interface MembershipSubscriptionSession {
  /** Session ID */
  sessionId: string;
  
  /** Stripe checkout session ID */
  stripeSessionId: string;
  
  /** User ID */
  userId: string;
  
  /** Selected tier */
  tier: Exclude<MembershipTier, 'NONE'>;
  
  /** Billing cycle */
  billingCycle: MembershipBillingCycle;
  
  /** Amount in local currency */
  amount: number;
  
  /** Currency code */
  currency: string;
  
  /** Session status */
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  
  /** Created timestamp */
  createdAt: Timestamp;
  
  /** Completed timestamp */
  completedAt?: Timestamp;
  
  /** Expires at */
  expiresAt: Timestamp;
}

// ============================================================================
// MEMBERSHIP CANCELLATION
// ============================================================================

/**
 * Membership cancellation request
 */
export interface MembershipCancellationRequest {
  /** User ID */
  userId: string;
  
  /** Cancellation reason */
  reason?: string;
  
  /** Feedback text */
  feedback?: string;
  
  /** Whether to cancel immediately or at period end */
  immediate: boolean;
}

/**
 * Membership cancellation record
 */
export interface MembershipCancellation {
  /** Cancellation ID */
  id: string;
  
  /** User ID */
  userId: string;
  
  /** Tier that was cancelled */
  tier: MembershipTier;
  
  /** When cancelled */
  cancelledAt: Timestamp;
  
  /** Reason code */
  reason?: string;
  
  /** User feedback */
  feedback?: string;
  
  /** Whether immediate or end of period */
  immediate: boolean;
  
  /** When membership will actually expire */
  effectiveExpiryDate: Timestamp;
  
  /** Refund status */
  refundStatus?: 'NONE' | 'REQUESTED' | 'PROCESSED';
  
  /** Refund amount (if applicable) */
  refundAmount?: number;
}

// ============================================================================
// MEMBERSHIP ANALYTICS
// ============================================================================

/**
 * Membership analytics extension to creator_analytics_snapshot
 * Read-only, for display purposes only
 */
export interface MembershipAnalyticsData {
  /** Current membership tier */
  membershipTier: MembershipTier;
  
  /** Lifetime value paid to platform for membership */
  membershipLifetimeValue: number;
  
  /** Total active membership days */
  membershipActiveDays: number;
  
  /** When membership started */
  membershipStartedAt?: Timestamp;
  
  /** Is membership currently active */
  membershipActive: boolean;
}

// ============================================================================
// MEMBERSHIP AUDIT EVENTS
// ============================================================================

/**
 * Membership audit event types (extends BusinessAuditEventType)
 */
export type MembershipAuditEventType =
  | 'MEMBERSHIP_PURCHASE'
  | 'MEMBERSHIP_RENEWAL'
  | 'MEMBERSHIP_CANCELLATION'
  | 'MEMBERSHIP_EXPIRE'
  | 'MEMBERSHIP_PAYMENT_FAILED'
  | 'MEMBERSHIP_REACTIVATION';

/**
 * Membership audit log entry
 * Stored in business_audit_log with membership-specific context
 */
export interface MembershipAuditLog {
  /** Event ID */
  id: string;
  
  /** Event type */
  eventType: MembershipAuditEventType;
  
  /** User ID */
  userId: string;
  
  /** Membership tier */
  tier: MembershipTier;
  
  /** Billing cycle */
  billingCycle?: MembershipBillingCycle;
  
  /** Amount paid (if applicable) */
  amount?: number;
  
  /** Currency */
  currency?: string;
  
  /** Stripe subscription ID */
  stripeSubscriptionId?: string;
  
  /** Event timestamp */
  createdAt: Timestamp;
  
  /** Additional context */
  context: Record<string, any>;
  
  /** Source of event */
  source: 'USER_ACTION' | 'STRIPE_WEBHOOK' | 'SCHEDULED_JOB' | 'ADMIN_ACTION';
}

// ============================================================================
// MEMBERSHIP FEATURE FLAGS
// ============================================================================

/**
 * Feature flag names for membership rollout
 */
export const MEMBERSHIP_FEATURE_FLAGS = {
  VIP_ENABLED: 'vip_membership_enabled',
  ROYAL_CLUB_ENABLED: 'royal_club_membership_enabled',
  MEMBERSHIP_MIGRATION: 'membership_migration_enabled',
  MEMBERSHIP_ANALYTICS: 'membership_analytics_enabled',
} as const;

// ============================================================================
// MEMBERSHIP BENEFITS (NON-ECONOMIC)
// ============================================================================

/**
 * Non-economic benefits configuration
 * These are experiential only, no monetization impact
 */
export interface MembershipBenefits {
  /** Tier */
  tier: MembershipTier;
  
  /** Cosmetic benefits */
  cosmetic: {
    profileBadge: boolean;
    profileThemes: boolean;
    profileAnimation: boolean;
    feedStyling: boolean;
  };
  
  /** Experience benefits (NON-ECONOMIC) */
  experience: {
    prioritySupport: boolean;
    earlyFeatureAccess: boolean;
    closedEventInvites: boolean;
    feedbackGroupAccess: boolean;
  };
  
  /** What is explicitly NOT included */
  notIncluded: {
    freeTokens: false;
    tokenDiscounts: false;
    visibilityBoost: false;
    rankingAdvantage: false;
    earningsMultiplier: false;
    matchingPriority: false;
  };
}

/**
 * Standard benefits per tier
 */
export const MEMBERSHIP_BENEFITS: Record<MembershipTier, MembershipBenefits> = {
  NONE: {
    tier: 'NONE',
    cosmetic: {
      profileBadge: false,
      profileThemes: false,
      profileAnimation: false,
      feedStyling: false,
    },
    experience: {
      prioritySupport: false,
      earlyFeatureAccess: false,
      closedEventInvites: false,
      feedbackGroupAccess: false,
    },
    notIncluded: {
      freeTokens: false,
      tokenDiscounts: false,
      visibilityBoost: false,
      rankingAdvantage: false,
      earningsMultiplier: false,
      matchingPriority: false,
    },
  },
  VIP: {
    tier: 'VIP',
    cosmetic: {
      profileBadge: true,
      profileThemes: true,
      profileAnimation: false,
      feedStyling: true,
    },
    experience: {
      prioritySupport: true,
      earlyFeatureAccess: false,
      closedEventInvites: false,
      feedbackGroupAccess: false,
    },
    notIncluded: {
      freeTokens: false,
      tokenDiscounts: false,
      visibilityBoost: false,
      rankingAdvantage: false,
      earningsMultiplier: false,
      matchingPriority: false,
    },
  },
  ROYAL_CLUB: {
    tier: 'ROYAL_CLUB',
    cosmetic: {
      profileBadge: true,
      profileThemes: true,
      profileAnimation: true,
      feedStyling: true,
    },
    experience: {
      prioritySupport: true,
      earlyFeatureAccess: true,
      closedEventInvites: true,
      feedbackGroupAccess: true,
    },
    notIncluded: {
      freeTokens: false,
      tokenDiscounts: false,
      visibilityBoost: false,
      rankingAdvantage: false,
      earningsMultiplier: false,
      matchingPriority: false,
    },
  },
};

// ============================================================================
// ERROR CODES
// ============================================================================

export type Pack107ErrorCode =
  | 'MEMBERSHIP_ALREADY_ACTIVE'
  | 'MEMBERSHIP_NOT_FOUND'
  | 'INVALID_MEMBERSHIP_TIER'
  | 'PAYMENT_FAILED'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'CANCELLATION_FAILED'
  | 'TIER_NOT_AVAILABLE'
  | 'CURRENCY_NOT_SUPPORTED'
  | 'SESSION_EXPIRED'
  | 'UNAUTHORIZED_ACCESS';

// ============================================================================
// ADMIN DASHBOARD TYPES
// ============================================================================

/**
 * Membership dashboard metrics
 */
export interface MembershipDashboardMetrics {
  /** Total active memberships */
  activeMemberships: {
    total: number;
    vip: number;
    royalClub: number;
  };
  
  /** Monthly recurring revenue */
  mrr: {
    total: number;
    vip: number;
    royalClub: number;
    currency: string;
  };
  
  /** New subscriptions today */
  newToday: number;
  
  /** Cancellations today */
  cancellationsToday: number;
  
  /** Churn rate (last 30 days) */
  churnRate: number;
  
  /** Average lifetime value */
  avgLifetimeValue: number;
  
  /** Failed payments needing attention */
  failedPayments: number;
  
  /** Timestamp */
  generatedAt: Timestamp;
}

/**
 * Membership list item for admin
 */
export interface MembershipListItem {
  userId: string;
  userName: string;
  tier: MembershipTier;
  status: MembershipStatus;
  billingCycle?: MembershipBillingCycle;
  monthlyPrice?: number;
  currency?: string;
  purchasedAt?: string;
  expiresAt?: string;
  lifetimeValue?: number;
  activeDays?: number;
}