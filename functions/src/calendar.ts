/**
 * Calendar Booking System
 * Handles booking creation, confirmation, verification, cancellation, and refunds
 * PACK 69: Enhanced with error logging
 * PACK 209: Enhanced with unified refund & complaint system
 */

import { onCall } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db, generateId, serverTimestamp, increment } from './init.js';
import { CALENDAR_MIN_BOOKING_TOKENS, CALENDAR_PLATFORM_FEE_PCT, CALENDAR_CANCEL_EARLY_HOURS, CALENDAR_CANCEL_EARLY_REFUND_PCT, CALENDAR_CANCEL_EARLY_CREATOR_PCT, BookingStatus, TransactionType } from './config.js';
import { CalendarBooking, UserWallet, Transaction, FunctionResponse } from './types.js';
import { withErrorLogging, logReservationError } from './observability.js';
import { calculateMeetingRefund } from './pack209-refund-complaint-engine.js';
import { RefundTransaction, RefundTrigger } from './pack209-refund-complaint-types.js';

/**
 * Book a calendar slot
 * POST /v1/calendar/book
 */
export const bookSlotCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<
      FunctionResponse<{
        bookingId: string;
        priceTokens: number;
        platformFeeTokens: number;
        escrowTokens: number;
      }>
    > => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated"
        );
      }

      const bookerUid = request.auth.uid;
      const {
        creatorUid,
        start,
        end,
        priceTokens,
        meetingType,
        location,
        acknowledgments,
      } = request.data;

      return withErrorLogging("functions.calendar", "RESERVATIONS", async () => {
        // CHECK: Only VIP or Royal members can book calendar slots
        const bookerProfileSnap = await db.collection("users").doc(bookerUid).get();
        if (!bookerProfileSnap.exists) {
          throw new HttpsError(
            "not-found",
            "User profile not found"
          );
        }
        
        const bookerProfile = bookerProfileSnap.data() as any;
        const hasVIP = bookerProfile.roles?.vip || bookerProfile.vipSubscription?.status === 'active';
        const hasRoyal = bookerProfile.roles?.royal || bookerProfile.royalClubTier !== undefined;
        
        if (!hasVIP && !hasRoyal) {
          throw new HttpsError(
            "permission-denied",
            "Calendar bookings require an active VIP or Royal subscription. Please upgrade to continue."
          );
        }
        
        // Verify all acknowledgments are true
        if (
          !acknowledgments.socialOnly ||
          !acknowledgments.noEscort ||
          !acknowledgments.noSexWork ||
          !acknowledgments.paymentForTime ||
          !acknowledgments.banAware
        ) {
          throw new HttpsError(
            "failed-precondition",
            "All legal acknowledgments must be accepted"
          );
        }

        // Verify minimum price
        if (priceTokens < CALENDAR_MIN_BOOKING_TOKENS) {
          throw new HttpsError(
            "invalid-argument",
            `Minimum booking price is ${CALENDAR_MIN_BOOKING_TOKENS} tokens`
          );
        }

        // Check wallet balance
        const walletSnap = await db
          .collection("users")
          .doc(bookerUid)
          .collection("wallet")
          .doc("current")
          .get();
        const wallet = walletSnap.data() as UserWallet;

        if (!wallet || wallet.balance < priceTokens) {
          throw new HttpsError(
            "failed-precondition",
            "Insufficient tokens"
          );
        }

        // Calculate fees
        const platformFeeTokens = Math.ceil(
          priceTokens * (CALENDAR_PLATFORM_FEE_PCT / 100)
        );
        const escrowTokens = priceTokens - platformFeeTokens;

        const bookingId = generateId();
        const startTime = Timestamp.fromDate(new Date(start));
        const endTime = Timestamp.fromDate(new Date(end));
        const durationMinutes = Math.floor(
          (endTime.toMillis() - startTime.toMillis()) / (1000 * 60)
        );

        // Create booking in transaction
        await db.runTransaction(async (transaction) => {
          // Deduct from booker
          transaction.update(
            db.collection("users").doc(bookerUid).collection("wallet").doc("current"),
            {
              balance: increment(-priceTokens),
              pending: increment(escrowTokens),
            }
          );

          // Create booking
          const bookingData: CalendarBooking = {
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
            status: BookingStatus.PENDING,
            createdAt: serverTimestamp() as any,
            updatedAt: serverTimestamp() as any,
          };

          transaction.set(
            db.collection("calendarBookings").doc(bookingId),
            bookingData
          );

          // Record platform fee transaction (instant, non-refundable)
          const txId = generateId();
          transaction.set(db.collection("transactions").doc(txId), {
            txId,
            uid: bookerUid,
            type: TransactionType.CALENDAR,
            amountTokens: platformFeeTokens,
            split: {
              platformTokens: platformFeeTokens,
              creatorTokens: 0,
            },
            status: "completed",
            metadata: { bookingId },
            createdAt: serverTimestamp(),
            completedAt: serverTimestamp(),
          } as Transaction);
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
      });
    }
  );

