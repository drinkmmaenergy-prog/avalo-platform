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
  # Physical tallies across the WHOLE report, used to reconcile every declared counter.
  $recTotal = 0; $recPassed = 0; $recFailed = 0; $recPending = 0; $recTodo = 0
  # Jest assertion statuses. Anything outside this set is unknown semantics and therefore a rejection: a status
  # this parser cannot classify must never be silently ignored, because ignoring it is what "counts as passed".
  $STATUS_BUCKET = @{ 'passed' = 'passed'; 'failed' = 'failed'; 'pending' = 'pending'
                      'skipped' = 'pending'; 'disabled' = 'pending'; 'todo' = 'todo' }

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

      foreach ($ar in $tr.assertionResults) {
        $recTotal++
        if (-not (Test-SjpHasProperty $ar 'fullName')) { $errors.Add('assertion_missing_fullName'); continue }
        if (-not (Test-SjpHasProperty $ar 'status'))   { $errors.Add('assertion_missing_status');   continue }
        if ($ar.fullName -isnot [string]) { $errors.Add('assertion_fullName_not_string'); continue }
        if ($ar.status   -isnot [string]) { $errors.Add('assertion_status_not_string');   continue }
        $st = [string]$ar.status
        if (-not $STATUS_BUCKET.ContainsKey($st)) { $errors.Add("assertion_status_unsupported:$st"); continue }
        switch ($STATUS_BUCKET[$st]) {
          'passed'  { $recPassed++ }
          'failed'  { $recFailed++ }
          'pending' { $recPending++ }
          'todo'    { $recTodo++ }
        }
        # Only the expected file may contribute evidence toward the required-assertion set.
        if ($isExpected -and $st -ceq 'passed') { $passedNames.Add([string]$ar.fullName) }
      }
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

  # ── INVARIANT: suite counters, when the report declares them, must match physical result objects ───────────────
  foreach ($sf in @('numTotalTestSuites', 'numPassedTestSuites')) {
    if (Test-SjpHasProperty $j $sf) {
      if (-not (Test-SjpIsStrictInt $j.$sf)) { $errors.Add("${sf}_not_integer"); continue }
      if ([int64]$j.$sf -ne $physicalObjects) { $errors.Add("${sf}_mismatch:$($j.$sf)!=$physicalObjects") }
    }
  }

  # ── required assertions: EXACT fullName equality, EXACTLY ONE record each, injective ───────────────────────────
  # Duplicate detection now runs UNCONDITIONALLY. Previously it was inside the RequiredAssertions branch, so a
  # caller passing no required names got no ambiguity check at all.
  $byName = @{}
  foreach ($n in $passedNames) { if ($byName.ContainsKey($n)) { $byName[$n] = [int]$byName[$n] + 1 } else { $byName[$n] = 1 } }
  foreach ($req in $RequiredAssertions) {
    if (-not $byName.ContainsKey($req)) { $errors.Add("required_assertion_missing:$req"); continue }
    if ([int]$byName[$req] -ne 1) { $errors.Add("required_assertion_not_unique:$req x$($byName[$req])") }
  }
  # a duplicated name anywhere in the expected file is fail-closed: it can mask a missing requirement
  foreach ($k in $byName.Keys) { if ([int]$byName[$k] -gt 1) { $errors.Add("duplicate_assertion_name:$k x$($byName[$k])") } }

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
