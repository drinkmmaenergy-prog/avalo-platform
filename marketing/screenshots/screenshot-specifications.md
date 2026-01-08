# Avalo – Screenshot Specifications

## Overview
This document defines the exact specifications for App Store and Google Play screenshots, including dimensions, content, captions, and design guidelines.

---

## Screenshot Dimensions

### iOS (App Store)
- **iPhone 6.7" (Pro Max):** 1290 × 2796 pixels (required)
- **iPhone 6.5" (Plus):** 1242 × 2688 pixels (fallback)
- **Format:** PNG, RGB color space, no transparency

### Android (Google Play)
- **Standard:** 1080 × 2340 pixels (9:19.5 aspect ratio)
- **Alternative:** 1080 × 1920 pixels (9:16 aspect ratio)
- **Format:** PNG or JPEG, max 8MB each

### Requirements
- Minimum: 2 screenshots
- Recommended: 6-8 screenshots per platform
- Order matters: first screenshot is most visible

---

## Screenshot Set (8 screens)

### 1. Hero / Welcome Screen
**Scene:** App opening with gradient animation and tagline
**Content:**
- Full Avalo gradient background (#FF6B00 → #FF3C8E → #7B2EFF)
- App logo (white)
- Tagline: "Where Authentic Connections Pay Off"
- CTA: "Join Avalo"
- Subtle phone mockup showing feed

**Caption (EN):** "Meet, Chat & Earn with Avalo"
**Caption (PL):** "Poznaj, rozmawiaj i zarabiaj z Avalo"

**Design Notes:**
- Clean, minimal, high contrast
- Logo centered in upper third
- 72pt font for tagline
- Soft glow effect on gradient

---

### 2. Discovery Feed
**Scene:** Main feed showing 2-3 profile cards
**Content:**
- Profile cards with photos
- Name, age, distance
- Verified badges visible
- Bio preview
- Like/Pass buttons with gradient
- Top navigation bar

**Caption (EN):** "Discover People Nearby"
**Caption (PL):** "Odkrywaj ludzi w pobliżu"

**Design Notes:**
- Show diversity in profiles
- Gradient buttons prominent
- Clear UI, modern cards
- Glass effect on top bar

---

### 3. Chat Interface
**Scene:** Active chat conversation
**Content:**
- 4-6 message bubbles
- User avatar at top with online status
- Message input with token indicator
- "3 free messages remaining" banner (or token balance)
- Time stamps
- Gradient send button

**Caption (EN):** "Quality Conversations That Matter"
**Caption (PL):** "Wartościowe rozmowy, które się liczą"

**Design Notes:**
- Show engaging conversation
- Token balance visible but not intrusive
- Message bubbles with subtle shadows
- Sender bubbles with gradient

---

### 4. Wallet & Tokens
**Scene:** Wallet screen with balance and transactions
**Content:**
- Large token balance prominently displayed
- Earnings breakdown (if applicable)
- Recent transactions list
- "Add Tokens" CTA button with gradient
- Earnings chart or icon
- Stripe logo/badge for trust

**Caption (EN):** "Transparent Token Economy"
**Caption (PL):** "Przejrzysta ekonomia tokenów"

**Design Notes:**
- Clean financial UI
- Token icon prominent
- Green for earnings, gradient for tokens
- Professional, trustworthy design

---

### 5. AI Companions
**Scene:** AI chat interface clearly marked
**Content:**
- AI companion avatar (robot/stylized)
- "🤖 AI Companion" badge visible
- Sample conversation
- Different background color scheme (purple tint)
- "This is an AI" disclaimer visible
- Character customization preview

**Caption (EN):** "Practice with AI Companions"
**Caption (PL):** "Ćwicz z asystentami AI"

**Design Notes:**
- Clearly distinct from human chats
- Playful, futuristic design
- Purple gradient accent
- AI badge prominent

---

### 6. Profile & Verification
**Scene:** User profile with verification badges
**Content:**
- Profile photo with ring
- Name, age, location
- Bio text
- Verification badges (phone, photo, bank)
- Stats (followers, earnings if Royal)
- Royal Club or VIP badge if applicable
- Edit profile CTA

**Caption (EN):** "Build Your Verified Profile"
**Caption (PL):** "Zbuduj zweryfikowany profil"

**Design Notes:**
- Professional, trust-focused
- Badges prominent and colorful
- Clean stats layout
- Avatar ring with gradient

---

### 7. Earnings & Creator Tools
**Scene:** Creator dashboard or earnings summary
**Content:**
- Monthly earnings chart
- Token breakdown (chats, tips, calendar)
- Royal Club benefits if applicable
- "Set Availability" calendar preview
- Payout options
- Analytics snippet

**Caption (EN):** "Monetize Your Time & Attention"
**Caption (PL):** "Monetyzuj swój czas i uwagę"

**Design Notes:**
- Professional dashboard
- Charts and stats prominent
- Green for positive earnings
- Clean, financial design

---

### 8. Safety & Verification
**Scene:** Safety features overview or verification flow
**Content:**
- Age verification icon (18+)
- Photo verification (selfie camera)
- Moderation shield icon
- Report button
- Block/unblock options
- "Safe Community" badge
- Trust indicators

**Caption (EN):** "Safety First, Always"
**Caption (PL):** "Bezpieczeństwo na pierwszym miejscu"

**Design Notes:**
- Trust-building colors (blue, green)
- Shield/lock icons
- Clean, secure feeling
- Verified checkmarks

---

## Design System for Screenshots

### Typography
- **Headline:** SF Pro Display Bold, 72-84pt
- **Caption:** SF Pro Text Semibold, 48-56pt (on gradient bar)
- **Body:** SF Pro Text Regular, 32-40pt
- **Labels:** SF Pro Text Medium, 28-32pt

### Colors
- **Primary Gradient:** #FF6B00 → #FF3C8E → #7B2EFF
- **Background Light:** #FFFFFF
- **Background Dark:** #0E0E10
- **Text Light:** #111111
- **Text Dark:** #FFFFFF
- **Success:** #34C759
- **Error:** #FF3B30

### Spacing
- **Screen Padding:** 60px (sides)
- **Section Gap:** 80px
- **Element Gap:** 40px
- **Status Bar Height:** 88px (iPhone notch)

### Effects
- **Card Shadow:** 0 8px 32px rgba(0,0,0,0.12)
- **Button Shadow:** 0 4px 16px rgba(255,107,0,0.4)
- **Glass Effect:** backdrop-blur(20px), rgba(255,255,255,0.15)
- **Gradient Angle:** 135deg (diagonal)

---

## Caption Bar Design

### Position
- **iOS:** Bottom 400px of screenshot
- **Android:** Bottom 360px of screenshot

### Style
- Background: White with gradient overlay at top edge
- Text: Centered, bold, dark gray (#111111)
- Height: Match platform requirements
- Padding: 60px horizontal, 80px vertical

### Caption Hierarchy
```
[Icon] 96×96px
Main Caption (72pt, bold)
Sub-caption (40pt, regular) - optional
```

---

## Device Frame Options

### Recommended Tools
1. **Figma:** Use official device mockup plugins
2. **Shotbot:** Automated device frames
3. **MockUPhone:** Free device mockups
4. **Apple App Store Resources:** Official templates

### Frame Styles
- **Minimal:** Thin bezel, focus on content (recommended)
- **Realistic:** Full device with shadows
- **Floating:** Device on gradient background

### Colors
- **Light Mode Screenshots:** Use light device frames (white/silver)
- **Dark Mode Screenshots:** Use dark device frames (graphite/black)

---

## Screenshot Localization

### English Captions
1. "Meet, Chat & Earn with Avalo"
2. "Discover People Nearby"
3. "Quality Conversations That Matter"
4. "Transparent Token Economy"
5. "Practice with AI Companions"
6. "Build Your Verified Profile"
7. "Monetize Your Time & Attention"
8. "Safety First, Always"

### Polish Captions
1. "Poznaj, rozmawiaj i zarabiaj z Avalo"
2. "Odkrywaj ludzi w pobliżu"
3. "Wartościowe rozmowy, które się liczą"
4. "Przejrzysta ekonomia tokenów"
5. "Ćwicz z asystentami AI"
6. "Zbuduj zweryfikowany profil"
7. "Monetyzuj swój czas i uwagę"
8. "Bezpieczeństwo na pierwszym miejscu"

---

## File Naming Convention

### Format
```
avalo_[platform]_[screen-number]_[locale]_[size].png
```

### Examples
- `avalo_ios_01_en_1290x2796.png`
- `avalo_ios_01_pl_1290x2796.png`
- `avalo_android_01_en_1080x2340.png`
- `avalo_android_01_pl_1080x2340.png`

---

## Export Settings

### Figma Export
- Format: PNG
- Scale: 3x for iOS, 2x for Android
- Color Profile: sRGB IEC61966-2.1
- Naming: Follow convention above

### Photoshop Export
- File > Export > Export As
- Format: PNG-24
- Quality: 100%
- Metadata: None
- Color Space: sRGB

### Optimization
- Use ImageOptim or TinyPNG for file size reduction
- Target: Under 5MB per screenshot
- Maintain visual quality at 100%

---

## Screenshot Checklist

Before submission, verify:
- [ ] Correct dimensions for each platform
- [ ] High resolution, no pixelation
- [ ] Text is readable at small sizes
- [ ] UI elements clearly visible
- [ ] Gradient colors match brand (#FF6B00, #FF3C8E, #7B2EFF)
- [ ] Captions are accurate and translated
- [ ] No placeholder text or Lorem Ipsum
- [ ] No personal information visible
- [ ] Consistent design across all screenshots
- [ ] Status bar shows good signal/battery
- [ ] Time shows realistic value (e.g., 9:41 AM)
- [ ] Light mode screenshots during day times
- [ ] Dark mode screenshots during night times (optional)

---

## Alternative: Manual Screenshot Capture

If generating from actual app:

1. **Prepare Test Account**
   - Create verified profile with sample data
   - Add test tokens to wallet
   - Set up sample conversations
   - Create AI companion

2. **Capture Settings**
   - iOS: Use iPhone 14 Pro Max simulator (1290×2796)
   - Android: Use Pixel 7 Pro settings (1080×2340)
   - Hide sensitive info
   - Use placeholder names/photos

3. **Editing**
   - Add caption bar in Figma/Photoshop
   - Apply device frame if desired
   - Optimize file sizes
   - Export with correct naming

---

## Preview & Testing

### App Store Preview
- Upload to App Store Connect
- Check appearance in search results
- View in Today tab mockup
- Test on actual iPhone

### Google Play Preview
- Upload to Google Play Console
- Preview in listing
- Check mobile vs tablet view
- Test on actual Android device

---

## Screenshot Update Schedule

- **Major Releases:** New screenshot set required
- **Feature Updates:** Update relevant screens only
- **Seasonal:** Optional themed variations (holidays)
- **A/B Testing:** Create variants to test conversion
- **Minimum Update:** Every 6 months to show freshness