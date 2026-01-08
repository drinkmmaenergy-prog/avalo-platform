Write-Host "=== AVALO MOBILE FULL REBUILD ==="

$root = "C:\Users\Drink\avaloapp"
$mobile = "$root\app-mobile"
$temp = "$root\avalo-mobile-temp"
$backup = "$root\app-mobile-OLD-" + (Get-Date -Format "yyyyMMdd_HHmmss")

# Kill running processes
Write-Host "[..] Killing processes..."
Get-Process | Where-Object {
    $_.ProcessName -match "node|expo|metro|powershell|cmd|code"
} | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 2

# Backup old mobile
if (Test-Path $mobile) {
    Write-Host "[OK] Backup -> $backup"
    Move-Item $mobile $backup -Force
}

# Remove temp if exists
if (Test-Path $temp) {
    Remove-Item -Recurse -Force $temp
}

# Create new Expo project
Write-Host "[..] Creating new Expo mobile project..."
pnpm dlx create-expo-app@latest $temp --template blank

# Ensure folder exists
if (!(Test-Path $temp)) {
    Write-Host "[ERR] Temp project not created"
    exit 1
}

# Move into app-mobile
Write-Host "[..] Moving project -> $mobile"
Move-Item $temp $mobile

# Fix app.json
Write-Host "[..] Writing app.json"
$appjson = @"
{
  "expo": {
    "name": "Avalo",
    "slug": "avalo",
    "scheme": "avalo",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "plugins": ["expo-router"],
    "experiments": { "typedRoutes": true },
    "extra": { "router": { "origin": "auto" } }
  }
}
"@
$appjson | Out-File "$mobile\app.json" -Encoding UTF8 -Force

# Fix metro.config.js
Write-Host "[..] Writing metro.config.js"
$metro = @"
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
module.exports = config;
"@
$metro | Out-File "$mobile\metro.config.js" -Encoding UTF8 -Force

# Install expo in app-mobile
Write-Host "[..] Installing Expo locally"
cd $mobile
pnpm add expo@54 --save

# Clear ENV
Write-Host "[..] Cleaning ENV"
Remove-Item Env:EXPO_* -ErrorAction SilentlyContinue
Remove-Item Env:METRO_* -ErrorAction SilentlyContinue
Remove-Item Env:REACT_* -ErrorAction SilentlyContinue

# Start
Write-Host "[..] Starting Avalo Mobile"
pnpm --filter app-mobile exec expo start --clear
