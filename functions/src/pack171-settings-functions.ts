/**
 * PACK 171 - Unified Global Settings & Privacy Center
 * Firebase Cloud Functions for privacy-first settings management
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, serverTimestamp, generateId } from './init';
import {
  UserSettings,
  ConsentLog,
  SessionDevice,
  DataRequest,
  SettingsUpdateRequest,
  ConsentUpdateRequest,
  SessionManagementRequest,
  DataExportRequest,
  DataDeletionRequest,
  SettingsAuditLog,
  ConsentPurpose,
  DataRequestType,
  VisibilityLevel,
} from './pack171-settings-types';

export const updateSettings = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { category, updates } = request.data as SettingsUpdateRequest;

  if (!category || !updates) {
    throw new HttpsError('invalid-argument', 'Category and updates are required');
  }

  try {
    const settingsRef = db.collection('user_settings').doc(userId);
    const settingsDoc = await settingsRef.get();

    const updateData: Record<string, any> = {
      [`${category}`]: updates,
      updatedAt: serverTimestamp(),
    };

    if (!settingsDoc.exists) {
      const defaultSettings: Partial<UserSettings> = {
        userId,
        privacy: {
          posts: VisibilityLevel.PRIVATE,
          reels: VisibilityLevel.PRIVATE,
          stories: VisibilityLevel.PRIVATE,
          clubs: VisibilityLevel.PRIVATE,
          purchases: VisibilityLevel.PRIVATE,
          events: VisibilityLevel.PRIVATE,
          reviews: VisibilityLevel.PRIVATE,
          incognitoMode: false,
          showOnlineStatus: true,
          allowMessageRequests: true,
          searchable: true,
        },
        createdAt: new Date(),
      };
      await settingsRef.set({ ...defaultSettings, ...updateData });
    } else {
      await settingsRef.update(updateData);
    }

    await logAuditEntry(userId, 'update', category, request.rawRequest.ip || 'unknown');

    return { success: true, message: 'Settings updated successfully' };
  } catch (error) {
    console.error('Error updating settings:', error);
    throw new HttpsError('internal', 'Failed to update settings');
  }
});

export const updateConsent = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { purpose, granted, deviceInfo, explanation, featureUsing } = request.data as ConsentUpdateRequest;

  if (!purpose || granted === undefined || !deviceInfo || !explanation || !featureUsing) {
    throw new HttpsError('invalid-argument', 'All consent fields are required');
  }

  try {
    const consentId = generateId();
    const consentLog: ConsentLog = {
      id: consentId,
      userId,
      purpose: purpose as ConsentPurpose,
      granted,
      grantedAt: new Date(),
      deviceId: deviceInfo.platform,
      deviceInfo,
      ipAddress: request.rawRequest.ip || 'unknown',
      userAgent: request.rawRequest.headers['user-agent'] || 'unknown',
      explanation,
      featureUsing,
    };

    await db.collection('consent_logs').doc(consentId).set(consentLog);

    if (!granted) {
      await revokeConsentActions(userId, purpose as ConsentPurpose);
    }

    await logAuditEntry(userId, 'consent_update', purpose, request.rawRequest.ip || 'unknown');

    return { success: true, consentId, message: 'Consent updated successfully' };
  } catch (error) {
    console.error('Error updating consent:', error);
    throw new HttpsError('internal', 'Failed to update consent');
  }
});

export const getConsentHistory = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const consentSnapshot = await db
      .collection('consent_logs')
      .where('userId', '==', userId)
      .orderBy('grantedAt', 'desc')
      .limit(100)
      .get();

    const consents = consentSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { success: true, consents };
  } catch (error) {
    console.error('Error fetching consent history:', error);
    throw new HttpsError('internal', 'Failed to fetch consent history');
  }
});

export const terminateSession = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { action, sessionId, reason } = request.data as SessionManagementRequest;

  if (!action) {
    throw new HttpsError('invalid-argument', 'Action is required');
  }

  try {
    if (action === 'terminate_all') {
      const sessionsSnapshot = await db
        .collection('session_devices')
        .where('userId', '==', userId)
        .where('isCurrentDevice', '==', false)
        .get();

      const batch = db.batch();
      sessionsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      await logAuditEntry(userId, 'session_terminate', 'all_sessions', request.rawRequest.ip || 'unknown');

      return { success: true, message: 'All other sessions terminated', count: sessionsSnapshot.size };
    } else if (action === 'terminate' && sessionId) {
      const sessionRef = db.collection('session_devices').doc(sessionId);
      const sessionDoc = await sessionRef.get();

      if (!sessionDoc.exists || sessionDoc.data()?.userId !== userId) {
        throw new HttpsError('not-found', 'Session not found');
      }

      await sessionRef.delete();

      await logAuditEntry(userId, 'session_terminate', sessionId, request.rawRequest.ip || 'unknown');

      return { success: true, message: 'Session terminated successfully' };
    } else if ((action === 'trust' || action === 'untrust') && sessionId) {
      const sessionRef = db.collection('session_devices').doc(sessionId);
      const sessionDoc = await sessionRef.get();

      if (!sessionDoc.exists || sessionDoc.data()?.userId !== userId) {
        throw new HttpsError('not-found', 'Session not found');
      }

      await sessionRef.update({
        trusted: action === 'trust',
      });

      return { success: true, message: `Session ${action}ed successfully` };
    } else {
      throw new HttpsError('invalid-argument', 'Invalid action or missing sessionId');
    }
  } catch (error) {
    console.error('Error managing session:', error);
    throw new HttpsError('internal', 'Failed to manage session');
  }
});

export const exportUserData = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { format, includeMediaFiles, includeMessages, includePurchases, includeAnalytics } = request.data as DataExportRequest;

  try {
    const requestId = generateId();
    const dataRequest: DataRequest = {
      id: requestId,
      userId,
      type: DataRequestType.EXPORT,
      status: 'pending',
      createdAt: new Date(),
      format: format || 'json',
      includeMediaFiles: includeMediaFiles || false,
    };

    await db.collection('data_requests').doc(requestId).set(dataRequest);

    await processDataExport(userId, requestId, format || 'json', {
      includeMediaFiles: includeMediaFiles || false,
      includeMessages: includeMessages || false,
      includePurchases: includePurchases || false,
      includeAnalytics: includeAnalytics || false,
    });

    await logAuditEntry(userId, 'export', 'user_data', request.rawRequest.ip || 'unknown');

    return { 
      success: true, 
      requestId, 
      message: 'Data export request created. You will be notified when ready.',
    };
  } catch (error) {
    console.error('Error creating data export request:', error);
    throw new HttpsError('internal', 'Failed to create data export request');
  }
});

export const requestAccountDeletion = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { confirmationCode, deleteImmediately, reason } = request.data as DataDeletionRequest;

  if (!confirmationCode || confirmationCode !== 'DELETE') {
    throw new HttpsError('invalid-argument', 'Invalid confirmation code. Please type "DELETE" to confirm.');
  }

  try {
    const requestId = generateId();
    const dataRequest: DataRequest = {
      id: requestId,
      userId,
      type: DataRequestType.DELETION,
      status: 'pending',
      createdAt: new Date(),
    };

    await db.collection('data_requests').doc(requestId).set(dataRequest);

    if (deleteImmediately) {
      await processAccountDeletion(userId, requestId);
    } else {
      const gracePeriod = 30 * 24 * 60 * 60 * 1000;
      await scheduleAccountDeletion(userId, requestId, gracePeriod);
    }

    await logAuditEntry(userId, 'delete', 'account_deletion_request', request.rawRequest.ip || 'unknown');

    return {
      success: true,
      requestId,
      message: deleteImmediately
        ? 'Account deletion initiated. This may take up to 7 days to complete.'
        : 'Account scheduled for deletion in 30 days. You can cancel anytime before then.',
      gracePeriodDays: deleteImmediately ? 0 : 30,
    };
  } catch (error) {
    console.error('Error requesting account deletion:', error);
    throw new HttpsError('internal', 'Failed to request account deletion');
  }
});

export const getSessionDevices = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const sessionsSnapshot = await db
      .collection('session_devices')
      .where('userId', '==', userId)
      .orderBy('lastActive', 'desc')
      .get();

    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { success: true, sessions };
  } catch (error) {
    console.error('Error fetching session devices:', error);
    throw new HttpsError('internal', 'Failed to fetch session devices');
  }
});

export const updateNotificationSettings = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { settings } = request.data;

  if (!settings) {
    throw new HttpsError('invalid-argument', 'Settings are required');
  }

  try {
    const settingsRef = db.collection('user_settings').doc(userId);
    await settingsRef.update({
      'notifications': settings,
      updatedAt: serverTimestamp(),
    });

    await logAuditEntry(userId, 'update', 'notifications', request.rawRequest.ip || 'unknown');

    return { success: true, message: 'Notification settings updated successfully' };
  } catch (error) {
    console.error('Error updating notification settings:', error);
    throw new HttpsError('internal', 'Failed to update notification settings');
  }
});

export const updatePaymentSettings = onCall(async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { settings } = request.data;

  if (!settings) {
    throw new HttpsError('invalid-argument', 'Settings are required');
  }

  try {
    const settingsRef = db.collection('user_settings').doc(userId);
    await settingsRef.update({
      'payments': settings,
      updatedAt: serverTimestamp(),
    });

    await logAuditEntry(userId, 'update', 'payments', request.rawRequest.ip || 'unknown');

    return { success: true, message: 'Payment settings updated successfully' };
  } catch (error) {
    console.error('Error updating payment settings:', error);
    throw new HttpsError('internal', 'Failed to update payment settings');
  }
});

async function logAuditEntry(
  userId: string,
  action: string,
  category: string,
  ipAddress: string
): Promise<void> {
  const auditLog: SettingsAuditLog = {
    id: generateId(),
    userId,
    action: action as any,
    category,
    deviceId: 'unknown',
    ipAddress,
    timestamp: new Date(),
  };

  await db.collection('settings_audit_logs').doc(auditLog.id).set(auditLog);
}

async function revokeConsentActions(userId: string, purpose: ConsentPurpose): Promise<void> {
  switch (purpose) {
    case ConsentPurpose.LOCATION_TRACKING:
      await db.collection('user_settings').doc(userId).update({
        'location.preciseLocationEnabled': false,
      });
      break;
    case ConsentPurpose.ANALYTICS:
      await db.collection('user_settings').doc(userId).update({
        'privacy.analyticsEnabled': false,
      });
      break;
    case ConsentPurpose.MARKETING:
      await db.collection('user_settings').doc(userId).update({
        'notifications.emailNotifications.marketing': false,
      });
      break;
  }
}

async function processDataExport(
  userId: string,
  requestId: string,
  format: 'json' | 'csv' | 'pdf',
  options: {
    includeMediaFiles: boolean;
    includeMessages: boolean;
    includePurchases: boolean;
    includeAnalytics: boolean;
  }
): Promise<void> {
  try {
    await db.collection('data_requests').doc(requestId).update({
      status: 'processing',
    });

    const userData: Record<string, any> = {};

    const settingsDoc = await db.collection('user_settings').doc(userId).get();
    if (settingsDoc.exists) {
      userData.settings = settingsDoc.data();
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      userData.profile = userDoc.data();
    }

    if (options.includeMessages) {
      const messagesSnapshot = await db
        .collection('messages')
        .where('userId', '==', userId)
        .limit(1000)
        .get();
      userData.messages = messagesSnapshot.docs.map(doc => doc.data());
    }

    if (options.includePurchases) {
      const purchasesSnapshot = await db
        .collection('transactions')
        .where('userId', '==', userId)
        .limit(1000)
        .get();
      userData.purchases = purchasesSnapshot.docs.map(doc => doc.data());
    }

    const exportData = JSON.stringify(userData, null, 2);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.collection('data_requests').doc(requestId).update({
      status: 'completed',
      completedAt: new Date(),
      downloadUrl: `exports/${userId}/${requestId}.${format}`,
      expiresAt,
    });
  } catch (error) {
    console.error('Error processing data export:', error);
    await db.collection('data_requests').doc(requestId).update({
      status: 'failed',
      error: String(error),
    });
  }
}

async function processAccountDeletion(userId: string, requestId: string): Promise<void> {
  try {
    await db.collection('data_requests').doc(requestId).update({
      status: 'processing',
    });

    const batch = db.batch();

    const userRef = db.collection('users').doc(userId);
    batch.delete(userRef);

    const settingsRef = db.collection('user_settings').doc(userId);
    batch.delete(settingsRef);

    await batch.commit();

    await db.collection('data_requests').doc(requestId).update({
      status: 'completed',
      completedAt: new Date(),
    });
  } catch (error) {
    console.error('Error processing account deletion:', error);
    await db.collection('data_requests').doc(requestId).update({
      status: 'failed',
      error: String(error),
    });
  }
}

async function scheduleAccountDeletion(userId: string, requestId: string, gracePeriod: number): Promise<void> {
  const scheduledDate = new Date(Date.now() + gracePeriod);
  
  await db.collection('scheduled_deletions').doc(userId).set({
    userId,
    requestId,
    scheduledAt: new Date(),
    executeAt: scheduledDate,
    status: 'scheduled',
  });
}