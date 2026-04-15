from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(r"C:\a\avalo")
AUDIT = REPO / "audit-out"

ROOTS = [
    REPO / "app-web",
    REPO / "app-mobile",
    REPO / "functions/src",
    REPO / "functions/lib",
    REPO / "functions/tests",
    REPO / "shared",
]

EXTS = {".ts", ".tsx", ".js", ".jsx", ".md", ".json"}

SKIP_PARTS = {
    ".git",
    "node_modules",
    ".next",
    "dist",
    "build",
    "coverage",
    "audit-out",
    "functions/lib_backup",
}

# Only these files may intentionally discuss canonical economy / split internals
ALLOWLIST = {
    str((REPO / "shared/config/canonicalEconomy.ts").resolve()).lower(),
    str((REPO / "functions/src/core/canonicalEconomy.ts").resolve()).lower(),
    str((REPO / "functions/src/config/monetizationSplits.ts").resolve()).lower(),
    str((REPO / "functions/src/config/economyConfig.ts").resolve()).lower(),
    str((REPO / "functions/src/config/aiEconomyConfig.ts").resolve()).lower(),
    str((REPO / "functions/src/config/liveMonetization.ts").resolve()).lower(),
    str((REPO / "functions/src/config/multiRoomConfig.ts").resolve()).lower(),
    str((REPO / "functions/src/config/payouts.config.ts").resolve()).lower(),
    str((REPO / "functions/src/config/monetization.ts").resolve()).lower(),
    str((REPO / "functions/lib/config/monetizationSplits.js").resolve()).lower(),
    str((REPO / "functions/lib/config/multiRoomConfig.js").resolve()).lower(),
    str((REPO / "app-mobile/config/monetization.js").resolve()).lower(),
}

STRING_PATTERNS = [
    r"\b65/35\b",
    r"\b70/30\b",
    r"\b80/20\b",
    r"\bcreator receives\b",
    r"\bplatform keeps\b",
    r"\bguaranteed earnings\b",
]

NUMERIC_PATTERNS = [
    r"(?<![\d])0\.65(?![\d])",
    r"(?<![\d])0\.70(?![\d])",
    r"(?<![\d])0\.80(?![\d])",
    r"(?<![\d])65\s*%",
    r"(?<![\d])70\s*%",
    r"(?<![\d])80\s*%",
]

ECONOMY_CONTEXT = [
    "split",
    "earner",
    "creator",
    "organizer",
    "platform",
    "commission",
    "payout",
    "earnings",
    "refund",
    "share",
    "monetization",
    "avalo",
    "hostearnings",
    "earnerreceives",
]

def should_skip(path: Path) -> bool:
    return any(part in SKIP_PARTS for part in path.parts)

hits = []

for root in ROOTS:
    if not root.exists():
        continue
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if should_skip(path):
            continue
        if path.suffix.lower() not in EXTS:
            continue

        abs_path = str(path.resolve()).lower()
        if abs_path in ALLOWLIST:
            continue

        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        for idx, line in enumerate(text.splitlines(), start=1):
            lower_line = line.lower()

            string_hit = False
            for p in STRING_PATTERNS:
                if re.search(p, line, flags=re.IGNORECASE):
                    hits.append({
                        "file": str(path),
                        "line": idx,
                        "match": line.strip(),
                        "pattern": p
                    })
                    string_hit = True

            if string_hit:
                continue

            has_context = any(token in lower_line for token in ECONOMY_CONTEXT)
            if not has_context:
                continue

            for p in NUMERIC_PATTERNS:
                if re.search(p, line, flags=re.IGNORECASE):
                    hits.append({
                        "file": str(path),
                        "line": idx,
                        "match": line.strip(),
                        "pattern": p
                    })

report = {
    "version": "phaseC-hard-enforcement-guard",
    "allowlist": sorted(ALLOWLIST),
    "hit_count": len(hits),
    "hits": hits,
}

out = AUDIT / "phaseC_hard_enforcement_report.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

print(json.dumps({
    "hit_count": len(hits),
    "report": str(out)
}, ensure_ascii=False, indent=2))

# non-zero exit on violations
if hits:
    sys.exit(1)


