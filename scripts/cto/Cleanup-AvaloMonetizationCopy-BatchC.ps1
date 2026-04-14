Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('cleanup-batchC-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
    'C:\a\avalo\app-mobile\i18n\strings.pl.json',
    'C:\a\avalo\app-mobile\app\profile\subscription.tsx',
    'C:\a\avalo\app-mobile\app\profile\settings\subscription.tsx',
    'C:\a\avalo\app-mobile\app\wallet\subscription.tsx',
    'C:\a\avalo\app-mobile\app\(tabs)\creator\earnings\breakdown.tsx',
    'C:\a\avalo\app-mobile\app\ai\earnings.tsx',
    'C:\a\avalo\app-mobile\components\LiveEarningsBadge.tsx',
    'C:\a\avalo\app-mobile\app\wallet\info.tsx'
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

    if ($path -like '*\strings.pl.json') {
        $new = Replace-Regex $new '"tokensEarned"\s*:\s*"[^"]*"' '"tokensEarned": "Otrzymano {{amount}} token\u00f3w!"'
        $new = Replace-Regex $new '"noTokenRewards"\s*:\s*"[^"]*"' '"noTokenRewards": "Brak darmowych token\u00f3w \u00b7 Brak korekt cenowych \u00b7 Czysta motywacja"'
        $new = Replace-Regex $new '"estimatedCreatorEarnings"\s*:\s*"[^"]*"' '"estimatedCreatorEarnings": "Referencyjny podgl\u0105d zarobk\u00f3w tw\u00f3rcy"'
        $new = Replace-Regex $new '"youEarn"\s*:\s*"[^"]*"' '"youEarn": "Referencyjny podgl\u0105d wyp\u0142aty"'
        $new = Replace-Regex $new '"referencePayoutPreview"\s*:\s*"[^"]*"' '"referencePayoutPreview": "Podgl\u0105d wyp\u0142aty referencyjnej"'
        $new = Replace-Regex $new '"legalNotice"\s*:\s*"[^"]*"' '"legalNotice": "Warto\u015bci referencyjne s\u0105 liczone na bazie warto\u015bci netto tokena bez VAT i maj\u0105 charakter konserwatywnego benchmarku. Ko\u0144cowa wyp\u0142ata mo\u017ce by\u0107 ni\u017csza w zale\u017cno\u015bci od VAT, podatk\u00f3w, op\u0142at, potr\u0105ce\u0144, refund\u00f3w, chargeback\u00f3w, compliance, kurs\u00f3w FX, zasad platformy oraz warunk\u00f3w u\u017cycia. Warto\u015bci nie s\u0105 gwarantowane."'
    }
    elseif ($path -like '*\subscription.tsx') {
        $new = $new.Replace('You earn 70%', 'Reference creator portion may reach 70% before applicable deductions')
        $new = $new.Replace('You keep 70%', 'Reference creator portion may reach 70% before applicable deductions')
        $new = $new.Replace('70/30 split', '70/30 reference model')
        $new = $new.Replace('creator share', 'reference creator portion')
        $new = $new.Replace('platform keeps', 'reference platform portion')
        $new = $new.Replace('Estimated Creator Earnings', 'Reference Creator Earnings Preview')
        $new = $new.Replace('You earn', 'Reference payout preview')
    }
    else {
        $new = $new.Replace('creator share', 'reference creator portion')
        $new = $new.Replace('platform keeps', 'reference platform portion')
        $new = $new.Replace('Avalo keeps', 'reference platform portion')
        $new = $new.Replace('You earn 80%', 'Reference creator portion may reach 80% before applicable deductions')
        $new = $new.Replace('You earn 65%', 'Reference creator portion may reach 65% before applicable deductions')
        $new = $new.Replace('You earn 800 tokens', 'Reference payout preview: 800 tokens before applicable deductions')
        $new = $new.Replace('You earn', 'Reference payout preview')
        $new = $new.Replace('Estimated Creator Earnings', 'Reference Creator Earnings Preview')
        $new = $new.Replace('earn 5% commission', 'reference 5% commission model')
        $new = $new.Replace('Revenue shown is creator share', 'Revenue shown is a reference creator portion preview')
    }

    if ($new -ne $raw) {
        Set-Content -LiteralPath $path -Value $new -Encoding UTF8
        $Changed += [pscustomobject]@{ Path = $path }
    }
}

$reportPath = Join-Path $AuditRoot ('cleanup-batchC-report-' + $timestamp + '.json')
$Changed | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host 'Cleanup Batch C complete.' -ForegroundColor Green
Write-Host ('Safety backup: ' + $BackupRoot) -ForegroundColor Yellow
Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
Write-Host ('Changed: ' + $Changed.Count) -ForegroundColor Yellow
