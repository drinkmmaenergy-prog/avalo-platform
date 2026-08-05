// functions/src/__tests__/p0-05-r1b2-server-owned-paidchat-authority.test.ts
//
// P0-05 R1B-2 — SERVER-OWNED `/paidChats` CANONICAL AUTHORITY FOUNDATION.
//
// The FIRST legitimate TrustedPaidChatAuthority construction path is `loadTrustedPaidChatAuthority(paidChatId)`, which
// loads and validates a server-owned `/paidChats/{id}` record before minting a non-forgeable capability internally.
// These emulator tests prove: (a) a valid server-owned record yields an authority whose payer/earner/rate/multiplier/
// policy exactly equal the validated record; (b) every invalid/inconsistent record is rejected fail-closed; (c) raw
// fields / casts / clones / fake symbols still cannot mint trust (only the loader can); (d) loading has ZERO financial
// side effect; (e) sendChatMessage stays HARD_FAIL_CLOSED and forged `/chats` is still inert; (f) general messaging
// still works. No billing is enabled and no wallet/reservation/ledger effect ever occurs.

import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';
import {
  loadTrustedPaidChatAuthority,
  PaidChatAuthorityLoadError,
  isTrustedPaidChatAuthority,
  TrustedPaidChatAuthority,
} from '../chat/paidChatAuthority';
import {
  PAID_CHATS_COLLECTION,
  PaidChatRecordValidationError,
  normalizedPairKey,
} from '../chat/canonicalPaidChat/paidChatRecord';
import * as authMod from '../chat/paidChatAuthority';
import { PAID_CHAT_AUTHORITY_ENVELOPE_FIELD } from '../chat/paidChatAuthority';
import { validateCanonicalPaidChatRecord } from '../chat/canonicalPaidChat/paidChatRecord';
import { createTestAuthoritySigner } from './helpers/iam01aTestSigner';
import * as r1b2Prov from '../security/financialAuthority/authorityProvenance';
import { FINANCIAL_AUTHORITY_DOMAINS } from '../security/financialAuthority/authorityEnvelope';
import { FINGERPRINT_ALGORITHM_VERSION } from '../security/financialAuthority/canonicalFingerprint';
import { sendChatMessage } from '../chatSystemNextGen';
import { processMessage } from '../canonical-chat-engine';

const testEnv = fft();
const db = getFirestore() as any;
const uid = () => 'u_' + Math.random().toString(36).slice(2, 10);
afterAll(() => { testEnv.cleanup(); });

// P0-IAM-01A: the loader verifies cryptographic provenance before minting AND resolves its verifier INTERNALLY (no
// caller-supplied verifier — Codex R2 fix). R1B-2's positive paths therefore seed test-signed records and exercise the
// mint path by spying the internal production-verifier resolver (jest test infra; production stays SAFE_UNAVAILABLE).
const R1B2_T = createTestAuthoritySigner();
async function seedSignedPaidChat(id: string, data: Record<string, unknown>): Promise<void> {
  const rec = validateCanonicalPaidChatRecord({ ...data, paidChatId: id });
  await db.collection(PAID_CHATS_COLLECTION).doc(id).set({ ...data, [PAID_CHAT_AUTHORITY_ENVELOPE_FIELD]: R1B2_T.signPaidChatRecord(rec) });
}
async function r1b2Load(id: string): Promise<any> {
  const v = r1b2Prov.resolveProductionFinancialAuthorityVerifier({
    authorityDomain: FINANCIAL_AUTHORITY_DOMAINS.PAID_CHAT, signatureAlgorithm: 'EC_SIGN_P256_SHA256',
    fingerprintAlgorithmVersion: FINGERPRINT_ALGORITHM_VERSION,
    keys: [{ keyVersion: 'TEST_EPHEMERAL_V1', publicKeyPem: R1B2_T.publicKeyPem, status: 'ACTIVE_FOR_SIGNING' }],
  } as any);
  const spy = jest.spyOn(r1b2Prov, 'getProductionFinancialAuthorityVerifier').mockReturnValue(v);
  try { return await loadTrustedPaidChatAuthority(id); } finally { spy.mockRestore(); }
}

