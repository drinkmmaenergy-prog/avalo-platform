/**
 * PACK 57 — Dispute & Evidence Center API
 * Backend endpoints for dispute management
 */

import { db, admin, serverTimestamp } from "./init";
import { onTransactionIssue } from "./moderationCaseHooks";
import {
  DisputeType,
  DisputeStatus,
  DisputeOutcome,
  DisputeDomainContext,
  computeResolutionActions,
  isValidDisputeType,
  isValidDisputeStatus,
  isValidDisputeOutcome
} from "./disputeEngine";

const FieldValue = admin.firestore.FieldValue;

// ============================================================================
// TYPES
// ============================================================================

interface DisputeRecord {
  disputeId: string;
  createdByUserId: string;
  targetUserId?: string | null;
  type: DisputeType;
  
  // Linkage to domain objects
  payoutRequestId?: string | null;
  earningEventId?: string | null;
  reservationId?: string | null;
  moderationCaseId?: string | null;
  
  // Lifecycle
  status: DisputeStatus;
  resolution: {
    outcome?: DisputeOutcome;
    notes?: string;
    decidedBy?: string;
    decidedAt?: admin.firestore.Timestamp;
  };
  
  // User-facing data
  title: string;
  description: string;
  userVisibleOutcomeMessage?: string;
  
  // Metadata
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  lastMessageAt?: admin.firestore.Timestamp;
}

interface DisputeMessage {
  messageId: string;
  authorType: "USER" | "SUPPORT" | "SYSTEM";
  authorUserId?: string | null;
  body: string;
  createdAt: admin.firestore.Timestamp;
}

interface DisputeEvidence {
  evidenceId: string;
  uploadedByUserId: string;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "TEXT" | "LINK";
  storagePath?: string | null;
  textContent?: string | null;
  linkedMessageId?: string | null;
  linkedMediaId?: string | null;
  createdAt: admin.firestore.Timestamp;
}

// ============================================================================
// CREATE DISPUTE
// ============================================================================

export interface CreateDisputeParams {
  userId: string;
  type: DisputeType;
  title: string;
  description: string;
  payoutRequestId?: string;
  earningEventId?: string;
  reservationId?: string;
  moderationCaseId?: string;
  targetUserId?: string;
}

export async function createDispute(
  params: CreateDisputeParams
): Promise<DisputeRecord> {
  const {
    userId,
    type,
    title,
    description,
    payoutRequestId,
    earningEventId,
    reservationId,
    moderationCaseId,
    targetUserId
  } = params;

  // Validate user
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) {
    throw new Error("User not found");
  }

  const userData = userDoc.data();
  
  // AgeGate check (18+)
  if (!userData?.ageVerified || userData.age < 18) {
    throw new Error("Age verification required (18+)");
  }

  // Check account status
  const enforcementSnap = await db
    .collection("enforcement_state")
    .doc(userId)
    .get();
  
  if (enforcementSnap.exists) {
    const enforcement = enforcementSnap.data();
    if (enforcement?.accountStatus === "BANNED") {
      throw new Error("Account is banned");
    }
  }

  // Validate type
  if (!isValidDisputeType(type)) {
    throw new Error(`Invalid dispute type: ${type}`);
  }

  // Create dispute record
  const disputeRef = db.collection("disputes").doc();
  const disputeId = disputeRef.id;
  const now = admin.firestore.Timestamp.now();

  const dispute: DisputeRecord = {
    disputeId,
    createdByUserId: userId,
    targetUserId: targetUserId || null,
    type,
    payoutRequestId: payoutRequestId || null,
    earningEventId: earningEventId || null,
    reservationId: reservationId || null,
    moderationCaseId: moderationCaseId || null,
    status: "OPEN",
    resolution: {},
    title,
    description,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now
  };

  await disputeRef.set(dispute);

  // Create initial message with description
  const messageRef = disputeRef.collection("messages").doc();
  const message: DisputeMessage = {
    messageId: messageRef.id,
    authorType: "USER",
    authorUserId: userId,
    body: description,
    createdAt: now
  };
  await messageRef.set(message);

  // Send notification to support/admin (internal)
  // Using notification system from PACK 53
  try {
    await db.collection("admin_notifications").add({
      type: "DISPUTE_CREATED",
      disputeId,
      disputeType: type,
      createdByUserId: userId,
      title,
      createdAt: now,
      read: false
    });
  } catch (error) {
    console.error("Failed to create admin notification:", error);
    // Non-blocking
  }

  // PACK 88: Create moderation case
  try {
    await onTransactionIssue(userId, disputeId, type);
  } catch (error) {
    console.error('Failed to create moderation case for dispute:', error);
    // Don't fail the dispute creation if case creation fails
  }

  return dispute;
}

