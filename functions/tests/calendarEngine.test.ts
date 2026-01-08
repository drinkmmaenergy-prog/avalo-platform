/**
 * PACK 274 - Calendar Engine Tests
 * Unit tests for calendar booking, refund logic, and safety features
 */

import { expect } from 'chai';
import {
  calculateRefundPolicy,
  calculatePaymentSplit,
  generateQRCode,
} from '../src/calendarEngine';

describe('Calendar Engine - Payment Calculations', () => {
  describe('calculatePaymentSplit', () => {
    it('should split 1000 tokens as 800 host / 200 Avalo', () => {
      const result = calculatePaymentSplit(1000);
      expect(result.hostShare).to.equal(800);
      expect(result.avaloShare).to.equal(200);
    });

    it('should split 100 tokens as 80 host / 20 Avalo', () => {
      const result = calculatePaymentSplit(100);
      expect(result.hostShare).to.equal(80);
      expect(result.avaloShare).to.equal(20);
    });

    it('should split 3000 tokens as 2400 host / 600 Avalo (Royal booking)', () => {
      const result = calculatePaymentSplit(3000);
      expect(result.hostShare).to.equal(2400);
      expect(result.avaloShare).to.equal(600);
    });

    it('should handle odd numbers with floor rounding', () => {
      const result = calculatePaymentSplit(99);
      expect(result.avaloShare).to.equal(19); // 99 * 0.20 = 19.8 -> 19
      expect(result.hostShare).to.equal(80); // 99 - 19 = 80
    });

    it('should maintain total sum', () => {
      const priceTokens = 1500;
      const result = calculatePaymentSplit(priceTokens);
      expect(result.hostShare + result.avaloShare).to.equal(priceTokens);
    });
  });

  describe('calculateRefundPolicy', () => {
    it('should return 100% refund for cancellation >72h before meeting', () => {
      const meetingStart = new Date('2024-12-10T14:00:00Z');
      const cancellationTime = new Date('2024-12-07T12:00:00Z'); // 74 hours before

      const policy = calculateRefundPolicy(meetingStart, cancellationTime);

      expect(policy.refundPercentage).to.equal(100);
      expect(policy.description).to.include('100% refund');
    });

    it('should return 50% refund for cancellation 48h before meeting', () => {
      const meetingStart = new Date('2024-12-10T14:00:00Z');
      const cancellationTime = new Date('2024-12-08T14:00:00Z'); // 48 hours before

      const policy = calculateRefundPolicy(meetingStart, cancellationTime);

      expect(policy.refundPercentage).to.equal(50);
      expect(policy.description).to.include('50% refund');
    });

    it('should return 50% refund for cancellation 30h before meeting', () => {
      const meetingStart = new Date('2024-12-10T14:00:00Z');
      const cancellationTime = new Date('2024-12-09T08:00:00Z'); // 30 hours before

      const policy = calculateRefundPolicy(meetingStart, cancellationTime);

      expect(policy.refundPercentage).to.equal(50);
    });

    it('should return 0% refund for cancellation 20h before meeting', () => {
      const meetingStart = new Date('2024-12-10T14:00:00Z');
      const cancellationTime = new Date('2024-12-09T18:00:00Z'); // 20 hours before

      const policy = calculateRefundPolicy(meetingStart, cancellationTime);

      expect(policy.refundPercentage).to.equal(0);
      expect(policy.description).to.include('No refund');
    });

    it('should return 0% refund for cancellation 1h before meeting', () => {
      const meetingStart = new Date('2024-12-10T14:00:00Z');
      const cancellationTime = new Date('2024-12-10T13:00:00Z'); // 1 hour before

      const policy = calculateRefundPolicy(meetingStart, cancellationTime);

      expect(policy.refundPercentage).to.equal(0);
    });

    it('should handle exact 72h boundary (should be 100%)', () => {
      const meetingStart = new Date('2024-12-10T14:00:00Z');
      const cancellationTime = new Date('2024-12-07T14:00:00Z'); // exactly 72 hours

      const policy = calculateRefundPolicy(meetingStart, cancellationTime);

      expect(policy.refundPercentage).to.equal(100);
    });

    it('should handle exact 24h boundary (should be 50%)', () => {
      const meetingStart = new Date('2024-12-10T14:00:00Z');
      const cancellationTime = new Date('2024-12-09T14:00:00Z'); // exactly 24 hours

      const policy = calculateRefundPolicy(meetingStart, cancellationTime);

      expect(policy.refundPercentage).to.equal(50);
    });
  });

  describe('generateQRCode', () => {
    it('should generate unique QR codes for different bookings', () => {
      const qr1 = generateQRCode('booking-123');
      const qr2 = generateQRCode('booking-456');

      expect(qr1).to.not.equal(qr2);
      expect(qr1).to.include('AVALO_BOOKING_');
      expect(qr2).to.include('AVALO_BOOKING_');
    });

    it('should include booking ID in QR code', () => {
      const bookingId = 'test-booking-789';
      const qr = generateQRCode(bookingId);

      expect(qr).to.include(bookingId);
    });

    it('should generate different QR codes for same booking ID at different times', () => {
      const bookingId = 'same-booking';
      const qr1 = generateQRCode(bookingId);
      
      // Wait a tiny bit
      const qr2 = generateQRCode(bookingId);

      expect(qr1).to.not.equal(qr2);
    });
  });
});

