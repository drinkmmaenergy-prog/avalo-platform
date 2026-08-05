// functions/src/__tests__/p0-04-legacy-stripe-containment.test.ts
//
// P2-POST-STAGE3 R3 — P0-04 LEGACY STRIPE CONTAINMENT (flag-OFF + export/webhook containment).
//
// The Stripe SDK is MOCKED so checkout.sessions.create / retrieve / webhooks.constructEvent become
// call counters — NO real provider call is ever made. Canonical business logic + Firestore behavior
// stay REAL (emulator). v2 callables are invoked via `.run(...)`; the webhook onRequest handler is
// invoked directly with mock req/res. Proves: exactly one runtime-reachable checkout creator, gated OFF
// makes zero provider-session calls and zero credit, legacy creators/credit/fulfill are hard-disabled,
// and signed webhook completion routes only through canonical completion.

const mockCreateSession = jest.fn(async () => ({ id: 'cs_mock', url: 'https://mock/checkout', payment_intent: 'pi_mock' }));
const mockRetrieve = jest.fn(async () => ({ id: 'cs_mock', payment_status: 'paid' }));
const mockConstructEvent = jest.fn();
jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCreateSession, retrieve: mockRetrieve } },
    webhooks: { constructEvent: mockConstructEvent },
  })),
);

import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import {
  tokens_createCheckoutSession,
  tokens_fulfillCheckout,
  tokens_stripeWebhook,
  isTokenCheckoutEnabled,
  assertTokenCheckoutEnabled,
  CheckoutDisabledError,
} from '../pack288-web-stripe';
import { createStripeCheckoutSession, stripeWebhookV2 } from '../paymentsComplete';
import { creditTokensCallable, stripeWebhook } from '../payments';
import { getBalance } from '../wallet/walletService';

const db = getFirestore();
const rid = () => Math.random().toString(36).slice(2, 12);

function callable(fn: any) {
  return (req: any) => fn.run({ rawRequest: { headers: {} } as any, acceptsStreaming: false, ...req });
}
const runCreate = callable(tokens_createCheckoutSession);
const runLegacyCreate = callable(createStripeCheckoutSession);
const runCreditCallable = callable(creditTokensCallable);
const runFulfill = callable(tokens_fulfillCheckout);

beforeEach(() => {
  mockCreateSession.mockClear();
  mockRetrieve.mockClear();
  mockConstructEvent.mockClear();
  delete process.env.TOKEN_CHECKOUT_ENABLED; // fail-closed default OFF
});
afterAll(() => { delete process.env.TOKEN_CHECKOUT_ENABLED; });

describe('P0-04 — enablement gate (fail-closed default OFF)', () => {
  test('gate defaults OFF and throws; explicit true enables', () => {
    delete process.env.TOKEN_CHECKOUT_ENABLED;
    expect(isTokenCheckoutEnabled()).toBe(false);
    expect(() => assertTokenCheckoutEnabled('x')).toThrow(CheckoutDisabledError);
    process.env.TOKEN_CHECKOUT_ENABLED = 'false';
    expect(isTokenCheckoutEnabled()).toBe(false);
    process.env.TOKEN_CHECKOUT_ENABLED = 'true';
    expect(isTokenCheckoutEnabled()).toBe(true);
    expect(() => assertTokenCheckoutEnabled('x')).not.toThrow();
  });
});

