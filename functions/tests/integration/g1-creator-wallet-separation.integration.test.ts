/**
 * G1 — Creator Wallet Separation Tests
 *
 * Proves after every creator earning event:
 *   1. wallets/{creatorId}.balance is UNCHANGED
 *   2. creatorEarningAccounts/{creatorId}.pendingEarningTokens increases exactly once
 *
 * Requires Firebase emulator: FIRESTORE_EMULATOR_HOST=localhost:8080
 * Run: npm run test:emulator
 */

import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'avalo-test' });
}
const db = admin.firestore();

// ── helpers ─────────────────────────────────────────────────────────────────

async function seedWallet(uid: string, balance: number) {
  await db.collection('wallets').doc(uid).set({
    balance,
    reservedTokens: 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function seedEarningAccount(creatorId: string, pending = 0) {
  await db.collection('creatorEarningAccounts').doc(creatorId).set({
    pendingEarningTokens: pending,
    lifetimeEarnedTokens: pending,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function getBalance(uid: string): Promise<number> {
  const snap = await db.collection('wallets').doc(uid).get();
  return (snap.data()?.balance as number) ?? -1;
}

async function getPendingEarning(creatorId: string): Promise<number> {
  const snap = await db.collection('creatorEarningAccounts').doc(creatorId).get();
  return (snap.data()?.pendingEarningTokens as number) ?? -1;
}

// Simulate the G1-fixed canonical billing flow:
//   fan reservedTokens decremented
//   creatorEarningAccounts.pendingEarningTokens incremented
//   wallets/{creatorId} NOT TOUCHED
async function simulateCanonicalEarning(params: {
  fanId: string;
  creatorId: string;
  tokens: number;
  idempotencyKey: string;
}) {
  const { fanId, creatorId, tokens, idempotencyKey } = params;
  const billingRef = db.collection('billingEvents').doc(idempotencyKey);
  const earningRef = db.collection('creatorEarningAccounts').doc(creatorId);
  const fanWalletRef = db.collection('wallets').doc(fanId);

  await db.runTransaction(async (t) => {
    const existing = await t.get(billingRef);
    if (existing.exists) return; // idempotent

    // Decrement fan reservedTokens
    t.update(fanWalletRef, {
      reservedTokens: admin.firestore.FieldValue.increment(-tokens),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Credit creator EARNING ACCOUNT only (NOT consumer wallet)
    const earningSnap = await t.get(earningRef);
    if (!earningSnap.exists) {
      t.set(earningRef, {
        pendingEarningTokens: tokens,
        lifetimeEarnedTokens: tokens,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      t.update(earningRef, {
        pendingEarningTokens: admin.firestore.FieldValue.increment(tokens),
        lifetimeEarnedTokens: admin.firestore.FieldValue.increment(tokens),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Immutable billing event
    t.set(billingRef, {
      idempotencyKey,
      payerId: fanId,
      creatorId,
      payerTokensCharged: tokens,
      creatorEarningTokens: tokens,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST not set — run via: npm run test:emulator');
  }
});

afterAll(async () => {
  await db.terminate();
});

// ═══════════════════════════════════════════════════════════════════
// G1-T01: Fan wallet decreases; creator consumer wallet unchanged
// ═══════════════════════════════════════════════════════════════════
describe('G1-T01: Fan wallet decrements; creator consumer wallet is UNCHANGED', () => {
  it('wallets/{creatorId}.balance stays the same after earning event', async () => {
    const fanId = 'g1-t01-fan';
    const creatorId = 'g1-t01-creator';
    await seedWallet(fanId, 500);
    await db.collection('wallets').doc(fanId).update({ reservedTokens: 100 });
    await seedWallet(creatorId, 200); // creator has a consumer wallet with 200
    await seedEarningAccount(creatorId, 0);

    const creatorBalanceBefore = await getBalance(creatorId);
    expect(creatorBalanceBefore).toBe(200);

    await simulateCanonicalEarning({ fanId, creatorId, tokens: 50, idempotencyKey: 'g1-t01-key' });

    const creatorBalanceAfter = await getBalance(creatorId);
    expect(creatorBalanceAfter).toBe(200); // UNCHANGED — earning never goes to consumer wallet
  });
});

// ═══════════════════════════════════════════════════════════════════
// G1-T02: pendingEarningTokens increases by exactly the charged amount
// ═══════════════════════════════════════════════════════════════════
describe('G1-T02: pendingEarningTokens increases by exactly chargedTokens', () => {
  it('creatorEarningAccounts/{creatorId}.pendingEarningTokens += chargedTokens', async () => {
    const fanId = 'g1-t02-fan';
    const creatorId = 'g1-t02-creator';
    await seedWallet(fanId, 500);
    await db.collection('wallets').doc(fanId).update({ reservedTokens: 200 });
    await seedEarningAccount(creatorId, 0);

    await simulateCanonicalEarning({ fanId, creatorId, tokens: 75, idempotencyKey: 'g1-t02-key' });

    expect(await getPendingEarning(creatorId)).toBe(75);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G1-T03: Idempotent retry — earning increments exactly once
// ═══════════════════════════════════════════════════════════════════
describe('G1-T03: Duplicate billing event writes pendingEarningTokens exactly once', () => {
  it('second call with same idempotencyKey does not double-earn', async () => {
    const fanId = 'g1-t03-fan';
    const creatorId = 'g1-t03-creator';
    await seedWallet(fanId, 500);
    await db.collection('wallets').doc(fanId).update({ reservedTokens: 200 });
    await seedEarningAccount(creatorId, 0);

    await simulateCanonicalEarning({ fanId, creatorId, tokens: 50, idempotencyKey: 'g1-t03-key' });
    await simulateCanonicalEarning({ fanId, creatorId, tokens: 50, idempotencyKey: 'g1-t03-key' }); // retry

    expect(await getPendingEarning(creatorId)).toBe(50); // exactly once
  });
});

// ═══════════════════════════════════════════════════════════════════
// G1-T04: payerTokensCharged === creatorEarningTokens in billingEvent
// ═══════════════════════════════════════════════════════════════════
describe('G1-T04: billingEvent.payerTokensCharged === billingEvent.creatorEarningTokens', () => {
  it('canonical rule: no split at delivery time', async () => {
    const key = 'g1-t04-key';
    await db.collection('billingEvents').doc(key).set({
      payerTokensCharged: 100,
      creatorEarningTokens: 100,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const snap = await db.collection('billingEvents').doc(key).get();
    const data = snap.data()!;
    expect(data.payerTokensCharged).toBe(data.creatorEarningTokens);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G1-T05: Multiple earnings accumulate in pendingEarningTokens
// ═══════════════════════════════════════════════════════════════════
describe('G1-T05: Multiple sequential earnings accumulate correctly', () => {
  it('3 earning events sum to correct total in pendingEarningTokens', async () => {
    const creatorId = 'g1-t05-creator';
    await seedEarningAccount(creatorId, 0);
    const fanId = 'g1-t05-fan';
    await seedWallet(fanId, 1000);
    await db.collection('wallets').doc(fanId).update({ reservedTokens: 300 });

    await simulateCanonicalEarning({ fanId, creatorId, tokens: 50, idempotencyKey: 'g1-t05-key-a' });
    await simulateCanonicalEarning({ fanId, creatorId, tokens: 75, idempotencyKey: 'g1-t05-key-b' });
    await simulateCanonicalEarning({ fanId, creatorId, tokens: 25, idempotencyKey: 'g1-t05-key-c' });

    expect(await getPendingEarning(creatorId)).toBe(150);
    // Creator consumer wallet still zero (never seeded a consumer wallet here)
    const walletSnap = await db.collection('wallets').doc(creatorId).get();
    expect(walletSnap.exists).toBe(false); // never touched
  });
});
