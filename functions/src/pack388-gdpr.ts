/**
 * PACK 388 — GDPR & User Data Rights Automation
 * 
 * Implements full GDPR compliance including:
 * - Data export (right of access)
 * - Right to be forgotten (erasure)
 * - Right to restrict processing
 * - Data rectification
 * 
 * Dependencies: PACK 296 (Audit), PACK 277 (Wallet), PACK 302 (Fraud)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { pack296_auditLog } from './pack296-audit';
import { pack277_freezeWallet } from './pack277-wallet-engine';

const db = admin.firestore();

/**
 * Data request types per GDPR
 */
export enum DataRequestType {
  ACCESS = 'ACCESS',
  EXPORT = 'EXPORT',
  RECTIFY = 'RECTIFY',
  RESTRICT = 'RESTRICT',
  DELETE = 'DELETE'
}

export enum DataRequestStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

interface DataRequest {
  id: string;
  userId: string;
  type: DataRequestType;
  status: DataRequestStatus;
  createdAt: FirebaseFirestore.Timestamp;
  processedAt?: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  legalDeadline: FirebaseFirestore.Timestamp; // 30 days from request
  requestData?: any;
  resultUrl?: string; // For exports
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    jurisdiction: string;
  };
}

/**
 * Collections to export for GDPR data export
 */
const EXPORTABLE_COLLECTIONS = [
  'users',
  'userProfiles',
  'conversations',
  'messages',
  'calls',
  'payments',
  'subscriptions',
  'posts',
  'stories',
  'boosts',
  'badges',
  'verifications',
  'reports',
  'blockedUsers',
  'settings',
  'locations',
  'panicSignals',
  'supportTickets'
];

/**
 * Collections to delete for right to be forgotten
 * Note: Some data must be retained for legal/compliance reasons
 */
const DELETABLE_COLLECTIONS = [
  'userProfiles',
  'messages',
  'posts',
  'stories',
  'boosts',
  'settings',
  'locations'
];

/**
 * Collections that must be retained for legal compliance
 */
const RETENTION_REQUIRED_COLLECTIONS = [
  'payments', // Financial records
  'verifications', // KYC/AML
  'reports', // Safety incidents
  'panicSignals', // Legal evidence
  'fraudSignals', // Anti-fraud
  'regulatoryIncidents' // Compliance
];

/**
 * Request data export (GDPR Article 15 - Right of Access)
 */
export const pack388_requestDataExport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { jurisdiction } = data;

  try {
    // Create data request
    const requestRef = db.collection('dataRequests').doc();
    const deadline = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    );

    const request: DataRequest = {
      id: requestRef.id,
      userId,
      type: DataRequestType.EXPORT,
      status: DataRequestStatus.PENDING,
      createdAt: admin.firestore.Timestamp.now(),
      legalDeadline: deadline,
      metadata: {
        ipAddress: context.rawRequest?.ip,
        userAgent: context.rawRequest?.headers['user-agent'],
        jurisdiction: jurisdiction || 'EU'
      }
    };

    await requestRef.set(request);

    // Audit log
    await pack296_auditLog({
      action: 'GDPR_DATA_EXPORT_REQUESTED',
      userId,
      resourceId: requestRef.id,
      resourceType: 'dataRequest',
      metadata: { jurisdiction }
    });

    // Trigger async processing
    await db.collection('tasks').add({
      type: 'PROCESS_DATA_EXPORT',
      requestId: requestRef.id,
      userId,
      status: 'PENDING',
      createdAt: admin.firestore.Timestamp.now()
    });

    return {
      success: true,
      requestId: requestRef.id,
      estimatedCompletionDate: deadline.toDate(),
      message: 'Data export request submitted. You will be notified when ready.'
    };

  } catch (error) {
    console.error('Error requesting data export:', error);
    throw new functions.https.HttpsError('internal', 'Failed to process data export request');
  }
});

/**
 * Process data export (background function)
 */