describe('P0-04 — flag OFF: zero provider session, zero credit', () => {
  test('#6/#7 canonical creator rejects OFF before any Stripe SDK call', async () => {
    const uid = `u_${rid()}`;
    await expect(runCreate({ auth: { uid }, data: { packageId: 'mini' } })).rejects.toThrow();
    expect(mockCreateSession).toHaveBeenCalledTimes(0);
    expect(await getBalance(uid)).toBe(0);
  });

  test('#3 legacy paymentsComplete creator cannot create a session (hard-disabled)', async () => {
    const uid = `u_${rid()}`;
    await expect(runLegacyCreate({ auth: { uid }, data: { tokens: 100 } })).rejects.toThrow();
    expect(mockCreateSession).toHaveBeenCalledTimes(0);
  });

  test('#4 creditTokensCallable cannot credit (client free-mint hard-disabled)', async () => {
    const uid = `u_${rid()}`;
    await expect(runCreditCallable({ auth: { uid }, data: { packId: 'mini', sessionId: 'cs_x' } })).rejects.toThrow();
    expect(await getBalance(uid)).toBe(0);
  });

  test('#5/#10 tokens_fulfillCheckout cannot complete or credit (client fallback hard-disabled)', async () => {
    const uid = `u_${rid()}`;
    await expect(runFulfill({ auth: { uid }, data: { sessionId: 'cs_x' } })).rejects.toThrow();
    expect(mockRetrieve).toHaveBeenCalledTimes(0);
    expect(mockCreateSession).toHaveBeenCalledTimes(0);
    expect(await getBalance(uid)).toBe(0);
  });

  test('#9 flag ON still requires provider completion to credit (creation never credits)', async () => {
    // With checkout ON and a verified user, the creator makes exactly ONE session and records intent,
    // but credits ZERO tokens (creation != completion).
    process.env.TOKEN_CHECKOUT_ENABLED = 'true';
    const uid = `u_${rid()}`;
    await db.collection('users').doc(uid).set({ ageVerified: true }, { merge: true });
    const res: any = await runCreate({ auth: { uid }, data: { packageId: 'mini' } });
    expect(mockCreateSession).toHaveBeenCalledTimes(1); // exactly one canonical creator call
    expect(res.success).toBe(true);
    expect(await getBalance(uid)).toBe(0); // creation credited nothing
    const intent = await db.collection('stripeCheckoutIntents').doc('cs_mock').get();
    expect(intent.exists).toBe(true); // immutable intent recorded
  });
});

describe('P0-04 — signed webhook routes only through canonical completion', () => {
  function webhookReq(sig: string | undefined) {
    return { headers: sig ? { 'stripe-signature': sig } : {}, rawBody: Buffer.from('{}') } as any;
  }
  function webhookRes() {
    const res: any = {};
    res.status = jest.fn(() => res);
    res.send = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  }
  function paidEvent(uid: string, sid: string, pi: string) {
    return {
      id: `evt_${rid()}`,
      type: 'checkout.session.completed',
      data: { object: { id: sid, payment_intent: pi, mode: 'payment', payment_status: 'paid', currency: 'usd', amount_total: 1299, client_reference_id: uid, metadata: { uid, userId: uid, packId: 'mini' } } },
    };
  }

  test('#11/#12 signed checkout.session.completed credits via canonical completion; zero session creation', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    mockConstructEvent.mockReturnValueOnce(paidEvent(uid, sid, pi));
    const res = webhookRes();
    await (tokens_stripeWebhook as any)(webhookReq('sig'), res);
    expect(await getBalance(uid)).toBe(100); // canonical credit applied
    expect(mockCreateSession).toHaveBeenCalledTimes(0); // webhook never creates a session
    expect(res.json).toHaveBeenCalled();
  });

  test('#14 duplicate signed webhook event remains exactly-once', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    mockConstructEvent.mockReturnValue(paidEvent(uid, sid, pi));
    await (tokens_stripeWebhook as any)(webhookReq('sig'), webhookRes());
    await (tokens_stripeWebhook as any)(webhookReq('sig'), webhookRes());
    expect(await getBalance(uid)).toBe(100); // exactly once despite duplicate delivery
    mockConstructEvent.mockReset();
  });

  test('#13 invalid signature -> 400, no financial write', async () => {
    const uid = `u_${rid()}`;
    mockConstructEvent.mockImplementationOnce(() => { throw new Error('bad signature'); });
    const res = webhookRes();
    await (tokens_stripeWebhook as any)(webhookReq('sig'), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(await getBalance(uid)).toBe(0);
  });

  test('missing signature -> 400, no processing', async () => {
    mockConstructEvent.mockClear();
    const res = webhookRes();
    await (tokens_stripeWebhook as any)(webhookReq(undefined), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockConstructEvent).toHaveBeenCalledTimes(0);
  });
});

