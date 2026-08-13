#Requires -Version 5.1
<#
  validate-clean-worktree-layer0-support.ps1
  =====================================================================================
  P2-POST-STAGE3 CLEAN-WORKTREE LAYER 0 -> LAYER 1 TRANSITION-CONTRACT validator. READ-ONLY.

  REPAIRED 2026-07-17. This validator previously assumed the worktree was Layer-0-ONLY and asserted
  that NO Layer-1 payment-foundation file or walletService authority symbol had been transferred. The
  authorized R3 Payment-Foundation task (Phases A-C) has since transferred the EXACT approved five-file
  set + four walletService symbols. The obsolete absence assumption is replaced with a fail-closed
  transition contract that distinguishes three states and accepts only the first two:
    - PRE_LAYER1_BASELINE           (no approved foundation files, no approved symbols)
    - AUTHORIZED_LAYER1_TRANSITION  (all 5 approved files present w/ exact SHA-256 + all 4 symbols,
                                     no unapproved sibling/mobile-infra drift, 0 staged)
    - INVALID_PARTIAL_TRANSITION    (anything else -> REJECT)

  ALL original Layer-0 structural gates are preserved unchanged. If node_modules are absent it reports
  EXECUTION BLOCKED — DEPENDENCIES ABSENT and still runs structural gates; it never claims runtime PASS.

  On FULL PASS emits (exit 0):  CLEAN_WORKTREE_LAYER0_TO_LAYER1_TRANSITION_CONTRACT_PASS
  The historical marker CLEAN_WORKTREE_LAYER0_SUPPORT_PASS is printed only as clearly-labeled
  HISTORICAL baseline evidence, never as sole proof of the transition state. Else ..._FAIL (exit 1).
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Continue'

$root      = 'C:\a\avalo-controlled-enablement-clean'
$forensic  = 'C:\a\avalo'
$expectHead = '4224fd324ee24e387b189fb9307caa05c9ca1ef0'
$expectBranch = 'stabilization/build-green-2026-04-15'
$runtimeLogScanSha = 'E686C07275027E75ACAC6DAEADFB2C72B640C15DC2B1CCE1FD875E663B503B71'
$exit = 0
function Fail([string]$m) { Write-Host ("GATE FAIL: {0}" -f $m); $script:exit = 1 }
function Pass([string]$m) { Write-Host ("GATE PASS: {0}" -f $m) }

# ── Git-failure robustness (reconciliation task): every Git query is fail-closed. A nonzero $LASTEXITCODE
# or an execution error sets $script:gitFailed; callers must NEVER interpret a failed Git command as
# "zero changed/staged files". Gates 9/11/11b reject when $script:gitFailed is set.
$script:gitFailed = $false
function Invoke-GitLines([string[]]$gitArgs) {
  $out = $null
  try { $out = & git -C $root @gitArgs 2>$null } catch { $script:gitFailed = $true }
  if ($LASTEXITCODE -ne 0) { $script:gitFailed = $true }
  if ($script:gitFailed) { Write-Host ("  GIT COMMAND FAILED (fail-closed): git {0}" -f ($gitArgs -join ' ')); return @() }
  return @($out)
}

# Fragment-built conflict-marker detector (never self-matches).
$CM_OPEN = [string]([char]0x3C) * 7; $CM_SEP = [string]([char]0x3D) * 7; $CM_CLOSE = [string]([char]0x3E) * 7
function Find-ConflictMarker([string]$path) {
  if (-not (Test-Path $path)) { return 0 }
  $lines = [System.IO.File]::ReadAllLines($path)
  for ($i = 0; $i -lt $lines.Length; $i++) {
    $ln = $lines[$i]
    $ho = $ln.StartsWith($CM_OPEN) -and -not $ln.StartsWith($CM_OPEN + [char]0x3C)
    $hc = $ln.StartsWith($CM_CLOSE) -and -not $ln.StartsWith($CM_CLOSE + [char]0x3E)
    $hs = $ln.StartsWith($CM_SEP) -and -not $ln.StartsWith($CM_SEP + [char]0x3D)
    if ($ho -or $hc -or $hs) { return ($i + 1) }
  }
  return 0
}

