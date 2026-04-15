Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('batchK3-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
  'C:\a\avalo\app-mobile\app\purchase\buy-tokens.tsx',
  'C:\a\avalo\app-mobile\app\legal\digital-goods.tsx',
  'C:\a\avalo\app-mobile\components\OfferCard.tsx'
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

# buy-tokens.tsx
$path = 'C:\a\avalo\app-mobile\app\purchase\buy-tokens.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('✅ No discounts, bonuses, or promotional pricing', '✅ No discounts, bonuses, or variable pricing')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# digital-goods.tsx
$path = 'C:\a\avalo\app-mobile\app\legal\digital-goods.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('Token prices are uniform and not subject to promotional pricing or discounts.', 'Token prices are uniform and not subject to variable pricing or discounts.')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# OfferCard.tsx
$path = 'C:\a\avalo\app-mobile\components\OfferCard.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw

  $new = $new.Replace("import { PromotionItem, logPromotionImpression, logPromotionClick } from '../services/promotionService';", "import { SponsoredPlacementItem, logSponsoredPlacementImpression, logSponsoredPlacementClick } from '../services/promotionService';")
  $new = $new.Replace('offer: PromotionItem;', 'offer: SponsoredPlacementItem;')
  $new = $new.Replace('logPromotionImpression', 'logSponsoredPlacementImpression')
  $new = $new.Replace('logPromotionClick', 'logSponsoredPlacementClick')

  Save-IfChanged -Path $path -Old $raw -New $new
}

$reportPath = Join-Path $AuditRoot ('batchK3-report-' + $timestamp + '.txt')
@(
  'Batch K3 complete.'
  ('Safety backup: ' + $BackupRoot)
  ('Timestamp: ' + $timestamp)
) | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
