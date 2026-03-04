Write-Host "STEP 2 — DETECT CHANGED FUNCTIONS"

cd $repo

$changed = git diff --name-only HEAD~1 HEAD 2>$null | Select-String "functions/src"
if ($changed) {
if (-not $changed) {
$changed = git ls-files "functions/src/*.ts"
}
Write-Host "Changed files detected"

$functionsList=@()

foreach ($file in $changed) {

$name = $file -replace "functions/src/",""
$name = $name -replace ".ts",""

$functionsList += $name

}

$uniqueFunctions=$functionsList | Sort-Object -Unique

$batchSize=20
$batches = [System.Collections.ArrayList]@()

for ($i=0; $i -lt $uniqueFunctions.Count; $i+=$batchSize) {

$batch=$uniqueFunctions[$i..([Math]::Min($i+$batchSize-1,$uniqueFunctions.Count-1))]
$batches.Add($batch) | Out-Null

}

foreach ($batch in $batches) {

$deployList=""

foreach ($fn in $batch) {

$deployList+="functions:$fn,"

}

$deployList=$deployList.TrimEnd(",")

Write-Host "Deploy batch:" $deployList

firebase deploy --only $deployList

}

} else {

Write-Host "STEP 2 — DETECT CHANGED FUNCTIONS"

cd $repo

# Detect changed files between last two commits
$changed = git diff --name-only HEAD~1 HEAD 2>$null

if (-not $changed) {
    Write-Host "No git diff detected, scanning full functions folder"
    $changed = Get-ChildItem "$repo\functions\src" -Recurse -Filter *.ts | Select-Object -ExpandProperty FullName
}

$functionsList=@()

foreach ($file in $changed) {

if ($file -match "functions[\\/]+src") {

$name = $file -replace ".*functions[\\/]+src[\\/]+",""
$name = $name -replace ".ts",""

$functionsList += $name

}

}

if ($functionsList.Count -eq 0) {

Write-Host "No function changes detected"
return

}

$uniqueFunctions=$functionsList | Sort-Object -Unique

Write-Host "Changed functions:"
$uniqueFunctions

}