# The original Layer-0 allowlist (git-status-visible Layer-0 changes must be a subset of this).
$allow = @(
  'functions/package.json','functions/package-lock.json','functions/jest.config.js',
  'functions/tsconfig.rules.json','functions/tests/setupFirestore.ts',
  'app-mobile/package.json','app-mobile/scripts/verify-pack48-client.mjs',
  'app-mobile/services/clientMessageId.ts','app-mobile/services/pack48CompanionClient.ts',
  'scripts/validate-clean-worktree-layer0-support.ps1',
  'functions/src/__tests__/clean-worktree-layer0-support.test.ts',
  'docs/p0-register/CLEAN_WORKTREE_RECOVERY_LAYER0.md'
)
# Authorized LAYER-1 TRANSITION content (R3 Phases A-C + this transition-contract task). Git-visible
# changes must be a subset of ($allow + $layer1Allow). moneyLog.ts is .gitignore'd (not git-visible).
$layer1Allow = @(
  'functions/src/wallet/walletService.ts',
  'functions/src/payments/canonicalStripeCompletion.ts',
  'functions/src/payments/stripeCheckoutIntent.ts',
  'functions/src/payments/stripeRefunds.ts',
  'functions/src/payments/financialOperationContract.ts',
  'functions/src/__tests__/fnd1-server-financial-authority-contract.test.ts',
  'functions/src/__tests__/clean-worktree-layer0-to-layer1-transition.test.ts'
)
# Authorized R3 PHASE D-H content (task P2-...-RESUME-PHASE-D-THROUGH-H-R2-FINAL). Reconciled into this
# allowlist by task P2-...-TRANSITION-ALLOWLIST-RECONCILIATION-R1-FINAL. Explicit exact paths ONLY — no
# wildcard/prefix, no future-file acceptance. Each entry is a specific runtime/test/validator file whose
# bounded change was authorized by the R3 resume prompt; none broadens future scope.
$r3PhaseDtoH = @(
  'functions/src/index.ts',                                              # runtime: unexport 3 unsafe legacy symbols only
  'functions/src/payments.ts',                                           # runtime: hard-disable creditTokensCallable only
  'functions/src/paymentsComplete.ts',                                   # runtime: hard-disable createStripeCheckoutSession only
  'functions/src/pack288-web-stripe.ts',                                 # runtime: enablement gate + canonical creator gating/intent + webhook->canonical
  'functions/src/__tests__/core1-token-checkout-completion.test.ts',     # test: CORE-1 emulator behavioral suite
  'functions/src/__tests__/p0-04-legacy-stripe-containment.test.ts',     # test: P0-04 flag-off/containment suite
  'scripts/validate-clean-worktree-layer1-payment-foundation-and-p0-04.ps1' # validator: final Layer-1 + P0-04 validator
)
# Authorized P0-01 ADVERTISER-CREDIT content (task P0-01-...-R1-FINAL). Explicit exact paths only — no wildcard.
# Reconciled into this allowlist so the transition contract's substance stays green while P0-01 adds authorized
# files; no fail-closed transition gate (identity/hashes/symbols/state/tests) is weakened.
$p0_01Allow = @(
  'functions/src/pack349-endpoints.ts',                                    # runtime: retire addAdvertiserTokens mint
  'functions/src/pack349-billing.ts',                                      # runtime: server-only creditAdvertiserAccount + retire legacy
  'functions/src/__tests__/p0-01-advertiser-credit-authorization.test.ts', # test: P0-01 containment suite (main)
  'functions/tests/rules/p0-01-advertiser-credit-rules.test.ts',           # test: P0-01 R3 Firestore-rules denial suite
  'scripts/validate-p0-01-advertiser-credit-authorization.ps1'             # validator: P0-01 validator
)
# Authorized P0-02 AI-BILLING-PREAUTHORIZATION content (task P0-02-...-R1-FINAL). Explicit exact paths only — no
# wildcard. Reconciled so the transition contract's substance stays green while P0-02 adds authorized files; no
# fail-closed transition gate (identity/hashes/symbols/state/tests) is weakened.
$p0_02Allow = @(
  'app-web/src/lib/ai-billing/aiSpendAuthorization.ts',                      # runtime: canonical AI spend preauthorization (app-web-owned)
  'app-web/src/app/api/ai/chat/route.ts',                                    # runtime: chat route thin adapter (preauth->provider->settle)
  'app-web/src/app/api/ai/escrow/route.ts',                                  # runtime: legacy escrow client-writer contained
  'functions/src/__tests__/p0-02-ai-billing-preauthorization.test.ts',       # test: P0-02 preauthorization suite (main)
  'functions/tests/rules/p0-02-ai-billing-rules.test.ts',                    # test: P0-02 AI-billing rules denial suite
  'scripts/validate-p0-02-ai-billing-preauthorization.ps1',                  # validator: P0-02 validator
  'functions/src/ai-billing/legacyAiCompanionContainment.ts',               # R3 runtime: legacy companion containment contract
  'functions/src/aiCompanionFunctions.ts',                                   # R3 runtime: sendAIMessage SAFE_UNAVAILABLE
  'functions/src/aiCompanions.ts',                                           # R3 runtime: sendAIMessageCallable SAFE_UNAVAILABLE
  'functions/src/__tests__/p0-02-r3-functions-companion-containment.test.ts', # R3 test: containment behavioral suite
  # P0-05 R1A-1 — c5 exported-callable SAFE_UNAVAILABLE containment (authorized stage; adds paths only, no gate weakening)
  'functions/src/chat/canonicalDirectChatCallables.ts',                       # runtime: c5 callables fail-closed
  'functions/src/chat/c5DirectChatContainment.ts',                            # runtime: c5 containment guard
  'functions/src/__tests__/p0-05-r1a1-c5-containment.test.ts',                # test: c5 containment behavioral suite
  'scripts/validate-p0-05-r1a1-c5-containment.ps1',                           # validator: P0-05 R1A-1 validator
  # P0-05 R1B-1 — source-level latent ENGINE_A financial-vector neutralization (authorized stage; paths only)
  'functions/src/canonical-chat-engine.ts',                                   # runtime: processMessage requires TrustedPaidChatAuthority
  'functions/src/chat/paidChatAuthority.ts',                                  # runtime: non-forgeable trusted paid-chat authority
  'functions/src/__tests__/p0-05-r1b1-engine-a-latent-vector-neutralization.test.ts', # test: R1B-1 adversarial suite
  'scripts/validate-p0-05-r1b1-engine-a-latent-vector-neutralization.ps1',    # validator: P0-05 R1B-1 validator
  # P0-05 R1B-2 — server-owned /paidChats canonical authority foundation + loader (authorized stage; paths only)
  'functions/src/chat/canonicalPaidChat/paidChatRecord.ts',                   # runtime: /paidChats schema + pure validator
  'functions/src/__tests__/p0-05-r1b2-server-owned-paidchat-authority.test.ts', # test: R1B-2 loader/forgeability suite
  'functions/tests/rules/p0-05-r1b2-paidchat-rules.test.ts',                  # test: R1B-2 /paidChats rules denial suite
  'scripts/validate-p0-05-r1b2-server-owned-paidchat-authority.ps1'           # validator: P0-05 R1B-2 validator
)
# Authorized P0-IAM-01A FINANCIAL-AUTHORITY TRUST-BOUNDARY FOUNDATION content (task P0-IAM-01A). Explicit exact paths
# ONLY — no wildcard/prefix, no directory, no future-file acceptance. Reconciled so the transition contract's substance
# stays green while P0-IAM-01A adds authorized files; no fail-closed gate (identity/hashes/symbols/state/tests) is
# weakened. paidChatAuthority.ts (already in $p0_02Allow, modified in place) and the R1B-2 test (already allowlisted) are
# NOT re-added; these six are the NEW authorized files of the cryptographic provenance foundation.
$p0_iam01aAllow = @(
  'functions/src/security/financialAuthority/canonicalFingerprint.ts',                        # runtime: deterministic canonical fingerprint
  'functions/src/security/financialAuthority/authorityEnvelope.ts',                           # runtime: authority envelope contract
  'functions/src/security/financialAuthority/authorityProvenance.ts',                         # runtime: signer/verifier + production fail-closed
  'functions/src/__tests__/helpers/iam01aTestSigner.ts',                                      # test: isolated test-only asymmetric signer
  'functions/src/__tests__/p0-iam-01a-financial-authority-trust-boundary-foundation.test.ts', # test: P0-IAM-01A adversarial suite
  'scripts/validate-p0-iam-01a-financial-authority-trust-boundary-foundation.ps1'             # validator: P0-IAM-01A validator
)
# Authorized P0-IAM-01B PRODUCTION AUTHORITY-SERVICE / KMS TRUST-ROOT content (task P0-IAM-01B). Exact paths ONLY — no
# wildcard/prefix/directory. Reconciled so the transition contract stays green while P0-IAM-01B adds authorized files;
# no fail-closed gate is weakened. Three runtime modules + a test harness + adversarial suite + validator.
$p0_iam01bAllow = @(
  'functions/src/security/financialAuthority/kmsSigner.ts',                                   # runtime: KMS-backed signer (no local key)
  'functions/src/security/financialAuthority/serviceAuth.ts',                                 # runtime: service-to-service OIDC auth + default-deny policy
  'functions/src/security/financialAuthority/authorityService.ts',                            # runtime: dedicated Authority Service (narrow signing op)
  'functions/src/__tests__/helpers/iam01bTestHarness.ts',                                     # test: fake KMS/OIDC/idempotency harness (isolated)
  'functions/src/__tests__/p0-iam-01b-production-authority-trust-root.test.ts',               # test: P0-IAM-01B adversarial suite
  'scripts/validate-p0-iam-01b-production-authority-trust-root.ps1'                            # validator: P0-IAM-01B validator
)
# Authorized P0-IAM-01B1 EMULATOR-LIFECYCLE ADJUDICATION repair (firebase-tools 15.9.0 Windows cleanShutdown exit-2
# defect: the CLI returns exit 2 after the wrapped jest script exits 0 and Firestore shuts down cleanly). Two NEW
# infra files: a shared lifecycle adjudicator consumed by the emulator-backed validators, and its permanent adversarial
# self-test harness. Exact literal paths ONLY — no scripts/lib or scripts/tests directory/prefix acceptance.
$p0_iam01b1EmuLifecycleAllow = @(
  'scripts/lib/EmulatorLifecycle.ps1',                              # shared: emulator-suite lifecycle adjudicator (fail-closed)
  'scripts/tests/emulator-lifecycle-adjudication.tests.ps1',        # test: adversarial lifecycle self-test harness
  'scripts/tests/strict-jest-parser.tests.ps1'                      # test: adversarial strict Jest parser self-tests (R5)
)
# Authorized P0-IAM-01B1 R8 EOL determinism repair. ONE new repository-root file, exact literal path only.
# The repository declared no text attributes at all, so the bytes a checkout produced were decided by the
# reader's core.autocrlf. Measured against R7, all nine security-pinned PowerShell files hashed differently
# between autocrlf=true and false - including scripts/lib/RuntimeLogScan.ps1, whose SHA-256 is pinned by THIS
# validator at gate 7: a default-Windows checkout of an unmodified commit produced F3C1B7E9... against the
# pinned E686C072..., so the pin failed on bytes Git reported as clean. .gitattributes marks exactly that
# population `text eol=lf`, making checked-out bytes equal the canonical blob under any configuration.
# Declared here because gate 11 enumerates untracked files: a new root file must be authorized, not exempted.
$p0_iam01b1R8EolAllow = @('.gitattributes')
# EXACT approved Layer-1 five-file foundation set + authoritative SHA-256 (byte-exact R3 recovery;
# source: evidence avalo-r3-payment-foundation-p0-04-r1\02-transfers-and-inventory.md). No wildcard.
$approvedFoundation = [ordered]@{
  'functions/src/payments/canonicalStripeCompletion.ts'  = 'bc94c9dbde0b25cf22a6aa8114674e557d77aefe32e292db9bbf2610d33797ee'
  'functions/src/payments/stripeCheckoutIntent.ts'       = 'e4298e7c192e2b1690ac504d58bbe8a32056c9b9de83abb7a780d2fe68545434'
  'functions/src/payments/stripeRefunds.ts'              = 'f9b552996a3af6dd2cbb92c70dfd4a5f7720d096a3a8675ffa827ea840d65429'
  'functions/src/lib/moneyLog.ts'                        = 'dbafe33c5046bf2a5ef5cea078cda98b10c15332bb90f3185364890e41bfd407'
  'functions/src/payments/financialOperationContract.ts' = '6cd2fc02d4aca01470ab923f38bc7bde229a5c50c33b1860be56bbcf4037b3e4'
}
# EXACT approved walletService authority symbols (no prefix/wildcard acceptance).
$approvedSymbols = @('PROVIDER_PURCHASE_TX_COLLECTION','PAYMENT_RECONCILIATION_COLLECTION','PAYMENT_COMPLETION_OUTBOX_COLLECTION','creditVerifiedProviderPurchase')
# Foundation siblings / mobile-infra that remain UNAPPROVED for this transition -> MUST stay absent.
$forbiddenPresent = @(
  'functions/src/payments/checkoutEnablementGate.ts',
  'functions/src/payments/purchaseStatusAuthority.ts','functions/src/payments/checkoutTelemetry.ts',
  'functions/src/payments/checkoutTelemetrySink.ts','functions/src/payments/reconciliationHealthScanner.ts',
  'functions/src/payments/canonicalLinkage.ts','app-mobile/services/purchaseStatusApi.ts',
  'app-mobile/lib/firebase.ts','app-mobile/lib/firebase.tsx','app-mobile/lib/firebase/index.ts'
)

