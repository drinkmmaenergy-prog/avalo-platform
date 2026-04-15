Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('batchK2-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
  'C:\a\avalo\app-mobile\components\OfferCard.tsx',
  'C:\a\avalo\app-mobile\screens\creator\OfferCreateScreen.tsx',
  'C:\a\avalo\app-mobile\screens\creator\CreatorAnalyticsScreen.tsx',
  'C:\a\avalo\app-mobile\app\legal\digital-goods.tsx',
  'C:\a\avalo\app-mobile\app\ads\create.tsx',
  'C:\a\avalo\app-mobile\app\ads\index.tsx',
  'C:\a\avalo\app-mobile\app\feed\boost-history.tsx',
  'C:\a\avalo\app-mobile\app\feed\boost-options.tsx',
  'C:\a\avalo\app-mobile\app\(tabs)\profile\settings.tsx',
  'C:\a\avalo\app-mobile\app\notifications\settings.tsx',
  'C:\a\avalo\app-mobile\app\profile\settings\consent.tsx',
  'C:\a\avalo\app-mobile\app\profile\settings\privacy-center.tsx'
)

function Backup-File {
  param([string]$Path)
  if (!(Test-Path -LiteralPath $Path)) { return }
  $relative = $Path.Substring($RepoRoot.Length).TrimStart('\')
  $dest = Join-Path $BackupRoot $relative
  $destDir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item -LiteralPath $Path -Destination $dest -Force
}

function Save-IfChanged {
  param([string]$Path,[string]$Old,[string]$New)
  if ($New -ne $Old) {
    Set-Content -LiteralPath $Path -Value $New -Encoding UTF8
    Write-Host ("Updated: " + $Path) -ForegroundColor Green
  } else {
    Write-Host ("No change: " + $Path) -ForegroundColor Yellow
  }
}

foreach ($path in $Targets) {
  Backup-File -Path $path
}

# OfferCard.tsx
$path = 'C:\a\avalo\app-mobile\components\OfferCard.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('Displays a offer in feeds/marketplace', 'Displays a sponsored placement in feeds/marketplace')
  $new = $new.Replace('Sponsored', 'Sponsored placement')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# OfferCreateScreen.tsx
$path = 'C:\a\avalo\app-mobile\screens\creator\OfferCreateScreen.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('PACK 61: Promotion Create Screen', 'PACK 61: Sponsored Placement Create Screen')
  $new = $new.Replace('Create a new promotion campaign', 'Create a new sponsored placement campaign')
  $new = $new.Replace('Promotions', 'Sponsored placements')
  $new = $new.Replace('promotions', 'sponsored placements')
  $new = $new.Replace('Promotion', 'Sponsored placement')
  $new = $new.Replace('promotion', 'sponsored placement')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# CreatorAnalyticsScreen.tsx
$path = 'C:\a\avalo\app-mobile\screens\creator\CreatorAnalyticsScreen.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace("router.push('/promotions' as any)", "router.push('/offers' as any)")
  $new = $new.Replace('View Promotions', 'View Sponsored Placements')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# digital-goods.tsx
$path = 'C:\a\avalo\app-mobile\app\legal\digital-goods.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('Promocja profilu w aplikacji dla zwiększenia widoczności.', 'Sponsorowane wyróżnienie profilu w aplikacji dla zwiększenia widoczności.')
  $new = $new.Replace('In-app profile promotion for increased visibility.', 'In-app sponsored profile placement for increased visibility.')
  $new = $new.Replace('Ceny tokenów są jednolite i nie podlegają promocjom ani rabatom.', 'Ceny tokenów są jednolite i nie podlegają działaniom promocyjnym ani rabatom cenowym.')
  $new = $new.Replace('Token prices are uniform and not subject to promotions or discounts.', 'Token prices are uniform and not subject to promotional pricing or discounts.')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# ads/create.tsx
$path = 'C:\a\avalo\app-mobile\app\ads\create.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('ID of product/event/club to promote', 'ID of product/event/club for sponsored placement')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# ads/index.tsx
$path = 'C:\a\avalo\app-mobile\app\ads\index.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('Create your first ad campaign to promote your products, services, or events', 'Create your first ad campaign to sponsor your products, services, or events')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# feed/boost-history.tsx
$path = 'C:\a\avalo\app-mobile\app\feed\boost-history.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('Promote your posts and reels to reach more people', 'Boost your posts and reels to reach more people')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# feed/boost-options.tsx
$path = 'C:\a\avalo\app-mobile\app\feed\boost-options.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('Allows users to select boost tier and promote their posts/reels', 'Allows users to select boost tier and increase visibility for posts/reels')
  $new = $new.Replace('is now being promoted for', 'now has boosted visibility for')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# settings + notifications + consent + privacy-center
$paths = @(
  'C:\a\avalo\app-mobile\app\(tabs)\profile\settings.tsx',
  'C:\a\avalo\app-mobile\app\notifications\settings.tsx',
  'C:\a\avalo\app-mobile\app\profile\settings\consent.tsx',
  'C:\a\avalo\app-mobile\app\profile\settings\privacy-center.tsx'
)

foreach ($path in $paths) {
  if (!(Test-Path -LiteralPath $path)) { continue }
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('promotional emails', 'marketing emails')
  $new = $new.Replace('promotional content', 'marketing content')
  $new = $new.Replace('promotional emails and offers', 'marketing emails and product updates')
  $new = $new.Replace('promotional emails and updates', 'marketing emails and updates')
  Save-IfChanged -Path $path -Old $raw -New $new
}

$reportPath = Join-Path $AuditRoot ('batchK2-report-' + $timestamp + '.txt')
@(
  'Batch K2 complete.'
  ('Safety backup: ' + $BackupRoot)
  ('Timestamp: ' + $timestamp)
) | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
