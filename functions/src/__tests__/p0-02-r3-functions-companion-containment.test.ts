// functions/src/__tests__/p0-02-r3-functions-companion-containment.test.ts
//
// P0-02 R3 — SAFE UNAVAILABLE CONTAINMENT of the legacy Functions AI companion callables.
//
// Codex R2 confirmed `sendAIMessage` (aiCompanionFunctions) invoked the AI provider BEFORE billing and mutated a
// NON-canonical wallet (`users/{uid}/wallet/current`). R3 fails those legacy callables closed. These emulator tests
// WRAP and INVOKE the real callables (firebase-functions-test) and prove: they reject/return-unavailable before any
// provider call, and perform ZERO wallet/ledger/earner mutation. The provider adapter is spied to prove 0 calls.

import { getFirestore } from 'firebase-admin/firestore';

// Spy the provider adapter so we can prove it is NEVER reached from the contained callables.
import * as aiGen from '../aiGenerationService';

import fft from 'firebase-functions-test';
import {
  LEGACY_AI_COMPANION_UNAVAILABLE,
  LegacyAiCompanionUnavailableError,
  assertLegacyAiCompanionUnavailable,
} from '../ai-billing/legacyAiCompanionContainment';
import { sendAIMessage } from '../aiCompanionFunctions';
import { sendAIMessageCallable } from '../aiCompanions';

const testEnv = fft();
const db = getFirestore();
const uid = () => 'u_' + Math.random().toString(36).slice(2, 10);

let providerSpy: jest.SpyInstance;
beforeAll(() => { providerSpy = jest.spyOn(aiGen, 'generateAIResponse').mockResolvedValue({ response: 'X', tokensCharged: 3 } as any); });
afterAll(() => { providerSpy.mockRestore(); testEnv.cleanup(); });
beforeEach(() => { providerSpy.mockClear(); });

async function legacyWallet(userId: string): Promise<any> {
  return (await db.collection('users').doc(userId).collection('wallet').doc('current').get()).data();
}

describe('P0-02 R3 — containment contract', () => {
  test('p0-02 r3: legacy companion containment guard throws unavailable', () => {
    expect(() => assertLegacyAiCompanionUnavailable()).toThrow(LegacyAiCompanionUnavailableError);
    expect(LEGACY_AI_COMPANION_UNAVAILABLE).toBe('AI_COMPANION_LEGACY_UNAVAILABLE_USE_CANONICAL_AI_ROUTE');
  });
});

describe('P0-02 R3 — sendAIMessage (aiCompanionFunctions) is safe-unavailable', () => {
  test('p0-02 r3: sendAIMessage authenticated request fails unavailable before any provider call', async () => {
    const u = uid();
    await db.collection('users').doc(u).collection('wallet').doc('current').set({ balance: 1000 });
    await db.collection('wallets').doc(u).set({ balance: 1000, reservedTokens: 0 });
    const wrapped = testEnv.wrap(sendAIMessage as any);
    await expect(wrapped({ auth: { uid: u }, data: { sessionId: 's1', message: 'hi', language: 'en' } } as any))
      .rejects.toThrow(LEGACY_AI_COMPANION_UNAVAILABLE);
    expect(providerSpy).toHaveBeenCalledTimes(0);
    // zero mutation: legacy nested wallet + canonical wallet + no ledger docs for user
    expect((await legacyWallet(u)).balance).toBe(1000);
    expect((await db.collection('wallets').doc(u).get()).data()?.balance).toBe(1000);
    expect((await db.collection('ledger').where('actorId', '==', u).get()).size).toBe(0);
  });

  test('p0-02 r3: sendAIMessage unauthenticated request rejected before provider', async () => {
    const wrapped = testEnv.wrap(sendAIMessage as any);
    await expect(wrapped({ auth: null, data: { sessionId: 's', message: 'x' } } as any)).rejects.toThrow();
    expect(providerSpy).toHaveBeenCalledTimes(0);
  });

  test('p0-02 r3: forged request fields cannot bypass sendAIMessage containment', async () => {
    const u = uid();
    await db.collection('users').doc(u).collection('wallet').doc('current').set({ balance: 500 });
    const wrapped = testEnv.wrap(sendAIMessage as any);
    await expect(wrapped({ auth: { uid: u }, data: { sessionId: 's', message: 'x', tokensCharged: 0, isFree: true, bypass: true } } as any))
      .rejects.toThrow(LEGACY_AI_COMPANION_UNAVAILABLE);
    expect(providerSpy).toHaveBeenCalledTimes(0);
    expect((await legacyWallet(u)).balance).toBe(500);
  });
});

describe('P0-02 R3 — sendAIMessageCallable (aiCompanions) is safe-unavailable', () => {
  test('p0-02 r3: sendAIMessageCallable authenticated request returns unavailable before any provider call', async () => {
    const u = uid();
    await db.collection('users').doc(u).collection('wallet').doc('current').set({ balance: 777 });
    const wrapped = testEnv.wrap(sendAIMessageCallable as any);
    const res: any = await wrapped({ auth: { uid: u }, data: { chatId: 'c1', text: 'hi' } } as any);
    expect(res.ok).toBe(false);
    expect(res.error).toBe(LEGACY_AI_COMPANION_UNAVAILABLE);
    expect(providerSpy).toHaveBeenCalledTimes(0);
    expect((await legacyWallet(u)).balance).toBe(777);
    expect((await db.collection('ledger').where('actorId', '==', u).get()).size).toBe(0);
  });

  test('p0-02 r3: sendAIMessageCallable unauthenticated request rejected before provider', async () => {
    const wrapped = testEnv.wrap(sendAIMessageCallable as any);
    const res: any = await wrapped({ auth: null, data: { chatId: 'c', text: 'x' } } as any);
    expect(res.ok).toBe(false);
    expect(providerSpy).toHaveBeenCalledTimes(0);
  });
});

describe('P0-02 R3 — global: no reachable billable Functions AI path mutates non-canonical wallet or earnings', () => {
  test('p0-02 r3: contained callables never write users wallet, ledger, creator earnings, advertiser credit, or payouts', async () => {
    const u = uid();
    await db.collection('users').doc(u).collection('wallet').doc('current').set({ balance: 100 });
    await db.collection('creator_earnings').doc(u).set({ balance: 100 });
    await db.collection('advertisers').doc('adv_' + u).set({ tokenBalance: 100 });
    await db.collection('payouts').doc('po_' + u).set({ amount: 100 });
    const w1 = testEnv.wrap(sendAIMessage as any);
    const w2 = testEnv.wrap(sendAIMessageCallable as any);
    await w1({ auth: { uid: u }, data: { sessionId: 's', message: 'x' } } as any).catch(() => undefined);
    await w2({ auth: { uid: u }, data: { chatId: 'c', text: 'x' } } as any).catch(() => undefined);
    expect(providerSpy).toHaveBeenCalledTimes(0);
    expect((await legacyWallet(u)).balance).toBe(100);
    expect((await db.collection('creator_earnings').doc(u).get()).data()?.balance).toBe(100);
    expect((await db.collection('advertisers').doc('adv_' + u).get()).data()?.tokenBalance).toBe(100);
    expect((await db.collection('payouts').doc('po_' + u).get()).data()?.amount).toBe(100);
  });
});
