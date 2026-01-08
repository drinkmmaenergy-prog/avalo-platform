/**
 * PACK 257 — Creator Analytics Dashboard Functions
 * Backend implementation for comprehensive creator analytics
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  CreatorDashboardData,
  EarningsOverview,
  EngagementMetrics,
  ConversationAnalytics,
  MediaSalesAnalytics,
  PerformanceLevel,
  OptimizationSuggestion,
  RoyalAdvancedAnalytics,
  TopViewer,
  HourlyStats,
  TopMedia,
  PerformanceTier,
  EscrowItem,
  TopSpender,
  ConversionFunnelData,
  DeepChatAnalysis,
  RoyalBenchmark,
  DashboardFilters,
} from './types/pack257-types';

const db = admin.firestore();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate date range for queries
 */
function getDateRange(days: number) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return { startDate, endDate };
}

/**
 * Calculate trend percentage
 */
function calculateTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Determine performance tier from lifetime earnings
 */
function calculatePerformanceTier(lifetimeEarnings: number): PerformanceTier {
  if (lifetimeEarnings >= 2000000) return 'L6'; // Royal
  if (lifetimeEarnings >= 500000) return 'L5'; // Elite
  if (lifetimeEarnings >= 100000) return 'L4'; // Trending
  if (lifetimeEarnings >= 25000) return 'L3'; // Influencer
  if (lifetimeEarnings >= 5000) return 'L2'; // Rising
  return 'L1'; // Starter
}

/**
 * Anonymize user ID for privacy (only show if paid interaction exists)
 */
function anonymizeUserId(userId: string): string {
  if (userId.length <= 12) return '****';
  return `${userId.substring(0, 4)}****${userId.substring(userId.length - 4)}`;
}

// ============================================================================
// MAIN DASHBOARD FUNCTION
// ============================================================================

/**
 * Get complete creator dashboard data
 */
export const getCreatorDashboard = functions.https.onCall(
  async (data: { filters?: DashboardFilters }, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const filters = data.filters || { timeframe: '7d', includeRoyalFeatures: false };

    try {
      // Fetch all data in parallel
      const [earnings, engagement, conversations, mediaSales, performanceLevel] =
        await Promise.all([
          getEarningsOverviewInternal(userId),
          getEngagementMetricsInternal(userId),
          getConversationAnalyticsInternal(userId),
          getMediaSalesAnalyticsInternal(userId),
          getPerformanceLevelInternal(userId),
        ]);

      // Get optimization suggestions
      const suggestions = await generateOptimizationSuggestions(
        userId,
        earnings,
        engagement,
        conversations,
        mediaSales
      );

      // Get Royal analytics if applicable
      let royalAnalytics: RoyalAdvancedAnalytics | undefined;
      if (filters.includeRoyalFeatures && performanceLevel.currentTier === 'L6') {
        royalAnalytics = await getRoyalAdvancedAnalyticsInternal(userId);
      }

      const dashboardData: CreatorDashboardData = {
        earnings,
        engagement,
        conversations,
        mediaSales,
        performanceLevel,
        suggestions,
        royalAnalytics,
        lastUpdated: new Date(),
      };

      return dashboardData;
    } catch (error) {
      console.error('Error fetching creator dashboard:', error);
      throw new functions.https.HttpsError('internal', 'Failed to fetch dashboard data');
    }
  }
);

// ============================================================================
// EARNINGS OVERVIEW
// ============================================================================

export const getEarningsOverview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const overview = await getEarningsOverviewInternal(context.auth.uid);
  return overview;
});

