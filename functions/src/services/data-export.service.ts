/**
 * PACK 155: Data Export Service
 * GDPR Article 15, CCPA §1798.110 - Right of Access
 */

import { db, storage } from '../init';
import { Timestamp } from 'firebase-admin/firestore';
import {
  DataCategory,
  ExportStatus,
  PrivacyActionType,
  EXPORT_DOWNLOAD_EXPIRY_HOURS,
  MAX_EXPORT_FILE_SIZE_MB
} from '../types/data-retention.types';
import {
  COLLECTION_NAMES,
  DataExportRequestSchema
} from '../schemas/data-retention.schema';
import { logPrivacyAction } from './data-retention.service';

/**
 * Generate data export for user
 * GDPR Article 15 - Right of access by the data subject
 * CCPA §1798.110 - Right to know about personal information collected
 */
export async function generateDataExport(
  userId: string,
  exportCategories: DataCategory[],
  ipAddress: string,
  userAgent: string
): Promise<string> {
  const exportRequest: Omit<DataExportRequestSchema, 'id'> = {
    userId,
    requestedAt: Timestamp.now(),
    status: ExportStatus.PENDING,
    exportCategories,
    ipAddress,
    userAgent
  };

  const docRef = await db.collection(COLLECTION_NAMES.DATA_EXPORT_REQUESTS).add(exportRequest);

  await logPrivacyAction(
    userId,
    PrivacyActionType.DATA_EXPORT_REQUESTED,
    {
      exportRequestId: docRef.id,
      categories: exportCategories
    },
    ipAddress,
    userAgent
  );

  processExportRequest(docRef.id).catch(error => {
    console.error(`Error processing export request ${docRef.id}:`, error);
  });

  return docRef.id;
}

/**
 * Process export request in background
 */
async function processExportRequest(exportRequestId: string): Promise<void> {
  const requestRef = db.collection(COLLECTION_NAMES.DATA_EXPORT_REQUESTS).doc(exportRequestId);
  
  try {
    await requestRef.update({
      status: ExportStatus.PROCESSING
    });

    const requestDoc = await requestRef.get();
    const request = requestDoc.data() as DataExportRequestSchema;

    const exportData = await collectUserData(request.userId, request.exportCategories);
    
    const exportJson = JSON.stringify(exportData, null, 2);
    const exportBuffer = Buffer.from(exportJson, 'utf-8');
    const fileSizeMB = exportBuffer.length / (1024 * 1024);

    if (fileSizeMB > MAX_EXPORT_FILE_SIZE_MB) {
      throw new Error(`Export file size (${fileSizeMB.toFixed(2)}MB) exceeds maximum allowed (${MAX_EXPORT_FILE_SIZE_MB}MB)`);
    }

    const fileName = `avalo-data-export-${request.userId}-${Date.now()}.json`;
    const bucket = storage.bucket();
    const file = bucket.file(`exports/${fileName}`);

    await file.save(exportBuffer, {
      contentType: 'application/json',
      metadata: {
        userId: request.userId,
        exportRequestId: exportRequestId
      }
    });

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + (EXPORT_DOWNLOAD_EXPIRY_HOURS * 60 * 60 * 1000)
    });

    const downloadExpiresAt = new Date();
    downloadExpiresAt.setHours(downloadExpiresAt.getHours() + EXPORT_DOWNLOAD_EXPIRY_HOURS);

    await requestRef.update({
      status: ExportStatus.READY,
      downloadUrl: signedUrl,
      fileSize: exportBuffer.length,
      downloadExpiresAt: Timestamp.fromDate(downloadExpiresAt),
      completedAt: Timestamp.now()
    });

    await logPrivacyAction(
      request.userId,
      PrivacyActionType.DATA_EXPORT_COMPLETED,
      {
        exportRequestId,
        fileSize: exportBuffer.length,
        expiresAt: downloadExpiresAt.toISOString()
      },
      '0.0.0.0',
      'Avalo-System/1.0'
    );

  } catch (error) {
    console.error('Export processing error:', error);
    
    await requestRef.update({
      status: ExportStatus.FAILED,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Collect all user data for export
 */
async function collectUserData(
  userId: string,
  categories: DataCategory[]
): Promise<Record<string, any>> {
  const exportData: Record<string, any> = {
    exportMetadata: {
      userId,
      exportDate: new Date().toISOString(),
      categories,
      version: '1.0'
    }
  };

  for (const category of categories) {
    switch (category) {
      case DataCategory.CHATS_CALLS:
        exportData.chatsAndCalls = await exportChatsAndCalls(userId);
        break;
      
      case DataCategory.PUBLIC_POSTS:
        exportData.publicPosts = await exportPublicPosts(userId);
        break;
      
      case DataCategory.PAID_CONTENT:
        exportData.paidContent = await exportPaidContent(userId);
        break;
      
      case DataCategory.AI_COMPANION:
        exportData.aiCompanion = await exportAICompanion(userId);
        break;
      
      case DataCategory.ANALYTICS_DATA:
        exportData.analytics = await exportAnalytics(userId);
        break;
      
      case DataCategory.LOCATION_DATA:
        exportData.locationData = await exportLocationData(userId);
        break;
      
      case DataCategory.DEVICE_DATA:
        exportData.deviceData = await exportDeviceData(userId);
        break;
    }
  }

  exportData.userProfile = await exportUserProfile(userId);
  exportData.privacySettings = await exportPrivacySettings(userId);
  exportData.consentHistory = await exportConsentHistory(userId);

  return exportData;
}

/**
 * Export chats and calls (only user's own messages)
 */
async function exportChatsAndCalls(userId: string): Promise<any[]> {
  const messagesQuery = db
    .collection('messages')
    .where('senderId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(10000);

  const snapshot = await messagesQuery.get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      messageId: doc.id,
      chatId: data.chatId,
      content: data.content,
      type: data.type,
      sentAt: data.createdAt?.toDate().toISOString(),
      edited: data.edited || false
    };
  });
}

/**
 * Export public posts
 */
async function exportPublicPosts(userId: string): Promise<any[]> {
  const postsQuery = db
    .collection('posts')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(5000);

  const snapshot = await postsQuery.get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      postId: doc.id,
      content: data.content,
      mediaUrls: data.mediaUrls || [],
      likes: data.likes || 0,
      comments: data.comments || 0,
      createdAt: data.createdAt?.toDate().toISOString()
    };
  });
}

