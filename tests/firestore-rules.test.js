/**
 * AVALO — Firestore Security Rules Test Suite (P3)
 *
 * Tests canonical wallet collections, creator earning accounts,
 * and explicit denial of forbidden legacy paths.
 *
 * Requires: Firebase Emulator (Firestore on :8080)
 * Run: firebase emulators:exec --only firestore "node tests/firestore-rules.test.js"
 */

const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');
const { resolve } = require('path');
const assert = require('assert');

const PROJECT_ID = 'avalo-test';

let testEnv;

async function main() {
  console.log('Setting up Firestore rules test environment...');

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  const results = { passed: 0, failed: 0, errors: [] };

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      results.passed++;
    } catch (e) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${e.message}`);
      results.failed++;
      results.errors.push({ name, error: e.message });
    }
    await testEnv.clearFirestore();
  }

  // ── wallets/{uid} ─────────────────────────────────────────────────────────
  console.log('\n§ wallets/{uid} — canonical consumer wallet');

  await test('owner can read own wallet', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('wallets').doc('alice')
        .set({ balance: 100, reservedTokens: 0, updatedAt: new Date() });
    });
    await assertSucceeds(alice.firestore().collection('wallets').doc('alice').get());
  });

  await test('other user cannot read another wallet', async () => {
    const bob = testEnv.authenticatedContext('bob');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('wallets').doc('alice')
        .set({ balance: 100, reservedTokens: 0, updatedAt: new Date() });
    });
    await assertFails(bob.firestore().collection('wallets').doc('alice').get());
  });

  await test('unauthenticated user cannot read any wallet', async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(anon.firestore().collection('wallets').doc('alice').get());
  });

  await test('client cannot write to wallet (server-only)', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      alice.firestore().collection('wallets').doc('alice')
        .set({ balance: 99999, reservedTokens: 0, updatedAt: new Date() })
    );
  });

  // ── creatorEarningAccounts/{creatorId} ────────────────────────────────────
  console.log('\n§ creatorEarningAccounts/{creatorId} — creator earnings');

  await test('creator can read own earning account', async () => {
    const creator = testEnv.authenticatedContext('creator1');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('creatorEarningAccounts').doc('creator1')
        .set({ pendingEarningTokens: 50, availableEarningTokens: 0 });
    });
    await assertSucceeds(
      creator.firestore().collection('creatorEarningAccounts').doc('creator1').get()
    );
  });

  await test('fan cannot read another creator earning account', async () => {
    const fan = testEnv.authenticatedContext('fan1');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('creatorEarningAccounts').doc('creator1')
        .set({ pendingEarningTokens: 50 });
    });
    await assertFails(
      fan.firestore().collection('creatorEarningAccounts').doc('creator1').get()
    );
  });

  await test('client cannot write to creator earning account', async () => {
    const creator = testEnv.authenticatedContext('creator1');
    await assertFails(
      creator.firestore().collection('creatorEarningAccounts').doc('creator1')
        .set({ pendingEarningTokens: 999999 })
    );
  });

  // ── creatorEarningLedger/{entryId} ────────────────────────────────────────
  console.log('\n§ creatorEarningLedger/{entryId} — earning ledger');

  await test('creator can read own ledger entry', async () => {
    const creator = testEnv.authenticatedContext('creator1');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('creatorEarningLedger').doc('entry1')
        .set({ creatorId: 'creator1', tokenAmount: 100 });
    });
    await assertSucceeds(
      creator.firestore().collection('creatorEarningLedger').doc('entry1').get()
    );
  });

  await test('other user cannot read ledger entry', async () => {
    const other = testEnv.authenticatedContext('other');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('creatorEarningLedger').doc('entry1')
        .set({ creatorId: 'creator1', tokenAmount: 100 });
    });
    await assertFails(
      other.firestore().collection('creatorEarningLedger').doc('entry1').get()
    );
  });

  await test('client cannot write to earning ledger (immutable)', async () => {
    const creator = testEnv.authenticatedContext('creator1');
    await assertFails(
      creator.firestore().collection('creatorEarningLedger').doc('entry-bad')
        .set({ creatorId: 'creator1', tokenAmount: 999999 })
    );
  });

  // ── billingEvents/{eventId} ───────────────────────────────────────────────
  console.log('\n§ billingEvents/{eventId} — immutable billing audit');

  await test('payer can read own billing event', async () => {
    const fan = testEnv.authenticatedContext('fan1');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('billingEvents').doc('bill1')
        .set({ payerId: 'fan1', creatorId: 'creator1', amount: 50 });
    });
    await assertSucceeds(
      fan.firestore().collection('billingEvents').doc('bill1').get()
    );
  });

  await test('creator can read billing event where they are recipient', async () => {
    const creator = testEnv.authenticatedContext('creator1');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('billingEvents').doc('bill1')
        .set({ payerId: 'fan1', creatorId: 'creator1', amount: 50 });
    });
    await assertSucceeds(
      creator.firestore().collection('billingEvents').doc('bill1').get()
    );
  });

  await test('third party cannot read billing event', async () => {
    const spy = testEnv.authenticatedContext('spy');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('billingEvents').doc('bill1')
        .set({ payerId: 'fan1', creatorId: 'creator1', amount: 50 });
    });
    await assertFails(
      spy.firestore().collection('billingEvents').doc('bill1').get()
    );
  });

  await test('client cannot write billing event (server-only immutable)', async () => {
    const fan = testEnv.authenticatedContext('fan1');
    await assertFails(
      fan.firestore().collection('billingEvents').doc('injected')
        .set({ payerId: 'fan1', creatorId: 'creator1', amount: 0 })
    );
  });

  // ── age_verification/{uid} ────────────────────────────────────────────────
  console.log('\n§ age_verification/{uid} — KYC records');

  await test('user can read own age verification', async () => {
    const user = testEnv.authenticatedContext('user1');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('age_verification').doc('user1')
        .set({ status: 'VERIFIED', verifiedAt: new Date() });
    });
    await assertSucceeds(
      user.firestore().collection('age_verification').doc('user1').get()
    );
  });

  await test('user cannot read other user age verification', async () => {
    const voyeur = testEnv.authenticatedContext('voyeur');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('age_verification').doc('user1')
        .set({ status: 'VERIFIED' });
    });
    await assertFails(
      voyeur.firestore().collection('age_verification').doc('user1').get()
    );
  });

  await test('client cannot write age verification (server-only KYC)', async () => {
    const user = testEnv.authenticatedContext('user1');
    await assertFails(
      user.firestore().collection('age_verification').doc('user1')
        .set({ status: 'VERIFIED', verifiedAt: new Date() })
    );
  });

  // ── FORBIDDEN paths — explicit hard deny ──────────────────────────────────
  console.log('\n§ FORBIDDEN legacy wallet paths — must be denied');

  await test('user_wallets collection is denied (forbidden path)', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      alice.firestore().collection('user_wallets').doc('alice').get()
    );
  });

  await test('wallet/main is denied (forbidden path)', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      alice.firestore().collection('wallet').doc('main').get()
    );
  });

  await test('wallet/current is denied (forbidden path)', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      alice.firestore().collection('wallet').doc('current').get()
    );
  });

  await test('unauthenticated cannot read user_wallets', async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(
      anon.firestore().collection('user_wallets').doc('any').get()
    );
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Rules tests: ${results.passed} passed, ${results.failed} failed`);
  if (results.errors.length > 0) {
    console.log('\nFailed tests:');
    results.errors.forEach(e => console.log(`  ✗ ${e.name}: ${e.error}`));
  }

  await testEnv.cleanup();

  if (results.failed > 0) process.exit(1);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
