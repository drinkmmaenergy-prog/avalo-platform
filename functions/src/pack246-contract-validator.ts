/**
 * PACK 246 - Global Consistency & Contract Enforcement Engine
 * Main validation logic and enforcement
 */

import { db, serverTimestamp, increment } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  CONTRACT_RULES,
  ViolationType,
  TransactionType,
  ValidationRequest,
  ValidationResult,
  ContractViolation,
  AuditLogEntry,
  SuspiciousAnomaly,
} from './pack246-contract-types';

// ============================================================================
// MAIN CONTRACT VALIDATOR
// ============================================================================

export async function validateTransaction(
  request: ValidationRequest
): Promise<ValidationResult> {
  const violations: ContractViolation[] = [];
  const startTime = Date.now();

  try {
    // Route to appropriate validator based on transaction type
    switch (request.transactionType) {
      case TransactionType.CHAT_DEPOSIT:
        validateChatDeposit(request, violations);
        break;
      case TransactionType.CHAT_BILLING:
        validateChatBilling(request, violations);
        break;
      case TransactionType.CALL_VOICE:
      case TransactionType.CALL_VIDEO:
        validateCall(request, violations);
        break;
      case TransactionType.CALENDAR_BOOKING:
      case TransactionType.EVENT_BOOKING:
        validateBooking(request, violations);
        break;
      case TransactionType.REFUND_REQUEST:
        validateRefund(request, violations);
        break;
      case TransactionType.VOLUNTARY_REFUND:
        validateVoluntaryRefund(request, violations);
        break;
      case TransactionType.TOKEN_PURCHASE:
        validateTokenPurchase(request, violations);
        break;
      case TransactionType.REVENUE_WITHDRAWAL:
        validateRevenueWithdrawal(request, violations);
        break;
      case TransactionType.PRODUCT_PURCHASE:
        validateProductPurchase(request, violations);
        break;
      default:
        violations.push({
          type: ViolationType.INVALID_PRICE,
          severity: 'HIGH',
          message: `Unknown transaction type: ${request.transactionType}`,
          detectedValue: request.transactionType,
          expectedValue: Object.values(TransactionType),
          timestamp: Timestamp.now(),
        });
    }

    // Determine action based on violations
    const result = determineAction(request, violations);

    // Log the validation
    await logValidation(request, result, Date.now() - startTime);

    // Check for suspicious patterns
    if (violations.length > 0) {
      await checkForAnomalies(request, violations);
    }

    return result;
  } catch (error) {
    logger.error('Contract validation error:', error);
    // On error, BLOCK the transaction for safety
    return {
      valid: false,
      violations: [{
        type: ViolationType.INVALID_PRICE,
        severity: 'CRITICAL',
        message: `Validation system error: ${error}`,
        detectedValue: request,
        expectedValue: 'valid transaction',
        timestamp: Timestamp.now(),
      }],
      action: 'BLOCK',
    };
  }
}

// ============================================================================
// CHAT DEPOSIT VALIDATION
// ============================================================================

