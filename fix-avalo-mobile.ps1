Write-Host "=== Avalo Mobile Auto-Fix Started ===" -ForegroundColor Cyan

# Ścieżki
$root = "C:\Users\Drink\avaloapp"
$mobile = "$root\app-mobile"

# 1. Sprawdź czy katalog istnieje
if (!(Test-Path $mobile)) {
    Write-Host "ERROR: Folder app-mobile nie istnieje!" -ForegroundColor Red
    exit
}

Write-Host "1/6 — Czyszczenie starych plików..." -ForegroundColor Yellow

# 2. Usuń node_modules i lockfile
Remove-Item -Recurse -Force "$mobile\node_modules" -ErrorAction SilentlyContinue
Remove-Item -Force "$mobile\pnpm-lock.yaml" -ErrorAction SilentlyContinue

# 3. Usuń globalny lockfile (WAŻNE)
Remove-Item -Force "$root\pnpm-lock.yaml" -ErrorAction SilentlyContinue

Write-Host "2/6 — Podmieniam package.json na poprawny dla Expo 54..." -ForegroundColor Yellow

# 4. Zapisujemy poprawny package.json
$packageJson = @"
{
  "name": "app-mobile",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "scripts": {
    "start": "expo start --clear",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "expo": "~54.0.23",
    "expo-router": "~6.0.14",
    "react": "19.1.0",
    "react-native": "0.74.3"
  }
}
"@

$packageJson | Out-File -FilePath "$mobile\package.json" -Encoding utf8 -Force

Write-Host "3/6 — Package.json ustawiony poprawnie." -ForegroundColor Green

# 5. Instalacja zależności
Write-Host "4/6 — Instalacja zależności PNPM (to może potrwać)..." -ForegroundColor Yellow

cd $root
pnpm install

Write-Host "5/6 — Instalacja zakończona." -ForegroundColor Green

# 6. Start Expo
Write-Host "6/6 — Uruchamiam Expo..." -ForegroundColor Yellow

cd $mobile
pnpm exec expo start --clear
