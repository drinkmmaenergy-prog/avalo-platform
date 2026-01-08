Write-Host "=== Installing Avalo CTO Framework ==="

$ROOT = "C:\Users\Drink\avaloapp"
$TOOLS = "$ROOT\tools"
$LOGDIR = "$TOOLS\logs"

New-Item -ItemType Directory -Force -Path $TOOLS | Out-Null
New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null

# --------------------------
# 1. validate-avalo.ps1
# --------------------------
@'
param()

function OK($t){ Write-Host "[OK] $t" -ForegroundColor Green }
function BAD($t){ Write-Host "[ERR] $t" -ForegroundColor Red }

Write-Host "1) Structure"

if(Test-Path "C:\Users\Drink\avaloapp\app-mobile"){ OK "app-mobile exists" } else { BAD "missing app-mobile"; exit }

Write-Host "2) Node"
$node = node -v
if($LASTEXITCODE -eq 0){ OK "Node detected: $node" } else { BAD "Node missing"; exit }

Write-Host "3) PNPM"
$pn = pnpm -v
if($LASTEXITCODE -eq 0){ OK "pnpm detected: $pn" } else { BAD "pnpm missing"; exit }

Write-Host "4) Expo config"
if(Test-Path "$ROOT\app-mobile\app.json"){ OK "app.json ok" } else { BAD "no app.json"; exit }

Write-Host "DONE"
'@ | Set-Content -Encoding UTF8 "$TOOLS\validate-avalo.ps1"


# --------------------------
# 2. autofix-core.ps1
# --------------------------
@'
Write-Host "Core fix start"

$APP = "C:\Users\Drink\avaloapp\app-mobile"

if(Test-Path "$APP\node_modules"){
  Remove-Item -Force -Recurse "$APP\node_modules"
}

if(Test-Path "$APP\pnpm-lock.yaml"){
  Remove-Item -Force "$APP\pnpm-lock.yaml"
}

Write-Host "Reinstall"
pnpm install --dir "$APP"

Write-Host "Core fix done"
'@ | Set-Content -Encoding UTF8 "$TOOLS\autofix-core.ps1"


# --------------------------
# 3. ts-autofix.ts
# --------------------------
@'
console.log("ts-autofix placeholder. Ready for future CTO extensions.");
process.exit(0);
'@ | Set-Content -Encoding UTF8 "$TOOLS\ts-autofix.ts"


# --------------------------
# 4. import-resolver.ts
# --------------------------
@'
console.log("import-resolver placeholder. CTO override ready.");
process.exit(0);
'@ | Set-Content -Encoding UTF8 "$TOOLS\import-resolver.ts"


# --------------------------
# 5. react-expo-autofix.ts
# --------------------------
@'
console.log("react-expo-autofix placeholder. CTO override ready.");
process.exit(0);
'@ | Set-Content -Encoding UTF8 "$TOOLS\react-expo-autofix.ts"


# --------------------------
# 6. autofix-all.ps1
# --------------------------
@'
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
'@ | Set-Content -Encoding UTF8 "$TOOLS\autofix-all.ps1"


Write-Host "Framework installed"
