param(
  [string]$RepoRoot = "C:\a\avalo",
  [string]$OutDir = "C:\a\avalo\audit-out"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$patterns = @(
  "TOKEN_PAYOUT_USD",
  "payout",
  "LAYOUT_FEE",
  "layoutFee",
  "platformFee",
  "creatorShare",
  "platformShare",
  "split",
  "tokensPerWord",
  "wordCount",
  "MIN_CHAT_CHARGE",
  "refund",
  "wallet",
  "ledger",
  "stripe",
  "webhook",
  "subscription",
  "premium",
  "vip",
  "royal",
  "boost",
  "unlock",
  "tip"
)

$outFile = Join-Path $OutDir "ECONOMY_SCAN.txt"

"===== AVALO ECONOMY SCAN =====" | Out-File $outFile -Encoding UTF8
"Repo: $RepoRoot" | Out-File $outFile -Append -Encoding UTF8
"Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $outFile -Append -Encoding UTF8
"" | Out-File $outFile -Append -Encoding UTF8

foreach ($pattern in $patterns) {
  "---- SEARCH: $pattern ----" | Out-File $outFile -Append -Encoding UTF8
  Get-ChildItem -Path $RepoRoot -Recurse -Include *.ts,*.tsx,*.js -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "\\node_modules\\|\\\.next\\|\\dist\\|\\build\\" } |
    Select-String -Pattern $pattern -ErrorAction SilentlyContinue |
    ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" } |
    Out-File $outFile -Append -Encoding UTF8
  "" | Out-File $outFile -Append -Encoding UTF8
}

"SCAN COMPLETE" | Out-File $outFile -Append -Encoding UTF8
Write-Host "ECONOMY SCAN COMPLETE -> $outFile"
