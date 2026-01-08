# Go-Live Checklist — Staging → Production

**Version:** 1.0  
**Last Updated:** 2025-12-09  
**Purpose:** Define precise steps for deploying Avalo from staging to production across mobile (Android/iOS) and web platforms.

---

## 1. Pre-Deployment Preparation

### 1.1 Code Freeze
- [ ] **Code freeze announced** (minimum 48 hours before go-live)
- [ ] All PRs merged and code reviewed
- [ ] Final commit tagged with version number (e.g., `v1.0.0`)
- [ ] Release branch created (e.g., `release/1.0.0`)
- [ ] CHANGELOG.md updated with all changes

### 1.2 Documentation Review
- [ ] API documentation up to date
- [ ] User-facing documentation reviewed
- [ ] Deployment runbook prepared
- [ ] Rollback plan documented
- [ ] On-call schedule confirmed

### 1.3 Stakeholder Communication
- [ ] Release notes prepared for users
- [ ] Internal team briefed on go-live plan
- [ ] Customer support team trained on new features
- [ ] Marketing materials ready (if applicable)
- [ ] Social media posts scheduled

---

## 2. Environment Verification

### 2.1 Staging Environment

**Firebase Configuration:**
- [ ] Staging Firebase project confirmed: `avalo-staging`
- [ ] Firestore collections reviewed (no production data)
- [ ] Storage buckets configured correctly
- [ ] Authentication providers enabled
- [ ] Cloud Functions deployed and tested

**Environment Variables (Staging):**
- [ ] `NEXT_PUBLIC_ENV=staging`
- [ ] `NEXT_PUBLIC_API_URL=https://staging-api.avalo.app`
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID=avalo-staging`
- [ ] Stripe test keys configured
- [ ] Google OAuth test credentials
- [ ] Apple OAuth test credentials
- [ ] Feature flags set for staging

**Mobile Apps (Staging):**
- [ ] Android: Staging build APK available
- [ ] iOS: Staging build IPA available  
- [ ] TestFlight staging track active (iOS)
- [ ] Internal testing track active (Android)

**Web (Staging):**
- [ ] Staging site accessible: `https://staging.avalo.app`
- [ ] SSL certificate valid
- [ ] All pages load correctly
- [ ] No console errors or warnings

### 2.2 Production Environment

**Firebase Configuration:**
- [ ] Production Firebase project confirmed: `avalo-production`
- [ ] Firestore security rules deployed
- [ ] Firestore indexes created
- [ ] Storage CORS configured
- [ ] Authentication providers enabled
- [ ] Cloud Functions deployed
- [ ] Firebase Remote Config ready