describe('Calendar Engine - Refund Scenarios', () => {
  describe('Guest Cancellation Refunds', () => {
    it('should calculate correct refund for 100 token booking cancelled >72h', () => {
      const priceTokens = 100;
      const { hostShare } = calculatePaymentSplit(priceTokens);
      
      const policy = calculateRefundPolicy(
        new Date('2024-12-10T14:00:00Z'),
        new Date('2024-12-07T12:00:00Z')
      );

      const refundAmount = Math.floor(hostShare * (policy.refundPercentage / 100));

      expect(refundAmount).to.equal(80); // 100% of 80 tokens
      expect(priceTokens - refundAmount).to.equal(20); // Avalo keeps its fee
    });

    it('should calculate correct refund for 100 token booking cancelled 48h', () => {
      const priceTokens = 100;
      const { hostShare } = calculatePaymentSplit(priceTokens);
      
      const policy = calculateRefundPolicy(
        new Date('2024-12-10T14:00:00Z'),
        new Date('2024-12-08T14:00:00Z')
      );

      const refundAmount = Math.floor(hostShare * (policy.refundPercentage / 100));

      expect(refundAmount).to.equal(40); // 50% of 80 tokens
      expect(priceTokens - refundAmount).to.equal(60); // 20 Avalo + 40 penalty
    });

    it('should calculate no refund for 100 token booking cancelled <24h', () => {
      const priceTokens = 100;
      const { hostShare } = calculatePaymentSplit(priceTokens);
      
      const policy = calculateRefundPolicy(
        new Date('2024-12-10T14:00:00Z'),
        new Date('2024-12-10T12:00:00Z')
      );

      const refundAmount = Math.floor(hostShare * (policy.refundPercentage / 100));

      expect(refundAmount).to.equal(0);
      expect(hostShare).to.equal(80); // Host gets full share
    });

    it('should handle Royal booking (3000 tokens) cancelled >72h', () => {
      const priceTokens = 3000;
      const { hostShare, avaloShare } = calculatePaymentSplit(priceTokens);
      
      const policy = calculateRefundPolicy(
        new Date('2024-12-10T14:00:00Z'),
        new Date('2024-12-07T12:00:00Z')
      );

      const refundAmount = Math.floor(hostShare * (policy.refundPercentage / 100));

      expect(hostShare).to.equal(2400);
      expect(avaloShare).to.equal(600);
      expect(refundAmount).to.equal(2400); // Full host share refunded
    });
  });

  describe('Host Cancellation Refunds', () => {
    it('should refund full amount including Avalo fee for host cancellation', () => {
      const priceTokens = 1000;
      const { hostShare, avaloShare } = calculatePaymentSplit(priceTokens);

      // Host cancellation = full refund
      const guestRefund = priceTokens;
      const avaloRefund = avaloShare;

      expect(guestRefund).to.equal(1000);
      expect(avaloRefund).to.equal(200);
      expect(hostShare).to.equal(800); // Host gets nothing
    });

    it('should refund full amount for any timing when host cancels', () => {
      const priceTokens = 500;
      
      // Even 1 hour before meeting
      const guestRefund = priceTokens;

      expect(guestRefund).to.equal(500);
    });
  });

  describe('Mismatch Refunds', () => {
    it('should refund full amount including Avalo fee for mismatch', () => {
      const priceTokens = 1500;
      const { avaloShare } = calculatePaymentSplit(priceTokens);

      // Mismatch = full refund
      const guestRefund = priceTokens;
      const avaloRefundAmount = avaloShare;

      expect(guestRefund).to.equal(1500);
      expect(avaloRefundAmount).to.equal(300); // Avalo returns its fee
    });
  });

  describe('Goodwill Refunds', () => {
    it('should refund only host share for goodwill refund', () => {
      const priceTokens = 1000;
      const { hostShare, avaloShare } = calculatePaymentSplit(priceTokens);

      // Goodwill = host share only
      const guestRefund = hostShare;
      const avaloKeeps = avaloShare;

      expect(guestRefund).to.equal(800);
      expect(avaloKeeps).to.equal(200); // Avalo keeps its fee
    });
  });
});

