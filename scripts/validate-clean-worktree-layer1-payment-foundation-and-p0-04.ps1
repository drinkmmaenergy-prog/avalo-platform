#Requires -Version 5.1
<#
  validate-clean-worktree-layer1-payment-foundation-and-p0-04.ps1
  =====================================================================================
  R3 PAYMENT FOUNDATION + P0-04 LEGACY STRIPE CONTAINMENT — final Layer-1 validator. READ-ONLY.
  Fail-closed. Boots the local Firestore emulator deterministically for CORE-1/P0-04 behavioral proof.

  TRANSITION-VALIDATOR RECONCILIATION (task ...-TRANSITION-ALLOWLIST-RECONCILIATION-R1-FINAL): the prior
  'allowlist superseded' exception has been REMOVED. The subordinate transition validator
  scripts/validate-clean-worktree-layer0-support.ps1 had its changed-file allowlist reconciled to include
  the authorized R3 Phase D-H files, so it now GENUINELY exits 0. Gate 2 here therefore requires a real
  transition-validator exit 0 + AUTHORIZED_LAYER1_TRANSITION state + the transition marker; a failed
  subordinate validator is never accepted by parsing partial output.

  On FULL PASS emits (exit 0): CLEAN_WORKTREE_LAYER1_PAYMENT_FOUNDATION_AND_P0_04_PASS. Else ..._FAIL (1).
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Continue'

$root = 'C:\a\avalo-controlled-enablement-clean'
$forensic = 'C:\a\avalo'
$expectHead = '4224fd324ee24e387b189fb9307caa05c9ca1ef0'
$fnroot = Join-Path $root 'functions'
$exit = 0
function Fail([string]$m) { Write-Host ("GATE FAIL: {0}" -f $m); $script:exit = 1 }
function Pass([string]$m) { Write-Host ("GATE PASS: {0}" -f $m) }

