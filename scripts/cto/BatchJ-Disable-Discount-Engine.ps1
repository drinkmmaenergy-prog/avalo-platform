Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('batchJ-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
  'C:\a\avalo\app-mobile\app\(tabs)\home.tsx',
  'C:\a\avalo\app-mobile\app\(tabs)\wallet.tsx',
  'C:\a\avalo\app-mobile\app\wallet.tsx'
)

function Backup-File {
  param([string]$Path)
  $relative = $Path.Substring($RepoRoot.Length).TrimStart('\')
  $dest = Join-Path $BackupRoot $relative
  $destDir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item -LiteralPath $Path -Destination $dest -Force
}

foreach ($path in $Targets) {
  if (-not (Test-Path -LiteralPath $path)) { continue }
  Backup-File -Path $path

  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $new = $raw

  if ($path -like '*\app\(tabs)\home.tsx') {
    $new = [regex]::Replace($new, '(?ms)^\s*import\s+\{\s*DiscountOffer\s*\}\s+from\s+"@/shared/types/pricing";\r?\n', '')
    $new = [regex]::Replace($new, '(?ms)^\s*import\s+\{\s*evaluateDiscountEligibility,\s*retrieveActiveDiscount,\s*storeActiveDiscount,\s*\}\s+from\s+"@/shared/utils/discountEngine";\r?\n', '')
    $new = [regex]::Replace($new, '(?ms)^\s*// Phase 31C: Discount states\r?\n\s*const \[activeDiscount, setActiveDiscount\] = useState<DiscountOffer \| null>\(null\);\r?\n', '')
    $new = [regex]::Replace($new, '(?ms)^\s*// Phase 31C: Evaluate discount eligibility\r?\n\s*checkForDiscounts\(profile\);\r?\n', '')
    $new = [regex]::Replace($new, '(?ms)^\s*// Phase 31C: Check for available discounts\r?\n\s*const checkForDiscounts = \(profile: ProfileData\) => \{.*?^\s*\};\r?\n', '')
    $new = [regex]::Replace($new, '(?ms)^\s*// Navigate to the relevant purchase screen based on discount target\r?\n\s*if \(activeDiscount\) \{.*?^\s*\}\r?\n', '')
    $new = [regex]::Replace($new, '(?ms)^\s*<BottomSheetOffer\s+offer=\{activeDiscount\}.*?\/>\r?\n', '')
  }

  if ($path -like '*\app\(tabs)\wallet.tsx' -or $path -like '*\app\wallet.tsx') {
    $new = [regex]::Replace($new, '(?ms)^\s*import\s+\{\s*DiscountOffer\s*\}\s+from\s+"@/shared/types/pricing";\r?\n', '')
    $new = [regex]::Replace($new, '(?ms)^\s*import\s+\{\s*retrieveActiveDiscount,\s*applyDiscountToPrice\s*\}\s+from\s+"@/shared/utils/discountEngine";\r?\n', '')
    $new = [regex]::Replace($new, '(?ms)^\s*import\s+BottomSheetOffer\s+from\s+"@/components/BottomSheetOffer";\r?\n', '')
    $new = [regex]::Replace($new, '(?ms)^\s*// Phase 31C: Discount states\r?\n\s*const \[activeDiscount, setActiveDiscount\] = useState<DiscountOffer \| null>\(null\);\r?\n', '')
    $new = [regex]::Replace($new, '(?ms)^\s*// Phase 31C: Check for active discounts\r?\n\s*const discount = retrieveActiveDiscount\(\);\r?\n\s*if \(discount\) \{\r?\n\s*setActiveDiscount\(discount\);\r?\n\s*\}\r?\n', '')
    $new = [regex]::Replace($new, '(?ms)\s*\{activeDiscount && \(\s*<View.*?Active pricing banner.*?\)\}\s*', '')
    $new = [regex]::Replace($new, '(?ms)^\s*const priceWithDiscount = applyDiscountToPrice\(pack\.price,\s*activeDiscount\);\r?\n\s*const hasDiscount = priceWithDiscount\.hasDiscount;\r?\n\s*const basePrice = hasDiscount \? priceWithDiscount\.displayPrice : pack\.price;\r?\n', '            const hasDiscount = false;`r`n            const basePrice = pack.price;`r`n')
    $new = [regex]::Replace($new, '(?ms)\s*\{hasDiscount && \(\s*<Text.*?pricing adjustment.*?\)\}\s*', '')
    $new = [regex]::Replace($new, '(?ms)^\s*<BottomSheetOffer\s+offer=\{activeDiscount\}.*?\/>\r?\n', '')
  }

  if ($new -ne $raw) {
    Set-Content -LiteralPath $path -Value $new -Encoding UTF8
    Write-Host ("Updated: " + $path) -ForegroundColor Green
  } else {
    Write-Host ("No change: " + $path) -ForegroundColor Yellow
  }
}

$reportPath = Join-Path $AuditRoot ('batchJ-report-' + $timestamp + '.txt')
@(
  'Batch J complete.'
  ('Safety backup: ' + $BackupRoot)
  ('Timestamp: ' + $timestamp)
) | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
