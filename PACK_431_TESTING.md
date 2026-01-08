# PACK 431 - Testing Guide

## Global ASO, Store Metadata Automation & Multi-Language Expansion

---

## Test Scenarios

### 1. Store Metadata Generation

#### Test 1.1: Basic Metadata Generation
```typescript
import { createASOMetadataEngine } from "./pack431-aso-metadata";

const engine = createASOMetadataEngine(db);

// Generate metadata for US market
const metadata = await engine.generateMetadata({
  country: "US",
  language: "EN",
  safeMode: false
});

// Verify
assert(metadata.appTitle.includes("Avalo"));
assert(metadata.keywords.length > 0);
assert(metadata.shortDescription.length <= 80);
```

**Expected Results:**
- ✅ Metadata generated successfully
- ✅ All required fields present
- ✅ Character limits respected
- ✅ Keywords relevant to dating/events/AI

#### Test 1.2: Safe Mode Metadata
```typescript
// Generate safe mode metadata (no AI references)
const safeMetadata = await engine.generateMetadata({
  country: "US",
  language: "EN",
  safeMode: true
});

// Verify AI keywords removed
assert(!safeMetadata.keywords.includes("ai companion"));
assert(!safeMetadata.appTitle.includes("AI"));
assert(!safeMetadata.longDescription.includes("AI"));
```

**Expected Results:**
- ✅ No AI-related content in safe mode
- ✅ Keywords sanitized
- ✅ Still compelling copy

#### Test 1.3: Multi-Country Generation
```typescript
const countries = ["US", "PL", "DE", "ES", "FR"];

for (const country of countries) {
  const metadata = await engine.generateMetadata({
    country,
    language: detectLanguage(country),
    safeMode: false
  });
  
  // Verify country-specific data
  assert(metadata.country === country);
  console.log(`${country}: ${metadata.appTitle}`);
}
```

**Expected Results:**
- ✅ All countries processed
- ✅ Language auto-detected correctly
- ✅ Country-specific metadata saved

---

### 2. Multi-Language Store Expansion

#### Test 2.1: Language Detection
```typescript
import { createStoreI18nEngine } from "./pack431-store-i18n";

const i18n = createStoreI18nEngine(db);

// Test language detection
assert(i18n.detectLanguageFromCountry("US") === "EN");
assert(i18n.detectLanguageFromCountry("PL") === "PL");
assert(i18n.detectLanguageFromCountry("DE") === "DE");
assert(i18n.detectLanguageFromCountry("MX") === "ES");
```

**Expected Results:**
- ✅ Correct language detected for all countries
- ✅ Fallback to English for unknown countries

#### Test 2.2: Translation Retrieval
```typescript
// Get Polish translation
const plTranslation = i18n.getTranslation("PL");

assert(plTranslation.appName === "Avalo - Randki, Wydarzenia i AI");
assert(plTranslation.feature_events === "Wydarzenia i Spotkania");

// Test fallback
const unknownLang = i18n.getTranslation("XX");
assert(unknownLang.appName === "Avalo - Dating, Events & AI");
```

**Expected Results:**
- ✅ Correct translations loaded
- ✅ All required keys present
- ✅ Fallback to English works

#### Test 2.3: Safe Mode Translations
```typescript
const safeTranslations = i18n.getSafeModeTranslations("EN");

assert(!safeTranslations.appName?.includes("AI"));
assert(!safeTranslations.keywords?.includes("ai"));
```

**Expected Results:**
- ✅ AI-related content removed
- ✅ Still meaningful translations
- ✅ Legal compliance maintained

---

### 3. Screenshot & Media Automation

#### Test 3.1: Screenshot Generation
```typescript
import { createStoreMediaEngine } from "./pack431-store-media";

const media = createStoreMediaEngine(db, storage);

const screenshots = await media.generateScreenshots({
  country: "US",
  language: "EN",
  currency: "USD",
  safeMode: false,
  platform: "ios",
  device: "phone"
});

// Verify
assert(screenshots.length > 0);
assert(screenshots.every(s => s.platform === "ios"));
assert(screenshots.every(s => s.country === "US"));
```

