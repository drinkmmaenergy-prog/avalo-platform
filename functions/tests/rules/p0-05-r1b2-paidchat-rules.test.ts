// P0-05 R1B-2 — Firestore SECURITY RULES denial proof for the server-owned `/paidChats` authority domain.
//
// `/paidChats` is server-owned financial authority. The active rules file has NO client-write (or read) rule for it,
// so Firestore default-deny governs: clients cannot create, update, delete, or read `/paidChats`. These tests assert
// those denials behaviorally against the active rules file (infrastructure/firebase/firestore.rules), and confirm the
// general `/chats` messaging shell still works while its server-billing fields remain client-unwritable.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

const RULES_PATH = resolve(__dirname, '../../../infrastructure/firebase/firestore.rules');
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const hostPort = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const [host, port] = hostPort.split(':');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-p0-05-r1b2-rules',
    firestore: { rules: readFileSync(RULES_PATH, 'utf8'), host, port: Number(port) },
  });
});
afterAll(async () => { if (testEnv) { await testEnv.cleanup(); } });
beforeEach(async () => { await testEnv.clearFirestore(); });

async function seed(path: string, data: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore() as any, path), data); });
}

describe('P0-05 R1B-2 — Firestore rules: /paidChats is server-only (default-deny)', () => {
  test('p0-05 r1b2 rules: authenticated client cannot create /paidChats', async () => {
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(setDoc(doc(db, 'paidChats/pc1'), {
      payerId: 'victim', earnerId: 'attacker', multiplierSnapshot: 100, effectiveRateTokens: 300, state: 'PAID_ACTIVE',
    }));
  });

  test('p0-05 r1b2 rules: client cannot update /paidChats', async () => {
    await seed('paidChats/pc2', { payerId: 'victim', earnerId: 'creator', multiplierSnapshot: 2, state: 'PAID_ACTIVE' });
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(updateDoc(doc(db, 'paidChats/pc2'), { multiplierSnapshot: 100, payerId: 'attacker' }));
  });

  test('p0-05 r1b2 rules: client cannot delete /paidChats', async () => {
    await seed('paidChats/pc3', { payerId: 'victim', earnerId: 'creator', state: 'PAID_ACTIVE' });
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(deleteDoc(doc(db, 'paidChats/pc3')));
  });

  test('p0-05 r1b2 rules: client cannot read /paidChats (server-only in R1B-2)', async () => {
    await seed('paidChats/pc4', { payerId: 'participant', earnerId: 'creator', state: 'PAID_ACTIVE',
      participants: ['participant', 'creator'] });
    // Even a listed participant cannot read in R1B-2 — reads are not yet exposed to clients (deferred to R1E facade).
    const asParticipant = testEnv.authenticatedContext('participant').firestore() as any;
    await assertFails(getDoc(doc(asParticipant, 'paidChats/pc4')));
    const asOutsider = testEnv.authenticatedContext('outsider').firestore() as any;
    await assertFails(getDoc(doc(asOutsider, 'paidChats/pc4')));
  });
});

describe('P0-05 R1B-2 — general /chats messaging shell unaffected', () => {
  test('p0-05 r1b2 rules: /chats general shell create still works for an authenticated client', async () => {
    const db = testEnv.authenticatedContext('alice').firestore() as any;
    await assertSucceeds(setDoc(doc(db, 'chats/dm1'), {
      chatId: 'dm1', type: 'DM', participants: ['alice', 'bob'], createdBy: 'alice', lastMessage: 'hi',
    }));
  });

  test('p0-05 r1b2 rules: forged server-billing fields on /chats create are rejected by rules', async () => {
    const db = testEnv.authenticatedContext('alice').firestore() as any;
    await assertFails(setDoc(doc(db, 'chats/dm2'), {
      chatId: 'dm2', type: 'DM', participants: ['alice', 'bob'], burnMultiplier: 100, configSnapshot: { depositTokens: 0 },
    }));
  });
});
