/**
 * PACK 101 — Creator Success Toolkit Engine
 * Suggestion generation and scorecard calculation logic
 */

import { db, serverTimestamp, generateId } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  SuccessSuggestion,
  SuccessScorecard,
  CreatorSuccessSignals,
  SuggestionCategory,
  SuggestionPriority,
} from './pack101-success-types';
import { logTechEvent } from './pack90-logging';
import { processSuccessNotifications } from './pack101-success-notifications';

// ============================================================================
// SCORECARD CALCULATION
// ============================================================================

/**
 * Calculate profile quality score (0-100)
 * Based on profile completeness
 */
async function calculateProfileQuality(userId: string): Promise<number> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return 0;
    
    const userData = userDoc.data();
    let score = 0;
    
    // Photos (30 points max)
    const photoCount = userData?.photos?.length || 0;
    score += Math.min(photoCount * 7.5, 30);
    
    // Bio (20 points)
    if (userData?.bio && userData.bio.length > 20) score += 20;
    else if (userData?.bio && userData.bio.length > 0) score += 10;
    
    // Interests (20 points)
    const interestCount = userData?.interests?.length || 0;
    score += Math.min(interestCount * 4, 20);
    
    // Description/About (15 points)
    if (userData?.description && userData.description.length > 50) score += 15;
    else if (userData?.description && userData.description.length > 0) score += 7;
    
    // Profile verified (15 points)
    if (userData?.verified) score += 15;
    
    return Math.min(Math.round(score), 100);
  } catch (error) {
    logger.error('Error calculating profile quality', { userId, error });
    return 0;
  }
}

/**
 * Calculate activity score (0-100)
 * Based on recent logins and content posts
 */
async function calculateActivity(userId: string): Promise<number> {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Check login activity
    const userDoc = await db.collection('users').doc(userId).get();
    const lastLoginAt = userDoc.data()?.lastLoginAt?.toDate();
    
    let score = 0;
    
    // Login recency (40 points)
    if (lastLoginAt) {
      const daysSinceLogin = Math.floor((now.getTime() - lastLoginAt.getTime()) / (24 * 60 * 60 * 1000));
      if (daysSinceLogin === 0) score += 40;
      else if (daysSinceLogin === 1) score += 30;
      else if (daysSinceLogin <= 3) score += 20;
      else if (daysSinceLogin <= 7) score += 10;
    }
    
    // Story posts (30 points)
    const storiesSnapshot = await db.collection('premium_stories')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo))
      .get();
    const storyCount = storiesSnapshot.size;
    score += Math.min(storyCount * 10, 30);
    
    // Feed posts (30 points)
    const postsSnapshot = await db.collection('posts')
      .where('userId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo))
      .get();
    const postCount = postsSnapshot.size;
    score += Math.min(postCount * 10, 30);
    
    return Math.min(Math.round(score), 100);
  } catch (error) {
    logger.error('Error calculating activity', { userId, error });
    return 0;
  }
}

/**
 * Calculate consistency score (0-100)
 * Based on weekly activity streak
 */
async function calculateConsistency(userId: string): Promise<number> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const weeklyStreak = userDoc.data()?.weeklyActivityStreak || 0;
    
    // Award points for streak length
    let score = 0;
    if (weeklyStreak >= 12) score = 100; // 3 months
    else if (weeklyStreak >= 8) score = 85; // 2 months
    else if (weeklyStreak >= 4) score = 70; // 1 month
    else if (weeklyStreak >= 2) score = 50; // 2 weeks
    else if (weeklyStreak === 1) score = 30;
    
    return score;
  } catch (error) {
    logger.error('Error calculating consistency', { userId, error });
    return 0;
  }
}

/**
 * Calculate responsiveness score (0-100)
 * Based on average response time to messages
 */
