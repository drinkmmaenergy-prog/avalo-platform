/**
 * Chat Monetization Unit Tests
 * Tests core pricing logic, role determination, and billing calculations
 */

import {
  determineChatRoles,
  calculateMessageBilling,
  type ChatParticipantContext,
  type ChatMonetizationRoles,
} from '../../src/chatMonetization';

import {
  createTestMale,
  createTestFemale,
  createTestInfluencer,
  createTestRoyal,
  createNewUser,
  createLowPopularityUser,
} from '../utils/testData';

describe('Chat Monetization - Role Determination', () => {
  describe('Priority 1: Influencer Override', () => {
    it('should make influencer the earner when only one is influencer', async () => {
      const influencer = createTestInfluencer({ userId: 'influencer_1', gender: 'male' });
      const regular = createTestMale({ userId: 'regular_1' });

      const roles = await determineChatRoles(influencer, regular, { initiatorId: 'regular_1' });

      expect(roles.earnerId).toBe('influencer_1');
      expect(roles.payerId).toBe('regular_1');
      expect(roles.mode).toBe('PAID');
    });

    it('should ignore influencer badge if earnOnChat is OFF', async () => {
      const influencerOff = createTestInfluencer({ 
        userId: 'influencer_1', 
        gender: 'male',
        earnOnChat: false 
      });
      const regular = createTestMale({ userId: 'regular_1' });

      const roles = await determineChatRoles(influencerOff, regular, { initiatorId: 'regular_1' });

      // Should fall through to heterosexual rule (not applicable) then earnOnChat rules
      expect(roles.earnerId).not.toBe('influencer_1');
    });

    it('should fall through when both are influencers', async () => {
      const influencer1 = createTestInfluencer({ userId: 'inf_1', gender: 'male' });
      const influencer2 = createTestInfluencer({ userId: 'inf_2', gender: 'female' });

      const roles = await determineChatRoles(influencer1, influencer2, { initiatorId: 'inf_1' });

      // Should fall to heterosexual rule: man pays, woman earns
      expect(roles.payerId).toBe('inf_1');
      expect(roles.earnerId).toBe('inf_2');
    });
  });

  describe('Priority 2: Heterosexual Rule', () => {
    it('should make man pay in M-F interaction when woman has earnOn', async () => {
      const man = createTestMale({ userId: 'man_1' });
      const woman = createTestFemale({ userId: 'woman_1', earnOnChat: true });

      const roles = await determineChatRoles(man, woman, { initiatorId: 'woman_1' });

      expect(roles.payerId).toBe('man_1');
      expect(roles.earnerId).toBe('woman_1');
      expect(roles.mode).toBe('PAID');
    });

    it('should use FREE_A for low popularity woman with earnOff', async () => {
      const man = createTestMale({ userId: 'man_1' });
      const woman = createLowPopularityUser({ 
        userId: 'woman_1', 
        gender: 'female',
        accountAgeDays: 10 
      });

      const roles = await determineChatRoles(man, woman, { initiatorId: 'man_1' });

      expect(roles.payerId).toBe('man_1');
      expect(roles.earnerId).toBeNull(); // Avalo earns
      expect(roles.mode).toBe('FREE_A');
      expect(roles.freeMessageLimit).toBe(Infinity);
    });

    it('should use FREE_B for mid popularity woman with earnOff', async () => {
      const man = createTestMale({ userId: 'man_1' });
      const woman = createTestFemale({ 
        userId: 'woman_1',
        earnOnChat: false,
        popularity: 'mid',
        accountAgeDays: 10
      });

      const roles = await determineChatRoles(man, woman, { initiatorId: 'man_1' });

      expect(roles.payerId).toBe('man_1');
      expect(roles.earnerId).toBeNull();
      expect(roles.mode).toBe('FREE_B');
      expect(roles.freeMessageLimit).toBe(50);
    });

    it('should NOT use free pool for new users (0-5 days)', async () => {
      const man = createTestMale({ userId: 'man_1' });
      const newWoman = createNewUser({ 
        userId: 'woman_1',
        gender: 'female',
        earnOnChat: false,
        popularity: 'low',
        accountAgeDays: 3
      });

      const roles = await determineChatRoles(man, newWoman, { initiatorId: 'man_1' });

      expect(roles.mode).toBe('PAID'); // Not free!
      expect(roles.earnerId).toBeNull(); // Avalo earns
    });
  });

  describe('Priority 3: earnOnChat Rules', () => {
    it('should make the one with earnOn the earner in MM chat', async () => {
      const manEarnOn = createTestMale({ userId: 'man_1', earnOnChat: true });
      const manEarnOff = createTestMale({ userId: 'man_2', earnOnChat: false });

      const roles = await determineChatRoles(manEarnOn, manEarnOff, { initiatorId: 'man_2' });

      expect(roles.earnerId).toBe('man_1');
      expect(roles.payerId).toBe('man_2');
    });

    it('should make receiver the earner when both have earnOn', async () => {
      const man1 = createTestMale({ userId: 'man_1', earnOnChat: true });
      const man2 = createTestMale({ userId: 'man_2', earnOnChat: true });

      const roles = await determineChatRoles(man1, man2, { initiatorId: 'man_1' });

      expect(roles.payerId).toBe('man_1'); // Initiator pays
      expect(roles.earnerId).toBe('man_2'); // Receiver earns
    });

    it('should make Avalo the earner when both have earnOff (FF)', async () => {
      const woman1 = createTestFemale({ userId: 'woman_1', earnOnChat: false, popularity: 'high' });
      const woman2 = createTestFemale({ userId: 'woman_2', earnOnChat: false, popularity: 'high' });

      const roles = await determineChatRoles(woman1, woman2, { initiatorId: 'woman_1' });

      expect(roles.payerId).toBe('woman_1');
      expect(roles.earnerId).toBeNull(); // Avalo earns
      expect(roles.mode).toBe('PAID');
    });
  });
});

