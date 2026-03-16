$root="C:\a\avalo\functions\src"

Write-Host "==============================="
Write-Host "FIX IMPORT POSITION START"
Write-Host "==============================="

$files = Get-ChildItem $root -Recurse -Filter *.ts

$fixed = 0

foreach ($file in $files){

$content = Get-Content $file.FullName

$content = $content | Where-Object {$_ -notmatch "monetizationSplits"}

$newContent = @(
'import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";'
""
)

$newContent += $content

$newContent | Set-Content $file.FullName -Encoding UTF8

$fixed++

}

Write-Host ""
Write-Host "FILES FIXED:" $fixed

Write-Host ""
Write-Host "==============================="
Write-Host "FIX IMPORT POSITION DONE"
Write-Host "==============================="