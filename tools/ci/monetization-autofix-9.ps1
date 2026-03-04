$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$file = "$repo\functions\src\pack106-types.ts"

Write-Host "=== monetization-autofix-9 ==="

$text = Get-Content $file -Raw

# status optional
$text = $text -replace "status:\s*'PENDING'\s*\|\s*'APPROVED'\s*\|\s*'REJECTED';","status?: 'PENDING' | 'APPROVED' | 'REJECTED';"

Set-Content $file $text

Write-Host "[OK] approvals.status made optional"

cd "$repo\functions"

npm run build