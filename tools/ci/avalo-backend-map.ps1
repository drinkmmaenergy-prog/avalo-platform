param(
  [string]$RepoRoot = "C:\a\avalo",
  [string]$FunctionsDir = "C:\a\avalo\functions",
  [string]$OutFile = "C:\a\avalo\AVALO_BACKEND_MAP.txt"
)

$ErrorActionPreference = "Stop"

function Read-Text([string]$path) {
  if (!(Test-Path $path)) { return "" }
  return Get-Content $path -Raw -ErrorAction SilentlyContinue
}

$ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
"AVALO BACKEND MAP" | Set-Content -Encoding UTF8 $OutFile
("Generated: " + $ts) | Add-Content -Encoding UTF8 $OutFile
("RepoRoot: " + $RepoRoot) | Add-Content -Encoding UTF8 $OutFile
("Functions: " + $FunctionsDir) | Add-Content -Encoding UTF8 $OutFile
"" | Add-Content -Encoding UTF8 $OutFile

$src = Join-Path $FunctionsDir "src"
if (!(Test-Path $src)) { throw "Missing: $src" }

$files = Get-ChildItem -Path $src -Recurse -File -Include *.ts,*.js -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\node_modules\\|\\dist\\|\\lib\\" } |
  Sort-Object FullName

# Heuristics: triggers + endpoints
$patterns = @(
  @{ type="HTTP";        rx="onRequest\(|https\.onRequest\(|onCall\(|https\.onCall\(" },
  @{ type="SCHEDULE";    rx="onSchedule\(|pubsub\.schedule\(" },
  @{ type="FIRESTORE";   rx="firestore\.\w+\(|onDocument\w*\(" },
  @{ type="AUTH";        rx="auth\.\w+\(|onUser\w*\(" },
  @{ type="STORAGE";     rx="storage\.\w+\(|onObject\w+\(" },
  @{ type="TASK/QUEUE";  rx="tasks\.\w+\(|onTaskDispatched\(" },
  @{ type="STRIPE";      rx="stripe|webhook|constructEvent" }
)

foreach ($f in $files) {
  $txt = Read-Text $f.FullName
  if ([string]::IsNullOrWhiteSpace($txt)) { continue }

  $hits = @()
  foreach ($p in $patterns) {
    if ($txt -match $p.rx) { $hits += $p.type }
  }

  if ($hits.Count -gt 0) {
    "FILE: $($f.FullName)" | Add-Content -Encoding UTF8 $OutFile
    ("TYPES: " + ($hits | Select-Object -Unique | Sort-Object) -join ", ") | Add-Content -Encoding UTF8 $OutFile

    # export names (best-effort)
    $exportMatches = Select-String -Path $f.FullName -Pattern "export\s+const\s+([A-Za-z0-9_]+)\s*=" -AllMatches -ErrorAction SilentlyContinue
    if ($exportMatches) {
      $names = @()
      foreach($m in $exportMatches.Matches){ $names += $m.Groups[1].Value }
      if ($names.Count -gt 0) {
        ("EXPORTS: " + (($names | Select-Object -Unique | Sort-Object) -join ", ")) | Add-Content -Encoding UTF8 $OutFile
      }
    }

    "" | Add-Content -Encoding UTF8 $OutFile
  }
}

Write-Host "WROTE: $OutFile"
