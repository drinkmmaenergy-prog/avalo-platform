# PACK 213 — Quick Reference Guide

## What is PACK 213?

Premium Match Priority Engine that ranks discovery profiles based on:
- **Attraction** (35%) - likes, views, dwell time
- **Reputation** (25%) - from PACK 212
- **Earnings Synergy** (25%) - economic compatibility
- **Recent Activity** (10%) - last active
- **Interest Proximity** (5%) - tag overlap

## Key Principles

✅ **Does NOT modify:** Token pricing, revenue splits, any economic values  
✅ **Only affects:** Discovery ranking and visibility  
✅ **User messaging:** Positive reinforcement only, never reveal algorithm

## Files Created

### Core Implementation
- `functions/src/types/pack213-types.ts` - Type definitions
- `functions/src/pack213-match-priority-engine.ts` - Scoring engine
- `functions/src/pack213-discovery-integration.ts` - Discovery integration
- `functions/src/pack213-functions.ts` - Cloud Functions

### Database
- `firestore-pack213-match-priority.rules` - Security rules
- `firestore-pack213-match-priority.indexes.json` - Indexes

### Testing & Documentation
- `functions/src/pack213-match-priority.test.ts` - Tests
- `PACK_213_IMPLEMENTATION_COMPLETE.md` - Full documentation

## Quick API Reference

### Discovery
```typescript
// Get ranked discovery feed
getDiscoveryFeedV2({ 
  filters, 
  limit: 20, 
  usePriorityRanking: true 
})

// Get high-priority matches
getHighPriorityMatchesV1({ 
  limit: 10, 
  minScore: 70 
})

// Get context-specific suggestions
getSuggestedProfilesV1({ 
  context: 'chemistry_weekend', 
  limit: 20 
})
```

### Signal Tracking
```typescript
// Track user interactions
trackProfileLikeV1({ targetUserId })
trackProfileViewV1({ targetUserId, dwellTimeSeconds })
trackMediaExpansionV1({ targetUserId })
trackProfileWishlistV1({ targetUserId })
```

### Boost Application
```typescript
// Apply visibility boost
applyTokenPurchaseBoostV1({ amount })
```

## Boost Actions

| Action | Multiplier | Duration |
|--------|-----------|----------|
| Purchase tokens | 1.3× | 24h |
| Complete paid chat | 1.2× | 12h |
| Complete paid meeting | 1.6× | 72h |
| Host successful event | 1.7× | 72h |
| Give voluntary refund | 1.15× | 24h |
| Receive good vibe mark | 1.4× | 48h |

**Note:** Multiple boosts stack multiplicatively

## Earnings Synergy Levels

| Scenario | Score | Priority |
|----------|-------|----------|
| Royal × High-Demand Creator | 0.95 | EXTREME_HIGH |
| Active Spender × Earner | 0.85 | VERY_HIGH |
| Frequent Purchaser × Growing Creator | 0.75 | HIGH |
| Mixed modes | 0.55 | MEDIUM |
| Both non-earners | 0.45 | MEDIUM_LOW |
| Both earners | 0.30 | LOW |
| Low engagement × High-demand | 0.15 | VERY_LOW |

## Integration Points

### PACK 211 (Adaptive Safety)
- Respects safety blocks
- Filters hidden profiles
- No boost for flagged users

### PACK 212 (Reputation)
- Uses `user_reputation.score`
- 25% weight in priority
- Higher reputation = better visibility

### Discovery Engine V2
- Enhances existing system
- Maintains all filters
- Preserves safety checks

## User-Facing Messages (Allowed)

✅ "You're getting more visibility thanks to your good energy."  
✅ "Avalo is showing you profiles based on high chemistry potential."  
✅ "Your recent activity automatically boosts discovery."  
✅ "Your profile has increased visibility right now."

❌ Never reveal: scores, rankings, algorithm details, negative feedback

## Deployment Steps

1. **Deploy Firestore rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Deploy indexes:**
   ```bash
   firebase deploy --only firestore:indexes
   ```

3. **Deploy functions:**
   ```bash
   firebase deploy --only functions:getDiscoveryFeedV2,functions:getHighPriorityMatchesV1,functions:getSuggestedProfilesV1,functions:trackProfileLikeV1,functions:trackProfileViewV1,functions:trackMediaExpansionV1,functions:trackProfileWishlistV1,functions:applyTokenPurchaseBoostV1,functions:calculateMatchPriorityV1,functions:expireOldBoostsScheduled
   ```

4. **Update frontend:**
   - Call new discovery API
   - Add signal tracking
   - Integrate boost triggers
   - Display feedback messages

## Monitoring

Track these metrics:
- Average match priority scores
- Discovery engagement rate
- Boost effectiveness
- Synergy prediction accuracy
- API latency

## Scheduled Maintenance

- **Hourly:** Expire old boosts (automated)
- **Recommended:** Clean old signals (90+ days)
- **Recommended:** Rebuild economic profiles weekly

## Testing

Run integration tests:
```bash
npm test functions/src/pack213-match-priority.test.ts
```

## Support

For implementation issues:
1. Check `PACK_213_IMPLEMENTATION_COMPLETE.md`
2. Review API documentation
3. Verify Firestore indexes are built
4. Check CloudWatch logs for errors

---

**Status:** ✅ Ready for deployment  
**Version:** 1.0.0  
**Date:** 2025-12-02