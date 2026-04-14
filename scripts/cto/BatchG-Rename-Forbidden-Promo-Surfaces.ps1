Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('batchG-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$RenameMap = @(
    @{
        OldPath = 'C:\a\avalo\app-mobile\components\PromotionCard.tsx'
        NewPath = 'C:\a\avalo\app-mobile\components\OfferCard.tsx'
        Replacements = @(
            @{ Old = 'PromotionCard'; New = 'OfferCard' },
            @{ Old = '../services/promotionService'; New = '../services/promotionService' },
            @{ Old = 'PromotionItem'; New = 'PromotionItem' }
        )
    },
    @{
        OldPath = 'C:\a\avalo\app-mobile\screens\creator\PromotionsOverviewScreen.tsx'
        NewPath = 'C:\a\avalo\app-mobile\screens\creator\OffersOverviewScreen.tsx'
        Replacements = @(
            @{ Old = 'PromotionsOverviewScreen'; New = 'OffersOverviewScreen' },
            @{ Old = 'promotionService'; New = 'promotionService' },
            @{ Old = 'PromotionCampaign'; New = 'PromotionCampaign' },
            @{ Old = 'Promotions'; New = 'Offers' },
            @{ Old = 'promotions'; New = 'offers' }
        )
    },
    @{
        OldPath = 'C:\a\avalo\app-mobile\screens\creator\PromotionCreateScreen.tsx'
        NewPath = 'C:\a\avalo\app-mobile\screens\creator\OfferCreateScreen.tsx'
        Replacements = @(
            @{ Old = 'PromotionCreateScreen'; New = 'OfferCreateScreen' },
            @{ Old = 'Promotions'; New = 'Offers' },
            @{ Old = 'promotions'; New = 'offers' }
        )
    },
    @{
        OldPath = 'C:\a\avalo\app-mobile\components\BottomSheetPromo.tsx'
        NewPath = 'C:\a\avalo\app-mobile\components\BottomSheetOffer.tsx'
        Replacements = @(
            @{ Old = 'BottomSheetPromo'; New = 'BottomSheetOffer' },
            @{ Old = 'Promo'; New = 'Offer' },
            @{ Old = 'promo'; New = 'offer' }
        )
    },
    @{
        OldPath = 'C:\a\avalo\app-mobile\app\store\promo-bundles.tsx'
        NewPath = 'C:\a\avalo\app-mobile\app\store\offer-bundles.tsx'
        Replacements = @(
            @{ Old = 'promo-bundles'; New = 'offer-bundles' },
            @{ Old = 'Promo'; New = 'Offer' },
            @{ Old = 'promo'; New = 'offer' }
        )
    },
    @{
        OldPath = 'C:\a\avalo\app-mobile\app\creator\scalability\discounts.tsx'
        NewPath = 'C:\a\avalo\app-mobile\app\creator\scalability\pricing.tsx'
        Replacements = @(
            @{ Old = 'discounts'; New = 'pricing' },
            @{ Old = 'DiscountsScreen'; New = 'PricingScreen' },
            @{ Old = 'discount'; New = 'pricing' },
            @{ Old = 'Discount'; New = 'Pricing' }
        )
    }
)

function Backup-File {
    param([string]$Path)
    $relative = $Path.Substring($RepoRoot.Length).TrimStart('\')
    $dest = Join-Path $BackupRoot $relative
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -LiteralPath $Path -Destination $dest -Force
}

function Backup-IfExists {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) {
        Backup-File -Path $Path
    }
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

function Get-RepoFiles {
    Get-ChildItem -LiteralPath $RepoRoot -File -Recurse | Where-Object {
        $_.Extension -in @('.ts','.tsx','.js','.jsx','.json','.md') -and
        $_.FullName -notlike "$RepoRoot\.git*" -and
        $_.FullName -notlike "$RepoRoot\node_modules*" -and
        $_.FullName -notlike "$RepoRoot\.next*" -and
        $_.FullName -notlike "$RepoRoot\dist*" -and
        $_.FullName -notlike "$RepoRoot\build*" -and
        $_.FullName -notlike "$RepoRoot\coverage*" -and
        $_.FullName -notlike "$RepoRoot\audit-out*" -and
        $_.FullName -notlike "$RepoRoot\backup-*"
    }
}

$Changed = @()

# 1) backup original target files
foreach ($item in $RenameMap) {
    if (Test-Path -LiteralPath $item.OldPath) {
        Backup-File -Path $item.OldPath
    }
}

# 2) rename/move files
foreach ($item in $RenameMap) {
    if (-not (Test-Path -LiteralPath $item.OldPath)) { continue }

    $newDir = Split-Path $item.NewPath -Parent
    New-Item -ItemType Directory -Force -Path $newDir | Out-Null

    $raw = Get-Content -LiteralPath $item.OldPath -Raw -Encoding UTF8
    $newContent = Apply-Replacements -Content $raw -Pairs $item.Replacements
    Set-Content -LiteralPath $item.NewPath -Value $newContent -Encoding UTF8

    Remove-Item -LiteralPath $item.OldPath -Force
    $Changed += [pscustomobject]@{ Path = $item.NewPath; Action = 'renamed' }
}

# 3) update exact references across repo
$RepoFiles = Get-RepoFiles
foreach ($file in $RepoFiles) {
    try {
        $raw = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
    } catch {
        Write-Host ('Skip unreadable: ' + $file.FullName) -ForegroundColor Yellow
        continue
    }

    if ([string]::IsNullOrEmpty($raw)) {
        Write-Host ('Skip empty/null: ' + $file.FullName) -ForegroundColor Yellow
        continue
    }

    $new = $raw

    $new = $new.Replace('PromotionCard', 'OfferCard')
    $new = $new.Replace('PromotionsOverviewScreen', 'OffersOverviewScreen')
    $new = $new.Replace('PromotionCreateScreen', 'OfferCreateScreen')
    $new = $new.Replace('BottomSheetPromo', 'BottomSheetOffer')

    $new = $new.Replace('/promo-bundles', '/offer-bundles')
    $new = $new.Replace('\promo-bundles', '\offer-bundles')
    $new = $new.Replace('/discounts', '/pricing')
    $new = $new.Replace('\discounts', '\pricing')

    $new = $new.Replace('screens/creator/PromotionsOverviewScreen', 'screens/creator/OffersOverviewScreen')
    $new = $new.Replace('screens/creator/PromotionCreateScreen', 'screens/creator/OfferCreateScreen')
    $new = $new.Replace('components/PromotionCard', 'components/OfferCard')
    $new = $new.Replace('components/BottomSheetPromo', 'components/BottomSheetOffer')
    $new = $new.Replace('app/creator/scalability/discounts', 'app/creator/scalability/pricing')
    $new = $new.Replace('app/store/promo-bundles', 'app/store/offer-bundles')

    if ($new -ne $raw) {
        Backup-IfExists -Path $file.FullName
        Set-Content -LiteralPath $file.FullName -Value $new -Encoding UTF8
        $Changed += [pscustomobject]@{ Path = $file.FullName; Action = 'updated-refs' }
    }
}

$reportPath = Join-Path $AuditRoot ('batchG-rename-report-' + $timestamp + '.json')
$Changed | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host 'Batch G rename complete.' -ForegroundColor Green
Write-Host ('Safety backup: ' + $BackupRoot) -ForegroundColor Yellow
Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
Write-Host ('Changed: ' + $Changed.Count) -ForegroundColor Yellow

