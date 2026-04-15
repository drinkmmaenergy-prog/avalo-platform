from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path

REPO = Path(r"C:\a\avalo")
AUDIT = REPO / "audit-out"
BACKUP = AUDIT / f"phaseB-backend-cleanup-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
BACKUP.mkdir(parents=True, exist_ok=True)

ROOTS = [
    REPO / "functions/src",
    REPO / "functions/lib",
    REPO / "functions/tests",
]

EXTS = {".ts", ".tsx", ".js", ".jsx", ".md"}

SKIP_PARTS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "coverage",
    "audit-out",
    "functions/lib_backup",
}

REPLACEMENTS = [
    # Hard guarantee language
    (r'\bguaranteed earnings\b', 'reference earnings estimates'),
    (r'\bGuaranteed earnings\b', 'Reference earnings estimates'),

    # Direct split wording
    (r'\b65/35 split\b', 'reference earnings benchmark'),
    (r'\b70/30 split\b', 'reference earnings benchmark'),
    (r'\b80/20 split\b', 'reference earnings benchmark'),

    (r'\b65/35\b', 'reference benchmark'),
    (r'\b70/30\b', 'reference benchmark'),
    (r'\b80/20\b', 'reference benchmark'),

    # Explicit payout copy
    (r'platform keeps [^.:\n]*', 'platform economics may vary by active configuration'),
    (r'creator receives [^.:\n]*', 'creator earnings examples are reference only'),
    (r'you keep [^.:\n]*', 'creator earnings examples are reference only'),

    # Legacy comments
    (r'(?im)^(\s*//\s*).*65/35.*$', r'\1Reference only: creator earnings may vary under canonical economy rules.'),
    (r'(?im)^(\s*//\s*).*70/30.*$', r'\1Reference only: creator earnings may vary under canonical economy rules.'),
    (r'(?im)^(\s*//\s*).*80/20.*$', r'\1Reference only: creator earnings may vary under canonical economy rules.'),

    (r'(?im)^(\s*/\*\*?\s*).*65/35.*$', r'\1Reference only: creator earnings may vary under canonical economy rules.'),
    (r'(?im)^(\s*/\*\*?\s*).*70/30.*$', r'\1Reference only: creator earnings may vary under canonical economy rules.'),
    (r'(?im)^(\s*/\*\*?\s*).*80/20.*$', r'\1Reference only: creator earnings may vary under canonical economy rules.'),

    # Descriptive naming/comments
    (r'\brevenue split\b', 'reference earnings model'),
    (r'\bRevenue split\b', 'Reference earnings model'),
    (r'\bearning split\b', 'reference earnings model'),
    (r'\bEarning split\b', 'Reference earnings model'),
]

CANONICAL_HINTS = [
    "canonicalEconomy",
    "monetizationSplits",
    "economyConfig",
    "canonical economy",
]

def should_skip(path: Path) -> bool:
    return any(part in SKIP_PARTS for part in path.parts)

def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")

def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8", newline="\n")

def backup_file(path: Path) -> Path:
    dst = BACKUP / path.relative_to(REPO)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dst)
    return dst

def cleanup_text(text: str) -> str:
    out = text
    for pattern, repl in REPLACEMENTS:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE | re.MULTILINE)

    # Normalize repeated whitespace
    out = re.sub(r'[ \t]+\n', '\n', out)
    out = re.sub(r'\n{3,}', '\n\n', out)

    # Canonical source hint for files touching economy wording
    if any(h.lower() in out.lower() for h in CANONICAL_HINTS):
        pass

    return out

report = {
    "version": "phaseB-backend-cleanup",
    "roots": [str(x) for x in ROOTS],
    "backups": [],
    "changed": [],
    "scanned": [],
    "missing_roots": [],
}

for root in ROOTS:
    if not root.exists():
        report["missing_roots"].append(str(root))
        continue

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if should_skip(path):
            continue
        if path.suffix.lower() not in EXTS:
            continue

        report["scanned"].append(str(path))
        original = read_text(path)
        cleaned = cleanup_text(original)

        if cleaned != original:
            backup = backup_file(path)
            write_text(path, cleaned)
            report["backups"].append(str(backup))
            report["changed"].append(str(path))

out = AUDIT / "phaseB_backend_cleanup_report.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

print(json.dumps({
    "changed_count": len(report["changed"]),
    "scanned_count": len(report["scanned"]),
    "missing_roots": report["missing_roots"],
    "report": str(out)
}, ensure_ascii=False, indent=2))
