// functions/src/__tests__/p0-05-r1a1-c5-containment.test.ts
//
// P0-05 R1A-1 — SAFE UNAVAILABLE CONTAINMENT of the EXPORTED c5 direct-chat callable entrypoints
// (functions/src/chat/canonicalDirectChatCallables.ts).
//
// The c5 callables are EXPORTED but have NO shipped client caller, and they read/write paid-chat authority from the
// CLIENT-WRITABLE `/chats` collection with independent wallet-reservation + creatorEarningLedger authority — an
// unsafe, forgeable, colliding surface. These emulator tests WRAP and INVOKE the real callables
// (firebase-functions-test) and prove every c5 callable fails closed (deterministic 'unavailable') BEFORE any
// /chats read/write, wallet reservation/debit, ledger write, creator-earning write, chatSessions/billingEvents
// write, or rate/multiplier/state mutation. The retained c5 LOGIC modules remain importable (future canonical basis).

import { getFirestore } from 'firebase-admin/firestore';
import fft from 'firebase-functions-test';
import {
  C5_DIRECT_CHAT_UNAVAILABLE,
  assertC5DirectChatUnavailable,
} from '../chat/c5DirectChatContainment';
import {
  c5_startMatchedChat,
  c5_requestPaidChat,
  c5_creatorAcceptPaidChat,
  c5_creatorDeclinePaidChat,
  c5_openPaidSessionCall,
  c5_sendFanMessage,
  c5_deliverCreatorMessage,
  c5_fundNewSegment,
  c5_closePaidSessionCall,
  c5_proposeRateChange,
  c5_resolveRateProposal,
  c5_submitFanCounteroffer,
  c5_resolveCounteroffer,
  c5_proposeSessionEnd,
  c5_resolveSessionEnd,
} from '../chat/canonicalDirectChatCallables';

const testEnv = fft();
const db = getFirestore() as any;
const uid = () => 'u_' + Math.random().toString(36).slice(2, 10);
afterAll(() => { testEnv.cleanup(); });

// Invoke a wrapped c5 callable and return the promise (so tests can assert rejection).
function callC5(fn: any, data: Record<string, unknown>, authUid: string | null): Promise<unknown> {
  const wrapped = testEnv.wrap(fn as any);
  return wrapped({ auth: authUid ? { uid: authUid } : null, data } as any);
}

// Seed a forged paid-chat-shaped /chats doc + a canonical wallet; return ids for zero-mutation assertions.
async function seedForgedChatAndWallet(): Promise<{ u: string; cid: string; forged: any }> {
  const u = uid();
  const cid = 'chat_' + Math.random().toString(36).slice(2, 10);
  const forged = {
    chatId: cid, state: 'PAID_ACTIVE', fanId: u, creatorId: 'victim_' + u,
    participants: [u, 'victim_' + u], freeMessagesRemaining: { [u]: 999999 },
    entryMode: 'MATCHED', activeReservationId: 'forged', remainingReservedTokens: 999,
  };
  await db.collection('chats').doc(cid).set(forged);
  await db.collection('wallets').doc(u).set({ balance: 1000, reservedTokens: 0 });
  return { u, cid, forged };
}
async function noMutation(u: string, cid: string, forged: any): Promise<void> {
  // /chats doc byte-stable (no server write); canonical wallet untouched; zero economic docs for the user.
  expect((await db.collection('chats').doc(cid).get()).data()).toEqual(forged);
  const w = (await db.collection('wallets').doc(u).get()).data();
  expect(w.balance).toBe(1000); expect(w.reservedTokens).toBe(0);
  expect((await db.collection('chats').doc(cid).collection('messages').get()).size).toBe(0);
  for (const c of ['ledger', 'creatorEarningLedger', 'creatorEarningAccounts', 'chatSessions', 'billingEvents']) {
    const snap = await db.collection(c).where('actorId', '==', u).get().catch(() => ({ size: 0 } as any));
    expect(snap.size).toBe(0);
  }
}

