/**
 * PACK 123 - Team Accounts Schema
 * Collection: team_memberships
 * 
 * Enables multi-user business access without compromising:
 * - Monetization (no token/payout changes)
 * - Discovery/ranking (no algorithmic boost)
 * - Privacy (no bulk message access)
 * - Compliance (no KYC/safety bypass)
 */

export interface TeamMembership {
  membershipId: string;
  ownerUserId: string;
  memberUserId: string;
  role: TeamRole;
  invitedAt: FirebaseFirestore.Timestamp;
  joinedAt?: FirebaseFirestore.Timestamp;
  removedAt?: FirebaseFirestore.Timestamp;
  permissions: TeamPermission[];
  dmAccessGranted: boolean;
  twoFactorEnabled: boolean;
  deviceFingerprints: string[];
  inviteToken?: string;
  inviteExpiresAt?: FirebaseFirestore.Timestamp;
  status: 'invited' | 'active' | 'removed' | 'suspended';
  metadata: {
    inviterUserId: string;
    lastActivityAt?: FirebaseFirestore.Timestamp;
    removalReason?: string;
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
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

/**
 * Role-Permission Matrix (enforced at middleware level)
 */
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

/**
 * Firestore Indexes Required:
 * 
 * Collection: team_memberships
 * - ownerUserId (ASC), status (ASC)
 * - memberUserId (ASC), status (ASC)
 * - ownerUserId (ASC), role (ASC), status (ASC)
 * - inviteToken (ASC)
 */

/**
 * Security Rules:
 * - Only owner can create/remove memberships
 * - Team members can read their own membership
 * - Owner can read all memberships for their account
 * - No direct writes from client (use Cloud Functions)
 */
export const TEAM_MEMBERSHIPS_SECURITY_RULES = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /team_memberships/{membershipId} {
      // Owner can read all memberships for their account
      allow read: if request.auth != null && 
        resource.data.ownerUserId == request.auth.uid;
      
      // Member can read their own membership
      allow read: if request.auth != null && 
        resource.data.memberUserId == request.auth.uid;
      
      // All writes go through Cloud Functions
      allow write: if false;
    }
  }
}
`;