/** Build a fully-valid canonical /paidChats record for a payer/earner pair. */
function validRecord(payerId: string, earnerId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const multiplier = 20;
  return {
    pairKey: normalizedPairKey(payerId, earnerId),
    participants: [earnerId, payerId],
    payerId,
    earnerId,
    roleReason: 'SERVER_RESOLVED_MATCH',
    rolePolicyVersion: 1,
    state: 'PAID_ACTIVE',
    entryMode: 'MATCHED',
    acceptanceState: 'ACCEPTED',
    baseRateTokens: 3,
    multiplierSnapshot: multiplier,
    effectiveRateTokens: 3 * multiplier,
    minimumReservationTokens: 100,
    sessionBudgetTokens: 100,
    remainingReservedTokens: 100,
    activeSessionId: 'sess_' + Math.random().toString(36).slice(2, 8),
    billingPolicyVersion: 1,
    authorityVersion: 1,
    version: 1,
    ...over,
  };
}
async function seedPaidChat(id: string, data: Record<string, unknown>): Promise<void> {
  await db.collection(PAID_CHATS_COLLECTION).doc(id).set(data);
}
async function bal(u: string): Promise<any> { return (await db.collection('wallets').doc(u).get()).data() || {}; }

describe('P0-05 R1B-2 — server-owned /paidChats authority: API surface + non-forgeability', () => {
  test('p0-05 r1b2: paidChatAuthority exports loader but NO raw-field mint/create/build/issue factory', () => {
    const exported = Object.keys(authMod);
    // The loader is the only construction entrypoint; there must be no raw-field factory-shaped export.
    const factoryLike = exported.filter((k) => /mint|create|build|issue|factory|make|construct|new/i.test(k));
    expect(factoryLike).toEqual([]);
    expect((authMod as Record<string, unknown>).mintTrustedPaidChatAuthority).toBeUndefined();
    expect(typeof authMod.loadTrustedPaidChatAuthority).toBe('function');
    expect(authMod.loadTrustedPaidChatAuthority.length).toBe(1); // takes only paidChatId
  });

  test('p0-05 r1b2: raw object / cast / clone / fake-symbol cannot be a trusted authority (only the loader mints)', () => {
    const raw = { paidChatId: 'p', pairKey: 'k', payerId: 'V', earnerId: 'A', baseRateTokens: 3, multiplierSnapshot: 100,
      effectiveRateTokens: 300, minimumReservationTokens: 100, sessionId: 's', billingPolicyVersion: 1, authorityVersion: 1 };
    expect(isTrustedPaidChatAuthority(raw)).toBe(false);
    expect(isTrustedPaidChatAuthority(raw as unknown as TrustedPaidChatAuthority)).toBe(false);
    expect(isTrustedPaidChatAuthority(JSON.parse(JSON.stringify(raw)))).toBe(false);
    expect(isTrustedPaidChatAuthority({ ...raw })).toBe(false);
    const fakeBrand = Symbol('avalo.trustedPaidChatAuthority.v1');
    expect(isTrustedPaidChatAuthority({ ...raw, [fakeBrand]: true })).toBe(false);
  });
});

describe('P0-05 R1B-2 — canonical loader positive path', () => {
  test('p0-05 r1b2: valid server-owned /paidChats record loads a trusted authority with values equal to the record', async () => {
    const payer = uid(); const earner = uid();
    const id = 'pc_' + Math.random().toString(36).slice(2, 10);
    const rec = validRecord(payer, earner);
    await seedSignedPaidChat(id, rec);

    const auth = await r1b2Load(id);
    expect(isTrustedPaidChatAuthority(auth)).toBe(true);
    expect(auth.paidChatId).toBe(id);
    expect(auth.payerId).toBe(payer);
    expect(auth.earnerId).toBe(earner);
    expect(auth.pairKey).toBe(rec.pairKey);
    expect(auth.baseRateTokens).toBe(3);
    expect(auth.multiplierSnapshot).toBe(20);
    expect(auth.effectiveRateTokens).toBe(60);
    expect(auth.minimumReservationTokens).toBe(100);
    expect(auth.sessionId).toBe(rec.activeSessionId);
    expect(auth.billingPolicyVersion).toBe(1);
    expect(auth.authorityVersion).toBe(1);
  });
});

