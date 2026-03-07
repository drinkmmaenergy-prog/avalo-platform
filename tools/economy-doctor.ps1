
Write-Host "===== AVALO ECONOMY DOCTOR ====="

$root = "C:\a\avalo\functions\src"
$out = "C:\a\avalo\audit-out\ECONOMY_DOCTOR_REPORT.txt"

$report = @()

function Log($msg) {
    $report += $msg
    Write-Host $msg
}

function PatchFile($path,$pattern,$replacement) {

    if(!(Test-Path $path)){return}

    $c = Get-Content $path -Raw

    $new = [regex]::Replace($c,$pattern,$replacement)

    if($new -ne $c){
        Copy-Item $path "$path.bak"
        Set-Content $path $new
        Log "PATCHED: $path"
    }
}

# -------------------------------
# 1 CANONICAL WORD CONSTANTS
# -------------------------------

Log "Checking word/token constants"

Get-ChildItem $root -Recurse -Filter *.ts | ForEach-Object {

    $file = $_.FullName
    $content = Get-Content $file -Raw

    if($content -match "WORDS_PER_TOKEN_STANDARD"){
        Log "FOUND STANDARD WORD CONST: $file"
    }

    if($content -match "WORDS_PER_TOKEN_ROYAL"){
        Log "FOUND ROYAL WORD CONST: $file"
    }

}

# -------------------------------
# 2 FIX AI CHAT BILLING
# -------------------------------

Log "Fixing AI billing"

$ai = "$root\aiChatEngine.ts"

PatchFile $ai `
"Math\.round\(wordCount / chat\.billing\.wordsPerToken\)" `
"Math.ceil(wordCount / chat.billing.wordsPerToken)"

# -------------------------------
# 3 FORCE MIN ENTRY FEE
# -------------------------------

Log "Forcing minimum entry fee"

Get-ChildItem $root -Recurse -Filter *.ts | ForEach-Object {

    $path = $_.FullName
    $c = Get-Content $path -Raw

    if($c -match "MIN_DEPOSIT"){

        $c = $c -replace "MIN_DEPOSIT.*=.*","MIN_DEPOSIT = Math.max(customDeposit,100)"

        Set-Content $path $c

        Log "ENTRY FEE GUARD ADDED: $path"
    }

}

# -------------------------------
# 4 REMOVE LEGACY BILLING
# -------------------------------

Log "Neutralizing legacy billing engines"

$legacyFiles = @(
"$root\chatMonetization.ts",
"$root\pack273ChatEngine.ts",
"$root\pack430-economy-engine.ts",
"$root\chats.ts"
)

foreach($f in $legacyFiles){

    if(Test-Path $f){

        PatchFile $f `
        "processMessageBilling\(" `
        "shimProcessMessageBilling("

    }

}

# -------------------------------
# 5 SPLIT CHECK
# -------------------------------

Log "Scanning split configuration"

Select-String -Path "$root\*.ts" -Pattern "0\.65","0\.35","0\.70","0\.30" -Recurse |
ForEach-Object{

$line = "$($_.Path) :: $($_.LineNumber) :: $($_.Line)"
$report += $line

}

# -------------------------------
# 6 REPORT
# -------------------------------

$report | Out-File $out

Write-Host ""
Write-Host "ECONOMY DOCTOR FINISHED"
Write-Host "REPORT:"
Write-Host $out

