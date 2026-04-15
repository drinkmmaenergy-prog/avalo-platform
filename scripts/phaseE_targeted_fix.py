from pathlib import Path
import json
import re
import shutil
from datetime import datetime

REPO = Path(r"C:\a\avalo")
AUDIT = REPO / "audit-out"
REPORT = AUDIT / "phaseC_hard_enforcement_report.json"
BACKUP = AUDIT / f"phaseE-targeted-fix-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
BACKUP.mkdir(parents=True, exist_ok=True)

data = json.loads(REPORT.read_text(encoding="utf-8"))
target_files = sorted(set(hit["file"] for hit in data["hits"]))

SAFE_REPLACEMENTS = [
    (r'65/35 split maintained', 'reference earnings model maintained'),
    (r'80/20 split', 'reference earnings model'),
    (r'65% creator / 35% platform', 'reference-only creator payout example / platform reference portion'),
    (r'Creator receives \(65%\)', 'Creator reference payout (not guaranteed)'),
    (r'Platform keeps \(35%\)', 'Platform reference portion'),
    (r'80% to you, 20% Avalo fee', 'up to the displayed reference portion before applicable deductions'),
    (r'80% to creator, 20% to Avalo', 'reference-only creator payout example'),
    (r'70% to creator, 30% to Avalo', 'reference-only creator payout example'),
    (r'65% to creator', 'up to the displayed reference creator portion'),
    (r'80% to creator', 'up to the displayed reference creator portion'),
    (r'70% to creator', 'up to the displayed reference creator portion'),
    (r'65% to earner', 'up to the displayed reference earner portion'),
    (r'80% to earner', 'up to the displayed reference earner portion'),
    (r'70% to earner', 'up to the displayed reference earner portion'),
    (r'65% to host', 'up to the displayed reference host portion'),
    (r'80% to host', 'up to the displayed reference host portion'),
    (r'creator receives', 'creator reference payout'),
    (r'platform keeps', 'platform reference portion'),
    (r'You\'ll receive 80%, Avalo gets 20%', 'You may receive up to the displayed reference amount before applicable deductions'),
    (r'You receive 65% as net creator earnings', 'Displayed creator earnings are reference only and not guaranteed'),
    (r'receive 65% of gross earnings', 'receive up to the displayed reference payout before applicable deductions'),
    (r'Total Earned \(65%\)', 'Total Earned (reference only)'),
    (r'Your share \(65%\)', 'Your share (reference only)'),
    (r'Your Share \(65%\)', 'Your Share (reference only)'),
    (r'Earned \(65%\)', 'Earned (reference only)'),
    (r'Organizer Share \(80%\)', 'Organizer Share (reference only)'),
    (r'65%\)', 'reference only)'),
    (r'80%\)', 'reference only)'),
    (r'70%\)', 'reference only)'),
    (r'65%', 'up to reference rate'),
    (r'80%', 'up to reference rate'),
    (r'70%', 'up to reference rate'),
]

skip_contains = ["node_modules", "lib_backup"]

report = {"changed": [], "missing": [], "scanned": []}

for raw in target_files:
    path = Path(raw)
    if not path.exists():
        report["missing"].append(str(path))
        continue
    if any(x.lower() in str(path).lower() for x in skip_contains):
        continue
    if path.suffix.lower() not in {".ts", ".tsx", ".js", ".md"}:
        continue

    original = path.read_text(encoding="utf-8", errors="ignore")
    fixed = original

    for old, new in SAFE_REPLACEMENTS:
        fixed = re.sub(old, new, fixed, flags=re.IGNORECASE)

    report["scanned"].append(str(path))

    if fixed != original:
        backup = BACKUP / path.relative_to(REPO)
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup)
        path.write_text(fixed, encoding="utf-8", newline="\n")
        report["changed"].append(str(path))

out = AUDIT / "phaseE_targeted_fix_report.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print(json.dumps({
    "changed_count": len(report["changed"]),
    "missing_count": len(report["missing"]),
    "scanned_count": len(report["scanned"]),
    "report": str(out)
}, ensure_ascii=False, indent=2))
