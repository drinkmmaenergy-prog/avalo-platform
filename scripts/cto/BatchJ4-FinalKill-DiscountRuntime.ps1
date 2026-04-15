Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('batchJ4-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$targets = @(
  'C:\a\avalo\app-mobile\app\(tabs)\home.tsx',
  'C:\a\avalo\app-mobile\app\(tabs)\wallet.tsx',
  'C:\a\avalo\app-mobile\app\wallet.tsx',
  'C:\a\avalo\app-mobile\components\BottomSheetOffer.tsx'
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
  param([string]$Path, [string]$Old, [string]$New)
  if ($New -ne $Old) {
    Set-Content -LiteralPath $Path -Value $New -Encoding UTF8
    Write-Host ("Updated: " + $Path) -ForegroundColor Green
  } else {
    Write-Host ("No change: " + $Path) -ForegroundColor Yellow
  }
}

foreach ($path in $targets) {
  Backup-File -Path $path
}

# HOME
$path = 'C:\a\avalo\app-mobile\app\(tabs)\home.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw

  $new = $new -replace '(?m)^.*Phase 31C: Adaptive Smart Discounts integration.*\r?\n', ''
  $new = $new -replace '(?m)^.*DiscountOffer.*\r?\n', ''
  $new = $new -replace '(?m)^.*evaluateDiscountEligibility.*\r?\n', ''
  $new = $new -replace '(?m)^.*retrieveActiveDiscount.*\r?\n', ''
  $new = $new -replace '(?m)^.*storeActiveDiscount.*\r?\n', ''
  $new = $new -replace '(?m)^.*BottomSheetOffer.*\r?\n', ''
  $new = $new -replace '(?m)^.*Phase 31C: Discount states.*\r?\n', ''
  $new = $new -replace '(?m)^.*setActiveDiscount.*\r?\n', ''
  $new = $new -replace '(?m)^.*checkForDiscounts\(profile\);.*\r?\n', ''

  $new = [regex]::Replace($new, '(?s)const checkForDiscounts = \(profile: ProfileData\) => \{.*?^\};\r?\n', '', 'Multiline')
  $new = [regex]::Replace($new, '(?s)<BottomSheetOffer[\s\S]*?\/>\r?\n', '', 'Multiline')

  Save-IfChanged -Path $path -Old $raw -New $new
}

# WALLET FILES
$walletTargets = @(
  'C:\a\avalo\app-mobile\app\(tabs)\wallet.tsx',
  'C:\a\avalo\app-mobile\app\wallet.tsx'
)

foreach ($path in $walletTargets) {
  if (!(Test-Path -LiteralPath $path)) { continue }

  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw

  $new = $new -replace '(?m)^.*Phase 31C: Adaptive Smart Discounts integration.*\r?\n', ''
  $new = $new -replace '(?m)^.*DiscountOffer.*\r?\n', ''
  $new = $new -replace '(?m)^.*retrieveActiveDiscount.*\r?\n', ''
  $new = $new -replace '(?m)^.*applyDiscountToPrice.*\r?\n', ''
  $new = $new -replace '(?m)^.*BottomSheetOffer.*\r?\n', ''
  $new = $new -replace '(?m)^.*Phase 31C: Discount states.*\r?\n', ''
  $new = $new -replace '(?m)^.*const \[activeDiscount.*\r?\n', ''
  $new = $new -replace '(?m)^.*const \[showOfferModal.*\r?\n', ''
  $new = $new -replace '(?m)^.*Phase 31C: Check for active discounts.*\r?\n', ''
  $new = $new -replace '(?m)^.*const discount = retrieveActiveDiscount\(\);.*\r?\n', ''
  $new = $new -replace '(?m)^.*if \(discount\) \{.*\r?\n', ''
  $new = $new -replace '(?m)^.*setActiveDiscount\(discount\);.*\r?\n', ''
  $new = $new -replace '(?m)^\s*\}\r?\n', "}`r`n"

  $new = $new -replace 'const priceWithDiscount = applyDiscountToPrice\(pack\.price,\s*activeDiscount\);', ''
  $new = $new -replace 'const hasDiscount = priceWithDiscount\.hasDiscount;', 'const hasDiscount = false;'
  $new = $new -replace 'const basePrice = hasDiscount \? priceWithDiscount\.displayPrice : pack\.price;', 'const basePrice = pack.price;'

  $new = [regex]::Replace($new, '(?s)\r?\n\s*\{activeDiscount && \([\s\S]*?\)\}\r?\n\s*\r?\n', "`r`n", 'Multiline')
  $new = [regex]::Replace($new, '(?s)\r?\n\s*\{hasDiscount && \([\s\S]*?\)\}\r?\n', "`r`n", 'Multiline')
  $new = [regex]::Replace($new, '(?s)<BottomSheetOffer[\s\S]*?\/>\r?\n', '', 'Multiline')

  $new = $new -replace 'style=\{\[styles\.packPrice,\s*hasDiscount && styles\.discountedPackPrice\]\}', 'style={styles.packPrice}'
  $new = $new -replace '(?m)^.*discountedPackPrice:\s*\{.*\r?\n', ''
  $new = $new -replace '(?m)^.*pricingBanner: \{.*\r?\n', ''
  $new = $new -replace '(?m)^.*pricingBannerContent: \{.*\r?\n', ''
  $new = $new -replace '(?m)^.*pricingBannerIcon: \{.*\r?\n', ''
  $new = $new -replace '(?m)^.*pricingBannerTitle: \{.*\r?\n', ''
  $new = $new -replace '(?m)^.*pricingBannerSubtitle: \{.*\r?\n', ''
  $new = $new -replace '(?m)^.*pricingPackBadge: \{.*\r?\n', ''
  $new = $new -replace '(?m)^.*pricingPackBadgeText: \{.*\r?\n', ''

  Save-IfChanged -Path $path -Old $raw -New $new
}

# DELETE DEAD COMPONENT
$deadComponent = 'C:\a\avalo\app-mobile\components\BottomSheetOffer.tsx'
if (Test-Path -LiteralPath $deadComponent) {
  Remove-Item -LiteralPath $deadComponent -Force
  Write-Host ("Deleted dead component: " + $deadComponent) -ForegroundColor Green
}

$reportPath = Join-Path $AuditRoot ('batchJ4-report-' + $timestamp + '.txt')
@(
  'Batch J4 complete.'
  ('Safety backup: ' + $BackupRoot)
  ('Deleted: C:\a\avalo\app-mobile\components\BottomSheetOffer.tsx')
) | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