**Expected Results:**
- ✅ Screenshots generated for all device sizes
- ✅ Proper metadata attached
- ✅ Saved to storage

#### Test 3.2: Screenshot A/B Testing
```typescript
const variants = await media.createScreenshotVariants(
  config,
  2 // Number of variants
);

assert(variants.length === 2);
assert(variants[0].length === variants[1].length);
```

**Expected Results:**
- ✅ Multiple variants created
- ✅ Same number of screenshots per variant
- ✅ Ready for A/B testing

#### Test 3.3: Safe Mode Screenshots
```typescript
const safeScreenshots = await media.generateScreenshots({
  country: "US",
  language: "EN",
  currency: "USD",
  safeMode: true,
  platform: "ios",
  device: "phone"
});

// Verify AI companions screenshot excluded
assert(!safeScreenshots.some(s => s.type === "ai_companions"));
```

**Expected Results:**
- ✅ Sensitive screenshots excluded in safe mode
- ✅ Dating and events screenshots included
- ✅ Legal claims appropriate

---

### 4. Review & Rating Optimization

#### Test 4.1: Review Eligibility Check
```typescript
import { createReviewPromptEngine } from "./pack431-review-engine";

const review = createReviewPromptEngine(db);

// Test eligible user
const eligible = await review.isEligibleForReview("user123");
assert(eligible === true);

// Test blocked user
await review.blockReviewPrompt({
  userId: "user456",
  type: "safety_escalation",
  timestamp: new Date(),
  reason: "Safety incident",
  durationDays: 90
});

const blocked = await review.isEligibleForReview("user456");
assert(blocked === false);
```

**Expected Results:**
- ✅ Eligible users can be prompted
- ✅ Blocked users cannot be prompted
- ✅ Block expires after duration

#### Test 4.2: Review Trigger Conditions
```typescript
// Trigger on first paid chat
const triggered = await review.triggerReviewPrompt({
  type: "paid_chat",
  userId: "user789",
  timestamp: new Date()
});

assert(triggered === true);

// Should not trigger again immediately
const triggeredAgain = await review.triggerReviewPrompt({
  type: "paid_chat",
  userId: "user789",
  timestamp: new Date()
});

assert(triggeredAgain === false);
```

**Expected Results:**
- ✅ Review prompted on positive events
- ✅ Not prompted twice within 30 days
- ✅ Proper logging

#### Test 4.3: Auto-Reply to Reviews
```typescript
import { createReviewAutoReplyEngine } from "./pack431-review-engine";

const autoReply = createReviewAutoReplyEngine(db);

// 5-star review
await autoReply.autoReply({
  reviewId: "review123",
  userId: "user123",
  rating: 5,
  text: "Great app!",
  platform: "ios",
  country: "US",
  language: "EN",
  timestamp: new Date()
});

// Verify thank you response created
const replies = await db.collection("review_replies_pack431")
  .where("reviewId", "==", "review123")
  .get();

assert(replies.size === 1);
assert(replies.docs[0].data().rating === 5);
```

**Expected Results:**
- ✅ 5-star reviews get thank you
- ✅ 3-4 star reviews get improvement message
- ✅ 1-2 star reviews redirected to support
- ✅ Multi-language support works

---

### 5. ASO Analytics

#### Test 5.1: Conversion Tracking
```typescript
import { createASOAnalyticsEngine } from "./pack431-aso-analytics";

const analytics = createASOAnalyticsEngine(db);

// Track conversions
await analytics.trackConversion("US", "impression");
await analytics.trackConversion("US", "pageView");
await analytics.trackConversion("US", "install");

// Get metrics
const metrics = await analytics.getMetrics("US", 1);

assert(metrics.length > 0);
assert(metrics[0].impressions >= 1);
assert(metrics[0].installs >= 1);
```

**Expected Results:**
- ✅ Conversions tracked correctly
- ✅ Metrics calculated properly
- ✅ Conversion rate computed

#### Test 5.2: Conversion Heatmap
```typescript
const heatmap = await analytics.generateConversionHeatmap();

assert(heatmap.length > 0);
assert(heatmap[0].country);
assert(heatmap[0].conversionRate >= 0);
```