function validateChatDeposit(
  request: ValidationRequest,
  violations: ContractViolation[]
): void {
  const { amount } = request;

  // Check minimum price
  if (amount < CONTRACT_RULES.CHAT.MIN_PRICE) {
    violations.push({
      type: ViolationType.INVALID_PRICE,
      severity: 'CRITICAL',
      message: `Chat deposit below minimum: ${amount} < ${CONTRACT_RULES.CHAT.MIN_PRICE}`,
      detectedValue: amount,
      expectedValue: CONTRACT_RULES.CHAT.MIN_PRICE,
      timestamp: Timestamp.now(),
    });
  }

  // Check maximum price
  if (amount > CONTRACT_RULES.CHAT.MAX_PRICE) {
    violations.push({
      type: ViolationType.INVALID_PRICE,
      severity: 'CRITICAL',
      message: `Chat deposit above maximum: ${amount} > ${CONTRACT_RULES.CHAT.MAX_PRICE}`,
      detectedValue: amount,
      expectedValue: CONTRACT_RULES.CHAT.MAX_PRICE,
      timestamp: Timestamp.now(),
    });
  }

  // Validate split is enforced (35/65)
  if (request.metadata.proposedSplit) {
    const { avalo, creator } = request.metadata.proposedSplit;
    if (avalo !== CONTRACT_RULES.REVENUE_SPLIT.AVALO_PERCENT ||
        creator !== CONTRACT_RULES.REVENUE_SPLIT.CREATOR_PERCENT) {
      violations.push({
        type: ViolationType.INVALID_SPLIT,
        severity: 'CRITICAL',
        message: `Invalid revenue split: ${avalo}/${creator} instead of ${CONTRACT_RULES.REVENUE_SPLIT.AVALO_PERCENT}/${CONTRACT_RULES.REVENUE_SPLIT.CREATOR_PERCENT}`,
        detectedValue: { avalo, creator },
        expectedValue: CONTRACT_RULES.REVENUE_SPLIT,
        timestamp: Timestamp.now(),
      });
    }
  }
}

// ============================================================================
// CHAT BILLING VALIDATION
// ============================================================================

function validateChatBilling(
  request: ValidationRequest,
  violations: ContractViolation[]
): void {
  const { wordsPerToken, isRoyalMember } = request.metadata;

  // Validate billing rate
  const expectedRate = isRoyalMember
    ? CONTRACT_RULES.CHAT.WORDS_PER_TOKEN_ROYAL
    : CONTRACT_RULES.CHAT.WORDS_PER_TOKEN_STANDARD;

  if (wordsPerToken !== expectedRate) {
    violations.push({
      type: ViolationType.INVALID_BILLING_RATE,
      severity: 'CRITICAL',
      message: `Invalid words per token: ${wordsPerToken} (expected ${expectedRate} for ${isRoyalMember ? 'Royal' : 'Standard'})`,
      detectedValue: wordsPerToken,
      expectedValue: expectedRate,
      timestamp: Timestamp.now(),
    });
  }

  // Validate free chat eligibility if applicable
  if (request.metadata.earnOnChat === false) {
    validateFreeChatEligibility(request, violations);
  }
}

// ============================================================================
// CALL VALIDATION
// ============================================================================

function validateCall(
  request: ValidationRequest,
  violations: ContractViolation[]
): void {
  const { callType, tokensPerMinute, isRoyalMember } = request.metadata;
  const isVoice = request.transactionType === TransactionType.CALL_VOICE;
  const isVideo = request.transactionType === TransactionType.CALL_VIDEO;

  let expectedRate: number;
  if (isVoice) {
    // Voice calls: 10 standard, 6 royal
    expectedRate = isRoyalMember
      ? CONTRACT_RULES.CALLS.VOICE.TOKENS_PER_MIN_ROYAL
      : CONTRACT_RULES.CALLS.VOICE.TOKENS_PER_MIN_STANDARD;
  } else if (isVideo) {
    // Video calls: 15 standard, 10 royal
    expectedRate = isRoyalMember
      ? CONTRACT_RULES.CALLS.VIDEO.TOKENS_PER_MIN_ROYAL
      : CONTRACT_RULES.CALLS.VIDEO.TOKENS_PER_MIN_STANDARD;
  } else {
    violations.push({
      type: ViolationType.INVALID_PRICE,
      severity: 'CRITICAL',
      message: `Invalid call type: ${callType}`,
      detectedValue: callType,
      expectedValue: ['VOICE', 'VIDEO'],
      timestamp: Timestamp.now(),
    });
    return;
  }

  if (tokensPerMinute !== expectedRate) {
    violations.push({
      type: ViolationType.INVALID_BILLING_RATE,
      severity: 'CRITICAL',
      message: `Invalid call rate: ${tokensPerMinute} tokens/min (expected ${expectedRate})`,
      detectedValue: tokensPerMinute,
      expectedValue: expectedRate,
      timestamp: Timestamp.now(),
    });
  }

  // Validate call split (80/20)
  if (request.metadata.proposedSplit) {
    const { avalo, creator } = request.metadata.proposedSplit;
    if (avalo !== CONTRACT_RULES.CALLS.AVALO_PERCENT ||
        creator !== CONTRACT_RULES.CALLS.EARNER_PERCENT) {
      violations.push({
        type: ViolationType.INVALID_SPLIT,
        severity: 'CRITICAL',
        message: `Invalid call revenue split: ${avalo}/${creator} instead of ${CONTRACT_RULES.CALLS.AVALO_PERCENT}/${CONTRACT_RULES.CALLS.EARNER_PERCENT}`,
        detectedValue: { avalo, creator },
        expectedValue: { avalo: CONTRACT_RULES.CALLS.AVALO_PERCENT, creator: CONTRACT_RULES.CALLS.EARNER_PERCENT },
        timestamp: Timestamp.now(),
      });
    }
  }
}

