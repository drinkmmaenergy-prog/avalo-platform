#Requires -Version 5.1
<#
  validate-p0-01-advertiser-credit-authorization.ps1  — READ-ONLY, fail-closed.
  P0-01 Advertiser Credit — SAFE UNAVAILABLE CONTAINMENT (R3). The R2 "runtime capability" was NOT a real
  authority boundary: the capability-minting factories (verifyAdminFromClaims, buildVerifiedProviderFundingProof)
  were EXPORTED and accepted a plain object / a Boolean, so any importer could forge admin/provider authority.
  R3 REMOVES the weak factories, the capability Symbol and the private mutation core; every advertiser-credit
  CREATION operation is UNAVAILABLE and throws before any Firestore access, in BOTH feature-flag states.
  PRIMARY authority for this validator is RUNTIME MODULE INSPECTION + BEHAVIORAL emulator tests (not comments).
  Reuses the accepted strict Jest --json parser (schema-aware, current-run temp JSON, distinct named records,
  parser self-tests). On FULL PASS emits (exit 0): P0_01_ADVERTISER_CREDIT_AUTHORIZATION_PASS ; else ..._FAIL (1).
#>
[CmdletBinding()]
param(
  [string]$Repo = '',
  [string]$ExpectedHead = '',
  [string]$ForensicRepo = ''
)
$ErrorActionPreference = 'Continue'
# ── REPOSITORY IDENTITY ────────────────────────────────────────────────────────────────────────────────────
# Identity used to be three hardcoded literals: the authoring worktree path, its previous HEAD, and a second
# "forensic" repository. That made this validator unable to certify anything except the machine it was written
# on - a clean checkout of the very checkpoint it is supposed to bless would fail its own identity gate, or
# silently read the authoring worktree instead. A validator that cannot run against the artifact under review
# is not producing closure evidence.
#
# Identity is now EXPLICIT INPUT with a fail-closed contract, and the mode actually used is printed so nobody
# has to infer which repository was read. The checks are not weakened: an explicit run must still name the
# exact commit it expects, and HEAD must equal it.
$AUTHORING_ROOT     = 'C:\a\avalo-controlled-enablement-clean'
$AUTHORING_FORENSIC = 'C:\a\avalo'
$AUTHORING_HEAD     = '4224fd324ee24e387b189fb9307caa05c9ca1ef0'
if ($Repo) {
  $IDENTITY_MODE = 'EXPLICIT'
  $rp = (Resolve-Path -LiteralPath $Repo -ErrorAction SilentlyContinue)
  if (-not $rp) { Write-Host ("GATE FAIL: -Repo does not resolve: " + $Repo); exit 1 }
  $root = $rp.Path.TrimEnd('\')
  if (-not (Test-Path -LiteralPath (Join-Path $root '.git'))) { Write-Host ("GATE FAIL: -Repo is not a Git repository: " + $root); exit 1 }
  # In explicit mode the expected commit is mandatory. Without it the gate would accept whatever happened to
  # be checked out, which is the opposite of an identity control.
  if (-not ($ExpectedHead -match '^[0-9a-fA-F]{40}$')) { Write-Host 'GATE FAIL: -ExpectedHead must be a 40-hex commit id in explicit mode'; exit 1 }
  $expectHead = $ExpectedHead.ToLowerInvariant()
  # The forensic cross-check is an authoring-worktree control: a second copy whose HEAD must match. It has no
  # meaning against an immutable checkpoint, so it applies only when a forensic root is supplied.
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

# ---- Strict Jest --json helpers (accepted architecture; fail-closed) ----
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
  if (($j -is [string]) -or ($j -is [bool]) -or ($j -is [int]) -or ($j -is [long]) -or ($j -is [double]) -or ($j -is [decimal])) { return @{ ok = $false; reason = 'root_scalar' } }
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
  if ($vtot.Value -lt $minPassed) { return @{ ok = $false; reason = 'total_below_min' } }
  if (($vp.Value + $vf.Value + $vpd.Value + $vt.Value) -ne $vtot.Value) { return @{ ok = $false; reason = 'counts_inconsistent_with_total' } }
  $tr = $j.testResults; if ($null -eq $tr) { return @{ ok = $false; reason = 'testResults_null' } }; if (-not ($tr -is [array])) { return @{ ok = $false; reason = 'testResults_not_array' } }; if (@($tr).Count -eq 0) { return @{ ok = $false; reason = 'testResults_empty' } }
  return @{ ok = $true; reason = 'valid' }
}
function Read-JsonFileStrict([string]$path) {
  if ([string]::IsNullOrEmpty($path) -or -not (Test-Path $path)) { return @{ ok = $false; json = $null; reason = 'file_missing' } }
  $raw = $null; try { $raw = Get-Content -LiteralPath $path -Raw -ErrorAction Stop } catch { return @{ ok = $false; json = $null; reason = 'read_error' } }
  if ($null -eq $raw -or [string]::IsNullOrWhiteSpace($raw)) { return @{ ok = $false; json = $null; reason = 'empty_or_whitespace' } }
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
# Every required exact name must resolve to ONE passed record, and all matched indexes must be DISTINCT.
function Test-RequiredNamedRecords($records, [string[]]$names, [string]$fileSuffix) {
  $matched = @(); $missing = @()
  foreach ($n in $names) { $r = Find-ExactPassed $records $n $fileSuffix; if ($null -eq $r) { $missing += $n } else { $matched += $r } }
  $indexes = @($matched | ForEach-Object { $_.index })
  $distinct = ($missing.Count -eq 0) -and ((@($indexes | Sort-Object -Unique)).Count -eq $names.Count)
  return [pscustomobject]@{ ok = $distinct; missing = $missing; matchedCount = $matched.Count; indexes = ($indexes -join ',') }
}
function New-FakeJest([object[]]$asserts, $success = $true, $numFailed = 0, $numPending = 0, $numTodo = 0, $numTotal = $null) {
  $byFile = @{}; foreach ($a in $asserts) { $f = [string]$a.file; if (-not $byFile.ContainsKey($f)) { $byFile[$f] = New-Object System.Collections.Generic.List[object] }; $byFile[$f].Add([pscustomobject]@{ fullName = $a.fullName; title = $a.fullName; status = $a.status }) }
  $tr = @(); foreach ($f in $byFile.Keys) { $tr += [pscustomobject]@{ name = $f; assertionResults = $byFile[$f].ToArray() } }
  $np = @($asserts | Where-Object { $_.status -eq 'passed' }).Count; $tot = if ($null -ne $numTotal) { $numTotal } else { $np + $numFailed + $numPending + $numTodo }
  return [pscustomobject]@{ success = $success; numPassedTests = $np; numFailedTests = $numFailed; numPendingTests = $numPending; numTodoTests = $numTodo; numTotalTests = $tot; testResults = $tr }
}
# Runs a jest suite under the Firestore emulator into a current-run temp JSON, returns strict-parse result + records.
function Invoke-EmulatorSuite([string]$project, [string]$selectProject, [string]$relTestPath, [long]$minPassed) {
  $jsonDir = Join-Path ([System.IO.Path]::GetTempPath()) ('avalo-p0-01-' + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Force -Path $jsonDir | Out-Null
  $jsonPath = Join-Path $jsonDir 'suite.json'
  $runStart = Get-Date
  $jscript = "cd functions && node node_modules/jest/bin/jest.js --selectProjects $selectProject --runInBand --json --outputFile `"$jsonPath`" --runTestsByPath $relTestPath"
  Push-Location $root
  $emuLog = Join-Path $jsonDir 'emu.log'
  & firebase emulators:exec --only firestore --project $project $jscript *> $emuLog
  $emuExit = $LASTEXITCODE
  Pop-Location
  if (-not (Get-Command Test-EmulatorLifecycleHealthy -ErrorAction SilentlyContinue)) { . (Join-Path $root 'scripts\lib\EmulatorLifecycle.ps1') }
  $lifeReason = ''; $lifeOk = Test-EmulatorLifecycleHealthy -CliExit $emuExit -LogPath $emuLog -Reason ([ref]$lifeReason)
  $existsAfter = Test-Path $jsonPath
  $writeTime = if ($existsAfter) { (Get-Item $jsonPath).LastWriteTime } else { $null }
  $freshOk = Test-CurrentRunFile $false $existsAfter $writeTime $runStart
  $rd = Read-JsonFileStrict $jsonPath
  $sres = if ($rd.ok) { Test-JsonSummaryStrict $rd.json $minPassed } else { @{ ok = $false; reason = $rd.reason } }
  $records = if ($rd.ok) { Get-JestAssertionRecords $rd.json } else { @() }
  $res = [pscustomobject]@{ ok = $lifeOk -and $freshOk -and $rd.ok -and $sres.ok; emuExit = $emuExit; life = $lifeReason; fresh = $freshOk; rdOk = $rd.ok; schema = $sres.reason; json = $(if ($rd.ok) { $rd.json } else { $null }); records = $records }
  try { Remove-Item -Recurse -Force -LiteralPath $jsonDir -ErrorAction Stop } catch { Write-Host ("  (cleanup note: {0})" -f $jsonDir) }
  return $res
}

# ---- P0-01 R3 exact required named tests + files + allowlist ----
$P01_FILE = 'p0-01-advertiser-credit-authorization.test.ts'
$P01_NAMES = @(
  'p0-01 R3: weak admin proof factory is not exported',
  'p0-01 R3: weak provider proof factory is not exported',
  'p0-01 R3: no exported functioning advertiser credit operation remains',
  'p0-01: unauthenticated-scope advertiser credit mint is retired (callable hard-disabled and unexported)',
  'p0-01 R3: advertiser credit remains unavailable when feature flag is OFF',
  'p0-01 R3: advertiser credit remains unavailable when feature flag is ON',
  'p0-01: server-only advertiser credit is disabled by default (kill switch OFF)',
  'p0-01 R3: arbitrary decoded-token-shaped object cannot create advertiser authority',
  'p0-01 R3: arbitrary verified-adapter-shaped object cannot create provider authority',
  'p0-01 R3: retired advertiser credit operations perform zero Firestore writes'
)
$RULES_FILE = 'p0-01-advertiser-credit-rules.test.ts'
$RULES_NAMES = @(
  'p0-01 R3 rules: client cannot create advertisers doc with tokenBalance',
  'p0-01 R3 rules: client cannot update advertiser tokenBalance',
  'p0-01 R3 rules: client cannot create advertiserCreditLedger doc',
  'p0-01 R3 rules: client cannot update advertiserCreditLedger doc',
  'p0-01 R3 rules: client cannot delete advertiserCreditLedger doc',
  'p0-01 R3 rules: client cannot create advertiserCreditBarriers doc',
  'p0-01 R3 rules: client cannot update advertiserCreditBarriers doc',
  'p0-01 R3 rules: client cannot create adRefunds doc',
  'p0-01 R3 rules: client cannot create adTransactions (funding/reversal) doc',
  'p0-01 R3 rules: client cannot modify another advertiser campaign financial fields'
)
$P01_ALLOW = @(
  'functions/src/index.ts',
  'functions/src/pack349-endpoints.ts',
  'functions/src/pack349-billing.ts',
  'functions/src/__tests__/p0-01-advertiser-credit-authorization.test.ts',
  'functions/tests/rules/p0-01-advertiser-credit-rules.test.ts',
  'scripts/validate-p0-01-advertiser-credit-authorization.ps1'
)

Write-Host "=== 1. Identity + zero staged ==="
$top = (& git -C $root rev-parse --show-toplevel) 2>$null; $head = (& git -C $root rev-parse HEAD) 2>$null; $sym = (& git -C $root symbolic-ref -q HEAD) 2>$null; $fhead = (& git -C $forensic rev-parse HEAD) 2>$null
$staged = @(& git -C $root diff --cached --name-only | Where-Object { $_.Trim() -ne '' }).Count
if ((($top -replace '\\','/') -eq ($root -replace '\\','/')) -and $head -eq $expectHead -and -not $sym -and ($(if ($forensic) { $fhead -eq $expectHead } else { $true })) -and $staged -eq 0) { Pass "identity + detached HEAD + forensic untouched + staged=0" } else { Fail ("identity/staged (staged={0})" -f $staged) }

# ---- child validator invocation (file-redirected, persisted) ---------------------------------------------
# NEVER `*>&1` into a variable: that tangles the stdio of the `firebase emulators:exec` processes the child
# spawns, so its nested suites can silently fail and its markers never appear - the failure mode
# validate-p0-iam-01a documents and avoids by redirecting to a file. The transcript is also EVIDENCE: it is
# written to a run-scoped directory, hashed, and never deleted, so a failing child can be diagnosed instead
# of being reported as a bare non-zero exit.
$CHILD_EVIDENCE_DIR = Join-Path $env:TEMP ('avalo-iam-child-evidence\' + 'p0-01-advertiser-credit-authorization' + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $PID)
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

Write-Host "=== 2. Prior accepted validators still green (transition + Layer 1) ==="
$tvChild = Invoke-ChildValidator -ScriptPath (Join-Path $root 'scripts\validate-clean-worktree-layer0-support.ps1') -Name 'CHILD_CLEAN_WORKTREE_LAYER0_SUPPORT'; $tvExit = $tvChild.Exit; $tv = $tvChild.Text
$tvOk = ($tvExit -eq 0) -and (($tv | Select-String -SimpleMatch 'RESULT: CLEAN_WORKTREE_LAYER0_TO_LAYER1_TRANSITION_CONTRACT_PASS').Count -gt 0)
$l1Child = Invoke-ChildValidator -ScriptPath (Join-Path $root 'scripts\validate-clean-worktree-layer1-payment-foundation-and-p0-04.ps1') -Name 'CHILD_CLEAN_WORKTREE_LAYER1_PAYMENT_FOUNDATION_AND_P0_04'; $l1Exit = $l1Child.Exit; $l1 = $l1Child.Text
$l1Ok = ($l1Exit -eq 0) -and (($l1 | Select-String -SimpleMatch 'RESULT: CLEAN_WORKTREE_LAYER1_PAYMENT_FOUNDATION_AND_P0_04_PASS').Count -gt 0)
if ($tvOk -and $l1Ok) { Pass ("transition exit {0} + Layer 1 exit {1}, both markers" -f $tvExit, $l1Exit) } else { Fail ("prior validators (tvExit={0} l1Exit={1})" -f $tvExit, $l1Exit) }

Write-Host "=== 3. Changed-file allowlist (P0-01 changes subset of accepted+P0-01) ==="
$changed = @(); foreach ($l in @(& git -C $root status --short -uall)) { if ($l.Length -gt 3) { $changed += ($l.Substring(3).Trim() -replace '\\', '/') } }
$p01Changed = @($changed | Where-Object { $_ -match 'pack349|p0-01-advertiser|validate-p0-01' })
$outside = @($p01Changed | Where-Object { $_ -notin $P01_ALLOW })
if ($outside.Count -eq 0) { Pass ("P0-01 changed files within allowlist ({0})" -f ($p01Changed -join ', ')) } else { $outside | ForEach-Object { Write-Host "  OUTSIDE: $_" }; Fail 'P0-01 allowlist' }

Write-Host "=== 4. No package/lock drift; no forbidden path in P0-01 change ==="
# The active rules file must NOT be modified by P0-01 (default-deny already covers advertiser-financial writes).
$forbiddenHit = @($changed | Where-Object { $_ -match 'firestore\.rules$|storage\.rules$|firebase\.json$|\.firebaserc$|^infrastructure/firebase/|pnpm-lock|yarn\.lock' })
$pkgHit = @($p01Changed | Where-Object { $_ -match 'package\.json$|package-lock\.json$' })
if ($forbiddenHit.Count -eq 0 -and $pkgHit.Count -eq 0) { Pass 'no forbidden/package path in P0-01 change' } else { $forbiddenHit | ForEach-Object { Write-Host "  FORBIDDEN: $_" }; Fail 'forbidden/package drift' }

Write-Host "=== 5. Unsafe export retired + no commented bypass + no unsafe billing call ==="
$indexSrc = Get-Content (Join-Path $fnroot 'src\index.ts') -Raw
$idxBlock = ([regex]::Match($indexSrc, "export\s*\{([\s\S]*?)\}\s*from\s*'\./pack349-endpoints'")).Groups[1].Value
$idxNames = @(); foreach ($ln in ($idxBlock -split "`n")) { foreach ($tok in (($ln -replace '//.*$', '') -split ',')) { $t = $tok.Trim(); if ($t -match '^[A-Za-z_][A-Za-z0-9_]*$') { $idxNames += $t } } }
$notExported = ($idxNames -notcontains 'addAdvertiserTokens')
$epSrc = Get-Content (Join-Path $fnroot 'src\pack349-endpoints.ts') -Raw
$epStart = $epSrc.IndexOf('export const addAdvertiserTokens'); $epEnd = $epSrc.IndexOf('createCreatorSponsorship', $epStart + 1)
$epBody = if ($epStart -ge 0 -and $epEnd -gt $epStart) { $epSrc.Substring($epStart, $epEnd - $epStart) } else { '' }
$noBypass = ($epBody.Length -gt 0) -and ($epBody -notmatch 'TODO: Check if user is admin') -and ($epBody -notmatch 'AdBillingEngine\.addTokens\(') -and ($epBody -match "failed-precondition")
if ($notExported -and $noBypass) { Pass 'addAdvertiserTokens UNEXPORTED + endpoint hard-disabled (no commented bypass, no addTokens call)' } else { Fail ("unsafe export/bypass (notExported={0} noBypass={1})" -f $notExported, $noBypass) }

Write-Host "=== 6. R3 SAFE UNAVAILABLE CONTAINMENT: weak factories + capability + core removed; ops unavailable ==="
# Source-level SECONDARY signal only. PRIMARY authority = runtime export/behavioral tests (gates 9 + 9r).
# Comments are NOT allowed to satisfy retirement/removal: absence checks target definitions, not name mentions.
$billSrc = Get-Content (Join-Path $fnroot 'src\pack349-billing.ts') -Raw
$noWeakAdminFactory   = ($billSrc -notmatch 'function verifyAdminFromClaims')                 # factory definition removed
$noWeakProviderFactory= ($billSrc -notmatch 'function buildVerifiedProviderFundingProof')     # factory definition removed
$noCapabilitySymbol   = ($billSrc -notmatch "Symbol\('advertiser-finance-capability'\)") -and ($billSrc -notmatch 'ADVERTISER_FINANCE_CAP')
$noPrivateCore        = ($billSrc -notmatch 'creditAdvertiserCore')                            # private mutation core removed
$noBooleanProvenance  = ($billSrc -notmatch 'verifiedByTrustedAdapter')                        # no Boolean "verified" provenance
$genericRetired       = ($billSrc -match 'generic_credit_primitive_retired')
$adminUnavailable     = ($billSrc -match "AdvertiserCreditUnavailableError\('ADVERTISER_ADMIN_ADJUSTMENT'\)")
$providerUnavailable  = ($billSrc -match "AdvertiserCreditUnavailableError\('ADVERTISER_PROVIDER_FUNDING'\)")
$reversalUnavailable  = ($billSrc -match "AdvertiserCreditUnavailableError\('ADVERTISER_SPEND_REVERSAL'\)")
$unavailReturnsNever  = ($billSrc -match 'static async applyVerifiedAdvertiserAdminAdjustment\(\): Promise<never>') -and ($billSrc -match 'static async completeVerifiedAdvertiserFunding\(proof[^)]*\): Promise<never>|static async completeVerifiedAdvertiserFunding\(\): Promise<never>') -and ($billSrc -match 'static async applyVerifiedAdvertiserSpendReversal\(\): Promise<never>')
$hasKill              = ($billSrc -match "ADVERTISER_CREDIT_ENABLED_ENV\s*=\s*'ADVERTISER_CREDIT_ENABLED'")
$legacyRetired        = ($billSrc -match 'addTokens_retired') -and ($billSrc -match 'refundTokens_retired')
$noUserWallet         = ($billSrc -notmatch "collection\('wallets'\)") -and ($billSrc -notmatch "collection\('creator_earnings'\)") -and ($billSrc -notmatch "collection\('payouts'\)")
$noExportedCapType    = ($billSrc -notmatch 'export (interface|type) Verified')
$g6 = @{ noWeakAdminFactory=$noWeakAdminFactory; noWeakProviderFactory=$noWeakProviderFactory; noCapabilitySymbol=$noCapabilitySymbol; noPrivateCore=$noPrivateCore; noBooleanProvenance=$noBooleanProvenance; genericRetired=$genericRetired; adminUnavailable=$adminUnavailable; providerUnavailable=$providerUnavailable; reversalUnavailable=$reversalUnavailable; unavailReturnsNever=$unavailReturnsNever; hasKill=$hasKill; legacyRetired=$legacyRetired; noUserWallet=$noUserWallet; noExportedCapType=$noExportedCapType }
$g6bad = @($g6.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($g6bad.Count -eq 0) { Pass 'CONTAINED: weak admin/provider factories + capability Symbol + private core removed; ops unavailable (throw before DB); legacy retired; no adjacent-domain writes' }
else { $g6bad | ForEach-Object { Write-Host "  MISSING CONTROL: $_" }; Fail 'R3 containment controls' }

Write-Host "=== 6r. Firestore rules deny client advertiser-financial writes (config proof + default-deny; no rules change) ==="
$fbJson = Get-Content (Join-Path $root 'firebase.json') -Raw
$activeRulesConfigured = ($fbJson -match '"rules":\s*"infrastructure/firebase/firestore\.rules"')
$rulesSrc = Get-Content (Join-Path $root 'infrastructure\firebase\firestore.rules') -Raw
$noAdvMatch = ($rulesSrc -notmatch 'match /advertisers/') -and ($rulesSrc -notmatch 'match /advertiserCreditLedger') -and ($rulesSrc -notmatch 'match /advertiserCreditBarriers') -and ($rulesSrc -notmatch 'match /adTransactions') -and ($rulesSrc -notmatch 'match /adRefunds')
$noRootCatchAll = ($rulesSrc -notmatch '(?m)^    match /\{document=\*\*\}') -and ($rulesSrc -notmatch '(?m)^    match /\{path=\*\*\}')
if ($activeRulesConfigured -and $noAdvMatch -and $noRootCatchAll) { Pass 'firebase.json points at infrastructure/firebase/firestore.rules; advertiser-financial collections have no client-write rule + no root catch-all => default DENY' } else { Fail ("rules (config={0} noAdvMatch={1} noRootCatchAll={2})" -f $activeRulesConfigured, $noAdvMatch, $noRootCatchAll) }

Write-Host "=== 7. Advertiser credit kill switch OFF (no source enables it) ==="
$enableHit = $false
foreach ($rel in @('functions/src/pack349-billing.ts', 'functions/src/pack349-endpoints.ts', 'functions/src/index.ts')) { $p = Join-Path $root ($rel -replace '/', '\'); $txt = Get-Content $p -Raw; if ($txt -match "ADVERTISER_CREDIT_ENABLED\s*=\s*'true'") { $enableHit = $true } }
if (-not $enableHit) { Pass 'advertiser promotional/funding credit remains OFF (fail-closed default)' } else { Fail 'advertiser credit enabled in source' }

Write-Host "=== 8. PARSER SELF-TESTS (schema + distinct named-record, fail-closed) ==="
$goodRecs = @(); foreach ($n in $P01_NAMES) { $goodRecs += @{ file = "src/__tests__/$P01_FILE"; fullName = $n; status = 'passed' } }
$selfTotal = 0; $selfPass = 0; $selfFail = @()
$selfTotal++; $r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest $goodRecs)) $P01_NAMES $P01_FILE; if ($r.ok) { $selfPass++ } else { $selfFail += 'POS all-names' }
$selfTotal++; $r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest ($goodRecs | Select-Object -Skip 1))) $P01_NAMES $P01_FILE; if (-not $r.ok) { $selfPass++ } else { $selfFail += 'neg missing-one' }
$combined = @(@{ file = "src/__tests__/$P01_FILE"; fullName = ($P01_NAMES -join ' AND '); status = 'passed' }); $selfTotal++; $r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest $combined)) $P01_NAMES $P01_FILE; if (-not $r.ok) { $selfPass++ } else { $selfFail += 'neg combined-title' }
$skipped = @(); foreach ($n in $P01_NAMES) { $skipped += @{ file = "src/__tests__/$P01_FILE"; fullName = $n; status = 'skipped' } }; $selfTotal++; $r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest $skipped)) $P01_NAMES $P01_FILE; if (-not $r.ok) { $selfPass++ } else { $selfFail += 'neg skipped' }
$wrongFile = @(); foreach ($n in $P01_NAMES) { $wrongFile += @{ file = 'src/__tests__/other.test.ts'; fullName = $n; status = 'passed' } }; $selfTotal++; $r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest $wrongFile)) $P01_NAMES $P01_FILE; if (-not $r.ok) { $selfPass++ } else { $selfFail += 'neg wrong-file' }
function _B { return [pscustomobject]@{ success = $true; numPassedTests = [long]10; numFailedTests = [long]0; numPendingTests = [long]0; numTodoTests = [long]0; numTotalTests = [long]10; testResults = @([pscustomobject]@{ name = 'x'; assertionResults = @() }) } }
function _wo($o, $n) { $h = [ordered]@{}; foreach ($p in $o.PSObject.Properties) { if ($p.Name -ne $n) { $h[$p.Name] = $p.Value } }; return [pscustomobject]$h }
function _wi($o, $n, $v) { $h = [ordered]@{}; foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = $p.Value }; $c = [pscustomobject]$h; $c.$n = $v; return $c }
$schemaFix = @(
  @{ n = 'schema POS'; j = (_B); ok = $true }, @{ n = 'schema missing numFailedTests'; j = (_wo (_B) 'numFailedTests'); ok = $false },
  @{ n = 'schema null numTodoTests'; j = (_wi (_B) 'numTodoTests' $null); ok = $false }, @{ n = 'schema success=1'; j = (_wi (_B) 'success' 1); ok = $false },
  @{ n = 'schema failed>0'; j = (_wi (_wi (_B) 'numFailedTests' ([long]1)) 'numTotalTests' ([long]11)); ok = $false }, @{ n = 'schema string count'; j = (_wi (_B) 'numPassedTests' '10'); ok = $false },
  @{ n = 'schema root scalar'; j = ([long]5); ok = $false }, @{ n = 'schema inconsistent total'; j = (_wi (_B) 'numTotalTests' ([long]99)); ok = $false }
)
foreach ($fx in $schemaFix) { $selfTotal++; if ((Test-JsonSummaryStrict $fx.j 10).ok -eq $fx.ok) { $selfPass++ } else { $selfFail += $fx.n } }
Write-Host ("  parser self-tests: {0}/{1}" -f $selfPass, $selfTotal); if ($selfFail.Count -gt 0) { $selfFail | ForEach-Object { Write-Host "  SELF-TEST FAIL: $_" } }
$selfOk = ($selfPass -eq $selfTotal)
if ($selfOk) { Pass ("parser self-tests all pass ({0})" -f $selfTotal) } else { Fail 'parser self-tests' }

