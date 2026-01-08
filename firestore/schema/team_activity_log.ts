/**
 * PACK 123 - Team Activity Audit Log Schema
 * Collection: team_activity_log
 * 
 * Comprehensive audit trail of all team member actions
 * Enables full transparency and compliance monitoring
 */

export interface TeamActivityLog {
  id: string;
  userId: string; // The creator/owner account being acted upon
  memberUserId: string; // The team member performing the action
  action: TeamAction;
  target: string; // What was acted upon (postId, userId, settingName, etc.)
  metadata: TeamActionMetadata;
  timestamp: FirebaseFirestore.Timestamp;
  ipAddress?: string;
  deviceFingerprint?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

export type TeamAction =
  // Profile management
  | 'edit_profile'
  | 'update_avatar'
  | 'update_bio'
  | 'update_settings'
  
  // Content management
  | 'create_post'
  | 'edit_post'
  | 'delete_post'
  | 'create_story'
  | 'schedule_post'
  | 'cancel_scheduled_post'
  
  // Analytics access
  | 'view_analytics'
  | 'view_earnings_summary'
  | 'export_analytics'
  
  // Communication
  | 'respond_dm'
  | 'view_messages'
  | 'handle_support_ticket'
  
  // Team management
  | 'invite_member'
  | 'remove_member'
  | 'update_member_role'
  | 'grant_dm_access'
  | 'revoke_dm_access'
  
  // Security events
  | 'login_attempt'
  | 'suspicious_activity_detected'
  | 'permission_denied'
  | 'two_factor_verification';

export interface TeamActionMetadata {
  // Common fields
  actionDescription?: string;
  affectedResources?: string[];
  
  // Profile changes
  fieldChanged?: string;
  oldValue?: any;
  newValue?: any;
  
  // Content details
  postId?: string;
  contentType?: 'post' | 'story' | 'scheduled';
  mediaCount?: number;
  
  // Analytics access
  reportType?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  
  // Communication
  conversationId?: string;
  messageCount?: number;
  recipientUserId?: string;
  
  // Team management
  targetMemberUserId?: string;
  roleChanged?: {
    from: string;
    to: string;
  };
  permissionsGranted?: string[];
  permissionsRevoked?: string[];
  
  // Security
  failureReason?: string;
  blockedByPolicy?: string;
  riskScore?: number;
}

/**
 * Firestore Indexes Required:
 * 
 * Collection: team_activity_log
 * - userId (ASC), timestamp (DESC)
 * - memberUserId (ASC), timestamp (DESC)
 * - userId (ASC), action (ASC), timestamp (DESC)
 * - userId (ASC), success (ASC), timestamp (DESC)
 * - memberUserId (ASC), success (ASC), timestamp (DESC)
 */

/**
 * Security Rules:
 * - Only owner can read activity logs
 * - All writes go through Cloud Functions
 * - Team members cannot access audit logs
 */
export const TEAM_ACTIVITY_LOG_SECURITY_RULES = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /team_activity_log/{logId} {
      // Only owner can read activity logs
      allow read: if request.auth != null && 
        resource.data.userId == request.auth.uid;
      
      // All writes go through Cloud Functions
      allow write: if false;
    }
  }
}
`;

/**
 * Helper function to determine log retention
 * Critical security events: 2 years
 * Standard activity: 90 days
 */
export const LOG_RETENTION_DAYS = {
  security_event: 730,
  team_management: 365,
  content_action: 90,
  analytics_access: 90,
  communication: 90,
  standard: 90,
};

export function getLogRetentionDays(action: TeamAction): number {
  if (action.includes('security') || action.includes('suspicious')) {
    return LOG_RETENTION_DAYS.security_event;
  }
  if (action.includes('invite') || action.includes('remove') || action.includes('role')) {
    return LOG_RETENTION_DAYS.team_management;
  }
  if (action.includes('post') || action.includes('story')) {
    return LOG_RETENTION_DAYS.content_action;
  }
  if (action.includes('analytics') || action.includes('earnings')) {
    return LOG_RETENTION_DAYS.analytics_access;
  }
  if (action.includes('dm') || action.includes('message') || action.includes('support')) {
    return LOG_RETENTION_DAYS.communication;
  }
  return LOG_RETENTION_DAYS.standard;
}