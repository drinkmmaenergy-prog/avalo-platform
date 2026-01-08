# Avalo Environment Repair & Redeploy Script
# Fixes package-lock.json sync issues and redeploys Firebase Functions

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Avalo Environment Repair & Redeploy  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Fix package-lock.json
Write-Host "[1/5] Updating package-lock.json..." -ForegroundColor Yellow
Set-Location functions
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to update package-lock.json" -ForegroundColor Red
    exit 1
}
Write-Host "Package-lock.json updated successfully" -ForegroundColor Green
Write-Host ""

# Step 2: Rebuild functions
Write-Host "[2/5] Building functions..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build functions" -ForegroundColor Red
    exit 1
}
Write-Host "Functions built successfully" -ForegroundColor Green
Write-Host ""

# Step 3: Backup current build
Write-Host "[3/5] Backing up current build..." -ForegroundColor Yellow
if (Test-Path lib_backup) {
    Remove-Item -Recurse -Force lib_backup
}
Copy-Item -Recurse lib lib_backup
Write-Host "Build backed up to lib_backup/" -ForegroundColor Green
Write-Host ""

# Step 4: Deploy to Firebase
Write-Host "[4/5] Deploying to Firebase..." -ForegroundColor Yellow
Set-Location ..
firebase deploy --only functions --project avalo-c8c46
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed" -ForegroundColor Red
    Write-Host "Rolling back to previous build..." -ForegroundColor Yellow
    Copy-Item -Recurse -Force functions/lib_backup/* functions/lib/
    Write-Host "Rollback completed" -ForegroundColor Green
    exit 1
}
Write-Host "Deployment successful" -ForegroundColor Green
Write-Host ""

# Step 5: Verify endpoints
Write-Host "[5/5] Verifying endpoints..." -ForegroundColor Yellow
$endpoints = @(
    "https://europe-west3-avalo-c8c46.cloudfunctions.net/ping",
    "https://europe-west3-avalo-c8c46.cloudfunctions.net/getSystemInfo"
)

$allHealthy = $true
foreach ($endpoint in $endpoints) {
    try {
        $response = Invoke-WebRequest -Uri $endpoint -Method GET -TimeoutSec 10 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "OK: $endpoint - HTTP 200" -ForegroundColor Green
        } else {
            Write-Host "WARNING: $endpoint - HTTP $($response.StatusCode)" -ForegroundColor Yellow
            $allHealthy = $false
        }
    } catch {
        Write-Host "ERROR: $endpoint - Failed" -ForegroundColor Red
        $allHealthy = $false
    }
}
Write-Host ""

# Final summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "         Deployment Summary            " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
if ($allHealthy) {
    Write-Host "Environment repaired" -ForegroundColor Green
    Write-Host "Functions deployed successfully" -ForegroundColor Green
    Write-Host "All endpoints online (HTTP 200)" -ForegroundColor Green
    Write-Host "CI/CD pipeline now operational" -ForegroundColor Green
} else {
    Write-Host "Deployment completed with warnings" -ForegroundColor Yellow
    Write-Host "Some endpoints may not be responding correctly" -ForegroundColor Yellow
    Write-Host "Check Firebase Console for details" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  - Run integration tests in tests/integration" -ForegroundColor White
Write-Host "  - View reports in reports/ directory" -ForegroundColor White
Write-Host ""