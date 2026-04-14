$ErrorActionPreference = "Stop"

$RepoRoot = "C:\a\avalo"
$OutDir   = Join-Path $RepoRoot "audit-out\canonical-cleanup"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "== AVALO CANONICAL AUDIT START ==" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"
Write-Host "Out : $OutDir"

# CANONICAL TRUTH
$Canonical = [ordered]@{
  currency = "USD"
  payout_fee_platform_percent_stripe_usd_only = 0.05
  token_payout_usd = 0.03
  token_packs = @(
    @{ name = "Mini 100"; usd = 9.99; tokens = 100 },
    @{ name = "Basic 300"; usd = 26.99; tokens = 300 },
    @{ name = "Standard 500"; usd = 42.99; tokens = 500 },
    @{ name = "Premium 1000"; usd = 76.99; tokens = 1000 },
    @{ name = "Pro 2000"; usd = 147.99; tokens = 2000 },
    @{ name = "Elite 5000"; usd = 353.99; tokens = 5000 },
    @{ name = "Royal 10000"; usd = 674.99; tokens = 10000 }
  )
  chat = [ordered]@{
    split_earner = 0.65
    split_platform = 0.35
    words_per_token_standard = 11
    words_per_token_royal = 7
    free_messages_standard = 9
    free_messages_royal = 5
    min_chat_charge_tokens = 100
    deposit_platform_fee_pct = 0.35
    deposit_escrow_pct = 0.65
    chat_expiry_hours = 48
    allowed_burn_multipliers = @(2,3,4,5,7,10,12,15,20)
  }
  calendar = [ordered]@{
    split_earner = 0.80
    split_platform = 0.20
    payment_model = "100_percent_escrow"
    cancellation = [ordered]@{
      gt_48h   = [ordered]@{ payer_refund_pct = 1.0; earner_payout_pct = 0.0 }
      h24_48h  = [ordered]@{ payer_refund_pct = 0.5; earner_payout_pct = 0.5 }
      lt_24h   = [ordered]@{ payer_refund_pct = 0.0; earner_payout_pct = 1.0 }
    }
    qr_one_valid_scan_starts_in_progress = $true
    gps_fallback_or_evidence_only = $true
    gps_not_continuous_tracking = $true
    gps_end_tolerance_minutes = 15
    mismatch_report_window = "immediate_or_few_minutes_only"
  }
  subscriptions = [ordered]@{
    split_earner = 0.70
    split_platform = 0.30
  }
  realtime_calls_video = [ordered]@{
    split_earner = 0.65
    split_platform = 0.35
  }
  tips = [ordered]@{
    split_earner = 0.65
    split_platform = 0.35
  }
}
$Canonical | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $OutDir "00-canonical-truth.json") -Encoding UTF8

# ROOTS
$PossibleRoots = @(
  "C:\a\avalo\functions\src",
  "C:\a\avalo\app-web\src",
  "C:\a\avalo\app-mobile",
  "C:\a\avalo\packages",
  "C:\a\avalo\shared",
  "C:\a\avalo\config"
)
$Roots = $PossibleRoots | Where-Object { Test-Path $_ }
$Roots | Set-Content (Join-Path $OutDir "01-scan-roots.txt") -Encoding UTF8

# FILE COLLECTION
$NameRegex = 'economy|monetization|pricing|price|token|wallet|ledger|refund|payout|withdraw|calendar|meeting|reservation|booking|event|call|video|qr|gps|checkin|dispute|verification|age|kyc|fraud|trust|bot|subscription|vip|royal|sponsored|ads|ai|auth|onboarding|profile|match|swipe|escrow'

$RelevantFiles = foreach ($Root in $Roots) {
  Get-ChildItem -Path $Root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -match '\.(ts|tsx|js|jsx|json|md|txt|rules|yml|yaml)$' } |
    Where-Object { $_.Name -match $NameRegex } |
    Select-Object -ExpandProperty FullName
}
$RelevantFiles = $RelevantFiles | Sort-Object -Unique
$RelevantFiles | Set-Content (Join-Path $OutDir "02-relevant-files.txt") -Encoding UTF8

