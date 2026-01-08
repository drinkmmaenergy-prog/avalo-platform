# Avalo Discovery Ranking v2 (Phase 20)

## Overview

The Discovery Ranking v2 system is a behavioral AI engine that ranks users in the discovery feed based on multiple signals including recency, proximity, interaction depth, reply latency, and profile quality.

## Architecture

### Key Components

1. **Signal Collection** (`userSignals` collection)
   - Aggregates behavioral data per user
   - Updated daily via scheduled function
   - Tracks messages, likes, views, blocks, reports

2. **Ranking Algorithm** (`getDiscoveryRankV2`)
   - 5-factor scoring system (total: 100 points)
   - Risk dampening multiplier for problematic users
   - Real-time score calculation on discovery requests

3. **Daily Rollup** (`dailySignalRollupScheduler`)
   - Runs daily at 3:00 AM UTC
   - Processes active users (last 7 days)
   - Aggregates signals from multiple collections

## Scoring System

### Factor Breakdown

| Factor | Max Points | Description |
|--------|-----------|-------------|
| **Recency** | 25 | How recently the user was active |
| **Distance** | 30 | Geographic proximity (Haversine formula) |
| **Interaction Depth** | 20 | Total messages, likes, views |
| **Reply Latency** | 15 | Average response time to messages |
| **Profile Quality** | 10 | Photos, bio, verification badges |
| **Total** | 100 | Sum of all factors |

### Recency Scoring

- < 1 hour: 25 points (100%)
- < 24 hours: 20 points (80%)
- < 72 hours: 12.5 points (50%)
- < 7 days: 7.5 points (30%)
- 7+ days: 2.5 points (10%)

### Distance Scoring (Haversine)

- < 5 km: 30 points (100%)
- < 20 km: 24 points (80%)
- < 50 km: 15 points (50%)
- < 100 km: 9 points (30%)
- 100+ km: 3 points (10%)

### Interaction Depth

```typescript
score = min(20, (messages * 0.3 + likes * 0.2 + views * 0.05) / 10)
```

### Reply Latency

- < 5 min: 15 points (100%)
- < 30 min: 10.5 points (70%)
- < 2 hours: 6 points (40%)
- 2+ hours: 1.5 points (10%)

### Profile Quality

- 3+ photos: +5 points
- Verified badge: +3 points
- Bio present: +2 points

## Risk Dampening

Problematic behavior reduces the final score:

```typescript
dampening = 1.0
if (blockedByCount > 0) dampening *= 0.9 ^ blockedByCount  // 10% per block
if (reportedCount > 0) dampening *= 0.85 ^ reportedCount   // 15% per report
if (strikeCount > 0) dampening *= 0.7 ^ strikeCount        // 30% per strike
dampening = max(0.1, dampening)  // Floor at 10%

finalScore = rawScore * dampening
```

## Feature Flag

- **Flag Name**: `discovery_rank_v2`
- **Default**: `false`
- **Rollout**: Gradual percentage-based rollout recommended

## API Usage

### Get Discovery Ranking

```typescript
const result = await functions.httpsCallable('getDiscoveryRankV2')({
  latitude: 52.2297,
  longitude: 21.0122,
  limit: 20,
  offset: 0,
});

// Returns:
{
  users: [
    {
      userId: "...",
      displayName: "...",
      photoURL: "...",
      score: 85.5,
      distance: 3.2,
      lastActiveAt: Timestamp,
    },
    // ... more users
  ],
  total: 150
}
```

## Firestore Collections

### `userSignals/{userId}`

```typescript
{
  userId: string,
  lastActiveAt: Timestamp,
  totalMessages: number,
  totalLikes: number,
  totalViews: number,
  avgReplyMinutes: number,
  photoCount: number,
  hasVerifiedBadge: boolean,
  hasBio: boolean,
  blockedByCount: number,
  reportedCount: number,
  strikeCount: number,
  lastUpdatedAt: Timestamp,
}
```

## Scheduled Functions

### `dailySignalRollupScheduler`

- **Schedule**: Every day at 03:00 UTC
- **Region**: europe-west3
- **Timeout**: 540 seconds (9 minutes)
- **Memory**: 1GB
- **Processes**: Active users in last 7 days (max 1000 per run)

## Performance Considerations

1. **Batch Processing**: Daily rollup processes 1000 users per run
2. **Index Requirements**: Composite index on `users` collection for active user queries
3. **Query Limits**: Discovery API returns max 50 results per call
4. **Caching**: Consider implementing Redis cache for frequently accessed profiles

## Testing

See `functions/src/recommender.test.ts` for comprehensive unit tests covering:
- Recency score calculation
- Haversine distance formula
- Interaction depth scoring
- Reply latency calculation
- Profile quality scoring
- Risk dampening multiplier
- Signal aggregation

## Migration from v1

Discovery Ranking v1 used a simpler algorithm based only on distance and recency. To migrate:

1. Enable feature flag for test users
2. Monitor ranking quality via A/B test metrics
3. Compare engagement rates (swipes, likes, messages)
4. Gradually increase rollout percentage
5. Full rollout after 2 weeks of stable metrics

## Monitoring

Key metrics to track:
- Average discovery session duration
- Swipe-to-like conversion rate
- Like-to-message conversion rate
- User engagement post-ranking change
- Signal rollup execution time

## Future Enhancements

- Machine learning model for personalized ranking
- Collaborative filtering based on past interactions
- Time-of-day activity patterns
- Compatibility score based on preferences
- A/B testing framework for ranking experiments
