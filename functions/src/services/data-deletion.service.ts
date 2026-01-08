/**
 * PACK 155: Data Deletion Service
 * GDPR Article 17, CCPA §1798.105 - Right to Erasure
 */

import { db, auth, storage } from '../init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  DeletionStatus,
  PrivacyActionType,
  DELETION_FREEZE_PERIOD_DAYS,
  DataCategory,
  DeletionStep
} from '../types/data-retention.types';
import {
  COLLECTION_NAMES,
  DataDeletionRequestSchema
} from '../schemas/data-retention.schema';
import { 
  logPrivacyAction,
  hasActiveLegalHold
} from './data-retention.service';

/**
 * Request account deletion
 * GDPR Article 17 - Right to erasure ('right to be forgotten')
 * CCPA §1798.105 - Right to deletion
 */
export async function requestAccountDeletion(
  userId: string,
  userEmail: string,
  ipAddress: string,
  userAgent: string
): Promise<string> {
  const hasLegalHold = await hasActiveLegalHold(userId);

  if (hasLegalHold) {
    throw new Error('Account deletion is currently not available due to an ongoing legal hold. Please contact support for more information.');
  }

  const existingRequest = await db
    .collection(COLLECTION_NAMES.DATA_DELETION_REQUESTS)
    .where('userId', '==', userId)
    .where('status', 'in', [
      DeletionStatus.REQUESTED,
      DeletionStatus.ACCOUNT_FROZEN,
      DeletionStatus.PROCESSING
    ])
    .limit(1)
    .get();

  if (!existingRequest.empty) {
    const existing = existingRequest.docs[0].data() as DataDeletionRequestSchema;
    return existingRequest.docs[0].id;
  }

  const deletionSteps: DataDeletionRequestSchema['deletionSteps'] = [
    {
      step: 'freeze_account',
      description: 'Freeze account and prevent login',
      status: 'pending'
    },
    {
      step: 'delete_identity_docs',
      description: 'Delete identity verification documents',
      status: 'pending'
    },
    {
      step: 'delete_chats_messages',
      description: 'Delete chat and call history',
      status: 'pending'
    },
    {
      step: 'delete_ai_companion',
      description: 'Delete AI companion memory and history',
      status: 'pending'
    },
    {
      step: 'delete_media_content',
      description: 'Delete uploaded media and content',
      status: 'pending'
    },
    {
      step: 'anonymize_transactions',
      description: 'Anonymize financial transactions (legal requirement)',
      status: 'pending'
    },
    {
      step: 'delete_analytics',
      description: 'Delete analytics and tracking data',
      status: 'pending'
    },
    {
      step: 'delete_location_device',
      description: 'Delete location and device data',
      status: 'pending'
    },
    {
      step: 'delete_user_profile',
      description: 'Delete user profile and account',
      status: 'pending'
    }
  ];

  const deletionRequest: Omit<DataDeletionRequestSchema, 'id'> = {
    userId,
    userEmail,
    requestedAt: Timestamp.now(),
    status: DeletionStatus.REQUESTED,
    deletionSteps,
    ipAddress,
    userAgent
  };

  const docRef = await db.collection(COLLECTION_NAMES.DATA_DELETION_REQUESTS).add(deletionRequest);

  await logPrivacyAction(
    userId,
    PrivacyActionType.DATA_DELETION_REQUESTED,
    {
      deletionRequestId: docRef.id,
      freezePeriodDays: DELETION_FREEZE_PERIOD_DAYS
    },
    ipAddress,
    userAgent
  );

  processAccountDeletion(docRef.id).catch(error => {
    console.error(`Error processing deletion request ${docRef.id}:`, error);
  });

  return docRef.id;
}

/**
 * Process account deletion in background
 */
