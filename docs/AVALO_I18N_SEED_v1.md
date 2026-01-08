# AVALO_I18N_SEED_v1.md

## Locales
EN, PL, ES, DE, FR initially; plan 60+.
Fallback: EN. Auto-detect device locale; user override.

## Namespaces
`auth`, `onboarding`, `profile`, `discovery`, `chat`, `calendar`, `wallet`, `feed`, `ai`, `ads`, `legal`, `settings`.

## Example Keys (EN/PL)

```json
// auth
{
  "auth.signIn": "Sign in",
  "auth.signUp": "Create account",
  "auth.continue": "Continue",
  "auth.logout": "Log out",
  "auth.phone": "Phone number",
  "auth.email": "Email",
  "auth.code": "Verification code"
}
```
```json
// auth (pl)
{
  "auth.signIn": "Zaloguj się",
  "auth.signUp": "Utwórz konto",
  "auth.continue": "Dalej",
  "auth.logout": "Wyloguj",
  "auth.phone": "Numer telefonu",
  "auth.email": "Email",
  "auth.code": "Kod weryfikacyjny"
}
```
```json
// chat
{
  "chat.freeUsed": "You used your 3 free messages.",
  "chat.depositCta": "Deposit 100 tokens to continue",
  "chat.refundPolicy": "Unused tokens are refunded automatically",
  "chat.aiTip": "Tap the bulb to get AI suggestions"
}
```
```json
// chat (pl)
{
  "chat.freeUsed": "Wykorzystałeś 3 darmowe wiadomości.",
  "chat.depositCta": "Wpłać 100 tokenów, aby kontynuować",
  "chat.refundPolicy": "Niewykorzystane tokeny zwracamy automatycznie",
  "chat.aiTip": "Dotknij żarówki po podpowiedzi AI"
}
```

Place JSON per-locale under `packages/i18n/<locale>/*.json`.
