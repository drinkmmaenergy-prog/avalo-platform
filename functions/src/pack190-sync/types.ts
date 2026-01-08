/**
 * PACK 190 - Cloud Sync Types
 * Type definitions for sync infrastructure
 */

export interface SyncState {
  userId: string;
  deviceId: string;
  platform: 'mobile' | 'web' | 'desktop' | 'xr';
  lastSyncAt: FirebaseFirestore.Timestamp;
  chatSyncVersion: number;
  aiSyncVersion: number;
  tokenSyncVersion: number;
  mediaSyncVersion: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface SyncSession {
  userId: string;
  deviceId: string;
  platform: 'mobile' | 'web' | 'desktop' | 'xr';
  isActive: boolean;
  startedAt: FirebaseFirestore.Timestamp;
  lastActivityAt: FirebaseFirestore.Timestamp;
  ipAddress?: string;
  userAgent?: string;
}

export interface DeviceSession {
  userId: string;
  deviceId: string;
  platform: 'mobile' | 'web' | 'desktop' | 'xr';
  deviceInfo: {
    model?: string;
    os?: string;
    osVersion?: string;
    appVersion?: string;
  };
  isActive: boolean;
  createdAt: FirebaseFirestore.Timestamp;
  lastSeen: FirebaseFirestore.Timestamp;
  location?: {
    country?: string;
    city?: string;
  };
}

export interface OfflineQueue {
  userId: string;
  deviceId: string;
  type: 'message' | 'media' | 'token_purchase' | 'story_progress' | 'draft';
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'expired';
  payload: any;
  createdAt: FirebaseFirestore.Timestamp;
  processedAt?: FirebaseFirestore.Timestamp;
  expiresAt?: FirebaseFirestore.Timestamp;
  retryCount: number;
  error?: string;
}

export interface MediaSyncJob {
  userId: string;
  deviceId: string;
  mediaType: 'image' | 'video' | 'audio' | 'voice_note' | 'call_recording';
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  fileSize?: number;
  fileName?: string;
  mimeType?: string;
  localPath?: string;
  remotePath?: string;
  uploadProgress?: number;
  moderationStatus?: 'pending' | 'approved' | 'rejected';
  createdAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  error?: string;
}

export interface SyncConflict {
  userId: string;
  type: 'message_duplicate' | 'memory_drift' | 'token_mismatch' | 'story_desync';
  resolved: boolean;
  resolution?: 'server_wins' | 'client_wins' | 'merge' | 'manual';
  conflictData: {
    serverValue: any;
    clientValue: any;
    deviceId: string;
  };
  createdAt: FirebaseFirestore.Timestamp;
  resolvedAt?: FirebaseFirestore.Timestamp;
}

export interface ChatSyncState {
  chatId: string;
  lastMessageId: string;
  lastMessageTimestamp: FirebaseFirestore.Timestamp;
  lastSyncAt: FirebaseFirestore.Timestamp;
  deviceId: string;
  messageCount: number;
  draftContent?: string;
}

export interface AiSyncState {
  companionId: string;
  lastMemorySync: FirebaseFirestore.Timestamp;
  lastStateSync: FirebaseFirestore.Timestamp;
  memoryVersion: number;
  emotionalState?: {
    mood: string;
    intensity: number;
  };
  storyProgress?: {
    currentScene: string;
    completedArcs: string[];
  };
}

export interface TokenSyncState {
  balance: number;
  lastTransactionId?: string;
  lastTransactionTimestamp?: FirebaseFirestore.Timestamp;
  pendingTransactions: string[];
  syncVersion: number;
}

export interface DraftMessage {
  chatId: string;
  content: string;
  deviceId: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  attachments?: {
    type: string;
    localPath: string;
  }[];
}

export interface SyncRequest {
  userId: string;
  deviceId: string;
  platform: 'mobile' | 'web' | 'desktop' | 'xr';
  syncTypes: ('chat' | 'ai' | 'tokens' | 'media')[];
  lastSyncVersion: {
    chat?: number;
    ai?: number;
    tokens?: number;
    media?: number;
  };
}

export interface SyncResponse {
  success: boolean;
  syncedAt: FirebaseFirestore.Timestamp;
  updates: {
    chat?: any[];
    ai?: any[];
    tokens?: any;
    media?: any[];
  };
  conflicts?: SyncConflict[];
  newVersion: {
    chat: number;
    ai: number;
    tokens: number;
    media: number;
  };
}

export interface OfflineQueueResult {
  processed: number;
  succeeded: number;
  failed: number;
  expired: number;
  errors: Array<{
    queueId: string;
    error: string;
  }>;
}