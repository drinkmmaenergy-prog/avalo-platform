/**
 * PACK 420 — Data Rights, Account Lifecycle & GDPR/DSR Engine
 * Backend service for handling data rights requests
 */

import * as admin from 'firebase-admin';
import {
  AccountLifecycleState,
  DataRequestType,
  DataRequestStatus,
  DataRightsRequest,
  DataRightsError,
  DataRightsErrorCode,
  CreateDataRightsRequestInput,
  UpdateDataRightsRequestInput,
  DeletionJobResult,
} from '../../shared/types/pack420-data-rights.types';
import { generateUserDataExport } from './pack420-data-export.adapter';
import { performUserDataDeletion } from './pack420-data-deletion.adapter';

const db = admin.firestore();

// Placeholder for audit logging - integrate with PACK 296 when available
async function logAuditEvent(event: any): Promise<void> {
  console.log('Audit event:', event);
  // TODO: Integrate with PACK 296 audit logging service
}

// Configuration constants
const EXPORT_RATE_LIMIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DELETION_COOLING_OFF_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const EXPORT_URL_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ALLOW_DELETION_CANCELLATION = true;

/**
 * Create a new data rights request
 */
export async function createDataRightsRequest(
  input: CreateDataRightsRequestInput
): Promise<DataRightsRequest> {
  const { userId, type, reason } = input;
  const now = Date.now();

  // Validate user exists and is not already deleted
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    throw new DataRightsError(
      DataRightsErrorCode.USER_NOT_FOUND,
      `User ${userId} not found`
    );
  }

  const userData = userDoc.data();
  if (userData?.lifecycleState === AccountLifecycleState.DELETED) {
    throw new DataRightsError(
      DataRightsErrorCode.USER_ALREADY_DELETED,
      `User ${userId} is already deleted`
    );
  }

  // Type-specific validation
  if (type === DataRequestType.DELETE) {
    // Check for existing active DELETE request
    const existingDeleteRequests = await db
      .collection('dataRightsRequests')
      .where('userId', '==', userId)
      .where('type', '==', DataRequestType.DELETE)
      .where('status', 'in', [DataRequestStatus.PENDING, DataRequestStatus.IN_PROGRESS])
      .get();

    if (!existingDeleteRequests.empty) {
      throw new DataRightsError(
        DataRightsErrorCode.DUPLICATE_ACTIVE_DELETE_REQUEST,
        'User already has an active deletion request'
      );
    }
  } else if (type === DataRequestType.EXPORT) {
    // Check export rate limit
    const recentExports = await db
      .collection('dataRightsRequests')
      .where('userId', '==', userId)
      .where('type', '==', DataRequestType.EXPORT)
      .where('createdAt', '>', now - EXPORT_RATE_LIMIT_WINDOW_MS)
      .get();

    if (recentExports.size >= 2) {
      throw new DataRightsError(
        DataRightsErrorCode.EXPORT_RATE_LIMIT_EXCEEDED,
        'Export rate limit exceeded. Maximum 2 exports per 7 days.'
      );
    }
  }

  // Create the request
  const requestRef = db.collection('dataRightsRequests').doc();
  const request: DataRightsRequest = {
    id: requestRef.id,
    userId,
    type,
    status: DataRequestStatus.PENDING,
    createdAt: now,
    updatedAt: now,
    reason: reason || null,
    adminNotes: null,
    processedByAdminId: null,
    exportDownloadUrl: null,
    scheduledDeletionAt: null,
  };

  await requestRef.set(request);

  // Log audit event
  await logAuditEvent({
    eventType: 'DATA_REQUEST_CREATED',
    actorId: userId,
    targetId: request.id,
    targetType: 'DATA_RIGHTS_REQUEST',
    metadata: {
      requestType: type,
      reason,
    },
  });

  return request;
}

/**
 * Start processing a data rights request
 */
