/**
 * PACK 287: Chat Media Monetization
 * 
 * Implements media messages in chat with proper billing and safety.
 * 
 * Key Features:
 * - Photos, videos, and voice notes in chat
 * - 65/35 split for earnOn, 100% Avalo for earnOff
 * - Media is always paid (no free windows)
 * - VIP/Royal subscriptions don't affect media pricing
 * - NSFW classification and content policy enforcement
 * - Report functionality for media messages
 */

import { db, serverTimestamp, increment, generateId } from './init.js';
import type { Timestamp } from 'firebase-admin/firestore';

// Simple error class
class HttpsError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'HttpsError';
  }
}

// Simple logger
const logger = {
  info: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
};

// ============================================================================
// TYPES
// ============================================================================

export type MediaMessageType = 'media_photo' | 'media_video' | 'media_voice';

export type NSFWFlag = 'unknown' | 'safe' | 'soft' | 'erotic' | 'blocked';

export type BillingMode = 'FREE' | 'PAID';

export type ReportReason = 
  | 'illegal' 
  | 'minor_suspicion' 
  | 'explicit_violence' 
  | 'hate' 
  | 'spam' 
  | 'other';

export interface MediaMetadata {
  storagePath: string;
  url: string;
  thumbUrl?: string;              // for photo/video
  durationSeconds?: number;       // for video/voice
  sizeBytes: number;
  nsfwFlag: NSFWFlag;
  blockedReason: 'NONE' | 'POLICY_VIOLATION';
}

export interface MediaBilling {
  mode: BillingMode;
  priceTokens: number;
  chargedTokens: number;
  platformShareTokens: number;
  earnerShareTokens: number;
  paidByUserId: string | null;
  refundable: boolean;
}

export interface ChatMediaMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  receiverId: string;
  type: 'text' | MediaMessageType;
  text?: string;
  media?: MediaMetadata;
  billing: MediaBilling;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deleted: boolean;
}

export interface MessageReport {
  reportId: string;
  messageId: string;
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  resolution?: string;
}

