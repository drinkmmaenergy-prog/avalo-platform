$ErrorActionPreference="Stop"

$repo="C:\a\avalo"
$src="$repo\functions\src"

Write-Host "=== FIX FIREBASE REGIONS ==="

Get-ChildItem $src -Recurse -Filter *.ts | ForEach-Object {

    $path=$_.FullName
    $text=Get-Content $path -Raw

    # usuń błędny region
    $text=$text -replace "USDope-west1","europe-west1"

    # popraw region functions
    $text=$text -replace "functions\.region\('[^']+'\)","functions.region('europe-west1')"

    # popraw storage triggers
    $text=$text -replace "functions\.region\('europe-west1'\)\.storage","functions.region('eu').storage"

    Set-Content $path $text
}

Write-Host "[OK] regions fixed"

cd "$repo\functions"

npm run build

cd "$repo"

firebase deploy --only functions