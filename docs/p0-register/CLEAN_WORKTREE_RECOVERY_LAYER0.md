# Clean-Worktree Recovery — Layer 0 (build / Jest / TypeScript / validator support)

Task: P2-POST-STAGE3-CLEAN-WORKTREE-RECOVERY-R2-BUILD-JEST-VALIDATOR-SUPPORT
Worktree: C:\a\avalo-controlled-enablement-clean (detached HEAD 4224fd324ee24e387b189fb9307caa05c9ca1ef0)
Forensic source (read-only): C:\a\avalo @ 4224fd32 (branch stabilization/build-green-2026-04-15) — UNCHANGED.
Snapshot: C:\Users\Drink\Desktop\avalo-enablement-forensic-snapshot-2026-07-15 (75/75, 0 missing, 0 hash mismatch).

NO staging, NO commit, NO deploy, NO dependency install performed. NO Layer-1+ runtime transferred.

## Baseline defects addressed (clean HEAD)
- functions/package.json had 82 trailing NUL bytes (committed in the HEAD blob). RECOVERED: replaced with the
  host-validated forensic manifest (0 NUL, parses).
- functions/jest.config.js was single-project (no `projects`). RECOVERED: multi-project config with `main` and
  `rules` (the validator uses `--selectProjects main` / `--selectProjects rules`).
- functions/tsconfig.rules.json was absent. RECOVERED (extends ./tsconfig.json; node resolution; no prod emit).
- scripts/lib/RuntimeLogScan.ps1 was absent (ignored). RECOVERED from the hash-verified snapshot
  (SHA-256 E686C07275027E75ACAC6DAEADFB2C72B640C15DC2B1CCE1FD875E663B503B71). Read-only validation helper.
- Pack48 client validator command was absent. RECOVERED: added the `test:pack48-client` script and the runner
  support files (verify-pack48-client.mjs, clientMessageId.ts, pack48CompanionClient.ts).