export interface MediaUploadMetadata {
  uploadId: string;
  userId: string;
  chatId: string;
  type: MediaMessageType;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  tempStoragePath: string;
  finalStoragePath?: string;
  uploadedAt: Timestamp;
  processedAt?: Timestamp;
  error?: string;
  media?: MediaMetadata;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Media pricing in tokens (fixed rates, separate from text chat)
 * These are NOT affected by VIP/Royal subscriptions
 */
export const CHAT_MEDIA_PRICING = {
  photo: 50,        // 50 tokens per photo
  video: 80,        // 80 tokens per short video
  voice: 30         // 30 tokens per voice note
} as const;

/**
 * Media limits
 */
export const MEDIA_LIMITS = {
  // Duration limits (seconds)
  maxVideoDuration: 30,
  maxVoiceDuration: 60,
  
  // Size limits (bytes)
  maxPhotoSize: 10 * 1024 * 1024,      // 10MB
  maxVideoSize: 50 * 1024 * 1024,      // 50MB
  maxVoiceSize: 5 * 1024 * 1024,       // 5MB
} as const;

/**
 * Revenue split percentages
 * - earnOn: 65% earner / 35% Avalo
 * - earnOff: 100% Avalo (EARN_OFF_AVALO_100)
 */
const MEDIA_REVENUE_SPLIT = {
  earnerPercent: 65,
  platformPercent: 35
} as const;

// ============================================================================
// PRICING & BILLING
// ============================================================================

/**
 * Get price for media type
 */
export function getMediaPrice(type: MediaMessageType): number {
  switch (type) {
    case 'media_photo':
      return CHAT_MEDIA_PRICING.photo;
    case 'media_video':
      return CHAT_MEDIA_PRICING.video;
    case 'media_voice':
      return CHAT_MEDIA_PRICING.voice;
    default:
      throw new HttpsError('invalid-argument', `Unknown media type: ${type}`);
  }
}

/**
 * Calculate billing for a media message
 * 
 * Rules:
 * - Media is ALWAYS paid (no free windows)
 * - VIP/Royal subscriptions don't affect media pricing
 * - payerId from chat determines who pays
 * - earnOn: 65% earner / 35% Avalo
 * - earnOff: 100% Avalo
 */
export async function calculateMediaBilling(
  chatId: string,
  mediaType: MediaMessageType,
  senderId: string
): Promise<MediaBilling> {
  
  // Get chat to determine payer and earner
  const chatSnap = await db.collection('chats').doc(chatId).get();
  
  if (!chatSnap.exists) {
    throw new HttpsError('not-found', 'Chat not found');
  }
  
  const chat = chatSnap.data() as any;
  const payerId = chat.roles.payerId as string;
  const earnerId = chat.roles.earnerId as string | null;
  
  // Get media price (fixed, no subscription discounts)
  const priceTokens = getMediaPrice(mediaType);
  
  // Calculate split based on earner status
  let platformShareTokens: number;
  let earnerShareTokens: number;
  
  if (earnerId === null) {
    // earnOff mode: 100% to Avalo (EARN_OFF_AVALO_100)
    platformShareTokens = priceTokens;
    earnerShareTokens = 0;
  } else {
    // earnOn mode: 65% earner / 35% platform
    platformShareTokens = Math.floor(priceTokens * MEDIA_REVENUE_SPLIT.platformPercent / 100);
    earnerShareTokens = priceTokens - platformShareTokens;
  }
  
  return {
    mode: 'PAID',
    priceTokens,
    chargedTokens: priceTokens,
    platformShareTokens,
    earnerShareTokens,
    paidByUserId: payerId,
    refundable: false  // Media is non-refundable
  };
}

/**
 * Process media message billing
 * Charges the payer and credits the earner
 */
export async function processMediaBilling(
  chatId: string,
  messageId: string,
  billing: MediaBilling
): Promise<{ success: boolean; error?: string }> {
  
  if (billing.mode !== 'PAID' || !billing.paidByUserId) {
    throw new HttpsError('invalid-argument', 'Invalid billing mode for media');
  }
  
  const payerId = billing.paidByUserId;
  const priceTokens = billing.chargedTokens;
  
  // Check payer's wallet balance
  const walletRef = db.collection('users').doc(payerId).collection('wallet').doc('current');
  const walletSnap = await walletRef.get();
  const wallet = walletSnap.data();
  
  if (!wallet || wallet.balance < priceTokens) {
    return {
      success: false,
      error: `Insufficient tokens. Need ${priceTokens} tokens.`
    };
  }
  
  // Get chat to determine earner
  const chatSnap = await db.collection('chats').doc(chatId).get();
  const chat = chatSnap.data() as any;
  const earnerId = chat.roles.earnerId as string | null;
  
  // Execute billing transaction
  await db.runTransaction(async (transaction) => {
    // Deduct from payer
    transaction.update(walletRef, {
      balance: increment(-priceTokens),
      spent: increment(priceTokens)
    });
    
    // Record payer transaction
    const payerTxRef = db.collection('transactions').doc(generateId());
    transaction.set(payerTxRef, {
      userId: payerId,
      type: 'chat_media',
      amount: -priceTokens,
      metadata: {
        chatId,
        messageId,
        purpose: 'media_message',
        platformShare: billing.platformShareTokens,
        earnerShare: billing.earnerShareTokens
      },
      createdAt: serverTimestamp()
    });
    
    // Credit earner if exists
    if (earnerId && billing.earnerShareTokens > 0) {
      const earnerWalletRef = db.collection('users').doc(earnerId).collection('wallet').doc('current');
      transaction.update(earnerWalletRef, {
        balance: increment(billing.earnerShareTokens),
        earned: increment(billing.earnerShareTokens)
      });
      
      // Record earner transaction
      const earnerTxRef = db.collection('transactions').doc(generateId());
      transaction.set(earnerTxRef, {
        userId: earnerId,
        type: 'chat_media_earned',
        amount: billing.earnerShareTokens,
        metadata: {
          chatId,
          messageId,
          payerId,
          purpose: 'media_message_earnings'
        },
        createdAt: serverTimestamp()
      });
    }
    
    // Platform fee (always recorded, whether earnOn or earnOff)
    const platformTxRef = db.collection('transactions').doc(generateId());
    transaction.set(platformTxRef, {
      userId: 'platform',
      type: 'platform_fee',
      amount: billing.platformShareTokens,
      metadata: {
        chatId,
        messageId,
        source: 'chat_media',
        payerId
      },
      createdAt: serverTimestamp()
    });
  });
  
  // Track fan/kiss progression (async, non-blocking)
  if (earnerId) {
    try {
      const { trackTokenSpend } = await import('./fanKissEconomy.js');
      await trackTokenSpend(payerId, earnerId, priceTokens, 'chat');
    } catch (error) {
      logger.error('Failed to track fan spend:', error);
    }
  }
  
  // Track romantic journey (async, non-blocking)
  if (earnerId) {
    try {
      const { onChatMessageSent } = await import('./romanticJourneysIntegration.js');
      await onChatMessageSent(payerId, earnerId, priceTokens);
    } catch (error) {
      logger.error('Failed to track journey activity:', error);
    }
  }
  
  return { success: true };
}

// ============================================================================
// MEDIA MESSAGE CREATION
// ============================================================================

/**
 * Create a media message after billing and NSFW check
 * This is called after:
 * 1. Media is uploaded to temp storage
 * 2. NSFW classification is complete
 * 3. Billing is successful
 */
export async function createMediaMessage(
  chatId: string,
  senderId: string,
  receiverId: string,
  mediaType: MediaMessageType,
  media: MediaMetadata,
  billing: MediaBilling
): Promise<string> {
  
  const messageId = generateId();
  const now = serverTimestamp();
  
  const message: any = {
    messageId,
    chatId,
    senderId,
    receiverId,
    type: mediaType,
    media,
    billing,
    createdAt: now,
    updatedAt: now,
    deleted: false
  };
  
  await db.collection('chatMessages').doc(messageId).set(message);
  
  // Update chat's lastActivityAt
  await db.collection('chats').doc(chatId).update({
    lastActivityAt: now,
    updatedAt: now
  });
  
  return messageId;
}

// ============================================================================
// REPORTING
// ============================================================================

/**
 * Create a report for a media message
 */
export async function reportMediaMessage(
  messageId: string,
  reporterId: string,
  reason: ReportReason,
  details?: string
): Promise<string> {
  
  // Get message to validate
  const messageSnap = await db.collection('chatMessages').doc(messageId).get();
  
  if (!messageSnap.exists) {
    throw new HttpsError('not-found', 'Message not found');
  }
  
  const message = messageSnap.data() as ChatMediaMessage;
  
  // Validate reporter is a participant
  if (reporterId !== message.senderId && reporterId !== message.receiverId) {
    throw new HttpsError('permission-denied', 'Only chat participants can report messages');
  }
  
  const reportId = generateId();
  const now = serverTimestamp();
  
  const report: any = {
    reportId,
    messageId,
    reporterId,
    reportedUserId: message.senderId,
    reason,
    details,
    status: 'pending',
    createdAt: now,
    updatedAt: now
  };
  
  await db.collection('messageReports').doc(reportId).set(report);
  
  // Record risk event for trust engine (async, non-blocking)
  try {
    const { recordRiskEvent } = await import('./trustEngine.js');
    await recordRiskEvent({
      userId: message.senderId,
      eventType: 'chat' as any,
      metadata: {
        reportId,
        messageId,
        reason,
        mediaType: message.type,
        reporterId,
        source: 'media_report'
      }
    });
  } catch (error) {
    logger.error('Failed to record risk event:', error);
  }
  
  // If reason is critical (minor_suspicion, illegal), trigger immediate review
  if (reason === 'minor_suspicion' || reason === 'illegal') {
    try {
      const { createCsamIncident, applyImmediateProtectiveActions } = await import('./csamShield.js');
      const incidentId = await createCsamIncident({
        userId: message.senderId,
        source: 'manual_report' as any,
        detectionChannel: 'user_report',
        riskLevel: 'HIGH',
        contentSnippet: `Media message reported: ${reason}`,
        messageIds: [messageId]
      });
      
      await applyImmediateProtectiveActions(message.senderId, 'HIGH', incidentId);
      
      logger.warn(`Critical report for message ${messageId}, incident created: ${incidentId}`);
    } catch (error) {
      logger.error('Failed to create CSAM incident:', error);
    }
  }
  
  return reportId;
}

/**
 * Update report status (moderator action)
 */
export async function updateReportStatus(
  reportId: string,
  moderatorId: string,
  status: 'reviewing' | 'resolved' | 'dismissed',
  resolution?: string
): Promise<void> {
  
  const updateData: any = {
    status,
    updatedAt: serverTimestamp()
  };
  
  if (status === 'resolved' || status === 'dismissed') {
    updateData.resolvedAt = serverTimestamp();
    updateData.resolvedBy = moderatorId;
    if (resolution) {
      updateData.resolution = resolution;
    }
  }
  
  await db.collection('messageReports').doc(reportId).update(updateData);
}

// ============================================================================
// NSFW CLASSIFICATION
// ============================================================================

/**
 * Validate content policy for media
 * Returns true if content passes, false if blocked
 */
export async function validateContentPolicy(
  mediaType: MediaMessageType,
  storagePath: string
): Promise<{ 
  passed: boolean; 
  nsfwFlag: NSFWFlag; 
  blockedReason: string;
}> {
  
  // This is a placeholder for actual NSFW/content classification
  // In production, this would:
  // 1. Download the media from storage
  // 2. Run it through ML models (Google Vision API, custom models, etc.)
  // 3. Check for policy violations:
  //    - No minors / young-looking content
  //    - No explicit genitals close-up
  //    - No visible sexual acts
  //    - No gore, hate symbols
  //    - No CSAM indicators
  
  try {
    // For photos/videos, use vision API
    if (mediaType === 'media_photo' || mediaType === 'media_video') {
      // Placeholder: In production, call actual ML service
      // const result = await visionAPI.detectSafeSearch(storagePath);
      
      // For now, return safe by default
      // TODO: Integrate with actual NSFW classifier
      return {
        passed: true,
        nsfwFlag: 'safe',
        blockedReason: 'NONE'
      };
    }
    
    // For voice notes, less strict checking (mainly hate speech detection)
    if (mediaType === 'media_voice') {
      // Placeholder: In production, use speech-to-text + text moderation
      return {
        passed: true,
        nsfwFlag: 'safe',
        blockedReason: 'NONE'
      };
    }
    
    return {
      passed: true,
      nsfwFlag: 'safe',
      blockedReason: 'NONE'
    };
    
  } catch (error) {
    logger.error('Content policy validation failed:', error);
    // On error, fail safe: block the content
    return {
      passed: false,
      nsfwFlag: 'blocked',
      blockedReason: 'POLICY_VIOLATION'
    };
  }
}

/**
 * Update NSFW flag for a message after processing
 */
export async function updateMediaNSFWFlag(
  messageId: string,
  nsfwFlag: NSFWFlag,
  blockedReason: string
): Promise<void> {
  
  await db.collection('chatMessages').doc(messageId).update({
    'media.nsfwFlag': nsfwFlag,
    'media.blockedReason': blockedReason,
    updatedAt: serverTimestamp()
  });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get media type from file extension
 */
export function getMediaTypeFromExtension(filename: string): MediaMessageType {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  if (['jpg', 'jpeg', 'png'].includes(ext || '')) {
    return 'media_photo';
  }
  
  if (['mp4', 'mov', 'avi'].includes(ext || '')) {
    return 'media_video';
  }
  
  if (['mp3', 'm4a', 'wav', 'webm'].includes(ext || '')) {
    return 'media_voice';
  }
  
  throw new HttpsError('invalid-argument', `Unsupported file type: ${ext}`);
}

/**
 * Validate media file size and duration
 */
export function validateMediaLimits(
  mediaType: MediaMessageType,
  sizeBytes: number,
  durationSeconds?: number
): { valid: boolean; error?: string } {
  
  // Check size limits
  switch (mediaType) {
    case 'media_photo':
      if (sizeBytes > MEDIA_LIMITS.maxPhotoSize) {
        return {
          valid: false,
          error: `Photo size exceeds limit (${MEDIA_LIMITS.maxPhotoSize / 1024 / 1024}MB)`
        };
      }
      break;
      
    case 'media_video':
      if (sizeBytes > MEDIA_LIMITS.maxVideoSize) {
        return {
          valid: false,
          error: `Video size exceeds limit (${MEDIA_LIMITS.maxVideoSize / 1024 / 1024}MB)`
        };
      }
      if (durationSeconds && durationSeconds > MEDIA_LIMITS.maxVideoDuration) {
        return {
          valid: false,
          error: `Video duration exceeds limit (${MEDIA_LIMITS.maxVideoDuration}s)`
        };
      }
      break;
      
    case 'media_voice':
      if (sizeBytes > MEDIA_LIMITS.maxVoiceSize) {
        return {
          valid: false,
          error: `Voice note size exceeds limit (${MEDIA_LIMITS.maxVoiceSize / 1024 / 1024}MB)`
        };
      }
      if (durationSeconds && durationSeconds > MEDIA_LIMITS.maxVoiceDuration) {
        return {
          valid: false,
          error: `Voice note duration exceeds limit (${MEDIA_LIMITS.maxVoiceDuration}s)`
        };
      }
      break;
  }
  
  return { valid: true };
}
