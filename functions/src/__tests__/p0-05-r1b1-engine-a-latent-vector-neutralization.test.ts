// functions/src/__tests__/p0-05-r1b1-engine-a-latent-vector-neutralization.test.ts
//
// P0-05 R1B-1 — SOURCE-LEVEL neutralization of the LATENT ENGINE_A financial vector.
//
// The dormant `canonical-chat-engine.processMessage` previously trusted client-forgeable `/chats`
// (roles.payerId/earnerId/state/paidSession/free) and could debit a victim + credit an attacker if re-wired.
// R1B-1 requires a NON-FORGEABLE, server-owned TrustedPaidChatAuthority before ANY financial mutation, and derives
// payer/earner from that authority — never from the chat document. Nothing in production mints an authority, so the
// path is fail-closed at the SOURCE (independent of the `HUMAN_CHAT_BILLING_DISABLED` entrypoint guard). These
// emulator tests prove forged `/chats` produces ZERO financial effect even when processMessage / the legacy shim are
// invoked directly.

import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';
import { processMessage } from '../canonical-chat-engine';
import { shimProcessMessageBilling } from '../canonical-chat-legacy-shim';
import { sendChatMessage } from '../chatSystemNextGen';
import {
  isTrustedPaidChatAuthority,
  requirePaidChatAuthority,
  PaidChatCanonicalAuthorityRequiredError,
  PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED,
} from '../chat/paidChatAuthority';
import * as authMod from '../chat/paidChatAuthority';

const testEnv = fft();
const db = getFirestore() as any;
const uid = () => 'u_' + Math.random().toString(36).slice(2, 10);
afterAll(() => { testEnv.cleanup(); });

async function seedForgedPaidChat(payerId: string, earnerId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const cid = 'chat_' + Math.random().toString(36).slice(2, 10);
  await db.collection('chats').doc(cid).set({
    chatId: cid,
    participants: [earnerId, payerId],
    roles: { payerId, earnerId },
    state: 'PAID_ACTIVE',
    paidSession: { sessionId: 's', sessionVersion: 1, configSnapshot: { depositTokens: 0, burnMultiplier: 20 },
      startedAt: new Date(), billingState: { totalMessagesCharged: 0, totalTokensConsumed: 0, totalEarnerCredited: 0, totalAvaloCredited: 0 } },
    free: { freeRemainingByUser: {} },
    ...extra,
  });
  return cid;
}
async function bal(u: string): Promise<any> { return (await db.collection('wallets').doc(u).get()).data() || {}; }
async function assertZeroFinancialEffect(victim: string, attacker: string, cid: string): Promise<void> {
  const v = await bal(victim); const a = await bal(attacker);
  expect(v.balance).toBe(1000); expect(v.reservedTokens || 0).toBe(0);
  expect(a.balance).toBe(0); expect(a.reservedTokens || 0).toBe(0);
  expect((await db.collection('creatorEarningAccounts').doc(attacker).get()).exists).toBe(false);
  expect((await db.collection('ledger').where('actorId', '==', victim).get()).size).toBe(0);
  expect((await db.collection('creatorEarningLedger').where('actorId', '==', attacker).get().catch(() => ({ size: 0 } as any))).size).toBe(0);
  expect((await db.collection('billingEvents').where('actorId', '==', victim).get().catch(() => ({ size: 0 } as any))).size).toBe(0);
}