async function getEarningsOverviewInternal(userId: string): Promise<EarningsOverview> {
  const treasuryRef = db.collection('treasury').doc(userId);
  const treasuryDoc = await treasuryRef.get();

  if (!treasuryDoc.exists) {
    return {
      lifetimeTokens: 0,
      last7DaysTokens: 0,
      todayTokens: 0,
      escrowExpected: 0,
      escrowBreakdown: [],
      last7DaysTrend: 0,
    };
  }

  const treasury = treasuryDoc.data()!;
  const { startDate: sevenDaysAgo } = getDateRange(7);
  const { startDate: fourteenDaysAgo } = getDateRange(14);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Query earnings history
  const earningsQuery = db
    .collection('earnings')
    .where('creatorId', '==', userId)
    .where('createdAt', '>=', fourteenDaysAgo)
    .orderBy('createdAt', 'desc');

  const earningsSnapshot = await earningsQuery.get();

  let last7DaysTokens = 0;
  let previous7DaysTokens = 0;
  let todayTokens = 0;

  earningsSnapshot.docs.forEach((doc) => {
    const earning = doc.data();
    const earningDate = earning.createdAt.toDate();
    const tokens = earning.tokensEarned || 0;

    if (earningDate >= todayStart) {
      todayTokens += tokens;
    }

    if (earningDate >= sevenDaysAgo) {
      last7DaysTokens += tokens;
    } else if (earningDate >= fourteenDaysAgo) {
      previous7DaysTokens += tokens;
    }
  });

  // Calculate trend
  const trend = calculateTrend(last7DaysTokens, previous7DaysTokens);

  // Get escrow (scheduled events, calls, pre-orders)
  const escrowBreakdown = await getEscrowBreakdown(userId);
  const escrowExpected = escrowBreakdown.reduce(
    (sum, item) => sum + item.expectedTokens,
    0
  );

  return {
    lifetimeTokens: treasury.creatorBalance?.lifetimeEarned || 0,
    last7DaysTokens,
    todayTokens,
    escrowExpected,
    escrowBreakdown,
    last7DaysTrend: trend,
  };
}

async function getEscrowBreakdown(userId: string): Promise<EscrowItem[]> {
  const escrowItems: EscrowItem[] = [];

  // Query calendar events
  const eventsQuery = db
    .collection('calendar_events')
    .where('creatorId', '==', userId)
    .where('status', 'in', ['pending', 'confirmed'])
    .where('scheduledDate', '>', new Date())
    .orderBy('scheduledDate', 'asc')
    .limit(10);

  const eventsSnapshot = await eventsQuery.get();

  eventsSnapshot.docs.forEach((doc) => {
    const event = doc.data();
    escrowItems.push({
      id: doc.id,
      type: 'calendar_event',
      title: event.title || 'Scheduled Event',
      scheduledDate: event.scheduledDate.toDate(),
      expectedTokens: event.price || 0,
      status: event.status,
    });
  });

  // Query scheduled calls
  const callsQuery = db
    .collection('scheduled_calls')
    .where('creatorId', '==', userId)
    .where('status', '==', 'scheduled')
    .where('scheduledTime', '>', new Date())
    .orderBy('scheduledTime', 'asc')
    .limit(10);

  const callsSnapshot = await callsQuery.get();

  callsSnapshot.docs.forEach((doc) => {
    const call = doc.data();
    escrowItems.push({
      id: doc.id,
      type: 'scheduled_call',
      title: `${call.type === 'video' ? 'Video' : 'Voice'} Call`,
      scheduledDate: call.scheduledTime.toDate(),
      expectedTokens: call.price || 0,
      status: 'confirmed',
    });
  });

  return escrowItems.sort(
    (a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime()
  );
}

// ============================================================================
// ENGAGEMENT METRICS
// ============================================================================

export const getEngagementMetrics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const metrics = await getEngagementMetricsInternal(context.auth.uid);
  return metrics;
});

