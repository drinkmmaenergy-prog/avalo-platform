#Requires -Version 5.1
<#
  validate-p0-05-r1b2-server-owned-paidchat-authority.ps1 — READ-ONLY, fail-closed. (pwsh 7+.)
  P0-05 R1B-2 — server-owned `/paidChats` canonical authority foundation + trusted-authority loader.
  The FIRST legitimate TrustedPaidChatAuthority construction path is loadTrustedPaidChatAuthority(paidChatId): it loads
  and validates a server-owned /paidChats record, then mints a non-forgeable capability via a MODULE-PRIVATE minter
  (no exported raw-field factory). /paidChats is server-only (Firestore default-deny: no client write/read rule).
  Payer/earner/baseRate/multiplier/effectiveRate/minReservation/policy all derive from the validated record. Billing
  is NOT enabled (no production caller bills through the loader); sendChatMessage stays HARD_FAIL_CLOSED; c5 stays
  SAFE_UNAVAILABLE. On FULL PASS (exit 0): P0_05_R1B2_SERVER_OWNED_PAIDCHAT_AUTHORITY_PASS ; else ..._FAIL (1).
  P0-05 remains OPEN.
#>
[CmdletBinding()]
param(
  [string]$Repo = '',
  [string]$ExpectedHead = '',
  [string]$ForensicRepo = ''
)
$ErrorActionPreference = 'Continue'
# ---- REPOSITORY IDENTITY ---------------------------------------------------------------------------------
# This validator was HALF repaired. It already hands -Repo/-ExpectedHead down to the six validators it
# cascades through, but it had `param()` and three hardcoded literals of its own, so it could pass identity
# on without ever being able to receive it - and its own top-level check compared against the authoring path
# as a string constant. A clean checkout of the checkpoint could therefore never satisfy it.
#
# Same contract as the rest of the chain: explicit input, 40-hex expected commit mandatory in explicit mode,
# and the forensic cross-check only where a second repository is actually supplied.
$AUTHORING_ROOT     = 'C:\a\avalo-controlled-enablement-clean'
$AUTHORING_FORENSIC = 'C:\a\avalo'
$AUTHORING_HEAD     = '4224fd324ee24e387b189fb9307caa05c9ca1ef0'
if ($Repo) {
  $IDENTITY_MODE = 'EXPLICIT'
  $rp = (Resolve-Path -LiteralPath $Repo -ErrorAction SilentlyContinue)
  if (-not $rp) { Write-Host ("GATE FAIL: -Repo does not resolve: " + $Repo); exit 1 }
  $root = $rp.Path.TrimEnd('\')
  if (-not (Test-Path -LiteralPath (Join-Path $root '.git'))) { Write-Host ("GATE FAIL: -Repo is not a Git repository: " + $root); exit 1 }
  if (-not ($ExpectedHead -match '^[0-9a-fA-F]{40}$')) { Write-Host 'GATE FAIL: -ExpectedHead must be a 40-hex commit id in explicit mode'; exit 1 }
  $expectHead = $ExpectedHead.ToLowerInvariant()
  $forensic = $ForensicRepo
} else {
  $IDENTITY_MODE = 'AUTHORING_DEFAULT'
  $root       = $AUTHORING_ROOT
  $forensic   = $AUTHORING_FORENSIC
  $expectHead = $AUTHORING_HEAD
}
Write-Host ("IDENTITY_MODE=" + $IDENTITY_MODE)
Write-Host ("IDENTITY_ROOT=" + $root)
Write-Host ("IDENTITY_EXPECTED_HEAD=" + $expectHead)
Write-Host ("IDENTITY_FORENSIC=" + $(if ($forensic) { $forensic } else { 'NOT_SUPPLIED' }))
$fnroot = Join-Path $root 'functions'
$exit = 0
function Fail([string]$m) { Write-Host ("GATE FAIL: {0}" -f $m); $script:exit = 1 }
function Pass([string]$m) { Write-Host ("GATE PASS: {0}" -f $m) }

# ---- Strict Jest --json helpers (identical contract to the R1B-1 validator) ----
function Convert-NormName([string]$s) { if ($null -eq $s) { return '' }; $t = $s -replace ([char]27 + '\[[0-9;]*m'), ''; $t = $t -replace '\s+', ' '; return $t.Trim() }
function Test-HasProperty($obj, [string]$name) { if ($null -eq $obj) { return $false }; if ([string]::IsNullOrEmpty($name)) { return $false }; $p = $null; try { $p = $obj.PSObject.Properties } catch { return $false }; if ($null -eq $p) { return $false }; return ($null -ne ($p | Where-Object { $_.Name -eq $name } | Select-Object -First 1)) }
function Test-StrictTrue($v) { return (($v -is [bool]) -and ($v -eq $true)) }
function Test-StrictNonNegInt($v, [ref]$out) {
  $out.Value = $null
  if ($null -eq $v) { return $false }; if ($v -is [bool]) { return $false }; if ($v -is [string]) { return $false }; if ($v -is [array]) { return $false }
  if (($v -is [int]) -or ($v -is [long]) -or ($v -is [int16]) -or ($v -is [byte]) -or ($v -is [uint16]) -or ($v -is [uint32]) -or ($v -is [uint64])) { $l = [long]$v; if ($l -lt 0) { return $false }; $out.Value = $l; return $true }
  if (($v -is [double]) -or ($v -is [single]) -or ($v -is [decimal])) { if (($v -is [double]) -or ($v -is [single])) { $d0 = [double]$v; if ([double]::IsNaN($d0) -or [double]::IsInfinity($d0)) { return $false } }; $d = [double]$v; if ($d -lt 0) { return $false }; if ($d -gt 9.0e18) { return $false }; if ([math]::Floor($d) -ne $d) { return $false }; $out.Value = [long]$d; return $true }
  return $false
}
function Test-JsonSummaryStrict($j, [long]$minPassed) {
  if ($null -eq $j) { return @{ ok = $false; reason = 'root_null' } }
  if ($j -is [array]) { return @{ ok = $false; reason = 'root_array' } }
  foreach ($p in @('success', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests', 'numTotalTests', 'testResults')) { if (-not (Test-HasProperty $j $p)) { return @{ ok = $false; reason = ('missing_' + $p) } } }
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
  if (($vp.Value + $vf.Value + $vpd.Value + $vt.Value) -ne $vtot.Value) { return @{ ok = $false; reason = 'counts_inconsistent' } }
  $tr = $j.testResults; if (-not ($tr -is [array])) { return @{ ok = $false; reason = 'testResults_not_array' } }; if (@($tr).Count -eq 0) { return @{ ok = $false; reason = 'testResults_empty' } }
  return @{ ok = $true; reason = 'valid' }
}
function Read-JsonFileStrict([string]$path) {
  if ([string]::IsNullOrEmpty($path) -or -not (Test-Path $path)) { return @{ ok = $false; json = $null; reason = 'file_missing' } }
  $raw = $null; try { $raw = Get-Content -LiteralPath $path -Raw -ErrorAction Stop } catch { return @{ ok = $false; json = $null; reason = 'read_error' } }
  if ($null -eq $raw -or [string]::IsNullOrWhiteSpace($raw)) { return @{ ok = $false; json = $null; reason = 'empty' } }
  $obj = $null; try { $obj = $raw | ConvertFrom-Json -ErrorAction Stop } catch { return @{ ok = $false; json = $null; reason = 'malformed_json' } }
  return @{ ok = $true; json = $obj; reason = 'parsed' }
}
function Test-CurrentRunFile([bool]$existedBefore, [bool]$existsAfter, $writeTime, [datetime]$runStart) { if ($existedBefore) { return $false }; if (-not $existsAfter) { return $false }; if ($null -eq $writeTime) { return $false }; return ([datetime]$writeTime -ge $runStart) }
function Get-JestAssertionRecords($jsonObj) {
  $records = New-Object System.Collections.Generic.List[object]; $idx = 0
  foreach ($tr in @($jsonObj.testResults)) { $file = ([string]$tr.name -replace '\\', '/'); foreach ($ar in @($tr.assertionResults)) { $records.Add([pscustomobject]@{ index = $idx; file = $file; fullName = (Convert-NormName ([string]$ar.fullName)); title = (Convert-NormName ([string]$ar.title)); status = ([string]$ar.status) }); $idx++ } }
  return , $records.ToArray()
}
function Find-ExactPassed($records, [string]$exact, [string]$fileSuffix) {
  $ex = Convert-NormName $exact; $sfx = $fileSuffix.ToLower()
  $hits = @($records | Where-Object { $_.status -eq 'passed' -and ($_.fullName -eq $ex -or $_.title -eq $ex) -and ($_.file.ToLower().EndsWith($sfx)) })
  if ($hits.Count -eq 1) { return $hits[0] }; return $null
}
function Test-RequiredNamedRecords($records, [string[]]$names, [string]$fileSuffix) {
  $matched = @(); $missing = @()
  foreach ($n in $names) { $r = Find-ExactPassed $records $n $fileSuffix; if ($null -eq $r) { $missing += $n } else { $matched += $r } }
  $indexes = @($matched | ForEach-Object { $_.index })
  $distinct = ($missing.Count -eq 0) -and ((@($indexes | Sort-Object -Unique)).Count -eq $names.Count)
  return [pscustomobject]@{ ok = $distinct; missing = $missing; matchedCount = $matched.Count }
}
function Invoke-EmulatorSuite([string]$project, [string]$selectProject, [string]$relTestPath, [long]$minPassed) {
  $jsonDir = Join-Path ([System.IO.Path]::GetTempPath()) ('avalo-p0-05-r1b2-' + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Force -Path $jsonDir | Out-Null
  $jsonPath = Join-Path $jsonDir 'suite.json'
  $runStart = Get-Date
  $jscript = "cd functions && node node_modules/jest/bin/jest.js --selectProjects $selectProject --runInBand --json --outputFile `"$jsonPath`" --runTestsByPath $relTestPath"
  Push-Location $root
  $null = & firebase emulators:exec --only firestore --project $project $jscript 2>&1
  $emuExit = $LASTEXITCODE
  Pop-Location
  $existsAfter = Test-Path $jsonPath
  $writeTime = if ($existsAfter) { (Get-Item $jsonPath).LastWriteTime } else { $null }
  $freshOk = Test-CurrentRunFile $false $existsAfter $writeTime $runStart
  $rd = Read-JsonFileStrict $jsonPath
  $sres = if ($rd.ok) { Test-JsonSummaryStrict $rd.json $minPassed } else { @{ ok = $false; reason = $rd.reason } }
  $records = if ($rd.ok) { Get-JestAssertionRecords $rd.json } else { @() }
  $res = [pscustomobject]@{ ok = ($emuExit -eq 0) -and $freshOk -and $rd.ok -and $sres.ok; emuExit = $emuExit; fresh = $freshOk; schema = $sres.reason; json = $(if ($rd.ok) { $rd.json } else { $null }); records = $records }
  try { Remove-Item -Recurse -Force -LiteralPath $jsonDir -ErrorAction Stop } catch { }
  return $res
}

$MAIN_FILE = 'p0-05-r1b2-server-owned-paidchat-authority.test.ts'
$MAIN_NAMES = @(
  'p0-05 r1b2: paidChatAuthority exports loader but NO raw-field mint/create/build/issue factory',
  'p0-05 r1b2: raw object / cast / clone / fake-symbol cannot be a trusted authority (only the loader mints)',
  'p0-05 r1b2: valid server-owned /paidChats record loads a trusted authority with values equal to the record',
  'p0-05 r1b2: loader rejects a missing /paidChats record (fail-closed)',
  'p0-05 r1b2: loader rejects invalid state',
  'p0-05 r1b2: loader rejects payer == earner',
  'p0-05 r1b2: loader rejects payer not in participants',
  'p0-05 r1b2: loader rejects multiplier not in canonical ladder',
  'p0-05 r1b2: loader rejects effectiveRate mismatch',
  'p0-05 r1b2: loader rejects minimumReservation below 100',
  'p0-05 r1b2: loader rejects unknown authorityVersion and billingPolicyVersion',
  'p0-05 r1b2: loader rejects non-canonical baseRate',
  'p0-05 r1b2: loader rejects pairKey mismatch',
  'p0-05 r1b2: loading authority produces NO wallet/reservation/earner/ledger side effect',
  'p0-05 r1b2: sendChatMessage remains HARD_FAIL_CLOSED and processMessage still fails closed on forged /chats',
  'p0-05 r1b2: general /chats DM and group shell still work'
)
$RULES_FILE = 'p0-05-r1b2-paidchat-rules.test.ts'
$RULES_NAMES = @(
  'p0-05 r1b2 rules: authenticated client cannot create /paidChats',
  'p0-05 r1b2 rules: client cannot update /paidChats',
  'p0-05 r1b2 rules: client cannot delete /paidChats',
  'p0-05 r1b2 rules: client cannot read /paidChats (server-only in R1B-2)',
  'p0-05 r1b2 rules: /chats general shell create still works for an authenticated client',
  'p0-05 r1b2 rules: forged server-billing fields on /chats create are rejected by rules'
)
$R1B2_ALLOW = @(
  'functions/src/chat/canonicalPaidChat/paidChatRecord.ts',
  'functions/src/chat/paidChatAuthority.ts',
  'functions/src/__tests__/p0-05-r1b2-server-owned-paidchat-authority.test.ts',
  'functions/tests/rules/p0-05-r1b2-paidchat-rules.test.ts',
  'scripts/validate-p0-05-r1b2-server-owned-paidchat-authority.ps1'
)

Write-Host "=== GATE 1. Identity + zero staged + bounded scope ==="
$top = (& git -C $root rev-parse --show-toplevel) 2>$null; $head = (& git -C $root rev-parse HEAD) 2>$null; $sym = (& git -C $root symbolic-ref -q HEAD) 2>$null; $fhead = (& git -C $forensic rev-parse HEAD) 2>$null
$staged = @(& git -C $root diff --cached --name-only | Where-Object { $_.Trim() -ne '' }).Count
$changed = @(); foreach ($l in @(& git -C $root status --short -uall)) { if ($l.Length -gt 3) { $changed += ($l.Substring(3).Trim() -replace '\\', '/') } }
$r1b2Changed = @($changed | Where-Object { $_ -match 'canonicalPaidChat/paidChatRecord|paidChatAuthority|p0-05-r1b2|validate-p0-05-r1b2' })
$outside = @($r1b2Changed | Where-Object { $_ -notin $R1B2_ALLOW })
$runtimeChanged = @($r1b2Changed | Where-Object { $_ -match '^functions/src/' -and $_ -notmatch '__tests__' })
$pkgHit = @($r1b2Changed | Where-Object { $_ -match 'package\.json$|package-lock\.json$|pnpm-lock|yarn\.lock' })
# The top level is compared against the ROOT IN USE, not against a string constant naming the authoring
# machine, and the forensic HEAD is only required where a forensic root was supplied.
$idOk = ((($top -replace '\\', '/') -eq ($root -replace '\\', '/')) -and $head -eq $expectHead -and -not $sym -and ($(if ($forensic) { $fhead -eq $expectHead } else { $true })) -and $staged -eq 0)
if ($idOk -and $outside.Count -eq 0 -and $runtimeChanged.Count -le 8 -and $pkgHit.Count -eq 0) { Pass ("identity + staged=0 + R1B-2 diff within allowlist (runtime files={0})" -f $runtimeChanged.Count) } else { $outside | ForEach-Object { Write-Host "  OUTSIDE: $_" }; Fail ("identity/diff (staged={0} runtime={1} pkg={2})" -f $staged, $runtimeChanged.Count, $pkgHit.Count) }

# ---- child validator invocation (file-redirected, persisted) ---------------------------------------------
# NEVER `*>&1` into a variable: that tangles the stdio of the `firebase emulators:exec` processes the child
# spawns, so its nested suites can silently fail and its markers never appear - the failure mode
# validate-p0-iam-01a documents and avoids by redirecting to a file. The transcript is also EVIDENCE: it is
# written to a run-scoped directory, hashed, and never deleted, so a failing child can be diagnosed instead
# of being reported as a bare non-zero exit.
$CHILD_EVIDENCE_DIR = Join-Path $env:TEMP ('avalo-iam-child-evidence\' + 'p0-05-r1b2-server-owned-paidchat-authority' + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $PID)
[void][System.IO.Directory]::CreateDirectory($CHILD_EVIDENCE_DIR)
function Invoke-ChildValidator {
  param([Parameter(Mandatory)][string]$ScriptPath, [Parameter(Mandatory)][string]$Name)
  $t = Join-Path $CHILD_EVIDENCE_DIR ($Name + '.transcript.txt')
  & $ScriptPath -Repo $root -ExpectedHead $expectHead *> $t
  $ex = $LASTEXITCODE
  $bytes = 0; $sha = ''; $text = ''
  if (Test-Path -LiteralPath $t -PathType Leaf) {
    $raw = [System.IO.File]::ReadAllBytes($t)
    $bytes = $raw.Length
    $h = [System.Security.Cryptography.SHA256]::Create()
    try { $sha = ([BitConverter]::ToString($h.ComputeHash($raw)) -replace '-', '') } finally { $h.Dispose() }
    $text = [System.IO.File]::ReadAllText($t)
  }
  Write-Host ("  CHILD {0}: exit={1} bytes={2} sha256={3} transcript={4}" -f $Name, $ex, $bytes, $sha, $t)
  # A failing child says why, in the parent's own output, at the point of failure.
  if ($ex -ne 0) {
    foreach ($ln in @($text -split "`r?`n" | Where-Object { $_ -match 'GATE FAIL|RESULT:' } | Select-Object -First 6)) {
      Write-Host ("    CHILD {0} >> {1}" -f $Name, $ln)
    }
  }
  return [pscustomobject]@{ Exit = $ex; Text = $text; Transcript = $t; Sha256 = $sha; Bytes = $bytes }
}

Write-Host "=== GATE 2. Prior closure validators green (transition/layer1/p0-01/p0-02/r1a1/r1b1) ==="
$tvChild = Invoke-ChildValidator -ScriptPath (Join-Path $root 'scripts\validate-clean-worktree-layer0-support.ps1') -Name 'CHILD_CLEAN_WORKTREE_LAYER0_SUPPORT'; $tvExit = $tvChild.Exit; $tv = $tvChild.Text
$tvOk = ($tvExit -eq 0) -and (($tv | Select-String -SimpleMatch 'RESULT: CLEAN_WORKTREE_LAYER0_TO_LAYER1_TRANSITION_CONTRACT_PASS').Count -gt 0)
$l1Child = Invoke-ChildValidator -ScriptPath (Join-Path $root 'scripts\validate-clean-worktree-layer1-payment-foundation-and-p0-04.ps1') -Name 'CHILD_CLEAN_WORKTREE_LAYER1_PAYMENT_FOUNDATION_AND_P0_04'; $l1Exit = $l1Child.Exit; $l1 = $l1Child.Text
$l1Ok = ($l1Exit -eq 0) -and (($l1 | Select-String -SimpleMatch 'RESULT: CLEAN_WORKTREE_LAYER1_PAYMENT_FOUNDATION_AND_P0_04_PASS').Count -gt 0)
$p01Child = Invoke-ChildValidator -ScriptPath (Join-Path $root 'scripts\validate-p0-01-advertiser-credit-authorization.ps1') -Name 'CHILD_P0_01_ADVERTISER_CREDIT_AUTHORIZATION'; $p01Exit = $p01Child.Exit; $p01 = $p01Child.Text
$p01Ok = ($p01Exit -eq 0) -and (($p01 | Select-String -SimpleMatch 'RESULT: P0_01_ADVERTISER_CREDIT_AUTHORIZATION_PASS').Count -gt 0)
$p02Child = Invoke-ChildValidator -ScriptPath (Join-Path $root 'scripts\validate-p0-02-ai-billing-preauthorization.ps1') -Name 'CHILD_P0_02_AI_BILLING_PREAUTHORIZATION'; $p02Exit = $p02Child.Exit; $p02 = $p02Child.Text
$p02Ok = ($p02Exit -eq 0) -and (($p02 | Select-String -SimpleMatch 'RESULT: P0_02_AI_BILLING_PREAUTHORIZATION_PASS').Count -gt 0)
$c5Child = Invoke-ChildValidator -ScriptPath (Join-Path $root 'scripts\validate-p0-05-r1a1-c5-containment.ps1') -Name 'CHILD_P0_05_R1A1_C5_CONTAINMENT'; $c5Exit = $c5Child.Exit; $c5 = $c5Child.Text
$c5Ok = ($c5Exit -eq 0) -and (($c5 | Select-String -SimpleMatch 'RESULT: P0_05_R1A1_C5_CONTAINMENT_PASS').Count -gt 0)
$r1b1Child = Invoke-ChildValidator -ScriptPath (Join-Path $root 'scripts\validate-p0-05-r1b1-engine-a-latent-vector-neutralization.ps1') -Name 'CHILD_P0_05_R1B1_ENGINE_A_LATENT_VECTOR_NEUTRALIZATION'; $r1b1Exit = $r1b1Child.Exit; $r1b1 = $r1b1Child.Text
$r1b1Ok = ($r1b1Exit -eq 0) -and (($r1b1 | Select-String -SimpleMatch 'RESULT: P0_05_R1B1_ENGINE_A_LATENT_VECTOR_NEUTRALIZATION_PASS').Count -gt 0)
if ($tvOk -and $l1Ok -and $p01Ok -and $p02Ok -and $c5Ok -and $r1b1Ok) { Pass ("prior validators green (tv={0} l1={1} p01={2} p02={3} c5={4} r1b1={5})" -f $tvExit, $l1Exit, $p01Exit, $p02Exit, $c5Exit, $r1b1Exit) } else { Fail ("prior validators (tv={0} l1={1} p01={2} p02={3} c5={4} r1b1={5})" -f $tvExit, $l1Exit, $p01Exit, $p02Exit, $c5Exit, $r1b1Exit) }

Write-Host "=== GATE 3-16. Source-level invariants (schema, loader, mint, versions, billing-off) ==="
$authmod = Get-Content (Join-Path $root 'functions\src\chat\paidChatAuthority.ts') -Raw
$rec = Get-Content (Join-Path $root 'functions\src\chat\canonicalPaidChat\paidChatRecord.ts') -Raw
$rules = Get-Content (Join-Path $root 'infrastructure\firebase\firestore.rules') -Raw
$cst = Get-Content (Join-Path $root 'functions\src\chatSystemNextGen.ts') -Raw
$c5src = Get-Content (Join-Path $root 'functions\src\chat\canonicalDirectChatCallables.ts') -Raw

# G3 /paidChats server-only: canonical collection const present; rules give NO client write/read on /paidChats
$g3_collection = ($rec -match "PAID_CHATS_COLLECTION\s*=\s*'paidChats'")
$g3_noClientWrite = ($rules -notmatch 'match\s+/paidChats') -or ($rules -match 'match\s+/paidChats[^}]*allow\s+write:\s*if\s+false')
$g3 = $g3_collection -and $g3_noClientWrite
# G4 loader exists, takes only paidChatId, loads + validates before minting
$g4 = ($authmod -match 'export\s+async\s+function\s+loadTrustedPaidChatAuthority\s*\(\s*paidChatId:\s*string\s*\)') -and ($authmod -match "collection\(PAID_CHATS_COLLECTION\)") -and ($authmod -match 'validateCanonicalPaidChatRecord\(')
# G5 invalid record rejected (validator throws fail-closed)
$g5 = ($rec -match 'class\s+PaidChatRecordValidationError') -and ($rec -match "code\s*=\s*'failed-precondition'") -and ([regex]::Matches($rec, 'throw\s+new\s+PaidChatRecordValidationError\(')).Count -ge 12
# G6 multiplier ladder validation (canonical commercial set, x1/x4 excluded)
$g6 = ($rec -match 'CANONICAL_AUTHORITY_MULTIPLIER_LADDER.*=\s*\[2,\s*3,\s*5,\s*7,\s*10,\s*20,\s*30,\s*50,\s*70,\s*100\]') -and ($rec -match 'multiplier_not_in_ladder')
# G7 effectiveRate consistency (= base * multiplier)
$g7 = ($rec -match 'baseRateTokens.*\*.*multiplierSnapshot') -and ($rec -match 'effectiveRate_mismatch')
# G8 minimum reservation >= 100
$g8 = ($rec -match 'CANONICAL_MIN_RESERVATION_TOKENS\s*=\s*100') -and ($rec -match 'minimumReservation_below_floor')
# G9 authorityVersion + billingPolicyVersion validation
$g9 = ($rec -match 'authorityVersion_unknown') -and ($rec -match 'billingPolicyVersion_unknown') -and ($rec -match 'KNOWN_AUTHORITY_VERSIONS') -and ($rec -match 'KNOWN_BILLING_POLICY_VERSIONS')
# G10 raw-field mint impossible: no exported factory in the authority module; internal minter takes a validated record
$exportedFactory = ([regex]::Matches($authmod, 'export\s+(?:async\s+)?(?:function|const)\s+\w*(?:[Mm]int|[Cc]reate|[Bb]uild|[Ii]ssue|[Ff]actory|[Mm]ake|[Cc]onstruct)\w*\s*(?:\(|=)'))
$g10 = ($exportedFactory.Count -eq 0) -and ($authmod -notmatch 'export\s+function\s+issueTrustedAuthorityFromValidatedRecord') -and ($authmod -match 'function\s+issueTrustedAuthorityFromValidatedRecord\(rec:\s*CanonicalPaidChatRecord\)')
# G11 EXPORTED_TRUST_FACTORY_COUNT = 0 (same as above, explicit)
$g11 = ($exportedFactory.Count -eq 0)
# G12 LEGITIMATE_AUTHORITY_CONSTRUCTION_PATHS = 1 (exactly one object-literal brand construction, inside the minter)
$brandConstruct = ([regex]::Matches($authmod, '\[TRUSTED_PAID_CHAT_AUTHORITY_BRAND\]:\s*true,'))
$minterCalls = ([regex]::Matches($authmod, 'issueTrustedAuthorityFromValidatedRecord\('))  # 1 definition + 1 call = 2
$g12 = ($brandConstruct.Count -eq 1) -and ($minterCalls.Count -eq 2)
# G13 RAW_FIELD_AUTHORITY_CONSTRUCTION_PATHS = 0 (no other brand construction anywhere in the module)
$g13 = ($brandConstruct.Count -eq 1)
# G14 ACTIVE_CANONICAL_PAID_BILLING_PATH_COUNT = 0: no production (non-test) file outside the module calls the loader
$loaderCallers = @(Get-ChildItem -Path (Join-Path $root 'functions\src') -Recurse -Filter *.ts | Where-Object { $_.FullName -notmatch '__tests__' -and $_.Name -ne 'paidChatAuthority.ts' } | Where-Object { (Get-Content $_.FullName -Raw) -match 'loadTrustedPaidChatAuthority\(' })
$g14 = ($loaderCallers.Count -eq 0)
# G15 sendChatMessage HARD_FAIL_CLOSED (unconditional throw)
$g15 = ($cst -match 'HUMAN_CHAT_BILLING_DISABLED') -and ($cst -match "throw new HttpsError\(\s*[`"']failed-precondition")
# G16 c5 SAFE_UNAVAILABLE (>=15 guards)
$c5guards = ([regex]::Matches($c5src, 'assertC5DirectChatUnavailable\(\);')).Count
$g16 = ($c5guards -ge 15)
$src = @{ G3_paidchats_server_only=$g3; G4_loader_loads_and_validates=$g4; G5_invalid_record_rejected=$g5; G6_multiplier_ladder=$g6; G7_effectiverate_consistency=$g7; G8_min_reservation_100=$g8; G9_version_validation=$g9; G10_raw_field_mint_impossible=$g10; G11_exported_trust_factory_zero=$g11; G12_one_legit_construction_path=$g12; G13_zero_raw_field_construction=$g13; G14_zero_active_billing_path=$g14; G15_sendchatmessage_failclosed=$g15; G16_c5_safe_unavailable=$g16 }
$srcbad = @($src.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($srcbad.Count -eq 0) { Pass ("source invariants: /paidChats server-only (default-deny); loader loads+validates+mints; validator fail-closed; ladder [2..100]; effectiveRate=base*mult; minReservation>=100; version-checked; EXPORTED_TRUST_FACTORY_COUNT=0; LEGITIMATE_AUTHORITY_CONSTRUCTION_PATHS=1; RAW_FIELD_AUTHORITY_CONSTRUCTION_PATHS=0; ACTIVE_CANONICAL_PAID_BILLING_PATH_COUNT=0; sendChatMessage HARD_FAIL_CLOSED; c5 {0} guards SAFE_UNAVAILABLE" -f $c5guards) } else { $srcbad | ForEach-Object { Write-Host "  MISSING: $_" }; Fail 'source-level invariants' }

Write-Host "=== GATE 17. Emulator suites: R1B-2 authority foundation (main) + /paidChats rules ==="
if (-not (Test-Path (Join-Path $fnroot 'node_modules'))) { Fail 'dependencies absent' }
else {
  $m = Invoke-EmulatorSuite 'demo-avalo' 'main' "src/__tests__/$MAIN_FILE" $MAIN_NAMES.Count
  Write-Host ("  main jest --json -> passed={0} failed={1} pending={2} todo={3} total={4} emuExit={5} fresh={6} schema={7}" -f $(if ($m.json) { $m.json.numPassedTests } else { '?' }), $(if ($m.json) { $m.json.numFailedTests } else { '?' }), $(if ($m.json) { $m.json.numPendingTests } else { '?' }), $(if ($m.json) { $m.json.numTodoTests } else { '?' }), $(if ($m.json) { $m.json.numTotalTests } else { '?' }), $m.emuExit, $m.fresh, $m.schema)
  $mq = Test-RequiredNamedRecords $m.records $MAIN_NAMES $MAIN_FILE
  Write-Host ("  main required named records matched={0}/{1} missing=[{2}]" -f $mq.matchedCount, $MAIN_NAMES.Count, ($mq.missing -join '; '))
  if ($m.ok -and $mq.ok) { Pass ("R1B-2 main suite: {0}/{0} named tests passed (positive loader; fail-closed negatives; non-forgeability; zero side effects; billing disabled; messaging intact)" -f $MAIN_NAMES.Count) } else { Fail ("R1B-2 main suite (emuExit={0} fresh={1} schema={2})" -f $m.emuExit, $m.fresh, $m.schema) }

  $r = Invoke-EmulatorSuite 'demo-p0-05-r1b2-rules' 'rules' "tests/rules/$RULES_FILE" $RULES_NAMES.Count
  Write-Host ("  rules jest --json -> passed={0} failed={1} pending={2} todo={3} total={4} emuExit={5} fresh={6} schema={7}" -f $(if ($r.json) { $r.json.numPassedTests } else { '?' }), $(if ($r.json) { $r.json.numFailedTests } else { '?' }), $(if ($r.json) { $r.json.numPendingTests } else { '?' }), $(if ($r.json) { $r.json.numTodoTests } else { '?' }), $(if ($r.json) { $r.json.numTotalTests } else { '?' }), $r.emuExit, $r.fresh, $r.schema)
  $rq = Test-RequiredNamedRecords $r.records $RULES_NAMES $RULES_FILE
  Write-Host ("  rules required named records matched={0}/{1} missing=[{2}]" -f $rq.matchedCount, $RULES_NAMES.Count, ($rq.missing -join '; '))
  if ($r.ok -and $rq.ok) { Pass ("R1B-2 rules suite: {0}/{0} named tests passed (/paidChats client create/update/delete/read all denied; /chats shell intact)" -f $RULES_NAMES.Count) } else { Fail ("R1B-2 rules suite (emuExit={0} fresh={1} schema={2})" -f $r.emuExit, $r.fresh, $r.schema) }
}

Write-Host ""
if ($exit -eq 0) { Write-Host 'CHECKOUT: OFF ; ADVERTISER CREDIT: OFF ; /paidChats: SERVER-OWNED (default-deny) ; AUTHORITY LOADER: validated-record-only (1 legit path, 0 raw-field mint) ; BILLING: DISABLED (0 active paid billing path) ; sendChatMessage DISABLED ; c5 SAFE_UNAVAILABLE ; P0-05 OPEN'; Write-Host 'RESULT: P0_05_R1B2_SERVER_OWNED_PAIDCHAT_AUTHORITY_PASS' }
else { Write-Host 'RESULT: P0_05_R1B2_SERVER_OWNED_PAIDCHAT_AUTHORITY_FAIL' }
exit $exit
