function OK($m){Write-Host "[OK] $m" -ForegroundColor Green}
function BAD($m){Write-Host "[ERR] $m" -ForegroundColor Red}

Write-Host "=== Avalo Validator ==="

Write-Host "1) Structure"
if(Test-Path "C:\Users\Drink\avaloapp\app-mobile"){OK "app-mobile exists"} else {BAD "app-mobile missing"; exit}

Write-Host "2) Node"
node -v | Out-Null
if($LASTEXITCODE -ne 0){BAD "Node missing"; exit} else {OK "Node OK"}

Write-Host "3) PNPM"
pnpm -v | Out-Null
if($LASTEXITCODE -ne 0){BAD "pnpm missing"; exit} else {OK "pnpm OK"}

Write-Host "4) Expo config"
$expoConfigJson = "C:\Users\Drink\avaloapp\app-mobile\app.json"
$expoConfigJs   = "C:\Users\Drink\avaloapp\app-mobile\app.config.js"

if(Test-Path $expoConfigJson){
    OK "app.json OK"
} elseif(Test-Path $expoConfigJs){
    OK "app.config.js OK"
} else {
    BAD "Expo config not found"
}
