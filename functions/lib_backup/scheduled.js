"use strict";
/**
 * Scheduled Functions (CRON Jobs)
 * Handles automated tasks like chat expiry, calendar sweep, and Royal eligibility
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRoyalEligibility = exports.calendarSweep = exports.expireStaleChats = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const init_1 = require("./init");
const config_1 = require("./config");
/**
 * Expire stale chats (48h inactivity)
 * Runs every hour
 * CRON: 0 * * * *
 */
exports.expireStaleChats = (0, scheduler_1.onSchedule)({
    schedule: "0 * * * *",
    timeZone: "Europe/Warsaw",
    region: "europe-west3",
}, async (event) => {
    console.log("Starting chat expiry sweep...");
    const now = firestore_1.Timestamp.now();
    const expiryThreshold = new firestore_1.Timestamp(now.seconds - config_1.CHAT_EXPIRY_MS / 1000, now.nanoseconds);
    try {
        // Find active chats older than 48h
        const staleChatsSnap = await init_1.db
            .collection("chats")
            .where("status", "==", config_1.ChatStatus.ACTIVE)
            .where("lastActivityAt", "<", expiryThreshold)
            .limit(100) // Process in batches
            .get();
        console.log(`Found ${staleChatsSnap.size} stale chats`);
        const batch = init_1.db.batch();
        let refundCount = 0;
        for (const chatDoc of staleChatsSnap.docs) {
            const chat = chatDoc.data();
            const refundAmount = chat.billing?.currentBalance || 0;
            if (refundAmount > 0 && chat.roles?.payer) {
                // Refund escrow to payer
                const walletRef = init_1.db
                    .collection("users")
                    .doc(chat.roles.payer)
                    .collection("wallet")
                    .doc("current");
                batch.update(walletRef, {
                    balance: (0, init_1.increment)(refundAmount),
                    pending: (0, init_1.increment)(-refundAmount),
                });
                // Record refund transaction
                const txId = (0, init_1.generateId)();
                batch.set(init_1.db.collection("transactions").doc(txId), {
                    txId,
                    uid: chat.roles.payer,
                    type: config_1.TransactionType.REFUND,
                    amountTokens: refundAmount,
                    status: "completed",
                    metadata: {
                        chatId: chat.chatId,
                        reason: "auto_expiry_48h",
                    },
                    createdAt: (0, init_1.serverTimestamp)(),
                    completedAt: (0, init_1.serverTimestamp)(),
                });
                refundCount++;
            }
            // Mark chat as expired
            batch.update(chatDoc.ref, {
                status: config_1.ChatStatus.EXPIRED,
                "billing.currentBalance": 0,
                updatedAt: (0, init_1.serverTimestamp)(),
            });
        }
        await batch.commit();
        console.log(`Expired ${staleChatsSnap.size} chats, refunded ${refundCount} escrows`);
    }
    catch (error) {
        console.error("Error expiring chats:", error);
    }
    return null;
});
/**
 * Calendar sweep - complete bookings, handle no-shows
 * Runs every 30 minutes
 * CRON pattern: every 30 minutes (use pattern: star-slash-30 space star space star space star space star)
 */
