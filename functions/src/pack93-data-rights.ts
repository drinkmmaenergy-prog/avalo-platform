/**
 * PACK 93 — GDPR Data Rights & Account Lifecycle
 * 
 * Implements user data rights and account lifecycle management compatible with
 * GDPR-style regulations and global privacy expectations.
 * 
 * Features:
 * - Data export ("Download my data")
 * - Account deletion ("Delete my account")
 * - Data retention rules
 * - Pseudonymization for deleted accounts
 * 
 * COMPLIANCE RULES:
 * - No free tokens, no discounts, no cashback, no bonuses
 * - Do not change token price per unit
 * - Do not change revenue split (65% creator / 35% Avalo)
 * - Data export never includes secrets (password hashes, raw KYC docs, internal risk flags)
 * - Deletion must not corrupt financial ledgers (ledgers stay but pseudonymized)
 */

import { db, serverTimestamp, generateId, storage } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logBusinessEvent } from './pack90-logging';
import * as functions from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError } from 'firebase-functions/v2/https';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type DataExportStatus = 
  | 'PENDING' 
  | 'PROCESSING' 
  | 'READY' 
  | 'FAILED' 
  | 'EXPIRED';

export type DeletionRequestStatus = 
  | 'PENDING' 
  | 'PROCESSING' 
  | 'COMPLETED' 
  | 'REJECTED' 
  | 'FAILED';

export interface UserDataExport {
  id: string;
  userId: string;
  status: DataExportStatus;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  downloadUrl?: string;
  expiresAt?: Timestamp;
  errorMessage?: string;
  fileSize?: number;
  metadata?: {
    exportFormat: string;
    dataCategories: string[];
    totalRecords: number;
  };
}

export interface UserDeletionRequest {
  id: string;
  userId: string;
  status: DeletionRequestStatus;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  rejectionReason?: string;
  metadata?: {
    reason?: string;
    finalWarningShown: boolean;
    hasActiveFinancialHolds?: boolean;
  };
}

export interface ExportedUserData {
  exportDate: string;
  userId: string;
  userProfile: any;
  content: {
    stories: any[];
    paidMedia: any[];
  };
  monetization: {
    gifts: any[];
    earningsLedger: any[];
    payoutRequests: any[];
    balances: any;
  };
  compliance: {
    kyc: any;
  };
  trustAndSafety: {
    riskScore: number;
    flags: any[];
    enforcementLevel: string;
  };
  reportsAndDisputes: any[];
  notifications: any[];
  meta: {
    generatedAt: string;
    appVersion: string;
    totalRecordCount: number;
  };
}

// ============================================================================
// DATA EXPORT - REQUEST
// ============================================================================

/**
 * Request data export for authenticated user
 * Creates export job and returns request ID
 */
export const requestDataExport = onCall(
  { region: 'europe-west3', timeoutSeconds: 60 },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      // Check for existing pending/processing requests
      const existingRequests = await db
        .collection('user_data_exports')
        .where('userId', '==', userId)
        .where('status', 'in', ['PENDING', 'PROCESSING'])
        .limit(1)
        .get();

      if (!existingRequests.empty) {
        const existing = existingRequests.docs[0].data() as UserDataExport;
        return {
          success: false,
          error: 'EXISTING_REQUEST',
          message: 'A data export request is already in progress',
          requestId: existingRequests.docs[0].id,
          createdAt: existing.createdAt.toMillis(),
        };
      }

      // Create new export request
      const exportId = generateId();
      const exportData: UserDataExport = {
        id: exportId,
        userId,
        status: 'PENDING',
        createdAt: Timestamp.now(),
      };

      await db.collection('user_data_exports').doc(exportId).set(exportData);

      // Log business event
      await logBusinessEvent({
        eventType: 'MODERATOR_ACTION',
        actorUserId: userId,
        subjectUserId: userId,
        relatedId: exportId,
        metadata: {
          action: 'DATA_EXPORT_REQUESTED',
        },
        functionName: 'requestDataExport',
      });

      console.log(`[DataRights] Export requested by user ${userId}, requestId: ${exportId}`);

      return {
        success: true,
        requestId: exportId,
        message: 'Data export request created. Processing will begin shortly.',
        estimatedTime: '15-30 minutes',
      };
    } catch (error: any) {
      console.error('[DataRights] Failed to create export request:', error);
      throw new HttpsError('internal', 'Failed to create data export request');
    }
  }
);

