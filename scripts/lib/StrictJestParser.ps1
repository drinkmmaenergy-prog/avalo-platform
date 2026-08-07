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

  This module is the single strict implementation. It performs NO parsing shortcuts and has NO mutable module state,
  no wildcard discovery, and no environment-variable bypass. Every check is fail-closed: anything not positively
  proven is a rejection. Callers keep their own additional gates; this never relaxes them.

  TYPE DISCIPLINE (the core of the repair): after ConvertFrom-Json a JSON `true` is [bool], `1` is [int]/[long] and
  `"1"` is [string]. Booleans are therefore required to be [bool] and counts required to be [int]/[long]; a string or
  a boolean in a numeric slot is a rejection rather than something to coerce.
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
      -RequiredAssertions exact fullName strings; each must match EXACTLY ONE passed record in the expected file
      -AllowPending/-AllowTodo  policy (default: neither permitted)
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$JsonPath,
    [Parameter(Mandatory)][int]$NativeExit,
    [Parameter(Mandatory)][datetime]$RunStartedUtc,
    [Parameter(Mandatory)][string]$ExpectedTestFile,
    [int]$MinPassed = 1,
    [int]$ExpectedPassed = 0,
    [string[]]$RequiredAssertions = @(),
    [bool]$AllowPending = $false,
    [bool]$AllowTodo = $false
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

  # ── collect passed assertion records BOUND TO THE EXPECTED SOURCE FILE ─────────────────────────────────────────
  $passedNames = New-Object System.Collections.Generic.List[string]
  $sawExpectedFile = $false
  if ((Test-SjpHasProperty $j 'testResults') -and ($j.testResults -is [array])) {
    foreach ($tr in $j.testResults) {
      if (-not (Test-SjpHasProperty $tr 'name')) { $errors.Add('testResult_missing_name'); continue }
      $leaf = ''
      try { $leaf = Split-Path -Leaf ([string]$tr.name) } catch { $leaf = '' }
      $isExpected = ($leaf -ieq $ExpectedTestFile)
      if ($isExpected) { $sawExpectedFile = $true }
      if (-not (Test-SjpHasProperty $tr 'assertionResults')) { $errors.Add('testResult_missing_assertionResults'); continue }
      if ($tr.assertionResults -isnot [array]) { $errors.Add('assertionResults_not_array'); continue }
      if (-not $isExpected) { continue }                                  # only the expected file may satisfy requirements
      foreach ($ar in $tr.assertionResults) {
        if (-not (Test-SjpHasProperty $ar 'fullName')) { $errors.Add('assertion_missing_fullName'); continue }
        if (-not (Test-SjpHasProperty $ar 'status'))   { $errors.Add('assertion_missing_status');   continue }
        if (([string]$ar.status) -cne 'passed') { continue }              # exact status, case-sensitive
        $passedNames.Add([string]$ar.fullName)
      }
    }
  }
  if (-not $sawExpectedFile) { $errors.Add("expected_test_file_absent:$ExpectedTestFile") }

  # ── required assertions: EXACT fullName equality, EXACTLY ONE record each, injective ───────────────────────────
  if ($RequiredAssertions.Count -gt 0) {
    $byName = @{}
    foreach ($n in $passedNames) { if ($byName.ContainsKey($n)) { $byName[$n] = [int]$byName[$n] + 1 } else { $byName[$n] = 1 } }
    foreach ($req in $RequiredAssertions) {
      if (-not $byName.ContainsKey($req)) { $errors.Add("required_assertion_missing:$req"); continue }
      if ([int]$byName[$req] -ne 1) { $errors.Add("required_assertion_not_unique:$req x$($byName[$req])") }
    }
    # a duplicated name anywhere in the expected file is fail-closed: it can mask a missing requirement
    foreach ($k in $byName.Keys) { if ([int]$byName[$k] -gt 1) { $errors.Add("duplicate_assertion_name:$k x$($byName[$k])") } }
  }

  return [pscustomobject]@{
    ok             = ($errors.Count -eq 0)
    errors         = $errors.ToArray()
    passed         = $(if ($counts.ContainsKey('numPassedTests')) { $counts['numPassedTests'] } else { -1 })
    failed         = $(if ($counts.ContainsKey('numFailedTests'))  { $counts['numFailedTests'] }  else { -1 })
    pending        = $(if ($counts.ContainsKey('numPendingTests')) { $counts['numPendingTests'] } else { -1 })
    todo           = $(if ($counts.ContainsKey('numTodoTests'))    { $counts['numTodoTests'] }    else { -1 })
    total          = $(if ($counts.ContainsKey('numTotalTests'))   { $counts['numTotalTests'] }   else { -1 })
    passedNames    = $passedNames.ToArray()
    expectedFileOk = $sawExpectedFile
  }
}
