Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$files = @(
  "C:\a\avalo\app-mobile\app\(tabs)\home.tsx",
  "C:\a\avalo\app-mobile\app\(tabs)\wallet.tsx",
  "C:\a\avalo\app-mobile\app\wallet.tsx"
)

function Clean-File {
  param($path)

  if (!(Test-Path $path)) { return }

  $raw = Get-Content $path -Raw

  $new = $raw

  # 🔥 REMOVE ANY DISCOUNT ENGINE IMPORTS
  $new = $new -replace '(?s)import\s+\{[^}]*Discount[^}]*\}[^;]*;', ''
  $new = $new -replace '(?s)import\s+\{[^}]*discountEngine[^}]*\}[^;]*;', ''
  $new = $new -replace '(?s)import\s+.*BottomSheetOffer.*;', ''

  # 🔥 REMOVE ANY STATE USING activeDiscount
  $new = $new -replace '(?s)const\s*\[\s*activeDiscount.*?\];', ''
  $new = $new -replace '(?s)const\s*\[\s*showOfferModal.*?\];', ''

  # 🔥 REMOVE ANY FUNCTION WITH discount logic
  $new = $new -replace '(?s)const\s+checkForDiscounts\s*=\s*\(.*?\}\s*;', ''

  # 🔥 REMOVE ANY CALLS
  $new = $new -replace 'evaluateDiscountEligibility\([^\)]*\)', 'null'
  $new = $new -replace 'retrieveActiveDiscount\([^\)]*\)', 'null'
  $new = $new -replace 'storeActiveDiscount\([^\)]*\)', ''
  $new = $new -replace 'applyDiscountToPrice\([^\)]*\)', '{ hasDiscount:false, displayPrice: pack.price }'

  # 🔥 REMOVE UI BLOCKS
  $new = $new -replace '(?s)\{activeDiscount && \([^\}]*\)\}', ''
  $new = $new -replace '(?s)<BottomSheetOffer[\s\S]*?\/>', ''

  # 🔥 FORCE PRICE CLEAN
  $new = $new -replace 'hasDiscount', 'false'

  Set-Content -LiteralPath $path -Value $new -Encoding UTF8

  Write-Host "CLEANED: $path" -ForegroundColor Green
}

foreach ($f in $files) {
  Clean-File $f
}

Write-Host "Batch Jv3 DONE" -ForegroundColor Yellow
