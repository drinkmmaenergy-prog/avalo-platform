#Requires -Version 5.1
<#
  validate-p0-05-r1b1-engine-a-latent-vector-neutralization.ps1 — READ-ONLY, fail-closed. (pwsh 7+.)
  P0-05 R1B-1 — source-level neutralization of the latent ENGINE_A financial vector. canonical-chat-engine.processMessage
  must require a NON-FORGEABLE server-owned TrustedPaidChatAuthority before any financial mutation, and derive
  payer/earner from it (never from client-forgeable /chats). Emulator adversarial tests prove forged /chats -> zero
  financial effect even when processMessage / the legacy shim are invoked directly. sendChatMessage stays
  HARD_FAIL_CLOSED. On FULL PASS (exit 0): P0_05_R1B1_ENGINE_A_LATENT_VECTOR_NEUTRALIZATION_PASS ; else ..._FAIL (1).
  P0-05 remains OPEN (billing not re-enabled).
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

# ---- Strict Jest --json helpers ----
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
function New-FakeJest([object[]]$asserts, $numFailed = 0, $numPending = 0, $numTodo = 0) {
  $byFile = @{}; foreach ($a in $asserts) { $f = [string]$a.file; if (-not $byFile.ContainsKey($f)) { $byFile[$f] = New-Object System.Collections.Generic.List[object] }; $byFile[$f].Add([pscustomobject]@{ fullName = $a.fullName; title = $a.fullName; status = $a.status }) }
  $tr = @(); foreach ($f in $byFile.Keys) { $tr += [pscustomobject]@{ name = $f; assertionResults = $byFile[$f].ToArray() } }
  $np = @($asserts | Where-Object { $_.status -eq 'passed' }).Count
  return [pscustomobject]@{ success = $true; numPassedTests = $np; numFailedTests = $numFailed; numPendingTests = $numPending; numTodoTests = $numTodo; numTotalTests = ($np + $numFailed + $numPending + $numTodo); testResults = $tr }
}
function Invoke-EmulatorSuite([string]$project, [string]$selectProject, [string]$relTestPath, [long]$minPassed) {
  $jsonDir = Join-Path ([System.IO.Path]::GetTempPath()) ('avalo-p0-05-r1b1-' + [guid]::NewGuid().ToString())
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
  $res = [pscustomobject]@{ ok = $lifeOk -and $freshOk -and $rd.ok -and $sres.ok; emuExit = $emuExit; life = $lifeReason; fresh = $freshOk; schema = $sres.reason; json = $(if ($rd.ok) { $rd.json } else { $null }); records = $records }
  try { Remove-Item -Recurse -Force -LiteralPath $jsonDir -ErrorAction Stop } catch { }
  return $res
}

$R1B1_FILE = 'p0-05-r1b1-engine-a-latent-vector-neutralization.test.ts'
$R1B1_NAMES = @(
  'p0-05 r1b1: paidChatAuthority module exports NO mint/create/build/issue factory',
  'p0-05 r1b1: raw /chats-shaped fields cannot become a trusted authority',
  'p0-05 r1b1: TypeScript cast cannot bypass runtime brand',
  'p0-05 r1b1: serialized/cloned/spread authority-shaped data is not trusted',
  'p0-05 r1b1: direct processMessage with forged payer fails closed and debits nobody',
  'p0-05 r1b1: forged earner cannot receive value',
  'p0-05 r1b1: forged PAID_ACTIVE + paidSession + huge multiplier are financially inert',
  'p0-05 r1b1: arbitrary unrelated victim cannot be debited (not a participant relationship)',
  'p0-05 r1b1: forged group chat with paid fields is financially inert',
  'p0-05 r1b1: replay with same and fresh messageId cannot drain',
  'p0-05 r1b1: parallel forged calls cannot drain',
  'p0-05 r1b1: legacy shim (shimProcessMessageBilling) fails closed without trusted authority',
  'p0-05 r1b1: sendChatMessage remains HARD_FAIL_CLOSED (billing disabled, no env/flag bypass)',
  'p0-05 r1b1: future accidental rewire fixture stays safe (direct processMessage on forged doc, no authority)',
  'p0-05 r1b1: general /chats DM/group shell docs can still be created and read'
)
$R1B1_ALLOW = @(
  'functions/src/canonical-chat-engine.ts',
  'functions/src/chat/paidChatAuthority.ts',
  'functions/src/__tests__/p0-05-r1b1-engine-a-latent-vector-neutralization.test.ts',
  'scripts/validate-p0-05-r1b1-engine-a-latent-vector-neutralization.ps1'
)

