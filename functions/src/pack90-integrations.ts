/**
 * PACK 90 — Integration Examples
 * 
 * This file demonstrates how to integrate PACK 90 logging into existing modules.
 * Copy these patterns into the respective modules.
 * 
 * INTEGRATION CHECKLIST:
 * ✓ Chat Monetization - logPaymentEvent()
 * ✓ Wallet/Payouts - logPayoutEvent()
 * ✓ KYC - logKycEvent()
 * ✓ Disputes - logDisputeEvent()
 * ✓ Enforcement - logEnforcementEvent()
 * ✓ Moderator Actions - logModeratorAction()
 */

import {
  logBusinessEvent,
  logTechEvent,
  logPaymentEvent,
  logPayoutEvent,
  logKycEvent,
  logDisputeEvent,
  logEnforcementEvent,
  logModeratorAction,
  incrementMetric,
} from './pack90-logging';

// ============================================================================
// MONETIZATION INTEGRATION (chatMonetization.ts, callMonetization.ts, etc.)
// ============================================================================

/**
 * Example: Add to chat billing function in chatMonetization.ts
 * 
 * Location: After successful escrow deduction in processMessageBilling()
 */
export async function example_chatBillingIntegration(
  payerId: string,
  earnerId: string,
  tokens: number,
  chatId: string
): Promise<void> {
  // ... existing billing logic ...
  
  // PACK 90: Log the payment event
  try {
    await logPaymentEvent(
      payerId,
      earnerId,
      tokens,
      'chat_message',
      chatId
    );
  } catch (error) {
    console.error('[Pack90] Failed to log chat payment:', error);
    // Non-blocking - don't fail billing if logging fails
  }
}

/**
 * Example: Add to gift sending in gifts module
 * 
 * Location: After successful gift purchase transaction
 */
export async function example_giftIntegration(
  senderId: string,
  receiverId: string,
  giftId: string,
  tokens: number
): Promise<void> {
  // ... existing gift transaction ...
  
  // PACK 90: Log gift as payment + earnings
  try {
    await logBusinessEvent({
      eventType: 'GIFT_SENT',
      actorUserId: senderId,
      subjectUserId: receiverId,
      relatedId: giftId,
      metadata: {
        tokens,
        giftId,
      },
      functionName: 'sendGift',
    });
    
    await logPaymentEvent(
      senderId,
      receiverId,
      tokens,
      'gift',
      giftId
    );
  } catch (error) {
    console.error('[Pack90] Failed to log gift:', error);
  }
}

/**
 * Example: Add to premium story purchase
 * 
 * Location: After successful story purchase transaction
 */
export async function example_premiumStoryIntegration(
  buyerId: string,
  creatorId: string,
  storyId: string,
  tokens: number
): Promise<void> {
  // ... existing purchase transaction ...
  
  // PACK 90: Log premium story purchase
  try {
    await logBusinessEvent({
      eventType: 'PREMIUM_STORY_PURCHASED',
      actorUserId: buyerId,
      subjectUserId: creatorId,
      relatedId: storyId,
      metadata: {
        tokens,
        storyId,
      },
      functionName: 'purchasePremiumStory',
    });
    
    await logPaymentEvent(
      buyerId,
      creatorId,
      tokens,
      'premium_story',
      storyId
    );
    
    await incrementMetric('PREMIUM_STORIES_SOLD');
  } catch (error) {
    console.error('[Pack90] Failed to log premium story purchase:', error);
  }
}

// ============================================================================
// PAYOUT INTEGRATION (payouts.ts, payoutRequests.ts)
// ============================================================================

/**
 * Example: Add to payout request creation in requestPayout()
 * 
 * Location: After payout request document is created
 */
export async function example_payoutRequestIntegration(
  userId: string,
  requestId: string,
  tokensRequested: number,
  amountFiat: number
): Promise<void> {
  // ... existing payout request creation ...
  
  // PACK 90: Log payout request
  try {
    await logPayoutEvent(
      'PAYOUT_REQUESTED',
      userId,
      requestId,
      {
        tokensRequested,
        amountFiat,
      }
    );
  } catch (error) {
    console.error('[Pack90] Failed to log payout request:', error);
  }
}