describe('P0-04 — export registry (index.ts) contains no unsafe legacy authority', () => {
  const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
  // Structural SUPPORT (not sole proof): the behavioral hard-disable tests above are the primary proof.
  function exportedNames(): string[] {
    // collect identifiers inside `export { ... } from './payments'|'./paymentsComplete'|'./pack288-web-stripe'`
    const names: string[] = [];
    const re = /export\s*\{([^}]*)\}\s*from\s*'\.\/(payments|paymentsComplete|pack288-web-stripe)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(indexSrc))) {
      for (const raw of m[1].split(',')) {
        const id = raw.replace(/\/\/.*$/gm, '').trim();
        if (id && !id.startsWith('//')) names.push(id);
      }
    }
    return names;
  }
  const names = exportedNames();

  test('#1/#17 unsafe legacy symbols are NOT exported from index.ts', () => {
    expect(names).not.toContain('createStripeCheckoutSession');
    expect(names).not.toContain('creditTokensCallable');
    expect(names).not.toContain('tokens_fulfillCheckout');
  });

  test('#2 exactly one token checkout creator (tokens_createCheckoutSession) exported', () => {
    expect(names).toContain('tokens_createCheckoutSession');
    const creators = names.filter((n) => /createCheckoutSession|createTokenCheckout/i.test(n));
    expect(creators).toEqual(['tokens_createCheckoutSession']);
  });

  test('#11 required signed webhooks remain exported', () => {
    expect(names).toContain('tokens_stripeWebhook');
    expect(names).toContain('stripeWebhook');
    expect(names).toContain('stripeWebhookV2');
  });

  test('#15/#16 unrelated membership/subscription + unreachable creators are not token-pack creators', () => {
    // pack302 createTokenCheckout / pack107 membership are NOT exported from index.ts (not runtime-reachable
    // as token-pack creators). Confirm none leaked into the payments/paymentsComplete/pack288 export set.
    expect(names).not.toContain('createTokenCheckout');
    expect(names).not.toContain('createSubscriptionCheckout');
  });
});

