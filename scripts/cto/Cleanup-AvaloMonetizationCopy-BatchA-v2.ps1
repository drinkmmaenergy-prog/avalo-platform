Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot "cleanup-batchA-v2-safety-$timestamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
    'C:\a\avalo\app-mobile\i18n\strings.en.json',
    'C:\a\avalo\app-mobile\app\creator\scalability\discounts.tsx',
    'C:\a\avalo\app-mobile\app\wallet.tsx',
    'C:\a\avalo\app-mobile\app\(tabs)\wallet.tsx',
    'C:\a\avalo\app-mobile\app\profile\offline-promotions\index.tsx',
    'C:\a\avalo\app-mobile\components\TokenPrice.tsx',
    'C:\a\avalo\app-mobile\components\BottomSheetPromo.tsx'
) | Where-Object { Test-Path -LiteralPath $_ }

function Backup-File {
    param([string]$Path)
    $relative = $Path.Substring($RepoRoot.Length).TrimStart('\')
    $dest = Join-Path $BackupRoot $relative
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -LiteralPath $Path -Destination $dest -Force
}

function Replace-Literal {
    param(
        [string]$Content,
        [string]$Old,
        [string]$New
    )
    return $Content.Replace($Old, $New)
}

$Changed = @()

foreach ($path in $Targets) {
    Backup-File -Path $path
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $new = $raw

    switch -Wildcard ($path) {
        '*\strings.en.json' {
            $new = Replace-Literal $new '"vipBenefit": "VIP members get {{discount}} off all messages"' '"vipBenefit": "VIP members may receive member pricing on messages where available"'
            $new = Replace-Literal $new '"vipBenefit": "VIP 5% Discount Applied"' '"vipBenefit": "VIP member pricing applied"'
            $new = Replace-Literal $new '"info3": "• Never discounts to zero or removes platform commission"' '"info3": "• Never reduces pricing to zero and never removes platform commission"'
            $new = Replace-Literal $new '"noTokensDesc": "Rankings are for competition and visibility only. No tokens, discounts, or price changes."' '"noTokensDesc": "Rankings are for competition and visibility only. No tokens or pricing changes."'
            $new = Replace-Literal $new '"vipBenefit": "VIP Discount"' '"vipBenefit": "VIP member pricing"'
            $new = Replace-Literal $new '"noTokenRewards": "No free tokens · No discounts · Pure motivation"' '"noTokenRewards": "No free tokens · No member pricing · Pure motivation"'
            $new = Replace-Literal $new '"vipBenefitInfo": "VIP members get 10% off (minimum 1 token, never free)"' '"vipBenefitInfo": "VIP members may receive member pricing (minimum 1 token, never free)"'
            $new = Replace-Literal $new '"info3": "VIP subscribers get 5% off"' '"info3": "VIP subscribers may receive member pricing"'
            $new = Replace-Literal $new '"vipBenefitInfo": "Get 10% off all collections with your VIP status"' '"vipBenefitInfo": "VIP status may unlock member pricing for collections"'
            $new = Replace-Literal $new '"youEarn": "You earn"' '"youEarn": "Reference payout preview"'
        }
        '*\creator\scalability\discounts.tsx' {
            $new = Replace-Literal $new 'PACK 166: Fair-Use Discounts Screen' 'PACK 166: Fair-Use Pricing Screen'
            $new = Replace-Literal $new '>Discounts<' '>Pricing options<'
            $new = Replace-Literal $new '>Ethical, fair-use discounts only<' '>Ethical, fair-use pricing only<'
            $new = Replace-Literal $new "'Create discount - coming soon'" "'Create pricing option - coming soon'"
            $new = Replace-Literal $new '>+ Create Discount<' '>+ Create pricing option<'
            $new = Replace-Literal $new '>Allowed Discount Types<' '>Allowed Pricing Types<'
            $new = Replace-Literal $new '>✓ Launch discounts (new products)<' '>✓ Launch pricing options (new products)<'
            $new = Replace-Literal $new '>✓ Loyalty discounts (repeat customers)<' '>✓ Loyalty pricing options (repeat customers)<'
            $new = Replace-Literal $new '>✓ Bundle discounts (product collections)<' '>✓ Bundle pricing options (product collections)<'
            $new = Replace-Literal $new '>✓ Event-linked discounts (seasonal)<' '>✓ Event-linked pricing options (seasonal)<'
            $new = Replace-Literal $new '>✗ No emotional labor discounts<' '>✗ No emotional labor pricing options<'
            $new = Replace-Literal $new '>✗ No discounts for flirting/romance<' '>✗ No pricing options for flirting/romance<'
            $new = Replace-Literal $new '>✗ Maximum 50% discount allowed<' '>✗ Maximum 50% pricing adjustment allowed<'
        }
        '*\app\wallet.tsx' {
            $new = Replace-Literal $new 'Limited Time!' 'Member pricing'
            $new = Replace-Literal $new '% OFF' '% member pricing'
            $new = Replace-Literal $new 'Active Discount Banner' 'Active pricing banner'
            $new = Replace-Literal $new 'Apply discount to display price (UI-ONLY)' 'Apply member pricing to display price (UI-only)'
        }
        '*\(tabs)\wallet.tsx' {
            $new = Replace-Literal $new 'Limited Time!' 'Member pricing'
            $new = Replace-Literal $new '% OFF' '% member pricing'
            $new = Replace-Literal $new 'Active Discount Banner' 'Active pricing banner'
            $new = Replace-Literal $new 'Apply discount to display price (UI-ONLY)' 'Apply member pricing to display price (UI-only)'
        }
        '*\profile\offline-promotions\index.tsx' {
            $new = Replace-Literal $new 'promotions' 'offers'
            $new = Replace-Literal $new 'Promotions' 'Offers'
            $new = Replace-Literal $new 'promo' 'offer'
            $new = Replace-Literal $new 'Promo' 'Offer'
        }
        '*\TokenPrice.tsx' {
            $new = Replace-Literal $new 'You earn' 'Reference payout preview'
            $new = Replace-Literal $new 'creator share' 'reference creator portion'
            $new = Replace-Literal $new 'platform keeps' 'reference platform portion'
            $new = Replace-Literal $new 'Avalo keeps' 'reference platform portion'
        }
        '*\BottomSheetPromo.tsx' {
            $new = Replace-Literal $new 'promo' 'offer'
            $new = Replace-Literal $new 'Promo' 'Offer'
            $new = Replace-Literal $new '% OFF' '% member pricing'
            $new = Replace-Literal $new 'Limited Time' 'Member pricing'
        }
    }

    if ($new -ne $raw) {
        Set-Content -LiteralPath $path -Value $new -Encoding UTF8
        $Changed += [pscustomobject]@{ Path = $path }
    }
}

$reportPath = Join-Path $AuditRoot "cleanup-batchA-v2-report-$timestamp.json"
$Changed | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host "Cleanup Batch A v2 complete." -ForegroundColor Green
Write-Host "Safety backup: $BackupRoot" -ForegroundColor Yellow
Write-Host "Report: $reportPath" -ForegroundColor Yellow
Write-Host "Changed: $($Changed.Count)" -ForegroundColor Yellow
