#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Avalo Firebase Region Alignment Audit & Fix Script

.DESCRIPTION
    Scans the functions/src directory for:
    1. Multiple setGlobalOptions calls (should be exactly ONE)
    2. Per-function region overrides that contradict the global default
    3. Storage triggers and their region/bucket configuration
    4. FUNCTIONS_REGION / FIREBASE_REGION duplicate definitions

    Provides two strategies:
    - STRATEGY A: EU-first canonical region (europe-west1)
    - STRATEGY B: Move/align storage triggers to bucket region + feature-flag triggers

.NOTES
    Run from repo root: pwsh tools/ci/fix-firebase-regions.ps1
#>

param(
    [switch]$Fix,
    [string]$CanonicalRegion = "europe-west1"
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$functionsDir = Join-Path $repoRoot "functions" "src"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AVALO REGION ALIGNMENT AUDIT" -ForegroundColor Cyan
Write-Host " Canonical region: $CanonicalRegion" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# 1. Find all setGlobalOptions calls
# ============================================================================

Write-Host "--- 1. setGlobalOptions calls ---" -ForegroundColor Yellow

$globalOptionsHits = Select-String -Path (Join-Path $functionsDir "*.ts") -Pattern "setGlobalOptions\(" -SimpleMatch
$globalOptionsCount = ($globalOptionsHits | Measure-Object).Count

foreach ($hit in $globalOptionsHits) {
    $relativePath = $hit.Path.Replace($repoRoot, "").TrimStart("\", "/")
    Write-Host "  [FOUND] ${relativePath}:$($hit.LineNumber): $($hit.Line.Trim())" -ForegroundColor White
}

if ($globalOptionsCount -gt 1) {
    Write-Host "  [ERROR] setGlobalOptions called $globalOptionsCount times (should be exactly 1)" -ForegroundColor Red
} elseif ($globalOptionsCount -eq 1) {
    Write-Host "  [OK] setGlobalOptions called exactly once" -ForegroundColor Green
} else {
    Write-Host "  [WARN] setGlobalOptions not found!" -ForegroundColor Red
}

Write-Host ""

# ============================================================================
# 2. Find per-function region overrides
# ============================================================================

Write-Host "--- 2. Per-function region overrides ---" -ForegroundColor Yellow

$regionOverrides = Get-ChildItem -Path $functionsDir -Filter "*.ts" -Recurse | ForEach-Object {
    Select-String -Path $_.FullName -Pattern "region:\s*['""]" | Where-Object {
        $_.Line -notmatch "setGlobalOptions" -and
        $_.Line -notmatch "//.*region" -and
        $_.Line -notmatch "\*.*region"
    }
}

$euCount = 0
$usCentralCount = 0
$otherCount = 0
$usCentralFiles = @()

foreach ($hit in $regionOverrides) {
    $line = $hit.Line.Trim()
    $relativePath = $hit.Path.Replace($repoRoot, "").TrimStart("\", "/")
    
    if ($line -match "europe-west1") {
        $euCount++
    } elseif ($line -match "us-central1") {
        $usCentralCount++
        $usCentralFiles += "${relativePath}:$($hit.LineNumber)"
        Write-Host "  [MISMATCH] ${relativePath}:$($hit.LineNumber): $line" -ForegroundColor Red
    } else {
        $otherCount++
        Write-Host "  [OTHER] ${relativePath}:$($hit.LineNumber): $line" -ForegroundColor Yellow
    }
}

Write-Host "  europe-west1 overrides: $euCount" -ForegroundColor Green
Write-Host "  us-central1 overrides: $usCentralCount" -ForegroundColor $(if ($usCentralCount -gt 0) { "Red" } else { "Green" })
Write-Host "  other region overrides: $otherCount" -ForegroundColor $(if ($otherCount -gt 0) { "Yellow" } else { "Green" })

Write-Host ""

# ============================================================================
# 3. Storage triggers
# ============================================================================

Write-Host "--- 3. Storage triggers ---" -ForegroundColor Yellow

$storageTriggers = Get-ChildItem -Path $functionsDir -Filter "*.ts" -Recurse | ForEach-Object {
    Select-String -Path $_.FullName -Pattern "onObjectFinalized|onObjectDeleted|onObjectArchived|onObjectMetadataUpdated" | Where-Object {
        $_.Line -notmatch "^(import|export \{)"
    }
}

if (($storageTriggers | Measure-Object).Count -eq 0) {
    Write-Host "  [OK] No active storage triggers found (only imports)" -ForegroundColor Green
} else {
    foreach ($hit in $storageTriggers) {
        $relativePath = $hit.Path.Replace($repoRoot, "").TrimStart("\", "/")
        Write-Host "  [TRIGGER] ${relativePath}:$($hit.LineNumber): $($hit.Line.Trim())" -ForegroundColor Cyan
    }
}

Write-Host ""

# ============================================================================
# 4. FUNCTIONS_REGION / FIREBASE_REGION definitions
# ============================================================================

Write-Host "--- 4. Region constant definitions ---" -ForegroundColor Yellow

$regionDefs = Get-ChildItem -Path $functionsDir -Filter "*.ts" -Recurse | ForEach-Object {
    Select-String -Path $_.FullName -Pattern "FUNCTIONS_REGION|FIREBASE_REGION" | Where-Object {
        $_.Line -match "=" -or $_.Line -match "defineString"
    }
}

foreach ($hit in $regionDefs) {
    $relativePath = $hit.Path.Replace($repoRoot, "").TrimStart("\", "/")
    Write-Host "  [DEF] ${relativePath}:$($hit.LineNumber): $($hit.Line.Trim())" -ForegroundColor White
}

Write-Host ""

# ============================================================================
# SUMMARY & STRATEGIES
# ============================================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " STRATEGIES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "STRATEGY A: EU-first canonical region (europe-west1)" -ForegroundColor Green
Write-Host "  1. Keep setGlobalOptions({ region: 'europe-west1' }) as the SINGLE call in runtime.ts" -ForegroundColor White
Write-Host "  2. Remove the duplicate setGlobalOptions call from index.ts" -ForegroundColor White
Write-Host "  3. Remove per-function region: 'europe-west1' overrides (redundant — global default)" -ForegroundColor White
Write-Host "  4. Change us-central1 overrides to europe-west1 (or remove to use global):" -ForegroundColor White
foreach ($f in $usCentralFiles) {
    Write-Host "     - $f" -ForegroundColor Yellow
}
Write-Host "  5. Storage trigger (chatMediaFunctions.ts) inherits europe-west1 from global" -ForegroundColor White
Write-Host "  6. Merge runtime.ts setGlobalOptions options (memory, timeoutSeconds, maxInstances, secrets)" -ForegroundColor White
Write-Host ""

Write-Host "STRATEGY B: Move/align storage triggers to bucket region + feature-flag" -ForegroundColor Green
Write-Host "  1. Keep europe-west1 as global default" -ForegroundColor White
Write-Host "  2. Allow wallet/payments (pack277, pack288) to stay on us-central1 for Stripe latency" -ForegroundColor White
Write-Host "  3. Feature-flag the region per function group:" -ForegroundColor White
Write-Host "     - import { FIREBASE_REGION } from './params' (defineString for override)" -ForegroundColor White
Write-Host "     - Wallet functions: region = FIREBASE_REGION.value() || 'us-central1'" -ForegroundColor White
Write-Host "     - All other functions: region from setGlobalOptions (europe-west1)" -ForegroundColor White
Write-Host "  4. Storage trigger region aligns with default bucket location" -ForegroundColor White
Write-Host "  5. Document which function groups are in which region" -ForegroundColor White
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " RECOMMENDED: STRATEGY A (pure EU)" -ForegroundColor Cyan
Write-Host " unless Stripe latency from Europe is a measured problem" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ============================================================================
# Storage trigger → region → bucket mapping
# ============================================================================

Write-Host ""
Write-Host "--- Storage Trigger Map ---" -ForegroundColor Yellow
Write-Host "  Trigger: processMediaUpload (onObjectFinalized)" -ForegroundColor White
Write-Host "  File: functions/src/chatMediaFunctions.ts:266" -ForegroundColor White
Write-Host "  Bucket: storage.bucket().name (default bucket)" -ForegroundColor White
Write-Host "  Region: Inherits from setGlobalOptions → europe-west1" -ForegroundColor White
Write-Host "  Note: Default bucket region must match function region for Eventarc" -ForegroundColor White
Write-Host ""

if ($Fix) {
    Write-Host "[DRY RUN] -Fix flag detected. Actual fixes not implemented in this version." -ForegroundColor Yellow
    Write-Host "Apply fixes manually per the strategy above, then re-run this script to verify." -ForegroundColor Yellow
}
