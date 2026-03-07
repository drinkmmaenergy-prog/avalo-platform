param(
  [string]$RepoRoot = "C:\a\avalo",
  [switch]$RunBuild = $true
)

$ErrorActionPreference = "Stop"

function Info($m){ Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[OK]   $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Fail($m){ Write-Host "[FAIL] $m" -ForegroundColor Red }

function Backup-File([string]$path){
  if(!(Test-Path $path)){ return $null }
  $stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
  $bak = "$path.bak.$stamp"
  Copy-Item -Force $path $bak
  return $bak
}

function Replace-Once([string]$path, [string]$findRegex, [string]$replace, [string]$label){
  if(!(Test-Path $path)){ Warn "$label: missing file: $path"; return $false }
  $raw = Get-Content $path -Raw -Encoding UTF8
  if($raw -notmatch $findRegex){
    Warn "$label: pattern not found, SKIP"
    return $false
  }
  Backup-File $path | Out-Null
  $new = [regex]::Replace($raw, $findRegex, $replace, 1)
  Set-Content -Encoding UTF8 $path $new
  Ok "$label: patched"
  return $true
}

function Ensure-Import([string]$path, [string]$importLine){
  $raw = Get-Content $path -Raw -Encoding UTF8
  if($raw -match [regex]::Escape($importLine)){ return $false }
  Backup-File $path | Out-Null
  # Insert after leading comments/shebang/blank lines
  $lines = Get-Content $path -Encoding UTF8
  $i = 0
  while($i -lt $lines.Count -and ($lines[$i].Trim() -eq "" -or $lines[$i].Trim().StartsWith("//") -or $lines[$i].Trim().StartsWith("/*") -or $lines[$i].Trim().StartsWith("*") -or $lines[$i].Trim().StartsWith("*/"))){
    $i++
  }
  $out = New-Object System.Collections.Generic.List[string]
  for($j=0;$j -lt $i;$j++){ $out.Add($lines[$j]) }
  $out.Add($importLine)
  for($j=$i;$j -lt $lines.Count;$j++){ $out.Add($lines[$j]) }
  Set-Content -Encoding UTF8 $path $out
  Ok "Inserted import in: $path"
  return $true
}

$webEconomy = Join-Path $RepoRoot "app-web\src\lib\economyConfig.ts"
$pack418    = Join-Path $RepoRoot "functions\src\types\shared\compliance\pack418-compliance-constants.ts"
$pack114    = Join-Path $RepoRoot "functions\src\pack114-earnings-integration.ts"
$paymentsTs = Join-Path $RepoRoot "functions\src\payments.ts"

Info "=== AVALO AUTO-FIX: PAYOUT CONSISTENCY ==="

# (1) Frontend payout: 0.01 -> 0.03 (conflict in audits)
Replace-Once $webEconomy "export\s+const\s+TOKEN_PAYOUT_USD\s*=\s*0\.01\s*;" "export const TOKEN_PAYOUT_USD = 0.03;" "WEB TOKEN_PAYOUT_USD 0.01->0.03" | Out-Null

# (2) pack418: TOKEN_TOKEN_PAYOUT_USD = 0.04 -> import TOKEN_PAYOUT_USD and alias it
if(Test-Path $pack418){
  $raw = Get-Content $pack418 -Raw -Encoding UTF8
  if($raw -match "export\s+const\s+TOKEN_TOKEN_PAYOUT_USD\s*=\s*0\.04\s*;"){
    Ensure-Import $pack418 "import { TOKEN_PAYOUT_USD } from '../../../config/economyConfig';" | Out-Null
    Replace-Once $pack418 "export\s+const\s+TOKEN_TOKEN_PAYOUT_USD\s*=\s*0\.04\s*;" "export const TOKEN_TOKEN_PAYOUT_USD = TOKEN_PAYOUT_USD;" "PACK418 TOKEN_TOKEN_PAYOUT_USD 0.04->TOKEN_PAYOUT_USD" | Out-Null
  } else { Warn "PACK418: hardcode 0.04 not found, SKIP" }
} else { Warn "PACK418 file missing, SKIP" }

# (3) pack114: remove local TOKEN_PAYOUT_USD = 0.1
if(Test-Path $pack114){
  $raw = Get-Content $pack114 -Raw -Encoding UTF8
  if($raw -match "const\s+TOKEN_PAYOUT_USD\s*=\s*0\.1\s*;"){
    Ensure-Import $pack114 "import { TOKEN_PAYOUT_USD } from './config/economyConfig';" | Out-Null
    Replace-Once $pack114 "const\s+TOKEN_PAYOUT_USD\s*=\s*0\.1\s*;" "" "PACK114 remove local TOKEN_PAYOUT_USD=0.1" | Out-Null
  } else { Warn "PACK114: local 0.1 not found, SKIP" }
} else { Warn "PACK114 file missing, SKIP" }

# (4) payments.ts: replace local const TOKEN_PAYOUT_USD = 0.03 with import
if(Test-Path $paymentsTs){
  $raw = Get-Content $paymentsTs -Raw -Encoding UTF8
  if($raw -match "const\s+TOKEN_PAYOUT_USD\s*=\s*0\.03\s*;"){
    Ensure-Import $paymentsTs "import { TOKEN_PAYOUT_USD } from './config/economyConfig';" | Out-Null
    Replace-Once $paymentsTs "const\s+TOKEN_PAYOUT_USD\s*=\s*0\.03\s*;" "" "PAYMENTS remove local TOKEN_PAYOUT_USD=0.03" | Out-Null
  } else { Warn "PAYMENTS: local 0.03 const not found, SKIP" }
} else { Warn "payments.ts missing, SKIP" }

Info "=== REPORT: ALL SPLITS / COMMISSIONS LOCATIONS ==="

$out = Join-Path $RepoRoot "audit-out\SPLITS_FUNCTIONS_REPORT.md"
"# Avalo — Splits & Commissions Report (AUTO)`n" | Set-Content -Encoding UTF8 $out
("Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") + "`n") | Add-Content -Encoding UTF8 $out
("Goal: list all places that define or apply creator/platform splits, fees, commissions.`n") | Add-Content -Encoding UTF8 $out

