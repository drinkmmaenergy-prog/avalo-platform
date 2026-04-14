Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('cleanup-batchB-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
    'C:\a\avalo\app-mobile\i18n\strings.en.json',
    'C:\a\avalo\app-mobile\app\wallet.tsx',
    'C:\a\avalo\app-mobile\app\(tabs)\wallet.tsx'
) | Where-Object { Test-Path -LiteralPath $_ }

function Backup-File {
    param([string]$Path)
    $relative = $Path.Substring($RepoRoot.Length).TrimStart('\')
    $dest = Join-Path $BackupRoot $relative
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -LiteralPath $Path -Destination $dest -Force
}

function Apply-Replacements {
    param(
        [string]$Content,
        [object[]]$Pairs
    )
    $result = $Content
    foreach ($pair in $Pairs) {
        $result = $result.Replace($pair.Old, $pair.New)
    }
    return $result
}

$enPairs = @(
    @{ Old = '"tokensEarned": "You earned {{amount}} tokens!"'; New = '"tokensEarned": "You received {{amount}} tokens!"' },
    @{ Old = '"info3": "• Never discounts to zero or removes platform commission"'; New = '"info3": "• Never reduces pricing to zero and never removes platform commission"' },
    @{ Old = '"noTokenRewards": "No free tokens · No discounts · Pure motivation"'; New = '"noTokenRewards": "No free tokens · No pricing adjustments · Pure motivation"' },
    @{ Old = '"estimatedCreatorEarnings": "Estimated Creator Earnings"'; New = '"estimatedCreatorEarnings": "Reference Creator Earnings Preview"' }
)

$walletPairs = @(
    @{ Old = 'You earned ${result.tokensEarned} tokens for watching an ad!'; New = 'You received ${result.tokensEarned} tokens for watching an ad.' },
    @{ Old = 'Member pricing'; New = 'Pricing adjustment' },
    @{ Old = '% member pricing'; New = '% pricing adjustment' }
)

$Changed = @()

foreach ($path in $Targets) {
    Backup-File -Path $path
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $new = $raw

    if ($path -like '*\strings.en.json') {
        $new = Apply-Replacements -Content $new -Pairs $enPairs
    }
    elseif ($path -like '*\app\wallet.tsx') {
        $new = Apply-Replacements -Content $new -Pairs $walletPairs
    }
    elseif ($path -like '*\(tabs)\wallet.tsx') {
        $new = Apply-Replacements -Content $new -Pairs $walletPairs
    }

    if ($new -ne $raw) {
        Set-Content -LiteralPath $path -Value $new -Encoding UTF8
        $Changed += [pscustomobject]@{ Path = $path }
    }
}

$reportPath = Join-Path $AuditRoot ('cleanup-batchB-report-' + $timestamp + '.json')
$Changed | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host 'Cleanup Batch B complete.' -ForegroundColor Green
Write-Host ('Safety backup: ' + $BackupRoot) -ForegroundColor Yellow
Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
Write-Host ('Changed: ' + $Changed.Count) -ForegroundColor Yellow