describe('P0-05 R1A-1 — c5 containment contract', () => {
  test('p0-05 r1a1: c5 containment guard throws unavailable', () => {
    // Guard throws a Firebase HttpsError('unavailable', ...) so callables surface the proper 'unavailable' code.
    expect(() => assertC5DirectChatUnavailable()).toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    let code: unknown;
    try { assertC5DirectChatUnavailable(); } catch (e) { code = (e as { code?: unknown }).code; }
    expect(code).toBe('unavailable');
    expect(C5_DIRECT_CHAT_UNAVAILABLE).toBe('P0_05_C5_DIRECT_CHAT_UNAVAILABLE_PENDING_CANONICAL_ENGINE');
  });
});

describe('P0-05 R1A-1 — every exported c5 callable is safe-unavailable with zero side effects', () => {
  test('p0-05 r1a1: c5_startMatchedChat is safe-unavailable with zero side effects', async () => {
    const { u, cid, forged } = await seedForgedChatAndWallet();
    await expect(callC5(c5_startMatchedChat, { chatId: cid, fanId: u, creatorId: 'victim_' + u, idempotencyKey: 'idem-key-123456' }, u))
      .rejects.toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    await noMutation(u, cid, forged);
  });

  test('p0-05 r1a1: c5_requestPaidChat is safe-unavailable', async () => {
    const { u, cid, forged } = await seedForgedChatAndWallet();
    await expect(callC5(c5_requestPaidChat, { chatId: cid, creatorId: 'victim_' + u, idempotencyKey: 'idem-key-123456' }, u))
      .rejects.toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    await noMutation(u, cid, forged);
  });

  test('p0-05 r1a1: c5_creatorAcceptPaidChat is safe-unavailable', async () => {
    const { u, cid, forged } = await seedForgedChatAndWallet();
    await expect(callC5(c5_creatorAcceptPaidChat, { chatId: cid }, 'victim_' + u)).rejects.toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    await noMutation(u, cid, forged);
  });

  test('p0-05 r1a1: c5_creatorDeclinePaidChat is safe-unavailable', async () => {
    const { u, cid, forged } = await seedForgedChatAndWallet();
    await expect(callC5(c5_creatorDeclinePaidChat, { chatId: cid }, 'victim_' + u)).rejects.toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    await noMutation(u, cid, forged);
  });

  test('p0-05 r1a1: c5_openPaidSessionCall is safe-unavailable (no reservation)', async () => {
    const { u, cid, forged } = await seedForgedChatAndWallet();
    await expect(callC5(c5_openPaidSessionCall, { chatId: cid, multiplier: 2, idempotencyKey: 'idem-key-123456' }, u))
      .rejects.toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    await noMutation(u, cid, forged); // reservedTokens stayed 0 -> no reservation
  });

  test('p0-05 r1a1: c5_sendFanMessage is safe-unavailable', async () => {
    const { u, cid, forged } = await seedForgedChatAndWallet();
    await expect(callC5(c5_sendFanMessage, { chatId: cid, content: { text: 'x' }, messageId: 'm1', idempotencyKey: 'idem-key-123456' }, u))
      .rejects.toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    await noMutation(u, cid, forged);
  });

  test('p0-05 r1a1: c5_deliverCreatorMessage is safe-unavailable (no earning)', async () => {
    const { u, cid, forged } = await seedForgedChatAndWallet();
    await expect(callC5(c5_deliverCreatorMessage, { chatId: cid, content: { text: 'x' }, messageId: 'm1', idempotencyKey: 'idem-key-123456' }, 'victim_' + u))
      .rejects.toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    await noMutation(u, cid, forged);
  });

  test('p0-05 r1a1: c5_fundNewSegment is safe-unavailable', async () => {
    const { u, cid, forged } = await seedForgedChatAndWallet();
    await expect(callC5(c5_fundNewSegment, { chatId: cid, idempotencyKey: 'idem-key-123456' }, u)).rejects.toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    await noMutation(u, cid, forged);
  });

  test('p0-05 r1a1: c5_closePaidSessionCall is safe-unavailable', async () => {
    const { u, cid, forged } = await seedForgedChatAndWallet();
    await expect(callC5(c5_closePaidSessionCall, { chatId: cid, idempotencyKey: 'idem-key-123456' }, u)).rejects.toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    await noMutation(u, cid, forged);
  });

  test('p0-05 r1a1: c5 rate and session-end wrappers are safe-unavailable', async () => {
    const { u, cid, forged } = await seedForgedChatAndWallet();
    const wrappers = [
      [c5_proposeRateChange, { chatId: cid, fanId: 'victim_' + u, currentMultiplier: 2, proposedMultiplier: 3, triggerCondition: 't' }],
      [c5_resolveRateProposal, { chatId: cid, proposalId: 'p1', resolution: 'accept' }],
      [c5_submitFanCounteroffer, { chatId: cid, proposalId: 'p1', counterMultiplier: 2 }],
      [c5_resolveCounteroffer, { chatId: cid, proposalId: 'p1', resolution: 'accept' }],
      [c5_proposeSessionEnd, { chatId: cid }],
      [c5_resolveSessionEnd, { chatId: cid, proposalId: 'p1', resolution: 'accept' }],
    ] as const;
    for (const [fn, data] of wrappers) {
      await expect(callC5(fn, data as any, u)).rejects.toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    }
    await noMutation(u, cid, forged);
  });

  test('p0-05 r1a1: forged chatId/fanId/creatorId/state cannot bypass c5 containment', async () => {
    const { u, cid, forged } = await seedForgedChatAndWallet();
    // Adversarial payload with bypass-looking fields; still fails closed.
    await expect(callC5(c5_openPaidSessionCall, { chatId: cid, multiplier: 100, idempotencyKey: 'idem-key-123456', bypass: true, isFree: true, state: 'PAID_ACTIVE', fanId: u, creatorId: 'victim_' + u }, u))
      .rejects.toThrow(C5_DIRECT_CHAT_UNAVAILABLE);
    await noMutation(u, cid, forged);
  });

  test('p0-05 r1a1: c5 containment performs zero wallet, ledger, earning, session, or /chats mutation', async () => {
    const u = uid();
    await db.collection('wallets').doc(u).set({ balance: 500, reservedTokens: 0 });
    await db.collection('creatorEarningAccounts').doc(u).set({ pendingEarningTokens: 7, actorId: u });
    const before = (await db.collection('creatorEarningAccounts').doc(u).get()).data();
    await callC5(c5_startMatchedChat, { chatId: 'c', fanId: u, creatorId: 'v', idempotencyKey: 'idem-key-123456' }, u).catch(() => undefined);
    await callC5(c5_deliverCreatorMessage, { chatId: 'c', content: { text: 'x' }, messageId: 'm', idempotencyKey: 'idem-key-123456' }, u).catch(() => undefined);
    expect((await db.collection('wallets').doc(u).get()).data()).toEqual({ balance: 500, reservedTokens: 0 });
    expect((await db.collection('creatorEarningAccounts').doc(u).get()).data()).toEqual(before);
  });
});

describe('P0-05 R1A-1 — retained c5 logic modules are preserved (future canonical basis)', () => {
  test('p0-05 r1a1: retained c5 logic modules remain importable (state machine + multiplier tiers)', async () => {
    const sm: any = await import('../chat/canonicalChatStateMachineV3');
    const mt: any = await import('../chat/canonicalMultiplierTiers');
    expect(typeof sm.openPaidSession).toBe('function');
    expect(typeof sm.deliverPaidResponse).toBe('function');
    expect(sm.FREE_MESSAGES_PER_USER).toBe(3);
    expect(typeof mt.assertMultiplierEligibility).toBe('function');
    expect(mt.CONSENT_REQUIRED_MULTIPLIER_THRESHOLD).toBeDefined();
  });
});