/**
 * Export paid content purchases
 */
async function exportPaidContent(userId: string): Promise<any[]> {
  const purchasesQuery = db
    .collection('paid_content')
    .where('buyerId', '==', userId)
    .orderBy('purchasedAt', 'desc')
    .limit(5000);

  const snapshot = await purchasesQuery.get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      purchaseId: doc.id,
      contentType: data.contentType,
      amountPaid: data.amountPaid,
      currency: data.currency,
      purchasedAt: data.purchasedAt?.toDate().toISOString()
    };
  });
}

/**
 * Export AI companion history
 */
async function exportAICompanion(userId: string): Promise<any[]> {
  const historyQuery = db
    .collection('ai_companion_history')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(5000);

  const snapshot = await historyQuery.get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      sessionId: doc.id,
      userMessage: data.userMessage,
      aiResponse: data.aiResponse,
      timestamp: data.timestamp?.toDate().toISOString()
    };
  });
}

/**
 * Export analytics data
 */
async function exportAnalytics(userId: string): Promise<any[]> {
  const analyticsQuery = db
    .collection('analytics_events')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(10000);

  const snapshot = await analyticsQuery.get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      eventId: doc.id,
      eventType: data.eventType,
      properties: data.properties || {},
      timestamp: data.timestamp?.toDate().toISOString()
    };
  });
}

/**
 * Export location data
 */
async function exportLocationData(userId: string): Promise<any[]> {
  const locationQuery = db
    .collection('location_history')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(5000);

  const snapshot = await locationQuery.get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      locationId: doc.id,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy,
      timestamp: data.timestamp?.toDate().toISOString()
    };
  });
}

/**
 * Export device data
 */
async function exportDeviceData(userId: string): Promise<any[]> {
  const deviceQuery = db
    .collection('device_info')
    .where('userId', '==', userId)
    .orderBy('lastSeen', 'desc')
    .limit(100);

  const snapshot = await deviceQuery.get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      deviceId: doc.id,
      deviceType: data.deviceType,
      osVersion: data.osVersion,
      appVersion: data.appVersion,
      lastSeen: data.lastSeen?.toDate().toISOString()
    };
  });
}