# CRITICAL FILES DUMP
$Critical = @(
  "C:\a\avalo\functions\src\config\economyConfig.ts",
  "C:\a\avalo\functions\src\config\monetization.ts",
  "C:\a\avalo\functions\src\config\monetizationSplits.ts",
  "C:\a\avalo\functions\src\config\payouts.config.ts",
  "C:\a\avalo\functions\src\calendarEngine.ts",
  "C:\a\avalo\functions\src\calendar.ts",
  "C:\a\avalo\functions\src\callBilling.ts",
  "C:\a\avalo\functions\src\callMonetization.ts",
  "C:\a\avalo\functions\src\chatMonetization.ts",
  "C:\a\avalo\functions\src\dynamicChatPricing.ts",
  "C:\a\avalo\functions\src\disputeEngine.ts",
  "C:\a\avalo\functions\src\disputeCenter.ts",
  "C:\a\avalo\functions\src\fraudEngine.ts",
  "C:\a\avalo\functions\src\deviceTrust.ts",
  "C:\a\avalo\functions\src\kyc.ts",
  "C:\a\avalo\functions\src\pack277-token-packs.ts",
  "C:\a\avalo\functions\src\pack277-wallet-service.ts",
  "C:\a\avalo\functions\src\pack278-subscription-service.ts",
  "C:\a\avalo\functions\src\pack261-payout-service.ts",
  "C:\a\avalo\functions\src\pack209-events-refund.ts",
  "C:\a\avalo\functions\src\pack209-refund-complaint-engine.ts",
  "C:\a\avalo\app-web\src\lib\economyConfig.ts",
  "C:\a\avalo\app-web\src\config\monetizationSplits.ts",
  "C:\a\avalo\app-web\src\constants\monetization.ts",
  "C:\a\avalo\app-web\src\lib\services\tokenService.ts",
  "C:\a\avalo\app-web\src\lib\services\calendarService.ts",
  "C:\a\avalo\app-web\src\lib\services\callService.ts",
  "C:\a\avalo\app-web\src\lib\services\eventService.ts",
  "C:\a\avalo\app-web\src\app\wallet\buy\page.tsx",
  "C:\a\avalo\app-web\src\components\TokenPackCard.tsx",
  "C:\a\avalo\app-web\src\components\wallet\TokenPurchaseModal.tsx"
)

$DumpPath = Join-Path $OutDir "03-critical-files-dump.txt"
if (Test-Path $DumpPath) { Remove-Item $DumpPath -Force }

foreach ($File in $Critical) {
  if (Test-Path $File) {
    "===== $File =====" | Add-Content $DumpPath -Encoding UTF8
    Get-Content $File | Add-Content $DumpPath -Encoding UTF8
    "" | Add-Content $DumpPath -Encoding UTF8
  }
}

# KEYWORD HITS
$Terms = @(
  "TOKEN_PAYOUT_USD",
  "PAYOUT_FEE_PLATFORM_PERCENT",
  "PLATFORM_LAYOUT_FEE",
  "TOKEN_PAYOUT_PLN",
  "USD_TO_EUR",
  "USD_TO_PLN",
  "PayPal",
  "Revolut",
  "crypto",
  "EUR",
  "PLN",
  "escrow",
  "refund",
  "mismatch",
  "MATERIAL_PROFILE_MISMATCH",
  "QR",
  "gps",
  "IN_PROGRESS",
  "COMPLETED",
  "WAITING",
  "MIN_CHAT_CHARGE_TOKENS",
  "wordsPerToken",
  "WORDS_PER_TOKEN",
  "FREE_MESSAGES_COUNT",
  "freeMessagesPerUser",
  "MESSAGE_COST",
  "Mini 100",
  "Basic 300",
  "Standard 500",
  "Premium 1000",
  "Pro 2000",
  "Elite 5000",
  "Royal 10000",
  "Starter 50",
  "Popular",
  "Value",
  "9.99",
  "26.99",
  "42.99",
  "76.99",
  "147.99",
  "353.99",
  "674.99",
  "4.99",
  "14.99",
  "29.99",
  "49.99",
  "3 free",
  "4 free",
  "48h",
  "24h",
  "15 min",
  "15 minutes",
  "100% escrow"
)

$HitsPath = Join-Path $OutDir "04-keyword-hits.txt"
if (Test-Path $HitsPath) { Remove-Item $HitsPath -Force }

foreach ($File in $RelevantFiles) {
  foreach ($Term in $Terms) {
    Select-String -Path $File -Pattern $Term -SimpleMatch -ErrorAction SilentlyContinue |
      ForEach-Object {
        "$($_.Path):$($_.LineNumber): $($_.Line)"
      } | Add-Content $HitsPath -Encoding UTF8
  }
}

