# 📘 AVALO_CORE_FULL_SPEC
**Version 2.0 • Finalized with confirmed rules**  
**Scope:** Master specification for Claude Code. Use this file as the single source of truth when generating the full Avalo codebase. Keep Firebase/Git bindings intact. App currency is tokens only.

> Instruction: Start Claude Code in this folder and read this file first. Preserve `.env`, `.firebaserc`, `firebase.json`, `.git`. Generate all code, then wait for /approve before file writes.

---

## 1) CORE CONCEPT
**AVALO = Tinder + Instagram + OnlyFans (web-only premium) + AI Assistant**  
Primary mechanism: **Earn‑to‑Chat** with strict safety, legal compliance, and quality focus.

- You pay only when a chat shows potential.  
- Platform takes its fee instantly and non‑refundable per business rules.  
- Internal accounting uses a fixed settlement rate to protect margins.

**In‑app UI uses only tokens.** Fiat shows only on web purchase and payouts.

---

## 2) TOKEN ECONOMY
### 2.1 Settlement Rate (fixed, internal)
- **1 token = 0.20 PLN** for all settlements and payouts.  
- Used for platform fee, creator escrow, and withdrawals.

### 2.2 Purchase Packages (web only; final, confirmed)
| Package | Tokens | Price (PLN) | Effective PLN/token |
|---|---:|---:|---:|
| Starter | 100  | 30   | 0.30 |
| Value   | 500  | 125  | 0.25 |
| Pro     | 1000 | 230  | 0.23 |
| Elite   | 5000 | 1000 | 0.20 |

Notes:
- Prices may display in user’s local currency on web checkout only.  
- App shows tokens only. No PLN/USD in-app.

### 2.3 Deposit and Fees (chat)
- Initial deposit to continue after free messages: **100 tokens**.  
- Split at deposit time using settlement rate:
  - **35% → AVALO** fee, instant, **non‑refundable**.  
  - **65% → escrow** for receiver, released as messages are sent.  
- Unused escrow returns to payer per abandonment rules. Platform fee is never returned.

### 2.4 Word→Token
- **Standard**: **11 words = 1 token**.  
- **Royal advantage**: **7 words = 1 token**, **only for users in the earning role** in the conversation. Applies to women by default in hetero-chats, and to a man if he is the earning side.

### 2.5 Calls
- **Voice**: 5 tokens/min (FREE), 2 tokens/min (VIP/Royal).  
- **Video**: 10 tokens/min (all tiers). Billing every 10s.  
- Chat fee split applies unless noted otherwise: default 35/65 for chat; calls can use 30/70 if specified by business rules. If unspecified, use 35/65 for consistency.

### 2.6 Tips, Subscriptions, Calendar
- **Tips**: 20% platform / 80% creator.  
- **Subscriptions (web 18+)**: 30% platform / 70% creator.  
- **Calendar bookings**: min 100 tokens; **20% platform (non‑refundable)** + **80% escrow to creator**, released on verification.

---

## 3) RELATION & PAYMENT LOGIC (FINAL)
**Hetero:** woman always earns, man always pays.  
**Homo:** initiator pays. Earner determined by “Earn from chat” of the receiver.  
**Non‑binary (NB):** **initiator always pays**. Receiver earns **if** their “Earn from chat” is ON; otherwise AVALO takes 100% of used escrow after fee.

### 3.1 Table (canonical)
| Inicjator             | Odbiorca                      | Kto płaci | Kto zarabia |
|---|---|---|---|
| Mężczyzna → Kobieta   | Kobieta (zarabiająca lub nie) | Mężczyzna | **Kobieta** zawsze |
| Kobieta → Mężczyzna   | Mężczyzna (zarabiający lub nie) | **Mężczyzna** | **Kobieta** zawsze |
| Kobieta ↔ Kobieta     | —                             | Inicjator | Odbiorca jeśli Earn=ON |
| Mężczyzna ↔ Mężczyzna | —                             | Inicjator | Odbiorca jeśli Earn=ON |
| NB → Female           | Female Earn ON → Female earns; OFF → AVALO 100% | NB | Female if Earn=ON |
| Female → NB           | NB Earn ON → NB earns; OFF → AVALO 100%       | Female | NB if Earn=ON |
| NB → Male             | Male Earn ON → Male earns; OFF → AVALO 100%   | NB | Male if Earn=ON |
| Male → NB             | NB Earn ON → NB earns; OFF → AVALO 100%       | Male | NB if Earn=ON |
| NB → NB               | NB2 Earn ON → NB2 earns; OFF → AVALO 100%     | NB1 | NB2 if Earn=ON |

**Rule of simplicity:** Initiator always pays the 100‑token deposit. Receiver earns only if **their** Earn toggle is ON. If neither side earns, AVALO receives 100% of escrow after its upfront fee. Free Chat Pool logic can override deposit for eligible low‑activity cases (ads monetization).

---