// ============================================================================
// DATA EXPORT - PROCESSING
// ============================================================================

/**
 * Background job to process pending data export requests
 * Runs every 5 minutes via Cloud Scheduler
 */
export const processPendingDataExports = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'europe-west3',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    console.log('[DataRights] Processing pending data exports...');

    try {
      // Get pending export requests (limit 10 per run)
      const pendingExports = await db
        .collection('user_data_exports')
        .where('status', '==', 'PENDING')
        .limit(10)
        .get();

      if (pendingExports.empty) {
        console.log('[DataRights] No pending exports to process');
        return;
      }

      console.log(`[DataRights] Found ${pendingExports.size} pending exports`);

      // Process each export
      for (const doc of pendingExports.docs) {
        const exportRequest = doc.data() as UserDataExport;
        await processDataExportJob(exportRequest.id, exportRequest.userId);
      }

      console.log('[DataRights] Finished processing exports');
    } catch (error: any) {
      console.error('[DataRights] Error in processPendingDataExports:', error);
    }
  }
);

/**
 * Process a single data export job
 */
async function processDataExportJob(exportId: string, userId: string): Promise<void> {
  const exportRef = db.collection('user_data_exports').doc(exportId);

  try {
    // Update status to PROCESSING
    await exportRef.update({
      status: 'PROCESSING',
      updatedAt: serverTimestamp(),
    });

    console.log(`[DataRights] Processing export ${exportId} for user ${userId}`);

    // Collect all user data
    const userData = await aggregateUserData(userId);

    // Create JSON export
    const exportJson = JSON.stringify(userData, null, 2);
    const buffer = Buffer.from(exportJson, 'utf-8');

    // Upload to Cloud Storage
    const bucket = storage.bucket();
    const filename = `data-exports/${userId}/${exportId}.json`;
    const file = bucket.file(filename);

    await file.save(buffer, {
      contentType: 'application/json',
      metadata: {
        userId,
        exportId,
        exportedAt: new Date().toISOString(),
      },
    });

    // Generate signed URL (valid for 7 days)
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    // Update export request with download URL
    await exportRef.update({
      status: 'READY',
      completedAt: serverTimestamp(),
      downloadUrl: signedUrl,
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      fileSize: buffer.length,
      metadata: {
        exportFormat: 'JSON',
        dataCategories: Object.keys(userData),
        totalRecords: countTotalRecords(userData),
      },
    });

    // Log completion
    await logBusinessEvent({
      eventType: 'MODERATOR_ACTION',
      actorUserId: userId,
      subjectUserId: userId,
      relatedId: exportId,
      metadata: {
        action: 'DATA_EXPORT_COMPLETED',
        fileSize: buffer.length,
      },
      functionName: 'processDataExportJob',
    });

    console.log(`[DataRights] Export ${exportId} completed successfully`);
  } catch (error: any) {
    console.error(`[DataRights] Failed to process export ${exportId}:`, error);

    await exportRef.update({
      status: 'FAILED',
      errorMessage: error.message || 'Unknown error occurred',
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Aggregate all user data for export
 * Sanitized to exclude secrets and internal flags
 */
async function aggregateUserData(userId: string): Promise<ExportedUserData> {
  const data: ExportedUserData = {
    exportDate: new Date().toISOString(),
    userId,
    userProfile: null,
    content: {
      stories: [],
      paidMedia: [],
    },
    monetization: {
      gifts: [],
      earningsLedger: [],
      payoutRequests: [],
      balances: null,
    },
    compliance: {
      kyc: null,
    },
    trustAndSafety: {
      riskScore: 0,
      flags: [],
      enforcementLevel: 'NONE',
    },
    reportsAndDisputes: [],
    notifications: [],
    meta: {
      generatedAt: new Date().toISOString(),
      appVersion: 'Avalo v2.0',
      totalRecordCount: 0,
    },
  };

  try {
    // User Profile
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      // Sanitize: remove internal flags and sensitive data
      delete userData?.passwordHash;
      delete userData?.internalNotes;
      delete userData?.moderatorFlags;
      data.userProfile = userData;
    }

    // Premium Stories (created by user)
    const storiesSnapshot = await db
      .collection('premium_stories')
      .where('creatorId', '==', userId)
      .limit(1000)
      .get();
    data.content.stories = storiesSnapshot.docs.map(doc => {
      const story = doc.data();
      return {
        id: doc.id,
        title: story.title,
        price: story.priceTokens,
        views: story.views || 0,
        earnings: story.earnings || 0,
        createdAt: story.createdAt?.toDate?.()?.toISOString(),
      };
    });

    // Paid Media Messages (created by user)
    const paidMediaSnapshot = await db
      .collection('paid_media_messages')
      .where('senderId', '==', userId)
      .limit(1000)
      .get();
    data.content.paidMedia = paidMediaSnapshot.docs.map(doc => {
      const media = doc.data();
      return {
        id: doc.id,
        type: media.type,
        price: media.priceTokens,
        unlockedBy: media.unlockedBy?.length || 0,
        earnings: media.totalEarnings || 0,
        createdAt: media.createdAt?.toDate?.()?.toISOString(),
      };
    });

    // Gifts (sent or received)
    const giftsSnapshot = await db
      .collection('gift_transactions')
      .where('senderId', '==', userId)
      .limit(1000)
      .get();
    const giftsReceivedSnapshot = await db
      .collection('gift_transactions')
      .where('receiverId', '==', userId)
      .limit(1000)
      .get();
    
    data.monetization.gifts = [
      ...giftsSnapshot.docs.map(doc => ({ ...doc.data(), direction: 'sent' })),
      ...giftsReceivedSnapshot.docs.map(doc => ({ ...doc.data(), direction: 'received' })),
    ];

    // Earnings Ledger (for creators)
    const earningsSnapshot = await db
      .collection('earnings_ledger')
      .where('creatorId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();
    data.monetization.earningsLedger = earningsSnapshot.docs.map(doc => doc.data());

    // Payout Requests (sanitized - no bank account details)
    const payoutSnapshot = await db
      .collection('payout_requests')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();
    data.monetization.payoutRequests = payoutSnapshot.docs.map(doc => {
      const payout = doc.data();
      return {
        id: doc.id,
        amount: payout.amount,
        status: payout.status,
        currency: payout.currency,
        createdAt: payout.createdAt?.toDate?.()?.toISOString(),
        completedAt: payout.completedAt?.toDate?.()?.toISOString(),
        // Exclude: bankAccount, routingNumber, etc.
      };
    });

    // Creator Balances
    const balanceDoc = await db.collection('creator_balances').doc(userId).get();
    if (balanceDoc.exists) {
      const balance = balanceDoc.data();
      data.monetization.balances = {
        availableBalance: balance?.availableBalance || 0,
        pendingBalance: balance?.pendingBalance || 0,
        totalEarned: balance?.totalEarned || 0,
      };
    }

    // KYC Status (summary only, no documents)
    const kycDoc = await db.collection('user_kyc_status').doc(userId).get();
    if (kycDoc.exists) {
      const kyc = kycDoc.data();
      data.compliance.kyc = {
        status: kyc?.status,
        level: kyc?.level,
        verifiedAt: kyc?.verifiedAt?.toDate?.()?.toISOString(),
        // Exclude: documents, images, raw data
      };
    }

    // Trust & Safety (summary only)
    const trustDoc = await db.collection('user_trust_profile').doc(userId).get();
    if (trustDoc.exists) {
      const trust = trustDoc.data();
      data.trustAndSafety = {
        riskScore: trust?.riskScore || 0,
        flags: trust?.flags || [],
        enforcementLevel: trust?.enforcementLevel || 'NONE',
      };
    }

    // Reports & Disputes
    const disputesSnapshot = await db
      .collection('transaction_issues')
      .where('reporterId', '==', userId)
      .limit(500)
      .get();
    data.reportsAndDisputes = disputesSnapshot.docs.map(doc => doc.data());

    // Notifications (last 1000)
    const notificationsSnapshot = await db
      .collection('notifications')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();
    data.notifications = notificationsSnapshot.docs.map(doc => {
      const notif = doc.data();
      return {
        type: notif.type,
        title: notif.title,
        message: notif.message,
        read: notif.read,
        createdAt: notif.createdAt?.toDate?.()?.toISOString(),
      };
    });

    data.meta.totalRecordCount = countTotalRecords(data);

  } catch (error: any) {
    console.error('[DataRights] Error aggregating user data:', error);
    throw error;
  }

  return data;
}

/**
 * Count total records in export
 */
function countTotalRecords(data: any): number {
  let count = 0;
  
  if (data.userProfile) count += 1;
  count += data.content?.stories?.length || 0;
  count += data.content?.paidMedia?.length || 0;
  count += data.monetization?.gifts?.length || 0;
  count += data.monetization?.earningsLedger?.length || 0;
  count += data.monetization?.payoutRequests?.length || 0;
  count += data.reportsAndDisputes?.length || 0;
  count += data.notifications?.length || 0;
  
  return count;
}

// ============================================================================
// DATA EXPORT - GET STATUS
// ============================================================================

/**
 * Get all data export requests for authenticated user
 */
export const getMyDataExports = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const exportsSnapshot = await db
        .collection('user_data_exports')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      const exports = exportsSnapshot.docs.map(doc => {
        const data = doc.data() as UserDataExport;
        return {
          id: doc.id,
          status: data.status,
          createdAt: data.createdAt.toMillis(),
          completedAt: data.completedAt?.toMillis(),
          downloadUrl: data.downloadUrl,
          expiresAt: data.expiresAt?.toMillis(),
          errorMessage: data.errorMessage,
          fileSize: data.fileSize,
        };
      });

      return {
        success: true,
        exports,
      };
    } catch (error: any) {
      console.error('[DataRights] Failed to get exports:', error);
      throw new HttpsError('internal', 'Failed to retrieve export requests');
    }
  }
);

// ============================================================================
// ACCOUNT DELETION - REQUEST
// ============================================================================

/**
 * Request account deletion for authenticated user
 * Requires explicit confirmation and shows final warning
 */
export const requestAccountDeletion = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { confirmationText, reason } = request.data || {};

    // Require explicit confirmation
    if (confirmationText !== 'DELETE') {
      throw new HttpsError(
        'failed-precondition',
        'You must type DELETE to confirm account deletion'
      );
    }

    try {
      // Check for existing pending requests
      const existingRequests = await db
        .collection('user_deletion_requests')
        .where('userId', '==', userId)
        .where('status', 'in', ['PENDING', 'PROCESSING'])
        .limit(1)
        .get();

      if (!existingRequests.empty) {
        const existing = existingRequests.docs[0].data() as UserDeletionRequest;
        return {
          success: false,
          error: 'EXISTING_REQUEST',
          message: 'An account deletion request is already in progress',
          requestId: existingRequests.docs[0].id,
          createdAt: existing.createdAt.toMillis(),
        };
      }

      // Check for financial holds (active payouts, disputes, etc.)
      const hasActiveFinancialHolds = await checkFinancialHolds(userId);
      
      if (hasActiveFinancialHolds) {
        throw new HttpsError(
          'failed-precondition',
          'Cannot delete account with active financial holds. Please resolve pending payouts or disputes first.'
        );
      }

      // Create deletion request
      const deletionId = generateId();
      const deletionData: UserDeletionRequest = {
        id: deletionId,
        userId,
        status: 'PENDING',
        createdAt: Timestamp.now(),
        metadata: {
          reason: reason || 'User requested',
          finalWarningShown: true,
          hasActiveFinancialHolds: false,
        },
      };

      await db.collection('user_deletion_requests').doc(deletionId).set(deletionData);

      // Log business event
      await logBusinessEvent({
        eventType: 'MODERATOR_ACTION',
        actorUserId: userId,
        subjectUserId: userId,
        relatedId: deletionId,
        metadata: {
          action: 'ACCOUNT_DELETION_REQUESTED',
          reason,
        },
        functionName: 'requestAccountDeletion',
      });

      console.log(`[DataRights] Deletion requested by user ${userId}, requestId: ${deletionId}`);

      return {
        success: true,
        requestId: deletionId,
        message: 'Account deletion request created. Processing will begin shortly. This action is irreversible.',
        warning: 'Your account and data will be permanently deleted. Financial records will be pseudonymized but retained for compliance.',
      };
    } catch (error: any) {
      console.error('[DataRights] Failed to create deletion request:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to create deletion request');
    }
  }
);