**Environment Variables (Production):**
- [ ] `NEXT_PUBLIC_ENV=production`
- [ ] `NEXT_PUBLIC_API_URL=https://api.avalo.app`
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID=avalo-production`
- [ ] Stripe live keys configured (with caution)
- [ ] Google OAuth production credentials
- [ ] Apple OAuth production credentials
- [ ] Push notification keys (FCM for Android, APNs for iOS)
- [ ] Feature flags set for production

**DNS & CDN:**
- [ ] DNS records pointing to production servers
- [ ] CDN configured (CloudFlare/Cloudfront)
- [ ] SSL certificates valid for:
  - `avalo.app`
  - `www.avalo.app`
  - `api.avalo.app`
- [ ] HTTP → HTTPS redirects configured

**Database:**
- [ ] Production Firestore empty or with seed data only
- [ ] No staging data mixed in
- [ ] Indexes deployed
- [ ] Backup strategy configured

**External Services:**
- [ ] Stripe webhooks configured for production
- [ ] Google Play billing configured
- [ ] Apple In-App Purchase configured
- [ ] Twilio (if using for SMS/calls) production credentials
- [ ] SendGrid/email service production API keys

---

## 3. Migration Scripts

### 3.1 Database Migrations
- [ ] Review all migration scripts
- [ ] Test migrations in staging environment
- [ ] Prepare rollback scripts
- [ ] Document breaking changes (if any)

**Example Migration Checklist:**
```
Migration: initialize_token_packages
Status: [ ] Not Run / [ ] Completed / [ ] Rolled Back
Description: Create token package documents in Firestore
Estimated Time: 5 minutes
```

### 3.2 Configuration Migrations
- [ ] Feature flags initialized in production
- [ ] Regional settings configured
- [ ] Legal document versions uploaded
- [ ] Initial admin users created

---

## 4. Feature Flags Configuration

Set initial production feature flags:

```json
{
  // Global Settings
  "maintenanceMode": false,
  "newUserSignups": true,
  
  // Country Availability (Phase 1)
  "enabledCountries": ["PL", "GB", "DE"],
  
  // Core Features
  "discovery": true,
  "chat": true,
  "voiceCalls": true,
  "videoCalls": true,
  "calendar": true,
  "events": true,
  "feed": true,
  
  // Advanced Features
  "aiAssist": true,
  "passportMode": false,  // Launch later
  "royalClub": false,     // Launch later
  
  // Safety Features
  "panicButton": true,
  "contentModeration": true,
  "ageVerification": true,
  "selfieVerification": true,
  
  // Monetization
  "tokenPurchase": true,
  "payouts": true,
  
  // Limits & Rates
  "swipeLimitPerDay": 50,
  "swipeLimitPerHour": 10,
  "freeMessagesHighPopularity": 6,
  "freeMessagesLowPopularity": 10
}
```

---

## 5. Pre-Flight Testing (Staging)

### 5.1 Smoke Tests — Android

**Device:** Use production-like device (e.g., Samsung Galaxy S21, Android 12)

- [ ] **Install app** from staging build
- [ ] **Sign up** with test email
  - Age verification: 18+
  - Selfie verification works
  - Legal documents acceptance
- [ ] **Complete profile**
  - Upload 6 photos (faces visible)
  - Set interests and preferences
- [ ] **Discovery**
  - View profiles
  - Swipe right/left
  - Create match (use second test account)
- [ ] **Chat**
  - Send free messages (exhaust limit)
  - Hit paywall
  - (Sandbox) Purchase chat unlock (100 tokens)
  - Send paid messages
- [ ] **Token purchase**
  - (Sandbox) Buy Mini package (100 tokens — 31.99 PLN)
  - Verify balance updated
- [ ] **Calendar**
  - (If available) Book simple meeting
  - Verify payment deducted
- [ ] **Panic button**
  - Trigger during test "meeting"
  - Verify alert sent
- [ ] **Notifications**
  - Receive match notification
  - Receive message notification

**Result:** [ ] Pass / [ ] Fail (document issues)

### 5.2 Smoke Tests — iOS

**Device:** Use production-like device (e.g., iPhone 14, iOS 17)

- [ ] **Install app** from TestFlight staging track
- [ ] **Sign up** with test email
- [ ] **Complete profile**
- [ ] **Discovery & swipe**
- [ ] **Chat & monetization**
- [ ] **Token purchase** (Sandbox)
- [ ] **Calendar booking**
- [ ] **Panic button test**
- [ ] **Notifications**

**Result:** [ ] Pass / [ ] Fail (document issues)

### 5.3 Smoke Tests — Web

**Browser:** Chrome (latest), Safari (latest)

- [ ] **Navigate to** `https://staging.avalo.app`
- [ ] **Sign up** with test email
- [ ] **Complete profile**
- [ ] **Discovery feed works**
- [ ] **Chat** (free + paid)
- [ ] **Token purchase** (Stripe test mode)
- [ ] **Calendar booking**
- [ ] **Responsive design** (test on mobile viewport)
- [ ] **No console errors**

**Result:** [ ] Pass / [ ] Fail (document issues)

### 5.4 Load Testing

**Tools:** Artillery, JMeter, or similar

- [ ] **Discovery endpoint** — simulate 100 concurrent users
- [ ] **Chat endpoint** — simulate 50 concurrent chats
- [ ] **Token purchase** — simulate 20 concurrent purchases
- [ ] **Firestore read/write** — verify query performance
- [ ] Review metrics:
  - Response time: <500ms average
  - Error rate: <1%
  - Database queries optimized

**Result:** [ ] Pass / [ ] Fail (document issues)

### 5.5 Security Testing

- [ ] **Authentication** — Cannot access without login
- [ ] **Authorization** — Users cannot access other users' data
- [ ] **API endpoints** — Rate limiting active
- [ ] **HTTPS** — All traffic encrypted
- [ ] **XSS/CSRF** — Basic protections in place
- [ ] **Sensitive data** — No passwords/tokens in logs
- [ ] **OWASP Top 10** — Major vulnerabilities addressed

**Result:** [ ] Pass / [ ] Fail (document issues)

---

## 6. Deployment Steps

### 6.1 Web Deployment

**Step 1: Build Production Bundle**
```bash
# Navigate to web app directory
cd app-web

# Install dependencies
pnpm install --frozen-lockfile

# Set production environment variables
export NODE_ENV=production
export NEXT_PUBLIC_ENV=production
export NEXT_PUBLIC_API_URL=https://api.avalo.app
# ... (set all production env vars)

# Build Next.js app
pnpm build

# Verify build output
ls -lh .next/
```

