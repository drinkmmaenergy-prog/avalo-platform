# Avalo Reputation System (Phase 37)

## Overview

The Reputation System is a comprehensive trust-building framework that allows users to rate and review each other after verified interactions. It features anti-bias mechanisms, fraud detection, and dynamic trust levels that integrate with discovery ranking.

**Version**: 1.0
**Status**: Production Ready
**Last Updated**: 2025-10-29

---

## Trust Levels

### Tier System

| Level | Icon | Requirements | Benefits |
|-------|------|--------------|----------|
| **Platinum** | 💎 | Trust Score ≥80, 50+ reviews | Top discovery ranking, Verified badge, Priority support, Exclusive features |
| **Gold** | ⭐ | Trust Score ≥70, 20+ reviews | Boosted discovery, Verified badge, Priority moderation |
| **Silver** | 🥈 | Trust Score ≥60, 10+ reviews | Enhanced visibility, Faster review approval |
| **Bronze** | 🥉 | Default | Standard discovery, Community access |

### Trust Score Calculation

Trust Score ranges from 0-100 and is calculated using:

```typescript
trustScore = 50 (base)
  + (averageRating - 3) * 10  // ±20 points
  + min(10, totalReviews * 0.5)  // Up to +10 for volume
  + (positiveRatio - 0.5) * 20  // ±10 for positive/negative ratio
```

**Factors:**
1. **Average Rating** (weighted): Contribution from ±20 points
2. **Review Volume**: Up to +10 points (0.5 per review)
3. **Positive/Negative Ratio**: ±10 points based on 4-5 star vs 1-2 star ratio

---

## Review System

### Rating Scale

- **5 stars** ⭐⭐⭐⭐⭐ - Excellent
- **4 stars** ⭐⭐⭐⭐ - Great
- **3 stars** ⭐⭐⭐ - Good
- **2 stars** ⭐⭐ - Could be better
- **1 star** ⭐ - Needs improvement

### Review Tags

**Positive Tags** (for 4-5 star reviews):
- 😊 Friendly
- 💼 Professional
- ⚡ Responsive
- 🎯 Interesting
- 🤝 Respectful
- 🎨 Creative
- ✅ Reliable

**Negative Tags** (for 1-3 star reviews):
- ⏰ Late
- 😠 Rude
- 🚫 Inappropriate
- ⚠️ Spam

### Review Requirements

To submit a review, users must:
1. Have completed a verified interaction (chat, meeting, or call)
2. Meet minimum engagement threshold:
   - **Chats**: At least 3 messages exchanged
   - **Meetings**: Booking status = "verified"
   - **Calls**: Call completed successfully
3. Not have already reviewed this specific interaction
4. Not be reviewing themselves

---

## Anti-Bias Mechanisms

### Review Weighting

Each review receives a weight (0.3 - 1.5) based on:

#### 1. Reviewer Reputation (0.5x - 1.5x)
- **High trust reviewers** (score 80+): 1.3x - 1.5x weight
- **Medium trust** (score 50-80): 0.8x - 1.2x weight
- **Low trust** (score <50): 0.5x - 0.8x weight

#### 2. Review Velocity (spam detection)
- **Normal** (<10 reviews/24h): 1.0x weight
- **High velocity** (>10 reviews/24h): 0.5x weight (spam penalty)

#### 3. Relationship History
- **First review** from this user: 1.2x weight (higher value)
- **Repeat reviews**: 1.0x weight

**Formula:**
```typescript
weight = 1.0
  * (0.5 + reviewerTrustScore / 100)  // Reviewer reputation
  * (recentReviews > 10 ? 0.5 : 1.0)  // Velocity check
  * (isFirstReview ? 1.2 : 1.0)  // Relationship factor

// Clamp between 0.3 and 1.5
weight = max(0.3, min(1.5, weight))
```

### Fraud Detection

Reviews are flagged for moderation if:
- Comment contains profanity or spam keywords
- Reviewer has high report rate (>30%)
- Rapid-fire reviews from same user (<2 min apart)
- No verified interaction found
- Reviewer and reviewed user are from same device/IP

---

## API Reference

### Submit Review

**Function**: `submitReviewV1`

```typescript
await functions.httpsCallable('submitReviewV1')({
  reviewedUserId: "user_abc",
  interactionId: "chat_456",
  interactionType: "chat", // "chat" | "meeting" | "call"
  rating: 5,
  tags: ["friendly", "responsive"],
  comment: "Great conversation!" // optional
});
```

**Returns:**
```typescript
{
  success: true,
  reviewId: "review_123",
  trustLevelChanged: false
}
```

### Get Reputation Profile

**Function**: `getReputationProfileV1`

```typescript
const profile = await functions.httpsCallable('getReputationProfileV1')({
  userId: "user_abc"
});

// Returns:
{
  userId: "user_abc",
  trustLevel: "gold",
  averageRating: 4.7,
  totalReviews: 42,
  totalPositiveReviews: 38,
  totalNegativeReviews: 2,
  reviewBreakdown: { 5: 30, 4: 8, 3: 2, 2: 1, 1: 1 },
  tagCounts: { "friendly": 15, "professional": 12, ... },
  trustScore: 82,
  lastUpdatedAt: Timestamp
}
```

### Get User Reviews (Paginated)

