/**
 * PACK 148 - System Integrations
 * Integrations with existing Avalo payment systems
 */

import { recordLedgerTransaction, updateLedgerOnEscrowRelease, updateLedgerOnDispute } from './pack148-ledger-engine';
import { TransactionProductType } from './pack148-types';

/**
 * Integration with PACK 147 (Escrow & Refund System)
 */

/**
 * Record chat payment to ledger
 */
export async function recordChatPaymentToLedger(
  messageId: string,
  payerId: string,
  recipientId: string,
  tokenAmount: number,
  conversionRate: number,
  escrowId?: string,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: messageId,
    senderId: payerId,
    receiverId: recipientId,
    productType: 'chat',
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  });
}

/**
 * Record call payment to ledger
 */
export async function recordCallPaymentToLedger(
  callId: string,
  payerId: string,
  recipientId: string,
  tokenAmount: number,
  conversionRate: number,
  escrowId?: string,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: callId,
    senderId: payerId,
    receiverId: recipientId,
    productType: 'call',
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  });
}

/**
 * Record digital product purchase to ledger
 */
export async function recordProductPurchaseToLedger(
  purchaseId: string,
  buyerId: string,
  creatorId: string,
  tokenAmount: number,
  conversionRate: number,
  escrowId?: string,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: purchaseId,
    senderId: buyerId,
    receiverId: creatorId,
    productType: 'product',
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  });
}

/**
 * Record event ticket purchase to ledger
 */
export async function recordEventTicketToLedger(
  ticketId: string,
  attendeeId: string,
  organizerId: string,
  tokenAmount: number,
  conversionRate: number,
  escrowId?: string,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: ticketId,
    senderId: attendeeId,
    receiverId: organizerId,
    productType: 'event',
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  });
}

/**
 * Record club membership to ledger
 */
export async function recordClubMembershipToLedger(
  membershipId: string,
  memberId: string,
  clubOwnerId: string,
  tokenAmount: number,
  conversionRate: number,
  escrowId?: string,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: membershipId,
    senderId: memberId,
    receiverId: clubOwnerId,
    productType: 'club',
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  });
}

/**
 * Record challenge participation to ledger
 */
export async function recordChallengeParticipationToLedger(
  participationId: string,
  participantId: string,
  creatorId: string,
  tokenAmount: number,
  conversionRate: number,
  escrowId?: string,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: participationId,
    senderId: participantId,
    receiverId: creatorId,
    productType: 'challenge',
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  });
}

/**
 * Record mentorship session to ledger
 */
export async function recordMentorshipSessionToLedger(
  sessionId: string,
  menteeId: string,
  mentorId: string,
  tokenAmount: number,
  conversionRate: number,
  escrowId?: string,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: sessionId,
    senderId: menteeId,
    receiverId: mentorId,
    productType: 'mentorship',
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  });
}

/**
 * Record subscription payment to ledger
 */
export async function recordSubscriptionToLedger(
  subscriptionId: string,
  subscriberId: string,
  creatorId: string,
  tokenAmount: number,
  conversionRate: number,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: subscriptionId,
    senderId: subscriberId,
    receiverId: creatorId,
    productType: 'subscription',
    tokenAmount,
    conversionRate,
    regionTag,
  });
}

/**
 * Record paid gift to ledger
 */
export async function recordPaidGiftToLedger(
  giftId: string,
  senderId: string,
  recipientId: string,
  tokenAmount: number,
  conversionRate: number,
  escrowId?: string,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: giftId,
    senderId: senderId,
    receiverId: recipientId,
    productType: 'gift',
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  });
}

/**
 * Record paid post unlock to ledger
 */
export async function recordPaidPostToLedger(
  postId: string,
  viewerId: string,
  creatorId: string,
  tokenAmount: number,
  conversionRate: number,
  escrowId?: string,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: postId,
    senderId: viewerId,
    receiverId: creatorId,
    productType: 'post',
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  });
}

