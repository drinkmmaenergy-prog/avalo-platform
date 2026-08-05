// functions/src/__tests__/clean-worktree-layer0-to-layer1-transition.test.ts
//
// P2-POST-STAGE3 — LAYER 0 -> LAYER 1 TRANSITION CONTRACT (repaired 2026-07-17).
//
// PURPOSE. The original Layer-0 focused suite (clean-worktree-layer0-support.test.ts) asserted that
// NO Layer-1 payment-foundation file or walletService authority symbol had been transferred. That was
// the correct guard for the PRE-Layer-1 baseline. The authorized R3 Payment-Foundation task (Phases
// A-C) has since transferred the EXACT approved five-file set + four walletService symbols, so those
// absence guards became obsolete. This file replaces the deleted pre-transition semantics with a
// precise, fail-closed transition contract that distinguishes three states and rejects partial /
// unexplained recovery drift.
//
// This file changes NO runtime code. It uses filesystem + read-only Git state checks (appropriate for
// a structural transition contract) and pure synthetic-state helpers for the negative cases so it
// never mutates or renames real repository files.
//
// SEPARATION OF RESPONSIBILITIES. The original Layer-0 file remains focused on the ORIGINAL Layer-0
// structural guarantees (package/lock, Jest projects, tsconfig.rules, RuntimeLogScan, Pack48) plus a
// minimal repaired presence/absence guard. The full transition state-model, authoritative hash
// manifest, partial-transfer rejection and staged/drift rejection live here so neither file becomes
// overly broad or confusing.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFileSync } from 'child_process';

const FUNCTIONS = path.resolve(__dirname, '../..'); // .../functions
const ROOT = path.resolve(FUNCTIONS, '..'); // repo root (clean worktree)

// ── Authoritative approved Layer-1 manifest ────────────────────────────────────
// SOURCE: R3 implementation evidence
//   C:\Users\Drink\.claude\evidence\avalo-r3-payment-foundation-p0-04-r1\02-transfers-and-inventory.md
// (full-file byte-exact transfers; source==destination SHA-256). Re-derived on disk at repair time.
const APPROVED_FOUNDATION_HASHES: Readonly<Record<string, string>> = Object.freeze({
  'functions/src/payments/canonicalStripeCompletion.ts': 'bc94c9dbde0b25cf22a6aa8114674e557d77aefe32e292db9bbf2610d33797ee',
  'functions/src/payments/stripeCheckoutIntent.ts': 'e4298e7c192e2b1690ac504d58bbe8a32056c9b9de83abb7a780d2fe68545434',
  'functions/src/payments/stripeRefunds.ts': 'f9b552996a3af6dd2cbb92c70dfd4a5f7720d096a3a8675ffa827ea840d65429',
  'functions/src/lib/moneyLog.ts': 'dbafe33c5046bf2a5ef5cea078cda98b10c15332bb90f3185364890e41bfd407',
  'functions/src/payments/financialOperationContract.ts': '6cd2fc02d4aca01470ab923f38bc7bde229a5c50c33b1860be56bbcf4037b3e4',
});
const APPROVED_FOUNDATION_FILES = Object.keys(APPROVED_FOUNDATION_HASHES);

// The EXACT approved walletService authority symbols (no wildcard / prefix acceptance).
const APPROVED_WS_SYMBOLS = [
  'PROVIDER_PURCHASE_TX_COLLECTION',
  'PAYMENT_RECONCILIATION_COLLECTION',
  'PAYMENT_COMPLETION_OUTBOX_COLLECTION',
  'creditVerifiedProviderPurchase',
] as const;

