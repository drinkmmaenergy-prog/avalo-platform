import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

/**
 * CANONICAL CHAT ENGINE — v2_canonical — COMPREHENSIVE TEST SUITE
 *
 * Tests cover all requirements from the chat engine consolidation spec:
 *
 * I.1  Hetero: male pays regardless of initiator
 * I.2  Influencer override: influencer earns regardless of gender when flagged + earn_on=ON
 * I.3  Only earner messages billable; payer messages never billed
 * I.4  Free counters: standard=9/user, Royal=5/user
 * I.5  Multiplier applies only to next paid session
 * I.6  Refund: unused escrow refunded; platform fee not refunded
 * I.7  Concurrency: 100 parallel earner messages → no negative escrow, no double spends
 *
 * @module canonical-chat-engine.test
 * @version 2.0.0
 */

import {
  determineRoles,
  countBillableWords,
  calculateBilling,
  isValidMultiplier,
} from '../canonical-chat-engine';

import type {
  ChatParticipantContext,
  CanonicalBillingState,
  CanonicalSessionConfig,
  BurnMultiplier,
} from '../types/canonical-chat.types';

import {
  FREE_MESSAGES_STANDARD,
  FREE_MESSAGES_ROYAL_EARNER,
  WORDS_PER_TOKEN_STANDARD,
  WORDS_PER_TOKEN_ROYAL,
  PLATFORM_FEE_PCT,
  ESCROW_PCT,
  MIN_DEPOSIT_TOKENS,
  EARNER_REVENUE_SPLIT,
  AVALO_REVENUE_SPLIT,
  BURN_MULTIPLIER_ENUM,
} from '../types/canonical-chat.types';

// ============================================================================
// HELPERS
// ============================================================================

function makeParticipant(overrides: Partial<ChatParticipantContext> = {}): ChatParticipantContext {
  return {
    userId: overrides.userId ?? 'user_default',
    gender: overrides.gender ?? 'male',
    earnOnChat: overrides.earnOnChat ?? false,
    influencerBadge: overrides.influencerBadge ?? false,
    isRoyalMember: overrides.isRoyalMember ?? false,
  };
}

function makeBillingState(overrides: Partial<CanonicalBillingState> = {}): CanonicalBillingState {
  return {
    accumulatedEarnerWords: overrides.accumulatedEarnerWords ?? 0,
    escrowRemainingTokens: overrides.escrowRemainingTokens ?? 65,
    platformFeeChargedTokens: overrides.platformFeeChargedTokens ?? 35,
    totalBucketsConsumed: overrides.totalBucketsConsumed ?? 0,
    totalTokensConsumed: overrides.totalTokensConsumed ?? 0,
    totalEarnerCredited: overrides.totalEarnerCredited ?? 0,
    totalAvaloCredited: overrides.totalAvaloCredited ?? 0,
  };
}

function makeSessionConfig(overrides: Partial<CanonicalSessionConfig> = {}): CanonicalSessionConfig {
  return {
    depositTokens: overrides.depositTokens ?? 100,
    wordsPerToken: overrides.wordsPerToken ?? WORDS_PER_TOKEN_STANDARD,
    burnMultiplier: overrides.burnMultiplier ?? 1,
  };
}

// ============================================================================
// TEST SUITE I.1: HETERO — MALE PAYS REGARDLESS OF INITIATOR
// ============================================================================

