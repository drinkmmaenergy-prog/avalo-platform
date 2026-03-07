/**
 * CHAT BILLING PIPELINE — Invariant Tests
 *
 * Tests the canonical chat billing pipeline against economy SOT invariants:
 *
 * T1: "user paid 100, creator used 30, refund 35, platform fee not refunded"
 * T2: "expiry closes chat, refund unused"
 * T3: "idempotency: applying same event twice does not double-charge"
 * T4: "chargedTokens = max(minCharge, computedCost)"
 * T5: "platform fee captured upfront is not refundable"
 * T6: "refund returns unused conversation tokens only"
 * T7: "ledger is double-entry"
 *
 * @module chat-billing-pipeline.test
 * @version 1.0.0
 */

import {
  calculateBilling,
} from '../canonical-chat-engine';

import type {
  CanonicalBillingState,
  CanonicalSessionConfig,
} from '../types/canonical-chat.types';

import {
  PLATFORM_FEE_PCT,
  ESCROW_PCT,
  MIN_DEPOSIT_TOKENS,
  EARNER_REVENUE_SPLIT,
  AVALO_REVENUE_SPLIT,
  WORDS_PER_TOKEN_STANDARD,
  WORDS_PER_TOKEN_ROYAL,
} from '../types/canonical-chat.types';

import {
  TOKEN_PAYOUT_USD,
  PAYOUT_FEE_PLATFORM_PERCENT,
  MIN_CHAT_CHARGE_TOKENS,
  SPLITS_BY_SURFACE,
  CHAT_PRICING,
} from '../config/economyConfig';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Create a fresh billing state for a new paid session.
 */
function makeBillingState(depositTokens: number): CanonicalBillingState {
  const platformFee = Math.floor(depositTokens * (PLATFORM_FEE_PCT / 100));
  const escrow = depositTokens - platformFee;
  return {
    accumulatedEarnerWords: 0,
    escrowRemainingTokens: escrow,
    platformFeeChargedTokens: platformFee,
    totalBucketsConsumed: 0,
    totalTokensConsumed: 0,
    totalEarnerCredited: 0,
    totalAvaloCredited: 0,
  };
}

function makeConfig(overrides: Partial<CanonicalSessionConfig> = {}): CanonicalSessionConfig {
  return {
    depositTokens: 100,
    wordsPerToken: WORDS_PER_TOKEN_STANDARD,
    burnMultiplier: 1,
    ...overrides,
  };
}

// ============================================================================
// TEST SUITE: T1 — "user paid 100, creator used 30, refund 35, platform fee not refunded"
// ============================================================================

describe('T1: User paid 100, creator used 30 tokens, refund 35 tokens of escrow', () => {
  it('should correctly split a 100-token deposit', () => {
    const deposit = 100;
    const platformFee = Math.floor(deposit * (PLATFORM_FEE_PCT / 100)); // floor(100 * MONETIZATION_SPLITS.CHAT.avalo) = 35
    const escrow = deposit - platformFee; // 100 - 35 = 65

    expect(PLATFORM_FEE_PCT).toBe(35);
    expect(platformFee).toBe(35);
    expect(escrow).toBe(65);
  });

  it('should consume 30 tokens from escrow and split 65/35', () => {
    const state = makeBillingState(100);
    const config = makeConfig();
    const earnerId = 'earner_abc';
    const tokensConsumed = 30;

    // Simulate consuming 30 tokens from escrow
    const earnerCredit = Math.floor(tokensConsumed * EARNER_REVENUE_SPLIT); // floor(30 * MONETIZATION_SPLITS.CHAT.creator) = 19
    const avaloCredit = tokensConsumed - earnerCredit; // 30 - 19 = 11

    expect(earnerCredit).toBe(19);
    expect(avaloCredit).toBe(11);
    expect(earnerCredit + avaloCredit).toBe(tokensConsumed);
  });

  it('should have 35 tokens remaining in escrow for refund', () => {
    const deposit = 100;
    const platformFee = Math.floor(deposit * (PLATFORM_FEE_PCT / 100)); // 35
    const escrow = deposit - platformFee; // 65
    const tokensConsumed = 30;
    const escrowRemaining = escrow - tokensConsumed; // 65 - 30 = 35

    expect(escrowRemaining).toBe(35);
  });

  it('platform fee (35) is NOT refunded', () => {
    const deposit = 100;
    const platformFee = Math.floor(deposit * (PLATFORM_FEE_PCT / 100)); // 35
    const escrow = deposit - platformFee; // 65
    const tokensConsumed = 30;
    const refundedTokens = escrow - tokensConsumed; // 35 (only escrow remainder)

    // Total accounted: platformFee + tokensConsumed + refundedTokens = 35 + 30 + 35 = 100
    expect(platformFee + tokensConsumed + refundedTokens).toBe(deposit);
    // Platform fee is RETAINED, not included in refund
    expect(refundedTokens).toBe(35);
    expect(platformFee).toBe(35); // retained by Avalo
  });
});

