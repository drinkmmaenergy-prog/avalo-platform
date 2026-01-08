# PACK 139 — Integration Guide

## Quick Start

### 1. Backend Integration

```typescript
// Import club functions in your Cloud Functions index
import {
  createClub,
  updateClubDetails,
  joinClub,
  leaveClub,
  postToClub,
  hostClubEvent,
  banClubUser,
  assignClubModerator,
  getClubDetails,
  listClubs,
  getMyClubs,
  getClubPosts,
  getClubAnalytics,
} from './clubs';

// Export in index.ts
export {
  createClub,
  updateClubDetails,
  joinClub,
  leaveClub,
  postToClub,
  hostClubEvent,
  banClubUser,
  assignClubModerator,
  getClubDetails,
  listClubs,
  getMyClubs,
  getClubPosts,
  getClubAnalytics,
};
```

### 2. Mobile Integration

```typescript
import {
  createClub,
  joinClub,
  getMyClubs,
  ClubCategory,
  ClubAccessType,
} from '../../services/clubsService';

// Create a club
const { clubId } = await createClub({
  name: "Fitness Warriors",
  description: "Daily workouts and fitness challenges",
  category: ClubCategory.FITNESS_TRAINING,
  accessType: ClubAccessType.FREE_PUBLIC,
  entryTokens: 0,
  isPublic: true,
  tags: ['fitness', 'health']
});

// Join a club
await joinClub(clubId);

// Get user's clubs
const myClubs = await getMyClubs();
```

---

## Safety Integration with Existing Packs

### PACK 126: Consent Protocol

```typescript
// Clubs respect consent boundaries
// Users can revoke consent to stop club communications
import { pack126_checkConsent } from './pack126-consent-protocol';

// Before sending club notification
const consent = await pack126_checkConsent(userId, senderId);
if (consent.canCommunicate) {
  // Send notification
}
```

### PACK 130: Patrol AI

```typescript
// Club violations logged to Patrol AI
import { patrolLogEvent } from './pack130-patrol-engine';

// On NSFW violation in club
await patrolLogEvent(
  userId,
  'NSFW_BYPASS_ATTEMPT',
  0.9, // High confidence
  { clubId, postId, violationType: 'club_nsfw_post' }
);
```

### PACK 137: Community Challenges

```typescript
// Post challenge progress to clubs
await postToClub({
  clubId,
  type: ClubPostType.CHALLENGE_PROGRESS,
  content: "Day 15 of 30-Day Fitness Challenge! 💪",
  mediaUrl: challengeProgressPhoto
});
```

### PACK 117: Events

```typescript
// Host club event
const { eventId } = await hostClubEvent({
  clubId,
  title: "Weekly Group Workout",
  description: "Join us for a group fitness session",
  startTime: "2025-12-01T10:00:00Z",
  endTime: "2025-12-01T12:00:00Z",
  maxAttendees: 20
});
```

---

## Payment Integration

### Token-Gated Club Entry

```typescript
// System automatically handles:
// 1. Token balance check
// 2. Atomic transaction (deduct from user, add to owner)
// 3. 65/35 split calculation
// 4. Transaction record creation

const result = await joinClub(clubId);
// If successful, user is now a member
```

### Revenue Split Calculation

```typescript
// Fixed 65/35 split
const platformFee = Math.floor(entryTokens * 0.35);  // 35%
const ownerEarnings = entryTokens - platformFee;      // 65%

// Example: 100 token entry
// Platform: 35 tokens
// Owner: 65 tokens
```

---

## Analytics Integration

### Privacy-First Analytics

```typescript
// Owner-only access
const analytics = await getClubAnalytics(clubId);

// Available metrics (aggregate only):
console.log(analytics.memberCount);              // Total members
console.log(analytics.retentionRate);            // % active in 30 days
console.log(analytics.postsTotal);               // Total posts
console.log(analytics.postsLast30Days);          // Recent activity
console.log(analytics.eventAttendanceTotal);     // Event participation
console.log(analytics.totalRevenue);             // Total earned
console.log(analytics.averageRevenuePerMember);  // Per-member average

// NOT available (privacy protected):
// - Personal identities
// - Spender lists
// - View tracking
// - Buyer segmentation
```

