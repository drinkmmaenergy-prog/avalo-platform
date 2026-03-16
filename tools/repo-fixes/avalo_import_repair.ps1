$root="C:\a\avalo\functions\src"

Write-Host ""
Write-Host "================================="
Write-Host "AVALO IMPORT REPAIR START"
Write-Host "================================="
Write-Host ""

$files = Get-ChildItem $root -Recurse -Include *.ts

$importsFixed=0

foreach ($file in $files){

$content = Get-Content $file.FullName -Raw

$new = $content

# napraw puste importy
$new = $new -replace 'from ""','from "../config/monetizationSplits"'
$new = $new -replace "from ''",'from "../config/monetizationSplits"'

# napraw brakujący path
$new = $new -replace 'from "monetizationSplits"','from "../config/monetizationSplits"'

# normalize split naming
$new = $new.Replace("creatorShare","earner")
$new = $new.Replace("avaloShare","platform")
$new = $new.Replace("earnerShare","earner")
$new = $new.Replace("platformShare","platform")

if($new -ne $content){
$importsFixed++
Set-Content $file.FullName $new -Encoding UTF8
}

}

Write-Host ""
Write-Host "FILES SCANNED:" $files.Count
Write-Host "FILES FIXED:" $importsFixed
Write-Host ""

Write-Host "================================="
Write-Host "AVALO IMPORT REPAIR DONE"
Write-Host "================================="