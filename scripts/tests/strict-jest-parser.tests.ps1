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

try { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force } } catch {}

Write-Host ''
Write-Host ("STRICT_PARSER_ASSERTIONS_EXECUTED={0}" -f $script:asserts)
Write-Host ("STRICT_PARSER_ASSERTIONS_FAILED={0}" -f $script:fails)
if ($script:fails -eq 0) {
  Write-Host ("RESULT: STRICT_JEST_PARSER_SELFTEST_PASS ({0} assertions)" -f $script:asserts)
  exit 0
} else {
  Write-Host ("RESULT: STRICT_JEST_PARSER_SELFTEST_FAIL ({0} of {1} assertions wrong)" -f $script:fails, $script:asserts)
  exit 1
}
