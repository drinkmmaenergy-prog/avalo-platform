# CONFLICT MAP — Existing Code vs Canonical Monetization Spec

> **Date:** 2026-03-02
> **Reference:** `avalo/docs/CANONICAL_MONETIZATION_SPEC.md`
> **Method:** Full codebase audit against canonical rules

Each entry lists the **file**, **line(s)**, **what's wrong**, and **required action**.

---

## CRITICAL — Parallel Engines (Must Remove/Redirect)

### C-01: DUPLICATE `determineChatRoles()` in `chats.ts`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/chats.ts` |
| **Lines** | 20–58 |
| **Violation** | Parallel role-determination engine that conflicts with canonical `chatMonetization.ts` |
| **Details** | This function: (a) always assigns female as earner in hetero regardless of `earn_on` status (line 48–49); (b) never checks `influencerBadge`; (c) uses `receiver.modes?.earnFromChat` field name instead of canonical `earnOnChat`; (d) has no free-pool logic. This is a **second engine** running alongside `chatMonetization.ts:determineChatRoles()`. |
| **Action** | Remove this function. All callers in `chats.ts` must delegate to `chatMonetization.determineChatRoles()`. |

### C-02: DUPLICATE billing direction in `chats.ts`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/chats.ts` |
| **Lines** | 285–286 |
| **Violation** | Bills payer's messages: `if (senderUid === chat.roles.payer && tokensCharged > 0)` |
| **Details** | Canonical rule: only **earner's** words are billable. Payer's messages must cost 0. This code charges the payer for payer's own messages — the opposite of canonical billing direction. |
| **Action** | Remove this billing path. All message billing must go through `chatMonetization.processMessageBilling()` which correctly checks `senderId === roles.earnerId`. |

---

## CRITICAL — Wrong Constants

### C-03: Free messages per participant = 3 (should be 9 standard / 5 Royal)

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/chatMonetization.ts` |
| **Lines** | 95 |
| **Violation** | `FREE_MESSAGES_PER_PARTICIPANT = 3` |
| **Canonical** | Standard: 9; Royal (earner has Royal): 5 |
| **Action** | Replace with two constants: `FREE_MESSAGES_STANDARD = 9` and `FREE_MESSAGES_ROYAL = 5`. Update `initializeChat()` (line 459) and `processMessageBilling()` (line 631, 634, 649, 651) to use the correct constant based on earner's Royal status. |

### C-04: Free messages per user = 3 in config.ts

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/config.ts` |
| **Lines** | 13 |
| **Violation** | `CHAT_FREE_MESSAGES_PER_USER = 3` |
| **Canonical** | 9 (standard) / 5 (Royal earner) |
| **Action** | Replace with `CHAT_FREE_MESSAGES_STANDARD = 9` and `CHAT_FREE_MESSAGES_ROYAL = 5`. Update all consumers. |

### C-05: Hardcoded `freeMessagesRemaining: 6` in feedDiscovery.ts

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/feedDiscovery.ts` |
| **Lines** | 871 |
| **Violation** | `freeMessagesRemaining: 6` — hardcoded wrong value, also shared not per-participant |
| **Canonical** | Must be per-participant (9 each for standard, 5 each for Royal earner) |
| **Action** | Remove this hardcoded initialization. Chat creation must delegate to `chatMonetization.initializeChat()` which sets per-participant free messages. |

### C-06: Free pool message limit = 50 (should be 20)

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/chatMonetization.ts` |
| **Lines** | 96 |
| **Violation** | `FREE_B_MESSAGE_LIMIT = 50` |
| **Canonical** | 20 free messages per user for other non-earning profiles |
| **Action** | Change to `FREE_POOL_OTHER_MESSAGE_LIMIT = 20`. |

### C-07: FREE_A mode is unlimited (should be 4 chats per 72h)

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/chatMonetization.ts` |
| **Lines** | 184–193, 260–268, 326–328, 652–661 |
| **Violation** | `FREE_A` mode sets `freeMessageLimit: Infinity` and the state machine lets chats stay free forever. |
| **Canonical** | Low-popularity non-earning women: **4 random free chats per 72 hours** (region-based if possible). Not unlimited. |
| **Action** | Replace `FREE_A` unlimited logic with a rate-limited system: track free-chat count per user per 72h window, reject after 4. Remove `Infinity` and `FREE_A stays free forever` path at line 652–661. |

### C-08: Multiplier list missing values [4, 7, 12]

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/types/pack452-monetization-vnext.types.ts` |
| **Lines** | 50 |
| **Violation** | `PREMIUM_MULTIPLIERS = [2, 3, 5, 10, 15, 20]` |
| **Canonical** | `[2, 3, 4, 5, 7, 10, 12, 15, 20]` |
| **Action** | Add missing values: 4, 7, 12. Update the type and all validators. |

