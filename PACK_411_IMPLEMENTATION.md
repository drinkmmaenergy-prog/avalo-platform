# PACK 411 — App Store Defense, Reviews, Reputation & Trust Engine

**Stage**: D – Launch & Defense  
**Number**: PACK 411  
**Status**: ✅ Implemented  
**Dependencies**: PACK 293, 296, 300/300A/300B, 301/301B/301A, 302, 367, 397, 410

---

## Overview

PACK 411 implements a unified engine for managing app store reputation, reviews, ratings, and detecting review brigading attacks. It provides intelligent in-app rating flows, automated review analysis, and reputation defense mechanisms.

### Key Features

1. **Store Reviews Ingestion** - Import and analyze reviews from Google Play and Apple App Store
2. **In-App Rating Flows** - Smart rating prompts with deflection for negative feedback
3. **Reputation Defense** - Detect and alert on review brigading and coordinated attacks
4. **Admin Console** - Monitor reputation metrics and manage alerts
5. **Integration Layer** - Seamless integration with support, safety, and analytics systems

---

## Architecture

### Data Model

#### Collections

- **`storeReviews`** - All app store reviews with tagging and analysis
- **`storeReputationSnapshots`** - Daily snapshots of rating metrics
- **`ratingPromptLogs`** - History of in-app rating prompts
- **`reviewBrigadeAlerts`** - Detected brigading attempts
- **`config/pack411InAppRating`** - In-app rating configuration
- **`config/pack411ReputationDefense`** - Defense detection settings

#### Key Types

```typescript
StoreReview {
  id, store, appVersion, rating, title, body,
  language, country, createdAt, source, status,
  tags[], linkedSupportTicketId, linkedRiskCaseId
}

ReputationSnapshot {
  id, date, store, avgRating, ratingCount,
  ratingsDistribution, oneStarShare,
  suspectedBrigadeScore, alerts[]
}

RatingPromptDecision {
  shouldPrompt, reason, metadata
}

ReviewBrigadeAlert {
  id, detectedAt, alertType, severity,
  suspectedReviewIds[], metrics, status
}
```

---

## Components

### 1. Backend Functions

#### Store Reviews Ingestion

**Functions:**
- `pack411_importStoreReviewsGoogle` - Import Google Play reviews
- `pack411_importStoreReviewsApple` - Import Apple App Store reviews

**Features:**
- Automatic review tagging using NLP patterns
- Deduplication by review ID
- Safety-critical content detection
- Auto-creation of support tickets for negative reviews
- Auto-creation of risk cases for safety issues
- Analytics event logging

**Tags:**
```
BUG, CRASH, BILLING, NSFW, SCAM, FRAUD, THEFT,
VIOLENCE, HARASSMENT, UNDERAGE, MINORS, SELF_HARM,
THREATS, UX, FEATURE_REQUEST, PERFORMANCE, PRIVACY
```

#### Rating Trigger Logic

**Functions:**
- `pack411_ratingPromptDecision` - Check if user should be prompted
- `pack411_logRatingPrompt` - Log prompt events
- `pack411_createFeedbackTicket` - Create ticket from negative feedback

**Eligibility Checks:**
- Age 18+ and verified
- No open critical support tickets
- No recent safety incidents
- Active for minimum days/sessions
- Respects throttling limits (1 per version, 3 per 90 days)

**Flow:**
- 1-3 stars → In-app feedback sheet → Support ticket
- 4-5 stars → Redirect to app store

#### Reputation Defense

**Function:**
- `pack411_scanReputationAnomalies` - Daily scheduled scan (2 AM UTC)

**Detection Algorithms:**

1. **Spike Detection**
   - Compares recent reviews (24h) to 7-day baseline
   - Calculates standard deviation of rating changes
   - Alerts if > 2.5 standard deviations

2. **Coordinated Attack**
   - Scans for keywords: "boycott", "coordinated", "protest", etc.
   - Flags if 30%+ of reviews contain suspicious keywords

3. **Device Clustering**
   - Detects if 30%+ reviews from same device model
   - Identifies potential bot/farm attacks

**Actions:**
- Creates `ReviewBrigadeAlert`
- Creates risk case (PACK 302)
- Sends admin notification (PACK 293)
- Logs analytics event (PACK 410)

---

### 2. Mobile App (React Native)

**Files:**
```
app-mobile/app/rating/trigger.ts   - Client-side eligibility check
app-mobile/app/rating/flow.tsx     - Rating UI component
app-mobile/app/utils/app-info.ts   - App version utilities
```

