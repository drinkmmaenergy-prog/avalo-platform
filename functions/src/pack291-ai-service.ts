/**
 * PACK 291 — AI Service (Claude Sonnet 4.5 Integration)
 * Generates insights using Claude AI based on creator data
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  AIInputData,
  ClaudePrompt,
  ClaudeResponse,
  DailySummaryInsight,
  WeeklyOptimization,
  ContentRecommendation,
  ChatOptimizationSuggestion,
  CalendarInsight,
  EventInsight,
  ProfileHealthScore,
  PricingRecommendation,
  PostingTimeRecommendation,
  AI_ASSIST_CONSTANTS,
  DEFAULT_SAFETY_CONSTRAINTS,
  sanitizeAIResponse,
  formatTimeRange,
} from './types/pack291-ai-assist.types';

const db = getFirestore();

// Initialize Anthropic client (use environment variable for API key)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// ============================================================================
// CORE AI GENERATION
// ============================================================================

/**
 * Generate AI response using Claude Sonnet 4.5
 */
async function generateAIResponse(prompt: ClaudePrompt): Promise<ClaudeResponse> {
  try {
    const response = await anthropic.messages.create({
      model: AI_ASSIST_CONSTANTS.CLAUDE_MODEL,
      max_tokens: prompt.maxTokens,
      temperature: prompt.temperature,
      system: prompt.system,
      messages: [
        {
          role: 'user',
          content: prompt.user,
        },
      ],
    });

    const content = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    return {
      content,
      model: response.model,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      cached: false,
    };
  } catch (error) {
    logger.error('Error generating AI response:', error);
    throw new Error('Failed to generate AI insights');
  }
}

/**
 * Get cached AI response if available
 */
async function getCachedResponse(
  userId: string,
  type: string,
  cacheKey: string
): Promise<ClaudeResponse | null> {
  const docId = `${userId}_${type}_${cacheKey}`;
  const doc = await db.collection('aiAssistCache').doc(docId).get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  const expiresAt = data.expiresAt?.toDate();

  if (expiresAt && expiresAt < new Date()) {
    // Cache expired
    await db.collection('aiAssistCache').doc(docId).delete();
    return null;
  }

  return {
    content: data.content,
    model: data.model,
    tokensUsed: data.tokensUsed,
    cached: true,
  };
}

/**
 * Cache AI response for future use
 */
async function cacheResponse(
  userId: string,
  type: string,
  cacheKey: string,
  response: ClaudeResponse
): Promise<void> {
  const docId = `${userId}_${type}_${cacheKey}`;
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + AI_ASSIST_CONSTANTS.CACHE_TTL_HOURS);

  await db.collection('aiAssistCache').doc(docId).set({
    userId,
    type,
    content: response.content,
    model: response.model,
    tokensUsed: response.tokensUsed,
    generatedAt: Timestamp.now(),
    expiresAt: Timestamp.fromDate(expiresAt),
  });
}

// ============================================================================
// DAILY INSIGHTS
// ============================================================================

/**
 * Generate daily summary insights
 */