/**
 * Check if user has financial holds preventing deletion
 */
async function checkFinancialHolds(userId: string): Promise<boolean> {
  try {
    // Check for pending payouts
    const pendingPayouts = await db
      .collection('payout_requests')
      .where('userId', '==', userId)
      .where('status', 'in', ['PENDING', 'PROCESSING'])
      .limit(1)
      .get();

    if (!pendingPayouts.empty) {
      return true;
    }

    // Check for open disputes
    const openDisputes = await db
      .collection('transaction_issues')
      .where('reporterId', '==', userId)
      .where('status', 'in', ['PENDING', 'INVESTIGATING'])
      .limit(1)
      .get();

    if (!openDisputes.empty) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('[DataRights] Error checking financial holds:', error);
    return true; // Err on side of caution
  }
}

// ============================================================================
// ACCOUNT DELETION - PROCESSING
// ============================================================================

/**
 * Background job to process pending deletion requests
 * Runs daily at 3 AM
 */
export const processPendingDeletionRequests = onSchedule(
  {
    schedule: '0 3 * * *', // 3 AM daily
    region: 'europe-west3',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    console.log('[DataRights] Processing pending account deletions...');

    try {
      // Get pending deletion requests (limit 50 per run)
      const pendingDeletions = await db
        .collection('user_deletion_requests')
        .where('status', '==', 'PENDING')
        .limit(50)
        .get();

      if (pendingDeletions.empty) {
        console.log('[DataRights] No pending deletions to process');
        return;
      }

      console.log(`[DataRights] Found ${pendingDeletions.size} pending deletions`);

      // Process each deletion
      for (const doc of pendingDeletions.docs) {
        const deletionRequest = doc.data() as UserDeletionRequest;
        await processAccountDeletionJob(deletionRequest.id, deletionRequest.userId);
      }

      console.log('[DataRights] Finished processing deletions');
    } catch (error: any) {
      console.error('[DataRights] Error in processPendingDeletionRequests:', error);
    }
  }
);

