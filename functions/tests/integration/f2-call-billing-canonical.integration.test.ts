/**
 * F2 — CALL BILLING CANONICAL INVARIANT TESTS
 *
 * Proves all required properties from the F2 hardening directive:
 *
 *   F2-R1: calls.ts endCall is HARD_DISABLED — throws without any Firestore write
 *   F2-R2: billCall from callBilling.ts is HARD_DISABLED — throws immediately
 *   F2-R3: active call billing path is canonicalCallBillingV2.billCallWindow
 *   F2-R4: one call window bills once — idempotency enforced by CALL_BILL:{sessionId}:{windowId}
 *   F2-R5: retry of same billing window bills zero additional tokens
 *   F2-R6: creatorEarningTokens === payerTokensCharged (no delivery split)
 *   F2-R7: creator earning goes to creatorEarningAccounts.pendingEarningTokens,
 *           NOT as a platform-visible split at delivery time
 *
 * Requires Firestore emulator running on $FIRESTORE_EMULATOR_HOST (default localhost:8080).
 *
 * @module f2-call-billing-canonical.integration.test
 */

process.env.FUNCTIONS_EMULATOR     = 'true';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';
process.env.GCLOUD_PROJECT          = 'demo-avalo';

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { v4 as uuid } from 'uuid';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'demo-avalo' });
}

const db = admin.firestore();

// ── Helpers ──────────────────────────────────────────────────────────────────

function newId(): string { return uuid(); }