/**
 * Record media unlock to ledger
 */
export async function recordMediaUnlockToLedger(
  unlockId: string,
  viewerId: string,
  creatorId: string,
  tokenAmount: number,
  conversionRate: number,
  escrowId?: string,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: unlockId,
    senderId: viewerId,
    receiverId: creatorId,
    productType: 'media_unlock',
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  });
}

/**
 * Integration with PACK 145 (Ads Network)
 * Record ad spend to ledger
 */
export async function recordAdSpendToLedger(
  campaignId: string,
  advertiserId: string,
  tokenAmount: number,
  conversionRate: number,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId: campaignId,
    senderId: advertiserId,
    receiverId: 'AVALO_SYSTEM',
    productType: 'ads',
    tokenAmount,
    conversionRate,
    regionTag,
  });
}

/**
 * Handle escrow release from PACK 147
 */
export async function handleEscrowRelease(
  transactionId: string,
  wasReleased: boolean
): Promise<void> {
  await updateLedgerOnEscrowRelease(
    transactionId,
    wasReleased ? 'released' : 'refunded'
  );
}

/**
 * Handle dispute creation from PACK 147
 */
export async function handleDisputeCreated(
  transactionId: string,
  disputeId: string
): Promise<void> {
  await updateLedgerOnDispute(transactionId, disputeId);
}

/**
 * Generic transaction recorder
 * Use this for any transaction type
 */
export async function recordGenericTransactionToLedger(
  transactionId: string,
  senderId: string,
  receiverId: string,
  productType: TransactionProductType,
  tokenAmount: number,
  conversionRate: number = 1.0,
  escrowId?: string,
  regionTag: string = 'US'
): Promise<{ ledgerId: string; blockchainHash: string }> {
  return await recordLedgerTransaction({
    transactionId,
    senderId,
    receiverId,
    productType,
    tokenAmount,
    conversionRate,
    escrowId,
    regionTag,
  });
}

/**
 * Batch record multiple transactions
 * Useful for bulk imports or migrations
 */
export async function batchRecordTransactions(
  transactions: Array<{
    transactionId: string;
    senderId: string;
    receiverId: string;
    productType: TransactionProductType;
    tokenAmount: number;
    conversionRate: number;
    escrowId?: string;
    regionTag?: string;
  }>
): Promise<Array<{ ledgerId: string; blockchainHash: string; transactionId: string }>> {
  const results = [];
  
  for (const tx of transactions) {
    try {
      const result = await recordLedgerTransaction({
        ...tx,
        regionTag: tx.regionTag || 'US',
      });
      
      results.push({
        ...result,
        transactionId: tx.transactionId,
      });
    } catch (error) {
      console.error(`Failed to record transaction ${tx.transactionId}:`, error);
      
      results.push({
        ledgerId: '',
        blockchainHash: '',
        transactionId: tx.transactionId,
      });
    }
  }
  
  return results;
}

/**
 * Get region tag from user profile
 * Helper function to determine user's region for compliance
 */
export function getUserRegionTag(userCountryCode?: string): string {
  if (!userCountryCode) return 'US';
  
  // EU countries
  const euCountries = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
  ];
  
  if (euCountries.includes(userCountryCode)) {
    return 'EU';
  }
  
  // Map other regions
  const regionMap: { [key: string]: string } = {
    'GB': 'UK',
    'CA': 'CA',
    'AU': 'AU',
    'JP': 'JP',
    'CN': 'CN',
    'IN': 'IN',
    'BR': 'BR',
    'MX': 'MX',
  };
  
  return regionMap[userCountryCode] || userCountryCode;
}

/**
 * Calculate token to USD conversion rate
 * This should match your actual token pricing
 */
export function getTokenConversionRate(): number {
  // Default: 1 token = $0.01 USD
  // This should be fetched from your token pricing configuration
  return 0.01;
}