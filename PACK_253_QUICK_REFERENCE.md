# PACK 253 — ROYAL TIER QUICK REFERENCE

## 🎯 What is Royal?

**Royal = Elite tier of high-earning creators who drive platform monetization**

- Performance-based (CANNOT be bought)
- Earned through demand, not money
- Automatic maintenance/decay system
- Multiple revenue-driving benefits

## 📊 Unlock Requirements (ALL 4 required in last 90 days)

```
✓ 30+ unique paid chat partners
✓ 10,000+ tokens earned
✓ 4.2+ average rating
✓ Identity verified (selfie + doc)
```

## 💎 Royal Benefits

| Benefit | Standard | Royal |
|---------|----------|-------|
| **Earnings Ratio** | 11 words = 1 token | **7 words = 1 token** (~57% boost) |
| **Chat Pricing** | Free only | **100-500 tokens entry price** |
| **Inbox Priority** | Position 10 | **Position 1 (always first)** |
| **Discovery Ranking** | Standard | **2.5x boost (top 10%)** |
| **Badge** | None | **Gold crown icon** |
| **Analytics** | Basic | **Deep revenue dashboard** |
| **Events** | None | **Exclusive Royal networking** |

## ⏱️ Maintenance & Decay

- **Duration**: 90 days
- **To keep Royal**: Maintain 2+ of the 4 unlock metrics
- **If <2 metrics**: Status becomes "Royal Dormant"
- **Restoration**: Instant when metrics improve

## 🔔 Notifications

| Progress | Message |
|----------|---------|
| 80% | "You're getting attention — Royal is coming soon." |
| 95% | "Only a few more paid chats and you're there." |
| Unlock | "You are now Royal." + animation |
| Warning | "Stay active and keep your Royal status strong." (14 days before expiry) |
| Lost | "Your Royal status is now dormant." |
| Restored | "Welcome back! Your Royal status has been restored." |

## 📁 Files Created

### Backend
```
functions/src/
├── pack253-royal-types.ts          # Types & constants
├── pack253-royal-engine.ts         # Core logic
├── pack253-royal-endpoints.ts      # API endpoints
└── pack253-royal-benefits.ts       # Benefits integration
```

### Frontend
```
app-mobile/app/
├── components/
│   ├── RoyalBadge.tsx              # Badge component
│   └── RoyalProgress.tsx           # Progress tracker
└── profile/
    ├── royal-analytics.tsx         # Analytics dashboard
    └── royal-settings.tsx          # Settings page
```

### Database
```
firestore-pack253-royal.rules       # Security rules
firestore-pack253-royal.indexes.json # Firestore indexes
```

## 🔧 API Endpoints

```typescript
// Check Royal status
getRoyalStatus()

// View progress
getRoyalProgress()

// Get analytics (Royal only)
getRoyalAnalytics()

// Set chat pricing (Royal only, 100-500 tokens)
setRoyalChatPricing({ chatPrice: 250 })

// Create Royal event
createRoyalEvent({ title, description, startTime, endTime, type, maxAttendees })

// Join Royal event
joinRoyalEvent({ eventId })

// Force refresh
refreshRoyalStatus()
```

## 🗓️ Scheduled Tasks

```
Daily (3 AM UTC):   updateAllRoyalStatusesDaily
Weekly (4 AM Sun):  generateRoyalAnalyticsWeekly
```

## 💰 Revenue Impact

### For Creators
- **57% more earnings** on chat messages (7 vs 11 words)
- **Custom pricing** = additional revenue stream
- **Priority placement** = more visibility = more chats
- **Better tools** = optimize performance

### For Avalo
- **Higher ARPU**: Royal creators drive more transactions
- **Better retention**: Status creates addiction to maintain tier
- **Platform prestige**: Elite tier attracts serious creators
- **Revenue multiplier**: More Royal = more platform revenue

### For Payers
- **Quality signal**: Royal badge = proven high-demand creator
- **Worth premium**: Entry price filters casual browsers
- **Better experience**: Royal creators typically more engaged

## ⚖️ Fairness Rules

1. ✅ Same rules for everyone
2. ✅ Cannot be purchased or gifted
3. ✅ Transparent metrics
4. ✅ Automatic system (no favoritism)
5. ✅ Instant restoration path
6. ✅ No humiliation on decay

## 🎨 UI Components Usage

### Display Badge
```tsx
import RoyalBadge from '@/components/RoyalBadge';

<RoyalBadge 
  isRoyal={user.isRoyal}
  isDormant={user.isDormant}
  size="medium"
  showLabel={true}
/>
```

### Show Progress
```tsx
import RoyalProgress from '@/components/RoyalProgress';

<RoyalProgress 
  userId={currentUserId}
  onRefresh={() => loadUserData()}
/>
```

## 🔍 Monitoring

### Key Metrics to Track
- Royal unlock rate
- Time to Royal (avg days)
- Retention rate (% maintaining after 90 days)
- Revenue delta (Royal vs Standard creators)
- Entry price adoption rate
- Event participation rate

### Health Checks
- Daily status update success rate
- Metrics calculation performance
- Notification delivery rate
- API response times
- Error rates

## 🚨 Common Issues & Solutions

**User eligible but not Royal?**
- Force refresh: `refreshRoyalStatus()`
- Check all 4 metrics individually
- Verify last 90 days period
- Confirm verification status

**Royal status lost unexpectedly?**
- Check decay tracking in `royal_decay` collection
- Review metrics at expiry timestamp
- Check notification logs
- Verify wasn't dormant

**Chat pricing not working?**
- Confirm user is Royal (not dormant)
- Verify price 100-500 range
- Check payer has sufficient balance
- Review transaction logs

## 📈 Success Metrics

| Metric | Target |
|--------|--------|
| Royal unlock rate | >5% of active creators |
| Royal retention | >70% after 90 days |
| Revenue per Royal | 3x standard creator |
| Entry price adoption | >40% of Royal |
| Payer satisfaction | 4.5+ rating |

## 🎯 Key Takeaways

1. **Royal = Performance-driven elite tier**
2. **Cannot be bought = Earned through demand**
3. **Multiple benefits = Revenue multiplier**
4. **Automatic maintenance = Fair competition**
5. **Instant restoration = No permanent loss**
6. **Platform growth = More Royal = More revenue**

---

**Royal is the engine of platform monetization.**