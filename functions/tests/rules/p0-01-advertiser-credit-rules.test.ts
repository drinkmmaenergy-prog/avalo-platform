// P0-01 R3 — Firestore SECURITY RULES denial proof (emulator-backed, active rules file).
//
// Proves that an authenticated CLIENT (Web SDK, subject to security rules) cannot perform any advertiser-credit
// financial write. The active rules file is the one firebase.json points at: infrastructure/firebase/firestore.rules.
// Advertiser-credit collections (advertisers.tokenBalance, advertiserCreditLedger, advertiserCreditBarriers,
// adRefunds, adTransactions) have NO matching rule and there is NO root catch-all, so Firestore v2 default-deny
// applies. These tests assert that denial behaviorally, not by source inspection.
//
// Server writes (Admin SDK) bypass rules and are irrelevant here; advertiser-credit creation is separately
// UNAVAILABLE in application code (see p0-01-advertiser-credit-authorization.test.ts). No secrets/provider access.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const RULES_PATH = resolve(__dirname, '../../../infrastructure/firebase/firestore.rules');
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const hostPort = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const [host, port] = hostPort.split(':');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-p0-01-rules',
    firestore: { rules: readFileSync(RULES_PATH, 'utf8'), host, port: Number(port) },
  });
});

afterAll(async () => { if (testEnv) { await testEnv.cleanup(); } });
beforeEach(async () => { await testEnv.clearFirestore(); });

async function seed(path: string, data: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as any, path), data);
  });
}

describe('P0-01 R3 — Firestore rules deny client advertiser-financial writes', () => {
  test('p0-01 R3 rules: client cannot create advertisers doc with tokenBalance', async () => {
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(setDoc(doc(db, 'advertisers/adv1'), { advertiserId: 'adv1', tokenBalance: 999999 }));
  });

  test('p0-01 R3 rules: client cannot update advertiser tokenBalance', async () => {
    await seed('advertisers/adv2', { advertiserId: 'adv2', tokenBalance: 0 });
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(updateDoc(doc(db, 'advertisers/adv2'), { tokenBalance: 999999 }));
  });

  test('p0-01 R3 rules: client cannot create advertiserCreditLedger doc', async () => {
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(setDoc(doc(db, 'advertiserCreditLedger/l1'), { amountTokens: 999999, class: 'ADMIN_ADJUSTMENT_CREDIT' }));
  });

  test('p0-01 R3 rules: client cannot update advertiserCreditLedger doc', async () => {
    await seed('advertiserCreditLedger/l2', { amountTokens: 1 });
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(updateDoc(doc(db, 'advertiserCreditLedger/l2'), { amountTokens: 999999 }));
  });

  test('p0-01 R3 rules: client cannot delete advertiserCreditLedger doc', async () => {
    await seed('advertiserCreditLedger/l3', { amountTokens: 1 });
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(deleteDoc(doc(db, 'advertiserCreditLedger/l3')));
  });

  test('p0-01 R3 rules: client cannot create advertiserCreditBarriers doc', async () => {
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(setDoc(doc(db, 'advertiserCreditBarriers/b1'), { ledgerTxId: 'x', balanceAfter: 999999 }));
  });

  test('p0-01 R3 rules: client cannot update advertiserCreditBarriers doc', async () => {
    await seed('advertiserCreditBarriers/b2', { ledgerTxId: 'x' });
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(updateDoc(doc(db, 'advertiserCreditBarriers/b2'), { balanceAfter: 999999 }));
  });

  test('p0-01 R3 rules: client cannot create adRefunds doc', async () => {
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(setDoc(doc(db, 'adRefunds/r1'), { amount: 999999 }));
  });

  test('p0-01 R3 rules: client cannot create adTransactions (funding/reversal) doc', async () => {
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(setDoc(doc(db, 'adTransactions/t1'), { advertiserId: 'adv1', amount: 999999 }));
  });

  test('p0-01 R3 rules: client cannot modify another advertiser campaign financial fields', async () => {
    // ad_campaigns is client-OWNED campaign metadata by pre-existing design (not an advertiser-credit store);
    // a NON-owner still cannot modify its financial fields.
    await seed('ad_campaigns/c1', { advertiserId: 'owner-uid', budgetTokens: 100 });
    const db = testEnv.authenticatedContext('attacker').firestore() as any;
    await assertFails(updateDoc(doc(db, 'ad_campaigns/c1'), { budgetTokens: 999999 }));
  });
});
