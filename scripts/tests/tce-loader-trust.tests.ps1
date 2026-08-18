#Requires -Version 5.1
<#
  tce-loader-trust.tests.ps1 - permanent regression for how the IAM validators AUTHENTICATE and LOAD
  scripts/lib/TrustedChildEvidence.ps1.

  Two distinct defects motivate this file.

  1. BYTE IDENTITY. The first loader proved `ScriptBlock.File == expected path` AFTER dot-sourcing. That
     authenticates a location, not content, and only after the content has already executed. The helper now
     decides whether B1 child evidence is accepted at all, so it is SHA-256 pinned before it is run.

  2. NESTED EVICTION. The first loader evicted ambient definitions unconditionally. IAM-01B1 loads the helper
     once, then runs the IAM-01A validator IN-PROCESS via `&`; `Remove-Item Function:\...` acts on the session
     function table, so the nested eviction deleted the PARENT's helper while the nested re-load landed in a
     scope that was discarded on return. FINAL_REPAIRED_RUN_1 failed with "New-TceArtifactPath is not
     recognized" from GATE 12 onwards. Eviction is now origin-conditional: only definitions that did not come
     from the byte-verified file are removed.

  These tests execute the REAL loader blocks extracted from the two validators, so they authenticate the
  shipped bytes rather than a re-implementation.
#>
[CmdletBinding()]
param(
  [string]$Repo = ''
)
$ErrorActionPreference = 'Continue'
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if ([string]::IsNullOrWhiteSpace($Repo)) { $Repo = Split-Path (Split-Path $here -Parent) -Parent }

$IAM01A = Join-Path $Repo 'scripts\validate-p0-iam-01a-financial-authority-trust-boundary-foundation.ps1'
$IAM01B = Join-Path $Repo 'scripts\validate-p0-iam-01b-production-authority-trust-root.ps1'
$HELPER = Join-Path $Repo 'scripts\lib\TrustedChildEvidence.ps1'

$EXPECTED_CASES = @(
  'TCEPIN01-CORRECT-HASH-LOADS',
  'TCEPIN02-WRONG-EXPECTED-HASH-FAILS-CLOSED',
  'TCEPIN03-BYTE-MUTATION-FAILS-CLOSED',
  'TCEPIN04-MISSING-HELPER-FAILS-CLOSED',
  'TCEPIN05-AMBIENT-FORGED-FUNCTION-EVICTED',
  'TCEPIN07-IAM01A-IAM01B1-PIN-EQUALITY',
  'TCENEST01-NESTED-LOADER-PRESERVES-PARENT-FUNCTIONS'
)
$executed = New-Object System.Collections.Generic.List[string]
$pass = 0; $fail = 0
function Case([string]$n, [bool]$a, [bool]$e, [string]$d = '') {
  $script:executed.Add($n) | Out-Null
  $ok = ($a -eq $e); if ($ok) { $script:pass++ } else { $script:fail++ }
  Write-Host ("  [{0}] {1}{2}" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $n, $(if ($d) { "  ($d)" } else { '' }))
}
function Sha256Of([string]$p) {
  $h = [System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($h.ComputeHash([System.IO.File]::ReadAllBytes($p))) -replace '-', '') } finally { $h.Dispose() }
}
# Extract the real loader block: from the $tcePath assignment through the SHA echo that ends it.
function Get-LoaderBlock([string]$Validator) {
  if (-not (Test-Path -LiteralPath $Validator)) { return $null }
  $lines = [System.IO.File]::ReadAllLines($Validator)
  $s = -1; $e = -1
  for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($s -lt 0 -and $lines[$i] -match "^\s*\`$tcePath\s*=\s*Join-Path\s+\`$root") { $s = $i }
    elseif ($s -ge 0 -and $lines[$i] -match '_TCE_HELPER_SHA256=') { $e = $i; break }
  }
  if ($s -lt 0 -or $e -lt 0) { return $null }
  return (($lines[$s..$e]) -join "`n")
}
function Get-Pin([string]$Validator) {
  if (-not (Test-Path -LiteralPath $Validator)) { return '' }
  $m = [regex]::Match([System.IO.File]::ReadAllText($Validator), "(?m)^\s*\`$TCE_EXPECTED_SHA256\s*=\s*'(?<v>[A-Fa-f0-9]{64})'")
  if ($m.Success) { return $m.Groups['v'].Value }
  return ''
}

$exe = if ($PSVersionTable.PSVersion.Major -ge 6) { (Get-Process -Id $PID).Path } else { 'powershell.exe' }
$tmp = Join-Path $env:TEMP ('tce-loader-' + [guid]::NewGuid().ToString('N').Substring(0, 10))
New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'scripts\lib') | Out-Null

