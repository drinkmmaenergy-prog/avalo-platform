/**
 * PACK 246 - Integration Helpers
 * Easy-to-use validation functions for existing monetization modules
 */

import { validateTransaction } from './pack246-contract-validator';
import {
  ValidationRequest,
  TransactionType,
  ValidationResult,
} from './pack246-contract-types';
import { logger } from 'firebase-functions/v2';

// ============================================================================
// CHAT MONETIZATION INTEGRATION
// ============================================================================

/**
 * Validate chat deposit before processing
 * Use in PACK 242 Dynamic Pricing & chat monetization
 */
export async function validateChatDeposit(
  userId: string,
  amount: number,
  isRoyalMember: boolean
): Promise<ValidationResult> {
  const request: ValidationRequest = {
    transactionType: TransactionType.CHAT_DEPOSIT,
    userId,
    amount,
    metadata: {
      isRoyalMember,
      proposedSplit: {
        avalo: 35,
        creator: 65,
      },
    },
  };

  return await validateTransaction(request);
}

/**
 * Validate chat message billing
 * Use before billing words in chat messages
 */
export async function validateChatBilling(
  userId: string,
  messageText: string,
  wordsPerToken: number,
  isRoyalMember: boolean,
  earnOnChat: boolean,
  popularity?: 'low' | 'mid' | 'high',
  accountAgeDays?: number
): Promise<ValidationResult> {
  const wordCount = messageText.split(/\s+/).filter(w => w.length > 0).length;
  const tokenCost = Math.ceil(wordCount / wordsPerToken);

  const request: ValidationRequest = {
    transactionType: TransactionType.CHAT_BILLING,
    userId,
    amount: tokenCost,
    metadata: {
      wordsPerToken,
      isRoyalMember,
      earnOnChat,
      popularity,
      accountAgeDays,
      messageCount: 1,
    },
  };

  return await validateTransaction(request);
}

// ============================================================================
// CALL MONETIZATION INTEGRATION
// ============================================================================

/**
 * Validate voice call pricing
 * Use before starting voice calls
 */
export async function validateVoiceCall(
  payerId: string,
  earnerId: string | null,
  durationMinutes: number,
  tokensPerMinute: number,
  isRoyalMember: boolean
): Promise<ValidationResult> {
  const request: ValidationRequest = {
    transactionType: TransactionType.CALL_VOICE,
    userId: payerId,
    targetUserId: earnerId || undefined,
    amount: durationMinutes * tokensPerMinute,
    metadata: {
      callType: 'VOICE',
      durationMinutes,
      tokensPerMinute,
      isRoyalMember,
      proposedSplit: {
        avalo: 20,
        creator: 80,
      },
    },
  };

  return await validateTransaction(request);
}

/**
 * Validate video call pricing
 * Use before starting video calls
 */
export async function validateVideoCall(
  payerId: string,
  earnerId: string | null,
  durationMinutes: number,
  tokensPerMinute: number,
  isRoyalMember: boolean
): Promise<ValidationResult> {
  const request: ValidationRequest = {
    transactionType: TransactionType.CALL_VIDEO,
    userId: payerId,
    targetUserId: earnerId || undefined,
    amount: durationMinutes * tokensPerMinute,
    metadata: {
      callType: 'VIDEO',
      durationMinutes,
      tokensPerMinute,
      isRoyalMember,
      proposedSplit: {
        avalo: 20,
        creator: 80,
      },
    },
  };

  return await validateTransaction(request);
}

// ============================================================================
// CALENDAR & EVENTS INTEGRATION
// ============================================================================

/**
 * Validate calendar booking
 * Use before processing calendar bookings
 */
export async function validateCalendarBooking(
  userId: string,
  amount: number,
  bookingDate: Date,
  selfieVerified: boolean,
  qrVerified: boolean
): Promise<ValidationResult> {
  const hoursUntilEvent = (bookingDate.getTime() - Date.now()) / (1000 * 60 * 60);

  const request: ValidationRequest = {
    transactionType: TransactionType.CALENDAR_BOOKING,
    userId,
    amount,
    metadata: {
      bookingType: 'CALENDAR',
      hoursUntilEvent,
      selfieVerified,
      qrVerified,
      panicButtonEnabled: true,
      proposedSplit: {
        avalo: 35,
        creator: 65,
      },
    },
  };

  return await validateTransaction(request);
}

/**
 * Validate event booking
 * Use before processing event bookings
 */
export async function validateEventBooking(
  userId: string,
  amount: number,
  bookingDate: Date,
  participantCount: number,
  selfieVerified: boolean,
  qrVerified: boolean
): Promise<ValidationResult> {
  const hoursUntilEvent = (bookingDate.getTime() - Date.now()) / (1000 * 60 * 60);

  const request: ValidationRequest = {
    transactionType: TransactionType.EVENT_BOOKING,
    userId,
    amount,
    metadata: {
      bookingType: 'EVENT',
      hoursUntilEvent,
      participantCount,
      selfieVerified,
      qrVerified,
      panicButtonEnabled: true,
      proposedSplit: {
        avalo: 35,
        creator: 65,
      },
    },
  };

  return await validateTransaction(request);
}

/**
 * Validate refund request
 * Use before processing refunds
 */
