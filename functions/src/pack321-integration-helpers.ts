/**
 * PACK 321B — Wallet Integration Helper Functions
 * Centralized helpers for feature teams to integrate with wallet system
 * Ensures correct context usage and revenue splits
 */

import { 
  spendTokens, 
  refundTokens,
  getWalletSplitForContext 
} from './pack277-wallet-service';
import {
  WalletRevenueContextType,
  SpendTokensResponse,
  RefundTokensResponse,
} from './types/pack277-wallet.types';

// ============================================================================
// CHAT INTEGRATION
// ============================================================================

/**
 * Charge for paid chat message (text, images, voice notes)
 * Uses CHAT_PAID context with 65/35 split
 */
export async function chargeForPaidChat(
  payerId: string,
  earnerId: string,
  amountTokens: number,
  chatId: string,
  messageId?: string
): Promise<SpendTokensResponse> {
  return spendTokens({
    userId: payerId,
    amountTokens,
    source: 'CHAT',
    relatedId: chatId,
    creatorId: earnerId,
    contextType: 'CHAT_PAID',
    contextRef: `chat:${chatId}`,
    metadata: {
      messageId,
      feature: 'paid_chat',
    },
  });
}

/**
 * Refund chat tokens (e.g., unused deposit, early chat end)
 */
export async function refundChatTokens(
  userId: string,
  amountTokens: number,
  chatId: string,
  reason: string,
  originalTransactionId?: string
): Promise<RefundTokensResponse> {
  return refundTokens({
    userId,
    amountTokens,
    source: 'CHAT',
    relatedId: chatId,
    reason,
    contextType: 'CHAT_PAID',
    originalTransactionId,
    metadata: {
      feature: 'paid_chat',
    },
  });
}

// ============================================================================
// CALL INTEGRATION (VOICE & VIDEO)
// ============================================================================

/**
 * Charge for voice call
 * Uses CALL_VOICE context with 65/35 split
 */
export async function chargeForVoiceCall(
  payerId: string,
  earnerId: string,
  amountTokens: number,
  callId: string,
  durationMinutes?: number
): Promise<SpendTokensResponse> {
  return spendTokens({
    userId: payerId,
    amountTokens,
    source: 'CALL',
    relatedId: callId,
    creatorId: earnerId,
    contextType: 'CALL_VOICE',
    contextRef: `call:${callId}`,
    metadata: {
      callType: 'voice',
      durationMinutes,
      feature: 'voice_call',
    },
  });
}

/**
 * Charge for video call
 * Uses CALL_VIDEO context with 65/35 split
 */
export async function chargeForVideoCall(
  payerId: string,
  earnerId: string,
  amountTokens: number,
  callId: string,
  durationMinutes?: number
): Promise<SpendTokensResponse> {
  return spendTokens({
    userId: payerId,
    amountTokens,
    source: 'CALL',
    relatedId: callId,
    creatorId: earnerId,
    contextType: 'CALL_VIDEO',
    contextRef: `call:${callId}`,
    metadata: {
      callType: 'video',
      durationMinutes,
      feature: 'video_call',
    },
  });
}

/**
 * Refund call tokens (e.g., technical issues, early disconnect)
 */
export async function refundCallTokens(
  userId: string,
  amountTokens: number,
  callId: string,
  callType: 'voice' | 'video',
  reason: string,
  originalTransactionId?: string
): Promise<RefundTokensResponse> {
  return refundTokens({
    userId,
    amountTokens,
    source: 'CALL',
    relatedId: callId,
    reason,
    contextType: callType === 'voice' ? 'CALL_VOICE' : 'CALL_VIDEO',
    originalTransactionId,
    metadata: {
      callType,
      feature: `${callType}_call`,
    },
  });
}

// ============================================================================
// CALENDAR BOOKING INTEGRATION
// ============================================================================

/**
 * Charge for calendar booking (1:1 meeting)
 * Uses CALENDAR_BOOKING context with 80/20 split
 */
export async function chargeForCalendarBooking(
  bookerId: string,
  creatorId: string,
  amountTokens: number,
  bookingId: string,
  scheduledStartTime: Date
): Promise<SpendTokensResponse> {
  return spendTokens({
    userId: bookerId,
    amountTokens,
    source: 'CALENDAR',
    relatedId: bookingId,
    creatorId,
    contextType: 'CALENDAR_BOOKING',
    contextRef: `booking:${bookingId}`,
    metadata: {
      scheduledStartTime: scheduledStartTime.toISOString(),
      feature: 'calendar_booking',
    },
  });
}

