# PACK 394 — Viral Growth Engine

**Stage**: D — Public Launch & Market Expansion  
**Status**: ✅ IMPLEMENTED  
**Dependencies**: PACK 280, 300/300A/300B, 301/301A/301B, 302, 392, 393

## 📋 OVERVIEW

PACK 394 creates a self-propelling growth loop that turns every user into a distribution channel through:
- **Referral & Invite Engine**: Track invites and conversions
- **Anti-Fraud Reward System**: Unlock rewards only for verified, quality users
- **Creator Viral Boost**: Amplify top-performing creators
- **Share-to-Earn**: Reward social sharing with temporary boosts
- **Anti-Abuse Layer**: Protect against fraud and gaming

---

## 🎯 GROWTH LOOP

```
User Invites → Verified Users → First Chat → Token Purchase → Viral Boost → More Invites
```

**Key Metric**: Viral K-Factor (target: >1.2)

---

## 📦 COMPONENTS

### 1️⃣ Cloud Functions

#### Referral Engine ([`pack394-referral-engine.ts`](cloud-functions/src/pack394-referral-engine.ts))

**Functions:**
- `generateReferralLink()` - Creates unique invite links with tracking
- `trackReferralEvent()` - Records clicks, installs, registrations
- `getUserReferralStats()` - Returns user's referral performance
- `getReferralLeaderboard()` - Top referrers ranking
- `cleanupExpiredReferralLinks()` - Scheduled cleanup

**Referral Types:**
- Direct Invite Link
- QR Invite
- Profile-to-Profile Invite
- Event Invite

**Tracking:**
```typescript
{
  inviterId: string,
  inviteeDeviceHash: string,
  geo: { country, city, lat, lng },
  source: 'SMS' | 'WhatsApp' | 'IG' | 'TikTok' | 'Link',
  timestamp: Date
}
```

#### Reward Engine ([`pack394-reward-engine.ts`](cloud-functions/src/pack394-reward-engine.ts))

**Reward Unlock Requirements:**
1. ✅ Registration
2. ✅ 18+ verification
3. ✅ Profile with min. 3 photos
4. ✅ First chat completed
5. ✅ First token purchase (for premium rewards)

**Reward Types:**
- **Tokens**: 50-500 tokens
- **Subscription Days**: 7-30 days
- **Priority Discovery Boost**: 24-72h
- **Royal Trial Access**: 7 days

**Fraud Protection:**
- Integrates with PACK 302 (Fraud Detection)
- Checks emulator installs
- Validates retention rates (min 5%)
- Detects device hash collisions
- Blocks self-invite loops

**Functions:**
- `initializeReferralReward()` - Triggered on user registration
- `updateRewardProgress()` - Updates progress on milestones
- `claimReward()` - User claims earned reward
- `getUserRewards()` - Returns user's reward history

#### Share-to-Earn ([`pack394-share-to-earn.ts`](cloud-functions/src/pack394-share-to-earn.ts))

**Shareable Content:**
- Profile
- Event
- Feed Post
- AI Companion
- Referral Campaign

**Boost Thresholds:**
- 10+ clicks
- 3+ conversions
- 50+ viral reach score

**Boost Types:**
- **Discovery Multiplier**: 1.5x-2.5x
- **Feed Visibility**: +80% impressions
- **Profile Highlight**: Top badge
- **Priority Ranking**: Algorithm boost

**Boost Duration**: 24-72 hours (decays over time)

**Functions:**
- `createShareEvent()` - Generate trackable share link
- `trackShareConversion()` - Record clicks, views, conversions
- `getUserActiveBoosts()` - Active boosts for user
- `getShareAnalytics()` - Share performance metrics
- `deactivateExpiredBoosts()` - Scheduled cleanup

#### Creator Boost ([`pack394-creator-boost.ts`](cloud-functions/src/pack394-creator-boost.ts))

**Scoring Formula:**
```
Total Score = (Verified Invites × 10) + 
              (Paying Conversions × 100) + 
              (Low Churn Rate × 5)
```

