from pathlib import Path
import re
import json
from datetime import datetime
import shutil

REPO = Path(r"C:\a\avalo")
AUDIT = REPO / "audit-out"
BACKUP = AUDIT / f"phaseD-hard-lock-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
BACKUP.mkdir(parents=True, exist_ok=True)

TARGETS = [
    REPO / "app-mobile",
    REPO / "functions/src"
]

EXTS = {".ts", ".tsx", ".js", ".md"}

def backup(path):
    dst = BACKUP / path.relative_to(REPO)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dst)

def fix_line(line):
    # UI text fix
    line = re.sub(r"(\d{2})%\s*Creator", "Up to reference earnings (not guaranteed)", line)
    line = re.sub(r"Creator\s*\(\d{2}%\)", "Creator (reference only, not guaranteed)", line)

    line = re.sub(r"receive[s]?\s*\d{2}%", "may receive (up to, reference only)", line)
    line = re.sub(r"gets\s*\d{2}%", "may receive (up to, reference only)", line)

    line = re.sub(r"\(\d{2}%\)", "(reference only)", line)

    # remove explicit splits wording
    line = re.sub(r"\d{2}%\s*(creator|earner|organizer)", "reference portion", line)

    return line

report = {"changed": []}

for root in TARGETS:
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in EXTS:
            continue
        if "node_modules" in path.parts:
            continue

        text = path.read_text(encoding="utf-8", errors="ignore")
        new_lines = []
        changed = False

        for line in text.splitlines():
            new_line = fix_line(line)
            if new_line != line:
                changed = True
            new_lines.append(new_line)

        if changed:
            backup(path)
            path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
            report["changed"].append(str(path))

out = AUDIT / "phaseD_hard_lock_report.json"
out.write_text(json.dumps(report, indent=2), encoding="utf-8")

print(json.dumps({
    "changed": len(report["changed"]),
    "report": str(out)
}, indent=2))