/**
 * Export user profile
 */
async function exportUserProfile(userId: string): Promise<any> {
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    return null;
  }

  const data = userDoc.data()!;
  
  return {
    userId: userId,
    email: data.email,
    displayName: data.displayName,
    bio: data.bio,
    profilePictureUrl: data.profilePictureUrl,
    createdAt: data.createdAt?.toDate().toISOString(),
    lastActive: data.lastActive?.toDate().toISOString()
  };
}

/**
 * Export privacy settings
 */
async function exportPrivacySettings(userId: string): Promise<any> {
  const settingsDoc = await db
    .collection(COLLECTION_NAMES.USER_CONSENT_SETTINGS)
    .doc(userId)
    .get();

  if (!settingsDoc.exists) {
    return null;
  }

  return settingsDoc.data();
}

/**
 * Export consent history
 */
async function exportConsentHistory(userId: string): Promise<any[]> {
  const logsQuery = db
    .collection(COLLECTION_NAMES.PRIVACY_ACTION_LOGS)
    .where('userId', '==', userId)
    .where('actionType', '==', PrivacyActionType.CONSENT_UPDATED)
    .orderBy('timestamp', 'desc')
    .limit(100);

  const snapshot = await logsQuery.get();
  
  return snapshot.docs.map(doc => doc.data());
}

/**
 * Mark export as downloaded
 */
export async function markExportDownloaded(
  exportRequestId: string,
  userId: string,
  ipAddress: string,
  userAgent: string
): Promise<void> {
  const requestRef = db.collection(COLLECTION_NAMES.DATA_EXPORT_REQUESTS).doc(exportRequestId);
  
  await requestRef.update({
    status: ExportStatus.DOWNLOADED,
    downloadedAt: Timestamp.now()
  });

  await logPrivacyAction(
    userId,
    PrivacyActionType.DATA_EXPORT_DOWNLOADED,
    {
      exportRequestId
    },
    ipAddress,
    userAgent
  );
}

/**
 * Deliver data export to user
 */
export async function deliverDataExport(
  exportRequestId: string,
  userId: string
): Promise<{ downloadUrl: string; expiresAt: Date }> {
  const requestDoc = await db
    .collection(COLLECTION_NAMES.DATA_EXPORT_REQUESTS)
    .doc(exportRequestId)
    .get();

  if (!requestDoc.exists) {
    throw new Error('Export request not found');
  }

  const request = requestDoc.data() as DataExportRequestSchema;

  if (request.userId !== userId) {
    throw new Error('Unauthorized access to export');
  }

  if (request.status !== ExportStatus.READY) {
    throw new Error(`Export not ready. Current status: ${request.status}`);
  }

  if (!request.downloadUrl || !request.downloadExpiresAt) {
    throw new Error('Export download URL not available');
  }

  const expiresAt = request.downloadExpiresAt.toDate();
  const now = new Date();

  if (now > expiresAt) {
    await requestDoc.ref.update({
      status: ExportStatus.EXPIRED
    });
    throw new Error('Export download link has expired');
  }

  return {
    downloadUrl: request.downloadUrl,
    expiresAt
  };
}

/**
 * Clean up expired exports
 * Called by scheduled job
 */
export async function cleanupExpiredExports(): Promise<number> {
  const now = Timestamp.now();
  
  const expiredQuery = db
    .collection(COLLECTION_NAMES.DATA_EXPORT_REQUESTS)
    .where('status', '==', ExportStatus.READY)
    .where('downloadExpiresAt', '<', now)
    .limit(100);

  const snapshot = await expiredQuery.get();
  const batch = db.batch();
  const bucket = storage.bucket();

  let deletedCount = 0;

  for (const doc of snapshot.docs) {
    const request = doc.data() as DataExportRequestSchema;
    
    if (request.downloadUrl) {
      const fileName = request.downloadUrl.split('/').pop()?.split('?')[0];
      if (fileName) {
        const file = bucket.file(`exports/${fileName}`);
        await file.delete().catch(err => console.error('Error deleting export file:', err));
      }
    }

    batch.update(doc.ref, {
      status: ExportStatus.EXPIRED,
      downloadUrl: null
    });

    deletedCount++;
  }

  await batch.commit();

  return deletedCount;
}