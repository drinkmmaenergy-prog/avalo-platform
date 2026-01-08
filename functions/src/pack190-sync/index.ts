/**
 * PACK 190 - Cloud Sync Functions
 * HTTPS endpoints for sync operations
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, auth, serverTimestamp } from '../init';
import { SyncService } from './syncService';
import { OfflineQueueService } from './offlineQueueService';
import { SyncMiddleware } from './syncMiddleware';
import { SyncRequest } from './types';

/**
 * Main sync endpoint - handles all sync types
 */
export const performSync = onRequest(
  { 
    region: 'europe-west3',
    cors: true,
    maxInstances: 100
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      const syncRequest: SyncRequest = req.body;
      
      if (!syncRequest.deviceId || !syncRequest.platform) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const validation = await SyncMiddleware.validateSyncRequest(
        userId,
        syncRequest.deviceId,
        syncRequest.platform,
        syncRequest.lastSyncVersion || {}
      );

      if (!validation.valid) {
        res.status(400).json({ error: validation.reason });
        return;
      }

      const result = await SyncService.performSync({
        ...syncRequest,
        userId
      });

      res.status(200).json(result);

    } catch (error: any) {
      console.error('Sync error:', error);
      res.status(500).json({ 
        error: 'Sync failed',
        message: error.message 
      });
    }
  }
);

/**
 * Process offline queue
 */
export const processOfflineQueue = onRequest(
  { 
    region: 'europe-west3',
    cors: true,
    maxInstances: 50
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      const { deviceId } = req.body;

      const result = await OfflineQueueService.processOfflineQueue(
        userId,
        deviceId
      );

      res.status(200).json(result);

    } catch (error: any) {
      console.error('Queue processing error:', error);
      res.status(500).json({ 
        error: 'Queue processing failed',
        message: error.message 
      });
    }
  }
);

/**
 * Enqueue offline action
 */
export const enqueueOfflineAction = onRequest(
  { 
    region: 'europe-west3',
    cors: true,
    maxInstances: 100
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      const { deviceId, type, payload } = req.body;

      if (!deviceId || !type || !payload) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const validTypes = ['message', 'media', 'token_purchase', 'story_progress', 'draft'];
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: 'Invalid action type' });
        return;
      }

      const queueId = await OfflineQueueService.enqueue(
        userId,
        deviceId,
        type,
        payload
      );

      res.status(200).json({ 
        success: true,
        queueId 
      });

    } catch (error: any) {
      console.error('Enqueue error:', error);
      res.status(500).json({ 
        error: 'Enqueue failed',
        message: error.message 
      });
    }
  }
);

/**
 * Get sync state
 */
export const getSyncState = onRequest(
  { 
    region: 'europe-west3',
    cors: true,
    maxInstances: 100
  },
  async (req, res) => {
    try {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      const deviceId = req.query.deviceId as string;

      if (!deviceId) {
        res.status(400).json({ error: 'Missing deviceId' });
        return;
      }

      const syncStateRef = db.doc(`sync_states/${userId}_${deviceId}`);
      const syncStateDoc = await syncStateRef.get();

      if (!syncStateDoc.exists) {
        res.status(200).json({
          exists: false,
          versions: {
            chat: 0,
            ai: 0,
            tokens: 0,
            media: 0
          }
        });
        return;
      }

      const data = syncStateDoc.data()!;
      res.status(200).json({
        exists: true,
        lastSyncAt: data.lastSyncAt,
        versions: {
          chat: data.chatSyncVersion || 0,
          ai: data.aiSyncVersion || 0,
          tokens: data.tokenSyncVersion || 0,
          media: data.mediaSyncVersion || 0
        },
        platform: data.platform
      });

    } catch (error: any) {
      console.error('Get sync state error:', error);
      res.status(500).json({ 
        error: 'Failed to get sync state',
        message: error.message 
      });
    }
  }
);

/**
 * Register device session
 */
export const registerDeviceSession = onRequest(
  { 
    region: 'europe-west3',
    cors: true,
    maxInstances: 100
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      const { deviceId, platform, deviceInfo } = req.body;

      if (!deviceId || !platform) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const sessionRef = db.doc(`device_sessions/${userId}_${deviceId}`);
      await sessionRef.set({
        userId,
        deviceId,
        platform,
        deviceInfo: deviceInfo || {},
        isActive: true,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      }, { merge: true });

      await db.doc(`users/${userId}`).update({
        lastDeviceId: deviceId,
        lastPlatform: platform,
        lastSeen: serverTimestamp()
      });

      res.status(200).json({ 
        success: true,
        sessionId: sessionRef.id 
      });

    } catch (error: any) {
      console.error('Register session error:', error);
      res.status(500).json({ 
        error: 'Session registration failed',
        message: error.message 
      });
    }
  }
);

/**
 * Terminate device session
 */
export const terminateDeviceSession = onRequest(
  { 
    region: 'europe-west3',
    cors: true,
    maxInstances: 50
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      const { deviceId } = req.body;

      if (!deviceId) {
        res.status(400).json({ error: 'Missing deviceId' });
        return;
      }

      const sessionRef = db.doc(`device_sessions/${userId}_${deviceId}`);
      await sessionRef.update({
        isActive: false,
        terminatedAt: serverTimestamp()
      });

      res.status(200).json({ success: true });

    } catch (error: any) {
      console.error('Terminate session error:', error);
      res.status(500).json({ 
        error: 'Session termination failed',
        message: error.message 
      });
    }
  }
);

/**
 * Get active device sessions
 */
export const getActiveSessions = onRequest(
  { 
    region: 'europe-west3',
    cors: true,
    maxInstances: 50
  },
  async (req, res) => {
    try {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      const sessionsSnapshot = await db.collection('device_sessions')
        .where('userId', '==', userId)
        .where('isActive', '==', true)
        .orderBy('lastSeen', 'desc')
        .get();

      const sessions = sessionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      res.status(200).json({ sessions });

    } catch (error: any) {
      console.error('Get sessions error:', error);
      res.status(500).json({ 
        error: 'Failed to get sessions',
        message: error.message 
      });
    }
  }
);

/**
 * Scheduled cleanup of old queue items and locks
 */
export const cleanupSyncData = onSchedule(
  {
    schedule: 'every 6 hours',
    region: 'europe-west3',
    timeoutSeconds: 540
  },
  async () => {
    try {
      const queueCleaned = await OfflineQueueService.cleanupQueue(7);
      const locksCleaned = await SyncMiddleware.cleanupOldLocks();
      
      console.log(`Cleanup completed: ${queueCleaned} queue items, ${locksCleaned} locks`);
      
    } catch (error: any) {
      console.error('Cleanup error:', error);
    }
  }
);