exports.calendarSweep = (0, scheduler_1.onSchedule)({
    schedule: "*/30 * * * *",
    timeZone: "Europe/Warsaw",
    region: "europe-west3",
}, async (event) => {
    console.log("Starting calendar sweep...");
    const now = firestore_1.Timestamp.now();
    try {
        // Find bookings that should be completed but weren't verified
        const overdueBookingsSnap = await init_1.db
            .collection("calendarBookings")
            .where("status", "==", config_1.BookingStatus.CONFIRMED)
            .where("slot.end", "<", now)
            .limit(50)
            .get();
        console.log(`Found ${overdueBookingsSnap.size} overdue bookings`);
        const batch = init_1.db.batch();
        let noShowCount = 0;
        for (const bookingDoc of overdueBookingsSnap.docs) {
            const booking = bookingDoc.data();
            // Check if verification window has passed (e.g., 2 hours after end time)
            const slotEnd = booking.slot.end;
            const verificationDeadline = new firestore_1.Timestamp(slotEnd.seconds + 2 * 60 * 60, slotEnd.nanoseconds);
            if (now.toMillis() > verificationDeadline.toMillis()) {
                // No verification within window - mark as no-show
                // Refund policy: booker gets 0%, creator gets 80% (already in escrow)
                // Release escrow to creator
                const creatorWalletRef = init_1.db
                    .collection("users")
                    .doc(booking.creatorId)
                    .collection("wallet")
                    .doc("current");
                batch.update(creatorWalletRef, {
                    balance: (0, init_1.increment)(booking.payment.escrowTokens),
                    earned: (0, init_1.increment)(booking.payment.escrowTokens),
                });
                // Decrease booker pending
                const bookerWalletRef = init_1.db
                    .collection("users")
                    .doc(booking.bookerId)
                    .collection("wallet")
                    .doc("current");
                batch.update(bookerWalletRef, {
                    pending: (0, init_1.increment)(-booking.payment.escrowTokens),
                });
                // Record transaction
                const txId = (0, init_1.generateId)();
                batch.set(init_1.db.collection("transactions").doc(txId), {
                    txId,
                    uid: booking.creatorId,
                    type: config_1.TransactionType.CALENDAR,
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
                    createdAt: (0, init_1.serverTimestamp)(),
                    completedAt: (0, init_1.serverTimestamp)(),
                });
                // Update booking
                batch.update(bookingDoc.ref, {
                    status: config_1.BookingStatus.NO_SHOW,
                    updatedAt: (0, init_1.serverTimestamp)(),
                });
                noShowCount++;
            }
        }
        await batch.commit();
        console.log(`Processed ${overdueBookingsSnap.size} overdue bookings, ${noShowCount} no-shows`);
    }
    catch (error) {
        console.error("Error in calendar sweep:", error);
    }
    return null;
});
/**
 * Update Royal Club eligibility
 * Runs daily at 3 AM
 * CRON: 0 3 * * *
 */
exports.updateRoyalEligibility = (0, scheduler_1.onSchedule)({
    schedule: "0 3 * * *",
    timeZone: "Europe/Warsaw",
    region: "europe-west3",
}, async (event) => {
    console.log("Starting Royal Club eligibility update...");
    try {
        // Get all users
        const usersSnap = await init_1.db.collection("users").limit(1000).get();
        console.log(`Checking ${usersSnap.size} users for Royal eligibility`);
        const batch = init_1.db.batch();
        let grantedCount = 0;
        let revokedCount = 0;
        for (const userDoc of usersSnap.docs) {
            const user = userDoc.data();
            let shouldBeRoyal = false;
            // Check Instagram followers
            if (user.instagram?.linked &&
                (user.instagram.followers || 0) >= config_1.ROYAL_INSTAGRAM_FOLLOWERS_MIN) {
                shouldBeRoyal = true;
            }
            // Check monthly earnings (would need to query transactions from last 30 days)
            // Simplified: check total earned (in production, calculate last 30 days)
            const walletSnap = await init_1.db
                .collection("users")
                .doc(user.uid)
                .collection("wallet")
                .doc("current")
                .get();
            const wallet = walletSnap.data();
            if (wallet && wallet.earned >= config_1.ROYAL_MONTHLY_EARNINGS_MIN_TOKENS) {
                shouldBeRoyal = true;
            }
            // Check quality score
            if (shouldBeRoyal && user.qualityScore < config_1.ROYAL_QUALITY_SCORE_MIN) {
                shouldBeRoyal = false; // Revoke if quality too low
            }
            // Update if status changed
            const currentlyRoyal = user.roles?.royal || false;
            if (shouldBeRoyal && !currentlyRoyal) {
                batch.update(userDoc.ref, {
                    "roles.royal": true,
                    updatedAt: (0, init_1.serverTimestamp)(),
                });
                grantedCount++;
            }
            else if (!shouldBeRoyal && currentlyRoyal) {
                // Only revoke if not subscription-based
                // (would need to check Stripe subscription)
                batch.update(userDoc.ref, {
                    "roles.royal": false,
                    updatedAt: (0, init_1.serverTimestamp)(),
                });
                revokedCount++;
            }
        }
        await batch.commit();
        console.log(`Royal eligibility updated: ${grantedCount} granted, ${revokedCount} revoked`);
    }
    catch (error) {
        console.error("Error updating Royal eligibility:", error);
    }
    return null;
});
//# sourceMappingURL=scheduled.js.map