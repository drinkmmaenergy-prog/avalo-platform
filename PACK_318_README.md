# PACK 318 — Marketing Landing Pages, Web Onboarding & Investor View

## Overview

PACK 318 adds a complete marketing and acquisition layer to Avalo, including public-facing marketing pages, web onboarding funnel, and read-only investor dashboard. This pack is **purely presentational and analytical** - it makes **ZERO changes** to tokenomics, pricing, or revenue logic.

## ✅ Verification: NO Tokenomics Changes

This pack explicitly **DOES NOT** modify:
- ❌ Token packages or prices
- ❌ Payout rate (remains 0.20 PLN/token)
- ❌ Revenue splits (65/35 for chat/calls/AI, 80/20 for calendar/events)
- ❌ Chat message pricing or free message logic
- ❌ Call, calendar, or event pricing
- ❌ Free tokens, discounts, promo codes, or cashback systems

All monetization logic remains unchanged. This pack only adds **presentation**, **acquisition**, and **visibility** layers.

## Implemented Features

### 1. Marketing Website (app-web)

#### Public Marketing Pages
All pages are accessible without login, SEO-optimized, and responsive:

- **[`/`](app-web/src/app/(marketing)/page.tsx)** - Main landing page with hero, features overview, creator section, safety highlights
- **[`/features`](app-web/src/app/(marketing)/features/page.tsx)** - Comprehensive features showcase
- **[`/creators`](app-web/src/app/(marketing)/creators/page.tsx)** - Creator monetization information (safe, compliant wording)
- **[`/safety`](app-web/src/app/(marketing)/safety/page.tsx)** - Safety features, community guidelines, trust elements
- **[`/download`](app-web/src/app/(marketing)/download/page.tsx)** - App download links, QR codes, platform badges
- **[`/investors`](app-web/src/app/(marketing)/investors/page.tsx)** - Public investor narrative (no metrics here)

#### Design Features
- Dark premium theme with neon purple/pink gradient
- Responsive mobile-to-desktop layout
- SEO metadata (title, description, OG tags)
- Consistent navigation and footer across all pages
- No explicit sexual imagery or wording (compliance-first)

### 2. Web Onboarding Flow

#### [`/start`](app-web/src/app/(marketing)/start/page.tsx) - Pre-Signup Page
- Collects email, phone (optional), country, language
- Creates `preSignup` document in Firestore
- Generates deep link with `preSignupId`: `avalo://signup?preSignupId=...`
- Shows QR code + app store links OR web signup option
- Tracks UTM parameters (source, campaign, medium) for attribution

#### PreSignup Data Model
```typescript
{
  preSignupId: string;
  email: string;
  phone: string | null;
  country: string;
  language: string;
  createdAt: timestamp;
  status: 'PENDING' | 'OPENED' | 'CONVERTED';
  source: string; // 'web_marketing'
  campaign: string | null;
  medium: string | null;
  utmSource: string | null;
}
```

#### Deep Link Flow
1. User submits info on web → creates `preSignup` doc
2. Web shows QR code with deep link
3. User opens mobile app via deep link
4. [`app-mobile/hooks/useDeepLink.ts`](app-mobile/hooks/useDeepLink.ts) handles:
   - Fetches `preSignup` data
   - Updates status to `OPENED`
   - Stores data in AsyncStorage
   - Pre-fills registration form

### 3. Investor Dashboard

#### [`/investor/dashboard`](app-web/src/app/investor/dashboard/page.tsx)
Read-only dashboard for authorized investors and admins.

**Access Control:**
- Checks `users` collection for `role === 'investor'` OR `role === 'admin'`
- Redirects unauthorized users to home
- Logs all access to audit trail

**Metrics Displayed (Aggregated, No PII):**

1. **User Growth:**
   - Total registered users
   - Verified users (18+)
   - Daily Active Users (DAU)
   - Monthly Active Users (MAU)
   - Growth % vs previous day

2. **Engagement:**
   - Daily swipes
   - Active chats
   - Meetings booked (calendar)
   - Event tickets sold
   - AI companion sessions

3. **Monetization:**
   - Total tokens purchased (lifetime + last 30 days)
   - Tokens spent by category (chat, calls, calendar, events, AI)
   - Platform share tokens (calculated from existing revenue splits)

4. **Safety & Trust:**
   - Verifications completed
   - Safety reports filed
   - Panic button triggers
   - Accounts banned

**Data Source:**
- Reads from `investorMetricsDaily/{date}` collection
- Shows last 30 days of historical data
- No direct access to user data or transactions

### 4. Daily Metrics Aggregation

#### [`functions/src/scheduled/aggregateInvestorMetrics.ts`](functions/src/scheduled/aggregateInvestorMetrics.ts)
Cloud Function that runs daily at 00:00 UTC to aggregate metrics.

**Process:**
1. Counts users (total, verified, DAU, MAU)
2. Counts engagement activities (swipes, chats, bookings, events, AI sessions)
3. Sums token transactions by category
4. Calculates platform share using **existing revenue splits**:
   - Chat/Calls/AI: 35% platform share
   - Calendar/Events: 20% platform share