/**
 * Refund calendar booking with time-window rules
 * 
 * Payer cancellation:
 * - ≥72h before: 100% refund
 * - 48-24h before: 50% refund
 * - <24h before: 0% refund
 * 
 * Earner cancellation:
 * - Always 100% refund to payer
 */
export async function refundCalendarBooking(
  bookerId: string,
  earnerId: string,
  amountTokens: number,
  bookingId: string,
  scheduledStartTime: Date,
  cancelledBy: 'PAYER' | 'EARNER',
  originalTransactionId?: string
): Promise<RefundTokensResponse> {
  const now = new Date();
  const hoursUntilStart = (scheduledStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  let refundAmount = amountTokens;
  let refundReason = '';

  if (cancelledBy === 'EARNER') {
    // Earner cancellation: always full refund
    refundAmount = amountTokens;
    refundReason = 'CANCELLED_BY_EARNER';
  } else {
    // Payer cancellation: time-based refund
    if (hoursUntilStart >= 72) {
      refundAmount = amountTokens; // 100%
      refundReason = 'CANCELLED_BY_PAYER';
    } else if (hoursUntilStart >= 24 && hoursUntilStart < 72) {
      refundAmount = Math.floor(amountTokens * 0.5); // 50%
      refundReason = 'CANCELLED_BY_PAYER';
    } else {
      refundAmount = 0; // No refund
      refundReason = 'TIME_WINDOW_POLICY';
    }
  }

  if (refundAmount === 0) {
    return {
      success: false,
      error: 'No refund available within 24 hours of booking',
    };
  }

  return refundTokens({
    userId: bookerId,
    amountTokens: refundAmount,
    source: 'CALENDAR',
    relatedId: bookingId,
    reason: refundReason,
    contextType: 'CALENDAR_BOOKING',
    refundPlatformShare: cancelledBy === 'EARNER',
    originalTransactionId,
    earnerUserId: earnerId,
    metadata: {
      scheduledStartTime: scheduledStartTime.toISOString(),
      cancelledBy,
      hoursUntilStart: Math.round(hoursUntilStart),
      fullAmount: amountTokens,
      refundPercent: Math.round((refundAmount / amountTokens) * 100),
      feature: 'calendar_booking',
    },
  });
}

// ============================================================================
// EVENT TICKET INTEGRATION
// ============================================================================

/**
 * Charge for event ticket
 * Uses EVENT_TICKET context with 80/20 split
 */
export async function chargeForEventTicket(
  attendeeId: string,
  organizerId: string,
  amountTokens: number,
  eventId: string,
  ticketId: string,
  eventStartTime: Date
): Promise<SpendTokensResponse> {
  return spendTokens({
    userId: attendeeId,
    amountTokens,
    source: 'EVENT',
    relatedId: eventId,
    creatorId: organizerId,
    contextType: 'EVENT_TICKET',
    contextRef: `event:${eventId}:ticket:${ticketId}`,
    metadata: {
      ticketId,
      eventStartTime: eventStartTime.toISOString(),
      feature: 'event_ticket',
    },
  });
}

/**
 * Refund event ticket with time-window rules
 * Same rules as calendar bookings
 */
export async function refundEventTicket(
  attendeeId: string,
  organizerId: string,
  amountTokens: number,
  eventId: string,
  ticketId: string,
  eventStartTime: Date,
  cancelledBy: 'ATTENDEE' | 'ORGANIZER',
  originalTransactionId?: string
): Promise<RefundTokensResponse> {
  const now = new Date();
  const hoursUntilStart = (eventStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  let refundAmount = amountTokens;
  let refundReason = '';

  if (cancelledBy === 'ORGANIZER') {
    // Organizer cancellation: always full refund
    refundAmount = amountTokens;
    refundReason = 'CANCELLED_BY_EARNER';
  } else {
    // Attendee cancellation: time-based refund
    if (hoursUntilStart >= 72) {
      refundAmount = amountTokens; // 100%
      refundReason = 'CANCELLED_BY_PAYER';
    } else if (hoursUntilStart >= 24 && hoursUntilStart < 72) {
      refundAmount = Math.floor(amountTokens * 0.5); // 50%
      refundReason = 'CANCELLED_BY_PAYER';
    } else {
      refundAmount = 0; // No refund
      refundReason = 'TIME_WINDOW_POLICY';
    }
  }

  if (refundAmount === 0) {
    return {
      success: false,
      error: 'No refund available within 24 hours of event',
    };
  }

  return refundTokens({
    userId: attendeeId,
    amountTokens: refundAmount,
    source: 'EVENT',
    relatedId: eventId,
    reason: refundReason,
    contextType: 'EVENT_TICKET',
    refundPlatformShare: cancelledBy === 'ORGANIZER',
    originalTransactionId,
    earnerUserId: organizerId,
    metadata: {
      ticketId,
      eventStartTime: eventStartTime.toISOString(),
      cancelledBy,
      hoursUntilStart: Math.round(hoursUntilStart),
      fullAmount: amountTokens,
      refundPercent: Math.round((refundAmount / amountTokens) * 100),
      feature: 'event_ticket',
    },
  });
}

// ============================================================================
// TIP INTEGRATION
// ============================================================================

/**
 * Charge for direct tip
 * Uses TIP context with 90/10 split
 */
export async function chargeForTip(
  tipperId: string,
  receiverId: string,
  amountTokens: number,
  relatedId: string,
  tipContext?: string
): Promise<SpendTokensResponse> {
  return spendTokens({
    userId: tipperId,
    amountTokens,
    source: 'TIP',
    relatedId,
    creatorId: receiverId,
    contextType: 'TIP',
    contextRef: `tip:${relatedId}`,
    metadata: {
      tipContext,
      feature: 'tip',
    },
  });
}

// ============================================================================
// MEDIA/DIGITAL PRODUCT INTEGRATION
// ============================================================================

/**
 * Charge for media purchase (photos, videos, audio)
 * Uses MEDIA_PURCHASE context with 65/35 split
 */
export async function chargeForMediaPurchase(
  buyerId: string,
  creatorId: string,
  amountTokens: number,
  mediaId: string,
  mediaType: 'photo' | 'video' | 'audio'
): Promise<SpendTokensResponse> {
  return spendTokens({
    userId: buyerId,
    amountTokens,
    source: 'MEDIA',
    relatedId: mediaId,
    creatorId,
    contextType: 'MEDIA_PURCHASE',
    contextRef: `media:${mediaId}`,
    metadata: {
      mediaType,
      feature: 'media_purchase',
    },
  });
}

/**
 * Charge for digital product (courses, bundles, etc.)
 * Uses MEDIA_PURCHASE context with 65/35 split
 */
export async function chargeForDigitalProduct(
  buyerId: string,
  creatorId: string,
  amountTokens: number,
  productId: string,
  productType: string
): Promise<SpendTokensResponse> {
  return spendTokens({
    userId: buyerId,
    amountTokens,
    source: 'DIGITAL_PRODUCT',
    relatedId: productId,
    creatorId,
    contextType: 'MEDIA_PURCHASE',
    contextRef: `product:${productId}`,
    metadata: {
      productType,
      feature: 'digital_product',
    },
  });
}

// ============================================================================
// AI SESSION INTEGRATION
// ============================================================================

/**
 * Charge for AI companion session
 * Uses AI_SESSION context with 65/35 split
 */
export async function chargeForAISession(
  userId: string,
  aiOwnerId: string,
  amountTokens: number,
  sessionId: string,
  aiCharacterId?: string
): Promise<SpendTokensResponse> {
  return spendTokens({
    userId,
    amountTokens,
    source: 'CHAT',
    relatedId: sessionId,
    creatorId: aiOwnerId,
    contextType: 'AI_SESSION',
    contextRef: `ai:${sessionId}`,
    metadata: {
      aiCharacterId,
      feature: 'ai_companion',
    },
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get revenue split information for a context
 * Useful for displaying to users before transaction
 */
export function getContextRevenueSplit(context: WalletRevenueContextType): {
  earnerPercent: number;
  platformPercent: number;
  description: string;
} {
  const split = getWalletSplitForContext(context);
  
  const descriptions: Record<WalletRevenueContextType, string> = {
    CHAT_PAID: 'Chat & Messages',
    CALL_VOICE: 'Voice Calls',
    CALL_VIDEO: 'Video Calls',
    AI_SESSION: 'AI Companion',
    MEDIA_PURCHASE: 'Media & Products',
    TIP: 'Direct Tips',
    CALENDAR_BOOKING: '1:1 Meetings',
    EVENT_TICKET: 'Event Tickets',
    AVALO_ONLY_REVENUE: 'Platform Services',
    AVALO_ONLY_VIDEO: 'Platform AI Video',
  };

  return {
    earnerPercent: Math.round(split.earnerShare * 100),
    platformPercent: Math.round(split.platformShare * 100),
    description: descriptions[context],
  };
}

/**
 * Calculate earner and platform amounts for a given context
 */
export function calculateSplit(
  totalTokens: number,
  context: WalletRevenueContextType
): {
  earnerAmount: number;
  platformAmount: number;
} {
  const split = getWalletSplitForContext(context);
  const earnerAmount = Math.floor(totalTokens * split.earnerShare);
  const platformAmount = totalTokens - earnerAmount;

  return { earnerAmount, platformAmount };
}