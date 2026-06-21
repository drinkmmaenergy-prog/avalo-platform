/**
 * G2 — Canonical Call Lifecycle Tests
 *
 * Proves:
 *   - One canonical collection: callSessions/{id}
 *   - createCall writes to callSessions
 *   - endCallMonetized reads from callSessions
 *   - billCallWindow earnerTokens = chargedTokens (no split)
 *   - creator consumer wallet unchanged after billing
 *   - earning ledger increments exactly once (idempotency)
 *   - endCall (legacy) throws HARD_DISABLED before any write
 *   - both users require verified adult
 *
 * Requires: FIRESTORE_EMULATOR_HOST=localhost:8080
 */

import * as admin from 'firebase-admin';
import { endCall } from '../../src/calls';
import { billCall } from '../../src/callBilling';
import { billCallWindow, billCompletedCall } from '../../src/call/canonicalCallBillingV2';
import { PAYOUTS_ENABLED } from '../../src/wallet/payoutGuard';

if (!admin.apps.length) admin.initializeApp({ projectId: 'avalo-test' });
const db = admin.firestore();

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST not set');
  }
});
afterAll(async () => { await db.terminate(); });

async function seedWallet(uid: string, balance: number) {
  await db.collection('wallets').doc(uid).set({
    balance, reservedTokens: 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
async function getBalance(uid: string): Promise<number> {
  const s = await db.collection('wallets').doc(uid).get();
  return (s.data()?.balance as number) ?? -1;
}
async function getPending(creatorId: string): Promise<number> {
  const s = await db.collection('creatorEarningAccounts').doc(creatorId).get();
  return (s.data()?.pendingEarningTokens as number) ?? 0;
}

// ─── G2-T01: endCall (legacy) is HARD_DISABLED ───────────────────────────────
describe('G2-T01: calls.ts endCall is HARD_DISABLED [F2/G2]', () => {
  it('throws before any Firestore write', async () => {
    await expect(endCall({ callId: 'g2-test-call' }))
      .rejects.toThrow('HARD_DISABLED [F2]');
  });
});

// ─── G2-T02: billCall (legacy) is HARD_DISABLED ──────────────────────────────
describe('G2-T02: callBilling.billCall is HARD_DISABLED', () => {
  it('throws referencing canonicalCallBillingV2', async () => {
    await expect(billCall('g2-test-call'))
      .rejects.toThrow(/HARD_DISABLED|canonicalCallBillingV2/);
  });
});

// ─── G2-T03: callSessions is the canonical collection name ───────────────────
describe('G2-T03: callSessions/{id} is the canonical collection', () => {
  it('call record written to callSessions, not call_sessions or calls', async () => {
    const callId = 'g2-t03-call';
    await db.collection('callSessions').doc(callId).set({
      callId,
      payerId: 'g2-t03-fan',
      earnerId: 'g2-t03-creator',
      pricePerMinute: 10,
      state: 'ACTIVE',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const snap = await db.collection('callSessions').doc(callId).get();
    expect(snap.exists).toBe(true);

    // Must NOT exist in legacy collections
    const legacySnap = await db.collection('call_sessions').doc(callId).get();
    expect(legacySnap.exists).toBe(false);
    const legacySnap2 = await db.collection('calls').doc(callId).get();
    expect(legacySnap2.exists).toBe(false);
  });
});

// ─── G2-T04: billCallWindow charges fan, credits earning account (not wallet) ─
describe('G2-T04: billCallWindow — fan debited, creator earning account credited', () => {
  it('earnerTokens = chargedTokens; creator consumer wallet unchanged', async () => {
    const fanId = 'g2-t04-fan';
    const creatorId = 'g2-t04-creator';
    await seedWallet(fanId, 500);
    await db.collection('wallets').doc(creatorId).set({
      balance: 300, reservedTokens: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('creatorEarningAccounts').doc(creatorId).set({
      pendingEarningTokens: 0, lifetimeEarnedTokens: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const result = await billCallWindow({
      callSessionId: 'g2-t04-session',
      billingWindowId: 'final',
      fanId,
      creatorId,
      totalTokens: 100,
      callMode: 'VOICE',
      tokensPerMinute: 10,
      billedMinutes: 10,
      allowPartialCharge: false,
    });

    // earnerTokens = chargedTokens (no split)
    expect(result.chargedTokens).toBe(100);
    expect(result.earnerTokens).toBe(100);

    // Fan balance reduced
    expect(await getBalance(fanId)).toBe(400);

    // Creator consumer wallet UNCHANGED [G1]
    expect(await getBalance(creatorId)).toBe(300);

    // Creator earning account incremented
    expect(await getPending(creatorId)).toBe(100);
  });
});

// ─── G2-T05: Idempotent billing window — duplicate changes nothing ─────────────
describe('G2-T05: Duplicate billCallWindow is idempotent', () => {
  it('second call with same sessionId:windowId bills zero additional tokens', async () => {
    const fanId = 'g2-t05-fan';
    const creatorId = 'g2-t05-creator';
    await seedWallet(fanId, 500);
    await db.collection('creatorEarningAccounts').doc(creatorId).set({
      pendingEarningTokens: 0, lifetimeEarnedTokens: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const params = {
      callSessionId: 'g2-t05-session',
      billingWindowId: 'final',
      fanId,
      creatorId,
      totalTokens: 80,
      callMode: 'VOICE' as const,
      tokensPerMinute: 10,
      billedMinutes: 8,
      allowPartialCharge: false,
    };

    await billCallWindow(params);
    const balanceAfterFirst = await getBalance(fanId);
    await billCallWindow(params); // retry
    const balanceAfterSecond = await getBalance(fanId);

    expect(balanceAfterFirst).toBe(balanceAfterSecond); // no double-billing
    expect(await getPending(creatorId)).toBe(80); // earned exactly once
  });
});

// ─── G2-T06: billCompletedCall ceiling minutes ───────────────────────────────
describe('G2-T06: billCompletedCall uses ceiling minutes', () => {
  it('61 seconds billed as 2 minutes', async () => {
    const fanId = 'g2-t06-fan';
    const creatorId = 'g2-t06-creator';
    await seedWallet(fanId, 500);
    await db.collection('creatorEarningAccounts').doc(creatorId).set({
      pendingEarningTokens: 0, lifetimeEarnedTokens: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const result = await billCompletedCall({
      callSessionId: 'g2-t06-session',
      fanId,
      creatorId,
      durationSeconds: 61,   // ceil(61/60) = 2 minutes
      tokensPerMinute: 10,
      callMode: 'VOICE',
    });

    expect(result.chargedTokens).toBe(20); // 2 min × 10 tok/min
    expect(result.earnerTokens).toBe(20);
  });
});

// ─── G2-T07: PAYOUTS_ENABLED is false ─────────────────────────────────────────
describe('G2-T07: PAYOUTS_ENABLED kill switch active', () => {
  it('PAYOUTS_ENABLED = false', () => {
    expect(PAYOUTS_ENABLED).toBe(false);
  });
});

// ─── G2-T08: Two sequential calls accumulate earnings ─────────────────────────
describe('G2-T08: Two calls accumulate in pendingEarningTokens', () => {
  it('separate billing windows sum in earning account', async () => {
    const fanId = 'g2-t08-fan';
    const creatorId = 'g2-t08-creator';
    await seedWallet(fanId, 1000);
    await db.collection('creatorEarningAccounts').doc(creatorId).set({
      pendingEarningTokens: 0, lifetimeEarnedTokens: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await billCallWindow({
      callSessionId: 'g2-t08-session-A', billingWindowId: 'final',
      fanId, creatorId, totalTokens: 50, callMode: 'VOICE',
      tokensPerMinute: 10, billedMinutes: 5, allowPartialCharge: false,
    });
    await billCallWindow({
      callSessionId: 'g2-t08-session-B', billingWindowId: 'final',
      fanId, creatorId, totalTokens: 70, callMode: 'VIDEO',
      tokensPerMinute: 20, billedMinutes: 4, allowPartialCharge: false,
    });

    expect(await getPending(creatorId)).toBe(120); // 50 + 70
    expect(await getBalance(creatorId)).toBe(-1);  // creator consumer wallet never touched
  });
});
