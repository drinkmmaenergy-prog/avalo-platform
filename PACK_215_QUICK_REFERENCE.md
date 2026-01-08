# PACK 215: Viral Loop Engine — Quick Reference

## 🎯 Purpose

Turn each active user into an acquisition channel while ensuring viral features push users toward dating and paid engagement — not just free traffic.

**Growth Loop**: Active Users → Invites → New Users → Attention → Attraction → Paid Chats/Calls/Meetings → More Active Users → Loop Repeats

---

## 🚫 No Financial Rewards Rule

**STRICTLY FORBIDDEN**:
- Free coins/tokens/income
- Discounted packages
- Payout bonuses
- Cash-equivalent incentives

**ALLOWED** (Social & Visibility Only):
- ✨ Spotlight on Discovery (24h)
- 🎯 Priority matching boost
- 💬 Message extension (not a chat)
- ⭐ Social proof badges

Avalo remains **premium/high-value**, not freemium.

---

## 📁 Files Created

### Firebase Infrastructure
- `firestore-pack215-viral-loop.rules` - Security rules
- `firestore-pack215-viral-loop.indexes.json` - Database indexes

### Cloud Functions
- `functions/src/pack215-viral-loop.ts` - All backend logic

### Mobile Components
- `app-mobile/app/components/InviteAndGetSeen.tsx` - Main invite UI
- `app-mobile/app/components/SocialProofNotifications.tsx` - Viral moments feed
- `app-mobile/app/creator/audience-import.tsx` - Creator audience import
- `app-mobile/app/viral/payer-moments.tsx` - Payer viral system

### Documentation
- `PACK_215_INTEGRATION_GUIDE.md` - Integration details
- `PACK_215_QUICK_REFERENCE.md` - This file

---

## 🔄 Referral Flow

### Step 1: User Opens "Invite & Get Seen"
- Component: [`InviteAndGetSeen.tsx`](app-mobile/app/components/InviteAndGetSeen.tsx)
- Checks safety approval (PACK 211)

### Step 2: Generates Unique Link
- Function: [`generateReferralLink`](functions/src/pack215-viral-loop.ts:247)
- Creates 10-char code
- Returns shareable URL

### Step 3: Sends Link via Social Platforms
- Instagram
- WhatsApp
- TikTok
- SMS
- Messenger

### Step 4: New User Installs + Verifies Selfie
- Referral code tracked in user document
- Triggers: [`onUserCreated`](functions/src/pack215-viral-loop.ts:291)
- Selfie verification required before rewards

### Step 5: Inviter Receives Non-Financial Reward
- Triggers: [`onSelfieVerified`](functions/src/pack215-viral-loop.ts:339)
- Milestones:
  - 1st invite: ✨ 24h Spotlight
  - 3 invites: 🎯 Priority Matching (7 days)
  - 5 invites: ⭐ Fans Zone Badge
  - 10 invites: 💬 Message Extension

### Step 6: New User Gets 48h Boosted Visibility
- PACK 213 integration
- Automatic priority boost
- No tokens involved

---

## 👥 Social Proof Moments

### "Your People Follow You"

When invited users take actions, inviter receives feed notifications:

**Examples**:
- "3 people you brought to Avalo added you to wishlist"
- "Someone you invited just booked a meeting — you're getting popular"
- "People you brought are pushing you up in Discovery"

**Component**: [`SocialProofNotifications.tsx`](app-mobile/app/components/SocialProofNotifications.tsx)

**Functions**:
- [`onWishlistAdd`](functions/src/pack215-viral-loop.ts:446)
- [`onMeetingBooked`](functions/src/pack215-viral-loop.ts:476)

---

## 🎨 Viral Incentives for Creators

### Women Earners Import Social Audience

**Component**: [`audience-import.tsx`](app-mobile/app/creator/audience-import.tsx)

**Platforms Supported**:
- Instagram (100+ followers)
- TikTok (100+ followers)
- Telegram (50+ followers)
- Snapchat (100+ followers)

**Reward Tiers**:

| Followers | Reward |
|-----------|--------|
| 5 | 24h discovery spotlight |
| 10 | 1 week priority to spenders from region |
| 25 | "ATTRACTION MAGNET" badge |
| 100+ | Early access to premium features |

**Function**: [`processAudienceImport`](functions/src/pack215-viral-loop.ts:502)

**Benefits**:
- ⬆️ Dating appeal
- 💰 Financial gain
- 🏆 Competition between popular women

---

## 💪 Viral Moments for Payers

### High-Spending Men Generate Growth

**Component**: [`payer-moments.tsx`](app-mobile/app/viral/payer-moments.tsx)

**Eligibility**: Must have completed payment history

**Rewards**:

| Milestone | Reward |
|-----------|--------|
| 1 friend | 🔮 Chemistry match reveal |
| 3+ friends | 💪 "Avalo Strong Profile" badge + 7-day boost |

**Function**: [`processPayerViralMoment`](functions/src/pack215-viral-loop.ts:572)

**Outcome**: More chances to find dates with high-value women

---

## 🔗 Integration with Existing Packs

### PACK 211: Adaptive Safety
- [`isSafetyApproved()`](functions/src/pack215-viral-loop.ts:85) - No viral rewards for stalker-flagged users
- Selfie verification checkpoint before reward
- Real-time monitoring

### PACK 212: Reputation System
- [`hasGoodVibePattern()`](functions/src/pack215-viral-loop.ts:96) - Good vibe patterns boost viral visibility
- Positive actions increase reputation
- Better matches for quality users

### PACK 213: Match Priority
- [`boostMatchPriority()`](functions/src/pack215-viral-loop.ts:140) - Viral users receive priority match scoring
- Boost factors: 1.5x - 2x
- Duration: 24h - 14 days

### PACK 214: Return Triggers
- [`claimViralReward()`](functions/src/pack215-viral-loop.ts:602) - Viral triggers increase return engagement
- Push notifications on social proof
- Creates return triggers

---

## 🗄️ Database Collections

### referral_links
```typescript
{
  inviter_id: string;
  link_code: string; // 10-char unique code
  link_url: string; // https://avalo.app/invite/...
  status: 'active' | 'inactive';
  total_clicks: number;
  total_installs: number;
  total_verified: number;
}
```

### referral_tracking
```typescript
{
  inviter_id: string;
  invited_user_id: string;
  referral_code: string;
  status: 'pending_verification' | 'verified' | 'rewarded';
  selfie_verified: boolean;
  reward_granted: boolean;
}
```

### viral_rewards
```typescript
{
  user_id: string;
  reward_type: 'spotlight' | 'priority_matching' | 'message_extension' | 
               'fans_zone_badge' | 'chemistry_reveal' | 'strong_profile_badge' | 
               'attraction_magnet';
  source: 'referral' | 'audience_import' | 'viral_moment';
  claimed: boolean;
  expires_at: Timestamp; // 30 days
}
```

### social_proof_events
```typescript
{
  target_user_id: string;
  event_type: 'wishlist_add' | 'meeting_booked' | 'discovery_boost';
  message: string;
  read: boolean;
  source_user_ids: string[];
}
```

### viral_stats
```typescript
{
  user_id: string; // Document ID
  total_invites: number;
  verified_invites: number;
  updated_at: Timestamp;
}
```

---

## ⚙️ Cloud Functions

### User-Callable Functions

1. **generateReferralLink** - Create unique invite link
2. **processAudienceImport** - Handle creator imports
3. **processPayerViralMoment** - Process payer milestones
4. **claimViralReward** - Activate claimed rewards

### Triggered Functions

1. **onUserCreated** - Track referral signups
2. **onSelfieVerified** - Grant rewards on verification
3. **onWishlistAdd** - Create social proof events
4. **onMeetingBooked** - Trigger viral moments

### Scheduled Functions

1. **aggregateViralMetrics** - Daily metrics (2 AM UTC)

---

## 🔒 Security Features

### Anti-Gaming Measures
- ✅ Selfie verification required
- ✅ Safety checks (PACK 211)
- ✅ No financial rewards
- ✅ Rate limiting
- ✅ Server-side validation

