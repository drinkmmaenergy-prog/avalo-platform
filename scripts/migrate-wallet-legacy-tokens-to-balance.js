/**
 * AVALO WALLET PHASE 2A — LEGACY tokens -> canonical balance MIGRATION
 * Branch: stabilization/build-green-2026-04-15
 *
 * WHAT IT DOES:
 *   For each wallets/{uid} doc where:
 *     - tokens > 0
 *     - legacyTokensMigratedToBalance !== true
 *   It writes (atomically inside a Firestore transaction):
 *     wallets/{uid}.balance            += tokens
 *     wallets/{uid}.legacyTokensMigratedToBalance = true
 *     wallets/{uid}.legacyTokensMigratedAt        = serverTimestamp()
 *     wallets/{uid}.legacyTokensMigratedAmount    = tokens
 *   And creates a ledger entry:
 *     ledger/{txId}  type: MIGRATION, actorId: uid, amountTokens: tokens
 *
 * SAFETY:
 *   - DEFAULT is DRY RUN — no writes unless --execute is passed
 *   - Idempotent: skips docs with legacyTokensMigratedToBalance === true
 *   - Does NOT delete or zero wallets.tokens
 *   - Does NOT touch users/wallet/current, users/wallet/main, user_wallets
 *   - Every mutation is inside a Firestore transaction (atomic, consistent)
 *
 * USAGE:
 *   # Dry run (no writes):
 *   node scripts/migrate-wallet-legacy-tokens-to-balance.js --project avalo-c8c46 --top 20
 *
 *   # Live run (WRITES TO FIRESTORE — only after dry run reviewed and approved):
 *   node scripts/migrate-wallet-legacy-tokens-to-balance.js --project avalo-c8c46 --top 20 --execute
 *
 * CREDENTIALS (pick one):
 *   A) gcloud auth application-default login
 *   B) set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
 *
 * INSTALL (run once from repo root or a clean dir):
 *   npm install firebase-admin
 */

'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { randomUUID } = require('crypto');

// ── Config ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

const projectArg = args.indexOf('--project');
const PROJECT_ID = projectArg !== -1 ? args[projectArg + 1] : 'avalo-c8c46';

const topArg = args.indexOf('--top');
const TOP_N = topArg !== -1 ? parseInt(args[topArg + 1], 10) : 20;

const EXECUTE = args.includes('--execute');
const DRY_RUN = !EXECUTE;

// ── Init ──────────────────────────────────────────────────────────────────────
const app = initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  return n.toLocaleString('en-US');
}

