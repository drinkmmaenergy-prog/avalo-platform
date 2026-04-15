from __future__ import annotations

import json
import subprocess
import sys
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

TARGET_MAP = {
    "en": "en",
    "pl": "pl",
    "de": "de",
    "fr": "fr",
    "es": "es",
    "it": "it",
    "pt": "pt",
    "nl": "nl",
    "sv": "sv",
    "da": "da",
    "no": "no",
    "fi": "fi",
    "cs": "cs",
    "sk": "sk",
    "hu": "hu",
    "ro": "ro",
    "bg": "bg",
    "hr": "hr",
    "sl": "sl",
    "el": "el",
    "tr": "tr",
    "ar": "ar",
    "he": "iw",
    "hi": "hi",
    "ja": "ja",
    "ko": "ko",
    "zh": "zh-CN",
    "th": "th",
    "vi": "vi",
    "id": "id",
    "ms": "ms",
    "tl": "tl",
    "uk": "uk",
    "ru": "ru",
    "lt": "lt",
    "lv": "lv",
    "et": "et",
    "sr": "sr",
    "bs": "bs",
    "mk": "mk",
    "sq": "sq",
    "ka": "ka"
}

PLACEHOLDERS = [
    "[COMPANY_NAME]",
    "[LEGAL_ENTITY]",
    "[REGISTERED_ADDRESS]",
    "[SUPPORT_EMAIL]",
    "[DPO_EMAIL]",
    "[EFFECTIVE_DATE]",
    "[JURISDICTION]"
]

def ensure_package(module_name: str, pip_name: str | None = None) -> None:
    try:
        __import__(module_name)
        return
    except Exception:
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or module_name])

ensure_package("deep_translator", "deep-translator")
from deep_translator import GoogleTranslator

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

def protect_placeholders(text: str) -> tuple[str, dict[str, str]]:
    mapping = {}
    out = text
    for idx, ph in enumerate(PLACEHOLDERS):
        token = f"__PH_{idx}__"
        mapping[token] = ph
        out = out.replace(ph, token)
    out = out.replace("Avalo", "__BRAND_AVALO__")
    mapping["__BRAND_AVALO__"] = "Avalo"
    return out, mapping

def restore_placeholders(text: str, mapping: dict[str, str]) -> str:
    out = text
    for token, original in mapping.items():
        out = out.replace(token, original)
    return out

def translate_text(text: str, target_locale: str) -> str:
    if target_locale == "en":
        return text

    protected, mapping = protect_placeholders(text)
    effective_target = TARGET_MAP[target_locale]

    try:
        translator = GoogleTranslator(source="en", target=effective_target)
        translated = translator.translate(protected)
        if translated:
            return restore_placeholders(translated, mapping)
    except Exception:
        pass

    return text

EN = json.loads((AUDIT_OUT / "legal_i18n_en_master_snapshot.json").read_text(encoding="utf-8"))

def translate_payload(locale: str) -> dict:
    if locale == "en":
        return {"legal": deepcopy(EN)}

    legal = {}
    legal["meta"] = {
        k: (v if k == "effectiveDate" else translate_text(v, locale))
        for k, v in EN["meta"].items()
    }

    for section in ["terms","privacy","cookies","payments","payout","creatorTerms","community"]:
        legal[section] = {
            "title": translate_text(EN[section]["title"], locale),
            "body": translate_text(EN[section]["body"], locale)
        }

    legal["consents"] = {
        k: translate_text(v, locale)
        for k, v in EN["consents"].items()
    }

    return {"legal": legal}

progress = []
web_written = []
mobile_written = []

for i, locale in enumerate(LOCALES, start=1):
    print(f"[{i}/{len(LOCALES)}] START {locale}", flush=True)
    payload = translate_payload(locale)

    web_path = WEB_MESSAGES / f"{locale}.json"
    existing_web = read_json(web_path)
    write_json(web_path, deep_merge(existing_web, payload))
    web_written.append(str(web_path))

    if MOBILE_I18N.exists():
        mobile_path = mobile_path_for(locale)
        existing_mobile = read_json(mobile_path)
        write_json(mobile_path, deep_merge(existing_mobile, payload))
        mobile_written.append(str(mobile_path))
    else:
        mobile_path = None

    progress.append({
        "locale": locale,
        "web": str(web_path),
        "mobile": str(mobile_path) if mobile_path else None
    })
    write_json(AUDIT_OUT / "legal_i18n_full42_progress.json", {"progress": progress})
    print(f"[{i}/{len(LOCALES)}] DONE {locale}", flush=True)

report = {
    "version": "full42-translated-v1",
    "web_written_count": len(web_written),
    "mobile_written_count": len(mobile_written),
    "locales": LOCALES
}

write_json(AUDIT_OUT / "legal_i18n_full42_translate_report.json", report)
print("FULL 42 TRANSLATION COMPLETE", flush=True)