**Usage:**
```typescript
import { checkRatingPromptEligibility } from './rating/trigger';
import { RatingFlow } from './rating/flow';

// Check eligibility
const decision = await checkRatingPromptEligibility();

// Show prompt if eligible
if (decision.shouldPrompt) {
  // Render <RatingFlow decision={decision} onClose={...} />
}
```

**Features:**
- Star rating selection (1-5)
- Automatic deflection for 1-3 stars to feedback form
- Feedback textarea with screenshot option
- Auto-redirect to store for 4-5 stars
- Full analytics tracking

---

### 3. Web App (Next.js)

**Files:**
```
app-web/app/rating/flow.tsx - Rating UI component with hooks
```

**Usage:**
```typescript
import { useRatingPrompt, RatingFlow } from './rating/flow';

const { showPrompt, decision, checkAndShowPrompt, closePrompt } = useRatingPrompt();

// Check and show prompt
await checkAndShowPrompt();

// Render if shown
{showPrompt && decision && (
  <RatingFlow decision={decision} onClose={closePrompt} appVersion="1.0.0" />
)}
```

**Features:**
- Tailwind CSS styled components
- Hover effects on stars
- Integrated with Firebase Functions
- Client-safe implementation

---

### 4. Admin Console

**Files:**
```
admin-web/analytics/reputation.tsx - Full reputation monitoring dashboard
```

**Features:**
- Real-time rating trends (line chart)
- Rating distribution (pie chart)
- Active brigade alerts with severity badges
- Recent negative reviews (1-2 stars)
- Filters by store, country, version, time range
- Linked support tickets and risk cases
- Review tags display
- Manual refresh

**Metrics:**
- Average rating
- Total review count
- 1-star share percentage
- Active alerts count

---

## Integration Points

### PACK 293 (Notifications)
- Sends admin notifications on brigade detection
- Alert type: `REPUTATION_ALERT`

### PACK 296 (Audit Logs)
- Logs all review ingestion events
- Logs support ticket creation from reviews
- Event types: `SUPPORT_TICKET_CREATED_FROM_REVIEW`

### PACK 300/300A (Support)
- Auto-creates support tickets for:
  - Reviews with rating ≤ 3 stars
  - Safety-critical content
- Pre-fills category and description
- Links ticket ID to review

### PACK 301/301B (Retention)
- Marks users with 1-star reviews as `CHURN_RISK`
- Boosts win-back priority
- Excludes flagged fraud/abuse cases

### PACK 302 (Fraud & Abuse)
- Creates risk cases for safety-critical reviews
- Case type: `STORE_REVIEW_SAFETY` or `STORE_REVIEW_BRIGADE`
- Links risk case ID to review/alert

### PACK 367 (ASO)
- **Non-Breaking Extension** - Does not overwrite existing logic
- Provides reputation data for ASO optimization

### PACK 397 (Store Defense)
- **Non-Breaking Extension** - Works alongside existing defense
- Shares brigade alerts and policy violation data

### PACK 410 (Analytics)
- Logs all events:
  - `STORE_REVIEW_INGESTED`
  - `RATING_PROMPT_SHOWN`
  - `RATING_SELECTED`
  - `STORE_RATING_REDIRECT`
  - `IN_APP_FEEDBACK_OPENED`
  - `REPUTATION_ANOMALY_DETECTED`
  - `REVIEW_BRIGADE_ALERT`
  - `SAFETY_CRITICAL_REVIEW`

---

## Configuration

### In-App Rating Config

**Default Settings:**
```json
{
  "enabled": true,
  "eligibility": {
    "minActiveDays": 7,
    "minActiveSessions": 10,
    "minUserAge": 18,
    "requireVerified": true
  },
  "throttling": {
    "maxPromptsPerVersion": 1,
    "maxPromptsPer90Days": 3,
    "minDaysBetweenPrompts": 30
  },
  "deflection": {
    "lowRatingThreshold": 3,
    "enableFeedbackSheet": true,
    "autoCreateSupportTicket": true
  }
}
```

**Location:** `config/pack411InAppRating`

### Reputation Defense Config

