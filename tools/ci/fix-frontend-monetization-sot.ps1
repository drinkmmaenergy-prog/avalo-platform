$ErrorActionPreference = "Stop"

$web = "C:\a\avalo\app-web\src"

New-Item -ItemType Directory -Force "$web\config" | Out-Null
New-Item -ItemType Directory -Force "$web\constants" | Out-Null

# 1) Kanoniczny frontendowy SoT
@"
export const MONETIZATION_SPLITS = {
  CHAT: { creator: 0.65, avalo: 0.35 },
  CALL: { creator: 0.65, avalo: 0.35 },
  VIDEO_CALL: { creator: 0.65, avalo: 0.35 },
  TIPS: { creator: 0.65, avalo: 0.35 },
  UNLOCK_MEDIA: { creator: 0.65, avalo: 0.35 },
  LIVE_GIFTS: { creator: 0.65, avalo: 0.35 },

  EVENT_TICKET: { creator: 0.80, avalo: 0.20 },
  CALENDAR_MEETING: { creator: 0.80, avalo: 0.20 },

  SUBSCRIPTION: { creator: 0.70, avalo: 0.30 }
} as const;
"@ | Set-Content -LiteralPath "$web\config\monetizationSplits.ts" -Encoding UTF8

# 2) Kompatybilny re-export dla importów @constants/monetization
@"
export { MONETIZATION_SPLITS } from "../config/monetizationSplits";
"@ | Set-Content -LiteralPath "$web\constants\monetization.ts" -Encoding UTF8

Write-Host "Frontend monetization SoT normalized."
