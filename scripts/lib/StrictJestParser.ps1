#Requires -Version 5.1
<#
  StrictJestParser.ps1 — shared, immutable, fail-closed adjudication of a Jest `--json` report. (pwsh 5.1/7+.)

  WHY: independent review found that validators were accepting a Jest report on weak evidence —
    * a missing numeric field silently became 0;
    * `"success": 1` compared as true;
    * `"numPassedTests": "53"` (a STRING) was accepted by numeric comparison;
    * required security assertions were matched by SUBSTRING, so ONE combined test name could satisfy several
      requirements, and a duplicate record could mask a missing one;
    * the native jest process exit code was not required to be 0;
    * there was no binding to the expected source test file, so counts from another suite could satisfy the gate.

  R6 REPAIR — a second independent review (Codex, against the R5 bundle) reproduced THREE further bypasses. All
  three shared one root cause: the global counters were validated for TYPE and ARITHMETIC but were never reconciled
  against the assertion records that physically exist. The declared numbers and the physical evidence were two
  independent universes, and only the declared ones gated the security decision:

    A. counters claimed 4 passed while only 2 assertion records existed          -> was ACCEPTED, now REJECTED
    B. the expected file supplied the required names; an UNRELATED second test
       file supplied the remaining records needed to reach the declared total    -> was ACCEPTED, now REJECTED
    C. the expected file appeared in TWO result objects with the required
       evidence split across them                                                -> was ACCEPTED, now REJECTED

  This matters because the security callers require a large total (53 / 54) but only a smaller set of named
  assertions (16 / 17). Everything outside the named set was previously unconstrained: a report could satisfy the
  gate while most of the suite it claimed to represent had never run.

  This module is the single strict implementation. It performs NO parsing shortcuts and has NO mutable module state,
  no wildcard discovery, and no environment-variable bypass. Every check is fail-closed: anything not positively
  proven is a rejection. Callers keep their own additional gates; this never relaxes them.

  TYPE DISCIPLINE: after ConvertFrom-Json a JSON `true` is [bool], `1` is [int]/[long] and `"1"` is [string].
  Booleans are therefore required to be [bool] and counts required to be [int]/[long]; a string or a boolean in a
  numeric slot is a rejection rather than something to coerce.

  RECORD DISCIPLINE (the R6 repair): every declared counter must equal the number of assertion records that actually
  carry the corresponding status, the expected test file must appear in EXACTLY ONE result object, and no other test
  file may be present at all. Declared numbers are treated as a claim to be checked against physical records, never
  as evidence in themselves.
#>

function Test-SjpTrustedParserIdentity {
  <#
    R7 (Codex finding 7). Both security validators used to decide whether to load this file by asking whether
    a command of that NAME already existed:

        if (-not (Get-Command Get-SjpStrictReport -ErrorAction SilentlyContinue)) { . <parser> }

    Command existence is not identity. Any pre-existing function of that name — including a forged one that
    returns ok = $true for a report file that does not even exist — suppressed the load and adjudicated the
    security gate instead. IAM-01B1 invokes IAM-01A in the SAME process, so ambient state propagates across
    the nested call.

    The load itself MUST happen in the caller's own scope (dot-sourcing inside a function would define the
    parser in that function's scope and lose it on return), so callers follow this exact sequence:

        1. resolve the trusted parser PATH explicitly — never ambient availability;
        2. evict any existing Get-SjpStrictReport / Test-Sjp* definitions;
        3. dot-source the trusted path unconditionally;
        4. call this function and FAIL CLOSED if it returns $false.

    This function proves the loaded command actually originates from the trusted file on disk.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$ParserPath,
    [string]$ExpectedSha256 = ''
  )
  if (-not (Test-Path -LiteralPath $ParserPath -PathType Leaf)) {
    Write-Host "  TRUSTED_PARSER_IDENTITY_FAIL: file not found: $ParserPath"; return $false
  }
  if ($ExpectedSha256) {
    $actual = (Get-FileHash -LiteralPath $ParserPath -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actual -ne $ExpectedSha256.ToUpperInvariant()) {
      Write-Host "  TRUSTED_PARSER_IDENTITY_FAIL: hash mismatch ($actual)"; return $false
    }
  }
  $cmd = Get-Command Get-SjpStrictReport -CommandType Function -ErrorAction SilentlyContinue
  if (-not $cmd) { Write-Host '  TRUSTED_PARSER_IDENTITY_FAIL: function absent after load'; return $false }
  $file = if ($cmd.ScriptBlock -and $cmd.ScriptBlock.File) { $cmd.ScriptBlock.File } else { '' }
  if (-not $file) { Write-Host '  TRUSTED_PARSER_IDENTITY_FAIL: command has no source file (defined in-session)'; return $false }
  $resolvedLoaded  = (Resolve-Path -LiteralPath $file).Path
  $resolvedTrusted = (Resolve-Path -LiteralPath $ParserPath).Path
  if ($resolvedLoaded -ne $resolvedTrusted) {
    Write-Host "  TRUSTED_PARSER_IDENTITY_FAIL: loaded from '$resolvedLoaded', expected '$resolvedTrusted'"; return $false
  }
  return $true
}

