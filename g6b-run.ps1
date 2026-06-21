# G6B — AVALO MANDATORY EMULATOR VALIDATION
# Run as: powershell.exe -ExecutionPolicy Bypass -File C:\a\avalo\g6b-run.ps1
# Or double-click g6b-launch.bat

$ErrorActionPreference = "Continue"
$StartTime = Get-Date
$LogDir = "C:\a\avalo"

Write-Host "=== G6B AVALO EMULATOR VALIDATION ===" -ForegroundColor Cyan
Write-Host "Start: $StartTime"
Write-Host ""

# ─── 0. Git push G6a ─────────────────────────────────────────────────────────
Write-Host "=== STEP 0: Push G6a commit ===" -ForegroundColor Yellow
Set-Location C:\a\avalo
git push origin stabilization/build-green-2026-04-15 2>&1 | Tee-Object -FilePath "$LogDir\g6-push.log"
Write-Host "Push exit: $LASTEXITCODE"
Write-Host ""

# ─── 1. Prerequisites ─────────────────────────────────────────────────────────
Write-Host "=== STEP 1: Prerequisites ===" -ForegroundColor Yellow
java -version 2>&1 | Tee-Object -FilePath "$LogDir\g6-prereqs.log"
node --version 2>&1 | Tee-Object -FilePath "$LogDir\g6-prereqs.log" -Append
npm --version 2>&1 | Tee-Object -FilePath "$LogDir\g6-prereqs.log" -Append
firebase --version 2>&1 | Tee-Object -FilePath "$LogDir\g6-prereqs.log" -Append

if ($LASTEXITCODE -ne 0) {
  Write-Host "Firebase CLI missing — installing..." -ForegroundColor Yellow
  npm install -g firebase-tools 2>&1 | Tee-Object -FilePath "$LogDir\g6-prereqs.log" -Append
  firebase --version 2>&1 | Tee-Object -FilePath "$LogDir\g6-prereqs.log" -Append
}

# ─── 2. Repo state ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== STEP 2: Repo state ===" -ForegroundColor Yellow
Set-Location C:\a\avalo
git status -sb 2>&1 | Tee-Object -FilePath "$LogDir\g6-repo.log"
git log --oneline -10 2>&1 | Tee-Object -FilePath "$LogDir\g6-repo.log" -Append

# ─── 3. Install + Build ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== STEP 3: npm ci + build ===" -ForegroundColor Yellow
npm --prefix functions ci 2>&1 | Tee-Object -FilePath "$LogDir\g6-build.log"
npm --prefix functions run build 2>&1 | Tee-Object -FilePath "$LogDir\g6-build.log" -Append
$BuildExit = $LASTEXITCODE
Write-Host "Build exit: $BuildExit"

# ─── 4. Lint ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== STEP 4: Lint ===" -ForegroundColor Yellow
npm --prefix functions run lint 2>&1 | Tee-Object -FilePath "$LogDir\g6-lint.log"
$LintExit = $LASTEXITCODE
Write-Host "Lint exit: $LintExit"

# ─── 5. Unit tests ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== STEP 5: Unit tests ===" -ForegroundColor Yellow
npm --prefix functions run test:all-unit 2>&1 | Tee-Object -FilePath "$LogDir\g6-unit.log"
$UnitExit = $LASTEXITCODE
Write-Host "Unit exit: $UnitExit"

# ─── 6. Emulator: G6B mandatory proof (16 cases) ────────────────────────────
Write-Host ""
Write-Host "=== STEP 6: G6B Mandatory 16 proof cases (emulator) ===" -ForegroundColor Yellow
firebase emulators:exec `
  --project avalostaging `
  --only auth,firestore,functions,storage `
  "npm --prefix functions run test:g6b" `
  2>&1 | Tee-Object -FilePath "$LogDir\g6-emulator.log"
$EmulatorExit = $LASTEXITCODE
Write-Host "Emulator G6B exit: $EmulatorExit"

# ─── 7. Full emulator integration suite ──────────────────────────────────────
Write-Host ""
Write-Host "=== STEP 7: Full emulator integration suite ===" -ForegroundColor Yellow
firebase emulators:exec `
  --project avalostaging `
  --only auth,firestore,functions,storage `
  "npm --prefix functions run test:emulator" `
  2>&1 | Tee-Object -FilePath "$LogDir\g6-emulator-full.log"
$EmulatorFullExit = $LASTEXITCODE
Write-Host "Emulator full exit: $EmulatorFullExit"

