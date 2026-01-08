# PACK 215: Viral Loop Engine - Integration Guide

## Overview

PACK 215 creates a self-reinforcing growth loop: **Active Users → Invites → New Users → Attention → Attraction → Paid Activity → More Active Users**

This pack integrates seamlessly with existing safety, reputation, matching, and engagement systems.

---

## Integration with Existing Packs

### PACK 211: Adaptive Safety Integration

**Purpose**: Prevent gaming and maintain quality standards

**Integration Points**:

1. **Safety Checks Before Reward Grants**
   ```typescript
   // In pack215-viral-loop.ts
   async function isSafetyApproved(userId: string): Promise<boolean> {
     const safetyDoc = await db.collection('safety_tracking').doc(userId).get();
     return !safetyDoc.data()?.stalker_flag && !safetyDoc.data()?.harassment_flag;
   }
   ```

2. **No Viral Rewards for Flagged Users**
   - Users with `stalker_flag` or `harassment_flag` cannot:
     - Generate referral links
     - Receive viral rewards
     - See boosted visibility
   - Firestore rules enforce this at database level

3. **Verification Requirement**
   - All invited users must complete selfie verification before inviter gets rewards
   - Prevents fake account farming

**Firestore Rules**:
```javascript
// firestore-pack215-viral-loop.rules
allow create: if isAuthenticated() &&
  isSafetyApproved(request.auth.uid);
```

---

### PACK 212: Reputation System Integration

**Purpose**: Boost visibility for users with good vibe patterns

**Integration Points**:

1. **Vibe Pattern Checks**
   ```typescript
   async function hasGoodVibePattern(userId: string): Promise<boolean> {
     const reputationDoc = await db.collection('reputation_scores').doc(userId).get();
     return (reputationDoc.data()?.vibe_score || 0) >= 0.6;
   }
   ```

2. **Enhanced Viral Visibility**
   - Users with good vibe scores (>= 0.6) get:
     - Longer spotlight duration
     - Higher priority in discovery
     - Better match recommendations

3. **Social Proof Impact on Reputation**
   - Invited users taking positive actions increases inviter's reputation
   - Meeting bookings from invited users boost vibe score

**Cloud Function Integration**:
```typescript
// After granting viral reward, update reputation
await db.collection('reputation_scores').doc(userId).update({
  viral_activity_score: admin.firestore.FieldValue.increment(1),
  last_positive_action: admin.firestore.Timestamp.now()
});
```

---

### PACK 213: Match Priority Integration

**Purpose**: Use viral rewards to boost match priority

**Integration Points**:

1. **Priority Matching Reward**
   ```typescript
   async function boostMatchPriority(userId: string, duration: number): Promise<void> {
     await db.collection('match_priority_boosts').add({
       user_id: userId,
       boost_type: 'viral_reward',
       boost_factor: 1.5,
       created_at: admin.firestore.Timestamp.now(),
       expires_at: admin.firestore.Timestamp.fromMillis(Date.now() + duration),
       active: true
     });
   }
   ```

2. **Viral Users Get Priority**
   - Users who successfully invite others receive temporary priority scoring
   - Boost factors:
     - First referral: 1.5x for 24h
     - 3+ referrals: 1.5x for 7 days
     - 10+ referrals: 2x for 14 days

3. **Chemistry Reveal Reward**
   - Payers with 1+ verified friend get "chemistry_reveal" reward
   - Reveals one high-chemistry match from priority queue

**Match Algorithm Integration**:
```typescript
// In match scoring algorithm
const viralBoost = await getActiveViralBoost(userId);
const finalScore = baseScore * (1 + viralBoost);
```

---

### PACK 214: Return Triggers Integration

**Purpose**: Use viral moments to trigger re-engagement

**Integration Points**:

1. **Return Trigger on Reward Claim**
   ```typescript
   // When user claims viral reward
   await db.collection('return_triggers').add({
     user_id: userId,
     trigger_type: 'viral_reward_claimed',
     trigger_data: { reward_type: reward.reward_type },
     created_at: admin.firestore.Timestamp.now(),
     processed: false
   });
   ```

2. **Social Proof Notifications as Return Triggers**
   - When invited users take action, create return trigger for inviter
   - Types:
     - `invited_user_active`: Friend is now active
     - `invited_user_meeting`: Friend booked a meeting
     - `viral_milestone_reached`: Hit 3/5/10 verified friends