**Default Settings:**
```json
{
  "enabled": true,
  "spikeDetection": {
    "enabled": true,
    "windowHours": 24,
    "minReviewCount": 10,
    "stdDevThreshold": 2.5
  },
  "brigadingDetection": {
    "enabled": true,
    "coordinatedKeywords": ["boycott", "coordinated", "protest", "organized", "campaign"],
    "deviceClusteringThreshold": 0.3
  },
  "alerting": {
    "notifyAdmins": true,
    "createRiskCase": true,
    "severity": "HIGH"
  }
}
```

**Location:** `config/pack411ReputationDefense`

---

## Deployment

### Prerequisites
1. Firebase project with Firestore enabled
2. Cloud Functions enabled
3. All dependency PACKs deployed (293, 296, 300/300A, 301/301B, 302, 367, 397, 410)

### Deploy Command
```bash
bash deploy-pack411.sh
```

### Manual Deployment Steps

1. **Deploy Firestore Rules & Indexes**
```bash
firebase deploy --only firestore:indexes,firestore:rules --project=avalo-prod
```

2. **Deploy Cloud Functions**
```bash
cd functions
npm run build
firebase deploy --only functions:pack411 --project=avalo-prod
```

3. **Initialize Configs**
```bash
# Use Firebase Console or Admin SDK to create:
# - config/pack411InAppRating
# - config/pack411ReputationDefense
```

4. **Deploy Mobile App**
```bash
# Update app-mobile/app/rating/flow.tsx with store URLs
# Build and release new app version
```

5. **Deploy Web App**
```bash
cd app-web
npm run build
# Deploy to hosting
```

6. **Deploy Admin Console**
```bash
cd admin-web
npm run build
# Deploy to admin hosting
```

---

## Testing

### Unit Tests

**Location:** `functions/src/__tests__/pack411-reviews.test.ts`

**Run Tests:**
```bash
cd functions
npm test
```

**Test Coverage:**
- Review tagging (NLP patterns)
- Safety-critical detection
- Rating prompt eligibility logic
- Mock data helpers

### Integration Tests

1. **Review Ingestion**
   - Import sample reviews from both stores
   - Verify tagging accuracy
   - Check support ticket creation
   - Confirm risk case creation for safety issues

2. **Rating Prompts**
   - Test eligibility logic with various user states
   - Verify throttling works correctly
   - Test deflection flow for low ratings
   - Confirm store redirection for high ratings

3. **Reputation Defense**
   - Simulate review spike
   - Test coordinated attack detection
   - Verify device clustering detection
   - Check alert creation and notification

4. **Admin Console**
   - Load dashboard with sample data
   - Test all filters and charts
   - Verify alert display
   - Check review list rendering

---

## Monitoring

### Key Metrics to Track

1. **Review Metrics**
   - Average rating trend
   - Review volume by store
   - 1-star share percentage
   - Tagged review distribution

2. **Rating Prompt Metrics**
   - Prompt eligibility rate
   - User action distribution (rated vs dismissed)
   - Store redirect conversion
   - Feedback ticket creation rate

3. **Reputation Defense**
   - Brigade alerts by type
   - False positive rate
   - Alert response time
   - Risk case resolution time

4. **System Health**
   - Function execution times
   - Error rates
   - API quota usage (store APIs)
   - Daily snapshot generation

### Alerts to Configure

1. **Critical**
   - Brigade detection with > 20 reviews
   - Multiple safety-critical reviews in 1 hour
   - Function failure rate > 5%

2. **Warning**
   - Average rating drops > 0.5 stars in 24h
   - 1-star share increases > 10% in 7 days
   - Prompt eligibility rate < 10%

---

## API Documentation

### Import Reviews (Google Play)

**Endpoint:** `pack411_importStoreReviewsGoogle`  
**Method:** HTTP POST  
**Auth:** Bearer token (admin/service account)

**Request Body:**
```json
{
  "reviews": [
    {
      "id": "review-unique-id",
      "rating": 1,
      "title": "Review title",
      "body": "Review content",
      "language": "en",
      "country": "US",
      "appVersion": "1.0.0",
      "createdAt": "2024-01-01T00:00:00Z",
      "deviceModel": "Pixel 7",
      "osVersion": "Android 13"
    }
  ]
}
```

**Response:**
```json
{
  "imported": 5,
  "updated": 2,
  "errors": 0
}
```

### Import Reviews (Apple App Store)

**Endpoint:** `pack411_importStoreReviewsApple`  
**Method:** HTTP POST  
**Auth:** Bearer token (admin/service account)

**Request Body:** Same as Google Play

### Check Rating Prompt

