#Requires -Version 5.1
<#
  EmulatorLifecycle.ps1 — shared, READ-ONLY emulator-suite lifecycle adjudicator. (pwsh 5.1/7+.)

  WHY: `firebase emulators:exec` (firebase-tools 15.9.0, Windows) can exit NON-ZERO (observed: 2) from its post-script
  `cleanShutdown()` -> `EmulatorRegistry.stopAll()` -> `withTimeout` (`utils.js:308`) *after* the wrapped jest script
  already exited code 0 and Firestore shut down cleanly on SIGINT. The raw CLI exit code is not a sound proxy for health.

  Test-EmulatorLifecycleHealthy returns $true ONLY on positive proof of a healthy run whose events occur in the correct
  chronological ORDER, with NO unrecognized error ANYWHERE in the log, on EITHER exit 0 or a normalized non-zero exit.

  R5 HARDENING (independent review found two real false-negatives in the previous revision):

    (1) WHOLE-LOG UNKNOWN-ERROR POLICY. The generic error scan previously covered only the region AFTER
        'Script exited successfully'. A pre-success infrastructure error (e.g. '[firestore] ERROR: unclassified
        protocol state corruption') was therefore IGNORED and a broken run adjudicated healthy. The scan now covers the
        ENTIRE log. To avoid false positives from legitimate test output, lines are classified BY SOURCE rather than by
        searching for the bare word "error":
          A. TEST OUTPUT      — jest summaries, ✓/✕ lines, console.* and their indented stack continuations.
                                Never fails the lifecycle: jest JSON adjudication already covers the tests themselves.
          B. INFRASTRUCTURE   — firebase CLI severity/component-prefixed lines, JVM exceptions, CLI-level `Error:` at
                                column 0, transport failures. An error signal here FAILS CLOSED, in any phase.
          C. EXACT BENIGN     — a narrow, exact, phase-checked allowlist (see below).
          D. UNKNOWN          — anything carrying an error signal that is not A or C: FAILS CLOSED.

    (2) EXACT CLEANUP-TIMEOUT PROOF. The generic wrapper line 'An unexpected error has occurred' could previously
        satisfy the benign-cleanup proof on its own, which would normalize an ARBITRARY firebase CLI failure to healthy.
        A non-zero exit is now normalized ONLY with EXACT evidence of the firebase cleanShutdown timeout: the literal
        'Error: Timed out.' accompanied by a firebase-tools cleanup stack frame, occurring AFTER shutdown-begin. The
        generic wrapper is never sufficient by itself and, at exit 0, is not benign at all.

  ORDERED EVENT SEQUENCE (required):
    startupReady < [testSuccess] < scriptSuccess < shutdownBegin < expectedStop           (all runs)
    ... < exactCleanupTimeout <= genericFinalWrapper                                      (normalized non-zero exit only)

  MULTI-LOG: exact cleanup-timeout evidence may live in firebase-debug.log / firestore-debug.log rather than stdout.
  Pass those via -DebugLogs (source-identified). Evidence from a debug log counts ONLY when correlated to this run via
  -RunCorrelationId, so a stale debug log from an earlier invocation can never satisfy a required event.

  Pure function of its arguments + a live port probe (no module-global state -> no cross-validator leakage). It does not
  weaken jest adjudication: callers still independently require jest.success / 0 failed / 0 pending / 0 todo /
  >= minPassed / required named records.
#>

# ── line classification ───────────────────────────────────────────────────────────────────────────────────────────

function Test-EmuLineIsTestOutput {
  # Category A. Produced by the wrapped jest script, never by the emulator infrastructure.
  param([string]$Line)
  return (
    $Line -match '^\s*(PASS|FAIL)\s+\S+' -or
    $Line -match '^\s*(Test Suites|Tests|Snapshots|Time|Ran all test suites)\s*:' -or
    $Line -match '^\s*[✓✔✕✖○●◯]\s' -or
    $Line -match '^\s*console\.(log|error|warn|info|debug)\b' -or
    $Line -match '^\s{2,}at\s' -or                       # indented stack continuation of console output
    $Line -match '^\s*expect\(' -or
    $Line -match '^\s*●\s' -or                      # jest failure bullet
    $Line -match '^\s*(√|×)\s'                           # windows console tick/cross
  )
}

function Test-EmuLineIsAppTestLog {
  <#
    Category A extension: a firebase-functions STRUCTURED logger record ({"severity":"ERROR","message":...}) emitted by
    APPLICATION code that is being exercised by a test. Real negative tests legitimately produce these — e.g. the
    P0-04 legacy-stripe suite deliberately submits a bad webhook signature and the handler logs
    `{"severity":"ERROR","message":"Webhook signature verification failed: ..."}`. That is proof the containment works,
    not an infrastructure fault.

    Admitted ONLY when the record demonstrably originates in a repository TEST file (its message/stack names
    `__tests__`, `*.test.ts` or `*.spec.ts`). A structured severity record that does NOT reference a test file is left
    to the infrastructure path and still fails closed. Emulator-component faults use a different shape entirely
    (`[firestore] ERROR: …`), so the Codex reproduction line is unaffected by this exemption.

    Compensating control: the dedicated whole-log detectors ($startupError / $emulatorCrashed / $commFailure /
    $scriptFailed) scan the RAW log unconditionally and are not subject to any classification, so a genuine
    transport/crash/startup failure still fails even if it appeared inside such a record.
  #>
  param([string]$Line)
  if ($Line -notmatch '"severity"\s*:\s*"') { return $false }
  return ($Line -match '__tests__|\.test\.ts|\.spec\.ts')
}

function Test-EmuLineIsInfrastructure {
  # Category B. Emitted by the firebase CLI, an emulator component, or the JVM.
  param([string]$Line)
  return (
    $Line -match '^\s*[i+!\-]\s' -or
    $Line -match '^\s*⚠' -or
    $Line -match '^\s*\[[a-z0-9_\-]+\]' -or
    $Line -match '^\s*(emulators|firestore|hub|functions|ui|auth|storage|database|pubsub|eventarc|tasks|dataconnect)\s*:' -or
    $Line -match '^Error:\s' -or
    $Line -match 'Exception in thread' -or
    $Line -match '(?i)Caused by:'
  )
}

function Test-EmuLineHasErrorSignal {
  <#
    Does this line carry a genuine error signal? The test is SOURCE-AWARE, which is what makes a whole-log scan
    possible without drowning in false positives:

      * INFRASTRUCTURE lines (firebase CLI severity/component prefixed, JVM, column-0 `Error:`) are held to a broad,
        case-insensitive standard — any error/exception/fatal/severe/failure token fails closed.
      * NON-infrastructure lines (i.e. wrapped-script output that was not already classified as test output) are held
        only to STRONG, unambiguous signals: an UPPERCASE severity token, a column-0 `Error:`, a JVM exception, or a
        transport failure code. This is deliberate: a jest test *named* "rejects forged token with error", or an
        indented `Error: not-authorized (expected)` under `console.error`, must never fail the lifecycle — the jest
        JSON adjudication already covers the tests themselves.

    NOTE: PowerShell `-match` is case-INSENSITIVE; `-cmatch` is required wherever case actually carries the meaning.
  #>
  param([string]$Line, [bool]$IsInfrastructure)
  # strong, unambiguous signals — applied to every line regardless of source
  if ($Line -cmatch '\b(ERROR|SEVERE|FATAL)\b') { return $true }          # UPPERCASE severity token only
  if ($Line -match '^Error:\s') { return $true }                          # CLI-level error at column 0
  if ($Line -match 'Exception in thread') { return $true }
  if ($Line -cmatch '\b(OutOfMemoryError|StackOverflowError|NoClassDefFoundError|NullPointerException)\b') { return $true }
  if ($Line -match '^\s*Caused by:') { return $true }
  if ($Line -cmatch '\b(ECONNREFUSED|EADDRINUSE|DEADLINE_EXCEEDED)\b') { return $true }
  if ($Line -match '(?i)connect ETIMEDOUT') { return $true }
  if ($Line -match '(?i)has exited with code [1-9]') { return $true }
  if ($Line -match '(?i)(could not start|failed to start|could not spawn|could not reach cloud firestore|we were unable to determine|could not find the emulator)') { return $true }
  if ($Line -match '(?i)address already in use') { return $true }
  if ($Line -match '(?i)stopped unexpectedly') { return $true }
  if ($Line -match '(?i)RUNTIME WORKER .*crash') { return $true }
  # broader, case-insensitive standard for infrastructure-sourced lines only
  if ($IsInfrastructure -and ($Line -match '(?i)\b(error|exception|fatal|severe|failure)\b')) { return $true }
  return $false
}

function Test-EmuLineIsExactBenign {
  # Category C. EXACT, narrow allowlist. $AfterShutdown gates the phase-sensitive entries.
  param([string]$Line, [bool]$AfterShutdown, [bool]$CleanupNormalizationAllowed)
  if ($Line -match 'exited upon receiving signal: SIGINT') { return $true }
  if ($Line -match '^\s*i\s+Could not find VSCode notification endpoint') { return $true }
  if ($Line -match '^\s*i\s+Found emulator hub locator') { return $true }
  # The cleanup timeout and its wrapper are benign ONLY during/after shutdown AND only when this run is eligible for
  # cleanup normalization (a non-zero CLI exit). At exit 0 an unexplained wrapper is a real error.
  if ($AfterShutdown -and $CleanupNormalizationAllowed) {
    if ($Line -match '^Error:\s+Timed out\.\s*$') { return $true }
    if ($Line -match '^Error:\s+An unexpected error has occurred\.?\s*$') { return $true }
    if ($Line -match '^\s+at\s+.*firebase-tools') { return $true }
  }
  return $false
}

function Get-EmuExactCleanupTimeoutIndex {
  <#
    EXACT firebase cleanShutdown timeout proof: the literal 'Error: Timed out.' accompanied (within a small window) by a
    firebase-tools cleanup stack frame. Returns the line index of the timeout, or -1.
    Generic wrapper text alone NEVER qualifies. A 'Timed out' string from test code or a network error never qualifies.
  #>
  param([string[]]$Lines)
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    if ($Lines[$i] -match '^Error:\s+Timed out\.\s*$') {
      $hi = [Math]::Min($Lines.Count - 1, $i + 6)
      for ($j = $i + 1; $j -le $hi; $j++) {
        if ($Lines[$j] -match '^\s+at\s' -and $Lines[$j] -match 'firebase-tools' -and
            $Lines[$j] -match '(utils\.js|withTimeout|EmulatorRegistry|commandUtils|cleanShutdown|controller)') {
          return $i
        }
      }
    }
  }
  return -1
}

