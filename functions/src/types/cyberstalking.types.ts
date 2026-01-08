/**
 * PACK 175 — Avalo Cyberstalking & Location Safety Defender
 * TypeScript Type Definitions
 * 
 * Zero tolerance for stalking, obsessive monitoring, GPS abuse, and territorial jealousy.
 * Romance and control have zero authority over safety.
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// STALKING BEHAVIOR TYPES
// ============================================================================

/**
 * Types of stalking behaviors detected by the system
 */
export type StalkingBehaviorType =
  | 'INVASIVE_MONITORING'        // Repeatedly asking where someone is
  | 'TERRITORIAL_JEALOUSY'       // Aggression about who user interacts with
  | 'DIGITAL_FOLLOWING'          // Entering same clubs/events aggressively
  | 'SESSION_HIJACKING'          // Joining livestreams to watch location
  | 'REAL_LIFE_TRACKING'         // Requesting live location or proof photos
  | 'ISOLATION_ATTEMPTS'         // Trying to isolate target socially
  | 'GUILT_TRIP_CONTROL'         // "Why didn't you answer?" patterns
  | 'SURVEILLANCE_REQUESTS'      // "Show me your room" demands
  | 'THREATENING_ESCALATION';    // Threats if access restricted

/**
 * Severity levels for stalking behaviors
 */
export type StalkingBehaviorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Stalking behavior detection record
 */
export interface StalkingBehavior {
  id: string;
  victimUserId: string;
  stalkerUserId: string;
  behaviorType: StalkingBehaviorType;
  severity: StalkingBehaviorSeverity;
  detectedAt: Timestamp;
  evidence: {
    messageCount?: number;
    timeSpan?: number;        // Minutes
    pattern?: string;
    context?: string;
  };
  actionTaken: 'NONE' | 'WARNING' | 'CHAT_FREEZE' | 'TIMEOUT' | 'BAN';
  resolved: boolean;
  resolvedAt?: Timestamp;
}

// ============================================================================
// OBSESSION PATTERN TYPES
// ============================================================================

/**
 * Obsession pattern indicators
 */
export interface ObsessionPattern {
  id: string;
  targetUserId: string;
  observedUserId: string;
  patternType: ObsessionPatternType;
  detectedAt: Timestamp;
  metrics: ObsessionMetrics;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  mitigationApplied: boolean;
  mitigationDetails?: MitigationAction;
}

export type ObsessionPatternType =
  | 'EXCESSIVE_MESSAGING'        // High frequency message attempts
  | 'SOCIAL_ISOLATION'           // Attempting to monopolize time
  | 'GUILT_MANIPULATION'         // Emotional pressure tactics
  | 'SURVEILLANCE_DEMANDS'       // Requesting proof of activities
  | 'THREATENING_ACCESS_LOSS';   // Escalating when restricted

export interface ObsessionMetrics {
  dailyMessageAttempts: number;
  averageResponseTime: number;      // User's response time
  demandingResponseTime: number;    // Observer's expectation
  isolationAttempts: number;
  guiltTripCount: number;
  surveillanceRequestCount: number;
  threatCount: number;
  timeSpanDays: number;
}

// ============================================================================
// LOCATION SAFETY TYPES
// ============================================================================

/**
 * Location safety violations
 */
export interface LocationSafetyViolation {
  id: string;
  victimUserId: string;
  violatorUserId: string;
  violationType: LocationViolationType;
  detectedAt: Timestamp;
  blocked: boolean;
  educationalCardShown: boolean;
}

export type LocationViolationType =
  | 'LIVE_LOCATION_REQUEST'      // Asking for real-time GPS
  | 'PROOF_PHOTO_DEMAND'         // "Take a photo now to prove"
  | 'LOCATION_INTERROGATION'     // Repeated "where are you" questions
  | 'CHECK_IN_DEMAND'            // Requiring regular location updates
  | 'TRACKING_ATTEMPT';          // Trying to monitor movements

/**
 * Location safety log entry
 */
export interface LocationSafetyLog {
  id: string;
  userId: string;
  eventType: 'SHARE_BLOCKED' | 'REQUEST_BLOCKED' | 'EDUCATION_SHOWN';
  details: {
    requestType?: LocationViolationType;
    requestedBy?: string;
    context?: string;
  };
  timestamp: Timestamp;
}

// ============================================================================
// MEDIA SAFETY TYPES
// ============================================================================

/**
 * Invasive media request types
 */
export type InvasiveMediaRequestType =
  | 'LIVE_PHOTO_PROOF'           // "Send photo right now"
  | 'ROOM_SCAN_DEMAND'           // "Show me the room"
  | 'COMPANION_PROOF'            // "Show who you're with"
  | 'SCREEN_SHARE_DEMAND'        // "Share your screen/chats"
  | 'SCHEDULE_UPLOAD';           // "Upload your calendar"

/**
 * Blocked media request record
 */
export interface BlockedMediaRequest {
  id: string;
  victimUserId: string;
  requesterId: string;
  requestType: InvasiveMediaRequestType;
  blockedAt: Timestamp;
  autoBlocked: boolean;
  educationProvided: boolean;
}