### C-09: Multiplier list in smoke tests

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/__tests__/pack452-smoke-tests.ts` |
| **Lines** | 225–226 |
| **Violation** | `expect([...PREMIUM_MULTIPLIERS]).toEqual([2, 3, 5, 10, 15, 20])` |
| **Action** | Update expected array to `[2, 3, 4, 5, 7, 10, 12, 15, 20]`. |

---

## CRITICAL — Wrong Revenue Split in Config

### C-10: `EARN_TO_CHAT_CONFIG` uses 80/20 split

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/config/monetization.ts` |
| **Lines** | 14–23 |
| **Violation** | `CREATOR_SPLIT: 0.80` / `AVALO_CUT: 0.20` |
| **Canonical** | 35% Avalo fee at deposit, 65% escrow. Earner receives 100% of escrow consumed. No additional 80/20 cut. |
| **Action** | Remove or rewrite `EARN_TO_CHAT_CONFIG`. The canonical split is: 35% fee at deposit, earner gets 100% consumed escrow. If any code references `EARN_TO_CHAT_CONFIG.CREATOR_SPLIT` or `AVALO_CUT`, it must be redirected to the canonical deposit-time 35/65 model. |

### C-11: `callBilling.ts` applies 65/35 split at billing time

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/callBilling.ts` |
| **Lines** | 32–33 |
| **Violation** | `EARNER_SPLIT = 0.65` / `AVALO_SPLIT = 0.35` — applied per-minute at billing time |
| **Details** | This splits each call billing event 65/35. Under canonical rules for chat, the 35% is taken at deposit only and the earner gets 100% of consumed escrow. Call billing is a separate domain but should be reviewed for consistency. |
| **Action** | Review: if call billing is intended to follow the same canonical deposit→escrow→consume model, this must change to deposit-time fee. If calls have a separate spec, document it explicitly. |

### C-12: `chatMediaMonetization.ts` applies 65/35 at media billing time

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/chatMediaMonetization.ts` |
| **Lines** | 148–150, 210–214 |
| **Violation** | `earnerPercent: 65` / `platformPercent: 35` applied per-media-message |
| **Details** | If media is billed from the same escrow wallet (which already had 35% extracted), this constitutes double-dipping. |
| **Action** | Media messages within a chat must consume from the same escrow (already 35% fee-deducted). The earner receives 100% of escrow consumed. Remove the additional 65/35 split at media billing time. |

---

## CRITICAL — Missing Acceptance Flow

### C-13: No earner acceptance flow exists

| Field | Value |
|-------|-------|
| **Files** | `avalo/functions/src/chatMonetization.ts`, `avalo/functions/src/matchingEngine.ts`, `avalo/functions/src/feedDiscovery.ts` |
| **Violation** | Chats go directly from match to `FREE_ACTIVE` or `active` without earner acceptance. |
| **Canonical** | Earner must explicitly accept a chat to move from `MATCHED` → `PENDING_ACCEPTANCE` → `FREE_ACTIVE`. Earner may decline. Chats can queue. |
| **Details** | `matchingEngine.ts` (lines 192, 211) sets status directly to `"active"`. `feedDiscovery.ts` (line 870) sets `status: "active"`. `chatMonetization.ts:initializeChat()` sets `state: 'FREE_ACTIVE'` directly. |
| **Action** | Add `PENDING_ACCEPTANCE` state. Add earner accept/decline endpoints. Modify `initializeChat()` to start in `MATCHED` → wait for earner action. Add queue management for pending chats. |

---

## HIGH — Competing Pricing Engines