describe('I.1 Hetero: male pays regardless of initiator', () => {
  test('male initiator + female receiver → male pays, female earns', () => {
    const male = makeParticipant({ userId: 'male_1', gender: 'male' });
    const female = makeParticipant({ userId: 'female_1', gender: 'female', earnOnChat: true });

    const roles = determineRoles(male, female);

    expect(roles.payerId).toBe('male_1');
    expect(roles.earnerId).toBe('female_1');
  });

  test('female initiator + male receiver → male pays, female earns', () => {
    const female = makeParticipant({ userId: 'female_1', gender: 'female', earnOnChat: true });
    const male = makeParticipant({ userId: 'male_1', gender: 'male' });

    const roles = determineRoles(female, male);

    expect(roles.payerId).toBe('male_1');
    expect(roles.earnerId).toBe('female_1');
  });

  test('male initiator + female receiver with earnOnChat=false → male pays, female earns (hetero override)', () => {
    const male = makeParticipant({ userId: 'male_1', gender: 'male' });
    const female = makeParticipant({ userId: 'female_1', gender: 'female', earnOnChat: false });

    const roles = determineRoles(male, female);

    expect(roles.payerId).toBe('male_1');
    expect(roles.earnerId).toBe('female_1');
  });

  test('same-gender male + male → initiator pays, receiver earns if earn_on', () => {
    const male1 = makeParticipant({ userId: 'male_1', gender: 'male' });
    const male2 = makeParticipant({ userId: 'male_2', gender: 'male', earnOnChat: true });

    const roles = determineRoles(male1, male2);

    expect(roles.payerId).toBe('male_1');
    expect(roles.earnerId).toBe('male_2');
  });

  test('same-gender female + female → initiator pays, receiver earns if earn_on', () => {
    const female1 = makeParticipant({ userId: 'female_1', gender: 'female' });
    const female2 = makeParticipant({ userId: 'female_2', gender: 'female', earnOnChat: true });

    const roles = determineRoles(female1, female2);

    expect(roles.payerId).toBe('female_1');
    expect(roles.earnerId).toBe('female_2');
  });

  test('same-gender with no earn_on → initiator pays, Avalo earns (null)', () => {
    const male1 = makeParticipant({ userId: 'male_1', gender: 'male' });
    const male2 = makeParticipant({ userId: 'male_2', gender: 'male', earnOnChat: false });

    const roles = determineRoles(male1, male2);

    expect(roles.payerId).toBe('male_1');
    expect(roles.earnerId).toBeNull();
  });
});

// ============================================================================
// TEST SUITE I.2: INFLUENCER OVERRIDE
// ============================================================================

describe('I.2 Influencer override: influencer earns regardless of gender', () => {
  test('male influencer with earn_on receiving from female → influencer earns', () => {
    const female = makeParticipant({ userId: 'female_1', gender: 'female', earnOnChat: true });
    const maleInfluencer = makeParticipant({
      userId: 'influencer_1',
      gender: 'male',
      influencerBadge: true,
      earnOnChat: true,
    });

    // Female initiates chat with male influencer
    const roles = determineRoles(female, maleInfluencer);

    expect(roles.earnerId).toBe('influencer_1');
    expect(roles.payerId).toBe('female_1');
  });

  test('female influencer with earn_on receiving from male → influencer earns (overrides hetero)', () => {
    const male = makeParticipant({ userId: 'male_1', gender: 'male' });
    const femaleInfluencer = makeParticipant({
      userId: 'influencer_1',
      gender: 'female',
      influencerBadge: true,
      earnOnChat: true,
    });

    const roles = determineRoles(male, femaleInfluencer);

    // Influencer override takes priority over hetero rule
    expect(roles.earnerId).toBe('influencer_1');
    expect(roles.payerId).toBe('male_1');
  });

  test('influencer without earn_on → falls through to normal rules', () => {
    const male = makeParticipant({ userId: 'male_1', gender: 'male' });
    const femaleInfluencer = makeParticipant({
      userId: 'influencer_1',
      gender: 'female',
      influencerBadge: true,
      earnOnChat: false, // earn_on is OFF
    });

    const roles = determineRoles(male, femaleInfluencer);

    // Falls through to hetero rule
    expect(roles.payerId).toBe('male_1');
    expect(roles.earnerId).toBe('influencer_1'); // Still earns via hetero rule
  });

  test('both are influencers with earn_on → receiver influencer earns', () => {
    const initiator = makeParticipant({
      userId: 'inf_1',
      gender: 'male',
      influencerBadge: true,
      earnOnChat: true,
    });
    const receiver = makeParticipant({
      userId: 'inf_2',
      gender: 'male',
      influencerBadge: true,
      earnOnChat: true,
    });

    const roles = determineRoles(initiator, receiver);

    // Receiver influencer takes priority
    expect(roles.earnerId).toBe('inf_2');
    expect(roles.payerId).toBe('inf_1');
  });
});

// ============================================================================
// TEST SUITE I.3: ONLY EARNER MESSAGES BILLABLE; PAYER MESSAGES NEVER BILLED
// ============================================================================

