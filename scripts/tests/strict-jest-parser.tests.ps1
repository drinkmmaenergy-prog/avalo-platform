#Requires -Version 5.1
<#
  strict-jest-parser.tests.ps1 — permanent adversarial self-tests for StrictJestParser.ps1.
  READ-ONLY (no emulator, no repo mutation, temp fixtures only). Proves every weakness found by independent review is
  rejected: numeric/boolean coercion, missing-count-defaults-to-zero, substring assertion matching, duplicate records
  masking a missing requirement, wrong source file, non-zero native jest exit, and stale reports.
  Exit 0 on full pass; else exit 1.
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-StrictParser {
  # Same deterministic, CWD-independent discovery policy as the lifecycle harness.
  param([Parameter(Mandatory)][string]$FromDir)
  $candidates = @((Join-Path $FromDir '..\lib\StrictJestParser.ps1'), (Join-Path $FromDir 'StrictJestParser.ps1'))
  $existing = @($candidates | Where-Object { Test-Path -LiteralPath $_ })
  if ($existing.Count -eq 0) { throw "STRICT_PARSER_NOT_FOUND: [$($candidates -join '; ')]" }
  if ($existing.Count -gt 1) {
    $d = @($existing | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash } | Sort-Object -Unique)
    if ($d.Count -gt 1) { throw 'STRICT_PARSER_AMBIGUOUS: non-identical candidates' }
  }
  return (Resolve-Path -LiteralPath $existing[0]).Path
}
. (Resolve-StrictParser -FromDir $here)

