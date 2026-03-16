Write-Host "AVALO MASTER AUDIT START"

$root = "C:\a\avalo"
$out = "$root\audit-out"

New-Item -ItemType Directory -Force -Path $out | Out-Null

Write-Host "Scanning repo tree..."
tree $root /F > "$out\repo_tree.txt"

Write-Host "Scanning monetization splits..."
Get-ChildItem $root -Recurse -File | Select-String "65|35|70|30|80|20" > "$out\split_scan.txt"

Write-Host "Scanning chat billing..."
Get-ChildItem $root -Recurse -File | Select-String "wordsPerToken|wordCount|chatCost|billing|tokenCost" > "$out\chat_billing_scan.txt"

Write-Host "Scanning escrow..."
Get-ChildItem $root -Recurse -File | Select-String "entryFee|deposit|escrow|refund|release" > "$out\escrow_scan.txt"

Write-Host "Scanning earn system..."
Get-ChildItem $root -Recurse -File | Select-String "earn_on|earner|payer|earning|eligibility" > "$out\earn_system_scan.txt"

Write-Host "Scanning wallet..."
Get-ChildItem $root -Recurse -File | Select-String "wallet|token|balance|payout|stripe" > "$out\wallet_scan.txt"

Write-Host "Scanning calls..."
Get-ChildItem $root -Recurse -File | Select-String "call|videoCall|rtc|webrtc" > "$out\calls_scan.txt"

Write-Host "Scanning feed..."
Get-ChildItem $root -Recurse -File | Select-String "feed|reels|discover|swipe" > "$out\feed_scan.txt"

Write-Host "Scanning AI..."
Get-ChildItem $root -Recurse -File | Select-String "ai|assistant|companion|model" > "$out\ai_scan.txt"

Write-Host "Audit completed"