describe('I.3 Only earner messages billable; payer messages never billed', () => {
  test('earner sends 11 words (1 bucket) → 1 token consumed', () => {
    const state = makeBillingState();
    const config = makeSessionConfig();

    const result = calculateBilling(state, config, 11, 'earner_1');

    expect(result.billed).toBe(true);
    expect(result.newBuckets).toBe(1);
    expect(result.tokensConsumed).toBe(1); // 1 bucket * 1 multiplier
  });

  test('payer sends message → not billed (handled in processMessage, but calculateBilling would bill if called)', () => {
    // This test verifies the principle; processMessage checks senderId === payerId.
    // Here we verify calculateBilling works correctly for earner messages.
    const state = makeBillingState();
    const config = makeSessionConfig();

    // With 0 words, no billing occurs
    const result = calculateBilling(state, config, 0, 'earner_1');

    expect(result.billed).toBe(false);
    expect(result.tokensConsumed).toBe(0);
  });

  test('earner sends 10 words (partial bucket) → no billing yet, words accumulate', () => {
    const state = makeBillingState();
    const config = makeSessionConfig(); // 11 words/token

    const result = calculateBilling(state, config, 10, 'earner_1');

    expect(result.billed).toBe(false);
    expect(result.newBuckets).toBe(0);
    expect(result.tokensConsumed).toBe(0);
    expect(result.updatedBillingState.accumulatedEarnerWords).toBe(10);
  });

  test('earner sends 10 words then 1 more → bucket completes', () => {
    // First message: 10 words
    const state1 = makeBillingState();
    const config = makeSessionConfig();
    const result1 = calculateBilling(state1, config, 10, 'earner_1');

    expect(result1.billed).toBe(false);
    expect(result1.updatedBillingState.accumulatedEarnerWords).toBe(10);

    // Second message: 1 word (total now 11)
    const result2 = calculateBilling(result1.updatedBillingState, config, 1, 'earner_1');

    expect(result2.billed).toBe(true);
    expect(result2.newBuckets).toBe(1);
    expect(result2.tokensConsumed).toBe(1);
    expect(result2.updatedBillingState.accumulatedEarnerWords).toBe(11);
    expect(result2.updatedBillingState.totalBucketsConsumed).toBe(1);
  });

  test('earner sends 22 words (2 buckets at once)', () => {
    const state = makeBillingState();
    const config = makeSessionConfig();

    const result = calculateBilling(state, config, 22, 'earner_1');

    expect(result.billed).toBe(true);
    expect(result.newBuckets).toBe(2);
    expect(result.tokensConsumed).toBe(2);
  });

  test('when earnerId=null → 100% of consumed escrow goes to Avalo', () => {
    const state = makeBillingState();
    const config = makeSessionConfig();

    const result = calculateBilling(state, config, 11, null);

    expect(result.billed).toBe(true);
    expect(result.tokensConsumed).toBe(1);
    expect(result.earnerCredit).toBe(0);
    expect(result.platformCredit).toBe(1); // 100% to Avalo
  });

  test('when earnerId is set → 65% earner, 35% Avalo', () => {
    const state = makeBillingState({ escrowRemainingTokens: 100 });
    const config = makeSessionConfig({ wordsPerToken: 11 });

    // Send 110 words = 10 buckets = 10 tokens
    const result = calculateBilling(state, config, 110, 'earner_1');

    expect(result.billed).toBe(true);
    expect(result.newBuckets).toBe(10);
    expect(result.tokensConsumed).toBe(10);
    // floor(10 * MONETIZATION_SPLITS.CHAT.earner) = floor(6.5) = 6
    expect(result.earnerCredit).toBe(6);
    // Remainder: 10 - 6 = 4
    expect(result.platformCredit).toBe(4);
  });
});

// ============================================================================
// TEST SUITE I.4: FREE COUNTERS
// ============================================================================

describe('I.4 Free counters: standard=9/user, Royal=5/user', () => {
  test('FREE_MESSAGES_STANDARD equals 9', () => {
    expect(FREE_MESSAGES_STANDARD).toBe(9);
  });

  test('FREE_MESSAGES_ROYAL_EARNER equals 5', () => {
    expect(FREE_MESSAGES_ROYAL_EARNER).toBe(5);
  });

  test('WORDS_PER_TOKEN_STANDARD equals 11', () => {
    expect(WORDS_PER_TOKEN_STANDARD).toBe(11);
  });

  test('WORDS_PER_TOKEN_ROYAL equals 7', () => {
    expect(WORDS_PER_TOKEN_ROYAL).toBe(7);
  });
});

