/**
 * PACK 87 — Enforcement & Account State Machine
 * Integration examples for existing endpoints
 * 
 * This file shows how to integrate enforcement checks into various endpoints.
 * Copy these patterns into your actual endpoint files.
 */

import {
  checkCanSendMessages,
  checkCanSendGifts,
  checkCanSendPaidMedia,
  checkCanPublishPremiumStories,
  checkCanRequestPayouts,
  checkCanStartVoiceCalls,
  checkCanStartVideoCalls,
  checkCanSendGeoshare,
} from './enforcementHelpers';

// ========================================================================
// CHAT / MESSAGING INTEGRATION
// ========================================================================

/**
 * Example: Integrate enforcement into message sending
 * Add this check to your chat/messaging endpoints
 */
export async function integrateIntoMessageSend(userId: string, messageData: any) {
  // ENFORCEMENT CHECK - Add at start of function
  await checkCanSendMessages(userId);
  
  // Continue with normal message sending logic
  // ... existing code ...
}

// ========================================================================
// GIFTS INTEGRATION
// ========================================================================

/**
 * Example: Integrate enforcement into gift sending
 * Add this check to your gifts endpoints (PACK 79)
 */
export async function integrateIntoGiftSend(senderId: string, giftData: any) {
  // ENFORCEMENT CHECK - Add at start of function
  await checkCanSendGifts(senderId);
  
  // Continue with normal gift sending logic
  // ... existing code ...
}

// ========================================================================
// PAID MEDIA INTEGRATION
// ========================================================================

/**
 * Example: Integrate enforcement into paid media sending
 * Add this check to your paid media endpoints (PACK 80)
 */
export async function integrateIntoPaidMediaSend(senderId: string, mediaData: any) {
  // ENFORCEMENT CHECK - Add at start of function
  await checkCanSendPaidMedia(senderId);
  
  // Continue with normal paid media logic
  // ... existing code ...
}

// ========================================================================
// PREMIUM STORIES INTEGRATION
// ========================================================================

/**
 * Example: Integrate enforcement into premium story publishing
 * Add this check to your premium stories endpoints (PACK 78)
 */
export async function integrateIntoPremiumStoryPublish(creatorId: string, storyData: any) {
  // ENFORCEMENT CHECK - Add at start of function
  await checkCanPublishPremiumStories(creatorId);
  
  // Continue with normal story publishing logic
  // ... existing code ...
}

// ========================================================================
// PAYOUT REQUESTS INTEGRATION
// ========================================================================

/**
 * Example: Integrate enforcement into payout requests
 * Add this check to your payout endpoints (PACK 83)
 */
export async function integrateIntoPayoutRequest(creatorId: string, payoutData: any) {
  // ENFORCEMENT CHECK - Add at start of function
  await checkCanRequestPayouts(creatorId);
  
  // Continue with normal payout request logic
  // ... existing code ...
}

// ========================================================================
// VOICE/VIDEO CALLS INTEGRATION
// ========================================================================

/**
 * Example: Integrate enforcement into call initiation
 * Add this check to your call endpoints (PACK 75)
 */
export async function integrateIntoVoiceCallStart(userId: string, callData: any) {
  // ENFORCEMENT CHECK - Add at start of function
  await checkCanStartVoiceCalls(userId);
  
  // Continue with normal call logic
  // ... existing code ...
}

export async function integrateIntoVideoCallStart(userId: string, callData: any) {
  // ENFORCEMENT CHECK - Add at start of function
  await checkCanStartVideoCalls(userId);
  
  // Continue with normal call logic
  // ... existing code ...
}

// ========================================================================
// GEOSHARE INTEGRATION
// ========================================================================

/**
 * Example: Integrate enforcement into geoshare
 * Add this check to your geoshare endpoints (PACK 76)
 */
export async function integrateIntoGeoshareStart(userId: string, geoshareData: any) {
  // ENFORCEMENT CHECK - Add at start of function
  await checkCanSendGeoshare(userId);
  
  // Continue with normal geoshare logic
  // ... existing code ...
}

// ========================================================================
// ERROR HANDLING PATTERN
// ========================================================================

/**
 * Example: Proper error handling for enforcement checks
 * 
 * Enforcement checks throw HttpsError with specific codes:
 * - ACCOUNT_RESTRICTED: Account is restricted
 * - FEATURE_LOCKED: Specific feature is locked
 * - ACCOUNT_SUSPENDED: Account is suspended
 * 
 * These errors automatically propagate to the client with proper error messages.
 */
export async function exampleWithErrorHandling(userId: string) {
  try {
    // Enforcement check
    await checkCanSendMessages(userId);
    
    // Your business logic here
    return { success: true };
    
  } catch (error: any) {
    // Enforcement errors are already HttpsError, so they'll be caught
    // by Firebase Functions error handling
    throw error;
  }
}

// ========================================================================
// NON-THROWING PERMISSION CHECKS
// ========================================================================

/**
 * Example: Check permission without throwing (for UI enablement)
 * Use hasPermission() when you need to conditionally enable/disable features
 */
import { hasPermission } from './enforcementHelpers';

export async function exampleConditionalFeature(userId: string) {
  const canSendGifts = await hasPermission(userId, 'ACTION_SEND_GIFT');
  
  return {
    features: {
      giftsEnabled: canSendGifts,
      // ... other features
    }
  };
}