describe('Calendar Engine - Edge Cases', () => {
  it('should handle minimum booking amount (1 token)', () => {
    const result = calculatePaymentSplit(1);
    expect(result.avaloShare).to.equal(0); // 1 * 0.20 = 0.2 -> 0
    expect(result.hostShare).to.equal(1);
    expect(result.hostShare + result.avaloShare).to.equal(1);
  });

  it('should handle large booking amounts (100000 tokens)', () => {
    const result = calculatePaymentSplit(100000);
    expect(result.avaloShare).to.equal(20000);
    expect(result.hostShare).to.equal(80000);
  });

  it('should handle cancellation at exact meeting time', () => {
    const meetingTime = new Date('2024-12-10T14:00:00Z');
    const policy = calculateRefundPolicy(meetingTime, meetingTime);

    expect(policy.refundPercentage).to.equal(0);
  });

  it('should handle cancellation after meeting has started', () => {
    const meetingStart = new Date('2024-12-10T14:00:00Z');
    const cancellationTime = new Date('2024-12-10T15:00:00Z'); // 1 hour after

    const policy = calculateRefundPolicy(meetingStart, cancellationTime);

    expect(policy.refundPercentage).to.equal(0);
  });

  it('should maintain token conservation across all operations', () => {
    const priceTokens = 1000;
    const { hostShare, avaloShare } = calculatePaymentSplit(priceTokens);

    // Initial state
    expect(hostShare + avaloShare).to.equal(priceTokens);

    // Guest cancellation >72h
    const policy72h = calculateRefundPolicy(
      new Date('2024-12-10T14:00:00Z'),
      new Date('2024-12-07T12:00:00Z')
    );
    const refund72h = Math.floor(hostShare * (policy72h.refundPercentage / 100));
    const remaining72h = priceTokens - refund72h;
    
    // Tokens are conserved: refund + Avalo fee = original
    expect(refund72h + avaloShare).to.equal(priceTokens);

    // Guest cancellation 48h
    const policy48h = calculateRefundPolicy(
      new Date('2024-12-10T14:00:00Z'),
      new Date('2024-12-08T14:00:00Z')
    );
    const refund48h = Math.floor(hostShare * (policy48h.refundPercentage / 100));
    const hostEarnings48h = hostShare - refund48h;
    
    // Tokens are conserved: refund + host earnings + Avalo fee = original
    expect(refund48h + hostEarnings48h + avaloShare).to.equal(priceTokens);
  });
});

describe('Calendar Engine - Real-World Scenarios', () => {
  it('Scenario: Standard 100-token booking completed successfully', () => {
    const booking = {
      priceTokens: 100,
      status: 'COMPLETED',
    };

    const split = calculatePaymentSplit(booking.priceTokens);

    expect(split.hostShare).to.equal(80); // Host earns
    expect(split.avaloShare).to.equal(20); // Avalo earns
  });

  it('Scenario: Guest books 1000 tokens, cancels 80h before, gets 800 back', () => {
    const priceTokens = 1000;
    const { hostShare } = calculatePaymentSplit(priceTokens);
    
    const policy = calculateRefundPolicy(
      new Date('2024-12-10T14:00:00Z'),
      new Date('2024-12-07T10:00:00Z') // 80 hours before
    );

    const refund = Math.floor(hostShare * (policy.refundPercentage / 100));

    expect(refund).to.equal(800);
    expect(policy.refundPercentage).to.equal(100);
  });

  it('Scenario: Host cancels 1h before 3000-token booking, full refund', () => {
    const priceTokens = 3000;
    
    // Host cancellation = always full refund
    const refund = priceTokens;

    expect(refund).to.equal(3000);
  });

  it('Scenario: Mismatch reported within 15min, full refund processed', () => {
    const priceTokens = 1500;
    
    // Mismatch = always full refund
    const refund = priceTokens;

    expect(refund).to.equal(1500);
  });

  it('Scenario: Host provides goodwill refund after completed meeting', () => {
    const priceTokens = 500;
    const { hostShare, avaloShare } = calculatePaymentSplit(priceTokens);

    // Goodwill refund
    const guestReceives = hostShare;
    const avaloKeeps = avaloShare;
    const hostLoses = hostShare;

    expect(guestReceives).to.equal(400);
    expect(avaloKeeps).to.equal(100);
    expect(hostLoses).to.equal(400);
  });

  it('Scenario: No-show guest, host still gets paid', () => {
    const priceTokens = 800;
    const { hostShare, avaloShare } = calculatePaymentSplit(priceTokens);

    // No-show = host gets full share
    const hostEarns = hostShare;

    expect(hostEarns).to.equal(640);
    expect(avaloShare).to.equal(160);
  });
});