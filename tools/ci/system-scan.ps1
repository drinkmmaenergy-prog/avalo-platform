param(
  [string]$RepoRoot = "C:\a\avalo",
  [string]$OutDir   = "C:\a\avalo\audit-out"
)

$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$p){ if(!(Test-Path $p)){ New-Item -Force -ItemType Directory $p | Out-Null } }

Ensure-Dir $OutDir

$ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$treePath = Join-Path $OutDir "REPO_TREE.txt"
$modsPath = Join-Path $OutDir "REPO_MODULES.txt"
$mapPath  = Join-Path $RepoRoot "SYSTEM_MAP.md"

"===== REPO TREE =====" | Set-Content -Encoding UTF8 $treePath
"Repo: $RepoRoot" | Add-Content -Encoding UTF8 $treePath
"Timestamp: $ts" | Add-Content -Encoding UTF8 $treePath
"" | Add-Content -Encoding UTF8 $treePath

# Tree (folders + key files)
Get-ChildItem -Path $RepoRoot -Force | ForEach-Object { $_.FullName } | Add-Content -Encoding UTF8 $treePath
"" | Add-Content -Encoding UTF8 $treePath
"===== TOP-LEVEL RECURSIVE (DEPTH 4) =====" | Add-Content -Encoding UTF8 $treePath
Get-ChildItem -Path $RepoRoot -Recurse -Depth 4 -Force |
  Select-Object FullName,Length,LastWriteTime |
  Format-Table -AutoSize | Out-String | Add-Content -Encoding UTF8 $treePath

"===== REPO MODULES (package.json) =====" | Set-Content -Encoding UTF8 $modsPath
"Repo: $RepoRoot" | Add-Content -Encoding UTF8 $modsPath
"Timestamp: $ts" | Add-Content -Encoding UTF8 $modsPath
"" | Add-Content -Encoding UTF8 $modsPath

$pkgs = Get-ChildItem -Path $RepoRoot -Recurse -File -Filter "package.json" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\node_modules\\|\\\.next\\|\\dist\\|\\build\\" } |
  Sort-Object FullName

foreach($p in $pkgs){
  "PACKAGE: $($p.FullName)" | Add-Content -Encoding UTF8 $modsPath
  try {
    $json = Get-Content $p.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    "  name: $($json.name)" | Add-Content -Encoding UTF8 $modsPath
    "  private: $($json.private)" | Add-Content -Encoding UTF8 $modsPath
    "  scripts: $([string]::Join(', ', ($json.scripts.PSObject.Properties.Name | Sort-Object)))" | Add-Content -Encoding UTF8 $modsPath
    "  deps: $([string]::Join(', ', ($json.dependencies.PSObject.Properties.Name | Sort-Object)))" | Add-Content -Encoding UTF8 $modsPath
    "  devDeps: $([string]::Join(', ', ($json.devDependencies.PSObject.Properties.Name | Sort-Object)))" | Add-Content -Encoding UTF8 $modsPath
  } catch {
    "  (FAILED TO PARSE JSON)" | Add-Content -Encoding UTF8 $modsPath
  }
  "" | Add-Content -Encoding UTF8 $modsPath
}

@"
# Avalo — System Map (AUTO-GENERATED)

Generated: $ts  
Repo: $RepoRoot

## Outputs
- audit-out/REPO_TREE.txt
- audit-out/REPO_MODULES.txt
- audit-out/ECONOMY_SCAN.txt
- audit-out/PREDEPLOY_AUDIT.txt
- AVALO_BACKEND_MAP.txt
- CHAT_BILLING_AUDIT.md

## Next steps
1) Review audit-out/*.txt
2) Run KiloCode tasks (consistency + refactors)
3) Apply fixes and re-run gates
"@ | Set-Content -Encoding UTF8 $mapPath

Write-Host "WROTE:"
Write-Host " - $treePath"
Write-Host " - $modsPath"
Write-Host " - $mapPath"
