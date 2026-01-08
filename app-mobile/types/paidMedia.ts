/**
 * PACK 80 — Cross-Chat Media Paywall
 * TypeScript types and interfaces for locked photos & videos inside chat messages
 */

import { Timestamp } from 'firebase/firestore';

// ============================================================================
// CONSTANTS
// ============================================================================

export const PAID_MEDIA_CONFIG = {
  // Commission split
  AVALO_COMMISSION: 0.35,
  CREATOR_SHARE: 0.65,
  
  // Media limits
  MAX_IMAGE_SIZE_MB: 15,
  MAX_VIDEO_SIZE_MB: 80,
  MAX_VIDEO_DURATION_SEC: 25,
  
  // Convert to bytes
  MAX_IMAGE_SIZE_BYTES: 15 * 1024 * 1024,
  MAX_VIDEO_SIZE_BYTES: 80 * 1024 * 1024,
  
  // Pricing tiers (predefined options)
  PRICING_TIERS: [5, 10, 25, 50, 100, 250, 500],
  
  // Minimum and maximum price
  MIN_PRICE: 5,
  MAX_PRICE: 10000,
} as const;

// ============================================================================
// ENUMS
// ============================================================================

export enum PaidMediaType {
  IMAGE = 'image',
  VIDEO = 'video',
}

export enum PaidMediaStatus {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export enum PaidMediaErrorCode {
  INSUFFICIENT_TOKENS = 'insufficient_tokens',
  SELF_UNLOCK = 'self_unlock',
  ALREADY_UNLOCKED = 'already_unlocked',
  MEDIA_NOT_FOUND = 'media_not_found',
  INVALID_PRICE = 'invalid_price',
  FILE_TOO_LARGE = 'file_too_large',
  VIDEO_TOO_LONG = 'video_too_long',
  UPLOAD_FAILED = 'upload_failed',
  PROCESSING_FAILED = 'processing_failed',
  UNAUTHORIZED = 'unauthorized',
  NETWORK_ERROR = 'network_error',
  TRANSACTION_FAILED = 'transaction_failed',
  INVALID_MEDIA_TYPE = 'invalid_media_type',
}

// ============================================================================
// FIRESTORE MODELS
// ============================================================================

/**
 * Paid Media Message (Firestore: paid_media_messages)
 */
export interface PaidMediaMessage {
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  mediaUrl: string;           // Firebase Storage download URL
  mediaType: PaidMediaType;
  priceTokens: number;
  createdAt: Date | Timestamp;
  