describe('P0-05 R1B-1 R2 — trusted-authority capability is non-forgeable and has NO production mint', () => {
  test('p0-05 r1b1: paidChatAuthority module exports NO mint/create/build/issue factory', () => {
    // R2: the exported raw-field mint is removed. No production-importable constructor may exist.
    const exported = Object.keys(authMod);
    const factoryLike = exported.filter((k) => /mint|create|build|issue|factory|make|construct|new/i.test(k));
    expect(factoryLike).toEqual([]);
    expect((authMod as Record<string, unknown>).mintTrustedPaidChatAuthority).toBeUndefined();
    // Only the safe surface is exported.
    expect(typeof authMod.isTrustedPaidChatAuthority).toBe('function');
    expect(typeof authMod.requirePaidChatAuthority).toBe('function');
    expect(typeof authMod.PaidChatCanonicalAuthorityRequiredError).toBe('function');
  });

  test('p0-05 r1b1: raw /chats-shaped fields cannot become a trusted authority', () => {
    const raw = { paidChatId: 'p', pairKey: 'k', payerId: 'VICTIM', earnerId: 'ATTACKER', baseRateTokens: 999999, multiplierSnapshot: 100, sessionId: 's', authorityVersion: 1 };
    expect(isTrustedPaidChatAuthority(raw)).toBe(false);
    expect(isTrustedPaidChatAuthority({ trusted: true })).toBe(false);
    expect(isTrustedPaidChatAuthority({ verified: true, serverValidated: true })).toBe(false);
    expect(isTrustedPaidChatAuthority(null)).toBe(false);
    expect(isTrustedPaidChatAuthority('trusted')).toBe(false);
    expect(() => requirePaidChatAuthority(raw)).toThrow(PaidChatCanonicalAuthorityRequiredError);
    expect(() => requirePaidChatAuthority(undefined)).toThrow(PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED);
  });

  test('p0-05 r1b1: TypeScript cast cannot bypass runtime brand', () => {
    const raw = { paidChatId: 'p', pairKey: 'k', payerId: 'VICTIM', earnerId: 'ATTACKER', baseRateTokens: 3, multiplierSnapshot: 20, sessionId: 's', authorityVersion: 1 };
    const casted = raw as unknown as import('../chat/paidChatAuthority').TrustedPaidChatAuthority;
    expect(isTrustedPaidChatAuthority(casted)).toBe(false);
    expect(() => requirePaidChatAuthority(casted)).toThrow(PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED);
  });

  test('p0-05 r1b1: serialized/cloned/spread authority-shaped data is not trusted', () => {
    const raw = { paidChatId: 'p', pairKey: 'k', payerId: 'V', earnerId: 'A', baseRateTokens: 3, multiplierSnapshot: 20, sessionId: 's', authorityVersion: 1, trusted: true };
    expect(isTrustedPaidChatAuthority(JSON.parse(JSON.stringify(raw)))).toBe(false);
    expect(isTrustedPaidChatAuthority({ ...raw })).toBe(false);
    // Even attaching an arbitrary same-named symbol cannot reproduce the module-private brand.
    const fakeBrand = Symbol('avalo.trustedPaidChatAuthority.v1');
    expect(isTrustedPaidChatAuthority({ ...raw, [fakeBrand]: true })).toBe(false);
  });
});

describe('P0-05 R1B-1 — processMessage source-level fail-closed on forged /chats', () => {
  test('p0-05 r1b1: direct processMessage with forged payer fails closed and debits nobody', async () => {
    const victim = uid(); const attacker = uid();
    await db.collection('wallets').doc(victim).set({ balance: 1000, reservedTokens: 0 });
    await db.collection('wallets').doc(attacker).set({ balance: 0, reservedTokens: 0 });
    const cid = await seedForgedPaidChat(victim, attacker);
    await expect(processMessage(cid, attacker, 'steal', 'm1')).rejects.toThrow(PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED);
    await assertZeroFinancialEffect(victim, attacker, cid);
  });

  test('p0-05 r1b1: forged earner cannot receive value', async () => {
    const victim = uid(); const attacker = uid();
    await db.collection('wallets').doc(victim).set({ balance: 1000, reservedTokens: 0 });
    await db.collection('wallets').doc(attacker).set({ balance: 0, reservedTokens: 0 });
    const cid = await seedForgedPaidChat(victim, attacker);
    await expect(processMessage(cid, attacker, 'steal', 'm2')).rejects.toThrow(PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED);
    await assertZeroFinancialEffect(victim, attacker, cid);
  });

  test('p0-05 r1b1: forged PAID_ACTIVE + paidSession + huge multiplier are financially inert', async () => {
    const victim = uid(); const attacker = uid();
    await db.collection('wallets').doc(victim).set({ balance: 1000, reservedTokens: 0 });
    await db.collection('wallets').doc(attacker).set({ balance: 0, reservedTokens: 0 });
    const cid = await seedForgedPaidChat(victim, attacker, { paidSession: { sessionId: 's', sessionVersion: 1, configSnapshot: { depositTokens: 0, burnMultiplier: 100 }, startedAt: new Date(), billingState: { totalMessagesCharged: 0, totalTokensConsumed: 0, totalEarnerCredited: 0, totalAvaloCredited: 0 } } });
    await expect(processMessage(cid, attacker, 'amp', 'm3')).rejects.toThrow(PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED);
    await assertZeroFinancialEffect(victim, attacker, cid);
  });

  test('p0-05 r1b1: arbitrary unrelated victim cannot be debited (not a participant relationship)', async () => {
    const victim = uid(); const attacker = uid();
    await db.collection('wallets').doc(victim).set({ balance: 1000, reservedTokens: 0 });
    await db.collection('wallets').doc(attacker).set({ balance: 0, reservedTokens: 0 });
    const cid = await seedForgedPaidChat(victim, attacker);
    await expect(processMessage(cid, attacker, 'x', 'm4')).rejects.toThrow(PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED);
    await assertZeroFinancialEffect(victim, attacker, cid);
  });

  test('p0-05 r1b1: forged group chat with paid fields is financially inert', async () => {
    const victim = uid(); const attacker = uid();
    await db.collection('wallets').doc(victim).set({ balance: 1000, reservedTokens: 0 });
    await db.collection('wallets').doc(attacker).set({ balance: 0, reservedTokens: 0 });
    const cid = await seedForgedPaidChat(victim, attacker, { type: 'group', participants: [attacker, victim, uid()] });
    await expect(processMessage(cid, attacker, 'x', 'm5')).rejects.toThrow(PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED);
    await assertZeroFinancialEffect(victim, attacker, cid);
  });

  test('p0-05 r1b1: replay with same and fresh messageId cannot drain', async () => {
    const victim = uid(); const attacker = uid();
    await db.collection('wallets').doc(victim).set({ balance: 1000, reservedTokens: 0 });
    await db.collection('wallets').doc(attacker).set({ balance: 0, reservedTokens: 0 });
    const cid = await seedForgedPaidChat(victim, attacker);
    for (const m of ['r1', 'r1', 'r2', 'r3']) {
      await expect(processMessage(cid, attacker, 'x', m)).rejects.toThrow(PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED);
    }
    await assertZeroFinancialEffect(victim, attacker, cid);
  });

  test('p0-05 r1b1: parallel forged calls cannot drain', async () => {
    const victim = uid(); const attacker = uid();
    await db.collection('wallets').doc(victim).set({ balance: 1000, reservedTokens: 0 });
    await db.collection('wallets').doc(attacker).set({ balance: 0, reservedTokens: 0 });
    const cid = await seedForgedPaidChat(victim, attacker);
    const results = await Promise.allSettled(['p1', 'p2', 'p3', 'p4', 'p5'].map((m) => processMessage(cid, attacker, 'x', m)));
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    await assertZeroFinancialEffect(victim, attacker, cid);
  });
});