describe('Chat Monetization - Billing Calculations', () => {
  describe('Word-to-Token Conversion', () => {
    it('should use 7 words/token for Royal member earner', () => {
      const roles: ChatMonetizationRoles = {
        payerId: 'payer_1',
        earnerId: 'earner_1',
        wordsPerToken: 7,
        mode: 'PAID',
        needsEscrow: true,
        freeMessageLimit: 0,
      };

      const message = 'one two three four five six seven eight'; // 8 words
      const billing = calculateMessageBilling(message, 'earner_1', roles);

      expect(billing.tokensCost).toBe(Math.round(8 / 7)); // 1 token
      expect(billing.shouldBill).toBe(true);
      expect(billing.earnerReceives).toBe(1);
    });

    it('should use 11 words/token for standard earner', () => {
      const roles: ChatMonetizationRoles = {
        payerId: 'payer_1',
        earnerId: 'earner_1',
        wordsPerToken: 11,
        mode: 'PAID',
        needsEscrow: true,
        freeMessageLimit: 0,
      };

      const message = 'one two three four five six seven eight nine ten eleven twelve'; // 12 words
      const billing = calculateMessageBilling(message, 'earner_1', roles);

      expect(billing.tokensCost).toBe(Math.round(12 / 11)); // 1 token
      expect(billing.shouldBill).toBe(true);
    });

    it('should NOT bill payer messages', () => {
      const roles: ChatMonetizationRoles = {
        payerId: 'payer_1',
        earnerId: 'earner_1',
        wordsPerToken: 11,
        mode: 'PAID',
        needsEscrow: true,
        freeMessageLimit: 0,
      };

      const message = 'This is a long message from the payer with many words';
      const billing = calculateMessageBilling(message, 'payer_1', roles);

      expect(billing.tokensCost).toBe(0);
      expect(billing.shouldBill).toBe(false);
      expect(billing.earnerReceives).toBe(0);
    });

    it('should handle URLs and emojis correctly', () => {
      const roles: ChatMonetizationRoles = {
        payerId: 'payer_1',
        earnerId: 'earner_1',
        wordsPerToken: 11,
        mode: 'PAID',
        needsEscrow: true,
        freeMessageLimit: 0,
      };

      const message = 'Check this https://example.com and 😊 smile';
      const billing = calculateMessageBilling(message, 'earner_1', roles);

      // Should only count "Check", "this", "and", "smile" = 4 words
      expect(billing.tokensCost).toBe(0); // Less than 11 words
    });
  });

  describe('Avalo as Earner', () => {
    it('should credit Avalo when earnerId is null in PAID mode', () => {
      const roles: ChatMonetizationRoles = {
        payerId: 'payer_1',
        earnerId: null,
        wordsPerToken: 11,
        mode: 'PAID',
        needsEscrow: true,
        freeMessageLimit: 0,
      };

      const message = 'one two three four five six seven eight nine ten eleven'; // 11 words
      const billing = calculateMessageBilling(message, null as any, roles);

      expect(billing.tokensCost).toBe(1);
      expect(billing.shouldBill).toBe(true);
      expect(billing.earnerReceives).toBe(0);
      expect(billing.avaloReceives).toBe(1);
    });

    it('should NOT bill in FREE modes even with null earner', () => {
      const roles: ChatMonetizationRoles = {
        payerId: 'payer_1',
        earnerId: null,
        wordsPerToken: 11,
        mode: 'FREE_A',
        needsEscrow: false,
        freeMessageLimit: Infinity,
      };

      const message = 'one two three four five six seven eight nine ten eleven'; // 11 words
      const billing = calculateMessageBilling(message, null as any, roles);

      expect(billing.shouldBill).toBe(false);
      expect(billing.avaloReceives).toBe(0);
    });
  });

  describe('Free Messages Logic', () => {
    it('should return 0 cost for messages within free limit', () => {
      const roles: ChatMonetizationRoles = {
        payerId: 'payer_1',
        earnerId: 'earner_1',
        wordsPerToken: 11,
        mode: 'PAID',
        needsEscrow: true,
        freeMessageLimit: 0,
      };

      // This test validates the calculation itself
      // Free message tracking is handled in processMessageBilling
      const message = 'short message';
      const billing = calculateMessageBilling(message, 'earner_1', roles);

      expect(billing.tokensCost).toBe(0); // Too short
    });
  });

  describe('Revenue Split (35% Avalo, 65% Earner)', () => {
    it('should handle split at deposit time (not per message)', () => {
      // Note: The 35/65 split happens at deposit (100 tokens → 35 fee + 65 escrow)
      // Per-message billing deducts from escrow and credits earner 1:1
      const roles: ChatMonetizationRoles = {
        payerId: 'payer_1',
        earnerId: 'earner_1',
        wordsPerToken: 7,
        mode: 'PAID',
        needsEscrow: true,
        freeMessageLimit: 0,
      };

      const message = 'one two three four five six seven'; // 7 words = 1 token
      const billing = calculateMessageBilling(message, 'earner_1', roles);

      expect(billing.earnerReceives).toBe(1); // Earner gets tokens from escrow
      expect(billing.avaloReceives).toBe(0); // Platform fee already taken
    });
  });
});

