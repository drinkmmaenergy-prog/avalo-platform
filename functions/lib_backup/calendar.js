"use strict";
/**
 * Calendar Booking System
 * Handles booking creation, confirmation, verification, cancellation, and refunds
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyMeetingCallable = exports.cancelBookingCallable = exports.confirmBookingCallable = exports.bookSlotCallable = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const init_1 = require("./init");
const config_1 = require("./config");
/**
 * Book a calendar slot
 * POST /v1/calendar/book
 */
exports.bookSlotCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const bookerUid = request.auth.uid;
    const { creatorUid, start, end, priceTokens, meetingType, location, acknowledgments, } = request.data;
    try {
        // Verify all acknowledgments are true
        if (!acknowledgments.socialOnly ||
            !acknowledgments.noEscort ||
            !acknowledgments.noSexWork ||
            !acknowledgments.paymentForTime ||
            !acknowledgments.banAware) {
            throw new https_1.HttpsError("failed-precondition", "All legal acknowledgments must be accepted");
        }
        // Verify minimum price
        if (priceTokens < config_1.CALENDAR_MIN_BOOKING_TOKENS) {
            throw new https_1.HttpsError("invalid-argument", `Minimum booking price is ${config_1.CALENDAR_MIN_BOOKING_TOKENS} tokens`);
        }
        // Check wallet balance
        const walletSnap = await init_1.db
            .collection("users")
            .doc(bookerUid)
            .collection("wallet")
            .doc("current")
            .get();
        const wallet = walletSnap.data();
        if (!wallet || wallet.balance < priceTokens) {
            throw new https_1.HttpsError("failed-precondition", "Insufficient tokens");
        }
        // Calculate fees
        const platformFeeTokens = Math.ceil(priceTokens * (config_1.CALENDAR_PLATFORM_FEE_PCT / 100));
        const escrowTokens = priceTokens - platformFeeTokens;
        const bookingId = (0, init_1.generateId)();
        const startTime = firestore_1.Timestamp.fromDate(new Date(start));
        const endTime = firestore_1.Timestamp.fromDate(new Date(end));
        const durationMinutes = Math.floor((endTime.toMillis() - startTime.toMillis()) / (1000 * 60));
        // Create booking in transaction
        await init_1.db.runTransaction(async (transaction) => {
            // Deduct from booker
            transaction.update(init_1.db.collection("users").doc(bookerUid).collection("wallet").doc("current"), {
                balance: (0, init_1.increment)(-priceTokens),
                pending: (0, init_1.increment)(escrowTokens),
            });
            // Create booking
            const bookingData = {
                bookingId,
                creatorId: creatorUid,
                bookerId: bookerUid,
                slot: {
                    start: startTime,
                    end: endTime,
                    duration: durationMinutes,
                },
                priceTokens,
                payment: {
                    platformFeeTokens,
                    escrowTokens,
                },
                meetingType,
                location,
                acknowledgments,
                status: config_1.BookingStatus.PENDING,
                createdAt: (0, init_1.serverTimestamp)(),
                updatedAt: (0, init_1.serverTimestamp)(),
            };
            transaction.set(init_1.db.collection("calendarBookings").doc(bookingId), bookingData);
            // Record platform fee transaction (instant, non-refundable)
            const txId = (0, init_1.generateId)();
            transaction.set(init_1.db.collection("transactions").doc(txId), {
                txId,
                uid: bookerUid,
                type: config_1.TransactionType.CALENDAR,
                amountTokens: platformFeeTokens,
                split: {
                    platformTokens: platformFeeTokens,
                    creatorTokens: 0,
                },
                status: "completed",
                metadata: { bookingId },
                createdAt: (0, init_1.serverTimestamp)(),
                completedAt: (0, init_1.serverTimestamp)(),
            });
        });
        return {
            ok: true,
            data: {
                bookingId,
                priceTokens,
                platformFeeTokens,
                escrowTokens,
            },
        };
    }
    catch (error) {
        console.error("Error booking slot:", error);
        return {
            ok: false,
            error: error.message || "Failed to book slot",
        };
    }
});
/**
 * Confirm booking (creator acceptance)
 * POST /v1/calendar/confirm
 */
