#Requires -Version 5.1
<#
  EmulatorLifecycle.ps1 — shared, READ-ONLY emulator-suite lifecycle adjudicator. (pwsh 5.1/7+.)

  WHY: `firebase emulators:exec` (firebase-tools 15.9.0, Windows) can exit NON-ZERO (observed: 2) from its post-script
  `cleanShutdown()` -> `EmulatorRegistry.stopAll()` -> `withTimeout` (`utils.js:308`) *after* the wrapped jest script
  already exited code 0 and Firestore shut down cleanly on SIGINT. The raw CLI exit code is not a sound proxy for health.

  Test-EmulatorLifecycleHealthy returns $true ONLY on positive proof of a healthy run whose events occur in the correct
  chronological (log-index) ORDER, with NO unrecognized error on EITHER exit 0 OR a normalized non-zero exit. A CLI exit 0
  is NOT an unconditional shortcut: an unknown error / crash / comm failure / held port still fails it. A non-zero CLI exit
  is tolerated ONLY when it is provably the benign post-success cleanShutdown timeout, in strict order. UNKNOWN / mis-
  ordered / incomplete evidence FAILS CLOSED. Pure function of its arguments + a live port probe (no module-global state
  -> no cross-validator leakage). It does not weaken jest adjudication: callers still independently require jest.success /
  0 failed / 0 pending / 0 todo / >= minPassed / required named records.

  ORDERED EVENT SEQUENCE (required):
    startupReady < [testSuccess] < scriptSuccess < shutdownBegin < expectedStop   (all runs)
    ... < cleanupTimeout <= finalCliError                                          (normalized non-zero exit only)

  EVIDENCE: on any non-zero CLI exit (a normalization decision) the exact log + verdict is copied to a unique path under
  $PersistDir before the caller cleans up. Path is returned in -Reason.
#>

