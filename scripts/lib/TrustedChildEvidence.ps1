# TrustedChildEvidence.ps1 - retention and adjudication contract for child processes the IAM validators trust.
#
# WHY THIS EXISTS.
#
# Twice in R8 a parent validator trusted a child, the child failed, and the parent deleted the child's output
# before anyone could read it:
#
#   * IAM-01B1 GATE 2 deleted the nested IAM-01A transcript after reading two markers. One battery failure
#     became permanently unattributable.
#   * IAM-01A GATE 2 does the same to the R1B-1 prior-validator cascade. A real GATE 2 failure occurred on
#     2026-08-17 and its cause is unknown for exactly this reason.
#
# A cross-cutting audit then found the same shape on the emulator log and the Jest report in BOTH validators,
# where the artefact is destroyed before - or regardless of - the gate's own decision.
#
# The rule this file enforces is deliberately blunt:
#
#     A parent may not destroy the evidence for a verdict it is about to publish.
#
# Evidence is written to a run-scoped directory rather than $env:TEMP, is never deleted by the parent on any
# path (pass, fail, throw, exit), and every child gets a machine-readable record: native exit, transcript
# path, byte count and SHA-256. A reviewer can then re-derive the parent's verdict from bytes instead of
# taking the parent's word for it.
#
# LAYERING. The R8 evidence tree already has a generic child-adjudication contract (R8ChildContract.ps1), but
# it lives in the review bundle, not in the repository. These validators must run from a clean checkout of the
# checkpoint with no evidence tree present, so they cannot depend on it. This file implements the equivalent
# semantics repository-side; the regression suite asserts the two agree on the cases that matter.
#
# WHAT THIS FILE DOES NOT DO. It does not decide whether a gate passes. It persists evidence and reports what
# the evidence says. The gates keep their own logic.

# DELIBERATELY NO Set-StrictMode HERE. This file is dot-sourced into the IAM validators, and Set-StrictMode
# applies to the CALLER'S scope for the remainder of that script - it would silently impose strict semantics on
# two large validators that were never written under them, turning ordinary unset-variable reads into
# terminating errors mid-gate. A helper must not change the language rules of the script that loads it.

# Run-scoped evidence directory. Deterministic per process, overridable so a battery can collect every
# validator's child evidence into one place alongside the transcripts it already keeps.
function Get-TceEvidenceDir {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Validator)
  $base = $env:AVALO_IAM_CHILD_EVIDENCE_DIR
  if ([string]::IsNullOrWhiteSpace($base)) { $base = Join-Path $env:TEMP 'avalo-iam-child-evidence' }
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
  $dir = Join-Path $base ($Validator + '-' + $stamp + '-' + $PID)
  [void][System.IO.Directory]::CreateDirectory($dir)
  return $dir
}

function New-TceArtifactPath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$EvidenceDir,
    [Parameter(Mandatory)][string]$Name
  )
  # No GUID in the name: the point is that a reviewer can find "the R1B-1 cascade transcript" by name.
  return (Join-Path $EvidenceDir $Name)
}

function Get-TceSha256 {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Path)
  # BCL primitive, not Get-FileHash: Windows PowerShell 5.1 launched from a PowerShell 7 parent inherits 7's
  # PSModulePath, binds Microsoft.PowerShell.Utility 7.0.0.0, and Get-FileHash is then absent entirely. R8
  # already had one security control pass for the wrong reason because of that.
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([System.IO.File]::ReadAllBytes($Path))) -replace '-', '') }
  finally { $sha.Dispose() }
}

