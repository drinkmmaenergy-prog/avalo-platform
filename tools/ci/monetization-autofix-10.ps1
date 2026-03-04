$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$functions = "$repo\functions\src"

Write-Host "=== monetization-autofix-10 ==="
Write-Host "Fixing Storage trigger region mismatch"

Get-ChildItem $functions -Recurse -Filter *.ts | ForEach-Object {

    $path = $_.FullName
    $text = Get-Content $path -Raw

    # change region for storage triggers
    $text = $text -replace "region\('europe-west1'\)\.storage", "region('eu').storage"
    $text = $text -replace "region\('us-central1'\)\.storage", "region('eu').storage"
    $text = $text -replace "functions\.region\('europe-west1'\)\.storage", "functions.region('eu').storage"

    Set-Content $path $text
}

Write-Host "[OK] Storage triggers region fixed"

cd "$repo\functions"

npm run build
firebase deploy --only functions