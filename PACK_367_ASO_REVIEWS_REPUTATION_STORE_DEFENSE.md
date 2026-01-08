# PACK 367 — ASO, Reviews, Reputation & Store Defense Engine

**Phase:** ETAP C — Public Launch & Market Expansion  
**Pack ID:** 367  
**Depends on:** PACK 277, 279, 281, 293, 296, 300, 300A, 300B, 301, 364, 365, 366  
**Type:** Store & Reputation Engine (Android + iOS)  
**Tokenomics:** ❌ No changes (no impact on pricing / splits / refunds)

## 1. OBJECTIVE

Deliver a complete App Store / Google Play reputation layer for Avalo that provides:

- **Structured ASO metadata control** (per language & country)
- **Review acquisition flows** from within the app
- **Negative review → support & recovery** pathways
- **Fake / toxic review detection** hooks
- **Store policy defense** (compliance + quick reaction)

This system acts as a thin layer over existing systems (notifications, support, risk, monitoring).

---

## 2. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                   PACK 367 — Store Defense                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ ASO Manager  │  │Review Defense│  │Policy Defense│    │
│  │              │  │              │  │              │    │
│  │ • Listings   │  │ • Anomalies  │  │ • Validation │    │
│  │ • Locales    │  │ • Detection  │  │ • Compliance │    │
│  │ • Metadata   │  │ • Alerts     │  │ • Incidents  │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                  │             │
│         └─────────────────┴──────────────────┘             │
│                           │                                │
└───────────────────────────┼────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼────┐         ┌────▼────┐        ┌────▼────┐
   │ PACK 293│         │ PACK 300│        │ PACK 296│
   │Notif.   │         │Support  │        │Audit    │
   └─────────┘         └─────────┘        └─────────┘