/**
 * Example: Add to payout status changes
 * 
 * Location: After payout status update (approved, failed, completed)
 */
export async function example_payoutStatusChangeIntegration(
  userId: string,
  requestId: string,
  oldStatus: string,
  newStatus: string,
  reason?: string
): Promise<void> {
  // ... existing status update ...
  
  // PACK 90: Log status change
  try {
    await logPayoutEvent(
      'PAYOUT_STATUS_CHANGED',
      userId,
      requestId,
      {
        oldStatus,
        newStatus,
        reason,
      }
    );
    
    // Log specific event types
    if (newStatus === 'COMPLETED') {
      await logPayoutEvent('PAYOUT_COMPLETED', userId, requestId);
    } else if (newStatus === 'FAILED') {
      await logPayoutEvent('PAYOUT_FAILED', userId, requestId, { reason });
    }
  } catch (error) {
    console.error('[Pack90] Failed to log payout status change:', error);
  }
}

// ============================================================================
// KYC INTEGRATION (kyc.ts)
// ============================================================================

/**
 * Example: Add to KYC submission in kyc_submitApplication_callable()
 * 
 * Location: After KYC document is created
 */
export async function example_kycSubmissionIntegration(
  userId: string,
  documentId: string,
  documentType: string,
  country: string
): Promise<void> {
  // ... existing KYC submission ...
  
  // PACK 90: Log KYC submission
  try {
    await logKycEvent(
      'KYC_SUBMITTED',
      userId,
      documentId,
      undefined,
      {
        documentType,
        country,
      }
    );
  } catch (error) {
    console.error('[Pack90] Failed to log KYC submission:', error);
  }
}

/**
 * Example: Add to KYC approval in kyc_approve_callable()
 * 
 * Location: After KYC approval transaction
 */
export async function example_kycApprovalIntegration(
  userId: string,
  documentId: string,
  reviewerId: string
): Promise<void> {
  // ... existing KYC approval ...
  
  // PACK 90: Log KYC approval
  try {
    await logKycEvent(
      'KYC_APPROVED',
      userId,
      documentId,
      reviewerId,
      {
        reviewerId,
      }
    );
    
    await logKycEvent(
      'KYC_STATUS_CHANGED',
      userId,
      documentId,
      reviewerId,
      {
        newStatus: 'VERIFIED',
      }
    );
  } catch (error) {
    console.error('[Pack90] Failed to log KYC approval:', error);
  }
}

/**
 * Example: Add to KYC rejection in kyc_reject_callable()
 * 
 * Location: After KYC rejection transaction
 */
export async function example_kycRejectionIntegration(
  userId: string,
  documentId: string,
  reviewerId: string,
  reason: string
): Promise<void> {
  // ... existing KYC rejection ...
  
  // PACK 90: Log KYC rejection
  try {
    await logKycEvent(
      'KYC_REJECTED',
      userId,
      documentId,
      reviewerId,
      {
        reason,
      }
    );
    
    await logKycEvent(
      'KYC_STATUS_CHANGED',
      userId,
      documentId,
      reviewerId,
      {
        newStatus: 'REJECTED',
        reason,
      }
    );
  } catch (error) {
    console.error('[Pack90] Failed to log KYC rejection:', error);
  }
}

// ============================================================================
// DISPUTE INTEGRATION (disputes.ts, disputeEngine.ts)
// ============================================================================

/**
 * Example: Add to dispute creation in createDispute()
 * 
 * Location: After dispute document is created
 */
export async function example_disputeCreationIntegration(
  userId: string,
  disputeId: string,
  type: string,
  title: string
): Promise<void> {
  // ... existing dispute creation ...
  
  // PACK 90: Log dispute creation
  try {
    await logDisputeEvent(
      'DISPUTE_CREATED',
      userId,
      disputeId,
      undefined,
      {
        type,
        title,
      }
    );
  } catch (error) {
    console.error('[Pack90] Failed to log dispute creation:', error);
  }
}