describe('Chat Monetization - Edge Cases', () => {
  it('should handle empty messages', () => {
    const roles: ChatMonetizationRoles = {
      payerId: 'payer_1',
      earnerId: 'earner_1',
      wordsPerToken: 11,
      mode: 'PAID',
      needsEscrow: true,
      freeMessageLimit: 0,
    };

    const billing = calculateMessageBilling('', 'earner_1', roles);

    expect(billing.tokensCost).toBe(0);
    expect(billing.shouldBill).toBe(false);
  });

  it('should handle whitespace-only messages', () => {
    const roles: ChatMonetizationRoles = {
      payerId: 'payer_1',
      earnerId: 'earner_1',
      wordsPerToken: 11,
      mode: 'PAID',
      needsEscrow: true,
      freeMessageLimit: 0,
    };

    const billing = calculateMessageBilling('   \n\t  ', 'earner_1', roles);

    expect(billing.tokensCost).toBe(0);
  });

  it('should round word counts correctly', () => {
    const roles: ChatMonetizationRoles = {
      payerId: 'payer_1',
      earnerId: 'earner_1',
      wordsPerToken: 11,
      mode: 'PAID',
      needsEscrow: true,
      freeMessageLimit: 0,
    };

    // 22 words should be exactly 2 tokens
    const message = Array(22).fill('word').join(' ');
    const billing = calculateMessageBilling(message, 'earner_1', roles);

    expect(billing.tokensCost).toBe(2);
  });
});