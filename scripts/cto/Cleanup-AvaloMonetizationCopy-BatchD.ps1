Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot ('cleanup-batchD-safety-' + $timestamp)
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
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

function Apply-Replacements {
    param(
        [string]$Content,
        [object[]]$Pairs
    )
    $result = $Content
    foreach ($pair in $Pairs) {
        $result = $result.Replace($pair.Old, $pair.New)
    }
    return $result
}

$webPairs = @(
    @{ Old = 'You earn 70%'; New = 'Reference creator portion may reach 70% before applicable deductions' },
    @{ Old = 'You keep 70%'; New = 'Reference creator portion may reach 70% before applicable deductions' },
    @{ Old = '70/30 split'; New = '70/30 reference model' },
    @{ Old = 'creator share'; New = 'reference creator portion' },
    @{ Old = 'platform keeps'; New = 'reference platform portion' },
    @{ Old = 'Avalo keeps'; New = 'reference platform portion' },
    @{ Old = 'Estimated Creator Earnings'; New = 'Reference Creator Earnings Preview' },
    @{ Old = 'You earn'; New = 'Reference payout preview' },
    @{ Old = 'guaranteed payout'; New = 'reference payout preview' },
    @{ Old = 'guaranteed earnings'; New = 'reference earnings preview' },
    @{ Old = 'VIP discount'; New = 'VIP member pricing' },
    @{ Old = 'Royal discount'; New = 'Royal member pricing' },
    @{ Old = 'Limited Time'; New = 'Current pricing terms' },
    @{ Old = '% OFF'; New = '% pricing adjustment' }
)

$Changed = @()

foreach ($path in $Targets) {
    Backup-File -Path $path
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $new = Apply-Replacements -Content $raw -Pairs $webPairs

    if ($new -ne $raw) {
        Set-Content -LiteralPath $path -Value $new -Encoding UTF8
        $Changed += [pscustomobject]@{ Path = $path }
    }
}

$reportPath = Join-Path $AuditRoot ('cleanup-batchD-report-' + $timestamp + '.json')
$Changed | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host 'Cleanup Batch D complete.' -ForegroundColor Green
Write-Host ('Safety backup: ' + $BackupRoot) -ForegroundColor Yellow
Write-Host ('Report: ' + $reportPath) -ForegroundColor Yellow
Write-Host ('Changed: ' + $Changed.Count) -ForegroundColor Yellow