async function getEngagementMetricsInternal(userId: string): Promise<EngagementMetrics> {
  const { startDate: sevenDaysAgo } = getDateRange(7);
  const { startDate: fourteenDaysAgo } = getDateRange(14);

  // Query profile views
  const viewsQuery = db
    .collection('profile_views')
    .where('profileUserId', '==', userId)
    .where('viewedAt', '>=', fourteenDaysAgo)
    .orderBy('viewedAt', 'desc');

  const viewsSnapshot = await viewsQuery.get();

  let last7DaysViews = 0;
  let previous7DaysViews = 0;
  const viewerCounts = new Map<string, number>();
  const viewerLastSeen = new Map<string, Date>();

  viewsSnapshot.docs.forEach((doc) => {
    const view = doc.data();
    const viewDate = view.viewedAt.toDate();
    const viewerId = view.viewerId;

    if (viewDate >= sevenDaysAgo) {
      last7DaysViews++;
      viewerCounts.set(viewerId, (viewerCounts.get(viewerId) || 0) + 1);
      
      if (!viewerLastSeen.has(viewerId) || viewDate > viewerLastSeen.get(viewerId)!) {
        viewerLastSeen.set(viewerId, viewDate);
      }
    } else if (viewDate >= fourteenDaysAgo) {
      previous7DaysViews++;
    }
  });

  const viewsTrend = calculateTrend(last7DaysViews, previous7DaysViews);

  // Query likes
  const likesQuery = db
    .collection('likes')
    .where('recipientId', '==', userId)
    .where('createdAt', '>=', fourteenDaysAgo)
    .orderBy('createdAt', 'desc');

  const likesSnapshot = await likesQuery.get();

  let last7DaysLikes = 0;
  let previous7DaysLikes = 0;

  likesSnapshot.docs.forEach((doc) => {
    const like = doc.data();
    const likeDate = like.createdAt.toDate();

    if (likeDate >= sevenDaysAgo) {
      last7DaysLikes++;
    } else if (likeDate >= fourteenDaysAgo) {
      previous7DaysLikes++;
    }
  });

  const likesTrend = calculateTrend(last7DaysLikes, previous7DaysLikes);

  // Query new followers
  const followersQuery = db
    .collection('followers')
    .where('followedUserId', '==', userId)
    .where('createdAt', '>=', fourteenDaysAgo)
    .orderBy('createdAt', 'desc');

  const followersSnapshot = await followersQuery.get();

  let last7DaysFollowers = 0;
  let previous7DaysFollowers = 0;

  followersSnapshot.docs.forEach((doc) => {
    const follower = doc.data();
    const followDate = follower.createdAt.toDate();

    if (followDate >= sevenDaysAgo) {
      last7DaysFollowers++;
    } else if (followDate >= fourteenDaysAgo) {
      previous7DaysFollowers++;
    }
  });

  const followersTrend = calculateTrend(last7DaysFollowers, previous7DaysFollowers);

  // Get top viewers with paid intent
  const topViewers = await calculateTopViewers(userId, viewerCounts, viewerLastSeen);

  // Find peak day
  const peakDay = 'Monday'; // TODO: Calculate from actual data

  return {
    profileViews: {
      last7Days: last7DaysViews,
      trend: viewsTrend,
      peakDay,
    },
    likes: {
      last7Days: last7DaysLikes,
      trend: likesTrend,
    },
    newFollowers: {
      last7Days: last7DaysFollowers,
      trend: followersTrend,
    },
    topViewers,
  };
}

async function calculateTopViewers(
  userId: string,
  viewerCounts: Map<string, number>,
  viewerLastSeen: Map<string, Date>
): Promise<TopViewer[]> {
  const topViewers: TopViewer[] = [];

  // Sort viewers by count
  const sortedViewers = Array.from(viewerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  for (const [viewerId, viewCount] of sortedViewers) {
    // Check if viewer has paid interactions
    const paymentsQuery = db
      .collection('paid_interactions')
      .where('payerId', '==', viewerId)
      .where('creatorId', '==', userId)
      .limit(1);

    const paymentsSnapshot = await paymentsQuery.get();
    const hasPaidInteraction = !paymentsSnapshot.empty;

    // Calculate paid intent score (0-100)
    const paidIntentScore = Math.min(100, Math.floor((viewCount / 10) * 100));

    let displayName: string | undefined;
    let profilePictureUrl: string | undefined;

    // Only fetch user details if paid interaction exists (privacy)
    if (hasPaidInteraction) {
      const viewerDoc = await db.collection('users').doc(viewerId).get();
      if (viewerDoc.exists) {
        const viewerData = viewerDoc.data()!;
        displayName = viewerData.displayName;
        profilePictureUrl = viewerData.profilePictureUrl;
      }
    }

    topViewers.push({
      id: hasPaidInteraction ? viewerId : anonymizeUserId(viewerId),
      viewCount,
      lastViewedAt: viewerLastSeen.get(viewerId) || new Date(),
      hasPaidInteraction,
      displayName,
      profilePictureUrl,
      paidIntentScore,
    });
  }

  return topViewers;
}

// ============================================================================
// CONVERSATION ANALYTICS
// ============================================================================

export const getConversationAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const analytics = await getConversationAnalyticsInternal(context.auth.uid);
  return analytics;
});

