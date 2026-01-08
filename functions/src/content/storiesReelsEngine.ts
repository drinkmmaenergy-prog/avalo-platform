import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Stories and Reels Feed Engines
 * From PACK 292 specifications
 */

/**
 * Get Stories for home feed
 * Returns active stories from matches, followers, and local region
 */
export const getStoriesFeed = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const hideNSFW = userData.hideNSFW || false;
    const userLocation = userData.location || {};

    // Get user relationships
    const relationships = await getUserRelationships(userId);

    // Fetch active stories
    const now = admin.firestore.Timestamp.now();
    const stories: any[] = [];

    // Query active stories (not expired)
    const storiesQuery = await db.collection('stories')
      .where('deleted', '==', false)
      .where('expiresAt', '>', now)
      .orderBy('expiresAt', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    for (const doc of storiesQuery.docs) {
      const story = doc.data();

      // Check visibility
      if (!canViewStory(userId, story, relationships)) {
        continue;
      }

      // Filter NSFW
      if (hideNSFW && story.media?.nsfwFlag === 'erotic') {
        continue;
      }

      // Calculate priority score
      const priority = calculateStoryPriority(
        story.authorId,
        relationships,
        story.createdAt
      );

      stories.push({
        id: doc.id,
        ...story,
        priority
      });
    }

    // Sort by priority (matches first, then followers, then local)
    stories.sort((a, b) => b.priority - a.priority);

    // Group by author (one story bar per author)
    const storiesByAuthor = new Map<string, any[]>();
    
    for (const story of stories) {
      if (!storiesByAuthor.has(story.authorId)) {
        storiesByAuthor.set(story.authorId, []);
      }
      storiesByAuthor.get(story.authorId)!.push(story);
    }

    // Convert to array of story groups
    const storyGroups = Array.from(storiesByAuthor.entries()).map(([authorId, stories]) => ({
      authorId,
      stories: stories.map(s => ({
        storyId: s.id,
        media: s.media,
        caption: s.caption,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        stats: s.stats,
        linkToProfile: s.linkToProfile
      })),
      unviewed: stories.filter(s => !s.viewedBy?.includes(userId)).length
    }));

    // Fetch author info for each group
    const authorsData = await fetchAuthorsInfo(Array.from(storiesByAuthor.keys()));

    const result = storyGroups.map(group => ({
      ...group,
      author: authorsData[group.authorId]
    }));

    return {
      storyGroups: result,
      total: result.length
    };

  } catch (error) {
    console.error('Error fetching stories feed:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch stories');
  }
});

/**
 * Get Reels feed with pagination
 * Full-screen vertical video stream
 */
export const getReelsFeed = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  const cursor = data.cursor || null;
  const limit = Math.min(data.limit || 20, 50);

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const hideNSFW = userData.hideNSFW || false;
    const userLocation = userData.location || {};

    // Get user relationships
    const relationships = await getUserRelationships(userId);

    // Fetch reels
    let reelsQuery = db.collection('reels')
      .where('deleted', '==', false)
      .orderBy('createdAt', 'desc');

    if (cursor) {
      const cursorDoc = await db.collection('reels').doc(cursor).get();
      if (cursorDoc.exists) {
        reelsQuery = reelsQuery.startAfter(cursorDoc);
      }
    }

    const reelsSnapshot = await reelsQuery.limit(limit * 2).get();

    const reels: any[] = [];

    for (const doc of reelsSnapshot.docs) {
      const reel = doc.data();

      // Check visibility
      if (!canViewContent(userId, reel, relationships)) {
        continue;
      }

      // Filter NSFW
      if (hideNSFW && reel.media?.nsfwFlag === 'erotic') {
        continue;
      }

      // Calculate rank score
      const rankScore = calculateReelScore(reel, relationships, userLocation);

      reels.push({
        reelId: doc.id,
        ...reel,
        rankScore
      });

      if (reels.length >= limit) break;
    }

    // Sort by rank score with some randomness
    reels.sort((a, b) => b.rankScore - a.rankScore);

    // Apply slight shuffle for diversity
    const shuffledReels = applyReelsShuffle(reels);

    // Fetch author info
    const authorIds = shuffledReels.map(r => r.authorId);
    const authorsData = await fetchAuthorsInfo(authorIds);

    const result = shuffledReels.map(reel => ({
      ...reel,
      author: authorsData[reel.authorId]
    }));

    const nextCursor = result.length >= limit
      ? result[result.length - 1].reelId
      : null;

    return {
      reels: result,
      nextCursor,
      hasMore: result.length >= limit
    };

  } catch (error) {
    console.error('Error fetching reels feed:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch reels');
  }
});

/**
 * Mark story as viewed
 */