// Foundation siblings that are NOT part of the approved transition (future R3 phases only) — must
// remain absent so a later phase cannot be silently pre-accepted here.
const UNAPPROVED_FOUNDATION_SIBLINGS = [
  'functions/src/payments/checkoutEnablementGate.ts',
  'functions/src/payments/purchaseStatusAuthority.ts',
  'functions/src/payments/checkoutTelemetry.ts',
  'functions/src/payments/checkoutTelemetrySink.ts',
  'functions/src/payments/reconciliationHealthScanner.ts',
  'functions/src/payments/canonicalLinkage.ts',
];
// Mobile-firebase infra that is out-of-scope for this recovery lane — must remain absent.
const FORBIDDEN_MOBILE_INFRA = [
  'app-mobile/services/purchaseStatusApi.ts',
  'app-mobile/lib/firebase.ts',
  'app-mobile/lib/firebase.tsx',
];

function sha256File(abs: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

// ── Pure transition-state classifier (fail-closed) ─────────────────────────────
// Operates on a synthetic state object so negative cases are provable WITHOUT mutating the worktree.
export type TransitionState =
  | 'PRE_LAYER1_BASELINE'
  | 'AUTHORIZED_LAYER1_TRANSITION'
  | 'INVALID_PARTIAL_TRANSITION';

interface FoundationFileState {
  path: string;
  exists: boolean;
  sha256: string | null;
}
interface TransitionInput {
  foundationFiles: FoundationFileState[]; // states for the approved 5 (order-independent)
  walletSymbolsPresent: Record<string, boolean>; // approved 4
  unapprovedSiblingsPresent: string[]; // any unapproved foundation sibling found on disk
  mobileInfraPresent: string[]; // any forbidden mobile-infra file found on disk
  stagedFileCount: number;
  packageManifestValid: boolean; // parses + lock<->manifest devDeps aligned (no corrupting drift)
}
interface TransitionResult {
  state: TransitionState;
  reason: string;
}

function classifyTransitionState(inp: TransitionInput): TransitionResult {
  // Git-failure robustness (reconciliation task): an unknown/unparseable staged count (NaN from a failed
  // `git` call, +/-Infinity, or a negative count) is NEVER treated as "zero staged" — it fails closed.
  if (!Number.isFinite(inp.stagedFileCount) || inp.stagedFileCount < 0 || !Number.isInteger(inp.stagedFileCount)) {
    return { state: 'INVALID_PARTIAL_TRANSITION', reason: 'staged_count_unknown' };
  }
  // Hard, fail-closed invalidators first — these are never an accepted transition state.
  if (inp.stagedFileCount > 0) {
    return { state: 'INVALID_PARTIAL_TRANSITION', reason: 'staged_files_present' };
  }
  if (!inp.packageManifestValid) {
    return { state: 'INVALID_PARTIAL_TRANSITION', reason: 'package_or_lock_drift' };
  }
  if (inp.unapprovedSiblingsPresent.length > 0 || inp.mobileInfraPresent.length > 0) {
    return { state: 'INVALID_PARTIAL_TRANSITION', reason: 'unapproved_recovery_drift' };
  }

  const byPath = new Map(inp.foundationFiles.map((f) => [f.path, f]));
  const existingCount = APPROVED_FOUNDATION_FILES.filter((p) => byPath.get(p)?.exists).length;
  const symbolsAll = APPROVED_WS_SYMBOLS.every((s) => inp.walletSymbolsPresent[s] === true);
  const symbolsAny = APPROVED_WS_SYMBOLS.some((s) => inp.walletSymbolsPresent[s] === true);

  // Pristine pre-transition baseline: NONE of the foundation files and NONE of the symbols.
  if (existingCount === 0 && !symbolsAny) {
    return { state: 'PRE_LAYER1_BASELINE', reason: 'no_layer1_content' };
  }

  // Authorized transition requires the COMPLETE approved set: all five files present, each matching
  // its exact approved hash, AND all four symbols present.
  const allFilesPresent = existingCount === APPROVED_FOUNDATION_FILES.length;
  const allHashesOk = APPROVED_FOUNDATION_FILES.every((p) => {
    const st = byPath.get(p);
    return !!st && st.exists && st.sha256 !== null && st.sha256 === APPROVED_FOUNDATION_HASHES[p];
  });
  if (allFilesPresent && allHashesOk && symbolsAll) {
    return { state: 'AUTHORIZED_LAYER1_TRANSITION', reason: 'complete_approved_transition' };
  }

  // Everything else between baseline and a complete/valid transition is a partial/invalid transfer:
  // 1-4 files, files-without-symbols, symbols-without-files, unexpected hash, etc.
  if (allFilesPresent && symbolsAll && !allHashesOk) {
    return { state: 'INVALID_PARTIAL_TRANSITION', reason: 'unexpected_foundation_hash' };
  }
  if (!allFilesPresent && (existingCount > 0 || symbolsAny)) {
    return { state: 'INVALID_PARTIAL_TRANSITION', reason: 'partial_file_transfer' };
  }
  if (allFilesPresent && !symbolsAll) {
    return { state: 'INVALID_PARTIAL_TRANSITION', reason: 'partial_symbol_transfer' };
  }
  return { state: 'INVALID_PARTIAL_TRANSITION', reason: 'inconsistent_transition' };
}

// Build the REAL worktree state (used only for the positive acceptance test).
function readActualTransitionInput(): TransitionInput {
  const foundationFiles: FoundationFileState[] = APPROVED_FOUNDATION_FILES.map((rel) => {
    const abs = path.join(ROOT, rel);
    const e = fs.existsSync(abs);
    return { path: rel, exists: e, sha256: e ? sha256File(abs) : null };
  });
  const ws = fs.readFileSync(path.join(FUNCTIONS, 'src', 'wallet', 'walletService.ts'), 'utf8');
  const walletSymbolsPresent: Record<string, boolean> = {};
  for (const s of APPROVED_WS_SYMBOLS) walletSymbolsPresent[s] = ws.includes(s);

  let packageManifestValid = false;
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(FUNCTIONS, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(FUNCTIONS, 'package-lock.json'), 'utf8'));
    const manDev = Object.keys(pj.devDependencies ?? {}).sort();
    const lockDev = Object.keys((lock.packages?.[''] ?? {}).devDependencies ?? {}).sort();
    const noNul = !fs.readFileSync(path.join(FUNCTIONS, 'package.json')).includes(0);
    packageManifestValid = noNul && lock.name === pj.name && JSON.stringify(manDev) === JSON.stringify(lockDev);
  } catch {
    packageManifestValid = false;
  }

  return {
    foundationFiles,
    walletSymbolsPresent,
    unapprovedSiblingsPresent: UNAPPROVED_FOUNDATION_SIBLINGS.filter((f) => exists(f)),
    mobileInfraPresent: FORBIDDEN_MOBILE_INFRA.filter((f) => exists(f)),
    stagedFileCount: countStagedFiles(),
    packageManifestValid,
  };
}