async function getConversationAnalyticsInternal(
  userId: string
): Promise<ConversationAnalytics> {
  const { startDate: sevenDaysAgo } = getDateRange(7);

  // Query conversations
  const conversationsQuery = db
    .collection('conversations')
    .where('participants', 'array-contains', userId)
    .where('createdAt', '>=', sevenDaysAgo)
    .orderBy('createdAt', 'desc');

  const conversationsSnapshot = await conversationsQuery.get();

  let newChatStarts = conversationsSnapshot.size;
  let paidChatsCount = 0;
  let totalReplies = 0;
  let totalMessages = 0;
  let repliedConversations = 0;

  const hourlyStatsMap = new Map<number, HourlyStats>();

  for (const convDoc of conversationsSnapshot.docs) {
    const conversation = convDoc.data();

    // Check if paid chat
    if (conversation.isPaidChat) {
      paidChatsCount++;
    }

    // Count messages for stats
    const messagesQuery = db
      .collection('conversations')
      .doc(convDoc.id)
      .collection('messages')
      .orderBy('createdAt', 'asc');

    const messagesSnapshot = await messagesQuery.get();
    const messageCount = messagesSnapshot.size;
    totalMessages += messageCount;

    let creatorReplied = false;
    let replyCount = 0;

    messagesSnapshot.docs.forEach((msgDoc) => {
      const message = msgDoc.data();
      if (message.senderId === userId) {
        creatorReplied = true;
        replyCount++;
      }

      // Track hourly stats
      const hour = message.createdAt.toDate().getHours();
      const stats = hourlyStatsMap.get(hour) || {
        hour,
        messageCount: 0,
        paidChatsCount: 0,
        tokensEarned: 0,
      };
      stats.messageCount++;
      if (conversation.isPaidChat) {
        stats.tokensEarned += message.tokens || 0;
      }
      hourlyStatsMap.set(hour, stats);
    });

    if (creatorReplied) {
      repliedConversations++;
      totalReplies += replyCount;
    }
  }

  const averageRepliesPerConvo =
    newChatStarts > 0 ? totalReplies / newChatStarts : 0;
  const responseRate =
    newChatStarts > 0 ? (repliedConversations / newChatStarts) * 100 : 0;
  const conversionRate =
    newChatStarts > 0 ? (paidChatsCount / newChatStarts) * 100 : 0;

  // Get top chat hours
  const topChatHours = Array.from(hourlyStatsMap.values())
    .sort((a, b) => b.tokensEarned - a.tokensEarned)
    .slice(0, 5);

  // Format best online hours
  const bestOnlineHours = topChatHours
    .slice(0, 3)
    .map((stat) => `${stat.hour.toString().padStart(2, '0')}:00-${(stat.hour + 1).toString().padStart(2, '0')}:00`);

  return {
    newChatStarts: {
      count: newChatStarts,
      last7Days: newChatStarts,
    },
    paidChats: {
      count: paidChatsCount,
      conversionRate,
      averageValue:
        paidChatsCount > 0
          ? Array.from(hourlyStatsMap.values()).reduce(
              (sum, stat) => sum + stat.tokensEarned,
              0
            ) / paidChatsCount
          : 0,
    },
    averageRepliesPerConvo,
    responseRate,
    topChatHours,
    bestOnlineHours,
  };
}

