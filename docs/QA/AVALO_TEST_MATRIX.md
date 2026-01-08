# AVALO Test Matrix — Pre-Launch QA

**Version:** 1.0  
**Last Updated:** 2025-12-09  
**Purpose:** Define comprehensive test scenarios for Avalo mobile (Android/iOS) and web platforms before production release.

---

## 1. Platform Coverage

### 1.1 Mobile — Android
- **Min Supported Version:** Android 6.0 (API Level 23)
- **Test Devices:**
  - **Small Screen:** Device with 5" display (e.g., Samsung Galaxy A10, 720x1480)
  - **Medium Screen:** Device with 6" display (e.g., Samsung Galaxy S21, 1080x2400)
  - **Large Screen:** Device with 6.5"+ display (e.g., Samsung Galaxy S23 Ultra, 1440x3088)

### 1.2 Mobile — iOS
- **Min Supported Version:** iOS 13.0
- **Test Devices:**
  - **Small Device:** iPhone SE (2020) or iPhone 12/13 mini (5.4", 1080x2340)
  - **Large Device:** iPhone 14 Pro Max or iPhone 15 Pro Max (6.7", 1290x2796)

### 1.3 Web
- **Browsers:**
  - Chrome (current version)
  - Safari (current version)
  - Edge (current version)
- **Viewports:**
  - Desktop: 1920x1080, 1366x768
  - Small Laptop: 1280x720
  - Mobile responsiveness check: 375x667 (iPhone SE), 414x896 (iPhone 11)

---

## 2. Functional Test Areas

### 2.1 Onboarding & Authentication

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **AUTH-001** | Sign up with email + password | User creates account successfully, receives verification email | P0 |
| **AUTH-002** | Sign up with social login (Google) | User authenticates via Google, account created | P1 |
| **AUTH-003** | Sign up with social login (Apple) | User authenticates via Apple, account created (iOS/Web) | P1 |
| **AUTH-004** | Login with email + password | User logs in successfully, redirected to main app | P0 |
| **AUTH-005** | Login with social accounts | User logs in via social provider successfully | P1 |
| **AUTH-006** | Logout | User logs out, session cleared, redirected to login | P0 |
| **AUTH-007** | Password reset flow | User receives reset email, can set new password | P1 |
| **AUTH-008** | Age verification (18+) | User must confirm age 18+, blocked if under 18 | P0 |
| **AUTH-009** | Selfie verification during onboarding | User uploads selfie, AI validates face presence | P0 |
| **AUTH-010** | Legal document acceptance | User must accept ToS + Privacy Policy to proceed | P0 |
| **AUTH-011** | Blocked login on ToS update | User with old ToS version must accept new version before login | P0 |
| **AUTH-012** | Email verification requirement | Unverified email blocks certain features | P1 |

### 2.2 Profile & Photos

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **PROF-001** | Create profile (name, age, gender, orientation) | Profile created with all required fields | P0 |
| **PROF-002** | Upload first photo with face | System accepts photo with face visible | P0 |
| **PROF-003** | Upload photo without face in first slot | System rejects with error: "First 1-6 photos must include your face" | P0 |
| **PROF-004** | Upload animal/landscape in first 6 slots | System rejects with error message | P0 |
| **PROF-005** | Upload lifestyle photo in slot 7+ | System accepts photo (face not required) | P1 |
| **PROF-006** | Upload NSFW explicit content | System detects and blocks NSFW content | P0 |
| **PROF-007** | Upload borderline content | System flags for human review or blocks based on threshold | P1 |
| **PROF-008** | Photo upload error handling | Clear error messages for network/processing failures | P1 |
| **PROF-009** | Edit profile information | Changes saved successfully | P1 |
| **PROF-010** | Change language preference | UI switches to selected language | P1 |
| **PROF-011** | Change region/location | Location updated, affects discovery | P1 |
| **PROF-012** | Add interests/tags | Interests saved and used for matching | P2 |
| **PROF-013** | Profile photo reordering | User can drag to reorder photos | P2 |
| **PROF-014** | Delete photo | Photo removed from profile | P2 |

### 2.3 Discovery & Swipe

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **DISC-001** | View discovery feed | Profiles shown based on preferences | P0 |
| **DISC-002** | Swipe right (like) | Like recorded, match created if mutual | P0 |
| **DISC-003** | Swipe left (pass) | Pass recorded, profile not shown again | P0 |
| **DISC-004** | Daily swipe limit (50/day) | After 50 swipes, user sees limit message | P0 |
| **DISC-005** | Hourly swipe limit (10/hour while active) | After 10 swipes in hour, user must wait | P0 |
| **DISC-006** | Swipe limit reset at midnight | Limits reset correctly at 00:00 local time | P0 |
| **DISC-007** | "Limit reached" message display | Clear message with countdown to next reset | P1 |
| **DISC-008** | Filter by age range | Only profiles within range shown | P1 |
| **DISC-009** | Filter by distance | Profiles within X km shown | P1 |
| **DISC-010** | Filter by gender | Only selected genders shown | P1 |
| **DISC-011** | Filter by interests | Profiles with matching interests prioritized | P2 |
| **DISC-012** | Filter by verification status | Only verified profiles shown (if selected) | P2 |
| **DISC-013** | Passport mode activation | User can set virtual location | P2 |
| **DISC-014** | Passport mode location change | Discovery shows profiles from virtual location | P2 |
| **DISC-015** | Passport mode deactivation | Returns to actual location | P2 |
| **DISC-016** | Match notification | User receives notification on mutual match | P1 |

### 2.4 Chat & Media Monetization

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **CHAT-001** | Start chat with high-popularity profile | Free messages: 6 per side (12 total) | P0 |
| **CHAT-002** | Start chat with low-popularity profile | Free messages: 10 per side (20 total) | P0 |
| **CHAT-003** | Free-chats pool for low-popularity (earn-off) | Pool messages available before paywall | P0 |
| **CHAT-004** | Exhaust free messages | Paywall appears: "Unlock chat for 100 tokens" | P0 |
| **CHAT-005** | Purchase chat unlock (100 tokens base) | 100 tokens deducted, unlimited words unlocked | P0 |
| **CHAT-006** | Per-word billing — Standard tier | 11 words per token charged correctly | P0 |
| **CHAT-007** | Per-word billing — Royal tier | 7 words per token charged correctly | P0 |
| **CHAT-008** | Creator moderated chat price increase | Eligible creator can set higher chat unlock price | P1 |
| **CHAT-009** | Refund unused words on chat end | User's refundable portion returned, Avalo fee kept | P0 |
| **CHAT-010** | Refund unused words on chat expiration | Correct refund calculation after expiration | P1 |
| **CHAT-011** | Send text message | Message delivered and displayed | P0 |
| **CHAT-012** | Send image message | Image uploaded and displayed | P1 |
| **CHAT-013** | Send voice message | Voice recorded, uploaded, playable | P2 |
| **CHAT-014** | Receive NSFW media in chat | NSFW detection, blur or block | P0 |
| **CHAT-015** | Block user from chat | User blocked, chat disabled | P1 |
| **CHAT-016** | Report user from chat | Report submitted with context | P0 |
| **CHAT-017** | Chat typing indicator | Typing status shown in real-time | P2 |
| **CHAT-018** | Chat message delivery status | Sent/delivered/read status indicators | P2 |
| **CHAT-019** | Token balance insufficient for chat | User blocked from sending, prompted to purchase | P0 |

### 2.5 Voice & Video Calls

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **CALL-001** | Initiate voice call | Call starts, billing begins at 10 tokens/min (base) | P0 |
| **CALL-002** | Initiate video call | Call starts, billing begins at 20 tokens/min (base) | P0 |
| **CALL-003** | Voice call — VIP user | 30% discount applied: 7 tokens/min | P0 |
| **CALL-004** | Voice call — Royal user | 50% discount applied: 5 tokens/min | P0 |
| **CALL-005** | Video call — VIP user | 30% discount applied: 14 tokens/min | P0 |
| **CALL-006** | Video call — Royal user | 50% discount applied: 10 tokens/min | P0 |
| **CALL-007** | Call duration measurement | Duration tracked accurately (±1 sec) | P0 |
| **CALL-008** | Call billing calculation | Tokens deducted per minute correctly | P0 |
| **CALL-009** | End call manually | Call stops, final billing applied | P0 |
| **CALL-010** | Dropped call (network issue) | Reconnection offered, billing paused during drop | P1 |
| **CALL-011** | Call reconnection | User can reconnect, billing resumes | P1 |
| **CALL-012** | Insufficient tokens during call | Call warned at low balance, ends at 0 tokens | P0 |
| **CALL-013** | Call quality indicators | UI shows connection quality | P2 |
| **CALL-014** | Mute/unmute audio | Audio state toggles correctly | P1 |
| **CALL-015** | Enable/disable video | Video stream toggles correctly | P1 |
| **CALL-016** | Speaker/earpiece toggle | Audio output switches correctly | P2 |

### 2.6 Calendar & 1:1 Meetings

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **CAL-001** | View creator availability | Calendar shows available time slots | P0 |
| **CAL-002** | Book meeting | User pays tokens, meeting confirmed | P0 |
| **CAL-003** | Meeting price display | Price shown in tokens (Avalo 20%, Creator 80%) | P0 |
| **CAL-004** | User cancels ≥72h before | 100% refund (excluding Avalo fee) | P0 |
| **CAL-005** | User cancels 48-72h before | 50% refund (creator's portion only) | P0 |
| **CAL-006** | User cancels <24h before | 0% refund | P0 |
| **CAL-007** | Creator cancels meeting | 100% refund including Avalo fee | P0 |
| **CAL-008** | Mismatch selfie flow — user triggers | User uploads selfie, system compares to creator profile | P0 |
| **CAL-009** | Mismatch selfie flow — creator triggers | Creator uploads selfie, system compares to user profile | P0 |
| **CAL-010** | Mismatch detected (fail verification) | Meeting ends immediately, 100% token refund to complainant (Avalo fee handling per pack definition) | P0 |
| **CAL-011** | Mismatch not detected (pass verification) | Meeting continues normally | P1 |
| **CAL-012** | Meeting notification reminder | User receives reminder before meeting (e.g., 1h, 15min) | P1 |
| **CAL-013** | Meeting start on time | Both parties can join at scheduled time | P0 |
| **CAL-014** | No-show by user | Creator can report no-show, potential penalties | P2 |
| **CAL-015** | No-show by creator | User can report no-show, refund triggered | P1 |
| **CAL-016** | Reschedule meeting | Meeting moved to new slot with mutual agreement | P2 |

### 2.7 Events (Group Meetings)

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **EVT-001** | Create event | Event created with price, seats, details | P0 |
| **EVT-002** | Event pricing structure | Organizer sets price/seat, Avalo takes 20% | P0 |
| **EVT-003** | Purchase event ticket | User pays tokens, ticket issued | P0 |
| **EVT-004** | Event ticket QR code generation | QR code generated for entry verification | P1 |
| **EVT-005** | Event entry verification (scan QR) | Organizer scans QR, validates ticket | P1 |
| **EVT-006** | Event seat limit enforcement | Sales stop when seats sold out | P0 |
| **EVT-007** | Organizer cancels event | Participants get 80% back, Avalo keeps 20% (per event pack rules) | P0 |
| **EVT-008** | User cancels ticket (if allowed) | Refund policy per event settings | P2 |
| **EVT-009** | Event safety integration — panic button | Participant can trigger panic during event | P0 |
| **EVT-010** | Event safety integration — tracking | Location tracking active during event (if enabled) | P1 |
| **EVT-011** | Event safety integration — report | User can report issues during/after event | P0 |
| **EVT-012** | Event notification — upcoming | Participants reminded before event | P1 |
| **EVT-013** | Event capacity check | Cannot purchase when sold out | P0 |
| **EVT-014** | Event visibility settings | Public/private events work correctly | P2 |

### 2.8 Wallet, Tokens, Store & Payouts

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **WAL-001** | View token balance | Current balance displayed accurately | P0 |
| **WAL-002** | Purchase Mini package (100 tokens — 31.99 PLN) | Tokens added to balance after payment | P0 |
| **WAL-003** | Purchase Basic package (300 tokens — 85.99 PLN) | Tokens added to balance after payment | P0 |
| **WAL-004** | Purchase Standard package (500 tokens — 134.99 PLN) | Tokens added to balance after payment | P0 |
| **WAL-005** | Purchase Premium package (1000 tokens — 244.99 PLN) | Tokens added to balance after payment | P0 |
| **WAL-006** | Purchase Pro package (2000 tokens — 469.99 PLN) | Tokens added to balance after payment | P0 |
| **WAL-007** | Purchase Elite package (5000 tokens — 1125.99 PLN) | Tokens added to balance after payment | P0 |
| **WAL-008** | Purchase Royal package (10000 tokens — 2149.99 PLN) | Tokens added to balance after payment | P0 |
| **WAL-009** | Purchase via Google Play (Android) | Payment processed via Google Play billing | P0 |
| **WAL-010** | Purchase via Apple App Store (iOS) | Payment processed via Apple In-App Purchase | P0 |
| **WAL-011** | Purchase via Stripe (Web) | Payment processed via Stripe checkout | P0 |
| **WAL-012** | Payment failure handling | User notified, tokens not added | P1 |
| **WAL-013** | Token accounting for chat | Tokens deducted correctly for chat messages | P0 |
| **WAL-014** | Token accounting for voice calls | Tokens deducted per minute correctly | P0 |
| **WAL-015** | Token accounting for video calls | Tokens deducted per minute correctly | P0 |
| **WAL-016** | Token accounting for calendar booking | Tokens deducted for meeting purchase | P0 |
| **WAL-017** | Token accounting for event ticket | Tokens deducted for event purchase | P0 |
| **WAL-018** | Transaction history | All transactions viewable with details | P1 |
| **WAL-019** | Payout simulation — 0.20 PLN per token | Creator payouts calculated at 0.20 PLN/token equivalent | P0 |
| **WAL-020** | Payout — 65/35 split enforcement (chat/calls) | Avalo takes 35%, creator gets 65% | P0 |
| **WAL-021** | Payout — 80/20 split enforcement (calendar/events) | Avalo takes 20%, creator gets 80% | P0 |
| **WAL-022** | Payout threshold check | Payout allowed only when threshold met | P1 |
| **WAL-023** | Payout request processing | Creator requests payout, processed within SLA | P1 |
| **WAL-024** | Payout history | Creator can view past payouts | P2 |

### 2.9 Feed / Stories / Reels

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **FEED-001** | Post photo to feed | Photo posted and visible to followers | P1 |
| **FEED-002** | Post short video (reel) | Video posted and playable | P1 |
| **FEED-003** | Feed content visibility | Posts shown based on engagement algorithm | P1 |
| **FEED-004** | Feed content ranking | High-engagement posts ranked higher | P2 |
| **FEED-005** | NSFW content moderation | Explicit content blocked or flagged | P0 |
| **FEED-006** | Like feed post | Like recorded and count updated | P2 |
| **FEED-007** | Comment on feed post | Comment displayed under post | P2 |
| **FEED-008** | Share feed post | Post shared to user's followers | P2 |
| **FEED-009** | Transition from feed to profile | Tapping post author opens profile | P1 |
| **FEED-010** | Transition from feed to chat | Can start chat from feed post | P2 |
| **FEED-011** | Transition from feed to calendar | Can book meeting from feed post | P2 |
| **FEED-012** | Delete own post | Post removed from feed | P2 |
| **FEED-013** | Report inappropriate post | Report submitted for review | P1 |

### 2.10 Notifications & Panic

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **NOTIF-001** | Match notification | Notification sent when mutual match occurs | P0 |
| **NOTIF-002** | New message notification | Notification sent for new chat message | P0 |
| **NOTIF-003** | Meeting booking notification | Notification sent when meeting booked | P0 |
| **NOTIF-004** | Event ticket notification | Notification sent when event ticket purchased | P1 |
| **NOTIF-005** | Safety alert notification | Notification sent for safety incidents | P0 |
| **NOTIF-006** | Earnings summary notification | Periodic summary of earnings sent to creators | P2 |
| **NOTIF-007** | Notification preferences | User can enable/disable notification types | P1 |
| **NOTIF-008** | Quiet hours setting | Notifications suppressed during set hours | P2 |
| **NOTIF-009** | Push notification delivery (Android) | FCM delivers notifications correctly | P0 |
| **NOTIF-010** | Push notification delivery (iOS) | APNs delivers notifications correctly | P0 |
| **NOTIF-011** | In-app notification badge | Unread count shown in app | P1 |
| **PANIC-001** | Trigger panic button during meeting | Panic triggered, emergency contact alerted | P0 |
| **PANIC-002** | Panic button — contact receives alert | Contact receives alert with allowed data | P0 |
| **PANIC-003** | Panic button — location tracking | Location shared with contact during panic | P0 |
| **PANIC-004** | Panic button — session stop | Meeting/call stopped immediately | P0 |
| **PANIC-005** | Panic button accessibility | Button easily accessible during all meeting types | P0 |
| **PANIC-006** | False panic handling | User can cancel accidental panic | P1 |

### 2.11 AI Assist & Analytics

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **AI-001** | AI Assist visible to earning profiles | Earning profiles see AI Assist features | P1 |
| **AI-002** | AI Assist uses aggregated stats only | No private content used in AI insights | P0 |
| **AI-003** | AI Assist localized messages | Messages shown in user's language | P1 |
| **AI-004** | AI insights — engagement trends | Shows trends in profile engagement | P2 |
| **AI-005** | AI insights — earning optimization | Suggests ways to optimize earnings | P2 |
| **AI-006** | AI insights — best posting times | Recommends optimal posting times | P2 |
| **AI-007** | Analytics dashboard access | Earning profiles can view detailed analytics | P1 |
| **AI-008** | Analytics — viewer demographics | Shows age, location, gender of viewers | P2 |
| **AI-009** | Analytics — revenue breakdown | Shows earnings by source (chat, calls, etc.) | P1 |

### 2.12 Globalization & Legal

| Test Case | Description | Expected Result | Priority |
|-----------|-------------|-----------------|----------|
| **GLOB-001** | Language auto-detection | App detects device language and uses it | P0 |
| **GLOB-002** | Manual language change | User can switch language in settings | P0 |
| **GLOB-003** | Language applied across app | All UI elements updated to selected language | P0 |
| **GLOB-004** | Legal documents by region | Correct ToS/Privacy Policy shown per region | P0 |
| **GLOB-005** | Legal documents by language | Legal docs shown in user's language | P0 |
| **GLOB-006** | ToS/Privacy acceptance tracking | System records acceptance date and version | P0 |
| **GLOB-007** | Block access without acceptance | User cannot use app without accepting current ToS | P0 |
| **GLOB-008** | Currency localization | Prices shown in user's local currency (where applicable) | P1 |
| **GLOB-009** | Date/time format localization | Dates/times shown per locale | P1 |
| **GLOB-010** | Region-specific feature availability | Features enabled/disabled per region | P1 |

---

## 3. Test Execution Guidelines

### 3.1 Test Priorities

- **P0 (Critical):** Must pass before any release. Blocking bugs require immediate fix.
- **P1 (High):** Should pass for quality release. Can be deferred only with explicit approval.
- **P2 (Medium):** Nice to have. Can be addressed in patch releases.

### 3.2 Test Environment

- **Staging:** Use staging environment with test data for all pre-production testing.
- **Production:** Only smoke tests with minimal real transactions after deployment.

### 3.3 Test Data Requirements

- Test accounts with various tiers (Free, VIP, Royal)
- Profiles with different popularity levels (high/low)
- Pre-configured calendar slots, events, and test meetings
- Test payment cards (Stripe test mode, Google/Apple sandbox)

### 3.4 Regression Testing

- Run full regression suite before each release
- Automated tests for critical paths (auth, payment, chat unlock)
- Manual tests for user experience flows

### 3.5 Test Reporting

- Log all issues in issue tracker with:
  - Platform/device details
  - Steps to reproduce
  - Expected vs actual behavior
  - Screenshots/videos
  - Priority level

---

## 4. Platform-Specific Considerations

### 4.1 Android
- Test on multiple Android versions (6.0, 9.0, 12.0, 14.0)
- Test on devices from different manufacturers (Samsung, Google Pixel, OnePlus)
- Verify Google Play Services dependencies
- Test camera/media permissions
- Test background/foreground transitions

### 4.2 iOS
- Test on different iOS versions (13.0, 14.0, 15.0, 16.0, 17.0)
- Verify App Store review guidelines compliance
- Test Face ID / Touch ID integration
- Test camera/media permissions
- Test background/foreground transitions
- Verify no private APIs are used

### 4.3 Web
- Test responsive breakpoints
- Test browser back/forward navigation
- Test session persistence
- Test across different network speeds (fast 3G, 4G, WiFi)
- Verify no console errors or warnings

---

## 5. Test Result Template

Use this template for documenting test results:

```
Test Case ID: [e.g., CHAT-001]
Test Case: [Brief description]
Platform: [Android/iOS/Web]
Device/Browser: [Details]
OS/Browser Version: [Version]
Test Date: [YYYY-MM-DD]
Tester: [Name]

**Status:** [PASS / FAIL / BLOCKED]

**Steps:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Notes:**
[Any additional observations]

**Screenshots/Videos:**
[Attach or link to media]
```

---

## End of Test Matrix

This test matrix should be updated as new features are added or existing features are modified. All test cases should be executed before each production release.