### C-14: PACK 242 dynamic pricing conflicts with earner-set deposit

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/dynamicChatPricing.ts` |
| **Lines** | 3–12, entire file |
| **Violation** | Implements algorithmic pricing tiers (Standard 100, Glow 120, Desire 175, Star 250, Royal 350, Fantasy 500) based on demand/chemistry/rank metrics. |
| **Canonical** | Earner may set higher deposit for next session (never below 100). No algorithmic override. |
| **Action** | Remove PACK 242 dynamic pricing engine. Replace with simple earner-set deposit that PACK 452 entry threshold already supports (`pack452-entry-threshold.ts`). Remove `getPack242ChatEntryPrice` and `calculatePack242RevenueSplit` imports from `chatMonetization.ts` (line 24). |

### C-15: Dual deposit calculation in `chatMonetization.ts`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/chatMonetization.ts` |
| **Lines** | 767–774 |
| **Violation** | `depositAmount = Math.max(pack452EntryTokens, pack242Price)` — two competing systems determine deposit |
| **Action** | Remove PACK 242 price lookup. Deposit = earner's configured entry threshold (via PACK 452) with `MIN = 100`. Single source. |

---

## HIGH — Promo Code / Discount Systems (PROHIBITED)

### C-16: Full promo code engine in `walletFintech.ts`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/walletFintech.ts` |
| **Lines** | 403–426, 523–606 |
| **Violation** | Complete promo code system: `applyPromoCode` callable, percentage/fixed/bonus_tokens types, `promoCodes` Firestore collection |
| **Canonical** | "Discounts/promo codes/free token grants are prohibited." |
| **Action** | Remove or disable the `applyPromoCode` callable function and all promo code processing logic. If the Firestore collection `promoCodes` has data, it should be archived and the collection deprecated. |

### C-17: Full promo code engine in `dynamicPricing.ts`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/dynamicPricing.ts` |
| **Lines** | 145–148, 355–398, 441–476, 587–644 |
| **Violation** | `PromoCode` interface, `applyPromoCode()` function, loyalty discount logic, `validatePromoCode` endpoint |
| **Action** | Remove all promo code and loyalty discount logic from this file. |

### C-18: Partner coupon system in `pack434-partner-expansion.ts`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/pack434-partner-expansion.ts` |
| **Lines** | 483–570, 601+ |
| **Violation** | `createPartnerCoupon()`, `redeemPartnerCoupon()`, `partner_coupons` collection, `coupon_usages` collection |
| **Action** | Remove coupon creation and redemption functions. Archive Firestore collections. |

### C-19: Token pack discounts in `pack381-regional-pricing.ts`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/pack381-regional-pricing.ts` |
| **Lines** | 180–187 |
| **Violation** | Token packs with `discount: 5`, `discount: 10`, `discount: 15`, `discount: 20`, `discount: 25` |
| **Action** | Remove all discount fields from token pack definitions. All packs must be at full price. |

### C-20: Token pack discounts in `pack425-pricing-matrix.ts`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/pack425-pricing-matrix.ts` |
| **Lines** | 97–102 |
| **Violation** | `discount: 5`, `discount: 10`, `discount: 15`, `discount: 20` on token packs |
| **Action** | Remove all discount fields. |

### C-21: Digital product discounts in `pack166-scalability.ts`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/pack166-scalability.ts` |
| **Lines** | 648–729 |
| **Violation** | Full discount creation/management system for digital products |
| **Details** | While this is for creator digital products (not chat tokens), the canonical spec says discounts prohibited. Clarify scope: if this only applies to chat/token pricing, these may be allowed. If global, must be removed. |
| **Action** | **Clarification needed.** If "discounts prohibited" applies only to chat/token/monetization discounts, keep but ring-fence. If applies globally, remove. |

### C-22: Creator event subscription discounts in `pack435-creator-events.ts`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/pack435-creator-events.ts` |
| **Lines** | 512–545 |
| **Violation** | `createSubscriptionUpsell()` with `discountPercent` parameter |
| **Action** | Same clarification as C-21. If discount prohibition is global, remove. |

### C-23: Dynamic offer orchestrator in `pack442/dynamicOfferOrchestrator.ts`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/pack442/dynamicOfferOrchestrator.ts` |
| **Lines** | entire file |
| **Violation** | Creates time-limited discount offers with `discountPercent`, `discountedPrice` |
| **Action** | Remove or disable if discount prohibition is global. |

---

## MEDIUM — Meeting Engine Fee Split Conflict

