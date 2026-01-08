Write-Host "=== AVALO AUTO-REPLACE APP-MOBILE ===" -ForegroundColor Cyan

$root = "C:\Users\Drink\avaloapp"
$temp = Join-Path $root "avalo-mobile-temp"
$target = Join-Path $root "app-mobile"

# 1. Sprawdzenie istnienia temp folderu
if (-Not (Test-Path $temp)) {
    Write-Host "[ERR] Folder avalo-mobile-temp nie istnieje w $root" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Znaleziono avalo-mobile-temp." -ForegroundColor Green

# 2. Usuwanie starego app-mobile
if (Test-Path $target) {
    Write-Host "[INFO] Usuwam stare app-mobile..." -ForegroundColor Yellow
    try {
        Remove-Item -Recurse -Force $target
        Write-Host "[OK] Usunięto stare app-mobile." -ForegroundColor Green
    } catch {
        Write-Host "[ERR] Nie mogę usunąć app-mobile. Katalog jest zablokowany." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[OK] Stare app-mobile nie istnieje. Kontynuuję." -ForegroundColor Green
}

# 3. Przeniesienie nowej wersji
try {
    Move-Item $temp $target
    Write-Host "[OK] Przeniesiono avalo-mobile-temp → app-mobile." -ForegroundColor Green
} catch {
    Write-Host "[ERR] Nie można przenieść folderu. Proces blokuje katalog." -ForegroundColor Red
    exit 1
}

# 4. Czyszczenie cache w nowym projekcie
Write-Host "[INFO] Czyszczenie cache Expo/Metro..." -ForegroundColor Yellow
Remove-Item -Recurse -Force "$target\node_modules" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$target\.expo" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$target\.expo-shared" -ErrorAction SilentlyContinue

# 5. Instalacja zależności
Write-Host "[INFO] Instaluję zależności (pnpm install)..." -ForegroundColor Yellow
cd $target
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERR] pnpm install nie powiodło się." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Zależności zainstalowane." -ForegroundColor Green

# 6. Uruchomienie Expo
Write-Host "[INFO] Uruchamiam Expo..." -ForegroundColor Yellow
pnpm exec expo start --clear