## 4) FREE MESSAGES, DEPOSIT, REFUNDS
- **3 free messages per user** at chat start (total 6).  
- After free messages → deposit 100 tokens as above.  
- **Abandonment (48h inactivity):**
  - Earner abandons → unused escrow returned to payer; platform fee kept.  
  - Non‑earner abandons → 50/50 rule if defined; otherwise unused escrow returned to payer; platform fee kept.  
  - Payer abandons → unused escrow to AVALO; platform fee already kept.  
- **Auto‑reload:** OFF by default; threshold <20 tokens; adds 100 tokens when enabled.

---

## 5) ROYAL CLUB & VIP
### 5.1 Royal Club
- **Auto‑grant** when:
  - Instagram linked **and** ≥ **1000 followers**, **or**
  - Monthly earnings ≥ **20 000 tokens**.  
- Benefits:
  - Unlimited swipes, queue bypass, priority, badge, analytics.  
  - **Word ratio advantage:** **7 words = 1 token** when in the earning role.  
  - Same call rates as VIP.
- Loss of status: if Quality Score <70 for 30 days.

### 5.2 VIP
- No ads, better call rates, extras (super likes, boosts, rewind).  
- Text remains 11 words = 1 token.

### 5.3 Free tier
- Core features free: Passport, Incognito, Visitors, Earn toggle visible after verification.

---

## 6) VERIFICATION & ANTI‑ABUSE
### 6.1 Age & identity
- **Required:** Phone/SMS, live selfie with liveness & 18+ estimation.  
- **Optional:** 0.00 PLN bank authorization for higher trust.  
- Badges: Age verified, Photo verified, Bank verified.

### 6.2 Anti‑bot
- reCAPTCHA v3, phone OTP, selfie check.  
- Behavior analytics: message rate, swipe regularity, copy‑paste detection, response latency.  
- Rate limits: 50 msgs/h, 100 swipes/h.  
- Honeypot profiles + shadow bans.  
- Moderator console: review flagged accounts, ban, device/IP blacklist.

### 6.3 AI moderation
- Block terms and euphemisms related to escorting and paid sexual services.  
- Automatic flagging, escalation, and enforcement.

---

## 7) CALENDAR (LEGAL‑SAFE MEETINGS ONLY)
**Purpose:** Tool solely for arranging **legitimate social dates** in public or safe contexts.  
Examples: coffee, dinner, cinema, concert, sports, cultural events.  
**Strictly prohibited:** arranging sexual services, escorting, any sex‑for‑compensation, coded solicitations.  
**AVALO does not** facilitate prostitution, organize escort services, control meetings, or accept responsibility for user actions. Payment covers **platform/time/verification/escrow**, not sexual services.

### 7.1 Enforcement
- Violation → immediate permanent ban, forfeiture of tokens/earnings, cooperation with law enforcement where applicable, potential legal action.

### 7.2 Booking flow
- Booker pays full amount in tokens. **20% platform non‑refundable**, **80% escrow** to creator released on verification (GPS 30m, QR, or selfie).  
- Cancellation policy: ≥24h 50% refund to booker / 30% creator / 20% platform; <24h or after start → 0% booker / 80% creator / 20% platform. Force majeure → manual review.

### 7.3 Mandatory acknowledgment UI
- Checkboxes confirming social purpose and non‑sexual nature.  
- Public venue recommendations. Hotel lobby flagged; private discouraged.

---

## 8) AD SYSTEM (FREE USERS + FREE CHAT POOL)
- **Placements:** Feed native cards, between swipes, in free chats.  
- **Chat free pool:** ads every ~10 messages, header banner, optional interstitial on open/close with frequency cap.  
- **No ads** for VIP/Royal.  
- Model: CPM with safe creative review.

---

## 9) BOTS & AI COMPANIONS (SEPARATE FROM REAL DATING)
Two distinct sections in the app:
- **💕 Dating:** real humans only. Strict anti‑bot.  
- **🤖 AI:** AI companions clearly marked with “AI” badge. No confusion with real users.

### 9.1 AI companions
- Create custom AI avatar/personality.  
- Unlimited text conversations within plan.  
- NSFW tiers only after age verification and only in AI section.  
- Cost control: if image generation or LLM usage creates variable cost, expose tokenized micro‑fees (e.g., avatar preview 10 tokens, regenerate 5 tokens) to offset infra costs. Claude should generate config to read pricing from Firestore `config/aiPricing`.

### 9.2 Clear separation
- Badges in chat list: **👤 Real User** vs **🤖 AI Companion**.  
- No AI accounts in human discovery, no matches with AI.

---

## 10) DISCOVERY, MATCHING, FREE CHAT POOL
- Swipe limits by tier; super likes/boosts per VIP/Royal.  
- Matching factors: distance, age, activity, compatibility, profile quality; VIP/Royal boosts.  
- **Visitors list** is free for all.  
- **Free Chat Pool:** For new/low‑activity users with Earn=OFF; unlimited free text+photos, monetized via ads; exit on activity thresholds.

---

## 11) CHAT UX
- **3 free messages per user** per new chat.  
- After deposit: tokens decrement by words sent from payer to escrow for receiver.  
- Media: photos after deposit; voice 30s=1 token; video/voice calls per rates.  
- Giphy GIFs and audio messages to be implemented; games optional.  
- NSFW male photos blurred until receiver approval.

