Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
$BackupDir = 'C:\a\avalo\backup-discount-kill-20260414-194939'

$RestoreMap = @(
    @{ Backup = 'BottomSheetPromo.tsx'; Target = 'C:\a\avalo\app-mobile\components\BottomSheetPromo.tsx' },
    @{ Backup = 'bundles.tsx';          Target = 'C:\a\avalo\app-mobile\app\creator\scalability\bundles.tsx' },
    @{ Backup = 'CreatorDropModal.tsx'; Target = 'C:\a\avalo\app-mobile\components\CreatorDropModal.tsx' },
    @{ Backup = 'discounts.tsx';        Target = 'C:\a\avalo\app-mobile\app\creator\scalability\discounts.tsx' },
    @{ Backup = 'home.tsx';             Target = 'C:\a\avalo\app-mobile\app\(tabs)\home.tsx' },
    @{ Backup = 'index.tsx';            Target = 'C:\a\avalo\app-mobile\app\index.tsx' },
    @{ Backup = 'LiveEntryPaywall.tsx'; Target = 'C:\a\avalo\app-mobile\components\LiveEntryPaywall.tsx' },
    @{ Backup = 'PPVMediaLock.tsx';     Target = 'C:\a\avalo\app-mobile\components\PPVMediaLock.tsx' },
    @{ Backup = 'PPVPriceSetter.tsx';   Target = 'C:\a\avalo\app-mobile\components\PPVPriceSetter.tsx' },
    @{ Backup = 'subscription.tsx';     Target = 'C:\a\avalo\app-mobile\app\profile\subscription.tsx' },
    @{ Backup = 'token-store.tsx';      Target = 'C:\a\avalo\app-mobile\app\wallet\token-store.tsx' },
    @{ Backup = 'TokenPrice.tsx';       Target = 'C:\a\avalo\app-mobile\components\TokenPrice.tsx' },
    @{ Backup = 'wallet.tsx';           Target = 'C:\a\avalo\app-mobile\app\wallet.tsx' }
)

function Write-Section {
    param([string]$Text)
    Write-Host "`n=== $Text ===" -ForegroundColor Cyan
}

Write-Section 'Preflight'

if (-not (Test-Path -LiteralPath $RepoRoot)) {
    throw "Repo root not found: $RepoRoot"
}

if (-not (Test-Path -LiteralPath $BackupDir)) {
    throw "Backup dir not found: $BackupDir"
}

New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$SafetyRoot = Join-Path $AuditRoot "rollback-safety-$timestamp"
New-Item -ItemType Directory -Force -Path $SafetyRoot | Out-Null

Write-Section 'Validating restore map'

foreach ($item in $RestoreMap) {
    $backupPath = Join-Path $BackupDir $item.Backup
    $targetPath = $item.Target

    if (-not (Test-Path -LiteralPath $backupPath)) {
        throw "Missing backup file: $backupPath"
    }

    if (-not (Test-Path -LiteralPath $targetPath)) {
        throw "Missing target file: $targetPath"
    }
}

Write-Section 'Creating safety snapshots'

foreach ($item in $RestoreMap) {
    $targetPath = $item.Target
    $relative = $targetPath.Substring($RepoRoot.Length).TrimStart('\')
    $snapshot = Join-Path $SafetyRoot $relative
    $snapshotDir = Split-Path $snapshot -Parent
    New-Item -ItemType Directory -Force -Path $snapshotDir | Out-Null
    Copy-Item -LiteralPath $targetPath -Destination $snapshot -Force
}

Write-Section 'Applying rollback'

foreach ($item in $RestoreMap) {
    $backupPath = Join-Path $BackupDir $item.Backup
    $targetPath = $item.Target
    Copy-Item -LiteralPath $backupPath -Destination $targetPath -Force
    Write-Host "Restored: $($item.Backup) -> $targetPath" -ForegroundColor Yellow
}

Write-Section 'Writing rollback report'

$report = [pscustomobject]@{
    RepoRoot   = $RepoRoot
    BackupDir  = $BackupDir
    SafetyRoot = $SafetyRoot
    Restored   = $RestoreMap
    Timestamp  = (Get-Date).ToString('s')
}

$reportPath = Join-Path $AuditRoot "rollback-report-$timestamp.json"
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Section 'Done'
Write-Host "Rollback completed successfully." -ForegroundColor Green
Write-Host "Safety snapshot: $SafetyRoot" -ForegroundColor Green
Write-Host "Report: $reportPath" -ForegroundColor Green