async function calculateResponsiveness(userId: string): Promise<number> {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Get recent conversations where user is creator
    const conversationsSnapshot = await db.collection('conversations')
      .where('creatorId', '==', userId)
      .where('lastMessageAt', '>=', Timestamp.fromDate(sevenDaysAgo))
      .limit(20)
      .get();
    
    if (conversationsSnapshot.empty) return 50; // Neutral score if no data
    
    let totalResponseTime = 0;
    let responseCount = 0;
    
    // Calculate average response time
    // This is a simplified version - in production, track this via message timestamps
    for (const conversationDoc of conversationsSnapshot.docs) {
      const data = conversationDoc.data();
      if (data.avgResponseTimeMinutes) {
        totalResponseTime += data.avgResponseTimeMinutes;
        responseCount++;
      }
    }
    
    if (responseCount === 0) return 50;
    
    const avgResponseMinutes = totalResponseTime / responseCount;
    
    // Score based on response time
    let score = 0;
    if (avgResponseMinutes <= 60) score = 100; // Within 1 hour
    else if (avgResponseMinutes <= 180) score = 80; // Within 3 hours
    else if (avgResponseMinutes <= 360) score = 60; // Within 6 hours
    else if (avgResponseMinutes <= 1440) score = 40; // Within 24 hours
    else score = 20;
    
    return score;
  } catch (error) {
    logger.error('Error calculating responsiveness', { userId, error });
    return 50;
  }
}

/**
 * Calculate content momentum score (0-100)
 * Based on recent unlocks and engagement
 */
async function calculateContentMomentum(userId: string): Promise<number> {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Get recent earnings (proxy for content engagement)
    const earningsSnapshot = await db.collection('earnings_ledger')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo))
      .get();
    
    const unlockCount = earningsSnapshot.size;
    
    let score = 0;
    if (unlockCount >= 50) score = 100;
    else if (unlockCount >= 30) score = 85;
    else if (unlockCount >= 15) score = 70;
    else if (unlockCount >= 7) score = 50;
    else if (unlockCount >= 3) score = 30;
    else if (unlockCount >= 1) score = 15;
    
    return score;
  } catch (error) {
    logger.error('Error calculating content momentum', { userId, error });
    return 0;
  }
}

/**
 * Calculate audience loyalty score (0-100)
 * Based on repeat payers and recurring followers
 */
async function calculateAudienceLoyalty(userId: string): Promise<number> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get earnings from last 30 days
    const earningsSnapshot = await db.collection('earnings_ledger')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo))
      .get();
    
    // Track unique payers and repeat payers
    const payerCounts = new Map<string, number>();
    
    earningsSnapshot.forEach((doc) => {
      const fromUserId = doc.data().fromUserId;
      payerCounts.set(fromUserId, (payerCounts.get(fromUserId) || 0) + 1);
    });
    
    const totalUniquePayers = payerCounts.size;
    const repeatPayers = Array.from(payerCounts.values()).filter(count => count > 1).length;
    
    if (totalUniquePayers === 0) return 0;
    
    const repeatRate = (repeatPayers / totalUniquePayers) * 100;
    
    // Score based on repeat rate and absolute numbers
    let score = repeatRate * 0.6; // 60% weight on repeat rate
    
    // Add bonus for high numbers
    if (repeatPayers >= 10) score += 20;
    else if (repeatPayers >= 5) score += 10;
    else if (repeatPayers >= 2) score += 5;
    
    return Math.min(Math.round(score), 100);
  } catch (error) {
    logger.error('Error calculating audience loyalty', { userId, error });
    return 0;
  }
}

/**
 * Calculate complete scorecard for a user
 */
export async function calculateScorecard(userId: string): Promise<SuccessScorecard> {
  const [
    profileQuality,
    activity,
    consistency,
    responsiveness,
    contentMomentum,
    audienceLoyalty
  ] = await Promise.all([
    calculateProfileQuality(userId),
    calculateActivity(userId),
    calculateConsistency(userId),
    calculateResponsiveness(userId),
    calculateContentMomentum(userId),
    calculateAudienceLoyalty(userId),
  ]);
  
  return {
    profileQuality,
    activity,
    consistency,
    responsiveness,
    contentMomentum,
    audienceLoyalty,
  };
}

// ============================================================================
// SUGGESTION GENERATION
// ============================================================================

/**
 * Generate profile-related suggestions
 */