**Endpoint:** `pack411_ratingPromptDecision`  
**Method:** Cloud Function (callable)  
**Auth:** Firebase Auth (user must be authenticated)

**Request:**
```typescript
{ appVersion: "1.0.0" }
```

**Response:**
```typescript
{
  shouldPrompt: true,
  reason: "ELIGIBLE",
  metadata: {
    activeDays: 15,
    activeSessions: 25,
    promptCountLast90Days: 0
  }
}
```

---

## Troubleshooting

### Reviews Not Importing

1. Check API credentials for Google Play / App Store
2. Verify bearer token is valid
3. Check function logs for errors
4. Ensure review IDs are unique

### Rating Prompts Not Showing

1. Verify config `enabled: true`
2. Check user eligibility (age, verification, activity)
3. Review throttling limits
4. Check for open support tickets
5. Verify no recent safety incidents

### Brigade Alerts Not Triggering

1. Check config `enabled: true`
2. Verify sufficient review volume (minReviewCount)
3. Check baseline data exists (need 7 days history)
4. Review detection thresholds
5. Check scheduled job is running

### Admin Console Not Loading

1. Verify Firestore permissions
2. Check user has ADMIN or MODERATOR role
3. Ensure collections have data
4. Check Firebase config in admin-web
5. Review browser console for errors

---

## Runbook: Handling Brigade Incidents

### 1. Detection Phase
- Alert received via PACK 293 notification
- Check admin console for details
- Review suspected review IDs
- Assess severity and confidence

### 2. Investigation Phase
- Analyze review patterns:
  - Common keywords?
  - Same device models?
  - Geographic clustering?
  - Temporal patterns?
- Check linked risk cases
- Review user account data (if available)

### 3. Response Phase

**If Confirmed Brigade:**
1. Mark alert status as `CONFIRMED`
2. Document evidence in alert notes
3. Report to Google Play / App Store
4. Prepare appeal if reviews violate policies
5. Monitor for additional attacks

**If False Positive:**
1. Mark alert status as `FALSE_POSITIVE`
2. Document reasoning in alert notes
3. Adjust detection thresholds if needed
4. Create internal post-mortem

### 4. Recovery Phase
- Track review removal progress
- Monitor rating recovery
- Update reputation snapshots
- Review and adjust defense config
- Train ML models on new patterns

---

## Future Enhancements

### Phase 2 (Q2 2024)
- [ ] ML-based sentiment analysis
- [ ] Automatic response generation draft
- [ ] Review response A/B testing
- [ ] Cross-platform reputation correlation

### Phase 3 (Q3 2024)
- [ ] Predictive brigading detection
- [ ] User segmentation for rating prompts
- [ ] Multi-language NLP tagging
- [ ] Competitor review analysis

### Phase 4 (Q4 2024)
- [ ] Automated store response posting
- [ ] Review-driven feature prioritization
- [ ] Real-time reputation dashboard widget
- [ ] Public trust score API

---

## Support & Maintenance

### Regular Tasks

**Daily:**
- Monitor brigade alerts
- Review reputation snapshots
- Check function execution logs

**Weekly:**
- Analyze rating prompt conversion
- Review support ticket quality
- Update NLP tag patterns

**Monthly:**
- Audit false positive rate
- Review detection thresholds
- Update store API integrations
- Generate reputation report

### Escalation Path

1. **L1 Support** - Support team
   - Handle review-linked support tickets
   - Triage brigade alerts

2. **L2 Engineering** - Backend team
   - Investigate function errors
   - Adjust detection logic
   - Review API integrations

3. **L3 Executive** - CTO / Legal
   - Coordinate with app stores
   - Handle major brigade incidents
   - Make policy decisions

---

## License & Compliance

- Review data is stored per GDPR/CCPA requirements
- User pseudonymization for store reviews
- Audit logging for all operations
- Data retention: 2 years for reviews, 5 years for alerts
- Right to deletion honored via anonymization

---

## Changelog

### v1.0.0 (2024-01-01)
- Initial implementation
- Google Play and Apple App Store support
- In-app rating flows (mobile + web)
- Brigade detection (spike, coordinated, clustering)
- Admin console with charts
- Full integration with PACK 293-410

---

## Contributors

- Backend: Cloud Functions team
- Frontend: Mobile & Web teams
- Security: Trust & Safety team
- Analytics: Data team
- Design: Product Design team

---

**Document Version:** 1.0  
**Last Updated:** 2024-01-01  
**Next Review:** 2024-04-01