exports.confirmBookingCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const creatorUid = request.auth.uid;
    const { bookingId } = request.data;
    try {
        const bookingRef = init_1.db.collection("calendarBookings").doc(bookingId);
        const bookingSnap = await bookingRef.get();
        if (!bookingSnap.exists) {
            throw new https_1.HttpsError("not-found", "Booking not found");
        }
        const booking = bookingSnap.data();
        if (booking.creatorId !== creatorUid) {
            throw new https_1.HttpsError("permission-denied", "Not the creator");
        }
        await bookingRef.update({
            status: config_1.BookingStatus.CONFIRMED,
            updatedAt: (0, init_1.serverTimestamp)(),
        });
        return {
            ok: true,
            data: { bookingId },
        };
    }
    catch (error) {
        console.error("Error confirming booking:", error);
        return {
            ok: false,
            error: error.message || "Failed to confirm booking",
        };
    }
});
/**
 * Cancel booking with refund policy
 * POST /v1/calendar/cancel
 */
exports.cancelBookingCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const userUid = request.auth.uid;
    const { bookingId, by } = request.data;
    try {
        const bookingRef = init_1.db.collection("calendarBookings").doc(bookingId);
        const bookingSnap = await bookingRef.get();
        if (!bookingSnap.exists) {
            throw new https_1.HttpsError("not-found", "Booking not found");
        }
        const booking = bookingSnap.data();
        // Verify canceler
        if ((by === "creator" && booking.creatorId !== userUid) ||
            (by === "booker" && booking.bookerId !== userUid)) {
            throw new https_1.HttpsError("permission-denied", "Not authorized to cancel");
        }
        const now = firestore_1.Timestamp.now();
        const hoursUntilStart = (booking.slot.start.toMillis() - now.toMillis()) / (1000 * 60 * 60);
        let refundToBooker = 0;
        let releaseToCreator = 0;
        if (by === "creator") {
            // Creator cancels: Full escrow refund to booker
            refundToBooker = booking.payment.escrowTokens;
            releaseToCreator = 0;
        }
        else if (by === "booker") {
            if (hoursUntilStart >= config_1.CALENDAR_CANCEL_EARLY_HOURS) {
                // Early cancel: 50% to booker, 30% to creator, 20% already kept by platform
                refundToBooker = Math.floor(booking.payment.escrowTokens *
                    (config_1.CALENDAR_CANCEL_EARLY_REFUND_PCT / 100));
                releaseToCreator = Math.floor(booking.payment.escrowTokens *
                    (config_1.CALENDAR_CANCEL_EARLY_CREATOR_PCT / 100));
            }
            else {
                // Late cancel: 0% to booker, 80% to creator
                refundToBooker = 0;
                releaseToCreator = booking.payment.escrowTokens;
            }
        }
        // Process refund
        await init_1.db.runTransaction(async (transaction) => {
            if (refundToBooker > 0) {
                transaction.update(init_1.db
                    .collection("users")
                    .doc(booking.bookerId)
                    .collection("wallet")
                    .doc("current"), {
                    balance: (0, init_1.increment)(refundToBooker),
                    pending: (0, init_1.increment)(-refundToBooker),
                });
                // Record refund
                const txId = (0, init_1.generateId)();
                transaction.set(init_1.db.collection("transactions").doc(txId), {
                    txId,
                    uid: booking.bookerId,
                    type: config_1.TransactionType.REFUND,
                    amountTokens: refundToBooker,
                    status: "completed",
                    metadata: { bookingId, cancelledBy: by },
                    createdAt: (0, init_1.serverTimestamp)(),
                    completedAt: (0, init_1.serverTimestamp)(),
                });
            }
            if (releaseToCreator > 0) {
                transaction.update(init_1.db
                    .collection("users")
                    .doc(booking.creatorId)
                    .collection("wallet")
                    .doc("current"), {
                    balance: (0, init_1.increment)(releaseToCreator),
                    earned: (0, init_1.increment)(releaseToCreator),
                });
                // Decrease booker pending
                transaction.update(init_1.db
                    .collection("users")
                    .doc(booking.bookerId)
                    .collection("wallet")
                    .doc("current"), {
                    pending: (0, init_1.increment)(-releaseToCreator),
                });
            }
            // Update booking status
            transaction.update(bookingRef, {
                status: config_1.BookingStatus.CANCELLED,
                updatedAt: (0, init_1.serverTimestamp)(),
            });
        });
        return {
            ok: true,
            data: { refundTokens: refundToBooker },
        };
    }
    catch (error) {
        console.error("Error cancelling booking:", error);
        return {
            ok: false,
            error: error.message || "Failed to cancel booking",
        };
    }
});
/**
 * Verify meeting completion (GPS, QR, or Selfie)
 * POST /v1/calendar/verify
 */
