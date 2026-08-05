// functions/src/__tests__/p0-02-ai-billing-preauthorization.test.ts
//
// P0-02 R2 — AI BILLING PREAUTHORIZATION — emulator-backed behavioral tests for the canonical, server-authoritative
// AI spend module (app-web/src/lib/ai-billing/aiSpendAuthorization). The module is dependency-injected (Firestore
// + FieldValue), so these functions-harness emulator tests exercise the SAME code the app-web route runs.
// Proves: canonical `wallets.balance` spend authority (never tokensBalance); canonical `ledger` settlement;
// semantic (payload/avatar/product-bound) idempotency; provider-after-preauth ordering; capture/settle retry
// convergence; provider-failure vs uncertainty handling; concurrency; free classification; domain separation.

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  resolveAiBillingPolicy,
  deriveOperationId,
  payloadDigest,
  preauthorizeAiSpend,
  captureProviderResult,
  settleAiSpend,
  releaseAiSpend,
  claimProviderExecution,
  runBillableAiOperation,
  AiInsufficientFundsError,
  AiBillingUnavailableError,
  AiBillingConflictError,
  AiOperationIdRequiredError,
  AiProviderKnownFailure,
  AiProviderUncertainError,
  AiSettlementReconciliationError,
  LEDGER_COLLECTION,
  AI_SPEND_AUTHORIZATION_COLLECTION,
} from '../../../app-web/src/lib/ai-billing/aiSpendAuthorization';

const db = getFirestore() as any;
const fv = FieldValue as any;
const uid = () => 'u_' + Math.random().toString(36).slice(2, 10);
const rid = () => 'r_' + Math.random().toString(36).slice(2, 10);
const DIGEST = payloadDigest({ userMessage: 'hello', history: [], hasImage: false });

async function seedWallet(userId: string, fields: Record<string, unknown>): Promise<void> {
  await db.collection('wallets').doc(userId).set({ userId, ...fields });
}
async function wallet(userId: string): Promise<any> {
  return (await db.collection('wallets').doc(userId).get()).data() || {};
}
async function ledgerCount(operationId: string): Promise<number> {
  return (await db.collection(LEDGER_COLLECTION).where('metadata.operationId', '==', operationId).get()).size;
}
async function ledgerOfType(operationId: string, type: string): Promise<number> {
  return (await db.collection(LEDGER_COLLECTION).where('metadata.operationId', '==', operationId).where('type', '==', type).get()).size;
}
function fakeProvider(counter: { n: number }, opts: { eligible?: boolean; known?: boolean; uncertain?: boolean } = {}) {
  return async () => {
    counter.n++;
    if (opts.known) { throw new AiProviderKnownFailure('test'); }
    if (opts.uncertain) { throw new AiProviderUncertainError('test'); }
    return { result: 'AI reply', outcome: { eligible: opts.eligible !== false } };
  };
}
const P = (over: Record<string, unknown> = {}) => ({ userId: uid(), product: 'ai_companion', avatarId: 'av_1', clientRequestId: rid(), payloadDigest: DIGEST, ...over });

