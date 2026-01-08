/**
 * PACK 296 — Integration Examples
 * 
 * This file provides integration examples for adding audit logging
 * to existing services. Copy these patterns into your actual service files.
 */

import {
  logUserRegistration,
  logLogin,
  logTokenPurchase,
  logPayoutEvent,
  logChatEvent,
  logCallEvent,
  logBookingEvent,
  logEventAction,
  logPanicButton,
  logSafetyReport,
  logAccountEnforcement,
  logContentRemoval,
  logPolicyAcceptance,
  logLegalDocUpdate,
} from './pack296-audit-helpers';

// ============================================================================
// IDENTITY & ACCESS EXAMPLES
// ============================================================================

/**
 * Example: User Registration
 * Add to your user creation function
 */
export async function exampleUserRegistration(
  userId: string,
  ipAddress: string,
  deviceId: string
) {
  // ... your existing registration logic ...

  // Add audit logging
  await logUserRegistration(userId, {
    ipCountry: 'PL', // Extract from IP
    ipAddress,
    deviceId,
  });
}

/**
 * Example: Login Event
 * Add to your authentication function
 */
export async function exampleLogin(
  userId: string,
  success: boolean,
  ipAddress: string,
  failureReason?: string
) {
  // ... your existing login logic ...

  // Add audit logging
  await logLogin(userId, success, {
    ipAddress,
    ipCountry: 'PL',
    deviceId: 'device123',
    failureReason,
  });
}

// ============================================================================
// TOKEN & MONEY FLOW EXAMPLES
// ============================================================================

/**
 * Example: Token Purchase
 * Add to your Stripe/payment webhook handler
 */
export async function exampleTokenPurchase(
  userId: string,
  amountTokens: number,
  amountFiat: number,
  transactionId: string
) {
  // ... your existing token credit logic ...

  // Add audit logging
  await logTokenPurchase(userId, {
    amountTokens,
    amountFiat,
    currency: 'PLN',
    provider: 'STRIPE',
    transactionId,
  });
}

/**
 * Example: Payout Request
 * Add to your payout request function
 */
export async function examplePayoutRequest(
  userId: string,
  requestId: string,
  amountTokens: number
) {
  // ... your existing payout request logic ...

  // Add audit logging
  await logPayoutEvent(userId, 'PAYOUT_REQUESTED', {
    requestId,
    amountTokens,
  });
}

/**
 * Example: Payout Approval
 * Add to your admin payout approval function
 */
export async function examplePayoutApproval(
  userId: string,
  requestId: string,
  amountTokens: number,
  amountFiat: number,
  reviewerId: string
) {
  // ... your existing approval logic ...

  // Add audit logging
  await logPayoutEvent(userId, 'PAYOUT_APPROVED', {
    requestId,
    amountTokens,
    amountFiat,
    currency: 'PLN',
    reviewerId,
  });
}

// ============================================================================
// PAID INTERACTIONS EXAMPLES
// ============================================================================

/**
 * Example: Chat Paid Segment Started
 * Add to your chat monetization logic
 */
export async function exampleChatPaidSegment(
  userId: string,
  chatId: string,
  otherUserId: string
) {
  // ... your existing chat logic ...

  // Add audit logging
  await logChatEvent(userId, 'CHAT_PAID_SEGMENT_STARTED', {
    chatId,
    otherUserId,
    amountTokens: 10, // Rate per message or time period
  });
}

/**
 * Example: Call Started
 * Add to your call initiation logic
 */
export async function exampleCallStarted(
  userId: string,
  callId: string,
  otherUserId: string
) {
  // ... your existing call logic ...

  // Add audit logging
  await logCallEvent(userId, 'CALL_STARTED', {
    callId,
    otherUserId,
  });
}

/**
 * Example: Calendar Booking Created
 * Add to your booking creation function
 */
export async function exampleBookingCreated(
  userId: string,
  bookingId: string,
  creatorId: string,
  meetingTime: string,
  amountTokens: number
) {
  // ... your existing booking logic ...

  // Add audit logging
  await logBookingEvent(userId, 'CALENDAR_BOOKING_CREATED', {
    bookingId,
    creatorId,
    meetingTime,
    amountTokens,
  });
}

/**
 * Example: Event Created
 * Add to your event creation function
 */
export async function exampleEventCreated(
  userId: string,
  eventId: string,
  eventTime: string,
  amountTokens: number
) {
  // ... your existing event logic ...

  // Add audit logging
  await logEventAction(userId, 'EVENT_CREATED', {
    eventId,
    eventTime,
    amountTokens,
    attendeeCount: 1,
  });
}