Write-Host "=== 9. Emulator-backed P0-01 containment suite (main) via Jest --json + distinct exact named records ==="
if (-not (Test-Path (Join-Path $fnroot 'node_modules'))) { Fail 'dependencies absent' }
elseif (-not $selfOk) { Fail 'skipping real run: parser self-tests failed' }
else {
  $m = Invoke-EmulatorSuite 'demo-avalo' 'main' "src/__tests__/$P01_FILE" 10
  Write-Host ("  main jest --json -> passed={0} failed={1} pending={2} todo={3} total={4} emuExit={5} fresh={6} schema={7}" -f $(if ($m.rdOk) { $m.json.numPassedTests } else { '?' }), $(if ($m.rdOk) { $m.json.numFailedTests } else { '?' }), $(if ($m.rdOk) { $m.json.numPendingTests } else { '?' }), $(if ($m.rdOk) { $m.json.numTodoTests } else { '?' }), $(if ($m.rdOk) { $m.json.numTotalTests } else { '?' }), $m.emuExit, $m.fresh, $m.schema)
  if ($m.ok) { Pass 'P0-01 containment suite: strict schema valid, current-run temp JSON' } else { Fail ("P0-01 containment suite (emuExit={0} fresh={1} schema={2})" -f $m.emuExit, $m.fresh, $m.schema) }
  $rq = Test-RequiredNamedRecords $m.records $P01_NAMES $P01_FILE
  Write-Host ("  required named records matched={0}/{1} distinctIndexes=[{2}] missing=[{3}]" -f $rq.matchedCount, $P01_NAMES.Count, $rq.indexes, ($rq.missing -join '; '))
  if ($rq.ok -and $m.ok) { Pass ("all {0} required exact P0-01 R3 named tests executed+passed as distinct records" -f $P01_NAMES.Count) } else { Fail 'required P0-01 named records' }
}