exports.verifyMeetingCallable = (0, https_1.onCall)({ region: "europe-west3" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be authenticated");
    }
    const userUid = request.auth.uid;
    const { bookingId, method } = request.data;
    try {
        const bookingRef = init_1.db.collection("calendarBookings").doc(bookingId);
        const bookingSnap = await bookingRef.get();
        if (!bookingSnap.exists) {
            throw new https_1.HttpsError("not-found", "Booking not found");
        }
        const booking = bookingSnap.data();
        if (booking.creatorId !== userUid &&
            booking.bookerId !== userUid) {
            throw new https_1.HttpsError("permission-denied", "Not a participant");
        }
        // Mark verification method as completed
        const verificationUpdate = {
            [`verification.${method}`]: true,
            updatedAt: (0, init_1.serverTimestamp)(),
        };
        // If any method is verified, release escrow to creator
        if (!booking.verification || Object.keys(booking.verification).length === 0) {
            verificationUpdate["verification.completedAt"] = (0, init_1.serverTimestamp)();
            verificationUpdate.status = config_1.BookingStatus.COMPLETED;
            // Release escrow to creator
            await init_1.db.runTransaction(async (transaction) => {
                transaction.update(init_1.db
                    .collection("users")
                    .doc(booking.creatorId)
                    .collection("wallet")
                    .doc("current"), {
                    balance: (0, init_1.increment)(booking.payment.escrowTokens),
                    earned: (0, init_1.increment)(booking.payment.escrowTokens),
                });
                // Decrease booker pending
                transaction.update(init_1.db
                    .collection("users")
                    .doc(booking.bookerId)
                    .collection("wallet")
                    .doc("current"), {
                    pending: (0, init_1.increment)(-booking.payment.escrowTokens),
                });
                // Record creator payment
                const txId = (0, init_1.generateId)();
                transaction.set(init_1.db.collection("transactions").doc(txId), {
                    txId,
                    uid: booking.creatorId,
                    type: config_1.TransactionType.CALENDAR,
                    amountTokens: booking.payment.escrowTokens,
                    split: {
                        platformTokens: 0,
                        creatorTokens: booking.payment.escrowTokens,
                    },
                    status: "completed",
                    metadata: { bookingId, verifiedBy: method },
                    createdAt: (0, init_1.serverTimestamp)(),
                    completedAt: (0, init_1.serverTimestamp)(),
                });
                transaction.update(bookingRef, verificationUpdate);
            });
        }
        else {
            await bookingRef.update(verificationUpdate);
        }
        return {
            ok: true,
            data: { verified: true },
        };
    }
    catch (error) {
        console.error("Error verifying meeting:", error);
        return {
            ok: false,
            error: error.message || "Failed to verify meeting",
        };
    }
});
//# sourceMappingURL=calendar.js.map