$tmp = Join-Path $env:TEMP ('avalo-sjp-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$FILE = 'demo.test.ts'
$REQ  = @('security > rejects forged token', 'security > requires single active key')

$script:asserts = 0; $script:fails = 0
function Check([string]$name, [bool]$actual, [bool]$expected) {
  $script:asserts++
  $ok = ($actual -eq $expected); if (-not $ok) { $script:fails++ }
  Write-Host ("  [{0}] {1} (expected={2} actual={3})" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $name, $expected, $actual)
}
function Write-Report([string]$json) {
  $p = Join-Path $tmp ("r-" + [guid]::NewGuid().ToString('N') + '.json')
  Set-Content -LiteralPath $p -Value $json -Encoding UTF8
  return $p
}
function Adj([string]$json, [int]$exit = 0, [string]$file = $FILE, [string[]]$req = $REQ, [int]$expectPassed = 4) {
  $p = Write-Report $json
  $res = Get-SjpStrictReport -JsonPath $p -NativeExit $exit -RunStartedUtc ((Get-Date).ToUniversalTime().AddMinutes(-1)) `
          -ExpectedTestFile $file -MinPassed 1 -ExpectedPassed $expectPassed -RequiredAssertions $req
  return [bool]$res.ok
}

# canonical VALID report: 4 passed, both required assertions present exactly once, from the expected file
function Good([string]$successLit = 'true', [string]$passed = '4', [string]$failed = '0', [string]$pending = '0', [string]$todo = '0', [string]$total = '4', [string]$file = $FILE, [string[]]$names = $null) {
  if ($null -eq $names) { $names = @($REQ[0], $REQ[1], 'other passing test a', 'other passing test b') }
  $ar = ($names | ForEach-Object { '{"fullName":"' + $_ + '","status":"passed"}' }) -join ','
  return '{"success":' + $successLit + ',"numTotalTests":' + $total + ',"numPassedTests":' + $passed +
         ',"numFailedTests":' + $failed + ',"numPendingTests":' + $pending + ',"numTodoTests":' + $todo +
         ',"testResults":[{"name":"C:\\repo\\src\\__tests__\\' + $file + '","assertionResults":[' + $ar + ']}]}'
}

Write-Host '=== strict Jest parser adversarial self-tests ==='

Check '01 canonical valid report' (Adj (Good)) $true

# ── type discipline ──────────────────────────────────────────────────────────────────────────────────────────────
Check '02 success = 1 (numeric truthiness)' (Adj (Good -successLit '1')) $false
Check '03 success = "true" (string)' (Adj (Good -successLit '"true"')) $false
Check '04 numPassedTests = "4" (string)' (Adj (Good -passed '"4"')) $false
Check '05 numTotalTests = "4" (string)' (Adj (Good -total '"4"')) $false
Check '06 numFailedTests = false (boolean in numeric slot)' (Adj (Good -failed 'false')) $false
Check '07 numPassedTests = null' (Adj (Good -passed 'null')) $false
Check '08 negative count' (Adj (Good -failed '-1' -total '3')) $false
Check '09 fractional count' (Adj (Good -passed '4.5')) $false

# ── missing fields must never default to zero ────────────────────────────────────────────────────────────────────
Check '10 missing numFailedTests' (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"passed"},{"fullName":"' + $REQ[1] + '","status":"passed"}]}]}')) $false
Check '11 missing numPendingTests' (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"passed"},{"fullName":"' + $REQ[1] + '","status":"passed"}]}]}')) $false
Check '12 missing numTodoTests' (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"passed"},{"fullName":"' + $REQ[1] + '","status":"passed"}]}]}')) $false
Check '13 missing success' (Adj ('{"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"passed"},{"fullName":"' + $REQ[1] + '","status":"passed"}]}]}')) $false
Check '14 missing testResults' (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0}')) $false

# ── arithmetic / policy ──────────────────────────────────────────────────────────────────────────────────────────
Check '15 inconsistent total (sum mismatch)' (Adj (Good -total '9') ) $false
Check '16 failed > 0' (Adj (Good -failed '1' -total '5')) $false
Check '17 pending nonzero not permitted' (Adj (Good -pending '1' -total '5')) $false
Check '18 todo nonzero not permitted' (Adj (Good -todo '1' -total '5')) $false
Check '19 success=false with 0 failed (inconsistent)' (Adj (Good -successLit 'false')) $false
Check '20 passed not exactly expected' (Adj (Good -passed '3' -total '3' -names @($REQ[0], $REQ[1], 'x'))) $false

# ── source-file binding ──────────────────────────────────────────────────────────────────────────────────────────
Check '21 correct names but WRONG source file' (Adj (Good -file 'other.test.ts')) $false
Check '22 expected file absent entirely' (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"C:\\repo\\elsewhere.test.ts","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"passed"},{"fullName":"' + $REQ[1] + '","status":"passed"}]}]}')) $false

# ── named-assertion discipline ───────────────────────────────────────────────────────────────────────────────────
Check '23 one COMBINED fullName containing all required substrings' (Adj (Good -names @(($REQ[0] + ' and ' + $REQ[1]), 'a', 'b', 'c'))) $false
Check '24 duplicate required assertion (x2)' (Adj (Good -names @($REQ[0], $REQ[0], $REQ[1], 'z'))) $false
Check '25 missing one required assertion' (Adj (Good -names @($REQ[0], 'a', 'b', 'c'))) $false
Check '26 required assertion present but status failed' (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"failed"},{"fullName":"' + $REQ[1] + '","status":"passed"},{"fullName":"a","status":"passed"},{"fullName":"b","status":"passed"}]}]}')) $false
Check '27 status "Passed" wrong case' (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"Passed"},{"fullName":"' + $REQ[1] + '","status":"passed"},{"fullName":"a","status":"passed"},{"fullName":"b","status":"passed"}]}]}')) $false
Check '28 substring-only match cannot satisfy requirement' (Adj (Good -names @('rejects forged token', 'requires single active key', 'a', 'b'))) $false
Check '29 assertion missing fullName' (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"status":"passed"},{"fullName":"' + $REQ[1] + '","status":"passed"},{"fullName":"a","status":"passed"},{"fullName":"b","status":"passed"}]}]}')) $false

# ── structural malformation ──────────────────────────────────────────────────────────────────────────────────────
Check '30 root is array' (Adj '[]') $false
Check '31 unparseable JSON' (Adj '{not json') $false
Check '32 testResults not array' (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":"nope"}')) $false
Check '33 assertionResults not array' (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":"nope"}]}')) $false

# ── native exit + freshness ──────────────────────────────────────────────────────────────────────────────────────
Check '34 valid JSON but native jest exit = 1' (Adj (Good) 1) $false
Check '35 stale report (written before run start)' (& {
    $p = Write-Report (Good)
    (Get-Item -LiteralPath $p).LastWriteTimeUtc = (Get-Date).ToUniversalTime().AddHours(-3)
    $res = Get-SjpStrictReport -JsonPath $p -NativeExit 0 -RunStartedUtc ((Get-Date).ToUniversalTime()) `
            -ExpectedTestFile $FILE -MinPassed 1 -ExpectedPassed 4 -RequiredAssertions $REQ
    [bool]$res.ok }) $false
