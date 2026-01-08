/**
 * PACK 47 — Media Upload Service
 * Handles upload of local media files to Firebase Storage for PPM messages
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import app from '../lib/firebase';
import { syncMessage } from './backSyncService';
import { ChatMessage } from '../types/chat';

// ============================================================================
// TYPES
// ============================================================================

export interface MediaUploadContext {
  conversationId: string;
  messageId: string;
  senderId: string;
  mediaType: 'photo' | 'audio' | 'video';
  localUri: string;
}

export interface MediaUploadResult {
  storagePath: string;
  downloadUrl: string;
}

interface PendingMediaUpload {
  id: string;
  context: MediaUploadContext;
  retries: number;
  createdAt: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY_PREFIX = 'pending_media_uploads_v1_';
const MAX_RETRIES = 10;

// ============================================================================
// STORAGE HELPERS
// ============================================================================

function getPendingUploadsKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

async function loadPendingUploads(userId: string): Promise<PendingMediaUpload[]> {
  try {
    const key = getPendingUploadsKey(userId);
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('[mediaUploadService] Error loading pending uploads:', error);
    return [];
  }
}

async function savePendingUploads(userId: string, uploads: PendingMediaUpload[]): Promise<void> {
  try {
    const key = getPendingUploadsKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(uploads));
  } catch (error) {
    console.error('[mediaUploadService] Error saving pending uploads:', error);
  }
}

async function addPendingUpload(userId: string, context: MediaUploadContext): Promise<void> {
  try {
    const uploads = await loadPendingUploads(userId);
    
    // Check if already exists
    if (uploads.some(u => u.context.messageId === context.messageId)) {
      return;
    }
    
    const newUpload: PendingMediaUpload = {
      id: context.messageId,
      context,
      retries: 0,
      createdAt: Date.now(),
    };
    
    uploads.push(newUpload);
    await savePendingUploads(userId, uploads);
    
    console.log('[mediaUploadService] Added pending upload:', context.messageId);
  } catch (error) {
    console.error('[mediaUploadService] Error adding pending upload:', error);
  }
}

async function removePendingUpload(userId: string, messageId: string): Promise<void> {
  try {
    const uploads = await loadPendingUploads(userId);
    const filtered = uploads.filter(u => u.id !== messageId);
    await savePendingUploads(userId, filtered);
  } catch (error) {
    console.error('[mediaUploadService] Error removing pending upload:', error);
  }
}

async function incrementUploadRetry(userId: string, messageId: string): Promise<void> {
  try {
    const uploads = await loadPendingUploads(userId);
    const upload = uploads.find(u => u.id === messageId);
    if (upload) {
      upload.retries += 1;
      await savePendingUploads(userId, uploads);
    }
  } catch (error) {
    console.error('[mediaUploadService] Error incrementing retry:', error);
  }
}

// ============================================================================
// LOCAL MESSAGE HELPERS
// ============================================================================

async function updateLocalMessage(
  conversationId: string,
  messageId: string,
  updates: Partial<ChatMessage>
): Promise<void> {
  try {
    const key = `chat_messages_v1_${conversationId}`;
    const data = await AsyncStorage.getItem(key);
    if (!data) return;
    
    const messages: ChatMessage[] = JSON.parse(data);
    const messageIndex = messages.findIndex(m => m.id === messageId);
    
    if (messageIndex !== -1) {
      messages[messageIndex] = { ...messages[messageIndex], ...updates };
      await AsyncStorage.setItem(key, JSON.stringify(messages));
      console.log('[mediaUploadService] Updated local message:', messageId, updates);
    }
  } catch (error) {
    console.error('[mediaUploadService] Error updating local message:', error);
  }
}

// ============================================================================
// FILE UPLOAD
// ============================================================================

/**
 * Get file extension from URI or media type
 */
function getFileExtension(localUri: string, mediaType: 'photo' | 'audio' | 'video'): string {
  // Try to extract from URI
  const uriMatch = localUri.match(/\.([a-z0-9]+)(\?|$)/i);
  if (uriMatch) {
    return uriMatch[1];
  }
  
  // Fallback based on media type
  switch (mediaType) {
    case 'photo':
      return 'jpg';
    case 'audio':
      return 'm4a';
    case 'video':
      return 'mp4';
    default:
      return 'bin';
  }
}

/**
 * Convert local URI to Blob for upload
 */
async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return blob;
}

/**
 * Upload media file to Firebase Storage
 */
