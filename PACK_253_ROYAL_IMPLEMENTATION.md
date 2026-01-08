# PACK 253 — ROYAL UPGRADE FUNNEL IMPLEMENTATION

## Overview

The Royal tier system is a performance-based elite creator program that drives higher ARPU, better retention, and increased activity across the Avalo economy. Royal status **cannot be purchased** — it can only be **earned through demand**.

## Core Principles

1. **Performance-Based**: Royal status is earned by meeting strict performance metrics
2. **No Shortcuts**: Cannot be bought, gifted, or assigned
3. **Automatic Maintenance**: Status decays if performance drops
4. **Revenue Multiplier**: Royal creators drive platform monetization
5. **Fair Competition**: Same rules apply to everyone

## Royal Requirements

To unlock Royal status, creators must meet **ALL 4 metrics** in the last 90 days:

| Metric | Requirement |
|--------|-------------|
| Unique Paid Chat Partners | 30+ |
| Total Earnings | 10,000+ tokens |
| Average Chat Rating | 4.2+ / 5.0 |
| Identity Verification | Verified (selfie + doc) |

### Optional Boosters (~10% faster unlock)
- Event participation/hosting
- Story/Album sales
- Boost purchases

## Royal Benefits

### 1. Better Earnings Ratio
- **Royal**: 7 words = 1 token
- **Standard**: 11 words = 1 token
- **Impact**: ~57% earnings boost on chat messages

### 2. Custom Chat Pricing
- Set entry price: 100-500 tokens
- Optional (can remain free)
- Immediately deductible from payer's balance
- 65% to creator, 35% to Avalo

### 3. Priority Inbox
- Always appear first in user inboxes
- Priority level: 1 (highest)
- Standard creators: Priority 10

### 4. Discovery Boost
- 2.5x multiplier on discovery ranking
- Guaranteed top 10% placement
- Increased profile views and connections

### 5. Royal Badge
- Gold crown icon on profile
- Visible to all users
- Social status indicator

### 6. Royal Analytics
- Deep revenue dashboard
- Performance insights
- Peak earning times
- Payer lifetime value
- Royal benefits impact tracking

### 7. Exclusive Royal Events
- Networking events
- Workshops
- Celebration events
- Royal-only community

## Royal Decay System

### Duration
- Royal status lasts **90 days** by default
- After 90 days, system checks for maintenance

### Maintenance Requirements
To keep Royal status beyond 90 days:
- Must maintain **at least 2 of the 4 unlock metrics**
- If ≥2 metrics passing: Royal status extends another 90 days
- If <2 metrics passing: Status becomes "Royal Dormant"

### Royal Dormant State
- Badge turns gray
- Earnings calculation reverts to standard (11 words = 1 token)
- Loses custom pricing, priority inbox, discovery boost
- Can be **instantly restored** when metrics improve

### Decay Warnings
- **14 days before expiry**: Warning if <2 metrics passing
- **7 days before expiry**: Critical warning
- Notifications sent via push and in-app

## Technical Implementation

### Backend Architecture

#### Files Created
```
functions/src/
├── pack253-royal-types.ts          # TypeScript types and constants
├── pack253-royal-engine.ts         # Core Royal logic and calculations
├── pack253-royal-endpoints.ts      # API endpoints
└── pack253-royal-benefits.ts       # Benefits integration
```

#### Firestore Collections
```
royal_metrics/           # Performance metrics tracking
royal_status/            # Current Royal tier status
royal_analytics/         # Revenue analytics data
royal_progress/          # Unlock progress tracking
royal_events/            # Exclusive Royal events
royal_pricing/           # Custom chat pricing settings
royal_decay/             # Decay and maintenance tracking
```

#### Key Functions

**Metrics Calculation**
```typescript
calculateRoyalMetrics(userId: string): Promise<RoyalMetrics>
```
- Analyzes last 90 days of activity
- Counts unique paid partners
- Sums total earnings
- Calculates average rating
- Checks verification status

**Status Update**
```typescript
updateRoyalStatus(userId: string): Promise<RoyalStatus>
```
- Evaluates eligibility
- Handles unlock/maintain/decay logic
- Sends appropriate notifications
- Updates all tracking collections

**Benefits Integration**
```typescript
calculateChatTokens(creatorId: string, message: string): Promise<number>
getChatEntryPrice(creatorId: string): Promise<number>
applyInboxPriority(chatId: string, creatorId: string): Promise<number>
applyDiscoveryBoost(userId: string, baseScore: number): Promise<number>
```

### Frontend Components

#### Components Created
```
app-mobile/app/components/
├── RoyalBadge.tsx              # Badge display component
└── RoyalProgress.tsx            # Progress tracking component

app-mobile/app/profile/
├── royal-analytics.tsx          # Analytics dashboard
└── royal-settings.tsx           # Settings and configuration
```

#### Integration Points

**Profile Display**
```tsx
import RoyalBadge from '@/components/RoyalBadge';

<RoyalBadge 
  isRoyal={user.isRoyal} 
  isDormant={user.isDormant}
  size="medium"
/>
```

**Progress Tracking**
```tsx
import RoyalProgress from '@/components/RoyalProgress';

<RoyalProgress userId={currentUserId} />
```

### API Endpoints

All endpoints are callable via Firebase Functions:

