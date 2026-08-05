// functions/src/payments/stripeCheckoutIntent.ts
//
// Immutable, server-only Stripe checkout-intent snapshot (Phase C1, Defect 3).
//
// A paid HISTORICAL Checkout Session must be completed using the token quantity / price that were in
// effect WHEN THE SESSION WAS CREATED — not whatever the mutable pack config happens to say later.
// This records that immutable snapshot at session-creation time so canonical completion can validate a
// paid session against it (authority B) instead of current config (authority A).
//
// Preparation dependency: the writer `recordStripeCheckoutIntent` is intended to be called by a
// server-side Checkout Session creator during the pack288 checkout migration (Phase D). It is NOT wired
// into any live route in this phase. Canonical completion already READS the snapshot when present.
//
// Server-only collection (Phase F rules). Stores no receipts/secrets/customer/payment-method data.

import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

export const STRIPE_CHECKOUT_INTENTS_COLLECTION = 'stripeCheckoutIntents';

/** Immutable per-session snapshot of what the server authorized at session-creation time. */
export interface StripeCheckoutIntent {
  checkoutSessionId: string;
  userId: string;
  packId: string;
  tokens: number;
  expectedAmountMinor: number; // gross, minor units (tax inclusive), integer
  currency: string;            // lower-case
  priceUSD: number;            // price snapshot at creation
  createdAt: FirebaseFirestore.FieldValue;
}

/** Normalized snapshot returned to canonical completion (source-tagged). */
export interface CheckoutSnapshot {
  source: 'checkout_intent';
  userId: string;
  packId: string;
  tokens: number;
  expectedAmountMinor: number;
  currency: string;
}

export type RecordCheckoutIntentResult =
  | { status: 'CREATED' | 'EXISTS' | 'CONFLICT' }
  // S5: writer-side canonical-USD invariant — a token-purchase checkout-intent snapshot may only
  // ever be written with currency 'usd'. Callers treat this exactly like CONFLICT: fail closed,
  // never expose the checkout URL.
  | { status: 'REJECTED_NON_USD' };

/**
 * Create the immutable checkout-intent snapshot. Idempotent (create-if-absent). If a snapshot already
 * exists with DIFFERENT immutable money fields, returns CONFLICT and never overwrites.
 */
export async function recordStripeCheckoutIntent(input: {
  checkoutSessionId: string;
  userId: string;
  packId: string;
  tokens: number;
  expectedAmountMinor: number;
  currency: string;
  priceUSD: number;
}): Promise<RecordCheckoutIntentResult> {
  const ref = db.collection(STRIPE_CHECKOUT_INTENTS_COLLECTION).doc(input.checkoutSessionId);
  const currency = input.currency.toLowerCase();
  // S5 CANONICAL-USD INVARIANT (writer side): no token-purchase snapshot may ever exist with a
  // non-USD currency. All active creators hardcode 'usd'; this guard makes that a structural
  // property of the snapshot store rather than a per-caller convention. Fail closed BEFORE any
  // write — combined with the completion-side global USD gate, a non-USD purchase can neither
  // be snapshotted nor credited.
  if (currency !== 'usd') {
    return { status: 'REJECTED_NON_USD' };
  }
  return db.runTransaction(async (t): Promise<RecordCheckoutIntentResult> => {
    const snap = await t.get(ref);
    if (snap.exists) {
      const e = snap.data() as StripeCheckoutIntent;
      const same =
        e.userId === input.userId &&
        e.packId === input.packId &&
        e.tokens === input.tokens &&
        e.expectedAmountMinor === input.expectedAmountMinor &&
        (e.currency || '').toLowerCase() === currency;
      return same ? { status: 'EXISTS' } : { status: 'CONFLICT' };
    }
    const intent: StripeCheckoutIntent = {
      checkoutSessionId: input.checkoutSessionId,
      userId: input.userId,
      packId: input.packId,
      tokens: input.tokens,
      expectedAmountMinor: input.expectedAmountMinor,
      currency,
      priceUSD: input.priceUSD,
      createdAt: FieldValue.serverTimestamp(),
    };
    t.create(ref, intent);
    return { status: 'CREATED' };
  });
}

/**
 * Load the immutable checkout snapshot for a session, or null if none exists.
 * (The existing `paymentSessions` collection is a candidate secondary source; it is reconciled during
 * the paymentsComplete V2 migration and is intentionally NOT treated as authority here to avoid its
 * mutable `status` field and ambiguous amount units.)
 */
export async function loadCheckoutSnapshot(checkoutSessionId: string): Promise<CheckoutSnapshot | null> {
  const snap = await db.collection(STRIPE_CHECKOUT_INTENTS_COLLECTION).doc(checkoutSessionId).get();
  if (!snap.exists) return null;
  const e = snap.data() as StripeCheckoutIntent;
  if (
    typeof e.userId !== 'string' ||
    typeof e.packId !== 'string' ||
    typeof e.tokens !== 'number' ||
    typeof e.expectedAmountMinor !== 'number' ||
    typeof e.currency !== 'string'
  ) {
    return null;
  }
  return {
    source: 'checkout_intent',
    userId: e.userId,
    packId: e.packId,
    tokens: e.tokens,
    expectedAmountMinor: e.expectedAmountMinor,
    currency: e.currency.toLowerCase(),
  };
}