/**
 * Confirm booking (creator acceptance)
 * POST /v1/calendar/confirm
 */
export const confirmBookingCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<FunctionResponse<{ bookingId: string }>> => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated"
        );
      }

      const creatorUid = request.auth.uid;
      const { bookingId } = request.data;

      return withErrorLogging("functions.calendar", "RESERVATIONS", async () => {
        const bookingRef = db.collection("calendarBookings").doc(bookingId);
        const bookingSnap = await bookingRef.get();

        if (!bookingSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Booking not found"
          );
        }

        const booking = bookingSnap.data() as CalendarBooking;

        if (booking.creatorId !== creatorUid) {
          throw new HttpsError(
            "permission-denied",
            "Not the creator"
          );
        }

        await bookingRef.update({
          status: BookingStatus.CONFIRMED,
          updatedAt: serverTimestamp(),
        });

        return {
          ok: true,
          data: { bookingId },
        };
      });
    }
  );

/**
 * Cancel booking with PACK 209 unified refund policy
 * POST /v1/calendar/cancel
 *
 * Rules (65% earner / 35% Avalo - commission NEVER refunded):
 * - Earner cancels: 100% of earner share refunded
 * - Payer cancels ≥72h before: 100% of earner share refunded
 * - Payer cancels 24-72h before: 50% of earner share refunded, 50% kept by earner
 * - Payer cancels <24h before: 0% refunded, earner keeps 100%
 */