- [ ] Build completed without errors
- [ ] Bundle size reasonable (<5MB initial JS)

**Step 2: Deploy to Hosting**

**Option A: Vercel**
```bash
vercel --prod
```

**Option B: Firebase Hosting**
```bash
firebase deploy --only hosting --project avalo-production
```

**Option C: Custom Server**
```bash
# Upload .next/ directory to server
scp -r .next/ user@server:/var/www/avalo/

# Restart Node.js process (PM2)
ssh user@server "pm2 restart avalo-web"
```

- [ ] Deployment completed successfully
- [ ] Site accessible at `https://avalo.app`
- [ ] SSL certificate valid

**Step 3: Verify Web Deployment**
- [ ] Homepage loads without errors
- [ ] Login/signup flow works
- [ ] No console errors
- [ ] Google Analytics tracking active
- [ ] Sentry error logging active (if configured)

### 6.2 Cloud Functions Deployment

```bash
# Deploy all Cloud Functions to production
firebase deploy --only functions --project avalo-production
```

**Functions to verify:**
- [ ] `processTokenPurchase` — Handles token purchases
- [ ] `calculateChatRefund` — Calculates refunds for chat
- [ ] `handlePayoutRequest` — Processes creator payouts
- [ ] `moderateContent` — AI content moderation
- [ ] `sendNotifications` — Push notification dispatcher

### 6.3 Mobile App Deployment

#### Android (Google Play)

**Step 1: Build Production APK/AAB**
```bash
cd app-mobile

# Install dependencies
pnpm install

# Build for production
eas build --platform android --profile production
```

- [ ] Build completed successfully
- [ ] AAB file generated
- [ ] Version code incremented
- [ ] ProGuard/R8 optimization enabled

**Step 2: Upload to Google Play Console**
- [ ] Log in to Google Play Console
- [ ] Navigate to "Production" track
- [ ] Upload AAB file
- [ ] Set version name (e.g., `1.0.0`)
- [ ] Add release notes
- [ ] Review store listing (title, description, screenshots)
- [ ] Submit for review

**Step 3: Staged Rollout (Recommended)**
- [ ] Initial rollout: 10% of users
- [ ] Monitor crash reports for 24 hours
- [ ] If stable, increase to 50% after 48 hours
- [ ] Full rollout (100%) after 1 week

#### iOS (App Store)

**Step 1: Build Production IPA**
```bash
cd app-mobile

# Build for production
eas build --platform ios --profile production
```

- [ ] Build completed successfully
- [ ] IPA file generated
- [ ] Build number incremented
- [ ] Bitcode enabled (if required)

**Step 2: Upload to App Store Connect**
```bash
# Use Transporter app or Xcode
# Upload IPA to App Store Connect
```

- [ ] IPA uploaded successfully
- [ ] Processing completed (wait 10-30 minutes)

**Step 3: Submit for Review**
- [ ] Log in to App Store Connect
- [ ] Select app version
- [ ] Add screenshots (if not already done)
- [ ] Add description and keywords
- [ ] Provide demo account credentials
- [ ] Answer App Review questions
- [ ] Submit for review
- [ ] Expected review time: 24-48 hours

**Step 4: Phased Release (Recommended)**
- [ ] Enable "Phased Release" (7-day rollout)
- [ ] Day 1: 1% of users
- [ ] Day 2: 2% of users
- [ ] Day 3: 5% of users
- [ ] Day 4: 10% of users
- [ ] Day 5: 20% of users
- [ ] Day 6: 50% of users
- [ ] Day 7: 100% of users

---

## 7. Post-Deployment Smoke Tests

**CRITICAL:** Perform these tests immediately after production deployment using REAL production environment (not staging).

### 7.1 Web Smoke Test (Production)

**Use a NEW test account** (not staging account)

- [ ] Navigate to `https://avalo.app`
- [ ] Sign up with real email (your own test email)
- [ ] Verify email received
- [ ] Complete onboarding (age verification, selfie, legal)
- [ ] Create profile with photos
- [ ] View discovery feed (should see profiles or "no users yet" message)
- [ ] Check token balance (should be 0)
- [ ] **(Optional)** Make small token purchase with real card (test with minimum package, then refund)
- [ ] No console errors
- [ ] No 404 or 500 errors

**Result:** [ ] Pass / [ ] Fail

### 7.2 Android Smoke Test (Production)