# LEGACY CANDIDATES
$LegacyCandidates = @()

foreach ($File in $RelevantFiles) {
  $Text = [System.IO.File]::ReadAllText($File)
  if (-not $Text) { continue }

  $Reasons = @()

  if ($Text -match "Starter 50|Popular|Value") { $Reasons += "OLD_TOKEN_PACKS" }
  if ($Text -match "MESSAGE_COST:\s*10|FREE_MESSAGES_COUNT:\s*3") { $Reasons += "OLD_MESSAGE_BASED_CHAT" }
  if ($Text -match "PayPal|Revolut|crypto|TOKEN_TO_EUR_RATE|TOKEN_PAYOUT_PLN|USD_TO_EUR|USD_TO_PLN") { $Reasons += "OLD_OR_NON_CANONICAL_PAYOUT_CURRENCY_LOGIC" }
  if ($Text -match "CREATOR_SPLIT:\s*MONETIZATION_SPLITS\.EVENT_TICKET\.earner|AVALO_CUT:\s*MONETIZATION_SPLITS\.EVENT_TICKET\.platform") { $Reasons += "CHAT_USING_EVENT_SPLIT" }
  if ($Text -match "AVALO_CUT_PERCENT:\s*20|EARNER_CUT_PERCENT:\s*80") { $Reasons += "CALLS_80_20_CONFLICT" }
  if ($Text -match "0\.75|0\.25|75%|25%") { $Reasons += "OLD_75_25_CALENDAR_CONFLICT" }

  if ($Reasons.Count -gt 0) {
    $LegacyCandidates += [pscustomobject]@{
      file = $File
      reasons = ($Reasons -join ",")
    }
  }
}

$LegacyCandidates | Sort-Object file | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $OutDir "05-legacy-cleanup-candidates.json") -Encoding UTF8

# USAGE
$Needles = @(
  "config/monetization",
  "monetization.ts",
  "config/payout",
  "payouts.config",
  "TOKEN_PAYOUT_PLN",
  "MESSAGE_COST",
  "FREE_MESSAGES_COUNT",
  "EVENT_TICKET.earner",
  "EVENT_TICKET.platform"
)

$UsagePath = Join-Path $OutDir "06-import-and-usage.txt"
if (Test-Path $UsagePath) { Remove-Item $UsagePath -Force }

foreach ($File in $RelevantFiles) {
  foreach ($Needle in $Needles) {
    Select-String -Path $File -Pattern $Needle -SimpleMatch -ErrorAction SilentlyContinue |
      ForEach-Object {
        "$($_.Path):$($_.LineNumber): $($_.Line)"
      } | Add-Content $UsagePath -Encoding UTF8
  }
}

# PLAN
$PlanLines = @(
  "DELETE / REPLACE PLAN",
  "",
  "1. KEEP AS CANONICAL:",
  "   - functions/src/config/monetizationSplits.ts",
  "   - functions/src/config/economyConfig.ts (but fix conflicts listed below)",
  "",
  "2. FIX IMMEDIATELY:",
  "   - functions/src/config/monetization.ts",
  "     * EARN_TO_CHAT_CONFIG must use CHAT split, not EVENT_TICKET split",
  "     * CALL_CONFIG must be 65/35, not 80/20",
  "     * TIPS_CONFIG must be 65/35, not EVENT_TICKET split",
  "",
  "3. REMOVE / NEUTRALIZE LEGACY:",
  "   - any Starter/Popular/Value token pack tables",
  "   - any message-cost based 3-free-message monetization",
  "   - any EUR / PLN / PayPal / Revolut / crypto payout authority logic",
  "   - any 75/25 calendar/events logic",
  "   - any old 80/20 chat/call/tip logic",
  "",
  "4. REVIEW MANUALLY:",
  "   - PLATFORM_LAYOUT_FEE constant name/value conflict",
  "   - BURN_MULTIPLIERS includes 1 but business canonical starts at 2",
  "   - payout display FX constants should not act as business authority",
  "   - calendar cancellation engine may still contain stale non-canonical rules"
)
$PlanLines | Set-Content (Join-Path $OutDir "07-delete-replace-plan.txt") -Encoding UTF8

Write-Host "== DONE ==" -ForegroundColor Green
Write-Host "OutDir: $OutDir" -ForegroundColor Yellow