### Firestore Rules
- User can only read own data
- Cloud Functions create rewards
- Users can mark as read/claimed
- Admin-only metrics

---

## 📱 UI Components Usage

### Invite & Get Seen Screen
```typescript
import InviteAndGetSeen from './components/InviteAndGetSeen';

// In your navigation/routing
<InviteAndGetSeen />
```

### Social Proof Notifications
```typescript
import SocialProofNotifications from './components/SocialProofNotifications';

// Can be modal, tab, or full screen
<SocialProofNotifications />
```

### Creator Audience Import
```typescript
// Route: /creator/audience-import
// Auto-checks if user has earnings enabled
// Platform selection & follower count input
```

### Payer Viral Moments
```typescript
// Route: /viral/payer-moments
// Auto-checks spending history
// Friend tracking & milestone progress
```

---

## 📊 Key Metrics to Monitor

1. **Viral Coefficient**: Verified Invites / Active Users
2. **Conversion Rate**: Verified / Total Invites
3. **Reward Claim Rate**: Claimed / Total Rewards
4. **Quality Score**: Invited Users with Good Vibe
5. **Return Rate**: Users Returning via Social Proof

---

## 🚀 Deployment Checklist

- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Deploy indexes: `firebase deploy --only firestore:indexes`
- [ ] Deploy functions: `cd functions && npm run build && firebase deploy --only functions`
- [ ] Test referral flow end-to-end
- [ ] Verify PACK 211, 212, 213, 214 integration
- [ ] Monitor Cloud Function logs
- [ ] Check analytics dashboard
- [ ] Test on iOS and Android

---

## 🐛 Common Issues & Solutions

### Issue: Link not generating
**Solution**: Check safety approval in PACK 211 safety_tracking collection

### Issue: Reward not granted
**Solution**: Verify selfie_verified: true in invited_users collection

### Issue: Boost not applying
**Solution**: Check match_priority_boosts collection (PACK 213)

### Issue: Notifications not sent
**Solution**: Verify FCM token and return_triggers collection (PACK 214)

---

## 💡 Best Practices

1. **Always check safety first** - Integration with PACK 211
2. **Verify before rewarding** - Selfie verification checkpoint
3. **No financial incentives** - Maintain premium positioning
4. **Track quality metrics** - Not just quantity
5. **Monitor for abuse** - Real-time fraud detection
6. **Test all flows** - End-to-end validation

---

## 📞 Testing Commands

```bash
# Generate test invite link
curl -X POST https://us-central1-PROJECT.cloudfunctions.net/generateReferralLink \
  -H "Authorization: Bearer $TOKEN"

# Check user's viral stats
firebase firestore:get viral_stats/$USER_ID

# View recent social proof events
firebase firestore:query social_proof_events \
  --where target_user_id==$USER_ID \
  --order-by created_at desc \
  --limit 10

# Monitor Cloud Function logs
firebase functions:log --only pack215
```

---

## 🎓 User Education Messages

**For Inviters**:
> "Invite friends to Avalo and unlock exclusive visibility boosts, priority matching, and special badges. The more friends verify, the more you shine in Discovery!"

**For Creators**:
> "Import your Instagram/TikTok following and watch your Avalo profile soar. Get priority matching with high-value members in your region!"

**For Payers**:
> "Bring your friends to Avalo and unlock chemistry reveals plus the Strong Profile badge. More friends = better matches!"

---

## ✅ Confirmation String

**PACK 215 COMPLETE — Viral Loop Engine integrated**

---

## 📚 Related Documentation

- [PACK 211: Adaptive Safety](PACK_211_IMPLEMENTATION_COMPLETE.md)
- [PACK 212: Reputation System](PACK_212_IMPLEMENTATION_COMPLETE.md)
- [PACK 213: Match Priority](PACK_213_IMPLEMENTATION_COMPLETE.md)
- [PACK 214: Return Triggers](PACK_214_QUICK_REFERENCE.md)
- [Full Integration Guide](PACK_215_INTEGRATION_GUIDE.md)

---

**Last Updated**: 2025-12-02  
**Status**: ✅ Implementation Complete  
**Version**: 1.0.0