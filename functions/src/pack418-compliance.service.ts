/**
 * PACK 418 — Safety & Compliance Regression Guardrails
 * 
 * RUNTIME COMPLIANCE SERVICE
 * Enforces safety and compliance rules at runtime in Firebase Functions.
 * 
 * This service provides runtime guards that validate:
 * - Tokenomics invariants (revenue splits, payout rates)
 * - Age and verification requirements
 * - Content policy enforcement
 * 
 * All monetization flows must call these guards before processing transactions.
 */

// @requiresCompliance: ComplianceKey.TOKENOMICS_CORE, ComplianceKey.AGE_RESTRICTION, ComplianceKey.CONTENT_ADULT

import * as admin from 'firebase-admin';
import {
  TOKEN_PAYOUT_RATE_PLN,
  AGE_MINIMUM_YEARS,
  REQUIRE_SELFIE_VERIFICATION_FOR_EARNING,
  REQUIRE_SELFIE_FOR_MEETINGS_AND_EVENTS,
  CONTENT_POLICY,
  getRevenueSplit,
  validateSplit,
  TokenomicsContext,
  UserComplianceContext,
  ContentComplianceContext,
} from '../../shared/compliance/pack418-compliance-constants';

// =============================================================================
// ERROR TYPES
// =============================================================================