export const markStoryViewed = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { storyId } = data;
  const userId = context.auth.uid;

  try {
    // Create view record
    const viewId = `${userId}_${storyId}_${Date.now()}`;
    await db.collection('feedViews').doc(viewId).set({
      viewId,
      viewerId: userId,
      targetType: 'STORY',
      targetId: storyId,
      createdAt: admin.firestore.Timestamp.now()
    });

    // Increment story views
    await db.collection('stories').doc(storyId).update({
      'stats.views': admin.firestore.FieldValue.increment(1)
    });

    return { success: true };
  } catch (error) {
    console.error('Error marking story viewed:', error);
    throw new functions.https.HttpsError('internal', 'Failed to mark story as viewed');
  }
});

/**
 * Helper: Get user relationships
 */
async function getUserRelationships(userId: string): Promise<{
  matches: Set<string>;
  activeChats: Set<string>;
  followers: Set<string>;
}> {
  const [matches, chats, followers] = await Promise.all([
    db.collection('matches')
      .where('users', 'array-contains', userId)
      .where('status', '==', 'matched')
      .get(),
    
    db.collection('chatSessions')
      .where('participants', 'array-contains', userId)
      .where('status', '==', 'active')
      .get(),
    
    db.collection('follows')
      .where('followerId', '==', userId)
      .get()
  ]);

  return {
    matches: new Set(matches.docs.flatMap(doc => 
      doc.data().users.filter((uid: string) => uid !== userId)
    )),
    activeChats: new Set(chats.docs.flatMap(doc =>
      doc.data().participants.filter((uid: string) => uid !== userId)
    )),
    followers: new Set(followers.docs.map(doc => doc.data().followedId))
  };
}

/**
 * Check if user can view content
 */
function canViewContent(userId: string, content: any, relationships: any): boolean {
  if (content.visibility === 'PUBLIC') return true;
  if (content.visibility === 'FOLLOWERS') return relationships.followers.has(content.authorId);
  if (content.visibility === 'MATCHES_ONLY') return relationships.matches.has(content.authorId);
  return false;
}

/**
 * Check if user can view story
 */
function canViewStory(userId: string, story: any, relationships: any): boolean {
  return canViewContent(userId, story, relationships);
}

/**
 * Calculate story priority (matches > followers > local > public)
 */
function calculateStoryPriority(
  authorId: string,
  relationships: any,
  createdAt: admin.firestore.Timestamp
): number {
  let priority = 0;

  // Base recency score
  const ageHours = (Date.now() - createdAt.toMillis()) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 24 - ageHours) / 24; // 0-1 over 24 hours

  if (relationships.matches.has(authorId)) {
    priority = 1000 + recencyScore * 100;
  } else if (relationships.activeChats.has(authorId)) {
    priority = 800 + recencyScore * 100;
  } else if (relationships.followers.has(authorId)) {
    priority = 600 + recencyScore * 100;
  } else {
    priority = 400 + recencyScore * 100;
  }

  return priority;
}

/**
 * Calculate reel ranking score
 * Focuses on: completion rate, replays, shares, engagement
 */
function calculateReelScore(
  reel: any,
  relationships: any,
  userLocation: any
): number {
  let score = 0;

  // Recency (35%)
  const ageHours = (Date.now() - reel.createdAt.toMillis()) / (1000 * 60 * 60);
  const recencyScore = Math.exp(-ageHours / 24) * 0.35;
  score += recencyScore;

  // Relationship (25%)
  if (relationships.matches.has(reel.authorId)) {
    score += 0.25;
  } else if (relationships.followers.has(reel.authorId)) {
    score += 0.15;
  }

  // Engagement (30%)
  const { views, likes, comments, shares } = reel.stats;
  const engagementValue = views * 0.1 + likes * 1.0 + comments * 2.0 + shares * 3.0;
  const engagementScore = Math.min(Math.log10(engagementValue + 1) / 3, 1.0) * 0.30;
  score += engagementScore;

  // Locality (10%)
  if (reel.location?.city === userLocation.city && userLocation.city) {
    score += 0.10;
  } else if (reel.location?.country === userLocation.country && userLocation.country) {
    score += 0.05;
  }

  return score;
}

/**
 * Apply shuffle to reels for diversity
 */
function applyReelsShuffle(reels: any[]): any[] {
  const shuffled = [...reels];
  
  // Gentle shuffle: only swap within small windows
  for (let i = shuffled.length - 1; i > 0; i--) {
    const swapRange = Math.min(3, i);
    const j = i - Math.floor(Math.random() * swapRange);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Fetch authors information
 */
async function fetchAuthorsInfo(authorIds: string[]): Promise<Record<string, any>> {
  const authorsData: Record<string, any> = {};

  // Batch fetch in chunks of 10
  const chunks = [];
  for (let i = 0; i < authorIds.length; i += 10) {
    chunks.push(authorIds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const users = await Promise.all(
      chunk.map(id => db.collection('users').doc(id).get())
    );

    chunk.forEach((authorId, index) => {
      const userData = users[index].data();
      if (userData) {
        authorsData[authorId] = {
          userId: authorId,
          displayName: userData.displayName,
          photoURL: userData.photoURL,
          subscriptionTier: userData.subscriptionTier,
          verified: userData.verified || false
        };
      }
    });
  }

  return authorsData;
}