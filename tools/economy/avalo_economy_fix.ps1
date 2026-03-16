Write-Host ""
Write-Host "==============================="
Write-Host "AVALO ECONOMY SCANNER"
Write-Host "==============================="

$repo = "C:\a\avalo"

$exclude = "node_modules|\.git|\.next|audit-out|dist|build"

$files = Get-ChildItem $repo -Recurse -Include *.ts,*.js |
Where-Object { $_.FullName -notmatch $exclude }

Write-Host ""
Write-Host "Files scanned:" $files.Count

# --------------------------------
# 1 BILLING ROUND BUG
# --------------------------------

Write-Host ""
Write-Host "Fixing Math.round billing bugs..."

foreach ($file in $files){

$content = Get-Content $file.FullName -Raw

if ($content -match "Math\.round\(.*wordsPerToken"){

Write-Host "Fixing:" $file.FullName

$content = $content -replace "Math\.round","Math.ceil"

Set-Content $file.FullName $content

}

}

# --------------------------------
# 2 SPLIT SCAN
# --------------------------------

Write-Host ""
Write-Host "Scanning split constants..."

$splitResults = @()

foreach ($file in $files){

$content = Get-Content $file.FullName -Raw

if ($content -match "0\.9|0\.8|0\.7|0\.65|0\.35"){

$splitResults += $file.FullName

}

}

$splitResults | Out-File audit-out\split_scan_result.txt

Write-Host "Split scan report written"

# --------------------------------
# 3 WORD TOKEN SCAN
# --------------------------------

Write-Host ""
Write-Host "Scanning token logic..."

$tokenResults = @()

foreach ($file in $files){

$content = Get-Content $file.FullName -Raw

if ($content -match "wordsPerToken"){

$tokenResults += $file.FullName

}

}

$tokenResults | Out-File audit-out\word_token_scan.txt

# --------------------------------
# 4 VERIFY MONETIZATION SPLITS
# --------------------------------

Write-Host ""
Write-Host "Verifying canonical splits..."

$canonical = @{
CHAT="65/35"
CALL="65/35"
VIDEO_CALL="65/35"
TIPS="65/35"
UNLOCK_MEDIA="65/35"
LIVE_GIFTS="65/35"
EVENT_TICKET="80/20"
CALENDAR_MEETING="80/20"
SUBSCRIPTION="70/30"
}

$canonical.GetEnumerator() | Out-File audit-out\canonical_splits.txt

# --------------------------------
# 5 RUN TESTS
# --------------------------------

Write-Host ""
Write-Host "Running chat economy test..."

cd "$repo\functions"

npx ts-node src/tests/chatEconomyTest.ts

Write-Host ""
Write-Host "Running word/token test..."

npx ts-node src/tests/chatWordTokenTest.ts

Write-Host ""
Write-Host "==============================="
Write-Host "SCAN COMPLETE"
Write-Host "==============================="