Write-Host "=== GATE 1. Identity + zero staged + bounded scope ==="
$top = (& git -C $root rev-parse --show-toplevel) 2>$null; $head = (& git -C $root rev-parse HEAD) 2>$null; $sym = (& git -C $root symbolic-ref -q HEAD) 2>$null; $fhead = (& git -C $forensic rev-parse HEAD) 2>$null
$staged = @(& git -C $root diff --cached --name-only | Where-Object { $_.Trim() -ne '' }).Count
$changed = @(); foreach ($l in @(& git -C $root status --short -uall)) { if ($l.Length -gt 3) { $changed += ($l.Substring(3).Trim() -replace '\\', '/') } }
$r1b1Changed = @($changed | Where-Object { $_ -match 'canonical-chat-engine\.ts|paidChatAuthority|p0-05-r1b1|validate-p0-05-r1b1' })
$outside = @($r1b1Changed | Where-Object { $_ -notin $R1B1_ALLOW })
$runtimeChanged = @($r1b1Changed | Where-Object { $_ -match '^functions/src/' -and $_ -notmatch '__tests__' })
$pkgHit = @($r1b1Changed | Where-Object { $_ -match 'package\.json$|package-lock\.json$|pnpm-lock|yarn\.lock' })
$idOk = ((($top -replace '\\','/') -eq ($root -replace '\\','/')) -and $head -eq $expectHead -and -not $sym -and ($(if ($forensic) { $fhead -eq $expectHead } else { $true })) -and $staged -eq 0)
if ($idOk -and $outside.Count -eq 0 -and $runtimeChanged.Count -le 8 -and $pkgHit.Count -eq 0) { Pass ("identity + staged=0 + R1B-1 diff within allowlist (runtime files={0})" -f $runtimeChanged.Count) } else { $outside | ForEach-Object { Write-Host "  OUTSIDE: $_" }; Fail ("identity/diff (staged={0} runtime={1} pkg={2})" -f $staged, $runtimeChanged.Count, $pkgHit.Count) }