export const cancelBookingCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<FunctionResponse<{ refundTokens: number; policy: string }>> => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated"
        );
      }

      const userUid = request.auth.uid;
      const { bookingId, by } = request.data;

      return withErrorLogging("functions.calendar", "RESERVATIONS", async () => {
        const bookingRef = db.collection("calendarBookings").doc(bookingId);
        const bookingSnap = await bookingRef.get();

        if (!bookingSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Booking not found"
          );
        }

        const booking = bookingSnap.data() as CalendarBooking;

        // Verify canceler
        if (
          (by === "creator" && booking.creatorId !== userUid) ||
          (by === "booker" && booking.bookerId !== userUid)
        ) {
          throw new HttpsError(
            "permission-denied",
            "Not authorized to cancel"
          );
        }

        // PACK 209: Use unified refund calculation
        const refundCalc = await calculateMeetingRefund({
          bookingId,
          meetingStartTime: (booking.slot.start as any).toDate(),
          priceTokens: booking.priceTokens,
          earnerShareTokens: booking.payment.escrowTokens,
          avaloCommission: booking.payment.platformFeeTokens,
          cancelledBy: by === "creator" ? "earner" : "payer",
        });

        const refundToBooker = refundCalc.refundToPayerAmount;
        const releaseToCreator = refundCalc.earnerKeeptAmount;

        // Process refund
        await db.runTransaction(async (transaction) => {
          if (refundToBooker > 0) {
            transaction.update(
              db
                .collection("users")
                .doc(booking.bookerId)
                .collection("wallet")
                .doc("current"),
              {
                balance: increment(refundToBooker),
                pending: increment(-refundToBooker),
              }
            );

            // Record refund
            const txId = generateId();
            transaction.set(db.collection("transactions").doc(txId), {
              txId,
              uid: booking.bookerId,
              type: TransactionType.REFUND,
              amountTokens: refundToBooker,
              status: "completed",
              metadata: {
                bookingId,
                cancelledBy: by,
                pack209: true,
                policy: refundCalc.reason,
              },
              createdAt: serverTimestamp(),
              completedAt: serverTimestamp(),
            } as Transaction);
          }

          if (releaseToCreator > 0) {
            transaction.update(
              db
                .collection("users")
                .doc(booking.creatorId)
                .collection("wallet")
                .doc("current"),
              {
                balance: increment(releaseToCreator),
                earned: increment(releaseToCreator),
              }
            );

            // Decrease booker pending
            transaction.update(
              db
                .collection("users")
                .doc(booking.bookerId)
                .collection("wallet")
                .doc("current"),
              {
                pending: increment(-releaseToCreator),
              }
            );
          }

          // PACK 209: Create detailed refund transaction log
          const refundTxId = generateId();
          const meetingPolicy = refundCalc.policy as any;
          const hoursBeforeMeeting = meetingPolicy.hoursBeforeMeeting || 0;
          
          const refundTransaction: RefundTransaction = {
            transactionId: refundTxId,
            refundType: by === "creator" ? RefundTrigger.CANCELLATION_EARLY :
                       hoursBeforeMeeting >= 72 ? RefundTrigger.CANCELLATION_EARLY :
                       hoursBeforeMeeting >= 24 ? RefundTrigger.CANCELLATION_MID :
                       RefundTrigger.CANCELLATION_LATE,
            bookingId,
            payerId: booking.bookerId,
            earnerId: booking.creatorId,
            originalAmount: booking.priceTokens,
            earnerShare: booking.payment.escrowTokens,
            avaloCommission: booking.payment.platformFeeTokens,
            refundToPayerAmount: refundToBooker,
            earnerKeptAmount: releaseToCreator,
            avaloKeptAmount: booking.payment.platformFeeTokens,
            triggeredBy: userUid,
            automaticRefund: false,
            hoursBeforeMeeting,
            notes: refundCalc.reason,
            createdAt: serverTimestamp() as Timestamp,
            processedAt: serverTimestamp() as Timestamp,
            metadata: {
              source: 'meeting',
              cancellationReason: by === "creator" ? "Creator cancelled" : "Payer cancelled",
            },
          };
          transaction.set(db.collection('refund_transactions').doc(refundTxId), refundTransaction);

          // Update booking status
          transaction.update(bookingRef, {
            status: BookingStatus.CANCELLED,
            cancelledBy: by,
            cancelledAt: serverTimestamp(),
            refundAmount: refundToBooker,
            updatedAt: serverTimestamp(),
          });
        });

        return {
          ok: true,
          data: {
            refundTokens: refundToBooker,
            policy: refundCalc.reason,
          },
        };
      });
    }
  );

/**
 * Verify meeting completion (GPS, QR, or Selfie)
 * POST /v1/calendar/verify
 */
export const verifyMeetingCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<FunctionResponse<{ verified: boolean }>> => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Must be authenticated"
        );
      }

      const userUid = request.auth.uid;
      const { bookingId, method } = request.data;

      return withErrorLogging("functions.calendar", "RESERVATIONS", async () => {
        const bookingRef = db.collection("calendarBookings").doc(bookingId);
        const bookingSnap = await bookingRef.get();

        if (!bookingSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Booking not found"
          );
        }

        const booking = bookingSnap.data() as CalendarBooking;

        if (
          booking.creatorId !== userUid &&
          booking.bookerId !== userUid
        ) {
          throw new HttpsError(
            "permission-denied",
            "Not a participant"
          );
        }

        // Mark verification method as completed
        const verificationUpdate: any = {
          [`verification.${method}`]: true,
          updatedAt: serverTimestamp(),
        };

        // If any method is verified, release escrow to creator
        if (!booking.verification || Object.keys(booking.verification).length === 0) {
          verificationUpdate["verification.completedAt"] = serverTimestamp();
          verificationUpdate.status = BookingStatus.COMPLETED;

          // Release escrow to creator
          await db.runTransaction(async (transaction) => {
            transaction.update(
              db
                .collection("users")
                .doc(booking.creatorId)
                .collection("wallet")
                .doc("current"),
              {
                balance: increment(booking.payment.escrowTokens),
                earned: increment(booking.payment.escrowTokens),
              }
            );

            // Decrease booker pending
            transaction.update(
              db
                .collection("users")
                .doc(booking.bookerId)
                .collection("wallet")
                .doc("current"),
              {
                pending: increment(-booking.payment.escrowTokens),
              }
            );

            // Record creator payment
            const txId = generateId();
            transaction.set(db.collection("transactions").doc(txId), {
              txId,
              uid: booking.creatorId,
              type: TransactionType.CALENDAR,
              amountTokens: booking.payment.escrowTokens,
              split: {
                platformTokens: 0,
                creatorTokens: booking.payment.escrowTokens,
              },
              status: "completed",
              metadata: { bookingId, verifiedBy: method },
              createdAt: serverTimestamp(),
              completedAt: serverTimestamp(),
            } as Transaction);

            transaction.update(bookingRef, verificationUpdate);
          });
        } else {
          await bookingRef.update(verificationUpdate);
        }

        return {
          ok: true,
          data: { verified: true },
        };
      });
    }
  );