3. **Push Notifications**
   ```typescript
   await admin.messaging().send({
     token: fcmToken,
     notification: {
       title: '🔥 Viral Moment',
       body: 'Someone you invited just booked a meeting — you\'re getting popular'
     },
     data: {
       type: 'viral_social_proof',
       trigger_return: 'true'
     }
   });
   ```

**Return Flow**:
1. Invited user takes action
2. Social proof event created
3. Return trigger generated
4. Push notification sent
5. Inviter returns to app
6. Sees viral moment + reward

---

## Data Flow Diagram

```
┌─────────────────┐
│  User Invites   │
│     Friend      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate Link   │◄─── PACK 211: Safety Check
│  (Cloud Func)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Friend Installs │
│  & Verifies     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Grant Reward   │◄─── PACK 212: Vibe Check
│  (Non-Financial)│
└────────┬────────┘
         │
         ├───────────────────┐
         │                   │
         ▼                   ▼
┌─────────────────┐  ┌─────────────────┐
│  PACK 213       │  │  PACK 214       │
│  Boost Priority │  │  Return Trigger │
└─────────────────┘  └─────────────────┘
```

---

## Firestore Collections Schema

### referral_links
```typescript
{
  inviter_id: string;
  link_code: string;
  link_url: string;
  created_at: Timestamp;
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
  created_at: Timestamp;
  status: 'pending_verification' | 'verified' | 'rewarded';
  selfie_verified: boolean;
  verified_at?: Timestamp;
  reward_granted: boolean;
  reward_granted_at?: Timestamp;
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
  created_at: Timestamp;
  expires_at: Timestamp;
  claimed: boolean;
  claimed_at?: Timestamp;
  metadata: {
    milestone?: string;
    count?: number;
    referral_id?: string;
  };
}
```

### social_proof_events
```typescript
{
  target_user_id: string;
  event_type: 'wishlist_add' | 'meeting_booked' | 'discovery_boost' | 'high_activity';
  source_user_ids: string[];
  message: string;
  created_at: Timestamp;
  read: boolean;
  read_at?: Timestamp;
}
```

### viral_stats
```typescript
{
  user_id: string; // Document ID
  total_invites: number;
  verified_invites: number;
  active_rewards: number;
  total_rewards_claimed: number;
  updated_at: Timestamp;
}
```

---

## Cloud Functions

### Core Functions

1. **generateReferralLink**
   - Creates unique referral link
   - Checks safety approval (PACK 211)
   - Returns shareable URL

2. **onUserCreated**
   - Triggered when new user signs up
   - Tracks referral if code present
   - Grants 48h boost to new user (PACK 213)

3. **onSelfieVerified**
   - Triggered when user completes selfie
   - Grants rewards to inviter
   - Updates viral stats
   - Creates return trigger (PACK 214)

4. **onWishlistAdd**
   - Monitors wishlist additions
   - Creates social proof events
   - Triggers notifications

5. **onMeetingBooked**
   - Tracks meeting bookings
   - Boosts inviter visibility (PACK 213)
   - Creates social proof event

6. **processAudienceImport**
   - Handles creator audience imports
   - Grants tiered rewards
   - Awards badges

7. **processPayerViralMoment**
   - Handles payer viral moments
   - Grants chemistry reveals
   - Awards profile badges

8. **claimViralReward**
   - Activates claimed rewards
   - Applies boosts (PACK 213)
   - Creates return trigger (PACK 214)

9. **aggregateViralMetrics**
   - Daily cron job
   - Calculates viral metrics
   - Stores analytics

---

## Mobile App Components

### InviteAndGetSeen.tsx
- Main invite interface
- Link generation
- Social sharing
- Reward display
- Stats tracking

### SocialProofNotifications.tsx
- Displays viral moments
- Real-time updates
- Mark as read
- Psychology of status

### audience-import.tsx (Creators)
- Platform selection
- Follower count input
- Reward preview
- Import history

### payer-moments.tsx (Payers)
- Friend tracking
- Milestone progress
- Link sharing
- Reward unlocking

---

## Reward Tiers

### For All Users (via Referrals)

| Milestone | Reward | Type | Duration |
|-----------|--------|------|----------|
| 1st referral | Spotlight | Visibility | 24h |
| 3 referrals | Priority Matching | Algorithm | 7 days |
| 5 referrals | Fans Zone Badge | Social | Permanent |
| 10 referrals | Message Extension | Feature | 1 use |

### For Creators (via Audience Import)

