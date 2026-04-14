Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = 'C:\a\avalo'
$AuditRoot = Join-Path $RepoRoot 'audit-out'
New-Item -ItemType Directory -Force -Path $AuditRoot | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AuditRoot "cleanup-batchA-safety-$timestamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

$Targets = @(
    'C:\a\avalo\app-mobile\components\PromotionCard.tsx',
    'C:\a\avalo\app-mobile\app\creator\scalability\discounts.tsx',
    'C:\a\avalo\app-mobile\i18n\strings.en.json',
    'C:\a\avalo\app-mobile\screens\creator\PromotionsOverviewScreen.tsx',
    'C:\a\avalo\app-mobile\app\wallet.tsx',
    'C:\a\avalo\app-mobile\app\(tabs)\wallet.tsx',
    'C:\a\avalo\app-mobile\app\profile\offline-promotions\index.tsx',
    'C:\a\avalo\app-mobile\app\(tabs)\home.tsx',
    'C:\a\avalo\app-mobile\components\TokenPrice.tsx',
    'C:\a\avalo\app-mobile\components\BottomSheetPromo.tsx'
) | Where-Object { Test-Path -LiteralPath $_ }

function Backup-File {
    param([string]$Path)
    $relative = $Path.Substring($RepoRoot.Length).TrimStart('\')
    $dest = Join-Path $BackupRoot $relative
    $destDir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item -LiteralPath $Path -Destination $dest -Force
}

function Normalize-Text {
    param([string]$Text)

    if ($null -eq $Text) { return $Text }

    $t = $Text

    $t = [regex]::Replace($t, '(?i)\bVIP discount\b', 'VIP member terms')
    $t = [regex]::Replace($t, '(?i)\bRoyal discount\b', 'Royal member terms')
    $t = [regex]::Replace($t, '(?i)\blimited time discount\b', 'limited-time pricing terms')
    $t = [regex]::Replace($t, '(?i)\bspecial offer\b', 'offer terms')
    $t = [regex]::Replace($t, '(?i)\bdiscounts\b', 'pricing options')
    $t = [regex]::Replace($t, '(?i)\bdiscount\b', 'pricing adjustment')
    $t = [regex]::Replace($t, '(?i)\bpromotions\b', 'offers')
    $t = [regex]::Replace($t, '(?i)\bpromotion\b', 'offer')
    $t = [regex]::Replace($t, '(?i)\bpromo\b', 'offer')
    $t = [regex]::Replace($t, '(?i)(\d+)\s*%\s*OFF', '$1% price marker removed')
    $t = [regex]::Replace($t, '(?i)\byou earn 80%\b', 'reference creator portion may reach 80% before applicable deductions')
    $t = [regex]::Replace($t, '(?i)\byou earn 65%\b', 'reference creator portion may reach 65% before applicable deductions')
    $t = [regex]::Replace($t, '(?i)\byou earn\b', 'reference payout preview')
    $t = [regex]::Replace($t, '(?i)\bearn 80%\b', 'reference creator portion up to 80%')
    $t = [regex]::Replace($t, '(?i)\bcreator share\b', 'reference creator portion')
    $t = [regex]::Replace($t, '(?i)\bplatform keeps\b', 'reference platform portion')
    $t = [regex]::Replace($t, '(?i)\bAvalo keeps\b', 'reference platform portion')
    $t = [regex]::Replace($t, "(?i)\bcommission on referrals' revenue\b", 'reference referral commission model')
    $t = [regex]::Replace($t, '(?i)\bwithdraw anytime\b', 'withdrawal subject to eligibility and compliance checks')
    $t = [regex]::Replace($t, '\s{2,}', ' ')

    return $t
}

function Update-JsonNode {
    param([object]$Node)

    if ($null -eq $Node) { return $null }

    if ($Node -is [string]) {
        return (Normalize-Text -Text $Node)
    }

    if ($Node -is [System.Collections.IDictionary]) {
        $copy = @{}
        foreach ($k in $Node.Keys) {
            $copy[$k] = Update-JsonNode -Node $Node[$k]
        }
        return $copy
    }

    if ($Node -is [System.Collections.IEnumerable] -and -not ($Node -is [string])) {
        $list = @()
        foreach ($item in $Node) {
            $list += ,(Update-JsonNode -Node $item)
        }
        return ,$list
    }

    return $Node
}

$Changed = @()

foreach ($path in $Targets) {
    Backup-File -Path $path

    $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()

    if ($ext -eq '.json') {
        $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        $json = $raw | ConvertFrom-Json
        $updated = Update-JsonNode -Node $json
        $newJson = $updated | ConvertTo-Json -Depth 100
        if ($newJson -ne $raw) {
            Set-Content -LiteralPath $path -Value $newJson -Encoding UTF8
            $Changed += [pscustomobject]@{ Path = $path; Type = 'json' }
        }
    }
    else {
        $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
        $newContent = Normalize-Text -Text $raw
        if ($newContent -ne $raw) {
            Set-Content -LiteralPath $path -Value $newContent -Encoding UTF8
            $Changed += [pscustomobject]@{ Path = $path; Type = 'text' }
        }
    }
}

$reportPath = Join-Path $AuditRoot "cleanup-batchA-report-$timestamp.json"
$Changed | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host "Batch A cleanup complete." -ForegroundColor Green
Write-Host "Safety backup: $BackupRoot" -ForegroundColor Yellow
Write-Host "Report: $reportPath" -ForegroundColor Yellow
Write-Host "Changed: $($Changed.Count)" -ForegroundColor Yellow

