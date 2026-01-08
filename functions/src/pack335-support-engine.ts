/**
 * PACK 335: User Support System - Core Engine
 * Handles ticket operations, refund disputes, and support workflows
 */

import * as functions from "firebase-functions";
import { db, admin } from "./init";
import {
  TicketType,
  TicketStatus,
  TicketPriority,
  CreateTicketRequest,
  AddMessageRequest,
  UpdateTicketStatusRequest,
  RefundDisputeContext,
  SupportTicket,
  SupportTicketMessage,
  SupportSystemSettings,
} from "./pack335-support-types";

/**
 * Get system settings with defaults
 */
async function getSystemSettings(): Promise<SupportSystemSettings> {
  const settingsDoc = await db.collection("supportSystemSettings").doc("GLOBAL").get();
  
  if (settingsDoc.exists) {
    return settingsDoc.data() as SupportSystemSettings;
  }
  
  // Default settings
  return {
    id: "GLOBAL",
    maxOpenTicketsPerUser: 3,
    autoCloseAfterDays: 14,
    refundDisputeWindowDays: 7,
    aiAssistantEnabled: false,
  };
}

/**
 * Count user's open tickets
 */
async function countUserOpenTickets(userId: string): Promise<number> {
  const openTickets = await db
    .collection("supportTickets")
    .where("userId", "==", userId)
    .where("status", "in", ["OPEN", "IN_PROGRESS"])
    .get();
  
  return openTickets.size;
}

/**
 * Validate refund dispute time window
 */
async function validateRefundDisputeWindow(
  context: any,
  windowDays: number
): Promise<{ valid: boolean; reason?: string }> {
  const now = admin.firestore.Timestamp.now();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  
  // Check transaction
  if (context.relatedTransactionId) {
    const txDoc = await db
      .collection("walletTransactions")
      .doc(context.relatedTransactionId)
      .get();
    
    if (!txDoc.exists) {
      return { valid: false, reason: "Transaction not found" };
    }
    
    const txData = txDoc.data()!;
    const txTime = txData.createdAt?.toMillis() || 0;
    const timeDiff = now.toMillis() - txTime;
    
    if (timeDiff > windowMs) {
      return { valid: false, reason: `Dispute window expired (${windowDays} days)` };
    }
  }
  
  // Check booking
  if (context.relatedBookingId) {
    const bookingDoc = await db
      .collection("bookings")
      .doc(context.relatedBookingId)
      .get();
    
    if (!bookingDoc.exists) {
      return { valid: false, reason: "Booking not found" };
    }
    
    const bookingData = bookingDoc.data()!;
    const meetingTime = bookingData.scheduledTime?.toMillis() || 0;
    const timeDiff = now.toMillis() - meetingTime;
    
    if (timeDiff > windowMs) {
      return { valid: false, reason: `Dispute window expired (${windowDays} days after meeting)` };
    }
  }
  
  // Check event
  if (context.relatedEventId) {
    const eventDoc = await db
      .collection("events")
      .doc(context.relatedEventId)
      .get();
    
    if (!eventDoc.exists) {
      return { valid: false, reason: "Event not found" };
    }
    
    const eventData = eventDoc.data()!;
    const eventEndTime = eventData.endTime?.toMillis() || 0;
    const timeDiff = now.toMillis() - eventEndTime;
    
    if (timeDiff > windowMs) {
      return { valid: false, reason: `Dispute window expired (${windowDays} days after event)` };
    }
  }
  
  // Check chat
  if (context.relatedChatId) {
    const chatDoc = await db
      .collection("chats")
      .doc(context.relatedChatId)
      .get();
    
    if (!chatDoc.exists) {
      return { valid: false, reason: "Chat not found" };
    }
    
    const chatData = chatDoc.data()!;
    const chatEndTime = chatData.endedAt?.toMillis() || chatData.updatedAt?.toMillis() || 0;
    const timeDiff = now.toMillis() - chatEndTime;
    
    if (timeDiff > windowMs) {
      return { valid: false, reason: `Dispute window expired (${windowDays} days after chat)` };
    }
  }
  
  return { valid: true };
}

/**
 * Determine ticket priority based on type and context
 */
function determinePriority(type: TicketType, context: any): TicketPriority {
  if (type === "SAFETY" || type === "IDENTITY_VERIFICATION") {
    return "HIGH";
  }
  
  if (type === "REFUND_DISPUTE") {
    return "NORMAL";
  }
  
  if (type === "ACCOUNT_ACCESS") {
    return "HIGH";
  }
  
  return "NORMAL";
}

/**
 * Create a support ticket
 */
