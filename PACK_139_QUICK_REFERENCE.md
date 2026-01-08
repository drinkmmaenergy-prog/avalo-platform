# PACK 139 — Social Clubs Quick Reference

## Overview

Topic-driven social clubs with zero dating/NSFW content, no visibility advantages, and 65/35 revenue split.

---

## Key Rules

### ✅ ALLOWED
- 12 SAFE categories (fitness, wellness, gaming, etc.)
- Topic-based discussions and activities
- Token-gated access (1-5000 tokens)
- Events within clubs
- Moderation by owner/moderators

### ❌ FORBIDDEN
- Dating, romance, or matchmaking clubs
- NSFW, adult, or sexual content
- Beauty contests or appearance ratings
- External payment links
- Escort or companionship services
- Visibility/ranking boosts for members

---

## Club Access Types

| Type | Description | Cost |
|------|-------------|------|
| **FREE_PUBLIC** | Anyone can join | Free |
| **FREE_REQUEST** | Join approval required | Free |
| **TOKEN_GATED** | Payment required | 1-5000 tokens |
| **EXPERT_HOSTED** | Bundled with mentorship | Varies |

---

## API Quick Reference

### Create Club
```typescript
await createClub({
  name: "Fitness Enthusiasts",
  description: "Join us for daily workouts and wellness tips",
  category: ClubCategory.FITNESS_TRAINING,
  accessType: ClubAccessType.FREE_PUBLIC,
  entryTokens: 0,
  isPublic: true,
  tags: ['fitness', 'health', 'community']
});
```

### Join Club
```typescript
await joinClub(clubId);
// Auto-handles payment for token-gated clubs
```

### Post to Club
```typescript
await postToClub({
  clubId,
  type: ClubPostType.TEXT,
  content: "Just completed my workout!"
});
```

### Get Analytics (Owner Only)
```typescript
const analytics = await getClubAnalytics(clubId);
// Returns: memberCount, retentionRate, postsTotal, etc.
// NO personal identities or spender data
```

---

## Revenue Split

```
Entry Fee: 100 tokens
├─ Platform (35%): 35 tokens
└─ Owner (65%): 65 tokens
```

**No Refunds:** Users who leave clubs don't get refunds

---

## Club Roles

| Role | Abilities |
|------|-----------|
| **OWNER** | Full control, revenue recipient |
| **MODERATOR** | Manage posts/users, no revenue |
| **MEMBER** | Post and participate |
| **GUEST** | Preview public clubs only |

---

## Safety Features

### Content Validation
- 60+ blocked NSFW/dating keywords
- Real-time content scanning
- Security rules enforcement
- Integration with Patrol AI

### Anti-Dating/Escort
- Automatic keyword detection
- Category validation
- External link blocking
- Contact info removal

### Moderation
- Ban capabilities
- Post removal
- Moderator assignments
- Integration with PACK 87 enforcement

---

## Categories

1. 💪 **Fitness & Training**
2. 🧘 **Wellness & Mental Health**
3. 📚 **Book & Productivity**
4. 🕉️ **Meditation & Mindfulness**
5. 🗣️ **Language Exchange**
6. 🌍 **Local Travel & Food**
7. 📸 **Photography & Filmmaking**
8. 🏎️ **Motorsports & Automotive**
9. 🎮 **Gaming**
10. 💼 **Entrepreneurship & Business**
11. 💄 **Cosmetics & Premium Beauty**
12. 👗 **Fashion**

---

## Integration

### With PACK 117 (Events)
```typescript
await hostClubEvent({
  clubId,
  title: "Weekly Fitness Meetup",
  description: "Group workout session",
  startTime: "2025-12-01T10:00:00Z",
  endTime: "2025-12-01T12:00:00Z"
});
```

### With PACK 137 (Challenges)
- Post challenge progress to clubs
- Club-specific challenges
- Shared safety infrastructure

### With PACK 136 (Expert Marketplace)
- Expert-hosted clubs
- Bundled mentorship access
- Revenue integration

---

## Analytics (Privacy-First)

### Available Metrics
- ✅ Total member count
- ✅ Retention rate (% active in 30 days)
- ✅ Total posts
- ✅ Posts in last 30 days
- ✅ Event attendance totals
- ✅ Total revenue
- ✅ Average revenue per member

### NOT Available
- ❌ Personal identities
- ❌ Spender lists
- ❌ View tracking
- ❌ Buyer segmentation
- ❌ Ranking comparisons

---

## Common Errors

**"Permission denied"**
- Not a verified creator
- Check `earnFromChat` status

**"NSFW content detected"**
- Review for blocked keywords
- Check category selection

**"Insufficient tokens"**
- User lacks tokens for entry
- Check token balance

**"Club is full"**
- Max members reached
- Try different club

---

## Best Practices

1. **Clear Club Names** - Descriptive, topic-focused
2. **Detailed Rules** - Set expectations early
3. **Active Moderation** - Assign moderators proactively
4. **Regular Events** - Keep members engaged
5. **Safe Content** - Zero tolerance for violations

---

## Deployment

```bash
# 1. Deploy functions
cd functions
firebase deploy --only functions

# 2. Deploy rules
firebase deploy --only firestore:rules

# 3. Deploy indexes
firebase deploy --only firestore:indexes
```

---

## Support

- **Documentation:** [`PACK_139_IMPLEMENTATION_COMPLETE.md`](PACK_139_IMPLEMENTATION_COMPLETE.md:1)
- **Type Definitions:** [`functions/src/types/clubs.types.ts`](functions/src/types/clubs.types.ts:1)
- **Backend Functions:** [`functions/src/clubs.ts`](functions/src/clubs.ts:1)
- **Security Rules:** [`firestore-rules/pack139-clubs-rules.rules`](firestore-rules/pack139-clubs-rules.rules:1)

---

**Version:** 1.0.0  
**Status:** Production-Ready ✅