## Package manifest / lock decision
Clean HEAD manifest and forensic manifest have IDENTICAL dependencies; the forensic manifest adds exactly two
devDependencies required by the rules/emulator Jest project — `@firebase/rules-unit-testing` and `firebase` — plus
benign `:raw`/`check:encoding` npm scripts (no dependency-surface expansion). The forensic package.json +
package-lock.json are the host-validated, mutually consistent pair (lockfileVersion 3; root devDeps match exactly;
651 packages incl. the two devDeps' transitive closure). Adopted verbatim to guarantee manifest↔lock determinism.
Clean HEAD lock (608 packages) would have been inconsistent with the recovered manifest, so the forensic lock was
recovered as required for the exact recovered manifest.

## Explicitly NOT recovered (out of Layer-0 scope)
- functions/tests/setupFirestore.ts: the `rules` Jest project has no `setupFiles` and does not use it; the forensic
  delta only changes the emulator projectId (demo-avalo → avalostaging) for the `main` project. Not required for the
  rules project, and "do not silently change Firebase project identifiers" applies — deferred.
- walletService H35 symbols, canonicalStripeCompletion/stripeCheckoutIntent/stripeRefunds/moneyLog/
  financialOperationContract → Layer 1 (payment foundation).
- All controlled-enablement runtime + purchaseStatusApi + wallet screen + Firestore telemetry rule → Layers 3–4.
- app-mobile/lib/firebase → separate mobile-infrastructure recovery (pre-existing at HEAD; not a Layer-0/enablement
  concern; broken import present in HEAD-tracked walletApi.ts already).

## Files changed / created in the clean worktree (Layer-0 allowlist)
Modified: functions/package.json, functions/package-lock.json, functions/jest.config.js, app-mobile/package.json.
New (tracked-visible): functions/tsconfig.rules.json, app-mobile/scripts/verify-pack48-client.mjs,
app-mobile/services/clientMessageId.ts, app-mobile/services/pack48CompanionClient.ts,
scripts/validate-clean-worktree-layer0-support.ps1, functions/src/__tests__/clean-worktree-layer0-support.test.ts,
docs/p0-register/CLEAN_WORKTREE_RECOVERY_LAYER0.md.
New (ignored, on disk only, NOT staged): scripts/lib/RuntimeLogScan.ps1.

## Execution availability
node_modules are ABSENT in the clean worktree. Per Layer-0 policy the validator reports
EXECUTION BLOCKED — DEPENDENCIES ABSENT and runs structural/static gates only. No full enablement validator,
no Firebase emulator, no jest run. Focused tests are authored to pass once dependencies are present.

## Validator
scripts/validate-clean-worktree-layer0-support.ps1 → RESULT: CLEAN_WORKTREE_LAYER0_SUPPORT_PASS (exit 0) when the
structural gates pass. It verifies identity, detached exact HEAD, forensic non-mutation, package.json validity/NUL,
lock consistency, Jest main+rules, tsconfig.rules, RuntimeLogScan hash, Pack48 runner scope, Layer-1+ non-transfer,
no mobile firebase, allowlist-bounded diff, no forbidden tokens, and changed-file integrity.

## Next task
P2-POST-STAGE3-CLEAN-WORKTREE-RECOVERY-R3-PAYMENT-FOUNDATION (Layer 1). Checkout flag OFF. CORE-2 NOT authorized.

---

## Layer 0 -> Layer 1 transition-contract repair (2026-07-17)

HISTORICAL RESULT UNCHANGED. The original Layer-0 closure above remains historically valid and accepted
(14/14 at the time, marker `CLEAN_WORKTREE_LAYER0_SUPPORT_PASS`, validator exit 0). Nothing in the
original recovery is revised.

WHAT HAPPENED SINCE. The authorized R3 Payment-Foundation task completed Phases A-C and transferred, into
this same clean worktree, the EXACT approved Layer-1 content:
- five byte-exact Payment-Foundation files (canonicalStripeCompletion.ts, stripeCheckoutIntent.ts,
  stripeRefunds.ts, lib/moneyLog.ts [.gitignore'd, on-disk], financialOperationContract.ts);
- four bounded walletService symbols (PROVIDER_PURCHASE_TX_COLLECTION, PAYMENT_RECONCILIATION_COLLECTION,
  PAYMENT_COMPLETION_OUTBOX_COLLECTION, creditVerifiedProviderPurchase).

WHY THE LAYER-0 SUITE HAD TO BE REPAIRED. Two Layer-0 assertions were PRE-TRANSITION absence guards that
required those exact files/symbols to remain absent. Once Layer-1 legitimately transferred them, those two
guards failed closed (Layer-0 dropped to 12/14) against approved content — an obsolete transition contract,
not a defect in the recovered foundation.

REPAIR (this task, bounded to test/validator/doc only; NO runtime code touched):
- `functions/src/__tests__/clean-worktree-layer0-support.test.ts`: the two obsolete absence tests were
  replaced (not deleted, not trivially inverted) with a fail-closed transition guard requiring the exact
  approved five-file set + complete four-symbol set present WHILE every UNAPPROVED foundation sibling and
  mobile-firebase infra file stays absent. All other Layer-0 structural tests are untouched. (now 15/15)
- `functions/src/__tests__/clean-worktree-layer0-to-layer1-transition.test.ts` (new): the full transition
  state model — PRE_LAYER1_BASELINE / AUTHORIZED_LAYER1_TRANSITION / INVALID_PARTIAL_TRANSITION — with an
  authoritative SHA-256 manifest, complete-vs-partial rejection, unexpected-hash rejection, unapproved-drift
  rejection, staged-file rejection, and no-wildcard acceptance. Synthetic pure-state helpers cover the
  negative cases without mutating the worktree. (17/17)
- `scripts/validate-clean-worktree-layer0-support.ps1`: obsolete "no Layer-1 transferred" gate replaced with
  the three-state transition classifier (accepts only PRE_LAYER1_BASELINE or AUTHORIZED_LAYER1_TRANSITION;
  verifies the five exact hashes + four symbols + zero unapproved drift + zero staged), allowlist unioned
  with the authorized Layer-1 transition set, executes both focused suites (0 skipped). All original Layer-0
  structural gates preserved.

EXACT TRANSITION ALLOWLIST (no wildcard; future R3 files are NOT auto-approved):
- Files: the five listed above only.
- Symbols: the four listed above only.
- Partial transfer (1-4 files, files-without-symbols, symbols-without-files, unexpected hash) remains
  FORBIDDEN and is classified INVALID_PARTIAL_TRANSITION.

NEW TRANSITION MARKER (full PASS only, exit 0): `CLEAN_WORKTREE_LAYER0_TO_LAYER1_TRANSITION_CONTRACT_PASS`.
The historical `CLEAN_WORKTREE_LAYER0_SUPPORT_PASS` is printed only as labeled historical baseline evidence.

SCOPE / NON-CLOSURE. This repair does NOT close R3 (Phases D-H remain unfinished), does NOT resolve P0-04,
does NOT enable checkout, does NOT authorize deployment, and does NOT authorize CORE-2. The next task will
be a separate prompt resuming R3 from Phase D. Independent Codex review remains required.

---

## R3 Phase D-H transition-allowlist reconciliation (2026-07-17)

Task P2-...-TRANSITION-ALLOWLIST-RECONCILIATION-R1-FINAL. The transition validator
`scripts/validate-clean-worktree-layer0-support.ps1` had its changed-file allowlist FAIL on authorized R3
Phase D-H files (a frozen-allowlist-vs-new-authorized-work conflict). Bounded, architecture-authorized fix:

- The transition validator allowlist now includes the EXACT authorized R3 Phase D-H files (explicit paths,
  inline-commented, NO wildcards/prefixes/future-file acceptance): `functions/src/index.ts`, `payments.ts`,
  `paymentsComplete.ts`, `pack288-web-stripe.ts`, the CORE-1 + P0-04 test files, and
  `scripts/validate-clean-worktree-layer1-payment-foundation-and-p0-04.ps1`.
- Git-failure robustness closed (both validator and the transition-test classifier): a failed `git` call /
  non-finite / negative staged count now FAILS CLOSED (never read as "0 staged"); new behavioral tests cover
  NaN / +/-Infinity / negative / non-integer.
- The Layer 1 validator's prior "allowlist superseded" exception was REMOVED; it now requires the subordinate
  transition validator to GENUINELY exit 0 + AUTHORIZED_LAYER1_TRANSITION + marker.

ALL fail-closed transition gates preserved (identity, exact 5 foundation hashes, 4 walletService symbols,
state classification, partial/unapproved/drift/staged rejection, Layer-0 structural + Pack48 checks). The
five approved foundation hashes are UNCHANGED. No runtime/financial file changed. This does not close R3/P0-04,
does not enable checkout, does not authorize deployment or CORE-2. Independent Codex review still required.
