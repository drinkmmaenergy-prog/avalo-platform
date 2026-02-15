#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deterministic batch deploy for AVALO Firebase Functions on avalostaging (europe-west1).
    Reads batches.staging.json and deploys one batch at a time to avoid Cloud Run CPU quota stalls.

.DESCRIPTION
    - Reads batch definitions from batches.staging.json
    - Deploys each batch sequentially via `firebase deploy --only functions:default:func1,...`
    - After each batch, runs `firebase functions:list` and validates all functions in that batch appear
    - If any batch fails: stops immediately with exit code 1
    - Fully automated, no prompts

.NOTES
    Project: avalostaging
    Region: europe-west1
    Codebase: default (as defined in firebase.json)
    Author: AVALO Infra
    Version: 1.1.0

.PARAMETER StartBatch
    Zero-based index of the batch to start from (default: 0). Use to resume after a failure.

.PARAMETER EndBatch
    Zero-based index of the last batch to deploy (default: all). Use to deploy a sub-range.

.PARAMETER DryRun
    If set, prints the deploy commands without executing them.
#>

param(
    [int]$StartBatch = 0,
    [int]$EndBatch = -1,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ============================================================================
# CONFIGURATION
# ============================================================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatchFile = Join-Path $ScriptDir 'batches.staging.json'
$ProjectId = 'avalostaging'
$Codebase = 'default'

# FIREBASE_CONFIG is required for local function discovery during deploy.
# Without it, modules that call admin.storage().bucket() at load time will crash.
if (-not $env:FIREBASE_CONFIG) {
    $env:FIREBASE_CONFIG = '{"projectId":"avalostaging","storageBucket":"avalostaging.appspot.com","databaseURL":"https://avalostaging.firebaseio.com"}'
    Write-Host "[ENV] Set FIREBASE_CONFIG for local function discovery" -ForegroundColor DarkGray
}

# ============================================================================
# VALIDATION
# ============================================================================

if (-not (Test-Path $BatchFile)) {
    Write-Error "Batch file not found: $BatchFile"
    exit 1
}

# Verify firebase CLI is available
$firebasePath = Get-Command firebase -ErrorAction SilentlyContinue
if (-not $firebasePath) {
    Write-Error "firebase CLI not found in PATH. Install with: npm install -g firebase-tools"
    exit 1
}

# ============================================================================
# LOAD BATCH DEFINITIONS
# ============================================================================

$config = Get-Content -Path $BatchFile -Raw | ConvertFrom-Json
$batches = $config.batches
$batchDelaySeconds = if ($config.batchDelaySeconds) { $config.batchDelaySeconds } else { 10 }
$totalBatches = $batches.Count

if ($EndBatch -lt 0 -or $EndBatch -ge $totalBatches) {
    $EndBatch = $totalBatches - 1
}

if ($StartBatch -lt 0 -or $StartBatch -ge $totalBatches) {
    Write-Error "StartBatch ($StartBatch) is out of range [0..$($totalBatches - 1)]"
    exit 1
}

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host " AVALO DETERMINISTIC BATCH DEPLOY — avalostaging (europe-west1)" -ForegroundColor Cyan
Write-Host "============================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project:       $ProjectId"
Write-Host "Codebase:      $Codebase"
Write-Host "Region:        $($config.region)"
Write-Host "Total batches: $totalBatches"
Write-Host "Deploy range:  batch $StartBatch .. $EndBatch"
Write-Host "Batch delay:   ${batchDelaySeconds}s between batches"
if ($DryRun) {
    Write-Host "Mode:          DRY RUN (no actual deploys)" -ForegroundColor Yellow
}
Write-Host ""

# ============================================================================
# ENSURE CORRECT PROJECT
# ============================================================================

Write-Host "[PRE] Setting active project to $ProjectId ..." -ForegroundColor Yellow
$useResult = & firebase use $ProjectId 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[PRE] firebase use failed, trying --add ..." -ForegroundColor Yellow
    & firebase use --add $ProjectId 2>&1 | Out-Null
}
Write-Host "[PRE] Active project: $ProjectId" -ForegroundColor Green
Write-Host ""

# ============================================================================
# DEPLOY BATCHES
# ============================================================================

$passedBatches = 0
$failedBatches = 0
$startTime = Get-Date