export const pack335_createSupportTicket = functions.https.onCall(
  async (data: CreateTicketRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    
    const { userId, type, context: ticketContext, initialMessage, attachments } = data;
    
    // Validate user matches auth
    if (userId !== context.auth.uid) {
      throw new functions.https.HttpsError("permission-denied", "Can only create tickets for yourself");
    }
    
    // Get system settings
    const settings = await getSystemSettings();
    
    // Check max open tickets
    const openCount = await countUserOpenTickets(userId);
    if (openCount >= settings.maxOpenTicketsPerUser) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        `Maximum ${settings.maxOpenTicketsPerUser} open tickets allowed`
      );
    }
    
    // Validate refund dispute window
    if (type === "REFUND_DISPUTE") {
      // Must have at least one related context
      if (
        !ticketContext.relatedTransactionId &&
        !ticketContext.relatedChatId &&
        !ticketContext.relatedBookingId &&
        !ticketContext.relatedEventId
      ) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "REFUND_DISPUTE must have related transaction, chat, booking, or event"
        );
      }
      
      const windowCheck = await validateRefundDisputeWindow(
        ticketContext,
        settings.refundDisputeWindowDays
      );
      
      if (!windowCheck.valid) {
        throw new functions.https.HttpsError("failed-precondition", windowCheck.reason!);
      }
    }
    
    const now = admin.firestore.Timestamp.now();
    const priority = determinePriority(type, ticketContext);
    
    // Create ticket
    const ticketRef = db.collection("supportTickets").doc();
    const ticket: SupportTicket = {
      id: ticketRef.id,
      userId,
      type,
      context: ticketContext,
      status: "OPEN",
      priority,
      createdAt: now,
      updatedAt: now,
      lastUserMessageAt: now,
    };
    
    await ticketRef.set(ticket);
    
    // Create initial message
    const messageRef = db.collection("supportTicketMessages").doc();
    const message: SupportTicketMessage = {
      id: messageRef.id,
      ticketId: ticketRef.id,
      senderType: "USER",
      senderUserId: userId,
      messageText: initialMessage,
      attachments: attachments || [],
      createdAt: now,
    };
    
    await messageRef.set(message);
    
    // Log audit trail
    await db.collection("auditLogs").add({
      action: "SUPPORT_TICKET_CREATED",
      userId,
      ticketId: ticketRef.id,
      type,
      priority,
      timestamp: now,
    });
    
    return {
      success: true,
      ticketId: ticketRef.id,
      ticket,
    };
  }
);

/**
 * Add message to ticket
 */
export const pack335_addTicketMessage = functions.https.onCall(
  async (data: AddMessageRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    
    const { ticketId, messageText, attachments } = data;
    
    // Get ticket
    const ticketDoc = await db.collection("supportTickets").doc(ticketId).get();
    
    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Ticket not found");
    }
    
    const ticket = ticketDoc.data() as SupportTicket;
    
    // Check if user owns ticket or is admin
    const isAdmin = await db.collection("adminUsers").doc(context.auth.uid).get();
    const isOwner = ticket.userId === context.auth.uid;
    
    if (!isOwner && !isAdmin.exists) {
      throw new functions.https.HttpsError("permission-denied", "Not authorized for this ticket");
    }
    
    // Check if ticket is closed
    if (ticket.status === "CLOSED") {
      throw new functions.https.HttpsError("failed-precondition", "Cannot add messages to closed ticket");
    }
    
    const now = admin.firestore.Timestamp.now();
    
    // Create message
    const messageRef = db.collection("supportTicketMessages").doc();
    const message: SupportTicketMessage = {
      id: messageRef.id,
      ticketId,
      senderType: isAdmin.exists ? "AGENT" : "USER",
      senderUserId: isOwner ? context.auth.uid : undefined,
      agentId: isAdmin.exists ? context.auth.uid : undefined,
      messageText,
      attachments: attachments || [],
      createdAt: now,
    };
    
    await messageRef.set(message);
    
    // Update ticket timestamps
    const updateData: any = {
      updatedAt: now,
    };
    
    if (isOwner) {
      updateData.lastUserMessageAt = now;
    } else {
      updateData.lastAgentMessageAt = now;
      // Auto-update status to IN_PROGRESS if was OPEN
      if (ticket.status === "OPEN") {
        updateData.status = "IN_PROGRESS";
      }
    }
    
    await ticketDoc.ref.update(updateData);
    
    return {
      success: true,
      messageId: messageRef.id,
    };
  }
);

/**
 * Update ticket status (admin only)
 */
