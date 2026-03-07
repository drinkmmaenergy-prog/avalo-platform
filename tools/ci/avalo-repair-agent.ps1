param(
[string]$Repo="C:\a\avalo"
)

Write-Host "===== AVALO REPAIR AGENT START ====="

$functions="$Repo\functions"
$src="$functions\src"

# ---------------------------------------------------
# FIX 1 IMPORTY init.js -> init
# ---------------------------------------------------

Write-Host "Fixing .js imports..."

Get-ChildItem $src -Recurse -Filter *.ts | ForEach-Object {

$content = Get-Content $_.FullName -Raw

$new = $content `
-replace "\.\/init\.js","./init" `
-replace "\.\/runtime\.js","./runtime" `
-replace "\.\/firebase\.js","./firebase" `
-replace "\.\/types\.js","./types"

if($new -ne $content){
Set-Content $_.FullName $new
Write-Host "patched:" $_.Name
}

}

# ---------------------------------------------------
# FIX 2 TOKEN_PAYOUT_PLN
# ---------------------------------------------------

$econ="$src\config\economyConfig.ts"

if(Test-Path $econ){

$txt=Get-Content $econ -Raw

if($txt -notmatch "TOKEN_PAYOUT_PLN"){

Add-Content $econ "`nexport const TOKEN_PAYOUT_PLN = TOKEN_PAYOUT_USD * 4.0;"

Write-Host "Added TOKEN_PAYOUT_PLN"

}

}

# ---------------------------------------------------
# FIX 3 JEST UUID
# ---------------------------------------------------

$jest="$functions\jest.config.js"

if(Test-Path $jest){

$j=Get-Content $jest -Raw

if($j -notmatch "uuid"){

$j=$j -replace "module.exports = {","module.exports = {`n transformIgnorePatterns: ['node_modules/(?!uuid)/'],"

Set-Content $jest $j

Write-Host "Patched jest uuid"

}

}

# ---------------------------------------------------
# BUILD
# ---------------------------------------------------

Write-Host "Building functions..."

Set-Location $functions

npm run build

# ---------------------------------------------------
# TEST
# ---------------------------------------------------

Write-Host "Running tests..."

npm test -- --runInBand

Write-Host "===== AVALO REPAIR AGENT END ====="
