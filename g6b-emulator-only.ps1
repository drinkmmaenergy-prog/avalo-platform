# G6B-EMULATOR-ONLY — runs ONLY the 16 mandatory proof cases
# Uses --only firestore (g6b tests use Admin SDK directly, no functions/storage emulator needed)
# Double-click g6b-emulator-only.bat to run
$ErrorActionPreference = "Continue"
$LogDir = "C:\a\avalo"
$Start = Get-Date
"EMULATOR-ONLY STARTED $Start" | Out-File "$LogDir\g6-eo-sentinel.txt" -Force

Write-Host "=== G6B EMULATOR-ONLY RUN ===" -ForegroundColor Cyan
Write-Host "Start: $Start"
Write-Host "Logs -> $LogDir\g6-eo-*.log"
Write-Host ""

Set-Location C:\a\avalo

# Step 1: Firestore emulator + 16 mandatory G6B proof cases
Write-Host "=== STEP 1: G6B Mandatory 16 proof cases (firestore emulator) ===" -ForegroundColor Yellow
firebase emulators:exec `
  --project avalostaging `
  --only firestore `
  "npm --prefix functions run test:g6b" `
  2>&1 | Tee-Object -FilePath "$LogDir\g6-eo-emulator.log"
$EmulatorExit = $LASTEXITCODE
Write-Host "Emulator G6B exit: $EmulatorExit"
Write-Host ""

# Step 2: Forbidden pattern sweep
Write-Host "=== STEP 2: Forbidden pattern sweep ===" -ForegroundColor Yellow
$forbiddenPattern = 'users/\{uid\}\.wallet\.balance|users/\{uid\}/wallet/current|tokenBalance|user_wallets|EARNER_SPLIT'
$hits = Select-String -Path "C:\a\avalo\functions\src\*.ts" -Pattern $forbiddenPattern -Recurse 2>&1
if ($hits) {
  Write-Host "FORBIDDEN PATTERN HITS:" -ForegroundColor Red
  $hits | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "No forbidden patterns — CLEAN" -ForegroundColor Green
}
$hits | Tee-Object -FilePath "$LogDir\g6-eo-sweep.log"

# Summary
$End = Get-Date
$Duration = $End - $Start
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "G6B-EMULATOR-ONLY SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Emulator G6B: $(if ($EmulatorExit -eq 0) {'PASS'} else {'FAIL'}) (exit $EmulatorExit)"
Write-Host "Duration:     $($Duration.TotalMinutes.ToString('F1')) min"
Write-Host "Log:          $LogDir\g6-eo-emulator.log"
Write-Host ""
if ($EmulatorExit -eq 0) {
  Write-Host "RESULT: G6B MANDATORY CASES PASS" -ForegroundColor Green
} else {
  Write-Host "RESULT: G6B MANDATORY CASES FAIL — see g6-eo-emulator.log" -ForegroundColor Red
}

Read-Host "Press Enter to close"