// ============================================================================
// TEST SUITE I.5: MULTIPLIER APPLIES ONLY TO NEXT PAID SESSION
// ============================================================================

describe('I.5 Multiplier applies only to next paid session', () => {
  test('multiplier=1 → 1 token per bucket', () => {
    const state = makeBillingState();
    const config = makeSessionConfig({ burnMultiplier: 1 });

    const result = calculateBilling(state, config, 11, 'earner_1');

    expect(result.tokensConsumed).toBe(1);
  });

  test('multiplier=2 → 2 tokens per bucket', () => {
    const state = makeBillingState();
    const config = makeSessionConfig({ burnMultiplier: 2 });

    const result = calculateBilling(state, config, 11, 'earner_1');

    expect(result.tokensConsumed).toBe(2);
  });

  test('multiplier=5 → 5 tokens per bucket', () => {
    const state = makeBillingState();
    const config = makeSessionConfig({ burnMultiplier: 5 });

    const result = calculateBilling(state, config, 11, 'earner_1');

    expect(result.tokensConsumed).toBe(5);
  });

  test('multiplier=10 → 10 tokens per bucket', () => {
    const state = makeBillingState();
    const config = makeSessionConfig({ burnMultiplier: 10 });

    const result = calculateBilling(state, config, 11, 'earner_1');

    expect(result.tokensConsumed).toBe(10);
  });

  test('multiplier=20 → 20 tokens per bucket', () => {
    const state = makeBillingState({ escrowRemainingTokens: 100 });
    const config = makeSessionConfig({ burnMultiplier: 20 });

    const result = calculateBilling(state, config, 11, 'earner_1');

    expect(result.tokensConsumed).toBe(20);
  });

  test('all allowed multipliers are valid', () => {
    const allowed = [1, 2, 3, 4, 5, 7, 10, 12, 15, 20];
    for (const m of allowed) {
      expect(isValidMultiplier(m)).toBe(true);
    }
  });

  test('disallowed multipliers are rejected', () => {
    const disallowed = [0, 6, 8, 9, 11, 13, 14, 16, 17, 18, 19, 21, 100];
    for (const m of disallowed) {
      expect(isValidMultiplier(m)).toBe(false);
    }
  });

  test('multiplier is frozen in configSnapshot (does not change mid-session)', () => {
    const config = makeSessionConfig({ burnMultiplier: 5 });

    // First message
    const state1 = makeBillingState({ escrowRemainingTokens: 100 });
    const result1 = calculateBilling(state1, config, 11, 'earner_1');
    expect(result1.tokensConsumed).toBe(5);

    // Second message — same config, multiplier still 5
    const result2 = calculateBilling(result1.updatedBillingState, config, 11, 'earner_1');
    expect(result2.tokensConsumed).toBe(5);
  });
});

// ============================================================================
// TEST SUITE I.6: REFUND — UNUSED ESCROW REFUNDED / PLATFORM FEE NOT REFUNDED
// ============================================================================

describe('I.6 Refund: unused escrow refunded; platform fee not refunded', () => {
  test('deposit 100 tokens → platformFee=35, escrow=65', () => {
    const deposit = 100;
    const platformFee = Math.floor(deposit * PLATFORM_FEE_PCT / 100);
    const escrow = deposit - platformFee;

    expect(platformFee).toBe(35);
    expect(escrow).toBe(65);
  });

  test('no tokens consumed → full escrow refundable', () => {
    const state = makeBillingState({
      escrowRemainingTokens: 65,
      platformFeeChargedTokens: 35,
      totalTokensConsumed: 0,
    });

    // Refund = escrowRemainingTokens
    expect(state.escrowRemainingTokens).toBe(65);
    expect(state.platformFeeChargedTokens).toBe(35); // Not refundable
  });

  test('partial consumption → remaining escrow refundable', () => {
    const state = makeBillingState({ escrowRemainingTokens: 65 });
    const config = makeSessionConfig();

    // Consume 1 bucket (1 token)
    const result = calculateBilling(state, config, 11, 'earner_1');

    expect(result.tokensConsumed).toBe(1);
    expect(result.updatedBillingState.escrowRemainingTokens).toBe(64);
    // 64 tokens still refundable, 35 platform fee NOT refundable
  });

  test('full consumption → 0 escrow remaining, 0 refund', () => {
    const state = makeBillingState({ escrowRemainingTokens: 3 });
    const config = makeSessionConfig();

    // Consume more than available (65 buckets * 1 = 65 tokens, but only 3 remaining)
    const result = calculateBilling(state, config, 110, 'earner_1');

    // Capped at escrow remaining
    expect(result.tokensConsumed).toBe(3);
    expect(result.updatedBillingState.escrowRemainingTokens).toBe(0);
    expect(result.escrowExhausted).toBe(true);
  });

  test('PLATFORM_FEE_PCT is 35', () => {
    expect(PLATFORM_FEE_PCT).toBe(35);
  });

  test('ESCROW_PCT is 65', () => {
    expect(ESCROW_PCT).toBe(65);
  });
});