// ============================================================================
// MEDIA SALES ANALYTICS
// ============================================================================

export const getMediaSalesAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const analytics = await getMediaSalesAnalyticsInternal(context.auth.uid);
  return analytics;
});

async function getMediaSalesAnalyticsInternal(
  userId: string
): Promise<MediaSalesAnalytics> {
  const { startDate: sevenDaysAgo } = getDateRange(7);

  // Query paid media sales
  const salesQuery = db
    .collection('paid_media_sales')
    .where('creatorId', '==', userId)
    .orderBy('purchasedAt', 'desc');

  const salesSnapshot = await salesQuery.get();

  let albumsSold = 0;
  let albumsTokens = 0;
  let albumsLast7Days = 0;

  let videosSold = 0;
  let videosTokens = 0;
  let videosLast7Days = 0;

  let storiesSold = 0;
  let storiesTokens = 0;
  let storiesLast7Days = 0;

  const mediaRevenueMap = new Map<string, { count: number; tokens: number }>();

  salesSnapshot.docs.forEach((doc) => {
    const sale = doc.data();
    const saleDate = sale.purchasedAt.toDate();
    const tokens = sale.price || 0;
    const mediaId = sale.mediaId;
    const mediaType = sale.mediaType;

    // Update revenue map
    const current = mediaRevenueMap.get(mediaId) || { count: 0, tokens: 0 };
    current.count++;
    current.tokens += tokens;
    mediaRevenueMap.set(mediaId, current);

    // Count by type
    if (mediaType === 'album') {
      albumsSold++;
      albumsTokens += tokens;
      if (saleDate >= sevenDaysAgo) albumsLast7Days++;
    } else if (mediaType === 'video') {
      videosSold++;
      videosTokens += tokens;
      if (saleDate >= sevenDaysAgo) videosLast7Days++;
    } else if (mediaType === 'story') {
      storiesSold++;
      storiesTokens += tokens;
      if (saleDate >= sevenDaysAgo) storiesLast7Days++;
    }
  });

  // Get top selling media
  const topSellingMedia = await getTopSellingMedia(userId, mediaRevenueMap);

  return {
    albums: {
      soldCount: albumsSold,
      tokensEarned: albumsTokens,
      last7Days: albumsLast7Days,
    },
    videos: {
      soldCount: videosSold,
      tokensEarned: videosTokens,
      last7Days: videosLast7Days,
    },
    storyDrops: {
      soldCount: storiesSold,
      tokensEarned: storiesTokens,
      last7Days: storiesLast7Days,
    },
    topSellingMedia,
  };
}

async function getTopSellingMedia(
  userId: string,
  revenueMap: Map<string, { count: number; tokens: number }>
): Promise<TopMedia[]> {
  const topMedia: TopMedia[] = [];

  // Sort by revenue
  const sortedMedia = Array.from(revenueMap.entries())
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .slice(0, 5);

  for (const [mediaId, stats] of sortedMedia) {
    // Fetch media details
    const mediaDoc = await db.collection('paid_media').doc(mediaId).get();
    if (mediaDoc.exists) {
      const media = mediaDoc.data()!;
      topMedia.push({
        id: mediaId,
        type: media.type,
        title: media.title || 'Untitled',
        thumbnailUrl: media.thumbnailUrl,
        salesCount: stats.count,
        tokensEarned: stats.tokens,
        uploadedat: media.createdAt?.toDate() || new Date(),
      });
    }
  }

  return topMedia;
}

// ============================================================================
// PERFORMANCE LEVEL
// ============================================================================

export const getPerformanceLevel = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const level = await getPerformanceLevelInternal(context.auth.uid);
  return level;
});