// ============================================================================
// BOOKING VALIDATION (Calendar & Events)
// ============================================================================

function validateBooking(
  request: ValidationRequest,
  violations: ContractViolation[]
): void {
  const { selfieVerified, qrVerified, hoursUntilEvent, bookingType } = request.metadata;

  // CRITICAL: Safety checks MUST be present for in-person meetings/events
  if (!selfieVerified) {
    violations.push({
      type: ViolationType.MISSING_SAFETY_CHECK,
      severity: 'CRITICAL',
      message: 'Selfie verification required for booking',
      detectedValue: selfieVerified,
      expectedValue: true,
      timestamp: Timestamp.now(),
    });
  }

  if (!qrVerified) {
    violations.push({
      type: ViolationType.MISSING_SAFETY_CHECK,
      severity: 'CRITICAL',
      message: 'QR verification required for booking',
      detectedValue: qrVerified,
      expectedValue: true,
      timestamp: Timestamp.now(),
    });
  }

  // Validate upfront payment requirement
  if (!CONTRACT_RULES.CALENDAR.PAY_UPFRONT) {
    violations.push({
      type: ViolationType.INVALID_PRICE,
      severity: 'CRITICAL',
      message: 'Booking must be paid in full upfront',
      detectedValue: 'deferred_payment',
      expectedValue: 'full_upfront_payment',
      timestamp: Timestamp.now(),
    });
  }

  // Validate booking split (35% Avalo fee)
  if (request.metadata.proposedSplit) {
    const { avalo, creator } = request.metadata.proposedSplit;
    if (avalo !== CONTRACT_RULES.CALENDAR.AVALO_FEE_PERCENT ||
        creator !== CONTRACT_RULES.REVENUE_SPLIT.CREATOR_PERCENT) {
      violations.push({
        type: ViolationType.INVALID_SPLIT,
        severity: 'CRITICAL',
        message: `Invalid booking split: ${avalo}/${creator}`,
        detectedValue: { avalo, creator },
        expectedValue: { avalo: CONTRACT_RULES.CALENDAR.AVALO_FEE_PERCENT, creator: CONTRACT_RULES.REVENUE_SPLIT.CREATOR_PERCENT },
        timestamp: Timestamp.now(),
      });
    }
  }
}

// ============================================================================
// REFUND VALIDATION
// ============================================================================

