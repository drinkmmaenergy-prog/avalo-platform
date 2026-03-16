$root="C:\a\avalo\functions\src"

Write-Host ""
Write-Host "======================================="
Write-Host "AVALO FINAL REPO SURGEON START"
Write-Host "======================================="
Write-Host ""

$files=Get-ChildItem $root -Recurse -Include *.ts

$importFix=0
$fieldFix=0

foreach($file in $files){

$path=$file.FullName
$relative=$path.Replace($root+"\","")

$depth=($relative.Split("\").Length-1)

$prefix=""

for($i=0;$i -lt $depth;$i++){
$prefix+="../"
}

if($depth -eq 0){
$correct="./config/monetizationSplits"
}else{
$correct=$prefix+"config/monetizationSplits"
}

$content=Get-Content $path -Raw

$new=$content

# IMPORT PATH FIX
$new=$new -replace "\.\./config/monetizationSplits",$correct
$new=$new -replace "\./config/monetizationSplits",$correct

if($new -ne $content){
$importFix++
}

# FIELD NORMALIZATION

$new=$new.Replace("creator","earner")
$new=$new.Replace("avalo","platform")

$new=$new.Replace("creatorTokens","earnerTokens")
$new=$new.Replace("avaloTokens","platformTokens")

if($new -ne $content){
$fieldFix++
}

Set-Content $path $new -Encoding UTF8

}

Write-Host "FILES SCANNED:" $files.Count
Write-Host "IMPORTS FIXED:" $importFix
Write-Host "FIELDS FIXED:" $fieldFix

Write-Host ""
Write-Host "======================================="
Write-Host "REPO SURGERY COMPLETE"
Write-Host "======================================="