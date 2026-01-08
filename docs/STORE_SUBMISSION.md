# Avalo Store Submission Guide

Complete step-by-step guide for submitting Avalo to the Apple App Store and Google Play Store.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Google Play Store Submission](#google-play-store-submission)
- [Apple App Store Submission](#apple-app-store-submission)
- [Post-Submission](#post-submission)
- [Common Issues & Solutions](#common-issues--solutions)

## Prerequisites

### Required Accounts
- [ ] **Expo Account** with EAS access
- [ ] **Google Play Console** account ($25 one-time fee)
- [ ] **Apple Developer** account ($99/year)
- [ ] **Firebase Project** with production configuration

### Required Assets
- [ ] App icon (1024x1024 PNG)
- [ ] Feature graphic (1024x500 for Android)
- [ ] Screenshots (multiple devices/sizes)
- [ ] Privacy policy URL
- [ ] Terms of service URL
- [ ] Support email/website
- [ ] Marketing materials

### Build Prerequisites
- [ ] Production build completed via EAS
- [ ] Build tested on physical devices
- [ ] All features functioning correctly
- [ ] No critical bugs

---

## Google Play Store Submission

### Step 1: Prepare Build

```bash
# Build production Android App Bundle
eas build -p android --profile production

# Wait for build to complete (check Expo dashboard)
# Download AAB file when ready
```

### Step 2: Google Play Console Setup

#### 2.1 Create App Listing

1. Go to [Google Play Console](https://play.google.com/console)
2. Click **Create app**
3. Fill in app details:
   - **App name**: Avalo
   - **Default language**: English (US)
   - **App or game**: App
   - **Free or paid**: Free
   - **Declarations**: Accept all required declarations

#### 2.2 Store Listing

Navigate to **Store presence** → **Main store listing**:

**App details**:
- **Short description** (80 chars max):
  ```
  Connect authentically. Meet verified people. Build real relationships.
  ```

- **Full description** (4000 chars max):
  ```
  Avalo is the premium social platform where authentic connections happen.

  ✨ VERIFIED COMMUNITY
  Every user is verified, creating a safe and trustworthy environment.

  💬 MEANINGFUL CONVERSATIONS
  Engage in real conversations with state-of-the-art chat features and AI-powered companions.

  📅 SMART SCHEDULING
  Book and manage meetings with integrated calendar features.

  💎 PREMIUM EXPERIENCE
  Unlock exclusive features with AI companions, priority support, and advanced matching.

  🔒 PRIVACY FIRST
  Your data is protected with enterprise-grade security and transparent privacy controls.

  FEATURES:
  • Verified user profiles
  • Real-time messaging
  • Video calls
  • AI companion chat
  • Calendar integration
  • Event management
  • Secure payments
  • Location-based discovery
  • Advanced search filters

  Join Avalo today and experience social networking reimagined.
  ```

**App icon**: Upload 512x512 PNG

**Feature graphic**: Upload 1024x500 PNG

**Phone screenshots**: Upload 2-8 screenshots
- Minimum resolution: 320px
- Recommended: 1080x1920 or 1080x2340

**Tablet screenshots** (optional): 7" and 10" screenshots

**App category**: Social

**Contact details**:
- **Email**: support@avalo.app
- **Website**: https://avalo.app
- **Phone**: [Your support phone]

**Privacy policy URL**: https://avalo.app/privacy

#### 2.3 Content Rating

1. Navigate to **Policy** → **App content** → **Content rating**
2. Click **Start questionnaire**
3. Select category: **Social, communication**
4. Answer questions honestly:
   - User interaction features: Yes
   - Users can share location: Yes
   - Users can communicate: Yes
   - Age restriction: 18+
5. Submit and receive rating

#### 2.4 Target Audience & Content

1. **Target age**: 18 and over
2. **Content declarations**:
   - [ ] Ads present (if applicable)
   - [ ] In-app purchases: Yes
   - [ ] User-generated content warnings: Yes

#### 2.5 Data Safety

1. Navigate to **Policy** → **App content** → **Data safety**
2. Complete data safety questionnaire:

**Data collection**:
- Personal info: Name, email, phone, profile photo
- Location: Approximate location
- Financial info: Payment information
- Messages: User messages and photos
- Photos and videos: User content

**Data usage**:
- App functionality
- Personalization
- Account management

**Data sharing**:
- Third parties: Payment processors (Stripe)
- Data encrypted in transit: Yes
- Users can request deletion: Yes

3. Submit for review

#### 2.6 App Access

1. Navigate to **Testing** → **Internal testing** or **Closed testing**
2. Provide test credentials if app requires login:
   ```
   Username: test@avalo.app
   Password: [Provide test password]
   ```

### Step 3: Upload Release

#### 3.1 Create Release

1. Navigate to **Release** → **Production**
2. Click **Create new release**
3. Upload AAB file downloaded from EAS
4. Release name: Auto-generated or custom (e.g., "1.0.0")

#### 3.2 Release Notes

Add release notes in all relevant languages:

```
🎉 Welcome to Avalo v1.0!

NEW FEATURES:
• Verified user profiles
• Real-time chat messaging
• AI companion conversations
• Calendar integration
• Secure payment processing
• Location-based discovery

IMPROVEMENTS:
• Optimized performance
• Enhanced security
• Improved user interface
• Bug fixes and stability improvements

We're excited to have you join our community!
```

#### 3.3 Rollout Options

- **Staged rollout**: Start with 20%, monitor, then increase
- **Full rollout**: Release to 100% immediately

Choose staged rollout for safety.

### Step 4: Submit for Review

1. Review all sections (must show green checkmarks)
2. Click **Send for review**
3. Wait for Google's review (typically 1-3 days)
4. Monitor review status in Play Console

### Step 5: Production Release

Once approved:
1. Navigate to **Release** → **Production**
2. Click **Promote to production** (if using testing tracks)
3. Confirm rollout percentage
4. Monitor crash reports and user feedback

---

## Apple App Store Submission

### Step 1: Prepare Build

```bash
# Build production iOS IPA
eas build -p ios --profile production

# Wait for build to complete (check Expo dashboard)
# Submit to TestFlight via EAS Submit
eas submit -p ios --profile production
```

### Step 2: App Store Connect Setup

#### 2.1 Create App

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **My Apps** → **+ button** → **New App**
3. Fill in app information:
   - **Platform**: iOS
   - **Name**: Avalo
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: com.avalo.app
   - **SKU**: avalo-app-001
   - **User Access**: Full Access

#### 2.2 App Information

Navigate to **App Information** section:

**Name**: Avalo

**Subtitle** (30 chars max):
```
Authentic Connections
```

**Category**:
- **Primary**: Social Networking
- **Secondary**: Lifestyle

**Content Rights**: Does not contain third-party content

**Age Rating**: 17+ (Social networking, frequent/intense)

**Privacy Policy URL**: https://avalo.app/privacy

#### 2.3 Pricing and Availability

1. Navigate to **Pricing and Availability**
2. **Price**: Free
3. **Availability**: All territories (or select specific countries)
4. **Pre-orders**: Optional

#### 2.4 App Privacy

1. Navigate to **App Privacy**
2. Click **Get Started**
3. Complete privacy questionnaire:

**Data Types Collected**:
- Contact Info: Name, Email, Phone Number
- Location: Precise Location
- User Content: Photos, Videos, Messages
- Identifiers: User ID
- Usage Data: Product Interaction

**Data Use**:
- App Functionality
- Personalization
- Third-Party Advertising (if applicable)

**Data Linked to User**: Yes
**Data Used to Track User**: Optional (based on your analytics)

4. Publish privacy information

### Step 3: Prepare for Submission

#### 3.1 Screenshots

Required sizes:
- **6.7" Display (iPhone 14 Pro Max)**: 1290 x 2796
- **6.5" Display (iPhone 11 Pro Max)**: 1242 x 2688
- **5.5" Display (iPhone 8 Plus)**: 1242 x 2208

Upload 3-10 screenshots per size.

**iPad Screenshots** (if supporting iPad):
- **12.9" Display**: 2048 x 2732
- **11" Display**: 1668 x 2388

#### 3.2 App Preview (Optional)

Upload app preview videos (15-30 seconds):
- Format: .mov, .mp4, or .m4v
- Resolution: Match screenshot requirements
- Show key features and user experience

### Step 4: Version Information

#### 4.1 What's New

Write release notes (4000 chars max):

```
Welcome to Avalo - Social Networking Reimagined

HIGHLIGHTS:
✨ Verified Community - Every user is verified for your safety
💬 Real Conversations - Chat with AI companions or real people
📅 Smart Scheduling - Integrated calendar and event management
🔒 Privacy First - Enterprise-grade security for your data

KEY FEATURES:
• Verified user profiles with identity verification
• Real-time messaging with read receipts
• AI-powered companions for meaningful conversations
• Video calls with end-to-end encryption
• Calendar integration and event booking
• Location-based discovery
• Secure payment processing
• Advanced search and filtering
• Dark mode support

PREMIUM FEATURES:
• Unlimited AI companion chats
• Priority matching
• Advanced filters
• Read receipts
• Priority support

Your authentic social network awaits. Download now!
```

#### 4.2 Promotional Text (Optional)

170 characters that can be updated without new version:
```
Join the verified community. Experience authentic connections with real people and AI companions. Safe, secure, premium social networking.
```

#### 4.3 Description

```
Avalo is where authentic connections happen. Every user is verified, creating a safe and trustworthy environment for meaningful relationships.

VERIFIED COMMUNITY
Every profile is verified through our secure identity verification process. Connect with confidence knowing everyone is who they say they are.

MEANINGFUL CONVERSATIONS
• Real-time messaging with typing indicators
• AI companion chat for practice and support
• Video calls with HD quality
• Voice messages and media sharing
• Group chats and channels

SMART FEATURES
• Integrated calendar for easy scheduling
• Event creation and management
• Location-based discovery
• Advanced matching algorithms
• Smart notifications

PREMIUM EXPERIENCE
Upgrade to Premium for:
• Unlimited AI companion conversations
• Priority matching
• Advanced search filters
• Read receipts for all messages
• Priority customer support
• No ads
• Early access to new features

PRIVACY & SECURITY
• End-to-end encryption for messages
• Secure payment processing
• GDPR compliant
• Transparent privacy controls
• Block and report features
• Phone/email verification

Perfect for:
• Meeting new people authentically
• Professional networking
• Finding events in your area
• Practicing social interactions with AI
• Building meaningful relationships

SUPPORT
Contact us: support@avalo.app
Website: https://avalo.app
Privacy: https://avalo.app/privacy
Terms: https://avalo.app/terms

Download Avalo today and discover social networking done right.
```

#### 4.4 Keywords

100 characters max (comma-separated):
```
social,networking,chat,dating,friends,verified,ai,companion,calendar,events,meet,nearby
```

#### 4.5 Support URL

https://avalo.app/support

#### 4.6 Marketing URL (Optional)

https://avalo.app

### Step 5: Build Details

#### 5.1 Select Build

1. Click **+ Version or Platform** under **Build**
2. Select the build uploaded via TestFlight
3. Wait for processing to complete

#### 5.2 App Review Information

**Contact Information**:
- First Name: [Your first name]
- Last Name: [Your last name]
- Phone: [Your phone number]
- Email: [Your email address]

**Demo Account** (Required if login needed):
```
Username: review@avalo.app
Password: [Provide test password]

Notes for reviewer:
- This is a test account with sample data
- Location permissions are optional
- In-app purchases use sandbox environment
- All features are accessible without payment
```

**Notes**:
```
Avalo is a social networking platform with verified users.

TESTING NOTES:
• Demo account provided above
• Location permission is optional but enhances experience
• App requires internet connection
• Push notifications improve engagement
• Camera/photo access is for profile photos
• In-app purchases tested in sandbox mode

FEATURES TO TEST:
1. User authentication and profile setup
2. Real-time messaging
3. AI companion chat
4. Calendar/event features
5. Payment processing (sandbox)
6. Location-based discovery

Thank you for reviewing Avalo!
```

#### 5.3 Version Release

Choose release option:
- **Manually release**: You control release timing
- **Automatically release**: Released immediately after approval
- **Scheduled release**: Release on specific date

Recommended: **Manually release** for first version

### Step 6: Export Compliance

1. **Is your app designed to use cryptography?**: Yes
2. **Does your app use encryption exempt from regulations?**: Yes
   - Standard encryption (HTTPS, TLS)
3. Complete CCATS form if required

### Step 7: Content Rights

- [ ] Does not use third-party content
- [ ] Has necessary rights for any third-party content

### Step 8: Advertising Identifier (IDFA)

If using analytics/advertising:
- [ ] Serve advertisements
- [ ] Attribute actions to previous ads
- [ ] Attribute app installs to ads

### Step 9: Submit for Review

1. Review all sections for completeness
2. Click **Add for Review** (top right)
3. Click **Submit to App Review**
4. Monitor status:
   - **Waiting for Review**: In queue
   - **In Review**: Being reviewed (1-3 days)
   - **Pending Developer Release**: Approved, awaiting release
   - **Ready for Sale**: Live on App Store

### Step 10: Release

Once approved:
1. Navigate to **App Store** section
2. Click **Release this version**
3. App goes live within 24 hours

---

## Post-Submission

### Monitor Performance

**Google Play Console**:
- Crashes & ANRs
- User ratings and reviews
- Installation metrics
- Pre-launch reports

**App Store Connect**:
- Crashes
- App Analytics
- User reviews
- Sales and trends

### Respond to Reviews

- Monitor daily
- Respond professionally
- Address common issues
- Thank positive reviewers
- Offer support for problems

### Update Process

**Patch/Minor Updates**:
1. Increment version number
2. Build new release
3. Update "What's New"
4. Submit for review
5. Typical approval: 1-3 days

**Major Updates**:
- Plan release schedule
- Update screenshots if UI changed
- Comprehensive release notes
- Marketing materials
- Press release (optional)

---

## Common Issues & Solutions

### Google Play Console

**Issue**: "Your app contains code that may be used to circumvent security..."
- **Solution**: Remove any obfuscation code, explain legitimate use

**Issue**: "Privacy policy doesn't match data collection"
- **Solution**: Update privacy policy to match declared data usage

**Issue**: "Screenshots don't show actual app content"
- **Solution**: Use real app screenshots, not mockups

**Issue**: "Requires dangerous permissions without clear purpose"
- **Solution**: Add permission justification in manifest and store listing

### Apple App Store

**Issue**: "App crashes on launch"
- **Solution**: Test on actual device, check console logs, fix crash

**Issue**: "Missing privacy manifest"
- **Solution**: Add NSPrivacyAccessedAPI declarations

**Issue**: "App uses restricted APIs"
- **Solution**: Provide justification or remove API usage

**Issue**: "Incomplete demo account"
- **Solution**: Ensure demo account has full feature access

**Issue**: "In-app purchase not working"
- **Solution**: Verify StoreKit configuration, test in sandbox

**Issue**: "Guideline 4.3 - Design: Spam"
- **Solution**: Demonstrate unique features, not a duplicate app

**Issue**: "Guideline 2.1 - Performance: App Completeness"
- **Solution**: Ensure all features work, no placeholder content

### Both Platforms

**Issue**: Long review times
- **Solution**: Submit during off-peak times, ensure app is complete

**Issue**: Multiple rejections
- **Solution**: Address all feedback, test thoroughly before resubmission

**Issue**: Users reporting crashes
- **Solution**: Monitor crash reports, push hot-fix update quickly

---

## Helpful Resources

### Google Play
- [Developer Policy Center](https://play.google.com/about/developer-content-policy/)
- [Launch Checklist](https://developer.android.com/distribute/best-practices/launch/launch-checklist)
- [Play Console Help](https://support.google.com/googleplay/android-developer)

### Apple App Store
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)

### EAS
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [Expo Forums](https://forums.expo.dev/)

---

## Support

For assistance with store submissions:
- Email: support@avalo.app
- Documentation: https://avalo.app/docs
- Community: [Your community link]

**Remember**: First submissions typically take longer. Be patient, thorough, and responsive to reviewer feedback.