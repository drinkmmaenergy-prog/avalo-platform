$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$file = "$repo\functions\src\pack302-types.ts"

Write-Host "=== monetization-autofix-6 ==="
Write-Host "Rebuilding currency section"

$text = Get-Content $file -Raw

# usuń wszystko od REGION_DEFAULT_CURRENCY do końca pliku
$pattern = "export const REGION_DEFAULT_CURRENCY[\s\S]*$"
$text = [regex]::Replace($text,$pattern,"")

# poprawna sekcja currency
$currency = @"

export const REGION_DEFAULT_CURRENCY: Record<string,string> = {
  'pl-PL': 'USD',
  'en-US': 'USD',
  'en-GB': 'USD',
  'de-DE': 'USD',
  'fr-FR': 'USD',
  'es-ES': 'USD',
  'it-IT': 'USD'
};

export const CURRENCY_CONFIGS: Record<string,{
  code:'USD',
  symbol:'$',
  conversionRate:number
}> = {
  USD:{
    code:'USD',
    symbol:'$',
    conversionRate:1
  }
};
"@

$text = $text.TrimEnd() + "`r`n" + $currency

Set-Content $file $text

Write-Host "Currency block rebuilt"

cd "$repo\functions"

Write-Host "Running build..."
npm run build