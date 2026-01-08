/**
 * PACK 190 - Sync Middleware
 * Prevents double spending, duplicate actions, and memory drift
 */

import { db, serverTimestamp } from '../init';
import { SyncConflict } from './types';

export class SyncMiddleware {
  
  /**
   * Prevent double spending on token transactions
   */
  static async preventDoubleSpending(
    userId: string,
    transactionId: string,
    amount: number,
    type: 'purchase' | 'spend'
  ): Promise<{ allowed: boolean; reason?: string }> {
    const transactionRef = db.doc(`users/${userId}/token_transactions/${transactionId}`);
    
    return db.runTransaction(async (transaction) => {
      const transactionDoc = await transaction.get(transactionRef);
      
      if (transactionDoc.exists) {
        return {
          allowed: false,
          reason: 'Transaction already processed'
        };
      }
      
      const userRef = db.doc(`users/${userId}`);
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists) {
        return {
          allowed: false,
          reason: 'User not found'
        };
      }
      
      const currentBalance = userDoc.data()!.tokens || 0;
      
      if (type === 'spend' && currentBalance < amount) {
        return {
          allowed: false,
          reason: 'Insufficient balance'
        };
      }
      
      transaction.set(transactionRef, {
        transactionId,
        userId,
        amount,
        type,
        status: 'processing',
        createdAt: serverTimestamp()
      });
      
      return { allowed: true };
    });
  }
  
  /**
   * Prevent duplicate story progress updates
   */
  static async preventDuplicateStoryProgress(
    userId: string,
    companionId: string,
    sceneId: string,
    deviceId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const companionRef = db.doc(`ai_companions/${companionId}`);
    const progressLockRef = db.doc(`sync_locks/story_${companionId}_${sceneId}`);
    
    return db.runTransaction(async (transaction) => {
      const lockDoc = await transaction.get(progressLockRef);
      
      if (lockDoc.exists) {
        const lockData = lockDoc.data()!;
        const lockAge = Date.now() - (lockData.createdAt as any).toMillis();
        
        if (lockAge < 30000 && lockData.deviceId !== deviceId) {
          return {
            allowed: false,
            reason: 'Story progress locked by another device'
          };
        }
      }
      
      const companionDoc = await transaction.get(companionRef);
      
      if (!companionDoc.exists) {
        return {
          allowed: false,
          reason: 'Companion not found'
        };
      }
      
      const storyProgress = companionDoc.data()!.storyProgress || {};
      
      if (storyProgress.currentScene === sceneId) {
        return {
          allowed: false,
          reason: 'Scene already in progress'
        };
      }
      
      transaction.set(progressLockRef, {
        userId,
        companionId,
        sceneId,
        deviceId,
        createdAt: serverTimestamp()
      });
      
      return { allowed: true };
    });
  }
  
  /**
   * Prevent AI memory drift across devices
   */
  static async preventMemoryDrift(
    userId: string,
    companionId: string,
    memoryUpdate: any,
    deviceId: string
  ): Promise<{ allowed: boolean; reason?: string; conflict?: SyncConflict }> {
    const aiSyncRef = db.doc(`users/${userId}/ai_sync/${companionId}`);
    const memoryRef = db.collection(`ai_companions/${companionId}/memories`);
    
    return db.runTransaction(async (transaction) => {
      const aiSyncDoc = await transaction.get(aiSyncRef);
      
      if (aiSyncDoc.exists) {
        const lastSync = aiSyncDoc.data()!.lastMemorySync;
        const lastDevice = aiSyncDoc.data()!.lastDeviceId;
        
        if (lastDevice && lastDevice !== deviceId) {
          const timeSinceLastSync = Date.now() - (lastSync as any).toMillis();
          
          if (timeSinceLastSync < 5000) {
            return {
              allowed: false,
              reason: 'Memory sync too recent from another device'
            };
          }
        }
      }
      
      const recentMemories = await memoryRef
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      
      const hasDuplicate = recentMemories.docs.some(doc => {
        const data = doc.data();
        return JSON.stringify(data.content) === JSON.stringify(memoryUpdate.content);
      });
      
      if (hasDuplicate) {
        return {
          allowed: false,
          reason: 'Duplicate memory detected'
        };
      }
      
      transaction.set(aiSyncRef, {
        userId,
        companionId,
        lastMemorySync: serverTimestamp(),
        lastDeviceId: deviceId
      }, { merge: true });
      
      return { allowed: true };
    });
  }
  
  /**
   * Prevent duplicate message sending
   */
  static async preventDuplicateMessage(
    userId: string,
    chatId: string,
    messageId: string,
    content: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const messageRef = db.doc(`chats/${chatId}/messages/${messageId}`);
    const recentMessagesRef = db.collection(`chats/${chatId}/messages`);
    
    return db.runTransaction(async (transaction) => {
      const messageDoc = await transaction.get(messageRef);
      
      if (messageDoc.exists) {
        return {
          allowed: false,
          reason: 'Message already exists'
        };
      }
      
      const recentMessages = await recentMessagesRef
        .where('senderId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(5)
        .get();
      
      const duplicateFound = recentMessages.docs.some(doc => {
        const data = doc.data();
        const timeDiff = Date.now() - (data.timestamp as any).toMillis();
        return data.content === content && timeDiff < 1000;
      });
      
      if (duplicateFound) {
        return {
          allowed: false,
          reason: 'Duplicate message detected'
        };
      }
      
      return { allowed: true };
    });
  }
  
  /**
   * Validate sync request integrity
   */
  static async validateSyncRequest(
    userId: string,
    deviceId: string,
    platform: string,
    syncVersion: any
  ): Promise<{ valid: boolean; reason?: string }> {
    const syncStateRef = db.doc(`sync_states/${userId}_${deviceId}`);
    const syncStateDoc = await syncStateRef.get();
    
    if (!syncStateDoc.exists) {
      return { valid: true };
    }
    
    const serverState = syncStateDoc.data()!;
    
    if (syncVersion.chat && syncVersion.chat > serverState.chatSyncVersion + 10) {
      return {
        valid: false,
        reason: 'Sync version too far ahead - possible tampering'
      };
    }
    
    if (syncVersion.tokens && syncVersion.tokens > serverState.tokenSyncVersion + 5) {
      return {
        valid: false,
        reason: 'Token sync version mismatch'
      };
    }
    
    if (serverState.platform !== platform) {
      await syncStateRef.update({
        platform,
        updatedAt: serverTimestamp()
      });
    }
    
    return { valid: true };
  }
  
  /**
   * Handle media upload moderation
   */
  static async validateMediaUpload(
    userId: string,
    mediaType: string,
    fileSize: number,
    mimeType: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const allowedTypes: Record<string, string[]> = {
      image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      video: ['video/mp4', 'video/webm'],
      audio: ['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'],
      voice_note: ['audio/webm', 'audio/ogg', 'audio/mpeg']
    };
    
    const maxSizes: Record<string, number> = {
      image: 10 * 1024 * 1024,
      video: 100 * 1024 * 1024,
      audio: 50 * 1024 * 1024,
      voice_note: 10 * 1024 * 1024
    };
    
    if (!allowedTypes[mediaType]?.includes(mimeType)) {
      return {
        allowed: false,
        reason: 'Invalid media type'
      };
    }
    
    if (fileSize > maxSizes[mediaType]) {
      return {
        allowed: false,
        reason: 'File size exceeds limit'
      };
    }
    
    const userRef = db.doc(`users/${userId}`);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return {
        allowed: false,
        reason: 'User not found'
      };
    }
    
    const userData = userDoc.data()!;
    
    if (userData.moderationFlags?.mediaUploadBanned) {
      return {
        allowed: false,
        reason: 'Media upload privileges suspended'
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Release sync lock
   */
  static async releaseLock(lockId: string): Promise<void> {
    const lockRef = db.doc(`sync_locks/${lockId}`);
    await lockRef.delete();
  }
  
  /**
   * Clean up old locks
   */
  static async cleanupOldLocks(): Promise<number> {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - 5);
    
    const locksRef = db.collection('sync_locks');
    const oldLocks = await locksRef
      .where('createdAt', '<', cutoffTime)
      .limit(100)
      .get();
    
    const batch = db.batch();
    oldLocks.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    if (oldLocks.size > 0) {
      await batch.commit();
    }
    
    return oldLocks.size;
  }
}