### C-24: `meetEngine.ts` uses 20/80 split (not 35/65)

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/meetEngine.ts` |
| **Lines** | 292–293 |
| **Violation** | `avaloFee = Math.floor(price * 0.2)` / `escrowAmount = Math.floor(price * 0.8)` |
| **Compared to** | `meetingMonetization.ts` lines 29–30: `PLATFORM_FEE_PERCENT: 35` / `ESCROW_PERCENT: 65` |
| **Details** | Two different meeting engines with two different fee structures. The meeting canonical split is not explicitly in this chat spec but should be unified. |
| **Action** | Determine which is canonical for meetings. Remove the other. If meeting split is 35/65 (matching chat), fix `meetEngine.ts`. If 20/80, fix `meetingMonetization.ts`. **Must have a single meeting engine.** |

---

## MEDIUM — Field Name Inconsistencies

### C-25: `earnOnChat` vs `modes.earnFromChat` vs `earnsFromChat`

| Files | Field Used |
|-------|-----------|
| `chatMonetization.ts:976` | `user.modes?.earnFromChat` |
| `chats.ts:55` | `receiver.modes?.earnFromChat` |
| `fanClubs.ts:151` | `userDoc.data()?.earnOnChat` |
| `liveBroadcasts.ts:172` | `creatorDoc.data()?.earnOnChat` |
| `goalsEngine.ts:111` | `userData?.modes?.earnFromChat \|\| userData?.earnOnChat` |
| `dropsEngine.ts:126` | `creatorData?.modes?.earnFromChat \|\| creatorData?.earnOnChat` |
| `creator/earnings.ts:193` | `creatorDoc.data()?.earnsFromChat` |
| `dynamicChatPricing.ts:631` | `where('modes.earnFromChat', '==', true)` |

| **Violation** | Multiple field names refer to the same concept |
| **Action** | Canonicalize to a single field name (recommend `earnOnChat` as the profile-level field). Add a migration or compatibility layer. All queries and reads must reference the same field. |

---

## MEDIUM — Influencer Badge Field Inconsistency

### C-26: `influencerBadge` field access varies

| File | Access Pattern |
|------|---------------|
| `chatMonetization.ts:977` | `user.badges?.some((b: any) => b.type === 'influencer')` |
| `chatMonetization.ts:76` | Interface declares `influencerBadge: boolean` |
| `liveEngine.ts:987` | `host?.influencerBadge` |

| **Violation** | The profile builder (line 977) derives `influencerBadge` from an array lookup, but other code reads it directly. These could desync. |
| **Action** | Ensure `influencerBadge` is a consistent top-level boolean on user profile, or ensure the array lookup is always used. Document the canonical path. |

---

## MEDIUM — Royal Free Message Difference Not Implemented

### C-27: No Royal-tier free message differentiation

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/chatMonetization.ts` |
| **Lines** | 95, 459–460 |
| **Violation** | `FREE_MESSAGES_PER_PARTICIPANT = 3` used uniformly — no check for Royal earner tier |
| **Canonical** | Standard: 9 free messages; Royal earner: 5 free messages |
| **Action** | When initializing chat, check if earner has Royal. If yes, both participants get 5 free messages. Otherwise, both get 9. |

---

## LOW — Informational Conflicts

### C-28: `matchingEngine.ts` uses `FREE_MESSAGES_PER_CHAT` (shared, not per-participant)

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/matchingEngine.ts` |
| **Lines** | 86, 193, 211, 259 |
| **Violation** | `freeMessagesRemaining` as a single shared counter |
| **Canonical** | Free messages are per-participant |
| **Action** | Redirect chat initialization to `chatMonetization.initializeChat()`. |

### C-29: PACK 452 `ENTRY_THRESHOLD_LIMITS.HARD_CAP = 50_000`

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/types/pack452-monetization-vnext.types.ts` |
| **Lines** | 42 |
| **Details** | 50,000 token hard cap. Not contradicted by canonical spec but should be explicitly confirmed or adjusted. |
| **Action** | Confirm 50,000 is acceptable as maximum earner-set deposit. |

### C-30: `chatMonetization.ts` uses `Math.round` for token calculation

| Field | Value |
|-------|-------|
| **File** | `avalo/functions/src/chatMonetization.ts` |
| **Lines** | 373 |
| **Violation** | `Math.round(wordCount / roles.wordsPerToken)` — canonical examples use `ceil()` |
| **Action** | Change to `Math.ceil()` to match canonical spec examples (ensures minimum 1 token per bucket). |

