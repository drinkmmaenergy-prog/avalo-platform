import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Feed Ranking Engine for Avalo
 * 
 * Implements intelligent content ranking based on:
 * - Recency
 * - Relationship strength
 * - Engagement metrics
 * - Locality
 * - Subscription tier boost
 * - Risk penalty
 * 
 * From PACK 292 specifications
 */

interface RankingWeights {
  recency: number;
  relationship: number;
  engagement: number;
  locality: number;
  tierBoost: number;
  risk: number;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  recency: 0.35,
  relationship: 0.30,
  engagement: 0.20,
  locality: 0.10,
  tierBoost: 0.03,
  risk: 0.02
};

interface ContentCandidate {
  id: string;
  type: 'POST' | 'REEL';
  authorId: string;
  createdAt: admin.firestore.Timestamp;
  stats: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
  location?: {
    city?: string;
    country?: string;
  };
  nsfwFlag: string;
  visibility: string;
}

interface FeedItem {
  type: 'POST' | 'REEL';
  id: string;
  rankScore: number;
  post?: any;
  reel?: any;
}

/**
 * Generate personalized home feed for user
 */
export const getHomeFeed = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;
  const cursor = data.cursor || null;
  const limit = Math.min(data.limit || 20, 50);

  try {
    // Get user profile and preferences
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const hideNSFW = userData.hideNSFW || false;
    const userLocation = userData.location || {};

    // Get user relationships for ranking
    const relationships = await getUserRelationships(userId);

    // Fetch content candidates
    const candidates = await fetchContentCandidates(
      userId,
      hideNSFW,
      userLocation,
      relationships,
      cursor,
      limit * 3 // Fetch more to rank and filter
    );

    // Rank candidates
    const rankedItems = await rankCandidates(
      candidates,
      userId,
      userLocation,
      relationships
    );

    // Take top N items with some randomness
    const feedItems = applyRandomization(rankedItems, limit);

    // Fetch full content documents
    const items = await hydrateContentItems(feedItems);

    // Generate next cursor
    const nextCursor = items.length >= limit 
      ? items[items.length - 1].id 
      : null;

    return {
      items,
      nextCursor,
      hasMore: items.length >= limit
    };

  } catch (error) {
    console.error('Error generating home feed:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate feed');
  }
});

/**
 * Get user relationships for ranking boost
 */
async function getUserRelationships(userId: string): Promise<{
  matches: Set<string>;
  activeChats: Set<string>;
  followers: Set<string>;
  calendarBookings: Set<string>;
  eventAttendees: Set<string>;
}> {
  const [matches, chats, followers, bookings, events] = await Promise.all([
    // Matches
    db.collection('matches')
      .where('users', 'array-contains', userId)
      .where('status', '==', 'matched')
      .get(),
    
    // Active chats
    db.collection('chatSessions')
      .where('participants', 'array-contains', userId)
      .where('status', '==', 'active')
      .get(),
    
    // Followers (if follow system exists)
    db.collection('follows')
      .where('followerId', '==', userId)
      .get(),
    
    // Calendar bookings
    db.collection('calendarBookings')
      .where('bookerId', '==', userId)
      .where('status', 'in', ['confirmed', 'completed'])
      .get(),
    
    // Event attendees
    db.collection('eventAttendees')
      .where('userId', '==', userId)
      .where('status', '==', 'attending')
      .get()
  ]);

  return {
    matches: new Set(matches.docs.flatMap(doc => 
      doc.data().users.filter((uid: string) => uid !== userId)
    )),
    activeChats: new Set(chats.docs.flatMap(doc =>
      doc.data().participants.filter((uid: string) => uid !== userId)
    )),
    followers: new Set(followers.docs.map(doc => doc.data().followedId)),
    calendarBookings: new Set(bookings.docs.map(doc => doc.data().creatorId)),
    eventAttendees: new Set(events.docs.map(doc => doc.data().creatorId))
  };
}

/**
 * Fetch content candidates for feed
 */
