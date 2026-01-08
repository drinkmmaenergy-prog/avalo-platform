/**
 * PACK 55 — Media Compliance Integration
 * Integration hooks for PACK 47 Media Cloud Delivery
 */

import { triggerMediaSafetyScan, MediaSource } from './compliancePack55';

/**
 * Hook to call after media upload (from PACK 47)
 * This triggers the CSAM safety scan pipeline
 */
export async function onMediaUploaded(
  mediaId: string,
  ownerUserId: string,
  source: MediaSource,
  storagePath: string
): Promise<void> {
  try {
    await triggerMediaSafetyScan(mediaId, ownerUserId, source, storagePath);
    console.log(`[MediaCompliance] Triggered safety scan for media ${mediaId}`);
  } catch (error: any) {
    console.error(`[MediaCompliance] Error triggering scan for media ${mediaId}:`, error);
    // Don't throw - allow upload to complete even if scan initiation fails
    // Scan can be retried later via admin tools
  }
}

/**
 * Helper to generate media ID for different sources
 */
export function generateMediaId(source: MediaSource, identifier: string): string {
  return `${source}_${identifier}`;
}

/**
 * Example usage patterns:
 * 
 * // When PPM media is uploaded in chat:
 * const mediaId = generateMediaId('CHAT_PPM', `${conversationId}_${messageId}`);
 * await onMediaUploaded(mediaId, userId, 'CHAT_PPM', storagePath);
 * 
 * // When profile media is uploaded:
 * const mediaId = generateMediaId('PROFILE_MEDIA', photoId);
 * await onMediaUploaded(mediaId, userId, 'PROFILE_MEDIA', storagePath);
 * 
 * // When marketplace/creator content is uploaded:
 * const mediaId = generateMediaId('MARKETPLACE', contentId);
 * await onMediaUploaded(mediaId, userId, 'MARKETPLACE', storagePath);
 */