---

## 12) TECH STACK
- **Mobile:** React Native + Expo SDK 54, TypeScript, Expo Router 6, Zustand.  
- **Web:** Next.js 14 for wallet/subscriptions/creator dashboard/admin panel.  
- **Backend:** Firebase Auth, Firestore, Functions (Node 20 TS), Storage.  
- **Payments:** Stripe primary; plus regional providers and crypto via web.  
- **Infra:** Firebase Hosting + Cloudflare.

---

## 13) FIRESTORE STRUCTURE (ESSENTIAL)
```
users/{uid}
  profile, settings{earnFromChat, incognito, passport}, wallet{balance,pending,earned}, verification

chats/{chatId}
  participants[], status, deposit{amount, paidBy, platformFee, escrowAmount}, billing{currentBalance, totalSpent, wordsSent, tokensSent}
  messages/{messageId}

matches/{matchId} → user1Id, user2Id, chatId, createdAt

transactions/{txId}
  type(purchase/message/call/calendar/tip/subscription), amount, status, metadata{chatId,...}

calendarBookings/{bookingId}
  creatorId, bookerId, price, time, payment{total, platformFee, creatorPayout}, verification, status

config/*
  aiPricing, adRules, callRates, tokenPacks
```

---

## 14) SECURITY RULES (HIGH LEVEL)
- Read profiles if signed in and not blocked.  
- Update own profile only.  
- Chat read/write for participants.  
- Only verified 18+ can toggle Earn.  
- Calendar requires verification and acknowledgments.  
- Admin claims for moderation endpoints.

---

## 15) METRICS
- Tokens purchased/spent/earned; platform fees.  
- Chat completion, avg words/message, copy‑paste rate, quality score.  
- ARPPU, creator earnings distribution, call usage, calendar conversion, ad impressions/CPM.

---

## 16) CONTENT & COMMS PRINCIPLES
- Value‑focused copy. Do not suggest users are motivated by money.  
- No mention of “no Apple/Google fees” in mobile.  
- Fiat prices only on web purchase and payout.  
- In app, show tokens only.

---

## 17) IMPLEMENTATION CHECKLIST FOR CLAUDE CODE
1. Load `.env`, `.firebaserc`, `firebase.json`; keep bindings.  
2. Generate Expo app with auth, discovery, chat, wallet, calls, calendar, feed, ads, settings.  
3. Generate Next.js web for wallet, subscriptions, creator dashboard, admin.  
4. Implement payment webhooks and Firestore state updates.  
5. Implement AI moderation and anti‑bot pipeline.  
6. Implement Royal/VIP gating and word‑ratio logic.  
7. Add config collections for token packs, call rates, aiPricing.  
8. Provide README with local run, emulators, and deploy commands.  
9. Ask for `/approve` before writing files.

---

## 18) CONFIG (USER‑SUPPLIED)
> Use these values as environment and client config. Do not echo secrets in logs. Store server secrets only in Functions config or .env (not shipped to client).

### 18.1 Firebase Web Config
```
project_id: avalo-c8c46
project_number: 445933516064
api_key: AIzaSyAv1vV0AECAHTG-86X6_GUj1fwy-o2WhDM
auth_domain: avalo-c8c46.firebaseapp.com
storage_bucket: avalo-c8c46.firebasestorage.app
messaging_sender_id: 445933516064
app_id: 1:445933516064:web:4d3d8b79a7af89ce2e9345
measurement_id: G-Q39Q3VETQG
```

### 18.2 Google OAuth
```
client_id: YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE
client_secret:  YOUR_GOOGLE_OAUTH_CLIENT_SECRET_HERE
```

### 18.3 Stripe
```
publishable_key: YOUR_STRIPE_SECRET_KEY_HERE
secret_key:       YOUR_STRIPE_SECRET_KEY_HERE
webhook_secret:   YOUR_WEBHOOK_SECRET_KEY_HERE
```

> Claude Code: keep Stripe secret & webhook only server-side (Functions config). Use publishable key in client.

---

## 19) COPY BLOCKS (APPROVED MESSAGING)
- **Deposit explainer:** “Deposit 100 tokens. 35 tokens are a platform fee. 65 tokens fund this chat. Unused tokens are refunded per policy.”  
- **Why pay:** “This chat shows potential. Continue the conversation with confidence.”  
- **Web purchase:** “Buy token packages on the web for better options and instant delivery.”  
- **Calendar notice:** “Bookings are for social dates in public settings. Sexual services are strictly prohibited.”  
- **AI section header:** “AI Companions — practice conversations and explore personalities. Real dating is separate.”

---

## 20) FINAL NOTES FOR CODEGEN
- Use Firestore transactions for deposits and word‑based decrements.  
- Compute word counts reliably; exclude URLs and emojis from word cost if configured.  
- Enforce initiator‑pays rule at chat creation.  
- Enforce female‑earns rule in hetero by role assignment.  
- NB logic per table above.  
- Unit tests for fee splits, refunds, and abandonment.

