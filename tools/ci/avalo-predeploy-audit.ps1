param(
  [string]$RepoRoot = "C:\a\avalo",
  [string]$FunctionsDir = "",
  [string]$OutDir = "",
  [switch]$FailFast
)

$ErrorActionPreference = "Stop"

function Write-Section([string]$title) { Write-Host ""; Write-Host "===== $title =====" }
function Ensure-Dir([string]$p) { if (!(Test-Path $p)) { New-Item -ItemType Directory -Force $p | Out-Null } }

function Run([string]$cmd, [string]$cwd) {
  Write-Host ""
  Write-Host ">>> $cmd"
  $p = Start-Process -FilePath "pwsh" -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-Command",$cmd) -WorkingDirectory $cwd -Wait -PassThru -NoNewWindow
  if ($p.ExitCode -ne 0) { throw "Command failed ($($p.ExitCode)): $cmd" }
}

function Read-Text([string]$path) {
  if (!(Test-Path $path)) { return "" }
  return Get-Content $path -Raw -ErrorAction SilentlyContinue
}

function Grep([string]$root, [string[]]$patterns, [string[]]$includeGlobs) {
  $results = @()
  foreach ($glob in $includeGlobs) {
    $files = Get-ChildItem -Path $root -Recurse -File -Filter $glob -ErrorAction SilentlyContinue
    foreach ($f in $files) {
      $txt = Read-Text $f.FullName
      if ([string]::IsNullOrWhiteSpace($txt)) { continue }
      foreach ($pat in $patterns) {
        if ($txt -match $pat) {
          $results += [PSCustomObject]@{ file = $f.FullName; pattern = $pat }
        }
      }
    }
  }
  return $results
}

if ([string]::IsNullOrWhiteSpace($FunctionsDir)) { $FunctionsDir = Join-Path $RepoRoot "functions" }
if ([string]::IsNullOrWhiteSpace($OutDir)) { $OutDir = Join-Path $RepoRoot "audit-out" }
Ensure-Dir $OutDir

Write-Section "AVALO PREDEPLOY AUDIT"
Write-Host "RepoRoot: $RepoRoot"
Write-Host "Functions: $FunctionsDir"
Write-Host "OutDir: $OutDir"

$reportPath = Join-Path $OutDir "PREDEPLOY_AUDIT.txt"
"AVALO PREDEPLOY AUDIT REPORT" | Set-Content -Encoding UTF8 $reportPath
("Timestamp: " + (Get-Date).ToString("s")) | Add-Content -Encoding UTF8 $reportPath

# STEP 1 — BUILD FUNCTIONS
Write-Section "STEP 1 — BUILD FUNCTIONS"
Run "cd `"$FunctionsDir`"; npm run build" $RepoRoot
"STEP 1 OK: npm run build" | Add-Content -Encoding UTF8 $reportPath

# STEP 2 — TSC AUDIT (NO LEGACY)
Write-Section "STEP 2 — TSC AUDIT (NO LEGACY)"
$auditTs = Join-Path $FunctionsDir "tsconfig.audit.json"
if (!(Test-Path $auditTs)) { throw "Missing tsconfig.audit.json at: $auditTs" }
Run "cd `"$FunctionsDir`"; npx tsc -p tsconfig.audit.json" $RepoRoot
"STEP 2 OK: tsc audit" | Add-Content -Encoding UTF8 $reportPath

# STEP 3 — SOT INVARIANTS SCAN (TEXTUAL)
Write-Section "STEP 3 — SOT INVARIANTS SCAN"
$rootScan = $RepoRoot

$currencyHits = Grep $rootScan @("\bPLN\b","\bEUR\b","\bGBP\b","\bZŁ\b","Polish Z","zł") @("*.ts","*.tsx","*.md")
$currencyHits = $currencyHits | Where-Object { $_.file -notmatch "\\legacy\\|\.legacy\." }

$payoutHits = Grep $rootScan @("TOKEN_PAYOUT_USD\s*=\s*0\.03","TOKEN_PAYOUT_USD\s*=\s*0\.0[0-9]") @("*.ts","*.md")
$layoutFeeHits = Grep $rootScan @("layout\s*fee","LAYOUT_FEE","0\.05","5%") @("*.ts","*.md")
$splitHits = Grep $rootScan @("65\s*\/\s*35","80\s*\/\s*20","split","platformFee","creatorShare","revenueShare") @("*.ts","*.md")

"--- SOT SCAN ---" | Add-Content -Encoding UTF8 $reportPath
("Currency hits (non-legacy): " + $currencyHits.Count) | Add-Content -Encoding UTF8 $reportPath
$currencyHits | ForEach-Object { ("CURRENCY_HIT: " + $_.file + " :: " + $_.pattern) } | Add-Content -Encoding UTF8 $reportPath

("Payout hits: " + $payoutHits.Count) | Add-Content -Encoding UTF8 $reportPath
$payoutHits | ForEach-Object { ("PAYOUT_HIT: " + $_.file + " :: " + $_.pattern) } | Add-Content -Encoding UTF8 $reportPath

("Layout fee hits: " + $layoutFeeHits.Count) | Add-Content -Encoding UTF8 $reportPath
$layoutFeeHits | ForEach-Object { ("LAYOUTFEE_HIT: " + $_.file + " :: " + $_.pattern) } | Add-Content -Encoding UTF8 $reportPath

("Split hits: " + $splitHits.Count) | Add-Content -Encoding UTF8 $reportPath
$splitHits | ForEach-Object { ("SPLIT_HIT: " + $_.file + " :: " + $_.pattern) } | Add-Content -Encoding UTF8 $reportPath

# STEP 4 — EXPORTS / DEPLOY FILTER SANITY
Write-Section "STEP 4 — DEPLOY FILTER SANITY"
$indexTs = Join-Path $FunctionsDir "src\index.ts"
$indexTxt = Read-Text $indexTs
if ($indexTxt -notmatch "\bhealth\b") {
  "WARN: health export not detected in functions/src/index.ts" | Add-Content -Encoding UTF8 $reportPath
  Write-Host "WARN: health export not detected in $indexTs"
} else {
  "OK: health symbol appears in functions/src/index.ts" | Add-Content -Encoding UTF8 $reportPath
}

# STEP 5 — REGION mentions (heurystyka)
Write-Section "STEP 5 — REGION MENTIONS (HEURISTIC)"
$regionHits = Grep $FunctionsDir @("europe-west1","us-west1","us-central1","asia-northeast1","setGlobalOptions","region\s*:\s*") @("*.ts")
("Region mentions: " + $regionHits.Count) | Add-Content -Encoding UTF8 $reportPath
"NOTE: bucket region must be verified via Firebase/Console deploy output." | Add-Content -Encoding UTF8 $reportPath

Write-Host ""
Write-Host "PASS: BUILD + AUDIT TSC completed. Review: $reportPath"