async function generateProfileSuggestions(
  userId: string,
  scorecard: SuccessScorecard
): Promise<SuccessSuggestion[]> {
  const suggestions: SuccessSuggestion[] = [];
  
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return suggestions;
    
    const userData = userDoc.data();
    const photoCount = userData?.photos?.length || 0;
    const bio = userData?.bio || '';
    const interests = userData?.interests || [];
    
    // Photo suggestions
    if (photoCount === 0) {
      suggestions.push({
        id: 'add_photos',
        category: 'PROFILE',
        title: 'Add profile photos',
        body: 'Users with photos get discovered more often. Add at least 3-4 clear photos to improve visibility.',
        priority: 'HIGH',
        helpArticleSlug: 'profile-photos',
        actionLink: 'avalo://profile/edit/photos',
      });
    } else if (photoCount < 3) {
      suggestions.push({
        id: 'add_more_photos',
        category: 'PROFILE',
        title: 'Add more profile photos',
        body: 'Users with 4+ profile photos get discovered more often. Consider adding clearer profile photos.',
        priority: 'MEDIUM',
        helpArticleSlug: 'profile-photos',
        actionLink: 'avalo://profile/edit/photos',
      });
    }
    
    // Bio suggestions
    if (!bio || bio.length < 20) {
      suggestions.push({
        id: 'complete_bio',
        category: 'PROFILE',
        title: 'Complete your bio',
        body: 'Users with completed bios are more likely to appear in discovery recommendations.',
        priority: 'HIGH',
        helpArticleSlug: 'profile-bio',
        actionLink: 'avalo://profile/edit/bio',
      });
    }
    
    // Interests suggestions
    if (interests.length < 3) {
      suggestions.push({
        id: 'add_interests',
        category: 'PROFILE',
        title: 'Add interests',
        body: 'Adding interests helps you connect with users who share your passions.',
        priority: 'MEDIUM',
        helpArticleSlug: 'profile-interests',
        actionLink: 'avalo://profile/edit/interests',
      });
    }
    
  } catch (error) {
    logger.error('Error generating profile suggestions', { userId, error });
  }
  
  return suggestions;
}

/**
 * Generate content-related suggestions
 */
async function generateContentSuggestions(
  userId: string,
  scorecard: SuccessScorecard
): Promise<SuccessSuggestion[]> {
  const suggestions: SuccessSuggestion[] = [];
  
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Check recent story activity
    const storiesSnapshot = await db.collection('premium_stories')
      .where('creatorId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo))
      .get();
    
    const storyCount = storiesSnapshot.size;
    
    if (storyCount === 0) {
      suggestions.push({
        id: 'post_first_story',
        category: 'CONTENT',
        title: 'Post your first story',
        body: 'Stories help you stay visible and engaged with your audience. Start with a simple introduction.',
        priority: 'HIGH',
        helpArticleSlug: 'creating-stories',
        actionLink: 'avalo://stories/create',
      });
    } else if (storyCount < 2) {
      suggestions.push({
        id: 'post_more_stories',
        category: 'CONTENT',
        title: 'Post more stories consistently',
        body: 'Stories posted consistently (2-4 per week) tend to get higher engagement.',
        priority: 'MEDIUM',
        helpArticleSlug: 'story-strategy',
        actionLink: 'avalo://stories/create',
      });
    }
    
  } catch (error) {
    logger.error('Error generating content suggestions', { userId, error });
  }
  
  return suggestions;
}

/**
 * Generate messaging-related suggestions
 */
async function generateMessagingSuggestions(
  userId: string,
  scorecard: SuccessScorecard
): Promise<SuccessSuggestion[]> {
  const suggestions: SuccessSuggestion[] = [];
  
  try {
    // Low responsiveness score
    if (scorecard.responsiveness < 50) {
      suggestions.push({
        id: 'improve_response_time',
        category: 'MESSAGING',
        title: 'Improve response time',
        body: 'Replies within 1 hour lead to improved relationship building and message continuation.',
        priority: 'HIGH',
        helpArticleSlug: 'response-best-practices',
        actionLink: 'avalo://messages',
      });
    }
    
  } catch (error) {
    logger.error('Error generating messaging suggestions', { userId, error });
  }
  
  return suggestions;
}

/**
 * Generate engagement-related suggestions
 */
async function generateEngagementSuggestions(
  userId: string,
  scorecard: SuccessScorecard
): Promise<SuccessSuggestion[]> {
  const suggestions: SuccessSuggestion[] = [];
  
  try {
    // Low activity score
    if (scorecard.activity < 40) {
      suggestions.push({
        id: 'increase_activity',
        category: 'ENGAGEMENT',
        title: 'Stay active regularly',
        body: 'Regular activity helps maintain visibility. Try logging in daily and engaging with your audience.',
        priority: 'MEDIUM',
        helpArticleSlug: 'creator-activity',
      });
    }
    
    // Low consistency
    if (scorecard.consistency < 30) {
      suggestions.push({
        id: 'build_consistency',
        category: 'ENGAGEMENT',
        title: 'Build a consistent routine',
        body: 'Creators who maintain weekly activity patterns see better long-term engagement.',
        priority: 'MEDIUM',
        helpArticleSlug: 'consistency-tips',
      });
    }
    
  } catch (error) {
    logger.error('Error generating engagement suggestions', { userId, error });
  }
  
  return suggestions;
}