Write-Host "=== 0. Repository identity (clean worktree) ==="
$top = (& git -C $root rev-parse --show-toplevel) 2>$null
if ($top -and ($top -replace '\\','/') -eq 'C:/a/avalo-controlled-enablement-clean') { Pass 'repository identity (clean worktree)' } else { Fail ("repository identity (got {0})" -f $top) }

Write-Host "=== 1. Detached exact HEAD ==="
$head = (& git -C $root rev-parse HEAD) 2>$null
$sym = (& git -C $root symbolic-ref -q HEAD) 2>$null
if ($head -eq $expectHead -and -not $sym) { Pass 'detached exact HEAD' } else { Fail ("detached exact HEAD (head={0} sym={1})" -f $head, $sym) }

Write-Host "=== 2. Forensic source untouched ==="
$fhead = (& git -C $forensic rev-parse HEAD) 2>$null
$fbranch = (& git -C $forensic rev-parse --abbrev-ref HEAD) 2>$null
if ($fhead -eq $expectHead -and $fbranch -eq $expectBranch) { Pass 'forensic source identity untouched' } else { Fail 'forensic source identity' }

Write-Host "=== 3. functions/package.json valid JSON + no trailing NUL ==="
$pj = Join-Path $root 'functions\package.json'
$pjBytes = [System.IO.File]::ReadAllBytes($pj)
$pjNul = ($pjBytes | Where-Object { $_ -eq 0 }).Count
$pjParse = $false; try { $pjObj = (Get-Content $pj -Raw | ConvertFrom-Json); $pjParse = $true } catch { $pjParse = $false }
if ($pjNul -eq 0 -and $pjParse) { Pass 'package.json valid JSON, 0 NUL bytes' } else { Fail ("package.json (NUL={0} parse={1})" -f $pjNul, $pjParse) }

