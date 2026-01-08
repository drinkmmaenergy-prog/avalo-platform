/**
 * PACK 320 - Real-Time Moderation Dashboard
 * TypeScript Types and Interfaces
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// MODERATION QUEUE TYPES
// ============================================================================

export type ModerationItemType = 
  | 'IMAGE' 
  | 'PROFILE' 
  | 'CHAT' 
  | 'MEETING' 
  | 'EVENT' 
  | 'AUDIO' 
  | 'VIDEO';

export type ModerationRiskLevel = 
  | 'LOW' 
  | 'MEDIUM' 
  | 'HIGH' 
  | 'CRITICAL';

export type ModerationStatus = 
  | 'PENDING' 
  | 'IN_REVIEW' 
  | 'ACTION_TAKEN' 
  | 'DISMISSED';

export interface AIFlags {
  nudity?: number;
  weapons?: number;
  violence?: number;
  csamProbability?: number;
  deepfake?: number;
  faceMismatch?: number;
  toxicity?: number;
  hate?: number;
  harassment?: number;
  bannedTerms?: string[];
}

export interface ModerationQueueItem {
  itemId: string;
  type: ModerationItemType;
  userId: string;
  reporterId: string | null; // null if auto-flagged
  createdAt: Timestamp;
  sourceRef: string; // Path reference (e.g., "userPhotos/userId/photoId")
  riskLevel: ModerationRiskLevel;
  status: ModerationStatus;
  aiFlags: AIFlags;
  notes: string; // Admin-only notes
  lastUpdated: Timestamp;
  
  // Optional metadata
  contentUrl?: string;
  thumbnailUrl?: string;
  extractedText?: string;
  reportReason?: string;
}

// ============================================================================
// MODERATION ACTIONS
// ============================================================================

export type ModerationActionType = 
  | 'DISMISS'
  | 'WARNING'
  | 'LIMIT_VISIBILITY'
  | 'SUSPEND_24H'
  | 'SUSPEND_72H'
  | 'SUSPEND_7D'
  | 'PERMANENT_BAN'
  | 'REMOVE_CONTENT'
  | 'REQUIRE_REVERIFICATION';

export interface ModerationAction {
  actionId: string;
  userId: string;
  moderatorId: string;
  actionType: ModerationActionType;
  reason: string;
  timestamp: Timestamp;
  
  // References
  queueItemId?: string;
  contentRef?: string;
  
  // Additional context
  previousActions?: number; // Count of previous actions on this user
  autoReversed?: boolean;
  autoReversedAt?: Timestamp;
}

// ============================================================================
// MODERATION ANALYTICS
// ============================================================================

export interface ModerationAnalytics {
  date: string; // YYYY-MM-DD format
  
  // Counts
  totalFlags: number;
  autoFlags: number;
  userFlags: number;
  
  // By status
  resolved: number;
  unresolvedBacklog: number;
  
  // By action type
  warningsIssued: number;
  suspensions: number;
  bans: number;
  reverificationsTriggered: number;
  contentRemoved: number;
  dismissed: number;
  
  // By content type
  flagsByType: {
    IMAGE: number;
    PROFILE: number;
    CHAT: number;
    MEETING: number;
    EVENT: number;
    AUDIO: number;
    VIDEO: number;
  };
  
  // By risk level
  flagsByRisk: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
  
  // Performance metrics
  avgResolutionTimeMinutes: number;
  criticalFlagsResolved: number;
  criticalFlagsUnresolved: number;
  
  // Timestamps
  createdAt: Timestamp;
  lastUpdated: Timestamp;
}

// ============================================================================
// AUTO-FLAGGING TRIGGERS
// ============================================================================

export interface AutoFlagTrigger {
  triggerId: string;
  type: 'IMAGE_UPLOAD' | 'CHAT_MESSAGE' | 'PROFILE_UPDATE' | 'MEETING_MISMATCH' | 'PANIC_BUTTON' | 'RAPID_REPORTS';
  userId: string;
  contentRef: string;
  detectedIssues: string[];
  severity: ModerationRiskLevel;
  createdAt: Timestamp;
  queueItemCreated: boolean;
  queueItemId?: string;
}

// ============================================================================
// USER MODERATION HISTORY
// ============================================================================

export interface UserModerationHistory {
  userId: string;
  
  // Counters
  totalFlags: number;
  totalActions: number;
  
  // Breakdown by action
  warnings: number;
  suspensions: number;
  bans: number;
  contentRemovals: number;
  
  // Status
  currentStatus: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  suspendedUntil?: Timestamp;
  
  // Recent activity
  lastFlaggedAt?: Timestamp;
  lastActionAt?: Timestamp;
  lastActionType?: ModerationActionType;
  
  // Trust score
  trustScore: number; // 0-100
  trustLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERIFIED';
  
  // First/last
  firstFlagAt?: Timestamp;
  createdAt: Timestamp;
  lastUpdated: Timestamp;
}

// ============================================================================
// DASHBOARD DATA STRUCTURES
// ============================================================================

export interface ModerationDashboardStats {
  totalPending: number;
  totalInReview: number;
  totalToday: number;
  totalThisWeek: number;
  
  criticalUnresolved: number;
  highUnresolved: number;
  
  avgResolutionTimeMinutes: number;
  moderatorsActive: number;
}

export interface ModerationDashboardFilters {
  type?: ModerationItemType;
  riskLevel?: ModerationRiskLevel;
  status?: ModerationStatus;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  reporterId?: string;
}

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

export interface ModerationNotificationTemplate {
  type: 'WARNING' | 'SUSPENSION' | 'BAN' | 'REVERIFICATION' | 'CONTENT_REMOVED';
  
  en: {
    subject: string;
    body: string;
  };
  
  pl: {
    subject: string;
    body: string;
  };
}

// ============================================================================
// API INTERFACES
// ============================================================================

export interface ProcessModerationActionRequest {
  queueItemId: string;
  actionType: ModerationActionType;
  reason: string;
  moderatorId: string;
  notes?: string;
}

export interface ProcessModerationActionResponse {
  success: boolean;
  actionId: string;
  error?: string;
}

export interface GetModerationQueueRequest {
  filters?: ModerationDashboardFilters;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'riskLevel' | 'lastUpdated';
  sortOrder?: 'asc' | 'desc';
}

export interface GetModerationQueueResponse {
  items: ModerationQueueItem[];
  total: number;
  hasMore: boolean;
}

export interface GetUserModerationHistoryRequest {
  userId: string;
  includeActions?: boolean;
  includeFlags?: boolean;
  limit?: number;
}

export interface GetUserModerationHistoryResponse {
  history: UserModerationHistory;
  recentActions?: ModerationAction[];
  recentFlags?: ModerationQueueItem[];
}