function validateRefund(
  request: ValidationRequest,
  violations: ContractViolation[]
): void {
  const { hoursUntilEvent, originalAmount } = request.metadata;

  if (hoursUntilEvent === undefined || originalAmount === undefined) {
    violations.push({
      type: ViolationType.INVALID_REFUND,
      severity: 'HIGH',
      message: 'Missing refund calculation parameters',
      detectedValue: { hoursUntilEvent, originalAmount },
      expectedValue: 'both_parameters_required',
      timestamp: Timestamp.now(),
    });
    return;
  }

  // Calculate expected refund based on timing
  let expectedRefundPercent = 0;
  if (hoursUntilEvent >= 72) {
    expectedRefundPercent = CONTRACT_RULES.CALENDAR.REFUND_72H_PERCENT;
  } else if (hoursUntilEvent >= 48) {
    expectedRefundPercent = CONTRACT_RULES.CALENDAR.REFUND_48H_PERCENT;
  } else {
    expectedRefundPercent = CONTRACT_RULES.CALENDAR.REFUND_24H_PERCENT;
  }

  const expectedRefundAmount = Math.floor(
    originalAmount * (expectedRefundPercent / 100) * (CONTRACT_RULES.REVENUE_SPLIT.CREATOR_PERCENT / 100)
  );

  // Avalo ALWAYS keeps the 35% fee
  const avaloFee = Math.floor(originalAmount * (CONTRACT_RULES.CALENDAR.AVALO_FEE_PERCENT / 100));

  if (request.amount > expectedRefundAmount) {
    violations.push({
      type: ViolationType.INVALID_REFUND,
      severity: 'CRITICAL',
      message: `Refund amount exceeds policy: ${request.amount} > ${expectedRefundAmount}`,
      detectedValue: request.amount,
      expectedValue: expectedRefundAmount,
      timestamp: Timestamp.now(),
    });
  }

  // Ensure Avalo fee is never refunded
  if (request.amount + avaloFee > originalAmount) {
    violations.push({
      type: ViolationType.INVALID_REFUND,
      severity: 'CRITICAL',
      message: 'Attempting to refund Avalo platform fee',
      detectedValue: request.amount,
      expectedValue: `max_${originalAmount - avaloFee}`,
      timestamp: Timestamp.now(),
    });
  }
}

// ============================================================================
// VOLUNTARY REFUND VALIDATION
// ============================================================================

function validateVoluntaryRefund(
  request: ValidationRequest,
  violations: ContractViolation[]
): void {
  const { originalAmount } = request.metadata;

  if (!originalAmount) {
    violations.push({
      type: ViolationType.INVALID_REFUND,
      severity: 'HIGH',
      message: 'Original amount required for voluntary refund',
      detectedValue: originalAmount,
      expectedValue: 'positive_number',
      timestamp: Timestamp.now(),
    });
    return;
  }

  // Avalo ALWAYS keeps 35% fee even on voluntary refunds
  const avaloFee = Math.floor(originalAmount * (CONTRACT_RULES.VOLUNTARY_REFUNDS.AVALO_FEE_PERCENT / 100));
  const maxRefund = originalAmount - avaloFee;

  if (request.amount > maxRefund) {
    violations.push({
      type: ViolationType.INVALID_REFUND,
      severity: 'CRITICAL',
      message: `Voluntary refund cannot include Avalo fee: ${request.amount} > ${maxRefund}`,
      detectedValue: request.amount,
      expectedValue: maxRefund,
      timestamp: Timestamp.now(),
    });
  }
}

// ============================================================================
// TOKEN PURCHASE VALIDATION
// ============================================================================

function validateTokenPurchase(
  request: ValidationRequest,
  violations: ContractViolation[]
): void {
  // NO DISCOUNTS ALLOWED
  if (request.amount < CONTRACT_RULES.TOKEN_PURCHASES.MIN_PURCHASE) {
    violations.push({
      type: ViolationType.UNAUTHORIZED_DISCOUNT,
      severity: 'CRITICAL',
      message: `Token purchase below minimum: ${request.amount}`,
      detectedValue: request.amount,
      expectedValue: CONTRACT_RULES.TOKEN_PURCHASES.MIN_PURCHASE,
      timestamp: Timestamp.now(),
    });
  }

  // Check for zero/free token attempts
  if (request.amount === 0) {
    violations.push({
      type: ViolationType.FREE_TOKEN_ATTEMPT,
      severity: 'CRITICAL',
      message: 'Attempting to obtain free tokens',
      detectedValue: 0,
      expectedValue: `>= ${CONTRACT_RULES.TOKEN_PURCHASES.MIN_PURCHASE}`,
      timestamp: Timestamp.now(),
    });
  }
}

// ============================================================================
// PRODUCT PURCHASE VALIDATION
// ============================================================================

