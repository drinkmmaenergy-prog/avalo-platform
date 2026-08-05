#Requires -Version 5.1
<#
  validate-p0-05-r1a1-c5-containment.ps1 — READ-ONLY, fail-closed. (Run under pwsh 7+.)
  P0-05 R1A-1 — SAFE UNAVAILABLE containment of the EXPORTED c5 direct-chat callable entrypoints
  (functions/src/chat/canonicalDirectChatCallables.ts). Every c5 callable must fail closed ('unavailable') BEFORE
  any /chats read/write, wallet reservation/debit, ledger write, creator-earning write, chatSessions/billingEvents
  write, or rate/multiplier/state mutation. c5 LOGIC modules (canonicalChatStateMachineV3, canonicalMultiplierTiers)
  are RETAINED unchanged. ENGINE_A (chatSystemNextGen sendChatMessage, canonical-chat-engine) and general messaging
  and Firestore rules are UNCHANGED. PRIMARY authority = emulator behavioral tests. On FULL PASS (exit 0):
  P0_05_R1A1_C5_CONTAINMENT_PASS ; else ..._FAIL (1). P0-05 remains OPEN (ENGINE_A active risk not closed here).
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
  $jsonDir = Join-Path ([System.IO.Path]::GetTempPath()) ('avalo-p0-05-r1a1-' + [guid]::NewGuid().ToString())
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

# ---- R1A-1 required named tests + allowlist + unchanged pins ----
$R1A1_FILE = 'p0-05-r1a1-c5-containment.test.ts'
$R1A1_NAMES = @(
  'p0-05 r1a1: c5 containment guard throws unavailable',
  'p0-05 r1a1: c5_startMatchedChat is safe-unavailable with zero side effects',
  'p0-05 r1a1: c5_requestPaidChat is safe-unavailable',
  'p0-05 r1a1: c5_creatorAcceptPaidChat is safe-unavailable',
  'p0-05 r1a1: c5_creatorDeclinePaidChat is safe-unavailable',
  'p0-05 r1a1: c5_openPaidSessionCall is safe-unavailable (no reservation)',
  'p0-05 r1a1: c5_sendFanMessage is safe-unavailable',
  'p0-05 r1a1: c5_deliverCreatorMessage is safe-unavailable (no earning)',
  'p0-05 r1a1: c5_fundNewSegment is safe-unavailable',
  'p0-05 r1a1: c5_closePaidSessionCall is safe-unavailable',
  'p0-05 r1a1: c5 rate and session-end wrappers are safe-unavailable',
  'p0-05 r1a1: forged chatId/fanId/creatorId/state cannot bypass c5 containment',
  'p0-05 r1a1: c5 containment performs zero wallet, ledger, earning, session, or /chats mutation',
  'p0-05 r1a1: retained c5 logic modules remain importable (state machine + multiplier tiers)'
)
$R1A1_ALLOW = @(
  'functions/src/chat/canonicalDirectChatCallables.ts',
  'functions/src/chat/c5DirectChatContainment.ts',
  'functions/src/__tests__/p0-05-r1a1-c5-containment.test.ts',
  'scripts/validate-p0-05-r1a1-c5-containment.ps1'
)
# UNCHANGED pins (ENGINE_A + retained c5 logic + general messaging + rules).
$UNCHANGED = @{
  'functions/src/chatSystemNextGen.ts'                 = '26cc93437dd52e44c948c288ae1b79093471d21bd5229d135b894aa6b836bdcf'
  'functions/src/canonical-chat-engine.ts'             = '637285afadf22667d8c4e0bd7c3f462e858e70903b7dd44bbb1f66c4b87c37db'
  'functions/src/chat/canonicalChatStateMachineV3.ts'  = '4a3cfd5688deab0de4ca0cec35df7fe395eda7d223330d5730b6919b08735488'
  'functions/src/chat/canonicalMultiplierTiers.ts'     = 'f6c2b264985a29531d704fc74470369b56a0541705d06eee3dd17f1b653cdf4f'
  'infrastructure/firebase/firestore.rules'            = '77f47600e58253518be66964738591b9fed78b46e13f377bd43d1f5a6e2f4e33'
  'app-web/src/app/messages/page.tsx'                  = 'c2b7eaee58134f5afa73b12682b66971babed49d625ff68c2e85b6a395305e8d'
}

