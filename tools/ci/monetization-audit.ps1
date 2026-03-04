param(
  [string]$RepoRoot = (Resolve-Path ".").Path
)

$ErrorActionPreference = "Stop"

$OutDir = Join-Path $RepoRoot "audit-out"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$report = Join-Path $OutDir "MONETIZATION_AUDIT.txt"
Remove-Item $report -ErrorAction SilentlyContinue

function Write-Section([string]$title) {
  "`n=== $title ===`n" | Out-File -FilePath $report -Append -Encoding UTF8
}

function Append-Lines([string[]]$lines) {
  $lines | Out-File -FilePath $report -Append -Encoding UTF8
}

Write-Section "SCAN TARGETS"
Append-Lines @(
  "RepoRoot: $RepoRoot",
  "Timestamp: $(Get-Date -Format o)"
)

# Forbidden patterns in production logic
$forbidden = @(
  "TOKEN_PAYOUT_PLN",
  "TOKEN_TO_PLN",
  "pricePLN",
  "PAYOUT_RATE_PLN",
  "0.20 PLN",
  "70/30",
  "80/20",
  "60/40",
  "50/50"
)

# Scan paths
$targets = @(
  "$RepoRoot\functions\src",
  "$RepoRoot\app-web\src"
)

Write-Section "FORBIDDEN PATTERN HITS"

$hits = @()

foreach ($t in $targets) {
  if (Test-Path $t) {
    foreach ($p in $forbidden) {
      $cmd = "findstr /s /n /i /c:`"$p`" `"$t\*.ts`" `"$t\*.tsx`""
      $out = cmd.exe /c $cmd 2>$null
      if ($LASTEXITCODE -eq 0 -and $out) {
        $hits += $out
      }
    }
  }
}

if ($hits.Count -eq 0) {
  Append-Lines @("No forbidden hits found.")
  Write-Host "PASS. No forbidden patterns found."
  exit 0
} else {
  Append-Lines $hits
  Write-Host "FAIL. Forbidden patterns found. See $report"
  exit 2
}