/**
 * PACK 209: File appearance/identity complaint during meeting
 * POST /v1/calendar/complaint
 */
export const fileAppearanceComplaintCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<FunctionResponse<{ complaintId: string; refundAmount: number; decision: string }>> => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Must be authenticated");
      }

      const complainantId = request.auth.uid;
      const {
        bookingId,
        reportedUserId,
        liveSelfieUrl,
        decision,
        notes,
        mismatchScore,
        location,
        deviceId,
        ipHash,
      } = request.data;

      return withErrorLogging("functions.calendar", "COMPLAINTS", async () => {
        const { processAppearanceComplaint } = await import('./pack209-refund-complaint-engine.js');
        const { ComplaintDecision } = await import('./pack209-refund-complaint-types.js');

        // Validate decision
        if (decision !== 'KEEP_COMPLETED' && decision !== 'ISSUE_REFUND') {
          throw new HttpsError("invalid-argument", "Invalid decision. Must be KEEP_COMPLETED or ISSUE_REFUND");
        }

        const result = await processAppearanceComplaint({
          bookingId,
          complainantId,
          reportedUserId,
          liveSelfieUrl,
          decision: decision === 'ISSUE_REFUND' ? ComplaintDecision.ISSUE_REFUND : ComplaintDecision.KEEP_COMPLETED,
          notes,
          mismatchScore,
          location,
          deviceId,
          ipHash,
        });

        return {
          ok: true,
          data: {
            complaintId: result.complaintId,
            refundAmount: result.refundAmount,
            decision,
          },
        };
      });
    }
  );

/**
 * PACK 209: Issue voluntary refund from earner to payer
 * POST /v1/calendar/voluntary-refund
 */
export const issueVoluntaryRefundCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<FunctionResponse<{ refundId: string; refundAmount: number }>> => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Must be authenticated");
      }

      const earnerId = request.auth.uid;
      const { bookingId, refundPercent, reason } = request.data;

      return withErrorLogging("functions.calendar", "VOLUNTARY_REFUNDS", async () => {
        // Validate refund percent
        if (refundPercent < 0 || refundPercent > 100) {
          throw new HttpsError("invalid-argument", "Refund percent must be between 0 and 100");
        }

        const { processVoluntaryMeetingRefund } = await import('./pack209-refund-complaint-engine.js');

        const result = await processVoluntaryMeetingRefund({
          bookingId,
          earnerId,
          refundPercent,
          reason,
        });

        return {
          ok: true,
          data: {
            refundId: result.refundId,
            refundAmount: result.refundAmount,
          },
        };
      });
    }
  );

/**
 * PACK 209: Get refund history for user
 * POST /v1/calendar/refund-history
 */
export const getRefundHistoryCallable = onCall(
    { region: "europe-west3" },
    async (
      request
    ): Promise<FunctionResponse<{ refunds: any[]; voluntaryRefunds: any[]; complaints: any[] }>> => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Must be authenticated");
      }

      const userId = request.auth.uid;
      const { limit } = request.data;

      return withErrorLogging("functions.calendar", "REFUND_HISTORY", async () => {
        const { getUserRefundHistory } = await import('./pack209-refund-complaint-engine.js');

        const history = await getUserRefundHistory({
          userId,
          limit: limit || 20,
        });

        return {
          ok: true,
          data: {
            refunds: history.refunds,
            voluntaryRefunds: history.voluntaryRefunds,
            complaints: history.complaints,
          },
        };
      });
    }
  );


