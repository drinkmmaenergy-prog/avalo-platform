from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path

REPO = Path(r"C:\a\avalo")
AUDIT = REPO / "audit-out"
BACKUP = AUDIT / f"phaseC-final-sweep-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
BACKUP.mkdir(parents=True, exist_ok=True)

ROOTS = [
    REPO / "functions/src",
    REPO / "functions/lib",
]

EXTS = {".ts", ".js", ".md"}

SKIP_PARTS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "coverage",
    "audit-out",
    "lib_backup",
}

ECONOMY_CONTEXT = [
    "earner",
    "creator",
    "organizer",
    "platform",
    "payout",
    "earnings",
    "split",
    "commission",
    "refund",
    "share",
    "escrow",
    "monetization",
    "avalo",
    "hostearnings",
    "earnerreceives",
]

PERCENT_PATTERNS = [
    (r"65%", "up to reference earnings (not guaranteed)"),
    (r"70%", "up to reference earnings (not guaranteed)"),
    (r"80%", "up to reference earnings (not guaranteed)"),
]

PHRASE_REPLACEMENTS = [
    (r"creator gets", "creator may receive (up to, reference only)"),
    (r"organizer gets", "organizer may receive (up to, reference only)"),
    (r"earner gets", "earner may receive (up to, reference only)"),
    (r"creator earns", "creator may receive (up to, reference only)"),
    (r"organizer earns", "organizer may receive (up to, reference only)"),
    (r"earner earns", "earner may receive (up to, reference only)"),
    (r"platform keeps", "platform economics may vary under active configuration"),
    (r"creator receives", "creator may receive (up to, reference only)"),
    (r"organizer receives", "organizer may receive (up to, reference only)"),
    (r"earner receives", "earner may receive (up to, reference only)"),
]

def should_skip(path: Path) -> bool:
    return any(part in SKIP_PARTS for part in path.parts)

def backup_file(path: Path) -> Path:
    dst = BACKUP / path.relative_to(REPO)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dst)
    return dst

def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")

def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8", newline="\n")

report = {
    "version": "phaseC-final-sweep",
    "backups": [],
    "changed": [],
    "scanned": [],
}

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

        text = read_text(path)
        lines = text.splitlines()
        changed = False
        new_lines = []

        for line in lines:
            lower = line.lower()
            if any(token in lower for token in ECONOMY_CONTEXT):
                updated = line
                for old, new in PERCENT_PATTERNS:
                    updated = re.sub(old, new, updated, flags=re.IGNORECASE)
                for old, new in PHRASE_REPLACEMENTS:
                    updated = re.sub(old, new, updated, flags=re.IGNORECASE)
                if updated != line:
                    changed = True
                new_lines.append(updated)
            else:
                new_lines.append(line)

        new_text = "\n".join(new_lines)
        if text.endswith("\n"):
            new_text += "\n"

        report["scanned"].append(str(path))

        if changed:
            backup = backup_file(path)
            write_text(path, new_text)
            report["backups"].append(str(backup))
            report["changed"].append(str(path))

out = AUDIT / "phaseC_final_sweep_report.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

print(json.dumps({
    "changed_count": len(report["changed"]),
    "scanned_count": len(report["scanned"]),
    "report": str(out)
}, ensure_ascii=False, indent=2))
