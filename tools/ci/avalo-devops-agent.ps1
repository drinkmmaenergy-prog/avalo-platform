Write-Host "STEP 2 — DETECT CHANGED FUNCTIONS"

cd $repo

$changed = git diff --name-only HEAD | Select-String "functions/src"

if ($changed) {

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

Write-Host "No function changes detected"

}