Write-Host "=== 4. package-lock consistency ==="
$lk = Join-Path $root 'functions\package-lock.json'
$lkOk = $true
try {
  $lkObj = (Get-Content $lk -Raw | ConvertFrom-Json -AsHashtable)
  $rootRec = $lkObj.packages['']
  $pjDev = @($pjObj.devDependencies.PSObject.Properties.Name) | Sort-Object
  $lkDev = @($rootRec.devDependencies.Keys) | Sort-Object
  $mismatch = (@($pjDev | Where-Object { $_ -notin $lkDev }).Count) + (@($lkDev | Where-Object { $_ -notin $pjDev }).Count)
  $hasRut = $lkObj.packages.ContainsKey('node_modules/@firebase/rules-unit-testing')
  $hasFb = $lkObj.packages.ContainsKey('node_modules/firebase')
  $nameOk = ($lkObj.name -eq $pjObj.name) -and ($lkObj.version -eq $pjObj.version)
  if (-not ($mismatch -eq 0 -and $hasRut -and $hasFb -and $nameOk -and $lkObj.lockfileVersion)) { $lkOk = $false; Write-Host ("  lock detail: mismatch={0} rut={1} fb={2} nameOk={3} lfv={4}" -f $mismatch,$hasRut,$hasFb,$nameOk,$lkObj.lockfileVersion) }
} catch { $lkOk = $false; Write-Host ("  lock parse error: " + $_.Exception.Message) }
if ($lkOk) { Pass 'package-lock consistent with manifest (rules/emulator devDeps present)' } else { Fail 'package-lock consistency' }