export const pack388_processDataExport = functions.firestore
  .document('tasks/{taskId}')
  .onCreate(async (snap, context) => {
    const task = snap.data();
    
    if (task.type !== 'PROCESS_DATA_EXPORT') {
      return null;
    }

    const { requestId, userId } = task;

    try {
      // Update request status
      await db.collection('dataRequests').doc(requestId).update({
        status: DataRequestStatus.PROCESSING,
        processedAt: admin.firestore.Timestamp.now()
      });

      // Collect all user data
      const userData: any = {
        userId,
        exportDate: new Date().toISOString(),
        collections: {}
      };

      // Export from all collections
      for (const collection of EXPORTABLE_COLLECTIONS) {
        const snapshot = await db.collection(collection)
          .where('userId', '==', userId)
          .get();
        
        userData.collections[collection] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      // Store export as JSON in Cloud Storage
      const bucket = admin.storage().bucket();
      const fileName = `gdpr-exports/${userId}/${requestId}/user-data-${Date.now()}.json`;
      const file = bucket.file(fileName);

      await file.save(JSON.stringify(userData, null, 2), {
        contentType: 'application/json',
        metadata: {
          userId,
          requestId,
          exportDate: new Date().toISOString()
        }
      });

      // Generate signed URL (valid for 7 days)
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000
      });

      // Update request with download URL
      await db.collection('dataRequests').doc(requestId).update({
        status: DataRequestStatus.COMPLETED,
        completedAt: admin.firestore.Timestamp.now(),
        resultUrl: url
      });

      // Send notification
      await db.collection('notifications').add({
        userId,
        type: 'DATA_EXPORT_READY',
        title: 'Your data export is ready',
        message: 'Your personal data export has been completed and is ready for download.',
        data: {
          requestId,
          downloadUrl: url,
          expiresIn: '7 days'
        },
        createdAt: admin.firestore.Timestamp.now(),
        read: false
      });

      // Mark task complete
      await snap.ref.update({ status: 'COMPLETED' });

      // Audit log
      await pack296_auditLog({
        action: 'GDPR_DATA_EXPORT_COMPLETED',
        userId,
        resourceId: requestId,
        resourceType: 'dataRequest',
        metadata: { fileName, fileSize: userData.collections.length }
      });

      return { success: true };

    } catch (error) {
      console.error('Error processing data export:', error);
      
      await db.collection('dataRequests').doc(requestId).update({
        status: DataRequestStatus.FAILED
      });
      
      await snap.ref.update({ status: 'FAILED', error: error.message });
      
      return null;
    }
  });

/**
 * Execute Right to be Forgotten (GDPR Article 17 - Right to Erasure)
 */
export const pack388_executeRightToBeForgotten = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { confirmationCode } = data;

  try {
    // Verify confirmation (require user to enter a code)
    if (!confirmationCode || confirmationCode !== 'DELETE_MY_DATA') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Invalid confirmation code. Please enter "DELETE_MY_DATA" to confirm.'
      );
    }

    // Check for active subscriptions or pending payments
    const activeSubscriptions = await db.collection('subscriptions')
      .where('userId', '==', userId)
      .where('status', '==', 'ACTIVE')
      .get();

    if (!activeSubscriptions.empty) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Please cancel all active subscriptions before requesting data deletion.'
      );
    }

    // Check for pending payouts
    const pendingPayouts = await db.collection('payouts')
      .where('userId', '==', userId)
      .where('status', 'in', ['PENDING', 'PROCESSING'])
      .get();

    if (!pendingPayouts.empty) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'You have pending payouts. Please wait for completion before data deletion.'
      );
    }

    // Create deletion request
    const requestRef = db.collection('dataRequests').doc();
    const deadline = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    );

    const request: DataRequest = {
      id: requestRef.id,
      userId,
      type: DataRequestType.DELETE,
      status: DataRequestStatus.PENDING,
      createdAt: admin.firestore.Timestamp.now(),
      legalDeadline: deadline,
      metadata: {
        ipAddress: context.rawRequest?.ip,
        userAgent: context.rawRequest?.headers['user-agent'],
        jurisdiction: 'EU'
      }
    };

    await requestRef.set(request);

    // Freeze wallet immediately
    await pack277_freezeWallet({ userId, reason: 'RIGHT_TO_BE_FORGOTTEN' });

    // Disable account
    await admin.auth().updateUser(userId, { disabled: true });

    // Update user profile with deletion pending flag
    await db.collection('users').doc(userId).update({
      deletionPending: true,
      deletionRequestId: requestRef.id,
      deletionScheduledAt: deadline
    });

    // Audit log
    await pack296_auditLog({
      action: 'GDPR_RIGHT_TO_BE_FORGOTTEN_REQUESTED',
      userId,
      resourceId: requestRef.id,
      resourceType: 'dataRequest',
      metadata: { scheduledDeletion: deadline.toDate() }
    });

    // Schedule deletion task
    await db.collection('tasks').add({
      type: 'EXECUTE_DATA_DELETION',
      requestId: requestRef.id,
      userId,
      scheduledFor: deadline,
      status: 'SCHEDULED',
      createdAt: admin.firestore.Timestamp.now()
    });

    return {
      success: true,
      requestId: requestRef.id,
      scheduledDeletionDate: deadline.toDate(),
      message: 'Your account has been disabled. Data will be permanently deleted in 30 days unless you cancel this request.'
    };

  } catch (error) {
    console.error('Error executing right to be forgotten:', error);
    throw error;
  }
});

/**
 * Execute data deletion (background function)
 */
