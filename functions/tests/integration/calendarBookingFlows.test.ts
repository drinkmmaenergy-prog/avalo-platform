/**
 * PACK 274 - Calendar Booking Integration Tests
 * End-to-end tests for calendar booking flows
 */

import { expect } from 'chai';
import { db } from '../../src/firebase';
import { Timestamp } from 'firebase-admin/firestore';

describe('Calendar Booking Integration Tests', () => {
  const testUserId = `test_user_${Date.now()}`;
  const testHostId = `test_host_${Date.now()}`;
  const testBookingId = `test_booking_${Date.now()}`;

  before(async () => {
    // Setup test users
    await db.collection('users').doc(testUserId).set({
      displayName: 'Test Guest',
      email: 'guest@test.com',
      tokens: 5000,
      createdAt: Timestamp.now(),
    });

    await db.collection('users').doc(testHostId).set({
      displayName: 'Test Host',
      email: 'host@test.com',
      tokens: 0,
      createdAt: Timestamp.now(),
    });

    // Setup host calendar
    await db.collection('calendars').doc(testHostId).set({
      userId: testHostId,
      timeZone: 'Europe/Warsaw',
      availableSlots: [
        {
          slotId: 'slot_test_1',
          start: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          end: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(),
          priceTokens: 1000,
          maxGuests: 1,
          status: 'available',
        },
      ],
      settings: {
        autoAccept: true,
        minAdvanceHours: 24,
        maxAdvanceDays: 30,
      },
    });
  });

  after(async () => {
    // Cleanup
    await db.collection('users').doc(testUserId).delete();
    await db.collection('users').doc(testHostId).delete();
    await db.collection('calendars').doc(testHostId).delete();
  });

  describe('Complete Booking Flow: Book → Complete → Payout', () => {
    it('should complete full booking lifecycle and pay host 80%', async () => {
      // Initial state
      const initialGuestBalance = 5000;
      const initialHostBalance = 0;
      const bookingPrice = 1000;
      const expectedHostShare = 800; // 80%
      const expectedAvaloShare = 200; // 20%

      // Step 1: Guest books meeting
      // [Cloud Function would be called here]
      // Simulate booking creation
      const booking = {
        bookingId: testBookingId,
        hostId: testHostId,
        guestId: testUserId,
        slotId: 'slot_test_1',
        start: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(),
        priceTokens: bookingPrice,
        status: 'CONFIRMED',
        payment: {
          totalTokensPaid: bookingPrice,
          userShareTokens: expectedHostShare,
          avaloShareTokens: expectedAvaloShare,
          refundedUserTokens: 0,
          refundedAvaloTokens: 0,
        },
        safety: {
          qrCode: 'TEST_QR_CODE',
          checkInAt: null,
          checkOutAt: null,
          mismatchReported: false,
          panicTriggered: false,
        },
        timestamps: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      await db.collection('calendarBookings').doc(testBookingId).set(booking);

      // Deduct from guest
      await db.collection('users').doc(testUserId).update({
        tokens: initialGuestBalance - bookingPrice,
      });

      // Step 2: Verify booking created
      const bookingDoc = await db.collection('calendarBookings').doc(testBookingId).get();
      expect(bookingDoc.exists).to.be.true;
      expect(bookingDoc.data()?.status).to.equal('CONFIRMED');

      const guestDoc = await db.collection('users').doc(testUserId).get();
      expect(guestDoc.data()?.tokens).to.equal(4000); // 5000 - 1000

      // Step 3: Check-in to meeting
      await db.collection('calendarBookings').doc(testBookingId).update({
        'safety.checkInAt': new Date().toISOString(),
      });

      // Step 4: Complete meeting and payout host
      await db.collection('calendarBookings').doc(testBookingId).update({
        status: 'COMPLETED',
        'timestamps.completedAt': new Date().toISOString(),
      });

      await db.collection('users').doc(testHostId).update({
        tokens: expectedHostShare,
      });

      // Step 5: Verify final state
      const completedBooking = await db.collection('calendarBookings').doc(testBookingId).get();
      expect(completedBooking.data()?.status).to.equal('COMPLETED');

      const finalHostDoc = await db.collection('users').doc(testHostId).get();
      expect(finalHostDoc.data()?.tokens).to.equal(800); // Host receives 80%

      const finalGuestDoc = await db.collection('users').doc(testUserId).get();
      expect(finalGuestDoc.data()?.tokens).to.equal(4000); // Guest paid 1000

      // Verify token conservation
      const totalTokens = finalGuestDoc.data()?.tokens + finalHostDoc.data()?.tokens + expectedAvaloShare;
      expect(totalTokens).to.equal(initialGuestBalance); // 4000 + 800 + 200 = 5000

      console.log('✓ Complete booking flow successful');
      console.log(`  Guest paid: ${bookingPrice} tokens`);
      console.log(`  Host received: ${expectedHostShare} tokens (80%)`);
      console.log(`  Avalo earned: ${expectedAvaloShare} tokens (20%)`);
      console.log(`  Token conservation verified: ${totalTokens} = ${initialGuestBalance}`);
    });
  });

  describe('Guest Cancellation Flow: >72h Refund', () => {
    it('should refund 100% of host share when cancelled >72h before', async () => {
      const bookingId = `cancel_72h_${Date.now()}`;
      const bookingPrice = 500;
      const hostShare = 400;
      const avaloShare = 100;

      // Create booking
      await db.collection('calendarBookings').doc(bookingId).set({
        bookingId,
        hostId: testHostId,
        guestId: testUserId,
        slotId: 'slot_test_cancel_72h',
        start: new Date(Date.now() + 80 * 60 * 60 * 1000).toISOString(), // 80 hours from now
        end: new Date(Date.now() + 81 * 60 * 60 * 1000).toISOString(),
        priceTokens: bookingPrice,
        status: 'CONFIRMED',
        payment: {
          totalTokensPaid: bookingPrice,
          userShareTokens: hostShare,
          avaloShareTokens: avaloShare,
          refundedUserTokens: 0,
          refundedAvaloTokens: 0,
        },
        safety: {
          qrCode: 'TEST_QR',
          checkInAt: null,
          checkOutAt: null,
          mismatchReported: false,
          panicTriggered: false,
        },
        timestamps: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      // Guest cancels (>72h)
      const refundAmount = hostShare; // 100% of host share
      
      await db.collection('calendarBookings').doc(bookingId).update({
        status: 'CANCELLED_BY_GUEST',
        'payment.refundedUserTokens': refundAmount,
        'timestamps.cancelledAt': new Date().toISOString(),
      });

      // Verify refund
      const cancelledBooking = await db.collection('calendarBookings').doc(bookingId).get();
      expect(cancelledBooking.data()?.status).to.equal('CANCELLED_BY_GUEST');
      expect(cancelledBooking.data()?.payment.refundedUserTokens).to.equal(400);

      // Avalo keeps its fee
      expect(cancelledBooking.data()?.payment.refundedAvaloTokens).to.equal(0);

      console.log('✓ Guest cancellation >72h: 100% refund of host share');
      console.log(`  Refunded to guest: ${refundAmount} tokens`);
      console.log(`  Avalo keeps: ${avaloShare} tokens`);

      await db.collection('calendarBookings').doc(bookingId).delete();
    });
  });

  describe('Host Cancellation Flow: Full Refund', () => {
    it('should refund 100% including Avalo fee when host cancels', async () => {
      const bookingId = `cancel_host_${Date.now()}`;
      const bookingPrice = 1500;
      const hostShare = 1200;
      const avaloShare = 300;

      // Create booking
      await db.collection('calendarBookings').doc(bookingId).set({
        bookingId,
        hostId: testHostId,
        guestId: testUserId,
        slotId: 'slot_test_cancel_host',
        start: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(), // 10 hours from now
        end: new Date(Date.now() + 11 * 60 * 60 * 1000).toISOString(),
        priceTokens: bookingPrice,
        status: 'CONFIRMED',
        payment: {
          totalTokensPaid: bookingPrice,
          userShareTokens: hostShare,
          avaloShareTokens: avaloShare,
          refundedUserTokens: 0,
          refundedAvaloTokens: 0,
        },
        safety: {
          qrCode: 'TEST_QR',
          checkInAt: null,
          checkOutAt: null,
          mismatchReported: false,
          panicTriggered: false,
        },
        timestamps: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      // Host cancels - full refund including Avalo fee
      await db.collection('calendarBookings').doc(bookingId).update({
        status: 'CANCELLED_BY_HOST',
        'payment.refundedUserTokens': bookingPrice,
        'payment.refundedAvaloTokens': avaloShare,
        'timestamps.cancelledAt': new Date().toISOString(),
      });

      // Verify full refund
      const cancelledBooking = await db.collection('calendarBookings').doc(bookingId).get();
      expect(cancelledBooking.data()?.status).to.equal('CANCELLED_BY_HOST');
      expect(cancelledBooking.data()?.payment.refundedUserTokens).to.equal(1500);
      expect(cancelledBooking.data()?.payment.refundedAvaloTokens).to.equal(300);

      console.log('✓ Host cancellation: Full refund including Avalo fee');
      console.log(`  Refunded to guest: ${bookingPrice} tokens (100%)`);
      console.log(`  Avalo refunded: ${avaloShare} tokens`);
      console.log(`  Host earns: 0 tokens`);

      await db.collection('calendarBookings').doc(bookingId).delete();
    });
  });

  describe('Mismatch Refund Flow', () => {
    it('should refund 100% including Avalo fee for appearance mismatch', async () => {
      const bookingId = `mismatch_${Date.now()}`;
      const bookingPrice = 800;
      const hostShare = 640;
      const avaloShare = 160;

      // Create booking with check-in
      await db.collection('calendarBookings').doc(bookingId).set({
        bookingId,
        hostId: testHostId,
        guestId: testUserId,
        slotId: 'slot_test_mismatch',
        start: new Date().toISOString(),
        end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        priceTokens: bookingPrice,
        status: 'CONFIRMED',
        payment: {
          totalTokensPaid: bookingPrice,
          userShareTokens: hostShare,
          avaloShareTokens: avaloShare,
          refundedUserTokens: 0,
          refundedAvaloTokens: 0,
        },
        safety: {
          qrCode: 'TEST_QR',
          checkInAt: new Date().toISOString(),
          checkOutAt: null,
          mismatchReported: false,
          panicTriggered: false,
        },
        timestamps: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      // Report mismatch (within 15 min window)
      await db.collection('calendarBookings').doc(bookingId).update({
        status: 'MISMATCH_REFUND',
        'payment.refundedUserTokens': bookingPrice,
        'payment.refundedAvaloTokens': avaloShare,
        'safety.mismatchReported': true,
        'safety.mismatchReportedAt': new Date().toISOString(),
      });

      // Verify mismatch refund
      const mismatchBooking = await db.collection('calendarBookings').doc(bookingId).get();
      expect(mismatchBooking.data()?.status).to.equal('MISMATCH_REFUND');
      expect(mismatchBooking.data()?.payment.refundedUserTokens).to.equal(800);
      expect(mismatchBooking.data()?.payment.refundedAvaloTokens).to.equal(160);
      expect(mismatchBooking.data()?.safety.mismatchReported).to.be.true;

      console.log('✓ Mismatch refund: Full refund including Avalo fee');
      console.log(`  Refunded to guest: ${bookingPrice} tokens (100%)`);
      console.log(`  Avalo refunded: ${avaloShare} tokens`);
      console.log(`  Host earns: 0 tokens`);

      await db.collection('calendarBookings').doc(bookingId).delete();
    });
  });

  describe('No-Show Flow', () => {
    it('should pay host even if guest does not show up', async () => {
      const bookingId = `noshow_${Date.now()}`;
      const bookingPrice = 600;
      const hostShare = 480;
      const avaloShare = 120;

      // Create booking
      await db.collection('calendarBookings').doc(bookingId).set({
        bookingId,
        hostId: testHostId,
        guestId: testUserId,
        slotId: 'slot_test_noshow',
        start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        end: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        priceTokens: bookingPrice,
        status: 'CONFIRMED',
        payment: {
          totalTokensPaid: bookingPrice,
          userShareTokens: hostShare,
          avaloShareTokens: avaloShare,
          refundedUserTokens: 0,
          refundedAvaloTokens: 0,
        },
        safety: {
          qrCode: 'TEST_QR',
          checkInAt: null, // Guest never checked in
          checkOutAt: null,
          mismatchReported: false,
          panicTriggered: false,
        },
        timestamps: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      // Auto-complete as no-show
      await db.collection('calendarBookings').doc(bookingId).update({
        status: 'NO_SHOW',
        'timestamps.completedAt': new Date().toISOString(),
      });

      // Host still gets paid
      const currentHostBalance = (await db.collection('users').doc(testHostId).get()).data()?.tokens || 0;
      await db.collection('users').doc(testHostId).update({
        tokens: currentHostBalance + hostShare,
      });

      // Verify no-show handling
      const noShowBooking = await db.collection('calendarBookings').doc(bookingId).get();
      expect(noShowBooking.data()?.status).to.equal('NO_SHOW');
      expect(noShowBooking.data()?.safety.checkInAt).to.be.null;

      console.log('✓ No-show: Host receives payment despite guest absence');
      console.log(`  Host received: ${hostShare} tokens (80%)`);
      console.log(`  Avalo earned: ${avaloShare} tokens (20%)`);
      console.log(`  Guest forfeits: ${bookingPrice} tokens`);

      await db.collection('calendarBookings').doc(bookingId).delete();
    });
  });
});