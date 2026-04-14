Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('batchH-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
    'C:\a\avalo\app-mobile\app\profile\offline-promotions\index.tsx',
    'C:\a\avalo\app-mobile\app\profile\vip\paywall.tsx',
    'C:\a\avalo\app-mobile\app\membership\upsell.tsx',
    'C:\a\avalo\app-mobile\app\store\offer-bundles.tsx',
    'C:\a\avalo\app-mobile\app\creator\scalability\index.tsx',
    'C:\a\avalo\app-mobile\app\index.tsx',
    'C:\a\avalo\app-mobile\i18n\strings.en.json',
    'C:\a\avalo\app-mobile\i18n\strings.pl.json',
    'C:\a\avalo\app-web\src\i18n\messages\en.json',
    'C:\a\avalo\app-web\src\i18n\messages\pl.json'
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
    @{ Old = 'offline-promotions'; New = 'member-offers' },
    @{ Old = 'OfflinePromotions'; New = 'MemberOffers' },
    @{ Old = 'offline promotions'; New = 'member offers' },
    @{ Old = 'Offline Promotions'; New = 'Member Offers' },
    @{ Old = 'VIP discount'; New = 'VIP member pricing' },
    @{ Old = 'vip discount'; New = 'VIP member pricing' },
    @{ Old = 'Royal discount'; New = 'Royal member pricing' },
    @{ Old = 'royal discount'; New = 'Royal member pricing' },
    @{ Old = 'vipBenefit'; New = 'vipMemberPricing' },
    @{ Old = 'vipBenefitInfo'; New = 'vipMemberPricingInfo' },
    @{ Old = 'offer-bundles'; New = 'offer-sets' },
    @{ Old = 'Offer bundles'; New = 'Offer sets' },
    @{ Old = 'offer bundles'; New = 'offer sets' },
    @{ Old = 'pricing-tests'; New = 'pricing-lab' }
)

$Changed = @()

foreach ($path in $Targets) {
    Backup-File -Path $path
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    if ([string]::IsNullOrEmpty($raw)) { continue }

    $new = Apply-Replacements -Content $raw -Pairs $genericPairs

    if ($new -ne $raw) {
        Set-Content -LiteralPath $path -Value $new -Encoding UTF8
        $Changed += [pscustomobject]@{ Path = $path }
    }
}

$reportPath = Join-Path $AuditRoot ('batchH-report-' + $timestamp + '.json')
$Changed | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host 'Batch H complete.' -ForegroundColor Green
Write-Host ('Safety backup: ' + $BackupRoot) -ForegroundColor Yellow
Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
Write-Host ('Changed: ' + $Changed.Count) -ForegroundColor Yellow
