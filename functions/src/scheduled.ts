/**
 * Scheduled Functions (CRON Jobs)
 * Handles automated tasks like chat expiry, calendar sweep, and Royal eligibility
 */

;
import { Timestamp } from "firebase-admin/firestore";
;
import { CHAT_EXPIRY_MS, ChatStatus, BookingStatus, TransactionType, ROYAL_INSTAGRAM_FOLLOWERS_MIN, ROYAL_MONTHLY_EARNINGS_MIN_TOKENS, ROYAL_QUALITY_SCORE_MIN } from './config.js';
import { Chat, CalendarBooking, Transaction, UserProfile } from "./types.js";

/**
 * Expire stale chats (48h inactivity)
 * Runs every hour
 * CRON: 0 * * * *
 */
export const expireStaleChats = onSchedule(
  {
    schedule: "0 * * * *",
    timeZone: "Europe/Warsaw",
    region: "europe-west3",
  },
  async (event) => {
    console.log("Starting chat expiry sweep...");

    const now = Timestamp.now();
    const expiryThreshold = new Timestamp(
      now.seconds - CHAT_EXPIRY_MS / 1000,
      now.nanoseconds
    );

    try {
      // Find active chats older than 48h
      const staleChatsSnap = await db
        .collection("chats")
        .where("status", "==", ChatStatus.ACTIVE)
        .where("lastActivityAt", "<", expiryThreshold)
        .limit(100) // Process in batches
        .get();

      console.log(`Found ${staleChatsSnap.size} stale chats`);

      const batch = db.batch();
      let refundCount = 0;

      for (const chatDoc of staleChatsSnap.docs) {
        const chat = chatDoc.data() as Chat;
        const refundAmount = chat.billing?.currentBalance || 0;

        if (refundAmount > 0 && chat.roles?.payer) {
          // Refund escrow to payer
          const walletRef = db
            .collection("users")
            .doc(chat.roles.payer)
            .collection("wallet")
            .doc("current");

          batch.update(walletRef, {
            balance: increment(refundAmount),
            pending: increment(-refundAmount),
          });

          // Record refund transaction
          const txId = generateId();
          batch.set(db.collection("transactions").doc(txId), {
            txId,
            uid: chat.roles.payer,
            type: TransactionType.REFUND,
            amountTokens: refundAmount,
            status: "completed",
            metadata: {
              chatId: chat.chatId,
              reason: "auto_expiry_48h",
            },
            createdAt: serverTimestamp(),
            completedAt: serverTimestamp(),
          } as Transaction);

          refundCount++;
        }

        // Mark chat as expired
        batch.update(chatDoc.ref, {
          status: ChatStatus.EXPIRED,
          "billing.currentBalance": 0,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      console.log(
        `Expired ${staleChatsSnap.size} chats, refunded ${refundCount} escrows`
      );
    } catch (error) {
      console.error("Error expiring chats:", error);
    }

    return null;
  });

/**
 * Calendar sweep - complete bookings, handle no-shows
 * Runs every 30 minutes
 * CRON pattern: every 30 minutes (use pattern: star-slash-30 space star space star space star space star)
 */

export const calendarSweep = onSchedule(
  {
    schedule: "*/30 * * * *",
    timeZone: "Europe/Warsaw",
    region: "europe-west3",
  },
  async (event) => {
    console.log("Starting calendar sweep...");

    const now = Timestamp.now();

    try {
      // Find bookings that should be completed but weren't verified
      const overdueBookingsSnap = await db
        .collection("calendarBookings")
        .where("status", "==", BookingStatus.CONFIRMED)
        .where("slot.end", "<", now)
        .limit(50)
        .get();

      console.log(`Found ${overdueBookingsSnap.size} overdue bookings`);

      const batch = db.batch();
      let noShowCount = 0;

      for (const bookingDoc of overdueBookingsSnap.docs) {
        const booking = bookingDoc.data() as CalendarBooking;

        // Check if verification window has passed (e.g., 2 hours after end time)
        const slotEnd = booking.slot.end as any;
        const verificationDeadline = new Timestamp(
          slotEnd.seconds + 2 * 60 * 60,
          slotEnd.nanoseconds
        );

        if (now.toMillis() > verificationDeadline.toMillis()) {
          // No verification within window - mark as no-show
          // Refund policy: booker gets 0%, creator gets 80% (already in escrow)

          // Release escrow to creator
          const creatorWalletRef = db
            .collection("users")
            .doc(booking.creatorId)
            .collection("wallet")
            .doc("current");

          batch.update(creatorWalletRef, {
            balance: increment(booking.payment.escrowTokens),
            earned: increment(booking.payment.escrowTokens),
          });

          // Decrease booker pending
          const bookerWalletRef = db
            .collection("users")
            .doc(booking.bookerId)
            .collection("wallet")
            .doc("current");

          batch.update(bookerWalletRef, {
            pending: increment(-booking.payment.escrowTokens),
          });

          // Record transaction
          const txId = generateId();
          batch.set(db.collection("transactions").doc(txId), {
            txId,
            uid: booking.creatorId,
            type: TransactionType.CALENDAR,
            amountTokens: booking.payment.escrowTokens,
            split: {
              platformTokens: 0,
              creatorTokens: booking.payment.escrowTokens,
            },
            status: "completed",
            metadata: {
              bookingId: booking.bookingId,
              reason: "auto_completed_no_show",
            },
            createdAt: serverTimestamp(),
            completedAt: serverTimestamp(),
          } as Transaction);

          // Update booking
          batch.update(bookingDoc.ref, {
            status: BookingStatus.NO_SHOW,
            updatedAt: serverTimestamp(),
          });

          noShowCount++;
        }
      }

      await batch.commit();

      console.log(
        `Processed ${overdueBookingsSnap.size} overdue bookings, ${noShowCount} no-shows`
      );
    } catch (error) {
      console.error("Error in calendar sweep:", error);
    }

    return null;
  });

/**
 * Update Royal Club eligibility
 * Runs daily at 3 AM
 * CRON: 0 3 * * *
 */
export const updateRoyalEligibility = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "Europe/Warsaw",
    region: "europe-west3",
  },
  async (event) => {
    console.log("Starting Royal Club eligibility update...");

    try {
      // Get all users
      const usersSnap = await db.collection("users").limit(1000).get();

      console.log(`Checking ${usersSnap.size} users for Royal eligibility`);

      const batch = db.batch();
      let grantedCount = 0;
      let revokedCount = 0;

      for (const userDoc of usersSnap.docs) {
        const user = userDoc.data() as UserProfile;
        let shouldBeRoyal = false;

        // Check Instagram followers
        if (
          user.instagram?.linked &&
          (user.instagram.followers || 0) >= ROYAL_INSTAGRAM_FOLLOWERS_MIN
        ) {
          shouldBeRoyal = true;
        }

        // Check monthly earnings (would need to query transactions from last 30 days)
        // Simplified: check total earned (in production, calculate last 30 days)
        const walletSnap = await db
          .collection("users")
          .doc(user.uid)
          .collection("wallet")
          .doc("current")
          .get();
        const wallet = walletSnap.data();

        if (wallet && wallet.earned >= ROYAL_MONTHLY_EARNINGS_MIN_TOKENS) {
          shouldBeRoyal = true;
        }

        // Check quality score
        if (shouldBeRoyal && user.qualityScore < ROYAL_QUALITY_SCORE_MIN) {
          shouldBeRoyal = false; // Revoke if quality too low
        }

        // Update if status changed
        const currentlyRoyal = user.roles?.royal || false;

        if (shouldBeRoyal && !currentlyRoyal) {
          batch.update(userDoc.ref, {
            "roles.royal": true,
            updatedAt: serverTimestamp(),
          });
          grantedCount++;
        } else if (!shouldBeRoyal && currentlyRoyal) {
          // Only revoke if not subscription-based
          // (would need to check Stripe subscription)
          batch.update(userDoc.ref, {
            "roles.royal": false,
            updatedAt: serverTimestamp(),
          });
          revokedCount++;
        }
      }

      await batch.commit();

      console.log(
        `Royal eligibility updated: ${grantedCount} granted, ${revokedCount} revoked`
      );
    } catch (error) {
      console.error("Error updating Royal eligibility:", error);
    }

    return null;
  });


