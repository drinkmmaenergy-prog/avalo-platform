// functions/src/__tests__/core1-token-checkout-completion.test.ts
//
// P2-POST-STAGE3 R3 — CORE-1 TOKEN CHECKOUT COMPLETION (emulator-backed, REAL Firestore transactions).
//
// Exercises the recovered canonical Payment-Foundation runtime against the local Firestore emulator:
// completeStripeTokenPurchase / creditVerifiedProviderPurchase / debitForRefund /
// processStripeChargeRefunded / recordStripeCheckoutIntent. NO provider SDK is called; the "provider"
// is a NormalizedStripeSession that a trusted verification boundary (signed webhook / retrieve) would
// have produced. Each test uses isolated random ids. Runs only under FIRESTORE_EMULATOR_HOST.

import { getFirestore } from 'firebase-admin/firestore';
import {
  completeStripeTokenPurchase,
  NormalizedStripeSession,
  CanonicalStripeCompletionDeps,
} from '../payments/canonicalStripeCompletion';
import {
  creditVerifiedProviderPurchase,
  getBalance,
  PROVIDER_PURCHASE_TX_COLLECTION,
  PAYMENT_COMPLETION_OUTBOX_COLLECTION,
  PAYMENT_RECONCILIATION_COLLECTION,
} from '../wallet/walletService';
import { recordStripeCheckoutIntent } from '../payments/stripeCheckoutIntent';
import { processStripeChargeRefunded } from '../payments/stripeRefunds';
import Stripe from 'stripe';

const db = getFirestore();
const rid = () => Math.random().toString(36).slice(2, 12);
const LEDGER = 'ledger';

function miniSession(uid: string, sid: string, pi: string, over: Partial<NormalizedStripeSession> = {}): NormalizedStripeSession {
  return {
    checkoutSessionId: sid,
    paymentIntentId: pi,
    mode: 'payment',
    paymentStatus: 'paid',
    currency: 'usd',
    amountTotalMinor: 1299, // mini: 12.99 USD
    clientReferenceId: uid,
    metadataUid: uid,
    metadataUserId: uid,
    metadataPackId: 'mini',
    eventId: `evt_${rid()}`,
    sourceRoute: 'core1_test',
    ...over,
  };
}
function fullRefundCharge(pi: string): Stripe.Charge {
  return { id: `ch_${rid()}`, payment_intent: pi, refunded: true, amount: 1299, amount_refunded: 1299 } as unknown as Stripe.Charge;
}

describe('CORE-1 — exactly-once credit + duplicates', () => {
  test('#1/#7 valid verified completion credits exactly once (server token quantity)', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    const r = await completeStripeTokenPurchase(miniSession(uid, sid, pi));
    expect(r.status).toBe('CREDITED_NEW');
    if (r.status === 'CREDITED_NEW') expect(r.tokens).toBe(100); // server pack qty, not client
    expect(await getBalance(uid)).toBe(100);
  });

  test('#2 same provider event repeated credits zero additional tokens', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    await completeStripeTokenPurchase(miniSession(uid, sid, pi));
    const r2 = await completeStripeTokenPurchase(miniSession(uid, sid, pi, { eventId: `evt_${rid()}` }));
    expect(r2.status).toBe('ALREADY_CREDITED');
    expect(await getBalance(uid)).toBe(100);
  });

  test('#3 same provider session id reused credits zero additional tokens', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    await completeStripeTokenPurchase(miniSession(uid, sid, pi));
    const r2 = await completeStripeTokenPurchase(miniSession(uid, sid, pi));
    expect(r2.status).toBe('ALREADY_CREDITED');
    expect(await getBalance(uid)).toBe(100);
  });

  test('#4 concurrent duplicate completions result in exactly one credit', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    const results = await Promise.all([
      completeStripeTokenPurchase(miniSession(uid, sid, pi)),
      completeStripeTokenPurchase(miniSession(uid, sid, pi)),
      completeStripeTokenPurchase(miniSession(uid, sid, pi)),
    ]);
    const credited = results.filter((r) => r.status === 'CREDITED_NEW').length;
    expect(credited).toBeLessThanOrEqual(1);
    expect(await getBalance(uid)).toBe(100); // exactly one credit regardless of race
  });
});

