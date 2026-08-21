#Requires -Version 5.1
<#
  emulator-lifecycle-adjudication.tests.ps1 — permanent regression self-tests for the emulator-lifecycle adjudicator.
  READ-ONLY (no emulator, no repo mutation). Proves the adjudicator PASSES only on positive proof of a healthy run
  whose events occur in the correct ORDER, and FAILS CLOSED on every genuine failure, every UNKNOWN/incomplete-evidence
  case, and every mis-ordered sequence — on BOTH exit 0 and a normalized non-zero exit.

  R5: covers the two independently-confirmed false-negatives —
    (1) an unknown INFRASTRUCTURE error anywhere in the log (including BEFORE script success) must fail;
    (2) the generic 'An unexpected error has occurred' wrapper must NEVER by itself normalize a non-zero exit;
        EXACT firebase cleanShutdown timeout evidence (literal 'Error: Timed out.' + firebase-tools cleanup stack) is
        required, optionally sourced from a correlated debug log.
  Also proves the harness resolves its helper deterministically from BOTH the repository-native layout (..\lib) and a
  portable flat layout (beside the harness), independent of the current working directory.

  Counting: every Check is one ASSERTION. The final marker reports the real assertion count — there is no separate
  "scenario" number that can drift from it. Exit 0 on full pass; else exit 1.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-LifecycleFileSha256 {
  # R8: Get-FileHash is NOT dependable under Windows PowerShell 5.1. When 5.1 is launched from a PowerShell 7
  # process it inherits $env:PSModulePath with 7's module directory first, so `Microsoft.PowerShell.Utility`
  # resolves to the 7.0.0.0 Core module and Get-FileHash disappears from the session entirely. With
  # $ErrorActionPreference='Stop' the resulting CommandNotFoundException is terminating, which turned the
  # ambiguity check below into a check that threw for a reason unrelated to ambiguity. The BCL hash primitive
  # is present on both runtimes and cannot be shadowed by module path order.
  param([Parameter(Mandatory)][string]$Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([System.IO.File]::ReadAllBytes($Path))) -replace '-', '') }
  finally { $sha.Dispose() }
}

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
    $distinct = @($existing | ForEach-Object { Get-LifecycleFileSha256 -Path $_ } | Sort-Object -Unique)
    if ($distinct.Count -gt 1) { throw 'LIFECYCLE_HELPER_AMBIGUOUS: non-identical candidates' }
  }
  return (Resolve-Path -LiteralPath $existing[0]).Path
}

. (Resolve-LifecycleHelper -FromDir $here)
$persist = Join-Path $env:TEMP ('avalo-emu-lifecycle-selftest-' + [guid]::NewGuid().ToString('N'))

$script:asserts = 0
$script:fails = 0
function Check([string]$name, [bool]$actual, [bool]$expected) {
  $script:asserts++
  $ok = ($actual -eq $expected)
  if (-not $ok) { $script:fails++ }
  Write-Host ("  [{0}] {1} (expected={2} actual={3})" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $name, $expected, $actual)
}
function Adj([int]$exit, [string]$log, [int[]]$ports) {
  return (Test-EmulatorLifecycleHealthy -CliExit $exit -LogText $log -Ports $ports -PersistDir $persist -Label 'selftest')
}
function AdjD([int]$exit, [string]$log, [int[]]$ports, [hashtable]$dbg, [string]$corr) {
  return (Test-EmulatorLifecycleHealthy -CliExit $exit -LogText $log -Ports $ports -PersistDir $persist -Label 'selftest' -DebugLogs $dbg -RunCorrelationId $corr)
}
function Get-FreePort {
  $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $l.Start(); $p = ([System.Net.IPEndPoint]$l.LocalEndpoint).Port; $l.Stop(); return $p
}
$fp = @((Get-FreePort))

