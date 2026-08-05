#Requires -Version 5.1
<#
  emulator-lifecycle-adjudication.tests.ps1 — permanent regression self-tests for the emulator-lifecycle adjudicator.
  READ-ONLY (no emulator, no repo mutation). Proves the adjudicator PASSES only on positive proof of a healthy run whose
  events occur in the correct ORDER, and FAILS CLOSED on every genuine failure, every UNKNOWN/incomplete-evidence case,
  and every mis-ordered sequence — on BOTH exit 0 and a normalized non-zero exit. Also proves the harness resolves its
  helper deterministically from BOTH the repository-native layout (../lib) and a portable flat layout (beside the
  harness), independent of the current working directory. Exit 0 on full pass; else exit 1.

  Helper discovery is factored into Resolve-LifecycleHelper so it is unit-tested here and reused for dot-sourcing.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-LifecycleHelper {
  # Deterministic, CWD-independent discovery of EmulatorLifecycle.ps1 relative to $FromDir. Exactly one match required;
  # zero -> throw; multiple non-identical -> throw; multiple byte-identical -> documented precedence (repository-native).
  param([Parameter(Mandatory)][string]$FromDir)
  $candidates = @(
    (Join-Path $FromDir '..\lib\EmulatorLifecycle.ps1'),   # 1) repository-native
    (Join-Path $FromDir 'EmulatorLifecycle.ps1')            # 2) portable flat (beside the harness)
  )
  $existing = @($candidates | Where-Object { Test-Path -LiteralPath $_ })
  if ($existing.Count -eq 0) { throw "LIFECYCLE_HELPER_NOT_FOUND: [$($candidates -join '; ')]" }
  if ($existing.Count -gt 1) {
    $distinct = @($existing | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash } | Sort-Object -Unique)
    if ($distinct.Count -gt 1) { throw 'LIFECYCLE_HELPER_AMBIGUOUS: non-identical candidates' }
  }
  return (Resolve-Path -LiteralPath $existing[0]).Path
}

. (Resolve-LifecycleHelper -FromDir $here)
$persist = Join-Path $env:TEMP ('avalo-emu-lifecycle-selftest-' + [guid]::NewGuid().ToString('N'))

$fails = 0
function Check([string]$name, [bool]$actual, [bool]$expected) {
  $ok = ($actual -eq $expected)
  if (-not $ok) { $script:fails++ }
  Write-Host ("  [{0}] {1} (expected={2} actual={3})" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $name, $expected, $actual)
}
function Adj([int]$exit, [string]$log, [int[]]$ports) {
  return (Test-EmulatorLifecycleHealthy -CliExit $exit -LogText $log -Ports $ports -PersistDir $persist -Label 'selftest')
}
function Get-FreePort {
  $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $l.Start(); $p = ([System.Net.IPEndPoint]$l.LocalEndpoint).Port; $l.Stop(); return $p
}
$fp = @((Get-FreePort))

$OK = @"
i  emulators: Starting emulators: firestore
i  firestore: Firestore Emulator UI websocket is running on 9150.
i  Running script: node jest ...
Test Suites: 1 passed, 1 total
Tests:       53 passed, 53 total
+  Script exited successfully (code 0)
i  emulators: Shutting down emulators.
i  firestore: Stopping Firestore Emulator
!  Firestore Emulator has exited upon receiving signal: SIGINT
i  hub: Stopping emulator hub
"@
$BENIGN2 = $OK + @"
i  Could not find VSCode notification endpoint: FetchError (expected)
Error: Timed out.
    at Timeout._onTimeout (...firebase-tools/lib/utils.js:308:49)
Error: An unexpected error has occurred.
i  Found emulator hub locator: {"version":"15.9.0","pid":28204}
"@

Write-Host "=== emulator-lifecycle adjudication self-tests (ordered-sequence + unknown-error + portable-resolution) ==="

