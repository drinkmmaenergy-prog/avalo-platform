Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'

$UserFacingRoots = @(
    'C:\a\avalo\app-mobile\app',
    'C:\a\avalo\app-mobile\components',
    'C:\a\avalo\app-mobile\screens',
    'C:\a\avalo\app-mobile\i18n',
    'C:\a\avalo\app-web\src\app',
    'C:\a\avalo\app-web\src\i18n\messages'
)

$InternalRoots = @(
    'C:\a\avalo\app-mobile\config',
    'C:\a\avalo\app-mobile\services',
    'C:\a\avalo\app-web\src\config',
    'C:\a\avalo\app-web\src\lib',
    'C:\a\avalo\functions\src',
    'C:\a\avalo\shared\config'
)

$Patterns = @(
    [pscustomobject]@{ Category='guarantee'; Regex='(?i)\bguaranteed\b|\bnot guaranteed\b' },
    [pscustomobject]@{ Category='earn_keep'; Regex='(?i)\bYou earn\b|\bYou keep\b|\bYou may earn up to\b|\bYou may keep up to\b|\bReference payout preview only\b' },
    [pscustomobject]@{ Category='split'; Regex='(?i)\b65/35\b|\b70/30\b|\b80/20\b|\b65%\b|\b70%\b|\b80%\b|\b20%\b|\b35%\b|\bcreator share\b|\bplatform portion\b|\breference platform portion\b' },
    [pscustomobject]@{ Category='discount_promo'; Regex='(?i)\bdiscount\b|\bdiscounts\b|\bpromo\b|\bpromotion\b|\bpromotions\b|% OFF|\bVIP discount\b|\bRoyal discount\b' },
    [pscustomobject]@{ Category='reference'; Regex='(?i)\breference payout preview\b|\breference creator earnings preview\b|\bexcluding VAT\b|\bEnglish legal version prevails\b' }
)

function Test-IsUserFacingPath {
    param([string]$Path)
    foreach ($root in $UserFacingRoots) {
        if ($Path -like "$root*") { return $true }
    }
    return $false
}

function Test-IsInternalPath {
    param([string]$Path)
    foreach ($root in $InternalRoots) {
        if ($Path -like "$root*") { return $true }
    }
    return $false
}

function Get-TargetFiles {
    param([string[]]$Roots)

    $all = @()
    foreach ($root in $Roots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        $all += Get-ChildItem -LiteralPath $root -File -Recurse | Where-Object {
            $_.Extension -in @('.ts','.tsx','.js','.jsx','.json','.md') -and
            $_.FullName -notlike "$RepoRoot\.git*" -and
            $_.FullName -notlike "$RepoRoot\node_modules*" -and
            $_.FullName -notlike "$RepoRoot\.next*" -and
            $_.FullName -notlike "$RepoRoot\dist*" -and
            $_.FullName -notlike "$RepoRoot\build*" -and
            $_.FullName -notlike "$RepoRoot\coverage*" -and
            $_.FullName -notlike "$RepoRoot\audit-out*" -and
            $_.FullName -notlike "$RepoRoot\backup-*"
        }
    }
    return @($all | Sort-Object FullName -Unique)
}

$Files = @()
$Files += Get-TargetFiles -Roots $UserFacingRoots
$Files += Get-TargetFiles -Roots $InternalRoots
$Files = @($Files | Sort-Object FullName -Unique)

$Findings = @()

foreach ($file in $Files) {
    foreach ($pattern in $Patterns) {
        $hits = Select-String -LiteralPath $file.FullName -Pattern $pattern.Regex -AllMatches
        foreach ($hit in $hits) {
            $class = 'review'

            if (Test-IsUserFacingPath -Path $file.FullName) {
                if ($pattern.Category -in @('guarantee','earn_keep','split','discount_promo')) {
                    $class = 'must-review-user-facing'
                } else {
                    $class = 'review-user-facing'
                }
            }
            elseif (Test-IsInternalPath -Path $file.FullName) {
                if ($pattern.Category -in @('split','earn_keep','reference')) {
                    $class = 'logic-only-or-config'
                } else {
                    $class = 'internal-review'
                }
            }

            $Findings += [pscustomobject]@{
                Class      = $class
                Category   = $pattern.Category
                Path       = $file.FullName
                LineNumber = $hit.LineNumber
                Line       = $hit.Line.Trim()
            }
        }
    }
}

$mustReview = @($Findings | Where-Object { $_.Class -eq 'must-review-user-facing' } | Sort-Object Path, LineNumber)
$reviewUser = @($Findings | Where-Object { $_.Class -eq 'review-user-facing' } | Sort-Object Path, LineNumber)
$logicOnly = @($Findings | Where-Object { $_.Class -eq 'logic-only-or-config' } | Sort-Object Path, LineNumber)
$internal = @($Findings | Where-Object { $_.Class -eq 'internal-review' } | Sort-Object Path, LineNumber)

$mustPath = Join-Path $AuditRoot ("final-audit-must-review-" + $timestamp + ".txt")
$reviewPath = Join-Path $AuditRoot ("final-audit-review-user-" + $timestamp + ".txt")
$logicPath = Join-Path $AuditRoot ("final-audit-logic-only-" + $timestamp + ".txt")
$internalPath = Join-Path $AuditRoot ("final-audit-internal-" + $timestamp + ".txt")
$jsonPath = Join-Path $AuditRoot ("final-audit-all-" + $timestamp + ".json")
$summaryPath = Join-Path $AuditRoot ("final-audit-summary-" + $timestamp + ".txt")

$mustReview | Format-Table -Wrap -AutoSize | Out-String | Set-Content -LiteralPath $mustPath -Encoding UTF8
$reviewUser | Format-Table -Wrap -AutoSize | Out-String | Set-Content -LiteralPath $reviewPath -Encoding UTF8
$logicOnly | Format-Table -Wrap -AutoSize | Out-String | Set-Content -LiteralPath $logicPath -Encoding UTF8
$internal | Format-Table -Wrap -AutoSize | Out-String | Set-Content -LiteralPath $internalPath -Encoding UTF8
$Findings | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$summary = @()
$summary += "FINAL AUDIT SUMMARY"
$summary += "Timestamp: $timestamp"
$summary += ""
$summary += ("must-review-user-facing: " + $mustReview.Count)
$summary += ("review-user-facing: " + $reviewUser.Count)
$summary += ("logic-only-or-config: " + $logicOnly.Count)
$summary += ("internal-review: " + $internal.Count)
$summary += ""
$summary += "TOP 20 MUST-REVIEW FILES"
$summary += (
    $mustReview |
    Group-Object Path |
    Sort-Object Count -Descending |
    Select-Object -First 20 Count, Name |
    Format-Table -AutoSize | Out-String
)
$summary += ""
$summary += "MUST-REVIEW BY CATEGORY"
$summary += (
    $mustReview |
    Group-Object Category |
    Sort-Object Count -Descending |
    Select-Object Count, Name |
    Format-Table -AutoSize | Out-String
)

$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

Write-Host 'Final Audit Pack complete.' -ForegroundColor Green
Write-Host ('Must review: ' + $mustPath) -ForegroundColor Yellow
Write-Host ('Review user: ' + $reviewPath) -ForegroundColor Yellow
Write-Host ('Logic only: ' + $logicPath) -ForegroundColor Yellow
Write-Host ('Internal: ' + $internalPath) -ForegroundColor Yellow
Write-Host ('Summary: ' + $summaryPath) -ForegroundColor Yellow
Write-Host ('JSON: ' + $jsonPath) -ForegroundColor Yellow