**Boost Tiers:**
- **Top 10**: 3.0x discovery, 2.5x feed, profile highlight + "TOP_INVITER" badge
- **Top 50**: 2.0x discovery, 1.8x feed, profile highlight
- **Top 100**: 1.5x discovery, 1.3x feed

**Badges:**
- 🏆 TOP_INVITER (100+ verified invites)
- 💰 REVENUE_CHAMPION (50+ paying conversions)
- 🔥 RETENTION_MASTER (80%+ retention)

**Functions:**
- `calculateCreatorBoostScores()` - Runs every 6 hours
- `getCreatorLeaderboard()` - Public leaderboard
- `getCreatorPerformanceStats()` - Detailed metrics

#### Abuse Detection ([`pack394-abuse-detection.ts`](cloud-functions/src/pack394-abuse-detection.ts))

**Auto-Block Triggers:**
- ❌ Emulator installs
- ❌ Self-invite loops
- ❌ Farmed SIM traffic
- ❌ VPN country mismatch
- ❌ Retention < 5%
- ❌ Device hash collision
- ❌ Rapid registrations (>10/hour from same inviter)

**Risk Levels:**
- LOW: Warning only
- MEDIUM: Flag for review
- HIGH: Auto-block rewards
- CRITICAL: Immediate account suspension

**Integration:**
- Escalates to PACK 302 (Fraud Detection)
- Creates PACK 300A (Safety Ticket)
- Logs to PACK 296 (Audit Logs)

**Functions:**
- `detectAbuseOnRegistration()` - Triggered on user creation
- `monitorRetentionAbuse()` - Daily retention checks
- `checkFarmedSimTraffic()` - SIM farm detection
- `getAbuseFlags()` - Admin review queue
- `resolveAbuseFlag()` - Admin resolution
- `getAbuseAnalytics()` - Dashboard metrics

---

### 2️⃣ Firestore Collections

#### `referralLinks`
```typescript
{
  linkId: string,
  inviterId: string,
  referralType: 'direct_invite' | 'qr_invite' | 'profile_to_profile' | 'event_invite',
  code: string,
  deepLink: string,
  qrCodeUrl?: string,
  createdAt: Date,
  expiresAt?: Date,
  maxUses?: number,
  currentUses: number,
  isActive: boolean
}
```

#### `referralEvents`
```typescript
{
  eventId: string,
  linkId: string,
  inviterId: string,
  inviteeId?: string,
  geo: { country, city, lat, lng },
  timestamp: Date,
  source: 'sms' | 'whatsapp' | 'instagram' | 'tiktok' | 'link',
  status: 'clicked' | 'installed' | 'registered' | 'verified' | 'first_chat' | 'first_purchase'
}
```

#### `referralRewards`
```typescript
{
  rewardId: string,
  inviterId: string,
  inviteeId: string,
  linkId: string,
  type: 'tokens' | 'subscription_days' | 'priority_boost' | 'royal_trial',
  value: number,
  status: 'pending' | 'locked' | 'earned' | 'claimed' | 'fraud_blocked',
  progress: {
    registered: boolean,
    verified18: boolean,
    minPhotos: boolean,
    firstChat: boolean,
    firstPurchase: boolean
  },
  fraudCheckPassed: boolean
}
```

#### `referralAbuseFlags`
```typescript
{
  flagId: string,
  userId: string,
  inviterId?: string,
  type: 'emulator_install' | 'self_invite_loop' | 'low_retention' | etc,
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  detectedAt: Date,
  evidence: object,
  autoBlocked: boolean,
  resolved: boolean
}
```

#### `shareEvents`
```typescript
{
  shareId: string,
  userId: string,
  contentType: 'profile' | 'event' | 'feed_post' | 'ai_companion',
  contentId: string,
  platform: 'whatsapp' | 'instagram' | 'tiktok' | 'twitter',
  shareUrl: string,
  clicks: number,
  conversions: number,
  viralReach: number,
  boostEarned: boolean
}
```