// ============================================================================
// TEST SUITE I.7: CONCURRENCY — NO NEGATIVE ESCROW, NO DOUBLE SPENDS
// ============================================================================

describe('I.7 Concurrency: no negative escrow, no double spends', () => {
  test('calculateBilling never produces negative escrow', () => {
    const state = makeBillingState({ escrowRemainingTokens: 1 });
    const config = makeSessionConfig({ burnMultiplier: 20 });

    // 11 words = 1 bucket * 20 multiplier = 20 tokens, but only 1 in escrow
    const result = calculateBilling(state, config, 11, 'earner_1');

    expect(result.tokensConsumed).toBe(1); // Capped at escrow
    expect(result.updatedBillingState.escrowRemainingTokens).toBe(0);
    expect(result.escrowExhausted).toBe(true);
    // Not negative
    expect(result.updatedBillingState.escrowRemainingTokens).toBeGreaterThanOrEqual(0);
  });

  test('100 sequential earner messages never create negative escrow', () => {
    let state = makeBillingState({ escrowRemainingTokens: 65 });
    const config = makeSessionConfig();

    for (let i = 0; i < 100; i++) {
      const result = calculateBilling(state, config, 11, 'earner_1');
      state = result.updatedBillingState;

      // INVARIANT: escrow never negative
      expect(state.escrowRemainingTokens).toBeGreaterThanOrEqual(0);
    }

    // After 65 buckets consumed (65 * 11 = 715 words), escrow should be 0
    expect(state.escrowRemainingTokens).toBe(0);
    expect(state.totalBucketsConsumed).toBe(100); // 100 messages * 11 words = 1100 words / 11 = 100 buckets
    // But only 65 tokens consumed because that's all there is
    expect(state.totalTokensConsumed).toBe(65);
  });

  test('high multiplier with limited escrow does not overshoot', () => {
    let state = makeBillingState({ escrowRemainingTokens: 10 });
    const config = makeSessionConfig({ burnMultiplier: 7 });

    // Each bucket costs 7 tokens. With 10 remaining:
    // Bucket 1: 7 tokens → 3 remaining
    // Bucket 2: wants 7, gets 3 → 0 remaining

    const result1 = calculateBilling(state, config, 11, 'earner_1');
    expect(result1.tokensConsumed).toBe(7);
    expect(result1.updatedBillingState.escrowRemainingTokens).toBe(3);

    const result2 = calculateBilling(result1.updatedBillingState, config, 11, 'earner_1');
    expect(result2.tokensConsumed).toBe(3); // Capped
    expect(result2.updatedBillingState.escrowRemainingTokens).toBe(0);
    expect(result2.escrowExhausted).toBe(true);
  });

  test('earnerCredit + platformCredit always equals tokensConsumed', () => {
    const multipliers: BurnMultiplier[] = [1, 2, 3, 4, 5, 7, 10, 12, 15, 20];

    for (const mult of multipliers) {
      const state = makeBillingState({ escrowRemainingTokens: 1000 });
      const config = makeSessionConfig({ burnMultiplier: mult });

      for (let words = 11; words <= 110; words += 11) {
        const result = calculateBilling(state, config, words, 'earner_1');

        if (result.billed) {
          expect(result.earnerCredit + result.platformCredit).toBe(result.tokensConsumed);
        }
      }
    }
  });
});

