/**
 * PACK 193 — REVISED v2 — Permission-Driven Sexuality System
 * Core TypeScript Implementation
 * Safe, Consensual, App-Store-Compliant Adult Content Framework
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================
// TYPE DEFINITIONS
// ============================================

export type ConsentStatus = 'enabled' | 'disabled' | 'pending_verification';
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type ContentType = 
  | 'text_flirty' 
  | 'text_sexy' 
  | 'photo_bikini' 
  | 'photo_lingerie' 
  | 'photo_sensual' 
  | 'selfie_sexy' 
  | 'emoji_flirty' 
  | 'compliment';

export type ProhibitedContentType =
  | 'pornography'
  | 'explicit_sex_act'
  | 'escorting'
  | 'monetary_service'
  | 'minor_reference'
  | 'public_group_sexual';

export type ViolationType =
  | 'prohibited_content'
  | 'non_consensual_sharing'
  | 'harassment'
  | 'underage_attempt'
  | 'escorting_attempt'
  | 'public_sexual_content';

export type ReportType =
  | 'inappropriate'
  | 'harassment'
  | 'non_consensual'
  | 'prohibited_content'
  | 'minor_safety'
  | 'other';

export type SafetyLevel = 'pg' | 'pg13' | 'r_rated' | 'sexy_mode_active';

// ============================================
// INTERFACE DEFINITIONS
// ============================================

export interface SexualityConsentPreferences {
  userId: string;
  consentEnabled: boolean;
  isActive: boolean;
  enabledAt: Timestamp;
  updatedAt: Timestamp;
  disabledAt?: Timestamp;
  consentVersion: string; // Track consent agreement version
  requiresAgeVerification: boolean;
  canBeDisabledAnytime: boolean;
}

export interface UserAgeVerification {
  userId: string;
  isVerified18Plus: boolean;
  verificationStatus: VerificationStatus;
  verificationMethod: 'id_document' | 'credit_card' | 'phone_carrier' | 'third_party';
  submittedAt: Timestamp;
  verifiedAt?: Timestamp;
  expiresAt?: Timestamp;
  documentType?: string;
  verificationProvider?: string;
}

export interface SexyModeSession {
  sessionId: string; // Format: {user1Id}_{user2Id} (sorted)
  user1Id: string;
  user2Id: string;
  user1Consent: boolean;
  user2Consent: boolean;
  isActive: boolean;
  requiresMutualConsent: boolean;
  canBeDisabledAnytime: boolean;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  lastActivityAt: Timestamp;
  initiatedBy: string;
  consentVersion: string;
}

export interface SexyContent {
  contentId: string;
  senderId: string;
  receiverId: string;
  sessionId: string;
  contentType: ContentType;
  content: string | { url: string; thumbnail?: string };
  isPrivateOneOnOne: boolean;
  isPublicGroup: boolean;
  requiresAgeVerification: boolean;
  isRead: boolean;
  createdAt: Timestamp;
  expiresAt?: Timestamp; // Optional content expiration
  metadata?: {
    hasAttachment: boolean;
    attachmentType?: string;
    isEncrypted: boolean;
  };
}

export interface ConsentAuditLog {
  logId: string;
  userId: string;
  actionType: 'consent_enabled' | 'consent_disabled' | 'session_started' | 'session_ended' | 'content_sent' | 'content_received' | 'violation_detected';
  sessionId?: string;
  contentId?: string;
  timestamp: Timestamp;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    location?: string;
  };
  complianceData: {
    ageVerified: boolean;
    consentVersion: string;
    mutualConsent: boolean;
  };
}

export interface ContentModerationFlag {
  flagId: string;
  contentId: string;
  reportedUserId: string;
  flagType: 'ai_detected' | 'user_reported' | 'system_automated';
  severityLevel: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  detectedPatterns?: string[];
  isResolved: boolean;
  reviewedBy?: string;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  actionTaken?: 'content_removed' | 'user_warned' | 'user_suspended' | 'no_action';
}

export interface SexyModeViolation {
  violationId: string;
  userId: string;
  violationType: ViolationType;
  severityLevel: 'minor' | 'major' | 'critical';
  description: string;
  detectedAt: Timestamp;
  contentId?: string;
  sessionId?: string;
  isResolved: boolean;
  actionTaken?: 'warning' | 'content_removal' | 'feature_suspension' | 'account_suspension';
  resolvedAt?: Timestamp;
}

export interface SexyContentReport {
  reportId: string;
  reporterId: string;
  reportedUserId: string;
  reportedContentId: string;
  reportType: ReportType;
  description: string;
  evidence?: {
    screenshots?: string[];
    timestamps?: Timestamp[];
  };
  isResolved: boolean;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  moderatorNotes?: string;
}

export interface ConversationSafetyMode {
  conversationId: string;
  user1Id: string;
  user2Id: string;
  safetyLevel: SafetyLevel;
  sexyModeActive: boolean;
  contentFilterLevel: 'strict' | 'moderate' | 'minimal';
  updatedAt: Timestamp;
  updatedBy: string;
}

// ============================================
// CORE HELPER FUNCTIONS
// ============================================

/**
 * Generate session ID from two user IDs (sorted order)
 */