function Run-Ps([string]$Script) {
  $p = Join-Path $tmp ('drv-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.ps1')
  [System.IO.File]::WriteAllText($p, ($Script -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))
  $log = $p + '.out'
  $pr = Start-Process -FilePath $exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $p + '"')) `
        -NoNewWindow -Wait -PassThru -RedirectStandardOutput $log
  $o = if (Test-Path -LiteralPath $log) { [System.IO.File]::ReadAllText($log) } else { '' }
  return [pscustomobject]@{ Exit = $pr.ExitCode; Out = $o }
}

Write-Host '=== TCE LOADER TRUST CONTRACT ==='
Write-Host ("  helper : " + $HELPER)
$blockA = Get-LoaderBlock $IAM01A
$blockB = Get-LoaderBlock $IAM01B
if ($null -eq $blockA -or $null -eq $blockB) {
  Write-Host 'TCE_LOADER_BLOCK_NOT_FOUND=YES'
  Write-Host 'TCE_LOADER_COMPLETED=YES'
  Write-Host 'RESULT=TCE_LOADER_TRUST_SELFTEST_FAIL'
  exit 1
}
$realSha = Sha256Of $HELPER
Write-Host ("  helper sha : " + $realSha)

# Fixture repo containing the REAL helper bytes, so $root can be redirected safely.
$fx = Join-Path $tmp 'fixture'
New-Item -ItemType Directory -Force -Path (Join-Path $fx 'scripts\lib') | Out-Null
[System.IO.File]::Copy($HELPER, (Join-Path $fx 'scripts\lib\TrustedChildEvidence.ps1'), $true)

function Driver([string]$Block, [string]$RootDir, [string]$Tail) {
  return @"
`$ErrorActionPreference = 'Continue'
`$root = '$RootDir'
$Block
$Tail
"@
}

# ---- TCEPIN01 : correct bytes load and the helper is usable ----------------------------------------------
$r = Run-Ps (Driver $blockA $fx "Write-Host ('LOADED=' + [bool](Get-Command New-TceArtifactPath -CommandType Function -ErrorAction SilentlyContinue))")
Case 'TCEPIN01-CORRECT-HASH-LOADS' (($r.Exit -eq 0) -and ($r.Out -match 'LOADED=True')) $true ("exit=" + $r.Exit)

# ---- TCEPIN02 : the pin says something else -> refuse to run the file -------------------------------------
# Parenthesised: `-replace a, "'" + x + "'"` parses as four operands to -replace, not as one concatenated
# replacement, and PowerShell rejects it. The escaped pattern also keeps the hash literal from being read as
# a regex.
$blockWrongPin = $blockA -replace [regex]::Escape("'$realSha'"), ("'" + ('0' * 64) + "'")
$r = Run-Ps (Driver $blockWrongPin $fx "Write-Host 'SHOULD_NOT_REACH'")
Case 'TCEPIN02-WRONG-EXPECTED-HASH-FAILS-CLOSED' (($r.Exit -ne 0) -and ($r.Out -match 'byte identity mismatch') -and ($r.Out -notmatch 'SHOULD_NOT_REACH')) $true ("exit=" + $r.Exit)

# ---- TCEPIN03 : one byte appended to the helper -----------------------------------------------------------
$fxMut = Join-Path $tmp 'fixture-mutated'
New-Item -ItemType Directory -Force -Path (Join-Path $fxMut 'scripts\lib') | Out-Null
$mutTarget = Join-Path $fxMut 'scripts\lib\TrustedChildEvidence.ps1'
[System.IO.File]::WriteAllBytes($mutTarget, ([System.IO.File]::ReadAllBytes($HELPER) + [byte[]]@(35)))
$r = Run-Ps (Driver $blockA $fxMut "Write-Host 'SHOULD_NOT_REACH'")
Case 'TCEPIN03-BYTE-MUTATION-FAILS-CLOSED' (($r.Exit -ne 0) -and ($r.Out -match 'byte identity mismatch') -and ($r.Out -notmatch 'SHOULD_NOT_REACH')) $true ("exit=" + $r.Exit)

# ---- TCEPIN04 : helper absent -----------------------------------------------------------------------------
$fxNone = Join-Path $tmp 'fixture-missing'
New-Item -ItemType Directory -Force -Path (Join-Path $fxNone 'scripts\lib') | Out-Null
$r = Run-Ps (Driver $blockA $fxNone "Write-Host 'SHOULD_NOT_REACH'")
Case 'TCEPIN04-MISSING-HELPER-FAILS-CLOSED' (($r.Exit -ne 0) -and ($r.Out -match 'helper missing') -and ($r.Out -notmatch 'SHOULD_NOT_REACH')) $true ("exit=" + $r.Exit)

# ---- TCEPIN05 : a forged ambient definition must be evicted, not trusted ----------------------------------
# The forged function comes from no file at all, so its origin can never equal the verified path.
$forgedPre = @'
function Register-TceChildEvidence { return [pscustomobject]@{ EvidenceOk = $true; Retained = $true; Reasons = @() } }
Write-Host ('FORGED_PRESENT_BEFORE=' + [bool](Get-Command Register-TceChildEvidence -CommandType Function -ErrorAction SilentlyContinue))
'@
$tail05 = @'
$c = Get-Command Register-TceChildEvidence -CommandType Function -ErrorAction SilentlyContinue
$o = if ($c -and $c.ScriptBlock -and $c.ScriptBlock.File) { $c.ScriptBlock.File } else { '' }
Write-Host ('ORIGIN_AFTER=' + $o)
'@
$r = Run-Ps ($forgedPre + "`n" + (Driver $blockA $fx $tail05))
$originOk = ($r.Out -match 'ORIGIN_AFTER=.*TrustedChildEvidence\.ps1')
Case 'TCEPIN05-AMBIENT-FORGED-FUNCTION-EVICTED' (($r.Exit -eq 0) -and $originOk) $true ("originBound=" + $originOk)

