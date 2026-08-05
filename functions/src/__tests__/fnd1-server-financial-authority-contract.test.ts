// functions/src/__tests__/fnd1-server-financial-authority-contract.test.ts
//
// P2-POST-STAGE3 R3 — FND-1 SERVER FINANCIAL-AUTHORITY CONTRACT (behavioral, pure layer).
//
// These tests execute the RECOVERED payment-foundation runtime (canonicalStripeCompletion authority
// functions, walletService provider-purchase validation, moneyLog hygiene, financialOperationContract
// policy) with REAL calls — no source-string assertions, no transpileModule, no readFileSync. They
// prove the server, never the client, owns pack / price / currency / token-quantity authority and that
// runtime money logs cannot leak identifiers. Exactly-once CREDIT behavior (Firestore-transactional)
// is covered by the emulator-backed suites; this file covers the pure authority + validation surface
// that ts-jest compiles from the exact recovered import graph.

import {
  evaluateConfigAuthority,
  evaluateSnapshotAuthority,
  buildCompletionAnomalyPayload,
  CANONICAL_CURRENCY,
  type NormalizedStripeSession,
  type CanonicalAuditArgs,
} from '../payments/canonicalStripeCompletion';
import {
  validateProviderPurchaseInput,
  buildAnomalyLogPayload,
  MAX_PROVIDER_PURCHASE_TOKENS,
} from '../wallet/walletService';
import { sanitizeMoneyLogFields } from '../lib/moneyLog';
import {
  OPERATION_POLICY_REGISTRY,
  FND1_CONTRACT_VERSION,
} from '../payments/financialOperationContract';
import { getCanonicalTokenPackById } from '../pack277-token-packs';
import type { CheckoutSnapshot } from '../payments/stripeCheckoutIntent';

const MINI = getCanonicalTokenPackById('mini')!; // tokens:100, priceUSD:12.99, active:true
const MINI_MINOR = Math.round(MINI.priceUSD * 100);

// Test-only helpers that avoid discriminated-union narrowing noise while still asserting real values.
function expectReject(r: { ok: boolean }, reason: string): void {
  expect(r.ok).toBe(false);
  expect((r as { reason?: string }).reason).toBe(reason);
}

describe('FND-1 — server owns pack authority (config authority A)', () => {
  test('#3 unknown pack is rejected', () => {
    expectReject(evaluateConfigAuthority(null, 'does-not-exist', { currency: 'usd', amountTotalMinor: 1299 }), 'unknown_pack');
  });

  test('inactive pack is rejected', () => {
    expectReject(evaluateConfigAuthority({ ...MINI, active: false }, 'mini', { currency: 'usd', amountTotalMinor: MINI_MINOR }), 'inactive_pack');
  });

  test('#4/#5 server tokens+price are authoritative regardless of any client-shaped amount', () => {
    // A correct paid amount yields the SERVER token quantity — never a client-provided number.
    const ok = evaluateConfigAuthority(MINI, 'mini', { currency: 'usd', amountTotalMinor: MINI_MINOR });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.tokens).toBe(MINI.tokens); // server-owned quantity
      expect(ok.amountTotalMinor).toBe(MINI_MINOR); // server-owned price
      expect(ok.currency).toBe(CANONICAL_CURRENCY);
    }
  });

  test('#4 a client-inflated paid amount is rejected (amount_mismatch), never credited at client value', () => {
    expectReject(evaluateConfigAuthority(MINI, 'mini', { currency: 'usd', amountTotalMinor: 1 }), 'amount_mismatch');
  });

  test('#6 wrong currency is rejected', () => {
    expectReject(evaluateConfigAuthority(MINI, 'mini', { currency: 'eur', amountTotalMinor: MINI_MINOR }), 'currency_mismatch');
  });

  test('#27 zero-price / negative-price session cannot satisfy a real pack (amount_mismatch)', () => {
    expect(evaluateConfigAuthority(MINI, 'mini', { currency: 'usd', amountTotalMinor: 0 }).ok).toBe(false);
    expect(evaluateConfigAuthority(MINI, 'mini', { currency: 'usd', amountTotalMinor: -MINI_MINOR }).ok).toBe(false);
  });
});

describe('FND-1 — immutable checkout-intent snapshot authority (authority B)', () => {
  const snap: CheckoutSnapshot = {
    source: 'checkout_intent',
    userId: 'user-1',
    packId: 'mini',
    tokens: 100,
    expectedAmountMinor: MINI_MINOR,
    currency: 'usd',
  };
  const base: Pick<NormalizedStripeSession, 'currency' | 'amountTotalMinor' | 'metadataPackId'> = {
    currency: 'usd',
    amountTotalMinor: MINI_MINOR,
    metadataPackId: 'mini',
  };

  test('owner mismatch fails closed', () => {
    expectReject(evaluateSnapshotAuthority(snap, base, 'other-user'), 'owner_snapshot_mismatch');
  });

  test('pack mismatch fails closed', () => {
    expectReject(evaluateSnapshotAuthority(snap, { ...base, metadataPackId: 'royal' }, 'user-1'), 'pack_snapshot_mismatch');
  });

  test('amount mismatch fails closed; token quantity is taken ONLY from the snapshot', () => {
    const r = evaluateSnapshotAuthority(snap, { ...base, amountTotalMinor: MINI_MINOR + 1 }, 'user-1');
    expect(r.ok).toBe(false);
    const ok = evaluateSnapshotAuthority(snap, base, 'user-1');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.tokens).toBe(snap.tokens);
  });
});