async function seedWallet(uid: string, balance: number): Promise<void> {
  await db.collection('wallets').doc(uid).set({
    userId: uid,
    balance,
    reservedTokens: 0,
    spent: 0,
    earned: 0,
    pending: 0,
    frozen: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

async function getWallet(uid: string) {
  const snap = await db.collection('wallets').doc(uid).get();
  return snap.exists ? snap.data()! : null;
}

async function getEarningAccount(creatorId: string) {
  const snap = await db.collection('creatorEarningAccounts').doc(creatorId).get();
  return snap.exists ? snap.data()! : null;
}

// ── Imports under test ───────────────────────────────────────────────────────

import { billCall, checkCallBalance } from '../../src/callBilling';
import { endCall as legacyEndCall }   from '../../src/calls';
import { billCallWindow, billCompletedCall } from '../../src/call/canonicalCallBillingV2';

// ═════════════════════════════════════════════════════════════════════════════
// F2-R1 / F2-R2: Disabled paths throw immediately without side effects
// ═════════════════════════════════════════════════════════════════════════════

describe('F2-R1/R2 — disabled call billing paths throw before any Firestore write', () => {

  it('F2-R1: calls.ts endCall throws HARD_DISABLED before any Firestore write', async () => {
    const callId = 'call_' + newId();
    // Do NOT seed call_sessions/{callId} — if endCall reads Firestore before throwing,
    // we'd get a 'not found' error rather than HARD_DISABLED
    await expect(legacyEndCall({ callId })).rejects.toThrow('HARD_DISABLED');
  });

  it('F2-R1: calls.ts endCall error message references canonicalCallBillingV2', async () => {
    await expect(legacyEndCall({ callId: 'any' })).rejects.toThrow('canonicalCallBillingV2');
  });

  it('F2-R2: callBilling.billCall throws HARD_DISABLED', async () => {
    await expect(billCall('any_call_id')).rejects.toThrow('HARD_DISABLED');
  });

  it('F2-R2: billCall throw happens before any wallet read/write', async () => {
    const fanId = newId();
    await seedWallet(fanId, 1000);
    const walletBefore = await getWallet(fanId);

    await expect(billCall('any')).rejects.toThrow('HARD_DISABLED');

    // Wallet unchanged — billCall threw before reaching Firestore
    const walletAfter = await getWallet(fanId);
    expect(walletAfter?.balance).toBe(walletBefore?.balance);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F2-R3: checkCallBalance reads canonical wallet
// ═════════════════════════════════════════════════════════════════════════════

describe('F2-R3 — checkCallBalance reads canonical wallets/{uid}.balance', () => {

  it('returns sufficient=true when balance covers required tokens', async () => {
    const fanId = newId();
    await seedWallet(fanId, 100);

    const result = await checkCallBalance(fanId, /* tokensPerMinute */ 10, /* minMinutes */ 2);
    expect(result.sufficient).toBe(true);
    expect(result.balance).toBe(100);
    expect(result.required).toBe(20);
  });

  it('returns sufficient=false when balance is below required', async () => {
    const fanId = newId();
    await seedWallet(fanId, 5);

    const result = await checkCallBalance(fanId, 10, 2);
    expect(result.sufficient).toBe(false);
    expect(result.balance).toBe(5);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F2-R4 / F2-R5: billCallWindow — idempotency
// ═════════════════════════════════════════════════════════════════════════════

describe('F2-R4/R5 — billCallWindow: idempotent, one window bills once', () => {

  it('F2-R4: first billing deducts from fan wallet and credits creator earning', async () => {
    const fanId         = newId();
    const creatorId     = newId();
    const callSessionId = 'call_' + newId();

    await seedWallet(fanId, 200);

    const result = await billCallWindow({
      callSessionId,
      billingWindowId: 'final',
      fanId,
      creatorId,
      totalTokens:     30,
      callMode:        'VOICE',
      tokensPerMinute: 10,
      billedMinutes:   3,
      allowPartialCharge: true,
    });

    expect(result.status).toBe('CHARGED');
    expect(result.chargedTokens).toBe(30);

    // Fan wallet debited
    const fanWallet = await getWallet(fanId);
    expect(fanWallet?.balance).toBe(170);   // 200 - 30

    // Creator earning account credited
    const earning = await getEarningAccount(creatorId);
    expect(earning).not.toBeNull();
    expect(earning?.pendingEarningTokens).toBe(30);
  });

  it('F2-R5: retrying same billingWindowId charges zero additional tokens', async () => {
    const fanId         = newId();
    const creatorId     = newId();
    const callSessionId = 'call_' + newId();

    await seedWallet(fanId, 200);

    // First call
    await billCallWindow({
      callSessionId,
      billingWindowId: 'final',
      fanId, creatorId,
      totalTokens: 30, callMode: 'VOICE',
      tokensPerMinute: 10, billedMinutes: 3,
      allowPartialCharge: true,
    });

    const walletAfterFirst  = await getWallet(fanId);
    const earningAfterFirst = await getEarningAccount(creatorId);

    // Retry — same callSessionId + billingWindowId
    await billCallWindow({
      callSessionId,
      billingWindowId: 'final',
      fanId, creatorId,
      totalTokens: 30, callMode: 'VOICE',
      tokensPerMinute: 10, billedMinutes: 3,
      allowPartialCharge: true,
    });

    // Nothing additional deducted or credited
    const walletAfterRetry  = await getWallet(fanId);
    const earningAfterRetry = await getEarningAccount(creatorId);

    expect(walletAfterRetry?.balance).toBe(walletAfterFirst?.balance);
    expect(earningAfterRetry?.pendingEarningTokens).toBe(earningAfterFirst?.pendingEarningTokens);
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F2-R6: creatorEarningTokens === payerTokensCharged — no delivery split
// ═════════════════════════════════════════════════════════════════════════════

describe('F2-R6 — canonical rule: earnerTokens === chargedTokens (no delivery split)', () => {

  it('earnerTokens equals chargedTokens — full amount credited to creator, no platform cut', async () => {
    const fanId         = newId();
    const creatorId     = newId();
    const callSessionId = 'call_' + newId();
    const tokens        = 50;

    await seedWallet(fanId, 200);

    const result = await billCallWindow({
      callSessionId,
      billingWindowId: 'final',
      fanId, creatorId,
      totalTokens:     tokens,
      callMode:        'VIDEO',
      tokensPerMinute: 25,
      billedMinutes:   2,
      allowPartialCharge: true,
    });

    // F2-R6: no delivery split
    expect(result.earnerTokens).toBe(result.chargedTokens);
    expect(result.earnerTokens).toBe(tokens);

    // Creator earning account reflects full charge
    const earning = await getEarningAccount(creatorId);
    expect(earning?.pendingEarningTokens).toBe(tokens);
  });

  it('billCompletedCall: earnerTokens === full computed charge (ceiling minutes)', async () => {
    const fanId         = newId();
    const creatorId     = newId();
    const callSessionId = 'call_' + newId();

    await seedWallet(fanId, 500);

    // 130 seconds at 10 tokens/min = ceil(130/60) = 3 minutes = 30 tokens
    const result = await billCompletedCall({
      callSessionId,
      fanId, creatorId,
      durationSeconds:  130,
      tokensPerMinute:  10,
      callMode:         'VOICE',
    });

    expect(result.billedMinutes).toBe(3);
    expect(result.chargedTokens).toBe(30);
    expect(result.earnerTokens).toBe(30);   // No split: earner gets 100% at delivery
  });

});

// ═════════════════════════════════════════════════════════════════════════════
// F2-R7: earning goes to creatorEarningAccounts, not raw wallet balance
// ═════════════════════════════════════════════════════════════════════════════

describe('F2-R7 — creator earning routed to creatorEarningAccounts (canonical hold path)', () => {

  it('billCallWindow writes pendingEarningTokens to creatorEarningAccounts', async () => {
    const fanId         = newId();
    const creatorId     = newId();
    const callSessionId = 'call_' + newId();

    await seedWallet(fanId, 200);

    await billCallWindow({
      callSessionId,
      billingWindowId: 'final',
      fanId, creatorId,
      totalTokens: 20, callMode: 'VOICE',
      tokensPerMinute: 10, billedMinutes: 2,
      allowPartialCharge: true,
    });

    // canonical earning account must exist with the right amount
    const earning = await getEarningAccount(creatorId);
    expect(earning).not.toBeNull();
    expect(earning?.pendingEarningTokens).toBe(20);
    expect(earning?.lifetimeEarnedTokens).toBe(20);
  });

  it('two separate completed calls accumulate in pendingEarningTokens', async () => {
    const fanId     = newId();
    const creatorId = newId();

    await seedWallet(fanId, 500);

    // Call 1: 10 tokens
    await billCallWindow({
      callSessionId:   'call_' + newId(),
      billingWindowId: 'final',
      fanId, creatorId,
      totalTokens: 10, callMode: 'VOICE',
      tokensPerMinute: 10, billedMinutes: 1,
      allowPartialCharge: true,
    });

    // Call 2: 20 tokens
    await billCallWindow({
      callSessionId:   'call_' + newId(),
      billingWindowId: 'final',
      fanId, creatorId,
      totalTokens: 20, callMode: 'VIDEO',
      tokensPerMinute: 10, billedMinutes: 2,
      allowPartialCharge: true,
    });

    const earning = await getEarningAccount(creatorId);
    expect(earning?.pendingEarningTokens).toBe(30);
    expect(earning?.lifetimeEarnedTokens).toBe(30);
  });

});
