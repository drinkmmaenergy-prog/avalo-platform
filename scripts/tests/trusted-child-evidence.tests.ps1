#Requires -Version 5.1
<#
  trusted-child-evidence.tests.ps1 - permanent regression for the R8 trust-child evidence contract.

  WHY THIS EXISTS. Twice in R8 a parent validator trusted a child, the child failed, and the parent deleted the
  child's output before anyone could read it. A cross-cutting audit then found the same shape on seven
  trust-critical relationships across both IAM validators. The repair is scripts/lib/TrustedChildEvidence.ps1.

  A repair that is only ever observed succeeding is indistinguishable from a repair that cannot fail. So every
  case below drives the real contract - the actual helper, loaded the way the validators load it - into a
  specific rejection, and asserts the rejection happens FOR THE STATED REASON. `EvidenceOk = $false` is not
  enough; the reason code has to be the one the case is about, otherwise a fixture typo would score a pass.

  The retention cases deliberately use a CHILD PROCESS that exits, because the claim is that evidence survives
  the parent's death. Checking a file exists while the writer is still alive proves nothing about that.
#>
[CmdletBinding()]
param([string]$HelperPath = '')
$ErrorActionPreference = 'Continue'
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if ([string]::IsNullOrWhiteSpace($HelperPath)) { $HelperPath = Join-Path (Split-Path $here -Parent) 'lib\TrustedChildEvidence.ps1' }

$EXPECTED_CASES = @(
  'TCE01-VALID-CHILD-PERSISTS-AND-ACCEPTS',
  'TCE02-FAILED-CHILD-EVIDENCE-PERSISTS',
  'TCE03-MISSING-TRANSCRIPT-REJECTED',
  'TCE04-EMPTY-TRANSCRIPT-REJECTED',
  'TCE05-EXIT-NOT-OBSERVED-REJECTED',
  'TCE06-MISSING-RESULT-MARKER-REJECTED',
  'TCE07-CONFLICTING-RESULT-MARKER-REJECTED',
  'TCE08-UNEXPECTED-RESULT-VALUE-REJECTED',
  'TCE09-RECORDED-SHA-MATCHES-BYTES',
  'TCE10-EVIDENCE-SURVIVES-PARENT-EXIT',
  'TCE11-CRASH-AFTER-PARTIAL-OUTPUT-RETAINS-PARTIAL',
  'TCE12-HELPER-IDENTITY-BOUND-TO-REPOSITORY-BYTES',
  'TCE13-RESULT-MARKER-WITH-TRAILING-DETAIL-ACCEPTED'
)
$executed = New-Object System.Collections.Generic.List[string]
$pass = 0; $fail = 0
function Case([string]$name, [bool]$actual, [bool]$expected, [string]$detail = '') {
  $script:executed.Add($name) | Out-Null
  $ok = ($actual -eq $expected)
  if ($ok) { $script:pass++ } else { $script:fail++ }
  Write-Host ("  [{0}] {1}{2}" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $name, $(if ($detail) { "  ($detail)" } else { '' }))
}
function HasReason($result, [string]$code) { return (@($result.Reasons) -contains $code) }

