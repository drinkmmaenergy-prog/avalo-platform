param(
  [string]$RepoRoot = "C:\a\avalo",
  [string]$OutMd = "C:\a\avalo\CHAT_BILLING_AUDIT.md"
)

$ErrorActionPreference = "Stop"

$ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$patterns = @(
  "wordCount",
  "tokensPerWord",
  "MIN_CHAT_CHARGE",
  "minChatCharge",
  "chargedTokens",
  "theoreticalCost",
  "refund",
  "conversation_pool",
  "conversationPool",
  "platformFee",
  "creatorShare",
  "ledger",
  "idempotency"
)

$hits = @()
Get-ChildItem -Path $RepoRoot -Recurse -Include *.ts,*.tsx,*.js -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\node_modules\\|\\\.next\\|\\dist\\|\\build\\" } |
  ForEach-Object {
    $file = $_.FullName
    foreach ($p in $patterns) {
      $m = Select-String -Path $file -Pattern $p -AllMatches -ErrorAction SilentlyContinue
      if ($m) {
        foreach ($mm in $m) {
          $hits += [PSCustomObject]@{
            file = $mm.Path
            line = $mm.LineNumber
            text = $mm.Line.Trim()
            pat  = $p
          }
        }
      }
    }
  }

@"
# Avalo — Chat Billing Audit (AUTO)

Generated: $ts  
Repo: $RepoRoot

## Scope (must verify in code)
- Count **only creator words**
- Charge: `chargedTokens = max(MIN_CHAT_CHARGE_TOKENS, computedCost)`
- Fee capture upfront is **non-refundable**
- Refund returns only **unused conversation pool**
- Ledger must be double-entry + idempotent

## Raw hits (triage)
Total hits: $($hits.Count)

"@ | Set-Content -Encoding UTF8 $OutMd

$hits |
  Sort-Object file,line |
  ForEach-Object {
    "- **$($_.pat)** `[$($_.file):$($_.line)]`  `$(($_.text -replace "`r|`n"," ").Trim())`"
  } | Add-Content -Encoding UTF8 $OutMd

Write-Host "WROTE: $OutMd"
