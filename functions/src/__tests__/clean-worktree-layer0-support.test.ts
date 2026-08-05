// functions/src/__tests__/clean-worktree-layer0-support.test.ts
//
// P2-POST-STAGE3 CLEAN-WORKTREE-RECOVERY LAYER 0 — focused structural tests.
//
// These assert the Layer-0 build/Jest/TypeScript/validator-support recovery WITHOUT executing the
// full enablement validator, the Firebase emulator, or any payment/enablement runtime. They fail on
// the un-recovered clean HEAD (NUL-padded package.json, single-project jest, missing tsconfig.rules
// / RuntimeLogScan / Pack48 runner) and pass after Layer-0 recovery. The final describe was REPAIRED
// (2026-07-17) from an obsolete "NO Layer-1 transferred" absence guard into a fail-closed Layer-0 ->
// Layer-1 transition guard: it now requires the EXACT approved five-file foundation set + four
// walletService symbols to be present while every UNAPPROVED sibling / mobile-infra file stays absent.
// The full transition state-model + hash/partial-transfer/staged-drift rejection lives in
// clean-worktree-layer0-to-layer1-transition.test.ts.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const FUNCTIONS = path.resolve(__dirname, '../..'); // .../functions
const ROOT = path.resolve(FUNCTIONS, '..'); // repo root (clean worktree)

const RUNTIME_LOG_SCAN_SHA = 'E686C07275027E75ACAC6DAEADFB2C72B640C15DC2B1CCE1FD875E663B503B71';