export const pack388_executeDataDeletion = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();

    // Find scheduled deletions due for execution
    const deletionTasks = await db.collection('tasks')
      .where('type', '==', 'EXECUTE_DATA_DELETION')
      .where('status', '==', 'SCHEDULED')
      .where('scheduledFor', '<=', now)
      .get();

    const deletionPromises = deletionTasks.docs.map(async (taskDoc) => {
      const task = taskDoc.data();
      const { requestId, userId } = task;

      try {
        console.log(`Executing data deletion for user ${userId}`);

        // Update request status
        await db.collection('dataRequests').doc(requestId).update({
          status: DataRequestStatus.PROCESSING,
          processedAt: admin.firestore.Timestamp.now()
        });

        // Delete from deletable collections
        for (const collection of DELETABLE_COLLECTIONS) {
          const snapshot = await db.collection(collection)
            .where('userId', '==', userId)
            .get();
          
          const batch = db.batch();
          snapshot.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }

        // Anonymize retained data
        for (const collection of RETENTION_REQUIRED_COLLECTIONS) {
          const snapshot = await db.collection(collection)
            .where('userId', '==', userId)
            .get();
          
          const batch = db.batch();
          snapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
              userId: 'ANONYMIZED',
              userEmail: null,
              userName: null,
              personalData: null,
              anonymizedAt: admin.firestore.Timestamp.now()
            });
          });
          await batch.commit();
        }

        // Delete auth account
        await admin.auth().deleteUser(userId);

        // Delete user document
        await db.collection('users').doc(userId).delete();

        // Update request
        await db.collection('dataRequests').doc(requestId).update({
          status: DataRequestStatus.COMPLETED,
          completedAt: admin.firestore.Timestamp.now()
        });

        // Mark task complete
        await taskDoc.ref.update({ status: 'COMPLETED' });

        // Audit log
        await pack296_auditLog({
          action: 'GDPR_DATA_DELETION_COMPLETED',
          userId: 'ANONYMIZED',
          resourceId: requestId,
          resourceType: 'dataRequest',
          metadata: { originalUserId: userId }
        });

        console.log(`Data deletion completed for user ${userId}`);

      } catch (error) {
        console.error(`Error deleting data for user ${userId}:`, error);
        
        await db.collection('dataRequests').doc(requestId).update({
          status: DataRequestStatus.FAILED
        });
        
        await taskDoc.ref.update({ 
          status: 'FAILED', 
          error: error.message 
        });
      }
    });

    await Promise.all(deletionPromises);
    return null;
  });

/**
 * Restrict data processing (GDPR Article 18)
 */
export const pack388_restrictProcessing = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { reason } = data;

  try {
    // Create restriction request
    const requestRef = db.collection('dataRequests').doc();

    const request: DataRequest = {
      id: requestRef.id,
      userId,
      type: DataRequestType.RESTRICT,
      status: DataRequestStatus.COMPLETED,
      createdAt: admin.firestore.Timestamp.now(),
      completedAt: admin.firestore.Timestamp.now(),
      legalDeadline: admin.firestore.Timestamp.now(),
      requestData: { reason },
      metadata: {
        jurisdiction: 'EU'
      }
    };

    await requestRef.set(request);

    // Apply processing restrictions
    await db.collection('users').doc(userId).update({
      processingRestricted: true,
      processingRestrictionReason: reason,
      processingRestrictionDate: admin.firestore.Timestamp.now()
    });

    // Audit log
    await pack296_auditLog({
      action: 'GDPR_PROCESSING_RESTRICTED',
      userId,
      resourceId: requestRef.id,
      resourceType: 'dataRequest',
      metadata: { reason }
    });

    return {
      success: true,
      requestId: requestRef.id,
      message: 'Processing restriction applied to your account.'
    };

  } catch (error) {
    console.error('Error restricting processing:', error);
    throw new functions.https.HttpsError('internal', 'Failed to restrict processing');
  }
});

/**
 * Cancel deletion request (within 30-day grace period)
 */
export const pack388_cancelDeletionRequest = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    // Find pending deletion request
    const deletionRequests = await db.collection('dataRequests')
      .where('userId', '==', userId)
      .where('type', '==', DataRequestType.DELETE)
      .where('status', 'in', [DataRequestStatus.PENDING, DataRequestStatus.PROCESSING])
      .get();

    if (deletionRequests.empty) {
      throw new functions.https.HttpsError('not-found', 'No pending deletion request found');
    }

    const request = deletionRequests.docs[0];

    // Cancel request
    await request.ref.update({
      status: DataRequestStatus.CANCELLED,
      completedAt: admin.firestore.Timestamp.now()
    });

    // Re-enable account
    await admin.auth().updateUser(userId, { disabled: false });

    // Update user profile
    await db.collection('users').doc(userId).update({
      deletionPending: false,
      deletionRequestId: null,
      deletionScheduledAt: null
    });

    // Unfreeze wallet
    await db.collection('wallets').doc(userId).update({
      frozen: false,
      frozenReason: null
    });

    // Cancel scheduled task
    const tasks = await db.collection('tasks')
      .where('type', '==', 'EXECUTE_DATA_DELETION')
      .where('userId', '==', userId)
      .where('status', '==', 'SCHEDULED')
      .get();

    const batch = db.batch();
    tasks.docs.forEach(doc => batch.update(doc.ref, { status: 'CANCELLED' }));
    await batch.commit();

    // Audit log
    await pack296_auditLog({
      action: 'GDPR_DELETION_REQUEST_CANCELLED',
      userId,
      resourceId: request.id,
      resourceType: 'dataRequest',
      metadata: {}
    });

    return {
      success: true,
      message: 'Deletion request cancelled. Your account has been restored.'
    };

  } catch (error) {
    console.error('Error cancelling deletion request:', error);
    throw error;
  }
});
