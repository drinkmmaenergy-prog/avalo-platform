# ================================
# Avalo Safe Auto-Fix Launcher
# ================================

Write-Host "=== Avalo Auto-Fix Launcher ===" -ForegroundColor Cyan

$ROOT = "C:\Users\Drink\avaloapp"
$TOOLS = Join-Path $ROOT "tools"

Write-Host "Validating Node.js..."
node -v
if ($LASTEXITCODE -ne 0) {
    Write-Host "Node is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

Write-Host "Installing tool dependencies..."
npm install -g ts-node typescript glob

Write-Host "Running: ts-autofix.ts"
ts-node "$TOOLS\ts-autofix.ts"

Write-Host "Running: import-resolver.ts"
ts-node "$TOOLS\import-resolver.ts"

Write-Host "Running: react-expo-autofix.ts"
ts-node "$TOOLS\react-expo-autofix.ts"

Write-Host "=== All repairs completed ===" -ForegroundColor Green