export async function uploadMediaForMessage(
  context: MediaUploadContext
): Promise<MediaUploadResult> {
  const { conversationId, messageId, senderId, mediaType, localUri } = context;
  
  try {
    console.log('[mediaUploadService] Starting upload for message:', messageId);
    
    // Update local message to "uploading"
    await updateLocalMessage(conversationId, messageId, {
      mediaUploadStatus: 'uploading',
    });
    
    // Get storage reference
    const storage = getStorage(app);
    const extension = getFileExtension(localUri, mediaType);
    const filename = `media.${extension}`;
    const storagePath = `chat-media/${conversationId}/${messageId}/${filename}`;
    const storageRef = ref(storage, storagePath);
    
    // Convert URI to Blob
    const blob = await uriToBlob(localUri);
    
    // Upload file
    const uploadTask = uploadBytesResumable(storageRef, blob);
    
    // Wait for upload to complete
    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log(`[mediaUploadService] Upload ${progress.toFixed(0)}% complete`);
        },
        (error) => {
          console.error('[mediaUploadService] Upload error:', error);
          reject(error);
        },
        () => {
          resolve();
        }
      );
    });
    
    // Get download URL
    const downloadUrl = await getDownloadURL(storageRef);
    
    console.log('[mediaUploadService] Upload complete:', downloadUrl);
    
    // Update local message with remote URL and status
    await updateLocalMessage(conversationId, messageId, {
      mediaUploadStatus: 'uploaded',
      mediaStoragePath: storagePath,
      mediaRemoteUrl: downloadUrl,
    });
    
    // Sync to backend with media metadata
    try {
      const message = await getLocalMessage(conversationId, messageId);
      if (message) {
        await syncMessage({
          messageId: message.id,
          senderId: message.senderId,
          receiverId: message.receiverId,
          text: message.text,
          createdAt: message.createdAt,
          mediaType: message.mediaType,
          isBoosted: message.isBoosted,
          boostExtraTokens: message.boostExtraTokens,
          payToUnlock: message.payToUnlock,
          unlockPriceTokens: message.unlockPriceTokens,
          mediaStoragePath: storagePath,
          mediaRemoteUrl: downloadUrl,
        } as any);
      }
    } catch (syncError) {
      console.error('[mediaUploadService] Error syncing media metadata:', syncError);
      // Don't throw - sync failure shouldn't break upload
    }
    
    return {
      storagePath,
      downloadUrl,
    };
  } catch (error: any) {
    console.error('[mediaUploadService] Error uploading media:', error);
    
    // Update local message to "failed"
    await updateLocalMessage(conversationId, messageId, {
      mediaUploadStatus: 'failed',
    });
    
    // Add to pending uploads for retry
    await addPendingUpload(senderId, context);
    
    throw error;
  }
}

/**
 * Get local message by ID
 */
async function getLocalMessage(
  conversationId: string,
  messageId: string
): Promise<ChatMessage | null> {
  try {
    const key = `chat_messages_v1_${conversationId}`;
    const data = await AsyncStorage.getItem(key);
    if (!data) return null;
    
    const messages: ChatMessage[] = JSON.parse(data);
    return messages.find(m => m.id === messageId) || null;
  } catch (error) {
    console.error('[mediaUploadService] Error getting local message:', error);
    return null;
  }
}

// ============================================================================
// RETRY PENDING UPLOADS
// ============================================================================

/**
 * Retry all pending media uploads for a user
 */
export async function retryPendingMediaUploads(userId: string): Promise<void> {
  try {
    const uploads = await loadPendingUploads(userId);
    
    if (uploads.length === 0) {
      return;
    }
    
    console.log(`[mediaUploadService] Retrying ${uploads.length} pending uploads`);
    
    for (const upload of uploads) {
      // Check if max retries exceeded
      if (upload.retries >= MAX_RETRIES) {
        console.warn(`[mediaUploadService] Max retries exceeded for ${upload.id}, giving up`);
        await removePendingUpload(userId, upload.id);
        continue;
      }
      
      try {
        // Attempt upload
        await uploadMediaForMessage(upload.context);
        
        // Success - remove from pending
        console.log(`[mediaUploadService] Successfully uploaded ${upload.id}`);
        await removePendingUpload(userId, upload.id);
      } catch (error) {
        console.error(`[mediaUploadService] Failed to upload ${upload.id}, will retry later`);
        await incrementUploadRetry(userId, upload.id);
      }
    }
  } catch (error) {
    console.error('[mediaUploadService] Error retrying pending uploads:', error);
  }
}

/**
 * Get count of pending uploads for a user
 */
export async function getPendingUploadCount(userId: string): Promise<number> {
  try {
    const uploads = await loadPendingUploads(userId);
    return uploads.length;
  } catch (error) {
    console.error('[mediaUploadService] Error getting pending upload count:', error);
    return 0;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  uploadMediaForMessage,
  retryPendingMediaUploads,
  getPendingUploadCount,
};