// ─────────────────────────────────────── WALLET CANONICALITY ────────────────────────────────────────────────
describe('P0-02 R2 — canonical balance authority', () => {
  test('p0-02 r2: spend authority is canonical balance not tokensBalance (balance=1000,tokensBalance=0 authorizes)', async () => {
    const u = uid(); await seedWallet(u, { balance: 1000, tokensBalance: 0 });
    const c = { n: 0 };
    const r = await runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c));
    expect(c.n).toBe(1); expect(r.settledTokens).toBe(3);
    expect((await wallet(u)).balance).toBe(997);
  });

  test('p0-02 r2: non-canonical tokensBalance cannot authorize (balance=0,tokensBalance=1000 denied)', async () => {
    const u = uid(); await seedWallet(u, { balance: 0, tokensBalance: 1000 });
    const c = { n: 0 };
    await expect(runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c))).rejects.toBeInstanceOf(AiInsufficientFundsError);
    expect(c.n).toBe(0);
    const w = await wallet(u); expect(w.balance).toBe(0); expect(w.tokensBalance).toBe(1000);
  });

  test('p0-02 r2: tokensBalance absent operates normally on canonical balance', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 });
    const c = { n: 0 };
    const r = await runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c));
    expect(r.settledTokens).toBe(3); expect((await wallet(u)).balance).toBe(7);
  });

  test('p0-02 r2: malformed canonical balance fails closed', async () => {
    const u = uid(); await seedWallet(u, { balance: 'lots' });
    const c = { n: 0 };
    await expect(runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c))).rejects.toBeInstanceOf(AiBillingUnavailableError);
    expect(c.n).toBe(0);
  });

  test('p0-02 r2: reserve moves balance into reservedTokens (canonical invariant)', async () => {
    const u = uid(); await seedWallet(u, { balance: 10, reservedTokens: 0 });
    const opId = deriveOperationId(u, 'req1');
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: 'req1' });
    const w = await wallet(u);
    expect(w.balance).toBe(7); expect(w.reservedTokens).toBe(3); // balance+reserved == 10 (holdings preserved)
  });
});

// ─────────────────────────────────────────── LEDGER ─────────────────────────────────────────────────────────
describe('P0-02 R2 — canonical ledger settlement', () => {
  test('p0-02 r2: settlement writes exactly one canonical burn ledger entry linked to operation', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 });
    const c = { n: 0 };
    const r = await runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c));
    // reserve(1) + burn(1) = 2 total; exactly one BURN.
    expect(await ledgerOfType(r.operationId, 'CHAT_RESPONSE_BURN')).toBe(1);
    expect(await ledgerOfType(r.operationId, 'CHAT_RESERVATION_RESERVE')).toBe(1);
  });

  test('p0-02 r2: duplicate settlement emits no second economic ledger entry', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 });
    const opId = deriveOperationId(u, 'req2');
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: 'req2' });
    await settleAiSpend(db, fv, { userId: u, operationId: opId, eligibleTokens: 3 });
    const before = await ledgerCount(opId);
    await settleAiSpend(db, fv, { userId: u, operationId: opId, eligibleTokens: 3 });
    expect(await ledgerCount(opId)).toBe(before); // idempotent, no extra entry
  });

  test('p0-02 r2: release writes a canonical release ledger entry and fabricates no spend', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 });
    const opId = deriveOperationId(u, 'req3');
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: 'req3' });
    await releaseAiSpend(db, fv, { userId: u, operationId: opId });
    expect(await ledgerOfType(opId, 'CHAT_RESERVATION_RELEASE')).toBe(1);
    expect(await ledgerOfType(opId, 'CHAT_RESPONSE_BURN')).toBe(0); // no fabricated spend
    expect((await wallet(u)).balance).toBe(10); // fully restored
  });

  test('p0-02 r2: wallet balance effect equals sum of canonical ledger entries', async () => {
    const u = uid(); await seedWallet(u, { balance: 100 });
    const c = { n: 0 };
    const r = await runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c));
    const entries = await db.collection(LEDGER_COLLECTION).where('metadata.operationId', '==', r.operationId).get();
    let net = 0;
    entries.forEach((d: any) => { const e = d.data(); if (e.type === 'CHAT_RESERVATION_RESERVE') net -= e.amountTokens; else if (e.type === 'CHAT_RESERVATION_RELEASE') net += e.amountTokens; });
    // burn does not change balance (already debited at reserve); net balance delta from reserve/release = -3
    expect(net).toBe(-3);
    expect((await wallet(u)).balance).toBe(97);
  });
});

