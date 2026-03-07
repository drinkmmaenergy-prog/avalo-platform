
$ErrorActionPreference = "Stop"

$Repo = "C:\a\avalo\functions\src"
$Report = "C:\a\avalo\audit-out\MONETIZATION_STABILIZE_REPORT.txt"

New-Item -ItemType Directory -Force "C:\a\avalo\audit-out" | Out-Null

$log = @()

function Log {
    param([string]$text)
    Write-Host $text
    $script:log += $text
}

function Patch {
    param(
        [string]$file,
        [string]$pattern,
        [string]$replace
    )

    if (!(Test-Path $file)) {
        Log "[MISS] $file"
        return
    }

    $raw = Get-Content $file -Raw
    $new = $raw -replace $pattern,$replace

    if ($new -ne $raw) {
        Set-Content $file $new
        Log "[PATCH] $file"
    } else {
        Log "[OK] $file"
    }
}

Log "================================"
Log "AVALO ECONOMY STABILIZATION"
Log "================================"

# --------------------------------
# CALL SPLIT
# --------------------------------

Patch "$Repo\config\economyConfig.ts" "creator:\s*0\.80" "creator: 0.65"
Patch "$Repo\config\economyConfig.ts" "avalo:\s*0\.20" "avalo: 0.35"

# --------------------------------
# ANALYTICS FIX
# --------------------------------

Patch "$Repo\analytics\creatorMetrics.ts" "\* 0\.7" "* 0.65"

# --------------------------------
# AI ROUNDING
# --------------------------------

Patch "$Repo\aiChatEngine.ts" "Math\.round" "Math.ceil"

# --------------------------------
# FREEZE LEGACY FILES
# --------------------------------

$legacy = @(
"chatMonetization.ts",
"pack273ChatEngine.ts",
"pack430-economy-engine.ts"
)

foreach ($f in $legacy) {

    $path = "$Repo\$f"

    if (Test-Path $path) {

        $txt = Get-Content $path -Raw

        if ($txt -notmatch "CANONICAL_ENGINE_LOCK") {

            $comment = @"

/*
CANONICAL_ENGINE_LOCK

This file is legacy compatibility only.

Source of truth:
canonical-chat-engine.ts

Do not modify billing logic here.
*/

"@

            Set-Content $path ($comment + $txt)

            Log "[LOCK] $f"

        }
    }
}

# --------------------------------
# SCAN REPO
# --------------------------------

Log ""
Log "SCAN RESULTS"

Get-ChildItem $Repo -Recurse -Include *.ts |
Where-Object { $_.FullName -notmatch "node_modules|dist|build|.next" } |
ForEach-Object {

    $lines = Select-String $_.FullName -Pattern "WORDS_PER_TOKEN|deposit|escrow|0.65|0.35"

    foreach ($l in $lines) {

        $entry = "$($_.Path) : $($l.LineNumber) : $($l.Line.Trim())"

        Log $entry
    }
}

$log | Set-Content $Report

Log ""
Log "REPORT SAVED: $Report"

