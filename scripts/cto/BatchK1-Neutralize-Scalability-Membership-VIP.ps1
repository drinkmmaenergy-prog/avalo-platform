Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('batchK1-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
  'C:\a\avalo\app-mobile\app\creator\scalability\bundles.tsx',
  'C:\a\avalo\app-mobile\app\creator\scalability\index.tsx',
  'C:\a\avalo\app-mobile\app\creator\scalability\pricing-tests.tsx',
  'C:\a\avalo\app-mobile\app\index.tsx',
  'C:\a\avalo\app-mobile\app\live\create.tsx',
  'C:\a\avalo\app-mobile\app\membership\manage.tsx',
  'C:\a\avalo\app-mobile\app\membership\upsell.tsx'
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

# bundles.tsx
$path = 'C:\a\avalo\app-mobile\app\creator\scalability\bundles.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('Bundle 2-5 products together with a discount (max 40% off)', 'Bundle 2-5 products together with a pricing structure')
  $new = $new.Replace('✓ Maximum 40% discount', '✓ Structured bundle pricing')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# scalability/index.tsx
$path = 'C:\a\avalo\app-mobile\app\creator\scalability\index.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw

  $new = $new.Replace('discountMetrics', 'pricingMetrics')
  $new = $new.Replace('activeDiscounts', 'activePricingRules')
  $new = $new.Replace('discountRedemptions', 'pricingRuleUses')
  $new = $new.Replace('discountRevenueLoss', 'pricingAdjustmentValue')

  $new = $new.Replace('<Text style={styles.toolTitle}>Discounts</Text>', '<Text style={styles.toolTitle}>Pricing Rules</Text>')
  $new = $new.Replace('Create ethical, fair-use discounts', 'Create structured pricing rules')
  $new = $new.Replace('{metrics?.discountMetrics.activeDiscounts || 0} active', '{metrics?.pricingMetrics.activePricingRules || 0} active')

  Save-IfChanged -Path $path -Old $raw -New $new
}

# app/index.tsx
$path = 'C:\a\avalo\app-mobile\app\index.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw

  $new = $new.Replace('discountMetrics', 'pricingMetrics')
  $new = $new.Replace('activeDiscounts', 'activePricingRules')
  $new = $new.Replace('discountRedemptions', 'pricingRuleUses')
  $new = $new.Replace('discountRevenueLoss', 'pricingAdjustmentValue')

  $new = $new.Replace('<Text style={styles.toolTitle}>Discounts</Text>', '<Text style={styles.toolTitle}>Pricing Rules</Text>')
  $new = $new.Replace('Create ethical, fair-use discounts', 'Create structured pricing rules')
  $new = $new.Replace('{metrics?.discountMetrics.activeDiscounts || 0} active', '{metrics?.pricingMetrics.activePricingRules || 0} active')

  Save-IfChanged -Path $path -Old $raw -New $new
}

# pricing-tests.tsx
$path = 'C:\a\avalo\app-mobile\app\creator\scalability\pricing-tests.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('✓ Discount duration tests', '✓ Pricing rule duration tests')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# live/create.tsx
$path = 'C:\a\avalo\app-mobile\app\live\create.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('<Text style={styles.infoTitle}>VIP Discount</Text>', '<Text style={styles.infoTitle}>VIP Member Pricing</Text>')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# membership/manage.tsx
$path = 'C:\a\avalo\app-mobile\app\membership\manage.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw
  $new = $new.Replace('It does not include free tokens, discounts, or any monetization advantages.', 'It does not include free tokens, pricing adjustments, or any monetization advantages.')
  Save-IfChanged -Path $path -Old $raw -New $new
}

# membership/upsell.tsx
$path = 'C:\a\avalo\app-mobile\app\membership\upsell.tsx'
if (Test-Path -LiteralPath $path) {
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw

  $new = $new.Replace("'No token discounts'", "'No token pricing adjustments'")
  $new = $new.Replace('economic advantages—no free tokens, discounts, or visibility boosts.', 'economic advantages—no free tokens, pricing adjustments, or visibility boosts.')

  Save-IfChanged -Path $path -Old $raw -New $new
}

$reportPath = Join-Path $AuditRoot ('batchK1-report-' + $timestamp + '.txt')
@(
  'Batch K1 complete.'
  ('Safety backup: ' + $BackupRoot)
  ('Timestamp: ' + $timestamp)
) | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