Check '36 report file missing' (& {
    $res = Get-SjpStrictReport -JsonPath (Join-Path $tmp 'nope.json') -NativeExit 0 -RunStartedUtc ((Get-Date).ToUniversalTime().AddMinutes(-1)) `
            -ExpectedTestFile $FILE -MinPassed 1 -ExpectedPassed 4 -RequiredAssertions $REQ
    [bool]$res.ok }) $false
Check '37 fabricated marker without valid JSON (empty file)' (Adj '') $false

# ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  R6 — regressions for the three bypasses reproduced by the second independent review (Codex, vs the R5 bundle).
#
#  Shared root cause: the declared global counters were validated for TYPE and ARITHMETIC but never reconciled
#  against the assertion records that physically exist, and file identity was used as a FILTER rather than as a
#  cardinality assertion. The security callers require a large total (53 / 54) but only a smaller named set
#  (16 / 17), so everything outside the named set was unconstrained.
# ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
function Obj([string]$file, [string[]]$names, [string]$status = 'passed') {
  $ar = ($names | ForEach-Object { '{"fullName":"' + $_ + '","status":"' + $status + '"}' }) -join ','
  return '{"name":"C:\\repo\\src\\__tests__\\' + $file + '","assertionResults":[' + $ar + ']}'
}
function Rep([string[]]$objs, [string]$total = '4', [string]$passed = '4', [string]$failed = '0',
             [string]$pending = '0', [string]$todo = '0', [string]$extra = '') {
  return '{"success":true,"numTotalTests":' + $total + ',"numPassedTests":' + $passed +
         ',"numFailedTests":' + $failed + ',"numPendingTests":' + $pending + ',"numTodoTests":' + $todo +
         $extra + ',"testResults":[' + ($objs -join ',') + ']}'
}

Write-Host ''
Write-Host '--- R6: Codex-reproduced bypasses (must all REJECT) ---'

# C38 — global counters claim 4 passed; only 2 assertion records physically exist.
$script:codexCases = 0; $script:codexPass = 0
function CodexCheck([string]$name, [bool]$accepted) {
  $script:codexCases++
  if (-not $accepted) { $script:codexPass++ }
  Check $name $accepted $false
}
CodexCheck 'C38 COUNTERS_CLAIM_4_BUT_ONLY_2_ASSERTION_RECORDS' (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1])))))

# C39 — expected file supplies the required names; an UNRELATED file supplies the rest of the declared total.
CodexCheck 'C39 EXPECTED_FILE_PLUS_UNRELATED_SECOND_TEST_FILE' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1])), (Obj 'unrelated.test.ts' @('unrelated one', 'unrelated two')))))

# C40 — the expected file appears in TWO result objects with the required evidence split across them.
CodexCheck 'C40 DUPLICATE_EXPECTED_FILE_RESULT_OBJECTS_SPLIT_ASSERTIONS' `
  (Adj (Rep @((Obj $FILE @($REQ[0], 'filler one')), (Obj $FILE @($REQ[1], 'filler two')))))

Write-Host ''
Write-Host '--- R6: adjacent bypasses found while modelling the invariants (must all REJECT) ---'

# Declared failed count inconsistent with the physical failed record.
Check '41 declared failed=0 but a failed record exists' `
  (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"passed"},{"fullName":"' + $REQ[1] + '","status":"passed"},{"fullName":"a","status":"passed"},{"fullName":"b","status":"failed"}]}]}')) $false

# Declared pending/todo inconsistent with physical records.
Check '42 declared pending=0 but a pending record exists' `
  (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"passed"},{"fullName":"' + $REQ[1] + '","status":"passed"},{"fullName":"a","status":"passed"},{"fullName":"b","status":"pending"}]}]}')) $false