// ─────────────────────────────────── SEMANTIC IDEMPOTENCY ───────────────────────────────────────────────────
describe('P0-02 R2 — semantic idempotency', () => {
  test('p0-02 r2: exact duplicate is idempotent (one provider call, one charge)', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c));
    const r2 = await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c));
    expect(c.n).toBe(1); expect(r2.replay).toBe(true); expect((await wallet(u)).balance).toBe(7);
  });

  test('p0-02 r2: same request id with a different message is a conflict', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c));
    const d2 = payloadDigest({ userMessage: 'DIFFERENT', history: [], hasImage: false });
    await expect(runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req, payloadDigest: d2 }), fakeProvider(c)))
      .rejects.toBeInstanceOf(AiBillingConflictError);
    expect(c.n).toBe(1); // second never reached provider
  });

  test('p0-02 r2: same request id with a different avatar is a conflict', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req, avatarId: 'av_1' }), fakeProvider(c));
    await expect(runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req, avatarId: 'av_2' }), fakeProvider(c)))
      .rejects.toBeInstanceOf(AiBillingConflictError);
    expect(c.n).toBe(1);
  });

  test('p0-02 r2: same request id with a different product is a conflict', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req, product: 'ai_companion' }), fakeProvider(c));
    // ai_coach is NON_BILLABLE -> different fingerprint under the same operationId -> conflict.
    await expect(runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req, product: 'ai_coach' }), fakeProvider(c)))
      .rejects.toBeInstanceOf(AiBillingConflictError);
  });

  test('p0-02 r2: same request id for a different user is an isolated namespace', async () => {
    const a = uid(); const b = uid(); await seedWallet(a, { balance: 10 }); await seedWallet(b, { balance: 10 });
    const req = 'shared_req';
    const c = { n: 0 };
    const ra = await runBillableAiOperation(db, fv, P({ userId: a, clientRequestId: req }), fakeProvider(c));
    const rb = await runBillableAiOperation(db, fv, P({ userId: b, clientRequestId: req }), fakeProvider(c));
    expect(ra.operationId).not.toBe(rb.operationId); // isolated namespaces
    expect(c.n).toBe(2);
    expect((await wallet(a)).balance).toBe(7); expect((await wallet(b)).balance).toBe(7);
  });

  test('p0-02 r2: concurrent exact duplicate yields a single provider execution', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    const [a, b] = await Promise.allSettled([
      runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c)),
      runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c)),
    ]);
    expect(a.status).toBe('fulfilled'); expect(b.status).toBe('fulfilled');
    expect(c.n).toBeLessThanOrEqual(1);
    expect((await wallet(u)).balance).toBe(7);
  });

  test('p0-02 r2: missing request id produces a deterministic non-random operation identity', () => {
    // deriveOperationId is a pure function of (userId, requestId) — deterministic, never random.
    expect(deriveOperationId('u1', 'r1')).toBe(deriveOperationId('u1', 'r1'));
    expect(deriveOperationId('u1', 'r1')).not.toBe(deriveOperationId('u1', 'r2'));
    expect(deriveOperationId('u1', 'r1')).not.toBe(deriveOperationId('u2', 'r1'));
  });

  test('p0-02 r2: missing operation id fails closed before any provider call', async () => {
    const u = uid(); await seedWallet(u, { balance: 100 });
    const c = { n: 0 };
    await expect(runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: '' }), fakeProvider(c))).rejects.toBeInstanceOf(AiOperationIdRequiredError);
    await expect(runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: '   ' }), fakeProvider(c))).rejects.toBeInstanceOf(AiOperationIdRequiredError);
    expect(c.n).toBe(0);
    expect((await wallet(u)).balance).toBe(100);
  });

  test('p0-02 r2: oversized operation id fails closed before any provider call', async () => {
    const u = uid(); await seedWallet(u, { balance: 100 });
    const c = { n: 0 };
    await expect(runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: 'x'.repeat(300) }), fakeProvider(c))).rejects.toBeInstanceOf(AiOperationIdRequiredError);
    expect(c.n).toBe(0);
  });
});

describe('P0-02 R2 — exact available balance', () => {
  test('p0-02 r2: exact available balance succeeds', async () => {
    const u = uid(); await seedWallet(u, { balance: 3 }); // exactly the companion price
    const c = { n: 0 };
    const r = await runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c));
    expect(r.settledTokens).toBe(3);
    const w = await wallet(u); expect(w.balance).toBe(0); expect(w.reservedTokens).toBe(0);
  });
});

