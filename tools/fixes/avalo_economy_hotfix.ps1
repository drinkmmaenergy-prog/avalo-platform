$root="C:\a\avalo"
$src="$root\functions\src"

Write-Host "==========================="
Write-Host "AVALO ECONOMY HOTFIX START"
Write-Host "==========================="

# ---- SPLITS CONFIG ----

$configPath="$src\config\monetizationSplits.ts"

$config=@"
export const MONETIZATION_SPLITS = {

  CHAT: { creator: 0.65, avalo: 0.35 },
  CALL: { creator: 0.80, avalo: 0.20 },
  VIDEO_CALL: { creator: 0.80, avalo: 0.20 },

  TIPS: { creator: 0.90, avalo: 0.10 },

  SUBSCRIPTION: { creator: 0.70, avalo: 0.30 }

}
"@

$config | Set-Content $configPath -Encoding UTF8

Write-Host "✓ monetizationSplits.ts rebuilt"

# ---- FIELD NORMALIZATION ----

Get-ChildItem $src -Recurse -Include *.ts |
Where-Object { $_.FullName -notmatch "node_modules|dist|.next" } |
ForEach-Object {

$content = Get-Content $_.FullName -Raw

$content = $content.Replace("platformShare","avaloShare")
$content = $content.Replace("earnerShare","creatorShare")
$content = $content.Replace("split.platform","split.avalo")
$content = $content.Replace("split.earner","split.creator")

Set-Content $_.FullName $content -Encoding UTF8

}

Write-Host "✓ split fields normalized"

# ---- MIN DEPOSIT RULE ----

$types="$src\types\canonical-chat.types.ts"

if(Test-Path $types){

$c = Get-Content $types -Raw

if($c -notmatch "MIN_DEPOSIT_TOKENS"){
$c += "`nexport const MIN_DEPOSIT_TOKENS = 100"
}

Set-Content $types $c -Encoding UTF8

Write-Host "✓ MIN_DEPOSIT_TOKENS added"

}

Write-Host "==========================="
Write-Host "AVALO ECONOMY HOTFIX DONE"
Write-Host "==========================="