Check '43 declared todo=0 but a todo record exists' `
  (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"passed"},{"fullName":"' + $REQ[1] + '","status":"passed"},{"fullName":"a","status":"passed"},{"fullName":"b","status":"todo"}]}]}')) $false

# Empty evidence with confident counters.
Check '44 zero testResults with nonzero global counters' (Adj (Rep @())) $false

# Several unrelated suites whose aggregate happens to equal the expected total; expected file absent.
Check '45 unrelated suites aggregate to the expected total' `
  (Adj (Rep @((Obj 'a.test.ts' @('x', 'y')), (Obj 'b.test.ts' @('z', 'w'))))) $false

# Required names present only in a foreign file: a foreign record must never satisfy a requirement.
Check '46 required names live ONLY in an unexpected file' `
  (Adj (Rep @((Obj $FILE @('filler one', 'filler two')), (Obj 'other.test.ts' $REQ)))) $false

# Status vocabulary: an unclassifiable status must reject, never be silently skipped.
Check '47 unsupported assertion status' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b') 'bogus')))) $false
Check '48 assertion record missing status' `
  (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '"},{"fullName":"' + $REQ[1] + '","status":"passed"},{"fullName":"a","status":"passed"},{"fullName":"b","status":"passed"}]}]}')) $false

# Windows case-insensitivity must not create two "different" expected files.
Check '49 expected file duplicated under a different letter case' `
  (Adj (Rep @((Obj $FILE @($REQ[0], 'filler one')), (Obj $FILE.ToUpperInvariant() @($REQ[1], 'filler two'))))) $false

# Suite counters must reconcile with physical result objects.
Check '50 numTotalTestSuites lies about physical result objects' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b'))) -extra ',"numTotalTestSuites":5,"numPassedTestSuites":5')) $false

# Extra records beyond the declared total.
Check '51 more assertion records than the declared total' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b', 'c'))))) $false

Write-Host ''
Write-Host '--- R6: positive controls (the repair must not reject VALID evidence) ---'

# A fix that rejects everything is not a fix. These prove the strict path still accepts a well-formed report.
Check '52 valid report carrying suite counters is ACCEPTED' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b'))) -extra ',"numTotalTestSuites":1,"numPassedTestSuites":1')) $true
Check '53 valid report, records reconcile exactly, is ACCEPTED' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b'))))) $true

# ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
#  R7 — regressions for the SECOND round of independent-review findings (Codex, vs the R6 bundle).
#
#  R6 closed the three R5 bypasses but introduced/left a family of defects rooted in PowerShell defaults:
#  hashtables and the -eq operator are CASE-INSENSITIVE, so "exact" identity comparisons were not exact.
#  Codex proved a required assertion could be satisfied by a case-mutated name, and that a status of
#  "PASSED" resolved to "passed". Adjacent defects: empty fullName ignored on unrequired records, duplicate
#  caller-supplied required names, and suite counters that were read but only partly reconciled.
# ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
Write-Host ''
Write-Host '--- R7: Codex R6 case-sensitivity and schema findings (must all REJECT) ---'

$script:r7Cases = 0; $script:r7Pass = 0
function R7Check([string]$name, [bool]$accepted) {
  $script:r7Cases++
  if (-not $accepted) { $script:r7Pass++ }
  Check $name $accepted $false
}

# R54 — the required name appears ONLY in a case-mutated form. PowerShell hashtable lookup accepted it.
R7Check 'R54 required fullName wrong case' `
  (Adj (Rep @((Obj $FILE @($REQ[0].ToUpperInvariant(), $REQ[1], 'a', 'b')))))