// ─────────────────────────────────────────── ORDERING ──────────────────────────────────────────────────────
describe('P0-02 R2 — ordering', () => {
  test('p0-02 r2: insufficient balance invokes provider zero times', async () => {
    const u = uid(); await seedWallet(u, { balance: 2 });
    const c = { n: 0 };
    await expect(runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c))).rejects.toBeInstanceOf(AiInsufficientFundsError);
    expect(c.n).toBe(0);
  });

  test('p0-02 r2: unknown product invokes provider zero times', async () => {
    const u = uid(); await seedWallet(u, { balance: 1000 });
    const c = { n: 0 };
    await expect(runBillableAiOperation(db, fv, P({ userId: u, product: 'mystery' }), fakeProvider(c))).rejects.toBeInstanceOf(AiBillingUnavailableError);
    expect(c.n).toBe(0);
  });

  test('p0-02 r2: preauthorization conflict invokes provider zero times', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c));
    const d2 = payloadDigest({ userMessage: 'other', history: [], hasImage: false });
    await expect(runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req, payloadDigest: d2 }), fakeProvider(c))).rejects.toBeInstanceOf(AiBillingConflictError);
    expect(c.n).toBe(1);
  });
});

// ─────────────────────────────────── SETTLEMENT / FAILURE ───────────────────────────────────────────────────
describe('P0-02 R2 — settlement & failure', () => {
  test('p0-02 r2: provider success and settlement success charges exactly once', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 });
    const c = { n: 0 };
    const r = await runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c));
    expect(r.settledTokens).toBe(3); expect((await wallet(u)).balance).toBe(7);
  });

  test('p0-02 r2: provider known failure releases reservation and charges nothing', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 });
    const c = { n: 0 };
    await expect(runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c, { known: true }))).rejects.toBeInstanceOf(AiProviderKnownFailure);
    const w = await wallet(u); expect(w.balance).toBe(10); expect(w.reservedTokens).toBe(0);
  });

  test('p0-02 r2: provider uncertain error reconciles without releasing or re-charging', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    await expect(runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c, { uncertain: true }))).rejects.toBeInstanceOf(AiProviderUncertainError);
    const w = await wallet(u);
    expect(w.balance).toBe(7); expect(w.reservedTokens).toBe(3); // NOT released — held for reconciliation
    // retry does NOT re-invoke the provider
    await expect(runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c))).rejects.toBeInstanceOf(AiSettlementReconciliationError);
    expect(c.n).toBe(1);
  });

  test('p0-02 r2: retry after provider capture settles without re-invoking provider', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const opId = deriveOperationId(u, req);
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: req });
    await captureProviderResult(db, fv, { userId: u, operationId: opId, resultText: 'captured reply', eligible: true });
    const c = { n: 0 };
    const r = await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c));
    expect(c.n).toBe(0); // provider NOT re-invoked
    expect(r.settledTokens).toBe(3); expect(r.result).toBe('captured reply');
    expect((await wallet(u)).balance).toBe(7);
  });

  test('p0-02 r2: settled retry returns the captured result and does not re-invoke provider', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    const r1 = await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c));
    const r2 = await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c));
    expect(c.n).toBe(1); expect(r2.replay).toBe(true); expect(r2.result).toBe(r1.result);
  });

  test('p0-02 r2: partial eligibility settles less and releases remainder to canonical balance', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const opId = deriveOperationId(u, req);
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: req });
    const s = await settleAiSpend(db, fv, { userId: u, operationId: opId, eligibleTokens: 1 });
    expect(s.settledTokens).toBe(1); expect(s.releasedTokens).toBe(2);
    expect((await wallet(u)).balance).toBe(9); // 10 -3 +2
  });
});

// ─────────────────────────────────────────── CONCURRENCY ────────────────────────────────────────────────────
describe('P0-02 R2 — concurrency', () => {
  test('p0-02 r2: two operations with funds for one authorize exactly one, no negative balance', async () => {
    const u = uid(); await seedWallet(u, { balance: 3 });
    const c = { n: 0 };
    const results = await Promise.allSettled([
      runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c)),
      runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
    expect(results.filter((r) => r.status === 'rejected').length).toBe(1);
    expect(c.n).toBe(1);
    const w = await wallet(u); expect(w.balance).toBe(0); expect(w.reservedTokens).toBe(0);
  });
});