export async function startProcessingRequest(
  requestId: string,
  adminId: string
): Promise<void> {
  const requestRef = db.collection('dataRightsRequests').doc(requestId);
  const requestDoc = await requestRef.get();

  if (!requestDoc.exists) {
    throw new DataRightsError(
      DataRightsErrorCode.REQUEST_NOT_FOUND,
      `Request ${requestId} not found`
    );
  }

  const request = requestDoc.data() as DataRightsRequest;

  if (request.status !== DataRequestStatus.PENDING) {
    throw new DataRightsError(
      DataRightsErrorCode.INVALID_STATUS_TRANSITION,
      `Cannot start processing request in status ${request.status}`
    );
  }

  const now = Date.now();
  await requestRef.update({
    status: DataRequestStatus.IN_PROGRESS,
    updatedAt: now,
    processedByAdminId: adminId,
  });

  await logAuditEvent({
    eventType: 'DATA_REQUEST_STATUS_CHANGED',
    actorId: adminId,
    targetId: requestId,
    targetType: 'DATA_RIGHTS_REQUEST',
    metadata: {
      oldStatus: request.status,
      newStatus: DataRequestStatus.IN_PROGRESS,
      requestType: request.type,
    },
  });
}

/**
 * Complete an EXPORT request
 */
export async function completeExportRequest(
  requestId: string,
  exportDownloadUrl: string,
  adminId: string
): Promise<void> {
  const requestRef = db.collection('dataRightsRequests').doc(requestId);
  const requestDoc = await requestRef.get();

  if (!requestDoc.exists) {
    throw new DataRightsError(
      DataRightsErrorCode.REQUEST_NOT_FOUND,
      `Request ${requestId} not found`
    );
  }

  const request = requestDoc.data() as DataRightsRequest;

  if (request.type !== DataRequestType.EXPORT) {
    throw new DataRightsError(
      DataRightsErrorCode.INVALID_STATUS_TRANSITION,
      'Cannot complete non-EXPORT request as export'
    );
  }

  const now = Date.now();
  await requestRef.update({
    status: DataRequestStatus.COMPLETED,
    updatedAt: now,
    processedByAdminId: adminId,
    exportDownloadUrl,
    exportUrlExpiresAt: now + EXPORT_URL_EXPIRY_MS,
  });

  await logAuditEvent({
    eventType: 'DATA_REQUEST_STATUS_CHANGED',
    actorId: adminId,
    targetId: requestId,
    targetType: 'DATA_RIGHTS_REQUEST',
    metadata: {
      oldStatus: request.status,
      newStatus: DataRequestStatus.COMPLETED,
      requestType: request.type,
    },
  });

  // TODO: Send notification to user via PACK 293
}

/**
 * Schedule a DELETE request
 */
export async function scheduleDeleteRequest(
  requestId: string,
  scheduledDeletionAt: number,
  adminId: string
): Promise<void> {
  const requestRef = db.collection('dataRightsRequests').doc(requestId);
  const requestDoc = await requestRef.get();

  if (!requestDoc.exists) {
    throw new DataRightsError(
      DataRightsErrorCode.REQUEST_NOT_FOUND,
      `Request ${requestId} not found`
    );
  }

  const request = requestDoc.data() as DataRightsRequest;

  if (request.type !== DataRequestType.DELETE) {
    throw new DataRightsError(
      DataRightsErrorCode.INVALID_STATUS_TRANSITION,
      'Cannot schedule deletion for non-DELETE request'
    );
  }

  const now = Date.now();

  // Update request
  await requestRef.update({
    status: DataRequestStatus.IN_PROGRESS,
    updatedAt: now,
    processedByAdminId: adminId,
    scheduledDeletionAt,
  });

  // Update user lifecycle state
  const userRef = db.collection('users').doc(request.userId);
  await userRef.update({
    lifecycleState: AccountLifecycleState.PENDING_DELETION,
    lifecycleStateUpdatedAt: now,
    lifecycleStateReason: 'User requested account deletion',
  });

  await logAuditEvent({
    eventType: 'DATA_REQUEST_STATUS_CHANGED',
    actorId: adminId,
    targetId: requestId,
    targetType: 'DATA_RIGHTS_REQUEST',
    metadata: {
      oldStatus: request.status,
      newStatus: DataRequestStatus.IN_PROGRESS,
      requestType: request.type,
      scheduledDeletionAt,
    },
  });

  // TODO: Send notification to user via PACK 293
}

