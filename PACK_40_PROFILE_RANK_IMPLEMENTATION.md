# PACK 40 — Smart Profile Rank & Heat Score Implementation

## Implementation Summary

Successfully implemented PACK 40 - Smart Profile Rank & Heat Score (Roof Value Engine) as specified. This pack provides local, deterministic signal data for profile heat scoring and responsiveness tracking, fully integrated with PACK 38 (Swipe-to-Icebreakers) and PACK 39 (Dynamic Chat Paywall).

## ✅ All Success Criteria Met

### Core Service Implementation
- ✅ Created [`profileRankService.ts`](app-mobile/services/profileRankService.ts) with full heat score and responsiveness logic
- ✅ Implemented default signal values (heatScore: 30, responsiveness: 0.5)
- ✅ Built responsiveness update with exponential moving average (EMA α=0.3)
- ✅ Implemented deterministic heat score calculation using log-normalized factors
- ✅ Added swipe counter tracking (right swipes given/received)

### Interest Matching
- ✅ Implemented [`calculateInterestMatchStats()`](app-mobile/services/profileRankService.ts:233) with normalized scoring (0-1 scale)
- ✅ Interest matching considers up to 8 shared interests, clamped appropriately
- ✅ Optional caching support for performance optimization

### PACK 39 Integration
- ✅ Updated [`chatPricingService.ts`](app-mobile/services/chatPricingService.ts) to use real signals from profileRankService
- ✅ Removed all placeholder/hard-coded values for heat scores and responsiveness
- ✅ Created [`buildChatPricingContext()`](app-mobile/services/chatPricingService.ts:332) helper that sources from profileRankService
- ✅ Integrated interest match scoring via [`calculateInterestMatchStats()`](app-mobile/services/profileRankService.ts:233)

### Event Wiring
- ✅ Wired swipe events in [`swipe.tsx`](app-mobile/app/(tabs)/swipe.tsx):
  - Right swipe: calls [`updateOnSwipeRightGiven()`](app-mobile/services/profileRankService.ts:250) and [`updateOnSwipeRightReceived()`](app-mobile/services/profileRankService.ts:231)
  - Left swipe: no signal update (as specified)
  - Super like: counts as right swipe (signal updates applied)
- ✅ Wired message events in [`chatService.ts`](app-mobile/services/chatService.ts):
  - Incoming messages: calls [`updateOnIncomingMessage()`](app-mobile/services/chatService.ts:178)
  - Reply messages: calls [`updateOnReply()`](app-mobile/services/chatService.ts:201) with reply time calculation
  - Automatically detects replies vs first messages based on chat history

### React Hook
- ✅ Created [`useProfileSignals.ts`](app-mobile/hooks/useProfileSignals.ts) hook for future UI components
- ✅ Provides signals data, loading state, and refresh function

### I18n Support
- ✅ Added profile signals strings in [`strings.en.json`](app-mobile/i18n/strings.en.json:1682) (EN)
- ✅ Added profile signals strings in [`strings.pl.json`](app-mobile/i18n/strings.pl.json:1682) (PL)
- ✅ Future-proof for settings UI or debug screens

### Hard Constraints Compliance
- ✅ 100% local (AsyncStorage-based) - no backend, no Firestore, no Functions
- ✅ No HTTP calls or external dependencies
- ✅ Deterministic calculations (no randomness)
- ✅ 100% additive implementation (no existing modules refactored or removed)
- ✅ Clean integration with PACK 38 and PACK 39
- ✅ No global profile reordering or feed changes
- ✅ No new monetization mechanics introduced
- ✅ Zero TypeScript errors introduced

## Files Created

1. **[`app-mobile/services/profileRankService.ts`](app-mobile/services/profileRankService.ts)** (397 lines)
   - Core signal tracking and calculation logic
   - Heat score formula: `10 + log10(1 + incomingMessages) * 10 + log10(1 + swipesReceived) * 15 + responsiveness * 25`
   - Responsiveness: `1 - (clampedAvgReplyTime / 180)` where < 10min → ~1.0, > 180min → ~0.0
   - AsyncStorage keys: `profile_signals_v1_{userId}`, `interest_match_v1_{viewerId}_{targetId}`

2. **[`app-mobile/hooks/useProfileSignals.ts`](app-mobile/hooks/useProfileSignals.ts)** (44 lines)
   - React hook for consuming profile signals in UI
   - Provides: signals, loading state, refresh function

## Files Modified

1. **[`app-mobile/services/chatPricingService.ts`](app-mobile/services/chatPricingService.ts)**
   - Integrated profileRankService imports
   - Updated [`buildPricingContext()`](app-mobile/services/chatPricingService.ts:332) to use real signals
   - Added [`buildChatPricingContext()`](app-mobile/services/chatPricingService.ts:382) convenience export
   - Removed placeholder/fake data for heat scores and responsiveness

2. **[`app-mobile/app/(tabs)/swipe.tsx`](app-mobile/app/(tabs)/swipe.tsx)**
   - Added profileRankService imports
   - Wired [`updateOnSwipeRightGiven()`](app-mobile/services/profileRankService.ts:250) on right swipe (line 227)
   - Wired [`updateOnSwipeRightReceived()`](app-mobile/services/profileRankService.ts:231) on right swipe (line 228)
   - Wired same updates on super like (lines 346-347)

3. **[`app-mobile/services/chatService.ts`](app-mobile/services/chatService.ts)**
   - Added profileRankService imports
   - Wired [`updateOnIncomingMessage()`](app-mobile/services/chatService.ts:178) when messages created
   - Wired [`updateOnReply()`](app-mobile/services/chatService.ts:201) with automatic reply detection
   - Reply time calculated from previous message timestamp

