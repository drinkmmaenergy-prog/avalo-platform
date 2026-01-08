/**
 * PACK 418 — Integration Examples
 * 
 * Code samples showing how to integrate compliance guards into existing packs.
 * These are examples only - actual integration should be done carefully in existing files.
 */

// @requiresCompliance: ComplianceKey.TOKENOMICS_CORE, ComplianceKey.AGE_RESTRICTION

import {
   guardChatMonetization,
  guardMeetingBooking,
  guardEventTicketing,
  guardAICompanionMonetization,
  guardTipFlow,
  guardPayoutRequest,
  assertTokenomicsInvariant,
  assertAgeAndVerification,
} from './pack418-compliance.service';
import {
  getRevenueSplit,
  TOKEN_PAYOUT_RATE_PLN,
  TokenomicsContext,
  UserComplianceContext,
} from '../../shared/compliance/pack418-compliance-constants';

// =============================================================================
// EXAMPLE 1: WALLET / TOKEN SPEND INTEGRATION (PACK 277)
// =============================================================================

/**
 * EXAMPLE: How to integrate compliance checks into spendTokens() function
 * 
 * In pack277-wallet-service.ts, the spendTokens() function should call
 * assertTokenomicsInvariant() before processing the transaction.
 */
export async function exampleSpendTokensIntegration(
  userId: string,
  amount: number,
  type: 'CHAT' | 'CALL' | 'MEETING' | 'EVENT' | 'TIP',
  recipientId: string
): Promise<void> {
  // Get expected revenue split for this type
  const split = getRevenueSplit(type);
  
  // Create compliance context
  const tokenomicsCtx: TokenomicsContext = {
    type,
    creatorShare: split.creator,
    avaloShare: split.avalo,
    payoutRatePlnPerToken: TOKEN_PAYOUT_RATE_PLN,
    userId,
    transactionId: `txn_${Date.now()}`,
  };
  
  // GUARD: Validate tokenomics before spending
  await assertTokenomicsInvariant(tokenomicsCtx, true);
  
  // Now safe to process the transaction
  console.log(`✅ Compliance check passed for ${type} transaction`);
  // ... rest of spendTokens() logic
}

/**
 * EXAMPLE: How to integrate compliance checks into requestPayout() function
 * 
 * In pack277-wallet-service.ts, the requestPayout() function should validate
 * that the user is verified before allowing withdrawal.
 */
export async function exampleRequestPayoutIntegration(
  userId: string,
  amountTokens: number,
  userAge: number,
  isVerified: boolean
): Promise<void> {
  // Create user compliance context
  const userCtx: UserComplianceContext = {
    userId,
    age: userAge,
    isVerified,
    isEarning: true, // Requesting payout means they earned
    hasActiveMeetingsOrEvents: false,
  };
  
  // Create tokenomics context
  const tokenomicsCtx: TokenomicsContext = {
    type: 'PAYOUT',
    creatorShare: 1.0, // User gets 100% of their earned balance
    avaloShare: 0.0,
    payoutRatePlnPerToken: TOKEN_PAYOUT_RATE_PLN,
    userId,
  };
  
  // GUARD: Validate user compliance and payout rate
  await guardPayoutRequest(tokenomicsCtx, userCtx);
  
  // Now safe to process payout
  console.log(`✅ Payout compliance check passed for user ${userId}`);
  // ... rest of requestPayout() logic
}

// =============================================================================
// EXAMPLE 2: CHAT MONETIZATION INTEGRATION (PACK 273 & 268)
// =============================================================================

/**
 * EXAMPLE: How to integrate compliance checks into paid chat flow
 * 
 * Before charging a user for chat access, validate:
 * - Correct revenue split (65/35)
 * - Both users are 18+
 * - Earning user is verified
 */
export async function examplePaidChatIntegration(
  senderId: string,
  senderAge: number,
  creatorId: string,
  creatorAge: number,
  creatorIsVerified: boolean,
  chatPrice: number
): Promise<void> {
  // Tokenomics context for chat
  const split = getRevenueSplit('CHAT');
  const tokenomicsCtx: TokenomicsContext = {
    type: 'CHAT',
    creatorShare: split.creator,
    avaloShare: split.avalo,
    payoutRatePlnPerToken: TOKEN_PAYOUT_RATE_PLN,
    userId: senderId,
  };
  
  // User context for creator (the one earning)
  const creatorCtx: UserComplianceContext = {
    userId: creatorId,
    age: creatorAge,
   isVerified: creatorIsVerified,
    isEarning: true,
    hasActiveMeetingsOrEvents: false,
  };
  
  // GUARD: Validate chat monetization
  await guardChatMonetization(tokenomicsCtx, creatorCtx);
  
  // Also check sender age (they must be 18+ to access paid chat)
  if (senderAge < 18) {
    throw new Error('Sender must be 18+ to access paid chat');
  }
  
  console.log(`✅ Paid chat compliance check passed`);
  // ... rest of paid chat logic
}

