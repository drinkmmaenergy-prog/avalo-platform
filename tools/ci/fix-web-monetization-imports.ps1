$ErrorActionPreference = "Stop"

$webRoot = "C:\a\avalo\app-web"
$srcRoot = Join-Path $webRoot "src"
$constDir = Join-Path $srcRoot "constants"
$constFile = Join-Path $constDir "monetization.ts"
$tsconfigPath = Join-Path $webRoot "tsconfig.json"

New-Item -ItemType Directory -Force $constDir | Out-Null

Write-Host "STEP 1: Creating frontend monetization constants"

@"
export const MONETIZATION_SPLITS = {
  CHAT: { creator: 0.65, avalo: 0.35 },
  CALL: { creator: 0.65, avalo: 0.35 },
  VIDEO_CALL: { creator: 0.65, avalo: 0.35 },
  TIPS: { creator: 0.65, avalo: 0.35 },
  UNLOCK_MEDIA: { creator: 0.65, avalo: 0.35 },
  LIVE_GIFTS: { creator: 0.65, avalo: 0.35 },

  EVENT_TICKET: { creator: 0.80, avalo: 0.20 },
  CALENDAR_MEETING: { creator: 0.80, avalo: 0.20 },

  SUBSCRIPTION: { creator: 0.70, avalo: 0.30 }
} as const;
"@ | Set-Content -LiteralPath $constFile -Encoding UTF8

Write-Host "STEP 2: Ensuring tsconfig alias"

$tsconfigRaw = Get-Content -LiteralPath $tsconfigPath -Raw -Encoding UTF8
$tsconfig = $tsconfigRaw | ConvertFrom-Json -Depth 100

if (-not $tsconfig.compilerOptions) {
  $tsconfig | Add-Member -MemberType NoteProperty -Name compilerOptions -Value ([pscustomobject]@{})
}

if (-not $tsconfig.compilerOptions.paths) {
  $tsconfig.compilerOptions | Add-Member -MemberType NoteProperty -Name paths -Value (@{})
}

$paths = @{}
if ($tsconfig.compilerOptions.paths -is [System.Collections.IDictionary]) {
  foreach ($k in $tsconfig.compilerOptions.paths.Keys) {
    $paths[$k] = $tsconfig.compilerOptions.paths[$k]
  }
} else {
  $tsconfig.compilerOptions.paths.psobject.Properties | ForEach-Object {
    $paths[$_.Name] = $_.Value
  }
}

$paths["@constants/*"] = @("src/constants/*")
$tsconfig.compilerOptions.paths = $paths

$tsconfig | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $tsconfigPath -Encoding UTF8

Write-Host "STEP 3: Fixing all app-web files that use MONETIZATION_SPLITS"

$files = Get-ChildItem -Path $srcRoot -Recurse -File -Include *.ts,*.tsx | Where-Object {
  $_.FullName -notmatch "node_modules|dist|build|\.next"
}

$importLine = 'import { MONETIZATION_SPLITS } from "@constants/monetization";'

foreach ($file in $files) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8

  if ($content -notmatch 'MONETIZATION_SPLITS') {
    continue
  }

  # remove old imports first
  $content = [regex]::Replace(
    $content,
    '^\s*import\s+\{\s*MONETIZATION_SPLITS\s*\}\s+from\s+["''].*?["''];\s*\r?\n?',
    '',
    [System.Text.RegularExpressions.RegexOptions]::Multiline
  )

  if ($content -match "^\s*'use client';") {
    if ($content -notmatch [regex]::Escape($importLine)) {
      $content = [regex]::Replace(
        $content,
        "^\s*'use client';\s*\r?\n",
        "'use client';`r`n`r`n$importLine`r`n",
        [System.Text.RegularExpressions.RegexOptions]::Multiline
      )
    }
  } else {
    if ($content -notmatch [regex]::Escape($importLine)) {
      $content = $importLine + "`r`n" + $content
    }
  }

  Set-Content -LiteralPath $file.FullName -Value $content -Encoding UTF8
  Write-Host "Patched:" $file.FullName
}

Write-Host "STEP 4: Printing files still missing import sanity check"

$remaining = @()

foreach ($file in $files) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  if ($content -match 'MONETIZATION_SPLITS' -and $content -notmatch 'import\s+\{\s*MONETIZATION_SPLITS\s*\}\s+from\s+"@constants/monetization";') {
    $remaining += $file.FullName
  }
}

if ($remaining.Count -gt 0) {
  Write-Host "FILES STILL REQUIRING REVIEW:"
  $remaining | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "All MONETIZATION_SPLITS files fixed."
}

Write-Host "DONE"