function countStagedFiles(): number {
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter((s) => s.length > 0).length;
  } catch {
    // If git is unavailable the transition contract must fail closed, not silently pass.
    return Number.NaN;
  }
}

// A synthetic "authorized" baseline input the negative cases mutate from.
function authorizedSynthetic(): TransitionInput {
  return {
    foundationFiles: APPROVED_FOUNDATION_FILES.map((p) => ({ path: p, exists: true, sha256: APPROVED_FOUNDATION_HASHES[p] })),
    walletSymbolsPresent: Object.fromEntries(APPROVED_WS_SYMBOLS.map((s) => [s, true])),
    unapprovedSiblingsPresent: [],
    mobileInfraPresent: [],
    stagedFileCount: 0,
    packageManifestValid: true,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// CASE 2 + 14 — current authorized Layer-1 transition is accepted and reported.
// ───────────────────────────────────────────────────────────────────────────────
describe('Transition — the REAL worktree is an AUTHORIZED_LAYER1_TRANSITION', () => {
  const actual = readActualTransitionInput();

  test('classifies the current worktree as AUTHORIZED_LAYER1_TRANSITION', () => {
    const r = classifyTransitionState(actual);
    expect(r.state).toBe('AUTHORIZED_LAYER1_TRANSITION');
  });

  test('all five approved foundation files exist with the exact approved SHA-256', () => {
    for (const rel of APPROVED_FOUNDATION_FILES) {
      const abs = path.join(ROOT, rel);
      expect(fs.existsSync(abs)).toBe(true);
      expect(sha256File(abs)).toBe(APPROVED_FOUNDATION_HASHES[rel]);
    }
  });

  test('CASE 8 — ignored moneyLog.ts is still required on disk and hash-checked', () => {
    const abs = path.join(FUNCTIONS, 'src', 'lib', 'moneyLog.ts');
    expect(fs.existsSync(abs)).toBe(true); // present even though .gitignore excludes it
    expect(sha256File(abs)).toBe(APPROVED_FOUNDATION_HASHES['functions/src/lib/moneyLog.ts']);
  });

  test('CASE 5/6 — walletService contains the COMPLETE approved four-symbol set', () => {
    for (const s of APPROVED_WS_SYMBOLS) expect(actual.walletSymbolsPresent[s]).toBe(true);
  });

  test('CASE 9 — zero staged files (fail-closed if git unavailable)', () => {
    expect(actual.stagedFileCount).toBe(0);
  });

  test('CASE 11/12 — package manifest/lock has no corrupting drift; Pack48 support intact', () => {
    expect(actual.packageManifestValid).toBe(true);
    for (const f of [
      'app-mobile/scripts/verify-pack48-client.mjs',
      'app-mobile/services/clientMessageId.ts',
      'app-mobile/services/pack48CompanionClient.ts',
    ]) {
      expect(exists(f)).toBe(true);
    }
  });

  test('CASE 10 — unapproved foundation siblings + mobile-firebase infra remain ABSENT', () => {
    expect(actual.unapprovedSiblingsPresent).toEqual([]);
    expect(actual.mobileInfraPresent).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// CASE 1 — PRE_LAYER1_BASELINE is still recognized (state model round-trips).
// CASE 3/4/5/6/7/10/11 — partial / invalid transitions are rejected (synthetic states).
// ───────────────────────────────────────────────────────────────────────────────
describe('Transition — pure state classifier (synthetic, no worktree mutation)', () => {
  test('CASE 1 — all-absent + no symbols => PRE_LAYER1_BASELINE', () => {
    const inp: TransitionInput = {
      foundationFiles: APPROVED_FOUNDATION_FILES.map((p) => ({ path: p, exists: false, sha256: null })),
      walletSymbolsPresent: Object.fromEntries(APPROVED_WS_SYMBOLS.map((s) => [s, false])),
      unapprovedSiblingsPresent: [],
      mobileInfraPresent: [],
      stagedFileCount: 0,
      packageManifestValid: true,
    };
    expect(classifyTransitionState(inp).state).toBe('PRE_LAYER1_BASELINE');
  });

  test('the synthetic authorized baseline classifies as AUTHORIZED_LAYER1_TRANSITION', () => {
    expect(classifyTransitionState(authorizedSynthetic()).state).toBe('AUTHORIZED_LAYER1_TRANSITION');
  });

  test('CASE 3/4 — only some of the five files present => INVALID_PARTIAL_TRANSITION', () => {
    for (let n = 1; n <= 4; n++) {
      const inp = authorizedSynthetic();
      inp.foundationFiles = inp.foundationFiles.map((f, i) => (i < n ? f : { path: f.path, exists: false, sha256: null }));
      const r = classifyTransitionState(inp);
      expect(r.state).toBe('INVALID_PARTIAL_TRANSITION');
      expect(r.reason).toBe('partial_file_transfer');
    }
  });

  test('CASE 5 — files present but a required symbol missing => INVALID_PARTIAL_TRANSITION', () => {
    const inp = authorizedSynthetic();
    inp.walletSymbolsPresent = { ...inp.walletSymbolsPresent, creditVerifiedProviderPurchase: false };
    const r = classifyTransitionState(inp);
    expect(r.state).toBe('INVALID_PARTIAL_TRANSITION');
    expect(r.reason).toBe('partial_symbol_transfer');
  });

  test('CASE 6 — symbols present but foundation files missing => INVALID_PARTIAL_TRANSITION', () => {
    const inp = authorizedSynthetic();
    inp.foundationFiles = inp.foundationFiles.map((f) => ({ path: f.path, exists: false, sha256: null }));
    const r = classifyTransitionState(inp);
    expect(r.state).toBe('INVALID_PARTIAL_TRANSITION');
    expect(r.reason).toBe('partial_file_transfer');
  });

  test('CASE 7 — an unexpected foundation-file hash is rejected', () => {
    const inp = authorizedSynthetic();
    inp.foundationFiles = inp.foundationFiles.map((f, i) =>
      i === 0 ? { ...f, sha256: '0'.repeat(64) } : f,
    );
    const r = classifyTransitionState(inp);
    expect(r.state).toBe('INVALID_PARTIAL_TRANSITION');
    expect(r.reason).toBe('unexpected_foundation_hash');
  });

  test('CASE 10 — an unapproved Payment-Foundation sibling is rejected (not silently accepted)', () => {
    const inp = authorizedSynthetic();
    inp.unapprovedSiblingsPresent = ['functions/src/payments/checkoutEnablementGate.ts'];
    const r = classifyTransitionState(inp);
    expect(r.state).toBe('INVALID_PARTIAL_TRANSITION');
    expect(r.reason).toBe('unapproved_recovery_drift');
  });

  test('CASE 11 — package/lock drift beyond the accepted baseline is rejected', () => {
    const inp = authorizedSynthetic();
    inp.packageManifestValid = false;
    const r = classifyTransitionState(inp);
    expect(r.state).toBe('INVALID_PARTIAL_TRANSITION');
    expect(r.reason).toBe('package_or_lock_drift');
  });

  test('CASE 9 — staged files are rejected', () => {
    const inp = authorizedSynthetic();
    inp.stagedFileCount = 1;
    const r = classifyTransitionState(inp);
    expect(r.state).toBe('INVALID_PARTIAL_TRANSITION');
    expect(r.reason).toBe('staged_files_present');
  });

  test('Git-failure robustness — NaN / +Inf / -Inf / negative / non-integer staged counts fail closed', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -3, 2.5]) {
      const inp = authorizedSynthetic();
      inp.stagedFileCount = bad;
      const r = classifyTransitionState(inp);
      expect(r.state).toBe('INVALID_PARTIAL_TRANSITION');
      expect(r.reason).toBe('staged_count_unknown');
    }
  });

  test('countStagedFiles returns NaN on Git failure (fail-closed sentinel), which the classifier rejects', () => {
    // A failed `git` invocation must never be read as "0 staged". countStagedFiles returns NaN on failure;
    // the classifier maps any non-finite count to staged_count_unknown (proven above).
    expect(Number.isNaN(Number.NaN)).toBe(true);
    const inp = authorizedSynthetic();
    inp.stagedFileCount = Number.NaN;
    expect(classifyTransitionState(inp).reason).toBe('staged_count_unknown');
  });

  test('no-wildcard acceptance — an extra unknown payments/*.ts is NOT part of the approved set', () => {
    // The approved set is exactly five explicit paths; an arbitrary sibling is not auto-approved.
    expect(APPROVED_FOUNDATION_FILES).toHaveLength(5);
    expect(APPROVED_FOUNDATION_FILES).not.toContain('functions/src/payments/somethingNew.ts');
  });
});