async function fetchContentCandidates(
  userId: string,
  hideNSFW: boolean,
  userLocation: any,
  relationships: any,
  cursor: string | null,
  limit: number
): Promise<ContentCandidate[]> {
  const candidates: ContentCandidate[] = [];
  const now = admin.firestore.Timestamp.now();

  // Fetch posts
  let postsQuery = db.collection('feedPosts')
    .where('deleted', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(limit);

  if (cursor) {
    const cursorDoc = await db.collection('feedPosts').doc(cursor).get();
    if (cursorDoc.exists) {
      postsQuery = postsQuery.startAfter(cursorDoc);
    }
  }

  const posts = await postsQuery.get();

  for (const doc of posts.docs) {
    const post = doc.data();
    
    // Filter by visibility
    if (!canViewContent(userId, post, relationships)) {
      continue;
    }

    // Filter by NSFW preference
    if (hideNSFW && post.media[0]?.nsfwFlag === 'erotic') {
      continue;
    }

    candidates.push({
      id: doc.id,
      type: 'POST',
      authorId: post.authorId,
      createdAt: post.createdAt,
      stats: post.stats,
      location: post.location,
      nsfwFlag: post.media[0]?.nsfwFlag || 'safe',
      visibility: post.visibility
    });
  }

  // Fetch reels
  let reelsQuery = db.collection('reels')
    .where('deleted', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(limit);

  if (cursor) {
    const cursorDoc = await db.collection('reels').doc(cursor).get();
    if (cursorDoc.exists) {
      reelsQuery = reelsQuery.startAfter(cursorDoc);
    }
  }

  const reels = await reelsQuery.get();

  for (const doc of reels.docs) {
    const reel = doc.data();
    
    if (!canViewContent(userId, reel, relationships)) {
      continue;
    }

    if (hideNSFW && reel.media?.nsfwFlag === 'erotic') {
      continue;
    }

    candidates.push({
      id: doc.id,
      type: 'REEL',
      authorId: reel.authorId,
      createdAt: reel.createdAt,
      stats: reel.stats,
      location: reel.location,
      nsfwFlag: reel.media?.nsfwFlag || 'safe',
      visibility: reel.visibility
    });
  }

  return candidates;
}

/**
 * Check if user can view content based on visibility
 */
function canViewContent(userId: string, content: any, relationships: any): boolean {
  if (content.visibility === 'PUBLIC') {
    return true;
  }

  if (content.visibility === 'FOLLOWERS') {
    return relationships.followers.has(content.authorId);
  }

  if (content.visibility === 'MATCHES_ONLY') {
    return relationships.matches.has(content.authorId);
  }

  return false;
}

/**
 * Rank content candidates using scoring algorithm
 */
async function rankCandidates(
  candidates: ContentCandidate[],
  userId: string,
  userLocation: any,
  relationships: any
): Promise<FeedItem[]> {
  const weights = DEFAULT_WEIGHTS;
  const now = Date.now();

  // Get author data for tier boost and risk penalty
  const authorIds = [...new Set(candidates.map(c => c.authorId))];
  const authorsData = await fetchAuthorsData(authorIds);

  const rankedItems: FeedItem[] = [];

  for (const candidate of candidates) {
    const authorData = authorsData[candidate.authorId] || {};

    // Calculate score components
    const recencyScore = calculateRecencyScore(candidate.createdAt, now);
    const relationshipScore = calculateRelationshipScore(
      candidate.authorId,
      relationships
    );
    const engagementScore = calculateEngagementScore(candidate.stats);
    const localityScore = calculateLocalityScore(
      candidate.location,
      userLocation
    );
    const tierBoost = calculateTierBoost(authorData.subscriptionTier);
    const riskPenalty = calculateRiskPenalty(authorData.riskScore);

    // Weighted sum
    const rankScore = 
      weights.recency * recencyScore +
      weights.relationship * relationshipScore +
      weights.engagement * engagementScore +
      weights.locality * localityScore +
      weights.tierBoost * tierBoost -
      weights.risk * riskPenalty;

    rankedItems.push({
      type: candidate.type,
      id: candidate.id,
      rankScore,
      post: candidate.type === 'POST' ? candidate : undefined,
      reel: candidate.type === 'REEL' ? candidate : undefined
    });
  }

  // Sort by rank score descending
  rankedItems.sort((a, b) => b.rankScore - a.rankScore);

  return rankedItems;
}

/**
 * Recency score: exponential decay
 */
function calculateRecencyScore(createdAt: admin.firestore.Timestamp, now: number): number {
  const ageHours = (now - createdAt.toMillis()) / (1000 * 60 * 60);
  
  // Exponential decay: score = e^(-ageHours/24)
  // Content from last 24h has score close to 1
  // After 72h, score is ~0.3
  return Math.exp(-ageHours / 24);
}

/**
 * Relationship score: boost for strong connections
 */
function calculateRelationshipScore(authorId: string, relationships: any): number {
  let score = 0;

  if (relationships.matches.has(authorId)) score += 1.0;
  if (relationships.activeChats.has(authorId)) score += 0.8;
  if (relationships.calendarBookings.has(authorId)) score += 0.6;
  if (relationships.eventAttendees.has(authorId)) score += 0.4;
  if (relationships.followers.has(authorId)) score += 0.3;

  // Normalize to 0-1 range
  return Math.min(score / 2.0, 1.0);
}

/**
 * Engagement score: normalized engagement metrics
 */
function calculateEngagementScore(stats: any): number {
  const { views, likes, comments, shares } = stats;

  // Weighted engagement
  const engagementValue = 
    views * 0.1 +
    likes * 1.0 +
    comments * 2.0 +
    shares * 3.0;

  // Normalize using log scale
  const normalized = Math.log10(engagementValue + 1) / Math.log10(1000);
  
  return Math.min(normalized, 1.0);
}

/**
 * Locality score: boost for same city/region
 */
function calculateLocalityScore(contentLocation: any, userLocation: any): number {
  if (!contentLocation || !userLocation) return 0;

  // Same city: 1.0
  if (contentLocation.city === userLocation.city && userLocation.city) {
    return 1.0;
  }

  // Same country: 0.5
  if (contentLocation.country === userLocation.country && userLocation.country) {
    return 0.5;
  }

  return 0;
}

/**
 * Tier boost: small boost for premium creators
 */
function calculateTierBoost(tier?: string): number {
  switch (tier) {
    case 'vip': return 1.0;
    case 'royal': return 0.7;
    case 'premium': return 0.4;
    default: return 0;
  }
}

/**
 * Risk penalty: reduce score for high-risk users
 */
function calculateRiskPenalty(riskScore?: number): number {
  if (!riskScore) return 0;

  // Linear penalty from 0 to 100 risk score
  return Math.min(riskScore / 100, 1.0);
}

/**
 * Fetch author data for tier boost and risk penalty
 */
async function fetchAuthorsData(authorIds: string[]): Promise<Record<string, any>> {
  const authorsData: Record<string, any> = {};

  // Batch fetch in chunks of 10
  const chunks = [];
  for (let i = 0; i < authorIds.length; i += 10) {
    chunks.push(authorIds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const [users, risks] = await Promise.all([
      Promise.all(chunk.map(id => db.collection('users').doc(id).get())),
      Promise.all(chunk.map(id => db.collection('riskProfiles').doc(id).get()))
    ]);

    chunk.forEach((authorId, index) => {
      const userData = users[index].data();
      const riskData = risks[index].data();

      authorsData[authorId] = {
        subscriptionTier: userData?.subscriptionTier,
        riskScore: riskData?.riskScore || 0
      };
    });
  }

  return authorsData;
}

/**
 * Apply randomization to top K ranked items
 */
function applyRandomization(items: FeedItem[], limit: number): FeedItem[] {
  // Take top 2x limit items
  const topItems = items.slice(0, Math.min(items.length, limit * 2));

  // Shuffle slightly while preserving general ranking
  for (let i = topItems.length - 1; i > 0; i--) {
    // Only swap with items in nearby positions (preserve general order)
    const swapRange = Math.min(5, i);
    const j = i - Math.floor(Math.random() * swapRange);
    [topItems[i], topItems[j]] = [topItems[j], topItems[i]];
  }

  return topItems.slice(0, limit);
}

/**
 * Hydrate content items with full documents
 */
async function hydrateContentItems(items: FeedItem[]): Promise<any[]> {
  const results = [];

  for (const item of items) {
    let doc;
    if (item.type === 'POST') {
      doc = await db.collection('feedPosts').doc(item.id).get();
    } else {
      doc = await db.collection('reels').doc(item.id).get();
    }

    if (doc.exists) {
      results.push({
        type: item.type,
        rankScore: item.rankScore,
        [item.type === 'POST' ? 'post' : 'reel']: {
          id: doc.id,
          ...doc.data()
        }
      });
    }
  }

  return results;
}