# PACK 323 - Feed Core Engine Quick Reference

## Collections

### feedPosts
- Photos/text posts with up to 10 media files
- Fields: `ownerUserId`, `mediaUrls[]`, `caption`, `visibility`, `allowComments`, `isDeleted`, `safetyFlags{}`

### feedReels  
- Short videos (1-180 seconds)
- Fields: `ownerUserId`, `videoUrl`, `thumbnailUrl`, `caption`, `durationSec`, `aspectRatio`

### feedStories
- 24-hour ephemeral content
- Fields: `ownerUserId`, `mediaUrl`, `caption`, `expiresAt`, `isDeleted`

### feedLikes
- Like tracking
- Fields: `userId`, `contentId`, `contentType`, `createdAt`

### feedViews
- View tracking  
- Fields: `userId`, `contentId`, `contentType`, `createdAt`, `durationSec`

### feedComments
- Text comments (max 2000 chars)
- Fields: `userId`, `contentId`, `contentType`, `text`, `isDeleted`, `parentCommentId`

### feedAggregates
- Counter cache
- Fields: `contentId`, `contentType`, `likes`, `comments`, `views`, `shares`

## Cloud Functions

```typescript
// Create post
pack323_createFeedPost({ mediaUrls, caption, visibility, location })

// Create reel  
pack323_createFeedReel({ videoUrl, thumbnailUrl, caption, durationSec })

// Create story
pack323_createFeedStory({ mediaUrl, caption })

// Like/unlike (toggle)
pack323_likeContent({ contentId, contentType })

// Add comment
pack323_addComment({ contentId, contentType, text })

// Report content
pack323_reportContent({ contentId, contentType, reason, details })

// Scheduled: Story cleanup (runs hourly)
pack323_storyExpiryJob()
```

## Mobile Screens

```typescript
// Main feed
import FeedHomeScreen from './screens/feed/FeedHomeScreen';

// Post viewer
import FeedPostViewerScreen from './screens/feed/FeedPostViewerScreen';

// Reel player
import FeedReelViewerScreen from './screens/feed/FeedReelViewerScreen';

// Story carousel
import FeedStoryViewerScreen from './screens/feed/FeedStoryViewerScreen';
```

## Web Routes

```
/feed                   - Main feed page
/feed/post/[id]        - Single post viewer
/feed/reel/[id]        - Reel player
```

## Security Rules Summary

- Read: Public content visible to authenticated users
- Write: Owner-only for creation/deletion
- Likes: User can only manage own likes
- Comments: User can only create own comments
- Aggregates: Cloud Functions only

## Safety Checks

### Content Creation
- NSFW keyword detection
- Violence keyword detection  
- Spam keyword detection
- Automatic moderation case creation for violations

### Comment Safety
- Excessive caps (>50%)
- Repeated characters (10+)
- URL blocking
- Harassment detection

## Report Reasons

- `spam`
- `harassment`
- `nudity`
- `violence`
- `hate_speech`
- `false_information`
- `scam`
- `other`

## Business Rules

### ❌ FORBIDDEN
- NO wallet operations
- NO tokenomics changes
- NO tipping/paid boosts
- NO payout modifications

### ✅ ALLOWED
- Pure social content
- Engagement tracking
- Safety filtering
- Moderation integration

## Quick Deploy

```bash
# Rules + Indexes
firebase deploy --only firestore:rules,firestore:indexes

# Functions
firebase deploy --only functions:pack323_createFeedPost,functions:pack323_createFeedReel,functions:pack323_createFeedStory,functions:pack323_likeContent,functions:pack323_addComment,functions:pack323_reportContent,functions:pack323_storyExpiryJob

# Web
cd app-web && npm run build && firebase deploy --only hosting:web
```

## Common Queries

```typescript
// Get public posts
query(collection(db, 'feedPosts'),
  where('visibility', '==', 'PUBLIC'),
  where('isDeleted', '==', false),
  orderBy('createdAt', 'desc'),
  limit(20)
)

// Get active stories
query(collection(db, 'feedStories'),
  where('isDeleted', '==', false),
  where('expiresAt', '>', Timestamp.now()),
  orderBy('expiresAt', 'asc')
)

// Get comments for content
query(collection(db, 'feedComments'),
  where('contentId', '==', contentId),
  where('isDeleted', '==', false),
  orderBy('createdAt', 'asc')
)
```

## Troubleshooting

### Issue: Stories not expiring
- Check `pack323_storyExpiryJob` is scheduled
- Verify scheduler permissions
- Check logs for batch errors

### Issue: Likes not updating
- Check aggregate counters in `feedAggregates`
- Verify Cloud Function execution
- Check security rules

### Issue: Comments blocked
- Review safety check logic
- Check for excessive caps/spam patterns
- Verify allowComments flag

### Issue: Media not loading
- Verify Firebase Storage rules
- Check CORS configuration
- Validate media URLs

## Limits & Constraints

- Posts: Max 10 media files, 5000 char caption
- Reels: 1-180 seconds, 9:16 aspect ratio
- Stories: 24-hour expiration
- Comments: Max 2000 characters
- Safety: Auto-blocked if NSFW/violence detected

---

For detailed implementation, see [`PACK_323_FEED_CORE_ENGINE_IMPLEMENTATION.md`](PACK_323_FEED_CORE_ENGINE_IMPLEMENTATION.md)