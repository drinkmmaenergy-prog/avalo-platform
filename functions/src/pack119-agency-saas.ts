/**
 * PACK 119 — Creator Agencies SaaS Panel
 * Core Backend Engine
 * 
 * ZERO INFLUENCE ON TOKENOMICS:
 * - Agency earnings split handled by PACK 114
 * - No access to private messages or buyer data
 * - No token transfer or payout control
 * - No ranking manipulation or visibility boosts
 * - All writes require safety validation
 */

import { db, serverTimestamp, generateId, increment, storage } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  AgencyRole,
  AgencyRolePermissions,
  AgencyTeamMember,
  AgencyAsset,
  AssetStatus,
  AssetType,
  AgencySchedulerTask,
  SchedulePlatform,
  ScheduleStatus,
  CreatorPortfolio,
  AgencyDashboardAnalytics,
  AgencySaaSAuditLog,
  AgencySaaSAuditEvent,
  AgencySaaSError,
  AgencySaaSErrorCode,
  hasPermission,
} from './pack119-types';
import { logEvent } from './observability';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get team member and verify permissions
 */
async function getTeamMemberWithPermission(
  userId: string,
  agencyId: string,
  requiredPermission: keyof AgencyRolePermissions
): Promise<AgencyTeamMember> {
  const memberDoc = await db
    .collection('agency_team_members')
    .doc(`${agencyId}_${userId}`)
    .get();

  if (!memberDoc.exists) {
    throw new AgencySaaSError(
      AgencySaaSErrorCode.PERMISSION_DENIED,
      'Not a member of this agency'
    );
  }

  const member = memberDoc.data() as AgencyTeamMember;

  if (member.status !== 'ACTIVE') {
    throw new AgencySaaSError(
      AgencySaaSErrorCode.PERMISSION_DENIED,
      'Team member is not active'
    );
  }

  if (!hasPermission(member.role, requiredPermission)) {
    throw new AgencySaaSError(
      AgencySaaSErrorCode.PERMISSION_DENIED,
      `Role ${member.role} does not have permission: ${String(requiredPermission)}`
    );
  }

  return member;
}

/**
 * Verify creator is linked to agency
 */
async function verifyCreatorLink(agencyId: string, creatorUserId: string): Promise<boolean> {
  const linkQuery = await db
    .collection('creator_agency_links')
    .where('agencyId', '==', agencyId)
    .where('creatorUserId', '==', creatorUserId)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();

  return !linkQuery.empty;
}

/**
 * Log agency audit event
 */
async function logAgencyAudit(params: {
  agencyId: string;
  eventType: AgencySaaSAuditEvent;
  actorId: string;
  actorRole: AgencyRole;
  creatorUserId?: string;
  targetId?: string;
  previousValue?: any;
  newValue?: any;
  metadata: Record<string, any>;
}): Promise<void> {
  const log: AgencySaaSAuditLog = {
    logId: generateId(),
    agencyId: params.agencyId,
    creatorUserId: params.creatorUserId,
    eventType: params.eventType,
    actorId: params.actorId,
    actorRole: params.actorRole,
    targetId: params.targetId,
    previousValue: params.previousValue,
    newValue: params.newValue,
    metadata: params.metadata,
    timestamp: Timestamp.now(),
  };

  await db.collection('agency_saas_audit_log').add(log);

  await logEvent({
    level: 'INFO',
    source: 'BACKEND',
    service: 'functions.pack119-agency-saas',
    module: 'AUDIT',
    message: `Agency SaaS event: ${params.eventType}`,
    environment: 'PROD',
    context: { userId: params.actorId },
    details: {
      extra: {
        agencyId: params.agencyId,
        eventType: params.eventType,
      },
    },
  });
}

// ============================================================================
// TEAM MANAGEMENT
// ============================================================================

/**
 * Invite team member to agency
 */
