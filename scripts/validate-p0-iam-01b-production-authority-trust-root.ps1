#Requires -Version 5.1
<#
  validate-p0-iam-01b-production-authority-trust-root.ps1 — READ-ONLY, fail-closed. (pwsh 7+.)
  P0-IAM-01B1 — production PaidChat Authority Service + KMS-backed signer + service-to-service auth (code/IaC/tests).
  The dedicated Authority Service is the ONLY path to a valid KMS financial-authority signature; generic shared-Admin
  Firestore write cannot manufacture authority. Production signing/service-auth remain SAFE_UNAVAILABLE until P0-IAM-01B2
  provisions real KMS/IAM/Cloud Run. On FULL PASS (exit 0): P0_IAM_01B1_PRODUCTION_AUTHORITY_TRUST_ROOT_PASS ; else _FAIL.
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

# Import-graph reachability scan: which PRODUCTION modules reference $Pattern.
#  * --untracked is MANDATORY: the P0-IAM-01B runtime and test sources are UNTRACKED in this detached-HEAD validation
#    worktree, so a tracked-only `git grep` matches ZERO files and every reachability gate built on it is VACUOUS
#    (silent false-negative). --untracked still honours .gitignore, so node_modules/dist stay excluded.
#  * -n so each hit can be adjudicated by LINE: comment-only lines (`//`, `*`, `/*`) are documentation, not references,
#    and must not count as reachability. Real `import {X} from` / `X(` references are never comment lines.
#  * $ExcludeFiles removes the DECLARING module (the seam defines the symbol; defining is not importing).
# Anything surviving all three filters is a genuine production importer and fails the gate.
function Get-ProductionImporters([string]$Pattern, [string[]]$Dirs, [string[]]$ExcludeFiles = @()) {
  $lines = @(& git -C $root grep --untracked -n -e $Pattern -- @Dirs 2>$null)
  $files = @()
  foreach ($ln in $lines) {
    $m = [regex]::Match($ln, '^(?<f>[^:]+):(?<n>\d+):(?<c>.*)$')
    if (-not $m.Success) { continue }
    $f = $m.Groups['f'].Value; $c = $m.Groups['c'].Value
    if ($f -match '__tests__|\.test\.') { continue }                 # test files are the legitimate seam consumers
    if ($ExcludeFiles -contains $f) { continue }                     # declaring module
    if ($c -match '^\s*(//|\*|/\*)') { continue }                    # comment-only line: documentation, not a reference
    $files += $f
  }
  return @($files | Sort-Object -Unique)
}

$KMS = Join-Path $fnroot 'src\security\financialAuthority\kmsSigner.ts'
$SAUTH = Join-Path $fnroot 'src\security\financialAuthority\serviceAuth.ts'
$SVC = Join-Path $fnroot 'src\security\financialAuthority\authorityService.ts'
$HARNESS = Join-Path $fnroot 'src\__tests__\helpers\iam01bTestHarness.ts'
$TEST_FILE = 'p0-iam-01b-production-authority-trust-root.test.ts'
$IAM_01B_ALLOW = @(
  'functions/src/security/financialAuthority/kmsSigner.ts',
  'functions/src/security/financialAuthority/serviceAuth.ts',
  'functions/src/security/financialAuthority/authorityService.ts',
  'functions/src/__tests__/helpers/iam01bTestHarness.ts',
  'functions/src/__tests__/p0-iam-01b-production-authority-trust-root.test.ts',
  'scripts/validate-p0-iam-01b-production-authority-trust-root.ps1'
)

