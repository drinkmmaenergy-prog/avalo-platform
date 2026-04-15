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
    "en", "pl", "de", "fr", "es", "it", "pt", "nl", "sv", "da", "no", "fi",
    "cs", "sk", "hu", "ro", "bg", "hr", "sl", "el", "tr", "ar", "he", "hi",
    "ja", "ko", "zh", "th", "vi", "id", "ms", "tl", "uk", "ru", "lt", "lv",
    "et", "sr", "bs", "mk", "sq", "ka"
]

LANG_MAP = {
    "en": "english",
    "pl": "polish",
    "de": "german",
    "fr": "french",
    "es": "spanish",
    "it": "italian",
    "pt": "portuguese",
    "nl": "dutch",
    "sv": "swedish",
    "da": "danish",
    "no": "norwegian",
    "fi": "finnish",
    "cs": "czech",
    "sk": "slovak",
    "hu": "hungarian",
    "ro": "romanian",
    "bg": "bulgarian",
    "hr": "croatian",
    "sl": "slovenian",
    "el": "greek",
    "tr": "turkish",
    "ar": "arabic",
    "he": "hebrew",
    "hi": "hindi",
    "ja": "japanese",
    "ko": "korean",
    "zh": "chinese (simplified)",
    "th": "thai",
    "vi": "vietnamese",
    "id": "indonesian",
    "ms": "malay",
    "tl": "tagalog",
    "uk": "ukrainian",
    "ru": "russian",
    "lt": "lithuanian",
    "lv": "latvian",
    "et": "estonian",
    "sr": "serbian",
    "bs": "bosnian",
    "mk": "macedonian",
    "sq": "albanian",
    "ka": "georgian",
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

FORBIDDEN_OLD_PHRASES = [
    "guaranteed earnings",
    "platform keeps (35%)",
    "creator receives (65%)",
    "65/35",
    "70/30",
    "80/20",
    "discount",
    "promotion"
]

def ensure_package(module_name: str, pip_name: str | None = None) -> None:
    try:
        __import__(module_name)
        return
    except Exception:
        name = pip_name or module_name
        subprocess.check_call([sys.executable, "-m", "pip", "install", name])

ensure_package("deep_translator", "deep-translator")

from deep_translator import GoogleTranslator

EN = {
    "meta": {
        "effectiveDate": "[EFFECTIVE_DATE]",
        "englishPrevails": "In case of inconsistency, the English version prevails.",
        "referenceOnly": "Reference only. Informational values, examples and creator earnings illustrations are estimates and do not constitute a promise, guarantee or legally binding payout commitment.",
        "excludingVat": "All reference earnings examples are calculated conservatively from the net token value of the 10,000-token pack, excluding VAT.",
        "notGuaranteed": "Earnings are not guaranteed. Final payout may be lower due to taxes, VAT treatment, processor fees, platform fees where applicable, deductions, refunds, chargebacks, compliance actions, currency conversion and other operational adjustments."
    },
    "terms": {
        "title": "Terms and Conditions",
        "body": """These Terms and Conditions govern access to and use of Avalo, a digital platform operated by [LEGAL_ENTITY], trading as [COMPANY_NAME], with registered address at [REGISTERED_ADDRESS]. By creating an account, browsing the platform, purchasing tokens, subscribing to paid features, using creator tools, or participating in the community, the user agrees to these Terms. Avalo may offer digital features, token-based interactions, subscriptions, creator-facing functions, community functions, support services, and other platform tools. Feature availability may change over time.

Users must provide accurate information, keep account credentials secure, comply with applicable law, and avoid abusive, fraudulent, infringing, manipulative, or harmful conduct. Certain features may require age verification, identity checks, eligibility review, or additional disclosures. Avalo may suspend, limit, or terminate access where reasonably necessary for security, legal compliance, fraud prevention, payment integrity, user protection, operational continuity, or policy enforcement.

Prices, token mechanics, subscription scope, access conditions, creator tools, and product descriptions may change. Such changes do not retroactively remove rights already granted for completed purchases except where legally required, technically necessary, or justified by misuse, refunds, chargebacks, compliance restrictions, or platform security. Users remain responsible for taxes, device costs, network costs, and third-party fees associated with their use of the service.

Nothing in these Terms guarantees reach, visibility, earnings, creator outcomes, commercial success, monetisation results, or uninterrupted availability. To the extent allowed by applicable law, liability is limited to the amount paid by the user for the relevant service in the period reasonably connected to the claim. These Terms should be read together with the Privacy Policy, Cookie Policy, Payments / Token Purchase Terms, Payout / Creator Earnings Notice, Creator Terms, Community Guidelines, and product-specific notices. In case of inconsistency, the English version prevails."""
    },
    "privacy": {
        "title": "Privacy Policy",
        "body": """This Privacy Policy explains how [LEGAL_ENTITY] collects, uses, stores, shares, and protects personal data in connection with Avalo. Data may include account information, contact details, technical identifiers, device and usage data, payment-related metadata, communication history, moderation records, creator onboarding information, support history, and verification information required by law or by platform risk controls. Payment card data is generally processed by authorised payment providers and is not intentionally stored in full by the platform unless explicitly stated otherwise in a specific provider flow.

Personal data may be processed to provide services, authenticate users, prevent abuse, process transactions, manage subscriptions, support creators, enforce platform rules, improve services, maintain security, comply with legal obligations, and defend legal claims. Depending on the context, processing may be based on contract performance, legitimate interests, legal obligations, or consent.

Data may be shared with payment processors, cloud providers, analytics vendors, security providers, moderation providers, support tools, professional advisers, regulators, financial institutions, or other service providers acting under appropriate safeguards and only to the extent reasonably necessary. International transfers may occur where suitable legal mechanisms or equivalent safeguards are in place.

Data is retained only as long as reasonably necessary for service delivery, compliance, dispute resolution, fraud prevention, tax or accounting obligations, enforcement, or legitimate operational needs. Users may have rights to access, correct, delete, restrict, object, export, or withdraw consent in accordance with applicable law. Requests may be sent to [SUPPORT_EMAIL] and, where applicable, [DPO_EMAIL]. Avalo uses reasonable technical and organisational measures, but no system is completely secure. In case of inconsistency, the English version prevails."""
    },
    "cookies": {
        "title": "Cookie Policy",
        "body": """Avalo uses cookies and similar technologies to operate the service, remember preferences, maintain sessions, support security controls, measure performance, understand traffic patterns, and, where permitted, support analytics, personalisation, and marketing. Some cookies are strictly necessary for core functionality and cannot be disabled without materially affecting the service. Other cookies may be optional depending on user choice, product configuration, and applicable regional requirements.

Cookies may be set by Avalo or by carefully selected third-party providers supporting hosting, analytics, payments, fraud prevention, security, content delivery, or support. Users can manage cookie settings through platform controls where available and through browser or device settings. Blocking some cookies may reduce functionality or prevent parts of the service from working correctly. Consent choices may be stored to respect the user's preferences.

Because integrations and infrastructure may evolve over time, the exact cookie inventory may change. Avalo will seek to keep user-facing disclosures reasonably updated. For broader data handling details, users should also review the Privacy Policy. In case of inconsistency, the English version prevails."""
    },
    "payments": {
        "title": "Payments / Token Purchase Terms",
        "body": """These Payments / Token Purchase Terms apply to purchases of tokens, subscriptions, and other paid digital services made through Avalo. Prices shown to users may appear with or without taxes depending on checkout design, local rules, and applicable law, but the final amount charged may include VAT, sales tax, processor fees where lawfully passed through, currency conversion costs, or other mandatory charges.

Tokens are digital access units for platform features. They have no cash value, are not deposits, are not e-money, are not investments, and are not redeemable for fiat except where an explicit creator payout flow applies under separate rules. Token balances, subscription entitlements, and feature access may be adjusted in cases of fraud, abuse, technical error, refunds, chargebacks, reversal requirements, legal obligations, or platform policy enforcement.

Purchases may be final to the extent permitted for digital content or digital services once performance has begun, subject to mandatory consumer rights in the user's jurisdiction. Users are responsible for reviewing purchase details before checkout. Discount, promotion, or campaign language must not be inferred unless explicitly shown in the applicable product flow. Nothing in the payments experience creates guaranteed creator earnings, guaranteed platform outcomes, or guaranteed user results. Refund handling may depend on law, payment method, product type, service status, fraud review, and prior account behaviour. In case of inconsistency, the English version prevails."""
    },
    "payout": {
        "title": "Payout / Creator Earnings Notice",
        "body": """This Payout / Creator Earnings Notice is for reference only and does not create a guarantee of earnings, a minimum payout, a fixed revenue share, or an unconditional settlement obligation. Any user-facing creator earnings examples, illustrations, benchmark figures, or payout references are illustrative only. They are calculated conservatively from the net token value of the 10,000-token pack, excluding VAT, and may differ from actual results.

Final payout may be lower due to taxes, VAT treatment, processor fees, platform fees where applicable under the active product configuration, deductions, refunds, chargebacks, reserves, fraud losses, compliance reviews, account status changes, currency conversion, withholding, local law requirements, correction of calculation errors, or other operational factors. Eligibility for payout may depend on successful onboarding, identity verification, tax documentation, compliance checks, minimum thresholds, supported payout methods, account standing, and lawful platform use.

Timing of payout is not guaranteed and may vary due to operational, banking, regulatory, risk, anti-fraud, or compliance processes. Where percentages, splits, examples, or reference scenarios appear in product communication, they must be interpreted as informational examples only unless a specific binding creator agreement expressly states otherwise. In case of inconsistency, the English version prevails."""
    },
    "creatorTerms": {
        "title": "Creator Terms",
        "body": """These Creator Terms apply to users who participate in Avalo as creators, talent, streamers, hosts, experts, sellers, or other monetising participants. Creators must provide accurate onboarding information, maintain lawful and non-misleading profiles, respect intellectual property rights, comply with platform content standards, follow advertising and disclosure laws, avoid manipulation, fraud, impersonation, harassment, or prohibited conduct, and cooperate with moderation, trust and safety, and compliance checks.

Creator tools, visibility systems, earnings displays, benchmark references, and monetisation features may change over time. Access to creator functionality may be suspended, limited, or removed due to quality issues, complaints, platform policy violations, legal risk, payment risk, identity concerns, inactivity, fraud indicators, or operational reasons. Creators remain responsible for their own taxes, registrations, invoicing obligations, consumer disclosures, and legal compliance unless a separate written arrangement expressly states otherwise.

Any earnings or payout information shown in the product is reference only unless confirmed in a specific binding agreement. Avalo may remove content, freeze balances, withhold settlement, offset losses, reverse transactions, or apply protective measures where reasonably necessary for fraud prevention, chargeback recovery, legal compliance, user protection, policy enforcement, or correction of error. In case of inconsistency, the English version prevails."""
    },
    "community": {
        "title": "Community Guidelines",
        "body": """Users must treat others respectfully and use Avalo lawfully. Prohibited conduct includes illegal activity, fraud, scams, impersonation, spam, harassment, hate, violent threats, exploitative behaviour, sexual content involving minors, non-consensual content, privacy violations, copyright infringement, misleading commercial practices, malicious automation, account abuse, payment abuse, ban evasion, and attempts to undermine platform integrity.

Users must not upload, sell, promote, distribute, or facilitate content, services, or conduct that violates law, infringes rights, deceives users, creates unacceptable risk, or damages trust and safety. Creator and community participation may be subject to moderation, reporting, ranking limits, visibility restrictions, demonetisation, or enforcement actions. Enforcement may include warnings, content removal, feature limitation, suspension, account termination, balance holds, payout review, legal reporting, or other reasonably necessary action.

These rules support trust and safety but cannot eliminate all risk. Users should exercise caution in their interactions, avoid sharing unnecessary personal information, and report harmful behaviour. In case of inconsistency, the English version prevails."""
    },
    "consents": {
        "acceptTerms": "I accept the Terms and Conditions and understand that, in case of inconsistency, the English version prevails.",
        "acceptPrivacy": "I acknowledge the Privacy Policy and understand how my personal data may be processed.",
        "acceptCookies": "I understand the Cookie Policy and, where required, I consent to the use of optional cookies according to my preferences.",
        "acceptMarketing": "I agree to receive marketing communications where I choose to opt in. I understand that I can withdraw consent at any time.",
        "creatorPayoutAck": "I understand that payout information is reference only, may change, and does not guarantee any specific settlement amount or timing.",
        "creatorEarningsAck": "I understand that creator earnings examples are illustrative only, based conservatively on the net value of the 10,000-token pack excluding VAT, and final payout may be lower."
    }
}

def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    raw = path.read_text(encoding="utf-8-sig").strip()
    if not raw:
        return {}
    return json.loads(raw)

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

def scan_repo_for_old_wording() -> list[dict]:
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
        for phrase in FORBIDDEN_OLD_PHRASES:
            if phrase.lower() in lower:
                hits.append({"file": str(path), "match": phrase})
    return hits

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
    translator = GoogleTranslator(source="en", target=target_locale)
    translated = translator.translate(protected)
    translated = restore_placeholders(translated, mapping)
    return translated

def translate_legal_for_locale(locale: str) -> dict:
    if locale == "en":
        return {"legal": deepcopy(EN)}

    result = {"legal": {}}
    result["legal"]["meta"] = {
        "effectiveDate": "[EFFECTIVE_DATE]",
        "englishPrevails": translate_text(EN["meta"]["englishPrevails"], locale),
        "referenceOnly": translate_text(EN["meta"]["referenceOnly"], locale),
        "excludingVat": translate_text(EN["meta"]["excludingVat"], locale),
        "notGuaranteed": translate_text(EN["meta"]["notGuaranteed"], locale),
    }

    for section in ["terms", "privacy", "cookies", "payments", "payout", "creatorTerms", "community"]:
        result["legal"][section] = {
            "title": translate_text(EN[section]["title"], locale),
            "body": translate_text(EN[section]["body"], locale)
        }

    result["legal"]["consents"] = {
        key: translate_text(value, locale)
        for key, value in EN["consents"].items()
    }

    return result

def apply_to_file(path: Path, payload: dict) -> None:
    existing = read_json(path)
    merged = deep_merge(existing, payload)
    write_json(path, merged)

def main() -> None:
    AUDIT_OUT.mkdir(parents=True, exist_ok=True)

    audit_before = {
        "repo": str(REPO),
        "web_messages_exists": WEB_MESSAGES.exists(),
        "mobile_i18n_exists": MOBILE_I18N.exists(),
        "old_wording_hits": scan_repo_for_old_wording()
    }
    write_json(AUDIT_OUT / "legal_i18n_audit_before.json", audit_before)

    web_written = []
    mobile_written = []
    translation_log = []

    for locale in LOCALES:
        payload = translate_legal_for_locale(locale)

        web_path = WEB_MESSAGES / f"{locale}.json"
        apply_to_file(web_path, payload)
        web_written.append(str(web_path))

        if MOBILE_I18N.exists():
            mobile_path = mobile_path_for(locale)
            apply_to_file(mobile_path, payload)
            mobile_written.append(str(mobile_path))

        translation_log.append({
            "locale": locale,
            "language": LANG_MAP[locale],
            "web": str(web_path),
            "mobile": str(mobile_path_for(locale)) if MOBILE_I18N.exists() else None
        })

    apply_report = {
        "version": "final-full-42-bom-safe",
        "web_written_count": len(web_written),
        "mobile_written_count": len(mobile_written),
        "web_written": web_written,
        "mobile_written": mobile_written,
        "locales": LOCALES,
        "placeholders_to_fill": PLACEHOLDERS,
        "notes": [
            "EN is the master legal version.",
            "Each legal document includes an English-prevails clause.",
            "Payout and earnings wording is reference only, excluding VAT, not guaranteed.",
            "Non-legal keys were preserved.",
            "UTF-8 BOM-safe JSON reader enabled."
        ],
        "translation_log": translation_log
    }
    write_json(AUDIT_OUT / "legal_i18n_apply_report.json", apply_report)

if __name__ == "__main__":
    main()