**Install from Google Play:**
- [ ] Search "Avalo" in Google Play Store
- [ ] Install app
- [ ] Sign up with real email
- [ ] Complete onboarding
- [ ] Create profile
- [ ] Browse discovery
- [ ] **(Optional)** Test small token purchase with real Google Play account
- [ ] Receive push notification (test with match or message)

**Result:** [ ] Pass / [ ] Fail

### 7.3 iOS Smoke Test (Production)

**Install from App Store:**
- [ ] Search "Avalo" in App Store
- [ ] Install app
- [ ] Sign up with real email
- [ ] Complete onboarding
- [ ] Create profile
- [ ] Browse discovery
- [ ] **(Optional)** Test small token purchase with real Apple ID
- [ ] Receive push notification

**Result:** [ ] Pass / [ ] Fail

### 7.4 Critical Path Testing

**Test the most critical user journeys:**

**Journey 1: New User → First Match → First Message**
- [ ] Sign up
- [ ] Complete profile
- [ ] Swipe and match (use second test account to simulate match)
- [ ] Send first free message
- [ ] Receive message back

**Journey 2: User → Token Purchase → Paid Chat**
- [ ] Exhaust free messages
- [ ] See paywall
- [ ] Purchase token package (minimum)
- [ ] Unlock chat (100 tokens)
- [ ] Send paid messages

**Journey 3: Creator → Calendar Setup → Booking**
- [ ] Set up creator profile
- [ ] Add calendar availability
- [ ] Second account books meeting
- [ ] Verify tokens deducted
- [ ] Verify booking confirmation

**Result:** [ ] All Pass / [ ] Some Fail (document)

---

## 8. Monitoring & Alerts

### 8.1 Immediate Monitoring (First 24 Hours)

**Application Performance:**
- [ ] Monitor error rate in Sentry/error tracker
  - Target: <0.5% error rate
- [ ] Monitor API response times
  - Target: p50 <200ms, p95 <500ms
- [ ] Monitor database query performance
  - Target: <100ms average
- [ ] Monitor Cloud Functions execution time
  - Target: <2s per function

**User Activity:**
- [ ] Monitor new user signups
  - Expected: First few organic signups within hours
- [ ] Monitor active sessions
- [ ] Monitor page views (Google Analytics)
- [ ] Monitor token purchases
  - Alert if 0 purchases after 48 hours (investigate payment issues)

**Infrastructure:**
- [ ] Monitor server CPU/memory usage
- [ ] Monitor Firebase quota usage
- [ ] Monitor CDN bandwidth
- [ ] Monitor SSL certificate validity

### 8.2 Set Up Alerts

**Critical Alerts (Immediate action required):**
- [ ] Error rate >5% → Alert on-call engineer
- [ ] API response time >5s → Alert on-call engineer
- [ ] Payment processing failure >10% → Alert immediately
- [ ] Database connection failure → Alert immediately
- [ ] SSL certificate expiring <7 days → Alert team

**Warning Alerts (Review within hours):**
- [ ] Error rate >2% → Notify team
- [ ] Zero new signups for 6 hours → Investigate
- [ ] Zero token purchases for 24 hours → Check payment integration
- [ ] Unusual spike in traffic → Scale up or investigate bot traffic

### 8.3 Monitoring Dashboard

Set up real-time dashboard showing:
- Active users (last 5 min)
- New signups (last hour)
- Error rate (last 5 min)
- API response times (p50, p95, p99)
- Token purchases (last hour)
- Server health (CPU, memory, requests/sec)

**Tools:**
- Grafana
- Firebase Console (Firestore usage)
- Google Analytics Real-Time
- Sentry Dashboard
- Cloud provider dashboard (Vercel, AWS, etc.)

---

## 9. Rollback Plan

### 9.1 Web Rollback

**If critical bug discovered:**

**Option 1: Revert to previous version**
```bash
# Vercel
vercel rollback [deployment-url]

# Firebase Hosting
firebase hosting:rollback --project avalo-production
```

**Option 2: Redeploy previous build**
```bash
git checkout v1.0.0-prev
pnpm build
[deploy command]
```

- [ ] Rollback executed
- [ ] Verify previous version is live
- [ ] Notify users of issue (if needed)

### 9.2 Mobile App Rollback

**Android:**
- Cannot immediately rollback (users have already downloaded)
- Options:
  - [ ] Release hotfix with incremented version
  - [ ] Use Firebase Remote Config to disable broken feature
  - [ ] Use staged rollout to halt at current percentage

