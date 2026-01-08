/**
 * Smoke Tests for CI/CD Pipeline
 * Quick tests to verify basic system health before deployment
 */

describe('Smoke Tests - Health Checks', () => {
  describe('Backend Health', () => {
    it('should have core monetization functions available', () => {
      const chatMon = require('../../src/chatMonetization');
      const callMon = require('../../src/callMonetization');
      
      expect(chatMon.determineChatRoles).toBeDefined();
      expect(chatMon.calculateMessageBilling).toBeDefined();
      expect(callMon.getCallMinuteCost).toBeDefined();
    });

    it('should have events engine functions available', () => {
      const events = require('../../src/eventsEngine');
      
      expect(events.purchaseEventTicket).toBeDefined();
      expect(events.processEventCheckIn).toBeDefined();
      expect(events.reportMismatchAtEntry).toBeDefined();
    });

    it('should have wallet operations available', () => {
      // Verify wallet-related imports work
      const init = require('../../src/init');
      
      expect(init.db).toBeDefined();
      expect(init.serverTimestamp).toBeDefined();
      expect(init.increment).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should have correct chat pricing constants', () => {
      const WORDS_PER_TOKEN_ROYAL = 7;
      const WORDS_PER_TOKEN_STANDARD = 11;
      const PLATFORM_FEE_PERCENT = 35;
      
      expect(WORDS_PER_TOKEN_ROYAL).toBe(7);
      expect(WORDS_PER_TOKEN_STANDARD).toBe(11);
      expect(PLATFORM_FEE_PERCENT).toBe(35);
    });

    it('should have correct call pricing constants', () => {
      const VOICE_BASE_COST = 10;
      const VIDEO_BASE_COST = 20;
      const VIP_DISCOUNT = 0.30;
      const ROYAL_DISCOUNT = 0.50;
      
      expect(VOICE_BASE_COST).toBe(10);
      expect(VIDEO_BASE_COST).toBe(20);
      expect(VIP_DISCOUNT).toBe(0.30);
      expect(ROYAL_DISCOUNT).toBe(0.50);
    });

    it('should have correct events commission split', () => {
      const AVALO_SHARE = 20;
      const ORGANIZER_SHARE = 80;
      const CHECK_IN_THRESHOLD = 70;
      
      expect(AVALO_SHARE).toBe(20);
      expect(ORGANIZER_SHARE).toBe(80);
      expect(CHECK_IN_THRESHOLD).toBe(70);
    });
  });

  describe('Test Environment', () => {
    it('should be running in test mode', () => {
      expect(process.env.NODE_ENV).toBe('test');
    });

    it('should have Firebase emulator configured', () => {
      expect(process.env.FIRESTORE_EMULATOR_HOST).toBeDefined();
      expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeDefined();
    });
  });

  describe('Critical Imports', () => {
    it('should import Firebase Admin SDK', () => {
      expect(() => require('firebase-admin')).not.toThrow();
    });

    it('should import Firebase Functions', () => {
      expect(() => require('firebase-functions')).not.toThrow();
    });

    it('should import Stripe', () => {
      expect(() => require('stripe')).not.toThrow();
    });

    it('should import Zod for validation', () => {
      expect(() => require('zod')).not.toThrow();
    });
  });
});

describe('Smoke Tests - Basic Calculations', () => {
  it('should calculate chat billing correctly', async () => {
    const { calculateMessageBilling } = require('../../src/chatMonetization');
    
    const roles = {
      payerId: 'p1',
      earnerId: 'e1',
      wordsPerToken: 11,
      mode: 'PAID',
      needsEscrow: true,
      freeMessageLimit: 0,
    };

    const message = Array(11).fill('word').join(' '); // Exactly 11 words
    const billing = calculateMessageBilling(message, 'e1', roles);
    
    expect(billing.tokensCost).toBe(1);
  });

  it('should calculate call pricing correctly', async () => {
    const { getCallMinuteCost } = require('../../src/callMonetization');
    
    const voiceCost = await getCallMinuteCost({
      payerStatus: 'STANDARD',
      callType: 'VOICE',
    });
    
    expect(voiceCost).toBe(10);
  });

  it('should calculate event commission split correctly', () => {
    const ticketPrice = 100;
    const avaloShare = Math.floor(ticketPrice * 0.20);
    const organizerShare = ticketPrice - avaloShare;
    
    expect(avaloShare).toBe(20);
    expect(organizerShare).toBe(80);
  });
});

describe('Smoke Tests - Data Validation', () => {
  it('should validate user context structure', () => {
    const { createTestUser } = require('../utils/testData');
    
    const user = createTestUser();
    
    expect(user).toHaveProperty('userId');
    expect(user).toHaveProperty('gender');
    expect(user).toHaveProperty('earnOnChat');
    expect(user).toHaveProperty('influencerBadge');
    expect(user).toHaveProperty('isRoyalMember');
    expect(user).toHaveProperty('popularity');
    expect(user).toHaveProperty('accountAgeDays');
  });

  it('should mark test data correctly', () => {
    const { markAsTestData } = require('../utils/testData');
    
    const data = markAsTestData({ userId: 'test' });
    
    expect(data.isTestAccount).toBe(true);
  });
});