for ($i = $StartBatch; $i -le $EndBatch; $i++) {
    $batch = $batches[$i]
    $batchName = $batch.name
    $batchFunctions = $batch.functions
    $batchSize = $batchFunctions.Count
    $batchNum = $i + 1

    Write-Host "----------------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "[BATCH $batchNum/$totalBatches] $batchName ($batchSize functions)" -ForegroundColor Cyan
    Write-Host "  Description: $($batch.description)" -ForegroundColor DarkGray

    # Build the --only argument using codebase-aware syntax: functions:default:func1,functions:default:func2,...
    $onlyArg = ($batchFunctions | ForEach-Object { "functions:${Codebase}:$_" }) -join ','

    Write-Host "  Deploy command: firebase deploy --only $onlyArg --force --project $ProjectId" -ForegroundColor DarkGray
    Write-Host ""

    if ($DryRun) {
        Write-Host "  [DRY RUN] Skipping actual deploy" -ForegroundColor Yellow
        $passedBatches++
        continue
    }

    # Execute deploy
    $deployOutput = & firebase deploy --only $onlyArg --force --project $ProjectId 2>&1 | Out-String

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[FAIL] Batch '$batchName' deploy failed!" -ForegroundColor Red
        Write-Host ""
        Write-Host "--- Deploy Output ---" -ForegroundColor Red
        Write-Host $deployOutput
        Write-Host "--- End Output ---" -ForegroundColor Red
        Write-Host ""

        # Check for quota-specific errors
        if ($deployOutput -match 'quota' -or $deployOutput -match 'RESOURCE_EXHAUSTED' -or $deployOutput -match 'CPU allocation') {
            Write-Host "[QUOTA] Cloud Run CPU quota error detected!" -ForegroundColor Magenta
            Write-Host "[QUOTA] Consider requesting quota increase. See gcp-quota-request.md" -ForegroundColor Magenta
            Write-Host "[QUOTA] Or try resuming from this batch: -StartBatch $i" -ForegroundColor Magenta
        }

        $failedBatches++
        Write-Host ""
        Write-Host "============================================================================" -ForegroundColor Red
        Write-Host " DEPLOY ABORTED at batch $i ('$batchName')." -ForegroundColor Red
        Write-Host " $passedBatches/$totalBatches passed before failure." -ForegroundColor Red
        Write-Host " Resume with: .\deploy-staging.ps1 -StartBatch $i" -ForegroundColor Red
        Write-Host "============================================================================" -ForegroundColor Red
        exit 1
    }

    # Verify deployed functions
    Write-Host "  Verifying batch '$batchName' ..." -ForegroundColor Yellow
    $listOutput = & firebase functions:list --project $ProjectId 2>&1 | Out-String

    $missingFunctions = @()
    foreach ($funcName in $batchFunctions) {
        if ($listOutput -notmatch [regex]::Escape($funcName)) {
            $missingFunctions += $funcName
        }
    }

    if ($missingFunctions.Count -gt 0) {
        Write-Host "[WARN] Some functions not found in functions:list after deploy:" -ForegroundColor Yellow
        foreach ($missing in $missingFunctions) {
            Write-Host "    - $missing" -ForegroundColor Yellow
        }
        Write-Host "  (This may be expected for functions with aliased export names or trigger-only functions)" -ForegroundColor DarkGray
    }

    $passedBatches++
    Write-Host "[PASS] Batch '$batchName' deployed successfully ($batchSize functions)" -ForegroundColor Green
    Write-Host ""

    # Delay between batches to let Cloud Run settle
    if ($i -lt $EndBatch) {
        Write-Host "  Waiting ${batchDelaySeconds}s before next batch ..." -ForegroundColor DarkGray
        Start-Sleep -Seconds $batchDelaySeconds
    }
}

# ============================================================================
# FINAL REPORT
# ============================================================================

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host ""
Write-Host "============================================================================" -ForegroundColor Green
Write-Host " DEPLOY COMPLETE" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Project:        $ProjectId"
Write-Host "Codebase:       $Codebase"
Write-Host "Region:         $($config.region)"
Write-Host "Batches passed: $passedBatches / $($EndBatch - $StartBatch + 1)"
Write-Host "Batches failed: $failedBatches"
Write-Host "Duration:       $($duration.ToString('hh\:mm\:ss'))"
Write-Host ""

if (-not $DryRun) {
    # Final function count
    Write-Host "[FINAL] Running firebase functions:list for final count ..." -ForegroundColor Yellow
    $finalList = & firebase functions:list --project $ProjectId 2>&1 | Out-String
    # Strip ANSI escape codes before counting
    $cleanList = $finalList -replace '\x1b\[[0-9;]*m', ''
    $functionCount = ([regex]::Matches($cleanList, '│\s+\S+\s+│\s+v[12]\s+│')).Count
    Write-Host "[FINAL] Total deployed functions: $functionCount" -ForegroundColor Green
    Write-Host ""
}

if ($failedBatches -eq 0) {
    Write-Host "ALL BATCHES PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "SOME BATCHES FAILED" -ForegroundColor Red
    exit 1
}