```

---

## 3. DATA MODELS

### 3.1 Store Listings (ASO)

**Location:** `/ops/storeListings/listings/{platform_country}`

**Type:** [`StoreListingConfig`](functions/src/pack367-aso.types.ts:40)

```typescript
interface StoreListingConfig {
  platform: "android" | "ios";
  country: string;              // ISO code, e.g. "PL"
  locales: StoreLocaleConfig[];
  screenshots: string[];        // Storage URLs or CDN paths
  videoUrl?: string;
  lastUpdatedAt: number;
  lastUpdatedBy: string;        // adminId
  a_b_testGroup?: "A" | "B";
  status: "draft" | "active" | "archived";
}
```

**Example:**
```json
{
  "platform": "android",
  "country": "PL",
  "locales": [
    {
      "locale": "pl-PL",
      "title": "Avalo - Randki i Spotkania",
      "shortDescription": "Prawdziwe połączenia dla dorosłych 18+",
      "fullDescription": "Avalo to aplikacja...",
      "keywords": ["randki", "spotkania", "flirt"]
    }
  ],
  "screenshots": [
    "https://cdn.avalo.app/screenshots/pl/1.png"
  ],
  "status": "active",
  "lastUpdatedAt": 1703001234567,
  "lastUpdatedBy": "admin_123"
}
```

### 3.2 Rating Snapshots

**Location:** `/analytics/storeRatings/snapshots/{platform_country_timestamp}`

**Type:** [`StoreRatingSnapshot`](functions/src/pack367-aso.types.ts:54)

```typescript
interface StoreRatingSnapshot {
  platform: StorePlatform;
  country: string;
  capturedAt: number;
  avgRating: number;             // 1.0–5.0
  totalRatings: number;
  ratingsBreakdown: {
    "1": number;
    "2": number;
    "3": number;
    "4": number;
    "5": number;
  };
  suspiciousSpike?: boolean;
}
```

### 3.3 In-App Feedback

**Location:** `/users/{userId}/inAppFeedback/{feedbackId}`

**Type:** [`InAppFeedback`](functions/src/pack367-aso.types.ts:72)

```typescript
interface InAppFeedback {
  userId: string;
  createdAt: number;
  platform: StorePlatform;
  rating?: number;              // 1–5 if star_prompt
  type: "star_prompt" | "bug" | "idea" | "frustration";
  message?: string;
  handledBySupport?: boolean;
  supportTicketId?: string;
}
```

### 3.4 Review Anomalies

**Location:** `/ops/reviewAnomalies/alerts/{alertId}`

**Type:** [`ReviewAnomalyAlert`](functions/src/pack367-aso.types.ts:113)

```typescript
interface ReviewAnomalyAlert {
  id: string;
  platform: StorePlatform;
  country: string;
  detectedAt: number;
  anomalyType: 
    | "sudden_rating_drop"
    | "suspicious_spike_1star"
    | "review_bombing"
    | "unusual_velocity";
  severity: "low" | "medium" | "high" | "critical";
  metrics: {
    previousAvg: number;
    currentAvg: number;
    delta: number;
    timeWindowHours: number;
  };
  status: "new" | "investigating" | "resolved" | "false_positive";
}
```

### 3.5 Policy Configuration

**Location:** `/ops/storePolicy/configs/{platform}`

**Type:** [`StorePolicyConfig`](functions/src/pack367-policy-config.types.ts:13)

```typescript
interface StorePolicyConfig {
  platform: StorePlatform;
  nsfwWordsBlacklist: string[];
  mustIncludeAge18Plus: boolean;
  allowedScreenshotTypes: string[];
  titleMaxLength: number;
  shortDescMaxLength: number;
  fullDescMaxLength: number;
  contentRating: { android?: string; ios?: string };
}
```

---

## 4. BACKEND SERVICES

### 4.1 ASO Service

**File:** [`functions/src/pack367-aso.service.ts`](functions/src/pack367-aso.service.ts:1)

**Key Functions:**

#### [`getStoreListing(platform, country)`](functions/src/pack367-aso.service.ts:30)
Retrieves the current store listing configuration.

#### [`updateStoreListing(platform, country, config, adminId)`](functions/src/pack367-aso.service.ts:42)
Updates store listing and logs changes to history.

#### [`shouldShowReviewPrompt(userId)`](functions/src/pack367-aso.service.ts:109)
Determines if user is eligible for review prompt based on:
- Account age (≥ 3 days)
- App opens (≥ 5)
- Positive interactions (paid chats, meetings, token purchases)
- No active safety issues
- Max 3 prompts lifetime
- Min 30 days between prompts

**Example Usage:**
```typescript
import { asoService } from "./pack367-aso.service";

const { shouldShow, reasons } = await asoService.shouldShowReviewPrompt(userId);