#### `viralBoosts`
```typescript
{
  boostId: string,
  userId: string,
  shareId: string,
  type: 'discovery_multiplier' | 'feed_visibility' | 'profile_highlight',
  multiplier: number,
  active: boolean,
  expiresAt: Date
}
```

#### `creatorBoostScores`
```typescript
{
  userId: string,
  verifiedInvites: number,
  payingConversions: number,
  lowChurnRate: number,
  totalScore: number,
  rank: number,
  badges: string[]
}
```

---

### 3️⃣ Firestore Rules

**File**: [`firestore-pack394-viral.rules`](firestore-pack394-viral.rules)

**Security Model:**
- Users can read their own referral data
- Anyone can track referral events (for attribution)
- Only system can create/update rewards
- Admins only can access abuse flags
- Public read for creator leaderboard

---

### 4️⃣ Firestore Indexes

**File**: [`firestore-pack394-viral.indexes.json`](firestore-pack394-viral.indexes.json)

**20 Composite Indexes** for:
- Referral event queries by inviter + status + time
- Reward queries by invitee + status
- Abuse flag queries by risk level + resolved status
- Share analytics by user + content type
- Creator leaderboard by score + rank

---

### 5️⃣ Mobile Components

#### Invite Screen ([`app/referral/invite.tsx`](app-mobile/app/referral/invite.tsx))

**Features:**
- Generate direct invite links
- Generate QR codes for in-person sharing
- Share to WhatsApp, Instagram, SMS, etc.
- Real-time referral stats
- Conversion rate tracking
- Copy link to clipboard

#### Share Modal (Component)
```typescript
// Used throughout app for content sharing
<ShareModal
  contentType="profile"
  contentId={userId}
  onShare={(platform) => trackShare(platform)}
/>
```

#### Referral Wallet (Component)
```typescript
// Displays earned and pending rewards
<ReferralWallet
  rewards={userRewards}
  onClaimReward={(rewardId) => claimReward(rewardId)}
/>
```

#### Creator Boost Banner (Component)
```typescript
// Shows creator's viral performance
<CreatorBoostBanner
  rank={creatorRank}
  badges={badges}
  activeBoosts={boosts}
/>
```

---

### 6️⃣ Admin Dashboard

**Path**: `admin-web/viral-dashboard/`

**Pages:**
1. **Referral Heatmap** - Geographic distribution of invites
2. **Abuse Risk Monitor** - Flagged users and patterns
3. **Reward Economics** - Cost vs ARPU analysis
4. **GEO Conversion** - Performance by country
5. **Creator Rankings** - Top performers + boost allocation

**Real-Time Metrics:**
- `invitesSent`
- `installsFromInvites`
- `verifiedFromInvites`
- `firstChatFromInvites`
- `firstPurchaseFromInvites`
- `viralKFactor`
- `inviteARPU`

---

## 📊 KEY PERFORMANCE INDICATORS

### Viral Funnel
```
100 Invites Sent
 ↓ 40% Click Rate
40 Clicks
 ↓ 50% Install Rate
20 Installs
 ↓ 70% Registration Rate
14 Registrations
 ↓ 80% Verification Rate
11 Verified Users
 ↓ 60% First Chat Rate
7 First Chats
 ↓ 30% Purchase Rate
2 First Purchases

Viral K-Factor = 14 new users / 100 invites = 0.14 (needs improvement → 1.2)
```

### Target Metrics
- **Invite → Install**: >50%
- **Install → Register**: >70%
- **Register → Verify**: >80%
- **Verify → First Chat**: >60%
- **First Chat → Purchase**: >30%
- **Viral K-Factor**: >1.2
- **Invite ARPU**: >$5
- **Fraud Rate**: <5%

---

## 🔒 ANTI-FRAUD PROTECTION

### Multi-Layer Checks