```typescript
// Get Royal status
const getRoyalStatus = httpsCallable(functions, 'getRoyalStatus');
const result = await getRoyalStatus({});

// Get progress
const getRoyalProgress = httpsCallable(functions, 'getRoyalProgress');
const progress = await getRoyalProgress({});

// Get analytics (Royal only)
const getRoyalAnalytics = httpsCallable(functions, 'getRoyalAnalytics');
const analytics = await getRoyalAnalytics({});

// Set chat pricing (Royal only)
const setRoyalChatPricing = httpsCallable(functions, 'setRoyalChatPricing');
await setRoyalChatPricing({ chatPrice: 250 });

// Create Royal event (Royal only)
const createRoyalEvent = httpsCallable(functions, 'createRoyalEvent');
await createRoyalEvent({ title, description, startTime, endTime, type, maxAttendees });

// Join Royal event
const joinRoyalEvent = httpsCallable(functions, 'joinRoyalEvent');
await joinRoyalEvent({ eventId });

// Force refresh status
const refreshRoyalStatus = httpsCallable(functions, 'refreshRoyalStatus');
const status = await refreshRoyalStatus({});
```

## Scheduled Tasks

### Daily Status Update
```
Schedule: 3:00 AM UTC daily
Function: updateAllRoyalStatusesDaily
```
- Updates all active Royal statuses
- Checks decay conditions
- Sends warnings if needed
- Also checks users close to becoming Royal (≥80% progress)

### Weekly Analytics Generation
```
Schedule: 4:00 AM UTC Sunday
Function: generateRoyalAnalyticsWeekly
```
- Generates analytics for all Royal users
- Pre-computes revenue breakdowns
- Updates performance insights

## Notification System

### Progress Notifications

**80% Progress**
```
"You're getting attention — Royal is coming soon."
```

**95% Progress**
```
"Only a few more paid chats and you're there."
```

**Unlock**
```
"You are now Royal." + animation
```

### Maintenance Notifications

**Decay Warning (14 days before expiry, <2 metrics)**
```
"Stay active and keep your Royal status strong."
+ Breakdown of which metrics are failing
```

**Status Lost**
```
"Your Royal status is now dormant. Improve your metrics to restore it."
```

**Status Restored**
```
"Welcome back! Your Royal status has been restored."
```

## Security Rules

Firestore security ensures:
- Users can only read their own Royal data
- Only backend functions can write metrics
- Royal events visible only to Royal users
- Chat pricing can only be set by verified Royal creators
- Price must be within 100-500 token range

## Business Impact

### For Avalo
- **Higher ARPU**: Royal creators earn more, spend more on platform
- **Better Retention**: Elite status creates addiction to maintaining tier
- **Increased Activity**: Competition drives more engagement
- **Revenue Multiplier**: 57% earnings boost = more platform transactions

### For Creators
- **More Money**: Better earnings ratio + custom pricing
- **More Attention**: Priority inbox + discovery boost
- **Social Status**: Visible badge demonstrates success
- **Better Tools**: Analytics, events, networking

### For Payers
- **Clear Value Signal**: Royal badge = high-quality creator
- **Worth Premium**: Entry price filters casual browsers
- **Better Experience**: Royal creators typically more engaged
- **Status Association**: Interacting with elite creators

## Fairness Safeguards

1. **Same Rules for All**: No favoritism, no special treatment
2. **Performance Only**: Cannot buy Royal status
3. **Transparent Metrics**: Users see exactly what they need
4. **Automatic System**: No manual approvals or denials
5. **Restore Path**: Dormant status can be instantly restored
6. **No Humiliation**: Decay is performance-based, not punitive

## Testing Checklist

- [ ] User can see Royal progress when <100%
- [ ] User unlocks Royal when all 4 metrics met
- [ ] Royal badge displays correctly on profile
- [ ] Custom chat pricing works (100-500 tokens)
- [ ] Chat entry payment deducts correctly
- [ ] 7-word earnings calculation works
- [ ] Priority inbox sorting works
- [ ] Discovery boost applies correctly
- [ ] Royal analytics dashboard displays
- [ ] Progress notifications sent at 80% and 95%
- [ ] Unlock notification triggers
- [ ] Decay warning sent 14 days before expiry
- [ ] Status becomes dormant when <2 metrics
- [ ] Status restores when metrics improve
- [ ] Royal events create and join correctly
- [ ] Scheduled tasks run successfully

## Future Enhancements

### Potential Additions
- Royal tiers (Royal, Royal Plus, Royal Elite)
- Achievement badges for Royal milestones
- Royal creator leaderboard
- Monthly Royal spotlight features
- Special Royal profile themes
- Advanced analytics with AI insights

### Metrics to Track
- Royal unlock rate
- Time to Royal (days from sign-up)
- Royal retention rate (% maintaining after 90 days)
- Revenue impact (Royal vs standard)
- Entry price adoption rate
- Event participation rate

## Support & Maintenance

### Monitoring
- Daily status update success rate
- Metrics calculation performance
- Notification delivery rate
- API endpoint usage
- Error rates and types

### Common Issues

**"User should be Royal but isn't"**
- Check all 4 metrics individually
- Verify time period (must be last 90 days)
- Confirm verification status
- Force refresh with `refreshRoyalStatus`

**"Royal status lost unexpectedly"**
- Check decay tracking
- Verify metrics at expiry time
- Review notification history
- Check if was dormant and didn't notice

**"Chat pricing not working"**
- Verify user is Royal (not dormant)
- Check price is within 100-500 range
- Confirm payer has sufficient balance
- Review transaction logs

## Conclusion

The Royal Upgrade Funnel creates a predictable, scalable path to elite creator status that drives revenue for both creators and Avalo while maintaining fairness and transparency. The system is fully automated, performance-based, and designed to create healthy competition and sustained engagement.

Royal = The Engine of Platform Monetization.