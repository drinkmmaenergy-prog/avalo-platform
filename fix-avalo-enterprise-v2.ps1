# === AVALO ENTERPRISE AUTO-REPAIR v2 ===
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

function say($t){ Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function ensureDir($p){ if (!(Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null } }

function killProcs {
  say "Killing Node/Metro/Gradle/ADB"
  foreach($p in "node","metro","gradle","adb"){ try{ taskkill /F /IM "$p.exe" 2>$null | Out-Null }catch{} }
}

function cleanPath($p){
  if (Test-Path $p) {
    foreach($x in @("node_modules",".expo",".expo-shared",".cache","dist","build")) {
      $t = Join-Path $p $x
      if (Test-Path $t) { Remove-Item -Recurse -Force $t }
    }
  }
}

function writeFile($path, $content){
  $dir = Split-Path -Parent $path
  ensureDir $dir
  $content | Set-Content -Path $path -Encoding UTF8
  Write-Host "[WROTE] $path"
}

function normalizeBabel {
  say "Writing app-mobile/babel.config.js"
  $js = @'
module.exports = function(api){
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // UWAGA: Reanimated musi byc jako ostatni
      "react-native-reanimated/plugin"
    ]
  };
};
