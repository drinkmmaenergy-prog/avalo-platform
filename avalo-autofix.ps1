Write-Host "=== AVALO MOBILE AUTO-FIX START ==="

$root      = "C:\Users\Drink\avaloapp"
$mobile    = "C:\Users\Drink\avaloapp\app-mobile"
$pkgMobile = "$mobile\package.json"

Write-Host "`n-- Fixing expo-build-properties..."
$json = Get-Content -Raw $pkgMobile | ConvertFrom-Json

if (-not $json.dependencies.'expo-build-properties') {
    $json.dependencies | Add-Member -NotePropertyName 'expo-build-properties' -NotePropertyValue '1.0.9'
} else {
    $json.dependencies.'expo-build-properties' = '1.0.9'
}

$json | ConvertTo-Json -Depth 100 | Set-Content -Encoding UTF8 $pkgMobile
Write-Host "OK"

Write-Host "`n-- Removing node_modules..."
if (Test-Path "$mobile\node_modules") { Remove-Item -Recurse -Force "$mobile\node_modules" }
if (Test-Path "$root\node_modules")   { Remove-Item -Recurse -Force "$root\node_modules" }

Write-Host "-- Cleaning Expo caches..."
if (Test-Path "$mobile\.expo")        { Remove-Item -Recurse -Force "$mobile\.expo" }
if (Test-Path "$mobile\.expo-shared") { Remove-Item -Recurse -Force "$mobile\.expo-shared" }
if (Test-Path "$mobile\.cache")       { Remove-Item -Recurse -Force "$mobile\.cache" }

Write-Host "-- Removing pnpm-lock.yaml..."
if (Test-Path "$root\pnpm-lock.yaml") { Remove-Item -Force "$root\pnpm-lock.yaml" }

Write-Host "`n-- Running pnpm install..."
cd $root
pnpm install --no-frozen-lockfile

Write-Host "`n-- Installing app-mobile deps..."
pnpm -F app-mobile install --no-frozen-lockfile

Write-Host "`n-- Fixing missing Expo native packages..."
cd $mobile
npx expo install react-native-gesture-handler react-native-reanimated react-native-screens react-native-safe-area-context

Write-Host "`n=== Starting Expo ==="
npx expo start --clear