# R55 — an UNREQUIRED record carries status "PASSED"; the status vocabulary was case-insensitive.
R7Check 'R55 unsupported status casing PASSED on an unrequired record' `
  (Adj ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"passed"},{"fullName":"' + $REQ[1] + '","status":"passed"},{"fullName":"a","status":"passed"},{"fullName":"b","status":"PASSED"}]}]}'))

# R56 / R57 — a malformed record must fail the report even when nobody requires it.
R7Check 'R56 empty fullName on an unrequired record' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', '')))))
R7Check 'R57 whitespace-only fullName on an unrequired record' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', '   ')))))

# R58 — the CALLER supplies a duplicate required name; one record must not satisfy two contract slots.
R7Check 'R58 duplicate RequiredAssertions supplied by caller' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b')))) 0 $FILE @($REQ[0], $REQ[0], $REQ[1]))

# R59 — suite counters claim a failed suite while every physical record passed.
R7Check 'R59 numFailedTestSuites inconsistent with physical records' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b'))) -extra ',"numTotalTestSuites":1,"numPassedTestSuites":1,"numFailedTestSuites":1'))
R7Check 'R59b numPendingTestSuites inconsistent with physical records' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b'))) -extra ',"numTotalTestSuites":1,"numPassedTestSuites":1,"numPendingTestSuites":1'))
R7Check 'R59c numRuntimeErrorTestSuites nonzero' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b'))) -extra ',"numTotalTestSuites":1,"numPassedTestSuites":1,"numRuntimeErrorTestSuites":1'))

# R60 — a null assertion record must be rejected STRUCTURALLY, not by a parameter-binding accident.
$r60Struct = $false
try {
  $p60 = Write-Report ('{"success":true,"numTotalTests":4,"numPassedTests":4,"numFailedTests":0,"numPendingTests":0,"numTodoTests":0,"testResults":[{"name":"x\\' + $FILE + '","assertionResults":[{"fullName":"' + $REQ[0] + '","status":"passed"},{"fullName":"' + $REQ[1] + '","status":"passed"},{"fullName":"a","status":"passed"},null]}]}')
  $r60 = Get-SjpStrictReport -JsonPath $p60 -NativeExit 0 -RunStartedUtc ((Get-Date).ToUniversalTime().AddMinutes(-1)) `
          -ExpectedTestFile $FILE -MinPassed 1 -ExpectedPassed 4 -RequiredAssertions $REQ
  $r60Struct = ((-not $r60.ok) -and @($r60.errors | Where-Object { $_ -match 'assertion_record_null' }).Count -ge 1)
} catch { $r60Struct = $false }   # a thrown binding error is NOT a structural rejection
R7Check 'R60 null assertion record rejected structurally' (-not $r60Struct)

# R61 — required-name input schema: non-string / empty entries in the caller contract.
R7Check 'R61 empty string in RequiredAssertions input' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b')))) 0 $FILE @($REQ[0], '', $REQ[1]))
R7Check 'R61b whitespace entry in RequiredAssertions input' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b')))) 0 $FILE @($REQ[0], '   ', $REQ[1]))

Write-Host ''
Write-Host '--- R7: positive controls (case-exact, well-formed evidence must still be ACCEPTED) ---'
Check 'R62 exact-case required names still accepted' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b'))))) $true
Check 'R63 consistent full suite counters accepted' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], 'a', 'b'))) -extra ',"numTotalTestSuites":1,"numPassedTestSuites":1,"numFailedTestSuites":0,"numPendingTestSuites":0,"numRuntimeErrorTestSuites":0')) $true
# A name differing from a required one ONLY by case must be treated as a DIFFERENT name, not a duplicate.
Check 'R64 case-variant of a required name is a distinct assertion, not a duplicate' `
  (Adj (Rep @((Obj $FILE @($REQ[0], $REQ[1], $REQ[0].ToUpperInvariant(), 'b'))))) $true

try { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force } } catch {}

Write-Host ''
# Every total below is COUNTED from the checks that actually executed. Nothing here is a literal: an earlier
# revision published a fixed "37", which would have silently gone stale the moment a case was added.
Write-Host ("STRICT_PARSER_ASSERTIONS_EXECUTED={0}" -f $script:asserts)
Write-Host ("STRICT_PARSER_ASSERTIONS_FAILED={0}" -f $script:fails)
Write-Host ("CODEX_REGRESSION_CASES={0}" -f $script:codexCases)
Write-Host ("CODEX_REGRESSION_CASES_PASS={0}" -f $script:codexPass)
Write-Host ("CODEX_R7_REGRESSION_CASES={0}" -f $script:r7Cases)
Write-Host ("CODEX_R7_REGRESSION_CASES_PASS={0}" -f $script:r7Pass)
if ($script:fails -eq 0) {
  Write-Host ("RESULT: STRICT_JEST_PARSER_SELFTEST_PASS ({0} assertions)" -f $script:asserts)
  exit 0
} else {
  Write-Host ("RESULT: STRICT_JEST_PARSER_SELFTEST_FAIL ({0} of {1} assertions wrong)" -f $script:fails, $script:asserts)
  exit 1
}