$include = @("*.ts","*.tsx","*.js")
$excludeRx = "\\node_modules\\|\\\.next\\|\\dist\\|\\build\\|\\functions\\lib\\"

$patterns = @(
  "CREATOR_REVENUE_SHARE",
  "AVALO_REVENUE_SHARE",
  "creatorShare",
  "platformShare",
  "platformFee",
  "feePct",
  "commission",
  "revenueSplit",
  "SPLITS_BY_SURFACE",
  "getSplitForSurface",
  "0\.65",
  "0\.70",
  "0\.80",
  "0\.90",
  "65\s*\/\s*35",
  "70\s*\/\s*30",
  "80\s*\/\s*20",
  "90\s*\/\s*10"
)

$files = Get-ChildItem -Path $RepoRoot -Recurse -File -Include $include |
  Where-Object { $_.FullName -notmatch $excludeRx } |
  Sort-Object FullName

$hits = New-Object System.Collections.Generic.List[object]

foreach($f in $files){
  foreach($p in $patterns){
    $m = Select-String -Path $f.FullName -Pattern $p -AllMatches -ErrorAction SilentlyContinue
    if($m){
      foreach($mm in $m){
        $hits.Add([PSCustomObject]@{
          file = $mm.Path
          line = $mm.LineNumber
          text = $mm.Line.Trim()
          pat  = $p
        })
      }
    }
  }
}

("Total hits: " + $hits.Count + "`n") | Add-Content -Encoding UTF8 $out

# Group by file, show top lines
$groups = $hits | Group-Object file | Sort-Object Count -Descending
foreach($g in $groups){
  ("## " + $g.Name + "  (hits: " + $g.Count + ")`n") | Add-Content -Encoding UTF8 $out

  # Try extract exported functions/constants around splits
  $sample = $g.Group | Sort-Object line | Select-Object -First 80
  foreach($h in $sample){
    ("- L" + $h.line + " [" + $h.pat + "] `" + ($h.text -replace "`r|`n"," ") + "`") | Add-Content -Encoding UTF8 $out
  }
  "" | Add-Content -Encoding UTF8 $out
}

Ok "Wrote: $out"

if($RunBuild){
  Info "=== VERIFY BUILDS ==="
  $funcDir = Join-Path $RepoRoot "functions"
  if(Test-Path $funcDir){
    Push-Location $funcDir
    try{
      Info "npm run build"
      npm run build
      Ok "functions build OK"
    } finally { Pop-Location }
  } else {
    Warn "functions folder missing, build skipped"
  }
}

Ok "DONE"