// ──────────────────────────────────────── FREE / DOMAIN ─────────────────────────────────────────────────────
describe('P0-02 R2 — free classification & domain separation', () => {
  test('p0-02 r2: non-billable product performs no wallet or ledger mutation', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 });
    const c = { n: 0 };
    const r = await runBillableAiOperation(db, fv, P({ userId: u, product: 'ai_coach' }), fakeProvider(c));
    expect(r.billingClass).toBe('NON_BILLABLE'); expect(c.n).toBe(1);
    expect((await wallet(u)).balance).toBe(10);
    expect(await ledgerCount(r.operationId)).toBe(0);
  });

  test('p0-02 r2: unknown product never falls back to free execution', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 });
    const c = { n: 0 };
    await expect(runBillableAiOperation(db, fv, P({ userId: u, product: '' }), fakeProvider(c))).rejects.toBeInstanceOf(AiBillingUnavailableError);
    expect(c.n).toBe(0);
  });

  test('p0-02 r2: AI billing never mutates advertiser credit, creator earnings, or payouts', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 });
    const advId = 'adv_' + u; const crId = 'cr_' + u;
    await db.collection('advertisers').doc(advId).set({ advertiserId: advId, tokenBalance: 500 });
    await db.collection('creator_earnings').doc(crId).set({ userId: crId, balance: 500 });
    await db.collection('payouts').doc('po_' + u).set({ userId: u, amount: 500 });
    const c = { n: 0 };
    await runBillableAiOperation(db, fv, P({ userId: u }), fakeProvider(c));
    expect((await db.collection('advertisers').doc(advId).get()).data()?.tokenBalance).toBe(500);
    expect((await db.collection('creator_earnings').doc(crId).get()).data()?.balance).toBe(500);
    expect((await db.collection('payouts').doc('po_' + u).get()).data()?.amount).toBe(500);
    expect((await db.collection(AI_SPEND_AUTHORIZATION_COLLECTION).where('userId', '==', u).get()).size).toBe(1);
  });
});

// ────────────────────────── R4 — EXACTLY-ONCE PROVIDER EXECUTION CLAIM ───────────────────────────────────────
// Codex proved a real P0-02 concurrency defect: two exact-duplicate concurrent callers could BOTH cross the
// provider boundary (fake provider counter c.n == 2), doubling external AI cost, even though the financial
// settlement remained idempotent (one debit). The closure is a server-authoritative ATOMIC provider-execution
// CLAIM: only the single transaction that transitions PREAUTHORIZED -> PROVIDER_CLAIMED may invoke the provider;
// every concurrent duplicate observes IN_PROGRESS (or a terminal state) and must NOT invoke the provider. These
// tests assert the PRIMARY INVARIANT for one canonical operation: MAX PROVIDER EXECUTIONS = 1.
async function authDoc(operationId: string): Promise<any> {
  return (await db.collection(AI_SPEND_AUTHORIZATION_COLLECTION).doc(operationId).get()).data() || {};
}
// Fire N exact-duplicate concurrent orchestrator invocations for the SAME (user, request, avatar, payload).
async function raceExactDuplicates(u: string, req: string, n: number, c: { n: number }) {
  const tasks = [];
  for (let i = 0; i < n; i++) { tasks.push(runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c))); }
  return Promise.allSettled(tasks);
}