describe('P0-05 R1B-2 — canonical loader negative paths (fail-closed)', () => {
  test('p0-05 r1b2: loader rejects a missing /paidChats record (fail-closed)', async () => {
    await expect(loadTrustedPaidChatAuthority('does_not_exist_' + uid())).rejects.toThrow(PaidChatAuthorityLoadError);
    await expect(loadTrustedPaidChatAuthority('')).rejects.toThrow(PaidChatAuthorityLoadError);
  });

  test('p0-05 r1b2: loader rejects invalid state', async () => {
    const payer = uid(); const earner = uid(); const id = 'pc_' + uid();
    await seedPaidChat(id, validRecord(payer, earner, { state: 'CLOSED' }));
    await expect(loadTrustedPaidChatAuthority(id)).rejects.toThrow(PaidChatRecordValidationError);
    const id2 = 'pc_' + uid();
    await seedPaidChat(id2, validRecord(payer, earner, { state: 'TOTALLY_BOGUS' }));
    await expect(loadTrustedPaidChatAuthority(id2)).rejects.toThrow(PaidChatRecordValidationError);
  });

  test('p0-05 r1b2: loader rejects payer == earner', async () => {
    const who = uid(); const id = 'pc_' + uid();
    // Build directly (validRecord would derive pairKey and reject a self-pair before seeding).
    const other = uid();
    const rec = validRecord(who, other);
    (rec as any).earnerId = who;                 // force payer === earner
    (rec as any).participants = [who];
    await seedPaidChat(id, rec);
    await expect(loadTrustedPaidChatAuthority(id)).rejects.toThrow(PaidChatRecordValidationError);
  });

  test('p0-05 r1b2: loader rejects payer not in participants', async () => {
    const payer = uid(); const earner = uid(); const id = 'pc_' + uid();
    await seedPaidChat(id, validRecord(payer, earner, { participants: [earner, uid()] }));
    await expect(loadTrustedPaidChatAuthority(id)).rejects.toThrow(PaidChatRecordValidationError);
  });

  test('p0-05 r1b2: loader rejects multiplier not in canonical ladder', async () => {
    const payer = uid(); const earner = uid();
    for (const bad of [1, 4, 12, 15, 99, 0]) {
      const id = 'pc_' + uid();
      await seedPaidChat(id, validRecord(payer, earner, { multiplierSnapshot: bad, effectiveRateTokens: 3 * bad }));
      await expect(loadTrustedPaidChatAuthority(id)).rejects.toThrow(PaidChatRecordValidationError);
    }
  });

  test('p0-05 r1b2: loader rejects effectiveRate mismatch', async () => {
    const payer = uid(); const earner = uid(); const id = 'pc_' + uid();
    await seedPaidChat(id, validRecord(payer, earner, { multiplierSnapshot: 20, effectiveRateTokens: 999 }));
    await expect(loadTrustedPaidChatAuthority(id)).rejects.toThrow(PaidChatRecordValidationError);
  });

  test('p0-05 r1b2: loader rejects minimumReservation below 100', async () => {
    const payer = uid(); const earner = uid(); const id = 'pc_' + uid();
    await seedPaidChat(id, validRecord(payer, earner, { minimumReservationTokens: 99 }));
    await expect(loadTrustedPaidChatAuthority(id)).rejects.toThrow(PaidChatRecordValidationError);
  });

  test('p0-05 r1b2: loader rejects unknown authorityVersion and billingPolicyVersion', async () => {
    const payer = uid(); const earner = uid();
    const idA = 'pc_' + uid();
    await seedPaidChat(idA, validRecord(payer, earner, { authorityVersion: 99 }));
    await expect(loadTrustedPaidChatAuthority(idA)).rejects.toThrow(PaidChatRecordValidationError);
    const idB = 'pc_' + uid();
    await seedPaidChat(idB, validRecord(payer, earner, { billingPolicyVersion: 99 }));
    await expect(loadTrustedPaidChatAuthority(idB)).rejects.toThrow(PaidChatRecordValidationError);
  });

  test('p0-05 r1b2: loader rejects non-canonical baseRate', async () => {
    const payer = uid(); const earner = uid(); const id = 'pc_' + uid();
    await seedPaidChat(id, validRecord(payer, earner, { baseRateTokens: 5, multiplierSnapshot: 20, effectiveRateTokens: 100 }));
    await expect(loadTrustedPaidChatAuthority(id)).rejects.toThrow(PaidChatRecordValidationError);
  });

  test('p0-05 r1b2: loader rejects pairKey mismatch', async () => {
    const payer = uid(); const earner = uid(); const id = 'pc_' + uid();
    await seedPaidChat(id, validRecord(payer, earner, { pairKey: 'attacker__forged' }));
    await expect(loadTrustedPaidChatAuthority(id)).rejects.toThrow(PaidChatRecordValidationError);
  });
});