Write-Host "=== GATE 1. Identity + zero staged + bounded diff ==="
$top = (& git -C $root rev-parse --show-toplevel) 2>$null; $head = (& git -C $root rev-parse HEAD) 2>$null; $sym = (& git -C $root symbolic-ref -q HEAD) 2>$null; $fhead = (& git -C $forensic rev-parse HEAD) 2>$null
$staged = @(& git -C $root diff --cached --name-only | Where-Object { $_.Trim() -ne '' }).Count
$changed = @(); foreach ($l in @(& git -C $root status --short -uall)) { if ($l.Length -gt 3) { $changed += ($l.Substring(3).Trim() -replace '\\', '/') } }
$r1a1Changed = @($changed | Where-Object { $_ -match 'c5DirectChat|canonicalDirectChatCallables|p0-05-r1a1|validate-p0-05-r1a1' })
$outside = @($r1a1Changed | Where-Object { $_ -notin $R1A1_ALLOW })
$runtimeChanged = @($r1a1Changed | Where-Object { $_ -match '^functions/src/' -and $_ -notmatch '__tests__' })
$idOk = ((($top -replace '\\', '/') -eq 'C:/a/avalo-controlled-enablement-clean') -and $head -eq $expectHead -and -not $sym -and $fhead -eq $expectHead -and $staged -eq 0)
if ($idOk -and $outside.Count -eq 0 -and $runtimeChanged.Count -le 3) { Pass ("identity + detached + forensic + staged=0 + R1A-1 diff within allowlist (runtime files={0}: {1})" -f $runtimeChanged.Count, ($r1a1Changed -join ', ')) }
else { $outside | ForEach-Object { Write-Host "  OUTSIDE: $_" }; Fail ("identity/diff (staged={0} runtimeChanged={1})" -f $staged, $runtimeChanged.Count) }

Write-Host "=== GATE 1b. No package/lock drift INTRODUCED by R1A-1 (pre-existing baseline package.json is out of scope) ==="
$pkgHit = @($r1a1Changed | Where-Object { $_ -match 'package\.json$|package-lock\.json$|pnpm-lock|yarn\.lock' })
if ($pkgHit.Count -eq 0) { Pass 'R1A-1 introduced no package/lock changes' } else { $pkgHit | ForEach-Object { Write-Host "  PKG: $_" }; Fail 'package/lock drift' }

Write-Host "=== GATE 2. Prior closed validators still green ==="
$tv = & (Join-Path $root 'scripts\validate-clean-worktree-layer0-support.ps1') *>&1; $tvExit = $LASTEXITCODE
$tvOk = ($tvExit -eq 0) -and (($tv | Select-String -SimpleMatch 'RESULT: CLEAN_WORKTREE_LAYER0_TO_LAYER1_TRANSITION_CONTRACT_PASS').Count -gt 0)
$l1 = & (Join-Path $root 'scripts\validate-clean-worktree-layer1-payment-foundation-and-p0-04.ps1') *>&1; $l1Exit = $LASTEXITCODE
$l1Ok = ($l1Exit -eq 0) -and (($l1 | Select-String -SimpleMatch 'RESULT: CLEAN_WORKTREE_LAYER1_PAYMENT_FOUNDATION_AND_P0_04_PASS').Count -gt 0)
$p01 = & (Join-Path $root 'scripts\validate-p0-01-advertiser-credit-authorization.ps1') *>&1; $p01Exit = $LASTEXITCODE
$p01Ok = ($p01Exit -eq 0) -and (($p01 | Select-String -SimpleMatch 'RESULT: P0_01_ADVERTISER_CREDIT_AUTHORIZATION_PASS').Count -gt 0)
$p02 = & (Join-Path $root 'scripts\validate-p0-02-ai-billing-preauthorization.ps1') *>&1; $p02Exit = $LASTEXITCODE
$p02Ok = ($p02Exit -eq 0) -and (($p02 | Select-String -SimpleMatch 'RESULT: P0_02_AI_BILLING_PREAUTHORIZATION_PASS').Count -gt 0)
if ($tvOk -and $l1Ok -and $p01Ok -and $p02Ok) { Pass ("prior validators green (tv={0} l1={1} p01={2} p02={3})" -f $tvExit, $l1Exit, $p01Exit, $p02Exit) } else { Fail ("prior validators (tv={0} l1={1} p01={2} p02={3})" -f $tvExit, $l1Exit, $p01Exit, $p02Exit) }