function Get-EmuLifecycleVerdict {
  # Pure log/exit analysis (no port probe) — used by both the live check and the self-tests. Returns a rich object.
  [CmdletBinding()]
  param([Parameter(Mandatory)][int]$CliExit, [Parameter(Mandatory)][AllowEmptyString()][string]$Log)

  $log = if ($null -eq $Log) { '' } else { $Log }
  $haveEvidence = ($log.Trim().Length -gt 0)

  function FirstIdx([string]$pattern) {
    $m = [regex]::Match($log, $pattern); if ($m.Success) { return $m.Index } else { return -1 }
  }
  # ── event indices (first occurrence; -1 if absent) ──────────────────────────────────────────────────────────────
  $iStartup   = [Math]::Max((FirstIdx 'Running script:'), [Math]::Max((FirstIdx 'Dev App Server is now running'), [Math]::Max((FirstIdx 'Firestore Emulator UI websocket is running'), (FirstIdx 'Starting emulators'))))
  # startup-ready: the earliest of the ready markers that is present
  $readyCandidates = @((FirstIdx 'Running script:'), (FirstIdx 'Dev App Server is now running'), (FirstIdx 'Firestore Emulator UI websocket is running')) | Where-Object { $_ -ge 0 }
  $iStartup = if ($readyCandidates.Count -gt 0) { ($readyCandidates | Measure-Object -Minimum).Minimum } else { -1 }
  $iTest      = [Math]::Max((FirstIdx 'Test Suites:\s*\d+ passed'), (FirstIdx 'Tests:\s*\d+ passed'))
  $iScript    = FirstIdx 'Script exited successfully \(code 0\)'
  $iShutdown  = FirstIdx 'Shutting down emulators\.'
  $iStop      = [Math]::Max((FirstIdx 'exited upon receiving signal: SIGINT'), (FirstIdx 'Stopping Firestore Emulator'))
  $iTimeout   = FirstIdx 'Timed out\.'
  $iFinalErr  = FirstIdx 'An unexpected error has occurred'
  $iScriptFail= FirstIdx 'Script .*exited with code [1-9]'

  # ── hard failure detectors ──────────────────────────────────────────────────────────────────────────────────────
  $scriptSucceeded = ($iScript -ge 0)
  $scriptFailed    = ($iScriptFail -ge 0)
  $startupError = ($log -match 'Could not start' -or $log -match 'address already in use' -or $log -match 'EADDRINUSE' -or
                   $log -match 'Port \d+ is not open' -or $log -match 'is already in use' -or $log -match 'Could not spawn' -or
                   $log -match 'Failed to start' -or $log -match 'We were unable to determine' -or
                   $log -match 'Could not find the emulator' -or $log -match 'download.*emulator.*fail')
  $emulatorCrashed = ($log -match 'Emulator has exited with code [1-9]' -or $log -match 'has exited with code [1-9]' -or
                      $log -match 'RUNTIME WORKER .*crash' -or $log -match 'emulator .* stopped unexpectedly' -or
                      $log -match 'Exception in thread .*main' -or $log -match 'OutOfMemoryError' -or $log -match 'java(\.exe)? .*(crash|terminated|killed)')
  $commFailure = ($log -match 'ECONNREFUSED' -or $log -match 'connect ETIMEDOUT' -or $log -match 'DEADLINE_EXCEEDED' -or
                  $log -match 'Could not reach Cloud Firestore backend' -or $log -match 'FIRESTORE_EMULATOR_HOST.*unreachable')

  # ── UNKNOWN-ERROR scan (applies to BOTH exit 0 and exit 2). A line with a real error token that is not on the exact
  #    benign whitelist fails closed. Word-boundaried tokens so the demo-project "…will fail" notice does NOT match. The
  #    cleanup tokens ('Timed out.' / 'An unexpected error has occurred') are benign ONLY when they occur DURING/AFTER
  #    shutdown-begin; a mid-run occurrence (before shutdown, or with no shutdown) is a real error and fails closed. More
  #    than one cleanup-timeout event is never normalized. ────────────────────────────────────────────────────────────
  $benign = @('Timed out\.', 'An unexpected error has occurred', 'Could not find VSCode notification endpoint',
    'Found emulator hub locator', 'Connection reset', 'SocketException', 'onUnhandledInboundException', 'exceptionCaught',
    'receiving signal: SIGINT', 'reason: \.')
  # The generic error-token scan is restricted to the POST-script-success region (shutdown/cleanup phase). Error-path
  # test console output occurs DURING test execution (before 'Script exited successfully') and must not fail the
  # lifecycle — the jest-JSON adjudication + the success marker already prove the tests themselves passed. Genuine
  # infrastructure failures at any phase are still caught by the dedicated detectors ($startupError / $emulatorCrashed /
  # $commFailure / $scriptFailed), which scan the whole log. If there is no success marker, scan the whole log (fails).
  $scanRegion = if ($iScript -ge 0) { $log.Substring($iScript) } else { $log }
  $lineScanUnknown = $false
  foreach ($line in ($scanRegion -split "`n")) {
    if ($line -match '(?i)\berror\b|\bexception\b|\bfatal\b|\bfailed\b|\bpanic\b') {
      $ok = $false
      foreach ($b in $benign) { if ($line -match $b) { $ok = $true; break } }
      if (-not $ok) { $lineScanUnknown = $true; break }
    }
  }
  $midRunTimeout    = ($iTimeout -ge 0) -and (($iShutdown -lt 0) -or ($iTimeout -lt $iShutdown))       # timeout before shutdown -> real
  $midRunUnexpected = ($iFinalErr -ge 0) -and (($iShutdown -lt 0) -or ($iFinalErr -lt $iShutdown))     # unexpected-error before shutdown -> real
  $multiTimeout     = ([regex]::Matches($log, 'Timed out\.').Count -gt 1)                               # more than one cleanup timeout -> not normalizable
  $unknownError = $lineScanUnknown -or $midRunTimeout -or $midRunUnexpected -or $multiTimeout

  # ── ordering predicates ─────────────────────────────────────────────────────────────────────────────────────────
  $orderCore = ($iStartup -ge 0) -and ($iScript -gt $iStartup) -and ($iShutdown -gt $iScript) -and ($iStop -gt $iShutdown)
  $testOrder = ($iTest -lt 0) -or ($iTest -le $iScript)   # if a jest completion line exists it must precede script-success
  $shutdownAfterScript = ($iScript -ge 0) -and ($iShutdown -gt $iScript)

  # ── benign-cleanup (normalized non-zero exit) ordering ──────────────────────────────────────────────────────────
  $benignCleanup = $false
  if ($CliExit -ne 0) {
    # The benign firebase cleanup exit is signalled by a cleanup indicator occurring AFTER shutdown-begin: the shutdown
    # 'Timed out.' AND/OR the final 'An unexpected error has occurred.' wrapper. On real runs the 'Timed out.' line is
    # frequently written only to firestore-debug.log, so the ordered post-shutdown final-error wrapper alone qualifies.
    $cleanupAfterShutdown = ((($iTimeout -ge 0) -and ($iTimeout -gt $iShutdown)) -or (($iFinalErr -ge 0) -and ($iFinalErr -gt $iShutdown)))
    $benignCleanup = $scriptSucceeded -and $orderCore -and $testOrder -and $cleanupAfterShutdown -and (-not $unknownError)
  }
  $cliExitAcceptable = ($CliExit -eq 0) -or $benignCleanup

  $lifecycleOk = $haveEvidence -and $scriptSucceeded -and (-not $scriptFailed) -and (-not $startupError) -and
                 (-not $emulatorCrashed) -and (-not $commFailure) -and (-not $unknownError) -and
                 $orderCore -and $testOrder -and $shutdownAfterScript -and $cliExitAcceptable

  return [pscustomobject]@{
    lifecycleOk = [bool]$lifecycleOk; haveEvidence = $haveEvidence; scriptSucceeded = $scriptSucceeded
    scriptFailed = $scriptFailed; startupError = [bool]$startupError; emulatorCrashed = [bool]$emulatorCrashed
    commFailure = [bool]$commFailure; unknownError = $unknownError; orderCore = $orderCore; testOrder = $testOrder
    shutdownAfterScript = $shutdownAfterScript; benignCleanup = $benignCleanup
    idx = "startup=$iStartup test=$iTest script=$iScript shutdown=$iShutdown stop=$iStop timeout=$iTimeout finalErr=$iFinalErr"
  }
}

