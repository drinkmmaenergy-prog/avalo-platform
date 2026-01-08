/**
 * PACK 190 - Offline Queue Service
 * Handles queued actions taken while offline
 */

import { db, serverTimestamp, increment } from '../init';
import { OfflineQueue, OfflineQueueResult } from './types';

export class OfflineQueueService {
  
  /**
   * Add item to offline queue
   */
  static async enqueue(
    userId: string,
    deviceId: string,
    type: OfflineQueue['type'],
    payload: any
  ): Promise<string> {
    const queueRef = db.collection('offline_queues');
    
    const expirationHours = {
      message: 24,
      media: 48,
      token_purchase: 1,
      story_progress: 12,
      draft: 72
    };
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expirationHours[type]);
    
    const queueDoc = await queueRef.add({
      userId,
      deviceId,
      type,
      status: 'queued',
      payload,
      createdAt: serverTimestamp(),
      expiresAt,
      retryCount: 0
    });
    
    return queueDoc.id;
  }
  
  /**
   * Process offline queue for a user
   */
  static async processOfflineQueue(
    userId: string,
    deviceId?: string
  ): Promise<OfflineQueueResult> {
    const queueRef = db.collection('offline_queues');
    let query = queueRef
      .where('userId', '==', userId)
      .where('status', '==', 'queued')
      .orderBy('createdAt', 'asc');
    
    if (deviceId) {
      query = query.where('deviceId', '==', deviceId) as any;
    }
    
    const queueSnapshot = await query.limit(100).get();
    
    const result: OfflineQueueResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      expired: 0,
      errors: []
    };
    
    const now = new Date();
    
    for (const queueDoc of queueSnapshot.docs) {
      const data = queueDoc.data() as OfflineQueue;
      result.processed++;
      
      if (data.expiresAt && (data.expiresAt as any).toDate() < now) {
        await queueDoc.ref.update({
          status: 'expired',
          processedAt: serverTimestamp()
        });
        result.expired++;
        continue;
      }
      
      try {
        await queueDoc.ref.update({
          status: 'processing'
        });
        
        switch (data.type) {
          case 'message':
            await this.processMessage(userId, data.payload);
            break;
          case 'media':
            await this.processMedia(userId, data.payload);
            break;
          case 'token_purchase':
            await this.processTokenPurchase(userId, data.payload);
            break;
          case 'story_progress':
            await this.processStoryProgress(userId, data.payload);
            break;
          case 'draft':
            await this.processDraft(userId, data.payload);
            break;
        }
        
        await queueDoc.ref.update({
          status: 'completed',
          processedAt: serverTimestamp()
        });
        
        result.succeeded++;
        
      } catch (error: any) {
        const retryCount = data.retryCount || 0;
        const maxRetries = 3;
        
        if (retryCount >= maxRetries) {
          await queueDoc.ref.update({
            status: 'failed',
            error: error.message,
            processedAt: serverTimestamp()
          });
          result.failed++;
          result.errors.push({
            queueId: queueDoc.id,
            error: error.message
          });
        } else {
          await queueDoc.ref.update({
            status: 'queued',
            retryCount: increment(1),
            error: error.message
          });
        }
      }
    }
    
    return result;
  }
  
  /**
   * Process queued message
   */
  private static async processMessage(
    userId: string,
    payload: any
  ): Promise<void> {
    const { chatId, content, attachments } = payload;
    
    const messageRef = db.collection(`chats/${chatId}/messages`).doc();
    
    await messageRef.set({
      senderId: userId,
      content,
      attachments: attachments || [],
      timestamp: serverTimestamp(),
      status: 'sent',
      createdAt: serverTimestamp()
    });
    
    await db.doc(`chats/${chatId}`).update({
      lastMessage: content,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  
  /**
   * Process queued media
   */
  private static async processMedia(
    userId: string,
    payload: any
  ): Promise<void> {
    const { chatId, mediaType, localPath, metadata } = payload;
    
    const mediaSyncRef = db.collection('media_sync_jobs').doc();
    
    await mediaSyncRef.set({
      userId,
      chatId,
      mediaType,
      localPath,
      metadata,
      status: 'pending',
      createdAt: serverTimestamp()
    });
  }
  
  /**
   * Process queued token purchase
   */
  private static async processTokenPurchase(
    userId: string,
    payload: any
  ): Promise<void> {
    const { amount, paymentMethod, transactionId } = payload;
    
    const existingTransaction = await db.collection(`users/${userId}/token_transactions`)
      .where('transactionId', '==', transactionId)
      .limit(1)
      .get();
    
    if (!existingTransaction.empty) {
      throw new Error('Transaction already processed');
    }
    
    const transactionRef = db.collection(`users/${userId}/token_transactions`).doc();
    
    await transactionRef.set({
      amount,
      paymentMethod,
      transactionId,
      status: 'pending',
      type: 'purchase',
      createdAt: serverTimestamp()
    });
  }
  
  /**
   * Process queued story progress
   */
  private static async processStoryProgress(
    userId: string,
    payload: any
  ): Promise<void> {
    const { companionId, sceneId, progress } = payload;
    
    const companionRef = db.doc(`ai_companions/${companionId}`);
    
    await db.runTransaction(async (transaction) => {
      const companionDoc = await transaction.get(companionRef);
      
      if (!companionDoc.exists) {
        throw new Error('Companion not found');
      }
      
      const currentProgress = companionDoc.data()?.storyProgress || {};
      
      transaction.update(companionRef, {
        storyProgress: {
          ...currentProgress,
          currentScene: sceneId,
          lastUpdated: serverTimestamp(),
          ...progress
        }
      });
    });
  }
  
  /**
   * Process queued draft
   */
  private static async processDraft(
    userId: string,
    payload: any
  ): Promise<void> {
    const { chatId, content, deviceId } = payload;
    
    const draftRef = db.doc(`users/${userId}/drafts/${chatId}`);
    
    await draftRef.set({
      chatId,
      content,
      deviceId,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
  
  /**
   * Clean up old completed/failed queue items
   */
  static async cleanupQueue(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const queueRef = db.collection('offline_queues');
    const oldItems = await queueRef
      .where('status', 'in', ['completed', 'failed', 'expired'])
      .where('processedAt', '<', cutoffDate)
      .limit(500)
      .get();
    
    const batch = db.batch();
    let count = 0;
    
    oldItems.docs.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
    });
    
    if (count > 0) {
      await batch.commit();
    }
    
    return count;
  }
  
  /**
   * Get queue status for user
   */
  static async getQueueStatus(
    userId: string,
    deviceId?: string
  ): Promise<{
    queued: number;
    processing: number;
    failed: number;
    expired: number;
  }> {
    const queueRef = db.collection('offline_queues');
    let query = queueRef.where('userId', '==', userId);
    
    if (deviceId) {
      query = query.where('deviceId', '==', deviceId) as any;
    }
    
    const snapshot = await query.get();
    
    const status = {
      queued: 0,
      processing: 0,
      failed: 0,
      expired: 0
    };
    
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.status in status) {
        status[data.status as keyof typeof status]++;
      }
    });
    
    return status;
  }
}