**iOS:**
- Cannot immediately rollback
- Options:
  - [ ] Release hotfix with incremented version and request expedited review
  - [ ] Use Firebase Remote Config to disable broken feature
  - [ ] Pause phased release

### 9.3 Database Rollback

**If migration caused issues:**
- [ ] Run prepared rollback script
- [ ] Restore from backup (if critical data loss)
- [ ] Verify data integrity

---

## 10. Communication Plan

### 10.1 Internal Communication

**Pre-Launch (T-2 hours):**
- [ ] Notify all teams: "Go-live in 2 hours"
- [ ] On-call engineer confirmed and ready
- [ ] Support team ready for user inquiries

**Launch (T=0):**
- [ ] Notify teams: "Avalo is live!"
- [ ] Share monitoring dashboard link
- [ ] Set up war room channel (Slack/Teams)

**Post-Launch (T+1 hour, T+4 hours, T+24 hours):**
- [ ] Status update: "X signups, Y purchases, Z issues"
- [ ] Share key metrics
- [ ] Celebrate wins, address concerns

### 10.2 External Communication

**Launch Announcement:**
- [ ] Social media posts (Twitter, Instagram, Facebook)
- [ ] Blog post: "Avalo is Live!"
- [ ] Email to beta testers (if any)
- [ ] Press release (if applicable)

**User Support:**
- [ ] Support email monitored 24/7 for first week
- [ ] FAQ updated with common questions
- [ ] In-app support chat available

---

## 11. Success Criteria

**Define what "successful launch" means:**

### 11.1 Technical Metrics (First 48 Hours)
- [ ] Uptime: >99.5%
- [ ] Error rate: <1%
- [ ] Average API response time: <300ms
- [ ] Zero critical bugs (P0)
- [ ] <5 high-priority bugs (P1)

### 11.2 User Metrics (First Week)
- [ ] 100+ signups
- [ ] 50+ completed profiles
- [ ] 20+ matches created
- [ ] 10+ token purchases
- [ ] <5% churn rate
- [ ] Average session time: >5 minutes

### 11.3 Business Metrics (First Month)
- [ ] $1,000+ in token purchases
- [ ] 1,000+ signups
- [ ] 10+ creator payouts processed
- [ ] <10% refund/complaint rate
- [ ] Positive user reviews: >4.0 stars average

---

## 12. Post-Launch Activities

### 12.1 Day 1
- [ ] Monitor metrics every hour
- [ ] Fix any critical bugs immediately
- [ ] Respond to user feedback
- [ ] Celebrate successful launch 🎉

### 12.2 Week 1
- [ ] Daily metrics review
- [ ] User feedback analysis
- [ ] Bug triage and prioritization
- [ ] Plan for first patch release (v1.0.1)

### 12.3 Week 2-4
- [ ] Bi-weekly metrics review
- [ ] Implement highly requested features
- [ ] Optimize performance based on real usage
- [ ] Expand to additional countries (Phase 2)
- [ ] Increase marketing efforts

### 12.4 Month 2+
- [ ] Weekly metrics review
- [ ] Major feature releases (v1.1.0, v1.2.0)
- [ ] SEO optimization based on analytics
- [ ] A/B testing for conversion optimization
- [ ] Scale infrastructure as needed

---

## 13. Lessons Learned & Retrospective

**Schedule retrospective meeting 1 week after launch:**

**Discuss:**
- What went well?
- What could be improved?
- Were there any surprises?
- What would we do differently next time?
- How can we improve our deployment process?

**Document:**
- [ ] Update this checklist with lessons learned
- [ ] Update runbooks with new procedures
- [ ] Improve monitoring/alerting based on gaps found

---

## 14. Emergency Contacts

**On-Call Engineer:** [Name] — [Phone] — [Email]  
**Backup Engineer:** [Name] — [Phone] — [Email]  
**Product Manager:** [Name] — [Phone] — [Email]  
**Support Lead:** [Name] — [Phone] — [Email]

**External Services:**
- **Firebase Support:** https://firebase.google.com/support
- **Stripe Support:** https://support.stripe.com
- **Vercel Support:** https://vercel.com/support
- **Google Play Support:** https://support.google.com/googleplay/android-developer

---

## End of Go-Live Checklist

This checklist must be reviewed and updated before each major release. Sign off required from Engineering Lead and Product Manager before proceeding with production deployment.

**Pre-Launch Sign-Off:**

- [ ] Engineering Lead: _________________ Date: _______
- [ ] Product Manager: _________________ Date: _______
- [ ] QA Lead: _________________________ Date: _______