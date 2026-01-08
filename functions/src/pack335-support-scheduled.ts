/**
 * PACK 335: User Support System - Scheduled Functions
 * Auto-close old tickets and maintenance tasks
 */

import * as functions from "firebase-functions";
import { db, admin } from "./init";
import { SupportTicket, SupportTicketMessage, SupportSystemSettings } from "./pack335-support-types";

/**
 * Auto-close old tickets that have been resolved/rejected with no response
 * Runs daily at 2 AM UTC
 */
export const pack335_autoCloseOldTickets = functions.pubsub
  .schedule("0 2 * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    console.log("Starting auto-close old tickets job");
    
    // Get settings
    const settingsDoc = await db.collection("supportSystemSettings").doc("GLOBAL").get();
    const settings = settingsDoc.exists
      ? (settingsDoc.data() as SupportSystemSettings)
      : { autoCloseAfterDays: 14 };
    
    const cutoffTime = admin.firestore.Timestamp.fromMillis(
      Date.now() - settings.autoCloseAfterDays * 24 * 60 * 60 * 1000
    );
    
    // Find tickets to close
    const ticketsQuery = await db
      .collection("supportTickets")
      .where("status", "in", ["RESOLVED", "REJECTED"])
      .where("updatedAt", "<", cutoffTime)
      .limit(100)
      .get();
    
    console.log(`Found ${ticketsQuery.size} tickets to auto-close`);
    
    const batch = db.batch();
    const now = admin.firestore.Timestamp.now();
    let count = 0;
    
    for (const ticketDoc of ticketsQuery.docs) {
      const ticket = ticketDoc.data() as SupportTicket;
      
      // Check if there's been any user response since resolution
      const messagesQuery = await db
        .collection("supportTicketMessages")
        .where("ticketId", "==", ticketDoc.id)
        .where("senderType", "==", "USER")
        .where("createdAt", ">", ticket.updatedAt)
        .limit(1)
        .get();
      
      // Only close if no user response after resolution
      if (messagesQuery.empty) {
        batch.update(ticketDoc.ref, {
          status: "CLOSED",
          updatedAt: now,
        });
        
        // Add system message
        const messageRef = db.collection("supportTicketMessages").doc();
        const message: SupportTicketMessage = {
          id: messageRef.id,
          ticketId: ticketDoc.id,
          senderType: "SYSTEM",
          messageText: `This ticket has been auto-closed due to inactivity (${settings.autoCloseAfterDays} days).`,
          createdAt: now,
        };
        
        batch.set(messageRef, message);
        count++;
      }
    }
    
    await batch.commit();
    
    console.log(`Auto-closed ${count} tickets`);
    
    // Log to audit
    await db.collection("auditLogs").add({
      action: "SUPPORT_AUTO_CLOSE",
      ticketsClosed: count,
      timestamp: now,
    });
    
    return { ticketsClosed: count };
  });

/**
 * Send notifications for tickets awaiting user response
 * Runs daily at 10 AM UTC
 */
export const pack335_notifyPendingTickets = functions.pubsub
  .schedule("0 10 * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    console.log("Starting pending tickets notification job");
    
    const reminderWindowMs = 3 * 24 * 60 * 60 * 1000; // 3 days
    const cutoffTime = admin.firestore.Timestamp.fromMillis(Date.now() - reminderWindowMs);
    
    // Find tickets with agent response but no user reply
    const ticketsQuery = await db
      .collection("supportTickets")
      .where("status", "==", "IN_PROGRESS")
      .where("lastAgentMessageAt", "<", cutoffTime)
      .limit(50)
      .get();
    
    console.log(`Found ${ticketsQuery.size} tickets needing reminder`);
    
    let notificationsSent = 0;
    
    for (const ticketDoc of ticketsQuery.docs) {
      const ticket = ticketDoc.data() as SupportTicket;
      
      // Check if user has replied since agent message
      if (
        ticket.lastUserMessageAt &&
        ticket.lastAgentMessageAt &&
        ticket.lastUserMessageAt.toMillis() > ticket.lastAgentMessageAt.toMillis()
      ) {
        continue; // User already replied
      }
      
      // Send notification (stub for notification system)
      await db.collection("notifications").add({
        userId: ticket.userId,
        type: "SUPPORT_TICKET_PENDING",
        title: "Support ticket awaiting response",
        body: `Your support ticket #${ticketDoc.id.slice(0, 8)} is awaiting your response.`,
        data: {
          ticketId: ticketDoc.id,
          screen: "SupportTicketDetail",
        },
        createdAt: admin.firestore.Timestamp.now(),
        read: false,
      });
      
      notificationsSent++;
    }
    
    console.log(`Sent ${notificationsSent} notifications`);
    
    return { notificationsSent };
  });

/**
 * Generate ticket analytics
 * Runs daily at 3 AM UTC
 */
export const pack335_generateTicketAnalytics = functions.pubsub
  .schedule("0 3 * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    console.log("Starting ticket analytics generation");
    
    const now = admin.firestore.Timestamp.now();
    const last24h = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Count tickets by status
    const allTickets = await db.collection("supportTickets").get();
    const recent24h = await db
      .collection("supportTickets")
      .where("createdAt", ">=", last24h)
      .get();
    const recent7d = await db
      .collection("supportTickets")
      .where("createdAt", ">=", last7d)
      .get();
    
    const analytics = {
      generatedAt: now,
      total: {
        all: allTickets.size,
        last24h: recent24h.size,
        last7d: recent7d.size,
      },
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      averageResolutionTimeHours: 0,
    };
    
    // Aggregate statistics
    let totalResolutionTime = 0;
    let resolvedCount = 0;
    
    for (const doc of allTickets.docs) {
      const ticket = doc.data() as SupportTicket;
      
      // Count by status
      analytics.byStatus[ticket.status] = (analytics.byStatus[ticket.status] || 0) + 1;
      
      // Count by type
      analytics.byType[ticket.type] = (analytics.byType[ticket.type] || 0) + 1;
      
      // Count by priority
      analytics.byPriority[ticket.priority] = (analytics.byPriority[ticket.priority] || 0) + 1;
      
      // Calculate resolution time
      if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
        const resolutionTime = ticket.updatedAt.toMillis() - ticket.createdAt.toMillis();
        totalResolutionTime += resolutionTime;
        resolvedCount++;
      }
    }
    
    if (resolvedCount > 0) {
      analytics.averageResolutionTimeHours = totalResolutionTime / resolvedCount / (1000 * 60 * 60);
    }
    
    // Save analytics
    await db.collection("supportAnalytics").doc(now.toMillis().toString()).set(analytics);
    
    console.log("Ticket analytics generated", analytics);
    
    return analytics;
  });