// ============================================================================
// ADD MESSAGE TO DISPUTE
// ============================================================================

export interface AddDisputeMessageParams {
  userId: string;
  disputeId: string;
  body: string;
  authorType?: "USER" | "SUPPORT" | "SYSTEM";
}

export async function addDisputeMessage(
  params: AddDisputeMessageParams
): Promise<DisputeMessage> {
  const { userId, disputeId, body, authorType = "USER" } = params;

  // Load dispute
  const disputeRef = db.collection("disputes").doc(disputeId);
  const disputeSnap = await disputeRef.get();
  
  if (!disputeSnap.exists) {
    throw new Error("Dispute not found");
  }

  const dispute = disputeSnap.data() as DisputeRecord;

  // Verify user is involved in dispute
  if (
    authorType === "USER" &&
    dispute.createdByUserId !== userId &&
    dispute.targetUserId !== userId
  ) {
    throw new Error("Unauthorized to add message to this dispute");
  }

  // Create message
  const messageRef = disputeRef.collection("messages").doc();
  const now = admin.firestore.Timestamp.now();

  const message: DisputeMessage = {
    messageId: messageRef.id,
    authorType,
    authorUserId: authorType === "USER" ? userId : null,
    body,
    createdAt: now
  };

  await messageRef.set(message);

  // Update lastMessageAt on dispute
  await disputeRef.update({
    lastMessageAt: now,
    updatedAt: now
  });

  return message;
}

// ============================================================================
// ADD EVIDENCE TO DISPUTE
// ============================================================================

export interface AddDisputeEvidenceParams {
  userId: string;
  disputeId: string;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "TEXT" | "LINK";
  storagePath?: string;
  textContent?: string;
  linkedMessageId?: string;
  linkedMediaId?: string;
}

export async function addDisputeEvidence(
  params: AddDisputeEvidenceParams
): Promise<DisputeEvidence> {
  const {
    userId,
    disputeId,
    type,
    storagePath,
    textContent,
    linkedMessageId,
    linkedMediaId
  } = params;

  // Load dispute
  const disputeRef = db.collection("disputes").doc(disputeId);
  const disputeSnap = await disputeRef.get();
  
  if (!disputeSnap.exists) {
    throw new Error("Dispute not found");
  }

  const dispute = disputeSnap.data() as DisputeRecord;

  // Verify user is involved in dispute
  if (
    dispute.createdByUserId !== userId &&
    dispute.targetUserId !== userId
  ) {
    throw new Error("Unauthorized to add evidence to this dispute");
  }

  // Create evidence record
  const evidenceRef = disputeRef.collection("evidence").doc();
  const now = admin.firestore.Timestamp.now();

  const evidence: DisputeEvidence = {
    evidenceId: evidenceRef.id,
    uploadedByUserId: userId,
    type,
    storagePath: storagePath || null,
    textContent: textContent || null,
    linkedMessageId: linkedMessageId || null,
    linkedMediaId: linkedMediaId || null,
    createdAt: now
  };

  await evidenceRef.set(evidence);

  // Update dispute
  await disputeRef.update({
    updatedAt: now
  });

  // For media evidence, ensure it goes through CSAM/safety scanning
  // This is handled by the existing media upload pipeline (PACK 55)
  // The storagePath should already point to a scanned media object

  return evidence;
}

// ============================================================================
// GET DISPUTES FOR USER
// ============================================================================

export interface GetDisputesParams {
  userId: string;
  cursor?: string;
  limit?: number;
}