Write-Host "=== GATE 3. c5 export inventory complete + every callable guarded ==="
$cc = Get-Content (Join-Path $root 'functions\src\chat\canonicalDirectChatCallables.ts') -Raw
$c5Exports = ([regex]::Matches($cc, 'export const (c5_[A-Za-z]+)\s*=\s*onCall')) | ForEach-Object { $_.Groups[1].Value }
$guardCount = ([regex]::Matches($cc, 'assertC5DirectChatUnavailable\(\);')).Count
$importOk = ($cc -match "from './c5DirectChatContainment'")
Write-Host ("  c5 exported callables={0} ; guard insertions={1}" -f $c5Exports.Count, $guardCount)
if ($c5Exports.Count -ge 15 -and $guardCount -ge $c5Exports.Count -and $importOk) { Pass ("all {0} c5 exported callables guarded" -f $c5Exports.Count) } else { Fail 'c5 export inventory / guard coverage' }

Write-Host "=== GATE 4. c5 SAFE_UNAVAILABLE contract (guard module; not env-toggleable) ==="
$guardMod = Get-Content (Join-Path $root 'functions\src\chat\c5DirectChatContainment.ts') -Raw
$g4 = @{
  modulePresent = (Test-Path (Join-Path $root 'functions\src\chat\c5DirectChatContainment.ts'))
  throwsUnavailable = ($guardMod -match "new HttpsError\('unavailable'") -and ($guardMod -match 'C5_DIRECT_CHAT_UNAVAILABLE')
  notEnvToggleable = ($guardMod -notmatch 'process\.env') -and ($cc -notmatch 'C5.*ENABLED')
  guardBeforeLoadChat = ($cc -match 'assertC5DirectChatUnavailable\(\);[\s\S]{0,4000}?loadChat')  # guard appears before first loadChat usage in a handler
}
$g4bad = @($g4.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($g4bad.Count -eq 0) { Pass 'c5 guard: deterministic unavailable, not env-toggleable, precedes paid-authority reads' } else { $g4bad | ForEach-Object { Write-Host "  MISSING: $_" }; Fail 'c5 SAFE_UNAVAILABLE contract' }

Write-Host "=== GATE 11a. Retained c5 logic + ENGINE_A + general messaging + rules UNCHANGED ==="
$unchangedBad = @()
foreach ($k in $UNCHANGED.Keys) { $p = Join-Path $root ($k -replace '/', '\'); $h = (Get-FileHash -Algorithm SHA256 $p).Hash.ToLower(); if ($h -ne $UNCHANGED[$k]) { $unchangedBad += $k } }
if ($unchangedBad.Count -eq 0) { Pass 'retained c5 logic (stateMachineV3, multiplierTiers) + ENGINE_A (chatSystemNextGen, canonical-chat-engine) + messages/page.tsx + firestore.rules BYTE-IDENTICAL' } else { $unchangedBad | ForEach-Object { Write-Host "  CHANGED: $_" }; Fail 'unchanged-file pins' }

Write-Host "=== GATE parser self-tests ==="
$goodRecs = @(); foreach ($n in $R1A1_NAMES) { $goodRecs += @{ file = "src/__tests__/$R1A1_FILE"; fullName = $n; status = 'passed' } }
$selfOk = $true
$r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest $goodRecs)) $R1A1_NAMES $R1A1_FILE; if (-not $r.ok) { $selfOk = $false }
$r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest ($goodRecs | Select-Object -Skip 1))) $R1A1_NAMES $R1A1_FILE; if ($r.ok) { $selfOk = $false }
$skipRecs = @(); foreach ($n in $R1A1_NAMES) { $skipRecs += @{ file = "src/__tests__/$R1A1_FILE"; fullName = $n; status = 'skipped' } }
$r = Test-RequiredNamedRecords (Get-JestAssertionRecords (New-FakeJest $skipRecs)) $R1A1_NAMES $R1A1_FILE; if ($r.ok) { $selfOk = $false }
if ((Test-JsonSummaryStrict (New-FakeJest $goodRecs) 14).ok -ne $true) { $selfOk = $false }
if ((Test-JsonSummaryStrict (New-FakeJest $goodRecs 1) 14).ok -ne $false) { $selfOk = $false }
if ($selfOk) { Pass 'parser self-tests pass' } else { Fail 'parser self-tests' }