export function generateSessionId(user1Id: string, user2Id: string): string {
  const [id1, id2] = [user1Id, user2Id].sort();
  return `${id1}_${id2}`;
}

/**
 * Check if content type is allowed
 */
export function isAllowedContentType(contentType: string): contentType is ContentType {
  const allowedTypes: ContentType[] = [
    'text_flirty',
    'text_sexy',
    'photo_bikini',
    'photo_lingerie',
    'photo_sensual',
    'selfie_sexy',
    'emoji_flirty',
    'compliment'
  ];
  return allowedTypes.includes(contentType as ContentType);
}

/**
 * Check if content contains prohibited patterns
 */
export function containsProhibitedContent(content: any): boolean {
  const prohibitedKeys = [
    'pornography',
    'explicitSexAct',
    'escorting',
    'monetaryService',
    'minorReference',
    'childCoded',
    'publicGroupSexual',
    'explicitVideo',
    'liveWebcam'
  ];

  const prohibitedContentTypes: ProhibitedContentType[] = [
    'pornography',
    'explicit_sex_act',
    'escorting',
    'monetary_service',
    'minor_reference',
    'public_group_sexual'
  ];

  // Check for prohibited keys
  if (prohibitedKeys.some(key => key in content)) {
    return true;
  }

  // Check for prohibited content type
  if (content.contentType && prohibitedContentTypes.includes(content.contentType)) {
    return true;
  }

  return false;
}

/**
 * Validate session expiration (24 hours default)
 */
export function calculateSessionExpiration(hours: number = 24): Timestamp {
  const expirationMs = Date.now() + (hours * 60 * 60 * 1000);
  return Timestamp.fromMillis(expirationMs);
}

/**
 * Check if session is expired
 */
export function isSessionExpired(expiresAt: Timestamp): boolean {
  return expiresAt.toMillis() < Date.now();
}

/**
 * Validate content safety before sending
 */