/**
 * Reject a data rights request
 */
export async function rejectRequest(
  requestId: string,
  reason: string,
  adminId: string
): Promise<void> {
  const requestRef = db.collection('dataRightsRequests').doc(requestId);
  const requestDoc = await requestRef.get();

  if (!requestDoc.exists) {
    throw new DataRightsError(
      DataRightsErrorCode.REQUEST_NOT_FOUND,
      `Request ${requestId} not found`
    );
  }

  const request = requestDoc.data() as DataRightsRequest;

  const now = Date.now();
  await requestRef.update({
    status: DataRequestStatus.REJECTED,
    updatedAt: now,
    processedByAdminId: adminId,
    adminNotes: reason,
  });

  // If this was a DELETE request in progress, restore user to ACTIVE
  if (request.type === DataRequestType.DELETE && request.status === DataRequestStatus.IN_PROGRESS) {
    const userRef = db.collection('users').doc(request.userId);
    await userRef.update({
      lifecycleState: AccountLifecycleState.ACTIVE,
      lifecycleStateUpdatedAt: now,
      lifecycleStateReason: null,
    });
  }

  await logAuditEvent({
    eventType: 'DATA_REQUEST_STATUS_CHANGED',
    actorId: adminId,
    targetId: requestId,
    targetType: 'DATA_RIGHTS_REQUEST',
    metadata: {
      oldStatus: request.status,
      newStatus: DataRequestStatus.REJECTED,
      requestType: request.type,
      reason,
    },
  });

  // TODO: Send notification to user via PACK 293
}

/**
 * Cancel a DELETE request (user-initiated)
 */
export async function cancelDeleteRequest(
  requestId: string,
  userId: string
): Promise<void> {
  if (!ALLOW_DELETION_CANCELLATION) {
    throw new DataRightsError(
      DataRightsErrorCode.UNAUTHORIZED,
      'Deletion cancellation is not allowed by policy'
    );
  }

  const requestRef = db.collection('dataRightsRequests').doc(requestId);
  const requestDoc = await requestRef.get();

  if (!requestDoc.exists) {
    throw new DataRightsError(
      DataRightsErrorCode.REQUEST_NOT_FOUND,
      `Request ${requestId} not found`
    );
  }

  const request = requestDoc.data() as DataRightsRequest;

  if (request.userId !== userId) {
    throw new DataRightsError(
      DataRightsErrorCode.UNAUTHORIZED,
      'User can only cancel their own requests'
    );
  }

  if (request.type !== DataRequestType.DELETE) {
    throw new DataRightsError(
      DataRightsErrorCode.INVALID_STATUS_TRANSITION,
      'Can only cancel DELETE requests'
    );
  }

  if (![DataRequestStatus.PENDING, DataRequestStatus.IN_PROGRESS].includes(request.status)) {
    throw new DataRightsError(
      DataRightsErrorCode.INVALID_STATUS_TRANSITION,
      'Can only cancel pending or in-progress requests'
    );
  }

  const now = Date.now();
  await requestRef.update({
    status: DataRequestStatus.REJECTED,
    updatedAt: now,
    adminNotes: 'Cancelled by user',
    reason: 'User cancelled deletion request',
  });

  // Restore user to ACTIVE
  const userRef = db.collection('users').doc(userId);
  await userRef.update({
    lifecycleState: AccountLifecycleState.ACTIVE,
    lifecycleStateUpdatedAt: now,
    lifecycleStateReason: null,
  });

  await logAuditEvent({
    eventType: 'DATA_REQUEST_STATUS_CHANGED',
    actorId: userId,
    targetId: requestId,
    targetType: 'DATA_RIGHTS_REQUEST',
    metadata: {
      oldStatus: request.status,
      newStatus: DataRequestStatus.REJECTED,
      requestType: request.type,
      reason: 'User cancelled',
    },
  });
}

/**
 * Run the scheduled deletion job (should be triggered daily)
 * This is called by a scheduled Cloud Function
 */