**Expected Results:**
- ✅ All countries included
- ✅ Sorted by conversion rate
- ✅ Top keywords included
- ✅ Review impact shown

#### Test 5.3: Keyword Ranking
```typescript
await analytics.trackKeywordRanking({
  keyword: "dating app",
  country: "US",
  platform: "ios",
  rank: 15,
  searchVolume: 50000,
  trackingDate: new Date()
});

const keywords = await analytics.getTopKeywords("US", 10);
assert(keywords.some(k => k.keyword === "dating app"));
```

**Expected Results:**
- ✅ Keywords tracked with historical data
- ✅ Rank changes calculated
- ✅ Opportunities identified

---

### 6. Integration Tests

#### Test 6.1: Country Switch + Metadata Regeneration
```typescript
// Start with US
let metadata = await engine.generateMetadata({
  country: "US",
  language: "EN",
  safeMode: false
});

assert(metadata.country === "US");

// Switch to Poland
metadata = await engine.generateMetadata({
  country: "PL",
  language: "PL",
  safeMode: false
});

assert(metadata.country === "PL");
assert(metadata.language === "PL");
assert(metadata.appTitle.includes("Randki"));
```

**Expected Results:**
- ✅ Metadata regenerated for new country
- ✅ Language switched correctly
- ✅ All translations proper

#### Test 6.2: SAFE_MODE On/Off Switch
```typescript
// Normal mode
let metadata = await engine.generateMetadata({
  country: "US",
  language: "EN",
  safeMode: false
});

assert(metadata.keywords.includes("ai companion"));

// Switch to safe mode
metadata = await engine.generateMetadata({
  country: "US",
  language: "EN",
  safeMode: true
});

assert(!metadata.keywords.includes("ai companion"));
```

**Expected Results:**
- ✅ Safe mode removes sensitive content
- ✅ Normal mode includes all features
- ✅ Switch works both directions

#### Test 6.3: Fake Review Attack Response
```typescript
// Simulate fake review attack
for (let i = 0; i < 10; i++) {
  await db.collection("user_reviews_pack431").add({
    userId: `fake_user_${i}`,
    rating: 1,
    text: "Spam spam spam",
    platform: "android",
    country: "US",
    timestamp: new Date(),
    suspicious: true
  });
}

// System should detect and flag
// Integration with PACK 429 would trigger here

// Verify emergency safe mode can be activated
await engine.generateMetadata({
  country: "US",
  language: "EN",
  safeMode: true
});
```

**Expected Results:**
- ✅ Fake reviews flagged
- ✅ Emergency safe mode activates
- ✅ Keywords sanitized immediately

#### Test 6.4: Screenshot A/B Impact
```typescript
// Create A/B test
const testId = await abTest.createABTest(
  "Dating vs Events First",
  ["screenshot_dating_01"],
  ["screenshot_events_01"],
  ["US", "GB"]
);

// Simulate impressions and installs
for (let i = 0; i < 1000; i++) {
  await abTest.recordImpression(testId, "A");
  if (i < 100) await abTest.recordInstall(testId, "A");
}

for (let i = 0; i < 1000; i++) {
  await abTest.recordImpression(testId, "B");
  if (i < 120) await abTest.recordInstall(testId, "B");
}

// Get results
const results = await abTest.getTestResults(testId);

assert(results.winner === "B");
assert(results.significant === true);
```

**Expected Results:**
- ✅ A/B test tracked correctly
- ✅ Winner determined statistically
- ✅ Significant improvement detected

#### Test 6.5: Review Prompt After Safety Incident
```typescript
// User has safety incident
await review.blockReviewPrompt({
  userId: "user999",
  type: "safety_escalation",
  timestamp: new Date(),
  reason: "Reported inappropriate behavior"
});

// Try to trigger review
const triggered = await review.triggerReviewPrompt({
  type: "paid_chat",
  userId: "user999",
  timestamp: new Date()
});

assert(triggered === false);
```

**Expected Results:**
- ✅ Review prompt blocked after incident
- ✅ Block persists for duration
- ✅ User cannot leave review while blocked

---

## Performance Benchmarks

### Metadata Generation
- **Target:** < 500ms per country/language
- **Maximum:** 1000ms