### PACK 132 Integration

```typescript
// Clubs data feeds into global analytics (anonymized)
// Creator earnings include club revenue
// Regional trends include club activity
// NO user-level tracking
```

---

## Moderation Integration

### Owner Actions

```typescript
// Ban user from club
await banClubUser({
  clubId,
  userId: violatorId,
  reason: "Posted NSFW content"
});

// Assign moderator
await assignClubModerator({
  clubId,
  userId: trustedMemberId
});
```

### Moderator Actions

```typescript
// Moderators can:
// - Delete posts (via Cloud Function)
// - Ban users
// - Manage threads
// - Host events

// Moderators cannot:
// - Access revenue data
// - Change club settings
// - Remove owner
// - Access private analytics
```

### PACK 87 Enforcement Integration

```typescript
// Violations auto-escalate to enforcement engine
// First violation: Warning
// Second violation: 7-day club creation ban
// Third violation: Permanent ban from creating clubs
```

---

## UI Integration

### Navigation

```typescript
import { useRouter } from 'expo-router';

const router = useRouter();

// Browse clubs
router.push('/clubs');

// View specific club
router.push(`/clubs/${clubId}`);

// Create club
router.push('/clubs/create');
```

### Screen Components

```tsx
// Clubs Library
import ClubsLibraryScreen from './app/clubs/index';

// Club Profile
import ClubProfileScreen from './app/clubs/[clubId]';
```

---

## Security Best Practices

### Content Validation

```typescript
// Always validate before creating club
import { validateClubContent } from './types/clubs.types';

const validation = validateClubContent(
  name,
  description,
  category,
  rules
);

if (!validation.isValid) {
  throw new Error(`Blocked: ${validation.violations.join(', ')}`);
}
```

### Post Validation

```typescript
// Always validate posts
import { validateClubPostContent } from './types/clubs.types';

const validation = validateClubPostContent(content, type);

if (!validation.isValid) {
  throw new Error(`Post blocked: ${validation.violations.join(', ')}`);
}
```

---

## Testing

### Unit Tests

```typescript
// Test club creation
test('creates club with valid data', async () => {
  const result = await createClub({
    name: "Test Club",
    description: "Test description with sufficient length for validation",
    category: ClubCategory.FITNESS_TRAINING,
    accessType: ClubAccessType.FREE_PUBLIC,
    entryTokens: 0,
    isPublic: true
  });
  
  expect(result.clubId).toBeDefined();
});

// Test NSFW blocking
test('rejects club with NSFW keywords', async () => {
  await expect(createClub({
    name: "Dating Club",
    description: "Looking for romantic connections",
    category: ClubCategory.FITNESS_TRAINING,
    accessType: ClubAccessType.FREE_PUBLIC,
    entryTokens: 0,
    isPublic: true
  })).rejects.toThrow('Blocked keyword');
});
```

### Integration Tests

```typescript
// Test join flow with payment
test('joins token-gated club with payment', async () => {
  // Setup: Create token-gated club
  const { clubId } = await createClub({
    name: "Premium Club",
    description: "Exclusive community for serious enthusiasts",
    category: ClubCategory.FITNESS_TRAINING,
    accessType: ClubAccessType.TOKEN_GATED,
    entryTokens: 100,
    isPublic: true
  });
  
  // Test: Join with sufficient tokens
  const { memberId } = await joinClub(clubId);
  expect(memberId).toBeDefined();
  
  // Verify: Token deduction
  const userDoc = await db.collection('users').doc(userId).get();
  expect(userDoc.data()?.tokenBalance).toBe(initialBalance - 100);
});
```

---

## Error Handling

### Common Patterns