| Followers | Reward | Benefit |
|-----------|--------|---------|
| 5+ | Spotlight | 24h discovery |
| 10+ | Priority Matching | 1 week regional priority |
| 25+ | Attraction Magnet Badge | Social proof |
| 100+ | Early Premium Access | Feature unlock |

### For Payers (via Friend Invites)

| Friends | Reward | Benefit |
|---------|--------|---------|
| 1 | Chemistry Reveal | High-match highlight |
| 3+ | Strong Profile Badge + Boost | 7 days exposure |

---

## Security & Anti-Gaming Measures

1. **Selfie Verification Required**
   - No rewards until verified
   - Prevents bot accounts

2. **Safety Integration (PACK 211)**
   - Flagged users excluded
   - Real-time monitoring

3. **No Financial Rewards**
   - Only social/visibility boosts
   - Maintains premium positioning

4. **Rate Limiting**
   - One link per user
   - Cooldown periods
   - Abuse detection

5. **Firestore Security Rules**
   - User-level permissions
   - Read/write restrictions
   - Server-side validation

---

## Testing Checklist

- [ ] Generate referral link
- [ ] Share link via platforms
- [ ] New user signup with referral code
- [ ] Selfie verification triggers reward
- [ ] Safety check blocks flagged users
- [ ] Vibe score affects visibility boost
- [ ] Match priority boost applies (PACK 213)
- [ ] Return trigger creates notification (PACK 214)
- [ ] Social proof events display
- [ ] Creator audience import works
- [ ] Payer viral moments unlock
- [ ] Rewards expire correctly
- [ ] Analytics aggregate daily

---

## Performance Considerations

1. **Firestore Indexes**
   - All queries are indexed
   - Composite indexes for complex queries
   - See: `firestore-pack215-viral-loop.indexes.json`

2. **Cloud Function Optimization**
   - Minimal cold starts
   - Efficient queries
   - Batched operations

3. **Real-time Updates**
   - Firestore listeners
   - Push notifications
   - Optimistic UI updates

4. **Caching**
   - Stats cached locally
   - Link cached after generation
   - Rewards cached on claim

---

## Monitoring & Metrics

### Key Metrics

1. **Viral Coefficient**: (Verified Invites / Active Users)
2. **Conversion Rate**: (Verified / Total Invites)
3. **Reward Claim Rate**: (Claimed / Total Rewards)
4. **Return Rate**: (Users Returning via Social Proof)
5. **Quality Score**: (Invited Users with Good Vibe Patterns)

### Dashboard Queries

```typescript
// Daily viral metrics
const metrics = await db.collection('viral_metrics')
  .where('date', '>=', startDate)
  .where('date', '<=', endDate)
  .get();

// Top inviters
const topInviters = await db.collection('viral_stats')
  .orderBy('verified_invites', 'desc')
  .limit(100)
  .get();

// Reward performance
const rewardStats = await db.collection('viral_rewards')
  .where('claimed', '==', true)
  .count()
  .get();
```

---

## Deployment Steps

1. **Deploy Firestore Rules**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Deploy Firestore Indexes**
   ```bash
   firebase deploy --only firestore:indexes
   ```

3. **Deploy Cloud Functions**
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions
   ```

4. **Update Mobile App**
   ```bash
   cd app-mobile
   expo publish
   ```

5. **Verify Integration**
   - Test all flows
   - Check analytics
   - Monitor errors

---

## Troubleshooting

### Issue: Rewards Not Granted

**Check**:
1. Safety approval (PACK 211)
2. Selfie verification completed
3. Referral tracking record exists
4. Cloud function logs

### Issue: Boost Not Applied

**Check**:
1. Match priority collection (PACK 213)
2. Boost expiration time
3. Active boost flag
4. Algorithm integration

### Issue: Notifications Not Sent

**Check**:
1. FCM token valid
2. Return trigger created (PACK 214)
3. Push notification permissions
4. Message payload format

---

## Future Enhancements

1. **Team Invites**: Group challenges
2. **Seasonal Events**: Limited-time multipliers
3. **Leaderboards**: Top inviters recognition
4. **Advanced Analytics**: ML-powered predictions
5. **A/B Testing**: Optimize reward tiers

---

## Support Resources

- Firebase Console: Monitor real-time activity
- Cloud Functions Logs: Debug issues
- Firestore Dashboard: Query data
- Analytics: Track metrics

---

**PACK 215 COMPLETE** — Viral Loop Engine integrated with PACK 211, 212, 213, 214