describe('CORE-1 — authority rejections (server owns pack/price/currency/qty)', () => {
  test('#5 unknown pack rejected; no credit', async () => {
    const uid = `u_${rid()}`;
    const r = await completeStripeTokenPurchase(miniSession(uid, `cs_${rid()}`, `pi_${rid()}`, { metadataPackId: 'nope' }));
    expect(r.status).toBe('REJECTED');
    expect(await getBalance(uid)).toBe(0);
  });

  test('#6/#11 client-inflated price rejected (amount mismatch); no credit', async () => {
    const uid = `u_${rid()}`;
    const r = await completeStripeTokenPurchase(miniSession(uid, `cs_${rid()}`, `pi_${rid()}`, { amountTotalMinor: 999999 }));
    expect(r.status).toBe('REJECTED');
    if (r.status === 'REJECTED') expect(r.reason).toBe('amount_mismatch');
    expect(await getBalance(uid)).toBe(0);
  });

  test('#8 wrong currency rejected; no credit', async () => {
    const uid = `u_${rid()}`;
    const r = await completeStripeTokenPurchase(miniSession(uid, `cs_${rid()}`, `pi_${rid()}`, { currency: 'eur' }));
    expect(r.status).toBe('REJECTED');
    if (r.status === 'REJECTED') expect(r.reason).toBe('currency_mismatch');
    expect(await getBalance(uid)).toBe(0);
  });

  test('#9 missing provider proof (not paid) rejected; no credit', async () => {
    const uid = `u_${rid()}`;
    const r = await completeStripeTokenPurchase(miniSession(uid, `cs_${rid()}`, `pi_${rid()}`, { paymentStatus: 'unpaid' }));
    expect(r.status).toBe('REJECTED');
    expect(await getBalance(uid)).toBe(0);
  });

  test('#10 forged completion (invalid mode) rejected; no credit', async () => {
    const uid = `u_${rid()}`;
    const r = await completeStripeTokenPurchase(miniSession(uid, `cs_${rid()}`, `pi_${rid()}`, { mode: 'setup' }));
    expect(r.status).toBe('REJECTED');
    expect(await getBalance(uid)).toBe(0);
  });

  test('#12 user mismatch (conflicting owner candidates) rejected; no credit', async () => {
    const a = `u_${rid()}`, b = `u_${rid()}`;
    const r = await completeStripeTokenPurchase(miniSession(a, `cs_${rid()}`, `pi_${rid()}`, { metadataUid: b, metadataUserId: b, clientReferenceId: a }));
    expect(r.status).toBe('REJECTED');
    expect(await getBalance(a)).toBe(0);
    expect(await getBalance(b)).toBe(0);
  });

  test('#13 intent snapshot mismatch (amount) rejected via authority B; no credit', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    // record an immutable intent for 1299, then complete claiming a different amount
    await recordStripeCheckoutIntent({ checkoutSessionId: sid, userId: uid, packId: 'mini', tokens: 100, expectedAmountMinor: 1299, currency: 'usd', priceUSD: 12.99 });
    const r = await completeStripeTokenPurchase(miniSession(uid, sid, pi, { amountTotalMinor: 5699, metadataPackId: 'mini' }));
    expect(r.status).toBe('REJECTED');
    expect(await getBalance(uid)).toBe(0);
  });

  test('#14 provider failure (rejected) leaves wallet unchanged', async () => {
    const uid = `u_${rid()}`;
    await completeStripeTokenPurchase(miniSession(uid, `cs_${rid()}`, `pi_${rid()}`, { paymentStatus: 'unpaid' }));
    expect(await getBalance(uid)).toBe(0);
  });
});