# ---- TCEPIN07 : both validators pin the same value --------------------------------------------------------
$pinA = Get-Pin $IAM01A; $pinB = Get-Pin $IAM01B
Case 'TCEPIN07-IAM01A-IAM01B1-PIN-EQUALITY' (($pinA.Length -eq 64) -and ($pinA -eq $pinB) -and ($pinA -eq $realSha)) $true ("A=" + $pinA.Substring(0, 12) + " B=" + $pinB.Substring(0, 12))

# ---- TCENEST01 : the actual FINAL_REPAIRED_RUN_1 failure ---------------------------------------------------
# Parent loads the helper, then runs a child IN-PROCESS that runs the loader too (as IAM-01B1 GATE 2 runs the
# IAM-01A validator). After the child returns, the parent must still have a usable helper.
$childPath = Join-Path $tmp 'nested-child.ps1'
[System.IO.File]::WriteAllText($childPath, ((Driver $blockB $fx "Write-Host 'CHILD_DONE=YES'") -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))
$nestTail = @"
Write-Host ('PARENT_BEFORE=' + [bool](Get-Command New-TceArtifactPath -CommandType Function -ErrorAction SilentlyContinue))
& '$childPath'
Write-Host ('PARENT_AFTER=' + [bool](Get-Command New-TceArtifactPath -CommandType Function -ErrorAction SilentlyContinue))
`$probe = ''
try { `$probe = New-TceArtifactPath -EvidenceDir '$tmp' -Name 'nest-probe.txt' } catch { `$probe = 'THREW' }
Write-Host ('PARENT_USABLE=' + `$(if (`$probe -and `$probe -ne 'THREW') { 'YES' } else { 'NO' }))
"@
$r = Run-Ps (Driver $blockA $fx $nestTail)
$nestOk = ($r.Out -match 'PARENT_BEFORE=True') -and ($r.Out -match 'CHILD_DONE=YES') -and ($r.Out -match 'PARENT_AFTER=True') -and ($r.Out -match 'PARENT_USABLE=YES')
Case 'TCENEST01-NESTED-LOADER-PRESERVES-PARENT-FUNCTIONS' $nestOk $true (($r.Out -split "`r?`n" | Where-Object { $_ -match 'PARENT_|CHILD_DONE' }) -join ' ')

try { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue } catch {}

$missing = @($EXPECTED_CASES | Where-Object { $executed -notcontains $_ })
$dup     = @($executed | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
$unknown = @($executed | Where-Object { $EXPECTED_CASES -notcontains $_ })
Write-Host ''
Write-Host ("TCE_LOADER_CASES=" + $EXPECTED_CASES.Count)
Write-Host ("TCE_LOADER_EXECUTED=" + $executed.Count)
Write-Host ("TCE_LOADER_PASSED=" + $pass)
Write-Host ("TCE_LOADER_FAILED=" + $fail)
Write-Host ("TCE_LOADER_MISSING_CASES=" + $missing.Count)
Write-Host ("TCE_LOADER_DUPLICATE_CASES=" + $dup.Count)
Write-Host ("TCE_LOADER_UNKNOWN_CASES=" + $unknown.Count)
Write-Host ("TCE_PIN_VALUE=" + $pinA)
if ($missing.Count) { Write-Host ("MISSING: " + ($missing -join ',')) }
Write-Host 'TCE_LOADER_COMPLETED=YES'
if ($fail -gt 0 -or $missing.Count -gt 0 -or $dup.Count -gt 0 -or $unknown.Count -gt 0) {
  Write-Host 'RESULT=TCE_LOADER_TRUST_SELFTEST_FAIL'; exit 1
}
Write-Host 'RESULT=TCE_LOADER_TRUST_SELFTEST_PASS'
exit 0