# ─── 8. Firestore rules suite ────────────────────────────────────────────────
Write-Host ""
Write-Host "=== STEP 8: Firestore rules ===" -ForegroundColor Yellow
npm --prefix functions run test:rules `
  2>&1 | Tee-Object -FilePath "$LogDir\g6-rules-storage.log"
$RulesExit = $LASTEXITCODE
Write-Host "Rules exit: $RulesExit"

# ─── 9. Storage rules suite ──────────────────────────────────────────────────
Write-Host ""
Write-Host "=== STEP 9: Storage rules ===" -ForegroundColor Yellow
npm --prefix functions run test:storage-rules `
  2>&1 | Tee-Object -FilePath "$LogDir\g6-rules-storage.log" -Append
$StorageRulesExit = $LASTEXITCODE
Write-Host "Storage rules exit: $StorageRulesExit"

# ─── 10. Callable auth ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== STEP 10: Callable auth ===" -ForegroundColor Yellow
npm --prefix functions run test:callable-auth `
  2>&1 | Tee-Object -FilePath "$LogDir\g6-callable-auth.log"
$CallableExit = $LASTEXITCODE
Write-Host "Callable auth exit: $CallableExit"

# ─── 11. Schedulers ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== STEP 11: Schedulers ===" -ForegroundColor Yellow
npm --prefix functions run test:schedulers `
  2>&1 | Tee-Object -FilePath "$LogDir\g6-schedulers.log"
$SchedulersExit = $LASTEXITCODE
Write-Host "Schedulers exit: $SchedulersExit"

# ─── 12. Deploy dry-run ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== STEP 12: Deploy dry-run ===" -ForegroundColor Yellow
firebase deploy `
  --only functions,firestore:rules,storage `
  --project avalostaging `
  --dry-run `
  2>&1 | Tee-Object -FilePath "$LogDir\g6-deploy-validation.log"
$DeployExit = $LASTEXITCODE
Write-Host "Deploy dry-run exit: $DeployExit"

# ─── G6B Forbidden pattern sweep ─────────────────────────────────────────────
Write-Host ""
Write-Host "=== G6B: Forbidden pattern sweep ===" -ForegroundColor Yellow
$forbiddenPattern = 'users/\{uid\}\.wallet\.balance|users/\{uid\}/wallet/current|tokenBalance|user_wallets|EARNER_SPLIT'
$hits = Select-String -Path "C:\a\avalo\functions\src\*.ts" -Pattern $forbiddenPattern -Recurse 2>&1
if ($hits) {
  Write-Host "FORBIDDEN PATTERN HITS:" -ForegroundColor Red
  $hits | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "No forbidden patterns in functions/src — CLEAN" -ForegroundColor Green
}
$hits | Tee-Object -FilePath "$LogDir\g6-pattern-sweep.log"

# ─── Summary ──────────────────────────────────────────────────────────────────
$EndTime = Get-Date
$Duration = $EndTime - $StartTime

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "G6B VALIDATION SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build:          $(if ($BuildExit -eq 0) {'PASS'} else {'FAIL'}) (exit $BuildExit)"
Write-Host "Lint:           $(if ($LintExit -eq 0) {'PASS'} else {'FAIL'}) (exit $LintExit)"
Write-Host "Unit:           $(if ($UnitExit -eq 0) {'PASS'} else {'FAIL'}) (exit $UnitExit)"
Write-Host "Emulator G6B:   $(if ($EmulatorExit -eq 0) {'PASS'} else {'FAIL'}) (exit $EmulatorExit)"
Write-Host "Emulator Full:  $(if ($EmulatorFullExit -eq 0) {'PASS'} else {'FAIL'}) (exit $EmulatorFullExit)"
Write-Host "Rules:          $(if ($RulesExit -eq 0) {'PASS'} else {'FAIL'}) (exit $RulesExit)"
Write-Host "Storage Rules:  $(if ($StorageRulesExit -eq 0) {'PASS'} else {'FAIL'}) (exit $StorageRulesExit)"
Write-Host "Callable Auth:  $(if ($CallableExit -eq 0) {'PASS'} else {'FAIL'}) (exit $CallableExit)"
Write-Host "Schedulers:     $(if ($SchedulersExit -eq 0) {'PASS'} else {'FAIL'}) (exit $SchedulersExit)"
Write-Host "Deploy dry-run: $(if ($DeployExit -eq 0) {'PASS'} else {'FAIL'}) (exit $DeployExit)"
Write-Host ""
Write-Host "Duration: $($Duration.TotalMinutes.ToString('F1')) minutes"
Write-Host "Logs in:  C:\a\avalo\g6-*.log"
Write-Host ""

$allPassed = ($BuildExit -eq 0) -and ($EmulatorExit -eq 0) -and ($UnitExit -eq 0)
if ($allPassed) {
  Write-Host "CORE VALIDATION: PASS" -ForegroundColor Green
} else {
  Write-Host "CORE VALIDATION: FAIL — see logs" -ForegroundColor Red
}

# Keep window open
Read-Host "Press Enter to close"
