/**
 * PACK 123 - Team Accounts Type Definitions
 */

import * as admin from 'firebase-admin';

export interface TeamMembership {
  membershipId: string;
  ownerUserId: string;
  memberUserId: string;
  role: TeamRole;
  invitedAt: admin.firestore.Timestamp;
  joinedAt?: admin.firestore.Timestamp;
  removedAt?: admin.firestore.Timestamp;
  permissions: TeamPermission[];
  dmAccessGranted: boolean;
  twoFactorEnabled: boolean;
  deviceFingerprints: string[];
  inviteToken?: string;
  inviteExpiresAt?: admin.firestore.Timestamp;
  status: 'invited' | 'active' | 'removed' | 'suspended';
  metadata: {
    inviterUserId: string;
    lastActivityAt?: admin.firestore.Timestamp;
    removalReason?: string;
    createdAt: admin.firestore.Timestamp;
    updatedAt: admin.firestore.Timestamp;
  };
}

export type TeamRole = 
  | 'owner'
  | 'manager'
  | 'editor'
  | 'analyst'
  | 'support_agent';

export type TeamPermission =
  | 'edit_profile'
  | 'post_content'
  | 'schedule_posts'
  | 'view_analytics'
  | 'view_earnings_summary'
  | 'view_payout_details'
  | 'respond_dms'
  | 'handle_support'
  | 'manage_team';

export const ROLE_PERMISSIONS: Record<TeamRole, TeamPermission[]> = {
  owner: [
    'edit_profile',
    'post_content',
    'schedule_posts',
    'view_analytics',
    'view_earnings_summary',
    'view_payout_details',
    'respond_dms',
    'handle_support',
    'manage_team',
  ],
  manager: [
    'edit_profile',
    'post_content',
    'schedule_posts',
    'view_analytics',
    'view_earnings_summary',
    'handle_support',
  ],
  editor: [
    'edit_profile',
    'post_content',
    'schedule_posts',
    'view_analytics',
  ],
  analyst: [
    'view_analytics',
    'view_earnings_summary',
  ],
  support_agent: [
    'handle_support',
  ],
};

export interface TeamActivityLog {
  id: string;
  userId: string;
  memberUserId: string;
  action: TeamAction;
  target: string;
  metadata: TeamActionMetadata;
  timestamp: admin.firestore.Timestamp;
  ipAddress?: string;
  deviceFingerprint?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

export type TeamAction =
  | 'edit_profile'
  | 'update_avatar'
  | 'update_bio'
  | 'update_settings'
  | 'create_post'
  | 'edit_post'
  | 'delete_post'
  | 'create_story'
  | 'schedule_post'
  | 'cancel_scheduled_post'
  | 'view_analytics'
  | 'view_earnings_summary'
  | 'export_analytics'
  | 'respond_dm'
  | 'view_messages'
  | 'handle_support_ticket'
  | 'invite_member'
  | 'remove_member'
  | 'update_member_role'
  | 'grant_dm_access'
  | 'revoke_dm_access'
  | 'login_attempt'
  | 'suspicious_activity_detected'
  | 'permission_denied'
  | 'two_factor_verification';

export interface TeamActionMetadata {
  actionDescription?: string;
  affectedResources?: string[];
  fieldChanged?: string;
  oldValue?: any;
  newValue?: any;
  postId?: string;
  contentType?: 'post' | 'story' | 'scheduled';
  mediaCount?: number;
  reportType?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  conversationId?: string;
  messageCount?: number;
  recipientUserId?: string;
  targetMemberUserId?: string;
  roleChanged?: {
    from: string;
    to: string;
  };
  permissionsGranted?: string[];
  permissionsRevoked?: string[];
  failureReason?: string;
  blockedByPolicy?: string;
  riskScore?: number;
}