async function processAccountDeletion(deletionRequestId: string): Promise<void> {
  const requestRef = db.collection(COLLECTION_NAMES.DATA_DELETION_REQUESTS).doc(deletionRequestId);
  
  try {
    const requestDoc = await requestRef.get();
    
    if (!requestDoc.exists) {
      throw new Error('Deletion request not found');
    }

    const request = requestDoc.data() as DataDeletionRequestSchema;

    const hasLegalHold = await hasActiveLegalHold(request.userId);
    if (hasLegalHold) {
      await requestRef.update({
        status: DeletionStatus.LEGAL_HOLD,
        legalHoldReason: 'Active legal hold prevents account deletion'
      });
      return;
    }

    await freezeAccount(request.userId, requestRef);

    await requestRef.update({
      status: DeletionStatus.PROCESSING,
      processingStartedAt: Timestamp.now()
    });

    await executeStep(request.userId, requestRef, 'delete_identity_docs', deleteIdentityDocuments);
    await executeStep(request.userId, requestRef, 'delete_chats_messages', deleteChatsAndMessages);
    await executeStep(request.userId, requestRef, 'delete_ai_companion', deleteAICompanion);
    await executeStep(request.userId, requestRef, 'delete_media_content', deleteMediaContent);
    await executeStep(request.userId, requestRef, 'anonymize_transactions', anonymizeTransactions);
    await executeStep(request.userId, requestRef, 'delete_analytics', deleteAnalytics);
    await executeStep(request.userId, requestRef, 'delete_location_device', deleteLocationAndDevice);
    await executeStep(request.userId, requestRef, 'delete_user_profile', deleteUserProfile);

    await requestRef.update({
      status: DeletionStatus.COMPLETED,
      completedAt: Timestamp.now()
    });

    await logPrivacyAction(
      request.userId,
      PrivacyActionType.DATA_DELETION_COMPLETED,
      {
        deletionRequestId
      },
      '0.0.0.0',
      'Avalo-System/1.0'
    );

  } catch (error) {
    console.error('Account deletion error:', error);
    
    await requestRef.update({
      status: DeletionStatus.FAILED,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Execute a deletion step
 */
async function executeStep(
  userId: string,
  requestRef: FirebaseFirestore.DocumentReference,
  stepName: string,
  deletionFunction: (userId: string) => Promise<void>
): Promise<void> {
  const requestDoc = await requestRef.get();
  const request = requestDoc.data() as DataDeletionRequestSchema;
  
  const stepIndex = request.deletionSteps.findIndex(s => s.step === stepName);
  if (stepIndex === -1) return;

  const steps = [...request.deletionSteps];
  steps[stepIndex].status = 'completed';
  steps[stepIndex].completedAt = Timestamp.now();

  try {
    await deletionFunction(userId);
    
    await requestRef.update({
      deletionSteps: steps
    });
  } catch (error) {
    steps[stepIndex].status = 'failed';
    steps[stepIndex].error = error instanceof Error ? error.message : 'Unknown error';
    
    await requestRef.update({
      deletionSteps: steps
    });
    
    throw error;
  }
}

/**
 * Step 1: Freeze account
 */
async function freezeAccount(
  userId: string,
  requestRef: FirebaseFirestore.DocumentReference
): Promise<void> {
  const requestDoc = await requestRef.get();
  const request = requestDoc.data() as DataDeletionRequestSchema;
  
  const steps = [...request.deletionSteps];
  const stepIndex = steps.findIndex(s => s.step === 'freeze_account');
  
  if (stepIndex !== -1) {
    steps[stepIndex].status = 'completed';
    steps[stepIndex].completedAt = Timestamp.now();
  }

  await db.collection('users').doc(userId).update({
    accountStatus: 'frozen',
    accountFrozenAt: Timestamp.now(),
    accountFrozenReason: 'Account deletion requested'
  });

  await auth.updateUser(userId, {
    disabled: true
  });

  await requestRef.update({
    status: DeletionStatus.ACCOUNT_FROZEN,
    accountFrozenAt: Timestamp.now(),
    deletionSteps: steps
  });
}

/**
 * Step 2: Delete identity documents
 */
async function deleteIdentityDocuments(userId: string): Promise<void> {
  const docsQuery = db
    .collection('identity_documents')
    .where('userId', '==', userId);

  const snapshot = await docsQuery.get();
  const batch = db.batch();
  const bucket = storage.bucket();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    if (data.documentUrl) {
      const filePath = data.documentUrl.split('/').slice(-2).join('/');
      const file = bucket.file(filePath);
      await file.delete().catch(err => console.error('Error deleting identity doc:', err));
    }

    batch.delete(doc.ref);
  }

  await batch.commit();
}

/**
 * Step 3: Delete chats and messages
 */
async function deleteChatsAndMessages(userId: string): Promise<void> {
  const messagesQuery = db
    .collection('messages')
    .where('senderId', '==', userId)
    .limit(500);

  let hasMore = true;
  
  while (hasMore) {
    const snapshot = await messagesQuery.get();
    
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }

  const chatsQuery = db
    .collection('chats')
    .where('participants', 'array-contains', userId)
    .limit(500);

  hasMore = true;
  
  while (hasMore) {
    const snapshot = await chatsQuery.get();
    
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const participants = data.participants.filter((id: string) => id !== userId);
      
      if (participants.length === 0) {
        batch.delete(doc.ref);
      } else {
        batch.update(doc.ref, {
          participants,
          participantCount: participants.length
        });
      }
    });
    await batch.commit();
  }
}

/**
 * Step 4: Delete AI companion data
 */
async function deleteAICompanion(userId: string): Promise<void> {
  const historyQuery = db
    .collection('ai_companion_history')
    .where('userId', '==', userId)
    .limit(500);

  let hasMore = true;
  
  while (hasMore) {
    const snapshot = await historyQuery.get();
    
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }

  const memoryQuery = db
    .collection('ai_companion_memory')
    .where('userId', '==', userId)
    .limit(500);

  hasMore = true;
  
  while (hasMore) {
    const snapshot = await memoryQuery.get();
    
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

/**
 * Step 5: Delete media content
 */
async function deleteMediaContent(userId: string): Promise<void> {
  const bucket = storage.bucket();
  
  const [files] = await bucket.getFiles({
    prefix: `users/${userId}/`
  });

  for (const file of files) {
    await file.delete().catch(err => console.error('Error deleting media file:', err));
  }

  const postsQuery = db
    .collection('posts')
    .where('userId', '==', userId)
    .limit(500);

  let hasMore = true;
  
  while (hasMore) {
    const snapshot = await postsQuery.get();
    
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

/**
 * Step 6: Anonymize transactions (7-year legal requirement)
 */
async function anonymizeTransactions(userId: string): Promise<void> {
  const transactionsQuery = db
    .collection('paid_content')
    .where('buyerId', '==', userId)
    .limit(500);

  let hasMore = true;
  
  while (hasMore) {
    const snapshot = await transactionsQuery.get();
    
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        buyerId: 'ANONYMIZED',
        buyerEmail: null,
        buyerName: null,
        ipAddress: null,
        deviceId: null,
        anonymizedAt: Timestamp.now()
      });
    });
    await batch.commit();
  }

  const earningsQuery = db
    .collection('creator_earnings')
    .where('creatorId', '==', userId)
    .limit(500);

  hasMore = true;
  
  while (hasMore) {
    const snapshot = await earningsQuery.get();
    
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        creatorId: 'ANONYMIZED',
        creatorEmail: null,
        creatorName: null,
        anonymizedAt: Timestamp.now()
      });
    });
    await batch.commit();
  }
}