Write-Host "=== 5. Jest multi-project (main + rules) ==="
$jc = Join-Path $root 'functions\jest.config.js'
$projNames = (& node -e "try{const c=require(process.argv[1]);const n=(c.projects||[]).map(p=>p.displayName);process.stdout.write(n.join(','))}catch(e){process.stdout.write('ERR:'+e.message)}" $jc) 2>$null
Write-Host ("  jest projects: {0}" -f $projNames)
if ($projNames -match 'main' -and $projNames -match 'rules') { Pass 'Jest defines main + rules projects' } else { Fail 'Jest multi-project (main/rules)' }

Write-Host "=== 6. tsconfig.rules.json exists + parses ==="
$trj = Join-Path $root 'functions\tsconfig.rules.json'
$trjOk = $false; if (Test-Path $trj) { try { $null = (Get-Content $trj -Raw | ConvertFrom-Json); $trjOk = $true } catch { $trjOk = $false } }
if ($trjOk) { Pass 'tsconfig.rules.json exists + parses' } else { Fail 'tsconfig.rules.json' }

Write-Host "=== 7. RuntimeLogScan.ps1 exists + hash ==="
$rls = Join-Path $root 'scripts\lib\RuntimeLogScan.ps1'
$rlsOk = $false
if (Test-Path $rls) { $h = (Get-FileHash -LiteralPath $rls -Algorithm SHA256).Hash; $rlsOk = ($h -eq $runtimeLogScanSha) }
if ($rlsOk) { Pass 'RuntimeLogScan.ps1 present + SHA-256 verified' } else { Fail 'RuntimeLogScan.ps1 integrity' }