/**
 * Example: Add to dispute resolution in resolveDispute()
 * 
 * Location: After dispute resolution transaction
 */
export async function example_disputeResolutionIntegration(
  userId: string,
  disputeId: string,
  reviewerId: string,
  outcome: string,
  resolution: string
): Promise<void> {
  // ... existing dispute resolution ...
  
  // PACK 90: Log dispute resolution
  try {
    await logDisputeEvent(
      'DISPUTE_RESOLVED',
      userId,
      disputeId,
      reviewerId,
      {
        outcome,
        resolution,
      }
    );
    
    await logDisputeEvent(
      'DISPUTE_STATUS_CHANGED',
      userId,
      disputeId,
      reviewerId,
      {
        newStatus: 'RESOLVED',
        outcome,
      }
    );
  } catch (error) {
    console.error('[Pack90] Failed to log dispute resolution:', error);
  }
}

// ============================================================================
// ENFORCEMENT INTEGRATION (enforcementEngine.ts)
// ============================================================================

/**
 * Example: Add to manual enforcement in setManualEnforcementState()
 * 
 * Location: After enforcement state is updated
 */
export async function example_enforcementManualIntegration(
  userId: string,
  accountStatus: string,
  reviewerId: string,
  reviewNote: string,
  featureLocks: string[]
): Promise<void> {
  // ... existing enforcement update ...
  
  // PACK 90: Log enforcement change
  try {
    await logEnforcementEvent(
      userId,
      accountStatus,
      reviewerId,
      {
        reviewNote,
        featureLocks,
        manual: true,
      }
    );
    
    await logBusinessEvent({
      eventType: 'ACCOUNT_STATUS_CHANGED',
      actorUserId: reviewerId,
      subjectUserId: userId,
      metadata: {
        accountStatus,
        reviewNote,
      },
      source: 'ADMIN_PANEL',
      functionName: 'setManualEnforcementState',
    });
  } catch (error) {
    console.error('[Pack90] Failed to log enforcement change:', error);
  }
}

/**
 * Example: Add to automatic enforcement in recalculateEnforcementState()
 * 
 * Location: After enforcement state is recalculated
 */
export async function example_enforcementAutoIntegration(
  userId: string,
  oldStatus: string,
  newStatus: string,
  riskScore: number
): Promise<void> {
  // ... existing enforcement recalculation ...
  
  // Only log if status changed
  if (oldStatus !== newStatus) {
    try {
      await logEnforcementEvent(
        userId,
        newStatus,
        undefined, // No reviewer for automatic changes
        {
          oldStatus,
          riskScore,
          automatic: true,
        }
      );
    } catch (error) {
      console.error('[Pack90] Failed to log enforcement change:', error);
    }
  }
}

// ============================================================================
// MODERATOR ACTIONS INTEGRATION (moderationCaseHooks.ts, moderationEndpoints.ts)
// ============================================================================

/**
 * Example: Add to case assignment
 * 
 * Location: After case is assigned to moderator
 */
export async function example_caseAssignmentIntegration(
  moderatorId: string,
  caseId: string,
  userId: string
): Promise<void> {
  // ... existing case assignment ...
  
  // PACK 90: Log moderator action
  try {
    await logBusinessEvent({
      eventType: 'CASE_ASSIGNED',
      actorUserId: moderatorId,
      subjectUserId: userId,
      relatedId: caseId,
      metadata: {
        caseId,
      },
      source: 'ADMIN_PANEL',
      functionName: 'assignCase',
    });
  } catch (error) {
    console.error('[Pack90] Failed to log case assignment:', error);
  }
}

/**
 * Example: Add to case resolution
 * 
 * Location: After case is resolved
 */