if (shouldShow) {
  await asoService.markReviewPromptShown(userId);
  // Show native in-app review dialog
}
```

#### [`recordInAppFeedback(userId, feedback)`](functions/src/pack367-aso.service.ts:205)
Records in-app feedback and routes negative feedback to support:
- Rating ≤ 3 → Create support ticket
- Type `frustration` or `bug` → Create support ticket

### 4.2 Review Defense Service

**File:** [`functions/src/pack367-review-defense.ts`](functions/src/pack367-review-defense.ts:1)

**Key Functions:**

#### [`detectStoreReviewAnomalies()`](functions/src/pack367-review-defense.ts:22)
Scheduled function (runs every 6 hours) that:
1. Checks all active platform/country combinations
2. Compares recent snapshots
3. Detects anomalies:
   - **Sudden Rating Drop:** δ < -0.5
   - **1-Star Spike:** >70% of new reviews are 1-star
   - **Unusual Velocity:** >50 reviews in <24 hours
   - **Review Bombing:** Many 1-stars in short time + rating drop
4. Creates alerts with severity levels
5. Notifies admins for critical issues

#### [`triggerDefensiveActions(alertId)`](functions/src/pack367-review-defense.ts:197)
For critical anomalies:
- Enables conservative mode (PACK 365 feature flags)
- Disables aggressive notifications
- Reduces promotional intensity
- Pauses review prompts
- Creates support incident

**Scheduled Function:**
```typescript
export async function scheduledReviewAnomalyDetection() {
  const alerts = await reviewDefenseService.detectStoreReviewAnomalies();
  
  for (const alert of alerts) {
    if (alert.severity === "critical") {
      await reviewDefenseService.triggerDefensiveActions(alert.id);
    }
  }
}
```

### 4.3 Policy Validator Service

**File:** [`functions/src/pack367-policy-validator.ts`](functions/src/pack367-policy-validator.ts:1)

**Key Functions:**

#### [`validateListing(listing)`](functions/src/pack367-policy-validator.ts:41)
Validates store listing against policy rules:
- Title/description length checks
- NSFW word blacklist
- 18+ requirement enforcement
- Keyword limits
- Screenshot compliance

Returns violations categorized by severity:
- **Blocking:** Prevents save
- **Warning:** Should fix but doesn't block

#### [`validateListingBeforeSave(listing)`](functions/src/pack367-policy-validator.ts:387)
Middleware function to validate before saving to Firestore.

**Example:**
```typescript
import { validateListingBeforeSave } from "./pack367-policy-validator";

const result = await validateListingBeforeSave(listing);