export async function validateRefundRequest(
  userId: string,
  refundAmount: number,
  originalAmount: number,
  originalTransactionId: string,
  hoursUntilEvent: number
): Promise<ValidationResult> {
  const request: ValidationRequest = {
    transactionType: TransactionType.REFUND_REQUEST,
    userId,
    amount: refundAmount,
    metadata: {
      originalAmount,
      originalTransactionId,
      hoursUntilEvent,
    },
  };

  return await validateTransaction(request);
}

/**
 * Validate voluntary refund
 * Use when creator voluntarily refunds a user
 */
export async function validateVoluntaryRefund(
  userId: string,
  refundAmount: number,
  originalAmount: number,
  refundReason: string
): Promise<ValidationResult> {
  const request: ValidationRequest = {
    transactionType: TransactionType.VOLUNTARY_REFUND,
    userId,
    amount: refundAmount,
    metadata: {
      originalAmount,
      refundReason,
    },
  };

  return await validateTransaction(request);
}

// ============================================================================
// TOKEN & PRODUCT PURCHASES
// ============================================================================

/**
 * Validate token purchase
 * Use before processing token purchases
 */
export async function validateTokenPurchase(
  userId: string,
  tokenAmount: number
): Promise<ValidationResult> {
  const request: ValidationRequest = {
    transactionType: TransactionType.TOKEN_PURCHASE,
    userId,
    amount: tokenAmount,
    metadata: {},
  };

  return await validateTransaction(request);
}

/**
 * Validate product purchase
 * Use in Creator Shop for product purchases
 */
export async function validateProductPurchase(
  userId: string,
  productPrice: number,
  creatorId: string
): Promise<ValidationResult> {
  const request: ValidationRequest = {
    transactionType: TransactionType.PRODUCT_PURCHASE,
    userId,
    targetUserId: creatorId,
    amount: productPrice,
    metadata: {
      proposedSplit: {
        avalo: 35,
        creator: 65,
      },
    },
  };

  return await validateTransaction(request);
}

/**
 * Validate revenue withdrawal
 * Use before processing creator withdrawals
 */
export async function validateRevenueWithdrawal(
  userId: string,
  withdrawalAmount: number
): Promise<ValidationResult> {
  const request: ValidationRequest = {
    transactionType: TransactionType.REVENUE_WITHDRAWAL,
    userId,
    amount: withdrawalAmount,
    metadata: {},
  };

  return await validateTransaction(request);
}

// ============================================================================
// SAFE TRANSACTION WRAPPER
// ============================================================================

/**
 * Wrapper for any transaction that needs validation
 * Throws error if validation fails, otherwise executes the transaction function
 */
export async function executeValidatedTransaction<T>(
  validationRequest: ValidationRequest,
  transactionFunction: () => Promise<T>
): Promise<T> {
  // Validate first
  const validation = await validateTransaction(validationRequest);

  // If blocked, throw error
  if (validation.action === 'BLOCK') {
    const errorMessage = validation.violations
      .map(v => v.message)
      .join('; ');
    
    logger.error('Transaction blocked by contract validator', {
      userId: validationRequest.userId,
      transactionType: validationRequest.transactionType,
      violations: validation.violations,
    });

    throw new Error(`Transaction blocked: ${errorMessage}`);
  }

  // If auto-corrected, log warning
  if (validation.action === 'AUTO_CORRECT') {
    logger.warn('Transaction auto-corrected', {
      userId: validationRequest.userId,
      transactionType: validationRequest.transactionType,
      correctedValues: validation.correctedValues,
    });
  }

  // Execute the actual transaction
  return await transactionFunction();
}

// ============================================================================
// BATCH VALIDATION
// ============================================================================

/**
 * Validate multiple transactions at once
 * Useful for batch operations
 */
export async function validateBatch(
  requests: ValidationRequest[]
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  for (const request of requests) {
    try {
      const result = await validateTransaction(request);
      results.push(result);
    } catch (error) {
      logger.error('Batch validation error', { error, request });
      results.push({
        valid: false,
        violations: [{
          type: 'INVALID_PRICE' as any,
          severity: 'CRITICAL',
          message: `Validation error: ${error}`,
          detectedValue: request,
          expectedValue: 'valid_request',
          timestamp: new Date() as any,
        }],
        action: 'BLOCK',
      });
    }
  }

  return results;
}

// ============================================================================
// INTEGRATION EXAMPLES
// ============================================================================

/**
 * Example: Integrate with chat deposit flow
 * 
 * Before:
 * await processChatDeposit(chatId, payerId);
 * 
 * After:
 * const validation = await validateChatDeposit(payerId, 100, isRoyal);
 * if (validation.action !== 'BLOCK') {
 *   await processChatDeposit(chatId, payerId);
 * }
 */

/**
 * Example: Integrate with call billing
 * 
 * Before:
 * await billCall(callId, payerId, durationMinutes);
 * 
 * After:
 * const validation = await validateVoiceCall(payerId, earnerId, durationMinutes, 10, isRoyal);
 * if (validation.action !== 'BLOCK') {
 *   await billCall(callId, payerId, durationMinutes);
 * }
 */

/**
 * Example: Integrate with calendar booking
 * 
 * Before:
 * await createBooking(userId, slotId, amount);
 * 
 * After:
 * const validation = await validateCalendarBooking(
 *   userId, amount, bookingDate, selfieVerified, qrVerified
 * );
 * if (validation.action !== 'BLOCK') {
 *   await createBooking(userId, slotId, amount);
 * }
 */