describe('P0-02 R4 — exactly-once provider execution claim', () => {
  test('p0-02 r4: concurrent exact duplicate yields exactly one provider execution', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    const res = await raceExactDuplicates(u, req, 2, c);
    expect(res.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(c.n).toBe(1);                                            // EXACTLY one provider execution (not <=1)
    const opId = deriveOperationId(u, req);
    expect(await ledgerOfType(opId, 'CHAT_RESPONSE_BURN')).toBe(1); // exactly one canonical economic debit
    expect(await ledgerOfType(opId, 'CHAT_RESERVATION_RESERVE')).toBe(1);
    const w = await wallet(u); expect(w.balance).toBe(7); expect(w.reservedTokens || 0).toBe(0);
    expect((await db.collection(AI_SPEND_AUTHORIZATION_COLLECTION).doc(opId).get()).data()?.state).toBe('SETTLED'); // one settlement
  });

  test('p0-02 r4: three concurrent exact duplicates yield exactly one provider execution', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    const res = await raceExactDuplicates(u, req, 3, c);
    expect(res.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(c.n).toBe(1);
    const opId = deriveOperationId(u, req);
    expect(await ledgerOfType(opId, 'CHAT_RESPONSE_BURN')).toBe(1);
    expect((await wallet(u)).balance).toBe(7);
  });

  test('p0-02 r4: ten concurrent exact duplicates yield exactly one provider execution', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    const res = await raceExactDuplicates(u, req, 10, c);
    expect(res.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(c.n).toBe(1);
    const opId = deriveOperationId(u, req);
    expect(await ledgerOfType(opId, 'CHAT_RESPONSE_BURN')).toBe(1);
    const w = await wallet(u); expect(w.balance).toBe(7); expect(w.balance).toBeGreaterThanOrEqual(0);
  }, 120000);

  test('p0-02 r4: concurrent duplicate loser does not invoke provider and observes in-progress or replay', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    const res = await raceExactDuplicates(u, req, 2, c);
    const vals = res.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled').map((r) => r.value);
    expect(vals.length).toBe(2);
    const invokers = vals.filter((v) => v.providerInvoked === true);
    const nonInvokers = vals.filter((v) => v.providerInvoked === false);
    expect(invokers.length).toBe(1);                               // exactly one owner crossed the provider boundary
    expect(nonInvokers.length).toBe(1);                            // the loser did NOT invoke the provider
    expect(nonInvokers[0].replay).toBe(true);                      // loser converged to a deterministic replay/in-progress result
    expect(c.n).toBe(1);
  });

  test('p0-02 r4: duplicate after provider capture does not re-invoke provider', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const opId = deriveOperationId(u, req);
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: req });
    await captureProviderResult(db, fv, { userId: u, operationId: opId, resultText: 'captured', eligible: true });
    const c = { n: 0 };
    const r = await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c));
    expect(c.n).toBe(0);                                           // provider NOT re-invoked after PROVIDER_CAPTURED
    expect(r.providerInvoked).toBe(false); expect(r.result).toBe('captured');
    // a claim on a captured operation is not an execution grant
    const claim = await claimProviderExecution(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST });
    expect(claim.status).toBe('EXISTING_SETTLED'); expect(c.n).toBe(0);
  });

  test('p0-02 r4: duplicate after settlement does not re-invoke provider', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    const r1 = await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c));
    const opId = r1.operationId;
    // duplicate orchestrator call after SETTLED
    const r2 = await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c));
    expect(r2.replay).toBe(true); expect(r2.providerInvoked).toBe(false);
    // direct claim after SETTLED is not an execution grant
    const claim = await claimProviderExecution(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST });
    expect(claim.status).toBe('EXISTING_SETTLED');
    expect(c.n).toBe(1);                                           // still exactly one across the settled duplicate + claim
  });

  test('p0-02 r4: same operation id different fingerprint conflicts before claim', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const opId = deriveOperationId(u, req);
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: req });
    const otherDigest = payloadDigest({ userMessage: 'tampered', history: [], hasImage: false });
    await expect(claimProviderExecution(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: otherDigest }))
      .rejects.toBeInstanceOf(AiBillingConflictError);                // conflict raised inside the claim, before any provider grant
    expect((await authDoc(opId)).state).toBe('PREAUTHORIZED');        // never transitioned to PROVIDER_CLAIMED
  });

  test('p0-02 r4: two distinct funded operations each invoke provider exactly once', async () => {
    const u = uid(); await seedWallet(u, { balance: 100 });
    const c = { n: 0 };
    const [ra, rb] = await Promise.all([
      runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: 'op_a' }), fakeProvider(c)),
      runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: 'op_b' }), fakeProvider(c)),
    ]);
    expect(ra.operationId).not.toBe(rb.operationId);
    expect(c.n).toBe(2);                                            // one provider execution PER canonical operation
    expect(ra.settledTokens).toBe(3); expect(rb.settledTokens).toBe(3);
    expect((await wallet(u)).balance).toBe(94);
  });

  test('p0-02 r4: claim contention grants exactly one CLAIM_ACQUIRED', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const opId = deriveOperationId(u, req);
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: req });
    const N = 12;
    const claims = await Promise.all(Array.from({ length: N }, () => claimProviderExecution(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST })));
    const acquired = claims.filter((k) => k.status === 'CLAIM_ACQUIRED');
    const inProgress = claims.filter((k) => k.status === 'IN_PROGRESS');
    expect(acquired.length).toBe(1);                               // NEVER two claims
    expect(inProgress.length).toBe(N - 1);
    expect(acquired[0].providerClaimId).toMatch(/^[0-9a-f]{32}$/);  // single server-generated claim identity
  });

  test('p0-02 r4: provider execution claim id is server-generated not client-supplied', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const opId = deriveOperationId(u, req);
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: req });
    // A client cannot inject its own claim ownership: the claim API has no claimId input; a forged field is ignored.
    const forged: any = { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, providerClaimId: 'FORGED_CLIENT_CLAIM', claimState: 'PROVIDER_CLAIMED' };
    const claim = await claimProviderExecution(db, fv, forged);
    expect(claim.status).toBe('CLAIM_ACQUIRED');
    expect(claim.providerClaimId).not.toBe('FORGED_CLIENT_CLAIM');
    expect(claim.providerClaimId).toMatch(/^[0-9a-f]{32}$/);
    expect((await authDoc(opId)).providerClaimId).toBe(claim.providerClaimId); // persisted id is the server one
  });

  test('p0-02 r4: claim cannot be acquired for a mismatched user', async () => {
    const u = uid(); const attacker = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const opId = deriveOperationId(u, req);
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: req });
    await expect(claimProviderExecution(db, fv, { userId: attacker, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST }))
      .rejects.toBeInstanceOf(AiBillingUnavailableError);             // claim cannot transfer to another user
    expect((await authDoc(opId)).state).toBe('PREAUTHORIZED');
  });

  test('p0-02 r4: claim across a different product is a fingerprint conflict', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const opId = deriveOperationId(u, req);
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: req });
    await expect(claimProviderExecution(db, fv, { userId: u, product: 'ai_coach', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST }))
      .rejects.toBeInstanceOf(AiBillingConflictError);               // claim cannot transfer to another product
    expect((await authDoc(opId)).state).toBe('PREAUTHORIZED');
  });

  test('p0-02 r4: second claim on a claimed operation is not acquired', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const opId = deriveOperationId(u, req);
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: req });
    const first = await claimProviderExecution(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST });
    const second = await claimProviderExecution(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST });
    expect(first.status).toBe('CLAIM_ACQUIRED');
    expect(second.status).toBe('IN_PROGRESS');                     // a second claim is never granted
    expect(second.providerClaimId).toBe(first.providerClaimId);    // the single owner claim is preserved
  });

  test('p0-02 r4: settled operation cannot be re-claimed for provider execution', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    const r = await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c));
    const claim = await claimProviderExecution(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: r.operationId, payloadDigest: DIGEST });
    expect(claim.status).toBe('EXISTING_SETTLED');                 // never CLAIM_ACQUIRED
    expect(c.n).toBe(1);
  });

  test('p0-02 r4: captured operation cannot be re-claimed for provider execution', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const opId = deriveOperationId(u, req);
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: req });
    await captureProviderResult(db, fv, { userId: u, operationId: opId, resultText: 'captured', eligible: true });
    const claim = await claimProviderExecution(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST });
    expect(claim.status).toBe('EXISTING_CAPTURED');                // captured result reused, no new claim
    expect(claim.capturedResult).toBe('captured');
  });

  test('p0-02 r4: uncertain operation is not automatically re-claimed for provider execution', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const c = { n: 0 };
    await expect(runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: req }), fakeProvider(c, { uncertain: true })))
      .rejects.toBeInstanceOf(AiProviderUncertainError);
    const opId = deriveOperationId(u, req);
    expect((await authDoc(opId)).state).toBe('FAILED_RECONCILIATION');
    const claim = await claimProviderExecution(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST });
    expect(claim.status).toBe('RECONCILIATION');                   // uncertainty is NOT auto-freed for a second provider call
    expect(c.n).toBe(1);
  });

  test('p0-02 r4: released operation requires a new logical operation to invoke provider', async () => {
    const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid();
    const opId = deriveOperationId(u, req);
    await preauthorizeAiSpend(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST, clientRequestId: req });
    await releaseAiSpend(db, fv, { userId: u, operationId: opId });
    const claim = await claimProviderExecution(db, fv, { userId: u, product: 'ai_companion', avatarId: 'av_1', operationId: opId, payloadDigest: DIGEST });
    expect(claim.status).toBe('RELEASED');                         // released op grants no provider execution
    // a genuinely NEW logical operation (fresh request id) may invoke the provider exactly once
    const c = { n: 0 };
    const fresh = await runBillableAiOperation(db, fv, P({ userId: u, clientRequestId: rid() }), fakeProvider(c));
    expect(c.n).toBe(1); expect(fresh.settledTokens).toBe(3);
  });
});