function readBytes(p: string): Buffer {
  return fs.readFileSync(p);
}
function readText(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

describe('Layer-0 — package manifest', () => {
  const pj = path.join(FUNCTIONS, 'package.json');

  test('functions/package.json has no NUL bytes', () => {
    expect(readBytes(pj).includes(0)).toBe(false);
  });

  test('functions/package.json parses as JSON', () => {
    expect(() => JSON.parse(readText(pj))).not.toThrow();
  });

  test('package-lock root record matches manifest (name/version + rules/emulator devDeps)', () => {
    const manifest = JSON.parse(readText(pj));
    const lock = JSON.parse(readText(path.join(FUNCTIONS, 'package-lock.json')));
    expect(lock.name).toBe(manifest.name);
    expect(lock.version).toBe(manifest.version);
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
    const rootRec = lock.packages[''];
    const manDev = Object.keys(manifest.devDependencies ?? {}).sort();
    const lockDev = Object.keys(rootRec.devDependencies ?? {}).sort();
    expect(lockDev).toEqual(manDev);
    // the two devDeps required by the rules/emulator project must be represented in the lock tree
    expect(Object.prototype.hasOwnProperty.call(lock.packages, 'node_modules/@firebase/rules-unit-testing')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(lock.packages, 'node_modules/firebase')).toBe(true);
  });
});

describe('Layer-0 — Jest multi-project', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cfg = require(path.join(FUNCTIONS, 'jest.config.js'));
  const projects: Array<Record<string, unknown>> = (cfg.projects ?? []) as Array<Record<string, unknown>>;
  const byName = (n: string) => projects.find((p) => p.displayName === n);

  test('defines main and rules projects', () => {
    expect(byName('main')).toBeTruthy();
    expect(byName('rules')).toBeTruthy();
  });

  test('rules project uses tsconfig.rules.json and only rules/storage tests', () => {
    const rules = byName('rules') as Record<string, unknown>;
    const tm = (rules.testMatch as string[]).join('|');
    expect(tm).toMatch(/tests\/rules\//);
    expect(tm).not.toMatch(/src\/__tests__/);
    expect(JSON.stringify(rules.transform)).toContain('tsconfig.rules.json');
  });

  test('main project runs src/__tests__ but not the rules suite', () => {
    const main = byName('main') as Record<string, unknown>;
    const tm = (main.testMatch as string[]).join('|');
    expect(tm).toMatch(/src\/__tests__/);
    expect(tm).not.toMatch(/tests\/rules\//);
  });
});

describe('Layer-0 — tsconfig.rules.json', () => {
  test('exists and parses (JSONC-tolerant: strip // and /* */ comments)', () => {
    const p = path.join(FUNCTIONS, 'tsconfig.rules.json');
    expect(fs.existsSync(p)).toBe(true);
    const raw = readText(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const obj = JSON.parse(raw);
    expect(obj.extends).toBeTruthy();
  });
});

describe('Layer-0 — RuntimeLogScan.ps1 integrity + restricted behavior', () => {
  const p = path.join(ROOT, 'scripts', 'lib', 'RuntimeLogScan.ps1');

  test('exists with the exact snapshot SHA-256', () => {
    expect(fs.existsSync(p)).toBe(true);
    const h = crypto.createHash('sha256').update(readBytes(p)).digest('hex').toUpperCase();
    expect(h).toBe(RUNTIME_LOG_SCAN_SHA);
  });

  test('is read-only validation tooling (no deploy / secret / install / network)', () => {
    const txt = readText(p);
    expect(txt).not.toMatch(/firebase deploy|gcloud |npm install|Invoke-WebRequest|Invoke-RestMethod/i);
    expect(txt).not.toMatch(/sk_live_|sk_test_|whsec_/);
  });
});

describe('Layer-0 — Pack48 runner scope is bounded', () => {
  const runnerFiles = [
    'app-mobile/scripts/verify-pack48-client.mjs',
    'app-mobile/services/clientMessageId.ts',
    'app-mobile/services/pack48CompanionClient.ts',
  ];

  test('runner support files exist', () => {
    for (const f of runnerFiles) expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
  });

  test('test:pack48-client script is exposed', () => {
    const amp = JSON.parse(readText(path.join(ROOT, 'app-mobile', 'package.json')));
    expect(amp.scripts['test:pack48-client']).toBeTruthy();
  });

  test('runner support does not import Pack48 backend runtime (functions/src)', () => {
    for (const f of runnerFiles) {
      const txt = readText(path.join(ROOT, f));
      // allow doc comments mentioning functions/src; forbid actual relative backend imports
      expect(txt).not.toMatch(/from ['"][^'"]*functions\/src/);
      expect(txt).not.toMatch(/require\(['"][^'"]*functions\/src/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LAYER-0 -> LAYER-1 TRANSITION GUARD (repaired 2026-07-17).
//
// PREVIOUS PURPOSE: this block asserted that NO Layer-1 payment-foundation file and NONE of the four
//   walletService authority symbols had been transferred — the correct guard for the PRE-Layer-1
//   baseline (it protected against premature/unauthorized Layer-1 leakage into a Layer-0-only worktree).
// WHY IT BECAME OBSOLETE: the AUTHORIZED R3 Payment-Foundation task (Phases A-C) has since transferred
//   the EXACT approved five-file set and the four approved walletService symbols. The absence guards
//   therefore began failing CLOSED against approved content (Layer-0 dropped to 12/14 solely here).
// REPLACEMENT GUARANTEE (fail-closed, NOT weakened): the APPROVED five-file set MUST now be present,
//   the four approved symbols MUST ALL be present (complete, non-partial), WHILE every UNAPPROVED
//   foundation sibling and every mobile-firebase infra file MUST remain absent. This neither deletes
//   the protection nor trivially inverts it — it re-points the guard at the exact approved allowlist
//   and keeps forbidding everything outside it. Deep hash/provenance, partial-transfer rejection and
//   staged/package-drift rejection live in clean-worktree-layer0-to-layer1-transition.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer-0 -> Layer-1 transition — approved foundation present, unapproved drift still forbidden', () => {
  // Exactly the APPROVED Layer-1 transition set (byte-exact R3 recovery). No wildcard acceptance.
  const APPROVED_FOUNDATION = [
    'functions/src/payments/canonicalStripeCompletion.ts',
    'functions/src/payments/stripeCheckoutIntent.ts',
    'functions/src/payments/stripeRefunds.ts',
    'functions/src/lib/moneyLog.ts',
    'functions/src/payments/financialOperationContract.ts',
  ];
  // Foundation siblings NOT part of this transition (future R3 phases only) — MUST remain absent.
  const UNAPPROVED_FOUNDATION_SIBLINGS = [
    'functions/src/payments/checkoutEnablementGate.ts',
    'functions/src/payments/purchaseStatusAuthority.ts',
    'functions/src/payments/checkoutTelemetry.ts',
    'functions/src/payments/checkoutTelemetrySink.ts',
    'functions/src/payments/reconciliationHealthScanner.ts',
    'functions/src/payments/canonicalLinkage.ts',
  ];
  // Mobile-firebase infra remains out-of-scope for this recovery lane — MUST remain absent.
  const FORBIDDEN_MOBILE_INFRA = [
    'app-mobile/services/purchaseStatusApi.ts',
    'app-mobile/lib/firebase.ts',
    'app-mobile/lib/firebase.tsx',
  ];
  const APPROVED_WS_SYMBOLS = [
    'PROVIDER_PURCHASE_TX_COLLECTION',
    'PAYMENT_RECONCILIATION_COLLECTION',
    'PAYMENT_COMPLETION_OUTBOX_COLLECTION',
    'creditVerifiedProviderPurchase',
  ];

  test('approved Layer-1 five-file foundation set is present (authorized transition, complete)', () => {
    for (const f of APPROVED_FOUNDATION) expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
  });

  test('unapproved foundation siblings + mobile-firebase infra remain ABSENT (no unauthorized drift)', () => {
    for (const f of [...UNAPPROVED_FOUNDATION_SIBLINGS, ...FORBIDDEN_MOBILE_INFRA]) {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(false);
    }
  });

  test('walletService.ts contains the COMPLETE approved four-symbol authority set (non-partial)', () => {
    const ws = readText(path.join(FUNCTIONS, 'src', 'wallet', 'walletService.ts'));
    for (const sym of APPROVED_WS_SYMBOLS) expect(ws.includes(sym)).toBe(true);
  });
});