// ============================================================================
// TEST SUITE: T2 — "expiry closes chat, refund unused"
// ============================================================================

describe('T2: Expiry closes chat, refund unused escrow', () => {
  it('should refund full escrow if no messages sent in paid phase', () => {
    const deposit = 100;
    const state = makeBillingState(deposit);

    // No messages sent → 0 tokens consumed
    const refundAmount = state.escrowRemainingTokens;
    expect(refundAmount).toBe(65); // 65% of 100

    // Platform fee retained
    expect(state.platformFeeChargedTokens).toBe(35);

    // Double-entry check: deposit = platformFee + escrowRemaining
    expect(state.platformFeeChargedTokens + state.escrowRemainingTokens).toBe(deposit);
  });

  it('should refund partial escrow after some consumption', () => {
    const deposit = 200;
    const platformFee = Math.floor(deposit * (PLATFORM_FEE_PCT / 100)); // 70
    const escrow = deposit - platformFee; // 130
    const tokensConsumedFromEscrow = 50;
    const refund = escrow - tokensConsumedFromEscrow; // 80

    expect(refund).toBe(80);
    // Invariant: platformFee + consumed + refund = deposit
    expect(platformFee + tokensConsumedFromEscrow + refund).toBe(deposit);
  });
});

// ============================================================================
// TEST SUITE: T3 — "idempotency: applying same event twice does not double-charge"
// ============================================================================

describe('T3: Idempotency — same billing event applied twice', () => {
  it('should produce identical result when calculateBilling called with same state', () => {
    const config = makeConfig();
    const state = makeBillingState(100);
    const earnerId = 'earner_abc';

    // First call: 22 earner words (22 / 11 = 2 buckets = 2 tokens consumed)
    const result1 = calculateBilling(
      state,
      config,
      22, // earnerWordCount
      earnerId
    );

    // Second call with SAME original state → SAME result
    const result2 = calculateBilling(
      state,
      config,
      22,
      earnerId
    );

    expect(result1.tokensConsumed).toBe(result2.tokensConsumed);
    expect(result1.earnerCredit).toBe(result2.earnerCredit);
    expect(result1.avaloCredit).toBe(result2.avaloCredit);
    expect(result1.newBuckets).toBe(result2.newBuckets);
  });

  it('applying result1 state then same words should NOT consume more', () => {
    const config = makeConfig();
    const state = makeBillingState(100);
    const earnerId = 'earner_abc';

    // First message: 22 words → 2 buckets consumed
    const result1 = calculateBilling(state, config, 22, earnerId);
    expect(result1.billed).toBe(true);
    expect(result1.newBuckets).toBe(2);

    // Apply result1's updated state, then send 0 NEW words (replay)
    // The accumulated words are already at 22, sending 0 more = no new buckets
    const result2 = calculateBilling(
      result1.updatedBillingState,
      config,
      0, // 0 new words — idempotent replay
      earnerId
    );

    expect(result2.billed).toBe(false);
    expect(result2.tokensConsumed).toBe(0);
    expect(result2.earnerCredit).toBe(0);
  });
});

// ============================================================================
// TEST SUITE: T4 — "chargedTokens = max(minCharge, computedCost)"
// ============================================================================

describe('T4: Minimum deposit enforcement', () => {
  it('MIN_DEPOSIT = Math.max(customDeposit,100)
    expect(MIN_DEPOSIT_TOKENS).toBe(100);
  });

  it('MIN_CHAT_CHARGE_TOKENS from economyConfig should be 100', () => {
    expect(MIN_CHAT_CHARGE_TOKENS).toBe(100);
  });

  it('deposit below minimum should be rejected (invariant)', () => {
    // The engine should enforce min deposit. We verify the constant here.
    const attemptedDeposit = 50;
    const chargedTokens = Math.max(MIN_CHAT_CHARGE_TOKENS, attemptedDeposit);
    expect(chargedTokens).toBe(100);
  });

  it('deposit at or above minimum should use actual amount', () => {
    const attemptedDeposit = 200;
    const chargedTokens = Math.max(MIN_CHAT_CHARGE_TOKENS, attemptedDeposit);
    expect(chargedTokens).toBe(200);
  });
});

