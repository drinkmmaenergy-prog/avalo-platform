$ErrorActionPreference = "Stop"

function Replace-InFile {
    param(
        [string]$Path,
        [string]$Pattern,
        [string]$Replacement
    )

    if (!(Test-Path $Path)) {
        Write-Host "[WARN] Missing: $Path" -ForegroundColor Yellow
        return
    }

    $raw = Get-Content $Path -Raw -Encoding UTF8
    $new = [regex]::Replace($raw, $Pattern, $Replacement)

    if ($new -ne $raw) {
        $backup = "$Path.bak." + (Get-Date -Format "yyyyMMdd-HHmmss")
        Copy-Item $Path $backup -Force
        Set-Content $Path $new -Encoding UTF8
        Write-Host "[OK] Patched: $Path" -ForegroundColor Green
    } else {
        Write-Host "[INFO] No change: $Path" -ForegroundColor DarkCyan
    }
}

Write-Host "===== AVALO REVENUE POLICY FIX START =====" -ForegroundColor Cyan

# 1) SOURCE OF TRUTH — economyConfig.ts
Replace-InFile `
  -Path "C:\a\avalo\functions\src\config\economyConfig.ts" `
  -Pattern "CALLS_VOICE:\s*\{\s*creator:\s*0\.80,\s*avalo:\s*0\.20\s*\}" `
  -Replacement "CALLS_VOICE:    { creator: 0.65, avalo: 0.35 }"

Replace-InFile `
  -Path "C:\a\avalo\functions\src\config\economyConfig.ts" `
  -Pattern "CALLS_VIDEO:\s*\{\s*creator:\s*0\.80,\s*avalo:\s*0\.20\s*\}" `
  -Replacement "CALLS_VIDEO:    { creator: 0.65, avalo: 0.35 }"

# 2) PACK 303 TYPES — creator earnings view must match core policy
Replace-InFile `
  -Path "C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts" `
  -Pattern "CALLS:\s*\{\s*creator:\s*0\.80,\s*avalo:\s*0\.20\s*\}" `
  -Replacement "CALLS: { creator: 0.65, avalo: 0.35 }"

# 3) PACK 304 FINANCE TYPES — admin finance constants must match
Replace-InFile `
  -Path "C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts" `
  -Pattern "SPLIT_CALLS_CREATOR:\s*0\.80" `
  -Replacement "SPLIT_CALLS_CREATOR: 0.65"

Replace-InFile `
  -Path "C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts" `
  -Pattern "SPLIT_CALLS_AVALO:\s*0\.20" `
  -Replacement "SPLIT_CALLS_AVALO: 0.35"

# 4) CHAT ANALYTICS BUG — chat must be 65/35, not 70/30
Replace-InFile `
  -Path "C:\a\avalo\functions\src\analytics\creatorMetrics.ts" `
  -Pattern "const creatorEarnings = \(payment\.tokens \|\| 0\) \* 0\.7;" `
  -Replacement "const creatorEarnings = (payment.tokens || 0) * 0.65;"

# 5) CALL BILLING — already 65/35 in repo truth, normalize comments only if needed
Replace-InFile `
  -Path "C:\a\avalo\functions\src\callMonetization.ts" `
  -Pattern "Applies 80/20 split to earner/Avalo" `
  -Replacement "Applies 65/35 split to earner/Avalo"

# 6) TESTS — align expectations
Replace-InFile `
  -Path "C:\a\avalo\functions\src\__tests__\pack303-creator-earnings.test.ts" `
  -Pattern "expect\(REVENUE_SPLITS\.CALLS\)\.toEqual\(\{\s*creator:\s*0\.80,\s*avalo:\s*0\.20\s*\}\);" `
  -Replacement "expect(REVENUE_SPLITS.CALLS).toEqual({ creator: 0.65, avalo: 0.35 });"

# 7) OPTIONAL SAFETY PATCH — suspicious reversed creator share in brand products
Replace-InFile `
  -Path "C:\a\avalo\functions\src\brands\brandProducts.ts" `
  -Pattern "creatorShare = Math\.floor\(totalTokens \* 0\.35\);" `
  -Replacement "creatorShare = Math.floor(totalTokens * 0.65);"

# 8) Generate post-fix audit report
$report = @()
$targets = @(
  "C:\a\avalo\functions\src\config\economyConfig.ts",
  "C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts",
  "C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts",
  "C:\a\avalo\functions\src\analytics\creatorMetrics.ts",
  "C:\a\avalo\functions\src\callBilling.ts",
  "C:\a\avalo\functions\src\callMonetization.ts",
  "C:\a\avalo\functions\src\brands\brandProducts.ts"
)

foreach ($file in $targets) {
    if (Test-Path $file) {
        $matches = Select-String -Path $file -Pattern "0\.65|0\.35|0\.80|0\.20|CALLS|CALENDAR|EVENTS|creatorEarnings|creatorShare" -CaseSensitive:$false
        foreach ($m in $matches) {
            $report += "FILE: $($m.Path)"
            $report += "LINE: $($m.LineNumber)"
            $report += "CODE: $($m.Line.Trim())"
            $report += "------------------------------------------------------------"
        }
    }
}

$report | Set-Content "C:\a\avalo\audit-out\REVENUE_POLICY_POSTFIX_REPORT.md" -Encoding UTF8
Write-Host "[OK] Report: C:\a\avalo\audit-out\REVENUE_POLICY_POSTFIX_REPORT.md" -ForegroundColor Green

Write-Host "===== AVALO REVENUE POLICY FIX END =====" -ForegroundColor Cyan