export async function example_caseResolutionIntegration(
  moderatorId: string,
  caseId: string,
  userId: string,
  caseType: string,
  outcome: string
): Promise<void> {
  // ... existing case resolution ...
  
  // PACK 90: Log case resolution
  try {
    await logBusinessEvent({
      eventType: 'CASE_RESOLVED',
      actorUserId: moderatorId,
      subjectUserId: userId,
      relatedId: caseId,
      metadata: {
        caseType,
        outcome,
      },
      source: 'ADMIN_PANEL',
      functionName: 'resolveCase',
    });
    
    await logModeratorAction(
      moderatorId,
      'RESOLVE_CASE',
      userId,
      caseId,
      {
        caseType,
        outcome,
      }
    );
  } catch (error) {
    console.error('[Pack90] Failed to log case resolution:', error);
  }
}

/**
 * Example: Add to KYC approval through moderation panel
 * 
 * Location: After KYC approval through moderator dashboard
 */
export async function example_moderatorKycApprovalIntegration(
  moderatorId: string,
  userId: string,
  documentId: string,
  caseId: string
): Promise<void> {
  // ... existing KYC approval ...
  
  // PACK 90: Log both KYC event and moderator action
  try {
    await logKycEvent(
      'KYC_APPROVED',
      userId,
      documentId,
      moderatorId
    );
    
    await logModeratorAction(
      moderatorId,
      'APPROVE_KYC',
      userId,
      caseId,
      {
        documentId,
      }
    );
  } catch (error) {
    console.error('[Pack90] Failed to log moderator KYC approval:', error);
  }
}

// ============================================================================
// ERROR LOGGING INTEGRATION
// ============================================================================

/**
 * Example: Add error logging wrapper to critical functions
 * 
 * Location: Wrap critical operations with try-catch
 */
export async function example_errorLoggingIntegration<T>(
  functionName: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // Log the error
    await logTechEvent({
      level: 'ERROR',
      category: 'FUNCTION',
      functionName,
      message: error.message || 'Unknown error',
      context: {
        errorName: error.name,
        errorCode: error.code,
      },
    });
    
    // Re-throw the error
    throw error;
  }
}

/**
 * Example: Function timeout logging
 * 
 * Location: In functions that might timeout
 */
export async function example_timeoutLoggingIntegration(
  functionName: string,
  timeoutMs: number
): Promise<void> {
  const startTime = Date.now();
  
  try {
    // ... function logic ...
    
    const duration = Date.now() - startTime;
    
    // Log if function took more than 80% of timeout
    if (duration > timeoutMs * 0.8) {
      await logTechEvent({
        level: 'WARN',
        category: 'FUNCTION',
        functionName,
        message: `Function approaching timeout: ${duration}ms / ${timeoutMs}ms`,
        context: {
          duration,
          timeout: timeoutMs,
          percentage: (duration / timeoutMs) * 100,
        },
      });
    }
  } catch (error: any) {
    await logTechEvent({
      level: 'ERROR',
      category: 'FUNCTION',
      functionName,
      message: `Function failed after ${Date.now() - startTime}ms`,
      context: {
        error: error.message,
        duration: Date.now() - startTime,
      },
    });
    throw error;
  }
}

// ============================================================================
// USAGE INSTRUCTIONS
// ============================================================================

/**
 * INTEGRATION STEPS:
 * 
 * 1. Import logging functions at top of each module:
 *    import { logPaymentEvent, logPayoutEvent, etc. } from './pack90-logging';
 * 
 * 2. Add logging calls after successful operations (non-blocking):
 *    try {
 *      await logPaymentEvent(...);
 *    } catch (error) {
 *      console.error('[Pack90] Failed to log:', error);
 *    }
 * 
 * 3. Never let logging failures block main operations
 * 
 * 4. Use provided convenience functions when possible:
 *    - logPaymentEvent() for all monetary transactions
 *    - logPayoutEvent() for payout lifecycle
 *    - logKycEvent() for KYC lifecycle
 *    - logDisputeEvent() for dispute lifecycle
 *    - logEnforcementEvent() for enforcement changes
 *    - logModeratorAction() for moderator actions
 * 
 * 5. For custom events, use logBusinessEvent() directly
 * 
 * 6. Always increment metrics after events:
 *    await incrementMetric('METRIC_KEY');
 */