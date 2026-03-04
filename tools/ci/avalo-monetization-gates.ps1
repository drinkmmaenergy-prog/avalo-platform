param(
  [string]$RepoRoot = "",
  [string]$OutDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$p) {
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
}

function Write-ReportLine([string]$path, [string]$line) {
  Add-Content -Path $path -Value $line -Encoding UTF8
}

function Get-RepoRoot() {
  if ($RepoRoot -and (Test-Path $RepoRoot)) { return (Resolve-Path $RepoRoot).Path }
  return (Get-Location).Path
}

function Get-OutDir([string]$root) {
  if ($OutDir) { Ensure-Dir $OutDir; return (Resolve-Path $OutDir).Path }
  $d = Join-Path $root "audit-out"
  Ensure-Dir $d
  return $d
}

function Get-TrackedTsFiles([string]$root) {
  # Bez node_modules / dist / build / .next / .git
  $exclude = @("\node_modules\", "\dist\", "\build\", "\.next\", "\.git\", "\.turbo\", "\out\", "\coverage\")
  $files = Get-ChildItem -Path $root -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx,*.mjs,*.cjs | ForEach-Object { $_.FullName }
  $filtered = @()
  foreach ($f in $files) {
    $skip = $false
    foreach ($ex in $exclude) {
      if ($f -like "*$ex*") { $skip = $true; break }
    }
    if (-not $skip) { $filtered += $f }
  }
  return $filtered
}

function Scan-Patterns([string[]]$files, [hashtable]$patterns) {
  $hits = @()
  foreach ($file in $files) {
    $content = Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    $lines = $content -split "`n"
    for ($i = 0; $i -lt $lines.Length; $i++) {
      $line = $lines[$i]
      foreach ($k in $patterns.Keys) {
        $rx = $patterns[$k]
        if ($line -match $rx) {
          $hits += [pscustomobject]@{
            File = $file
            Line = ($i + 1)
            Pattern = $k
            Text = $line.Trim()
          }
        }
      }
    }
  }
  return $hits
}

$root = Get-RepoRoot
$out = Get-OutDir $root
$report = Join-Path $out "MONETIZATION_SCAN.txt"

"Scanning repository..." | Write-Host
$ts = Get-TrackedTsFiles $root

# Forbidden: lokalne waluty w logice (poza UI/display)
$forbidden = @{
  "TOKEN_PAYOUT_PLN" = "TOKEN_PAYOUT_PLN"
  "TOKEN_PAYOUT_EUR" = "TOKEN_PAYOUT_EUR"
  "TOKEN_PAYOUT_GBP" = "TOKEN_PAYOUT_GBP"
  "SETTLEMENT_RATE_PLN" = "SETTLEMENT_RATE_PLN"
  "PAYOUT_RATE_PLN" = "PAYOUT_RATE_PLN"
  "TOKEN_TO_PLN_RATE" = "TOKEN_TO_PLN_RATE"
  "TOKEN_TO_EUR_RATE" = "TOKEN_TO_EUR_RATE"
  "TOKEN_TO_GBP_RATE" = "TOKEN_TO_GBP_RATE"
  "pricePLN/priceEUR/priceGBP" = "(pricePLN|priceEUR|priceGBP)"
  "earningsPLN/earningsEUR/earningsGBP" = "(earningsPLN|earningsEUR|earningsGBP)"
  "PLN literal" = "(\bPLN\b|zł|zl\b)"
  "EUR literal" = "(\bEUR\b|€)"
  "GBP literal" = "(\bGBP\b|£)"
}

# Risky: message-based charging remnants
$risky = @{
  "tokensPerMessage" = "(tokensPerMessage|TOKENS_PER_MESSAGE)"
  "messageCostTokens" = "(messageCostTokens|MESSAGE_COST_TOKENS)"
  "100 tokens per message" = "(100\s*tokens|cost\s*=\s*100)"
}

# Required: canonical constants must exist
$required = @{
  "TOKEN_PAYOUT_USD" = "TOKEN_PAYOUT_USD\s*=\s*0\.03"
  "payout fee 5%" = "(payoutFeePlatformPercent\s*:\s*0\.05|PAYOUT_FEE_PLATFORM_PERCENT\s*=\s*0\.05)"
}

# Report header
Ensure-Dir (Split-Path $report -Parent)
Set-Content -Path $report -Value "" -Encoding UTF8
Write-ReportLine $report "=== SCAN TARGETS ==="
Write-ReportLine $report ""
Write-ReportLine $report ("RepoRoot: " + $root)
Write-ReportLine $report ("Timestamp: " + (Get-Date).ToString("o"))
Write-ReportLine $report ""
Write-ReportLine $report ("Files scanned: " + $ts.Count)
Write-ReportLine $report ""

# Scan
$forbiddenHits = Scan-Patterns $ts $forbidden
$riskyHits = Scan-Patterns $ts $risky
$requiredHits = Scan-Patterns $ts $required

Write-ReportLine $report "=== FORBIDDEN PATTERN HITS ==="
if ($forbiddenHits.Count -eq 0) {
  Write-ReportLine $report "NONE"
} else {
  foreach ($h in $forbiddenHits) {
    Write-ReportLine $report ("{0}:{1}: [{2}] {3}" -f $h.File, $h.Line, $h.Pattern, $h.Text)
  }
}

Write-ReportLine $report ""
Write-ReportLine $report "=== RISKY (CHAT CHARGING) HITS ==="
if ($riskyHits.Count -eq 0) {
  Write-ReportLine $report "NONE"
} else {
  foreach ($h in $riskyHits) {
    Write-ReportLine $report ("{0}:{1}: [{2}] {3}" -f $h.File, $h.Line, $h.Pattern, $h.Text)
  }
}

Write-ReportLine $report ""
Write-ReportLine $report "=== REQUIRED CANONICAL ASSERTIONS ==="
foreach ($k in $required.Keys) {
  $rx = $required[$k]
  $found = $false
  foreach ($f in $ts) {
    $c = Get-Content -LiteralPath $f -Raw -ErrorAction SilentlyContinue
    if ($c -and ($c -match $rx)) { $found = $true; break }
  }
  if ($found) { Write-ReportLine $report ("PASS: " + $k) }
  else { Write-ReportLine $report ("FAIL: missing " + $k) }
}

Write-Host "DONE"
Write-Host "Report:"
Write-Host $report

if ($forbiddenHits.Count -gt 0) { exit 2 }
if ($riskyHits.Count -gt 0) { exit 3 }
# required failures should fail too
$reqFail = $false
foreach ($k in $required.Keys) {
  $rx = $required[$k]
  $found = $false
  foreach ($f in $ts) {
    $c = Get-Content -LiteralPath $f -Raw -ErrorAction SilentlyContinue
    if ($c -and ($c -match $rx)) { $found = $true; break }
  }
  if (-not $found) { $reqFail = $true }
}
if ($reqFail) { exit 4 }

exit 0