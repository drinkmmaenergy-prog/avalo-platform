#Requires -Version 5.1
<#
  RuntimeLogScan.ps1  —  validation-only helper (dot-sourceable).

  Purpose
  -------
  Provides a PRECISE, REDACTING Stripe charge-ID ("ch_") runtime-log leak matcher that
  replaces the previous over-broad, case-insensitive substring detector
  (`Select-String -SimpleMatch 'ch_'`).

  The old detector matched the substring "CH_" inside ordinary identifiers such as
  `SOFT_LAUNCH_DISABLED` (LAUN**CH_**DISABLED), producing a false
  `P0R1_RUNTIME_LOG_LEAKS_PRESENT` failure. This helper detects only a real, standalone
  charge-ID-shaped token while preserving full coverage for genuine Stripe charge IDs.

  It also re-exposes the EXACT SimpleMatch primitive the validators use for the remaining
  prohibited-pattern categories, so regression coverage can prove those categories are
  unchanged.

  Scope: READ-ONLY validation tooling. No production code, no rules, no config, no deploy.
  Installs nothing.
#>

# Precise Stripe charge-ID token detector.
#   (?<![A-Za-z0-9_])  — a valid delimiter/start must precede 'ch_' (rejects LAUNCH_/embedding).
#   ch_                — literal, matched CASE-SENSITIVELY (Stripe prefixes are lowercase;
#                        this alone rejects the uppercase 'CH_' in LAUNCH_DISABLED).
#   [A-Za-z0-9]{8,}    — a valid Stripe id continuation (real charge IDs are long alphanumerics).
# [regex] in .NET is case-sensitive by default, which is exactly what we want here.
$script:StripeChargeIdRegex = [regex]'(?<![A-Za-z0-9_])ch_[A-Za-z0-9]{8,}'

function Test-IsStripeChargeIdLeak {
  <#
    Returns $true if the line contains a real, standalone Stripe charge-ID-shaped token.
    Never returns or echoes the matched token.
  #>
  [OutputType([bool])]
  param([Parameter(Mandatory)][AllowEmptyString()][string]$Line)
  return $script:StripeChargeIdRegex.IsMatch($Line)
}

function Measure-StripeChargeIdLeaks {
  <#
    Scans the supplied lines and returns a REDACTED summary object only:
      Rule           = 'stripe_charge_id'
      Classification = 'REDACTED_STRIPE_CHARGE_ID'
      Count          = <int>
    The raw matched token is deliberately NOT captured, returned, or printed.
  #>
  [OutputType([pscustomobject])]
  param([Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Lines)
  $count = 0
  foreach ($l in $Lines) {
    if ($null -ne $l -and $script:StripeChargeIdRegex.IsMatch($l)) { $count++ }
  }
  return [pscustomobject]@{
    Rule           = 'stripe_charge_id'
    Classification = 'REDACTED_STRIPE_CHARGE_ID'
    Count          = $count
  }
}

function Measure-SimpleForbiddenLeaks {
  <#
    The EXACT primitive the validators use for the non-'ch_' prohibited-pattern categories
    (case-insensitive literal substring via Select-String -SimpleMatch). Re-exposed here so
    regression can prove those categories keep their existing behavior. Returns the hit count.
  #>
  [OutputType([int])]
  param(
    [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Lines,
    [Parameter(Mandatory)][string]$Pattern
  )
  return @($Lines | Select-String -SimpleMatch $Pattern).Count
}