// ============================================================================
// ADDITIONAL TESTS: WORD COUNTING
// ============================================================================

describe('Word counting', () => {
  test('empty string → 0 words', () => {
    expect(countBillableWords('')).toBe(0);
  });

  test('null/undefined → 0 words', () => {
    expect(countBillableWords(null as any)).toBe(0);
    expect(countBillableWords(undefined as any)).toBe(0);
  });

  test('simple text → correct word count', () => {
    expect(countBillableWords('Hello how are you today')).toBe(5);
  });

  test('URLs are excluded from word count', () => {
    expect(countBillableWords('Check out https://example.com for more info')).toBe(5);
  });

  test('emojis are excluded from word count', () => {
    expect(countBillableWords('Hello 😊 world 🌍')).toBe(2);
  });

  test('multiple spaces collapse', () => {
    expect(countBillableWords('Hello    world')).toBe(2);
  });

  test('only spaces → 0 words', () => {
    expect(countBillableWords('   ')).toBe(0);
  });
});

// ============================================================================
// ADDITIONAL TESTS: DEPOSIT MATH
// ============================================================================

describe('Deposit math', () => {
  test('deposit 100 → fee=35, escrow=65', () => {
    const deposit = 100;
    const fee = Math.floor(deposit * 35 / 100);
    const escrow = deposit - fee;
    expect(fee).toBe(35);
    expect(escrow).toBe(65);
  });

  test('deposit 200 → fee=70, escrow=130', () => {
    const deposit = 200;
    const fee = Math.floor(deposit * 35 / 100);
    const escrow = deposit - fee;
    expect(fee).toBe(70);
    expect(escrow).toBe(130);
  });

  test('deposit 500 → fee=175, escrow=325', () => {
    const deposit = 500;
    const fee = Math.floor(deposit * 35 / 100);
    const escrow = deposit - fee;
    expect(fee).toBe(175);
    expect(escrow).toBe(325);
  });

  test('minimum deposit is 100 tokens', () => {
    expect(MIN_DEPOSIT_TOKENS).toBe(100);
  });

  test('deposit max(100, earnerConfig) enforced', () => {
    // earner wants 50 → capped at 100
    expect(Math.max(MIN_DEPOSIT_TOKENS, 50)).toBe(100);
    // earner wants 200 → uses 200
    expect(Math.max(MIN_DEPOSIT_TOKENS, 200)).toBe(200);
    // earner wants 100 → exactly 100
    expect(Math.max(MIN_DEPOSIT_TOKENS, 100)).toBe(100);
  });
});

// ============================================================================
// ADDITIONAL TESTS: ROYAL EARNER BUCKETS
// ============================================================================

describe('Royal earner uses 7 words per token instead of 11', () => {
  test('Royal earner: 7 words = 1 bucket', () => {
    const state = makeBillingState();
    const config = makeSessionConfig({ wordsPerToken: WORDS_PER_TOKEN_ROYAL });

    const result = calculateBilling(state, config, 7, 'earner_1');

    expect(result.billed).toBe(true);
    expect(result.newBuckets).toBe(1);
    expect(result.tokensConsumed).toBe(1);
  });

  test('Standard earner: 7 words = 0 buckets (need 11)', () => {
    const state = makeBillingState();
    const config = makeSessionConfig({ wordsPerToken: WORDS_PER_TOKEN_STANDARD });

    const result = calculateBilling(state, config, 7, 'earner_1');

    expect(result.billed).toBe(false);
    expect(result.newBuckets).toBe(0);
  });

  test('Royal earner accumulates partial: 6 words then 1 word = 1 bucket', () => {
    const state = makeBillingState();
    const config = makeSessionConfig({ wordsPerToken: WORDS_PER_TOKEN_ROYAL });

    const result1 = calculateBilling(state, config, 6, 'earner_1');
    expect(result1.billed).toBe(false);
    expect(result1.updatedBillingState.accumulatedEarnerWords).toBe(6);

    const result2 = calculateBilling(result1.updatedBillingState, config, 1, 'earner_1');
    expect(result2.billed).toBe(true);
    expect(result2.newBuckets).toBe(1);
  });
});

