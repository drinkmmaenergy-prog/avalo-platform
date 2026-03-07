# SOT_SPLITS_MATRIX.md — Revenue Split Matrix (All Surfaces)

**Generated:** 2026-03-05  
**Rule:** Do NOT assume 65/35 globally. Each surface has its own canonical split.

---

## Master Split Table

| # | Surface | Creator % | Avalo % | Canonical Source File | Conflicting Files |
|---|---|---|---|---|---|
| 1 | **Chat (human, paid messages)** | 65 | 35 | [`types/canonical-chat.types.ts`](../functions/src/types/canonical-chat.types.ts:107) | [`app-web/src/lib/economyConfig.ts`](../app-web/src/lib/economyConfig.ts:14) → 70/30 |
| 2 | **Chat (media messages)** | 65 | 35 | [`chatMediaMonetization.ts`](../functions/src/chatMediaMonetization.ts:149) | [`media.ts`](../functions/src/media.ts:441) → 80/20 |
| 3 | **Tips** | 90 | 10 | [`pack277-wallet-service.ts`](../functions/src/pack277-wallet-service.ts:48) | [`config/monetization.ts`](../functions/src/config/monetization.ts:42) → 80/20 |
| 4 | **Media unlock (paid media)** | 65 | 35 | [`paidMedia.ts`](../functions/src/paidMedia.ts:73), [`premiumStories.ts`](../functions/src/premiumStories.ts:24) | [`media.ts`](../functions/src/media.ts:441) → 80/20 |
| 5 | **Content unlock (gated)** | 65 | 35 | [`creatorMode.ts`](../functions/src/creatorMode.ts:44) | [`webOperations.ts`](../functions/src/webOperations.ts:80) → 70/30 |
| 6 | **Subscriptions** | 70 | 30 | [`config.ts`](../functions/src/config.ts:36) | — |
| 7 | **Calls (voice)** | 80 | 20 | [`pack354-influencer-service.ts`](../functions/src/pack354-influencer-service.ts:230), [`config/monetization.ts`](../functions/src/config/monetization.ts:16) | [`pack345-types.ts`](../functions/src/pack345-types.ts:158) → 65/35 |
| 8 | **Calls (video)** | 80 | 20 | [`pack354-influencer-service.ts`](../functions/src/pack354-influencer-service.ts:230), [`config/monetization.ts`](../functions/src/config/monetization.ts:16) | [`pack345-types.ts`](../functions/src/pack345-types.ts:164) → 65/35 |
| 9 | **Calendar (1:1 meetings)** | 80 | 20 | [`pack286-calendar-events-economics.ts`](../functions/src/pack286-calendar-events-economics.ts:33) | — |
| 10 | **Events (tickets)** | 80 | 20 | [`pack286-calendar-events-economics.ts`](../functions/src/pack286-calendar-events-economics.ts:34) | — |
| 11 | **Live streams (gifts/tips)** | 70 | 30 | [`config/liveMonetization.ts`](../functions/src/config/liveMonetization.ts:182) | [`liveVipRoom.ts`](../functions/src/liveVipRoom.ts:244) → 80/20 |
| 12 | **Live VIP rooms** | 80 | 20 | [`liveVipRoom.ts`](../functions/src/liveVipRoom.ts:244) | [`config/liveMonetization.ts`](../functions/src/config/liveMonetization.ts:182) → 70/30 |
| 13 | **AI companions (chat/bot)** | 80 | 20 | [`aiChatEngine.ts`](../functions/src/aiChatEngine.ts:40), [`aiBotEngine.ts`](../functions/src/aiBotEngine.ts:42) | [`aiCompanionFunctions.ts`](../functions/src/aiCompanionFunctions.ts:405) → 65/35 |
| 14 | **Boosts (creator products)** | 65 | 35 | [`pack347-boost-products.ts`](../functions/src/pack347-boost-products.ts:74) | — |
| 15 | **Boosts (promo bundles, Avalo-only)** | 0 | 100 | [`pack327-types.ts`](../functions/src/pack327-types.ts:183) | — |
| 16 | **Drops** | 70 | 30 | [`dropsEngine.ts`](../functions/src/dropsEngine.ts:39) | — |
| 17 | **Avatar templates (marketplace)** | 65 | 35 | [`types/pack331-ai-avatar-template.types.ts`](../functions/src/types/pack331-ai-avatar-template.types.ts:187) | — |
| 18 | **Goals (support goals)** | 70 | 30 | [`types/goals.ts`](../functions/src/types/goals.ts:233) | Should verify if this is correct vs 65/35 |
| 19 | **Webinars** | 65 | 35 | [`pack-198-webinars/validation.ts`](../functions/src/pack-198-webinars/validation.ts:377) | — |
| 20 | **Reservations** | 65 | 35 | [`reservations.ts`](../functions/src/reservations.ts:121) | — |
| 21 | **Agency earnings (from creator's share)** | Variable | 35 (fixed) | [`pack114-agency-engine.ts`](../functions/src/pack114-agency-engine.ts:630) | Agency takes % from creator's 65% |
| 22 | **Brand products** | Variable | Variable | [`brands/brandProducts.ts`](../functions/src/brands/brandProducts.ts:526) | Custom per collaboration |

---

## Conflict Summary

| Conflict ID | Surface | Values Found | Files |
|---|---|---|---|
| SPLIT-C01 | Chat | 65/35, **70/30** | canonical-chat.types vs app-web/economyConfig |
| SPLIT-C02 | Tips | 90/10, **80/20** | pack277-wallet-service vs config/monetization |
| SPLIT-C03 | Calls | 80/20, **65/35** | pack354 vs pack345-types |
| SPLIT-C04 | Live streams | 70/30, **80/20** | liveMonetization vs liveVipRoom |
| SPLIT-C05 | AI companions | 80/20, **65/35** | aiChatEngine vs aiCompanionFunctions |
| SPLIT-C06 | Media unlock | 65/35, **80/20** | chatMediaMonetization vs media.ts |
| SPLIT-C07 | Content unlock | 65/35, **70/30** | creatorMode vs webOperations |
| SPLIT-C08 | KPI reporting | uses **70/30** globally | pack402-kpi-service (should use per-surface) |

---

## Cross-Reference: Declared Split Sources

### Files declaring splits for MULTIPLE surfaces (authority candidates):

| File | Surfaces | Status |
|---|---|---|
| [`types/pack303-creator-earnings.types.ts`](../functions/src/types/pack303-creator-earnings.types.ts:237) | Chat, Calls, Calendar, Events, Other | ✅ Consistent with canonical |
| [`types/pack304-admin-finance.types.ts`](../functions/src/types/pack304-admin-finance.types.ts:262) | Chat, Calls, Calendar, Events, Other | ✅ Consistent with canonical |
| [`pack354-influencer-service.ts`](../functions/src/pack354-influencer-service.ts:228) | Chat, Calls, Calendar, Events, Tips | ✅ Consistent (except calls 80/20 differs from pack345) |
| [`pack345-types.ts`](../functions/src/pack345-types.ts:150) | Chat, Voice, Video, Calendar, Events, Tips, Gifts | ⚠️ Voice/Video at 65/35 conflicts |
| [`pack277-wallet-service.ts`](../functions/src/pack277-wallet-service.ts:39) | Media, Calendar/Events, Tips, Avalo-only | ✅ Most detailed per-context split |

---

## Recommended Canonical Splits (pending business owner confirmation)

| Surface | Creator | Avalo | Confidence |
|---|---|---|---|
| Chat | 65 | 35 | ✅ High (canonical-chat.types, pack303, pack304) |
| Calls (voice/video) | 80 | 20 | 🟡 Medium (pack354, monetization.ts say 80/20; pack345 says 65/35) |
| Calendar / Events | 80 | 20 | ✅ High (pack286, pack303, pack304) |
| Tips | 90 | 10 | 🟡 Medium (pack277 says 90/10; monetization.ts says 80/20) |
| Subscriptions | 70 | 30 | ✅ High (config.ts only declaration) |
| Live streams | 70 | 30 | 🟡 Medium (liveMonetization says 70/30; liveVipRoom says 80/20) |
| AI companions | 80 | 20 | 🟡 Medium (aiChatEngine says 80/20; aiCompanionFunctions says 65/35) |
| Digital products | 65 | 35 | ✅ High (chatMediaMonetization, paidMedia, premiumStories) |
| Boosts (creator) | 65 | 35 | ✅ High |
| Boosts (promo) | 0 | 100 | ✅ High |
| Drops | 70 | 30 | ✅ High |
| Marketplace (avatars) | 65 | 35 | ✅ High |