Write-Host "=== GATE 1. Identity + staged=0 + bounded scope ==="
$top = (& git -C $root rev-parse --show-toplevel) 2>$null
$head = (& git -C $root rev-parse HEAD) 2>$null
$sym = (& git -C $root symbolic-ref -q HEAD) 2>$null
$fhead = (& git -C $forensic rev-parse HEAD) 2>$null
$staged = @(& git -C $root diff --cached --name-only | Where-Object { $_.Trim() -ne '' }).Count
$changed = @(); foreach ($l in @(& git -C $root status --short -uall)) { if ($l.Length -gt 3) { $changed += ($l.Substring(3).Trim() -replace '\\', '/') } }
$iamChanged = @($changed | Where-Object { $_ -match 'security/financialAuthority/(kmsSigner|serviceAuth|authorityService)|iam01bTestHarness|p0-iam-01b-production-authority-trust-root' })
$outside = @($iamChanged | Where-Object { $_ -notin $IAM_01B_ALLOW })
$runtimeChanged = @($iamChanged | Where-Object { $_ -match '^functions/src/' -and $_ -notmatch '__tests__' })
$idOk = ((($top -replace '\\', '/') -eq 'C:/a/avalo-controlled-enablement-clean') -and $head -eq $expectHead -and -not $sym -and $fhead -eq $expectHead -and $staged -eq 0)
if ($idOk -and $outside.Count -eq 0 -and $runtimeChanged.Count -le 8) { Pass ("identity + staged=0 + IAM-01B diff within allowlist (runtime files={0})" -f $runtimeChanged.Count) } else { $outside | ForEach-Object { Write-Host "  OUTSIDE: $_" }; Fail ("identity/diff (staged={0} runtime={1} outside={2})" -f $staged, $runtimeChanged.Count, $outside.Count) }
if ($runtimeChanged.Count -gt 8) { Write-Host 'STOP — P0-IAM-01B REQUIRES SCOPE REVIEW' }

Write-Host "=== GATE 2. Prior markers green incl. P0-IAM-01A (via IAM-01A validator; FILE-redirected) ==="
$iam01aOut = Join-Path $env:TEMP ("iam01b-prior-" + [guid]::NewGuid().ToString('N') + ".out")
& (Join-Path $root 'scripts\validate-p0-iam-01a-financial-authority-trust-boundary-foundation.ps1') *> $iam01aOut
$iam01aExit = $LASTEXITCODE
$iam01aTxt = if (Test-Path $iam01aOut) { Get-Content -LiteralPath $iam01aOut -Raw } else { '' }
Remove-Item $iam01aOut -Force -ErrorAction SilentlyContinue
function HasMark([string]$t, [string]$m) { return ($null -ne $t) -and ($t -match [regex]::Escape($m)) }
$priorOk = ($iam01aExit -eq 0) -and (HasMark $iam01aTxt 'RESULT: P0_IAM_01A_FINANCIAL_AUTHORITY_TRUST_BOUNDARY_FOUNDATION_PASS') -and (HasMark $iam01aTxt 'prior validators green')
if ($priorOk) { Pass 'prior markers green: P0-IAM-01A PASS (which transitively confirms layer0/layer1/p0-01/p0-02/c5/r1b1)' } else { Fail ("prior markers (iam01aExit={0})" -f $iam01aExit) }

