from __future__ import annotations
import json
from copy import deepcopy
from pathlib import Path

REPO = Path(r"C:\a\avalo")
WEB_MESSAGES = REPO / "app-web" / "src" / "i18n" / "messages"
MOBILE_I18N = REPO / "app-mobile" / "i18n"
AUDIT_OUT = REPO / "audit-out"

LOCALES = [
    "en","pl","de","fr","es","it","pt","nl","sv","da","no","fi",
    "cs","sk","hu","ro","bg","hr","sl","el","tr","ar","he","hi",
    "ja","ko","zh","th","vi","id","ms","tl","uk","ru","lt","lv",
    "et","sr","bs","mk","sq","ka"
]

def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    raw = path.read_text(encoding="utf-8-sig").strip()
    return json.loads(raw) if raw else {}

def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

def deep_merge(a: dict, b: dict) -> dict:
    out = deepcopy(a)
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out

def mobile_path_for(locale: str) -> Path:
    direct = MOBILE_I18N / f"{locale}.json"
    nested_common = MOBILE_I18N / locale / "common.json"
    nested_translation = MOBILE_I18N / locale / "translation.json"
    if direct.exists():
        return direct
    if nested_common.exists():
        return nested_common
    if nested_translation.exists():
        return nested_translation
    return direct

EN = json.loads((AUDIT_OUT / "legal_i18n_en_master_snapshot.json").read_text(encoding="utf-8"))

web_written = []
mobile_written = []

for locale in LOCALES:
    payload = {"legal": deepcopy(EN)}

    web_path = WEB_MESSAGES / f"{locale}.json"
    existing_web = read_json(web_path)
    write_json(web_path, deep_merge(existing_web, payload))
    web_written.append(str(web_path))

    if MOBILE_I18N.exists():
        mobile_path = mobile_path_for(locale)
        existing_mobile = read_json(mobile_path)
        write_json(mobile_path, deep_merge(existing_mobile, payload))
        mobile_written.append(str(mobile_path))

report = {
    "version": "full42-en-master-applied",
    "web_written_count": len(web_written),
    "mobile_written_count": len(mobile_written),
    "locales": LOCALES
}

write_json(AUDIT_OUT / "legal_i18n_full42_en_master_apply_report.json", report)
print(json.dumps(report, ensure_ascii=False, indent=2))