/**
 * Generate audience-related suggestions
 */
async function generateAudienceSuggestions(
  userId: string,
  scorecard: SuccessScorecard
): Promise<SuccessSuggestion[]> {
  const suggestions: SuccessSuggestion[] = [];
  
  try {
    // Good momentum, low loyalty - suggest relationship building
    if (scorecard.contentMomentum > 50 && scorecard.audienceLoyalty < 40) {
      suggestions.push({
        id: 'build_loyalty',
        category: 'AUDIENCE',
        title: 'Focus on relationship building',
        body: 'You have good content momentum. Now focus on building deeper connections with repeat supporters.',
        priority: 'MEDIUM',
        helpArticleSlug: 'audience-retention',
      });
    }
    
    // High loyalty - celebrate
    if (scorecard.audienceLoyalty > 70) {
      suggestions.push({
        id: 'loyal_audience',
        category: 'AUDIENCE',
        title: 'Strong audience loyalty',
        body: 'Great work! You have built a loyal audience with repeat supporters.',
        priority: 'LOW',
        helpArticleSlug: 'audience-growth',
      });
    }
    
  } catch (error) {
    logger.error('Error generating audience suggestions', { userId, error });
  }
  
  return suggestions;
}

/**
 * Generate all suggestions for a user
 */
export async function generateSuggestions(
  userId: string,
  scorecard: SuccessScorecard
): Promise<SuccessSuggestion[]> {
  const [
    profileSuggestions,
    contentSuggestions,
    messagingSuggestions,
    engagementSuggestions,
    audienceSuggestions
  ] = await Promise.all([
    generateProfileSuggestions(userId, scorecard),
    generateContentSuggestions(userId, scorecard),
    generateMessagingSuggestions(userId, scorecard),
    generateEngagementSuggestions(userId, scorecard),
    generateAudienceSuggestions(userId, scorecard),
  ]);
  
  // Combine all suggestions
  const allSuggestions = [
    ...profileSuggestions,
    ...contentSuggestions,
    ...messagingSuggestions,
    ...engagementSuggestions,
    ...audienceSuggestions,
  ];
  
  // Sort by priority (HIGH > MEDIUM > LOW)
  const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  allSuggestions.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
  
  // Limit to top 10 suggestions
  return allSuggestions.slice(0, 10);
}

/**
 * Rebuild creator success signals for a specific user
 */
export async function rebuildSuccessSignalsForUser(userId: string): Promise<void> {
  try {
    logger.info(`[SuccessToolkit] Rebuilding signals for user ${userId}`);
    
    // Calculate scorecard
    const scorecard = await calculateScorecard(userId);
    
    // Generate suggestions
    const suggestions = await generateSuggestions(userId, scorecard);
    
    // Save to Firestore
    const signalsDoc: CreatorSuccessSignals = {
      userId,
      updatedAt: Timestamp.now(),
      scorecard,
      suggestions,
    };
    
    await db.collection('creator_success_signals').doc(userId).set(signalsDoc);
    
    // Process optional notifications (respectsuser opt-in)
    try {
      await processSuccessNotifications(userId, suggestions);
    } catch (notifError) {
      // Non-blocking - don't fail if notifications fail
      logger.warn(`[SuccessToolkit] Failed to process notifications for user ${userId}`, notifError);
    }
    
    // Log success
    await logTechEvent({
      level: 'INFO',
      category: 'JOB',
      functionName: 'rebuildSuccessSignalsForUser',
      message: `Rebuilt success signals for user ${userId}`,
      context: {
        userId,
        suggestionCount: suggestions.length,
        scorecard,
      },
    });
    
    logger.info(`[SuccessToolkit] Successfully rebuilt signals for user ${userId}`);
  } catch (error: any) {
    logger.error(`[SuccessToolkit] Error rebuilding signals for user ${userId}`, error);
    
    await logTechEvent({
      level: 'ERROR',
      category: 'JOB',
      functionName: 'rebuildSuccessSignalsForUser',
      message: `Failed to rebuild success signals: ${error.message}`,
      context: { userId, error: error.message },
    });
    
    throw error;
  }
}