export async function generateDailySummary(
  data: AIInputData
): Promise<DailySummaryInsight> {
  const cacheKey = data.timeRange.to.split('T')[0];
  const cached = await getCachedResponse(data.userId, 'daily_summary', cacheKey);

  let response: ClaudeResponse;

  if (cached) {
    response = cached;
    logger.info(`Using cached daily summary for user ${data.userId}`);
  } else {
    const systemPrompt = `You are an AI assistant helping creators optimize their earnings on Avalo.
You provide concise, actionable insights based on performance data.

SAFETY RULES (CRITICAL):
- Never suggest NSFW or sexual content
- Never comment on physical appearance
- Focus only on metrics, timing, and engagement patterns
- Keep all suggestions professional and platform-compliant
- Maximum ${AI_ASSIST_CONSTANTS.MAX_INSIGHT_LENGTH} characters

Your insights should be direct, data-driven, and immediately actionable.`;

    const userPrompt = `Analyze this creator's performance for today and provide a brief summary (max 200 chars):

Earnings Today: ${data.earnings.total} tokens (${(data.earnings.total * 0.20).toFixed(2)} PLN)
Trend: ${data.earnings.trend > 0 ? '+' : ''}${data.earnings.trend.toFixed(1)}%
Profile Views: ${data.activity.profileViews}
Paid Chats: ${data.activity.paidChats}
Paid Calls: ${data.activity.paidCalls}
Unique Payers: ${data.engagement.uniquePayers} (${data.engagement.newPayers} new, ${data.engagement.returningPayers} returning)

Earnings by Feature:
- Chat: ${data.earnings.byFeature.CHAT} tokens
- Calls: ${data.earnings.byFeature.CALL} tokens
- Calendar: ${data.earnings.byFeature.CALENDAR} tokens
- Events: ${data.earnings.byFeature.EVENT} tokens

Provide a single-sentence summary highlighting the key insight.`;

    const prompt: ClaudePrompt = {
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 500,
      temperature: 0.7,
    };

    response = await generateAIResponse(prompt);
    await cacheResponse(data.userId, 'daily_summary', cacheKey, response);
  }

  // Parse response and create structured insight
  const summary = sanitizeAIResponse(response.content);

  // Determine highlights
  const highlights: DailySummaryInsight['highlights'] = [
    {
      metric: 'Earnings',
      value: `${data.earnings.total} tokens`,
      change: data.earnings.trend,
      trend: data.earnings.trend > 5 ? 'UP' : data.earnings.trend < -5 ? 'DOWN' : 'STABLE',
    },
    {
      metric: 'Profile Views',
      value: data.activity.profileViews,
      trend: 'STABLE',
    },
    {
      metric: 'Unique Payers',
      value: data.engagement.uniquePayers,
      trend: 'STABLE',
    },
  ];

  // Determine top performing feature
  const featuresArray = Object.entries(data.earnings.byFeature)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a);

  const topPerformingFeature = featuresArray.length > 0 
    ? featuresArray[0][0] 
    : 'None';

  return {
    date: data.timeRange.to.split('T')[0],
    highlights,
    topPerformingFeature,
    earningsToday: data.earnings.total,
    earningsTodayPLN: data.earnings.total * 0.20,
    profileViews: data.activity.profileViews,
    newPayers: data.engagement.newPayers,
    summary,
  };
}

// ============================================================================
// WEEKLY OPTIMIZATION
// ============================================================================

/**
 * Generate weekly optimization tips
 */
export async function generateWeeklyOptimization(
  data: AIInputData
): Promise<WeeklyOptimization> {
  const cacheKey = `week_${data.timeRange.from.split('T')[0]}`;
  const cached = await getCachedResponse(data.userId, 'weekly_optimization', cacheKey);

  let response: ClaudeResponse;

  if (cached) {
    response = cached;
  } else {
    const systemPrompt = `You are an AI optimization coach for creators on Avalo.
Provide 3-5 specific, actionable tips to improve earnings based on data patterns.

SAFETY RULES:
- No NSFW suggestions
- No appearance comments
- Focus on timing, engagement, and structural improvements
- Keep tips under 150 chars each

Format as JSON array of tips with category, tip, impact (HIGH/MEDIUM/LOW), and basedOn.`;

    const userPrompt = `Analyze this creator's weekly performance and provide optimization tips:

Total Earnings: ${data.earnings.total} tokens
Best Performing Feature: ${Object.entries(data.earnings.byFeature).sort(([,a],[,b]) => b-a)[0]?.[0] || 'None'}
Peak Activity Hours: ${data.timing.peakActivityHours.map(h => formatTimeRange(h)).join(', ')}
Best Posting Hours: ${data.timing.bestPostingHours.map(h => formatTimeRange(h)).join(', ')}
Most Successful Days: ${data.timing.mostSuccessfulDays.join(', ')}
Avg Response Time: ${data.engagement.averageResponseTime.toFixed(1)} minutes
Conversion Rate: ${data.engagement.conversionRate.toFixed(1)}%
Returning Payers: ${data.engagement.returningPayers}/${data.engagement.uniquePayers}

Generate 3-5 specific tips as JSON array.`;

    const prompt: ClaudePrompt = {
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 1000,
      temperature: 0.7,
    };

    response = await generateAIResponse(prompt);
    await cacheResponse(data.userId, 'weekly_optimization', cacheKey, response);
  }

  // Parse JSON response
  let tips: WeeklyOptimization['tips'] = [];
  try {
    const parsed = JSON.parse(response.content);
    tips = parsed.map((t: any) => ({
      category: t.category || 'General',
      tip: sanitizeAIResponse(t.tip),
      impact: t.impact || 'MEDIUM',
      basedOn: t.basedOn || 'Performance data',
    }));
  } catch (error) {
    logger.error('Failed to parse weekly tips JSON:', error);
    // Provide fallback tips
    tips = [
      {
        category: 'Timing',
        tip: `Post during ${data.timing.bestPostingHours[0] ? formatTimeRange(data.timing.bestPostingHours[0]) : '20:00-21:00'} for best results`,
        impact: 'HIGH',
        basedOn: 'Historical earning patterns',
      },
      {
        category: 'Engagement',
        tip: 'Faster response times increase conversion',
        impact: 'MEDIUM',
        basedOn: 'Response time analysis',
      },
    ];
  }

  const weekStart = data.timeRange.from.split('T')[0];
  const weekEnd = data.timeRange.to.split('T')[0];

  return {
    weekStart,
    weekEnd,
    tips,
    bestPostingTimes: data.timing.bestPostingHours.map(h => formatTimeRange(h)),
    peakChatHours: data.timing.peakActivityHours.map(h => formatTimeRange(h)),
    performanceSummary: `You earned ${data.earnings.total} tokens this week. Focus on ${data.timing.mostSuccessfulDays[0] || 'weekends'} for optimal performance.`,
  };
}