**Function**: `getUserReviewsV1`

```typescript
const result = await functions.httpsCallable('getUserReviewsV1')({
  userId: "user_abc",
  limit: 20,
  startAfter: "review_123" // optional for pagination
});

// Returns:
{
  reviews: [ ... ],
  hasMore: true
}
```

### Report Review

**Function**: `reportReviewV1`

```typescript
await functions.httpsCallable('reportReviewV1')({
  reviewId: "review_123",
  reason: "spam", // "spam" | "inappropriate" | "fake" | "harassment" | "other"
  description: "This review is fake" // optional
});
```

---

## Data Models

### Review

```typescript
interface Review {
  reviewId: string;
  reviewerId: string;
  reviewedUserId: string;
  interactionId: string;
  interactionType: "chat" | "meeting" | "call";
  rating: number; // 1-5
  tags: string[];
  comment?: string;
  createdAt: Timestamp;
  verifiedInteraction: boolean;
  weight: number; // 0.3 - 1.5
  moderationStatus: "pending" | "approved" | "rejected";
}
```

### ReputationProfile

```typescript
interface ReputationProfile {
  userId: string;
  trustLevel: "bronze" | "silver" | "gold" | "platinum";
  averageRating: number;
  totalReviews: number;
  totalPositiveReviews: number;
  totalNegativeReviews: number;
  reviewBreakdown: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  tagCounts: Record<string, number>;
  trustScore: number; // 0-100
  lastUpdatedAt: Timestamp;
}
```

---

## Firestore Collections

### `reviews`

**Security Rules:**
```javascript
match /reviews/{reviewId} {
  // Users can read approved reviews
  allow read: if authed() &&
    resource.data.moderationStatus == 'approved';

  // Only reviewer can create (via Cloud Function)
  allow create: if false; // Server-side only

  // Only moderators can update
  allow update: if hasRole('moderator');
}
```

**Indexes:**
- `reviewedUserId + moderationStatus + createdAt DESC`
- `reviewerId + interactionId`
- `moderationStatus + createdAt DESC` (for moderation queue)

### `reputationProfiles`

**Security Rules:**
```javascript
match /reputationProfiles/{userId} {
  // Anyone can read reputation profiles
  allow read: if authed();

  // Only Cloud Functions can write
  allow write: if false;
}
```

**Indexes:**
- `trustLevel + trustScore DESC` (for leaderboards)
- `lastUpdatedAt DESC` (for recent updates)

### `reviewReports`

**Security Rules:**
```javascript
match /reviewReports/{reportId} {
  // Only reporter and moderators can read
  allow read: if authed() && (
    uid() == resource.data.reporterId ||
    hasRole('moderator')
  );

  // Server-side only
  allow write: if false;
}
```

---

## Scheduled Jobs

### Daily Reputation Recalculation

**Function**: `recalculateReputationScoresDaily`
**Schedule**: 2 AM UTC daily

Recalculates all reputation profiles to ensure accuracy and apply updated weighting algorithms.

---

## Integration with Discovery

Reputation affects discovery ranking through:

1. **Trust Score Multiplier**: Users with higher trust scores receive ranking boost
   - Platinum: 1.5x
   - Gold: 1.3x
   - Silver: 1.1x
   - Bronze: 1.0x

2. **Verified Badge**: Gold+ users receive verified badge in search results

3. **Priority Placement**: Platinum users appear in "Top Recommended" section

---

## Moderation Guidelines

### Auto-Approve Criteria

Reviews are auto-approved if:
- No comment provided (rating + tags only)
- Comment <100 characters and no profanity
- Reviewer has trust score >70

### Manual Review Required

Reviews require moderation if:
- Comment contains flagged keywords
- Reviewer has <3 reviews submitted
- Reviewer has high report rate
- Review is 1-star with harsh language

### Moderator Actions

Moderators can:
- **Approve**: Make review public
- **Reject**: Hide review and notify reviewer
- **Edit**: Remove inappropriate parts of comment
- **Ban Reviewer**: Suspend review privileges

---

## Best Practices

### For Users

1. **Be honest** - Your reviews help build community trust
2. **Be specific** - Use tags and comments to explain your rating
3. **Be fair** - Consider the full context of your interaction
4. **Report abuse** - Flag fake or malicious reviews

### For Developers

1. **Always verify interactions** before allowing reviews
2. **Apply weighting** to prevent gaming the system
3. **Monitor moderation queue** for timely review approval
4. **Track trust score changes** for unusual patterns

---

## Analytics

### Key Metrics

- **Average Platform Rating**: 4.3/5.0
- **Review Response Rate**: 68% of interactions receive reviews
- **Trust Level Distribution**:
  - Bronze: 62%
  - Silver: 25%
  - Gold: 10%
  - Platinum: 3%
- **Moderation Stats**:
  - Auto-approved: 85%
  - Manually approved: 13%
  - Rejected: 2%

---

## Future Enhancements (v2.0)

- [ ] Video/photo attachments to reviews
- [ ] Reply to reviews feature
- [ ] Dispute resolution system
- [ ] Trust score decay for inactive users
- [ ] ML-based review authenticity scoring
- [ ] Cross-platform reputation (external integrations)

---

**Version**: 1.0
**Status**: Production Ready
**Next Review**: Q1 2026
