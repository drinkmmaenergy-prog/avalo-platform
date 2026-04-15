from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(r"C:\a\avalo")
WEB_MESSAGES = REPO / "app-web" / "src" / "i18n" / "messages"
MOBILE_I18N = REPO / "app-mobile" / "i18n"
AUDIT_OUT = REPO / "audit-out"

LOCALES = [
    "en", "pl", "de", "fr", "es", "it", "pt", "nl", "sv", "da", "no", "fi",
    "cs", "sk", "hu", "ro", "bg", "hr", "sl", "el", "tr", "ar", "he", "hi",
    "ja", "ko", "zh", "th", "vi", "id", "ms", "tl", "uk", "ru", "lt", "lv",
    "et", "sr", "bs", "mk", "sq", "ka"
]

REQUIRED = [
    ("legal", "meta", "effectiveDate"),
    ("legal", "meta", "englishPrevails"),
    ("legal", "meta", "referenceOnly"),
    ("legal", "meta", "excludingVat"),
    ("legal", "meta", "notGuaranteed"),
    ("legal", "terms", "title"),
    ("legal", "terms", "body"),
    ("legal", "privacy", "title"),
    ("legal", "privacy", "body"),
    ("legal", "cookies", "title"),
    ("legal", "cookies", "body"),
    ("legal", "payments", "title"),
    ("legal", "payments", "body"),
    ("legal", "payout", "title"),
    ("legal", "payout", "body"),
    ("legal", "creatorTerms", "title"),
    ("legal", "creatorTerms", "body"),
    ("legal", "community", "title"),
    ("legal", "community", "body"),
    ("legal", "consents", "acceptTerms"),
    ("legal", "consents", "acceptPrivacy"),
    ("legal", "consents", "acceptCookies"),
    ("legal", "consents", "acceptMarketing"),
    ("legal", "consents", "creatorPayoutAck"),
    ("legal", "consents", "creatorEarningsAck"),
]

FORBIDDEN_VALUES = [
    "TODO",
    "lorem ipsum"
]

SUSPECT_PATTERNS = [
    r"\bguaranteed earnings\b",
    r"\bplatform keeps \(35%\)\b",
    r"\bcreator receives \(65%\)\b",
    r"\b65/35\b",
    r"\b70/30\b",
    r"\b80/20\b",
]

def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return {}
    return json.loads(raw)

def getv(data: dict, path: tuple[str, ...]):
    cur = data
    for p in path:
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur

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

def validate_file(path: Path, locale: str, bucket: list[str]) -> None:
    data = read_json(path)
    if not data:
        bucket.append(f"{locale}:missing_or_empty::{path}")
        return
    for key in REQUIRED:
        value = getv(data, key)
        if value is None:
            bucket.append(f"{locale}:missing::{'.'.join(key)}::{path}")
        elif isinstance(value, str) and not value.strip():
            bucket.append(f"{locale}:empty::{'.'.join(key)}::{path}")
        elif isinstance(value, str):
            low = value.lower()
            for bad in FORBIDDEN_VALUES:
                if bad.lower() in low:
                    bucket.append(f"{locale}:forbidden_value::{bad}::{'.'.join(key)}::{path}")

def compare_shapes(a, b, prefix="") -> list[str]:
    issues = []
    if isinstance(a, dict) and isinstance(b, dict):
        ak = set(a.keys())
        bk = set(b.keys())
        for missing in sorted(ak - bk):
            issues.append(f"missing_in_target::{prefix}{missing}")
        for extra in sorted(bk - ak):
            issues.append(f"extra_in_target::{prefix}{extra}")
        for k in sorted(ak & bk):
            issues.extend(compare_shapes(a[k], b[k], prefix + k + "."))
    return issues

def scan_repo_text() -> list[dict]:
    hits = []
    for path in REPO.rglob("*"):
        if not path.is_file():
            continue
        if any(part in {".git", "node_modules", ".next", "dist", "build", "android", "ios", ".gradle", "Pods"} for part in path.parts):
            continue
        if path.suffix.lower() not in {".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".mdx", ".txt", ".yml", ".yaml"}:
            continue
        try:
            txt = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        lower = txt.lower()
        for pattern in SUSPECT_PATTERNS:
            for m in re.finditer(pattern, lower, flags=re.IGNORECASE):
                hits.append({"file": str(path), "match": m.group(0)})
    return hits

def main() -> None:
    report = {
        "version": "final-full-42",
        "status": "PASS",
        "web_errors": [],
        "mobile_errors": [],
        "shape_errors": [],
        "repo_text_hits": [],
        "placeholder_list": [
            "[COMPANY_NAME]",
            "[LEGAL_ENTITY]",
            "[REGISTERED_ADDRESS]",
            "[SUPPORT_EMAIL]",
            "[DPO_EMAIL]",
            "[EFFECTIVE_DATE]",
            "[JURISDICTION]"
        ]
    }

    en_web = read_json(WEB_MESSAGES / "en.json")
    en_legal = en_web.get("legal", {}) if en_web else {}

    for locale in LOCALES:
        web_path = WEB_MESSAGES / f"{locale}.json"
        validate_file(web_path, locale, report["web_errors"])
        web_data = read_json(web_path)
        if en_legal and web_data:
            report["shape_errors"].extend([f"web::{locale}::{x}" for x in compare_shapes(en_legal, web_data.get("legal", {}))])

    if MOBILE_I18N.exists():
        en_mobile_path = mobile_path_for("en")
        en_mobile = read_json(en_mobile_path)
        en_mobile_legal = en_mobile.get("legal", {}) if en_mobile else {}

        for locale in LOCALES:
            mobile_path = mobile_path_for(locale)
            validate_file(mobile_path, locale, report["mobile_errors"])
            mobile_data = read_json(mobile_path)
            if en_mobile_legal and mobile_data:
                report["shape_errors"].extend([f"mobile::{locale}::{x}" for x in compare_shapes(en_mobile_legal, mobile_data.get("legal", {}))])

    report["repo_text_hits"] = scan_repo_text()

    if report["web_errors"] or report["mobile_errors"] or report["shape_errors"]:
        report["status"] = "FAIL"

    AUDIT_OUT.mkdir(parents=True, exist_ok=True)
    out = AUDIT_OUT / "legal_i18n_verify_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

    print(json.dumps({
        "status": report["status"],
        "web_error_count": len(report["web_errors"]),
        "mobile_error_count": len(report["mobile_errors"]),
        "shape_error_count": len(report["shape_errors"]),
        "repo_text_hit_count": len(report["repo_text_hits"]),
        "verify_report": str(out)
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
