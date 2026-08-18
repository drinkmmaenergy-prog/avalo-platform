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

# ── R8 trusted child-evidence contract ───────────────────────────────────────────────────────────────────────────
# The nested IAM-01A relationship in GATE 2 was repaired earlier in R8. A later cross-cutting audit found four more
# children in this validator whose failure evidence does not survive: the Jest console (piped to Out-Null), the Jest
# report (deleted before the verdict), and the lifecycle and strict-parser self-test harnesses (captured into a
# variable and never written anywhere, so a failure exposes only an exit code).
#
# Same loading model as the lifecycle and strict-parser helpers: exact repository-relative path, no PATH search, no
# module-name resolution, ambient definitions evicted first, origin proven, fail closed.
$tcePath = Join-Path $root 'scripts\lib\TrustedChildEvidence.ps1'
# CANONICAL PIN - must be byte-identical to the constant in the IAM-01A validator. A permanent regression
# asserts the two literals are equal, so they cannot drift silently.
$TCE_EXPECTED_SHA256 = '3A59252B60E30FF8268A87455BDD2A157241BD294DE896510D4BF68D02C11B59'
if (-not (Test-Path -LiteralPath $tcePath -PathType Leaf)) {
  Write-Host ("GATE FAIL: trusted child-evidence helper missing: " + $tcePath)
  Write-Host 'RESULT: P0_IAM_01B1_PRODUCTION_AUTHORITY_TRUST_ROOT_FAIL'
  exit 1
}
# BYTE identity before execution (BCL SHA-256, never Get-FileHash - see the IAM-01A note).
$tceSha = ''
try {
  $tceHasher = [System.Security.Cryptography.SHA256]::Create()
  try { $tceSha = ([BitConverter]::ToString($tceHasher.ComputeHash([System.IO.File]::ReadAllBytes($tcePath))) -replace '-', '') }
  finally { $tceHasher.Dispose() }
} catch { $tceSha = '' }
if ($tceSha -ne $TCE_EXPECTED_SHA256) {
  Write-Host ("GATE FAIL: trusted child-evidence helper byte identity mismatch (expected " + $TCE_EXPECTED_SHA256 + " actual " + $(if ($tceSha) { $tceSha } else { 'UNREADABLE' }) + ")")
  Write-Host 'RESULT: P0_IAM_01B1_PRODUCTION_AUTHORITY_TRUST_ROOT_FAIL'
  exit 1
}
$tceResolved = (Resolve-Path -LiteralPath $tcePath).Path
# Origin-conditional eviction: remove only definitions that did NOT come from the byte-verified file. GATE 2
# runs the IAM-01A validator in-process, and an unconditional Function: removal there would delete this
# validator's own loaded helper (Function: drive removals act on the session table), leaving GATE 12 onwards
# with "New-TceArtifactPath is not recognized". That is exactly what happened in FINAL_REPAIRED_RUN_1.
foreach ($tceFn in @('Get-TceEvidenceDir', 'New-TceArtifactPath', 'Get-TceSha256', 'Register-TceChildEvidence')) {
  $existing = Get-Command $tceFn -CommandType Function -ErrorAction SilentlyContinue
  if ($null -eq $existing) { continue }
  $existingFile = if ($existing.ScriptBlock -and $existing.ScriptBlock.File) { (Resolve-Path -LiteralPath $existing.ScriptBlock.File -ErrorAction SilentlyContinue).Path } else { '' }
  if ($existingFile -ne $tceResolved) { Remove-Item -LiteralPath ("Function:\" + $tceFn) -Force -ErrorAction SilentlyContinue }
}
. $tcePath
$tceCmd = Get-Command Register-TceChildEvidence -CommandType Function -ErrorAction SilentlyContinue
$tceFile = if ($tceCmd -and $tceCmd.ScriptBlock -and $tceCmd.ScriptBlock.File) { (Resolve-Path -LiteralPath $tceCmd.ScriptBlock.File).Path } else { '' }
if ($tceFile -ne $tceResolved) {
  Write-Host 'GATE FAIL: trusted child-evidence helper identity could not be established'
  Write-Host 'RESULT: P0_IAM_01B1_PRODUCTION_AUTHORITY_TRUST_ROOT_FAIL'
  exit 1
}
$tceShaAfter = ''
try {
  $tceHasher2 = [System.Security.Cryptography.SHA256]::Create()
  try { $tceShaAfter = ([BitConverter]::ToString($tceHasher2.ComputeHash([System.IO.File]::ReadAllBytes($tcePath))) -replace '-', '') }
  finally { $tceHasher2.Dispose() }
} catch { $tceShaAfter = '' }
if ($tceShaAfter -ne $TCE_EXPECTED_SHA256) {
  Write-Host 'GATE FAIL: trusted child-evidence helper bytes changed during load'
  Write-Host 'RESULT: P0_IAM_01B1_PRODUCTION_AUTHORITY_TRUST_ROOT_FAIL'
  exit 1
}
Write-Host ("IAM01B1_TCE_HELPER_SHA256=" + $tceSha)
$IAM01B1_EVIDENCE = ''
try { $IAM01B1_EVIDENCE = Get-TceEvidenceDir -Validator 'IAM01B1' } catch { $IAM01B1_EVIDENCE = '' }
if ([string]::IsNullOrWhiteSpace($IAM01B1_EVIDENCE) -or -not (Test-Path -LiteralPath $IAM01B1_EVIDENCE -PathType Container)) {
  Write-Host 'GATE FAIL: child-evidence directory could not be created'
  Write-Host 'RESULT: P0_IAM_01B1_PRODUCTION_AUTHORITY_TRUST_ROOT_FAIL'
  exit 1
}
Write-Host ("IAM01B1_CHILD_EVIDENCE_DIR=" + $IAM01B1_EVIDENCE)

# Import-graph reachability scan: which PRODUCTION modules reference $Pattern.
#  * --untracked is MANDATORY: the P0-IAM-01B runtime and test sources are UNTRACKED in this detached-HEAD validation
#    worktree, so a tracked-only `git grep` matches ZERO files and every reachability gate built on it is VACUOUS
#    (silent false-negative). --untracked still honours .gitignore, so node_modules/dist stay excluded.
#  * -n so each hit can be adjudicated by LINE: comment-only lines (`//`, `*`, `/*`) are documentation, not references,
#    and must not count as reachability. Real `import {X} from` / `X(` references are never comment lines.
#  * $ExcludeFiles removes the DECLARING module (the seam defines the symbol; defining is not importing).
# Anything surviving all three filters is a genuine production importer and fails the gate.
function Get-ProductionImporters([string]$Pattern, [string[]]$Dirs, [string[]]$ExcludeFiles = @()) {
  $files = @()
  $lines = @(& git -C $root grep --untracked -n -e $Pattern -- @Dirs 2>$null)
  # Supplement: NO form of `git grep` (even --untracked) searches .gitignore'd files. This repo has a broad `lib/`
  # rule that ignores functions/src/lib/ — a PRODUCTION source path — so a rogue importer placed there would be
  # invisible to the scan above. Enumerate ignored production sources explicitly and grep their content directly.
  # Build/vendor output is excluded so the scan stays deterministic and fast (measured: 1 file).
  $ignored = @(@(& git -C $root ls-files --others --ignored --exclude-standard -- @Dirs 2>$null) |
    Where-Object { $_ -match '\.(ts|tsx|js|mjs|cjs)$' -and $_ -notmatch '(^|/)(node_modules|dist|build|coverage|\.next|\.expo)/' })
  foreach ($rel in $ignored) {
    $abs = Join-Path $root ($rel -replace '/', '\')
    if (-not (Test-Path -LiteralPath $abs)) { continue }
    foreach ($hit in @(Select-String -LiteralPath $abs -Pattern $Pattern -ErrorAction SilentlyContinue)) {
      $lines += ("{0}:{1}:{2}" -f $rel, $hit.LineNumber, $hit.Line)
    }
  }
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
# R8: the nested transcript is EVIDENCE and is kept.
# It used to be written to a random temp name and deleted immediately after the two markers were read. That
# is fine while the gate passes and useless the moment it does not: an R8 battery run had this gate fail with
# `iam01aExit=1` while the standalone IAM-01A in the same battery passed 53/53, and the only record of why the
# nested run failed had already been erased. A validator that destroys the evidence for its own failure cannot
# be independently reviewed, which is the same defect as a battery that prints its verdict only to a console.
# The directory is overridable so an orchestrator can collect it; it defaults OUTSIDE the repository, because
# writing evidence into the worktree would change the very git state GATE 1 asserts.
$nestedDir = if ($env:AVALO_IAM01B1_NESTED_EVIDENCE_DIR) { $env:AVALO_IAM01B1_NESTED_EVIDENCE_DIR } else { Join-Path $env:TEMP 'avalo-iam01b1-nested-evidence' }
New-Item -ItemType Directory -Force -Path $nestedDir | Out-Null
$iam01aOut = Join-Path $nestedDir ("NESTED_IAM01A_" + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + "-" + [guid]::NewGuid().ToString('N').Substring(0, 8) + ".out")
& (Join-Path $root 'scripts\validate-p0-iam-01a-financial-authority-trust-boundary-foundation.ps1') *> $iam01aOut
$iam01aExit = $LASTEXITCODE
$iam01aTxt = if (Test-Path $iam01aOut) { Get-Content -LiteralPath $iam01aOut -Raw } else { '' }
Set-Content -LiteralPath (Join-Path $nestedDir 'NESTED_IAM01A_LAST_EXIT.txt') -Value ([string]$iam01aExit) -NoNewline
function HasMark([string]$t, [string]$m) { return ($null -ne $t) -and ($t -match [regex]::Escape($m)) }
$priorOk = ($iam01aExit -eq 0) -and (HasMark $iam01aTxt 'RESULT: P0_IAM_01A_FINANCIAL_AUTHORITY_TRUST_BOUNDARY_FOUNDATION_PASS') -and (HasMark $iam01aTxt 'prior validators green')
# Machine-readable so a parent harness can gate on the NESTED exit specifically, rather than inferring it from
# this validator's overall exit.
Write-Host ("IAM01B1_NESTED_IAM01A_EXIT=" + $iam01aExit)
Write-Host ("IAM01B1_NESTED_IAM01A_TRANSCRIPT=" + $iam01aOut)
Write-Host ("IAM01B1_NESTED_IAM01A_BYTES=" + $iam01aTxt.Length)
if (-not $priorOk) {
  # Surface the nested run's OWN first failures inline. "exit 1" is an outcome, not a diagnosis.
  foreach ($ln in @($iam01aTxt -split "`r?`n" | Where-Object { $_ -match 'GATE FAIL' } | Select-Object -First 5)) {
    Write-Host ("  NESTED IAM-01A: " + $ln.Trim())
  }
  if ([string]::IsNullOrWhiteSpace($iam01aTxt)) { Write-Host '  NESTED IAM-01A: (no output captured)' }
}
if ($priorOk) { Pass 'prior markers green: P0-IAM-01A PASS (which transitively confirms layer0/layer1/p0-01/p0-02/c5/r1b1)' } else { Fail ("prior markers (iam01aExit={0}; transcript retained at {1})" -f $iam01aExit, $iam01aOut) }

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
  # B3 / B2. The report lands in the run-scoped evidence directory instead of $env:TEMP, and the console stream is
  # REDIRECTED TO A FILE rather than into Out-Null. Previously a GATE 12 failure retained neither: the only console
  # observation of the run was discarded as it was produced, and the report was deleted before the verdict below.
  $jsonOut = New-TceArtifactPath -EvidenceDir $IAM01B1_EVIDENCE -Name 'B3_UNIT_SUITE_JEST_REPORT.json'
  $jestConsole = New-TceArtifactPath -EvidenceDir $IAM01B1_EVIDENCE -Name 'B2_UNIT_SUITE_JEST_CONSOLE.log'
  $runStartedUtc = (Get-Date).ToUniversalTime()          # freshness floor for the report (anti-stale)
  Push-Location $fnroot
  # File redirection, not a pipeline: capturing a child's streams into a PowerShell pipeline is what tangles native
  # stdio elsewhere in this chain, and `| Out-Null` is what destroyed this observation entirely.
  & npx jest --config jest.config.js --selectProjects main --runInBand --forceExit --json --outputFile="$jsonOut" ("src/__tests__/" + $TEST_FILE) *> $jestConsole
  $jexit = $LASTEXITCODE
  Pop-Location
  $b2Evidence = Register-TceChildEvidence -EvidenceDir $IAM01B1_EVIDENCE -Name 'B2_UNIT_SUITE_JEST_CONSOLE' `
                  -TranscriptPath $jestConsole -ExitCode $jexit
  # STRICT adjudication (R5). $jexit -eq 0 is MANDATORY here (this suite is pure unit; there is no emulator exit to
  # normalize). Aggregate 54/54 alone is NOT sufficient: each critical security assertion must be present exactly once,
  # by exact fullName, from the exact expected source file.
  # R7 (Codex finding 7). See the identical note in the IAM-01A validator. This validator invokes IAM-01A in
  # the SAME PowerShell process, so ambient command state propagates across that nested call — which is
  # precisely how a forged parser could reach this gate.
  $sjpParserPath = Join-Path $root 'scripts\lib\StrictJestParser.ps1'
  foreach ($sjpFn in @('Get-SjpStrictReport','Test-SjpTrustedParserIdentity','Test-SjpHasProperty','Test-SjpIsStrictBool','Test-SjpIsStrictInt')) {
    if (Test-Path -LiteralPath ("Function:\" + $sjpFn)) { Remove-Item -LiteralPath ("Function:\" + $sjpFn) -Force -ErrorAction SilentlyContinue }
  }
  if (-not (Test-Path -LiteralPath $sjpParserPath -PathType Leaf)) { Fail "trusted strict parser missing: $sjpParserPath" }
  . $sjpParserPath
  if (-not (Test-SjpTrustedParserIdentity -ParserPath $sjpParserPath)) { Fail 'trusted strict parser identity could not be established' }
  $IAM01B_CRITICAL = @(
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies production entrypoint signPaidChatAuthority does NOT accept a deps parameter (arity = request, ctx, correlationId)',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies production entrypoint fails closed (SAFE_UNAVAILABLE), signing nothing, when the composition root is empty',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies JavaScript extra-argument injection of a full fake deps has NO effect (ignored -> SAFE_UNAVAILABLE)',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies importer cannot substitute a fake signer through the production entrypoint (extra-arg ignored -> SAFE_UNAVAILABLE)',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies importer cannot substitute a fake callerPolicy through the production entrypoint (extra-arg ignored -> SAFE_UNAVAILABLE)',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies importer cannot substitute a fake serviceAuth through the production entrypoint (extra-arg ignored -> SAFE_UNAVAILABLE)',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies importer cannot substitute a fake registry through the production entrypoint (extra-arg ignored -> SAFE_UNAVAILABLE)',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies importer cannot substitute a fake sourceReader through the production entrypoint (extra-arg ignored -> SAFE_UNAVAILABLE)',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies importer cannot substitute a fake idempotency through the production entrypoint (extra-arg ignored -> SAFE_UNAVAILABLE)',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies importer cannot substitute a fake audit through the production entrypoint (extra-arg ignored -> SAFE_UNAVAILABLE)',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies production module exposes NO caller-selectable business signing API and NO mutable override seam',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies the dependency-injected core is reachable ONLY through the test seam; production entrypoint stays unavailable',
    'P0-IAM-01B — production trust boundary: no caller-selectable dependencies generic shared-Admin request via the production entrypoint cannot sign (no bindings -> SAFE_UNAVAILABLE)',
    'P0-IAM-01B — shared-Admin write != signing authority; production gated; no unsafe exports a generic Admin-written schema-valid record CANNOT mint authority without the service (no signature obtainable)',
    'P0-IAM-01B — shared-Admin write != signing authority; production gated; no unsafe exports production KMS signer + authority service + service-auth are all SAFE_UNAVAILABLE (unwired)',
    'P0-IAM-01B — shared-Admin write != signing authority; production gated; no unsafe exports no raw-bytes / arbitrary-digest signing function is exported; no caller-selectable signer/verifier',
    'P0-IAM-01B — key lifecycle (single active; revoked/verify-only/unknown fail closed) zero ACTIVE key -> SAFE_UNAVAILABLE (no_active_signing_key)'
  )
  # R6: strict mode stated explicitly (see the identical note in the IAM-01A validator). ExpectedTotalTests binds
  # the 54 to physical assertion records; previously only the 17 critical names were constrained.
  $rep = Get-SjpStrictReport -JsonPath $jsonOut -NativeExit $jexit -RunStartedUtc $runStartedUtc `
           -ExpectedTestFile $TEST_FILE -MinPassed 50 -ExpectedPassed 54 -ExpectedTotalTests 54 `
           -RequiredAssertions $IAM01B_CRITICAL `
           -RequireSingleTestResult $true -RequireExactAssertionRecordCount $true -RequireExpectedFileUnique $true
  Write-Host ("  strict jest -> passed={0} failed={1} pending={2} todo={3} total={4} jexit={5} ok={6}" -f $rep.passed, $rep.failed, $rep.pending, $rep.todo, $rep.total, $jexit, $rep.ok)
  # Registered, not deleted, and registered BEFORE the verdict so a rejected report survives for review.
  $b3Evidence = Register-TceChildEvidence -EvidenceDir $IAM01B1_EVIDENCE -Name 'B3_UNIT_SUITE_JEST_REPORT' `
                  -TranscriptPath $jsonOut -ExitCode $jexit -RequireNonEmpty
  $gate12Evidence = ([bool]$b2Evidence.EvidenceOk) -and ([bool]$b3Evidence.EvidenceOk)
  if ($rep.ok -and $gate12Evidence) { Pass ("IAM-01B suite: {0} passed / 0 failed / 0 skipped; strict schema + {1} exact critical assertions + jexit=0" -f $rep.passed, $IAM01B_CRITICAL.Count) }
  else { $rep.errors | ForEach-Object { Write-Host "  STRICT REJECT: $_" }; Fail ("IAM-01B suite (strictErrors={0} jexit={1} evidenceOk={2})" -f @($rep.errors).Count, $jexit, $gate12Evidence) }
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
# adversarial: a rogue importer hidden in a .gitignore'd PRODUCTION path must still be detected. `git grep` never
# searches ignored files, so this proves the supplementary ignored-file scan in Get-ProductionImporters is live.
$advRepo2 = Join-Path $env:TEMP ('iam01b-ignoredscan-selftest-' + [guid]::NewGuid().ToString('N'))
$advOk2 = $false
try {
  New-Item -ItemType Directory -Force -Path (Join-Path $advRepo2 'functions\src\lib') | Out-Null
  & git -C $advRepo2 init -q *>&1 | Out-Null
  Set-Content -LiteralPath (Join-Path $advRepo2 '.gitignore') -Encoding UTF8 -Value 'lib/'
  Set-Content -LiteralPath (Join-Path $advRepo2 'functions\src\lib\hidden.ts') -Encoding UTF8 `
    -Value "import { signFinancialAuthorityWithDeps } from '../../security/financialAuthority/authorityService';"
  # even --untracked cannot see it (proves the blind spot is real)
  $advBlind = @(& git -C $advRepo2 grep --untracked -l -e 'signFinancialAuthorityWithDeps' -- 'functions/src' 2>$null)
  # the supplementary ignored-file enumeration does see it
  $advSeen = @(@(& git -C $advRepo2 ls-files --others --ignored --exclude-standard -- 'functions/src' 2>$null) |
    Where-Object { $_ -match '\.ts$' -and $_ -notmatch '(^|/)node_modules/' })
  $advHit = $false
  foreach ($rel in $advSeen) {
    $abs = Join-Path $advRepo2 ($rel -replace '/', '\')
    if (Test-Path -LiteralPath $abs) { if (@(Select-String -LiteralPath $abs -Pattern 'signFinancialAuthorityWithDeps' -ErrorAction SilentlyContinue).Count -gt 0) { $advHit = $true } }
  }
  $advOk2 = ($advBlind.Count -eq 0) -and $advHit
} catch { $advOk2 = $false } finally { Remove-Item -LiteralPath $advRepo2 -Recurse -Force -ErrorAction SilentlyContinue }
if ($advOk2) { Pass 'adversarial ignored-path self-test: rogue importer in a .gitignore''d production path DETECTED (git grep proven blind to it)' } else { Fail 'adversarial ignored-path self-test' }

Write-Host "=== GATE 14. Lifecycle adjudicator: ordered sequence + exit-0 unknown-error + portable harness ==="
$life = Get-Content (Join-Path $root 'scripts\lib\EmulatorLifecycle.ps1') -Raw
$harn = Get-Content (Join-Path $root 'scripts\tests\emulator-lifecycle-adjudication.tests.ps1') -Raw
$lcOrdering = ($life -match 'orderCore') -and ($life -match '\$iScript -gt \$iStartup') -and ($life -match '\$iShutdown -gt \$iScript') -and ($life -match '\$iStop -gt \$iShutdown')
$lcExit0Unknown = ($life -match 'unknownError') -and ($life -match '\(-not \$unknownError\)') -and ($life -notmatch 'if \(\$CliExit -eq 0\) \{ return \$true')
$lcTimeoutOrder = ($life -match 'midRunTimeout') -and ($life -match '\$iExactTimeout -gt \$iShutdown')   # R5: renamed to exact-timeout index
$lcMultiTimeout = ($life -match 'multiTimeout')
$lcNoBroadExit2 = ($life -notmatch 'if \(\$CliExit -eq 2\) \{ return \$true') -and ($life -notmatch 'exitCode -eq 2[^`n]*PASS')
$lcPortable = ($harn -match 'Resolve-LifecycleHelper') -and ($harn -match '\.\.\\lib\\EmulatorLifecycle\.ps1') -and ($harn -match "'EmulatorLifecycle\.ps1'") -and ($harn -match 'LIFECYCLE_HELPER_NOT_FOUND') -and ($harn -match 'LIFECYCLE_HELPER_AMBIGUOUS')
$lc = @{ ordered_sequence=$lcOrdering; exit0_unknown_error_rejected=$lcExit0Unknown; timeout_after_shutdown=$lcTimeoutOrder; multi_timeout_rejected=$lcMultiTimeout; no_broad_exit2_pass=$lcNoBroadExit2; portable_helper_resolution=$lcPortable }
$lcbad = @($lc.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($lcbad.Count -eq 0) { Pass 'lifecycle: ordered event sequence; exit-0 unknown-error rejected; timeout-after-shutdown; multi-timeout rejected; no broad exit2=>PASS; deterministic portable helper resolution' } else { $lcbad | ForEach-Object { Write-Host "  MISSING: $_" }; Fail 'lifecycle hardening' }
# B4. The harness output is written to the evidence directory as well as captured, so a failure is diagnosable.
# Previously it lived only in $stOut and the failure message carried nothing but the exit code, which is exactly
# the "trust the child, discard its reasons" shape this round is closing out.
$b4Transcript = New-TceArtifactPath -EvidenceDir $IAM01B1_EVIDENCE -Name 'B4_LIFECYCLE_SELFTEST.transcript.txt'
& pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\tests\emulator-lifecycle-adjudication.tests.ps1') *> $b4Transcript
$stExit = $LASTEXITCODE
$stOut = if (Test-Path -LiteralPath $b4Transcript) { Get-Content -LiteralPath $b4Transcript } else { @() }
$b4Evidence = Register-TceChildEvidence -EvidenceDir $IAM01B1_EVIDENCE -Name 'B4_LIFECYCLE_SELFTEST' `
                -TranscriptPath $b4Transcript -ExitCode $stExit -RequireNonEmpty `
                -ResultMarker 'RESULT' -ExpectedResultValue 'EMULATOR_LIFECYCLE_ADJUDICATION_SELFTEST_PASS'
if (($stExit -eq 0) -and ([bool]$b4Evidence.EvidenceOk) -and (@($stOut | Select-String -SimpleMatch 'EMULATOR_LIFECYCLE_ADJUDICATION_SELFTEST_PASS').Count -gt 0)) { Pass 'lifecycle self-test harness executed: all checks PASS (whole-log + exact cleanup + portable)' } else { Fail ("lifecycle self-test harness (exit={0} evidenceOk={1} transcript={2})" -f $stExit, $b4Evidence.EvidenceOk, $b4Transcript) }

Write-Host "=== GATE 15. R5: whole-log error policy + exact cleanup proof + strict Jest parser ==="
# (a) the helper source must implement the repaired policy, and must NOT contain the two defective constructs.
$r5WholeLog   = ($life -match 'Test-EmuLineIsTestOutput') -and ($life -match 'Test-EmuLineHasErrorSignal') -and ($life -match 'Test-EmuLineIsExactBenign')
$r5NoRegion   = ($life -notmatch '\$scanRegion\s*=') -and ($life -notmatch '\$log\.Substring\(\$iScript\)')   # post-success-only scan removed
$r5ExactTmo   = ($life -match 'Get-EmuExactCleanupTimeoutIndex') -and ($life -match 'firebase-tools') -and ($life -match 'withTimeout|EmulatorRegistry|commandUtils|cleanShutdown')
$r5NoGeneric  = ($life -notmatch '\(\(\$iFinalErr -ge 0\) -and \(\$iFinalErr -gt \$iShutdown\)\)')            # generic wrapper can no longer satisfy cleanup
$r5CaseSense  = ($life -match '-cmatch')                                                                       # case-sensitive severity token
# (b) both validators must use the shared strict parser rather than coercing casts / substring name matching.
$iam01aSrc = Get-Content (Join-Path $root 'scripts\validate-p0-iam-01a-financial-authority-trust-boundary-foundation.ps1') -Raw
$selfSrc   = Get-Content (Join-Path $root 'scripts\validate-p0-iam-01b-production-authority-trust-root.ps1') -Raw
$r5ParserA = ($iam01aSrc -match 'Get-SjpStrictReport') -and ($iam01aSrc -notmatch '\$passed = \[int\]\$j\.numPassedTests') -and ($iam01aSrc -notmatch "fullName -like")
$r5ParserB = ($selfSrc -match 'Get-SjpStrictReport') -and ($selfSrc -match 'IAM01B_CRITICAL') -and ($selfSrc -notmatch '\$passed = \[int\]\$j\.numPassedTests')
$r5Jexit   = ($selfSrc -match '-NativeExit \$jexit')
$parserSrc = Get-Content (Join-Path $root 'scripts\lib\StrictJestParser.ps1') -Raw
$r5Types   = ($parserSrc -match 'Test-SjpIsStrictBool') -and ($parserSrc -match 'Test-SjpIsStrictInt') -and ($parserSrc -match 'required_assertion_not_unique') -and ($parserSrc -match 'duplicate_assertion_name')
# R6: the second independent review (Codex, vs the R5 bundle) reproduced three bypasses whose shared root cause was
# that declared counters were never reconciled against physical assertion records, and file identity was a filter
# rather than a cardinality assertion. These patterns prove the repair is still present — a silent revert of any of
# them re-opens a security gate, so it must fail this validator rather than pass quietly.
$r6RecordRecon = ($parserSrc -match 'record_total_mismatch')  -and ($parserSrc -match 'record_passed_mismatch') -and
                 ($parserSrc -match 'record_failed_mismatch') -and ($parserSrc -match 'record_pending_mismatch') -and
                 ($parserSrc -match 'record_todo_mismatch')
$r6Cardinality = ($parserSrc -match 'expected_test_file_result_objects_not_unique') -and
                 ($parserSrc -match 'unexpected_test_file') -and ($parserSrc -match 'test_result_object_count_not_one')
$r6StatusVocab = ($parserSrc -match 'assertion_status_unsupported') -and ($parserSrc -match 'STATUS_BUCKET')
$r6SuiteRecon  = ($parserSrc -match 'numTotalTestSuites')
# both security callers must request the strict mode EXPLICITLY and must never opt out
$r6CallersStrict = ($iam01aSrc -match '-RequireExactAssertionRecordCount \$true') -and ($iam01aSrc -match '-RequireSingleTestResult \$true') -and
                   ($selfSrc   -match '-RequireExactAssertionRecordCount \$true') -and ($selfSrc   -match '-RequireSingleTestResult \$true')
$r6NoOptOut      = ($iam01aSrc -notmatch '-Require\w+ \$false') -and ($selfSrc -notmatch '-Require\w+ \$false')
$r6TotalsBound   = ($iam01aSrc -match '-ExpectedTotalTests 53') -and ($selfSrc -match '-ExpectedTotalTests 54')
$r5 = @{ whole_log_classifier=$r5WholeLog; post_success_only_scan_removed=$r5NoRegion; exact_cleanup_timeout=$r5ExactTmo;
         generic_wrapper_cannot_normalize=$r5NoGeneric; case_sensitive_severity=$r5CaseSense;
         iam01a_strict_parser=$r5ParserA; iam01b_strict_parser=$r5ParserB; iam01b_requires_jexit0=$r5Jexit; parser_type_discipline=$r5Types;
         r6_record_reconciliation=$r6RecordRecon; r6_result_object_cardinality=$r6Cardinality;
         r6_status_vocabulary=$r6StatusVocab; r6_suite_reconciliation=$r6SuiteRecon;
         r6_callers_request_strict=$r6CallersStrict; r6_callers_no_optout=$r6NoOptOut; r6_totals_bound_to_records=$r6TotalsBound }
$r5bad = @($r5.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($r5bad.Count -eq 0) { Pass 'R5+R6: whole-log unknown-error policy; exact cleanup-timeout proof; generic wrapper cannot normalize; strict typed Jest parser with exact unique named assertions in BOTH validators; R6 record/counter reconciliation, result-object cardinality, status vocabulary and explicit strict caller contracts' }
else { $r5bad | ForEach-Object { Write-Host "  MISSING: $_" }; Fail 'R5/R6 lifecycle/parser hardening' }

# adversarial: prove the two repaired false-negatives are actually detected by the CURRENT helper, and that the
# strict parser rejects the coercion bypasses. Runs the real code against in-memory fixtures.
$advOkR5 = $false
try {
  if (-not (Get-Command Get-EmuLifecycleVerdict -ErrorAction SilentlyContinue)) { . (Join-Path $root 'scripts\lib\EmulatorLifecycle.ps1') }
  $OKF = "i  emulators: Starting emulators: firestore`ni  firestore: Firestore Emulator UI websocket is running on 9150.`ni  Running script: node jest`nTests:       53 passed, 53 total`n+  Script exited successfully (code 0)`ni  emulators: Shutting down emulators.`ni  firestore: Stopping Firestore Emulator`n!  Firestore Emulator has exited upon receiving signal: SIGINT"
  $preErr = Get-EmuLifecycleVerdict -CliExit 0 -Log ($OKF -replace 'i  Running script:', "[firestore] ERROR: unclassified protocol state corruption`ni  Running script:")
  $wrapOnly = Get-EmuLifecycleVerdict -CliExit 2 -Log ($OKF + "`nError: An unexpected error has occurred.")
  $cleanOk  = Get-EmuLifecycleVerdict -CliExit 0 -Log $OKF
  $advOkR5 = (-not $preErr.lifecycleOk) -and (-not $wrapOnly.lifecycleOk) -and ($cleanOk.lifecycleOk)
} catch { $advOkR5 = $false }
# B5. Same repair as B4: the strict-parser harness transcript is persisted before it is judged, so a parser
# self-test failure is diagnosable from evidence rather than from an exit code alone.
$b5Transcript = New-TceArtifactPath -EvidenceDir $IAM01B1_EVIDENCE -Name 'B5_STRICT_PARSER_SELFTEST.transcript.txt'
& pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\tests\strict-jest-parser.tests.ps1') *> $b5Transcript
$advParserExit = $LASTEXITCODE
$advParser = if (Test-Path -LiteralPath $b5Transcript) { Get-Content -LiteralPath $b5Transcript } else { @() }
$b5Evidence = Register-TceChildEvidence -EvidenceDir $IAM01B1_EVIDENCE -Name 'B5_STRICT_PARSER_SELFTEST' `
                -TranscriptPath $b5Transcript -ExitCode $advParserExit -RequireNonEmpty `
                -ResultMarker 'RESULT' -ExpectedResultValue 'STRICT_JEST_PARSER_SELFTEST_PASS'
$advParserOk = ($advParserExit -eq 0) -and ([bool]$b5Evidence.EvidenceOk) -and (@($advParser | Select-String -SimpleMatch 'STRICT_JEST_PARSER_SELFTEST_PASS').Count -gt 0)
if ($advOkR5 -and $advParserOk) { Pass 'adversarial R5 self-test: pre-success unknown error DETECTED; generic-wrapper-only exit-2 REJECTED; clean run still PASSES; strict-parser coercion/duplicate fixtures all rejected' }
else { Fail ("adversarial R5 self-test (lifecycle={0} parser={1} parserExit={2} evidence={3})" -f $advOkR5, $advParserOk, $advParserExit, $b5Transcript) }

Write-Host ""
if ($exit -eq 0) {
  Write-Host 'AUTHORITY SERVICE: dedicated, default-deny, source-of-truth-verifying ; KMS SIGNER: KMS-only (no local key/HMAC) ; RAW_SIGNING_ENDPOINT=0 ; CALLER_SELECTABLE_KEY/DOMAIN/ALGO=0 ; SINGLE ACTIVE KEY ; IDEMPOTENT ; FAIL-CLOSED AUDIT ; KMS_SIGNING/SERVICE_AUTH/AUTHORITY_SERVICE=SAFE_UNAVAILABLE ; BILLING DISABLED ; P0-IAM-01A PASS ; R1B-2 OPEN'
  Write-Host 'RESULT: P0_IAM_01B1_PRODUCTION_AUTHORITY_TRUST_ROOT_PASS'
} else { Write-Host 'RESULT: P0_IAM_01B1_PRODUCTION_AUTHORITY_TRUST_ROOT_FAIL' }
exit $exit
