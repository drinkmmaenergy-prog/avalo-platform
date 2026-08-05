// P0-02 R2 — Firestore SECURITY RULES denial proof for AI billing financial state (emulator-backed, active rules).
//
// The canonical AI-spend financial state is server-only: `ai_spend_authorizations` (reservation lifecycle) has no
// client-write rule (default-deny), the canonical wallet (`wallets`, incl. `balance`/`reservedTokens`) is
// `allow write: if false`, and the canonical `ledger` is `read, write: if false`. These tests assert those
// denials behaviorally against the active rules file (infrastructure/firebase/firestore.rules).

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, RulesTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const RULES_PATH = resolve(__dirname, '../../../infrastructure/firebase/firestore.rules');
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const hostPort = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const [host, port] = hostPort.split(':');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-p0-02-rules',
    firestore: { rules: readFileSync(RULES_PATH, 'utf8'), host, port: Number(port) },
  });
});
afterAll(async () => { if (testEnv) { await testEnv.cleanup(); } });
beforeEach(async () => { await testEnv.clearFirestore(); });

async function seed(path: string, data: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore() as any, path), data); });
}

describe('P0-02 R2 — Firestore rules deny client AI-billing financial writes', () => {
  test('p0-02 rules: client cannot create ai_spend_authorizations doc', async () => {
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(setDoc(doc(db, 'ai_spend_authorizations/op1'), { userId: 'attacker', reservedTokens: 999999, state: 'PREAUTHORIZED' }));
  });

  test('p0-02 rules: client cannot update ai_spend_authorizations doc to settled', async () => {
    await seed('ai_spend_authorizations/op2', { userId: 'attacker', reservedTokens: 3, state: 'PREAUTHORIZED' });
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(updateDoc(doc(db, 'ai_spend_authorizations/op2'), { state: 'SETTLED', settledTokens: 0 }));
  });

  test('p0-02 rules: client cannot create wallet balance', async () => {
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(setDoc(doc(db, 'wallets/attacker'), { userId: 'attacker', balance: 999999 }));
  });

  test('p0-02 rules: client cannot inflate own wallet balance', async () => {
    await seed('wallets/attacker', { userId: 'attacker', balance: 0 });
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(updateDoc(doc(db, 'wallets/attacker'), { balance: 999999 }));
  });

  test('p0-02 rules: client cannot reduce own reservedTokens', async () => {
    await seed('wallets/attacker', { userId: 'attacker', balance: 0, reservedTokens: 3 });
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(updateDoc(doc(db, 'wallets/attacker'), { reservedTokens: 0, balance: 3 }));
  });

  test('p0-02 rules: client cannot write canonical ledger entry', async () => {
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(setDoc(doc(db, 'ledger/entry1'), { type: 'CHAT_RESPONSE_BURN', actorId: 'attacker', amountTokens: 0 }));
  });
});
