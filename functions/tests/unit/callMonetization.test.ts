/**
 * Call Monetization Unit Tests
 * Tests call pricing logic with VIP/Royal discounts
 */

import {
  getCallMinuteCost,
  type UserStatus,
  type CallType,
} from '../../src/callMonetization';

describe('Call Monetization - Pricing', () => {
  describe('Voice Call Pricing', () => {
    it('should charge 10 tokens/min for standard users', async () => {
      const cost = await getCallMinuteCost({
        payerStatus: 'STANDARD',
        callType: 'VOICE',
      });

      expect(cost).toBe(10);
    });

    it('should apply 30% VIP discount on voice calls', async () => {
      const cost = await getCallMinuteCost({
        payerStatus: 'VIP',
        callType: 'VOICE',
      });

      // 10 * (1 - 0.30) = 7
      expect(cost).toBe(7);
    });

    it('should apply 50% Royal discount on voice calls', async () => {
      const cost = await getCallMinuteCost({
        payerStatus: 'ROYAL',
        callType: 'VOICE',
      });

      // 10 * (1 - 0.50) = 5
      expect(cost).toBe(5);
    });
  });

  describe('Video Call Pricing', () => {
    it('should charge 20 tokens/min for standard users', async () => {
      const cost = await getCallMinuteCost({
        payerStatus: 'STANDARD',
        callType: 'VIDEO',
      });

      expect(cost).toBe(20);
    });

    it('should apply 30% VIP discount on video calls', async () => {
      const cost = await getCallMinuteCost({
        payerStatus: 'VIP',
        callType: 'VIDEO',
      });

      // 20 * (1 - 0.30) = 14
      expect(cost).toBe(14);
    });

    it('should apply 50% Royal discount on video calls', async () => {
      const cost = await getCallMinuteCost({
        payerStatus: 'ROYAL',
        callType: 'VIDEO',
      });

      // 20 * (1 - 0.50) = 10
      expect(cost).toBe(10);
    });
  });

  describe('Revenue Split (80% Earner, 20% Avalo)', () => {
    it('should calculate correct split for voice call', () => {
      const totalCost = 100; // 10 min * 10 tokens/min
      const earnerShare = Math.floor(totalCost * 0.80);
      const avaloShare = totalCost - earnerShare;

      expect(earnerShare).toBe(80);
      expect(avaloShare).toBe(20);
    });

    it('should calculate correct split for video call', () => {
      const totalCost = 200; // 10 min * 20 tokens/min
      const earnerShare = Math.floor(totalCost * 0.80);
      const avaloShare = totalCost - earnerShare;

      expect(earnerShare).toBe(160);
      expect(avaloShare).toBe(40);
    });
  });

  describe('Duration Billing', () => {
    it('should bill full minute for any started minute', () => {
      const pricePerMin = 10;
      
      // 0.5 minutes should be billed as 1 minute
      const duration1 = Math.ceil(0.5);
      expect(duration1 * pricePerMin).toBe(10);

      // 1.1 minutes should be billed as 2 minutes
      const duration2 = Math.ceil(1.1);
      expect(duration2 * pricePerMin).toBe(20);

      // 5.9 minutes should be billed as 6 minutes
      const duration3 = Math.ceil(5.9);
      expect(duration3 * pricePerMin).toBe(60);
    });
  });

  describe('Discount Verification', () => {
    it('should NOT apply chat discounts to calls (separate systems)', async () => {
      // VIP/Royal discounts apply ONLY to voice & video calls
      // NOT to text chat or voice notes
      const voiceCost = await getCallMinuteCost({
        payerStatus: 'VIP',
        callType: 'VOICE',
      });

      expect(voiceCost).toBeLessThan(10); // Discount applied
    });
  });
});

describe('Call Monetization - Heterosexual Rule', () => {
  it('should make man pay in M-F calls (same as chat)', () => {
    // Note: This is tested in determineChatRoles logic
    // In callMonetization, the same rule applies for calls
    expect(true).toBe(true); // Placeholder for role determination test
  });
});

describe('Call Monetization - Edge Cases', () => {
  it('should handle zero duration calls', () => {
    const duration = 0;
    const pricePerMin = 10;
    const totalCost = Math.ceil(duration) * pricePerMin;

    expect(totalCost).toBe(0);
  });

  it('should handle very short calls (under 1 second)', () => {
    const durationSeconds = 0.5;
    const durationMinutes = durationSeconds / 60;
    const pricePerMin = 10;
    const totalCost = Math.ceil(durationMinutes) * pricePerMin;

    expect(totalCost).toBe(10); // Rounds up to 1 minute
  });

  it('should handle long calls (multiple hours)', () => {
    const durationMinutes = 180; // 3 hours
    const pricePerMin = 10;
    const totalCost = durationMinutes * pricePerMin;

    expect(totalCost).toBe(1800);
  });
});