// ============================================================================
// STALKING CASE TYPES
// ============================================================================

/**
 * Comprehensive stalking case
 */
export interface StalkingCase {
  id: string;
  victimUserId: string;
  stalkerUserId: string;
  status: StalkingCaseStatus;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Aggregated evidence
  behaviors: StalkingBehavior[];
  obsessionPatterns: ObsessionPattern[];
  locationViolations: LocationSafetyViolation[];
  mediaRequests: BlockedMediaRequest[];
  
  // Timeline
  firstDetectedAt: Timestamp;
  lastActivityAt: Timestamp;
  resolvedAt?: Timestamp;
  
  // Actions taken
  warningsSent: number;
  chatsFrozen: number;
  timeoutsApplied: number;
  reportFiled: boolean;
  reportedAt?: Timestamp;
  
  // Case management
  reviewedByModerator: boolean;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  moderatorNotes?: string;
}

export type StalkingCaseStatus =
  | 'ACTIVE'              // Ongoing monitoring
  | 'ESCALATED'           // Requires immediate attention
  | 'MITIGATED'           // Actions taken, monitoring continues
  | 'RESOLVED'            // Case closed
  | 'BANNED';             // Stalker permanently banned

// ============================================================================
// MITIGATION TYPES
// ============================================================================

/**
 * Mitigation actions that can be applied
 */
export interface MitigationAction {
  id: string;
  caseId: string;
  stalkerUserId: string;
  victimUserId: string;
  actionType: MitigationType;
  appliedAt: Timestamp;
  duration?: number;          // Minutes (for temporary actions)
  expiresAt?: Timestamp;
  reason: string;
  autoApplied: boolean;
}

export type MitigationType =
  | 'WARNING'                 // Educational message
  | 'CHAT_FREEZE'             // Temporary message block
  | 'GLOBAL_TIMEOUT'          // Platform-wide messaging restriction
  | 'EVENT_BAN'               // Cannot join same events as victim
  | 'DISCOVERY_HIDE'          // Hidden from victim's discovery
  | 'PERMANENT_BAN'           // Account banned
  | 'DEVICE_BLOCK';           // Device-level block

// ============================================================================
// HELP & REPORTING TYPES
// ============================================================================

/**
 * Victim help request
 */
export interface VictimHelpRequest {
  id: string;
  victimUserId: string;
  stalkerUserId: string;
  requestType: HelpRequestType;
  priority: 'NORMAL' | 'HIGH' | 'URGENT';
  requestedAt: Timestamp;
  responded: boolean;
  respondedAt?: Timestamp;
  outcome?: string;
}

export type HelpRequestType =
  | 'REPORT_STALKING'
  | 'REPORT_OBSESSION'
  | 'REPORT_LOCATION_ABUSE'
  | 'REQUEST_PROTECTION'
  | 'LEGAL_RESOURCES';

/**
 * Country-specific legal resources
 */
export interface LegalResources {
  countryCode: string;
  resources: {
    hotlines?: string[];
    websites?: string[];
    localAuthorities?: string[];
    supportOrganizations?: string[];
  };
  lastUpdated: Timestamp;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * System configuration for stalking detection
 */
export interface StalkingDetectionConfig {
  // Behavior thresholds
  invasiveMonitoringThreshold: number;      // Messages asking location per day
  territorialJealousyKeywords: string[];
  isolationAttemptThreshold: number;
  surveillanceRequestThreshold: number;
  
  // Time windows
  shortTermWindow: number;                  // Minutes for immediate patterns
  mediumTermWindow: number;                 // Hours for daily patterns
  longTermWindow: number;                   // Days for persistent patterns
  
  // Automatic mitigation
  autoWarningEnabled: boolean;
  autoChatFreezeEnabled: boolean;
  autoTimeoutEnabled: boolean;
  autoBanEnabled: boolean;
  
  // Thresholds for automatic actions
  warningThreshold: number;                 // Behavior count
  freezeThreshold: number;
  timeoutThreshold: number;
  banThreshold: number;
}

/**
 * User protection status
 */
export interface UserProtectionStatus {
  userId: string;
  isProtected: boolean;
  protectedFrom: string[];                  // User IDs
  activeCases: number;
  lastIncidentAt?: Timestamp;
  educationCompleted: boolean;
  resourcesProvided: boolean;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

/**
 * Stalking analytics aggregation
 */
export interface StalkingAnalytics {
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  startDate: Timestamp;
  endDate: Timestamp;
  
  metrics: {
    totalCasesDetected: number;
    activeCases: number;
    resolvedCases: number;
    bannedUsers: number;
    
    behaviorBreakdown: Record<StalkingBehaviorType, number>;
    severityBreakdown: Record<StalkingBehaviorSeverity, number>;
    mitigationBreakdown: Record<MitigationType, number>;
    
    averageResolutionTime: number;          // Hours
    victimSupportRate: number;              // Percentage who got help
    educationEffectiveness: number;         // Behavior reduction after education
  };
  
  generatedAt: Timestamp;
}