describe('FND-1 — provider-purchase input validation (forged/missing proof rejected)', () => {
  const good = {
    provider: 'stripe',
    providerSessionId: 'cs_test_1',
    providerTransactionId: 'pi_test_1',
    userId: 'user-1',
    amountTokens: 100,
  };
  test('valid trusted input passes', () => {
    expect(validateProviderPurchaseInput(good).ok).toBe(true);
  });
  test('#8 forged provider (unknown provider) rejected', () => {
    expectReject(validateProviderPurchaseInput({ ...good, provider: 'paypal' }), 'invalid_provider');
  });
  test('#7 missing provider ids rejected', () => {
    expect(validateProviderPurchaseInput({ ...good, providerSessionId: '' }).ok).toBe(false);
    expect(validateProviderPurchaseInput({ ...good, providerTransactionId: '' }).ok).toBe(false);
  });
  test('#27 non-positive / non-integer / oversize token amounts rejected', () => {
    expect(validateProviderPurchaseInput({ ...good, amountTokens: 0 }).ok).toBe(false);
    expect(validateProviderPurchaseInput({ ...good, amountTokens: -100 }).ok).toBe(false);
    expect(validateProviderPurchaseInput({ ...good, amountTokens: 1.5 }).ok).toBe(false);
    expect(validateProviderPurchaseInput({ ...good, amountTokens: MAX_PROVIDER_PURCHASE_TOKENS + 1 }).ok).toBe(false);
  });
});

describe('FND-1 — money runtime-log hygiene (no identifier leakage)', () => {
  test('non-whitelisted keys are dropped; numbers (amounts/balances) are dropped', () => {
    const out = sanitizeMoneyLogFields({ event: 'x', userId: 'u1', amount: 500, balance: 12 });
    expect(out.event).toBe('x');
    expect('userId' in out).toBe(false);
    expect('amount' in out).toBe(false);
    expect('balance' in out).toBe(false);
  });
  test('identifier-shaped values are redacted even under a whitelisted key', () => {
    const out = sanitizeMoneyLogFields({ reason: 'cs_live_secret', route: 'ok-value' });
    expect(out.reason).toBe('[REDACTED]');
    expect(out.route).toBe('ok-value');
  });
  test('completion anomaly payload carries only fixed classifications (no UID/amount)', () => {
    const a: CanonicalAuditArgs = {
      checkoutSessionId: 'cs_1', paymentIntentId: 'pi_1', userId: 'secret-uid', packId: 'mini',
      tokens: 100, amountTotalMinor: MINI_MINOR, currency: 'usd', ledgerTxId: 'tx_1', sourceRoute: 'unit',
    };
    const p = buildCompletionAnomalyPayload('stripe_audit_persistence_failed', a, 'stripe:pi_1');
    const serialized = JSON.stringify(p);
    expect(serialized).not.toContain('secret-uid');
    expect(serialized).not.toContain('pi_1');
    expect(serialized).not.toContain(String(MINI_MINOR));
    expect(p.event).toBe('stripe_audit_persistence_failed');
  });
  test('walletService anomaly payload never leaks user id or amounts', () => {
    const p = buildAnomalyLogPayload({
      event: 'provider_purchase_conflict',
      provider: 'stripe',
      sessionBarrierId: 'stripe:cs_1',
      txnBarrierId: 'stripe:pi_1',
      providerSessionId: 'cs_1',
      providerTransactionId: 'pi_1',
      stored: null,
      conflictingFields: ['amountTokens'],
    });
    const serialized = JSON.stringify(p);
    expect(serialized).not.toContain('cs_1');
    expect(serialized).not.toContain('pi_1');
    expect(p.event).toBe('provider_purchase_conflict');
  });
});

describe('FND-1 — canonical operation policy (single ledger, credit-only, delegates to primitive)', () => {
  test('TOKEN_CHECKOUT_COMPLETION credits (never debits) and delegates to creditVerifiedProviderPurchase', () => {
    const pol = OPERATION_POLICY_REGISTRY.TOKEN_CHECKOUT_COMPLETION;
    expect(pol.effects.walletCredit).toBe(true);
    expect(pol.effects.walletDebit).toBe(false);
    expect(pol.effects.ledgerWrite).toBe(true);
    expect(pol.delegatesTo).toBe('creditVerifiedProviderPurchase');
    expect(FND1_CONTRACT_VERSION).toBe(1);
  });
});
