/**
 * PACK 113 — Full Ecosystem API Gateway
 * Type Definitions for External Developer Access
 * 
 * NON-NEGOTIABLE SECURITY RULES:
 * - No access to private messages or chat content
 * - No access to other users' data
 * - No direct token transfers or payouts
 * - No modification of discovery ranking or monetization logic
 * - No changes to 65/35 split or token price
 * - No free tokens, discounts, bonuses or rewards
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// EXTERNAL APP REGISTRATION
// ============================================================================

export type ExternalAppType = 
  | 'CREATOR_TOOL'      // Tools for creators to manage their presence
  | 'ANALYTICS_TOOL'    // Analytics and insights tools
  | 'CONTENT_SCHEDULER' // Content scheduling tools
  | 'PORTFOLIO_SITE'    // Portfolio/website integrations
  | 'CRM_INTEGRATION'   // CRM integrations
  | 'AUTOMATION_TOOL';  // Automation tools

export type ExternalAppStatus = 
  | 'PENDING_REVIEW'    // Awaiting approval
  | 'ACTIVE'            // Active and approved
  | 'SUSPENDED'         // Temporarily suspended
  | 'REVOKED';          // Permanently revoked

export interface ExternalApp {
  appId: string;
  ownerPartnerId?: string;  // Optional link to partnership org
  type: ExternalAppType;
  name: string;
  description: string;
  callbackUrls: string[];   // For OAuth2 flows
  status: ExternalAppStatus;
  scopesAllowed: APIScope[];
  
  // Rate limiting
  quotaPerDay: number;
  quotaPerHour?: number;
  quotaPerMinute?: number;
  
  // Security
  apiKeyHash: string;
  clientSecret?: string;    // For OAuth2
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;        // Creator user ID
  
  // Statistics
  totalRequests?: number;
  lastUsedAt?: Timestamp;
}

// ============================================================================
// API SCOPES
// ============================================================================

export type APIScope =
  // Profile operations
  | 'PROFILE_READ'           // Read creator's public profile
  | 'PROFILE_UPDATE'         // Update profile basics (bio, photos, links)
  
  // Content operations  
  | 'POST_STORY'             // Publish stories on behalf of creator
  | 'POST_FEED_CONTENT'      // Publish feed posts
  | 'DELETE_OWN_CONTENT'     // Delete own published content
  
  // Analytics (read-only, aggregated)
  | 'ANALYTICS_READ'         // Read creator's aggregated analytics
  | 'AUDIENCE_READ_AGGREGATE'// High-level demographic breakdown only
  
  // Webhook subscriptions
  | 'WEBHOOK_CONTENT'        // Subscribe to content events
  | 'WEBHOOK_FOLLOWERS';     // Subscribe to follower events

// Forbidden scopes that must never exist
export type ForbiddenScope =
  | 'MESSAGE_READ'           // Privacy violation
  | 'MESSAGE_WRITE'          // Privacy violation
  | 'TOKEN_READ'             // Economic risk
  | 'TOKEN_WRITE'            // Economic risk
  | 'PAYOUT_READ'            // Financial compliance
  | 'PAYOUT_WRITE'           // Financial compliance
  | 'DISCOVERY_BOOST'        // Pay-to-win loophole
  | 'SUSPENSION_BYPASS'      // Enforcement security
  | 'FEEDBACK_READ_PERSONAL';// Privacy violation

export interface ScopeDefinition {
  scope: APIScope;
  name: string;
  description: string;
  category: 'PROFILE' | 'CONTENT' | 'ANALYTICS' | 'WEBHOOKS';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export const SCOPE_DEFINITIONS: Record<APIScope, ScopeDefinition> = {
  'PROFILE_READ': {
    scope: 'PROFILE_READ',
    name: 'Read Profile',
    description: 'Read your public Avalo profile information',
    category: 'PROFILE',
    riskLevel: 'LOW',
  },
  'PROFILE_UPDATE': {
    scope: 'PROFILE_UPDATE',
    name: 'Update Profile',
    description: 'Update your profile basics (bio, photos, links)',
    category: 'PROFILE',
    riskLevel: 'MEDIUM',
  },
  'POST_STORY': {
    scope: 'POST_STORY',
    name: 'Post Stories',
    description: 'Publish stories on your behalf',
    category: 'CONTENT',
    riskLevel: 'HIGH',
  },
  'POST_FEED_CONTENT': {
    scope: 'POST_FEED_CONTENT',
    name: 'Post Feed Content',
    description: 'Publish feed posts on your behalf',
    category: 'CONTENT',
    riskLevel: 'HIGH',
  },
  'DELETE_OWN_CONTENT': {
    scope: 'DELETE_OWN_CONTENT',
    name: 'Delete Content',
    description: 'Delete your own published content',
    category: 'CONTENT',
    riskLevel: 'MEDIUM',
  },
  'ANALYTICS_READ': {
    scope: 'ANALYTICS_READ',
    name: 'Read Analytics',
    description: 'Read your aggregated analytics data',
    category: 'ANALYTICS',
    riskLevel: 'LOW',
  },
  'AUDIENCE_READ_AGGREGATE': {
    scope: 'AUDIENCE_READ_AGGREGATE',
    name: 'Read Audience Insights',
    description: 'Read high-level demographic breakdowns',
    category: 'ANALYTICS',
    riskLevel: 'LOW',
  },
  'WEBHOOK_CONTENT': {
    scope: 'WEBHOOK_CONTENT',
    name: 'Content Webhooks',
    description: 'Receive notifications about your content events',
    category: 'WEBHOOKS',
    riskLevel: 'LOW',
  },
  'WEBHOOK_FOLLOWERS': {
    scope: 'WEBHOOK_FOLLOWERS',
    name: 'Follower Webhooks',
    description: 'Receive notifications about new followers',
    category: 'WEBHOOKS',
    riskLevel: 'LOW',
  },
};

// ============================================================================
// OAUTH2 & ACCESS TOKENS
// ============================================================================

export type TokenType = 'ACCESS_TOKEN' | 'REFRESH_TOKEN';

export interface AccessToken {
  tokenId: string;
  appId: string;
  userId: string;           // Creator who authorized
  tokenType: TokenType;
  token: string;            // Hashed token
  scopes: APIScope[];
  
  // Lifecycle
  issuedAt: Timestamp;
  expiresAt: Timestamp;
  lastUsedAt?: Timestamp;
  revokedAt?: Timestamp;
  revokedReason?: string;
  
  // Security
  ipHash?: string;
  deviceFingerprint?: string;
}

export interface OAuth2AuthorizationCode {
  code: string;
  appId: string;
  userId: string;
  scopes: APIScope[];
  redirectUri: string;
  
  createdAt: Timestamp;
  expiresAt: Timestamp;
  used: boolean;
  usedAt?: Timestamp;
}

// ============================================================================
// API AUDIT LOG
// ============================================================================

export type APIRequestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface APIAuditLog {
  logId: string;
  appId: string;
  userId: string;           // Creator whose account was used
  tokenId: string;
  
  // Request details
  method: APIRequestMethod;
  endpoint: string;
  scopeUsed: APIScope;
  
  // Response
  statusCode: number;
  responseTime: number;     // milliseconds
  
  // Security
  ipHashMasked: string;     // Masked for privacy
  deviceFingerprint?: string;
  
  // Error tracking
  error?: string;
  
  timestamp: Timestamp;
}

// ============================================================================
// RATE LIMITING & QUOTAS
// ============================================================================

export interface APIRateLimit {
  appId: string;
  userId: string;
  
  // Current usage
  requestsToday: number;
  requestsThisHour: number;
  requestsThisMinute: number;
  
  // Window tracking
  dayWindow: string;        // YYYY-MM-DD
  hourWindow: string;       // YYYY-MM-DD-HH
  minuteWindow: string;     // YYYY-MM-DD-HH-mm
  
  // Violations
  violationCount: number;
  lastViolationAt?: Timestamp;
  softBlockUntil?: Timestamp;
  
  updatedAt: Timestamp;
}

export interface APIQuotaConfig {
  defaultPerDay: number;
  defaultPerHour: number;
  defaultPerMinute: number;
  
  // POST routes have stricter limits
  postPerDay: number;
  postPerHour: number;
  postPerMinute: number;
  
  // Burst control
  burstLimit: number;       // Max requests in 1 second
}

export const DEFAULT_API_QUOTA: APIQuotaConfig = {
  defaultPerDay: 10000,
  defaultPerHour: 1000,
  defaultPerMinute: 100,
  postPerDay: 500,
  postPerHour: 50,
  postPerMinute: 10,
  burstLimit: 10,
};

// ============================================================================
// SECURITY & ABUSE DETECTION
// ============================================================================

export type APIAbuseType =
  | 'EXCESSIVE_POSTING'      // Mass posting spam
  | 'BOT_LIKE_BEHAVIOR'      // Automated patterns
  | 'RATE_LIMIT_BYPASS'      // Attempting to bypass limits
  | 'NSFW_CLASSIFICATION_DODGE' // Trying to bypass NSFW detection
  | 'CONTENT_SPAM'           // Spam across regions
  | 'SUSPICIOUS_DELETION'    // Mass content deletion
  | 'TOKEN_MANIPULATION'     // Attempting to access token data
  | 'SCOPE_VIOLATION';       // Accessing beyond granted scopes

export interface APIAbuseDetection {
  detectionId: string;
  appId: string;
  userId: string;
  
  abuseType: APIAbuseType;
  severity: number;         // 0-100
  confidence: number;       // 0-1
  
  // Evidence
  evidenceCount: number;
  evidenceSummary: string;
  metadata: Record<string, any>;
  
  // Status
  status: 'DETECTED' | 'UNDER_REVIEW' | 'CONFIRMED' | 'FALSE_POSITIVE';
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  
  // Actions taken
  appSuspended: boolean;
  trustEventCreated: boolean;
  moderationCaseId?: string;
  
  detectedAt: Timestamp;
  updatedAt: Timestamp;
}

export interface APISecurityEvent {
  eventId: string;
  appId: string;
  userId: string;
  
  eventType: 'UNAUTHORIZED_ACCESS' | 'SCOPE_VIOLATION' | 'INVALID_TOKEN' | 'SUSPICIOUS_PATTERN';
  description: string;
  
  // Context
  endpoint?: string;
  requestedScope?: APIScope;
  grantedScopes?: APIScope[];
  
  ipHash: string;
  timestamp: Timestamp;
}

// ============================================================================
// WEBHOOKS
// ============================================================================

export type WebhookEventType =
  | 'CONTENT_PUBLISHED'      // New content posted
  | 'CONTENT_DELETED'        // Content removed
  | 'NEW_FOLLOWER'           // New follower gained
  | 'STORY_EXPIRED';         // Story expired

export interface WebhookSubscription {
  subscriptionId: string;
  appId: string;
  userId: string;           // Creator who subscribed
  
  eventType: WebhookEventType;
  callbackUrl: string;
  secret: string;           // For signature verification
  
  // Status
  active: boolean;
  lastTriggeredAt?: Timestamp;
  successCount: number;
  failureCount: number;
  lastFailureReason?: string;
  
  // Auto-disable after repeated failures
  consecutiveFailures: number;
  disabledAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface WebhookDelivery {
  deliveryId: string;
  subscriptionId: string;
  appId: string;
  
  eventType: WebhookEventType;
  payload: Record<string, any>;
  
  // Delivery attempt
  attemptNumber: number;
  maxAttempts: number;
  
  status: 'PENDING' | 'DELIVERED' | 'FAILED';
  statusCode?: number;
  errorMessage?: string;
  
  createdAt: Timestamp;
  deliveredAt?: Timestamp;
  nextRetryAt?: Timestamp;
}

// ============================================================================
// USER AUTHORIZATION
// ============================================================================

export interface UserAppAuthorization {
  authorizationId: string;
  userId: string;           // Creator
  appId: string;
  
  grantedScopes: APIScope[];
  grantedAt: Timestamp;
  
  // Tokens
  activeTokenCount: number;
  lastUsedAt?: Timestamp;
  
  // Revocation
  revokedAt?: Timestamp;
  revokedReason?: string;
}

// ============================================================================
// DEVELOPER PORTAL
// ============================================================================

export interface DeveloperAccount {
  developerId: string;      // User ID
  
  // Applications
  apps: string[];           // Array of app IDs
  
  // Limits
  maxApps: number;
  
  // Status
  verified: boolean;
  verifiedAt?: Timestamp;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface APISuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

export interface APIErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

export type APIResponse<T = any> = APISuccessResponse<T> | APIErrorResponse;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function isValidScope(scope: string): scope is APIScope {
  return Object.keys(SCOPE_DEFINITIONS).includes(scope);
}

export function getScopesByCategory(category: ScopeDefinition['category']): APIScope[] {
  return Object.values(SCOPE_DEFINITIONS)
    .filter(def => def.category === category)
    .map(def => def.scope);
}

export function getScopeRiskLevel(scope: APIScope): 'LOW' | 'MEDIUM' | 'HIGH' {
  return SCOPE_DEFINITIONS[scope]?.riskLevel || 'HIGH';
}

export function validateScopeRequest(requestedScopes: string[]): {
  valid: APIScope[];
  invalid: string[];
  forbidden: string[];
} {
  const valid: APIScope[] = [];
  const invalid: string[] = [];
  const forbidden: string[] = [];
  
  const forbiddenScopes: ForbiddenScope[] = [
    'MESSAGE_READ',
    'MESSAGE_WRITE',
    'TOKEN_READ',
    'TOKEN_WRITE',
    'PAYOUT_READ',
    'PAYOUT_WRITE',
    'DISCOVERY_BOOST',
    'SUSPENSION_BYPASS',
    'FEEDBACK_READ_PERSONAL',
  ];
  
  for (const scope of requestedScopes) {
    if (forbiddenScopes.includes(scope as ForbiddenScope)) {
      forbidden.push(scope);
    } else if (isValidScope(scope)) {
      valid.push(scope);
    } else {
      invalid.push(scope);
    }
  }
  
  return { valid, invalid, forbidden };
}