
$root = "C:\a\avalo\functions\src"
$reportPath = "C:\a\avalo\audit-out\MONETIZATION_LOCK_REPORT.txt"

New-Item -ItemType Directory -Force "C:\a\avalo\audit-out" | Out-Null

$report = @()

function LogLine {
    param([string]$text)
    Write-Host $text
    $script:report += $text
}

LogLine "======================================"
LogLine "AVALO MONETIZATION LOCK SCAN START"
LogLine "======================================"

# -------------------------------------------------------
# FIX CALL SPLIT
# -------------------------------------------------------

LogLine "Fixing CALL split to canonical 65/35"

Get-ChildItem "$root\config" -Recurse -Filter *.ts -ErrorAction SilentlyContinue | ForEach-Object {

    $content = Get-Content $_.FullName -Raw

    $content = $content -replace "creator:\s*0\.80","creator: 0.65"
    $content = $content -replace "avalo:\s*0\.20","avalo: 0.35"

    Set-Content $_.FullName $content

}

# -------------------------------------------------------
# FIX AI BILLING ROUNDING
# -------------------------------------------------------

LogLine "Fixing AI chat rounding (round -> ceil)"

$aiFile = "$root\aiChatEngine.ts"

if (Test-Path $aiFile) {

    $content = Get-Content $aiFile -Raw

    $content = $content -replace "Math\.round","Math.ceil"

    Set-Content $aiFile $content

    LogLine "AI billing patched"

} else {

    LogLine "AI engine not found"

}

# -------------------------------------------------------
# SAFE SCAN FUNCTION
# -------------------------------------------------------

function ScanFiles {

    param(
        [string]$pattern,
        [string]$label
    )

    LogLine ""
    LogLine "Scanning $label"

    Get-ChildItem $root -Recurse -Filter *.ts -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "node_modules|dist|build|.next" } |
    ForEach-Object {

        $matches = Select-String -Path $_.FullName -Pattern $pattern -ErrorAction SilentlyContinue

        foreach ($m in $matches) {

            $lineText = ""

            if ($null -ne $m.Line) {
                $lineText = $m.Line.Trim()
            }

            $entry = "$($m.Path) : $($m.LineNumber) : $lineText"

            LogLine $entry

        }

    }

}

# -------------------------------------------------------
# WORD TOKEN SCAN
# -------------------------------------------------------

ScanFiles "WORDS_PER_TOKEN_STANDARD" "STANDARD WORD TOKEN"
ScanFiles "WORDS_PER_TOKEN_ROYAL" "ROYAL WORD TOKEN"

# -------------------------------------------------------
# ENTRY FEE SCAN
# -------------------------------------------------------

ScanFiles "deposit" "DEPOSIT"
ScanFiles "entry" "ENTRY"
ScanFiles "escrow" "ESCROW"
ScanFiles "MIN_DEPOSIT" "MIN DEPOSIT"

# -------------------------------------------------------
# SPLIT SCAN
# -------------------------------------------------------

ScanFiles "0.65" "CREATOR SPLIT"
ScanFiles "0.35" "AVALO SPLIT"

# -------------------------------------------------------
# SAVE REPORT
# -------------------------------------------------------

LogLine ""
LogLine "Saving report..."

$report | Set-Content $reportPath -Encoding UTF8

LogLine "REPORT SAVED:"
LogLine $reportPath

LogLine ""
LogLine "AVALO MONETIZATION LOCK SCAN END"