export const inviteTeamMember = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ memberId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId, email, role } = request.data;

    if (!agencyId || !email || !role) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
      // Verify caller has permission
      const caller = await getTeamMemberWithPermission(
        request.auth.uid,
        agencyId,
        'canLinkCreators'
      );

      // Check if member already exists
      const existingMember = await db
        .collection('agency_team_members')
        .where('agencyId', '==', agencyId)
        .where('email', '==', email)
        .limit(1)
        .get();

      if (!existingMember.empty) {
        throw new HttpsError('already-exists', 'Member already invited');
      }

      const memberId = generateId();
      const member: AgencyTeamMember = {
        memberId,
        agencyId,
        userId: '', // Will be set when accepted
        email,
        role,
        invitedBy: request.auth.uid,
        invitedAt: Timestamp.now(),
        status: 'PENDING',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await db.collection('agency_team_members').doc(memberId).set(member);

      await logAgencyAudit({
        agencyId,
        eventType: 'TEAM_MEMBER_INVITED',
        actorId: request.auth.uid,
        actorRole: caller.role,
        targetId: memberId,
        metadata: { email, role },
      });

      logger.info('Team member invited', { agencyId, memberId, email, role });

      return { memberId };
    } catch (error: any) {
      logger.error('Error inviting team member', error);
      
      if (error instanceof AgencySaaSError) {
        throw new HttpsError('permission-denied', error.message);
      }
      
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Update team member role
 */
export const updateTeamMemberRole = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { memberId, newRole } = request.data;

    if (!memberId || !newRole) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
      const memberRef = db.collection('agency_team_members').doc(memberId);
      const memberDoc = await memberRef.get();

      if (!memberDoc.exists) {
        throw new HttpsError('not-found', 'Team member not found');
      }

      const member = memberDoc.data() as AgencyTeamMember;

      // Verify caller has permission
      await getTeamMemberWithPermission(
        request.auth.uid,
        member.agencyId,
        'canLinkCreators'
      );

      const oldRole = member.role;

      await memberRef.update({
        role: newRole,
        updatedAt: serverTimestamp(),
      });

      await logAgencyAudit({
        agencyId: member.agencyId,
        eventType: 'TEAM_MEMBER_ROLE_CHANGED',
        actorId: request.auth.uid,
        actorRole: member.role,
        targetId: memberId,
        previousValue: { role: oldRole },
        newValue: { role: newRole },
        metadata: {},
      });

      logger.info('Team member role updated', { memberId, oldRole, newRole });

      return { success: true };
    } catch (error: any) {
      logger.error('Error updating team member role', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// ASSET LIBRARY
// ============================================================================

/**
 * Upload asset to library
 */
export const uploadAsset = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ assetId: string; uploadUrl: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId, creatorUserId, fileName, mimeType, fileSize, tags, description } = request.data;

    if (!agencyId || !fileName || !mimeType || !fileSize) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
      // Verify caller has permission
      const caller = await getTeamMemberWithPermission(
        request.auth.uid,
        agencyId,
        'canUploadAssets'
      );

      // Verify creator link if specified
      if (creatorUserId) {
        const isLinked = await verifyCreatorLink(agencyId, creatorUserId);
        if (!isLinked) {
          throw new AgencySaaSError(
            AgencySaaSErrorCode.CREATOR_NOT_LINKED,
            'Creator is not linked to this agency'
          );
        }
      }

      // Determine asset type
      let assetType: AssetType;
      if (mimeType.startsWith('image/')) {
        assetType = 'IMAGE';
      } else if (mimeType.startsWith('video/')) {
        assetType = 'VIDEO';
      } else if (mimeType.startsWith('audio/')) {
        assetType = 'AUDIO';
      } else {
        assetType = 'DOCUMENT';
      }

      const assetId = generateId();
      const storagePath = `agencies/${agencyId}/assets/${assetId}_${fileName}`;

      // Generate signed upload URL
      const bucket = storage.bucket();
      const file = bucket.file(storagePath);
      
      const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 3600 * 1000, // 1 hour
        contentType: mimeType,
      });

      const asset: AgencyAsset = {
        assetId,
        agencyId,
        creatorUserId,
        uploadedBy: request.auth.uid,
        fileName,
        fileSize,
        mimeType,
        assetType,
        fileRef: storagePath,
        tags: tags || [],
        description,
        status: 'PENDING_SCAN',
        usageCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await db.collection('agency_assets').doc(assetId).set(asset);

      await logAgencyAudit({
        agencyId,
        eventType: 'ASSET_UPLOADED',
        actorId: request.auth.uid,
        actorRole: caller.role,
        creatorUserId,
        targetId: assetId,
        metadata: { fileName, assetType, fileSize },
      });

      logger.info('Asset upload initiated', { assetId, agencyId, fileName });

      // Trigger safety scan (would be implemented separately)
      // await triggerAssetSafetyScan(assetId);

      return { assetId, uploadUrl };
    } catch (error: any) {
      logger.error('Error uploading asset', error);
      
      if (error instanceof AgencySaaSError) {
        throw new HttpsError('permission-denied', error.message);
      }
      
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Delete asset from library
 */
export const deleteAsset = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { assetId } = request.data;

    if (!assetId) {
      throw new HttpsError('invalid-argument', 'Asset ID required');
    }

    try {
      const assetRef = db.collection('agency_assets').doc(assetId);
      const assetDoc = await assetRef.get();

      if (!assetDoc.exists) {
        throw new HttpsError('not-found', 'Asset not found');
      }

      const asset = assetDoc.data() as AgencyAsset;

      // Verify caller has permission
      const caller = await getTeamMemberWithPermission(
        request.auth.uid,
        asset.agencyId,
        'canUploadAssets'
      );

      // Mark as deleted (don't actually delete for audit trail)
      await assetRef.update({
        status: 'DELETED' as AssetStatus,
        updatedAt: serverTimestamp(),
      });

      // Delete from storage
      try {
        const bucket = storage.bucket();
        await bucket.file(asset.fileRef).delete();
        
        if (asset.thumbnailRef) {
          await bucket.file(asset.thumbnailRef).delete();
        }
      } catch (storageError) {
        logger.warn('Failed to delete asset from storage', { assetId, error: storageError });
      }

      await logAgencyAudit({
        agencyId: asset.agencyId,
        eventType: 'ASSET_DELETED',
        actorId: request.auth.uid,
        actorRole: caller.role,
        targetId: assetId,
        metadata: { fileName: asset.fileName },
      });

      logger.info('Asset deleted', { assetId, agencyId: asset.agencyId });

      return { success: true };
    } catch (error: any) {
      logger.error('Error deleting asset', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * List assets for agency
 */
export const listAssets = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ assets: AgencyAsset[]; hasMore: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId, creatorUserId, assetType, limit = 50, offset = 0 } = request.data;

    if (!agencyId) {
      throw new HttpsError('invalid-argument', 'Agency ID required');
    }

    try {
      // Verify caller has permission
      await getTeamMemberWithPermission(
        request.auth.uid,
        agencyId,
        'canViewAnalytics'
      );

      let query = db
        .collection('agency_assets')
        .where('agencyId', '==', agencyId)
        .where('status', '!=', 'DELETED' as AssetStatus);

      if (creatorUserId) {
        query = query.where('creatorUserId', '==', creatorUserId);
      }

      if (assetType) {
        query = query.where('assetType', '==', assetType);
      }

      const snapshot = await query
        .orderBy('createdAt', 'desc')
        .limit(limit + 1)
        .offset(offset)
        .get();

      const assets: AgencyAsset[] = [];
      const hasMore = snapshot.size > limit;

      snapshot.docs.slice(0, limit).forEach(doc => {
        assets.push(doc.data() as AgencyAsset);
      });

      return { assets, hasMore };
    } catch (error: any) {
      logger.error('Error listing assets', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// ============================================================================
// SOCIAL SCHEDULING
// ============================================================================

/**
 * Schedule post for creator
 */
export const schedulePost = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ taskId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { agencyId, creatorUserId, platform, assetId, caption, publishAt } = request.data;

    if (!agencyId || !creatorUserId || !platform || !assetId || !publishAt) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    try {
      // Verify caller has permission
      const caller = await getTeamMemberWithPermission(
        request.auth.uid,
        agencyId,
        'canSchedulePosts'
      );

      // Verify creator link
      const isLinked = await verifyCreatorLink(agencyId, creatorUserId);
      if (!isLinked) {
        throw new AgencySaaSError(
          AgencySaaSErrorCode.CREATOR_NOT_LINKED,
          'Creator is not linked to this agency'
        );
      }

      // Verify asset exists and is approved
      const assetDoc = await db.collection('agency_assets').doc(assetId).get();
      if (!assetDoc.exists) {
        throw new HttpsError('not-found', 'Asset not found');
      }

      const asset = assetDoc.data() as AgencyAsset;
      if (asset.status !== 'APPROVED') {
        throw new HttpsError('failed-precondition', 'Asset must be approved before scheduling');
      }

      // Check for NSFW content if not Avalo platform
      if (platform !== 'AVALO_FEED' && platform !== 'AVALO_STORY') {
        if (asset.scanResult?.hasNSFW) {
          throw new AgencySaaSError(
            AgencySaaSErrorCode.NSFW_CONTENT_BLOCKED,
            'NSFW content cannot be scheduled to external platforms'
          );
        }
      }

      const taskId = generateId();
      const task: AgencySchedulerTask = {
        taskId,
        agencyId,
        creatorUserId,
        scheduledBy: request.auth.uid,
        platform,
        assetId,
        caption,
        publishAt: Timestamp.fromMillis(publishAt),
        status: 'SCHEDULED',
        attempt: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await db.collection('agency_scheduler_tasks').doc(taskId).set(task);

      await logAgencyAudit({
        agencyId,
        eventType: 'TASK_SCHEDULED',
        actorId: request.auth.uid,
        actorRole: caller.role,
        creatorUserId,
        targetId: taskId,
        metadata: { platform, publishAt },
      });

      logger.info('Post scheduled', { taskId, agencyId, creatorUserId, platform });

      return { taskId };
    } catch (error: any) {
      logger.error('Error scheduling post', error);
      
      if (error instanceof AgencySaaSError) {
        throw new HttpsError('failed-precondition', error.message);
      }
      
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Cancel scheduled task
 */
export const cancelScheduledTask = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { taskId } = request.data;

    if (!taskId) {
      throw new HttpsError('invalid-argument', 'Task ID required');
    }

    try {
      const taskRef = db.collection('agency_scheduler_tasks').doc(taskId);
      const taskDoc = await taskRef.get();

      if (!taskDoc.exists) {
        throw new HttpsError('not-found', 'Task not found');
      }

      const task = taskDoc.data() as AgencySchedulerTask;

      // Verify caller has permission
      const caller = await getTeamMemberWithPermission(
        request.auth.uid,
        task.agencyId,
        'canSchedulePosts'
      );

      if (task.status !== 'SCHEDULED') {
        throw new HttpsError('failed-precondition', 'Task cannot be cancelled in current status');
      }

      await taskRef.update({
        status: 'CANCELLED' as ScheduleStatus,
        updatedAt: serverTimestamp(),
      });

      await logAgencyAudit({
        agencyId: task.agencyId,
        eventType: 'TASK_CANCELLED',
        actorId: request.auth.uid,
        actorRole: caller.role,
        creatorUserId: task.creatorUserId,
        targetId: taskId,
        metadata: {},
      });

      logger.info('Task cancelled', { taskId, agencyId: task.agencyId });

      return { success: true };
    } catch (error: any) {
      logger.error('Error cancelling task', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

// Continue in next message due to length...