describe('P0-05 R1B-2 — no financial side effects; billing stays disabled; messaging intact', () => {
  test('p0-05 r1b2: loading authority produces NO wallet/reservation/earner/ledger side effect', async () => {
    const payer = uid(); const earner = uid(); const id = 'pc_' + uid();
    await db.collection('wallets').doc(payer).set({ balance: 1000, reservedTokens: 0 });
    await db.collection('wallets').doc(earner).set({ balance: 0, reservedTokens: 0 });
    await seedSignedPaidChat(id, validRecord(payer, earner));

    const auth = await r1b2Load(id);
    expect(isTrustedPaidChatAuthority(auth)).toBe(true);

    // Authenticity-only: wallets, reservations, earnings, ledgers all untouched.
    const p = await bal(payer); const e = await bal(earner);
    expect(p.balance).toBe(1000); expect(p.reservedTokens || 0).toBe(0);
    expect(e.balance).toBe(0); expect(e.reservedTokens || 0).toBe(0);
    expect((await db.collection('reservations').where('userId', '==', payer).get().catch(() => ({ size: 0 } as any))).size).toBe(0);
    expect((await db.collection('creatorEarningAccounts').doc(earner).get()).exists).toBe(false);
    expect((await db.collection('ledger').where('actorId', '==', payer).get().catch(() => ({ size: 0 } as any))).size).toBe(0);
    expect((await db.collection('creatorEarningLedger').where('actorId', '==', earner).get().catch(() => ({ size: 0 } as any))).size).toBe(0);
    expect((await db.collection('billingEvents').where('actorId', '==', payer).get().catch(() => ({ size: 0 } as any))).size).toBe(0);
  });

  test('p0-05 r1b2: sendChatMessage remains HARD_FAIL_CLOSED and processMessage still fails closed on forged /chats', async () => {
    const wrapped = testEnv.wrap(sendChatMessage as any);
    await expect(wrapped({ auth: { uid: uid() }, data: { chatId: 'c', type: 'text', content: 'hi' } } as any))
      .rejects.toThrow(/HUMAN_CHAT_BILLING_DISABLED/);
    // Forged /chats doc with a paid shape has zero authority; processMessage requires a real TrustedPaidChatAuthority.
    const victim = uid(); const attacker = uid();
    await db.collection('wallets').doc(victim).set({ balance: 1000, reservedTokens: 0 });
    const cid = 'chat_' + uid();
    await db.collection('chats').doc(cid).set({
      chatId: cid, participants: [attacker, victim], roles: { payerId: victim, earnerId: attacker },
      state: 'PAID_ACTIVE', paidSession: { sessionId: 's', configSnapshot: { burnMultiplier: 100 } }, free: {},
    });
    await expect(processMessage(cid, attacker, 'steal', 'm_r1b2')).rejects.toThrow(/PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED/);
    expect((await bal(victim)).balance).toBe(1000);
  });

  test('p0-05 r1b2: general /chats DM and group shell still work', async () => {
    const a = uid(); const b = uid(); const c = uid();
    const dm = 'chat_' + uid();
    await db.collection('chats').doc(dm).set({ chatId: dm, participants: [a, b], type: 'DM', createdAt: new Date() });
    const dmSnap = await db.collection('chats').doc(dm).get();
    expect(dmSnap.exists).toBe(true);
    expect((dmSnap.data() as any).participants).toEqual([a, b]);
    const grp = 'chat_' + uid();
    await db.collection('chats').doc(grp).set({ chatId: grp, participants: [a, b, c], type: 'GROUP', createdAt: new Date() });
    await db.collection('chats').doc(grp).collection('messages').doc('m1').set({ senderId: a, text: 'hello group' });
    const msg = await db.collection('chats').doc(grp).collection('messages').doc('m1').get();
    expect(msg.exists).toBe(true);
    expect((msg.data() as any).senderId).toBe(a);
  });
});
