Write-Host "=== Avalo Autofix ALL ==="

$ROOT = "C:\Users\Drink\avaloapp"
$TOOLS = "$ROOT\tools"
$APP = "$ROOT\app-mobile"
$LOG = "$TOOLS\logs\run-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log"

function Log($t){ Add-Content -Path $LOG -Value $t }

Log "Framework start"

Write-Host "1) Validate"
powershell -ExecutionPolicy Bypass -File "$TOOLS\validate-avalo.ps1" | Tee-Object -FilePath $LOG

Write-Host "2) Core fix"
powershell -ExecutionPolicy Bypass -File "$TOOLS\autofix-core.ps1" | Tee-Object -FilePath $LOG

Write-Host "3) TS autofix"
node "$TOOLS\ts-autofix.ts" | Tee-Object -FilePath $LOG

Write-Host "4) Import resolver"
node "$TOOLS\import-resolver.ts" | Tee-Object -FilePath $LOG

Write-Host "5) React/Expo autofix"
node "$TOOLS\react-expo-autofix.ts" | Tee-Object -FilePath $LOG

Write-Host "6) Validate again"
powershell -ExecutionPolicy Bypass -File "$TOOLS\validate-avalo.ps1" | Tee-Object -FilePath $LOG

Write-Host "Start Expo"
Set-Location $APP
pnpm start | Tee-Object -FilePath $LOG

Write-Host "=== Finished ==="
