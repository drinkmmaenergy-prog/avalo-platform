$root="C:\a\avalo\functions\src"

Write-Host ""
Write-Host "=============================="
Write-Host "AVALO MONETIZATION PATH FIX"
Write-Host "=============================="
Write-Host ""

$files=Get-ChildItem $root -Recurse -Include *.ts

$fixed=0

foreach($file in $files){

$content=Get-Content $file.FullName -Raw

$new=$content -replace "\.\./config/monetizationSplits","./config/monetizationSplits"

if($new -ne $content){

Set-Content $file.FullName $new -Encoding UTF8
$fixed++

}

}

Write-Host ""
Write-Host "FILES SCANNED:" $files.Count
Write-Host "FILES FIXED:" $fixed
Write-Host ""
Write-Host "DONE"