$root="C:\a\avalo\functions\src"

Write-Host ""
Write-Host "======================================"
Write-Host "AVALO NUCLEAR IMPORT FIX START"
Write-Host "======================================"
Write-Host ""

$files = Get-ChildItem $root -Recurse -Filter *.ts

$fixed = 0

foreach ($file in $files){

$content = Get-Content $file.FullName -Raw

$new = $content

# regex łapiący wszystkie puste importy
$new = $new -replace 'from\s*["'']\s*["'']','from "../config/monetizationSplits"'

# fallback dla aliasów
$new = $new -replace 'from\s*["'']monetizationSplits["'']','from "../config/monetizationSplits"'

# normalize split naming
$new = $new.Replace("creatorShare","earner")
$new = $new.Replace("avaloShare","platform")
$new = $new.Replace("earnerShare","earner")
$new = $new.Replace("platformShare","platform")

if($new -ne $content){
$fixed++
Set-Content $file.FullName $new -Encoding UTF8
}

}

Write-Host ""
Write-Host "FILES SCANNED:" $files.Count
Write-Host "FILES FIXED:" $fixed
Write-Host ""

Write-Host "======================================"
Write-Host "AVALO NUCLEAR IMPORT FIX DONE"
Write-Host "======================================"