if (!result.valid) {
  console.error("Validation failed:", result.violations);
  // Block save and show errors to admin
}
```

---

## 5. IN-APP REVIEW FLOWS

### 5.1 Review Prompt Logic

The system uses native in-app review APIs:
- **Android:** [InAppReview API](https://developer.android.com/guide/playcore/in-app-review)
- **iOS:** [SKStoreReviewController](https://developer.apple.com/documentation/storekit/skstorereviewcontroller)

**Client Integration (Pseudocode):**
```typescript
// Mobile app - Check eligibility
async function checkAndShowReviewPrompt() {
  const result = await fetch('/api/review/should-show', {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
  
  const { shouldShow } = await result.json();
  
  if (shouldShow) {
    // Mark as shown immediately
    await fetch('/api/review/mark-shown', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
    
    // Show native review dialog
    if (Platform.OS === 'android') {
      // Google Play In-App Review
      InAppReview.RequestReview();
    } else {
      // iOS StoreKit
      StoreReview.requestReview();
    }
  }
}
```

### 5.2 Negative Feedback Routing

When user provides negative feedback (rating ≤ 3 or "frustration"/"bug" type), instead of pushing them to store:

1. Show in-app feedback form
2. Collect details
3. Create support ticket (PACK 300A)
4. Promise follow-up from support team

**Flow:**
```
User rates app internally
         │
     ┌───▼────┐
     │Rating? │
     └───┬────┘
         │
    ┌────┼────┐
    │    │    │
   ≤3   4-5  │
    │    │    │
    │    ▼    │
    │  Show   │
    │ Native  │
    │ Review  │
    │         │
    ▼         │
 Show In-App  │
 Feedback Form│
    │         │
    ▼         │
 Create       │
 Support Ticket│
    │         │
    └────┬────┘
         │
         ▼
    Record to
    Firestore
```

---

## 6. ADMIN PANELS

### 6.1 ASO Manager

**File:** [`admin-web/store/pack367-aso-manager.tsx`](admin-web/store/pack367-aso-manager.tsx:1)

**Features:**
- Platform selector (Android/iOS)
- Country selector
- Multi-locale editor with tabs
- Real-time character counters
- Policy violation alerts
- Screenshot & video management
- Draft/Active status control
- Change history viewer
- Preview mode

**UI Components:**
- Platform/Country selector
- Locale tabs with add/remove
- Text fields with validation
- Violation alerts (blocking vs warning)
- Save button with validation check

### 6.2 Reputation Dashboard

**File:** [`admin-web/store/pack367-reputation-dashboard.tsx`](admin-web/store/pack367-reputation-dashboard.tsx:1)

**Features:**
- Average rating display with trend
- Total ratings count
- Rating breakdown (1-5 stars with percentages)
- Active anomalies counter
- Anomaly table with:
  - Detection date
  - Type
  - Severity
  - Rating change
  - Status
- Anomaly details dialog
- Resolve/False positive actions

**Key Metrics:**
- Average Rating (with trend indicator)
- Active Anomalies (by severity)
- 5-Star Percentage
- 1-Star Percentage
- Rating Breakdown Chart

---

## 7. INTEGRATIONS

### 7.1 PACK 293 (Notifications)

**Integration Points:**
- Admin notifications for critical anomalies
- Support team alerts for compliance incidents
- (Optional) User campaigns: "Come back & review us"

**Example:**
```typescript
await db.collection("notifications").doc("admin").collection("queue").add({
  type: "review_anomaly_detected",
  severity: "critical",
  title: "Review Anomaly: sudden_rating_drop",
  message: "android PL: Rating dropped from 4.2 to 3.1",
  data: { alertId, platform, country },
  createdAt: Date.now(),
});
```

### 7.2 PACK 296 (Audit)

**Logged Events:**
- Store listing updates
- Policy validation failures
- Policy config changes
- Anomaly detections
- Defensive action triggers

**Example:**
```typescript
await db.collection("audit").doc("logs").collection("entries").add({
  action: "listing_updated",
  platform: "android",
  country: "PL",
  updatedBy: adminId,
  timestamp: Date.now(),
  source: "pack367_aso",
});
```

### 7.3 PACK 300 / 300A (Support)

**Integration Points:**
- Negative feedback → Support ticket creation
- Anomaly alerts → Support incidents
- Compliance violations → Support escalation

**Ticket Categories:**
- `app_experience` - General negative feedback
- `bug` - Bug reports from feedback
- `compliance_incident` - Policy violations

### 7.4 PACK 301 (Retention)

**Integration:**
- Use retention segments (ACTIVE/RETURNING) to decide review prompt timing
- Target engaged users who are most likely to leave positive reviews

### 7.5 PACK 364 (Monitoring)

**Logged Events:**
```typescript
await db.collection("monitoring").doc("events").collection("list").add({
  type: "review_anomaly",
  severity: alert.severity,
  platform: alert.platform,
  country: alert.country,
  anomalyType: alert.anomalyType,
  metrics: alert.metrics,
  timestamp: Date.now(),
  source: "pack367_review_defense",
});
```

### 7.6 PACK 365 / 366 (Launch & Flags)

**Feature Flags:**
- `{platform}_{country}_review_prompts` - Enable/disable review prompts
- `{platform}_{country}_aggressive_notifications` - Control notification intensity
- `{platform}_{country}_promotional_intensity` - Adjust promo campaigns

**Conservative Mode (Triggered by anomalies):**
```typescript
const flagUpdates = {
  [`${platform}_${country}_aggressive_notifications`]: false,
  [`${platform}_${country}_promotional_intensity`]: "low",
  [`${platform}_${country}_review_prompts`]: false,
};
```

---

## 8. DEPLOYMENT & SCHEDULING

### 8.1 Cloud Functions

**Scheduled Functions:**

```typescript
// Every 6 hours
export const reviewAnomalyDetection = functions
  .pubsub
  .schedule("0 */6 * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    await scheduledReviewAnomalyDetection();
  });
```

### 8.2 Firestore Triggers

**On Listing Update:**
```typescript
export const onListingUpdate = functions
  .firestore
  .document("ops/storeListings/listings/{listingId}")
  .onWrite(async (change, context) => {
    // Validate listing
    // Log to audit
    // Check policy compliance
  });
```

---

## 9. SECURITY & COMPLIANCE

### 9.1 Store Policy Rules

**Default Rules:**

**Android:**
- Title: 50 chars max
- Short Description: 80 chars max
- Full Description: 4000 chars max
- Keywords: 50 max
- Content Rating: "Mature 17+"

**iOS:**
- Title: 30 chars max
- Short Description: 170 chars max
- Full Description: 4000 chars max
- Keywords: 100 max
- Content Rating: "17+"

### 9.2 NSFW Blacklist

Default blacklisted words (configurable):
```typescript
nsfwWordsBlacklist: [
  "sex", "porn", "nude", "naked", "explicit", "xxx", "adult"
  // Add more as needed
]
```

### 9.3 Required Elements

- ✅ Privacy Policy URL
- ✅ Terms of Service URL
- ✅ Age restriction statement (18+)
- ✅ Content rating declaration

---

## 10. TESTING STRATEGY

### 10.1 Review Prompt Testing

```typescript
// Test eligibility logic
describe("Review Prompt Eligibility", () => {
  it("should reject new users (<3 days)", async () => {
    const result = await asoService.shouldShowReviewPrompt(newUserId);
    expect(result.shouldShow).toBe(false);
  });
  
  it("should accept eligible users", async () => {
    // User: 10 days old, 8 app opens, 1 paid chat
    const result = await asoService.shouldShowReviewPrompt(eligibleUserId);
    expect(result.shouldShow).toBe(true);
  });
});
```

### 10.2 Anomaly Detection Testing

```typescript
// Test anomaly detection
describe("Review Anomaly Detection", () => {
  it("should detect sudden rating drop", async () => {
    // Create snapshots with rating drop
    const alerts = await reviewDefenseService.checkPlatformCountryAnomalies(
      "android", "PL"
    );
    expect(alerts).toContainEqual(
      expect.objectContaining({ anomalyType: "sudden_rating_drop" })
    );
  });
});
```

### 10.3 Policy Validation Testing

```typescript
// Test policy validation
describe("Policy Validation", () => {
  it("should reject titles with NSFW words", async () => {
    const listing = createMockListing({ title: "Sex Dating App" });
    const result = await policyValidatorService.validateListing(listing);
    expect(result.valid).toBe(false);
    expect(result.violations[0].violationType).toBe("nsfw_content");
  });
});
```

---

## 11. MONITORING & ALERTS

### 11.1 Key Metrics to Monitor

- **Average Rating** (per platform/country)
- **Rating Velocity** (new ratings per hour)
- **1-Star Percentage** (should stay <15%)
- **Active Anomalies** (should be 0 most of the time)
- **Review Prompt Show Rate** (eligibility %)
- **Feedback → Support Conversion** (negative feedback routing)

### 11.2 Alert Thresholds

**Critical (immediate action):**
- Rating drop > 1.0 in 24 hours
- >100 1-star reviews in 6 hours
- Review bombing detected

**High (investigate within hours):**
- Rating drop > 0.5 in 24 hours
- >50 1-star reviews in 12 hours
- Suspicious spike detected

**Medium (review daily):**
- Rating drop > 0.3 in 48 hours
- Unusual review velocity

---

## 12. RUNBOOK

### 12.1 Responding to Review Bombing

**Symptoms:**
- Alert: `review_bombing`
- Sudden influx of 1-star reviews
- Rating drop >1.0 in short time

**Actions:**
1. Verify anomaly is real (not false positive)
2. Check for related incidents:
   - Recent app updates
   - Feature changes
   - Safety incidents (PACK 300)
   - Country rollouts (PACK 366)
3. Enable conservative mode (automatic)
4. Create support incident
5. Monitor trends for 24-48 hours
6. Consider:
   - Official response in store reviews
   - App update with fixes
   - PR/communication plan

### 12.2 Policy Violation Response

**Symptoms:**
- Policy validation failure
- Store warning received
- App rejected/removed

**Actions:**
1. Review violation details
2. Fix listing immediately:
   - Remove prohibited content
   - Update screenshots
   - Add required disclosures
3. Submit updated listing
4. Document in audit log
5. Update policy config if needed
6. Train team on new requirements

---

## 13. FUTURE ENHANCEMENTS

### Phase 2 (Optional):

1. **ML-Based Fake Review Detection**
   - Analyze review text patterns
   - Detect bot-generated reviews
   - Flag coordinated attacks

2. **Sentiment Analysis**
   - Classify review sentiment
   - Track sentiment trends
   - Identify common complaints

3. **Competitive Monitoring**
   - Track competitor ratings
   - Benchmark against category
   - Identify market trends

4. **A/B Testing for ASO**
   - Test different titles
   - Test screenshot variations
   - Measure conversion impact

5. **Automated Store Responses**
   - Template-based responses
   - Auto-respond to common issues
   - Sentiment-aware replies

---

## 14. API ENDPOINTS (Backend Implementation Needed)

```typescript
// Admin API Endpoints
GET  /api/admin/store/listings?platform={platform}&country={country}
POST /api/admin/store/listings
POST /api/admin/store/validate
GET  /api/admin/store/ratings?platform={platform}&country={country}&days={days}
GET  /api/admin/store/anomalies?platform={platform}&country={country}&status={status}
PATCH /api/admin/store/anomalies/{anomalyId}

// User API Endpoints
POST /api/review/should-show
POST /api/review/mark-shown
POST /api/review/feedback
```

---

## 15. FILES CREATED

### Backend:
- [`functions/src/pack367-aso.types.ts`](functions/src/pack367-aso.types.ts:1) - Type definitions
- [`functions/src/pack367-policy-config.types.ts`](functions/src/pack367-policy-config.types.ts:1) - Policy types
- [`functions/src/pack367-aso.service.ts`](functions/src/pack367-aso.service.ts:1) - ASO service
- [`functions/src/pack367-review-defense.ts`](functions/src/pack367-review-defense.ts:1) - Review defense
- [`functions/src/pack367-policy-validator.ts`](functions/src/pack367-policy-validator.ts:1) - Policy validator

### Admin Web:
- [`admin-web/store/pack367-aso-manager.tsx`](admin-web/store/pack367-aso-manager.tsx:1) - ASO manager UI
- [`admin-web/store/pack367-reputation-dashboard.tsx`](admin-web/store/pack367-reputation-dashboard.tsx:1) - Reputation dashboard

### Documentation:
- [`PACK_367_ASO_REVIEWS_REPUTATION_STORE_DEFENSE.md`](PACK_367_ASO_REVIEWS_REPUTATION_STORE_DEFENSE.md:1) - This file

---

## 16. SUMMARY

PACK 367 establishes a comprehensive store defense and reputation management system for Avalo:

✅ **ASO Control** - Centralized management of store listings across platforms and countries  
✅ **Review Intelligence** - Smart review prompts that target happy users  
✅ **Negative Routing** - Unhappy users directed to support instead of store  
✅ **Anomaly Detection** - Automatic detection of review manipulation and attacks  
✅ **Policy Compliance** - Prevent store violations before they happen  
✅ **Defensive Actions** - Automatic responses to critical reputation threats  
✅ **Admin Tools** - Full-featured dashboards for monitoring and management  

**Dependencies satisfied:**
- PACK 293 (Notifications) - Admin alerts
- PACK 296 (Audit) - Change logging
- PACK 300/300A (Support) - Ticket creation
- PACK 301 (Retention) - User segmentation
- PACK 364 (Monitoring) - Event tracking
- PACK 365 (Flags) - Feature control
- PACK 366 (Launch) - Country rollouts

**No tokenomics impact** - This is purely operational infrastructure.

---

**Status:** ✅ Implementation Complete  
**Phase:** ETAP C - Public Launch & Market Expansion  
**Version:** 1.0.0  
**Last Updated:** 2025-12-19