export async function runDeletionJob(): Promise<DeletionJobResult> {
  const now = Date.now();
  const result: DeletionJobResult = {
    processed: 0,
    successful: 0,
    failed: 0,
    failures: [],
    executedAt: now,
  };

  // Find all DELETE requests ready for execution
  const readyRequests = await db
    .collection('dataRightsRequests')
    .where('type', '==', DataRequestType.DELETE)
    .where('status', '==', DataRequestStatus.IN_PROGRESS)
    .where('scheduledDeletionAt', '<=', now)
    .get();

  if (readyRequests.empty) {
    console.log('No deletion requests ready for processing');
    return result;
  }

  console.log(`Processing ${readyRequests.size} deletion requests`);

  // Process each request
  for (const doc of readyRequests.docs) {
    const request = doc.data() as DataRightsRequest;
    result.processed++;

    try {
      // Execute deletion
      await performUserDataDeletion(request.userId);

      // Update request status
      await doc.ref.update({
        status: DataRequestStatus.COMPLETED,
        updatedAt: now,
      });

      // Update user lifecycle
      await db.collection('users').doc(request.userId).update({
        lifecycleState: AccountLifecycleState.DELETED,
        lifecycleStateUpdatedAt: now,
      });

      result.successful++;

      await logAuditEvent({
        eventType: 'DATA_DELETION_COMPLETED',
        actorId: 'SYSTEM',
        targetId: request.userId,
        targetType: 'USER',
        metadata: {
          requestId: request.id,
        },
      });
    } catch (error) {
      result.failed++;
      result.failures.push({
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      console.error(`Failed to delete user ${request.userId}:`, error);

      // Log failure
      await logAuditEvent({
        eventType: 'DATA_DELETION_FAILED',
        actorId: 'SYSTEM',
        targetId: request.userId,
        targetType: 'USER',
        metadata: {
          requestId: request.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  // Log batch summary
  await logAuditEvent({
    eventType: 'DATA_DELETION_BATCH',
    actorId: 'SYSTEM',
    targetId: 'SYSTEM',
    targetType: 'SYSTEM',
    metadata: result,
  });

  return result;
}

/**
 * Get data rights requests for a user
 */
export async function getUserDataRightsRequests(
  userId: string
): Promise<DataRightsRequest[]> {
  const snapshot = await db
    .collection('dataRightsRequests')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => doc.data() as DataRightsRequest);
}

/**
 * Get a specific data rights request
 */
export async function getDataRightsRequest(
  requestId: string
): Promise<DataRightsRequest | null> {
  const doc = await db.collection('dataRightsRequests').doc(requestId).get();
  
  if (!doc.exists) {
    return null;
  }

  return doc.data() as DataRightsRequest;
}

/**
 * Trigger export generation (async job)
 * This should be called after startProcessingRequest for EXPORT requests
 */
export async function triggerExportGeneration(
  requestId: string
): Promise<void> {
  const request = await getDataRightsRequest(requestId);
  
  if (!request) {
    throw new DataRightsError(
      DataRightsErrorCode.REQUEST_NOT_FOUND,
      `Request ${requestId} not found`
    );
  }

  if (request.type !== DataRequestType.EXPORT) {
    throw new DataRightsError(
      DataRightsErrorCode.INVALID_STATUS_TRANSITION,
      'Can only trigger export for EXPORT requests'
    );
  }

  try {
    // Generate export (this may be a long-running operation)
    const exportResult = await generateUserDataExport(request.userId);
    
    // Generate signed URL for download
    // TODO: Implement signed URL generation with Firebase Storage
    const downloadUrl = `https://storage.googleapis.com/avalo-exports/${exportResult.storagePath}`;
    
    // Complete the request
    await completeExportRequest(
      requestId,
      downloadUrl,
      request.processedByAdminId || 'SYSTEM'
    );
  } catch (error) {
    console.error(`Failed to generate export for request ${requestId}:`, error);
    
    // Mark request as rejected with error
    await rejectRequest(
      requestId,
      `Export generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'SYSTEM'
    );
    
    throw error;
  }
}
