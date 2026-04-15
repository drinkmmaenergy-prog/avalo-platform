Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Get-FileText {
    param([string]$Path)
    try {
        return Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    } catch {
        return ''
    }
}

$stubPages = @()
Get-ChildItem -LiteralPath 'C:\a\avalo\app-web\src\app' -Recurse -File | Where-Object {
    $_.Name -in @('page.tsx','layout.tsx')
} | ForEach-Object {
    $raw = Get-FileText $_.FullName
    $isStub =
        $raw -match 'temporarily unavailable' -or
        $raw -match 'AutoRecoveredPage' -or
        $raw -match 'AutoRecoveredLayout' -or
        $raw -match 'AdminModerationAppealPage' -or
        $raw -match 'AdminModerationIncidentPage' -or
        $raw -match 'AdminModerationUserPage' -or
        $raw -match 'AiChatAvatarPage'
    if ($isStub) {
        $stubPages += [pscustomobject]@{
            Path = $_.FullName
            Type = $_.Name
        }
    }
}

$compatPatterns = @(
    'INTERNAL_FX_RATES',
    'CHAT_CONFIG',
    'PAYOUT_PER_TOKEN_USD',
    'CREATOR_SHARE',
    'PLATFORM_SHARE',
    'CREATOR_REVENUE_SHARE',
    'TokenPack =',
    'BASE_COST_STANDARD',
    'BASE_COST_VIP',
    'BASE_COST_ROYAL',
    'CHAT_DEPOSIT_TOKENS',
    'PLATFORM_FEE_PERCENT',
    'ESCROW_PERCENT'
)

$compatHits = @()
Get-ChildItem -LiteralPath 'C:\a\avalo\app-web\src' -Recurse -File | Where-Object {
    $_.Extension -in @('.ts','.tsx')
} | ForEach-Object {
    $raw = Get-FileText $_.FullName
    foreach ($p in $compatPatterns) {
        if ($raw -match [regex]::Escape($p)) {
            $compatHits += [pscustomobject]@{
                Path = $_.FullName
                Pattern = $p
            }
        }
    }
}

$legacyPatterns = @(
    'promotion',
    'promo',
    'discount',
    'wise',
    'Revolut',
    'PayPal',
    'creator share',
    'Avalo keeps',
    'You earn 65%',
    'You earn 70%',
    'You earn 80%',
    'You keep 70%'
)

$legacyHits = @()
Get-ChildItem -LiteralPath $RepoRoot -Recurse -File | Where-Object {
    $_.Extension -in @('.ts','.tsx','.js','.jsx','.json','.md') -and
    $_.FullName -notlike "$RepoRoot\.git*" -and
    $_.FullName -notlike "$RepoRoot\node_modules*" -and
    $_.FullName -notlike "$RepoRoot\.next*" -and
    $_.FullName -notlike "$RepoRoot\dist*" -and
    $_.FullName -notlike "$RepoRoot\build*" -and
    $_.FullName -notlike "$RepoRoot\coverage*" -and
    $_.FullName -notlike "$RepoRoot\audit-out*" -and
    $_.FullName -notlike "$RepoRoot\backup-*"
} | ForEach-Object {
    $raw = Get-FileText $_.FullName
    foreach ($p in $legacyPatterns) {
        if ($raw -match $p) {
            $legacyHits += [pscustomobject]@{
                Path = $_.FullName
                Pattern = $p
            }
        }
    }
}

$stubPath = Join-Path $AuditRoot ("batchI-stub-pages-" + $timestamp + ".txt")
$compatPath = Join-Path $AuditRoot ("batchI-compat-hits-" + $timestamp + ".txt")
$legacyPath = Join-Path $AuditRoot ("batchI-legacy-hits-" + $timestamp + ".txt")
$summaryPath = Join-Path $AuditRoot ("batchI-summary-" + $timestamp + ".txt")
$jsonPath = Join-Path $AuditRoot ("batchI-all-" + $timestamp + ".json")

$stubPages | Format-Table -AutoSize | Out-String | Set-Content -LiteralPath $stubPath -Encoding UTF8
$compatHits | Sort-Object Path, Pattern | Format-Table -AutoSize | Out-String | Set-Content -LiteralPath $compatPath -Encoding UTF8
$legacyHits | Sort-Object Path, Pattern | Format-Table -AutoSize | Out-String | Set-Content -LiteralPath $legacyPath -Encoding UTF8

$summary = @()
$summary += "BATCH I SUMMARY"
$summary += "Timestamp: $timestamp"
$summary += ""
$summary += ("Stub pages: " + $stubPages.Count)
$summary += ("Compat hits: " + $compatHits.Count)
$summary += ("Legacy hits: " + $legacyHits.Count)
$summary += ""
$summary += "Top stub pages"
$summary += ($stubPages | Format-Table -AutoSize | Out-String)
$summary += ""
$summary += "Top compat files"
$summary += (
    $compatHits |
    Group-Object Path |
    Sort-Object Count -Descending |
    Select-Object -First 25 Count, Name |
    Format-Table -AutoSize | Out-String
)
$summary += ""
$summary += "Top legacy files"
$summary += (
    $legacyHits |
    Group-Object Path |
    Sort-Object Count -Descending |
    Select-Object -First 25 Count, Name |
    Format-Table -Wrap -AutoSize | Out-String
)

$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

[pscustomobject]@{
    StubPages = $stubPages
    CompatHits = $compatHits
    LegacyHits = $legacyHits
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

Write-Host 'Batch I inventory complete.' -ForegroundColor Green
Write-Host ('Stub pages: ' + $stubPath) -ForegroundColor Yellow
Write-Host ('Compat hits: ' + $compatPath) -ForegroundColor Yellow
Write-Host ('Legacy hits: ' + $legacyPath) -ForegroundColor Yellow
Write-Host ('Summary: ' + $summaryPath) -ForegroundColor Yellow
Write-Host ('JSON: ' + $jsonPath) -ForegroundColor Yellow
