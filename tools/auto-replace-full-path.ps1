# =====================================================================
#  AVALO FULL-PATH AUTO REPLACE APP-MOBILE
# =====================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function OK($m){ Write-Host "[OK] $m" -ForegroundColor Green }
function INF($m){ Write-Host "[..] $m" -ForegroundColor Cyan }
function BAD($m){ Write-Host "[ERR] $m" -ForegroundColor Red }

Write-Host "=== AVALO FULL-PATH AUTO REPLACE APP-MOBILE ==="

# =====================================================================
# 1) ŚCIEŻKI STAŁE — ZERO ZMIENNYCH
# =====================================================================

$ROOT = "C:\Users\Drink\avaloapp"
$APP  = "C:\Users\Drink\avaloapp\app-mobile"
$TMP  = "C:\Users\Drink\avaloapp\avalo-mobile-temp"

# =====================================================================
# 2) KILL node / expo / metro
# =====================================================================

INF "Killing node / expo / metro processes..."
Get-Process | Where-Object {
    $_.ProcessName -match "node|expo|metro"
} | ForEach-Object { $_.Kill() }

# =====================================================================
# 3) Usuń temp jeśli istnieje
# =====================================================================

if (Test-Path $TMP) {
    INF "Removing old temp folder: $TMP"
    Remove-Item -Recurse -Force $TMP
}

# =====================================================================
# 4) Backup starego app-mobile
# =====================================================================

if (Test-Path $APP) {
    $STAMP = Get-Date -Format "yyyyMMdd_HHmmss"
    $BACKUP = "C:\Users\Drink\avaloapp\app-mobile-OLD-$STAMP"

    INF "Backup app-mobile -> $BACKUP"
    Move-Item $APP $BACKUP
    OK "Backup done"
}

# =====================================================================
# 5) Tworzymy nowy projekt Expo (pełna ścieżka!)
# =====================================================================

INF "Creating new Expo blank project in: $TMP"

Set-Location "C:\Users\Drink\avaloapp"

pnpm dlx create-expo-app@latest avalo-mobile-temp --template blank

if (-not (Test-Path $TMP)) {
    BAD "Temp project NOT created at: $TMP"
    exit 1
}
OK "Expo temp created"

# =====================================================================
# 6) Move temp → app-mobile
# =====================================================================

INF "Moving new project to $APP"
Move-Item $TMP $APP
OK "Moved"

# =====================================================================
# 7) Nadpisujemy minimalne pliki
# =====================================================================

INF "Writing new config files..."

# app.json
@'
{
  "expo": {
    "name": "Avalo",
    "slug": "avalo",
    "scheme": "avalo",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "userInterfaceStyle": "light",
    "updates": { "fallbackToCacheTimeout": 0 },
    "runtimeVersion": { "policy": "sdkVersion" },
    "sdkVersion": "54.0.0"
  }
}
'@ | Set-Content -Encoding UTF8 "C:\Users\Drink\avaloapp\app-mobile\app.json"

# metro.config.js
@'
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
module.exports = config;
'@ | Set-Content -Encoding UTF8 "C:\Users\Drink\avaloapp\app-mobile\metro.config.js"

# babel.config.js
@'
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
'@ | Set-Content -Encoding UTF8 "C:\Users\Drink\avaloapp\app-mobile\babel.config.js"

# index.js
@'
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
'@ | Set-Content -Encoding UTF8 "C:\Users\Drink\avaloapp\app-mobile\index.js"

OK "Configs written"

# =====================================================================
# 8) Czyścimy EXPO env — pełne ścieżki niepotrzebne
# =====================================================================

INF "Cleaning Expo env vars"
$vars = @(
    "EXPO_DEVTOOLS_LISTEN_ADDRESS",
    "EXPO_USE_FAST_RESOLVER",
    "EXPO_NO_DEVTOOLS",
    "METRO_PORT",
    "RCT_METRO_PORT",
    "REACT_NATIVE_PACKAGER_HOSTNAME"
)
foreach ($v in $vars) {
    if (Test-Path "Env:\$v") {
        Remove-Item "Env:\$v" -ErrorAction SilentlyContinue
    }
}

# =====================================================================
# 9) Uruchomienie
# =====================================================================

INF "Starting new app-mobile"
Set-Location "C:\Users\Drink\avaloapp\app-mobile"

pnpm exec expo start --clear
