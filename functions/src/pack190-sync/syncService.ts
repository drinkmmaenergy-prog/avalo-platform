/**
 * PACK 190 - Cloud Sync Service
 * Core synchronization logic for multi-platform continuity
 */

import { db, serverTimestamp, increment } from '../init';
import {
  SyncState,
  SyncSession,
  ChatSyncState,
  AiSyncState,
  TokenSyncState,
  SyncRequest,
  SyncResponse,
  SyncConflict
} from './types';

export class SyncService {
  
  /**
   * Sync chat state across devices
   */
  static async syncChatState(
    userId: string,
    deviceId: string,
    chatId: string,
    lastSyncVersion: number
  ): Promise<{
    messages: any[];
    newVersion: number;
    conflicts: SyncConflict[];
  }> {
    const chatSyncRef = db.doc(`users/${userId}/chat_sync/${chatId}`);
    const messagesRef = db.collection(`chats/${chatId}/messages`);
    
    return db.runTransaction(async (transaction) => {
      const chatSyncDoc = await transaction.get(chatSyncRef);
      const currentVersion = chatSyncDoc.exists ? 
        (chatSyncDoc.data()?.syncVersion || 0) : 0;
      
      const conflicts: SyncConflict[] = [];
      
      const messagesSnapshot = await messagesRef
        .where('timestamp', '>', chatSyncDoc.exists ? chatSyncDoc.data()!.lastMessageTimestamp : 0)
        .orderBy('timestamp', 'asc')
        .get();
      
      const messages = messagesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        };
      });
      
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const lastMessageData = messagesSnapshot.docs[messages.length - 1].data();
        transaction.set(chatSyncRef, {
          chatId,
          lastMessageId: lastMessage.id,
          lastMessageTimestamp: lastMessageData.timestamp,
          lastSyncAt: serverTimestamp(),
          deviceId,
          messageCount: increment(messages.length),
          syncVersion: increment(1)
        }, { merge: true });
      }
      
      return {
        messages,
        newVersion: currentVersion + 1,
        conflicts
      };
    });
  }
  
  /**
   * Sync AI companion state and memories
   */
  static async syncAiState(
    userId: string,
    deviceId: string,
    companionId: string,
    lastSyncVersion: number
  ): Promise<{
    memories: any[];
    emotionalState: any;
    storyProgress: any;
    newVersion: number;
    conflicts: SyncConflict[];
  }> {
    const aiSyncRef = db.doc(`users/${userId}/ai_sync/${companionId}`);
    const companionRef = db.doc(`ai_companions/${companionId}`);
    const memoriesRef = db.collection(`ai_companions/${companionId}/memories`);
    
    return db.runTransaction(async (transaction) => {
      const aiSyncDoc = await transaction.get(aiSyncRef);
      const companionDoc = await transaction.get(companionRef);
      const currentVersion = aiSyncDoc.exists ? 
        (aiSyncDoc.data()?.memoryVersion || 0) : 0;
      
      const conflicts: SyncConflict[] = [];
      
      if (!companionDoc.exists) {
        throw new Error('AI companion not found');
      }
      
      const lastMemorySync = aiSyncDoc.exists ? 
        aiSyncDoc.data()!.lastMemorySync : null;
      
      const memoriesQuery = lastMemorySync ?
        memoriesRef.where('createdAt', '>', lastMemorySync) :
        memoriesRef.orderBy('createdAt', 'desc').limit(100);
      
      const memoriesSnapshot = await memoriesQuery.get();
      const memories = memoriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      const companionData = companionDoc.data()!;
      const emotionalState = companionData.emotionalState || null;
      const storyProgress = companionData.storyProgress || null;
      
      transaction.set(aiSyncRef, {
        companionId,
        lastMemorySync: serverTimestamp(),
        lastStateSync: serverTimestamp(),
        memoryVersion: increment(1),
        emotionalState,
        storyProgress
      }, { merge: true });
      
      return {
        memories,
        emotionalState,
        storyProgress,
        newVersion: currentVersion + 1,
        conflicts
      };
    });
  }
  
  /**
   * Sync token balance and transactions
   */
  static async syncTokens(
    userId: string,
    deviceId: string
  ): Promise<{
    balance: number;
    pendingTransactions: any[];
    newVersion: number;
  }> {
    const tokenSyncRef = db.doc(`users/${userId}/token_sync/balance`);
    const userRef = db.doc(`users/${userId}`);
    const transactionsRef = db.collection(`users/${userId}/token_transactions`);
    
    return db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const tokenSyncDoc = await transaction.get(tokenSyncRef);
      
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const balance = userDoc.data()!.tokens || 0;
      
      const pendingSnapshot = await transactionsRef
        .where('status', 'in', ['pending', 'processing'])
        .get();
      
      const pendingTransactions = pendingSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      const currentVersion = tokenSyncDoc.exists ? 
        (tokenSyncDoc.data()?.syncVersion || 0) : 0;
      
      transaction.set(tokenSyncRef, {
        balance,
        lastSyncAt: serverTimestamp(),
        deviceId,
        pendingTransactions: pendingTransactions.map(t => t.id),
        syncVersion: increment(1)
      }, { merge: true });
      
      return {
        balance,
        pendingTransactions,
        newVersion: currentVersion + 1
      };
    });
  }
  
  /**
   * Sync media files
   */
  static async syncMedia(
    userId: string,
    deviceId: string,
    platform: string
  ): Promise<{
    uploads: any[];
    downloads: any[];
    newVersion: number;
  }> {
    const mediaSyncRef = db.collection('media_sync_jobs');
    
    const uploadsSnapshot = await mediaSyncRef
      .where('userId', '==', userId)
      .where('deviceId', '==', deviceId)
      .where('status', 'in', ['pending', 'uploading'])
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    
    const uploads = uploadsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const downloadsSnapshot = await mediaSyncRef
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    
    const downloads = downloadsSnapshot.docs
      .filter(doc => doc.data().deviceId !== deviceId)
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    
    const syncStateRef = db.doc(`sync_states/${userId}_${deviceId}`);
    const syncStateDoc = await syncStateRef.get();
    const currentVersion = syncStateDoc.exists ? 
      (syncStateDoc.data()?.mediaSyncVersion || 0) : 0;
    
    await syncStateRef.set({
      userId,
      deviceId,
      platform,
      mediaSyncVersion: currentVersion + 1,
      lastSyncAt: serverTimestamp()
    }, { merge: true });
    
    return {
      uploads,
      downloads,
      newVersion: currentVersion + 1
    };
  }
  
  /**
   * Universal sync function - syncs all requested types
   */
  static async performSync(request: SyncRequest): Promise<SyncResponse> {
    const {
      userId,
      deviceId,
      platform,
      syncTypes,
      lastSyncVersion
    } = request;
    
    const updates: any = {};
    const allConflicts: SyncConflict[] = [];
    const newVersion: any = {};
    
    try {
      if (syncTypes.includes('chat')) {
        const chatsSnapshot = await db.collection('chats')
          .where('participants', 'array-contains', userId)
          .limit(100)
          .get();
        
        const chatUpdates = await Promise.all(
          chatsSnapshot.docs.map(async (chatDoc) => {
            const result = await this.syncChatState(
              userId,
              deviceId,
              chatDoc.id,
              lastSyncVersion.chat || 0
            );
            allConflicts.push(...result.conflicts);
            return {
              chatId: chatDoc.id,
              messages: result.messages,
              version: result.newVersion
            };
          })
        );
        
        updates.chat = chatUpdates;
        newVersion.chat = Math.max(...chatUpdates.map(u => u.version), 0);
      }
      
      if (syncTypes.includes('ai')) {
        const companionsSnapshot = await db.collection('ai_companions')
          .where('userId', '==', userId)
          .get();
        
        const aiUpdates = await Promise.all(
          companionsSnapshot.docs.map(async (compDoc) => {
            const result = await this.syncAiState(
              userId,
              deviceId,
              compDoc.id,
              lastSyncVersion.ai || 0
            );
            allConflicts.push(...result.conflicts);
            return {
              companionId: compDoc.id,
              memories: result.memories,
              emotionalState: result.emotionalState,
              storyProgress: result.storyProgress,
              version: result.newVersion
            };
          })
        );
        
        updates.ai = aiUpdates;
        newVersion.ai = Math.max(...aiUpdates.map(u => u.version), 0);
      }
      
      if (syncTypes.includes('tokens')) {
        const tokenResult = await this.syncTokens(userId, deviceId);
        updates.tokens = tokenResult;
        newVersion.tokens = tokenResult.newVersion;
      }
      
      if (syncTypes.includes('media')) {
        const mediaResult = await this.syncMedia(userId, deviceId, platform);
        updates.media = mediaResult;
        newVersion.media = mediaResult.newVersion;
      }
      
      const syncStateRef = db.doc(`sync_states/${userId}_${deviceId}`);
      await syncStateRef.set({
        userId,
        deviceId,
        platform,
        lastSyncAt: serverTimestamp(),
        chatSyncVersion: newVersion.chat || 0,
        aiSyncVersion: newVersion.ai || 0,
        tokenSyncVersion: newVersion.tokens || 0,
        mediaSyncVersion: newVersion.media || 0,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      return {
        success: true,
        syncedAt: serverTimestamp() as any,
        updates,
        conflicts: allConflicts.length > 0 ? allConflicts : undefined,
        newVersion: {
          chat: newVersion.chat || 0,
          ai: newVersion.ai || 0,
          tokens: newVersion.tokens || 0,
          media: newVersion.media || 0
        }
      };
      
    } catch (error: any) {
      console.error('Sync error:', error);
      return {
        success: false,
        syncedAt: serverTimestamp() as any,
        updates: {},
        newVersion: {
          chat: lastSyncVersion.chat || 0,
          ai: lastSyncVersion.ai || 0,
          tokens: lastSyncVersion.tokens || 0,
          media: lastSyncVersion.media || 0
        }
      };
    }
  }
  
  /**
   * Check for and resolve sync conflicts
   */
  static async resolveSyncConflict(
    conflictId: string,
    resolution: 'server_wins' | 'client_wins' | 'merge'
  ): Promise<boolean> {
    const conflictRef = db.doc(`sync_conflicts/${conflictId}`);
    
    return db.runTransaction(async (transaction) => {
      const conflictDoc = await transaction.get(conflictRef);
      
      if (!conflictDoc.exists) {
        throw new Error('Conflict not found');
      }
      
      const conflict = conflictDoc.data() as SyncConflict;
      
      if (conflict.resolved) {
        return false;
      }
      
      transaction.update(conflictRef, {
        resolved: true,
        resolution,
        resolvedAt: serverTimestamp()
      });
      
      return true;
    });
  }
}