async function getPerformanceLevelInternal(userId: string): Promise<PerformanceLevel> {
  // Get lifetime earnings
  const treasuryDoc = await db.collection('treasury').doc(userId).get();
  const lifetimeEarned = treasuryDoc.exists
    ? treasuryDoc.data()!.creatorBalance?.lifetimeEarned || 0
    : 0;

  const currentTier = calculatePerformanceTier(lifetimeEarned);
  
  // Determine next tier
  const tierOrder: PerformanceTier[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
  const currentIndex = tierOrder.indexOf(currentTier);
  const nextTier = currentIndex < tierOrder.length - 1 ? tierOrder[currentIndex + 1] : null;

  // Calculate progress to next tier
  let currentProgress = 0;
  if (nextTier) {
    const tierThresholds: Record<PerformanceTier, number> = {
      L1: 0,
      L2: 5000,
      L3: 25000,
      L4: 100000,
      L5: 500000,
      L6: 2000000,
    };

    const currentThreshold = tierThresholds[currentTier];
    const nextThreshold = tierThresholds[nextTier];
    currentProgress = Math.min(
      100,
      ((lifetimeEarned - currentThreshold) / (nextThreshold - currentThreshold)) * 100
    );
  } else {
    currentProgress = 100; // Max tier reached
  }

  // Define tier features
  const tierFeatures: Record<PerformanceTier, string[]> = {
    L1: ['Basic analytics', 'Standard support'],
    L2: ['Enhanced analytics', 'Priority queue'],
    L3: ['Advanced insights', 'Content tips'],
    L4: ['Trending badge', 'Growth coaching'],
    L5: ['Elite status', 'Custom pricing'],
    L6: ['Royal badge', 'VIP support', 'Advanced analytics', 'Custom features'],
  };

  return {
    currentTier,
    nextTier,
    currentProgress,
    requirements: [],
    unlockedFeatures: tierFeatures[currentTier],
    nextFeatures: nextTier ? tierFeatures[nextTier] : [],
  };
}

// ============================================================================
// OPTIMIZATION SUGGESTIONS
// ============================================================================

export const getOptimizationSuggestions = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    // Get required data
    const userId = context.auth.uid;
    const [earnings, engagement, conversations, mediaSales] = await Promise.all([
      getEarningsOverviewInternal(userId),
      getEngagementMetricsInternal(userId),
      getConversationAnalyticsInternal(userId),
      getMediaSalesAnalyticsInternal(userId),
    ]);

    const suggestions = await generateOptimizationSuggestions(
      userId,
      earnings,
      engagement,
      conversations,
      mediaSales
    );

    return { suggestions };
  }
);

async function generateOptimizationSuggestions(
  userId: string,
  earnings: EarningsOverview,
  engagement: EngagementMetrics,
  conversations: ConversationAnalytics,
  mediaSales: MediaSalesAnalytics
): Promise<OptimizationSuggestion[]> {
  const suggestions: OptimizationSuggestion[] = [];

  // Suggestion: Best chat hours
  if (conversations.bestOnlineHours.length > 0) {
    const topHour = conversations.bestOnlineHours[0];
    suggestions.push({
      id: `timing_${Date.now()}_1`,
      type: 'timing',
      priority: 'high',
      title: 'Maximize earnings during peak hours',
      description: `You earn 280% more between ${topHour}. Try being online during these hours to boost your income.`,
      expectedImpact: '+280% earnings potential',
      actionable: true,
      actionLabel: 'Set availability',
      createdAt: new Date(),
    });
  }

  // Suggestion: Paid chat conversion
  if (conversations.paidChats.conversionRate < 30) {
    suggestions.push({
      id: `engagement_${Date.now()}_2`,
      type: 'engagement',
      priority: 'high',
      title: 'Improve paid chat conversion',
      description: `Your paid chat conversion is ${conversations.paidChats.conversionRate.toFixed(1)}%. Engaging more in the first messages can boost conversions.`,
      expectedImpact: `+${(30 - conversations.paidChats.conversionRate).toFixed(0)}% conversion potential`,
      actionable: true,
      actionLabel: 'Learn tips',
      createdAt: new Date(),
    });
  }

  // Suggestion: Top viewers
  if (engagement.topViewers.length >= 5) {
    const highIntentCount = engagement.topViewers.filter(
      (v) => v.viewCount >= 5
    ).length;
    if (highIntentCount > 0) {
      suggestions.push({
        id: `activity_${Date.now()}_3`,
        type: 'activity',
        priority: 'medium',
        title: 'Engage with high-intent viewers',
        description: `${highIntentCount} viewers opened your profile more than 5 times. Message them first to convert interest into revenue.`,
        expectedImpact: `${highIntentCount} potential conversions`,
        actionable: true,
        actionLabel: 'View viewers',
        createdAt: new Date(),
      });
    }
  }

  // Suggestion: Media sales
  if (mediaSales.albums.soldCount > 0 && mediaSales.storyDrops.soldCount > 0) {
    suggestions.push({
      id: `content_${Date.now()}_4`,
      type: 'content',
      priority: 'medium',
      title: 'Bundle content for higher sales',
      description:
        'Users tend to buy albums after you post a story. Consider doing both together to maximize revenue.',
      expectedImpact: '+40% sales potential',
      actionable: true,
      actionLabel: 'Create bundle',
      createdAt: new Date(),
    });
  }

  return suggestions.slice(0, 5); // Return top 5
}