---

## Summary Table

| ID | Severity | File | Issue |
|----|----------|------|-------|
| C-01 | 🔴 CRITICAL | `chats.ts:20-58` | Parallel `determineChatRoles()` — wrong hetero logic, no influencer check |
| C-02 | 🔴 CRITICAL | `chats.ts:285-286` | Bills payer's messages instead of earner's |
| C-03 | 🔴 CRITICAL | `chatMonetization.ts:95` | Free messages = 3 (should be 9/5) |
| C-04 | 🔴 CRITICAL | `config.ts:13` | Free messages = 3 |
| C-05 | 🔴 CRITICAL | `feedDiscovery.ts:871` | Hardcoded freeMessagesRemaining: 6 |
| C-06 | 🔴 CRITICAL | `chatMonetization.ts:96` | Free pool limit = 50 (should be 20) |
| C-07 | 🔴 CRITICAL | `chatMonetization.ts:184-193,652-661` | FREE_A unlimited (should be 4 chats/72h) |
| C-08 | 🔴 CRITICAL | `pack452-monetization-vnext.types.ts:50` | Multipliers missing [4,7,12] |
| C-09 | 🔴 CRITICAL | `pack452-smoke-tests.ts:225-226` | Test expects wrong multiplier list |
| C-10 | 🔴 CRITICAL | `config/monetization.ts:14-23` | 80/20 split (should be 35/65 at deposit) |
| C-11 | 🟡 HIGH | `callBilling.ts:32-33` | 65/35 applied at billing time (review needed) |
| C-12 | 🔴 CRITICAL | `chatMediaMonetization.ts:148-150` | 65/35 double-dip on media in escrow-based chat |
| C-13 | 🔴 CRITICAL | multiple files | No acceptance flow (MATCHED→accept→active) |
| C-14 | 🟡 HIGH | `dynamicChatPricing.ts` (entire) | Algorithmic pricing overrides earner-set deposit |
| C-15 | 🟡 HIGH | `chatMonetization.ts:767-774` | Dual deposit calculation (PACK 242 + 452) |
| C-16 | 🟡 HIGH | `walletFintech.ts:403-606` | Active promo code system (prohibited) |
| C-17 | 🟡 HIGH | `dynamicPricing.ts:145-398,587-644` | Promo codes + loyalty discounts (prohibited) |
| C-18 | 🟡 HIGH | `pack434-partner-expansion.ts:483-570` | Partner coupon system (prohibited) |
| C-19 | 🟡 HIGH | `pack381-regional-pricing.ts:180-187` | Token pack discounts (prohibited) |
| C-20 | 🟡 HIGH | `pack425-pricing-matrix.ts:97-102` | Token pack discounts (prohibited) |
| C-21 | 🟠 MEDIUM | `pack166-scalability.ts:648-729` | Digital product discounts (clarify scope) |
| C-22 | 🟠 MEDIUM | `pack435-creator-events.ts:512-545` | Event subscription discounts (clarify scope) |
| C-23 | 🟠 MEDIUM | `pack442/dynamicOfferOrchestrator.ts` | Dynamic discount offers (clarify scope) |
| C-24 | 🟠 MEDIUM | `meetEngine.ts:292-293` | 20/80 split vs meetingMonetization 35/65 |
| C-25 | 🟠 MEDIUM | multiple files | Field name: `earnOnChat` vs `modes.earnFromChat` vs `earnsFromChat` |
| C-26 | 🟠 MEDIUM | multiple files | `influencerBadge` access pattern inconsistency |
| C-27 | 🟠 MEDIUM | `chatMonetization.ts:95,459` | No Royal-tier free message differentiation |
| C-28 | 🟢 LOW | `matchingEngine.ts:86,193,211` | Shared free message counter (not per-participant) |
| C-29 | 🟢 LOW | `pack452 types:42` | 50k hard cap — confirm or adjust |
| C-30 | 🟢 LOW | `chatMonetization.ts:373` | `Math.round` should be `Math.ceil` |

---

**Total conflicts: 30**
- 🔴 CRITICAL: 12
- 🟡 HIGH: 8
- 🟠 MEDIUM: 7
- 🟢 LOW: 3

---

*END OF CONFLICT MAP*
