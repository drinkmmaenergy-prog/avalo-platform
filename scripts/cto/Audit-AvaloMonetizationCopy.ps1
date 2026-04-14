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
    'C:\a\avalo\app-web\src\i18n\messages',
    'C:\a\avalo\app-web\src'
)

$InternalRoots = @(
    'C:\a\avalo\shared\config',
    'C:\a\avalo\functions\src',
    'C:\a\avalo\app-mobile\config',
    'C:\a\avalo\app-mobile\services'
)

$Patterns = @(
    [pscustomobject]@{ Name='promo'; Regex='(?i)\bpromo\b|\bpromotion\b|\bpromotions\b|\bspecial offer\b|\blimited time\b|% OFF' },
    [pscustomobject]@{ Name='discount'; Regex='(?i)\bdiscount\b|\bdiscounts\b|\bVIP discount\b|\bRoyal discount\b' },
    [pscustomobject]@{ Name='guarantee'; Regex='(?i)\bguaranteed\b|\bguarantee(d)?\b|\byou earn\b|\byou keep\b|\bearn \d+%|\bkeep \d+%' },
    [pscustomobject]@{ Name='split'; Regex='(?i)\b70/30\b|\b30/70\b|\b\d+%\s*share\b|\bplatform keeps\b|\bcreator keeps\b|\bcreator share\b' },
    [pscustomobject]@{ Name='payout'; Regex='(?i)\bpayout\b|\bearnings\b|\breference payout\b|\breference rate\b|\bnot guaranteed\b|\bexcluding VAT\b|\bEnglish legal version prevails\b' }
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

function Get-FilesUnderRoots {
    param([string[]]$Roots)

    $files = foreach ($root in $Roots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        Get-ChildItem -LiteralPath $root -File -Recurse | Where-Object {
            $_.FullName -notlike "$RepoRoot\.git*" -and
            $_.FullName -notlike "$RepoRoot\node_modules*" -and
            $_.FullName -notlike "$RepoRoot\.next*" -and
            $_.FullName -notlike "$RepoRoot\dist*" -and
            $_.FullName -notlike "$RepoRoot\build*" -and
            $_.FullName -notlike "$RepoRoot\coverage*" -and
            $_.FullName -notlike "$RepoRoot\audit-out*" -and
            $_.FullName -notlike "$RepoRoot\backup-*"
        } | Where-Object {
            $_.Extension -in @('.ts', '.tsx', '.js', '.jsx', '.json', '.md')
        }
    }

    return @($files | Sort-Object FullName -Unique)
}

Write-Host "Scanning user-facing and internal roots..." -ForegroundColor Cyan

$AllFiles = @()
$AllFiles += Get-FilesUnderRoots -Roots $UserFacingRoots
$AllFiles += Get-FilesUnderRoots -Roots $InternalRoots
$AllFiles = @($AllFiles | Sort-Object FullName -Unique)

$Findings = @()

foreach ($file in $AllFiles) {
    foreach ($pattern in $Patterns) {
        $hits = Select-String -LiteralPath $file.FullName -Pattern $pattern.Regex -AllMatches
        foreach ($hit in $hits) {
            $class = if (Test-IsUserFacingPath -Path $file.FullName) {
                if ($pattern.Name -in @('promo','discount','guarantee','split')) { 'must-fix-now' }
                else { 'review-user-facing' }
            }
            elseif (Test-IsInternalPath -Path $file.FullName) {
                if ($pattern.Name -in @('split','payout')) { 'logic-only-do-not-touch' }
                else { 'safe-internal-only' }
            }
            else {
                'review'
            }

            $Findings += [pscustomobject]@{
                Class      = $class
                Category   = $pattern.Name
                Path       = $file.FullName
                LineNumber = $hit.LineNumber
                Line       = $hit.Line.Trim()
            }
        }
    }
}

$mustFix = @($Findings | Where-Object { $_.Class -eq 'must-fix-now' } | Sort-Object Path, LineNumber)
$safeInternal = @($Findings | Where-Object { $_.Class -eq 'safe-internal-only' } | Sort-Object Path, LineNumber)
$logicOnly = @($Findings | Where-Object { $_.Class -eq 'logic-only-do-not-touch' } | Sort-Object Path, LineNumber)
$review = @($Findings | Where-Object { $_.Class -in @('review-user-facing', 'review') } | Sort-Object Path, LineNumber)

$mustFixPath = Join-Path $AuditRoot "monetization-audit-must-fix-$timestamp.txt"
$safeInternalPath = Join-Path $AuditRoot "monetization-audit-safe-internal-$timestamp.txt"
$logicOnlyPath = Join-Path $AuditRoot "monetization-audit-logic-only-$timestamp.txt"
$reviewPath = Join-Path $AuditRoot "monetization-audit-review-$timestamp.txt"
$jsonPath = Join-Path $AuditRoot "monetization-audit-all-$timestamp.json"

$mustFix | Format-Table -Wrap -AutoSize | Out-String | Set-Content -LiteralPath $mustFixPath -Encoding UTF8
$safeInternal | Format-Table -Wrap -AutoSize | Out-String | Set-Content -LiteralPath $safeInternalPath -Encoding UTF8
$logicOnly | Format-Table -Wrap -AutoSize | Out-String | Set-Content -LiteralPath $logicOnlyPath -Encoding UTF8
$review | Format-Table -Wrap -AutoSize | Out-String | Set-Content -LiteralPath $reviewPath -Encoding UTF8
$Findings | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

Write-Host "Audit complete." -ForegroundColor Green
Write-Host "Must fix: $mustFixPath" -ForegroundColor Yellow
Write-Host "Safe internal: $safeInternalPath" -ForegroundColor Yellow
Write-Host "Logic only: $logicOnlyPath" -ForegroundColor Yellow
Write-Host "Review: $reviewPath" -ForegroundColor Yellow
Write-Host "JSON: $jsonPath" -ForegroundColor Yellow