// ============================================================================
// R3 P0-04 WEBHOOK CANONICALIZATION — all retained token webhooks route to the SOLE canonical
// completion authority; ONE provider-transaction barrier => cross-endpoint exactly-once.
// (Codex finding: stripeWebhook / stripeWebhookV2 previously credited via generic creditTokens.)
// ============================================================================
describe('P0-04 — legacy webhooks canonicalized (cross-endpoint exactly-once)', () => {
  function reqPost(sig: string | undefined) {
    return { method: 'POST', headers: sig ? { 'stripe-signature': sig } : {}, rawBody: Buffer.from('{}') } as any;
  }
  function res() {
    const r: any = {};
    r.status = jest.fn(() => r); r.send = jest.fn(() => r); r.json = jest.fn(() => r);
    return r;
  }
  function paidEvent(uid: string, sid: string, pi: string) {
    return {
      id: `evt_${rid()}`,
      type: 'checkout.session.completed',
      data: { object: { id: sid, payment_intent: pi, mode: 'payment', payment_status: 'paid', currency: 'usd', amount_total: 1299, client_reference_id: uid, metadata: { uid, userId: uid, packId: 'mini' } } },
    };
  }
  const V1 = (r: any, s: any) => (stripeWebhook as any)(r, s);
  const V2 = (r: any, s: any) => (stripeWebhookV2 as any)(r, s);
  const TOK = (r: any, s: any) => (tokens_stripeWebhook as any)(r, s);

  test('each retained token webhook credits via canonical completion (no generic creditTokens)', async () => {
    for (const H of [V1, V2, TOK]) {
      const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
      mockConstructEvent.mockReturnValue(paidEvent(uid, sid, pi));
      await H(reqPost('sig'), res());
      expect(await getBalance(uid)).toBe(100);
      const barrier = await db.collection('providerPurchaseTransactions').doc(`stripe:${pi}`).get();
      expect(barrier.exists).toBe(true); // canonical dual barrier, not a generic sentinel
      expect(mockCreateSession).toHaveBeenCalledTimes(0); // never creates a checkout session
      mockConstructEvent.mockReset();
    }
  });

  test('cross-endpoint duplicate delivery (tokens->v1->v2) credits exactly once', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    mockConstructEvent.mockReturnValue(paidEvent(uid, sid, pi));
    await TOK(reqPost('sig'), res());
    await V1(reqPost('sig'), res());
    await V2(reqPost('sig'), res());
    expect(await getBalance(uid)).toBe(100);
    mockConstructEvent.mockReset();
  });

  test('cross-endpoint duplicate delivery (v1->tokens, v2->tokens) credits exactly once', async () => {
    for (const order of [[V1, TOK], [V2, TOK], [V2, V1]]) {
      const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
      mockConstructEvent.mockReturnValue(paidEvent(uid, sid, pi));
      await order[0](reqPost('sig'), res());
      await order[1](reqPost('sig'), res());
      expect(await getBalance(uid)).toBe(100);
      mockConstructEvent.mockReset();
    }
  });

  test('concurrent cross-endpoint delivery credits exactly once', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    mockConstructEvent.mockReturnValue(paidEvent(uid, sid, pi));
    await Promise.all([V1(reqPost('sig'), res()), V2(reqPost('sig'), res()), TOK(reqPost('sig'), res())]);
    expect(await getBalance(uid)).toBe(100);
    mockConstructEvent.mockReset();
  });

  test('distinct event IDs referencing same session/PI credit once', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    mockConstructEvent.mockReturnValueOnce(paidEvent(uid, sid, pi)); // evt A
    await V1(reqPost('sig'), res());
    mockConstructEvent.mockReturnValueOnce(paidEvent(uid, sid, pi)); // evt B (distinct id, same PI)
    await V2(reqPost('sig'), res());
    expect(await getBalance(uid)).toBe(100);
    mockConstructEvent.mockReset();
  });

  test('invalid signature -> 400, zero financial write (v1 + v2)', async () => {
    for (const H of [V1, V2]) {
      const uid = `u_${rid()}`;
      mockConstructEvent.mockImplementationOnce(() => { throw new Error('bad signature'); });
      const r = res();
      await H(reqPost('sig'), r);
      expect(r.status).toHaveBeenCalledWith(400);
      expect(await getBalance(uid)).toBe(0);
    }
    mockConstructEvent.mockReset();
  });

  test('conflicting user metadata on same session -> reject/reconcile, zero extra credit', async () => {
    const a = `u_${rid()}`, b = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    const ev: any = paidEvent(a, sid, pi);
    ev.data.object.metadata = { uid: a, userId: b }; // conflicting owner candidates
    ev.data.object.client_reference_id = null;
    mockConstructEvent.mockReturnValue(ev);
    await V1(reqPost('sig'), res());
    expect(await getBalance(a)).toBe(0);
    expect(await getBalance(b)).toBe(0);
    mockConstructEvent.mockReset();
  });

  test('conflicting amount on same session -> reject, zero credit', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    const ev: any = paidEvent(uid, sid, pi);
    ev.data.object.amount_total = 999999;
    mockConstructEvent.mockReturnValue(ev);
    await V2(reqPost('sig'), res());
    expect(await getBalance(uid)).toBe(0);
    mockConstructEvent.mockReset();
  });

  // Build a checkout.session.completed event with an overridable pack/amount/currency.
  function evtPack(uid: string, sid: string, pi: string, packId: string, amountMinor: number, currency = 'usd') {
    const e: any = paidEvent(uid, sid, pi);
    e.data.object.metadata = { uid, userId: uid, packId };
    e.data.object.amount_total = amountMinor;
    e.data.object.currency = currency;
    return e;
  }
  async function purchaseLedgerCount(uid: string): Promise<number> {
    // Query by single field then filter in JS (avoid composite-index requirements on the emulator).
    const snap = await db.collection('ledger').where('actorId', '==', uid).get();
    return snap.docs.filter((d) => d.data().type === 'PURCHASE').length;
  }

  test('cross-endpoint conflict: same provider purchase with conflicting pack yields no additional credit', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    const before = await getBalance(uid);
    // Endpoint A (v1): valid canonical 'mini' purchase (100 tokens @ 1299).
    mockConstructEvent.mockReturnValueOnce(paidEvent(uid, sid, pi));
    await V1(reqPost('sig'), res());
    const afterFirst = await getBalance(uid);
    expect(afterFirst).toBe(before + 100);
    // Endpoint B (v2): SAME session + SAME payment intent, but CONFLICTING pack 'basic' (300 tokens @ 3499).
    mockConstructEvent.mockReturnValueOnce(evtPack(uid, sid, pi, 'basic', 3499));
    await V2(reqPost('sig'), res());
    const afterConflict = await getBalance(uid);
    // Canonical outcome: provider_purchase_conflict (barrier amountTokens mismatch) -> REJECTED, no 2nd credit.
    expect(afterConflict).toBe(afterFirst); // no additional credit; wallet == one canonical purchase
    const barrier = await db.collection('providerPurchaseTransactions').doc(`stripe:${pi}`).get();
    expect(barrier.exists).toBe(true);
    expect(barrier.data()!.amountTokens).toBe(100); // single credited record, original pack
    expect(barrier.data()!.status).toBe('CREDITED');
    expect(await purchaseLedgerCount(uid)).toBe(1); // no second purchase ledger credit
    const outbox = await db.collection('paymentCompletionOutbox').doc(`stripe:${pi}`).get();
    expect(outbox.exists).toBe(true); // deterministic outbox for the original credit
    expect(mockCreateSession).toHaveBeenCalledTimes(0); // no checkout session creation
    mockConstructEvent.mockReset();
  });

  test('cross-endpoint conflict: same provider purchase with conflicting currency yields no additional credit', async () => {
    const uid = `u_${rid()}`, sid = `cs_${rid()}`, pi = `pi_${rid()}`;
    // Endpoint A (v1): valid canonical USD 'mini' purchase.
    mockConstructEvent.mockReturnValueOnce(paidEvent(uid, sid, pi));
    await V1(reqPost('sig'), res());
    const afterFirst = await getBalance(uid);
    expect(afterFirst).toBe(100);
    // Endpoint B (v2): SAME ids, CONFLICTING currency 'eur' -> global USD gate REJECTS before any credit.
    mockConstructEvent.mockReturnValueOnce(evtPack(uid, sid, pi, 'mini', 1299, 'eur'));
    await V2(reqPost('sig'), res());
    expect(await getBalance(uid)).toBe(afterFirst); // no additional credit
    const barrier = await db.collection('providerPurchaseTransactions').doc(`stripe:${pi}`).get();
    expect(barrier.exists).toBe(true);
    expect(barrier.data()!.amountTokens).toBe(100);
    expect(barrier.data()!.status).toBe('CREDITED');
    expect(await purchaseLedgerCount(uid)).toBe(1); // single purchase credit
    const outbox = await db.collection('paymentCompletionOutbox').doc(`stripe:${pi}`).get();
    expect(outbox.exists).toBe(true);
    expect(mockCreateSession).toHaveBeenCalledTimes(0);
    mockConstructEvent.mockReset();
  });

  test('SOURCE SUPPORT: no retained token webhook body calls generic creditTokens', () => {
    const paymentsSrc = fs.readFileSync(path.join(__dirname, '..', 'payments.ts'), 'utf8');
    const paymentsCompleteSrc = fs.readFileSync(path.join(__dirname, '..', 'paymentsComplete.ts'), 'utf8');
    const pack288Src = fs.readFileSync(path.join(__dirname, '..', 'pack288-web-stripe.ts'), 'utf8');
    // extract the stripeWebhook onRequest body (payments.ts) and assert no creditTokens( within it
    function bodyBetween(src: string, startMarker: string, endMarker: string): string {
      const s = src.indexOf(startMarker); const e = src.indexOf(endMarker, s + 1);
      return s >= 0 && e > s ? src.slice(s, e) : '';
    }
    const v1Body = bodyBetween(paymentsSrc, 'export const stripeWebhook =', 'CREDIT TOKENS CALLABLE');
    expect(v1Body.length).toBeGreaterThan(0);
    expect(v1Body).not.toContain('creditTokens(');
    expect(v1Body).toContain('completeStripeTokenPurchase(');
    const v2Body = bodyBetween(paymentsCompleteSrc, 'async function handleStripeCheckoutCompleted', 'async function handleStripeSubscriptionUpdate');
    expect(v2Body.length).toBeGreaterThan(0);
    expect(v2Body).not.toContain('creditTokens(');
    expect(v2Body).toContain('completeStripeTokenPurchase(');
    const tokBody = bodyBetween(pack288Src, 'async function handleCheckoutCompleted', 'async function handleChargeRefunded');
    expect(tokBody).not.toContain('creditTokens(');
    expect(tokBody).toContain('completeStripeTokenPurchase(');
  });
});