# ---- child validator invocation (file-redirected, persisted) ---------------------------------------------
# NEVER `*>&1` into a variable: that tangles the stdio of the `firebase emulators:exec` processes the child
# spawns, so its nested suites can silently fail and its markers never appear - the failure mode
# validate-p0-iam-01a documents and avoids by redirecting to a file. The transcript is also EVIDENCE: it is
# written to a run-scoped directory, hashed, and never deleted, so a failing child can be diagnosed instead
# of being reported as a bare non-zero exit.
$CHILD_EVIDENCE_DIR = Join-Path $env:TEMP ('avalo-iam-child-evidence\' + 'p0-05-r1b1-engine-a-latent-vector-neutralization' + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $PID)
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

Write-Host "=== GATE 2. Prior closure validators green ==="
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
if ($tvOk -and $l1Ok -and $p01Ok -and $p02Ok -and $c5Ok) { Pass ("prior validators green (tv={0} l1={1} p01={2} p02={3} c5={4})" -f $tvExit, $l1Exit, $p01Exit, $p02Exit, $c5Exit) } else { Fail ("prior validators (tv={0} l1={1} p01={2} p02={3} c5={4})" -f $tvExit, $l1Exit, $p01Exit, $p02Exit, $c5Exit) }

Write-Host "=== GATE 3-4,11-13,15. Source-level invariants ==="
$eng = Get-Content (Join-Path $root 'functions\src\canonical-chat-engine.ts') -Raw
$authmod = Get-Content (Join-Path $root 'functions\src\chat\paidChatAuthority.ts') -Raw
$cst = Get-Content (Join-Path $root 'functions\src\chatSystemNextGen.ts') -Raw
$c5src = Get-Content (Join-Path $root 'functions\src\chat\canonicalDirectChatCallables.ts') -Raw
# G3 sendChatMessage HARD_FAIL_CLOSED (unconditional throw; no env/flag gate before it)
$g3 = ($cst -match "HUMAN_CHAT_BILLING_DISABLED") -and ($cst -match "throw new HttpsError\(\s*[`"']failed-precondition")
# G4 processMessage requires authority + derives payer/earner from authority
$g4 = ($eng -match "requirePaidChatAuthority\(authority\)") -and ($eng -match "capturedPayerId = auth\.payerId") -and ($eng -notmatch "db\.collection\('wallets'\)\.doc\(chat\.roles\.payerId\)")
# G11 non-forgeable capability (module-private symbol; guard checks brand not data)
$g11 = ($authmod -match "const TRUSTED_PAID_CHAT_AUTHORITY_BRAND") -and ($authmod -match "unique symbol") -and ($authmod -match "\[TRUSTED_PAID_CHAT_AUTHORITY_BRAND\] === true")
# G11-R2 EXPORTED_TRUST_FACTORY_COUNT = 0: paidChatAuthority exports NO mint/create/build/issue/factory function.
$exportedFactory = ([regex]::Matches($authmod, 'export\s+(?:async\s+)?(?:function|const)\s+\w*(?:[Mm]int|[Cc]reate|[Bb]uild|[Ii]ssue|[Ff]actory|[Mm]ake|[Cc]onstruct)\w*\s*(?:\(|=)'))
$g11r2 = ($exportedFactory.Count -eq 0) -and ($authmod -notmatch 'export function mintTrustedPaidChatAuthority')
# G11b PRODUCTION RAW-FIELD MINT / MINT-CALL = 0 repo-wide (no code constructs trusted authority anywhere in prod).
# --untracked is REQUIRED: the P0-05 runtime sources are untracked in this detached-HEAD worktree, so a tracked-only
# `git grep` matches zero files and this repo-wide mint-reachability gate would be vacuous (silent false-negative).
# .gitignore still applies. Adjudicated per LINE: comment-only lines are documentation of the REMOVED R1 factory, not a
# reference; any real production reference (import / call) is never a comment line and still fails the gate.
$mintRefs = @(@(& git -C $root grep --untracked -n -e 'mintTrustedPaidChatAuthority' -- 'functions/src' 'app-web/src' 'app-mobile' 2>$null) |
  ForEach-Object { [regex]::Match($_, '^(?<f>[^:]+):(?<n>\d+):(?<c>.*)$') } |
  Where-Object { $_.Success -and ($_.Groups['f'].Value -notmatch '__tests__|\.test\.') -and ($_.Groups['c'].Value -notmatch '^\s*(//|\*|/\*)') } |
  ForEach-Object { $_.Groups['f'].Value } | Sort-Object -Unique)
$g11b = ($mintRefs.Count -eq 0)
# G12 no untrusted ENGINE_A chat transactTokens (guard precedes; actor from auth)
$g12 = ($eng -match "actorId: capturedPayerId") -and ($eng -match "const auth = requirePaidChatAuthority")
# G15 c5 remains SAFE_UNAVAILABLE (15 guards intact)
$c5guards = ([regex]::Matches($c5src, 'assertC5DirectChatUnavailable\(\);')).Count
$g15 = ($c5guards -ge 15)
$src = @{ G3_sendChatMessage_failclosed=$g3; G4_processMessage_requires_authority=$g4; G11_nonforgeable_capability=$g11; G11r2_exported_trust_factory_zero=$g11r2; G11b_no_production_raw_field_mint=$g11b; G12_no_untrusted_transacttokens=$g12; G15_c5_safe_unavailable=$g15 }
$srcbad = @($src.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($srcbad.Count -eq 0) { Pass ("source invariants: sendChatMessage HARD_FAIL_CLOSED; processMessage requires TrustedPaidChatAuthority (payer/earner from authority); non-forgeable capability (module-private symbol); EXPORTED_TRUST_FACTORY_COUNT=0 (no mint/create/build/issue/factory export); PRODUCTION_RAW_FIELD_MINT=0; UNTRUSTED_ENGINE_A_CHAT_TRANSACTTOKENS=0; c5 {0} guards SAFE_UNAVAILABLE" -f $c5guards) } else { $srcbad | ForEach-Object { Write-Host "  MISSING: $_" }; Fail 'source-level invariants' }

Write-Host "=== GATE 5-10,14. Emulator adversarial + regression suite ==="
if (-not (Test-Path (Join-Path $fnroot 'node_modules'))) { Fail 'dependencies absent' }
else {
  $m = Invoke-EmulatorSuite 'demo-avalo' 'main' "src/__tests__/$R1B1_FILE" 15
  Write-Host ("  jest --json -> passed={0} failed={1} pending={2} todo={3} total={4} emuExit={5} fresh={6} schema={7}" -f $(if ($m.json) { $m.json.numPassedTests } else { '?' }), $(if ($m.json) { $m.json.numFailedTests } else { '?' }), $(if ($m.json) { $m.json.numPendingTests } else { '?' }), $(if ($m.json) { $m.json.numTodoTests } else { '?' }), $(if ($m.json) { $m.json.numTotalTests } else { '?' }), $m.emuExit, $m.fresh, $m.schema)
  if ($m.ok) { Pass 'R1B-1 suite: strict schema valid, current-run JSON, 0 failed/skipped/todo' } else { Fail ("R1B-1 suite (emuExit={0} fresh={1} schema={2})" -f $m.emuExit, $m.fresh, $m.schema) }
  $rq = Test-RequiredNamedRecords $m.records $R1B1_NAMES $R1B1_FILE
  Write-Host ("  required named records matched={0}/{1} missing=[{2}]" -f $rq.matchedCount, $R1B1_NAMES.Count, ($rq.missing -join '; '))
  if ($rq.ok -and $m.ok) { Pass ("all {0} required R1B-1 named tests passed as distinct records (forged payer/earner/multiplier/state/group fail-closed; shim fail-closed; sendChatMessage disabled; reactivation-safe; general messaging OK)" -f $R1B1_NAMES.Count) } else { Fail 'required R1B-1 named records' }
}

Write-Host ""
if ($exit -eq 0) { Write-Host 'CHECKOUT: OFF ; ADVERTISER CREDIT: OFF ; ENGINE_A CHAT BILLING: SOURCE-LEVEL FAIL-CLOSED (TrustedPaidChatAuthority required) ; sendChatMessage DISABLED ; c5 SAFE_UNAVAILABLE ; P0-05 OPEN'; Write-Host 'RESULT: P0_05_R1B1_ENGINE_A_LATENT_VECTOR_NEUTRALIZATION_PASS' }
else { Write-Host 'RESULT: P0_05_R1B1_ENGINE_A_LATENT_VECTOR_NEUTRALIZATION_FAIL' }
exit $exit