describe('CORE-1 — intent, retry, reconciliation, outbox, ledger', () => {
  test('#15 completion after recorded intent (authority B) credits once', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    await recordStripeCheckoutIntent({ checkoutSessionId: sid, userId: uid, packId: 'mini', tokens: 100, expectedAmountMinor: 1299, currency: 'usd', priceUSD: 12.99 });
    const r = await completeStripeTokenPurchase(miniSession(uid, sid, pi));
    expect(r.status).toBe('CREDITED_NEW');
    expect(await getBalance(uid)).toBe(100);
  });

  test('#16 failure after credit but before outbox flip -> reconciliation; retry no double credit', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    const failFlip: CanonicalStripeCompletionDeps = { markOutboxCompleted: async () => { throw new Error('flip failed'); } };
    const r1 = await completeStripeTokenPurchase(miniSession(uid, sid, pi), failFlip);
    expect(r1.status).toBe('RECONCILIATION_REQUIRED');
    expect(await getBalance(uid)).toBe(100); // credit applied exactly once
    const r2 = await completeStripeTokenPurchase(miniSession(uid, sid, pi)); // normal retry
    expect(r2.status).toBe('ALREADY_CREDITED');
    expect(await getBalance(uid)).toBe(100); // no double credit
  });

  test('#17/#19 deterministic provider-purchase barrier + completion outbox records', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    await completeStripeTokenPurchase(miniSession(uid, sid, pi));
    const barrier = await db.collection(PROVIDER_PURCHASE_TX_COLLECTION).doc(`stripe:${pi}`).get();
    expect(barrier.exists).toBe(true);
    expect(barrier.data()!.status).toBe('CREDITED');
    expect(barrier.data()!.amountTokens).toBe(100);
    const outbox = await db.collection(PAYMENT_COMPLETION_OUTBOX_COLLECTION).doc(`stripe:${pi}`).get();
    expect(outbox.exists).toBe(true);
    expect(outbox.data()!.status).toBe('COMPLETED');
  });

  test('#18/#26 legacy missing-outbox -> deterministic reconciliation, no duplicate credit', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    // credit via the primitive WITHOUT a completion payload -> no outbox (legacy pre-outbox credit)
    const c = await creditVerifiedProviderPurchase({ provider: 'stripe', providerSessionId: sid, providerTransactionId: pi, userId: uid, amountTokens: 100 });
    expect(c.status).toBe('CREDITED_NEW');
    expect(await getBalance(uid)).toBe(100);
    // canonical completion now sees a credited barrier but no outbox -> reconciliation, no 2nd credit
    const r = await completeStripeTokenPurchase(miniSession(uid, sid, pi));
    expect(r.status).toBe('RECONCILIATION_REQUIRED');
    if (r.status === 'RECONCILIATION_REQUIRED') expect(r.reason).toBe('legacy_missing_completion_outbox');
    expect(await getBalance(uid)).toBe(100);
    const recon = await db.collection(PAYMENT_RECONCILIATION_COLLECTION).doc(`stripe:${pi}`).get();
    expect(recon.exists).toBe(true);
    expect(recon.data()!.status).toBe('OPEN');
  });

  test('#20 wallet balance and ledger stay aligned', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    const r = await completeStripeTokenPurchase(miniSession(uid, sid, pi));
    expect(r.status).toBe('CREDITED_NEW');
    const bal = await getBalance(uid);
    const ledgerTxId = r.status === 'CREDITED_NEW' ? r.ledgerTxId : '';
    const led = await db.collection(LEDGER).doc(ledgerTxId).get();
    expect(led.exists).toBe(true);
    expect(led.data()!.type).toBe('PURCHASE');
    expect(led.data()!.amountTokens).toBe(100);
    expect(bal).toBe(100); // ledger amount == wallet delta
  });
});

describe('CORE-1 — refund / reversal linkage', () => {
  async function creditMini(uid: string, sid: string, pi: string) {
    const r = await completeStripeTokenPurchase(miniSession(uid, sid, pi));
    expect(r.status).toBe('CREDITED_NEW');
  }

  test('#22 refund without canonical prior credit is rejected (no debit)', async () => {
    const uid = `u_${rid()}`, pi = `pi_${rid()}`;
    // seed a balance not linked to any barrier
    await db.collection('wallets').doc(uid).set({ userId: uid, balance: 100, pending: 0, earned: 0, spent: 0, frozen: 0, reservedTokens: 0 }, { merge: true });
    const outcome = await processStripeChargeRefunded(fullRefundCharge(pi), `evt_${rid()}`, 'core1_test');
    expect(outcome).toBe('ACK');
    expect(await getBalance(uid)).toBe(100); // unmatched purchase -> reconcile, never debit
    const recon = await db.collection(PAYMENT_RECONCILIATION_COLLECTION).where('providerTransactionId', '==', pi).get();
    expect(recon.empty).toBe(false);
  });

  test('#23 valid refund debits exactly once', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    await creditMini(uid, sid, pi);
    expect(await getBalance(uid)).toBe(100);
    const charge = fullRefundCharge(pi);
    const outcome = await processStripeChargeRefunded(charge, `evt_${rid()}`, 'core1_test');
    expect(outcome).toBe('ACK');
    expect(await getBalance(uid)).toBe(0);
  });

  test('#24 duplicate refund performs zero additional debit', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    await creditMini(uid, sid, pi);
    const charge = fullRefundCharge(pi);
    await processStripeChargeRefunded(charge, `evt_${rid()}`, 'core1_test');
    expect(await getBalance(uid)).toBe(0);
    // same charge id again -> idempotent no-op
    await processStripeChargeRefunded(charge, `evt_${rid()}`, 'core1_test');
    expect(await getBalance(uid)).toBe(0);
  });

  test('#25 reversal cannot exceed prior canonical value (soft-debit, never negative)', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    await creditMini(uid, sid, pi);
    // simulate the user having spent 60 tokens (balance now 40)
    await db.collection('wallets').doc(uid).update({ balance: 40 });
    const outcome = await processStripeChargeRefunded(fullRefundCharge(pi), `evt_${rid()}`, 'core1_test');
    expect(outcome).toBe('ACK');
    const bal = await getBalance(uid);
    expect(bal).toBe(0); // min(100, 40) debited; never negative
    expect(bal).toBeGreaterThanOrEqual(0);
  });
});