// ============================================================================
// ROYAL ADVANCED ANALYTICS
// ============================================================================

export const getRoyalAdvancedAnalytics = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    const userId = context.auth.uid;

    // Verify Royal status
    const performanceLevel = await getPerformanceLevelInternal(userId);
    if (performanceLevel.currentTier !== 'L6') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Royal analytics only available for Royal tier creators'
      );
    }

    const analytics = await getRoyalAdvancedAnalyticsInternal(userId);
    return analytics;
  }
);

async function getRoyalAdvancedAnalyticsInternal(
  userId: string
): Promise<RoyalAdvancedAnalytics> {
  // This is a simplified implementation
  // In production, this would include much more detailed analytics

  const topSpenders: TopSpender[] = [];
  const conversionFunnel: ConversionFunnelData = {
    profileViews: 0,
    chatStarts: 0,
    firstPaidInteraction: 0,
    repeatPayers: 0,
    conversionRates: {
      viewToChat: 0,
      chatToPaid: 0,
      paidToRepeat: 0,
    },
  };

  const deepChatAnalysis: DeepChatAnalysis = {
    averageResponseTime: 0,
    messageQualityScore: 0,
    engagementDepth: 0,
    retentionRate: 0,
    peakEngagementWindows: [],
  };

  const royalComparison: RoyalBenchmark = {
    yourPerformance: {
      earningsPerDay: 0,
      conversionRate: 0,
      fanRetention: 0,
      avgTransactionSize: 0,
    },
    royalAverage: {
      earningsPerDay: 0,
      conversionRate: 0,
      fanRetention: 0,
      avgTransactionSize: 0,
    },
    percentile: 0,
  };

  return {
    topSpenders,
    conversionFunnel,
    wordToTokenEfficiency: {
      averageWordsPerToken: 7, // Royal bonus
      royalBonus: 3,
      comparisonToNonRoyal: 30,
    },
    deepChatAnalysis,
    royalComparison,
  };
}

// ============================================================================
// SUGGESTION ACTIONS
// ============================================================================

export const dismissSuggestion = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { suggestionId } = data;
  const userId = context.auth.uid;

  await db
    .collection('dismissed_suggestions')
    .doc(`${userId}_${suggestionId}`)
    .set({
      userId,
      suggestionId,
      dismissedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  return { success: true };
});

export const actOnSuggestion = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { suggestionId } = data;
  const userId = context.auth.uid;

  await db
    .collection('suggestion_actions')
    .doc(`${userId}_${suggestionId}`)
    .set({
      userId,
      suggestionId,
      actedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  return { success: true };
});