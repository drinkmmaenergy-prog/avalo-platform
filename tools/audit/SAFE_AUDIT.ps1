param(
    [string]$Root = "C:\a\avalo"
)

$Out = "$Root\audit-out"
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$exclude = "node_modules|\.next|dist|build|coverage|\.git|android\.gradle|ios/Pods"

function Scan($file,$pattern){

Get-ChildItem $Root -Recurse -File |
Where-Object { $_.FullName -notmatch $exclude } |
Select-String $pattern |
Select-Object -First 1000 |
Out-File "$Out\$file"

}

Write-Host "SAFE AUDIT START"

Scan "split_scan.txt" "65|35|70|30|80|20"
Scan "chat_scan.txt" "wordsPerToken|wordCount|chatCost"
Scan "earn_scan.txt" "earn_on|earner|payer"
Scan "wallet_scan.txt" "wallet|token|stripe"
Scan "escrow_scan.txt" "entryFee|escrow|deposit"

Write-Host "SAFE AUDIT DONE"