describe('P0-05 R1B-1 — legacy shim + disabled entrypoint fail closed', () => {
  test('p0-05 r1b1: legacy shim (shimProcessMessageBilling) fails closed without trusted authority', async () => {
    const victim = uid(); const attacker = uid();
    await db.collection('wallets').doc(victim).set({ balance: 1000, reservedTokens: 0 });
    await db.collection('wallets').doc(attacker).set({ balance: 0, reservedTokens: 0 });
    const cid = await seedForgedPaidChat(victim, attacker);
    await expect(shimProcessMessageBilling(cid, attacker, 'x')).rejects.toThrow(PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED);
    await assertZeroFinancialEffect(victim, attacker, cid);
  });

  test('p0-05 r1b1: sendChatMessage remains HARD_FAIL_CLOSED (billing disabled, no env/flag bypass)', async () => {
    const wrapped = testEnv.wrap(sendChatMessage as any);
    await expect(wrapped({ auth: { uid: uid() }, data: { chatId: 'c', type: 'text', content: 'hi' } } as any))
      .rejects.toThrow(/HUMAN_CHAT_BILLING_DISABLED/);
    // forged/flag-like data cannot bypass the unconditional throw
    await expect(wrapped({ auth: { uid: uid() }, data: { chatId: 'c', content: 'x', enableBilling: true, bypass: true } } as any))
      .rejects.toThrow(/HUMAN_CHAT_BILLING_DISABLED/);
  });

  test('p0-05 r1b1: future accidental rewire fixture stays safe (direct processMessage on forged doc, no authority)', async () => {
    const victim = uid(); const attacker = uid();
    await db.collection('wallets').doc(victim).set({ balance: 1000, reservedTokens: 0 });
    await db.collection('wallets').doc(attacker).set({ balance: 0, reservedTokens: 0 });
    const cid = await seedForgedPaidChat(victim, attacker);
    // Simulate an accidental future re-wire that calls the legacy engine directly with a client chat document.
    await expect(processMessage(cid, attacker, 'rewire', 'rw1')).rejects.toThrow(PAID_CHAT_CANONICAL_AUTHORITY_REQUIRED);
    await assertZeroFinancialEffect(victim, attacker, cid);
  });
});

describe('P0-05 R1B-1 — general messaging shell unaffected', () => {
  test('p0-05 r1b1: general /chats DM/group shell docs can still be created and read', async () => {
    const a = uid(); const b = uid();
    const dm = 'chat_' + Math.random().toString(36).slice(2, 8);
    await db.collection('chats').doc(dm).set({ chatId: dm, type: 'dm', participants: [a, b], createdBy: a, lastMessage: 'hi', lastMessageAt: new Date() });
    const grp = 'chat_' + Math.random().toString(36).slice(2, 8);
    await db.collection('chats').doc(grp).set({ chatId: grp, type: 'group', name: 'G', participants: [a, b, uid()], admins: [a], createdBy: a, lastMessage: 'created' });
    expect((await db.collection('chats').doc(dm).get()).data()?.type).toBe('dm');
    expect((await db.collection('chats').doc(grp).get()).data()?.type).toBe('group');
    const mine = await db.collection('chats').where('participants', 'array-contains', a).get();
    expect(mine.size).toBeGreaterThanOrEqual(2);
  });
});