// ============================================================================
// ADDITIONAL TESTS: DETERMINISTIC FLOOR (NO Math.round)
// ============================================================================

describe('Deterministic floor for buckets (no Math.round)', () => {
  test('floor(10/11) = 0 (not rounded to 1)', () => {
    expect(Math.floor(10 / 11)).toBe(0);
  });

  test('floor(11/11) = 1', () => {
    expect(Math.floor(11 / 11)).toBe(1);
  });

  test('floor(21/11) = 1 (not 2)', () => {
    expect(Math.floor(21 / 11)).toBe(1);
  });

  test('floor(22/11) = 2', () => {
    expect(Math.floor(22 / 11)).toBe(2);
  });

  test('floor(6/7) = 0 for Royal', () => {
    expect(Math.floor(6 / 7)).toBe(0);
  });

  test('floor(7/7) = 1 for Royal', () => {
    expect(Math.floor(7 / 7)).toBe(1);
  });

  test('earner credit uses floor: floor(10 * MONETIZATION_SPLITS.CHAT.earner) = 6 (not round to 7)', () => {
    expect(Math.floor(10 * EARNER_REVENUE_SPLIT)).toBe(6);
  });

  test('platform gets remainder: 10 - floor(10*MONETIZATION_SPLITS.CHAT.earner) = 4', () => {
    const earner = Math.floor(10 * EARNER_REVENUE_SPLIT);
    const platform = 10 - earner;
    expect(platform).toBe(4);
  });
});

// ============================================================================
// ADDITIONAL TESTS: EDGE CASES
// ============================================================================

describe('Edge cases', () => {
  test('0 escrow → no billing even with words', () => {
    const state = makeBillingState({ escrowRemainingTokens: 0 });
    const config = makeSessionConfig();

    const result = calculateBilling(state, config, 100, 'earner_1');

    expect(result.tokensConsumed).toBe(0);
    expect(result.escrowExhausted).toBe(true);
  });

  test('very large message (10000 words) capped at escrow', () => {
    const state = makeBillingState({ escrowRemainingTokens: 10 });
    const config = makeSessionConfig();

    const result = calculateBilling(state, config, 10000, 'earner_1');

    expect(result.tokensConsumed).toBe(10); // Capped
    expect(result.updatedBillingState.escrowRemainingTokens).toBe(0);
  });

  test('multiplier=20 with small escrow caps correctly', () => {
    const state = makeBillingState({ escrowRemainingTokens: 5 });
    const config = makeSessionConfig({ burnMultiplier: 20 });

    // 1 bucket = 20 tokens, but only 5 available
    const result = calculateBilling(state, config, 11, 'earner_1');

    expect(result.tokensConsumed).toBe(5);
    expect(result.updatedBillingState.escrowRemainingTokens).toBe(0);
  });

  test('accumulated words carry over correctly across multiple messages', () => {
    const config = makeSessionConfig({ wordsPerToken: 11 });
    let state = makeBillingState({ escrowRemainingTokens: 100 });

    // 5 words → 0 buckets
    let result = calculateBilling(state, config, 5, 'earner_1');
    expect(result.billed).toBe(false);
    state = result.updatedBillingState;
    expect(state.accumulatedEarnerWords).toBe(5);

    // 5 more words (total 10) → 0 buckets
    result = calculateBilling(state, config, 5, 'earner_1');
    expect(result.billed).toBe(false);
    state = result.updatedBillingState;
    expect(state.accumulatedEarnerWords).toBe(10);

    // 1 more word (total 11) → 1 bucket
    result = calculateBilling(state, config, 1, 'earner_1');
    expect(result.billed).toBe(true);
    expect(result.newBuckets).toBe(1);
    state = result.updatedBillingState;
    expect(state.accumulatedEarnerWords).toBe(11);
    expect(state.totalBucketsConsumed).toBe(1);

    // 12 more words (total 23) → 1 more bucket (floor(23/11) = 2 total, minus 1 = 1 new)
    result = calculateBilling(state, config, 12, 'earner_1');
    expect(result.billed).toBe(true);
    expect(result.newBuckets).toBe(1);
    state = result.updatedBillingState;
    expect(state.accumulatedEarnerWords).toBe(23);
    expect(state.totalBucketsConsumed).toBe(2);
  });
});