// ============================================================================
// SAFETY & RISK EXAMPLES
// ============================================================================

/**
 * Example: Panic Button
 * Add to your panic button handler
 */
export async function examplePanicButton(
  userId: string,
  location: { lat: number; lng: number },
  meetingId?: string
) {
  // ... your existing panic button logic ...

  // Add audit logging
  await logPanicButton(userId, {
    location,
    meetingId,
    reason: 'User triggered panic button',
  });
}

/**
 * Example: Safety Report
 * Add to your report submission function
 */
export async function exampleSafetyReport(
  reporterId: string,
  reportId: string,
  targetUserId: string,
  reportType: string
) {
  // ... your existing report logic ...

  // Add audit logging
  await logSafetyReport(reporterId, {
    reportId,
    targetUserId,
    reportType,
  });
}

/**
 * Example: Account Ban
 * Add to your ban enforcement function
 */
export async function exampleAccountBan(
  userId: string,
  adminId: string,
  reason: string,
  riskScoreBefore: number,
  riskScoreAfter: number
) {
  // ... your existing ban logic ...

  // Add audit logging
  await logAccountEnforcement(userId, 'ACCOUNT_BANNED', {
    adminId,
    reason,
    riskScoreBefore,
    riskScoreAfter,
  });
}

/**
 * Example: Content Removal
 * Add to your content moderation function
 */
export async function exampleContentRemoval(
  userId: string,
  contentId: string,
  contentType: string,
  reason: string,
  adminId?: string
) {
  // ... your existing content removal logic ...

  // Add audit logging
  await logContentRemoval(userId, {
    contentId,
    contentType,
    adminId,
    reason,
    riskScore: 85,
  });
}

// ============================================================================
// LEGAL & POLICY EXAMPLES
// ============================================================================

/**
 * Example: Policy Acceptance
 * Add to your policy acceptance function
 */
export async function examplePolicyAcceptance(
  userId: string,
  docId: string,
  version: string,
  docType: string
) {
  // ... your existing acceptance logic ...

  // Add audit logging
  await logPolicyAcceptance(userId, {
    docId,
    version,
    docType,
  });
}

/**
 * Example: Legal Document Update
 * Add to your legal document management function
 */
export async function exampleLegalDocUpdate(
  docId: string,
  version: string,
  docType: string,
  adminId: string
) {
  // ... your existing update logic ...

  // Add audit logging
  await logLegalDocUpdate({
    docId,
    version,
    docType,
    adminId,
  });
}

// ============================================================================
// INTEGRATION CHECKLIST
// ============================================================================

/**
 * INTEGRATION CHECKLIST
 * 
 * For each critical flow, ensure you:
 * 
 * 1. Import the appropriate logging function from pack296-audit-helpers
 * 2. Call the logging function AFTER the main operation succeeds
 * 3. Don't let audit logging failures break the main flow (use try-catch)
 * 4. Include all relevant metadata (IPs hashed, amounts, IDs)
 * 5. Set sensitive=true for safety/enforcement actions
 * 
 * CRITICAL FLOWS TO INTEGRATE:
 * 
 * Identity & Access:
 * - [x] User registration (logUserRegistration)
 * - [x] Login success/failure (logLogin)
 * - [x] KYC submission/approval/rejection (logKycEvent)
 * 
 * Token & Money:
 * - [ ] Token purchases (logTokenPurchase)
 * - [ ] Payout requests (logPayoutEvent with PAYOUT_REQUESTED)
 * - [ ] Payout approvals (logPayoutEvent with PAYOUT_APPROVED)
 * - [ ] Payout rejections (logPayoutEvent with PAYOUT_REJECTED)
 * - [ ] Payout payments (logPayoutEvent with PAYOUT_PAID)
 * 
 * Paid Interactions:
 * - [ ] Chat paid segments (logChatEvent)
 * - [ ] Call start/end (logCallEvent)
 * - [ ] Calendar bookings (logBookingEvent)
 * - [ ] Event tickets (logEventAction)
 * - [ ] Refunds (various refund action types)
 * 
 * Safety & Risk:
 * - [ ] Panic button triggers (logPanicButton)
 * - [ ] Safety reports (logSafetyReport)
 * - [ ] Account bans/suspensions (logAccountEnforcement)
 * - [ ] Content removal (logContentRemoval)
 * 
 * Legal & Policy:
 * - [ ] Policy acceptances (logPolicyAcceptance)
 * - [ ] Legal doc updates (logLegalDocUpdate)
 */