# Persist and adjudicate one trusted child. The transcript must already have been written by the caller
# (the redirection shapes differ per child: `*> file`, --outputFile, emulators:exec logs).
#
# Returns an object; it never throws for a failing child, because "the child failed" is a result to be
# reported with its evidence, not an exception that unwinds past the reporting.
function Register-TceChildEvidence {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$EvidenceDir,
    [Parameter(Mandatory)][string]$Name,              # e.g. 'GATE2_R1B1_CASCADE'
    [Parameter(Mandatory)][AllowEmptyString()][string]$TranscriptPath,
    [Parameter(Mandatory)][AllowNull()]$ExitCode,
    [string]$CompletionMarker = '',                   # required exactly once when supplied
    [string]$ResultMarker = '',                       # required exactly once when supplied
    [string]$ExpectedResultValue = '',
    [switch]$RequireNonEmpty
  )
  $reasons = New-Object System.Collections.Generic.List[string]

  $exists = (-not [string]::IsNullOrWhiteSpace($TranscriptPath)) -and (Test-Path -LiteralPath $TranscriptPath -PathType Leaf)
  if (-not $exists) { $reasons.Add('TRANSCRIPT_ABSENT') | Out-Null }

  $bytes = 0; $sha = ''
  $text = ''
  if ($exists) {
    $raw = [System.IO.File]::ReadAllBytes($TranscriptPath)
    $bytes = $raw.Length
    $sha = Get-TceSha256 -Path $TranscriptPath
    $text = [System.IO.File]::ReadAllText($TranscriptPath)
    if ($RequireNonEmpty -and $bytes -le 0) { $reasons.Add('TRANSCRIPT_EMPTY') | Out-Null }
  }

  # Exit must be OBSERVED. $null means nobody captured it, which is different from a non-zero exit and must
  # not be silently coerced to one.
  if ($null -eq $ExitCode) { $reasons.Add('EXIT_NOT_OBSERVED') | Out-Null }

  # Marker cardinality. "Contains the string" is not enough: a child that prints its result marker twice with
  # different values, or prints a completion marker it never earned, is exactly the evidence shape R8's child
  # contract exists to reject.
  $completionCount = 0
  if ($CompletionMarker -and $exists) {
    $completionCount = @([regex]::Matches($text, "(?m)^\s*" + [regex]::Escape($CompletionMarker) + "\s*$|^\s*" + [regex]::Escape($CompletionMarker) + "\s*=")).Count
    if ($completionCount -ne 1) { $reasons.Add('COMPLETION_MARKER_COUNT_' + $completionCount) | Out-Null }
  }
  $resultValues = @()
  if ($ResultMarker -and $exists) {
    # The VERDICT TOKEN is the first whitespace-delimited word after the marker. Suites in this lineage append
    # detail to their result line, e.g.
    #     RESULT: EMULATOR_LIFECYCLE_ADJUDICATION_SELFTEST_PASS (... 87 assertions)
    # Comparing the whole remainder of the line against the expected value rejected a suite that had actually
    # passed - the contract inventing a failure out of a suffix. The token still distinguishes _PASS from
    # _FAIL, so nothing is loosened about which verdict is accepted.
    foreach ($m in [regex]::Matches($text, "(?m)^\s*" + [regex]::Escape($ResultMarker) + "\s*[:=]\s*(?<v>\S+)")) {
      $resultValues += $m.Groups['v'].Value
    }
    $distinct = @($resultValues | Sort-Object -Unique)
    if ($resultValues.Count -eq 0) { $reasons.Add('RESULT_MARKER_ABSENT') | Out-Null }
    elseif ($distinct.Count -gt 1) { $reasons.Add('RESULT_MARKER_CONFLICTING') | Out-Null }
    elseif ($ExpectedResultValue -and ($distinct[0] -ne $ExpectedResultValue)) { $reasons.Add('RESULT_MARKER_UNEXPECTED') | Out-Null }
  }

  # The record is written next to the transcript so the pair travels together.
  $recordPath = Join-Path $EvidenceDir ($Name + '.record.tsv')
  $rec = New-Object System.Collections.Generic.List[string]
  $rec.Add("key`tvalue") | Out-Null
  $rec.Add("name`t$Name") | Out-Null
  $rec.Add("transcript`t$TranscriptPath") | Out-Null
  $rec.Add("transcript_bytes`t$bytes") | Out-Null
  $rec.Add("transcript_sha256`t$sha") | Out-Null
  $rec.Add("exit`t" + $(if ($null -eq $ExitCode) { 'NOT_OBSERVED' } else { [string]$ExitCode })) | Out-Null
  $rec.Add("completion_marker_count`t$completionCount") | Out-Null
  $rec.Add("result_values`t" + ($resultValues -join '|')) | Out-Null
  $rec.Add("reasons`t" + ($reasons -join ',')) | Out-Null
  [System.IO.File]::WriteAllText($recordPath, (($rec -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))

  # Machine-readable parent output. Emitted on every path, so a battery can gate on the child's evidence
  # existing rather than inferring it from the parent's aggregate exit.
  Write-Host ("IAM_CHILD_" + $Name + "_EXIT=" + $(if ($null -eq $ExitCode) { 'NOT_OBSERVED' } else { [string]$ExitCode }))
  Write-Host ("IAM_CHILD_" + $Name + "_TRANSCRIPT=" + $TranscriptPath)
  Write-Host ("IAM_CHILD_" + $Name + "_TRANSCRIPT_BYTES=" + $bytes)
  Write-Host ("IAM_CHILD_" + $Name + "_TRANSCRIPT_SHA256=" + $sha)
  Write-Host ("IAM_CHILD_" + $Name + "_RETAINED=" + $(if ($exists) { 'YES' } else { 'NO' }))
  Write-Host ("IAM_CHILD_" + $Name + "_EVIDENCE_OK=" + $(if ($reasons.Count -eq 0) { 'YES' } else { 'NO' }))
  if ($reasons.Count -gt 0) { Write-Host ("IAM_CHILD_" + $Name + "_EVIDENCE_REASONS=" + ($reasons -join ',')) }

  return [pscustomobject]@{
    Name           = $Name
    Transcript     = $TranscriptPath
    Bytes          = $bytes
    Sha256         = $sha
    Exit           = $ExitCode
    Retained       = $exists
    EvidenceOk     = ($reasons.Count -eq 0)
    Reasons        = @($reasons)
    Text           = $text
    RecordPath     = $recordPath
  }
}