function Test-EmulatorLifecycleHealthy {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][int]$CliExit,
    [string]$LogPath,
    [string]$LogText,
    [int[]]$Ports = @(8080, 4400, 9150),
    [string]$PersistDir = (Join-Path $env:TEMP 'avalo-emu-lifecycle'),
    [string]$Label = 'emu',
    [ref]$Reason
  )
  $log = $null
  if ($PSBoundParameters.ContainsKey('LogText') -and $null -ne $LogText) { $log = [string]$LogText }
  elseif ($LogPath -and (Test-Path -LiteralPath $LogPath)) { $log = Get-Content -LiteralPath $LogPath -Raw }
  if ($null -eq $log) { $log = '' }

  $v = Get-EmuLifecycleVerdict -CliExit $CliExit -Log $log

  # ── ports released (live probe; short settle for Windows TIME_WAIT != LISTEN) ────────────────────────────────────
  $portsReleased = $false
  for ($i = 0; $i -lt 3; $i++) {
    $busy = @(Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue)
    if ($busy.Count -eq 0) { $portsReleased = $true; break }
    Start-Sleep -Milliseconds 500
  }

  $healthy = $v.lifecycleOk -and $portsReleased

  $persistedPath = ''
  if ($CliExit -ne 0) {
    try {
      if (-not (Test-Path -LiteralPath $PersistDir)) { New-Item -ItemType Directory -Force -Path $PersistDir | Out-Null }
      $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ')
      $persistedPath = Join-Path $PersistDir ("{0}-{1}-{2}.log" -f $Label, $stamp, ([guid]::NewGuid().ToString('N')))
      $header = ("### emulator-lifecycle adjudication  cliExit={0} healthy={1} benignCleanup={2} portsReleased={3} [{4}]  ({5})`r`n" -f $CliExit, [bool]$healthy, $v.benignCleanup, $portsReleased, $v.idx, $stamp)
      Set-Content -LiteralPath $persistedPath -Value ($header + $log) -Encoding UTF8
    } catch { $persistedPath = "PERSIST_FAILED:$($_.Exception.Message)" }
  }

  if ($PSBoundParameters.ContainsKey('Reason') -and $null -ne $Reason) {
    $Reason.Value = ("cliExit={0} lifecycleOk={1} scriptOk={2} scriptFail={3} startupErr={4} crash={5} commFail={6} unknownErr={7} orderCore={8} testOrder={9} benignCleanup={10} portsReleased={11} [{12}] -> healthy={13}{14}" -f `
        $CliExit, $v.lifecycleOk, $v.scriptSucceeded, $v.scriptFailed, $v.startupError, $v.emulatorCrashed, $v.commFailure, $v.unknownError, $v.orderCore, $v.testOrder, $v.benignCleanup, $portsReleased, $v.idx, [bool]$healthy, $(if ($persistedPath) { " persistedLog=$persistedPath" } else { '' }))
  }
  return [bool]$healthy
}