export function validateContentSafety(content: Partial<SexyContent>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check required fields
  if (!content.senderId) errors.push('Sender ID is required');
  if (!content.receiverId) errors.push('Receiver ID is required');
  if (!content.contentType) errors.push('Content type is required');
  if (!content.sessionId) errors.push('Session ID is required');

  // Check content type validity
  if (content.contentType && !isAllowedContentType(content.contentType)) {
    errors.push(`Invalid content type: ${content.contentType}`);
  }

  // Check for prohibited content
  if (containsProhibitedContent(content)) {
    errors.push('Content contains prohibited patterns');
  }

  // Must be private one-on-one
  if (content.isPublicGroup === true) {
    errors.push('Public group sexual content is prohibited');
  }

  // Must require age verification
  if (content.requiresAgeVerification !== true) {
    errors.push('Content must require age verification');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// ============================================
// CONSENT MANAGEMENT FUNCTIONS
// ============================================

/**
 * Create consent preferences document
 */
export function createConsentPreferences(
  userId: string,
  consentVersion: string = '2.0'
): SexualityConsentPreferences {
  return {
    userId,
    consentEnabled: true,
    isActive: true,
    enabledAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    consentVersion,
    requiresAgeVerification: true,
    canBeDisabledAnytime: true
  };
}

/**
 * Create sexy mode session
 */
export function createSexyModeSession(
  user1Id: string,
  user2Id: string,
  initiatedBy: string,
  consentVersion: string = '2.0',
  expirationHours: number = 24
): SexyModeSession {
  const sessionId = generateSessionId(user1Id, user2Id);
  const now = Timestamp.now();

  return {
    sessionId,
    user1Id: user1Id < user2Id ? user1Id : user2Id,
    user2Id: user1Id < user2Id ? user2Id : user1Id,
    user1Consent: initiatedBy === (user1Id < user2Id ? user1Id : user2Id),
    user2Consent: initiatedBy === (user1Id < user2Id ? user2Id : user1Id),
    isActive: false, // Only active when both consent
    requiresMutualConsent: true,
    canBeDisabledAnytime: true,
    createdAt: now,
    expiresAt: calculateSessionExpiration(expirationHours),
    lastActivityAt: now,
    initiatedBy,
    consentVersion
  };
}

/**
 * Create audit log entry
 */
export function createAuditLog(
  userId: string,
  actionType: ConsentAuditLog['actionType'],
  complianceData: ConsentAuditLog['complianceData'],
  options: {
    sessionId?: string;
    contentId?: string;
    metadata?: ConsentAuditLog['metadata'];
  } = {}
): Omit<ConsentAuditLog, 'logId'> {
  return {
    userId,
    actionType,
    sessionId: options.sessionId,
    contentId: options.contentId,
    timestamp: Timestamp.now(),
    metadata: options.metadata || {},
    complianceData
  };
}

/**
 * Create moderation flag
 */
export function createModerationFlag(
  contentId: string,
  reportedUserId: string,
  flagType: ContentModerationFlag['flagType'],
  severityLevel: ContentModerationFlag['severityLevel'],
  reason: string,
  detectedPatterns?: string[]
): Omit<ContentModerationFlag, 'flagId'> {
  return {
    contentId,
    reportedUserId,
    flagType,
    severityLevel,
    reason,
    detectedPatterns,
    isResolved: false,
    createdAt: Timestamp.now()
  };
}

/**
 * Create violation record
 */
export function createViolation(
  userId: string,
  violationType: ViolationType,
  description: string,
  severityLevel: SexyModeViolation['severityLevel'] = 'minor',
  options: {
    contentId?: string;
    sessionId?: string;
  } = {}
): Omit<SexyModeViolation, 'violationId'> {
  return {
    userId,
    violationType,
    severityLevel,
    description,
    detectedAt: Timestamp.now(),
    contentId: options.contentId,
    sessionId: options.sessionId,
    isResolved: false
  };
}

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * Check if both users have given mutual consent
 */
export function hasMutualConsent(session: SexyModeSession): boolean {
  return session.user1Consent && session.user2Consent && !isSessionExpired(session.expiresAt);
}

/**
 * Update session consent status
 */
export function updateSessionConsent(
  session: SexyModeSession,
  userId: string,
  consentGiven: boolean
): Partial<SexyModeSession> {
  const isUser1 = userId === session.user1Id;
  
  const updates: Partial<SexyModeSession> = {
    lastActivityAt: Timestamp.now()
  };

  if (isUser1) {
    updates.user1Consent = consentGiven;
  } else {
    updates.user2Consent = consentGiven;
  }

  // Update isActive based on mutual consent
  const newUser1Consent = isUser1 ? consentGiven : session.user1Consent;
  const newUser2Consent = !isUser1 ? consentGiven : session.user2Consent;
  updates.isActive = newUser1Consent && newUser2Consent;

  return updates;
}

/**
 * Downgrade conversation to PG when consent is withdrawn
 */
export function downgradeConversationSafety(
  conversationId: string,
  user1Id: string,
  user2Id: string,
  updatedBy: string
): ConversationSafetyMode {
  return {
    conversationId,
    user1Id,
    user2Id,
    safetyLevel: 'pg',
    sexyModeActive: false,
    contentFilterLevel: 'strict',
    updatedAt: Timestamp.now(),
    updatedBy
  };
}

// ============================================
// CONSTANTS
// ============================================

export const CONSENT_VERSION = '2.0';
export const DEFAULT_SESSION_EXPIRATION_HOURS = 24;
export const MAX_SESSION_EXPIRATION_HOURS = 168; // 7 days
export const MIN_AGE_REQUIREMENT = 18;

export const ALLOWED_CONTENT_TYPES: ContentType[] = [
  'text_flirty',
  'text_sexy',
  'photo_bikini',
  'photo_lingerie',
  'photo_sensual',
  'selfie_sexy',
  'emoji_flirty',
  'compliment'
];

export const PROHIBITED_KEYWORDS = [
  'porn',
  'explicit sex',
  'escorting',
  'money for sex',
  'minor',
  'child',
  'underage',
  'webcam show',
  'live sex'
];

export const SEVERITY_THRESHOLDS = {
  minor: 1,
  major: 3,
  critical: 5
};