/**
 * Step 7: Delete analytics data
 */
async function deleteAnalytics(userId: string): Promise<void> {
  const analyticsQuery = db
    .collection('analytics_events')
    .where('userId', '==', userId)
    .limit(500);

  let hasMore = true;
  
  while (hasMore) {
    const snapshot = await analyticsQuery.get();
    
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

/**
 * Step 8: Delete location and device data
 */
async function deleteLocationAndDevice(userId: string): Promise<void> {
  const locationQuery = db
    .collection('location_history')
    .where('userId', '==', userId)
    .limit(500);

  let hasMore = true;
  
  while (hasMore) {
    const snapshot = await locationQuery.get();
    
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }

  const deviceQuery = db
    .collection('device_info')
    .where('userId', '==', userId)
    .limit(500);

  hasMore = true;
  
  while (hasMore) {
    const snapshot = await deviceQuery.get();
    
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

/**
 * Step 9: Delete user profile
 */
async function deleteUserProfile(userId: string): Promise<void> {
  await db.collection(COLLECTION_NAMES.USER_CONSENT_SETTINGS).doc(userId).delete();
  
  await db.collection('users').doc(userId).delete();
  
  await auth.deleteUser(userId);
}

/**
 * Cancel account deletion request
 */
export async function cancelAccountDeletion(
  deletionRequestId: string,
  userId: string,
  ipAddress: string,
  userAgent: string
): Promise<void> {
  const requestRef = db.collection(COLLECTION_NAMES.DATA_DELETION_REQUESTS).doc(deletionRequestId);
  const requestDoc = await requestRef.get();

  if (!requestDoc.exists) {
    throw new Error('Deletion request not found');
  }

  const request = requestDoc.data() as DataDeletionRequestSchema;

  if (request.userId !== userId) {
    throw new Error('Unauthorized cancellation attempt');
  }

  if (request.status === DeletionStatus.PROCESSING || request.status === DeletionStatus.COMPLETED) {
    throw new Error('Deletion is already in progress or completed and cannot be cancelled');
  }

  await requestRef.update({
    status: DeletionStatus.FAILED,
    error: 'Cancelled by user'
  });

  if (request.status === DeletionStatus.ACCOUNT_FROZEN) {
    await db.collection('users').doc(userId).update({
      accountStatus: 'active',
      accountFrozenAt: FieldValue.delete(),
      accountFrozenReason: FieldValue.delete()
    });

    await auth.updateUser(userId, {
      disabled: false
    });
  }

  await logPrivacyAction(
    userId,
    PrivacyActionType.DATA_DELETION_REQUESTED,
    {
      deletionRequestId,
      action: 'cancelled'
    },
    ipAddress,
    userAgent
  );
}

/**
 * Get deletion request status
 */
export async function getDeletionRequestStatus(
  userId: string
): Promise<DataDeletionRequestSchema | null> {
  const requestQuery = await db
    .collection(COLLECTION_NAMES.DATA_DELETION_REQUESTS)
    .where('userId', '==', userId)
    .orderBy('requestedAt', 'desc')
    .limit(1)
    .get();

  if (requestQuery.empty) {
    return null;
  }

  return requestQuery.docs[0].data() as DataDeletionRequestSchema;
}