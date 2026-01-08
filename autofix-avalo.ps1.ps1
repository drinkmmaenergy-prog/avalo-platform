# C:\Users\Drink\avaloapp\avalo-autofix.ps1
# Avalo Monorepo Repair – Expo SDK 54 + RN 0.76.6 + React 18.3.1
# Uruchamiaj w PowerShell 7+ z prawami użytkownika (nie admin). Skrypt jest idempotentny.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# --- ŚCIEŻKI ---
$ROOT   = 'C:\Users\Drink\avaloapp'
$MOBILE = 'C:\Users\Drink\avaloapp\app-mobile'
$WEB    = 'C:\Users\Drink\avaloapp\app-web'
$SDK    = 'C:\Users\Drink\avaloapp\sdk'
$SHARED = 'C:\Users\Drink\avaloapp\shared'
$FUN    = 'C:\Users\Drink\avaloapp\functions'

Write-Host "=== Avalo Autofix START ===`nRoot: $ROOT"

# --- WSTĘPNE WALIDACJE ---
if ($PSVersionTable.PSVersion.Major -lt 7) { throw "Wymagany PowerShell 7+. Wykryto: $($PSVersionTable.PSVersion)" }
if (-not (Test-Path $ROOT)) { throw "Brak katalogu: $ROOT" }

# pnpm
$pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue)
if (-not $pnpm) { throw "pnpm nie znaleziony. Zainstaluj: npm i -g pnpm@9" }

# Node
$nodeV = (node -v) -replace '[vV]'
if ([version]$nodeV -lt [version]"20.0.0") { throw "Node >= 20 wymagany. Wykryto: $nodeV" }

# --- KILL PROCS (bez paniki jeśli nie istnieją) ---
Write-Host "`n-- Killing dev processes..."
foreach ($p in 'node','adb','metro','gradle') {
  try { Stop-Process -Name $p -Force -ErrorAction SilentlyContinue } catch {}
}

# --- PNPM WORKSPACE (naprawa) ---
$workspaceFile = Join-Path $ROOT 'pnpm-workspace.yaml'
$workspaceYaml = @"
packages:
  - "app-mobile"
  - "app-web"
  - "functions"
  - "sdk"
  - "shared"
  - "packages/*"
  - "web/*"
  - "tests/*"
  - "scripts"
"@
if (-not (Test-Path $workspaceFile)) {
  Write-Host "-- Tworzę pnpm-workspace.yaml"
  $workspaceYaml | Set-Content -Encoding UTF8 $workspaceFile
} else {
  # Nadpisz bezpiecznie, bo poprzednie wpisy były niespójne
  Write-Host "-- Aktualizuję pnpm-workspace.yaml"
  $workspaceYaml | Set-Content -Encoding UTF8 $workspaceFile
}

# --- NAPRAWY package.json (root + mobile) ---
function Update-Pkg {
  param([string]$pkgPath, [ScriptBlock]$mutator)
  if (-not (Test-Path $pkgPath)) { return }
  $json = Get-Content -Raw $pkgPath | ConvertFrom-Json
  & $mutator $json
  $json | ConvertTo-Json -Depth 100 | Set-Content -Encoding UTF8 $pkgPath
  Write-Host "OK: $pkgPath"
}

Write-Host "`n-- Naprawa ROOT package.json"
Update-Pkg -pkgPath (Join-Path $ROOT 'package.json') -mutator {
  param($j)
  $j.private = $true
  $j.packageManager = 'pnpm@9.0.0'
  $j.engines = @{ node = ">=20.0.0"; pnpm = ">=9.0.0" }

  # Spójne workspaces
  $j.workspaces = @("app-mobile","app-web","functions","sdk","shared")

  if (-not $j.scripts) { $j | Add-Member -NotePropertyName scripts -NotePropertyValue (@{}) }
  $j.scripts.'mobile' = 'pnpm -F app-mobile start'
  $j.scripts.'mobile:reset' = 'pnpm -F app-mobile start:reset'
}

Write-Host "-- Naprawa APP-MOBILE package.json"
$mobilePkg = Join-Path $MOBILE 'package.json'
Update-Pkg -pkgPath $mobilePkg -mutator {
  param($j)
  if (-not $j.dependencies) { $j | Add-Member -NotePropertyName dependencies -NotePropertyValue (@{}) }
  if (-not $j.devDependencies) { $j | Add-Member -NotePropertyName devDependencies -NotePropertyValue (@{}) }

  # Wymuszenie kompatybilnych wersji z Expo SDK 54 + RN 0.76 + React 18.3.1
  $j.dependencies.expo                        = "54.0.23"
  $j.dependencies.'react'                     = "18.3.1"
  $j.dependencies.'react-dom'                 = "18.3.1"
  $j.dependencies.'react-native'              = "0.76.6"

  $j.dependencies.'react-native-gesture-handler' = "~2.28.0"
  $j.dependencies.'react-native-reanimated'      = "~4.1.4"
  $j.dependencies.'react-native-screens'         = "~4.16.0"
  $j.dependencies.'react-native-safe-area-context' = "~5.6.2"

  $j.dependencies.'@react-navigation/native'       = "^7.0.0"
  $j.dependencies.'@react-navigation/native-stack' = "^7.0.0"
  $j.dependencies.'@react-navigation/bottom-tabs'  = "^7.0.0"

  $j.dependencies.'expo-location'       = "19.0.7"
  $j.dependencies.'expo-camera'         = "17.0.9"
  $j.dependencies.'expo-image-picker'   = "17.0.8"
  $j.dependencies.'expo-font'           = "14.0.9"
  $j.dependencies.'expo-secure-store'   = "15.0.7"
  $j.dependencies.'expo-build-properties' = "1.0.9"
  $j.dependencies.'expo-splash-screen'  = "0.27.5"
  $j.dependencies.'expo-dev-client'     = "~6.0.17"

  # Skrypty pomocnicze
  if (-not $j.scripts) { $j | Add-Member -NotePropertyName scripts -NotePropertyValue (@{}) }
  $j.scripts.'start'       = "expo start"
  $j.scripts.'start:clear' = "expo start --clear"
  $j.scripts.'prebuild'    = "expo prebuild"
}