# ── canonical fixtures (NOTE: explicit newlines — never rely on here-string concatenation) ────────────────────────
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
$CLEANUP_STACK = '    at Timeout._onTimeout (C:\node\firebase-tools\lib\utils.js:308:49)'
# EXACT benign cleanup: literal timeout + firebase-tools cleanup stack, after shutdown, wrapper last.
$BENIGN2 = $OK + "`n" + @"
i  Could not find VSCode notification endpoint: FetchError
Error: Timed out.
$CLEANUP_STACK
Error: An unexpected error has occurred.
i  Found emulator hub locator: {"version":"15.9.0","pid":28204}
"@
# Generic wrapper ONLY — no exact timeout evidence. Must never normalize a non-zero exit.
$WRAPPER_ONLY = $OK + "`nError: An unexpected error has occurred."

Write-Host "=== emulator-lifecycle adjudication self-tests (whole-log errors + exact cleanup proof + portable) ==="

# ── ORIGINAL SCENARIOS (retained; expectations updated where R5 policy is deliberately stricter) ─────────────────
Check '01 clean exit 0 + ordered clean shutdown' (Adj 0 $OK $fp) $true
Check '02 proven benign cleanup (exit 2), exact timeout + stack' (Adj 2 $BENIGN2 $fp) $true
Check '03 bare exit 2, no proof' (Adj 2 "some noise`nError: An unexpected error has occurred.`n" $fp) $false
Check '04 jest failure (script exited code 1)' (Adj 1 "Running script:`nScript `"jest`" exited with code 1`nShutting down emulators.`nFirestore Emulator has exited upon receiving signal: SIGINT" $fp) $false
Check '05 failed>0, no success marker' (Adj 1 "Running script:`nTests: 1 failed, 52 passed`nShutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT" $fp) $false
Check '06 helper needs success marker regardless of todo' (Adj 0 "Running script:`nTests: 50 passed, 3 todo`n(no script marker)" $fp) $false
Check '07 lifecycle healthy independent of named-records' (Adj 0 $OK $fp) $true
Check '08 success marker absent' (Adj 0 "Running script:`nTests: 53 passed`nShutting down emulators.`nFirestore Emulator has exited upon receiving signal: SIGINT" $fp) $false
Check '09 startup failure' (Adj 1 "Starting Firestore Emulator`nError: Could not start Firestore Emulator" $fp) $false
Check '10 port collision' (Adj 1 "Error: address already in use 127.0.0.1:8080" $fp) $false
Check '11 emulator crash mid-run' (Adj 1 "Running script:`nFirestore Emulator has exited with code 137" $fp) $false
Check '12 java death during tests' (Adj 1 "Running script:`nException in thread `"main`" java.lang.OutOfMemoryError" $fp) $false
Check '13 firestore comm failure' (Adj 1 "Running script:`nError: connect ECONNREFUSED 127.0.0.1:8080" $fp) $false
Check '14 timeout before jest completion (no success marker)' (Adj 2 "Running script:`nError: Timed out.`nAn unexpected error has occurred." $fp) $false
Check '15 unrelated error between success and shutdown (exit 2)' (Adj 2 ("Running script:`n+  Script exited successfully (code 0)`n[firestore] ERROR: something unexpected in the pipeline`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out.`n$CLEANUP_STACK") $fp) $false
Check '16 unknown exit-2 stack' (Adj 2 ($BENIGN2 + "`n[firestore] ERROR: WeirdError boom") $fp) $false
$held = Get-FreePort; $L = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $held); $L.Start()
try { Check '17 orphan: port still held' (Adj 0 $OK @($held)) $false } finally { $L.Stop() }
$held2 = Get-FreePort; $L2 = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $held2); $L2.Start()
try { Check '18 port occupied after benign run' (Adj 2 $BENIGN2 @($held2)) $false } finally { $L2.Stop() }
Check '19 lifecycle-ok does not imply json-ok' (Adj 0 $OK $fp) $true
Check '20 missing evidence + nonzero exit' (Test-EmulatorLifecycleHealthy -CliExit 2 -LogText '' -Ports $fp -PersistDir $persist) $false
Check '21 wrapper-success but native fail' (Adj 0 "Running script:`nScript `"jest`" exited with code 1`nShutting down emulators.`nFirestore Emulator has exited upon receiving signal: SIGINT" $fp) $false
Check '22 cleanup overwrote exit to 0 but native failed' (Adj 0 "Running script:`nTests: 3 failed`nScript `"jest`" exited with code 1" $fp) $false
Check '23 buffered/nested keeps ordered markers (exit 2)' (Adj 2 (("noise`n" * 8000) + $BENIGN2) $fp) $true
Check '24 stale hub locator, no success marker' (Adj 2 "i  Found emulator hub locator: {`"pid`":28204}`nError: An unexpected error has occurred." $fp) $false
Check '25 stale hub locator WITH full ordered proof' (Adj 2 $BENIGN2 $fp) $true
$null = Adj 1 "Error: Could not start" $fp
Check '26 no state leak (clean run after failed run)' (Adj 0 $OK $fp) $true
$held3 = Get-FreePort; $L3 = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $held3); $L3.Start()
try { Check '27 concurrent-validator residue (port held)' (Adj 0 $OK @($held3)) $false } finally { $L3.Stop() }
Check '28 missing shutdown marker' (Adj 0 "Running script:`nTests: 1 passed`n+  Script exited successfully (code 0)`n(no shutdown)" $fp) $false
Check '29 helper agnostic to count' (Adj 0 $OK $fp) $true
Check '30 broad exit2=>pass rejected (no ordered proof)' (Adj 2 "random`nError: An unexpected error has occurred.`nShutting down emulators." $fp) $false

# ── ORDERING / UNKNOWN-ERROR (retained) ──────────────────────────────────────────────────────────────────────────
Check '31 exit0 + unknown error after script success' (Adj 0 ($OK + "`n[firestore] ERROR: mystery something went wrong") $fp) $false
Check '32 exit0 + unknown error after shutdown' (Adj 0 ($OK + "`n[hub] FATAL: teardown blew up") $fp) $false
Check '33 exit0 + cleanup token WITHOUT stack is NOT benign' (Adj 0 ($OK + "`nError: Timed out.") $fp) $false
Check '34 exit2 + timeout BEFORE shutdown begins' (Adj 2 ("i  Running script:`nFirestore Emulator UI websocket is running`n+  Script exited successfully (code 0)`nError: Timed out.`n$CLEANUP_STACK`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT") $fp) $false
Check '35 exit2 + shutdown marker AFTER timeout' (Adj 2 "Running script:`n+  Script exited successfully (code 0)`nError: Timed out.`n$CLEANUP_STACK`nError: An unexpected error has occurred.`ni  emulators: Shutting down emulators." $fp) $false
Check '36 exit2 + missing shutdown-begin marker' (Adj 2 "Running script:`n+  Script exited successfully (code 0)`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out.`n$CLEANUP_STACK" $fp) $false
Check '37 exit2 + missing expected stop/SIGINT marker' (Adj 2 "Running script:`n+  Script exited successfully (code 0)`ni  emulators: Shutting down emulators.`nError: Timed out.`n$CLEANUP_STACK`nError: An unexpected error has occurred." $fp) $false
Check '38 exit2 + unrelated error between success and shutdown' (Adj 2 ("Running script:`n+  Script exited successfully (code 0)`n[firestore] ERROR: rogue thing`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out.`n$CLEANUP_STACK") $fp) $false
Check '39 exit2 + unrelated error between shutdown and timeout' (Adj 2 ("Running script:`n+  Script exited successfully (code 0)`ni  emulators: Shutting down emulators.`n[hub] ERROR: rogue teardown`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out.`n$CLEANUP_STACK") $fp) $false
Check '40 exit2 + runtime crash before shutdown' (Adj 2 ("Running script:`nFirestore Emulator has exited with code 1`n+  Script exited successfully (code 0)`ni  emulators: Shutting down emulators.`nError: Timed out.`n$CLEANUP_STACK") $fp) $false
Check '41 reordered success marker (script before startup)' (Adj 2 ("+  Script exited successfully (code 0)`nRunning script:`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out.`n$CLEANUP_STACK") $fp) $false
Check '42 fabricated success marker after timeout' (Adj 2 ("Running script:`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT`nError: Timed out.`n$CLEANUP_STACK`n+  Script exited successfully (code 0)") $fp) $false
Check '43 valid exact ordered benign cleanup' (Adj 2 $BENIGN2 $fp) $true
Check '44 exit0 clean exact lifecycle' (Adj 0 $OK $fp) $true
Check '45 exit0 malformed ordering (shutdown before script)' (Adj 0 ("Running script:`ni  emulators: Shutting down emulators.`n+  Script exited successfully (code 0)`n!  Firestore Emulator has exited upon receiving signal: SIGINT") $fp) $false
Check '46 timeout mid-run wrong phase exit0' (Adj 0 ("Running script:`nError: Timed out.`n$CLEANUP_STACK`nTests: 53 passed`n+  Script exited successfully (code 0)`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT") $fp) $false
Check '47 known timeout stack wrong phase (no shutdown) exit2' (Adj 2 ("Running script:`n+  Script exited successfully (code 0)`nError: Timed out.`n$CLEANUP_STACK") $fp) $false
Check '48 known stack with held port' ((& { $hp = Get-FreePort; $ll = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $hp); $ll.Start(); try { Adj 2 $BENIGN2 @($hp) } finally { $ll.Stop() } })) $false
Check '49 known stack with orphan (port residue) proxy' ((& { $hp = Get-FreePort; $ll = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $hp); $ll.Start(); try { Adj 2 $BENIGN2 @($hp) } finally { $ll.Stop() } })) $false
Check '50 multiple cleanup timeout events' (Adj 2 ($OK + "`nError: Timed out.`n$CLEANUP_STACK`nError: Timed out.`n$CLEANUP_STACK`nError: An unexpected error has occurred.") $fp) $false

