Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('cleanup-batchF-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
    'C:\a\avalo\app-mobile\screens\creator\PromotionsOverviewScreen.tsx',
    'C:\a\avalo\app-mobile\app\(tabs)\home.tsx',
    'C:\a\avalo\app-mobile\components\TokenPrice.tsx',
    'C:\a\avalo\app-mobile\app\(tabs)\wallet.tsx',
    'C:\a\avalo\app-mobile\app\wallet.tsx',
    'C:\a\avalo\app-mobile\components\BottomSheetPromo.tsx',
    'C:\a\avalo\app-mobile\components\LiveEntryPaywall.tsx',
    'C:\a\avalo\app-web\src\app\calendar\page.tsx'
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

$genericPairs = @(
    @{ Old = 'Promotions'; New = 'Offers' },
    @{ Old = 'promotions'; New = 'offers' },
    @{ Old = 'Promotion'; New = 'Offer' },
    @{ Old = 'promotion'; New = 'offer' },
    @{ Old = 'Promo'; New = 'Offer' },
    @{ Old = 'promo'; New = 'offer' },
    @{ Old = '% OFF'; New = '% pricing adjustment' },
    @{ Old = 'Limited Time'; New = 'Current pricing terms' },
    @{ Old = 'You earn'; New = 'Reference payout preview only' },
    @{ Old = 'creator share'; New = 'reference creator portion' },
    @{ Old = 'platform keeps'; New = 'reference platform portion' },
    @{ Old = 'Avalo keeps'; New = 'reference platform portion' }
)

$walletPairs = @(
    @{ Old = 'Member pricing'; New = 'Pricing adjustment' },
    @{ Old = '% member pricing'; New = '% pricing adjustment' },
    @{ Old = 'discountBanner'; New = 'pricingBanner' },
    @{ Old = 'discountPackBadge'; New = 'pricingPackBadge' }
)

$bottomSheetPairs = @(
    @{ Old = "discount: 'Discount'"; New = "discount: 'Pricing'" },
    @{ Old = "discount: 'Zniżka'"; New = "discount: 'Cena'" },
    @{ Old = 'Shows active discount offers with countdown timer'; New = 'Shows active pricing terms with countdown timer' },
    @{ Old = 'UI-only discount display component for mobile'; New = 'UI-only pricing display component for mobile' }
)

$calendarPairs = @(
    @{ Old = 'Host reference portion may reach up to 80% before applicable deductions.'; New = 'You may earn up to 80% before applicable deductions.' },
    @{ Old = 'Reference platform portion: up to 20%.'; New = 'Reference platform portion: up to 20%. Not guaranteed.' }
)

$Changed = @()

foreach ($path in $Targets) {
    Backup-File -Path $path
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $new = $raw

    if ($path -like '*\app\(tabs)\wallet.tsx' -or $path -like '*\app\wallet.tsx') {
        $new = Apply-Replacements -Content $new -Pairs $genericPairs
        $new = Apply-Replacements -Content $new -Pairs $walletPairs
    }
    elseif ($path -like '*\BottomSheetPromo.tsx') {
        $new = Apply-Replacements -Content $new -Pairs $genericPairs
        $new = Apply-Replacements -Content $new -Pairs $bottomSheetPairs
    }
    elseif ($path -like '*\calendar\page.tsx') {
        $new = Apply-Replacements -Content $new -Pairs $genericPairs
        $new = Apply-Replacements -Content $new -Pairs $calendarPairs
    }
    else {
        $new = Apply-Replacements -Content $new -Pairs $genericPairs
    }

    if ($new -ne $raw) {
        Set-Content -LiteralPath $path -Value $new -Encoding UTF8
        $Changed += [pscustomobject]@{ Path = $path }
    }
}

$reportPath = Join-Path $AuditRoot ('cleanup-batchF-report-' + $timestamp + '.json')
$Changed | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host 'Cleanup Batch F complete.' -ForegroundColor Green
Write-Host ('Safety backup: ' + $BackupRoot) -ForegroundColor Yellow
Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
Write-Host ('Changed: ' + $Changed.Count) -ForegroundColor Yellow