Write-Host "=== 9r. Emulator-backed Firestore RULES denial suite (rules) via Jest --json + distinct named records ==="
if (-not (Test-Path (Join-Path $fnroot 'node_modules'))) { Fail 'dependencies absent (rules)' }
elseif (-not $selfOk) { Fail 'skipping rules run: parser self-tests failed' }
else {
  $rr = Invoke-EmulatorSuite 'demo-p0-01-rules' 'rules' "tests/rules/$RULES_FILE" 10
  Write-Host ("  rules jest --json -> passed={0} failed={1} pending={2} todo={3} total={4} emuExit={5} fresh={6} schema={7}" -f $(if ($rr.rdOk) { $rr.json.numPassedTests } else { '?' }), $(if ($rr.rdOk) { $rr.json.numFailedTests } else { '?' }), $(if ($rr.rdOk) { $rr.json.numPendingTests } else { '?' }), $(if ($rr.rdOk) { $rr.json.numTodoTests } else { '?' }), $(if ($rr.rdOk) { $rr.json.numTotalTests } else { '?' }), $rr.emuExit, $rr.fresh, $rr.schema)
  if ($rr.ok) { Pass 'Rules denial suite: strict schema valid, current-run temp JSON' } else { Fail ("Rules denial suite (emuExit={0} fresh={1} schema={2})" -f $rr.emuExit, $rr.fresh, $rr.schema) }
  $rrq = Test-RequiredNamedRecords $rr.records $RULES_NAMES $RULES_FILE
  Write-Host ("  required rules named records matched={0}/{1} distinctIndexes=[{2}] missing=[{3}]" -f $rrq.matchedCount, $RULES_NAMES.Count, $rrq.indexes, ($rrq.missing -join '; '))
  if ($rrq.ok -and $rr.ok) { Pass ("all {0} required Firestore-rules denial tests executed+passed as distinct records" -f $RULES_NAMES.Count) } else { Fail 'required rules denial named records' }
}

Write-Host ""
if ($exit -eq 0) { Write-Host 'CHECKOUT: OFF ; ADVERTISER CREDIT: OFF (fail-closed) ; PROVIDER FUNDING / ADMIN ADJUSTMENT / SPEND REVERSAL: UNAVAILABLE'; Write-Host 'RESULT: P0_01_ADVERTISER_CREDIT_AUTHORIZATION_PASS' }
else { Write-Host 'RESULT: P0_01_ADVERTISER_CREDIT_AUTHORIZATION_FAIL' }
exit $exit
