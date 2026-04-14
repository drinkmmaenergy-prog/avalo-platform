Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('normalize-split-wording-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
    'C:\a\avalo\app-mobile\app\(onboarding)\earn-to-chat-setup.tsx',
    'C:\a\avalo\app-mobile\app\(tabs)\creator\earnings\breakdown.tsx',
    'C:\a\avalo\app-mobile\app\profile\settings\agency.tsx',
    'C:\a\avalo\app-mobile\app\events\ticket.tsx',
    'C:\a\avalo\app-mobile\app\profile\subscription.tsx',
    'C:\a\avalo\app-mobile\app\profile\settings\subscription.tsx',
    'C:\a\avalo\app-mobile\app\wallet\subscription.tsx',
    'C:\a\avalo\app-mobile\app\ai\earnings.tsx',
    'C:\a\avalo\app-mobile\components\LiveEarningsBadge.tsx',
    'C:\a\avalo\app-mobile\app\wallet\info.tsx',
    'C:\a\avalo\app-mobile\i18n\strings.en.json',
    'C:\a\avalo\app-mobile\i18n\strings.pl.json',
    'C:\a\avalo\app-web\src\app\legal\terms\page.tsx',
    'C:\a\avalo\app-web\src\app\legal\calendar-policy\page.tsx',
    'C:\a\avalo\app-web\src\app\help\page.tsx',
    'C:\a\avalo\app-web\src\app\creator\store\page.tsx',
    'C:\a\avalo\app-web\src\app\store\[userId]\page.tsx',
    'C:\a\avalo\app-web\src\i18n\messages\en.json',
    'C:\a\avalo\app-web\src\i18n\messages\pl.json',
    'C:\a\avalo\app-web\src\i18n\messages\de.json',
    'C:\a\avalo\app-web\src\i18n\messages\fr.json',
    'C:\a\avalo\app-web\src\i18n\messages\es.json',
    'C:\a\avalo\app-web\src\i18n\messages\it.json',
    'C:\a\avalo\app-web\src\i18n\messages\pt.json',
    'C:\a\avalo\app-web\src\i18n\messages\nl.json',
    'C:\a\avalo\app-web\src\i18n\messages\sv.json',
    'C:\a\avalo\app-web\src\i18n\messages\tr.json',
    'C:\a\avalo\app-web\src\i18n\messages\uk.json',
    'C:\a\avalo\app-web\src\i18n\messages\ru.json',
    'C:\a\avalo\app-web\src\i18n\messages\ar.json',
    'C:\a\avalo\app-web\src\i18n\messages\hi.json',
    'C:\a\avalo\app-web\src\i18n\messages\id.json',
    'C:\a\avalo\app-web\src\i18n\messages\ja.json',
    'C:\a\avalo\app-web\src\i18n\messages\ko.json',
    'C:\a\avalo\app-web\src\i18n\messages\th.json',
    'C:\a\avalo\app-web\src\i18n\messages\vi.json',
    'C:\a\avalo\app-web\src\i18n\messages\zh.json'
) | Where-Object { Test-Path -LiteralPath $_ }

function Backup-File {
    param([string]$Path)
    $relative = $Path.Substring($RepoRoot.Length).TrimStart('\')
    $dest = Join-Path $BackupRoot $relative
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -LiteralPath $Path -Destination $dest -Force
}

function Replace-Regex {
    param(
        [string]$Content,
        [string]$Pattern,
        [string]$Replacement
    )
    return [regex]::Replace($Content, $Pattern, $Replacement)
}

$Changed = @()

foreach ($path in $Targets) {
    Backup-File -Path $path
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $new = $raw

    # EN / generic normalization
    $new = Replace-Regex $new 'Reference creator portion may reach 80% before applicable deductions\.?' 'You may earn up to 80% before applicable deductions.'
    $new = Replace-Regex $new 'Reference creator portion may reach 70% before applicable deductions\.?' 'You may earn up to 70% before applicable deductions.'
    $new = Replace-Regex $new 'Reference creator portion may reach 65% before applicable deductions\.?' 'You may earn up to 65% before applicable deductions.'

    $new = Replace-Regex $new 'Reference creator portion: up to 80% before applicable deductions\.?' 'You may earn up to 80% before applicable deductions.'
    $new = Replace-Regex $new 'Reference creator portion: up to 70% before applicable deductions\.?' 'You may earn up to 70% before applicable deductions.'
    $new = Replace-Regex $new 'Reference creator portion: up to 65% before applicable deductions\.?' 'You may earn up to 65% before applicable deductions.'

    $new = Replace-Regex $new 'Reference payout preview only: up to ([0-9]+) tokens before applicable deductions\.?' 'Reference payout preview only: up to $1 tokens before applicable deductions. Not guaranteed.'
    $new = Replace-Regex $new 'Reference payout preview: ([0-9]+) tokens before applicable deductions\.?' 'Reference payout preview only: up to $1 tokens before applicable deductions. Not guaranteed.'

    $new = Replace-Regex $new 'Reference creator portion preview' 'Reference payout preview only'
    $new = Replace-Regex $new 'Reference creator portion' 'You may earn up to'
    $new = Replace-Regex $new 'reference creator portion' 'up to creator portion'
    $new = Replace-Regex $new 'reference platform portion' 'reference platform portion'

    $new = Replace-Regex $new 'Reference creator portion remains 80% before applicable deductions, with a 20% reference platform portion\.' 'You may earn up to 80% before applicable deductions. Reference platform portion: up to 20%. Not guaranteed.'
    $new = Replace-Regex $new 'Your agency receives \{agencyLink\.agencyPercentage\}% of your 65% reference creator portion before applicable deductions\.' 'Your agency receives {agencyLink.agencyPercentage}% of your up to 65% creator portion before applicable deductions.'

    $new = Replace-Regex $new 'tokens \(65% reference creator portion\)' 'tokens (up to 65% creator portion)'
    $new = Replace-Regex $new 'tokens \(65% up to creator portion\)' 'tokens (up to 65% creator portion)'

    $new = Replace-Regex $new 'Reference payout preview' 'Reference payout preview only'
    $new = Replace-Regex $new 'Reference Creator Earnings Preview' 'Reference Creator Earnings Preview'

    # Optional keep wording
    $new = Replace-Regex $new 'You may keep up to ([0-9]+)% before applicable deductions\.?' 'You may keep up to $1% before applicable deductions.'
    $new = Replace-Regex $new 'You keep ([0-9]+)%' 'You may keep up to $1% before applicable deductions.'
    $new = Replace-Regex $new 'You earn ([0-9]+)%' 'You may earn up to $1% before applicable deductions.'

    # PL normalization in escaped form
    $new = Replace-Regex $new 'Referencyjny podgl\u0105d wyp\u0142aty' 'Referencyjny podgl\u0105d wyp\u0142aty'
    $new = Replace-Regex $new 'mo\u017ce by\u0107 ni\u017csza' 'mo\u017ce by\u0107 ni\u017csza'

    if ($new -ne $raw) {
        Set-Content -LiteralPath $path -Value $new -Encoding UTF8
        $Changed += [pscustomobject]@{ Path = $path }
    }
}

$reportPath = Join-Path $AuditRoot ('normalize-split-wording-report-' + $timestamp + '.json')
$Changed | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host 'Normalize split wording complete.' -ForegroundColor Green
Write-Host ('Safety backup: ' + $BackupRoot) -ForegroundColor Yellow
Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
Write-Host ('Changed: ' + $Changed.Count) -ForegroundColor Yellow