  // Additional metadata
  status: PaidMediaStatus;
  storagePath: string;        // Firebase Storage path
  thumbnailUrl?: string;      // Blurred thumbnail for preview
  mediaDuration?: number;     // For videos (in seconds)
  mediaWidth?: number;
  mediaHeight?: number;
  compressedSize?: number;    // Final file size after compression
  originalSize?: number;      // Original file size
}

/**
 * Paid Media Unlock (Firestore: paid_media_unlocks)
 */
export interface PaidMediaUnlock {
  id: string;
  userId: string;             // The buyer who unlocked
  mediaId: string;            // Reference to paid_media_messages.id
  chatId: string;
  unlockedAt: Date | Timestamp;
  tokensSpent: number;
  transactionId: string;      // Reference to transactions collection
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to send paid media
 */
export interface SendPaidMediaRequest {
  chatId: string;
  recipientId: string;
  mediaType: PaidMediaType;
  priceTokens: number;
  localUri: string;           // Local file URI on device
  mediaDuration?: number;     // For video validation
}

/**
 * Response from send paid media
 */
export interface SendPaidMediaResponse {
  success: boolean;
  mediaId?: string;
  error?: string;
  errorCode?: PaidMediaErrorCode;
}

/**
 * Request to unlock paid media
 */
export interface UnlockPaidMediaRequest {
  mediaId: string;
  chatId: string;
}

/**
 * Response from unlock paid media
 */
export interface UnlockPaidMediaResponse {
  success: boolean;
  mediaUrl?: string;
  transactionId?: string;
  error?: string;
  errorCode?: PaidMediaErrorCode;
}

/**
 * Check unlock status request
 */
export interface CheckUnlockStatusRequest {
  mediaId: string;
  userId: string;
}

/**
 * Check unlock status response
 */
export interface CheckUnlockStatusResponse {
  isUnlocked: boolean;
  unlockedAt?: Date;
}

// ============================================================================
// UI/CLIENT TYPES
// ============================================================================

/**
 * Media selection result from picker
 */
export interface MediaPickerResult {
  uri: string;
  type: PaidMediaType;
  width?: number;
  height?: number;
  duration?: number;
  fileSize?: number;
}

/**
 * Upload progress tracking
 */
export interface UploadProgress {
  mediaId: string;
  progress: number;           // 0-100
  status: 'uploading' | 'processing' | 'complete' | 'failed';
  error?: string;
}

/**
 * Paid media display info for chat bubble
 */
export interface PaidMediaDisplayInfo {
  mediaId: string;
  mediaType: PaidMediaType;
  priceTokens: number;
  thumbnailUrl?: string;
  isUnlocked: boolean;
  isSender: boolean;
  status: PaidMediaStatus;
  mediaUrl?: string;          // Only if unlocked
  mediaDuration?: number;     // For videos
  dimensions?: {
    width: number;
    height: number;
  };
}

/**
 * Unlock modal state
 */
export interface UnlockModalState {
  isVisible: boolean;
  media: PaidMediaMessage | null;
  isProcessing: boolean;
  error?: string;
}

/**
 * Media pricing tier
 */
export interface PricingTier {
  tokens: number;
  label: string;
  isPopular?: boolean;
}

// ============================================================================
// ANALYTICS EVENTS
// ============================================================================

export interface PaidMediaAnalyticsEvent {
  eventName: 'paid_media_sent' | 'paid_media_unlock' | 'paid_media_earnings' | 'paid_media_viewed';
  userId: string;
  mediaId: string;
  chatId: string;
  metadata?: Record<string, any>;
}

export interface PaidMediaSentEvent extends PaidMediaAnalyticsEvent {
  eventName: 'paid_media_sent';
  metadata: {
    mediaType: PaidMediaType;
    priceTokens: number;
    fileSize: number;
    recipientId: string;
  };
}

export interface PaidMediaUnlockEvent extends PaidMediaAnalyticsEvent {
  eventName: 'paid_media_unlock';
  metadata: {
    mediaType: PaidMediaType;
    tokensSpent: number;
    senderId: string;
  };
}

export interface PaidMediaEarningsEvent extends PaidMediaAnalyticsEvent {
  eventName: 'paid_media_earnings';
  metadata: {
    tokensEarned: number;
    buyerId: string;
    mediaType: PaidMediaType;
  };
}

export interface PaidMediaViewedEvent extends PaidMediaAnalyticsEvent {
  eventName: 'paid_media_viewed';
  metadata: {
    mediaType: PaidMediaType;
    wasUnlocked: boolean;
  };
}

// ============================================================================
// PUSH NOTIFICATION TYPES
// ============================================================================

export interface PaidMediaUnlockedNotification {
  type: 'paid_media_unlocked';
  mediaId: string;
  buyerId: string;
  tokensEarned: number;
  chatId: string;
  timestamp: Date;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

export interface MediaValidationResult {
  isValid: boolean;
  error?: PaidMediaErrorCode;
  errorMessage?: string;
  warnings?: string[];
}

export interface PriceValidationResult {
  isValid: boolean;
  error?: string;
  adjustedPrice?: number;
}

// ============================================================================
// HOOK RETURN TYPES
// ============================================================================

export interface UsePaidMediaReturn {
  sendPaidMedia: (params: SendPaidMediaRequest) => Promise<SendPaidMediaResponse>;
  unlockPaidMedia: (mediaId: string) => Promise<UnlockPaidMediaResponse>;
  checkUnlockStatus: (mediaId: string) => Promise<boolean>;
  uploadProgress: UploadProgress | null;
  isLoading: boolean;
  error: string | null;
}

export interface UsePaidMediaAccessReturn {
  isUnlocked: boolean;
  isChecking: boolean;
  checkAccess: () => Promise<void>;
  mediaUrl?: string;
}

export interface UsePaidMediaListReturn {
  paidMediaMessages: PaidMediaMessage[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// ============================================================================
// COMPRESSION TYPES
// ============================================================================

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeMB?: number;
}

export interface CompressionResult {
  uri: string;
  width: number;
  height: number;
  size: number;
  compressedBy: number;       // Percentage
}

export interface VideoCompressionOptions extends CompressionOptions {
  bitrate?: number;
  maxDuration?: number;
}

export interface VideoCompressionResult extends CompressionResult {
  duration: number;
  thumbnailUri?: string;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export interface PaidMediaError {
  code: PaidMediaErrorCode;
  message: string;
  details?: any;
}

/**
 * Format error message for display
 */
export function formatPaidMediaError(code: PaidMediaErrorCode): string {
  const errorMessages: Record<PaidMediaErrorCode, string> = {
    [PaidMediaErrorCode.INSUFFICIENT_TOKENS]: 'Not enough tokens to unlock this media',
    [PaidMediaErrorCode.SELF_UNLOCK]: 'You cannot unlock your own media',
    [PaidMediaErrorCode.ALREADY_UNLOCKED]: 'You have already unlocked this media',
    [PaidMediaErrorCode.MEDIA_NOT_FOUND]: 'Media not found',
    [PaidMediaErrorCode.INVALID_PRICE]: 'Invalid price. Must be between 5 and 10,000 tokens',
    [PaidMediaErrorCode.FILE_TOO_LARGE]: 'File size exceeds the maximum allowed',
    [PaidMediaErrorCode.VIDEO_TOO_LONG]: 'Video duration exceeds 25 seconds',
    [PaidMediaErrorCode.UPLOAD_FAILED]: 'Failed to upload media. Please try again',
    [PaidMediaErrorCode.PROCESSING_FAILED]: 'Failed to process media. Please try again',
    [PaidMediaErrorCode.UNAUTHORIZED]: 'You are not authorized to perform this action',
    [PaidMediaErrorCode.NETWORK_ERROR]: 'Network error. Please check your connection',
    [PaidMediaErrorCode.TRANSACTION_FAILED]: 'Transaction failed. Please try again',
    [PaidMediaErrorCode.INVALID_MEDIA_TYPE]: 'Invalid media type',
  };

  return errorMessages[code] || 'An unknown error occurred';
}

/**
 * Generate pricing tier options
 */
export function getPricingTiers(): PricingTier[] {
  return PAID_MEDIA_CONFIG.PRICING_TIERS.map((tokens, index) => ({
    tokens,
    label: `${tokens} tokens`,
    isPopular: index === 2, // Mark 25 tokens as popular
  }));
}

/**
 * Calculate earnings for creator (65% after 35% commission)
 */
export function calculateCreatorEarnings(priceTokens: number): number {
  return Math.floor(priceTokens * PAID_MEDIA_CONFIG.CREATOR_SHARE);
}

/**
 * Calculate Avalo commission (35%)
 */
export function calculateAvaloCommission(priceTokens: number): number {
  return Math.floor(priceTokens * PAID_MEDIA_CONFIG.AVALO_COMMISSION);
}

/**
 * Validate media price
 */
export function validatePrice(price: number): PriceValidationResult {
  if (!Number.isInteger(price)) {
    return {
      isValid: false,
      error: 'Price must be a whole number',
    };
  }

  if (price < PAID_MEDIA_CONFIG.MIN_PRICE) {
    return {
      isValid: false,
      error: `Minimum price is ${PAID_MEDIA_CONFIG.MIN_PRICE} tokens`,
      adjustedPrice: PAID_MEDIA_CONFIG.MIN_PRICE,
    };
  }

  if (price > PAID_MEDIA_CONFIG.MAX_PRICE) {
    return {
      isValid: false,
      error: `Maximum price is ${PAID_MEDIA_CONFIG.MAX_PRICE} tokens`,
      adjustedPrice: PAID_MEDIA_CONFIG.MAX_PRICE,
    };
  }

  return { isValid: true };
}

/**
 * Validate media file
 */
export function validateMediaFile(
  fileSize: number,
  mediaType: PaidMediaType,
  duration?: number
): MediaValidationResult {
  // Check file size
  const maxSize = mediaType === PaidMediaType.IMAGE
    ? PAID_MEDIA_CONFIG.MAX_IMAGE_SIZE_BYTES
    : PAID_MEDIA_CONFIG.MAX_VIDEO_SIZE_BYTES;

  if (fileSize > maxSize) {
    return {
      isValid: false,
      error: PaidMediaErrorCode.FILE_TOO_LARGE,
      errorMessage: `File size (${(fileSize / 1024 / 1024).toFixed(1)}MB) exceeds maximum of ${maxSize / 1024 / 1024}MB`,
    };
  }

  // Check video duration
  if (mediaType === PaidMediaType.VIDEO && duration) {
    if (duration > PAID_MEDIA_CONFIG.MAX_VIDEO_DURATION_SEC) {
      return {
        isValid: false,
        error: PaidMediaErrorCode.VIDEO_TOO_LONG,
        errorMessage: `Video duration (${duration.toFixed(1)}s) exceeds maximum of ${PAID_MEDIA_CONFIG.MAX_VIDEO_DURATION_SEC}s`,
      };
    }
  }

  return { isValid: true };
}