// =============================================================================
// EXAMPLE 3: CALENDAR & EVENTS INTEGRATION (PACK 274-275)
// =============================================================================

/**
 * EXAMPLE: How to integrate compliance checks into meeting booking
 * 
 * Before accepting a meeting booking, validate:
 * - Correct revenue split (80/20)
 * - Creator is 18+ and verified
 * - Fan is 18+
 */
export async function exampleMeetingBookingIntegration(
  fanId: string,
  fanAge: number,
  creatorId: string,
  creatorAge: number,
  creatorIsVerified: boolean,
  meetingPrice: number,
  meetingId: string
): Promise<void> {
  // Tokenomics context for meeting
  const split = getRevenueSplit('MEETING');
  const tokenomicsCtx: TokenomicsContext = {
    type: 'MEETING',
    creatorShare: split.creator,
    avaloShare: split.avalo,
    payoutRatePlnPerToken: TOKEN_PAYOUT_RATE_PLN,
    userId: fanId,
    transactionId: `meeting_${meetingId}`,
  };
  
  // User context for creator
  const creatorCtx: UserComplianceContext = {
    userId: creatorId,
    age: creatorAge,
    isVerified: creatorIsVerified,
    isEarning: true,
    hasActiveMeetingsOrEvents: true,
    entityId: meetingId,
  };
  
  // GUARD: Validate meeting booking
  await guardMeetingBooking(tokenomicsCtx, creatorCtx);
  
  // Also check fan age
  if (fanAge < 18) {
    throw new Error('Fan must be 18+ to book meetings');
  }
  
  console.log(`✅ Meeting booking compliance check passed`);
  // ... rest of meeting booking logic
}

/**
 * EXAMPLE: How to integrate compliance checks into event ticketing
 * 
 * Similar to meetings but for group events
 */
export async function exampleEventTicketingIntegration(
  attendeeId: string,
  attendeeAge: number,
  creatorId: string,
  creatorAge: number,
  creatorIsVerified: boolean,
  ticketPrice: number,
  eventId: string
): Promise<void> {
  // Tokenomics context for event
  const split = getRevenueSplit('EVENT');
  const tokenomicsCtx: TokenomicsContext = {
    type: 'EVENT',
    creatorShare: split.creator,
    avaloShare: split.avalo,
    payoutRatePlnPerToken: TOKEN_PAYOUT_RATE_PLN,
    userId: attendeeId,
    transactionId: `event_${eventId}`,
  };
  
  // User context for creator
  const creatorCtx: UserComplianceContext = {
    userId: creatorId,
    age: creatorAge,
    isVerified: creatorIsVerified,
    isEarning: true,
    hasActiveMeetingsOrEvents: true,
    entityId: eventId,
  };
  
  // GUARD: Validate event ticketing
  await guardEventTicketing(tokenomicsCtx, creatorCtx);
  
  // Also check attendee age
  if (attendeeAge < 18) {
    throw new Error('Attendee must be 18+ to purchase event tickets');
  }
  
  console.log(`✅ Event ticketing compliance check passed`);
  // ... rest of event ticketing logic
}

// =============================================================================
// EXAMPLE 4: AI COMPANIONS INTEGRATION (PACK 279)
// =============================================================================

/**
 * EXAMPLE: How to integrate compliance checks into AI companion paid chats
 * 
 * Before charging for AI interaction, validate revenue split
 */
export async function exampleAICompanionIntegration(
  userId: string,
  aiCharacterId: string,
  messagePrice: number
): Promise<void> {
  // Tokenomics context for AI companion
  const split = getRevenueSplit('AI_COMPANION');
  const tokenomicsCtx: TokenomicsContext = {
    type: 'AI_COMPANION',
    creatorShare: split.creator,
    avaloShare: split.avalo,
    payoutRatePlnPerToken: TOKEN_PAYOUT_RATE_PLN,
    userId,
    transactionId: `ai_${aiCharacterId}_${Date.now()}`,
  };
  
  // GUARD: Validate AI monetization
  await guardAICompanionMonetization(tokenomicsCtx);
  
  console.log(`✅ AI companion compliance check passed`);
  // ... rest of AI companion logic
}