function validateProductPurchase(
  request: ValidationRequest,
  violations: ContractViolation[]
): void {
  // Validate product pricing is within range (100-500 tokens standard)
  if (request.amount < CONTRACT_RULES.CHAT.MIN_PRICE || 
      request.amount > CONTRACT_RULES.CHAT.MAX_PRICE) {
    violations.push({
      type: ViolationType.INVALID_PRICE,
      severity: 'HIGH',
      message: `Product price outside allowed range: ${request.amount}`,
      detectedValue: request.amount,
      expectedValue: `${CONTRACT_RULES.CHAT.MIN_PRICE}-${CONTRACT_RULES.CHAT.MAX_PRICE}`,
      timestamp: Timestamp.now(),
    });
  }

  // Validate split
  if (request.metadata.proposedSplit) {
    const { avalo, creator } = request.metadata.proposedSplit;
    if (avalo !== CONTRACT_RULES.REVENUE_SPLIT.AVALO_PERCENT ||
        creator !== CONTRACT_RULES.REVENUE_SPLIT.CREATOR_PERCENT) {
      violations.push({
        type: ViolationType.INVALID_SPLIT,
        severity: 'CRITICAL',
        message: `Invalid product revenue split: ${avalo}/${creator}`,
        detectedValue: { avalo, creator },
        expectedValue: CONTRACT_RULES.REVENUE_SPLIT,
        timestamp: Timestamp.now(),
      });
    }
  }
}

// ============================================================================
// REVENUE WITHDRAWAL VALIDATION
// ============================================================================

function validateRevenueWithdrawal(
  request: ValidationRequest,
  violations: ContractViolation[]
): void {
  // Ensure no manipulation of split during withdrawal
  if (request.metadata.proposedSplit) {
    violations.push({
      type: ViolationType.SPLIT_MANIPULATION,
      severity: 'CRITICAL',
      message: 'Revenue split cannot be modified during withdrawal',
      detectedValue: request.metadata.proposedSplit,
      expectedValue: 'no_split_modification',
      timestamp: Timestamp.now(),
    });
  }
}

// ============================================================================
// FREE CHAT ELIGIBILITY VALIDATION
// ============================================================================

function validateFreeChatEligibility(
  request: ValidationRequest,
  violations: ContractViolation[]
): void {
  const { popularity, accountAgeDays, earnOnChat } = request.metadata;

  // NEW USERS NEVER FREE
  if (accountAgeDays !== undefined && accountAgeDays < CONTRACT_RULES.FREE_CHAT.NEW_USER_THRESHOLD_DAYS) {
    violations.push({
      type: ViolationType.INVALID_FREE_CHAT,
      severity: 'CRITICAL',
      message: `New users cannot have free chat: account age ${accountAgeDays} days`,
      detectedValue: accountAgeDays,
      expectedValue: `>= ${CONTRACT_RULES.FREE_CHAT.NEW_USER_THRESHOLD_DAYS}`,
      timestamp: Timestamp.now(),
    });
  }

  // Only low popularity with earnOff can be free
  if (earnOnChat === false) {
    if (popularity !== 'low') {
      violations.push({
        type: ViolationType.INVALID_FREE_CHAT,
        severity: 'CRITICAL',
        message: `Only low-popularity profiles can have free chat: ${popularity}`,
        detectedValue: popularity,
        expectedValue: 'low',
        timestamp: Timestamp.now(),
      });
    }
  }
}

// ============================================================================
// ACTION DETERMINATION
// ============================================================================

function determineAction(
  request: ValidationRequest,
  violations: ContractViolation[]
): ValidationResult {
  if (violations.length === 0) {
    return {
      valid: true,
      violations: [],
      action: 'ALLOW',
    };
  }

  // Check for CRITICAL violations - these MUST be blocked
  const hasCritical = violations.some(v => v.severity === 'CRITICAL');
  if (hasCritical) {
    return {
      valid: false,
      violations,
      action: 'BLOCK',
    };
  }

  // For non-critical violations, attempt auto-correction
  const correctedValues = attemptAutoCorrection(request, violations);
  if (correctedValues) {
    return {
      valid: true,
      violations,
      correctedValues,
      action: 'AUTO_CORRECT',
    };
  }

  // If can't auto-correct, block for safety
  return {
    valid: false,
    violations,
    action: 'BLOCK',
  };
}