5. Counts safety metrics (verifications, reports, bans)
6. Writes aggregated data to `investorMetricsDaily/{YYYY-MM-DD}`

**Schedule:**
```typescript
functions.pubsub.schedule('0 0 * * *').timeZone('UTC')
```

### 5. Analytics Tracking

#### [`app-web/src/lib/analytics.ts`](app-web/src/lib/analytics.ts)
Centralized analytics tracking for marketing funnel.

**Events:**
- `LANDING_VIEW` - Landing page view
- `CTA_CLICK_DOWNLOAD` - Download CTA clicked
- `CTA_CLICK_WEB_SIGNUP` - Web signup CTA clicked
- `PRESIGNUP_CREATED` - PreSignup document created
- `PRESIGNUP_CONVERTED` - User completed full signup after presignup
- `FEATURES_VIEW`, `CREATORS_VIEW`, `SAFETY_VIEW`, etc.
- `INVESTOR_DASHBOARD_VIEWED` - Investor dashboard access (with audit)

**Features:**
- Firebase Analytics integration
- UTM parameter tracking (source, campaign, medium)
- localStorage session tracking (last 50 events)
- Development console logging

### 6. Security & Compliance

#### Firebase Rules: [`firestore-pack318-marketing.rules`](firestore-pack318-marketing.rules)

**`preSignup` Collection:**
```javascript
allow create: if true; // Public can create
allow read: if isAuthenticated() && (
  resource.data.email == request.auth.token.email || isAdmin()
);
allow update, delete: if false; // Only Cloud Functions
```

**`investorMetricsDaily` Collection:**
```javascript
allow read: if isInvestor(); // Only investors/admins
allow write: if false; // Only Cloud Functions
```

#### Audit Logging
All investor dashboard access is logged via:
```typescript
POST /api/admin/audit-log
{
  action: 'INVESTOR_DASHBOARD_VIEWED',
  userId: string,
  timestamp: ISO_DATETIME,
  metadata: { userAgent, ip }
}
```

#### Security Headers
All marketing pages inherit security headers from [`next.config.js`](app-web/next.config.js):
- Strict-Transport-Security
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- CSP with restricted sources
- Permissions-Policy

## File Structure

```
app-web/
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   │   ├── layout.tsx          # Marketing layout
│   │   │   ├── page.tsx            # Landing page
│   │   │   ├── features/page.tsx   # Features page
│   │   │   ├── creators/page.tsx   # Creators page
│   │   │   ├── safety/page.tsx     # Safety page
│   │   │   ├── download/page.tsx   # Download page
│   │   │   ├── investors/page.tsx  # Investors page
│   │   │   └── start/page.tsx      # Pre-signup onboarding
│   │   └── investor/
│   │       └── dashboard/page.tsx  # Investor dashboard
│   └── lib/
│       ├── firebase.ts             # Firebase client
│       └── analytics.ts            # Analytics tracking

app-mobile/
└── hooks/
    └── useDeepLink.ts              # Deep link handler

functions/
└── src/
    └── scheduled/
        └── aggregateInvestorMetrics.ts  # Daily aggregation

firestore-pack318-marketing.rules    # Security rules
```

## Dependencies

### App-Web
All dependencies already exist in [`app-web/package.json`](app-web/package.json):
- Next.js 14.1.0
- React 18.2.0
- Firebase 10.7.1
- Lucide React (icons)
- Tailwind CSS

### App-Mobile
New dependency (if not present):
- `@react-native-async-storage/async-storage`
- `expo-linking` (already in Expo)

### Functions
- `firebase-functions`
- `firebase-admin`

## Deployment Instructions

### 1. Deploy Firebase Rules
```bash
# Test rules first
firebase emulators:start --only firestore

# Deploy to production
firebase deploy --only firestore:rules
```

### 2. Deploy Cloud Functions
```bash
cd functions
npm install
npm run build

# Deploy aggregation function
firebase deploy --only functions:aggregateInvestorMetrics
```

### 3. Deploy Web App
```bash
cd app-web
npm install
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting:web
```

### 4. App-Mobile Updates
```bash
cd app-mobile
npm install @react-native-async-storage/async-storage

# For iOS
cd ios && pod install && cd ..

# Rebuild app
npm run ios  # or npm run android
```

### 5. Configure Deep Links

#### iOS (`app-mobile/ios/[AppName]/Info.plist`):
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>avalo</string>
    </array>
  </dict>
</array>
```

#### Android (`app-mobile/android/app/src/main/AndroidManifest.xml`):
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="avalo" />
</intent-filter>
```

## Testing

### 1. Marketing Pages
```bash
# Start dev server
cd app-web
npm run dev

# Visit pages
open http://localhost:3000/
open http://localhost:3000/features
open http://localhost:3000/creators
open http://localhost:3000/safety
open http://localhost:3000/download
open http://localhost:3000/investors
open http://localhost:3000/start
```

### 2. Web Onboarding Flow
1. Go to `/start`
2. Fill in email, country, language
3. Submit form → verify `preSignup` doc created in Firestore
4. Check QR code and deep link generation
5. Scan QR with mobile device OR click web signup

