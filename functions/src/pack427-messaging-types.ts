/**
 * PACK 427 - Global Messaging Queue, Offline Sync & Real-Time Delivery Engine
 * 
 * Type definitions for message queue, sync, and real-time signaling
 * 
 * Dependencies:
 * - PACK 37/268 (Chat Core)
 * - PACK 273 (Paid Chat Engine)
 * - PACK 293 (Notifications)
 * - PACK 296 (Audit Log)
 * - PACK 426 (Multi-Region Infrastructure)
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Supported regions aligned with PACK 426
 */
export type Region = 'EU' | 'US' | 'APAC';

/**
 * Message delivery status
 */
export type MessageStatus = 'PENDING' | 'DELIVERED' | 'FAILED' | 'DROPPED';

/**
 * Billing state - reuses existing billing model from PACK 273
 * MUST NOT introduce new billing logic
 */
export type BillingState = 'NOT_BILLED' | 'BILLED' | 'REFUNDED';

/**
 * Transport metadata for debugging and analytics
 */
export interface TransportMetadata {
  deviceId?: string;
  appVersion?: string;
  networkType?: 'wifi' | 'cellular' | 'unknown';
  systemNudge?: boolean; // For PACK 301/301B retention flows
}

/**
 * Queued message in the global delivery queue
 * 
 * Firestore path: regions/{regionId}/messageQueue/{messageId}
 */
export interface QueuedMessage {
  /**
   * Unique identifier (ULID format for time-ordered IDs)
   */
  id: string;

  /**
   * Reference to the chat this message belongs to
   */
  chatId: string;

  /**
   * User ID of the sender
   */
  senderId: string;

  /**
   * User ID of the recipient
   */
  recipientId: string;

  /**
   * Region where message was created (EU, US, APAC)
   */
  region: Region;

  /**
   * Pointer to existing message document in chat collection
   * Format: "chats/{chatId}/messages/{messageId}"
   */
  contentRef: string;

  /**
   * Current delivery status
   */
  status: MessageStatus;

  /**
   * Number of delivery attempts (for exponential backoff)
   */
  attempts: number;

  /**
   * Billing state - linked to PACK 273 billing logic
   * This field is READ-ONLY for this pack
   */
  billingState: BillingState;

  /**
   * Transport and device metadata
   */
  transportMetadata: TransportMetadata;

  /**
   * Message creation timestamp
   */
  createdAt: Timestamp;

  /**
   * Last update timestamp
   */
  updatedAt: Timestamp;

  /**
   * Optional: scheduled delivery time (for delayed messages)
   */
  scheduledAt?: Timestamp;
}

/**
 * Device sync state for offline sync
 * 
 * Firestore path: regions/{regionId}/deviceSyncStates/{userId_deviceId}
 */
export interface DeviceSyncState {
  /**
   * User ID
   */
  userId: string;

  /**
   * Unique device identifier
   */
  deviceId: string;

  /**
   * Last successful sync timestamp
   */
  lastSyncAt: Timestamp;

  /**
   * Timestamp of last message synced to this device
   */
  lastMessageTimestamp: Timestamp;

  /**
   * Last known region for this device
   */
  lastRegion: Region;

  /**
   * Device platform info
   */
  platform?: 'ios' | 'android' | 'web';

  /**
   * App version on this device
   */
  appVersion?: string;
}

/**
 * Typing indicator event with TTL
 * 
 * Firestore path: regions/{regionId}/typingEvents/{eventId}
 */
export interface TypingEvent {
  /**
   * Unique event ID
   */
  id: string;

  /**
   * Chat where typing is happening
   */
  chatId: string;

  /**
   * User who is typing
   */
  userId: string;

  /**
   * Whether user is currently typing
   */
  isTyping: boolean;

  /**
   * Region where event originated
   */
  region: Region;

  /**
   * When this event expires (TTL ~10 seconds)
   */
  expiresAt: Timestamp;

  /**
   * Event creation timestamp
   */
  createdAt: Timestamp;
}

/**
 * Read receipt tracking
 */
export interface ReadReceipt {
  /**
   * Chat ID
   */
  chatId: string;

  /**
   * User who read the messages
   */
  userId: string;

  /**
   * Last message ID read by this user
   */
  readUpToMessageId: string;

  /**
   * Timestamp of last read message
   */
  readUpToTimestamp: Timestamp;

  /**
   * When receipt was recorded
   */
  updatedAt: Timestamp;
}

/**
 * Unread counter per chat per user
 */
export interface UnreadCounter {
  /**
   * Chat ID
   */
  chatId: string;

  /**
   * User ID
   */
  userId: string;

  /**
   * Number of unread messages
   */
  count: number;

  /**
   * Last updated timestamp
   */
  updatedAt: Timestamp;
}

/**
 * Message delivery result
 */
export interface DeliveryResult {
  success: boolean;
  messageId: string;
  error?: string;
  attempts: number;
}

/**
 * Sync result returned to client
 */
export interface SyncResult {
  /**
   * List of messages to sync to device
   */
  messages: Array<{
    messageId: string;
    chatId: string;
    contentRef: string;
    timestamp: Timestamp;
  }>;

  /**
   * New sync timestamp for client to store
   */
  newSyncTimestamp: Timestamp;

  /**
   * Whether more messages are available
   */
  hasMore: boolean;
}

/**
 * Request to enqueue a message
 */
export interface EnqueueMessageRequest {
  chatId: string;
  senderId: string;
  recipientId: string;
  messageRefId: string;
  region: Region;
  transportMetadata?: TransportMetadata;
}

/**
 * Constants for queue configuration
 */
export const QUEUE_CONSTANTS = {
  /**
   * Maximum delivery attempts before marking as DROPPED
   */
  MAX_ATTEMPTS: 5,

  /**
   * Base delay in milliseconds for exponential backoff
   */
  BASE_DELAY_MS: 1000,

  /**
   * Maximum delay between retries (1 hour)
   */
  MAX_DELAY_MS: 3600000,

  /**
   * Batch size for processing queue
   */
  BATCH_SIZE: 200,

  /**
   * Typing indicator TTL in seconds
   */
  TYPING_TTL_SECONDS: 10,

  /**
   * Maximum messages per sync request
   */
  SYNC_BATCH_SIZE: 100,

  /**
   * Fraud detection: max messages per minute per user
   */
  MAX_MESSAGES_PER_MINUTE: 60,
} as const;

/**
 * Error codes for messaging queue
 */
export enum MessageQueueError {
  USER_BLOCKED = 'USER_BLOCKED',
  USER_BANNED = 'USER_BANNED',
  SAFETY_VIOLATION = 'SAFETY_VIOLATION',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  BILLING_FAILED = 'BILLING_FAILED',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  REGION_UNAVAILABLE = 'REGION_UNAVAILABLE',
}
