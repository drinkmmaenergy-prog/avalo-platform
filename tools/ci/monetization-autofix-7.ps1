$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$file = "$repo\functions\src\pack106-types.ts"

Write-Host "=== monetization-autofix-7 ==="

$text = Get-Content $file -Raw

# add admin2 to approvals
$text = $text -replace "admin1\?: string;","admin1?: string;`n    admin2?: string;"

# fix fxVarianceWarnings type
$text = $text -replace "fxVarianceWarnings\?: number;","fxVarianceWarnings?: { currency:string; expectedRate:number; actualRate:number; variance:number }[];"

Set-Content $file $text

Write-Host "PACK106 types fixed"

cd "$repo\functions"

npm run build