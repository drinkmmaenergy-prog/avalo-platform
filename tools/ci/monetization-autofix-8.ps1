$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$file = "$repo\functions\src\pack106-types.ts"

Write-Host "=== monetization-autofix-8 ==="

$text = Get-Content $file -Raw

# 1) approvals: add timestamp?: Timestamp
$approvalsPattern = "(approvals\?:\s*\{\s*[^}]*admin2\?:\s*string;\s*)"
if ($text -match $approvalsPattern) {
  $text = [regex]::Replace(
    $text,
    $approvalsPattern,
    '${1}    timestamp?: Timestamp;' + "`n"
  )
  Write-Host "[OK] approvals.timestamp added"
} else {
  # fallback: if block exists but pattern different, just ensure field present
  $text = $text -replace "(approvals\?:\s*\{)","`$1`n    timestamp?: Timestamp;"
  Write-Host "[OK] approvals.timestamp ensured"
}

# 2) CurrencyDashboardStats.totalCurrencies -> optional
$text = $text -replace "totalCurrencies:\s*number;","totalCurrencies?: number;"
Write-Host "[OK] totalCurrencies made optional"

Set-Content $file $text

cd "$repo\functions"
Write-Host "Running build..."
npm run build