# --- BABEL + METRO (upewnij się, że poprawne) ---
Write-Host "`n-- Weryfikacja babel.config.js"
$babelPath = Join-Path $MOBILE 'babel.config.js'
$babelContent = @"
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin']
  };
};
"@
$writeBabel = $true
if (Test-Path $babelPath) {
  $existing = Get-Content -Raw $babelPath
  if ($existing -match 'react-native-reanimated/plugin' -and $existing -match 'babel-preset-expo') { $writeBabel = $false }
}
if ($writeBabel) { $babelContent | Set-Content -Encoding UTF8 $babelPath; Write-Host "OK: $babelPath" } else { Write-Host "OK: $babelPath (bez zmian)" }

Write-Host "-- Weryfikacja metro.config.js"
$metroPath = Join-Path $MOBILE 'metro.config.js'
$metroContent = @"
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.nodeModulesPaths = [
  __dirname,
  require('path').join(__dirname, '..'),
];

module.exports = config;
"@
if (-not (Test-Path $metroPath)) {
  $metroContent | Set-Content -Encoding UTF8 $metroPath
  Write-Host "OK: $metroPath"
} else {
  Write-Host "OK: $metroPath (istnieje)"
}

# --- app.json sanity (nie modyfikujemy treści, tylko walidujemy obecność) ---
$appJson = Join-Path $MOBILE 'app.json'
if (-not (Test-Path $appJson)) {
  Write-Host "-- UWAGA: brak app-mobile\app.json. Skrypt nie nadpisuje Twojej konfiguracji. Dodaj plik jeśli potrzebny."
}

# --- CLEAN CACHES ---
Write-Host "`n-- Czyszczenie cache i node_modules (bezpiecznie)..."
$pathsToClean = @(
  (Join-Path $ROOT 'node_modules'),
  (Join-Path $MOBILE 'node_modules'),
  (Join-Path $WEB 'node_modules'),
  (Join-Path $SDK 'node_modules'),
  (Join-Path $SHARED 'node_modules'),
  (Join-Path $FUN 'node_modules'),
  (Join-Path $MOBILE '.expo'),
  (Join-Path $MOBILE '.expo-shared'),
  (Join-Path $MOBILE '.cache')
) | Where-Object { $_ -and (Test-Path $_) }

foreach ($p in $pathsToClean) {
  try {
    Write-Host "Removing: $p"
    Remove-Item -Recurse -Force $p
  } catch {
    Write-Host "WARN: problem z usunięciem $p -> $($_.Exception.Message)"
  }
}

# Lockfile (jeśli jest)
$lock = Join-Path $ROOT 'pnpm-lock.yaml'
if (Test-Path $lock) {
  Write-Host "Removing: $lock"
  Remove-Item -Force $lock
}

# --- INSTALACJA ---
Write-Host "`n-- pnpm install (root)"
Push-Location $ROOT
pnpm install --no-frozen-lockfile

Write-Host "`n-- pnpm install (app-mobile)"
pnpm -F app-mobile install --no-frozen-lockfile
Pop-Location

# --- ANDROID local.properties (SDK) ---
Write-Host "`n-- Konfiguracja Android SDK (local.properties)"
$androidDir = Join-Path $MOBILE 'android'
$localProps = Join-Path $androidDir 'local.properties'
if (Test-Path $androidDir) {
  $sdkGuess = $env:ANDROID_SDK_ROOT
  if (-not $sdkGuess -or -not (Test-Path $sdkGuess)) {
    $candidate = "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
    if (Test-Path $candidate) { $sdkGuess = $candidate }
  }
  if ($sdkGuess) {
    "sdk.dir=$sdkGuess" | Set-Content -Encoding ASCII $localProps
    Write-Host "OK: $localProps -> $sdkGuess"
  } else {
    Write-Host "UWAGA: Nie wykryto Android SDK. Zainstaluj Android Studio / ustaw ANDROID_SDK_ROOT."
  }
}

# --- PREBUILD CLEAN ---
Write-Host "`n-- expo prebuild --clean"
$env:EXPO_PACKAGE_MANAGER = "pnpm"  # zmusza Expo do użycia pnpm zamiast npm
Push-Location $MOBILE
npx expo prebuild --clean
Pop-Location

# --- DOINSTALOWANIE NATIVE PAKIETÓW (przez expo install z pnpm) ---
Write-Host "`n-- expo install pakietów natywnych"
Push-Location $MOBILE
$env:EXPO_PACKAGE_MANAGER = "pnpm"
npx expo install react-native-gesture-handler react-native-reanimated react-native-screens react-native-safe-area-context
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
Pop-Location

# --- START DEV SERVER ---
Write-Host "`n=== Start Metro (Expo) ==="
Push-Location $MOBILE
$env:EXPO_PACKAGE_MANAGER = "pnpm"
npx expo start --clear
Pop-Location

Write-Host "`n=== Avalo Autofix DONE ==="