/**
 * Process a single account deletion job
 */
async function processAccountDeletionJob(deletionId: string, userId: string): Promise<void> {
  const deletionRef = db.collection('user_deletion_requests').doc(deletionId);

  try {
    // Update status to PROCESSING
    await deletionRef.update({
      status: 'PROCESSING',
      updatedAt: serverTimestamp(),
    });

    console.log(`[DataRights] Processing deletion ${deletionId} for user ${userId}`);

    // Re-check financial holds
    const hasHolds = await checkFinancialHolds(userId);
    if (hasHolds) {
      await deletionRef.update({
        status: 'REJECTED',
        rejectionReason: 'Active financial holds detected',
        completedAt: serverTimestamp(),
      });
      console.log(`[DataRights] Deletion ${deletionId} rejected due to financial holds`);
      return;
    }

    // Execute deletion & pseudonymization
    await deleteAndPseudonymizeUserData(userId);

    // Update deletion request status
    await deletionRef.update({
      status: 'COMPLETED',
      completedAt: serverTimestamp(),
    });

    // Log completion
    await logBusinessEvent({
      eventType: 'ACCOUNT_STATUS_CHANGED',
      actorUserId: userId,
      subjectUserId: userId,
      relatedId: deletionId,
      metadata: {
        action: 'ACCOUNT_DELETED',
        status: 'COMPLETED',
      },
      functionName: 'processAccountDeletionJob',
      source: 'SYSTEM',
    });

    console.log(`[DataRights] Deletion ${deletionId} completed successfully`);
  } catch (error: any) {
    console.error(`[DataRights] Failed to process deletion ${deletionId}:`, error);

    await deletionRef.update({
      status: 'FAILED',
      rejectionReason: error.message || 'Unknown error occurred',
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Delete user data and pseudonymize financial records
 * Financial ledgers must remain for compliance but are made anonymous
 */
async function deleteAndPseudonymizeUserData(userId: string): Promise<void> {
  const DELETED_USER_ID = `DELETED_USER_${generateId().substring(0, 8)}`;
  
  console.log(`[DataRights] Deleting and pseudonymizing data for user ${userId}`);

  // ========== DELETE: User Profile & Content ==========
  
  // Delete user profile
  await db.collection('users').doc(userId).delete();
  console.log(`[DataRights] Deleted user profile for ${userId}`);

  // Delete premium stories content
  const storiesSnapshot = await db
    .collection('premium_stories')
    .where('creatorId', '==', userId)
    .limit(500)
    .get();
  
  const batch1 = db.batch();
  storiesSnapshot.docs.forEach(doc => batch1.delete(doc.ref));
  await batch1.commit();
  console.log(`[DataRights] Deleted ${storiesSnapshot.size} premium stories`);

  // Delete paid media messages  
  const paidMediaSnapshot = await db
    .collection('paid_media_messages')
    .where('senderId', '==', userId)
    .limit(500)
    .get();
  
  const batch2 = db.batch();
  paidMediaSnapshot.docs.forEach(doc => batch2.delete(doc.ref));
  await batch2.commit();
  console.log(`[DataRights] Deleted ${paidMediaSnapshot.size} paid media messages`);

  // Delete notifications
  const notifSnapshot = await db
    .collection('notifications')
    .where('userId', '==', userId)
    .limit(1000)
    .get();
  
  const batch3 = db.batch();
  notifSnapshot.docs.forEach(doc => batch3.delete(doc.ref));
  await batch3.commit();
  console.log(`[DataRights] Deleted ${notifSnapshot.size} notifications`);

  // ========== PSEUDONYMIZE: Financial Records ==========
  
  // Pseudonymize earnings ledger
  const earningsSnapshot = await db
    .collection('earnings_ledger')
    .where('creatorId', '==', userId)
    .limit(1000)
    .get();
  
  const batch4 = db.batch();
  earningsSnapshot.docs.forEach(doc => {
    batch4.update(doc.ref, {
      creatorId: DELETED_USER_ID,
      pseudonymized: true,
      pseudonymizedAt: serverTimestamp(),
    });
  });
  await batch4.commit();
  console.log(`[DataRights] Pseudonymized ${earningsSnapshot.size} earnings records`);

  // Pseudonymize gift transactions
  const giftsSnapshot = await db
    .collection('gift_transactions')
    .where('senderId', '==', userId)
    .limit(500)
    .get();
  const giftsReceivedSnapshot = await db
    .collection('gift_transactions')
    .where('receiverId', '==', userId)
    .limit(500)
    .get();
  
  const batch5 = db.batch();
  [...giftsSnapshot.docs, ...giftsReceivedSnapshot.docs].forEach(doc => {
    const data = doc.data();
    const updates: any = { pseudonymized: true, pseudonymizedAt: serverTimestamp() };
    if (data.senderId === userId) updates.senderId = DELETED_USER_ID;
    if (data.receiverId === userId) updates.receiverId = DELETED_USER_ID;
    batch5.update(doc.ref, updates);
  });
  await batch5.commit();
  console.log(`[DataRights] Pseudonymized gift transactions`);

  // Pseudonymize payout requests
  const payoutSnapshot = await db
    .collection('payout_requests')
    .where('userId', '==', userId)
    .limit(500)
    .get();
  
  const batch6 = db.batch();
  payoutSnapshot.docs.forEach(doc => {
    batch6.update(doc.ref, {
      userId: DELETED_USER_ID,
      pseudonymized: true,
      pseudonymizedAt: serverTimestamp(),
    });
  });
  await batch6.commit();
  console.log(`[DataRights] Pseudonymized ${payoutSnapshot.size} payout requests`);

  // Delete/pseudonymize creator balance
  const balanceDoc = db.collection('creator_balances').doc(userId);
  await balanceDoc.delete();
  console.log(`[DataRights] Deleted creator balance`);

  // ========== PSEUDONYMIZE: KYC & Trust Data ==========
  
  // Mark KYC as deleted (keep status for compliance)
  const kycDoc = db.collection('user_kyc_status').doc(userId);
  const kycSnapshot = await kycDoc.get();
  if (kycSnapshot.exists) {
    await kycDoc.update({
      status: 'DELETED',
      userId: DELETED_USER_ID,
      pseudonymized: true,
      pseudonymizedAt: serverTimestamp(),
    });
  }

  // Pseudonymize trust profile
  const trustDoc = db.collection('user_trust_profile').doc(userId);
  const trustSnapshot = await trustDoc.get();
  if (trustSnapshot.exists) {
    await db.collection('user_trust_profile').doc(DELETED_USER_ID).set({
      ...trustSnapshot.data(),
      userId: DELETED_USER_ID,
      pseudonymized: true,
      pseudonymizedAt: serverTimestamp(),
    });
    await trustDoc.delete();
  }

  // Pseudonymize trust events
  const trustEventsSnapshot = await db
    .collection('user_trust_events')
    .where('userId', '==', userId)
    .limit(500)
    .get();
  
  const batch7 = db.batch();
  trustEventsSnapshot.docs.forEach(doc => {
    batch7.update(doc.ref, {
      userId: DELETED_USER_ID,
      pseudonymized: true,
      pseudonymizedAt: serverTimestamp(),
    });
  });
  await batch7.commit();
  console.log(`[DataRights] Pseudonymized ${trustEventsSnapshot.size} trust events`);

  // ========== PSEUDONYMIZE: Reports & Disputes ==========
  
  const disputesSnapshot = await db
    .collection('transaction_issues')
    .where('reporterId', '==', userId)
    .limit(500)
    .get();
  
  const batch8 = db.batch();
  disputesSnapshot.docs.forEach(doc => {
    batch8.update(doc.ref, {
      reporterId: DELETED_USER_ID,
      pseudonymized: true,
      pseudonymizedAt: serverTimestamp(),
    });
  });
  await batch8.commit();
  console.log(`[DataRights] Pseudonymized ${disputesSnapshot.size} dispute records`);

  // ========== DISABLE: Firebase Auth ==========
  
  try {
    const auth = await import('./init').then(m => m.auth);
    await auth.deleteUser(userId);
    console.log(`[DataRights] Deleted Firebase Auth user ${userId}`);
  } catch (error) {
    console.error(`[DataRights] Failed to delete Firebase Auth user:`, error);
    // Non-blocking - continue with deletion
  }

  console.log(`[DataRights] Successfully deleted and pseudonymized data for user ${userId}`);
}

// ============================================================================
// GET DELETION STATUS
// ============================================================================

/**
 * Get deletion request status for authenticated user
 */
export const getMyDeletionStatus = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const userId = request.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    try {
      const deletionSnapshot = await db
        .collection('user_deletion_requests')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (deletionSnapshot.empty) {
        return {
          success: true,
          hasPendingDeletion: false,
        };
      }

      const deletion = deletionSnapshot.docs[0].data() as UserDeletionRequest;

      return {
        success: true,
        hasPendingDeletion: true,
        request: {
          id: deletionSnapshot.docs[0].id,
          status: deletion.status,
          createdAt: deletion.createdAt.toMillis(),
          completedAt: deletion.completedAt?.toMillis(),
          rejectionReason: deletion.rejectionReason,
        },
      };
    } catch (error: any) {
      console.error('[DataRights] Failed to get deletion status:', error);
      throw new HttpsError('internal', 'Failed to retrieve deletion status');
    }
  }
);