// ============================================================================
// AUTO-CORRECTION
// ============================================================================

function attemptAutoCorrection(
  request: ValidationRequest,
  violations: ContractViolation[]
): Partial<ValidationRequest> | null {
  const corrections: Partial<ValidationRequest> = {
    metadata: { ...request.metadata },
  };

  let corrected = false;

  // Auto-correct billing rates
  if (violations.some(v => v.type === ViolationType.INVALID_BILLING_RATE)) {
    if (request.metadata.isRoyalMember) {
      corrections.metadata!.wordsPerToken = CONTRACT_RULES.CHAT.WORDS_PER_TOKEN_ROYAL;
    } else {
      corrections.metadata!.wordsPerToken = CONTRACT_RULES.CHAT.WORDS_PER_TOKEN_STANDARD;
    }
    corrected = true;
  }

  // Auto-correct splits
  if (violations.some(v => v.type === ViolationType.INVALID_SPLIT)) {
    corrections.metadata!.proposedSplit = {
      avalo: CONTRACT_RULES.REVENUE_SPLIT.AVALO_PERCENT,
      creator: CONTRACT_RULES.REVENUE_SPLIT.CREATOR_PERCENT,
    };
    corrected = true;
  }

  return corrected ? corrections : null;
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

async function logValidation(
  request: ValidationRequest,
  result: ValidationResult,
  processingTimeMs: number
): Promise<void> {
  try {
    const auditLog: AuditLogEntry = {
      auditId: db.collection('_').doc().id,
      timestamp: Timestamp.now(),
      transactionType: request.transactionType,
      userId: request.userId,
      validationResult: result,
      correctionApplied: result.action === 'AUTO_CORRECT',
      blockReason: result.action === 'BLOCK' 
        ? result.violations.map(v => v.message).join('; ')
        : undefined,
    };

    await db.collection('contractAuditLogs').doc(auditLog.auditId).set(auditLog);

    // Update stats
    await db.collection('contractStats').doc('global').set({
      totalValidations: increment(1),
      totalViolations: increment(result.violations.length),
      totalBlocked: increment(result.action === 'BLOCK' ? 1 : 0),
      totalCorrected: increment(result.action === 'AUTO_CORRECT' ? 1 : 0),
      lastUpdated: serverTimestamp(),
    }, { merge: true });

    logger.info('Contract validation logged', {
      userId: request.userId,
      transactionType: request.transactionType,
      action: result.action,
      violations: result.violations.length,
      processingTimeMs,
    });
  } catch (error) {
    logger.error('Failed to log validation:', error);
  }
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

async function checkForAnomalies(
  request: ValidationRequest,
  violations: ContractViolation[]
): Promise<void> {
  try {
    // Check for repeated violations from same user
    const recentViolationsSnap = await db
      .collection('contractAuditLogs')
      .where('userId', '==', request.userId)
      .where('timestamp', '>=', Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000)) // last 24h
      .get();

    if (recentViolationsSnap.size >= 3) {
      // Multiple violations in 24h = suspicious
      await createAnomaly(request, violations, 'REPEATED_VIOLATIONS');
    }

    // Check for critical violation types
    const hasCritical = violations.some(v => 
      v.type === ViolationType.SPLIT_MANIPULATION ||
      v.type === ViolationType.FREE_TOKEN_ATTEMPT ||
      v.type === ViolationType.MISSING_SAFETY_CHECK
    );

    if (hasCritical) {
      await createAnomaly(request, violations, 'CRITICAL_VIOLATION');
    }
  } catch (error) {
    logger.error('Anomaly detection error:', error);
  }
}

async function createAnomaly(
  request: ValidationRequest,
  violations: ContractViolation[],
  reason: string
): Promise<void> {
  const anomaly: SuspiciousAnomaly = {
    anomalyId: db.collection('_').doc().id,
    userId: request.userId,
    anomalyType: determineAnomalyType(violations),
    detectedAt: Timestamp.now(),
    details: `${reason}: ${violations.map(v => v.message).join('; ')}`,
    severity: violations.some(v => v.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH',
    autoActions: determineAutoActions(violations),
    resolved: false,
  };

  await db.collection('suspiciousAnomalies').doc(anomaly.anomalyId).set(anomaly);

  // Execute auto-actions
  for (const action of anomaly.autoActions) {
    await executeAutoAction(request.userId, action);
  }

  logger.warn('Suspicious anomaly detected', {
    userId: request.userId,
    anomalyType: anomaly.anomalyType,
    severity: anomaly.severity,
    autoActions: anomaly.autoActions,
  });
}

function determineAnomalyType(violations: ContractViolation[]): SuspiciousAnomaly['anomalyType'] {
  if (violations.some(v => v.type === ViolationType.INVALID_SPLIT || v.type === ViolationType.SPLIT_MANIPULATION)) {
    return 'SPLIT_BYPASS';
  }
  if (violations.some(v => v.type === ViolationType.FREE_TOKEN_ATTEMPT || v.type === ViolationType.UNAUTHORIZED_DISCOUNT)) {
    return 'FREE_FEATURE_ABUSE';
  }
  if (violations.some(v => v.type === ViolationType.INVALID_REFUND)) {
    return 'REFUND_FRAUD';
  }
  if (violations.some(v => v.type === ViolationType.MISSING_SAFETY_CHECK)) {
    return 'SAFETY_BYPASS';
  }
  return 'PRICE_MANIPULATION';
}

function determineAutoActions(violations: ContractViolation[]): string[] {
  const actions: string[] = [];

  // Always flag for admin review
  actions.push('FLAG_ACCOUNT');

  // Freeze earnings for critical violations
  if (violations.some(v => v.severity === 'CRITICAL')) {
    actions.push('FREEZE_EARNINGS');
    actions.push('NOTIFY_ADMIN');
  }

  // Additional actions for specific violation types
  if (violations.some(v => v.type === ViolationType.MISSING_SAFETY_CHECK)) {
    actions.push('BLOCK_BOOKINGS');
  }

  if (violations.some(v => v.type === ViolationType.FREE_TOKEN_ATTEMPT)) {
    actions.push('BLOCK_TOKEN_PURCHASES');
  }

  return actions;
}

async function executeAutoAction(userId: string, action: string): Promise<void> {
  try {
    switch (action) {
      case 'FREEZE_EARNINGS':
        await db.collection('users').doc(userId).set({
          earningsFrozen: true,
          earningsFrozenAt: serverTimestamp(),
          earningsFrozenReason: 'contract_violation',
        }, { merge: true });
        break;

      case 'FLAG_ACCOUNT':
        await db.collection('users').doc(userId).set({
          flagged: true,
          flaggedAt: serverTimestamp(),
          flagReason: 'contract_enforcement',
        }, { merge: true });
        break;

      case 'NOTIFY_ADMIN':
        await db.collection('adminNotifications').add({
          type: 'contract_violation',
          userId,
          severity: 'CRITICAL',
          timestamp: serverTimestamp(),
          read: false,
        });
        break;

      case 'BLOCK_BOOKINGS':
        await db.collection('users').doc(userId).set({
          bookingsBlocked: true,
          bookingsBlockedAt: serverTimestamp(),
        }, { merge: true });
        break;

      case 'BLOCK_TOKEN_PURCHASES':
        await db.collection('users').doc(userId).set({
          tokenPurchasesBlocked: true,
          tokenPurchasesBlockedAt: serverTimestamp(),
        }, { merge: true });
        break;
    }

    logger.info(`Auto-action executed: ${action}`, { userId });
  } catch (error) {
    logger.error(`Failed to execute auto-action ${action}:`, error);
  }
}