Write-Host "=== GATE 3-9. Source-level trust-root invariants ==="
foreach ($f in @($KMS, $SAUTH, $SVC, $HARNESS)) { if (-not (Test-Path $f)) { Fail ("missing file: $f") } }
$kms = Get-Content $KMS -Raw; $sa = Get-Content $SAUTH -Raw; $svc = Get-Content $SVC -Raw; $harness = Get-Content $HARNESS -Raw
# G1 KMS signer: no local key GENERATION/HMAC CALL/PEM private material; SAFE_UNAVAILABLE; no raw-bytes sign export.
# (Checks actual calls / PEM material — NOT the descriptive header comment listing what is deliberately NOT used.)
$g1 = ($kms -match "KMS_SIGNING_STATE = 'SAFE_UNAVAILABLE'") -and ($kms -notmatch 'generateKeyPair\w*\(') -and ($kms -notmatch 'createHmac\(') -and ($kms -notmatch 'BEGIN [A-Z ]*PRIVATE KEY') -and ($kms -match 'loadProductionKmsSignerClient') -and ([regex]::Matches($kms, 'export\s+(?:async\s+)?function\s+\w*(?:signRaw|signBytes|signDigest|arbitrarySign)').Count -eq 0)
# G2 service auth: default-deny, OIDC (aud/iss/email), no header/body identity, SAFE_UNAVAILABLE
$g2 = ($sa -match 'SERVICE_AUTH_STATE') -and ($sa -match 'caller_not_in_allowlist') -and ($sa -match 'audience_mismatch') -and ($sa -match 'issuer_not_allowed') -and ($sa -match 'no_service_account_email') -and ($sa -match 'loadServiceAuthConfig') -and ($sa -match 'NEVER from')
# G3 authority service: single narrow op; no raw bytes/digest/key/algo/domain selection; unknown fields rejected
$g3 = ($svc -match "SIGN_PAID_CHAT_AUTHORITY = 'signPaidChatAuthority'") -and ($svc -match 'unknown_field') -and ($svc -match 'authorityDomain_not_allowed') -and ($svc -notmatch 'canonicalPayloadBytes:\s*(?:req|request|raw)') -and ($svc -notmatch 'req\.digest') -and ($svc -notmatch 'req\.kmsKey')
# G4 single active signing key
$g4 = ($svc -match 'resolveSingleActiveSigningKey') -and ($svc -match 'no_active_signing_key') -and ($svc -match 'multiple_active_signing_keys')
# G5 source-of-truth verification + mismatch rejection
$g5 = ($svc -match 'readPaidChatRecord') -and ($svc -match 'validateCanonicalPaidChatRecord') -and ($svc -match '_mismatch_vs_record')
# G6 idempotency RESERVATION state machine + fail-closed durable audit (pre-sign reservation closes post-KMS crash window)
$g6 = ($svc -match 'idempotency\.reserve\(') -and ($svc -match 'idempotency\.complete\(') -and ($svc -match 'RESERVED_NEW') -and ($svc -match 'IN_PROGRESS') -and ($svc -match 'signing_in_progress') -and ($svc -match 'idempotency_conflict_different_payload') -and ($svc -match 'AuthorityAuditPersistenceError') -and ($svc -match 'idempotency_complete_failed')
# G7 verify-before-sign ORDER: readPaidChatRecord precedes signer.sign( in source
$idxRead = $svc.IndexOf('readPaidChatRecord('); $idxVerify = $svc.IndexOf('_mismatch_vs_record'); $idxSign = $svc.IndexOf('deps.signer.sign(')
$g7 = ($idxRead -ge 0) -and ($idxSign -ge 0) -and ($idxRead -lt $idxSign) -and ($idxVerify -ge 0) -and ($idxVerify -lt $idxSign)
# G13 crash-consistency ORDER: reserve (pre-sign) precedes sign, which precedes complete (durable exact-result persist)
$idxReserve = $svc.IndexOf('idempotency.reserve('); $idxComplete = $svc.IndexOf('idempotency.complete(')
$g13 = ($idxReserve -ge 0) -and ($idxComplete -ge 0) -and ($idxReserve -lt $idxSign) -and ($idxSign -lt $idxComplete)
# G8 production SAFE_UNAVAILABLE (all three) + getProduction* return null paths
$g8 = ($svc -match "AUTHORITY_SERVICE_STATE = 'SAFE_UNAVAILABLE'") -and ($svc -match 'getProductionAuthorityServiceDeps') -and ($svc -match 'return null')
# G9 test harness isolated: not imported by any production module
$prodImportsHarness = @(Get-ProductionImporters 'iam01bTestHarness' @('functions/src'))
$g9 = ($prodImportsHarness.Count -eq 0) -and ($harness -match 'generateKeyPairSync')
$src = @{ G1_kms_signer=$g1; G2_service_auth=$g2; G3_narrow_request=$g3; G4_single_active_key=$g4; G5_source_of_truth=$g5; G6_idempotency_reservation_audit=$g6; G7_verify_before_sign=$g7; G8_production_safe_unavailable=$g8; G9_harness_isolated=$g9; G13_reserve_before_sign_before_complete=$g13 }
$srcbad = @($src.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($srcbad.Count -eq 0) { Pass 'source invariants: KMS-only signer (no local key/HMAC/fallback); default-deny OIDC service-auth; narrow request (no raw bytes/digest/key/algo/domain); single ACTIVE key; source-of-truth verify; idempotency + fail-closed audit; verify-before-sign; SAFE_UNAVAILABLE; harness isolated' } else { $srcbad | ForEach-Object { Write-Host "  MISSING: $_" }; Fail 'source-level invariants' }

Write-Host "=== GATE 10. Adversarial self-test (fixtures must be DETECTED as unsafe) ==="
# Prove the gates catch reintroduced unsafe code (in-memory fixtures; repo untouched).
$dRawSigner = ([regex]::Matches(($kms + "`nexport function signRawBytes(b) { }"), 'export\s+(?:async\s+)?function\s+\w*(?:signRaw|signBytes|signDigest|arbitrarySign)').Count -gt 0)
$dLocalKey = (($kms + "`nconst k = '-----BEGIN EC PRIVATE KEY-----';") -match 'BEGIN [A-Z ]*PRIVATE KEY')
$dCallerKey = ('const svc=1; req.kmsKey' -match 'req\.kmsKey')
$dLocalKeyGen = (($kms + "`ncrypto.generateKeyPairSync('ec')") -match 'generateKeyPair\w*\(')
# order fixture: a design that signs BEFORE reserving would set idxReserve > idxSign -> G13 false (order gate active).
$fxBad = 'deps.signer.sign(); idempotency.reserve();'
$dOrder = (($fxBad.IndexOf('idempotency.reserve(') -gt $fxBad.IndexOf('deps.signer.sign(')))
$selfOk = $dRawSigner -and $dLocalKey -and $dCallerKey -and $dLocalKeyGen -and $dOrder -and $g13
if ($selfOk) { Pass 'adversarial self-test: raw-signer, local private key (PEM), local key-gen, caller-selectable key, sign-before-reserve fixtures ALL DETECTED; real source passes ordering (G13)' } else { Fail ("adversarial self-test (rawSigner={0} localKey={1} callerKey={2} keyGen={3} order={4} g13={5})" -f $dRawSigner,$dLocalKey,$dCallerKey,$dLocalKeyGen,$dOrder,$g13) }

Write-Host "=== GATE 11. Billing containment unchanged ==="
$cst = Get-Content (Join-Path $fnroot 'src\chatSystemNextGen.ts') -Raw
$c5src = Get-Content (Join-Path $fnroot 'src\chat\canonicalDirectChatCallables.ts') -Raw
$g11 = ($cst -match 'HUMAN_CHAT_BILLING_DISABLED') -and (([regex]::Matches($c5src, 'assertC5DirectChatUnavailable\(\);')).Count -ge 15) -and ($svc -notmatch "collection\('wallets'\)") -and ($svc -notmatch 'transactTokens')
if ($g11) { Pass 'billing containment unchanged: sendChatMessage HARD_FAIL_CLOSED; c5 SAFE_UNAVAILABLE; authority service has no wallet/token side effect' } else { Fail 'billing containment' }

Write-Host "=== GATE 12. IAM-01B unit suite (pure unit; no emulator) ==="
if (-not (Test-Path (Join-Path $fnroot 'node_modules'))) { Fail 'dependencies absent' }
else {
  $jsonOut = Join-Path $env:TEMP ("iam01b-jest-" + [guid]::NewGuid().ToString('N') + ".json")
  if (Test-Path $jsonOut) { Remove-Item $jsonOut -Force }
  Push-Location $fnroot
  & npx jest --config jest.config.js --selectProjects main --runInBand --forceExit --json --outputFile="$jsonOut" ("src/__tests__/" + $TEST_FILE) *>&1 | Out-Null
  $jexit = $LASTEXITCODE
  Pop-Location
  $j = $null
  if (Test-Path $jsonOut) { try { $j = Get-Content -LiteralPath $jsonOut -Raw | ConvertFrom-Json -ErrorAction Stop } catch { $j = $null } }
  Remove-Item $jsonOut -Force -ErrorAction SilentlyContinue
  if ($null -eq $j) { Fail ("IAM-01B suite produced no JSON (jexit={0})" -f $jexit) }
  else {
    $passed = [int]$j.numPassedTests; $failed = [int]$j.numFailedTests; $pending = [int]$j.numPendingTests; $todo = [int]$j.numTodoTests
    Write-Host ("  jest --json -> passed={0} failed={1} pending={2} todo={3} success={4}" -f $passed, $failed, $pending, $todo, $j.success)
    if (($j.success -eq $true) -and ($failed -eq 0) -and ($pending -eq 0) -and ($todo -eq 0) -and ($passed -ge 50)) { Pass ("IAM-01B suite: {0} passed / 0 failed / 0 skipped" -f $passed) } else { Fail ("IAM-01B suite (success={0} failed={1})" -f $j.success, $failed) }
  }
}

Write-Host "=== GATE 13. Production trust boundary: NO caller-selectable dependency injection ==="
$diProdEntrypoint = ($svc -match 'export async function signPaidChatAuthority\(') -and ($svc -notmatch 'export async function signPaidChatAuthority\([^)]*deps')
$diNoOldDepsExport = ($svc -notmatch 'export async function signFinancialAuthority\(')      # old production-shaped DI export removed
$diCorePrivate = ($svc -match '(?m)^async function signFinancialAuthorityCore\(') -and ($svc -notmatch 'export .*signFinancialAuthorityCore')
$diSeamNamed = ($svc -match 'export async function signFinancialAuthorityWithDeps\(')        # DI reachable only via explicitly-named test seam
$diUnavailable = ($svc -match 'AuthorityServiceUnavailableError') -and ($svc -match 'if \(deps === null\) throw new AuthorityServiceUnavailableError')
$diNoSetters = ($svc -notmatch 'export\s+(?:async\s+)?(?:function|const)\s+\w*(?:setDeps|setSigner|setVerifier|setPolicy|setRegistry|setSourceReader|setIdempotency|setAudit|injectDeps|configureForTest|replaceDeps)')
$seamImporters = @(Get-ProductionImporters 'signFinancialAuthorityWithDeps' @('functions/src', 'app-web/src', 'app-mobile') @('functions/src/security/financialAuthority/authorityService.ts'))
$diSeamNotImportedByProd = ($seamImporters.Count -eq 0)
$di = @{ prod_entrypoint_no_deps=$diProdEntrypoint; old_deps_export_removed=$diNoOldDepsExport; core_module_private=$diCorePrivate; seam_named=$diSeamNamed; safe_unavailable_failclosed=$diUnavailable; no_mutable_override=$diNoSetters; seam_not_imported_by_production=$diSeamNotImportedByProd }
$dibad = @($di.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($dibad.Count -eq 0) { Pass 'trust boundary: signPaidChatAuthority(request,ctx,correlationId) exposes NO deps; DI core module-private; DI seam test-only + 0 production importers; SAFE_UNAVAILABLE fail-closed; no mutable override' } else { $dibad | ForEach-Object { Write-Host "  MISSING: $_" }; Fail 'trust-boundary dependency-injection' }
# adversarial: a re-introduced production DI export / setter must be DETECTED by the gate patterns above
$advA = ('export async function signFinancialAuthority(deps: AuthorityServiceDeps' -match 'export async function signFinancialAuthority\(')
$advB = ('export const setSigner = (s) => {}' -match 'export\s+(?:async\s+)?(?:function|const)\s+\w*(?:setDeps|setSigner|setVerifier)')
if ($advA -and $advB) { Pass 'adversarial DI self-test: reintroduced production DI export + mutable setter fixtures DETECTED' } else { Fail 'adversarial DI self-test' }
# adversarial: prove the import-graph scan actually SEES untracked production files, and that the STALE tracked-only
# `git grep` variant is BLIND (would have passed a real production importer). Runs entirely in a throwaway temp repo —
# the authoritative worktree is never written to.
$advRepo = Join-Path $env:TEMP ('iam01b-importscan-selftest-' + [guid]::NewGuid().ToString('N'))
$advOk = $false
try {
  New-Item -ItemType Directory -Force -Path (Join-Path $advRepo 'functions\src\prod') | Out-Null
  & git -C $advRepo init -q *>&1 | Out-Null
  Set-Content -LiteralPath (Join-Path $advRepo 'functions\src\prod\rogueImporter.ts') -Encoding UTF8 `
    -Value "import { signFinancialAuthorityWithDeps } from '../../security/financialAuthority/authorityService';"
  Set-Content -LiteralPath (Join-Path $advRepo 'functions\src\prod\commentOnly.ts') -Encoding UTF8 `
    -Value "// historical note: signFinancialAuthorityWithDeps is the test seam"
  # stale tracked-only variant must be proven BLIND (0 hits despite a real rogue importer present)
  $advStale = @(& git -C $advRepo grep -l -e 'signFinancialAuthorityWithDeps' -- 'functions/src' 2>$null)
  # current variant must detect EXACTLY the rogue importer and ignore the comment-only documentation line
  $advLines = @(& git -C $advRepo grep --untracked -n -e 'signFinancialAuthorityWithDeps' -- 'functions/src' 2>$null)
  $advFixed = @($advLines | ForEach-Object { [regex]::Match($_, '^(?<f>[^:]+):(?<n>\d+):(?<c>.*)$') } |
    Where-Object { $_.Success -and ($_.Groups['f'].Value -notmatch '__tests__|\.test\.') -and ($_.Groups['c'].Value -notmatch '^\s*(//|\*|/\*)') } |
    ForEach-Object { $_.Groups['f'].Value } | Sort-Object -Unique)
  $advOk = ($advStale.Count -eq 0) -and ($advLines.Count -eq 2) -and ($advFixed.Count -eq 1) -and ($advFixed[0] -match 'rogueImporter\.ts$')
} catch { $advOk = $false } finally { Remove-Item -LiteralPath $advRepo -Recurse -Force -ErrorAction SilentlyContinue }
if ($advOk) { Pass 'adversarial import-scan self-test: untracked rogue production importer DETECTED by --untracked scan; stale tracked-only scan proven BLIND' } else { Fail 'adversarial import-scan self-test (untracked reachability)' }

Write-Host "=== GATE 14. Lifecycle adjudicator: ordered sequence + exit-0 unknown-error + portable harness ==="
$life = Get-Content (Join-Path $root 'scripts\lib\EmulatorLifecycle.ps1') -Raw
$harn = Get-Content (Join-Path $root 'scripts\tests\emulator-lifecycle-adjudication.tests.ps1') -Raw
$lcOrdering = ($life -match 'orderCore') -and ($life -match '\$iScript -gt \$iStartup') -and ($life -match '\$iShutdown -gt \$iScript') -and ($life -match '\$iStop -gt \$iShutdown')
$lcExit0Unknown = ($life -match 'unknownError') -and ($life -match '\(-not \$unknownError\)') -and ($life -notmatch 'if \(\$CliExit -eq 0\) \{ return \$true')
$lcTimeoutOrder = ($life -match 'midRunTimeout') -and ($life -match '\$iTimeout -gt \$iShutdown')
$lcMultiTimeout = ($life -match 'multiTimeout')
$lcNoBroadExit2 = ($life -notmatch 'if \(\$CliExit -eq 2\) \{ return \$true') -and ($life -notmatch 'exitCode -eq 2[^`n]*PASS')
$lcPortable = ($harn -match 'Resolve-LifecycleHelper') -and ($harn -match '\.\.\\lib\\EmulatorLifecycle\.ps1') -and ($harn -match "'EmulatorLifecycle\.ps1'") -and ($harn -match 'LIFECYCLE_HELPER_NOT_FOUND') -and ($harn -match 'LIFECYCLE_HELPER_AMBIGUOUS')
$lc = @{ ordered_sequence=$lcOrdering; exit0_unknown_error_rejected=$lcExit0Unknown; timeout_after_shutdown=$lcTimeoutOrder; multi_timeout_rejected=$lcMultiTimeout; no_broad_exit2_pass=$lcNoBroadExit2; portable_helper_resolution=$lcPortable }
$lcbad = @($lc.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($lcbad.Count -eq 0) { Pass 'lifecycle: ordered event sequence; exit-0 unknown-error rejected; timeout-after-shutdown; multi-timeout rejected; no broad exit2=>PASS; deterministic portable helper resolution' } else { $lcbad | ForEach-Object { Write-Host "  MISSING: $_" }; Fail 'lifecycle hardening' }
$stOut = & pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\tests\emulator-lifecycle-adjudication.tests.ps1') *>&1
$stExit = $LASTEXITCODE
if (($stExit -eq 0) -and (@($stOut | Select-String -SimpleMatch 'EMULATOR_LIFECYCLE_ADJUDICATION_SELFTEST_PASS').Count -gt 0)) { Pass 'lifecycle self-test harness executed: all checks PASS (ordered + portable)' } else { Fail ("lifecycle self-test harness (exit={0})" -f $stExit) }

Write-Host ""
if ($exit -eq 0) {
  Write-Host 'AUTHORITY SERVICE: dedicated, default-deny, source-of-truth-verifying ; KMS SIGNER: KMS-only (no local key/HMAC) ; RAW_SIGNING_ENDPOINT=0 ; CALLER_SELECTABLE_KEY/DOMAIN/ALGO=0 ; SINGLE ACTIVE KEY ; IDEMPOTENT ; FAIL-CLOSED AUDIT ; KMS_SIGNING/SERVICE_AUTH/AUTHORITY_SERVICE=SAFE_UNAVAILABLE ; BILLING DISABLED ; P0-IAM-01A PASS ; R1B-2 OPEN'
  Write-Host 'RESULT: P0_IAM_01B1_PRODUCTION_AUTHORITY_TRUST_ROOT_PASS'
} else { Write-Host 'RESULT: P0_IAM_01B1_PRODUCTION_AUTHORITY_TRUST_ROOT_FAIL' }
exit $exit