# ── ORIGINAL 30 (adapted to ordered markers) ─────────────────────────────────────────────────────────────────────
Check '01 clean exit 0 + ordered clean shutdown' (Adj 0 $OK $fp) $true
Check '02 proven benign cleanup (exit 2), ordered' (Adj 2 $BENIGN2 $fp) $true
Check '03 bare exit 2, no proof' (Adj 2 "some noise`nError: An unexpected error has occurred.`n" $fp) $false
Check '04 jest failure (script exited code 1)' (Adj 1 "Running script:`nScript `"jest`" exited with code 1`nShutting down emulators.`nFirestore Emulator has exited upon receiving signal: SIGINT" $fp) $false
Check '05 failed>0, no success marker' (Adj 1 "Running script:`nTests: 1 failed, 52 passed`nShutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT" $fp) $false
Check '06 [validator-level] helper needs marker regardless of todo' (Adj 0 "Running script:`nTests: 50 passed, 3 todo`n(no script marker)" $fp) $false
Check '07 [validator-level] lifecycle healthy independent of named-records' (Adj 0 $OK $fp) $true
Check '08 success marker absent' (Adj 0 "Running script:`nTests: 53 passed`nShutting down emulators.`nFirestore Emulator has exited upon receiving signal: SIGINT" $fp) $false
Check '09 startup failure' (Adj 1 "Starting Firestore Emulator`nError: Could not start Firestore Emulator" $fp) $false
Check '10 port collision' (Adj 1 "Error: address already in use 127.0.0.1:8080" $fp) $false
Check '11 emulator crash mid-run' (Adj 1 "Running script:`nFirestore Emulator has exited with code 137" $fp) $false
Check '12 java death during tests' (Adj 1 "Running script:`nException in thread `"main`" java.lang.OutOfMemoryError" $fp) $false
Check '13 firestore comm failure' (Adj 1 "Running script:`nError: connect ECONNREFUSED 127.0.0.1:8080" $fp) $false
Check '14 timeout before jest completion (no success marker)' (Adj 2 "Running script:`nError: Timed out.`nAn unexpected error has occurred." $fp) $false
Check '15 unrelated error between success and shutdown (exit 2)' (Adj 2 ("Running script:`n+  Script exited successfully (code 0)`nError: something unexpected in the pipeline`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out.`nAn unexpected error has occurred.") $fp) $false
Check '16 unknown exit-2 stack' (Adj 2 ($OK + "Error: WeirdError: boom") $fp) $false
$held = Get-FreePort; $L = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $held); $L.Start()
try { Check '17 orphan: port still held' (Adj 0 $OK @($held)) $false } finally { $L.Stop() }
$held2 = Get-FreePort; $L2 = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $held2); $L2.Start()
try { Check '18 port occupied after benign run' (Adj 2 $BENIGN2 @($held2)) $false } finally { $L2.Stop() }
Check '19 [validator-level] lifecycle-ok does not imply json-ok' (Adj 0 $OK $fp) $true
Check '20 missing evidence + nonzero exit' (Test-EmulatorLifecycleHealthy -CliExit 2 -LogText '' -Ports $fp -PersistDir $persist) $false
Check '21 wrapper-success but native fail' (Adj 0 "Running script:`nScript `"jest`" exited with code 1`nShutting down emulators.`nFirestore Emulator has exited upon receiving signal: SIGINT" $fp) $false
Check '22 cleanup overwrote exit to 0 but native failed' (Adj 0 "Running script:`nTests: 3 failed`nScript `"jest`" exited with code 1" $fp) $false
Check '23 buffered/nested keeps ordered markers (exit 2)' (Adj 2 (("noise`n" * 8000) + $BENIGN2) $fp) $true
Check '24 stale hub locator, no success marker' (Adj 2 "i  Found emulator hub locator: {`"pid`":28204}`nError: An unexpected error has occurred." $fp) $false
Check '24b stale hub locator WITH full ordered proof' (Adj 2 $BENIGN2 $fp) $true
$null = Adj 1 "Error: Could not start" $fp
Check '25 no state leak (clean run after failed run)' (Adj 0 $OK $fp) $true
$held3 = Get-FreePort; $L3 = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $held3); $L3.Start()
try { Check '26 concurrent-validator residue (port held)' (Adj 0 $OK @($held3)) $false } finally { $L3.Stop() }
Check '27 missing shutdown marker' (Adj 0 "Running script:`nTests: 1 passed`n+  Script exited successfully (code 0)`n(no shutdown)" $fp) $false
Check '28 [validator-level] helper agnostic to count' (Adj 0 $OK $fp) $true
Check '29 [validator-level] project fixed by gate' (Adj 0 $OK $fp) $true
Check '30 broad exit2=>pass rejected (no ordered proof)' (Adj 2 "random`nError: An unexpected error has occurred.`nShutting down emulators." $fp) $false

# ── NEW 20 (ordering + unknown-error, Phase 6) ───────────────────────────────────────────────────────────────────
Check '31 exit0 + unknown error after script success' (Adj 0 ($OK + "`nError: mystery something went wrong") $fp) $false
Check '32 exit0 + unknown error after shutdown' (Adj 0 ($OK + "`nFatal: teardown blew up") $fp) $false
Check '33 exit0 + known cleanup token post-shutdown is benign (not ignored, whitelisted)' (Adj 0 ($OK + "Error: Timed out.") $fp) $true
Check '34 exit2 + timeout BEFORE shutdown begins' (Adj 2 "i  Running script:`nFirestore Emulator UI websocket is running`n+  Script exited successfully (code 0)`nError: Timed out.`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT" $fp) $false
Check '35 exit2 + shutdown marker AFTER timeout' (Adj 2 "Running script:`n+  Script exited successfully (code 0)`nError: Timed out.`nAn unexpected error has occurred.`ni  emulators: Shutting down emulators." $fp) $false
Check '36 exit2 + missing shutdown-begin marker' (Adj 2 "Running script:`n+  Script exited successfully (code 0)`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out." $fp) $false
Check '37 exit2 + missing expected stop/SIGINT marker' (Adj 2 "Running script:`n+  Script exited successfully (code 0)`ni  emulators: Shutting down emulators.`nError: Timed out.`nAn unexpected error has occurred." $fp) $false
Check '38 exit2 + unrelated error between success and shutdown' (Adj 2 ("Running script:`n+  Script exited successfully (code 0)`nError: rogue thing`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out.") $fp) $false
Check '39 exit2 + unrelated error between shutdown and timeout' (Adj 2 ("Running script:`n+  Script exited successfully (code 0)`ni  emulators: Shutting down emulators.`nError: rogue teardown`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out.") $fp) $false
Check '40 exit2 + runtime crash before shutdown' (Adj 2 ("Running script:`nFirestore Emulator has exited with code 1`n+  Script exited successfully (code 0)`ni  emulators: Shutting down emulators.`nError: Timed out.") $fp) $false
Check '41 reordered success marker (script before startup)' (Adj 2 ("+  Script exited successfully (code 0)`nRunning script:`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out.") $fp) $false
Check '42 fabricated success marker after timeout' (Adj 2 ("Running script:`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out.`n+  Script exited successfully (code 0)") $fp) $false
Check '43 valid exact ordered benign cleanup' (Adj 2 $BENIGN2 $fp) $true
Check '44 exit0 clean exact lifecycle' (Adj 0 $OK $fp) $true
Check '45 exit0 malformed ordering (shutdown before script)' (Adj 0 ("Running script:`ni  emulators: Shutting down emulators.`n+  Script exited successfully (code 0)`n!  Firestore Emulator has exited upon receiving signal: SIGINT") $fp) $false
Check '46 timeout mid-run (contains Timed out but wrong phase) exit0' (Adj 0 ("Running script:`nError: query Timed out.`nTests: 53 passed`n+  Script exited successfully (code 0)`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT") $fp) $false
Check '47 known timeout stack wrong phase (no shutdown) exit2' (Adj 2 ("Running script:`n+  Script exited successfully (code 0)`nError: Timed out.") $fp) $false
Check '48 known stack with held port' ((& { $hp = Get-FreePort; $ll = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $hp); $ll.Start(); try { Adj 2 $BENIGN2 @($hp) } finally { $ll.Stop() } })) $false
Check '49 known stack with orphan (port residue) proxy' ((& { $hp = Get-FreePort; $ll = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $hp); $ll.Start(); try { Adj 2 $BENIGN2 @($hp) } finally { $ll.Stop() } })) $false
Check '50 multiple cleanup timeout events' (Adj 2 ($OK + "`nError: Timed out.`nError: Timed out.`nAn unexpected error has occurred.") $fp) $false
# real-log shape: firebase exits 2 with the final-error wrapper AFTER shutdown but NO 'Timed out.' in stdout (it goes to
# firestore-debug.log). ordered + benign -> PASS.
Check '58 real shape: finalError-only cleanup (no Timed out) ordered' (Adj 2 ($OK + "`ni  Could not find VSCode notification endpoint: FetchError`nError: An unexpected error has occurred.`ni  Found emulator hub locator: {`"pid`":1}") $fp) $true
# test-execution error console output BEFORE script success must be IGNORED (jest/JSON already adjudicates the tests).
Check '59 test-phase console Error before success is ignored (exit2 benign)' (Adj 2 ("i  Running script: node jest`nconsole.error forged token rejected: Error: not-authorized`nTests: 53 passed`n+  Script exited successfully (code 0)`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: An unexpected error has occurred.") $fp) $true

# ── PORTABLE HELPER RESOLUTION (Phase 8) ─────────────────────────────────────────────────────────────────────────
Write-Host "=== portable helper-resolution self-tests ==="
$realHelper = Resolve-LifecycleHelper -FromDir $here
$tmp = Join-Path $env:TEMP ('avalo-helper-resolve-' + [guid]::NewGuid().ToString('N'))
function ResolveOk([string]$name, [scriptblock]$setup, [bool]$expectThrow, [string]$expectDirLeaf) {
  $base = Join-Path $tmp ([guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $base | Out-Null
  $harnessDir = & $setup $base
  $threw = $false; $resolved = $null
  try { $resolved = Resolve-LifecycleHelper -FromDir $harnessDir } catch { $threw = $true }
  if ($expectThrow) { Check $name $threw $true }
  else { Check $name ((-not $threw) -and ($null -ne $resolved) -and ((Split-Path (Split-Path $resolved -Parent) -Leaf) -eq $expectDirLeaf)) $true }
}
# native layout: <base>\lib\helper + <base>\tests\ (harness dir) -> resolves ..\lib
ResolveOk '51 native layout resolves ..\lib' {
  param($b) New-Item -ItemType Directory -Force -Path (Join-Path $b 'lib') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $b 'tests') | Out-Null
  Copy-Item -LiteralPath $realHelper -Destination (Join-Path $b 'lib\EmulatorLifecycle.ps1')
  (Join-Path $b 'tests')
} $false 'lib'
# flat portable layout: <base>\helper beside harness -> resolves .\EmulatorLifecycle.ps1
$flatBase = Join-Path $tmp ('flat-' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Force -Path $flatBase | Out-Null
Copy-Item -LiteralPath $realHelper -Destination (Join-Path $flatBase 'EmulatorLifecycle.ps1')
$flatThrew = $false; try { $r = Resolve-LifecycleHelper -FromDir $flatBase } catch { $flatThrew = $true }
Check '52 flat portable layout resolves (no throw)' ((-not $flatThrew) -and (Test-Path -LiteralPath $r)) $true
# CWD independence: change CWD elsewhere, resolution still works via explicit FromDir
Push-Location $env:TEMP
try { $cwdThrew = $false; try { $r2 = Resolve-LifecycleHelper -FromDir $flatBase } catch { $cwdThrew = $true }; Check '53 CWD-independent resolution' ((-not $cwdThrew) -and ($r2 -eq $r)) $true } finally { Pop-Location }
# missing helper -> throws
$missBase = Join-Path $tmp ('miss-' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Force -Path $missBase | Out-Null
$missThrew = $false; try { Resolve-LifecycleHelper -FromDir $missBase | Out-Null } catch { $missThrew = $true }
Check '54 missing helper fails closed' $missThrew $true
# ambiguous non-identical candidates -> throws
$ambBase = Join-Path $tmp ('amb-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $ambBase 'lib') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ambBase 'tests') | Out-Null
Copy-Item -LiteralPath $realHelper -Destination (Join-Path $ambBase 'lib\EmulatorLifecycle.ps1')
Set-Content -LiteralPath (Join-Path $ambBase 'tests\EmulatorLifecycle.ps1') -Value '# different content'
$ambThrew = $false; try { Resolve-LifecycleHelper -FromDir (Join-Path $ambBase 'tests') | Out-Null } catch { $ambThrew = $true }
Check '55 ambiguous non-identical candidates fail closed' $ambThrew $true
# byte-identical candidates -> resolves by documented precedence (no throw)
$idBase = Join-Path $tmp ('ident-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $idBase 'lib') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $idBase 'tests') | Out-Null
Copy-Item -LiteralPath $realHelper -Destination (Join-Path $idBase 'lib\EmulatorLifecycle.ps1')
Copy-Item -LiteralPath $realHelper -Destination (Join-Path $idBase 'tests\EmulatorLifecycle.ps1')
$idThrew = $false; try { $ri = Resolve-LifecycleHelper -FromDir (Join-Path $idBase 'tests') } catch { $idThrew = $true }
Check '56 byte-identical candidates resolve by precedence' ((-not $idThrew) -and ((Split-Path (Split-Path $ri -Parent) -Leaf) -eq 'lib')) $true
# harness invokes the REAL helper (function is available after dot-source from a clean flat copy)
$invThrew = $false; $invResult = $null
try { . (Resolve-LifecycleHelper -FromDir $flatBase); $invResult = Test-EmulatorLifecycleHealthy -CliExit 0 -LogText $OK -Ports $fp -PersistDir $persist } catch { $invThrew = $true }
Check '57 clean flat helper dot-sources and executes' ((-not $invThrew) -and ($invResult -eq $true)) $true

try { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force } } catch {}
try { if (Test-Path -LiteralPath $persist) { Remove-Item -LiteralPath $persist -Recurse -Force } } catch {}

Write-Host ""
if ($fails -eq 0) {
  Write-Host 'RESULT: EMULATOR_LIFECYCLE_ADJUDICATION_SELFTEST_PASS (VALIDATOR_FALSE_NEGATIVE_ON_EMULATOR_FAILURES=NONE; ordered+portable; 59 checks)'
  exit 0
} else {
  Write-Host ("RESULT: EMULATOR_LIFECYCLE_ADJUDICATION_SELFTEST_FAIL ({0} checks wrong)" -f $fails)
  exit 1
}