export const pack335_updateTicketStatus = functions.https.onCall(
  async (data: UpdateTicketStatusRequest, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    
    // Verify admin
    const isAdmin = await db.collection("adminUsers").doc(context.auth.uid).get();
    if (!isAdmin.exists) {
      throw new functions.https.HttpsError("permission-denied", "Admin only");
    }
    
    const { ticketId, status, resolutionSummary, resolutionCode } = data;
    
    const ticketDoc = await db.collection("supportTickets").doc(ticketId).get();
    
    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Ticket not found");
    }
    
    const now = admin.firestore.Timestamp.now();
    const updateData: any = {
      status,
      updatedAt: now,
    };
    
    if (resolutionSummary) {
      updateData.resolutionSummary = resolutionSummary;
    }
    
    if (resolutionCode) {
      updateData.resolutionCode = resolutionCode;
    }
    
    await ticketDoc.ref.update(updateData);
    
    // Add system message
    if (status === "RESOLVED" || status === "REJECTED" || status === "CLOSED") {
      const messageRef = db.collection("supportTicketMessages").doc();
      const message: SupportTicketMessage = {
        id: messageRef.id,
        ticketId,
        senderType: "SYSTEM",
        messageText: `Ticket status changed to ${status}${resolutionSummary ? `: ${resolutionSummary}` : ""}`,
        createdAt: now,
      };
      
      await messageRef.set(message);
    }
    
    // Log audit
    await db.collection("auditLogs").add({
      action: "SUPPORT_TICKET_STATUS_UPDATED",
      agentId: context.auth.uid,
      ticketId,
      oldStatus: ticketDoc.data()!.status,
      newStatus: status,
      resolutionCode,
      timestamp: now,
    });
    
    return { success: true };
  }
);

/**
 * Handle refund dispute (admin only)
 * Loads context and provides decision support
 */
export const pack335_handleRefundDispute = functions.https.onCall(
  async (data: RefundDisputeContext, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }
    
    // Verify admin
    const isAdmin = await db.collection("adminUsers").doc(context.auth.uid).get();
    if (!isAdmin.exists) {
      throw new functions.https.HttpsError("permission-denied", "Admin only");
    }
    
    const { ticketId } = data;
    
    const ticketDoc = await db.collection("supportTickets").doc(ticketId).get();
    
    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Ticket not found");
    }
    
    const ticket = ticketDoc.data() as SupportTicket;
    
    if (ticket.type !== "REFUND_DISPUTE") {
      throw new functions.https.HttpsError("invalid-argument", "Not a refund dispute ticket");
    }
    
    // Gather context
    const disputeContext: any = {
      ticket,
      user: null,
      transaction: null,
      booking: null,
      event: null,
      chat: null,
      automaticRefunds: [],
    };
    
    // Load user
    const userDoc = await db.collection("users").doc(ticket.userId).get();
    if (userDoc.exists) {
      disputeContext.user = userDoc.data();
    }
    
    // Load transaction
    if (ticket.context.relatedTransactionId) {
      const txDoc = await db
        .collection("walletTransactions")
        .doc(ticket.context.relatedTransactionId)
        .get();
      if (txDoc.exists) {
        disputeContext.transaction = txDoc.data();
      }
    }
    
    // Load booking
    if (ticket.context.relatedBookingId) {
      const bookingDoc = await db
        .collection("bookings")
        .doc(ticket.context.relatedBookingId)
        .get();
      if (bookingDoc.exists) {
        disputeContext.booking = bookingDoc.data();
      }
    }
    
    // Load event
    if (ticket.context.relatedEventId) {
      const eventDoc = await db
        .collection("events")
        .doc(ticket.context.relatedEventId)
        .get();
      if (eventDoc.exists) {
        disputeContext.event = eventDoc.data();
      }
    }
    
    // Load chat
    if (ticket.context.relatedChatId) {
      const chatDoc = await db
        .collection("chats")
        .doc(ticket.context.relatedChatId)
        .get();
      if (chatDoc.exists) {
        disputeContext.chat = chatDoc.data();
      }
    }
    
    // Check for previous automatic refunds
    const refundsQuery = await db
      .collection("walletTransactions")
      .where("userId", "==", ticket.userId)
      .where("type", "==", "REFUND")
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    
    disputeContext.automaticRefunds = refundsQuery.docs.map(doc => doc.data());
    
    return {
      success: true,
      disputeContext,
      message: "Context loaded. Use existing refund APIs (pack277_refundTokens) to process.",
    };
  }
);

/**
 * Close user's own ticket
 */
export const pack335_closeTicket = functions.https.onCall(async (data: { ticketId: string }, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
  }
  
  const { ticketId } = data;
  
  const ticketDoc = await db.collection("supportTickets").doc(ticketId).get();
  
  if (!ticketDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Ticket not found");
  }
  
  const ticket = ticketDoc.data() as SupportTicket;
  
  // Check ownership
  if (ticket.userId !== context.auth.uid) {
    throw new functions.https.HttpsError("permission-denied", "Not your ticket");
  }
  
  // Can only close if resolved or rejected
  if (ticket.status !== "RESOLVED" && ticket.status !== "REJECTED") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Can only close tickets that are RESOLVED or REJECTED"
    );
  }
  
  const now = admin.firestore.Timestamp.now();
  
  await ticketDoc.ref.update({
    status: "CLOSED",
    updatedAt: now,
  });
  
  // Add system message
  const messageRef = db.collection("supportTicketMessages").doc();
  const message: SupportTicketMessage = {
    id: messageRef.id,
    ticketId,
    senderType: "SYSTEM",
    messageText: "Ticket closed by user",
    createdAt: now,
  };
  
  await messageRef.set(message);
  
  return { success: true };
});