export class ComplianceViolationError extends Error {
  constructor(
    public code: string,
    message: string,
    public context?: any
  ) {
    super(message);
    this.name = 'ComplianceViolationError';
  }
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Log compliance violation to PACK 296 Audit Logs
 */
async function logComplianceViolation(
  violationType: string,
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  details: any
): Promise<void> {
  try {
    const db = admin.firestore();
    
    await db.collection('auditLogs').add({
      type: 'COMPLIANCE_VIOLATION',
      subType: violationType,
      severity,
      details,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      source: 'PACK_418_COMPLIANCE_SERVICE',
    });
    
    console.warn(`[PACK 418] Compliance violation logged: ${violationType}`, details);
  } catch (err) {
    console.error('[PACK 418] Failed to log compliance violation:', err);
    // Don't throw - logging failure shouldn't block the violation handling
  }
}

/**
 * Create low-severity incident via PACK 417 if threshold exceeded
 */
async function maybeCreateIncident(
  violationType: string,
  userId: string | undefined
): Promise<void> {
  try {
    if (!userId) return;
    
    const db = admin.firestore();
    
    // Check violation count in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentViolationsSnapshot = await db
      .collection('auditLogs')
      .where('type', '==', 'COMPLIANCE_VIOLATION')
      .where('subType', '==', violationType)
      .where('details.userId', '==', userId)
      .where('timestamp', '>=', oneDayAgo)
      .get();
    
    const violationCount = recentViolationsSnapshot.size;
    
    // If 3+ violations in 24 hours, create incident
    if (violationCount >= 3) {
      await db.collection('incidents').add({
        type: 'COMPLIANCE_PATTERN',
        severity: 'LOW',
        userId,
        violationType,
        violationCount,
        message: `User has ${violationCount} compliance violations in the last 24 hours`,
        status: 'OPEN',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'PACK_418_AUTOMATED',
      });
      
      console.warn(`[PACK 418] Created incident for user ${userId}: ${violationCount} violations`);
    }
  } catch (err) {
    console.error('[PACK 418] Failed to create incident:', err);
    // Don't throw - incident creation failure shouldn't block the violation handling
  }
}

// =============================================================================
// TOKENOMICS VALIDATION
// =============================================================================

/**
 * Assert that tokenomics values match platform constants
 * 
 * @param ctx - The tokenomics context to validate
 * @param hardFail - Whether to throw error on violation (default: true)
 * @throws {ComplianceViolationError} If hardFail is true and validation fails
 * @returns {boolean} True if valid, false if invalid (when hardFail is false)
 */
export async function assertTokenomicsInvariant(
  ctx: TokenomicsContext,
  hardFail: boolean = true
): Promise<boolean> {
  const expectedSplit = getRevenueSplit(ctx.type);
  const isValidSplit = validateSplit(
    { creator: ctx.creatorShare, avalo: ctx.avaloShare },
    expectedSplit
  );
  
  const isValidPayoutRate = Math.abs(ctx.payoutRatePlnPerToken - TOKEN_PAYOUT_RATE_PLN) < 0.001;
  
  if (!isValidSplit || !isValidPayoutRate) {
    const violation = {
      type: 'TOKENOMICS_INVARIANT_VIOLATION',
      transactionId: ctx.transactionId,
      userId: ctx.userId,
      monetizationType: ctx.type,
      expected: {
        creatorShare: expectedSplit.creator,
        avaloShare: expectedSplit.avalo,
        payoutRate: TOKEN_PAYOUT_RATE_PLN,
      },
      actual: {
        creatorShare: ctx.creatorShare,
        avaloShare: ctx.avaloShare,
        payoutRate: ctx.payoutRatePlnPerToken,
      },
    };
    
    // Log to audit
    await logComplianceViolation('TOKENOMICS_INVARIANT_VIOLATION', 'HIGH', violation);
    
    // Maybe create incident
    await maybeCreateIncident('TOKENOMICS_INVARIANT_VIOLATION', ctx.userId);
    
    if (hardFail) {
      throw new ComplianceViolationError(
        'TOKENOMICS_VIOLATION',
        `Tokenomics violation detected for ${ctx.type}. Expected split ${expectedSplit.creator}/${expectedSplit.avalo}, got ${ctx.creatorShare}/${ctx.avaloShare}`,
        violation
      );
    }
    
    return false;
  }
  
  return true;
}

// =============================================================================
// AGE & VERIFICATION VALIDATION
// =============================================================================

/**
 * Assert that user meets age and verification requirements
 * 
 * @param userCtx - The user compliance context to validate
 * @throws {ComplianceViolationError} If validation fails
 */
export async function assertAgeAndVerification(
  userCtx: UserComplianceContext
): Promise<void> {
  const violations: string[] = [];
  
  // Check age requirement
  if (userCtx.age === null) {
    violations.push('Age not provided');
  } else if (userCtx.age < AGE_MINIMUM_YEARS) {
    violations.push(`User is under ${AGE_MINIMUM_YEARS} years old (age: ${userCtx.age})`);
  }
  
  // Check verification for earning
  if (REQUIRE_SELFIE_VERIFICATION_FOR_EARNING && userCtx.isEarning && !userCtx.isVerified) {
    violations.push('User is earning but not selfie-verified');
  }
  
  // Check verification for meetings/events
  if (REQUIRE_SELFIE_FOR_MEETINGS_AND_EVENTS && userCtx.hasActiveMeetingsOrEvents && !userCtx.isVerified) {
    violations.push('User has active meetings/events but not selfie-verified');
  }
  
  if (violations.length > 0) {
    const violation = {
      type: 'AGE_VERIFICATION_VIOLATION',
      userId: userCtx.userId,
      entityId: userCtx.entityId,
      violations,
      userContext: {
        age: userCtx.age,
        isVerified: userCtx.isVerified,
        isEarning: userCtx.isEarning,
        hasActiveMeetingsOrEvents: userCtx.hasActiveMeetingsOrEvents,
      },
    };
    
    // Log to audit
    await logComplianceViolation('AGE_VERIFICATION_VIOLATION', 'CRITICAL', violation);
    
    // Escalate to safety (PACK 267/268)
    await escalateToSafety(userCtx.userId, 'AGE_VERIFICATION_VIOLATION', violation);
    
    throw new ComplianceViolationError(
      'AGE_VERIFICATION_VIOLATION',
      `Age/verification violation: ${violations.join(', ')}`,
      violation
    );
  }
}

// =============================================================================
// CONTENT POLICY VALIDATION
// =============================================================================

/**
 * Assert that content meets platform policy requirements
 * 
 * @param contentCtx - The content compliance context to validate
 * @throws {ComplianceViolationError} If validation fails
 */
export async function assertContentPolicy(
  contentCtx: ContentComplianceContext
): Promise<void> {
  const violations: string[] = [];
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  
  // Critical violations (instant block + legal escalation)
  if (contentCtx.isMinorFlagged && CONTENT_POLICY.banMinorsAnyContext) {
    violations.push('Content flagged as involving minors');
    severity = 'CRITICAL';
  }
  
  if (contentCtx.isCSAMFlagged && CONTENT_POLICY.banCSAM) {
    violations.push('Content flagged as CSAM');
    severity = 'CRITICAL';
  }
  
  if (contentCtx.isBrutalViolentSexFlagged && CONTENT_POLICY.banViolentSexualContent) {
    violations.push('Content flagged as violent sexual content');
    severity = 'CRITICAL';
  }
  
  // High severity violations
  if (contentCtx.isPoliticsWarSpamFlagged && CONTENT_POLICY.banPoliticalReligiousWars) {
    violations.push('Content flagged as political/religious warfare');
    severity = 'HIGH';
  }
  
  if (contentCtx.isReligiousHateFlagged && CONTENT_POLICY.banPoliticalReligiousWars) {
    violations.push('Content flagged as religious hate speech');
    severity = 'HIGH';
  }
  
  if (violations.length > 0) {
    const violation = {
      type: 'CONTENT_POLICY_VIOLATION',
      contentId: contentCtx.contentId,
      userId: contentCtx.userId,
      violations,
      flags: {
        isMinorFlagged: contentCtx.isMinorFlagged,
        isCSAMFlagged: contentCtx.isCSAMFlagged,
        isBrutalViolentSexFlagged: contentCtx.isBrutalViolentSexFlagged,
        isPoliticsWarSpamFlagged: contentCtx.isPoliticsWarSpamFlagged,
        isReligiousHateFlagged: contentCtx.isReligiousHateFlagged,
      },
    };
    
    // Log to audit
    await logComplianceViolation('CONTENT_POLICY_VIOLATION', severity, violation);
    
    // Report to Abuse system (PACK 190) and Risk Graph
    await reportToAbuseSystem(contentCtx, violations);
    
    // For critical violations, escalate to safety immediately
    if (severity === 'CRITICAL') {
      await escalateToSafety(contentCtx.userId || 'UNKNOWN', 'CONTENT_POLICY_VIOLATION_CRITICAL', violation);
    }
    
    throw new ComplianceViolationError(
      'CONTENT_POLICY_VIOLATION',
      `Content policy violation: ${violations.join(', ')}`,
      violation
    );
  }
}

// =============================================================================
// INTEGRATION HELPERS
// =============================================================================

/**
 * Escalate to safety team (PACK 267/268)
 */
async function escalateToSafety(userId: string, reason: string, details: any): Promise<void> {
  try {
    const db = admin.firestore();
    
    await db.collection('safetyEscalations').add({
      userId,
      reason,
      details,
      status: 'PENDING_REVIEW',
      priority: 'HIGH',
      source: 'PACK_418_AUTOMATED',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.warn(`[PACK 418] Escalated to safety: ${reason} for user ${userId}`);
  } catch (err) {
    console.error('[PACK 418] Failed to escalate to safety:', err);
  }
}

/**
 * Report to Abuse system (PACK 190) and Risk Graph
 */
async function reportToAbuseSystem(
  contentCtx: ContentComplianceContext,
  violations: string[]
): Promise<void> {
  try {
    const db = admin.firestore();
    
    await db.collection('abuseReports').add({
      type: 'AUTOMATED_CONTENT_POLICY',
      contentId: contentCtx.contentId,
      userId: contentCtx.userId,
      violations,
      flags: {
        isMinorFlagged: contentCtx.isMinorFlagged,
        isCSAMFlagged: contentCtx.isCSAMFlagged,
        isBrutalViolentSexFlagged: contentCtx.isBrutalViolentSexFlagged,
        isPoliticsWarSpamFlagged: contentCtx.isPoliticsWarSpamFlagged,
        isReligiousHateFlagged: contentCtx.isReligiousHateFlagged,
      },
      status: 'PENDING_REVIEW',
      source: 'PACK_418_AUTOMATED',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.warn(`[PACK 418] Reported to abuse system: ${violations.join(', ')}`);
  } catch (err) {
    console.error('[PACK 418] Failed to report to abuse system:', err);
  }
}

// =============================================================================
// WRAPPER FUNCTIONS FOR FEATURE PACKS
// =============================================================================

/**
 * Guard chat monetization flow
 * Validates tokenomics and user compliance before charging
 */
export async function guardChatMonetization(
  ctx: TokenomicsContext,
  userCtx?: UserComplianceContext
): Promise<void> {
  // Validate tokenomics
  await assertTokenomicsInvariant(ctx, true);
  
  // Validate user if provided
  if (userCtx) {
    await assertAgeAndVerification(userCtx);
  }
}

/**
 * Guard meeting booking flow
 * Validates tokenomics, age, and verification before accepting booking
 */
export async function guardMeetingBooking(
  ctx: TokenomicsContext,
  userCtx: UserComplianceContext
): Promise<void> {
  // Validate tokenomics (must be 80/20 split for meetings)
  await assertTokenomicsInvariant(ctx, true);
  
  // Validate user age and verification
  await assertAgeAndVerification(userCtx);
}

/**
 * Guard event ticketing flow
 * Validates tokenomics, age, and verification before selling ticket
 */
export async function guardEventTicketing(
  ctx: TokenomicsContext,
  userCtx: UserComplianceContext
): Promise<void> {
  // Validate tokenomics (must be 80/20 split for events)
  await assertTokenomicsInvariant(ctx, true);
  
  // Validate user age and verification
  await assertAgeAndVerification(userCtx);
}

/**
 * Guard AI companion monetization
 * Validates tokenomics before charging for AI interaction
 */
export async function guardAICompanionMonetization(
  ctx: TokenomicsContext
): Promise<void> {
  // Validate tokenomics
  await assertTokenomicsInvariant(ctx, true);
}

/**
 * Guard tip/donation flow
 * Validates tokenomics (must be 90/10 split)
 */
export async function guardTipFlow(
  ctx: TokenomicsContext,
  userCtx?: UserComplianceContext
): Promise<void> {
  // Validate tokenomics
  await assertTokenomicsInvariant(ctx, true);
  
  // Validate user if provided
  if (userCtx) {
    await assertAgeAndVerification(userCtx);
  }
}

/**
 * Guard payout request
 * Validates user verification and payout rate
 */
export async function guardPayoutRequest(
  ctx: TokenomicsContext,
  userCtx: UserComplianceContext
): Promise<void> {
  // Validate payout rate
  await assertTokenomicsInvariant(ctx, true);
  
  // Validate user verification (earners must be verified)
  await assertAgeAndVerification(userCtx);
}