// =============================================================================
// EXAMPLE 5: TIP/DONATION INTEGRATION
// =============================================================================

/**
 * EXAMPLE: How to integrate compliance checks into tip flow
 * 
 * Before processing a tip, validate revenue split (90/10)
 */
export async function exampleTipIntegration(
  fanId: string,
  fanAge: number,
  creatorId: string,
  creatorAge: number,
  creatorIsVerified: boolean,
  tipAmount: number
): Promise<void> {
  // Tokenomics context for tip
  const split = getRevenueSplit('TIP');
  const tokenomicsCtx: TokenomicsContext = {
    type: 'TIP',
    creatorShare: split.creator,
    avaloShare: split.avalo,
    payoutRatePlnPerToken: TOKEN_PAYOUT_RATE_PLN,
    userId: fanId,
  };
  
  // User context for creator
  const creatorCtx: UserComplianceContext = {
    userId: creatorId,
    age: creatorAge,
    isVerified: creatorIsVerified,
    isEarning: true,
    hasActiveMeetingsOrEvents: false,
  };
  
  // GUARD: Validate tip flow
  await guardTipFlow(tokenomicsCtx, creatorCtx);
  
  console.log(`✅ Tip compliance check passed`);
  // ... rest of tip logic
}

// =============================================================================
// EXAMPLE 6: SUPPORT / MANUAL REFUND INTEGRATION (PACK 300)
// =============================================================================

/**
 * EXAMPLE: How to integrate compliance checks into manual refunds
 * 
 * When support agents perform manual refunds, ensure:
 * - Avalo's commission is not refunded (except calendar exception)
 * - Refund respects original revenue split
 */
export async function exampleManualRefundIntegration(
  transactionId: string,
  originalType: 'CHAT' | 'MEETING' | 'EVENT' | 'TIP',
  refundAmount: number,
  isFullRefund: boolean
): Promise<void> {
  // Get original split
  const split = getRevenueSplit(originalType);
  
  if (isFullRefund) {
    // For full refunds, validate that we're not refunding Avalo's share
    // (except for calendar meetings which have special exception)
    if (originalType !== 'MEETING') {
      console.warn(`⚠️ Full refund requested for ${originalType} - Avalo share should not be refunded`);
      // Adjust refund to only include creator's share
      const adjustedRefund = refundAmount * split.creator;
      console.log(`Adjusted refund: ${adjustedRefund} tokens (creator share only)`);
    }
  }
  
  console.log(`✅ Manual refund compliance check passed`);
  // ... rest of refund logic
}

// =============================================================================
// INTEGRATION CHECKLIST
// =============================================================================

/**
 * TO INTEGRATE PACK 418 INTO EXISTING CODE:
 * 
 * 1. WALLET / TOKEN OPERATIONS (pack277-wallet-service.ts):
 *    ✓ Add @requiresCompliance tag
 *    ✓ Import compliance constants
 *    ✓ Call assertTokenomicsInvariant() in spendTokens()
 *    ✓ Call guardPayoutRequest() in requestPayout()
 *    ✓ Call assertAgeAndVerification() where users earn
 * 
 * 2. CHAT MONETIZATION (pack273, pack268):
 *    ✓ Call guardChatMonetization() before charging
 *    ✓ Verify both users are 18+
 *    ✓ Verify earning user has selfie verification
 * 
 * 3. CALENDAR & EVENTS (pack274-275, pack286):
 *    ✓ Call guardMeetingBooking() for meetings
 *    ✓ Call guardEventTicketing() for events
 *    ✓ Verify all participants are 18+ and verified
 * 
 * 4. AI COMPANIONS (pack279, pack322):
 *    ✓ Call guardAICompanionMonetization() before charging
 *    ✓ Use correct revenue split from constants
 * 
 * 5. SUPPORT / SAFETY (pack300, pack335):
 *    ✓ Follow refund rules (don't refund Avalo share except calendars)
 *    ✓ Use compliance service for safety escalations
 * 
 * 6. ALL NEW MONETIZATION FEATURES:
 *    ✓ MUST import from pack418-compliance-constants.ts
 *    ✓ MUST call appropriate guard function
 *    ✓ MUST NOT hard-code splits or rates
 */