function Get-EmuLifecycleVerdict {
  # Pure log/exit analysis (no port probe) — used by both the live check and the self-tests. Returns a rich object.
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][int]$CliExit,
    [Parameter(Mandatory)][AllowEmptyString()][string]$Log,
    [hashtable]$DebugLogs,             # source-name -> raw text (firebase-debug.log / firestore-debug.log)
    [string]$RunCorrelationId          # required for debug-log evidence to be admissible
  )

  $log = if ($null -eq $Log) { '' } else { $Log }
  $haveEvidence = ($log.Trim().Length -gt 0)
  $lines = @($log -split "`r?`n")

  function FirstIdx([string]$pattern) {
    for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match $pattern) { return $i } }
    return -1
  }

  # ── event indices (LINE indices; -1 if absent) ──────────────────────────────────────────────────────────────────
  $readyCandidates = @((FirstIdx 'Running script:'), (FirstIdx 'Dev App Server is now running'), (FirstIdx 'Firestore Emulator UI websocket is running')) | Where-Object { $_ -ge 0 }
  $iStartup   = if ($readyCandidates.Count -gt 0) { ($readyCandidates | Measure-Object -Minimum).Minimum } else { -1 }
  $tIdx       = @((FirstIdx 'Test Suites:\s*\d+ passed'), (FirstIdx 'Tests:\s*\d+ passed')) | Where-Object { $_ -ge 0 }
  $iTest      = if ($tIdx.Count -gt 0) { ($tIdx | Measure-Object -Minimum).Minimum } else { -1 }
  $iScript    = FirstIdx 'Script exited successfully \(code 0\)'
  $iShutdown  = FirstIdx 'Shutting down emulators\.'
  $sIdx       = @((FirstIdx 'exited upon receiving signal: SIGINT'), (FirstIdx 'Stopping Firestore Emulator')) | Where-Object { $_ -ge 0 }
  $iStop      = if ($sIdx.Count -gt 0) { ($sIdx | Measure-Object -Minimum).Minimum } else { -1 }
  $iFinalErr  = FirstIdx '^Error:\s+An unexpected error has occurred'
  $iScriptFail= FirstIdx 'Script .*exited with code [1-9]'

  # ── EXACT cleanup-timeout evidence (primary log, then correlated debug logs) ────────────────────────────────────
  $iExactTimeout   = Get-EmuExactCleanupTimeoutIndex -Lines $lines
  $timeoutSource   = if ($iExactTimeout -ge 0) { 'primary' } else { '' }
  $debugCorrelated = $false
  if ($iExactTimeout -lt 0 -and $null -ne $DebugLogs -and $DebugLogs.Count -gt 0) {
    foreach ($srcName in @($DebugLogs.Keys | Sort-Object)) {
      $dtext = [string]$DebugLogs[$srcName]
      if ([string]::IsNullOrWhiteSpace($dtext)) { continue }
      # A debug log is admissible ONLY if it carries this run's correlation id — a stale log can never satisfy an event.
      if ([string]::IsNullOrWhiteSpace($RunCorrelationId) -or ($dtext -notmatch [regex]::Escape($RunCorrelationId))) { continue }
      $dlines = @($dtext -split "`r?`n")
      $di = Get-EmuExactCleanupTimeoutIndex -Lines $dlines
      if ($di -ge 0) {
        # ordering within the primary log is anchored on shutdown-begin; the debug evidence is corroborating
        $iExactTimeout = if ($iShutdown -ge 0) { $iShutdown + 1 } else { -1 }
        $timeoutSource = $srcName; $debugCorrelated = $true
        break
      }
    }
  }
  $ambiguousDebug = $false
  if ($null -ne $DebugLogs -and $DebugLogs.Count -gt 1 -and [string]::IsNullOrWhiteSpace($RunCorrelationId)) { $ambiguousDebug = $true }

  # ── hard failure detectors (whole log, unconditional) ───────────────────────────────────────────────────────────
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

  # ── WHOLE-LOG unknown-error scan (R5). Applies to exit 0 AND non-zero. ──────────────────────────────────────────
  # Cleanup normalization is only ever in play for a non-zero CLI exit; at exit 0 the cleanup wrapper is NOT benign.
  $cleanupNormalizationAllowed = ($CliExit -ne 0)
  $unknownErrorLine = ''
  $lineScanUnknown = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $ln = $lines[$i]
    if ([string]::IsNullOrWhiteSpace($ln)) { continue }
    if (Test-EmuLineIsTestOutput -Line $ln) { continue }                                  # A — never fails the lifecycle
    if (Test-EmuLineIsAppTestLog -Line $ln) { continue }                                  # A — app logger record from a test
    $afterShutdown = ($iShutdown -ge 0 -and $i -ge $iShutdown)
    if (Test-EmuLineIsExactBenign -Line $ln -AfterShutdown $afterShutdown -CleanupNormalizationAllowed $cleanupNormalizationAllowed) { continue }  # C
    $isInfra = Test-EmuLineIsInfrastructure -Line $ln
    if (Test-EmuLineHasErrorSignal -Line $ln -IsInfrastructure $isInfra) {                # B/D — fail closed
      $lineScanUnknown = $true
      $unknownErrorLine = $ln.Trim()
      break
    }
  }

  $midRunTimeout    = ($iExactTimeout -ge 0) -and (($iShutdown -lt 0) -or ($iExactTimeout -lt $iShutdown))
  $midRunUnexpected = ($iFinalErr -ge 0) -and (($iShutdown -lt 0) -or ($iFinalErr -lt $iShutdown))
  $multiTimeout     = ([regex]::Matches($log, '(?m)^Error:\s+Timed out\.\s*$').Count -gt 1)
  $unknownError     = $lineScanUnknown -or $midRunTimeout -or $midRunUnexpected -or $multiTimeout -or $ambiguousDebug

  # ── ordering predicates ─────────────────────────────────────────────────────────────────────────────────────────
  $orderCore = ($iStartup -ge 0) -and ($iScript -gt $iStartup) -and ($iShutdown -gt $iScript) -and ($iStop -gt $iShutdown)
  $testOrder = ($iTest -lt 0) -or ($iTest -le $iScript)
  $shutdownAfterScript = ($iScript -ge 0) -and ($iShutdown -gt $iScript)

  # ── benign cleanup (normalized non-zero exit) — EXACT timeout proof REQUIRED ────────────────────────────────────
  $benignCleanup = $false
  if ($CliExit -ne 0) {
    $timeoutAfterShutdown = ($iExactTimeout -ge 0) -and ($iShutdown -ge 0) -and ($iExactTimeout -gt $iShutdown)
    $wrapperOrderOk       = ($iFinalErr -lt 0) -or ($iFinalErr -ge $iExactTimeout)
    $benignCleanup = $scriptSucceeded -and $orderCore -and $testOrder -and $timeoutAfterShutdown -and
                     $wrapperOrderOk -and (-not $unknownError)
  }
  $cliExitAcceptable = ($CliExit -eq 0) -or $benignCleanup

  $lifecycleOk = $haveEvidence -and $scriptSucceeded -and (-not $scriptFailed) -and (-not $startupError) -and
                 (-not $emulatorCrashed) -and (-not $commFailure) -and (-not $unknownError) -and
                 $orderCore -and $testOrder -and $shutdownAfterScript -and $cliExitAcceptable

  return [pscustomobject]@{
    lifecycleOk = [bool]$lifecycleOk; haveEvidence = $haveEvidence; scriptSucceeded = $scriptSucceeded
    scriptFailed = $scriptFailed; startupError = [bool]$startupError; emulatorCrashed = [bool]$emulatorCrashed
    commFailure = [bool]$commFailure; unknownError = [bool]$unknownError; unknownErrorLine = $unknownErrorLine
    orderCore = $orderCore; testOrder = $testOrder; shutdownAfterScript = $shutdownAfterScript
    benignCleanup = $benignCleanup; exactCleanupTimeout = ($iExactTimeout -ge 0); timeoutSource = $timeoutSource
    debugCorrelated = $debugCorrelated
    idx = "startup=$iStartup test=$iTest script=$iScript shutdown=$iShutdown stop=$iStop exactTimeout=$iExactTimeout finalErr=$iFinalErr"
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
    [hashtable]$DebugLogs,
    [string]$RunCorrelationId,
    [ref]$Reason
  )
  $log = $null
  if ($PSBoundParameters.ContainsKey('LogText') -and $null -ne $LogText) { $log = [string]$LogText }
  elseif ($LogPath -and (Test-Path -LiteralPath $LogPath)) { $log = Get-Content -LiteralPath $LogPath -Raw }
  if ($null -eq $log) { $log = '' }

  $v = Get-EmuLifecycleVerdict -CliExit $CliExit -Log $log -DebugLogs $DebugLogs -RunCorrelationId $RunCorrelationId

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
      $header = ("### emulator-lifecycle adjudication  cliExit={0} healthy={1} benignCleanup={2} exactTimeout={3} src={4} portsReleased={5} [{6}]  ({7})`r`n" -f $CliExit, [bool]$healthy, $v.benignCleanup, $v.exactCleanupTimeout, $v.timeoutSource, $portsReleased, $v.idx, $stamp)
      Set-Content -LiteralPath $persistedPath -Value ($header + $log) -Encoding UTF8
    } catch { $persistedPath = "PERSIST_FAILED:$($_.Exception.Message)" }
  }

  if ($PSBoundParameters.ContainsKey('Reason') -and $null -ne $Reason) {
    $Reason.Value = ("cliExit={0} lifecycleOk={1} scriptOk={2} scriptFail={3} startupErr={4} crash={5} commFail={6} unknownErr={7} unknownLine='{8}' orderCore={9} testOrder={10} benignCleanup={11} exactTimeout={12} src={13} portsReleased={14} [{15}] -> healthy={16}{17}" -f `
        $CliExit, $v.lifecycleOk, $v.scriptSucceeded, $v.scriptFailed, $v.startupError, $v.emulatorCrashed, $v.commFailure, $v.unknownError, $v.unknownErrorLine, $v.orderCore, $v.testOrder, $v.benignCleanup, $v.exactCleanupTimeout, $v.timeoutSource, $portsReleased, $v.idx, [bool]$healthy, $(if ($persistedPath) { " persistedLog=$persistedPath" } else { '' }))
  }
  return [bool]$healthy
}