// ─────────────────────────────────── R4 — STRESS: repeated race determinism ──────────────────────────────────
// The original defect reproduced nondeterministically (~15%). A single green run is therefore insufficient; this
// gate replays the exact-duplicate race across many independent rounds and asserts ZERO duplicate provider
// executions across every round (providerCalls==1, settlements==1, economic debits==1, final balance correct,
// never negative). Rounds are independent (unique users) and executed in bounded-concurrency batches.
describe('P0-02 R4 — stress race determinism', () => {
  test('p0-02 r4: stress fifty concurrent exact-duplicate rounds never double-invoke provider', async () => {
    const ROUNDS = 50; const BATCH = 10;
    const runRound = async () => {
      const u = uid(); await seedWallet(u, { balance: 10 }); const req = rid(); const c = { n: 0 };
      const res = await raceExactDuplicates(u, req, 2, c);
      const opId = deriveOperationId(u, req);
      const w = await wallet(u);
      return {
        fulfilled: res.filter((r) => r.status === 'fulfilled').length,
        providerCalls: c.n,
        reserves: await ledgerOfType(opId, 'CHAT_RESERVATION_RESERVE'),
        burns: await ledgerOfType(opId, 'CHAT_RESPONSE_BURN'),
        settled: (await db.collection(AI_SPEND_AUTHORIZATION_COLLECTION).doc(opId).get()).data()?.state,
        balance: w.balance, reserved: w.reservedTokens || 0,
      };
    };
    const outcomes: any[] = [];
    for (let start = 0; start < ROUNDS; start += BATCH) {
      const batch = Array.from({ length: Math.min(BATCH, ROUNDS - start) }, runRound);
      outcomes.push(...await Promise.all(batch));
    }
    expect(outcomes.length).toBe(ROUNDS);
    let duplicateProviderFailures = 0;
    for (const o of outcomes) {
      if (o.providerCalls !== 1) { duplicateProviderFailures++; }
      expect(o.fulfilled).toBe(2);
      expect(o.providerCalls).toBe(1);                 // EXACTLY-ONCE provider execution, every round
      expect(o.reserves).toBe(1);                      // one canonical reserve
      expect(o.burns).toBe(1);                         // one canonical economic debit
      expect(o.settled).toBe('SETTLED');               // one settlement
      expect(o.balance).toBe(7);                       // correct final balance
      expect(o.reserved).toBe(0);
      expect(o.balance).toBeGreaterThanOrEqual(0);     // never negative
    }
    expect(duplicateProviderFailures).toBe(0);         // zero duplicate provider executions across all rounds
  }, 600000);
});