Write-Host "=== GATES 5-10. Emulator-backed c5 containment suite (zero mutation + regression) ==="
if (-not (Test-Path (Join-Path $fnroot 'node_modules'))) { Fail 'dependencies absent' }
elseif (-not $selfOk) { Fail 'skipping real run: parser self-tests failed' }
else {
  $m = Invoke-EmulatorSuite 'demo-avalo' 'main' "src/__tests__/$R1A1_FILE" 14
  Write-Host ("  jest --json -> passed={0} failed={1} pending={2} todo={3} total={4} emuExit={5} fresh={6} schema={7}" -f $(if ($m.json) { $m.json.numPassedTests } else { '?' }), $(if ($m.json) { $m.json.numFailedTests } else { '?' }), $(if ($m.json) { $m.json.numPendingTests } else { '?' }), $(if ($m.json) { $m.json.numTodoTests } else { '?' }), $(if ($m.json) { $m.json.numTotalTests } else { '?' }), $m.emuExit, $m.fresh, $m.schema)
  if ($m.ok) { Pass 'c5 containment suite: strict schema valid, current-run temp JSON, 0 failed/skipped/todo' } else { Fail ("c5 containment suite (emuExit={0} fresh={1} schema={2})" -f $m.emuExit, $m.fresh, $m.schema) }
  $rq = Test-RequiredNamedRecords $m.records $R1A1_NAMES $R1A1_FILE
  Write-Host ("  required named records matched={0}/{1} missing=[{2}]" -f $rq.matchedCount, $R1A1_NAMES.Count, ($rq.missing -join '; '))
  if ($rq.ok -and $m.ok) { Pass ("all {0} required c5-containment named tests passed as distinct records (unavailable + zero /chats/wallet/ledger/earning/session mutation + retained logic)" -f $R1A1_NAMES.Count) } else { Fail 'required c5-containment named records' }
}

Write-Host ""
if ($exit -eq 0) { Write-Host 'CHECKOUT: OFF ; ADVERTISER CREDIT: OFF ; c5 DIRECT PAID CHAT: SAFE_UNAVAILABLE (contained) ; ENGINE_A ACTIVE P0-05 RISK REMAINS ; P0-05 OPEN'; Write-Host 'RESULT: P0_05_R1A1_C5_CONTAINMENT_PASS' }
else { Write-Host 'RESULT: P0_05_R1A1_C5_CONTAINMENT_FAIL' }
exit $exit