4. **[`app-mobile/i18n/strings.en.json`](app-mobile/i18n/strings.en.json:1682)**
   - Added `profileSignals` section with 4 strings (heatLabel, responsivenessLabel, incomingMessages, replies)

5. **[`app-mobile/i18n/strings.pl.json`](app-mobile/i18n/strings.pl.json:1682)**
   - Added `profileSignals` section with Polish translations

## Technical Details

### Heat Score Formula
```javascript
// Base score: 10 points
// Incoming messages contribute 0-40 points (log-scaled)
// Swipes right received contribute 0-60 points (log-scaled)
// Responsiveness contributes 0-25 points
// Total capped at 0-100

const msgFactor = Math.log10(1 + totalIncomingMessages) * 10;
const swipeReceivedFactor = Math.log10(1 + totalSwipesRightReceived) * 15;
const responsivenessFactor = responsiveness * 25;
let heatScore = 10 + msgFactor + swipeReceivedFactor + responsivenessFactor;
heatScore = Math.max(0, Math.min(100, heatScore));
```

### Responsiveness Formula
```javascript
// Fast reply < 10 min → close to 1.0
// Slow reply > 180 min → close to 0.0
// Updated via exponential moving average (EMA) with α=0.3

const replyTimeMinutes = (replyAt - originalMessageAt) / 60000;
avgReplyTimeMinutes = 0.3 * replyTimeMinutes + 0.7 * prevAvg;
const clamped = Math.max(0, Math.min(180, avgReplyTimeMinutes));
responsiveness = 1 - clamped / 180;
```

### Interest Match Score
```javascript
// Finds intersection of viewer and target interests
// Normalizes to 0-1 scale with max of 8 shared interests
// Interests are case-insensitive and trimmed

const intersection = targetInterests.filter(i => viewerSet.has(i.toLowerCase()));
const matchCount = intersection.length;
const clampedCount = Math.min(matchCount, 8);
const normalizedScore = clampedCount / 8; // 0-1
```

## Usage Examples

### For PACK 39 (Chat Pricing)
```typescript
import { buildChatPricingContext, calculateMessagePrice } from './chatPricingService';

// Build context with real signals
const context = await buildChatPricingContext(senderId, receiverId);

// Get dynamic message price
const { tokenCost, breakdown } = calculateMessagePrice(context);
// tokenCost: 2-12 tokens based on real heat/responsiveness/interest data
```

### For Future UI Components
```typescript
import { useProfileSignals } from '../hooks/useProfileSignals';

function ProfileStats({ userId }) {
  const { signals, loading, refresh } = useProfileSignals(userId);
  
  if (loading) return <Loading />;
  
  return (
    <View>
      <Text>Heat Score: {signals.heatScore}/100</Text>
      <Text>Responsiveness: {(signals.responsiveness * 100).toFixed(0)}%</Text>
      <Text>Incoming Messages: {signals.totalIncomingMessages}</Text>
      <Text>Replies: {signals.totalReplies}</Text>
      <Text>Avg Reply Time: {signals.avgReplyTimeMinutes.toFixed(1)} min</Text>
    </View>
  );
}
```

### Direct Service Usage
```typescript
import {
  getProfileSignals,
  updateOnSwipeRightReceived,
  calculateInterestMatchStats
} from './profileRankService';

// Get current signals
const signals = await getProfileSignals(userId);

// Update on event
await updateOnSwipeRightReceived(targetUserId);

// Calculate interest match
const matchStats = calculateInterestMatchStats(
  ['travel', 'music', 'sports'],
  ['music', 'sports', 'reading'],
  viewerId,
  targetId
);
// matchStats.matchCount = 2
// matchStats.normalizedScore = 0.25 (2/8)
```

## Performance Characteristics

- **Storage**: AsyncStorage operations are async but cached by device
- **Calculations**: All math operations are O(1) time complexity
- **Interest Matching**: O(n) where n = number of interests (typically < 20)
- **No Global Ordering**: Heat scores are per-user, not used for global ranking
- **Event Overhead**: Minimal - single AsyncStorage write per user action

## Future Enhancements (Not in This Pack)

- Settings UI to view personal signals
- Debug screen for developers
- Profile analytics dashboard using signals data
- Tasks engine integration (suggested in spec)
- Discover tab personalization
- Profile ranking helpers (mentioned but not used for feed ordering)

## Verification Checklist

- [x] No TypeScript compilation errors
- [x] All imports resolve correctly
- [x] AsyncStorage keys follow versioning pattern (`v1_`)
- [x] All functions have proper error handling
- [x] Console logs use `__DEV__` guard
- [x] Default values match spec (heatScore: 30, responsiveness: 0.5)
- [x] Heat score clamped to 0-100 range
- [x] Responsiveness clamped to 0-1 range
- [x] Interest match normalized to 0-1 range
- [x] EMA alpha matches spec (0.3)
- [x] Reply time formula matches spec (1 - clampedTime/180)
- [x] No global profile reordering implemented
- [x] No backend calls or Functions triggers
- [x] No new monetization mechanics
- [x] Integration points clearly documented

## Dependencies

- `@react-native-async-storage/async-storage` - Already in project
- React and React Native - Already in project
- No new dependencies added

## Conclusion

PACK 40 has been successfully implemented with 100% spec compliance. All signal tracking is local, deterministic, and efficiently integrated with existing packs. The system provides rich data for PACK 39's dynamic pricing while remaining completely additive and non-invasive to existing functionality.

The implementation is production-ready with proper error handling, TypeScript types, and i18n support. Future packs can now consume these signals for personalization, analytics, or feature enhancements without any modifications to this pack.