```typescript
try {
  await joinClub(clubId);
} catch (error: any) {
  if (error.code === 'failed-precondition') {
    // Insufficient tokens, club full, etc.
    Alert.alert('Cannot Join', error.message);
  } else if (error.code === 'permission-denied') {
    // Not authorized
    Alert.alert('Access Denied', error.message);
  } else if (error.code === 'already-exists') {
    // Already a member
    Alert.alert('Already Joined', 'You are already a member of this club');
  } else {
    // Generic error
    Alert.alert('Error', 'Failed to join club');
  }
}
```

---

## Performance Optimization

### Caching Strategy

```typescript
// Cache club lists locally
const cachedClubs = await AsyncStorage.getItem('clubs_cache');
if (cachedClubs && Date.now() - cacheTime < 5 * 60 * 1000) {
  // Use cache for 5 minutes
  setClubs(JSON.parse(cachedClubs));
} else {
  // Fetch fresh data
  const clubs = await listClubs();
  await AsyncStorage.setItem('clubs_cache', JSON.stringify(clubs));
}
```

### Pagination

```typescript
// Load clubs in batches
const firstBatch = await listClubs({ limit: 20 });
const secondBatch = await listClubs({ limit: 20, startAfter: lastClubId });
```

---

## Firestore Queries

### Get Active Clubs by Category

```typescript
const fitnessClubs = await db
  .collection('clubs')
  .where('category', '==', 'FITNESS_TRAINING')
  .where('status', '==', 'ACTIVE')
  .where('isActive', '==', true)
  .orderBy('createdAt', 'desc')
  .limit(50)
  .get();
```

### Get User's Clubs

```typescript
const myClubsSnapshot = await db
  .collection('club_members')
  .where('userId', '==', userId)
  .where('isActive', '==', true)
  .orderBy('joinedAt', 'desc')
  .get();
```

### Get Club Posts

```typescript
const postsSnapshot = await db
  .collection('club_posts')
  .where('clubId', '==', clubId)
  .where('isVisible', '==', true)
  .orderBy('createdAt', 'desc')
  .limit(50)
  .get();
```

---

## Migration Guide

### For Existing Users

No migration needed. This is a new feature with no impact on existing data.

### For Creators

1. Ensure creator verification is complete
2. Enable `earnFromChat` in settings
3. Navigate to `/clubs/create`
4. Select SAFE category
5. Set access type and pricing
6. Launch club

---

## Compliance

### GDPR
- ✅ No personal data in analytics
- ✅ User can delete membership
- ✅ Right to erasure honored
- ✅ Data minimization (aggregate only)

### App Store Guidelines
- ✅ No dating functionality
- ✅ Age-appropriate content
- ✅ Clear community guidelines
- ✅ In-app moderation tools

### Platform Policies
- ✅ SAFE content only
- ✅ Token-only economy
- ✅ No external payments
- ✅ Full safety integration

---

## Troubleshooting

### "Club creation failed"
- Check verified creator status
- Review for blocked keywords
- Ensure valid category selection
- Verify token pricing range (1-5000)

### "Cannot join club"
- Check token balance
- Verify club is active
- Ensure not already a member
- Check if club is full

### "Post rejected"
- Review for NSFW keywords
- Remove external links
- Remove contact information
- Check if banned from club

### "Analytics not loading"
- Verify club ownership
- Ensure club exists
- Check auth token validity

---

## Support

**Documentation:** [`PACK_139_IMPLEMENTATION_COMPLETE.md`](PACK_139_IMPLEMENTATION_COMPLETE.md:1)  
**Quick Reference:** [`PACK_139_QUICK_REFERENCE.md`](PACK_139_QUICK_REFERENCE.md:1)  
**Type Definitions:** [`functions/src/types/clubs.types.ts`](functions/src/types/clubs.types.ts:1)  
**Backend Functions:** [`functions/src/clubs.ts`](functions/src/clubs.ts:1)  
**Security Rules:** [`firestore-rules/pack139-clubs-rules.rules`](firestore-rules/pack139-clubs-rules.rules:1)  
**Mobile Service:** [`app-mobile/services/clubsService.ts`](app-mobile/services/clubsService.ts:1)

---

**Version:** 1.0.0  
**Last Updated:** November 28, 2025  
**Status:** Production-Ready ✅