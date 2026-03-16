$ErrorActionPreference="Stop"

$root="C:\a\avalo\functions\src"

function WriteFile($path,$content){
$dir=Split-Path $path -Parent
if(!(Test-Path $dir)){New-Item -ItemType Directory -Force -Path $dir | Out-Null}
Set-Content $path $content -Encoding UTF8
}

Write-Host "================================="
Write-Host "AVALO ECONOMY CANONICAL FIX START"
Write-Host "================================="

# ------------------------------------------------
# canonical earning source
# ------------------------------------------------

WriteFile "$root\types\earningSourceType.ts" @"
export type EarningSourceType =
| 'CHAT'
| 'TIP'
| 'CALL'
| 'VIDEO_CALL'
| 'SUBSCRIPTION'
| 'UNLOCK_MEDIA'
| 'LIVE_GIFT'
| 'AI_COMPANION'
| 'EVENT_TICKET'
| 'CALENDAR_MEETING'
| 'OTHER'
"@

# ------------------------------------------------
# creatorAnalytics compatibility
# ------------------------------------------------

$ca="$root\creatorAnalytics.ts"

if(Test-Path $ca){

$c=Get-Content $ca -Raw

$c=$c.Replace(
"Record<EarningSourceType, string>",
"Record<string,string>"
)

$c=$c.Replace(
"type: EarningSourceType;",
"type: string;"
)

Set-Content $ca $c -Encoding UTF8
}

# ------------------------------------------------
# pack114 destructure fix
# ------------------------------------------------

$p114="$root\pack114-earnings-integration.ts"

if(Test-Path $p114){

$c=Get-Content $p114 -Raw

$c=$c.Replace(
"sourceType: sourceType as any",
"sourceType"
)

Set-Content $p114 $c -Encoding UTF8
}

# ------------------------------------------------
# monetizationEngine type fix
# ------------------------------------------------

$me="$root\economy\monetizationEngine.ts"

if(Test-Path $me){

$c=Get-Content $me -Raw

if(!$c.Contains("type MonetizationSurface")){

$inject=@"

export type MonetizationSurface =
| 'CHAT'
| 'CALL'
| 'VIDEO_CALL'
| 'TIP'
| 'UNLOCK_MEDIA'
| 'LIVE_GIFT'
| 'EVENT_TICKET'
| 'CALENDAR_MEETING'
| 'SUBSCRIPTION'

export type MonetizationResult={
creatorTokens:number
avaloTokens:number
total:number
}

"@

$c=$inject+$c
}

Set-Content $me $c -Encoding UTF8
}

# ------------------------------------------------
# treasury compatibility
# ------------------------------------------------

$tre="$root\treasury.ts"

if(Test-Path $tre){

$c=Get-Content $tre -Raw

$c=$c.Replace("earnerAmount","creatorAmount")
$c=$c.Replace("platformAmount","avaloAmount")

Set-Content $tre $c -Encoding UTF8
}

# ------------------------------------------------
# wallet compatibility
# ------------------------------------------------

$wallet="$root\wallet"

if(Test-Path $wallet){

Get-ChildItem $wallet -Recurse -Filter *.ts | ForEach-Object {

$c=Get-Content $_.FullName -Raw

$c=$c.Replace("earnerTokens","creatorTokens")
$c=$c.Replace("platformTokens","avaloTokens")

Set-Content $_.FullName $c -Encoding UTF8

}

}

Write-Host "================================="
Write-Host "AVALO ECONOMY CANONICAL FIX DONE"
Write-Host "================================="