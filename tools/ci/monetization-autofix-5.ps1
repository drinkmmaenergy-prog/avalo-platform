$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$file = "$repo\functions\src\pack302-types.ts"

Write-Host "=== monetization-autofix-5 ==="
Write-Host "Repairing CURRENCY_CONFIGS block"

$text = Get-Content $file -Raw

# usuwamy cały stary blok currency configs
$pattern = "export const CURRENCY_CONFIGS[\s\S]*?};"
$text = [regex]::Replace($text, $pattern, "")

# wstawiamy poprawny blok
$currencyBlock = @"

export const CURRENCY_CONFIGS: Record<string, {
  code: 'USD';
  symbol: '$';
  conversionRate: number;
}> = {
  USD: {
    code: 'USD',
    symbol: '$',
    conversionRate: 1
  }
};

"@

$text = $text + $currencyBlock

Set-Content $file $text

Write-Host "CURRENCY_CONFIGS fixed"

cd "$repo\functions"
npm run build