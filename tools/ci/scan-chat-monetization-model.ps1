$root = "C:\a\avalo\functions\src"
$out  = "C:\a\avalo\audit-out"

New-Item -ItemType Directory -Force $out | Out-Null

function Write-Scan {
  param(
    [string]$Name,
    [string[]]$Patterns
  )

  $target = Join-Path $out $Name
  $files = Get-ChildItem $root -Recurse -File -Include *.ts,*.js

  $results = foreach($file in $files) {
    Select-String -Path $file.FullName -Pattern $Patterns -CaseSensitive:$false -SimpleMatch
  }

  if ($results) {
    $results | ForEach-Object {
      "FILE: $($_.Path)"
      "LINE: $($_.LineNumber)"
      "CODE: $($_.Line.Trim())"
      "------------------------------------------------------------"
    } | Set-Content $target -Encoding UTF8
  } else {
    "NO MATCHES" | Set-Content $target -Encoding UTF8
  }

  Write-Host "[OK] $target"
}

Write-Scan -Name "CHAT_WORD_MODEL_SCAN.txt" -Patterns @(
  "WORDS_PER_TOKEN_STANDARD",
  "WORDS_PER_TOKEN_ROYAL",
  "wordCount",
  "wordsPerToken",
  "tokensConsumed",
  "canonical-chat-engine",
  "processMessage"
)

Write-Scan -Name "CHAT_MULTIPLIER_SCAN.txt" -Patterns @(
  "burnMultiplier",
  "multiplier",
  "x2",
  "x3",
  "x5",
  "x7"
)

Write-Scan -Name "CHAT_ENTRY_SCAN.txt" -Patterns @(
  "MIN_DEPOSIT_TOKENS",
  "entryPrice",
  "chatPrice",
  "custom pricing",
  "requires",
  "100 tokens",
  "platformFeeChargedTokens",
  "escrowRemainingTokens"
)

Write-Scan -Name "LEGACY_MESSAGE_BILLING_SCAN.txt" -Patterns @(
  "messageCount",
  "Message 51",
  "FREE_B",
  "processMessageBilling",
  "per message",
  "70%",
  "0.7",
  "0.3"
)

Write-Host ""
Write-Host "DONE: audit-out scans generated"
