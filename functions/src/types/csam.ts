/**
 * CSAM Shield Type Definitions
 * Phase 22: Child Sexual Abuse Material Protection
 * 
 * IMPORTANT: This module implements child protection measures.
 * All types and interfaces support the human-in-the-loop moderation model.
 */

// ============================================================================
// ENUMS & TYPES
// ============================================================================

/**
 * Sources where CSAM risk can be detected
 */
export type CsamRiskSource = 
  | 'chat'
  | 'ai_chat'
  | 'live'
  | 'media_upload'
  | 'questions'
  | 'drops'
  | 'ai_bot_prompt'
  | 'profile';

/**
 * Risk levels for detected content
 */
export type CsamRiskLevel = 
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

/**
 * Detection method used
 */
export type CsamDetectionChannel = 
  | 'auto_text'
  | 'auto_image'
  | 'user_report'
  | 'manual_flag';

/**
 * Status of a CSAM incident
 */
export type CsamIncidentStatus = 
  | 'OPEN_REVIEW'
  | 'CONFIRMED_CSAM'
  | 'CLEARED_FALSE_POSITIVE'
  | 'ESCALATED_TO_AUTHORITIES';

// ============================================================================
// CORE INTERFACES
// ============================================================================

/**
 * Main CSAM incident record
 * Stored in csamIncidents collection
 */
export interface CsamIncident {
  incidentId: string;
  userId: string;
  suspectUserId?: string;
  source: CsamRiskSource;
  detectionChannel: CsamDetectionChannel;
  riskLevel: CsamRiskLevel;
  detectedAt: any; // Timestamp
  
  // Content references (NEVER store actual CSAM)
  contentSnippet?: string; // Short, redacted text only
  messageIds?: string[];
  mediaIds?: string[];
  sessionIds?: string[];
  questionIds?: string[];
  
  // Status tracking
  status: CsamIncidentStatus;
  moderatorUserId?: string;
  moderatorNote?: string;
  reportedToAuthoritiesAt?: any; // Timestamp
  
  // Timestamps
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
}

/**
 * Result from CSAM risk evaluation
 */
export interface CsamCheckResult {
  isFlagged: boolean;
  riskLevel: CsamRiskLevel;
  reasonCodes: string[];
}

/**
 * Automatic actions to take based on risk level
 */
export interface CsamAutoAction {
  freezeAccount: boolean;
  hideContentFromPublic: boolean;
  blockNewContent: boolean;
  notifyModerator: boolean;
}

/**
 * CSAM report sent to authorities
 * Stored in csamReports collection
 */
export interface CsamReport {
  reportId: string;
  incidentId: string;
  reportedAt: any; // Timestamp
  reportedBy: string; // Moderator user ID
  incidentSummary: string;
  userIds: string[];
  externalReferenceId?: string; // NCMEC report ID, etc.
  createdAt: any; // Timestamp
}

/**
 * User safety flags for blocking content
 * Added to user profile under safety field
 */
export interface UserSafetyFlags {
  csamUnderReview: boolean;
  safetyVisibilityBlocked: boolean;
  csamIncidentIds: string[];
  lastCsamCheckAt?: any; // Timestamp
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * CSAM Shield configuration
 */
export interface CsamShieldConfig {
  // Risk thresholds
  autoBlockThreshold: CsamRiskLevel; // HIGH or CRITICAL trigger auto-block
  
  // Detection patterns (can be extended)
  childTerms: string[];
  sexualTerms: string[];
  combinedRiskPatterns: RegExp[];
  
  // Languages supported
  supportedLanguages: {
    [key: string]: {
      childTerms: string[];
      sexualTerms: string[];
    };
  };
  
  // Actions per risk level
  actionsPerLevel: {
    [key in CsamRiskLevel]: CsamAutoAction;
  };
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to evaluate text for CSAM risk
 */
export interface EvaluateTextRequest {
  text: string;
  locale?: string;
  source: CsamRiskSource;
  userId: string;
  contextIds?: {
    messageId?: string;
    sessionId?: string;
    questionId?: string;
  };
}

/**
 * Request to create a CSAM incident
 */
export interface CreateIncidentRequest {
  userId: string;
  suspectUserId?: string;
  source: CsamRiskSource;
  detectionChannel: CsamDetectionChannel;
  riskLevel: CsamRiskLevel;
  contentSnippet?: string;
  messageIds?: string[];
  mediaIds?: string[];
  sessionIds?: string[];
  questionIds?: string[];
}

/**
 * Request to update incident status (moderator only)
 */
export interface UpdateIncidentStatusRequest {
  incidentId: string;
  newStatus: CsamIncidentStatus;
  moderatorNote?: string;
}

/**
 * Response for incident list
 */
export interface ListIncidentsResponse {
  incidents: CsamIncident[];
  total: number;
  hasMore: boolean;
}

/**
 * Filters for listing incidents
 */
export interface IncidentListFilters {
  status?: CsamIncidentStatus;
  riskLevel?: CsamRiskLevel;
  source?: CsamRiskSource;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  // Already exported above via type declarations
};