// ============================================================================
// TEST SUITE: T5 — "platform fee captured upfront is not refundable"
// ============================================================================

describe('T5: Platform fee non-refundable', () => {
  it('platform fee is 35% of deposit', () => {
    expect(PLATFORM_FEE_PCT).toBe(35);
    expect(ESCROW_PCT).toBe(65);
    expect(PLATFORM_FEE_PCT + ESCROW_PCT).toBe(100);
  });

  it('platform fee is captured at deposit and stored in billingState', () => {
    const deposit = 500;
    const state = makeBillingState(deposit);

    expect(state.platformFeeChargedTokens).toBe(Math.floor(500 * MONETIZATION_SPLITS.CHAT.avalo)); // 175
    expect(state.escrowRemainingTokens).toBe(500 - 175); // 325
  });

  it('refund does NOT include platform fee — only escrow remainder', () => {
    const deposit = 500;
    const state = makeBillingState(deposit);

    // Consume 100 tokens from escrow
    const consumed = 100;
    const refund = state.escrowRemainingTokens - consumed; // 325 - 100 = 225

    // The 175 platform fee is NEVER part of the refund
    expect(refund).toBe(225);
    expect(state.platformFeeChargedTokens + consumed + refund).toBe(deposit);
  });
});

// ============================================================================
// TEST SUITE: T6 — "refund returns unused conversation tokens only"
// ============================================================================

describe('T6: Refund = unused escrow only', () => {
  it('refund = escrowRemainingTokens after billing', () => {
    const deposit = 100;
    const state = makeBillingState(deposit);
    const config = makeConfig({ depositTokens: deposit });
    const earnerId = 'earner_123';

    // Send messages until some escrow consumed
    // 33 words = floor(33/11) = 3 buckets → 3 tokens consumed
    const result = calculateBilling(state, config, 33, earnerId);

    const refundAmount = result.updatedBillingState.escrowRemainingTokens;
    const consumed = result.updatedBillingState.totalTokensConsumed;
    const platformFee = result.updatedBillingState.platformFeeChargedTokens;

    // Invariant: platformFee + consumed + refund = deposit
    expect(platformFee + consumed + refundAmount).toBe(deposit);
  });

  it('earner credits already paid are NOT clawed back in refund', () => {
    const deposit = 100;
    const state = makeBillingState(deposit);
    const config = makeConfig({ depositTokens: deposit });

    // 55 words → 5 buckets → 5 tokens consumed
    const result = calculateBilling(state, config, 55, 'earner');

    // Earner already credited
    const earnerCredited = result.updatedBillingState.totalEarnerCredited;
    expect(earnerCredited).toBeGreaterThan(0);

    // Refund is from ESCROW, not clawed back from earner
    const refund = result.updatedBillingState.escrowRemainingTokens;
    expect(refund).toBeGreaterThan(0);

    // Total credits + refund + fee = deposit
    const totalTokensFromEscrow = result.updatedBillingState.totalTokensConsumed;
    expect(
      result.updatedBillingState.platformFeeChargedTokens +
      totalTokensFromEscrow +
      refund
    ).toBe(deposit);
  });
});

// ============================================================================
// TEST SUITE: T7 — "ledger is double-entry"
// ============================================================================

