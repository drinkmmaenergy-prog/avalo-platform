$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$out  = "C:\a\avalo\audit-out\AVALO_MONETIZATION_EXPANSION_AUDIT.txt"

$keywords = @(
  "unlock",
  "locked",
  "blur",
  "paywall",
  "tip",
  "tips",
  "priority",
  "priority reply",
  "multi-chat",
  "multichat",
  "conversation tier",
  "conversation pool",
  "pool",
  "reels",
  "short video",
  "affiliate",
  "gamification",
  "live stream",
  "livestream",
  "video call",
  "voice call",
  "calendar",
  "event",
  "subscription",
  "drops",
  "digital product",
  "AI_COMPANIONS",
  "LIVE_STREAMS",
  "LIVE_VIP",
  "TIPS",
  "DIGITAL_PRODUCTS",
  "MARKETPLACE",
  "SPLITS_BY_SURFACE",
  "creatorSplit",
  "platformFee",
  "unlockPriceTokens",
  "entitledUserIds",
  "requiresAdultGate",
  "nsfw"
)

$files = Get-ChildItem $repo -Recurse -File | Where-Object {
  $_.Extension -in ".ts",".tsx",".js",".jsx" -and
  $_.FullName -notmatch "node_modules|dist|build|\.next|android|ios"
}

$lines = New-Object System.Collections.Generic.List[string]

$lines.Add("AVALO MONETIZATION EXPANSION AUDIT")
$lines.Add("ROOT: $repo")
$lines.Add("")

foreach ($file in $files) {
  $matches = Select-String -Path $file.FullName -Pattern $keywords -CaseSensitive:$false -SimpleMatch -ErrorAction SilentlyContinue
  foreach ($m in $matches) {
    $lineText = ""
    if ($null -ne $m.Line) { $lineText = $m.Line.Trim() }
    if (-not [string]::IsNullOrWhiteSpace($lineText)) {
      $lines.Add("FILE: $($m.Path)")
      $lines.Add("LINE: $($m.LineNumber)")
      $lines.Add("CODE: $lineText")
      $lines.Add("------------------------------------------------------------")
    }
  }
}

$lines | Set-Content $out -Encoding UTF8
Write-Host "WROTE: $out"