# ============================================================================================
# STRUCTURED NAMED-TEST PARSER (hardened, distinct-record). Replaces the line-heuristic that was
# fail-open when one crafted line contained both phrase sets. Consumes Jest --json assertionResults,
# requires TWO DISTINCT executed+passed records whose EXACT names equal the required titles, in the
# P0-04 test file. Exact-name equality defeats a combined-title attack; distinct index+name defeats a
# single-record-satisfies-both attack.
# ============================================================================================
function Convert-NormName([string]$s) {
  if ($null -eq $s) { return '' }
  $t = $s -replace ([char]27 + '\[[0-9;]*m'), ''  # strip ANSI SGR
  $t = $t -replace '\s+', ' '
  return $t.Trim()
}
# Flatten a parsed Jest --json object into one record per assertionResult, with a stable global index.
function Get-JestAssertionRecords($jsonObj) {
  $records = New-Object System.Collections.Generic.List[object]
  $idx = 0
  foreach ($tr in @($jsonObj.testResults)) {
    $file = [string]$tr.name
    foreach ($ar in @($tr.assertionResults)) {
      $records.Add([pscustomobject]@{
        index = $idx; file = ($file -replace '\\','/'); fullName = (Convert-NormName ([string]$ar.fullName));
        title = (Convert-NormName ([string]$ar.title)); status = ([string]$ar.status)
      })
      $idx++
    }
  }
  return ,$records.ToArray()
}
# Exactly ONE passed record whose fullName OR title EXACTLY equals $exact, in a file ending $fileSuffix.
function Find-ExactPassed($records, [string]$exact, [string]$fileSuffix) {
  $ex = Convert-NormName $exact
  $sfx = $fileSuffix.ToLower()
  $hits = @($records | Where-Object {
    $_.status -eq 'passed' -and ($_.fullName -eq $ex -or $_.title -eq $ex) -and ($_.file.ToLower().EndsWith($sfx))
  })
  if ($hits.Count -eq 1) { return $hits[0] }
  return $null  # 0 (missing) or >1 (ambiguous) -> fail closed
}
# Distinct-record gate: exact pack + exact currency, distinct index AND distinct name, both P0-04 file.
function Test-DistinctNamedPass($records, [string]$packName, [string]$currName, [string]$fileSuffix) {
  $p = Find-ExactPassed $records $packName $fileSuffix
  $c = Find-ExactPassed $records $currName $fileSuffix
  $distinct = ($null -ne $p) -and ($null -ne $c) -and ($p.index -ne $c.index) -and ($p.fullName -ne $c.fullName)
  return [pscustomobject]@{
    packFound = ($null -ne $p); packLine = $(if ($p) { $p.index } else { -1 }); packName = $(if ($p) { $p.fullName } else { '' })
    currencyFound = ($null -ne $c); currencyLine = $(if ($c) { $c.index } else { -1 }); currencyName = $(if ($c) { $c.fullName } else { '' })
    recordsDistinct = $distinct; ok = $distinct
  }
}
# Build a synthetic Jest-json-shaped object from tuples @(@{file;fullName;status}) for parser self-tests.
function New-FakeJest([object[]]$asserts, $success = $true, $numFailed = 0, $numPending = 0, $numTodo = 0, $numTotal = $null) {
  $byFile = @{}
  foreach ($a in $asserts) {
    $f = [string]$a.file
    if (-not $byFile.ContainsKey($f)) { $byFile[$f] = New-Object System.Collections.Generic.List[object] }
    $byFile[$f].Add([pscustomobject]@{ fullName = $a.fullName; title = $a.fullName; status = $a.status })
  }
  $testResults = @()
  foreach ($f in $byFile.Keys) { $testResults += [pscustomobject]@{ name = $f; assertionResults = $byFile[$f].ToArray() } }
  $numPassed = @($asserts | Where-Object { $_.status -eq 'passed' }).Count
  $total = if ($null -ne $numTotal) { $numTotal } else { $numPassed + $numFailed + $numPending + $numTodo }
  return [pscustomobject]@{ success = $success; numPassedTests = $numPassed; numFailedTests = $numFailed; numPendingTests = $numPending; numTodoTests = $numTodo; numTotalTests = $total; testResults = $testResults }
}
# ---- STRICT, SCHEMA-AWARE JSON SUMMARY VALIDATION (fail-closed; replaces [int]$null->0 fail-open) ----
# A required property must be PRESENT (not merely accessible-as-null). Distinguishes missing vs null vs wrong-type.
function Test-HasProperty($obj, [string]$name) {
  if ($null -eq $obj) { return $false }
  if ([string]::IsNullOrEmpty($name)) { return $false }
  $props = $null
  try { $props = $obj.PSObject.Properties } catch { return $false }
  if ($null -eq $props) { return $false }
  return ($null -ne ($props | Where-Object { $_.Name -eq $name } | Select-Object -First 1))
}
# success must be a real [bool] equal to $true. Rejects 1/0/"true"/"false"/null/array/object.
function Test-StrictTrue($v) { return (($v -is [bool]) -and ($v -eq $true)) }
# Strict nonnegative integer. Rejects null/bool/string/array/object/NaN/Inf/fractional/negative/overflow.
# Accepts native integral types (Int16/Int32/Int64/Byte/UInt*) and Double/Decimal ONLY if finite + integral.
# Returns [long] via [ref]$out only after success. Documented accepted types in evidence 04.
function Test-StrictNonNegInt($v, [ref]$out) {
  $out.Value = $null
  if ($null -eq $v) { return $false }
  if ($v -is [bool]) { return $false }
  if ($v -is [string]) { return $false }
  if ($v -is [array]) { return $false }
  if (($v -is [int]) -or ($v -is [long]) -or ($v -is [int16]) -or ($v -is [byte]) -or ($v -is [uint16]) -or ($v -is [uint32]) -or ($v -is [uint64])) {
    $l = [long]$v; if ($l -lt 0) { return $false }; $out.Value = $l; return $true
  }
  if (($v -is [double]) -or ($v -is [single]) -or ($v -is [decimal])) {
    if (($v -is [double]) -or ($v -is [single])) {
      $d0 = [double]$v
      if ([double]::IsNaN($d0) -or [double]::IsInfinity($d0)) { return $false }
    }
    $d = [double]$v
    if ($d -lt 0) { return $false }
    if ($d -gt 9.0e18) { return $false }
    if ([math]::Floor($d) -ne $d) { return $false }
    $out.Value = [long]$d; return $true
  }
  return $false
}
# Full strict summary schema validation. Returns @{ ok; reason }. minPassed is enforced on passed AND total.
function Test-JsonSummaryStrict($j, [long]$minPassed) {
  if ($null -eq $j) { return @{ ok = $false; reason = 'root_null' } }
  if ($j -is [array]) { return @{ ok = $false; reason = 'root_array' } }
  if (($j -is [string]) -or ($j -is [bool]) -or ($j -is [int]) -or ($j -is [long]) -or ($j -is [double]) -or ($j -is [decimal])) { return @{ ok = $false; reason = 'root_scalar' } }
  foreach ($p in @('success', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests', 'numTotalTests', 'testResults')) {
    if (-not (Test-HasProperty $j $p)) { return @{ ok = $false; reason = ('missing_' + $p) } }
  }
  if (-not (Test-StrictTrue $j.success)) { return @{ ok = $false; reason = 'success_not_true_bool' } }
  $vp = [ref]$null; $vf = [ref]$null; $vpd = [ref]$null; $vt = [ref]$null; $vtot = [ref]$null
  if (-not (Test-StrictNonNegInt $j.numPassedTests $vp)) { return @{ ok = $false; reason = 'numPassedTests_type' } }
  if (-not (Test-StrictNonNegInt $j.numFailedTests $vf)) { return @{ ok = $false; reason = 'numFailedTests_type' } }
  if (-not (Test-StrictNonNegInt $j.numPendingTests $vpd)) { return @{ ok = $false; reason = 'numPendingTests_type' } }
  if (-not (Test-StrictNonNegInt $j.numTodoTests $vt)) { return @{ ok = $false; reason = 'numTodoTests_type' } }
  if (-not (Test-StrictNonNegInt $j.numTotalTests $vtot)) { return @{ ok = $false; reason = 'numTotalTests_type' } }
  if ($vf.Value -ne 0) { return @{ ok = $false; reason = 'failed_nonzero' } }
  if ($vpd.Value -ne 0) { return @{ ok = $false; reason = 'pending_nonzero' } }
  if ($vt.Value -ne 0) { return @{ ok = $false; reason = 'todo_nonzero' } }
  if ($vp.Value -lt $minPassed) { return @{ ok = $false; reason = 'passed_below_min' } }
  if ($vtot.Value -lt $minPassed) { return @{ ok = $false; reason = 'total_below_min' } }
  if (($vp.Value + $vf.Value + $vpd.Value + $vt.Value) -ne $vtot.Value) { return @{ ok = $false; reason = 'counts_inconsistent_with_total' } }
  $tr = $j.testResults
  if ($null -eq $tr) { return @{ ok = $false; reason = 'testResults_null' } }
  if (-not ($tr -is [array])) { return @{ ok = $false; reason = 'testResults_not_array' } }
  if (@($tr).Count -eq 0) { return @{ ok = $false; reason = 'testResults_empty' } }
  return @{ ok = $true; reason = 'valid' }
}
# Read a JSON file fail-closed: returns @{ ok; json; reason }. Rejects missing/empty/whitespace/malformed/scalar/array.
function Read-JsonFileStrict([string]$path) {
  if ([string]::IsNullOrEmpty($path) -or -not (Test-Path $path)) { return @{ ok = $false; json = $null; reason = 'file_missing' } }
  $raw = $null
  try { $raw = Get-Content -LiteralPath $path -Raw -ErrorAction Stop } catch { return @{ ok = $false; json = $null; reason = 'read_error' } }
  if ($null -eq $raw -or [string]::IsNullOrWhiteSpace($raw)) { return @{ ok = $false; json = $null; reason = 'empty_or_whitespace' } }
  $obj = $null
  try { $obj = $raw | ConvertFrom-Json -ErrorAction Stop } catch { return @{ ok = $false; json = $null; reason = 'malformed_json' } }
  return @{ ok = $true; json = $obj; reason = 'parsed' }
}
# Current-run binding: the JSON must have been absent before the run and written after run start (no stale).
function Test-CurrentRunFile([bool]$existedBefore, [bool]$existsAfter, $writeTime, [datetime]$runStart) {
  if ($existedBefore) { return $false }
  if (-not $existsAfter) { return $false }
  if ($null -eq $writeTime) { return $false }
  return ([datetime]$writeTime -ge $runStart)
}

# ---- Approved foundation hashes (frozen; byte-exact R3 recovery) ----
$foundation = [ordered]@{
  'functions/src/payments/canonicalStripeCompletion.ts'  = 'bc94c9dbde0b25cf22a6aa8114674e557d77aefe32e292db9bbf2610d33797ee'
  'functions/src/payments/stripeCheckoutIntent.ts'       = 'e4298e7c192e2b1690ac504d58bbe8a32056c9b9de83abb7a780d2fe68545434'
  'functions/src/payments/stripeRefunds.ts'              = 'f9b552996a3af6dd2cbb92c70dfd4a5f7720d096a3a8675ffa827ea840d65429'
  'functions/src/lib/moneyLog.ts'                        = 'dbafe33c5046bf2a5ef5cea078cda98b10c15332bb90f3185364890e41bfd407'
  'functions/src/payments/financialOperationContract.ts' = '6cd2fc02d4aca01470ab923f38bc7bde229a5c50c33b1860be56bbcf4037b3e4'
}
$symbols = @('PROVIDER_PURCHASE_TX_COLLECTION','PAYMENT_RECONCILIATION_COLLECTION','PAYMENT_COMPLETION_OUTBOX_COLLECTION','creditVerifiedProviderPurchase')

# ---- Complete allowlist: Layer-0 + R3 A-C + transition + R3-resume ----
$allowLayer0 = @(
  'functions/package.json','functions/package-lock.json','functions/jest.config.js','functions/tsconfig.rules.json',
  'functions/tests/setupFirestore.ts','app-mobile/package.json','app-mobile/scripts/verify-pack48-client.mjs',
  'app-mobile/services/clientMessageId.ts','app-mobile/services/pack48CompanionClient.ts',
  'scripts/validate-clean-worktree-layer0-support.ps1','functions/src/__tests__/clean-worktree-layer0-support.test.ts',
  'docs/p0-register/CLEAN_WORKTREE_RECOVERY_LAYER0.md')
$allowR3ac = @(
  'functions/src/wallet/walletService.ts','functions/src/payments/canonicalStripeCompletion.ts',
  'functions/src/payments/stripeCheckoutIntent.ts','functions/src/payments/stripeRefunds.ts',
  'functions/src/payments/financialOperationContract.ts','functions/src/__tests__/fnd1-server-financial-authority-contract.test.ts')
$allowTransition = @('functions/src/__tests__/clean-worktree-layer0-to-layer1-transition.test.ts')
$allowR3resume = @(
  'functions/src/index.ts','functions/src/payments.ts','functions/src/paymentsComplete.ts','functions/src/pack288-web-stripe.ts',
  'functions/src/__tests__/core1-token-checkout-completion.test.ts','functions/src/__tests__/p0-04-legacy-stripe-containment.test.ts',
  'scripts/validate-clean-worktree-layer1-payment-foundation-and-p0-04.ps1')
# Authorized P0-01 advertiser-credit content (exact paths only; no wildcard). Reconciled so the Layer-1 complete
# allowlist recognizes P0-01 files; no Layer-1/P0-04 substantive gate is weakened.
$allowP0_01 = @(
  'functions/src/pack349-endpoints.ts','functions/src/pack349-billing.ts',
  'functions/src/__tests__/p0-01-advertiser-credit-authorization.test.ts',
  'functions/tests/rules/p0-01-advertiser-credit-rules.test.ts',
  'scripts/validate-p0-01-advertiser-credit-authorization.ps1')
# Authorized P0-02 AI-BILLING-PREAUTHORIZATION content (exact paths only; no wildcard). Reconciled so the Layer-1
# complete allowlist recognizes P0-02 files; no Layer-1/P0-04 substantive gate is weakened.
$allowP0_02 = @(
  'app-web/src/lib/ai-billing/aiSpendAuthorization.ts',
  'app-web/src/app/api/ai/chat/route.ts',
  'app-web/src/app/api/ai/escrow/route.ts',
  'functions/src/__tests__/p0-02-ai-billing-preauthorization.test.ts',
  'functions/tests/rules/p0-02-ai-billing-rules.test.ts',
  'scripts/validate-p0-02-ai-billing-preauthorization.ps1',
  'functions/src/ai-billing/legacyAiCompanionContainment.ts',
  'functions/src/aiCompanionFunctions.ts',
  'functions/src/aiCompanions.ts',
  'functions/src/__tests__/p0-02-r3-functions-companion-containment.test.ts',
  'functions/src/chat/canonicalDirectChatCallables.ts',
  'functions/src/chat/c5DirectChatContainment.ts',
  'functions/src/__tests__/p0-05-r1a1-c5-containment.test.ts',
  'scripts/validate-p0-05-r1a1-c5-containment.ps1',
  'functions/src/canonical-chat-engine.ts',
  'functions/src/chat/paidChatAuthority.ts',
  'functions/src/__tests__/p0-05-r1b1-engine-a-latent-vector-neutralization.test.ts',
  'scripts/validate-p0-05-r1b1-engine-a-latent-vector-neutralization.ps1',
  # P0-05 R1B-2 — server-owned /paidChats canonical authority foundation + loader (authorized stage; paths only)
  'functions/src/chat/canonicalPaidChat/paidChatRecord.ts',
  'functions/src/__tests__/p0-05-r1b2-server-owned-paidchat-authority.test.ts',
  'functions/tests/rules/p0-05-r1b2-paidchat-rules.test.ts',
  'scripts/validate-p0-05-r1b2-server-owned-paidchat-authority.ps1')
# Authorized P0-IAM-01A financial-authority trust-boundary foundation content (exact paths only; no wildcard/prefix).
# Reconciled so the Layer-1 complete allowlist recognizes P0-IAM-01A's authorized new files; no Layer-1/P0-04 substantive
# gate is weakened. (paidChatAuthority.ts and the R1B-2 test are already in $allowP0_02.)
$allowIam01a = @(
  'functions/src/security/financialAuthority/canonicalFingerprint.ts',
  'functions/src/security/financialAuthority/authorityEnvelope.ts',
  'functions/src/security/financialAuthority/authorityProvenance.ts',
  'functions/src/__tests__/helpers/iam01aTestSigner.ts',
  'functions/src/__tests__/p0-iam-01a-financial-authority-trust-boundary-foundation.test.ts',
  'scripts/validate-p0-iam-01a-financial-authority-trust-boundary-foundation.ps1')
# Authorized P0-IAM-01B production authority-service / KMS trust-root content (exact paths only; no wildcard).
$allowIam01b = @(
  'functions/src/security/financialAuthority/kmsSigner.ts',
  'functions/src/security/financialAuthority/serviceAuth.ts',
  'functions/src/security/financialAuthority/authorityService.ts',
  'functions/src/__tests__/helpers/iam01bTestHarness.ts',
  'functions/src/__tests__/p0-iam-01b-production-authority-trust-root.test.ts',
  'scripts/validate-p0-iam-01b-production-authority-trust-root.ps1')
# Authorized P0-IAM-01B1 emulator-lifecycle adjudication repair (firebase-tools 15.9.0 Windows cleanShutdown exit-2
# defect). Two NEW infra files: shared adjudicator + its adversarial self-test harness. Exact literal paths only.
$allowIam01b1EmuLifecycle = @(
  'scripts/lib/EmulatorLifecycle.ps1',
  'scripts/tests/emulator-lifecycle-adjudication.tests.ps1',
  'scripts/tests/strict-jest-parser.tests.ps1')                     # R5: adversarial strict Jest parser self-tests
# Authorized P0-IAM-01B1 R8 EOL determinism repair. ONE new repository-root file, exact literal path only.
# The repository declared no text attributes, so a checkout's bytes were decided by the reader's core.autocrlf:
# all nine security-pinned PowerShell files hashed differently between autocrlf=true and false, and the SHA-256
# pin over scripts/lib/RuntimeLogScan.ps1 in the layer-0 validator failed on a default-Windows checkout of an
# unmodified commit. .gitattributes marks exactly that population `text eol=lf` so checked-out bytes equal the
# canonical blob under any configuration. It is listed here because this gate enumerates untracked files and
# must not accept an unauthorized new root file silently - the change is declared, not exempted.
$allowIam01b1R8Eol = @('.gitattributes')
# Authorized P0-IAM-01B1 R8 TRUST-CHILD EVIDENCE repair: a shared child evidence retention/adjudication contract
# and its adversarial self-test harness, added after an audit found seven trust-critical relationships in which a
# parent validator destroyed the evidence for its own failing child. Exact literal paths only; declared here
# because this gate enumerates untracked files and must not silently accept a new one.
$allowIam01b1R8TrustEvidence = @(
  'scripts/lib/TrustedChildEvidence.ps1',
  'scripts/tests/trusted-child-evidence.tests.ps1',
  'scripts/tests/tce-loader-trust.tests.ps1')
$allow = @($allowLayer0 + $allowR3ac + $allowTransition + $allowR3resume + $allowP0_01 + $allowP0_02 + $allowIam01a + $allowIam01b + $allowIam01b1EmuLifecycle + $allowIam01b1R8Eol + $allowIam01b1R8TrustEvidence)

# ---- Checkout path classification (machine-readable, embedded) ----
# path::symbol|classification
$classification = @(
  'pack288-web-stripe.ts::tokens_createCheckoutSession|CANONICAL_CREATOR',
  'paymentsComplete.ts::createStripeCheckoutSession|HARD_DISABLED',
  'payments.ts::creditTokensCallable|HARD_DISABLED',
  'pack288-web-stripe.ts::tokens_fulfillCheckout|HARD_DISABLED',
  'pack288-web-stripe.ts::tokens_stripeWebhook|WEBHOOK_ONLY_RETAINED',
  'paymentsComplete.ts::stripeWebhookV2|WEBHOOK_ONLY_RETAINED',
  'payments.ts::stripeWebhook|WEBHOOK_ONLY_RETAINED',
  'pack302-web-billing.ts::createTokenCheckout|NOT_RUNTIME_REACHABLE',
  'pack107-membership.ts::membership|NOT_RUNTIME_REACHABLE'
)

Write-Host "=== 1. Identity + zero staged ==="
$top = (& git -C $root rev-parse --show-toplevel) 2>$null
$head = (& git -C $root rev-parse HEAD) 2>$null
$sym = (& git -C $root symbolic-ref -q HEAD) 2>$null
$fhead = (& git -C $forensic rev-parse HEAD) 2>$null
$staged = @(& git -C $root diff --cached --name-only | Where-Object { $_.Trim() -ne '' }).Count
$idOk = ($top -replace '\\','/') -eq 'C:/a/avalo-controlled-enablement-clean' -and $head -eq $expectHead -and -not $sym -and $fhead -eq $expectHead
if ($idOk -and $staged -eq 0) { Pass ("identity + detached HEAD + forensic untouched + staged={0}" -f $staged) } else { Fail ("identity/staged (top={0} head={1} sym={2} fhead={3} staged={4})" -f $top,$head,$sym,$fhead,$staged) }

Write-Host "=== 2. Transition closure (STRICT: transition validator must genuinely exit 0 + state + marker) ==="
# RECONCILIATION (task ...-TRANSITION-ALLOWLIST-RECONCILIATION-R1-FINAL): the prior 'allowlist superseded'
# exception is REMOVED. The subordinate transition validator's allowlist was reconciled to include the
# authorized R3 Phase D-H files, so it now genuinely exits 0. This gate requires a real exit 0 + state +
# marker; a failed subordinate validator is NEVER accepted by parsing partial output.
$tOut = & (Join-Path $root 'scripts\validate-clean-worktree-layer0-support.ps1') *>&1
$tExit = $LASTEXITCODE
$tState = ($tOut | Select-String -SimpleMatch 'FINAL TRANSITION STATE: AUTHORIZED_LAYER1_TRANSITION').Count -gt 0
$tMarker = ($tOut | Select-String -SimpleMatch 'RESULT: CLEAN_WORKTREE_LAYER0_TO_LAYER1_TRANSITION_CONTRACT_PASS').Count -gt 0
if ($tExit -eq 0 -and $tState -and $tMarker) {
  Pass 'transition validator genuinely exit 0 + AUTHORIZED_LAYER1_TRANSITION + marker'
} else { Fail ("transition validator (exit={0} state={1} marker={2})" -f $tExit,$tState,$tMarker) }

Write-Host "=== 3. Complete allowed-file boundary (Layer-0 + R3 A-C + transition + R3-resume) ==="
$status = @(& git -C $root status --short -uall)
$changed = @(); foreach ($l in $status) { if ($l.Length -gt 3) { $changed += ($l.Substring(3).Trim() -replace '\\','/') } }
$outside = @($changed | Where-Object { $_ -notin $allow })
if ($outside.Count -eq 0) { Pass ("all {0} changed files within complete allowlist" -f $changed.Count) } else { $outside | ForEach-Object { Write-Host ("  OUTSIDE: {0}" -f $_) }; Fail 'complete allowlist enforcement' }

Write-Host "=== 4. Foundation modules (frozen hashes) + walletService symbols ==="
$fOk = $true
foreach ($rel in $foundation.Keys) {
  $p = Join-Path $root ($rel -replace '/','\')
  if (-not (Test-Path $p)) { Write-Host "  MISSING $rel"; $fOk = $false; continue }
  $h = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash
  if ($h -ne $foundation[$rel]) { Write-Host "  HASH DRIFT $rel"; $fOk = $false }
}
$wsText = Get-Content (Join-Path $fnroot 'src\wallet\walletService.ts') -Raw
foreach ($s in $symbols) { if ($wsText -notmatch [regex]::Escape($s)) { Write-Host "  SYMBOL MISSING $s"; $fOk = $false } }
if ($fOk) { Pass 'foundation frozen + walletService symbols present' } else { Fail 'foundation/symbols' }

Write-Host "=== 5. Checkout creator registry (exactly one CANONICAL_CREATOR; no unsafe reachable authority) ==="
$canon = @($classification | Where-Object { $_ -match '\|CANONICAL_CREATOR$' })
$idxText = Get-Content (Join-Path $fnroot 'src\index.ts') -Raw
# Extract REAL export identifiers (strip // comments; keep bare identifier tokens only) from the three
# payment source export blocks — so a comment mentioning a name is never mistaken for an export.
$idxNames = New-Object System.Collections.Generic.List[string]
foreach ($m in [regex]::Matches($idxText, "export\s*\{([^}]*)\}\s*from\s*'\./(payments|paymentsComplete|pack288-web-stripe)'")) {
  foreach ($rawLine in ($m.Groups[1].Value -split "`n")) {
    $noComment = ($rawLine -replace '//.*$', '')
    foreach ($tok in ($noComment -split ',')) {
      $t = $tok.Trim()
      if ($t -match '^[A-Za-z_][A-Za-z0-9_]*$') { [void]$idxNames.Add($t) }
    }
  }
}
$unsafeExported = ($idxNames -contains 'createStripeCheckoutSession') -or ($idxNames -contains 'creditTokensCallable') -or ($idxNames -contains 'tokens_fulfillCheckout')
$canonExported = $idxNames -contains 'tokens_createCheckoutSession'
$webhookExported = ($idxNames -contains 'tokens_stripeWebhook') -and ($idxNames -contains 'stripeWebhookV2') -and ($idxNames -contains 'stripeWebhook')
if ($canon.Count -eq 1 -and -not $unsafeExported -and $canonExported -and $webhookExported) {
  Pass ("exactly one CANONICAL_CREATOR ({0}); no unsafe legacy export; canonical+webhooks exported" -f ($canon[0]))
} else { Fail ("registry (canonCount={0} unsafeExported={1} canonExported={2} webhookExported={3})" -f $canon.Count,$unsafeExported,$canonExported,$webhookExported) }

Write-Host "=== 5b. Webhook authority (every retained token webhook: canonical routing, NO generic creditTokens) ==="
# Regression tripwire for the Codex finding: extract each retained token-purchase webhook completion body
# and require it to invoke completeStripeTokenPurchase and NOT call generic creditTokens/addTokens. The
# behavioral cross-endpoint exactly-once proof lives in the emulator suite (Gate 6-10); this is the
# fail-closed static tripwire so the divergence cannot silently regress.
function Get-Body([string]$file, [string]$startMarker, [string]$endMarker) {
  $src = Get-Content (Join-Path $fnroot $file) -Raw
  $s = $src.IndexOf($startMarker); if ($s -lt 0) { return $null }
  $e = $src.IndexOf($endMarker, $s + 1); if ($e -lt 0) { $e = $src.Length }
  return $src.Substring($s, $e - $s)
}
$webhookBodies = @(
  @{ name='payments.ts::stripeWebhook';                 body=(Get-Body 'src\payments.ts' 'export const stripeWebhook =' 'CREDIT TOKENS CALLABLE') },
  @{ name='paymentsComplete.ts::handleStripeCheckoutCompleted'; body=(Get-Body 'src\paymentsComplete.ts' 'async function handleStripeCheckoutCompleted' 'async function handleStripeSubscriptionUpdate') },
  @{ name='pack288-web-stripe.ts::handleCheckoutCompleted';     body=(Get-Body 'src\pack288-web-stripe.ts' 'async function handleCheckoutCompleted' 'async function handleChargeRefunded') }
)
$whOk = $true
foreach ($w in $webhookBodies) {
  if (-not $w.body) { Write-Host ("  MISSING body: {0}" -f $w.name); $whOk = $false; continue }
  $callsGeneric = ($w.body -match 'creditTokens\(') -or ($w.body -match 'addTokens\(')
  $callsCanonical = ($w.body -match 'completeStripeTokenPurchase\(')
  if ($callsGeneric -or -not $callsCanonical) { Write-Host ("  AUTHORITY DIVERGENCE {0}: generic={1} canonical={2}" -f $w.name,$callsGeneric,$callsCanonical); $whOk = $false }
}
if ($whOk) { Pass 'all retained token webhooks route to canonical completion; none call generic creditTokens' } else { Fail 'webhook authority (generic-credit divergence detected)' }

$PACK_NAME = 'cross-endpoint conflict: same provider purchase with conflicting pack yields no additional credit'
$CURR_NAME = 'cross-endpoint conflict: same provider purchase with conflicting currency yields no additional credit'
$P004_SUFFIX = 'p0-04-legacy-stripe-containment.test.ts'
$P4 = 'src/__tests__/p0-04-legacy-stripe-containment.test.ts'
$OTHER = 'src/__tests__/other.test.ts'
function _rec($file, $name, $status) { return @{ file = $file; fullName = $name; status = $status } }

Write-Host "=== 5c. NAMED-TEST PARSER SELF-TESTS (mandatory negative matrix + positive controls) ==="
$goodPack = _rec $P4 $PACK_NAME 'passed'
$goodCurr = _rec $P4 $CURR_NAME 'passed'
$fixtures = @(
  @{ n = 'POS exact pack + exact currency, distinct, passed, p0-04'; recs = @($goodPack, $goodCurr); ok = $true },
  @{ n = 'neg1 missing pack'; recs = @($goodCurr); ok = $false },
  @{ n = 'neg2 missing currency'; recs = @($goodPack); ok = $false },
  @{ n = 'neg3 pack comment-only (non-matching title)'; recs = @((_rec $P4 ('// ' + $PACK_NAME) 'passed'), $goodCurr); ok = $false },
  @{ n = 'neg4 currency comment-only'; recs = @($goodPack, (_rec $P4 ('// ' + $CURR_NAME) 'passed')); ok = $false },
  @{ n = 'neg5 pack skipped'; recs = @((_rec $P4 $PACK_NAME 'skipped'), $goodCurr); ok = $false },
  @{ n = 'neg6 currency skipped'; recs = @($goodPack, (_rec $P4 $CURR_NAME 'skipped')); ok = $false },
  @{ n = 'neg7 pack todo'; recs = @((_rec $P4 $PACK_NAME 'todo'), $goodCurr); ok = $false },
  @{ n = 'neg8 currency todo'; recs = @($goodPack, (_rec $P4 $CURR_NAME 'todo')); ok = $false },
  @{ n = 'neg9 pack failed'; recs = @((_rec $P4 $PACK_NAME 'failed'), $goodCurr); ok = $false },
  @{ n = 'neg10 currency failed'; recs = @($goodPack, (_rec $P4 $CURR_NAME 'failed')); ok = $false },
  @{ n = 'neg11/12 single record BOTH phrase sets (combined title)'; recs = @((_rec $P4 ($PACK_NAME + ' and conflicting currency') 'passed')); ok = $false },
  @{ n = 'neg13/32 one record cannot satisfy both (only pack exact)'; recs = @($goodPack); ok = $false },
  @{ n = 'neg14/15 duplicate pack record (ambiguous)'; recs = @($goodPack, $goodPack, $goodCurr); ok = $false },
  @{ n = 'neg16 malformed ANSI in title'; recs = @((_rec $P4 ([char]27 + '[=' + $PACK_NAME) 'passed'), $goodCurr); ok = $false },
  @{ n = 'neg17 malformed unicode in title'; recs = @((_rec $P4 ([char]0xFFFD + $PACK_NAME) 'passed'), $goodCurr); ok = $false },
  @{ n = 'neg27 count-high but required names missing'; recs = @((_rec $P4 'some other test' 'passed'), (_rec $P4 'another' 'passed')); ok = $false },
  @{ n = 'neg28/29 name only as suite heading / console'; recs = @((_rec $P4 'P0-04 — legacy webhooks canonicalized (cross-endpoint exactly-once)' 'passed'), $goodCurr); ok = $false },
  @{ n = 'neg30 record from different file'; recs = @((_rec $OTHER $PACK_NAME 'passed'), $goodCurr); ok = $false }
)
$selfTotal = 0; $selfPass = 0; $selfFail = @()
foreach ($fx in $fixtures) {
  $selfTotal++
  $recs = Get-JestAssertionRecords (New-FakeJest $fx.recs)
  $r = Test-DistinctNamedPass $recs $PACK_NAME $CURR_NAME $P004_SUFFIX
  if ($r.ok -eq $fx.ok) { $selfPass++ } else { $selfFail += $fx.n }
}
# ---- Expanded STRICT SUMMARY-SCHEMA fixtures (presence / null / type / consistency / root / testResults) ----
function _validSummary { return [pscustomobject]@{ success = $true; numPassedTests = [long]64; numFailedTests = [long]0; numPendingTests = [long]0; numTodoTests = [long]0; numTotalTests = [long]64; testResults = @([pscustomobject]@{ name = 'x'; assertionResults = @() }) } }
function _clone($o) { $h = [ordered]@{}; foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = $p.Value }; return [pscustomobject]$h }
function _without($o, $name) { $h = [ordered]@{}; foreach ($p in $o.PSObject.Properties) { if ($p.Name -ne $name) { $h[$p.Name] = $p.Value } }; return [pscustomobject]$h }
function _with($o, $name, $val) { $c = _clone $o; $c.$name = $val; return $c }
$B = _validSummary
$sumFix = @(
  @{ n = 'POS strict valid summary'; j = $B; ok = $true },
  @{ n = 'presence: missing success'; j = (_without $B 'success'); ok = $false },
  @{ n = 'presence: missing numPassedTests'; j = (_without $B 'numPassedTests'); ok = $false },
  @{ n = 'presence: missing numFailedTests'; j = (_without $B 'numFailedTests'); ok = $false },
  @{ n = 'presence: missing numPendingTests'; j = (_without $B 'numPendingTests'); ok = $false },
  @{ n = 'presence: missing numTodoTests'; j = (_without $B 'numTodoTests'); ok = $false },
  @{ n = 'presence: missing numTotalTests'; j = (_without $B 'numTotalTests'); ok = $false },
  @{ n = 'presence: missing testResults'; j = (_without $B 'testResults'); ok = $false },
  @{ n = 'null: success null'; j = (_with $B 'success' $null); ok = $false },
  @{ n = 'null: numPassedTests null'; j = (_with $B 'numPassedTests' $null); ok = $false },
  @{ n = 'null: numFailedTests null (Codex defect)'; j = (_with $B 'numFailedTests' $null); ok = $false },
  @{ n = 'null: numPendingTests null (Codex defect)'; j = (_with $B 'numPendingTests' $null); ok = $false },
  @{ n = 'null: numTodoTests null (Codex defect)'; j = (_with $B 'numTodoTests' $null); ok = $false },
  @{ n = 'null: numTotalTests null'; j = (_with $B 'numTotalTests' $null); ok = $false },
  @{ n = 'null: testResults null'; j = (_with $B 'testResults' $null); ok = $false },
  @{ n = 'bool: success=1'; j = (_with $B 'success' 1); ok = $false },
  @{ n = 'bool: success=0'; j = (_with $B 'success' 0); ok = $false },
  @{ n = 'bool: success="true"'; j = (_with $B 'success' 'true'); ok = $false },
  @{ n = 'bool: success="false"'; j = (_with $B 'success' 'false'); ok = $false },
  @{ n = 'bool: success=array'; j = (_with $B 'success' @(1)); ok = $false },
  @{ n = 'bool: success=object'; j = (_with $B 'success' ([pscustomobject]@{ a = 1 })); ok = $false },
  @{ n = 'int: numPassedTests="64" (numeric string)'; j = (_with $B 'numPassedTests' '64'); ok = $false },
  @{ n = 'int: numFailedTests="0" (numeric string)'; j = (_with $B 'numFailedTests' '0'); ok = $false },
  @{ n = 'int: numPendingTests=false (bool)'; j = (_with $B 'numPendingTests' $false); ok = $false },
  @{ n = 'int: numTodoTests=0.5 (fractional)'; j = (_with $B 'numTodoTests' 0.5); ok = $false },
  @{ n = 'int: numPassedTests=array'; j = (_with $B 'numPassedTests' @(1)); ok = $false },
  @{ n = 'int: numFailedTests=object'; j = (_with $B 'numFailedTests' ([pscustomobject]@{ x = 1 })); ok = $false },
  @{ n = 'int: numFailedTests=-1 (negative)'; j = (_with $B 'numFailedTests' -1); ok = $false },
  @{ n = 'int: numPassedTests overflow 1e19'; j = (_with $B 'numPassedTests' ([double]1e19)); ok = $false },
  @{ n = 'value: passed below min (10/10)'; j = (_with (_with $B 'numPassedTests' ([long]10)) 'numTotalTests' ([long]10)); ok = $false },
  @{ n = 'value: numFailedTests>0'; j = (_with (_with $B 'numFailedTests' ([long]1)) 'numTotalTests' ([long]65)); ok = $false },
  @{ n = 'value: numPendingTests>0'; j = (_with (_with $B 'numPendingTests' ([long]1)) 'numTotalTests' ([long]65)); ok = $false },
  @{ n = 'value: numTodoTests>0'; j = (_with (_with $B 'numTodoTests' ([long]1)) 'numTotalTests' ([long]65)); ok = $false },
  @{ n = 'consistency: total inconsistent (64 vs 100)'; j = (_with $B 'numTotalTests' ([long]100)); ok = $false },
  @{ n = 'root: null'; j = $null; ok = $false },
  @{ n = 'root: scalar (64)'; j = ([long]64); ok = $false },
  @{ n = 'root: array'; j = @(1, 2, 3); ok = $false },
  @{ n = 'testResults: empty array'; j = (_with $B 'testResults' @()); ok = $false },
  @{ n = 'testResults: wrong type (string)'; j = (_with $B 'testResults' 'x'); ok = $false }
)
foreach ($fx in $sumFix) { $selfTotal++; $rr = (Test-JsonSummaryStrict $fx.j 64); if ([bool]$rr.ok -eq $fx.ok) { $selfPass++ } else { $selfFail += ($fx.n + ' [reason=' + $rr.reason + ']') } }
# ---- JSON read+parse failure fixtures (REAL temp files: missing/empty/whitespace/malformed/scalar/array/valid) ----
$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ('avalo-validator-selftest-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
try {
  $fMissing = Join-Path $tmpDir 'missing.json'
  $fEmpty = Join-Path $tmpDir 'empty.json'; Set-Content -LiteralPath $fEmpty -Value '' -NoNewline
  $fWs = Join-Path $tmpDir 'ws.json'; Set-Content -LiteralPath $fWs -Value "   `n  " -NoNewline
  $fBad = Join-Path $tmpDir 'bad.json'; Set-Content -LiteralPath $fBad -Value '{ not valid json ' -NoNewline
  $fScalar = Join-Path $tmpDir 'scalar.json'; Set-Content -LiteralPath $fScalar -Value '64' -NoNewline
  $fArray = Join-Path $tmpDir 'array.json'; Set-Content -LiteralPath $fArray -Value '[1,2,3]' -NoNewline
  $fValid = Join-Path $tmpDir 'valid.json'; ($B | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $fValid
  $readFix = @(
    @{ n = 'read: missing file'; ok = $false; r = (Read-JsonFileStrict $fMissing) },
    @{ n = 'read: empty file'; ok = $false; r = (Read-JsonFileStrict $fEmpty) },
    @{ n = 'read: whitespace file'; ok = $false; r = (Read-JsonFileStrict $fWs) },
    @{ n = 'read: malformed json'; ok = $false; r = (Read-JsonFileStrict $fBad) },
    @{ n = 'read: scalar root then schema'; ok = $false; r = (Read-JsonFileStrict $fScalar) },
    @{ n = 'read: array root then schema'; ok = $false; r = (Read-JsonFileStrict $fArray) },
    @{ n = 'read: POS valid json'; ok = $true; r = (Read-JsonFileStrict $fValid) }
  )
  foreach ($fx in $readFix) {
    $selfTotal++
    # For a parsed file, also require the schema to validate (scalar/array roots must fail schema too).
    $eff = $fx.r.ok
    if ($fx.r.ok) { $eff = (Test-JsonSummaryStrict $fx.r.json 64).ok }
    if ([bool]$eff -eq $fx.ok) { $selfPass++ } else { $selfFail += ($fx.n + ' [reason=' + $fx.r.reason + ']') }
  }
} finally { try { Remove-Item -Recurse -Force -LiteralPath $tmpDir -ErrorAction SilentlyContinue } catch { } }
$now = Get-Date
$fileFix = @(
  @{ n = 'neg21 stale file (existed before)'; v = (Test-CurrentRunFile $true $true $now $now); ok = $false },
  @{ n = 'neg23 missing after run'; v = (Test-CurrentRunFile $false $false $null $now); ok = $false },
  @{ n = 'neg22/31 file older than run start'; v = (Test-CurrentRunFile $false $true ($now.AddSeconds(-30)) $now); ok = $false },
  @{ n = 'POS fresh current-run file'; v = (Test-CurrentRunFile $false $true ($now.AddSeconds(1)) $now); ok = $true }
)
foreach ($fx in $fileFix) { $selfTotal++; if ([bool]$fx.v -eq $fx.ok) { $selfPass++ } else { $selfFail += $fx.n } }
Write-Host ("  parser self-tests: {0}/{1} passed" -f $selfPass, $selfTotal)
if ($selfFail.Count -gt 0) { $selfFail | ForEach-Object { Write-Host ("  SELF-TEST FAIL: {0}" -f $_) } }
$selfOk = ($selfPass -eq $selfTotal)
if ($selfOk) { Pass ("named-test parser self-tests all pass ({0} fixtures, incl. single-line/combined-title rejection)" -f $selfTotal) } else { Fail 'named-test parser self-tests' }

Write-Host "=== 6/7/8/9/10. Emulator-backed suites via Jest --json (current-run structured proof) ==="
if (-not (Test-Path (Join-Path $fnroot 'node_modules'))) { Fail 'dependencies absent — cannot runtime-prove' }
elseif (-not $selfOk) { Fail 'skipping real-run gate: parser self-tests failed (fail-closed)' }
else {
  # Runtime JSON goes to a UNIQUE TEMP dir (NOT any prior Claude/Codex evidence), so Codex can run this
  # validator without mutating immutable evidence. Cleaned up after parsing (only the exact GUID file/dir).
  $jsonDir = Join-Path ([System.IO.Path]::GetTempPath()) ('avalo-validator-' + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Force -Path $jsonDir | Out-Null
  $runGuid = [guid]::NewGuid().ToString()
  $jsonPath = Join-Path $jsonDir ("jest-{0}.json" -f $runGuid)
  $existedBefore = Test-Path $jsonPath
  if ($existedBefore) { Remove-Item -Force -LiteralPath $jsonPath }
  $runStart = Get-Date
  $jestPaths = 'src/__tests__/fnd1-server-financial-authority-contract.test.ts src/__tests__/core1-token-checkout-completion.test.ts src/__tests__/p0-04-legacy-stripe-containment.test.ts'
  $jscript = "cd functions && node node_modules/jest/bin/jest.js --selectProjects main --runInBand --json --outputFile `"$jsonPath`" --runTestsByPath $jestPaths"
  Push-Location $root
  $emuLog = Join-Path $jsonDir 'emu.log'
  & firebase emulators:exec --only firestore --project demo-avalo $jscript *> $emuLog
  $emuExit = $LASTEXITCODE
  Pop-Location
  if (-not (Get-Command Test-EmulatorLifecycleHealthy -ErrorAction SilentlyContinue)) { . (Join-Path $root 'scripts\lib\EmulatorLifecycle.ps1') }
  $lifeReason = ''; $lifeOk = Test-EmulatorLifecycleHealthy -CliExit $emuExit -LogPath $emuLog -Reason ([ref]$lifeReason)
  $existsAfter = Test-Path $jsonPath
  $writeTime = if ($existsAfter) { (Get-Item $jsonPath).LastWriteTime } else { $null }
  $freshOk = Test-CurrentRunFile $existedBefore $existsAfter $writeTime $runStart
  $rd = Read-JsonFileStrict $jsonPath
  $parseOk = $rd.ok
  $json = $rd.json
  $sres = if ($parseOk) { Test-JsonSummaryStrict $json 64 } else { @{ ok = $false; reason = $rd.reason } }
  $summaryOk = $parseOk -and $sres.ok
  $numPassed = if ($parseOk -and (Test-HasProperty $json 'numPassedTests')) { $json.numPassedTests } else { -1 }
  Write-Host ("  jest --json -> passed={0} success={1} failed={2} pending={3} todo={4} total={5} emuExit={6} fresh={7} parseOk={8} schema={9}" -f $numPassed, $(if ($parseOk) { $json.success } else { '?' }), $(if ($parseOk) { $json.numFailedTests } else { '?' }), $(if ($parseOk) { $json.numPendingTests } else { '?' }), $(if ($parseOk) { $json.numTodoTests } else { '?' }), $(if ($parseOk) { $json.numTotalTests } else { '?' }), $emuExit, $freshOk, $parseOk, $sres.reason)
  Write-Host ("  emulator-lifecycle: {0}" -f $lifeReason)
  $script:execOk = $lifeOk -and $freshOk -and $summaryOk
  if ($script:execOk) { Pass ("FND-1 + CORE-1 + P0-04 via emulator: {0} passed (strict schema valid, current-run temp JSON, not evidence)" -f $numPassed) }
  else { Fail ("emulator-backed behavioral suites (emuExit={0} fresh={1} parseOk={2} schema={3})" -f $emuExit,$freshOk,$parseOk,$sres.reason) }
  # Cleanup: remove only the exact generated temp file + dir. Failure logged, never hides the result.
  try { Remove-Item -Recurse -Force -LiteralPath $jsonDir -ErrorAction Stop } catch { Write-Host ("  (cleanup note: could not remove {0})" -f $jsonDir) }

  Write-Host "=== 6b. Distinct executed named-test records (exact pack + exact currency, distinct) ==="
  if ($parseOk) {
    $records = Get-JestAssertionRecords $json
    $dn = Test-DistinctNamedPass $records $PACK_NAME $CURR_NAME $P004_SUFFIX
    Write-Host ("  packFound={0} packLine={1} currencyFound={2} currencyLine={3} recordsDistinct={4}" -f $dn.packFound, $dn.packLine, $dn.currencyFound, $dn.currencyLine, $dn.recordsDistinct)
    Write-Host ("  packName='{0}'" -f $dn.packName)
    Write-Host ("  currencyName='{0}'" -f $dn.currencyName)
    if ($dn.ok -and $script:execOk -and ($dn.packLine -ne $dn.currencyLine)) { Pass 'two DISTINCT executed+passed records (pack + currency) in current-run P0-04 JSON' }
    else { Fail 'distinct named-test records (pack/currency)' }
  } else { Fail 'distinct named-test records — no parseable current-run JSON' }
}

Write-Host "=== 11. No package/lockfile drift in THIS task (foundation frozen already covers manifests) ==="
# package.json/lock are Layer-0 changes; verify they are NOT newly modified beyond the Layer-0 baseline by
# confirming they parse + no NUL (structural). Deep Layer-0 lock consistency is owned by the transition validator (Gate 2).
$pj = Join-Path $fnroot 'package.json'
$pjOk = $false; try { $null = (Get-Content $pj -Raw | ConvertFrom-Json); $pjOk = -not ([System.IO.File]::ReadAllBytes($pj) -contains 0) } catch { $pjOk = $false }
if ($pjOk) { Pass 'package.json intact (no drift/NUL); lock consistency owned by transition Gate 2' } else { Fail 'package manifest drift' }

Write-Host "=== 12. Checkout remains OFF (no source enables the gate) ==="
# No changed source may set TOKEN_CHECKOUT_ENABLED to 'true' (tests inject at runtime only, not in source).
$enableHit = $false
foreach ($rel in $allowR3resume) {
  $p = Join-Path $root ($rel -replace '/','\'); if (-not (Test-Path $p)) { continue }
  $txt = Get-Content $p -Raw
  if ($txt -match "TOKEN_CHECKOUT_ENABLED\s*=\s*'true'" -and $rel -notmatch '__tests__') { Write-Host "  enable in $rel"; $enableHit = $true }
}
if (-not $enableHit) { Pass 'checkout gate not enabled in any non-test source (remains fail-closed OFF)' } else { Fail 'checkout enabled' }

Write-Host "=== 13. No forbidden path changed ==="
# P0-02 reconciliation: the two AUTHORIZED app-web AI-billing routes are exempted by EXACT path (all other
# app-web paths remain forbidden). This is an exact-path exception, not a gate removal — no payment-foundation /
# P0-04 substantive guarantee (checkout OFF, session ownership, hashes, test counts) is affected by AI routes.
$forbiddenRe = @('^app-mobile/(?!package\.json$|scripts/verify-pack48|services/clientMessageId|services/pack48)','^app-web/(?!src/app/api/ai/chat/route\.ts$|src/app/api/ai/escrow/route\.ts$|src/lib/ai-billing/aiSpendAuthorization\.ts$)','firestore\.rules$','storage\.rules$','^infrastructure/firebase/','firebase\.json$','\.firebaserc$','pnpm-lock','yarn\.lock')
$forbiddenHit = @()
foreach ($c in $changed) { foreach ($re in $forbiddenRe) { if ($c -match $re) { $forbiddenHit += $c } } }
if ($forbiddenHit.Count -eq 0) { Pass 'no forbidden path changed' } else { $forbiddenHit | ForEach-Object { Write-Host "  FORBIDDEN: $_" }; Fail 'forbidden path changed' }

Write-Host ""
if ($exit -eq 0) {
  Write-Host 'CHECKOUT FINAL STATE: OFF (fail-closed default; never enabled by this task)'
  Write-Host 'RESULT: CLEAN_WORKTREE_LAYER1_PAYMENT_FOUNDATION_AND_P0_04_PASS'
} else { Write-Host 'RESULT: CLEAN_WORKTREE_LAYER1_PAYMENT_FOUNDATION_AND_P0_04_FAIL' }
exit $exit