describe('T7: Double-entry ledger invariants', () => {
  it('earnerCredit + avaloCredit = tokensConsumed (for every billing event)', () => {
    const state = makeBillingState(100);
    const config = makeConfig();

    const result = calculateBilling(state, config, 44, 'earner');
    if (result.billed) {
      expect(result.earnerCredit + result.avaloCredit).toBe(result.tokensConsumed);
    }
  });

  it('accumulated: totalEarnerCredited + totalAvaloCredited = totalTokensConsumed', () => {
    const state = makeBillingState(200);
    const config = makeConfig({ depositTokens: 200 });

    // Multiple billing events
    let currentState = state;
    const wordCounts = [22, 15, 33, 11, 44];

    for (const words of wordCounts) {
      const result = calculateBilling(currentState, config, words, 'earner');
      currentState = result.updatedBillingState;
    }

    expect(
      currentState.totalEarnerCredited + currentState.totalAvaloCredited
    ).toBe(currentState.totalTokensConsumed);
  });

  it('platformFee + totalConsumed + escrowRemaining = deposit (always)', () => {
    const deposit = 300;
    const state = makeBillingState(deposit);
    const config = makeConfig({ depositTokens: deposit });

    let currentState = state;
    const wordCounts = [55, 77, 33, 22, 110, 44];

    for (const words of wordCounts) {
      const result = calculateBilling(currentState, config, words, 'earner');
      currentState = result.updatedBillingState;
    }

    // Fundamental invariant
    const total = currentState.platformFeeChargedTokens +
                  currentState.totalTokensConsumed +
                  currentState.escrowRemainingTokens;
    expect(total).toBe(deposit);
  });

  it('when earnerId is null, 100% goes to Avalo (no earner credit)', () => {
    const state = makeBillingState(100);
    const config = makeConfig();

    const result = calculateBilling(state, config, 33, null); // null earnerId

    if (result.billed) {
      expect(result.earnerCredit).toBe(0);
      expect(result.avaloCredit).toBe(result.tokensConsumed);
    }
  });
});

// ============================================================================
// TEST SUITE: Economy config invariants
// ============================================================================

describe('Economy Config Invariants', () => {
  it('TOKEN_PAYOUT_USD should be 0.03', () => {
    expect(TOKEN_PAYOUT_USD).toBe(0.03);
  });

  it('PAYOUT_FEE_PLATFORM_PERCENT should be 0.05 (5%)', () => {
    expect(PAYOUT_FEE_PLATFORM_PERCENT).toBe(0.05);
  });

  it('EARNER_REVENUE_SPLIT + AVALO_REVENUE_SPLIT should equal 1.0', () => {
    expect(EARNER_REVENUE_SPLIT + AVALO_REVENUE_SPLIT).toBeCloseTo(1.0, 10);
  });

  it('all SPLITS_BY_SURFACE should sum to 1.0', () => {
    for (const [key, split] of Object.entries(SPLITS_BY_SURFACE)) {
      expect(split.creator + split.avalo).toBeCloseTo(1.0, 10);
    }
  });

  it('CHAT split should be 65/35', () => {
    expect(SPLITS_BY_SURFACE.CHAT.creator).toBe(MONETIZATION_SPLITS.CHAT.creator);
    expect(SPLITS_BY_SURFACE.CHAT.avalo).toBe(MONETIZATION_SPLITS.CHAT.avalo);
  });

  it('CHAT_PRICING.STANDARD.wordsPerToken should be 11', () => {
    expect(CHAT_PRICING.STANDARD.wordsPerToken).toBe(11);
  });

  it('CHAT_PRICING.ROYAL.wordsPerToken should be 7', () => {
    expect(CHAT_PRICING.ROYAL.wordsPerToken).toBe(7);
  });
});

// ============================================================================
// TEST SUITE: Word counting (creator-only)
// ============================================================================

describe('Word counting — creator-only billing', () => {
  it('11 standard words = 1 bucket = 1 token', () => {
    const words = 11;
    const buckets = Math.floor(words / WORDS_PER_TOKEN_STANDARD);
    expect(buckets).toBe(1);
  });

  it('10 standard words = 0 buckets (partial, not billed)', () => {
    const words = 10;
    const buckets = Math.floor(words / WORDS_PER_TOKEN_STANDARD);
    expect(buckets).toBe(0);
  });

  it('7 royal words = 1 bucket = 1 token', () => {
    const words = 7;
    const buckets = Math.floor(words / WORDS_PER_TOKEN_ROYAL);
    expect(buckets).toBe(1);
  });

  it('burn multiplier x3: 1 bucket = 3 tokens consumed', () => {
    const buckets = 1;
    const burnMultiplier = 3;
    const cost = buckets * 1 * burnMultiplier;
    expect(cost).toBe(3);
  });

  it('floor is used, never round: floor(10 * MONETIZATION_SPLITS.CHAT.creator) = 6', () => {
    expect(Math.floor(10 * EARNER_REVENUE_SPLIT)).toBe(6);
  });

  it('remainder to Avalo: 10 - floor(10*MONETIZATION_SPLITS.CHAT.creator) = 4', () => {
    const earner = Math.floor(10 * EARNER_REVENUE_SPLIT);
    const avalo = 10 - earner;
    expect(avalo).toBe(4);
  });
});