Write-Host "=== 8. Pack48 runner support ==="
$p48Ok = $true
foreach ($f in 'app-mobile/scripts/verify-pack48-client.mjs','app-mobile/services/clientMessageId.ts','app-mobile/services/pack48CompanionClient.ts') {
  if (-not (Test-Path (Join-Path $root ($f -replace '/','\')))) { Write-Host ("  MISSING {0}" -f $f); $p48Ok = $false }
}
$amPjText = Get-Content (Join-Path $root 'app-mobile\package.json') -Raw
if ($amPjText -notmatch 'test:pack48-client') { Write-Host '  test:pack48-client script missing'; $p48Ok = $false }
if ($p48Ok) { Pass 'Pack48 runner support files + script present' } else { Fail 'Pack48 runner support' }

Write-Host "=== 9. Layer-0 -> Layer-1 transition state (fail-closed; accept PRE_LAYER1_BASELINE or AUTHORIZED_LAYER1_TRANSITION) ==="
# 9a. No UNAPPROVED foundation sibling / mobile-infra drift.
$noDrift = $true
foreach ($f in $forbiddenPresent) { if (Test-Path (Join-Path $root ($f -replace '/','\'))) { Write-Host ("  UNAPPROVED DRIFT PRESENT: {0}" -f $f); $noDrift = $false } }
# 9b. Approved foundation-file presence + EXACT SHA-256.
$fCount = 0; $hashOk = $true
foreach ($rel in $approvedFoundation.Keys) {
  $p = Join-Path $root ($rel -replace '/','\')
  if (Test-Path $p) {
    $fCount++
    $h = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash
    if ($h -ne $approvedFoundation[$rel]) { Write-Host ("  HASH MISMATCH: {0}" -f $rel); $hashOk = $false }
  }
}
# 9c. Approved walletService symbols (complete set required for transition).
$wsText = Get-Content (Join-Path $root 'functions\src\wallet\walletService.ts') -Raw
$symCount = 0
foreach ($sym in $approvedSymbols) { if ($wsText -match [regex]::Escape($sym)) { $symCount++ } }
# 9d. Staged files must be zero (a transition never carries a staged index).
$stagedLines = Invoke-GitLines @('diff','--cached','--name-only')
$stagedCount = @($stagedLines | Where-Object { $_.Trim() -ne '' }).Count
if ($script:gitFailed -or ($stagedCount -isnot [int]) -or ($stagedCount -lt 0)) { $stagedCount = [int]::MaxValue } # unparseable/failed -> fail closed
# 9e. Classify.
$allFiles = ($fCount -eq $approvedFoundation.Count)
$noFiles  = ($fCount -eq 0)
$allSyms  = ($symCount -eq $approvedSymbols.Count)
$noSyms   = ($symCount -eq 0)
$transitionState = 'INVALID_PARTIAL_TRANSITION'
if ($noDrift -and $stagedCount -eq 0 -and -not $script:gitFailed) {
  if ($noFiles -and $noSyms) { $transitionState = 'PRE_LAYER1_BASELINE' }
  elseif ($allFiles -and $hashOk -and $allSyms) { $transitionState = 'AUTHORIZED_LAYER1_TRANSITION' }
}
Write-Host ("  transition detail: files={0}/5 hashOk={1} symbols={2}/4 unapprovedDrift={3} staged={4}" -f $fCount,$hashOk,$symCount,(-not $noDrift),$stagedCount)
Write-Host ("  TRANSITION STATE: {0}" -f $transitionState)
if ($transitionState -eq 'PRE_LAYER1_BASELINE' -or $transitionState -eq 'AUTHORIZED_LAYER1_TRANSITION') {
  Pass ("transition state accepted ({0})" -f $transitionState)
} else {
  Fail ("transition state rejected ({0})" -f $transitionState)
}

Write-Host "=== 10. No app-mobile/lib/firebase introduced ==="
if (-not (Test-Path (Join-Path $root 'app-mobile\lib'))) { Pass 'app-mobile/lib absent (mobile firebase not introduced)' }
elseif (@(Get-ChildItem -Path (Join-Path $root 'app-mobile\lib') -Filter 'firebase*' -ErrorAction SilentlyContinue).Count -eq 0) { Pass 'app-mobile/lib present but no firebase module introduced' }
else { Fail 'app-mobile/lib/firebase introduced' }

Write-Host "=== 11. Git diff limited to Layer-0 + Layer-1 transition + R3 Phase D-H allowlist ==="
$status = Invoke-GitLines @('status','--short','-uall')
$changed = @(); foreach ($l in $status) { if ($l.Length -gt 3) { $changed += ($l.Substring(3).Trim() -replace '\\','/') } }
$combinedAllow = @($allow + $layer1Allow + $r3PhaseDtoH + $p0_01Allow + $p0_02Allow + $p0_iam01aAllow + $p0_iam01bAllow + $p0_iam01b1EmuLifecycleAllow + $p0_iam01b1R8EolAllow)
$outside = @($changed | Where-Object { $_ -notin $combinedAllow })
if ($script:gitFailed) { Fail 'allowlist enforcement — git status failed (fail-closed)' }
elseif ($outside.Count -eq 0) { Pass ('git diff within Layer-0 + Layer-1 transition + R3 D-H allowlist ({0} changed files)' -f $changed.Count) }
else { $outside | ForEach-Object { Write-Host ("  OUTSIDE ALLOWLIST: {0}" -f $_) }; Fail 'allowlist enforcement (Layer-0 + Layer-1 transition + R3 D-H)' }

Write-Host "=== 11b. Zero staged files (fail-closed on unknown Git state) ==="
if (-not $script:gitFailed -and $stagedCount -eq 0) { Pass 'no staged files' } else { Fail ("staged files present or Git state unknown ({0})" -f $stagedCount) }

Write-Host "=== 12. No secret VALUES / provider-runtime commands in changed files ==="
# Self-referential guards are excluded: this validator DEFINES the patterns and the Layer-0 test ASSERTS
# their absence, so both legitimately contain the literals. Build manifests are scanned for secret VALUES
# only — an `npm run deploy` -> `firebase deploy` script is legitimate build tooling, not smuggled runtime.
$selfGuards = @(
  'scripts/validate-clean-worktree-layer0-support.ps1',
  'functions/src/__tests__/clean-worktree-layer0-support.test.ts'
)
$manifests = @('functions/package.json','functions/package-lock.json','app-mobile/package.json')
$secretRe = @('sk_live_[A-Za-z0-9]{6,}','sk_test_[A-Za-z0-9]{6,}','whsec_[A-Za-z0-9]{6,}')
$cmdLit   = @('firebase deploy','gcloud ','SECRET_MANAGER','runtimeconfig.json')
$scanRel  = @($changed | Where-Object { $_ -notin $selfGuards }) + @('scripts/lib/RuntimeLogScan.ps1')
$secretHit = $false
foreach ($rel in $scanRel) {
  $p = Join-Path $root ($rel -replace '/','\')
  if (-not (Test-Path $p)) { continue }
  if ($rel -match 'package-lock\.json$') { continue } # integrity hashes only
  $txt = Get-Content $p -Raw
  foreach ($re in $secretRe) { if ($txt -match $re) { Write-Host ("  SECRET VALUE /{0}/ in {1}" -f $re, $rel); $secretHit = $true } }
  if ($rel -notin $manifests) {
    foreach ($lit in $cmdLit) { if ($txt -match [regex]::Escape($lit)) { Write-Host ("  CMD '{0}' in {1}" -f $lit, $rel); $secretHit = $true } }
  }
}
if (-not $secretHit) { Pass 'no secret values / provider-runtime commands in changed source files' } else { Fail 'forbidden token in changed files' }

Write-Host "=== 13. No NUL bytes / conflict markers in changed files ==="
$integrityOk = $true
foreach ($rel in ($changed + @('scripts/lib/RuntimeLogScan.ps1'))) {
  $p = Join-Path $root ($rel -replace '/','\')
  if (-not (Test-Path $p)) { continue }
  if ($p -match 'package\.json$' -or $p -match 'package-lock\.json$') {
    if ([System.IO.File]::ReadAllBytes($p) -contains 0) { Write-Host ("  NUL in {0}" -f $rel); $integrityOk = $false }
    continue
  }
  if ([System.IO.File]::ReadAllBytes($p) -contains 0) { Write-Host ("  NUL in {0}" -f $rel); $integrityOk = $false }
  $cm = Find-ConflictMarker $p; if ($cm -gt 0) { Write-Host ("  conflict marker in {0} line {1}" -f $rel, $cm); $integrityOk = $false }
}
if ($integrityOk) { Pass 'no NUL bytes / conflict markers in changed files' } else { Fail 'changed-file integrity' }

Write-Host "=== 14. Execution: focused Layer-0 support + Layer-0->Layer-1 transition Jest suites ==="
$nm = Join-Path $root 'functions\node_modules'
if (Test-Path $nm) {
  Write-Host 'DEPENDENCIES AVAILABLE (functions/node_modules reproduced via `npm ci --ignore-scripts`).'
  Push-Location (Join-Path $root 'functions')
  $jestOut = & node_modules\.bin\jest.cmd --selectProjects main --runInBand --runTestsByPath `
    src/__tests__/clean-worktree-layer0-support.test.ts `
    src/__tests__/clean-worktree-layer0-to-layer1-transition.test.ts 2>&1
  $jestExit = $LASTEXITCODE
  Pop-Location
  $testsLine = @($jestOut | Select-String -Pattern 'Tests:\s') | Select-Object -Last 1
  $line = if ($testsLine) { $testsLine.ToString().Trim() } else { '(no Tests: line)' }
  $skipped = ($line -match 'skipped')
  Write-Host ("  focused Layer-0 + transition suite -> {0} (exit {1})" -f $line, $jestExit)
  if ($jestExit -eq 0 -and $line -match 'passed' -and $line -notmatch 'failed' -and -not $skipped) {
    Pass 'focused Layer-0 + transition Jest suites executed + passed (0 skipped)'
  } else { Fail 'focused Layer-0 + transition Jest suites' }
} else {
  Write-Host 'EXECUTION BLOCKED — DEPENDENCIES ABSENT'
  Write-Host 'Structural/static gates evaluated above; no runtime/test PASS is claimed.'
  Fail 'focused suites NOT EXECUTED (dependencies absent) — transition state cannot be runtime-proven'
}

Write-Host "=== 15. app-mobile Pack48 client execution availability (informational) ==="
$amLock = @('app-mobile\package-lock.json','app-mobile\yarn.lock','app-mobile\pnpm-lock.yaml','pnpm-lock.yaml') | Where-Object { Test-Path (Join-Path $root $_) }
if ($amLock) { Write-Host ("  app-mobile deterministic lock present: {0}" -f ($amLock -join ', ')) }
else { Write-Host '  PACK48 CLIENT EXECUTION BLOCKED — NO DETERMINISTIC APP-MOBILE DEPENDENCY SOURCE (residual Layer-2/Pack48 blocker; does NOT fail functions Layer-0).' }

Write-Host ""
if ($exit -eq 0) {
  Write-Host ("FINAL TRANSITION STATE: {0}" -f $transitionState)
  Write-Host '(HISTORICAL baseline evidence only: CLEAN_WORKTREE_LAYER0_SUPPORT_PASS — original Layer-0 closure remains accepted; not sole proof of the transition state.)'
  Write-Host 'RESULT: CLEAN_WORKTREE_LAYER0_TO_LAYER1_TRANSITION_CONTRACT_PASS'
}
else { Write-Host 'RESULT: CLEAN_WORKTREE_LAYER0_TO_LAYER1_TRANSITION_CONTRACT_FAIL' }
exit $exit
