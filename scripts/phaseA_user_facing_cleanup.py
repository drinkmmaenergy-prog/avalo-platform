from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path

REPO = Path(r"C:\a\avalo")
AUDIT = REPO / "audit-out"
BACKUP = AUDIT / f"phaseA-user-facing-cleanup-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
BACKUP.mkdir(parents=True, exist_ok=True)

TARGETS = [
    REPO / "app-mobile/config/aiMonetization.ts",
    REPO / "app-mobile/config/subscriptions.ts",
    REPO / "app-mobile/services/aiVoiceService.ts",
    REPO / "app-mobile/services/chatPricingService.ts",
    REPO / "app-mobile/services/creatorOfferService.ts",
    REPO / "app-mobile/services/digitalProductService.ts",
    REPO / "app-mobile/services/loyalStreakService.ts",
    REPO / "app-mobile/services/messageBoostService.ts",
    REPO / "app-mobile/app/creator/partnership-campaigns.tsx",
    REPO / "app-mobile/app/ledger/index.tsx",
    REPO / "app-mobile/app/profile/earnings-taxes.tsx",
    REPO / "app-mobile/app/profile/ai-avatars/index.tsx",
    REPO / "app-mobile/app/profile/settings/language-region.tsx",
    REPO / "app-mobile/app/profile/vip/paywall.tsx",
    REPO / "app-web/src/app/help/page.tsx",
    REPO / "app-web/src/app/investor/dashboard/page.tsx",
    REPO / "app-web/src/lib/services/calendarService.ts",
    REPO / "app-web/src/lib/services/callService.ts",
    REPO / "app-web/src/lib/services/chatService.ts",
]

REPLACEMENTS = [
    (r'guaranteed earnings', 'reference earnings estimates'),
    (r'Guaranteed earnings', 'Reference earnings estimates'),

    (r'\b65/35 split\b', 'reference earnings benchmark'),
    (r'\b70/30 split\b', 'reference earnings benchmark'),
    (r'\b80/20 split\b', 'reference earnings benchmark'),

    (r'\b65/35\b', 'reference benchmark'),
    (r'\b70/30\b', 'reference benchmark'),
    (r'\b80/20\b', 'reference benchmark'),

    (r'all creators receive the same reference benchmark', 'creator earnings examples are reference only and may vary'),
    (r'All creators receive the same reference benchmark', 'Creator earnings examples are reference only and may vary'),

    (r'Business rule:\s*reference earnings benchmark\s*\([^)]+\)\s*for creator bot interactions\.', 'Reference only: creator earnings examples may vary by active pricing, VAT, fees, taxes and payout conditions.'),
    (r'Changed from reference benchmark to align with canonical AI economy config\.', 'Canonical economy is the source of truth. User-facing percentages are reference only and not guaranteed.'),
    (r'Previously was .*?reference benchmark.*?\.', 'Historical percentage commentary removed. Reference values are illustrative only.'),
    (r'New reference earnings benchmark increases Avalo\'s total take from .*?\.', 'Reference values may change based on pricing, taxes, VAT, fees and operational adjustments.'),

    (r'VIP/Royal discounts to drive subscriptions', 'Membership perks configured by active subscription settings'),
    (r'MEMBERSHIP DISCOUNTS \(drive VIP/Royal upgrades\)', 'MEMBERSHIP PERKS'),
    (r'VIP gets 50% discount on call pricing \(not AI chat billing\)', 'VIP may receive configured call pricing perks under the active subscription model'),
    (r'Royal users: 7 words = 1 token \(43% discount\)', 'Royal tier may receive configured usage perks under the active subscription model'),
    (r'Royal gets 50% discount on calls', 'Royal may receive configured call pricing perks under the active subscription model'),
    (r'No discount on AI chat word billing', 'AI chat billing follows the active canonical economy configuration'),
    (r'call discounts apply only to voice/video calls', 'call pricing perks apply only where enabled by the active subscription model'),
    (r'subscription split = reference benchmark', 'subscription examples are reference only and not guaranteed'),

    (r'creator gets [^.]*?\.', 'creator earnings examples are reference only and final payout may be lower.'),
    (r'platform keeps [^.]*?\.', 'platform economics may vary by active configuration, taxes, fees and operational adjustments.'),

    (r'revenue split', 'reference earnings model'),
    (r'Revenue split', 'Reference earnings model'),
]

def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")

def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8", newline="\n")

def cleanup_text(text: str) -> str:
    out = text

    for pattern, repl in REPLACEMENTS:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE)

    out = re.sub(r'[ \t]+\n', '\n', out)
    out = re.sub(r'\n{3,}', '\n\n', out)

    return out

report = {
    "version": "phaseA-user-facing-cleanup",
    "backups": [],
    "changed": [],
    "missing": [],
}

for path in TARGETS:
    if not path.exists():
        report["missing"].append(str(path))
        continue

    original = read_text(path)
    cleaned = cleanup_text(original)

    if cleaned != original:
        backup_path = BACKUP / path.relative_to(REPO)
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup_path)
        write_text(path, cleaned)
        report["backups"].append(str(backup_path))
        report["changed"].append(str(path))

(AUDIT / "phaseA_user_facing_cleanup_report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
    newline="\n"
)

print(json.dumps({
    "changed_count": len(report["changed"]),
    "missing_count": len(report["missing"]),
    "report": str(AUDIT / "phaseA_user_facing_cleanup_report.json")
}, ensure_ascii=False, indent=2))