# ── R5 NEW: whole-log unknown-error policy (Codex blocker 1) ─────────────────────────────────────────────────────
Check '51 exit0 + unknown infra error BEFORE startup' (Adj 0 ("[firestore] ERROR: boot sector unreadable`n" + $OK) $fp) $false
Check '52 exit0 + unknown infra error after startup, before script success' (Adj 0 ($OK -replace 'Test Suites:', "[firestore] ERROR: unclassified protocol state corruption`nTest Suites:") $fp) $false
Check '53 exit0 + exact Codex reproduction line before success' (Adj 0 ($OK -replace 'i  Running script:', "[firestore] ERROR: unclassified protocol state corruption`ni  Running script:") $fp) $false
Check '54 exit0 + unknown error after success' (Adj 0 ($OK -replace '\+  Script exited successfully \(code 0\)', "+  Script exited successfully (code 0)`n[functions] SEVERE: post-success anomaly") $fp) $false
Check '55 exit0 + unknown error during shutdown' (Adj 0 ($OK -replace 'i  firestore: Stopping Firestore Emulator', "i  firestore: Stopping Firestore Emulator`n[firestore] ERROR: shutdown fault") $fp) $false
Check '56 exit0 + Firebase [error] line before success' (Adj 0 ($OK -replace 'i  Running script:', "[firestore] error: lowercase component failure`ni  Running script:") $fp) $false
Check '57 exit0 + Java exception before success' (Adj 0 ($OK -replace 'i  Running script:', "Exception in thread `"main`" java.lang.OutOfMemoryError`ni  Running script:") $fp) $false
Check '58 exit0 + communication failure before success' (Adj 0 ($OK -replace 'i  Running script:', "i  firestore: connect ECONNREFUSED 127.0.0.1:8080`ni  Running script:") $fp) $false

# ── R5 NEW: exact cleanup-timeout proof (Codex blocker 2) ────────────────────────────────────────────────────────
Check '59 exit2 + generic wrapper ONLY' (Adj 2 $WRAPPER_ONLY $fp) $false
Check '60 exit2 + shutdown + generic wrapper, no timeout' (Adj 2 ($OK + "`nError: An unexpected error has occurred.`ni  Found emulator hub locator: {`"pid`":1}") $fp) $false
Check '61 exit2 + unrelated timeout (no cleanup stack)' (Adj 2 ($OK + "`nError: Timed out.`n    at Socket._onTimeout (C:\app\node_modules\net.js:1:1)") $fp) $false
Check '62 exit2 + test timeout string' (Adj 2 ($OK -replace 'Test Suites:', "  * async flow: Timed out. waiting for emulator`nTest Suites:") $fp) $false
Check '63 exit2 + cleanup timeout text without cleanup stack' (Adj 2 ($OK + "`nError: Timed out.") $fp) $false
Check '64 exit2 + cleanup stack before shutdown' (Adj 2 ("i  Running script:`n+  Script exited successfully (code 0)`nError: Timed out.`n$CLEANUP_STACK`ni  emulators: Shutting down emulators.`n!  Firestore Emulator has exited upon receiving signal: SIGINT") $fp) $false
Check '65 exit2 + exact cleanup timeout after shutdown' (Adj 2 $BENIGN2 $fp) $true
Check '66 exit2 + exact timeout + unknown error' (Adj 2 ($BENIGN2 + "`n[firestore] ERROR: late failure") $fp) $false
Check '67 generic wrapper after success but CliExit 0 (default FAIL)' (Adj 0 $WRAPPER_ONLY $fp) $false

# ── R5 NEW: multi-log correlation ────────────────────────────────────────────────────────────────────────────────
$RUNID = 'run-abc123'
$dbgGood = @{ 'firebase-debug.log' = "[debug] $RUNID starting`nError: Timed out.`n$CLEANUP_STACK`n" }
$dbgStale = @{ 'firebase-debug.log' = "[debug] run-OLD999 starting`nError: Timed out.`n$CLEANUP_STACK`n" }
Check '68 exact timeout only in debug log, correlated' (AdjD 2 $OK $fp $dbgGood $RUNID) $true
Check '69 exact timeout in stale/uncorrelated debug log' (AdjD 2 $OK $fp $dbgStale $RUNID) $false
Check '70 debug logs supplied with NO correlation id (ambiguous)' (AdjD 2 $OK $fp @{ 'a.log' = "Error: Timed out.`n$CLEANUP_STACK"; 'b.log' = 'noise' } '') $false
Check '71 correlated debug timeout + held port' ((& { $hp = Get-FreePort; $ll = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $hp); $ll.Start(); try { AdjD 2 $OK @($hp) $dbgGood $RUNID } finally { $ll.Stop() } })) $false

# ── R5 NEW: legitimate test output containing error vocabulary must PASS ─────────────────────────────────────────
Check '72 exit0 + test NAME containing the word error' (Adj 0 ($OK -replace 'Test Suites:', "  * rejects forged token with error`nTest Suites:") $fp) $true
Check '73 exit0 + negative-test console.error assertion' (Adj 0 ($OK -replace 'Test Suites:', "  console.error`n    Error: not-authorized (expected)`nTest Suites:") $fp) $true
Check '74 exit0 + jest tick line mentioning failed expectation' (Adj 0 ($OK -replace 'Test Suites:', "  * throws when signer missing and error is expected`nTest Suites:") $fp) $true
Check '75 exit2 + benign cleanup with test-phase console.error present' (Adj 2 ($BENIGN2 -replace 'Test Suites:', "  console.error forged token rejected: Error: not-authorized`nTest Suites:") $fp) $true
# REAL-WORLD regression (observed against the live P0-04 suite): firebase-functions structured logger record emitted by
# APPLICATION code during a deliberate negative test. Must PASS — it is proof the containment works.
$APPLOG = '{"severity":"ERROR","message":"Webhook signature verification failed: Error: bad signature\n    at Object.<anonymous> (C:\\repo\\functions\\src\\__tests__\\p0-04-legacy-stripe-containment.test.ts:152:61)"}'
Check '76 exit0 + app structured ERROR log originating in a TEST file' (Adj 0 ($OK -replace 'Test Suites:', ($APPLOG + "`nTest Suites:")) $fp) $true
# The same structured shape WITHOUT any test-file origin is infrastructure and must still FAIL closed.
$INFRALOG = '{"severity":"ERROR","message":"Firestore backend channel terminated unexpectedly"}'
Check '77 exit0 + structured ERROR log with NO test origin' (Adj 0 ($OK -replace 'Test Suites:', ($INFRALOG + "`nTest Suites:")) $fp) $false

# ── PORTABLE HELPER RESOLUTION ───────────────────────────────────────────────────────────────────────────────────
Write-Host "=== portable helper-resolution self-tests ==="
$realHelper = Resolve-LifecycleHelper -FromDir $here
$tmp = Join-Path $env:TEMP ('avalo-helper-resolve-' + [guid]::NewGuid().ToString('N'))
$nativeBase = Join-Path $tmp ('native-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $nativeBase 'lib') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $nativeBase 'tests') | Out-Null
Copy-Item -LiteralPath $realHelper -Destination (Join-Path $nativeBase 'lib\EmulatorLifecycle.ps1')
$nThrew = $false; $rn = $null
try { $rn = Resolve-LifecycleHelper -FromDir (Join-Path $nativeBase 'tests') } catch { $nThrew = $true }
Check '76 native layout resolves ..\lib' ((-not $nThrew) -and ((Split-Path (Split-Path $rn -Parent) -Leaf) -eq 'lib')) $true
$flatBase = Join-Path $tmp ('flat-' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Force -Path $flatBase | Out-Null
Copy-Item -LiteralPath $realHelper -Destination (Join-Path $flatBase 'EmulatorLifecycle.ps1')
$flatThrew = $false; $r1 = $null; try { $r1 = Resolve-LifecycleHelper -FromDir $flatBase } catch { $flatThrew = $true }
Check '77 flat portable layout resolves' ((-not $flatThrew) -and ($null -ne $r1) -and (Test-Path -LiteralPath $r1)) $true
Push-Location $env:TEMP
try { $cwdThrew = $false; $r2 = $null; try { $r2 = Resolve-LifecycleHelper -FromDir $flatBase } catch { $cwdThrew = $true }; Check '78 CWD-independent resolution' ((-not $cwdThrew) -and ($r2 -eq $r1)) $true } finally { Pop-Location }
$missBase = Join-Path $tmp ('miss-' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Force -Path $missBase | Out-Null
$missThrew = $false; try { Resolve-LifecycleHelper -FromDir $missBase | Out-Null } catch { $missThrew = $true }
Check '79 missing helper fails closed' $missThrew $true
$ambBase = Join-Path $tmp ('amb-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $ambBase 'lib') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ambBase 'tests') | Out-Null
Copy-Item -LiteralPath $realHelper -Destination (Join-Path $ambBase 'lib\EmulatorLifecycle.ps1')
Set-Content -LiteralPath (Join-Path $ambBase 'tests\EmulatorLifecycle.ps1') -Value '# different content'
$ambThrew = $false; $ambMsg = ''
try { Resolve-LifecycleHelper -FromDir (Join-Path $ambBase 'tests') | Out-Null } catch { $ambThrew = $true; $ambMsg = [string]$_.Exception.Message }
Check '80 ambiguous non-identical candidates fail closed' $ambThrew $true
# R8: "it threw" is not the assertion - WHY it threw is. Under Windows PowerShell 5.1 with a PowerShell 7
# $env:PSModulePath, the old Get-FileHash-based implementation threw CommandNotFoundException here and this
# check passed for a reason that had nothing to do with ambiguity. Bind it to the ambiguity verdict itself.
Check '80b ambiguity rejection cites the ambiguity, not an incidental error' ($ambMsg -like '*LIFECYCLE_HELPER_AMBIGUOUS*') $true
$idBase = Join-Path $tmp ('ident-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path (Join-Path $idBase 'lib') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $idBase 'tests') | Out-Null
Copy-Item -LiteralPath $realHelper -Destination (Join-Path $idBase 'lib\EmulatorLifecycle.ps1')
Copy-Item -LiteralPath $realHelper -Destination (Join-Path $idBase 'tests\EmulatorLifecycle.ps1')
$idThrew = $false; $ri = $null; try { $ri = Resolve-LifecycleHelper -FromDir (Join-Path $idBase 'tests') } catch { $idThrew = $true }
Check '81 byte-identical candidates resolve by precedence' ((-not $idThrew) -and ((Split-Path (Split-Path $ri -Parent) -Leaf) -eq 'lib')) $true
$invThrew = $false; $invResult = $null
try { . (Resolve-LifecycleHelper -FromDir $flatBase); $invResult = Test-EmulatorLifecycleHealthy -CliExit 0 -LogText $OK -Ports $fp -PersistDir $persist } catch { $invThrew = $true }
Check '82 clean flat helper dot-sources and executes' ((-not $invThrew) -and ($invResult -eq $true)) $true

# R8 PERMANENT REGRESSION - Microsoft.PowerShell.Utility shadowing.
# Windows PowerShell 5.1 started from a PowerShell 7 process inherits 7's $env:PSModulePath, resolves
# Microsoft.PowerShell.Utility to the 7.0.0.0 Core module and loses Get-FileHash. Helper discovery must not
# depend on a cmdlet that a parent process can remove. Simulate the removal by hiding the command name and
# proving the resolver still distinguishes identical from non-identical candidates for the right reason.
$shadowOk = $false; $shadowAmbOk = $false
function Get-FileHash { throw 'SHADOWED: Get-FileHash unavailable (simulates 5.1 under a PS7 PSModulePath)' }
try {
  $rs = Resolve-LifecycleHelper -FromDir (Join-Path $idBase 'tests')
  $shadowOk = ((Split-Path (Split-Path $rs -Parent) -Leaf) -eq 'lib')
  $sMsg = ''
  try { Resolve-LifecycleHelper -FromDir (Join-Path $ambBase 'tests') | Out-Null } catch { $sMsg = [string]$_.Exception.Message }
  $shadowAmbOk = ($sMsg -like '*LIFECYCLE_HELPER_AMBIGUOUS*')
} catch { $shadowOk = $false } finally { Remove-Item -LiteralPath Function:\Get-FileHash -Force -ErrorAction SilentlyContinue }
Check '83 helper resolution survives Get-FileHash being unavailable' $shadowOk $true
Check '84 ambiguity still rejected for the right reason without Get-FileHash' $shadowAmbOk $true

try { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force } } catch {}
try { if (Test-Path -LiteralPath $persist) { Remove-Item -LiteralPath $persist -Recurse -Force } } catch {}

Write-Host ""
Write-Host ("LIFECYCLE_ASSERTIONS_EXECUTED={0}" -f $script:asserts)
Write-Host ("LIFECYCLE_ASSERTIONS_FAILED={0}" -f $script:fails)
if ($script:fails -eq 0) {
  Write-Host ("RESULT: EMULATOR_LIFECYCLE_ADJUDICATION_SELFTEST_PASS (VALIDATOR_FALSE_NEGATIVE_ON_EMULATOR_FAILURES=NONE; whole-log+exact-cleanup+portable; {0} assertions)" -f $script:asserts)
  exit 0
} else {
  Write-Host ("RESULT: EMULATOR_LIFECYCLE_ADJUDICATION_SELFTEST_FAIL ({0} of {1} assertions wrong)" -f $script:fails, $script:asserts)
  exit 1
}