if (-not (Test-Path -LiteralPath $HelperPath -PathType Leaf)) {
  Write-Host ("TCE_HELPER_MISSING=" + $HelperPath)
  Write-Host 'TCE_COMPLETED=YES'
  Write-Host 'RESULT=TRUSTED_CHILD_EVIDENCE_SELFTEST_FAIL'
  exit 1
}
# Load exactly as the validators do: evict ambient definitions, dot-source the exact path, prove origin.
foreach ($fn in @('Get-TceEvidenceDir', 'New-TceArtifactPath', 'Get-TceSha256', 'Register-TceChildEvidence')) {
  if (Test-Path -LiteralPath ("Function:\" + $fn)) { Remove-Item -LiteralPath ("Function:\" + $fn) -Force -ErrorAction SilentlyContinue }
}
. $HelperPath

Write-Host '=== TRUSTED CHILD EVIDENCE CONTRACT ==='
Write-Host ("  helper : " + $HelperPath)

$evi = Get-TceEvidenceDir -Validator 'SELFTEST'
Write-Host ("  evidence dir : " + $evi)

$exe = if ($PSVersionTable.PSVersion.Major -ge 6) { (Get-Process -Id $PID).Path } else { 'powershell.exe' }
function Invoke-Child {
  param([string]$Body, [string]$TranscriptPath)
  $s = Join-Path $evi ('child-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.ps1')
  [System.IO.File]::WriteAllText($s, ($Body -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))
  $p = Start-Process -FilePath $exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $s + '"')) `
        -NoNewWindow -Wait -PassThru -RedirectStandardOutput $TranscriptPath
  return $p.ExitCode
}

# ---- TCE01 / TCE09 / TCE10 : the happy path, and that it outlives the child ------------------------------
$t1 = New-TceArtifactPath -EvidenceDir $evi -Name 'TCE01.transcript.txt'
$x1 = Invoke-Child -Body "Write-Host 'doing work'`nWrite-Host 'SELFTEST_COMPLETED=YES'`nWrite-Host 'RESULT=SELFTEST_PASS'`nexit 0" -TranscriptPath $t1
$r1 = Register-TceChildEvidence -EvidenceDir $evi -Name 'TCE01' -TranscriptPath $t1 -ExitCode $x1 -RequireNonEmpty `
        -CompletionMarker 'SELFTEST_COMPLETED' -ResultMarker 'RESULT' -ExpectedResultValue 'SELFTEST_PASS'
Case 'TCE01-VALID-CHILD-PERSISTS-AND-ACCEPTS' ([bool]$r1.EvidenceOk -and $r1.Retained -and $x1 -eq 0) $true ("exit=$x1 reasons=" + ($r1.Reasons -join ','))

# The child process has exited by now; the evidence must still be here and must still hash to what was recorded.
$independent = Get-TceSha256 -Path $t1
Case 'TCE09-RECORDED-SHA-MATCHES-BYTES' ($independent -eq $r1.Sha256 -and $r1.Sha256.Length -eq 64) $true ("sha=" + $r1.Sha256.Substring(0, 16))
Case 'TCE10-EVIDENCE-SURVIVES-PARENT-EXIT' (Test-Path -LiteralPath $t1) $true

# ---- TCE02 : a FAILING child still leaves its diagnosis behind -------------------------------------------
$t2 = New-TceArtifactPath -EvidenceDir $evi -Name 'TCE02.transcript.txt'
$x2 = Invoke-Child -Body "Write-Host 'ROOT_CAUSE: leaf c5 exited 1'`nexit 1" -TranscriptPath $t2
$r2 = Register-TceChildEvidence -EvidenceDir $evi -Name 'TCE02' -TranscriptPath $t2 -ExitCode $x2 -RequireNonEmpty
$t2Text = if (Test-Path -LiteralPath $t2) { [System.IO.File]::ReadAllText($t2) } else { '' }
Case 'TCE02-FAILED-CHILD-EVIDENCE-PERSISTS' (($x2 -eq 1) -and $r2.Retained -and ($t2Text -match 'ROOT_CAUSE')) $true ("exit=$x2 retained=" + $r2.Retained)

# ---- TCE03 : no transcript at all -------------------------------------------------------------------------
$r3 = Register-TceChildEvidence -EvidenceDir $evi -Name 'TCE03' -TranscriptPath (Join-Path $evi 'does-not-exist.txt') -ExitCode 0 -RequireNonEmpty
Case 'TCE03-MISSING-TRANSCRIPT-REJECTED' ((-not $r3.EvidenceOk) -and (HasReason $r3 'TRANSCRIPT_ABSENT')) $true ("reasons=" + ($r3.Reasons -join ','))

# ---- TCE04 : present but empty, where a non-empty observation was expected --------------------------------
$t4 = New-TceArtifactPath -EvidenceDir $evi -Name 'TCE04.transcript.txt'
[System.IO.File]::WriteAllBytes($t4, @())
$r4 = Register-TceChildEvidence -EvidenceDir $evi -Name 'TCE04' -TranscriptPath $t4 -ExitCode 0 -RequireNonEmpty
Case 'TCE04-EMPTY-TRANSCRIPT-REJECTED' ((-not $r4.EvidenceOk) -and (HasReason $r4 'TRANSCRIPT_EMPTY')) $true ("reasons=" + ($r4.Reasons -join ','))

# ---- TCE05 : nobody captured the exit ---------------------------------------------------------------------
# $null is NOT the same as a non-zero exit: it means the parent never observed one, which is unfalsifiable.
$t5 = New-TceArtifactPath -EvidenceDir $evi -Name 'TCE05.transcript.txt'
[System.IO.File]::WriteAllText($t5, "some output`n")
$r5 = Register-TceChildEvidence -EvidenceDir $evi -Name 'TCE05' -TranscriptPath $t5 -ExitCode $null -RequireNonEmpty
Case 'TCE05-EXIT-NOT-OBSERVED-REJECTED' ((-not $r5.EvidenceOk) -and (HasReason $r5 'EXIT_NOT_OBSERVED')) $true ("reasons=" + ($r5.Reasons -join ','))

# ---- TCE06 : required result marker absent ----------------------------------------------------------------
$t6 = New-TceArtifactPath -EvidenceDir $evi -Name 'TCE06.transcript.txt'
[System.IO.File]::WriteAllText($t6, "work happened`nno verdict line here`n")
$r6 = Register-TceChildEvidence -EvidenceDir $evi -Name 'TCE06' -TranscriptPath $t6 -ExitCode 0 -RequireNonEmpty -ResultMarker 'RESULT' -ExpectedResultValue 'SELFTEST_PASS'
Case 'TCE06-MISSING-RESULT-MARKER-REJECTED' ((-not $r6.EvidenceOk) -and (HasReason $r6 'RESULT_MARKER_ABSENT')) $true ("reasons=" + ($r6.Reasons -join ','))

# ---- TCE07 : two different verdicts in one transcript -----------------------------------------------------
$t7 = New-TceArtifactPath -EvidenceDir $evi -Name 'TCE07.transcript.txt'
[System.IO.File]::WriteAllText($t7, "RESULT=SELFTEST_PASS`nRESULT=SELFTEST_FAIL`n")
$r7 = Register-TceChildEvidence -EvidenceDir $evi -Name 'TCE07' -TranscriptPath $t7 -ExitCode 0 -RequireNonEmpty -ResultMarker 'RESULT' -ExpectedResultValue 'SELFTEST_PASS'
Case 'TCE07-CONFLICTING-RESULT-MARKER-REJECTED' ((-not $r7.EvidenceOk) -and (HasReason $r7 'RESULT_MARKER_CONFLICTING')) $true ("reasons=" + ($r7.Reasons -join ','))

# ---- TCE08 : a single, coherent, WRONG verdict ------------------------------------------------------------
$t8 = New-TceArtifactPath -EvidenceDir $evi -Name 'TCE08.transcript.txt'
[System.IO.File]::WriteAllText($t8, "RESULT=SELFTEST_FAIL`n")
$r8 = Register-TceChildEvidence -EvidenceDir $evi -Name 'TCE08' -TranscriptPath $t8 -ExitCode 0 -RequireNonEmpty -ResultMarker 'RESULT' -ExpectedResultValue 'SELFTEST_PASS'
Case 'TCE08-UNEXPECTED-RESULT-VALUE-REJECTED' ((-not $r8.EvidenceOk) -and (HasReason $r8 'RESULT_MARKER_UNEXPECTED')) $true ("reasons=" + ($r8.Reasons -join ','))

# ---- TCE11 : child dies mid-sentence ----------------------------------------------------------------------
# The partial output is exactly what a post-mortem needs; it must not be discarded because it looks incomplete.
$t11 = New-TceArtifactPath -EvidenceDir $evi -Name 'TCE11.transcript.txt'
$x11 = Invoke-Child -Body "Write-Host 'phase 1 ok'`nWrite-Host 'phase 2 starting'`n[Environment]::Exit(3)" -TranscriptPath $t11
$r11 = Register-TceChildEvidence -EvidenceDir $evi -Name 'TCE11' -TranscriptPath $t11 -ExitCode $x11 -RequireNonEmpty -CompletionMarker 'SELFTEST_COMPLETED'
$t11Text = if (Test-Path -LiteralPath $t11) { [System.IO.File]::ReadAllText($t11) } else { '' }
Case 'TCE11-CRASH-AFTER-PARTIAL-OUTPUT-RETAINS-PARTIAL' `
  (($x11 -eq 3) -and $r11.Retained -and ($t11Text -match 'phase 2 starting') -and (-not $r11.EvidenceOk) -and (HasReason $r11 'COMPLETION_MARKER_COUNT_0')) $true `
  ("exit=$x11 reasons=" + ($r11.Reasons -join ','))

# ---- TCE13 : a verdict line that carries trailing detail --------------------------------------------------
# Suites in this lineage print e.g. "RESULT: ..._SELFTEST_PASS (... 87 assertions)". Comparing the whole
# remainder of the line against the expected value rejected a suite that had genuinely passed, which showed
# up as GATE 14 evidenceOk=False in FINAL_AUTHORITY_RUN_1. The verdict token is what must match.
$t13 = New-TceArtifactPath -EvidenceDir $evi -Name 'TCE13.transcript.txt'
[System.IO.File]::WriteAllText($t13, "work`nRESULT: SELFTEST_PASS (WHATEVER=NONE; 87 assertions)`n")
$r13 = Register-TceChildEvidence -EvidenceDir $evi -Name 'TCE13' -TranscriptPath $t13 -ExitCode 0 -RequireNonEmpty -ResultMarker 'RESULT' -ExpectedResultValue 'SELFTEST_PASS'
# And the FAIL variant with identical trailing shape must still be rejected.
$t13b = New-TceArtifactPath -EvidenceDir $evi -Name 'TCE13b.transcript.txt'
[System.IO.File]::WriteAllText($t13b, "work`nRESULT: SELFTEST_FAIL (3 of 87 assertions wrong)`n")
$r13b = Register-TceChildEvidence -EvidenceDir $evi -Name 'TCE13b' -TranscriptPath $t13b -ExitCode 0 -RequireNonEmpty -ResultMarker 'RESULT' -ExpectedResultValue 'SELFTEST_PASS'
Case 'TCE13-RESULT-MARKER-WITH-TRAILING-DETAIL-ACCEPTED' (([bool]$r13.EvidenceOk) -and (-not $r13b.EvidenceOk) -and (HasReason $r13b 'RESULT_MARKER_UNEXPECTED')) $true `
  ("passAccepted=" + $r13.EvidenceOk + " failRejected=" + (-not $r13b.EvidenceOk))

# ---- TCE12 : the helper's own identity --------------------------------------------------------------------
# The validators bind this helper by resolved path, not by command name. Prove the loaded function really came
# from the repository file rather than from something ambient that happened to define the same name.
$cmd = Get-Command Register-TceChildEvidence -CommandType Function -ErrorAction SilentlyContinue
$originFile = if ($cmd -and $cmd.ScriptBlock -and $cmd.ScriptBlock.File) { (Resolve-Path -LiteralPath $cmd.ScriptBlock.File).Path } else { '' }
Case 'TCE12-HELPER-IDENTITY-BOUND-TO-REPOSITORY-BYTES' ($originFile -eq (Resolve-Path -LiteralPath $HelperPath).Path) $true ("origin=" + $originFile)

$missing   = @($EXPECTED_CASES | Where-Object { $executed -notcontains $_ })
$duplicate = @($executed | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
$unknown   = @($executed | Where-Object { $EXPECTED_CASES -notcontains $_ })

Write-Host ''
Write-Host ("TCE_CASES=" + $EXPECTED_CASES.Count)
Write-Host ("TCE_EXECUTED=" + $executed.Count)
Write-Host ("TCE_PASSED=" + $pass)
Write-Host ("TCE_FAILED=" + $fail)
Write-Host ("TCE_MISSING_CASES=" + $missing.Count)
Write-Host ("TCE_DUPLICATE_CASES=" + $duplicate.Count)
Write-Host ("TCE_UNKNOWN_CASES=" + $unknown.Count)
Write-Host ("TCE_EVIDENCE_DIR=" + $evi)
if ($missing.Count)   { Write-Host ("MISSING: " + ($missing -join ',')) }
if ($duplicate.Count) { Write-Host ("DUPLICATE: " + ($duplicate -join ',')) }
if ($unknown.Count)   { Write-Host ("UNKNOWN: " + ($unknown -join ',')) }
Write-Host 'TCE_COMPLETED=YES'
if ($fail -gt 0 -or $missing.Count -gt 0 -or $duplicate.Count -gt 0 -or $unknown.Count -gt 0) {
  Write-Host 'RESULT=TRUSTED_CHILD_EVIDENCE_SELFTEST_FAIL'; exit 1
}
Write-Host 'RESULT=TRUSTED_CHILD_EVIDENCE_SELFTEST_PASS'
exit 0