// ============================================================================
// CONTENT RECOMMENDATIONS
// ============================================================================

/**
 * Generate content and posting time recommendations
 */
export async function generateContentRecommendations(
  data: AIInputData
): Promise<{ recommendations: ContentRecommendation[]; postingTime: PostingTimeRecommendation }> {
  const recommendations: ContentRecommendation[] = [
    {
      type: 'PHOTO',
      suggestion: 'Post photos with clear facial expressions',
      reasoning: 'Photos with faces have 40% higher engagement',
      expectedImpact: 'Increased profile visits and chat initiations',
    },
    {
      type: 'TEXT',
      suggestion: 'Post after adding new content',
      reasoning: 'Activity boosts visibility in discovery',
      expectedImpact: 'More profile views and potential payers',
      bestTime: data.timing.bestPostingHours[0] ? formatTimeRange(data.timing.bestPostingHours[0]).split('–')[0] : '20:00',
    },
  ];

  const postingTime: PostingTimeRecommendation = {
    bestTime: data.timing.bestPostingHours[0] ? formatTimeRange(data.timing.bestPostingHours[0]).split('–')[0] : '20:00',
    bestDays: data.timing.mostSuccessfulDays,
    reasoning: 'Based on your historical conversion patterns',
    basedOnData: {
      visitorActivity: true,
      pastPerformance: true,
      regionalPatterns: false,
    },
  };

  return { recommendations, postingTime };
}

// ============================================================================
// CHAT OPTIMIZATION
// ============================================================================

/**
 * Generate chat optimization suggestions
 */
export async function generateChatOptimization(
  data: AIInputData
): Promise<ChatOptimizationSuggestion[]> {
  const suggestions: ChatOptimizationSuggestion[] = [];

  // Response time optimization
  if (data.engagement.averageResponseTime > 3) {
    suggestions.push({
      area: 'RESPONSE_TIME',
      current: `${data.engagement.averageResponseTime.toFixed(1)} minutes`,
      target: '< 2 minutes',
      suggestion: 'Faster replies increase paid chat conversion by up to 35%',
      impact: 'HIGH',
    });
  }

  // Conversion optimization
  if (data.engagement.conversionRate < 5) {
    suggestions.push({
      area: 'CONVERSION',
      current: `${data.engagement.conversionRate.toFixed(1)}%`,
      target: '> 5%',
      suggestion: 'Consider sending personalized voice notes to increase engagement',
      impact: 'MEDIUM',
    });
  }

  // Retention optimization
  const retentionRate = data.engagement.uniquePayers > 0
    ? (data.engagement.returningPayers / data.engagement.uniquePayers) * 100
    : 0;

  if (retentionRate < 30) {
    suggestions.push({
      area: 'RETENTION',
      current: `${retentionRate.toFixed(0)}%`,
      target: '> 30%',
      suggestion: 'Follow up with past payers to re-engage them',
      impact: 'MEDIUM',
    });
  }

  return suggestions;
}