function Test-SjpHasProperty {
  param([Parameter(Mandatory)]$Object, [Parameter(Mandatory)][string]$Name)
  if ($null -eq $Object) { return $false }
  if ($Object -isnot [psobject]) { return $false }
  return (@($Object.PSObject.Properties | Where-Object { $_.Name -ceq $Name }).Count -eq 1)
}

function Test-SjpIsStrictBool {
  param($Value)
  return ($Value -is [bool])
}

function Test-SjpIsStrictInt {
  param($Value)
  if ($Value -is [bool]) { return $false }          # [bool] must never satisfy a numeric slot
  return (($Value -is [int]) -or ($Value -is [long]) -or ($Value -is [int16]) -or ($Value -is [uint32]))
}

function Get-SjpStrictReport {
  <#
    Adjudicates a Jest --json report. Returns an object with .ok ([bool]) and .errors (string[]).
    EVERY parameter that can be checked is checked; nothing defaults.

      -JsonPath           report written by `jest --json --outputFile`
      -NativeExit         the real exit code of the jest process (MUST be 0)
      -RunStartedUtc      freshness floor: the report must have been written at/after this instant
      -ExpectedTestFile   leaf file name the assertions must come from (exact, case-insensitive leaf match)
      -MinPassed          minimum passed tests
      -ExpectedPassed     exact expected passed count (0 = not enforced)
      -ExpectedTotalTests exact expected total count (0 = not enforced)
      -RequiredAssertions exact fullName strings; each must match EXACTLY ONE passed record in the expected file
      -AllowPending/-AllowTodo  policy (default: neither permitted)

    R6 strictness switches. All three default to the STRICTEST behaviour; a caller must opt OUT deliberately and
    in writing. Security validators must never pass $false. There is currently no non-security caller.

      -RequireSingleTestResult          the report must contain exactly ONE test result object, and it must be the
                                        expected file. Closes bypass B (extra file) and bypass C (split file).
      -RequireExactAssertionRecordCount every declared counter must equal the physical record tally. Closes bypass A.
      -RequireExpectedFileUnique        the expected file must appear in exactly one result object.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$JsonPath,
    [Parameter(Mandatory)][int]$NativeExit,
    [Parameter(Mandatory)][datetime]$RunStartedUtc,
    [Parameter(Mandatory)][string]$ExpectedTestFile,
    [int]$MinPassed = 1,
    [int]$ExpectedPassed = 0,
    [int]$ExpectedTotalTests = 0,
    [string[]]$RequiredAssertions = @(),
    [bool]$AllowPending = $false,
    [bool]$AllowTodo = $false,
    [bool]$RequireSingleTestResult = $true,
    [bool]$RequireExactAssertionRecordCount = $true,
    [bool]$RequireExpectedFileUnique = $true
  )
  $errors = New-Object System.Collections.Generic.List[string]

  # ── CALLER INPUT CONTRACT, validated BEFORE any report evidence is consumed ────────────────────────────────────
  # R7 (Codex finding 4): the caller's required-name list was trusted implicitly. If a caller supplied the same
  # name twice, ONE physical assertion satisfied BOTH slots — a 17-entry table could be silently backed by 16
  # records. The requirement list is an input to a security decision, so it is validated like any other input,
  # and it is validated first: evidence must never be consulted to excuse a malformed contract.
  $seenReq = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
  for ($i = 0; $i -lt $RequiredAssertions.Count; $i++) {
    $rq = $RequiredAssertions[$i]
    if ($null -eq $rq)                                  { $errors.Add("required_assertions_input_null:index$i"); continue }
    if ($rq -isnot [string])                            { $errors.Add("required_assertions_input_not_string:index$i"); continue }
    if ([string]::IsNullOrWhiteSpace([string]$rq))      { $errors.Add("required_assertions_input_empty:index$i"); continue }
    if (-not $seenReq.Add([string]$rq))                 { $errors.Add("required_assertions_input_duplicate:$rq") }
  }

  # ── native process exit is mandatory ───────────────────────────────────────────────────────────────────────────
  if ($NativeExit -ne 0) { $errors.Add("native_jest_exit_nonzero:$NativeExit") }

  # ── report must exist and be fresh (current run) ───────────────────────────────────────────────────────────────
  if (-not (Test-Path -LiteralPath $JsonPath)) {
    $errors.Add('report_missing')
    return [pscustomobject]@{ ok = $false; errors = $errors.ToArray() }
  }
  $mtime = (Get-Item -LiteralPath $JsonPath).LastWriteTimeUtc
  if ($mtime -lt $RunStartedUtc.AddSeconds(-2)) { $errors.Add("report_stale:$($mtime.ToString('o'))<$($RunStartedUtc.ToString('o'))") }

  # ── parse (a malformed report is a rejection, never an empty default) ──────────────────────────────────────────
  $raw = Get-Content -LiteralPath $JsonPath -Raw
  $j = $null
  try { $j = $raw | ConvertFrom-Json -ErrorAction Stop } catch { $errors.Add('report_unparseable') }
  if ($null -eq $j) { return [pscustomobject]@{ ok = $false; errors = $errors.ToArray() } }
  if ($j -isnot [psobject] -or $j -is [array]) { $errors.Add('root_not_object'); return [pscustomobject]@{ ok = $false; errors = $errors.ToArray() } }

  # ── schema: presence AND type. No coercion, no missing-field-defaults-to-zero. ─────────────────────────────────
  if (-not (Test-SjpHasProperty $j 'success')) { $errors.Add('missing:success') }
  elseif (-not (Test-SjpIsStrictBool $j.success)) { $errors.Add("success_not_boolean:$($j.success.GetType().Name)") }

  $countFields = @('numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests')
  $counts = @{}
  foreach ($f in $countFields) {
    if (-not (Test-SjpHasProperty $j $f)) { $errors.Add("missing:$f"); continue }
    $v = $j.$f
    if (-not (Test-SjpIsStrictInt $v)) { $errors.Add("${f}_not_integer:$(if ($null -eq $v) { 'null' } else { $v.GetType().Name })"); continue }
    if ([int64]$v -lt 0) { $errors.Add("${f}_negative:$v"); continue }
    $counts[$f] = [int64]$v
  }

  if (-not (Test-SjpHasProperty $j 'testResults')) { $errors.Add('missing:testResults') }
  elseif ($j.testResults -isnot [array]) { $errors.Add('testResults_not_array') }

  # ── arithmetic consistency + success semantics ─────────────────────────────────────────────────────────────────
  if ($counts.Count -eq $countFields.Count) {
    $sum = $counts['numPassedTests'] + $counts['numFailedTests'] + $counts['numPendingTests'] + $counts['numTodoTests']
    if ($sum -ne $counts['numTotalTests']) { $errors.Add("count_sum_mismatch:$sum!=$($counts['numTotalTests'])") }
    if ($counts['numFailedTests'] -ne 0) { $errors.Add("failed_nonzero:$($counts['numFailedTests'])") }
    if ((-not $AllowPending) -and $counts['numPendingTests'] -ne 0) { $errors.Add("pending_not_permitted:$($counts['numPendingTests'])") }
    if ((-not $AllowTodo) -and $counts['numTodoTests'] -ne 0) { $errors.Add("todo_not_permitted:$($counts['numTodoTests'])") }
    if ($counts['numPassedTests'] -lt $MinPassed) { $errors.Add("passed_below_minimum:$($counts['numPassedTests'])<$MinPassed") }
    if ($ExpectedPassed -gt 0 -and $counts['numPassedTests'] -ne $ExpectedPassed) { $errors.Add("passed_not_exact:$($counts['numPassedTests'])!=$ExpectedPassed") }
    if ((Test-SjpIsStrictBool $j.success) -and ($j.success -ne ($counts['numFailedTests'] -eq 0))) { $errors.Add('success_inconsistent_with_failed') }
  }

  # ── enumerate result objects: file identity FIRST, records second ──────────────────────────────────────────────
  # Bypasses B and C were possible because file identity was used only as a filter ("skip records from other
  # files") and never as an assertion ("no other file may exist", "the expected file appears once"). A filter
  # silently tolerates what it skips. These are now cardinality assertions.
  $passedNames     = New-Object System.Collections.Generic.List[string]
  $expectedObjects = 0
  $foreignLeaves   = New-Object System.Collections.Generic.List[string]
  $physicalObjects = 0
  $suiteStates     = New-Object System.Collections.Generic.List[psobject]
  # Physical tallies across the WHOLE report, used to reconcile every declared counter.
  $recTotal = 0; $recPassed = 0; $recFailed = 0; $recPending = 0; $recTodo = 0
  # Jest assertion statuses. Anything outside this set is unknown semantics and therefore a rejection: a status
  # this parser cannot classify must never be silently ignored, because ignoring it is what "counts as passed".
  #
  # R7 (Codex finding 2): this MUST be an ordinal dictionary. A PowerShell hashtable literal is
  # case-INSENSITIVE, so `$STATUS_BUCKET.ContainsKey('PASSED')` returned $true and "PASSED" was silently
  # treated as "passed". Jest emits lower-case status values; any other casing is not a Jest status and must
  # fail closed rather than be normalised into one.
  $STATUS_BUCKET = New-Object 'System.Collections.Generic.Dictionary[string,string]' ([System.StringComparer]::Ordinal)
  $STATUS_BUCKET.Add('passed',   'passed')
  $STATUS_BUCKET.Add('failed',   'failed')
  $STATUS_BUCKET.Add('pending',  'pending')
  $STATUS_BUCKET.Add('skipped',  'pending')
  $STATUS_BUCKET.Add('disabled', 'pending')
  $STATUS_BUCKET.Add('todo',     'todo')

  if ((Test-SjpHasProperty $j 'testResults') -and ($j.testResults -is [array])) {
    foreach ($tr in $j.testResults) {
      $physicalObjects++
      if (-not (Test-SjpHasProperty $tr 'name')) { $errors.Add('testResult_missing_name'); continue }
      if ($tr.name -isnot [string]) { $errors.Add('testResult_name_not_string'); continue }
      if ([string]::IsNullOrWhiteSpace([string]$tr.name)) { $errors.Add('testResult_name_empty'); continue }
      $leaf = ''
      try { $leaf = Split-Path -Leaf ([string]$tr.name) } catch { $leaf = '' }
      if ([string]::IsNullOrWhiteSpace($leaf)) { $errors.Add('testResult_name_unparseable'); continue }
      # Windows paths are case-insensitive, so the comparison is too; two objects differing only in case are
      # therefore BOTH the expected file, and the uniqueness assertion below rejects that ambiguity.
      $isExpected = ($leaf -ieq $ExpectedTestFile)
      if ($isExpected) { $expectedObjects++ } else { $foreignLeaves.Add($leaf) }

      if (-not (Test-SjpHasProperty $tr 'assertionResults')) { $errors.Add('testResult_missing_assertionResults'); continue }
      if ($tr.assertionResults -isnot [array]) { $errors.Add('assertionResults_not_array'); continue }

      # Per-suite tallies, so the suite-level counters below reconcile against physical records too.
      $sTotal = 0; $sPassed = 0; $sFailed = 0; $sPending = 0; $sTodo = 0
      foreach ($ar in $tr.assertionResults) {
        $recTotal++; $sTotal++
        # R7 (Codex finding 6): a null record must be identified STRUCTURALLY. Previously it reached
        # Test-SjpHasProperty, whose mandatory parameter threw a binding exception — the rejection was a
        # PowerShell accident rather than a schema decision, and an accident is not a security control.
        if ($null -eq $ar)          { $errors.Add('assertion_record_null'); continue }
        if ($ar -isnot [psobject])  { $errors.Add('assertion_record_not_object'); continue }
        if (-not (Test-SjpHasProperty $ar 'fullName')) { $errors.Add('assertion_missing_fullName'); continue }
        if (-not (Test-SjpHasProperty $ar 'status'))   { $errors.Add('assertion_missing_status');   continue }
        if ($ar.fullName -isnot [string]) { $errors.Add('assertion_fullName_not_string'); continue }
        if ($ar.status   -isnot [string]) { $errors.Add('assertion_status_not_string');   continue }
        # R7 (Codex finding 3): an empty or whitespace fullName is not an identity. Every record is schema
        # checked, including records nobody requires — "not required" is not a reason to ignore malformed
        # evidence, because the malformed record still counts toward the totals that gate the decision.
        if ([string]::IsNullOrWhiteSpace([string]$ar.fullName)) { $errors.Add('assertion_fullName_empty'); continue }
        $st = [string]$ar.status
        if (-not $STATUS_BUCKET.ContainsKey($st)) { $errors.Add("assertion_status_unsupported:$st"); continue }
        switch ($STATUS_BUCKET[$st]) {
          'passed'  { $recPassed++;  $sPassed++ }
          'failed'  { $recFailed++;  $sFailed++ }
          'pending' { $recPending++; $sPending++ }
          'todo'    { $recTodo++;    $sTodo++ }
        }
        # Only the expected file may contribute evidence toward the required-assertion set.
        if ($isExpected -and $st -ceq 'passed') { $passedNames.Add([string]$ar.fullName) }
      }
      $suiteStates.Add([pscustomobject]@{ Total = $sTotal; Passed = $sPassed; Failed = $sFailed; Pending = $sPending; Todo = $sTodo })
    }
  }

  # ── INVARIANT: the expected test file is present exactly once ──────────────────────────────────────────────────
  if ($expectedObjects -eq 0) { $errors.Add("expected_test_file_absent:$ExpectedTestFile") }
  elseif ($RequireExpectedFileUnique -and $expectedObjects -ne 1) {
    $errors.Add("expected_test_file_result_objects_not_unique:$expectedObjects")   # bypass C
  }

  # ── INVARIANT: no other test file may be present at all ────────────────────────────────────────────────────────
  if ($RequireSingleTestResult) {
    foreach ($f in (@($foreignLeaves) | Sort-Object -Unique)) { $errors.Add("unexpected_test_file:$f") }   # bypass B
    if ($physicalObjects -ne 1) { $errors.Add("test_result_object_count_not_one:$physicalObjects") }
  }

  # ── INVARIANT: declared counters must equal the PHYSICAL assertion records ─────────────────────────────────────
  # This is the repair for bypass A, and it is what makes the declared totals mean anything at all: a number that
  # is never compared to a record is not evidence, it is an assertion by whoever wrote the file.
  if ($RequireExactAssertionRecordCount -and $counts.Count -eq $countFields.Count) {
    if ($recTotal   -ne $counts['numTotalTests'])   { $errors.Add("record_total_mismatch:$recTotal!=$($counts['numTotalTests'])") }
    if ($recPassed  -ne $counts['numPassedTests'])  { $errors.Add("record_passed_mismatch:$recPassed!=$($counts['numPassedTests'])") }
    if ($recFailed  -ne $counts['numFailedTests'])  { $errors.Add("record_failed_mismatch:$recFailed!=$($counts['numFailedTests'])") }
    if ($recPending -ne $counts['numPendingTests']) { $errors.Add("record_pending_mismatch:$recPending!=$($counts['numPendingTests'])") }
    if ($recTodo    -ne $counts['numTodoTests'])    { $errors.Add("record_todo_mismatch:$recTodo!=$($counts['numTodoTests'])") }
  }
  if ($ExpectedTotalTests -gt 0 -and $recTotal -ne $ExpectedTotalTests) {
    $errors.Add("record_total_not_exact:$recTotal!=$ExpectedTotalTests")
  }

  # ── INVARIANT: ALL declared suite counters must reconcile with the physical result objects ─────────────────────
  # R7 (Codex finding 5): R6 reconciled only numTotalTestSuites and numPassedTestSuites, so a report could
  # declare numFailedTestSuites = 1 while every physical record passed, and still be accepted. A counter that
  # is read but never checked is worse than one that is absent, because it looks like coverage.
  #
  # Each Jest suite counter is bound to a physical quantity derived from the records themselves:
  #   numTotalTestSuites        = number of testResults objects
  #   numPassedTestSuites       = suites whose records all passed
  #   numFailedTestSuites       = suites containing at least one failed record
  #   numPendingTestSuites      = suites whose records are all pending/skipped/disabled/todo
  #   numRuntimeErrorTestSuites = suites that failed to execute; never present in accepted evidence
  $suitesPassed = 0; $suitesFailed = 0; $suitesPending = 0
  foreach ($st in $suiteStates) {
    if ($st.Failed -gt 0) { $suitesFailed++ }
    elseif ($st.Total -gt 0 -and $st.Passed -eq $st.Total) { $suitesPassed++ }
    elseif ($st.Total -gt 0 -and ($st.Pending + $st.Todo) -eq $st.Total) { $suitesPending++ }
  }
  $suiteExpect = @{
    'numTotalTestSuites'        = $physicalObjects
    'numPassedTestSuites'       = $suitesPassed
    'numFailedTestSuites'       = $suitesFailed
    'numPendingTestSuites'      = $suitesPending
    'numRuntimeErrorTestSuites' = 0
  }
  foreach ($sf in @('numTotalTestSuites','numPassedTestSuites','numFailedTestSuites','numPendingTestSuites','numRuntimeErrorTestSuites')) {
    if (Test-SjpHasProperty $j $sf) {
      if (-not (Test-SjpIsStrictInt $j.$sf)) { $errors.Add("${sf}_not_integer"); continue }
      if ([int64]$j.$sf -lt 0) { $errors.Add("${sf}_negative:$($j.$sf)"); continue }
      if ([int64]$j.$sf -ne $suiteExpect[$sf]) { $errors.Add("${sf}_mismatch:$($j.$sf)!=$($suiteExpect[$sf])") }
    }
  }

  # ── required assertions: EXACT ORDINAL fullName equality, EXACTLY ONE record each, injective ───────────────────
  # R7 (Codex finding 1): $byName was a PowerShell hashtable, which compares keys CASE-INSENSITIVELY. A
  # required assertion whose name differed only in case therefore satisfied the contract, so "exact fullName
  # matching" was never exact. Security identities are compared ordinally here and nowhere else.
  # Duplicate detection runs UNCONDITIONALLY: a caller passing no required names still gets the ambiguity check.
  $byName = New-Object 'System.Collections.Generic.Dictionary[string,int]' ([System.StringComparer]::Ordinal)
  foreach ($n in $passedNames) {
    if ($byName.ContainsKey($n)) { $byName[$n] = $byName[$n] + 1 } else { $byName[$n] = 1 }
  }
  foreach ($req in $RequiredAssertions) {
    if (-not $byName.ContainsKey($req)) { $errors.Add("required_assertion_missing:$req"); continue }
    if ($byName[$req] -ne 1) { $errors.Add("required_assertion_not_unique:$req x$($byName[$req])") }
  }
  # a duplicated name anywhere in the expected file is fail-closed: it can mask a missing requirement
  foreach ($k in $byName.Keys) { if ($byName[$k] -gt 1) { $errors.Add("duplicate_assertion_name:$k x$($byName[$k])") } }

  return [pscustomobject]@{
    ok             = ($errors.Count -eq 0)
    errors         = $errors.ToArray()
    passed         = $(if ($counts.ContainsKey('numPassedTests')) { $counts['numPassedTests'] } else { -1 })
    failed         = $(if ($counts.ContainsKey('numFailedTests'))  { $counts['numFailedTests'] }  else { -1 })
    pending        = $(if ($counts.ContainsKey('numPendingTests')) { $counts['numPendingTests'] } else { -1 })
    todo           = $(if ($counts.ContainsKey('numTodoTests'))    { $counts['numTodoTests'] }    else { -1 })
    total          = $(if ($counts.ContainsKey('numTotalTests'))   { $counts['numTotalTests'] }   else { -1 })
    passedNames    = $passedNames.ToArray()
    expectedFileOk = ($expectedObjects -eq 1)
    # physical tallies, so a caller can report what was actually in the report rather than what it claimed
    recordTotal            = $recTotal
    recordPassed           = $recPassed
    recordFailed           = $recFailed
    recordPending          = $recPending
    recordTodo             = $recTodo
    testResultObjects      = $physicalObjects
    expectedFileObjects    = $expectedObjects
    unexpectedTestFiles    = @($foreignLeaves | Sort-Object -Unique)
  }
}
