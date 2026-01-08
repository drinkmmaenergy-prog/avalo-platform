# AVALO — AI Companions Specification (v1)
Version: 1.0 • Scope: Product + Tech + Billing • Status: Ready for implementation

## 0. Purpose
Define a clean separation between **Real Dating (H2H)** and **AI Companions (H2A)**. Prevent confusion, ensure policy‑safe UX, control generation costs, and provide clear monetization.

## 1. Product Principles
- Two distinct tabs and data models: **Dating (👤 Real)** vs **AI (🤖 Companion)**.
- Clear labels in all contexts: chat headers, list cells, notifications.
- No bots in human discovery. AI is only in the **AI** tab.
- Messages with AI are **token‑free if subscribed**. Otherwise per‑use tokens.
- NSFW content only with **age‑gate** and **legal territory allowlist**.

## 2. Navigation & Surfaces
- Bottom Tabs: `[💕 Dating] [🤖 AI] [💬 Chat] [👤 Me]`
- AI Tab Sections: **Gallery bots** (system), **My Companions** (custom), **Subscriptions**.
- Badges: `👤 Real User` vs `🤖 AI Companion` (persistent in chat header + thread list).

## 3. AI Companion Types
### 3.1 System Bots (Shared)
- Curated gallery (100–300), multi‑tenant per user.
- Categories: Romance, Friendship, Fantasy/Roleplay, Professional, Adult (18+ gated).
- Each has name, age, bio, persona card, language set, content level (PG‑13 / R / XXX).

### 3.2 Custom Bots (Private)
- Owned by a single user. Hidden from others.
- Customizable **Appearance**, **Personality**, **Relationship style**.
- Daily media generation quota tied to user plan.

## 4. Appearance Model (Female/Male/NB)
**Store structure (Firestore subdoc):** `bots/{botId}/appearance`
```
gender: "female" | "male" | "non-binary"
heightCm: 150..200
bodyType: "slim" | "athletic" | "curvy" | "plus" | "muscular"
skinTone: "very_fair" | "fair" | "medium" | "tan" | "deep"
hair: { color: "blonde"|"black"|"brown"|"red"|"gray"|"custom", length: "short"|"medium"|"long"|"xl", style: "straight"|"wavy"|"curly"|"braid"|"updo" }
face: { shape: "oval"|"round"|"heart"|"square"|"long", eyesColor: "brown"|"blue"|"green"|"hazel"|"gray"|"custom", lips: "thin"|"medium"|"full", nose: "small"|"medium"|"large" }
extras: { tattoos: int, piercings: string[], accessories: string[] }
femaleSpecific?: { bustSize: "AA".."N", buttSize: "XS".."XXL", waistHipRatio: 0.6..1.0 }
maleSpecific?: { penisLengthCm: 10..30, bodyHair: 0..5, facialHair: "none"|"stubble"|"beard", build: "lean"|"athletic"|"muscular"|"stocky" }
```
Validation in client; schema enforced by Cloud Functions.

## 5. Personality & Relationship
**Store:** `bots/{botId}/persona`
```
traits: ["funny","serious","flirty","shy","confident","caring","mysterious", ...]  // max 6
interests: string[]                        // reuse user interest taxonomy
tone: "casual" | "formal" | "playful" | "romantic" | "direct"
relationship: "friend" | "romance" | "coach" | "roleplay"
boundaries: { smallTalk: true, gifts: false, explicit: false, aftercare: true }
languages: ["en","pl","es","de","fr", ...] // i18n capability set
contentLevel: "PG13" | "R" | "XXX"         // mapped to safety policies
```
Runtime prompt constructed from persona card + safety rails.

## 6. Content Levels and Age Gate
- **PG‑13**: flirty, non‑explicit. No nudity.  
- **R**: sensual, implied intimacy. No graphic details.  
- **XXX**: explicit text and AI‑generated NSFW images.  
**Requirements:** `ageVerified=true` + territory allowlist for XXX. Toggle available per market flag.

## 7. Media Generation
- Engine: Stable diffusion class API or equivalent provider.
- Quotas:
  - System Bot: 2–3 images/day/user auto; on‑demand up to 5/day.
  - Custom Bot: 2–3 auto + 5 on‑demand/day.
- Storage: Firebase Storage under `ai-media/{uid}/{botId}/{yyyy-mm}/{assetId}.jpg`.
- Safety: NSFW classifier pre‑store, hash fingerprinting, takedown API.

## 8. Monetization
### 8.1 Subscriptions (Web‑only checkout)
- **AI Basic** $9.99/mo per bot (system OR custom):
  - Unlimited chat with the bot.
  - Daily auto images (2–3).
  - On‑demand 3 images/day.
- **AI Plus** $17.99/mo per bot:
  - Unlimited chat.
  - Auto images (3).
  - On‑demand 5/day.
  - Voice messages (TTS).
- **AI Premium (18+ markets)** $24.99/mo per bot:
  - All of Plus.
  - XXX content level (if age‑verified & legal).
- Multi‑bot discounts: 2 bots −10%, 3 bots −17%, 5+ bots −20%.

### 8.2 Pay‑per‑use (without subscription)
- Chat: 1 token / 20 messages (metered in background to avoid friction).
- Image generation: 10 tokens per image (PG‑13/R), 20 tokens (XXX).
- Voice message: 1 token per 30s TTS.
- All pricing adjustable via remote config.

### 8.3 Cost Control
- Provider unit costs configured in **Admin → AI Costs**:
  - `image.costUSD`, `tts.costUSD`, `llm.costUSD/1kTokens`.
- Floor pricing ensures margin. If provider spikes, remote config raises token price.
- Daily budget per user to avoid abuse.

## 9. Technical Architecture
- API: `functions/src/ai/` endpoints
  - `createBot`, `updateBot`, `generateImage`, `sendPrompt`, `ttsVoice`.
- Rate limits per uid + per botId.
- Billing pipeline writes to `transactions` with `type="ai_image"|"ai_chat"|"ai_voice"`.
- Content moderation before commit:
  - Text → keyword & LLM classifier.
  - Image → NSFW + face policy.
- Chat threading: `aiChats/{uid}/{botThreadId}/messages/{messageId}`.

## 10. UX & Copy (Neutral, value‑focused)
- Labels avoid money motivation. Use “quality conversation”, “personalized companion”.
- In AI tab show small disclosure: “Non‑human conversational experience.”
- For XXX: “Explicit content available in approved regions for age‑verified adults.”

## 11. Compliance
- No human impersonation. Always show 🤖 badge.
- Clear separation H2H vs H2A.
- Export/delete of AI data in user privacy center.
- Territory flags for content levels.

---
## 🇵🇱 DODATEK (PL skrót)
- Oddzielne zakładki, jasne oznaczenia 🤖.
- Subskrypcje wyłącznie na web, czat bez tokenów w ramach planu.
- Generowanie obrazów limitowane dziennie, opłaty tokenowe poza planem.
- XXX tylko po weryfikacji wieku i w krajach dozwolonych.