// ============================================================================
// CALENDAR & EVENT OPTIMIZATION
// ============================================================================

/**
 * Generate calendar optimization insights
 */
export async function generateCalendarOptimization(
  data: AIInputData
): Promise<CalendarInsight> {
  const mostBookedHours = data.timing.peakActivityHours.map(h => formatTimeRange(h));

  return {
    mostBookedHours,
    cancellationRate: 0,  // Would need booking cancellation data
    highCancellationSlots: [],
    recommendations: [
      `Your most booked hours are ${mostBookedHours.join(', ')}`,
      'Consider focusing availability during peak hours',
      'Add buffer time between bookings to reduce stress',
    ],
  };
}

/**
 * Generate event optimization insights
 */
export async function generateEventOptimization(
  data: AIInputData
): Promise<EventInsight> {
  return {
    bestEventTimes: data.timing.peakActivityHours.map(h => formatTimeRange(h)),
    bestLocations: [],  // Would need location data
    averageAttendance: data.activity.eventTickets,
    conversionRate: data.engagement.conversionRate,
    recommendations: [
      'Evening events have higher attendance rates',
      'Central locations improve turnout by 2-3x',
      'Promote events 48 hours in advance for best results',
    ],
  };
}

// ============================================================================
// PRICING RECOMMENDATIONS
// ============================================================================

/**
 * Generate pricing recommendations (READ-ONLY suggestions, never modifies prices)
 */
export async function generatePricingRecommendations(
  data: AIInputData
): Promise<PricingRecommendation[]> {
  const recommendations: PricingRecommendation[] = [];

  // Only suggest if creator has good performance
  if (data.earnings.total > 0 && data.engagement.conversionRate > 3) {
    if (data.earnings.byFeature.CALL > 0) {
      recommendations.push({
        feature: 'CALL',
        reasoning: 'Your call conversion rate suggests room for price optimization',
        expectedImpact: 'Potential 10-15% earnings increase with adjusted pricing',
        confidence: 'MEDIUM',
      });
    }
  }

  // Note: This is READ-ONLY. Never modifies actual prices.
  return recommendations;
}

// ============================================================================
// PROFILE HEALTH SCORE
// ============================================================================

/**
 * Calculate profile health score
 */
export async function generateProfileHealth(
  data: AIInputData
): Promise<ProfileHealthScore> {
  const photoQuality = data.profile.hasVerifiedPhotos ? 100 : 
    data.profile.photoCount >= 3 ? 70 :
    data.profile.photoCount > 0 ? 40 : 0;

  const activityLevel = data.activity.contentPosts > 5 ? 100 :
    data.activity.contentPosts > 2 ? 70 :
    data.activity.contentPosts > 0 ? 40 : 20;

  const responseRate = data.engagement.averageResponseTime < 2 ? 100 :
    data.engagement.averageResponseTime < 5 ? 70 :
    data.engagement.averageResponseTime < 10 ? 40 : 20;

  const verificationStatus = data.profile.hasVerifiedPhotos ? 100 : 0;

  const earningPotential = data.profile.completionScore;

  const overall = Math.round(
    (photoQuality + activityLevel + responseRate + verificationStatus + earningPotential) / 5
  );

  const suggestions: string[] = [];
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (photoQuality < 70) {
    suggestions.push('Add 2-3 more photos showing your face clearly');
    weaknesses.push('Low photo count');
  } else {
    strengths.push('Good photo profile');
  }

  if (!data.profile.hasVerifiedPhotos) {
    suggestions.push('Verify your photos to increase trust and conversion');
    weaknesses.push('Unverified profile');
  } else {
    strengths.push('Verified profile');
  }

  if (responseRate < 70) {
    suggestions.push('Improve response time to under 2 minutes');
    weaknesses.push('Slow response time');
  } else {
    strengths.push('Fast response time');
  }

  if (activityLevel < 70) {
    suggestions.push('Post content regularly to stay visible');
    weaknesses.push('Low activity');
  } else {
    strengths.push('Active presence');
  }

  return {
    overall,
    components: {
      photoQuality,
      activityLevel,
      responseRate,
      verificationStatus,
      earningPotential,
    },
    suggestions,
    strengths,
    weaknesses,
  };
}