**Layer 1: Registration**
- Device fingerprinting
- Emulator detection
- SIM farm patterns
- VPN/proxy detection

**Layer 2: Behavior**
- Retention monitoring (7-day check)
- Activity patterns
- Chat engagement
- Purchase behavior

**Layer 3: Network**
- IP clustering
- Carrier validation
- Geographic anomalies
- Rapid registration detection

**Layer 4: Manual Review**
- Admin flag resolution
- Pattern analysis
- Escalation to PACK 300 (Support)

---

## 🚀 DEPLOYMENT

### Prerequisites
```bash
# Install dependencies
cd cloud-functions
npm install firebase-functions firebase-admin nanoid

cd ../app-mobile
npm install expo-clipboard react-native-qrcode-svg
```

### Deploy Cloud Functions
```bash
chmod +x deploy-pack394.sh
./deploy-pack394.sh
```

### Deploy Firestore Rules & Indexes
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### Mobile Integration
```bash
cd app-mobile
npx expo start
```

---

## 📈 GROWTH PROJECTIONS

### Conservative (K=1.1)
- Month 1: 10,000 users → 11,000 users
- Month 3: 13,310 users
- Month 6: 17,716 users

### Target (K=1.3)
- Month 1: 10,000 users → 13,000 users
- Month 3: 21,970 users
- Month 6: 46,656 users

### Optimistic (K=1.5)
- Month 1: 10,000 users → 15,000 users
- Month 3: 33,750 users
- Month 6: 113,906 users

---

## 🎯 OPTIMIZATION PLAYBOOK

### Improve Invite → Install
- Better invite copy
- QR codes for in-person
- Platform-specific deep links
- Preview cards optimization

### Improve Install → Register
- Streamlined onboarding
- Pre-fill data from invite
- Social proof ("5,000 joined today")

### Improve Register → Verify
- Faster ID verification
- Clear incentives
- Progress indicators

### Improve Verify → First Chat
- Auto-match with popular users
- Free starter tokens
- FTUX mission integration

### Improve First Chat → Purchase
- Strategic token depletion
- Exclusive content teasers
- First-purchase bonuses

---

## ✅ CTO VERDICT

PACK 394 completes Avalo's organic scalability layer:

1. ✅ **No Ad Dependency** - Self-sustaining growth
2. ✅ **Creator-Driven Virality** - Influencer amplification
3. ✅ **Fraud Protected** - Multi-layer security
4. ✅ **Revenue Tied** - Growth = Monetization
5. ✅ **Auto-Optimizing** - Data-driven improvements

**Result**: Mandatory engine before full-scale market expansion.

---

## 📚 INTEGRATION POINTS

- **PACK 280**: Subscription rewards integration
- **PACK 300**: Abuse escalation to support
- **PACK 301**: Retention tracking for fraud detection
- **PACK 302**: Fraud score integration
- **PACK 392**: App store attribution
- **PACK 393**: Marketing campaign tie-ins

---

## 🔮 FUTURE ENHANCEMENTS

### Phase 2
- [ ] Referral contests & competitions
- [ ] Team/guild referral challenges
- [ ] Tiered referral rewards (10/50/100 milestones)
- [ ] Custom referral landing pages
- [ ] A/B testing referral messaging

### Phase 3
- [ ] Influencer referral partnerships
- [ ] Affiliate program integration
- [ ] Cross-app referral network
- [ ] Blockchain-based referral tokens
- [ ] Decentralized verification

---

## 📞 SUPPORT

**Documentation**: This file  
**Cloud Functions**: `cloud-functions/src/pack394-*.ts`  
**Mobile**: `app-mobile/app/referral/`  
**Admin**: `admin-web/viral-dashboard/`

**Monitoring**: Firebase Console > Functions > pack394-*  
**Analytics**: Admin Dashboard > Viral Growth

---

**Implementation Date**: 2025-12-31  
**Status**: ✅ Production Ready  
**Next**: Market launch with viral tracking enabled
