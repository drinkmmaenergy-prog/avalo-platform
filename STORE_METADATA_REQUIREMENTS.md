
# Avalo App Store Metadata & Assets Requirements

## Overview

This document outlines all required metadata, assets, and configurations for publishing Avalo on Google Play Store and Apple App Store.

---

## Table of Contents

1. [App Store Presence](#1-app-store-presence)
2. [Google Play Store Requirements](#2-google-play-store-requirements)
3. [Apple App Store Requirements](#3-apple-app-store-requirements)
4. [Content Rating & Classification](#4-content-rating--classification)
5. [Legal Pages & URLs](#5-legal-pages--urls)
6. [Marketing Assets](#6-marketing-assets)
7. [Localization](#7-localization)
8. [Store Optimization (ASO)](#8-store-optimization-aso)
9. [Pre-Launch Checklist](#9-pre-launch-checklist)

---

## 1. App Store Presence

### Basic Information

| Field | Value |
|-------|-------|
| **App Name** | Avalo |
| **Developer Name** | Avalo Inc. |
| **Bundle ID (iOS)** | com.avalo.app |
| **Package Name (Android)** | com.avalo.app |
| **Primary Category** | Dating / Social Networking |
| **Secondary Category** | Lifestyle |
| **Content Rating** | 18+ (Mature) |

### Short Description (80 characters max)

```
Connect, date, and earn - the adult dating platform reimagined
```

Alternative:
```
Adult dating app with creator economy - meet, chat, and earn rewards
```

### Long Description

#### Google Play (4000 characters max)

```
Welcome to Avalo - The Revolutionary Adult Dating & Creator Platform

Avalo combines authentic dating with a thriving creator economy, where connections matter and everyone can earn. Whether you're looking for meaningful relationships, exciting conversations, or building your personal brand, Avalo provides the perfect platform.

✨ KEY FEATURES

🔥 Smart Matching
• AI-powered recommendations based on your preferences
• Advanced filters for location, interests, and lifestyle
• Swipe to connect with verified profiles
• Instant chat with matches

💰 Earn While You Connect
• Token-based economy rewards engagement
• Premium content monetization for creators
• Referral rewards program
• Creator Academy with tips and strategies

🎯 Creator Tools
• AI companion creation for passive income
• Digital product marketplace
• Premium subscriptions and fan clubs
• Live streaming and events
• Analytics dashboard

🛡️ Safety First
• Mandatory selfie verification
• 24/7 moderation and reporting
• Panic button for emergencies
• Privacy controls and blocking
• Age verification (18+)

💬 Premium Chat Features
• End-to-end encrypted messages
• Photo and video sharing
• Voice and video calls
• Gift sending and reactions
• Message boost for visibility

🎁 Token Economy
• Earn tokens through app activities
• Purchase tokens for premium features
• Send gifts and tips to creators
• Unlock premium content
• Transparent, fair pricing

🌍 Global Community
• Connect with people worldwide
• Multi-language support
• Cultural safety warnings
• Regional compliance

📱 Advanced Features
• Stories and feeds
• Achievement system and badges
• Missions and challenges
• Calendar integration
• Incognito mode for privacy

WHO IS AVALO FOR?

For Singles: Find meaningful connections, dates, and relationships with verified users who share your interests.

For Creators: Build your brand, monetize your content, and connect with fans in a safe, supportive environment.

For Everyone: Enjoy a modern dating app that respects your time, rewards your engagement, and prioritizes your safety.

🔞 CONTENT RATING: 18+

Avalo is an adult platform featuring:
• User-generated content
• Dating and romantic content
• Optional NSFW content (with consent gates)
• Financial transactions
• In-app purchases

All users must be 18+ and verify their age during registration.

🔐 PRIVACY & SECURITY

Your privacy is our priority:
• End-to-end encrypted communications
• GDPR compliant
• No data selling
• Transparent policies
• User-controlled privacy settings

💡 WHY CHOOSE AVALO?

✓ Authentic connections, not endless swiping
✓ Fair creator economy with real earnings
✓ Industry-leading safety features
✓ Active moderation and support
✓ Regular updates and new features
✓ Community-driven development

📱 PREMIUM FEATURES (Optional)

• Unlimited swipes
• See who liked you
• Advanced filters
• Incognito mode
• Priority support
• Exclusive badges

Download Avalo today and join thousands building connections and earning rewards!

Support: support@avalo.app
Terms: avalo.app/legal/terms
Privacy: avalo.app/legal/privacy

Note: Requires internet connection. Optional in-app purchases available. Must be 18+ to use.
```

#### Apple App Store (4000 characters max)

```
Avalo - Where Dating Meets Creator Economy

Discover Avalo, the revolutionary platform that combines authentic dating with creator opportunities. Connect with verified users, build meaningful relationships, and earn rewards for your engagement.

SMART DATING

• AI-powered matching based on your preferences
• Advanced filters for better connections
• Verified profiles for safety
• Instant messaging with matches
• Video and voice calls

CREATOR ECONOMY

• Earn tokens through engagement
• Monetize your content
• Build a following
• AI companion tools
• Analytics and insights

SAFETY & PRIVACY

• Selfie verification required
• 24/7 moderation
• Emergency panic button
• Privacy controls
• Secure, encrypted chats

PREMIUM FEATURES

• Token-based rewards system
• Premium subscriptions
• Gift sending
• Boost visibility
• Exclusive content

COMMUNITY

• Global user base
• Multi-language support
• Cultural awareness
• Active support team

AGE RATING: 17+

Avalo contains user-generated content, dating features, and optional in-app purchases. Age verification required.

SUBSCRIPTIONS

Optional premium subscriptions available with auto-renewal. Manage in Settings.

Support: support@avalo.app
Terms: avalo.app/legal/terms
Privacy: avalo.app/legal/privacy
```

---

## 2. Google Play Store Requirements

### App Information

```json
{
  "appName": "Avalo",
  "packageName": "com.avalo.app",
  "defaultLanguage": "en-US",
  "category": "DATING",
  "tags": ["dating", "social", "creators", "networking", "chat"]
}
```

### Content Rating Questionnaire

**IARC (International Age Rating Coalition)**

1. **Does your app contain violence?**
   - Answer: No

2. **Does your app contain sexual content?**
   - Answer: Yes
   - Details: User-generated content may include romantic/dating content
   - Severity: Moderate

3. **Does your app contain explicit language?**
   - Answer: Yes
   - Details: User chat may contain strong language
   - Severity: Moderate

4. **Does your app contain drug/alcohol references?**
   - Answer: No

5. **Does your app contain gambling content?**
   - Answer: No

6. **Is your app social?**
   - Answer: Yes
   - Details: Users can chat, share content, connect

7. **Does your app require user registration?**
   - Answer: Yes

8. **Can users share personal information?**
   - Answer: Yes

9. **Can users make in-app purchases?**
   - Answer: Yes

10. **Can users communicate with other users?**
    - Answer: Yes

**Expected Rating**: Mature 17+ / PEGI 18+ / USK 18+

### Screenshots Requirements

**Phone Screenshots** (Required: 2-8 images)
- Resolution: 1080x1920px (9:16 ratio) or higher
- Format: PNG or JPEG
- Max size: 8MB each

Recommended screenshots:
1. Welcome screen with tagline
2. Profile browsing/swipe view
3. Chat interface
4. Token/wallet screen
5. Creator dashboard
6. Safety features highlight
7. Premium features showcase
8. Success story testimonial

**Tablet Screenshots** (Optional but recommended)
- Resolution: 1536x2048px or higher
- Format: PNG or JPEG

**Wear OS Screenshots** (Not applicable)

### Feature Graphic

- Resolution: 1024x500px
- Format: PNG or JPEG
- Purpose: Featured placement in Play Store
- Content: Hero image with app branding

### App Icon

- Resolution: 512x512px
- Format: PNG (32-bit)
- No transparency
- No rounded corners (Android handles this)

### Video (Optional but highly recommended)

- YouTube URL
- Duration: 30-120 seconds
- Showcases key features
- Appropriate for 18+ audience

### Privacy Policy URL

```
https://avalo.app/legal/privacy
```

### Store Listing Contact Details

```
Website: https://avalo.app
Email: support@avalo.app
Phone: [Your support number]
Address: [Your company address]
```

### Data Safety Section

**Data Collection:**
- Account information (name, email, phone)
- Profile data (photos, bio, preferences)
- Location data (approximate for matching)
- Chat messages (encrypted)
- Financial data (payment information)
- Usage analytics

**Data Sharing:**
- With other users (profile, messages)
- With payment processors (transactions)
- With cloud providers (storage)

**Security Practices:**
- Data encrypted in transit (SSL/TLS)
- Data encrypted at rest
- Option to delete account and data
- Regular security audits

### Restricted Content Declaration

**Declare that your app contains:**
- [x] User-generated content
- [x] Dating/romantic content
- [x] In-app purchases
- [x] Digital goods/services
- [x] 18+ content (with appropriate gates)

---

## 3. Apple App Store Requirements

### App Information

```json
{
  "appName": "Avalo",
  "bundleId": "com.avalo.app",
  "primaryLanguage": "English (U.S.)",
  "category": "Social Networking",
  "secondaryCategory": "Lifestyle"
}
```

### App Store Screenshots

**iPhone Screenshots** (Required)
- iPhone 6.5": 1284x2778px (2778x1284 landscape)
- iPhone 6.7": 1290x2796px (2796x1290 landscape)
- iPhone 5.5": 1242x2208px (2208x1242 landscape)

**iPad Screenshots** (If supporting iPad)
- iPad Pro 12.9": 2048x2732px (2732x2048 landscape)
- iPad Pro 11": 1668x2388px (2388x1668 landscape)

### App Preview Video (Optional)

- Duration: 15-30 seconds
- Resolution: Match screenshot sizes
- Format: M4V, MP4, or MOV
- No audio or subtitles required (but recommended)

### App Icon

- 1024x1024px
- PNG format
- No transparency
- No corners (iOS handles this)

### Age Rating (via App Store Connect)

**Apple Age Rating Questionnaire:**

1. **Cartoon or Fantasy Violence:** None
2. **Realistic Violence:** None
3. **Sexual Content or Nudity:** Moderate (user-generated)
4. **Profanity or Crude Humor:** Moderate (user chat)
5. **Alcohol, Tobacco, or Drug Use:** None
6. **Mature/Suggestive Themes:** Frequent (dating app)
7. **Simulated Gambling:** None
8. **Horror/Fear Themes:** None
9. **Medical/Treatment Information:** None
10. **Unrestricted Web Access:** No
11. **Made For Kids:** No

**Expected Rating:** 17+

**Reason:** Dating app with user-generated content and mature themes

### Privacy Nutrition Labels

**Data Collected:**

Contact Info:
- [x] Name
- [x] Email Address
- [x] Phone Number

User Content:
- [x] Photos or Videos
- [x] Audio Data
- [x] Other User Content (bio, preferences)

Identifiers:
- [x] User ID

Usage Data:
- [x] Product Interaction
- [x] Advertising Data

Location:
- [x] Coarse Location

Financial Info:
- [x] Purchase History
- [x] Payment Info (via payment processor)

**Data Linked to User:**
- All of the above

**Data Used to Track:**
- Usage data for personalization

**Third Parties:**
- Firebase (analytics, auth, storage)
- Payment processors (Stripe/Apple Pay)
- Cloud storage (Google Cloud)

### Promotional Text (170 characters)

```
New: AI companions, creator marketplace & live events! Join the dating revolution where connections matter and everyone can earn. Download now!
```

### Keywords (100 characters, comma-separated)

```
dating,social,chat,creators,adult,18+,relationships,tokens,earn,networking
```

### What's New (4000 characters)

```
Version 1.0.0 - Welcome to Avalo!

NEW FEATURES
• Smart AI matching for better connections
• Token economy with earning opportunities
• Creator tools and monetization
• Live video calls and chat
• Safety features and verification
• Premium content marketplace

IMPROVEMENTS
• Enhanced profile customization
• Faster matching algorithm
• Improved chat performance
• Better notification system

We're excited to bring you Avalo! Share your feedback at support@avalo.app
```

### Support URL

```
https://avalo.app/support
```

### Marketing URL

```
https://avalo.app
```

### Privacy Policy URL

```
https://avalo.app/legal/privacy
```

### Terms of Service URL (EULA)

```
https://avalo.app/legal/terms
```

---

## 4. Content Rating & Classification

### Age Rating Guidelines

| Platform | Rating | Justification |
|----------|--------|---------------|
| **Google Play** | Mature 17+ | User-generated content, dating, optional NSFW |
| **Apple App Store** | 17+ | Dating app, mature themes, user content |
| **ESRB** | Adults Only (18+) | Dating, user-generated content |
| **PEGI** | 18+ | Sexual content, online interaction |

### Content Warnings

Users must acknowledge:

1. **Age Requirement**
   - Must be 18 years or older
   - Age verification required
   - Legal age varies by jurisdiction

2. **User-Generated Content**
   - May contain mature themes
   - Not pre-screened (post-moderation)
   - Report inappropriate content

3. **Financial Transactions**
   - Real money purchases available
   - Token system for virtual goods
   - Creator earnings (real money)

4. **Online Interaction**
   - Chat with strangers
   - Share personal information
   - Location-based matching

5. **NSFW Content (Optional)**
   - Explicit content available behind consent gates
   - User-controlled visibility
   - Age-gated access

### Regional Compliance

**European Union (GDPR)**
- Data processing consent required
- Right to access/delete data
- Data portability
- Cookie consent

**United States**
- COPPA compliance (18+ restriction)
- State-specific regulations
- CCPA (California)

**United Kingdom**
- ICO guidelines
- Age Appropriate Design Code
- Online Safety Bill compliance

**Other Markets**
- Country-specific age verification
- Local content regulations
- Payment compliance

---

## 5. Legal Pages & URLs

All legal pages must be publicly accessible and linked in the app.

### Required Legal Routes

| Route | Purpose | Status |
|-------|---------|--------|
| `/legal/terms` | Terms of Service | ✅ Required |
| `/legal/privacy` | Privacy Policy | ✅ Required |
| `/legal/refund` | Refund Policy | ✅ Required |
| `/legal/safety` | Safety Center & Guidelines | ✅ Required |
| `/legal/content` | Content Policy | ✅ Required |
| `/legal/cookies` | Cookie Policy (EU) | ✅ Required |
| `/legal/nsfw` | NSFW Content Guidelines | ✅ Required |
| `/legal/payouts` | Creator Payout Terms | ✅ Required |
| `/legal/ai` | AI Usage Policy | ✅ Required |

### Legal Page Requirements

Each legal page must include:
- Last updated date
- Contact information
- Version number
- Acceptance mechanism
- Plain language summary

### Implementation

Firebase Hosting routes configured in [`firebase.json`](firebase.json:1) should handle:

```json
{
  "rewrites": [
    {
      "source": "/legal/**",
      "destination": "/legal.html"
    }
  ]
}
```

Or Next.js routes in web app:
- `app/legal/[page]/page.tsx` (dynamic route)
- Static generation for SEO

---

## 6. Marketing Assets

### Asset Specifications

#### App Icons

**Android (Google Play)**
```
High-res icon: 512x512px, PNG, 32-bit, no transparency
Adaptive icon:
  - Foreground: 108x108dp safe zone
  - Background: 108x108dp (can be color or image)
```

**iOS (App Store)**
```
App icon: 1024x1024px, PNG, no transparency, no alpha
Various sizes generated automatically by Xcode
```

#### Feature Graphics

**Android Feature Graphic**
```
Size: 1024x500px
Format: PNG or JPEG
Usage: Play Store featured placement
Content: Brand hero image, no text (except logo)
```

**iOS App Preview Poster Frame**
```
Size: Matches screenshot dimensions
Format: JPEG
Usage: Video thumbnail
Content: Compelling frame from app preview
```

#### Screenshots

**Recommended Screenshot Set (Both Platforms)**

1. **Hero/Welcome Screen**
   - App logo and tagline
   - Key value proposition
   - Call to action

2. **Matching/Discovery**
   - Profile cards/swipe interface
   - Filters and preferences
   - Match notification

3. **Chat Interface**
   - Message bubbles
   - Media sharing
   - Video call option

4. **Token Economy**
   - Wallet/balance
   - Earning opportunities
   - Premium features

5. **Creator Dashboard**
   - Analytics overview
   - Earnings summary
   - Content management

6. **Safety Features**
   - Verification badge
   - Panic button
   - Privacy controls

7. **Premium/Features**
   - Subscription benefits
   - Exclusive features
   - Value proposition

8. **Social Proof**
   - User testimonials
   - App ratings
   - Community highlights

#### Video Requirements

**App Preview Video (iOS)**
- Duration: 15-30 seconds
- No longer than 30 seconds
- Can include narration/music
- Show actual app functionality
- Localized if possible

**Promo Video (Google Play)**
- Duration: 30-120 seconds
- YouTube hosted
- Can be marketing-style
- Include app demo
- Subtitles recommended

### Design Guidelines

**Colors**
- Primary: #[Brand Color]
- Secondary: #[Accent Color]
- Background: #[BG Color]
- Text: #[Text Color]

**Typography**
- Heading: [Font Family]
- Body: [Font Family]
- Consistent sizes

**Imagery**
- High quality, crisp
- Diverse representation
- Appropriate for 18+ audience
- No misleading content

---

## 7. Localization

### Supported Languages (Initial Launch)

**Primary Markets**
- English (US)
- English (UK)
- Spanish (Spain)
- Spanish (Latin America)
- Portuguese (Brazil)
- French
- German
- Italian

**Secondary Markets (Future)**
- Japanese
- Korean
- Chinese (Simplified)
- Chinese (Traditional)
- Russian
- Arabic
- Dutch
- Polish
- Turkish

### Localized Content Required

**App Store Listing**
- App name (if localized)
- Short description
- Long description
- Keywords
- Screenshots (with localized text)
- What's New text

**In-App Content**
- UI strings
- Error messages
- Legal pages
- Help documentation
- Email templates
- Push notifications

### Localization Tools

```bash
# Extract translatable strings
expo export:strings

# Use i18n libraries
- react-i18next (React Native)
- react-intl (Web)

# Translation management
- Lokalise, Phrase, or Crowdin
```

---

## 8. Store Optimization (ASO)

### Keyword Strategy

**High-Priority Keywords**
1. dating app
2. adult dating
3. creator platform
4. earn money dating
5. verified dating
6. token dating
7. social networking
8. chat app
9. video dating
10. safe dating

**Long-Tail Keywords**
- dating app with verification
- earn tokens dating
- creator dating platform
- verified adult dating app
- dating app rewards

### Title Optimization

**Google Play (50 characters)**
```
Avalo: Dating & Creator Platform
```

**Apple App Store (30 characters)**
```
Avalo - Dating & Creators
```

### Subtitle (iOS only, 30 characters)

```
Meet, Chat, Earn Rewards
```

### Competitor Analysis

Track and differentiate from:
- Tinder (mainstream dating)
- Bumble (women-first)
- OnlyFans (creator platform)
- Seeking (sugar dating)
- Hinge (relationship-focused)

**Avalo's USP:**
- Combines dating + creator economy
- Fair token system
- Safety-first approach
- Verified community
- Multiple revenue streams

---

## 9. Pre-Launch Checklist

### App Preparation

- [ ] App icon designed and exported (all sizes)
- [ ] Screenshots captured for all required devices
- [ ] Feature graphic/poster frame created
- [ ] App preview videos recorded and edited
- [ ] All copy written and reviewed
- [ ] Keywords researched and selected
- [ ] Age rating questionnaire completed
- [ ] Privacy policy published and linked
- [ ] Terms of service published and linked
- [ ] Support email configured and monitored
- [ ] Website live with all legal pages

### Technical Requirements

- [ ] App builds successfully on EAS
- [ ] All features working in production build
- [ ] Push notifications configured
- [ ] In-app purchases tested
- [ ] Deep linking configured
- [ ] Analytics integrated
- [ ] Crash reporting active
- [ ] Performance optimized
- [ ] Accessibility checked
- [ ] Security audit completed

### Store-Specific

**Google Play Console**
- [ ] Developer account created and verified
- [ ] Payment profile set up
- [ ] App created in console
- [ ] Store listing completed
- [ ] Content rating obtained
- [ ] Data safety section filled
- [ ] Pricing set (free with IAP)
- [ ] Distribution countries selected
- [ ] Release signed with proper keystore
- [ ] Internal testing track tested
- [ ] Closed beta tested (optional)
- [ ] Production release prepared

**Apple App Store Connect**
- [ ] Developer account enrolled ($99/year)
- [ ] App ID registered
- [ ] Certificates and provisioning profiles created
- [ ] App created in App Store Connect
- [ ] Store listing completed
- [ ] App privacy details submitted
- [ ] Age rating completed
- [ ] Pricing set (free with IAP)
- [ ] Territories selected
- [ ] TestFlight build tested
- [ ] App Review Information completed
- [ ] Demo account provided (if applicable)

### Compliance

- [ ] GDPR compliance documented
- [ ] COPPA compliance (18+ restriction)
- [ ] CCPA compliance (California)
- [ ] Content moderation system active
- [ ] Age verification system working
- [ ] Reporting system functional
- [ ] Privacy controls implemented
- [ ] Data export/deletion functional
- [ ] Terms acceptance flow complete

### Marketing

- [ ] Landing page live
- [ ] Social media accounts created
- [ ] Press kit prepared
- [ ] Launch announcement drafted
- [ ] Influencer outreach planned
- [ ] Email list built
- [ ] Launch date scheduled
- [ ] Support team briefed
- [ ] FAQ document created
- [ ] Community guidelines published

---

## 10. Post-Launch Monitoring

### Key Metrics to Track

**Downloads & Installs**
- Daily active users (DAU)
- Monthly active users (MAU)
- Install attribution
- Uninstall rate

**Store Performance**
- Conversion rate (views → installs)
- Keyword rankings
- Category rankings
- Ratings and reviews

**Engagement**
- Session length
- Feature usage
- Retention (D1, D7, D30)
- Churn rate

**Revenue**
- Token purchases
- Premium subscriptions
- Creator earnings
- Average revenue per user (ARPU)

**Quality**
- Crash rate
- App load time
- API response times
- Bug reports

### Review Management

**Response Strategy**
- Respond to all reviews within 24-48 hours
- Thank positive reviewers
- Address negative feedback constructively
- Fix reported issues quickly
- Request review updates after fixes

**Rating Optimization**
- Prompt satisfied users for reviews
- Use in-app rating prompts (iOS 14+)
- Avoid over-prompting (3-4 sessions minimum)
- Time prompts after positive actions

---

## 11. Store Policy Compliance

### Google Play Policies

**Restricted Content**
- [x] Age-restricted content properly gated
- [x] User-generated content moderated
- [x] No prohibited content (illegal, harmful)
- [x] Accurate content rating

**Monetization**
- [x] No misleading pricing
- [x] Clear refund policy
- [x] Proper IAP implementation
- [x] No circumventing Play billing

**Privacy & Security**
- [x] Prominent privacy policy
- [x] Data safety section accurate
- [x] No unauthorized data collection
- [x] Secure data transmission

### Apple App Store Guidelines

**Safety**
- [x] 1.4.4: Age rating accurately reflects content
- [x] 1.2: User-generated content has reporting
- [x] 2.3.8: No false information or features

**Performance**
- [x] 2.1: App functions as described
- [x] 2.3: Accurate screenshots and description
- [x] 2.4.2: No irrelevant features

**Business**
- [x] 3.1.1: Proper use of IAP
- [x] 3.2.1: Acceptable payments
- [x] 5.1.1: Privacy policy required

**Design**
- [x] 4.2: Minimum functionality
- [x] 4.5: Apple Watch not misleading
- [x] Follows Human Interface Guidelines

---

## 12. Rejection Prevention

### Common Rejection Reasons

**Google Play**
1. Misleading screenshots or description
2. Inappropriate content rating
3. Incomplete data safety section
4. Missing or incorrect privacy policy
5. Circumventing billing

**Apple App Store**
1. Incomplete information in review
2. 18+ content not properly gated
3. Bugs or crashes during review
4. Missing demo account for restricted features
5. Non-functional features

### Review Preparation

**Provide for Apple Review**
```
Demo Account:
Username: review@avalo.app
Password: [Secure demo password]

Notes:
- App requires 18+ age verification
- Some features require token purchase (test tokens provided)
- Creator features demonstrated in demo account
- All NSFW content behind consent gates
```

**Test Before Submission**
- [ ] Clean install works
- [ ] Sign-up flow completes
- [ ] All menu items functional
- [ ] IAP can be initiated
- [ ] No crashes or hangs
- [ ] Graceful error handling
- [ ] Links open correctly

---

## Status: ✅ STORE REQUIREMENTS DOCUMENTED

All store metadata and requirements have been specified. Ready for:
1. Asset creation (graphics, screenshots, videos)
2. Copy finalization
3. Legal page implementation
4. Store submissions

Last Updated: 2025-11-28