### Screenshot Generation
- **Target:** < 2s per screenshot
- **Maximum:** 5s

### Analytics Query
- **Target:** < 200ms for dashboard
- **Maximum:** 500ms

---

## Monitoring & Alerts

### Key Metrics to Track

1. **Conversion Rate by Country**
   - Alert if drops > 20% in 24h

2. **Average Review Rating**
   - Alert if drops below 4.0

3. **Keyword Rankings**
   - Alert if top keywords drop > 10 positions

4. **Screenshot Performance**
   - Alert if tap rate drops > 15%

5. **API Response Times**
   - Alert if p95 > 1s

---

## Rollback Procedures

### Emergency Safe Mode
```bash
# Activate safe mode globally
firebase deploy --only functions:activateSafeMode

# Regenerate all metadata
firebase deploy --only functions:regenerateMetadata
```

### Revert Metadata Changes
```bash
# Restore previous version
firebase firestore:restore --backup-id <backup_id>
```

### Screenshot Rollback
```bash
# Revert to previous screenshot set
firebase deploy --only functions:rollbackScreenshots
```

---

## Success Criteria

### Phase 1: Basic Functionality
- ✅ Metadata generation works for all 19 languages
- ✅ Screenshots generate for iOS and Android
- ✅ Review prompts trigger correctly
- ✅ Analytics track conversions

### Phase 2: Optimization
- ✅ Conversion rate improved by 10%+
- ✅ Review rating maintained above 4.3
- ✅ Top keywords in top 20 positions
- ✅ Screenshot A/B tests show clear winners

### Phase 3: Scale
- ✅ Handles 1M+ impressions/day
- ✅ All APIs respond < 500ms
- ✅ Automated responses to 95% of reviews
- ✅ Real-time analytics dashboard

---

## Dependencies Validation

### PACK 293 - Notifications
- ✅ Review prompts sent via notification system
- ✅ A/B test results notify admins

### PACK 301/301B - Growth & Retention
- ✅ Retention metrics feed into metadata generation
- ✅ Feature activation data influences screenshots

### PACK 429 - Store Defense & Trust
- ✅ Fake review detection integrated
- ✅ Emergency safe mode coordination

### PACK 430 - Legal, Age-Gate & Jurisdiction
- ✅ Legal copy synced across languages
- ✅ Safe mode respects jurisdiction rules
- ✅ Age-gate metadata appropriate

---

## Test Execution Schedule

### Daily Tests (Automated)
- Metadata generation
- Translation retrieval
- Review eligibility
- Analytics tracking

### Weekly Tests (Automated)
- Full country regeneration
- Screenshot A/B results
- Keyword rank tracking
- Conversion heatmap

### Monthly Tests (Manual)
- Safe mode switching
- Emergency procedures
- Performance benchmarks
- Integration validations

---

## Bug Report Template

```markdown
## ASO Bug Report

**Component:** [Metadata/i18n/Screenshots/Reviews/Analytics]

**Country/Language:** [e.g., US/EN]

**Description:**
[Detailed description of the issue]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happened]

**Screenshots/Logs:**
[Attach relevant evidence]

**Impact:**
- [ ] Critical (App store submission blocked)
- [ ] High (Major conversion impact)
- [ ] Medium (Feature degraded)
- [ ] Low (Minor issue)
```

---

## Deployment Checklist

Before deploying PACK 431 to production:

- [ ] All unit tests passing
- [ ] Integration tests validated
- [ ] Performance benchmarks met
- [ ] Safe mode tested and working
- [ ] All 19 languages reviewed
- [ ] Screenshots approved for all platforms
- [ ] Review auto-replies tested in all languages
- [ ] Analytics dashboard functional
- [ ] Monitoring alerts configured
- [ ] Rollback procedures documented
- [ ] Dependencies validated (PACK 293, 301, 429, 430)
- [ ] App Store Connect API keys configured
- [ ] Google Play Console API keys configured
- [ ] Storage buckets created and secured
- [ ] Firestore indexes deployed
- [ ] Security rules updated

---

**Testing Status:** Ready for Pre-Production Validation
**Next Steps:** Execute full test suite → Deploy to staging → Monitor for 7 days → Production deployment
