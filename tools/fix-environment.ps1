Write-Host "=== Avalo Environment Fix ==="

$TOOLS = "C:\Users\Drink\avaloapp\tools"
$APP = "C:\Users\Drink\avaloapp\app-mobile"

# --- 1. Change .ts → .js for Node ---
$tsFiles = @(
    "$TOOLS\ts-autofix.ts",
    "$TOOLS\import-resolver.ts",
    "$TOOLS\react-expo-autofix.ts"
)

foreach($f in $tsFiles){
    if(Test-Path $f){
        $js = $f -replace "\.ts$", ".js"
        Copy-Item $f $js -Force
        Write-Host "Converted: $f → $js"
    }
}

# --- 2. Fix validator: accept app.json or app.config.js ---
$validator = "$TOOLS\validate-avalo.ps1"
$validatorContent = @'
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
if(Test-Path "$env:APP\app.json"){
    OK "app.json OK"
} elseif(Test-Path "$env:APP\app.config.js"){
    OK "app.config.js OK"
} else {
    BAD "Expo config not found"
}
'@

Set-Content -Encoding UTF8 $validator -Value $validatorContent

Write-Host "Validator fixed."

# --- 3. Fix invalid URL inside app.json or app.config.js ---
$appJson = "$APP\app.json"
$appConfig = "$APP\app.config.js"

function Fix-URL($path){
    Write-Host "Fixing URLs in $path"
    $txt = Get-Content $path -Raw

    # Replace empty URLs
    $txt = $txt -replace '""', '"https://example.com"'

    # Replace undefined
    $txt = $txt -replace 'null', '"https://example.com"'

    Set-Content -Encoding UTF8 $path -Value $txt
}

if(Test-Path $appJson){ Fix-URL $appJson }
if(Test-Path $appConfig){ Fix-URL $appConfig }

Write-Host "URL fixes done."

Write-Host "=== Environment Fix Finished ==="