export interface DisputeSummary {
  disputeId: string;
  type: DisputeType;
  status: DisputeStatus;
  title: string;
  userVisibleOutcomeMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export async function getDisputesForUser(
  params: GetDisputesParams
): Promise<{ items: DisputeSummary[]; nextCursor?: string }> {
  const { userId, cursor, limit = 20 } = params;

  let query = db
    .collection("disputes")
    .where("createdByUserId", "==", userId)
    .orderBy("updatedAt", "desc")
    .limit(limit + 1);

  if (cursor) {
    const cursorSnap = await db.collection("disputes").doc(cursor).get();
    if (cursorSnap.exists) {
      query = query.startAfter(cursorSnap);
    }
  }

  const snapshot = await query.get();
  const items: DisputeSummary[] = [];
  let nextCursor: string | undefined;

  const docs = snapshot.docs;
  for (let index = 0; index < docs.length; index++) {
    const doc = docs[index];
    if (index < limit) {
      const data = doc.data() as DisputeRecord;
      items.push({
        disputeId: data.disputeId,
        type: data.type,
        status: data.status,
        title: data.title,
        userVisibleOutcomeMessage: data.userVisibleOutcomeMessage,
        createdAt: data.createdAt.toMillis(),
        updatedAt: data.updatedAt.toMillis()
      });
    } else {
      nextCursor = doc.id;
    }
  }

  return { items, nextCursor };
}

// ============================================================================
// GET DISPUTE DETAIL
// ============================================================================

export interface GetDisputeDetailParams {
  userId: string;
  disputeId: string;
}

export interface DisputeDetail extends DisputeSummary {
  description?: string;
  messages: Array<{
    messageId: string;
    authorType: "USER" | "SUPPORT" | "SYSTEM";
    body: string;
    createdAt: number;
  }>;
  evidenceCount?: number;
}

export async function getDisputeDetail(
  params: GetDisputeDetailParams
): Promise<DisputeDetail | null> {
  const { userId, disputeId } = params;

  const disputeSnap = await db.collection("disputes").doc(disputeId).get();
  
  if (!disputeSnap.exists) {
    return null;
  }

  const dispute = disputeSnap.data() as DisputeRecord;

  // Verify user has access
  if (
    dispute.createdByUserId !== userId &&
    dispute.targetUserId !== userId
  ) {
    throw new Error("Unauthorized to view this dispute");
  }

  // Get messages (last 50)
  const messagesSnap = await db
    .collection("disputes")
    .doc(disputeId)
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const messages = messagesSnap.docs.map(doc => {
    const msg = doc.data() as DisputeMessage;
    return {
      messageId: msg.messageId,
      authorType: msg.authorType,
      body: msg.body,
      createdAt: msg.createdAt.toMillis()
    };
  }).reverse(); // Reverse to show oldest first

  // Get evidence count
  const evidenceSnap = await db
    .collection("disputes")
    .doc(disputeId)
    .collection("evidence")
    .count()
    .get();

  const evidenceCount = evidenceSnap.data().count;

  return {
    disputeId: dispute.disputeId,
    type: dispute.type,
    status: dispute.status,
    title: dispute.title,
    description: dispute.description,
    userVisibleOutcomeMessage: dispute.userVisibleOutcomeMessage,
    createdAt: dispute.createdAt.toMillis(),
    updatedAt: dispute.updatedAt.toMillis(),
    messages,
    evidenceCount
  };
}

// ============================================================================
// RESOLVE DISPUTE (ADMIN/SUPPORT)
// ============================================================================

export interface ResolveDisputeParams {
  disputeId: string;
  decidedBy: string;
  outcome: DisputeOutcome;
  userVisibleOutcomeMessage?: string;
  resolutionNotes?: string;
}

export async function resolveDispute(
  params: ResolveDisputeParams
): Promise<void> {
  const {
    disputeId,
    decidedBy,
    outcome,
    userVisibleOutcomeMessage,
    resolutionNotes
  } = params;

  // Validate outcome
  if (!isValidDisputeOutcome(outcome)) {
    throw new Error(`Invalid outcome: ${outcome}`);
  }

  // Load dispute
  const disputeRef = db.collection("disputes").doc(disputeId);
  const disputeSnap = await disputeRef.get();
  
  if (!disputeSnap.exists) {
    throw new Error("Dispute not found");
  }

  const dispute = disputeSnap.data() as DisputeRecord;

  // Build domain context
  const context: DisputeDomainContext = {};

  // Load payout request if exists
  if (dispute.payoutRequestId) {
    const payoutSnap = await db
      .collection("payout_requests")
      .doc(dispute.payoutRequestId)
      .get();
    
    if (payoutSnap.exists) {
      const payout = payoutSnap.data();
      context.payoutStatus = payout?.status;
      context.payoutAmount = payout?.netAmount;
    }
  }

  // Load earning event if exists
  if (dispute.earningEventId) {
    const earningSnap = await db
      .collection("token_earn_events")
      .doc(dispute.earningEventId)
      .get();
    
    if (earningSnap.exists) {
      const earning = earningSnap.data();
      context.earningTokens = earning?.tokens;
    }
  }

  // Load reservation if exists (PACK 58+)
  if (dispute.reservationId) {
    const reservationSnap = await db
      .collection("reservations")
      .doc(dispute.reservationId)
      .get();
    
    if (reservationSnap.exists) {
      const reservation = reservationSnap.data();
      context.escrowTokens = reservation?.escrowTokens;
    }
  }

  // Load enforcement state
  const enforcementSnap = await db
    .collection("enforcement_state")
    .doc(dispute.createdByUserId)
    .get();
  
  if (enforcementSnap.exists) {
    const enforcement = enforcementSnap.data();
    context.enforcementState = {
      accountStatus: enforcement?.accountStatus || "ACTIVE",
      earningStatus: enforcement?.earningStatus || "ACTIVE"
    };
  }

  // Compute resolution actions
  const actions = computeResolutionActions(dispute.type, context, outcome);

  // Apply domain-specific effects in a transaction
  await db.runTransaction(async (transaction) => {
    // Apply payout adjustments
    if (actions.adjustPayoutRequestStatus && dispute.payoutRequestId) {
      const payoutRef = db.collection("payout_requests").doc(dispute.payoutRequestId);
      
      if (actions.adjustPayoutRequestStatus === "BLOCKED") {
        transaction.update(payoutRef, {
          status: "FAILED",
          failureReason: "BLOCKED_BY_DISPUTE",
          updatedAt: FieldValue.serverTimestamp()
        });
      } else if (actions.adjustPayoutRequestStatus === "RELEASED") {
        transaction.update(payoutRef, {
          status: "APPROVED",
          approvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }

    // Apply token adjustments (if any)
    if (actions.tokensToRefund && actions.tokensToRefund > 0) {
      // Create token adjustment record
      const adjustmentRef = db.collection("token_adjustments").doc();
      transaction.set(adjustmentRef, {
        adjustmentId: adjustmentRef.id,
        userId: dispute.createdByUserId,
        tokens: actions.tokensToRefund,
        reason: "DISPUTE_REFUND",
        disputeId,
        createdAt: FieldValue.serverTimestamp()
      });

      // Update user token balance
      const userRef = db.collection("users").doc(dispute.createdByUserId);
      transaction.update(userRef, {
        tokenBalance: FieldValue.increment(actions.tokensToRefund)
      });
    }

    if (actions.tokensToRevokeFromCreator && actions.tokensToRevokeFromCreator > 0 && dispute.targetUserId) {
      // Revoke tokens from creator
      const creatorRef = db.collection("users").doc(dispute.targetUserId);
      transaction.update(creatorRef, {
        creatorEarnings: FieldValue.increment(-actions.tokensToRevokeFromCreator)
      });

      // Log revocation
      const revocationRef = db.collection("token_revocations").doc();
      transaction.set(revocationRef, {
        revocationId: revocationRef.id,
        creatorUserId: dispute.targetUserId,
        tokens: actions.tokensToRevokeFromCreator,
        reason: "DISPUTE_RESOLUTION",
        disputeId,
        createdAt: FieldValue.serverTimestamp()
      });
    }

    // Apply enforcement updates
    if (actions.updateEnforcementState && dispute.createdByUserId) {
      const enforcementRef = db.collection("enforcement_state").doc(dispute.createdByUserId);
      transaction.set(
        enforcementRef,
        {
          ...actions.updateEnforcementState,
          lastUpdated: FieldValue.serverTimestamp(),
          lastDisputeId: disputeId
        },
        { merge: true }
      );
    }

    // Update dispute record
    const now = admin.firestore.Timestamp.now();
    transaction.update(disputeRef, {
      status: "RESOLVED",
      "resolution.outcome": outcome,
      "resolution.notes": resolutionNotes || actions.internalNotes || "",
      "resolution.decidedBy": decidedBy,
      "resolution.decidedAt": now,
      userVisibleOutcomeMessage: userVisibleOutcomeMessage || `Your dispute has been resolved: ${outcome}`,
      updatedAt: now
    });

    // Add system message
    const systemMessageRef = disputeRef.collection("messages").doc();
    transaction.set(systemMessageRef, {
      messageId: systemMessageRef.id,
      authorType: "SYSTEM",
      body: userVisibleOutcomeMessage || `Dispute resolved: ${outcome}`,
      createdAt: now
    });
  });

  // Send notification to user (PACK 53)
  try {
    await db.collection("notifications").add({
      userId: dispute.createdByUserId,
      type: "EARNINGS",
      title: "Dispute Resolved",
      body: userVisibleOutcomeMessage || `Your dispute has been resolved: ${outcome}`,
      data: {
        disputeId,
        outcome
      },
      read: false,
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to send notification:", error);
    // Non-blocking
  }
}

// ============================================================================
// HELPER: Get Dispute Status
// ============================================================================

export async function getDisputeStatus(disputeId: string): Promise<DisputeStatus | null> {
  const disputeSnap = await db.collection("disputes").doc(disputeId).get();
  
  if (!disputeSnap.exists) {
    return null;
  }

  const dispute = disputeSnap.data() as DisputeRecord;
  return dispute.status;
}

// ============================================================================
// HELPER: Update Dispute Status
// ============================================================================

export async function updateDisputeStatus(
  disputeId: string,
  status: DisputeStatus
): Promise<void> {
  if (!isValidDisputeStatus(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  await db.collection("disputes").doc(disputeId).update({
    status,
    updatedAt: admin.firestore.Timestamp.now()
  });
}