function generateTxId() {
  return randomUUID().replace(/-/g, '').slice(0, 20);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '='.repeat(72));
  console.log(`AVALO WALLET PHASE 2A MIGRATION — Project: ${PROJECT_ID}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : '*** LIVE EXECUTE — WRITING TO FIRESTORE ***'}`);
  console.log(`Top-${TOP_N} users by token exposure.`);
  console.log('='.repeat(72) + '\n');

  if (!DRY_RUN) {
    console.log('!!! LIVE MODE — Writes will be committed to Firestore !!!');
    console.log('!!! wallets.tokens will NOT be deleted or zeroed      !!!');
    console.log('');
  }

  // ── Step 1: Scan wallets collection ─────────────────────────────────────
  console.log('Scanning wallets collection for legacy tokens field...');
  const walletsSnap = await db.collection('wallets').get();

  const candidates = [];
  const alreadyMigrated = [];
  const noTokens = [];

  for (const doc of walletsSnap.docs) {
    const data = doc.data();
    const tokens = data.tokens;
    const migrated = data.legacyTokensMigratedToBalance;

    if (typeof tokens !== 'number' || tokens <= 0) {
      noTokens.push(doc.id);
      continue;
    }

    if (migrated === true) {
      alreadyMigrated.push({ uid: doc.id, tokens });
      continue;
    }

    candidates.push({
      uid: doc.id,
      tokens,
      currentBalance: typeof data.balance === 'number' ? data.balance : 0,
      currentData: data,
    });
  }

  // Sort candidates by tokens desc for display
  candidates.sort((a, b) => b.tokens - a.tokens);

  const totalTokens = candidates.reduce((sum, c) => sum + c.tokens, 0);

  // ── Step 2: Print dry-run report ─────────────────────────────────────────
  console.log('\n' + '-'.repeat(60));
  console.log('MIGRATION PLAN');
  console.log('-'.repeat(60));
  console.log(`  Total wallets scanned:    ${fmt(walletsSnap.size)}`);
  console.log(`  Already migrated (skip):  ${fmt(alreadyMigrated.length)}`);
  console.log(`  No tokens field (skip):   ${fmt(noTokens.length)}`);
  console.log(`  Will migrate:             ${fmt(candidates.length)} users`);
  console.log(`  Total tokens to migrate:  ${fmt(totalTokens)}`);
  console.log('');

  if (candidates.length === 0) {
    console.log('  Nothing to migrate. All done or nothing to do.\n');
    console.log('VERDICT: NOTHING TO MIGRATE\n');
    process.exit(0);
  }

  console.log(`  Top-${Math.min(TOP_N, candidates.length)} users by token exposure:`);
  console.log('  ' + '-'.repeat(56));
  console.log('  ' + 'UID'.padEnd(32) + 'tokens'.padStart(10) + '  currentBalance'.padStart(16));
  console.log('  ' + '-'.repeat(56));

  for (const c of candidates.slice(0, TOP_N)) {
    const uid = c.uid.length > 28 ? c.uid.slice(0, 28) + '...' : c.uid.padEnd(32);
    console.log(`  ${uid}  ${fmt(c.tokens).padStart(8)}  ${fmt(c.currentBalance).padStart(14)}`);
  }

  console.log('');
  console.log('  Writes per user (if --execute were passed):');
  console.log('    wallets/{uid}.balance                    += tokens');
  console.log('    wallets/{uid}.legacyTokensMigratedToBalance = true');
  console.log('    wallets/{uid}.legacyTokensMigratedAt        = serverTimestamp()');
  console.log('    wallets/{uid}.legacyTokensMigratedAmount    = tokens');
  console.log('    ledger/{txId}  type: MIGRATION, amountTokens: tokens');
  console.log('');
  console.log('  wallets/{uid}.tokens is NOT deleted or zeroed.');
  console.log('');

  if (DRY_RUN) {
    console.log('='.repeat(72));
    console.log('DRY RUN COMPLETE — 0 writes performed.');
    console.log(`  Users that would be affected: ${fmt(candidates.length)}`);
    console.log(`  Total tokens that would move: ${fmt(totalTokens)}`);
    console.log('');
    console.log('  To execute migration, re-run with --execute flag:');
    console.log(`  node scripts/migrate-wallet-legacy-tokens-to-balance.js --project ${PROJECT_ID} --top ${TOP_N} --execute`);
    console.log('='.repeat(72) + '\n');
    process.exit(0);
  }

  // ── Step 3: Live execution ────────────────────────────────────────────────
  console.log('='.repeat(72));
  console.log('EXECUTING MIGRATION...');
  console.log('='.repeat(72) + '\n');

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors = [];

  for (const candidate of candidates) {
    const { uid, tokens, currentBalance } = candidate;
    const txId = generateTxId();
    const idempotencyKey = `phase2a_migration_${uid}`;
    const walletRef = db.collection('wallets').doc(uid);
    const ledgerRef = db.collection('ledger').doc(txId);
    const sentinelRef = db.collection('idempotency_sentinels').doc(idempotencyKey);

    try {
      await db.runTransaction(async (tx) => {
        // Re-read wallet doc inside transaction for consistency
        const walletSnap = await tx.get(walletRef);
        if (!walletSnap.exists) {
          skippedCount++;
          console.log(`  [SKIP] ${uid} — wallet doc disappeared`);
          return;
        }

        const data = walletSnap.data();

        // Idempotency guard: skip if already migrated
        if (data.legacyTokensMigratedToBalance === true) {
          skippedCount++;
          console.log(`  [SKIP] ${uid} — already migrated (legacyTokensMigratedToBalance=true)`);
          return;
        }

        // Double-check sentinel
        const sentinelSnap = await tx.get(sentinelRef);
        if (sentinelSnap.exists) {
          skippedCount++;
          console.log(`  [SKIP] ${uid} — idempotency sentinel exists`);
          return;
        }

        const legacyTokens = typeof data.tokens === 'number' ? data.tokens : 0;
        if (legacyTokens <= 0) {
          skippedCount++;
          console.log(`  [SKIP] ${uid} — tokens is 0 or missing inside transaction`);
          return;
        }

        const balanceBefore = typeof data.balance === 'number' ? data.balance : 0;
        const balanceAfter = balanceBefore + legacyTokens;

        // Write ledger entry (immutable audit record)
        tx.set(ledgerRef, {
          txId,
          type: 'MIGRATION',
          actorId: uid,
          counterpartyId: null,
          chatId: null,
          sessionId: null,
          amountTokens: legacyTokens,
          split: { creatorTokens: 0, avaloTokens: 0 },
          beforeAfter: {
            actor: { before: balanceBefore, after: balanceAfter },
            counterparty: null,
            platform: { before: 0, after: 0 },
          },
          idempotencyKey,
          timestamp: FieldValue.serverTimestamp(),
          metadata: {
            source: 'wallet.tokens',
            target: 'wallet.balance',
            migration: 'phase2a_legacy_tokens_to_balance',
            projectId: PROJECT_ID,
          },
        });

        // Write idempotency sentinel
        tx.set(sentinelRef, {
          key: idempotencyKey,
          txId,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Update wallet — increment balance, mark migrated, preserve tokens
        tx.update(walletRef, {
          balance: FieldValue.increment(legacyTokens),
          legacyTokensMigratedToBalance: true,
          legacyTokensMigratedAt: FieldValue.serverTimestamp(),
          legacyTokensMigratedAmount: legacyTokens,
        });
      });

      successCount++;
      const newBalance = currentBalance + tokens;
      console.log(`  [OK]   ${uid}  tokens=${fmt(tokens)}  balance: ${fmt(currentBalance)} -> ${fmt(newBalance)}  txId=${txId}`);

    } catch (err) {
      errorCount++;
      errors.push({ uid, err: err.message });
      console.error(`  [ERR]  ${uid} — ${err.message}`);
    }
  }

  // ── Step 4: Final report ──────────────────────────────────────────────────
  console.log('\n' + '='.repeat(72));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(72));
  console.log(`  Migrated:  ${fmt(successCount)} users`);
  console.log(`  Skipped:   ${fmt(skippedCount)} users`);
  console.log(`  Errors:    ${fmt(errorCount)} users`);

  if (errors.length > 0) {
    console.log('\n  ERRORS:');
    for (const e of errors) {
      console.log(`    ${e.uid}: ${e.err}`);
    }
  }

  console.log('');
  console.log('  REMINDER: wallets.tokens was NOT deleted or zeroed.');
  console.log('            Verify in Firestore console before proceeding to Phase 3.');
  console.log('='.repeat(72) + '\n');

  // Exit with error code if any failures
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(2);
});
