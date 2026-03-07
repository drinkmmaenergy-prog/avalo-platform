$ErrorActionPreference = "Stop"

$repo = "C:\a\avalo"
$functions = "$repo\functions\src"

New-Item -ItemType Directory -Force "$functions\config" | Out-Null
New-Item -ItemType Directory -Force "$functions\economy" | Out-Null

# -----------------------------------------------------
# 1. MONETIZATION SPLITS CONFIG
# -----------------------------------------------------

$splitFile = "$functions\config\monetizationSplits.ts"

@"
export type MonetizationSurface =
  | "CHAT"
  | "CALL"
  | "VIDEO_CALL"
  | "TIPS"
  | "UNLOCK_MEDIA"
  | "LIVE_GIFTS"
  | "EVENT_TICKET"
  | "CALENDAR_MEETING"
  | "SUBSCRIPTION";

export interface MonetizationSplit {
  creator: number;
  avalo: number;
}

export const MONETIZATION_SPLITS: Record<MonetizationSurface, MonetizationSplit> = {
  CHAT: { creator: 0.65, avalo: 0.35 },
  CALL: { creator: 0.65, avalo: 0.35 },
  VIDEO_CALL: { creator: 0.65, avalo: 0.35 },
  TIPS: { creator: 0.65, avalo: 0.35 },
  UNLOCK_MEDIA: { creator: 0.65, avalo: 0.35 },
  LIVE_GIFTS: { creator: 0.65, avalo: 0.35 },

  EVENT_TICKET: { creator: 0.80, avalo: 0.20 },
  CALENDAR_MEETING: { creator: 0.80, avalo: 0.20 },

  SUBSCRIPTION: { creator: 0.70, avalo: 0.30 }
};
"@ | Set-Content $splitFile -Encoding UTF8

Write-Host "Created monetizationSplits.ts"

# -----------------------------------------------------
# 2. MONETIZATION ENGINE
# -----------------------------------------------------

$engineFile = "$functions\economy\monetizationEngine.ts"

@"
import { MONETIZATION_SPLITS, MonetizationSurface } from "../config/monetizationSplits";

export interface MonetizationResult {
  creatorAmount: number;
  avaloAmount: number;
}

export function splitTokens(
  surface: MonetizationSurface,
  totalTokens: number
): MonetizationResult {

  const split = MONETIZATION_SPLITS[surface];

  const creatorAmount = Math.floor(totalTokens * split.creator);
  const avaloAmount = totalTokens - creatorAmount;

  return {
    creatorAmount,
    avaloAmount
  };
}
"@ | Set-Content $engineFile -Encoding UTF8

Write-Host "Created monetizationEngine.ts"

# -----------------------------------------------------
# 3. REPLACE HARD-CODED SPLITS
# -----------------------------------------------------

$files = Get-ChildItem $repo -Recurse -Include *.ts,*.tsx |
Where-Object { $_.FullName -notmatch "node_modules|dist|build|\.next" }

foreach ($file in $files) {

$content = Get-Content -LiteralPath $file.FullName -Raw
$updated = $content `
-replace "0\.65", "MONETIZATION_SPLITS.CHAT.creator" `
-replace "0\.35", "MONETIZATION_SPLITS.CHAT.avalo" `
-replace "0\.80", "MONETIZATION_SPLITS.EVENT_TICKET.creator" `
-replace "0\.20", "MONETIZATION_SPLITS.EVENT_TICKET.avalo" `
-replace "0\.70", "MONETIZATION_SPLITS.SUBSCRIPTION.creator" `
-replace "0\.30", "MONETIZATION_SPLITS.SUBSCRIPTION.avalo"

if ($updated -ne $content) {
Set-Content -LiteralPath $file.FullName $updated -Encoding UTF8
}

}

Write-Host "Replaced hardcoded splits"

# -----------------------------------------------------
# 4. FREEZE LEGACY BILLING ENGINES
# -----------------------------------------------------

$legacyFiles = @(
"$functions\chatMonetization.ts",
"$functions\pack273ChatEngine.ts",
"$functions\pack430-economy-engine.ts"
)

foreach ($file in $legacyFiles) {

if (Test-Path $file) {

$content = Get-Content $file -Raw

$freeze = @"
/*
LEGACY BILLING ENGINE
DO NOT USE
CANONICAL ENGINE: monetizationEngine.ts
*/
"@

Set-Content $file ($freeze + $content)

}

}

Write-Host "Legacy engines frozen"

# -----------------------------------------------------
# 5. CREATE MULTI CHAT ROOM MODULE
# -----------------------------------------------------

$multiChatFile = "$functions\chat\multiChatRoom.ts"
New-Item -ItemType Directory -Force "$functions\chat" | Out-Null

@"
export interface MultiChatRoom {
  id: string
  creatorId: string
  entryFeeTokens: number
  maxParticipants: number
  participants: string[]
  createdAt: number
}
"@ | Set-Content -LiteralPath $file.FullName $updated -Encoding UTF8
Write-Host "Created multiChatRoom module"

Write-Host "AVALO MONETIZATION AUTO FIX COMPLETE"