### 3. Deep Link Testing
```bash
# iOS Simulator
xcrun simctl openurl booted "avalo://signup?preSignupId=TEST123"

# Android Emulator
adb shell am start -W -a android.intent.action.VIEW -d "avalo://signup?preSignupId=TEST123"
```

Verify:
- App opens to registration
- PreSignup data pre-fills form
- Status updates to `OPENED` in Firestore

### 4. Investor Dashboard
1. Create test investor user in Firestore:
```javascript
db.collection('users').doc('testInvestorId').set({
  email: 'investor@test.com',
  role: 'investor',
  ...
});
```

2. Login with investor account
3. Navigate to `/investor/dashboard`
4. Verify:
   - Access granted
   - Metrics display (or "no data" message if aggregation hasn't run)
   - Audit log created

### 5. Metrics Aggregation
```bash
# Trigger function manually
firebase functions:shell

# In shell:
aggregateInvestorMetrics()
```

Verify:
- `investorMetricsDaily/{date}` document created
- All metrics populated correctly
- Platform share calculated using correct percentages

## Analytics Verification

### Check UTM Tracking
1. Visit: `http://localhost:3000/?utm_source=facebook&utm_campaign=launch&utm_medium=cpc`
2. Click "Get Started"
3. Complete presignup
4. Verify in Firestore:
```javascript
{
  source: 'web_marketing',
  campaign: 'launch',
  medium: 'cpc',
  utmSource: 'facebook'
}
```

### Check Event Tracking
Open browser console and verify analytics events logged:
- Landing view
- CTA clicks
- PreSignup creation
- Page views

## Monitoring

### Key Metrics to Watch
1. **Conversion Funnel:**
   - Landing views → PreSignup created
   - PreSignup created → PreSignup opened (deep link)
   - PreSignup opened → PreSignup converted (full signup)

2. **Investor Dashboard:**
   - Access frequency
   - Audit log entries
   - Dashboard load performance

3. **Aggregation Health:**
   - Daily function execution (Cloud Functions logs)
   - Data completeness in `investorMetricsDaily`
   - Metrics calculation accuracy

## Troubleshooting

### PreSignup Not Creating
- Check Firestore rules allow public `create`
- Verify Firebase config in `app-web/.env.local`
- Check browser console for errors

### Deep Link Not Working
- Verify URL scheme registered in Info.plist/AndroidManifest.xml
- Check mobile app has deep link handling in `_layout.tsx`
- Test with simple URL first: `avalo://test`

### Investor Dashboard Access Denied
- Verify user has `role: 'investor'` or `role: 'admin'` in Firestore
- Check authentication status
- Review browser console and network tab

### Metrics Not Aggregating
- Check Cloud Function logs: `firebase functions:log`
- Verify function deployed: `firebase functions:list`
- Test function manually in Firebase Console
- Check source collections have data

## Legal & Compliance Notes

### Safe Creator Copy
All creator-related content uses safe, compliant language:
- ✅ "Build your audience and monetize"
- ✅ "Turn connections into income"
- ✅ "Authentic engagement"
- ❌ No explicit "selling content" language
- ❌ No sexual imagery or suggestive wording

### Age Verification
- All marketing materials state "18+ only"
- Verification requirements highlighted on safety page
- Links to full verification process

### Privacy
- Investor dashboard shows NO PII
- All metrics aggregated and anonymized
- Audit logs for accountability
- GDPR/privacy policy links in footer

## Success Criteria

✅ **Marketing Website:**
- All 6 pages deployed and accessible
- Responsive on mobile/tablet/desktop
- SEO metadata present
- No broken links

✅ **Web Onboarding:**
- PreSignup form functional
- Firestore document created
- Deep link generated
- QR code displayed
- Web signup option works

✅ **Deep Links:**
- Mobile app opens from link
- PreSignup data fetched
- Registration pre-filled
- Status updated to OPENED

✅ **Investor Dashboard:**
- Access control working
- Metrics display correctly
- No PII exposed
- Audit logging active

✅ **Data Aggregation:**
- Daily function runs successfully
- All metrics calculated
- Platform share uses correct percentages
- Historical data available

✅ **NO Tokenomics Changes:**
- Token prices unchanged
- Payout rate unchanged
- Revenue splits unchanged
- Message/call/calendar pricing unchanged
- No new discounts/promos/free tokens

## Future Enhancements (Not in This Pack)

These are explicitly OUT OF SCOPE for PACK 318:
- ❌ Promo codes or referral systems
- ❌ Free tokens or welcome bonuses
- ❌ Dynamic pricing or A/B tests
- ❌ Investor-controlled features
- ❌ Campaign-specific discounts
- ❌ Email marketing automation
- ❌ Advanced analytics dashboards
- ❌ SEO optimization beyond basics

## Contact & Support

For questions or issues with PACK 318:
1. Check this README first
2. Review Firebase logs and console
3. Test in development environment
4. Check audit logs for security issues

---

**PACK 318 Status: ✅ COMPLETE**

All deliverables implemented with ZERO changes to tokenomics, pricing, or revenue logic. Pure marketing, acquisition, and visibility layer.