/**
 * PACK 245: Audience Classification & VIP Segmenting
 * Creator Dashboard Analytics Integration
 * 
 * Provides creators with aggregated audience insights WITHOUT individual labels
 */

import { db } from './init.js';
import { computeCreatorAudienceAnalytics } from './pack245-audience-segments-engine';
import type { 
  CreatorAudienceAnalytics,
  AudienceSegment,
  BudgetTier,
  IntentType,
  ProximityClass
} from './pack245-audience-segments-types';

// ========================================================================
// Creator Dashboard Endpoints
// ========================================================================

/**
 * Get creator audience analytics with caching
 */
export async function getCreatorAudienceInsights(
  creatorId: string,
  forceRefresh: boolean = false
): Promise<CreatorAudienceAnalytics> {
  // Check cache first
  if (!forceRefresh) {
    const analyticsDoc = await db
      .collection('creator_audience_analytics')
      .doc(creatorId)
      .get();
    
    if (analyticsDoc.exists) {
      const analytics = analyticsDoc.data() as CreatorAudienceAnalytics;
      
      // Check if cache is still fresh (< 24 hours old)
      const now = Date.now();
      const calculatedAt = analytics.calculatedAt.toDate().getTime();
      const age = now - calculatedAt;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (age < maxAge) {
        return analytics;
      }
    }
  }
  
  // Recompute analytics
  return await computeCreatorAudienceAnalytics(creatorId);
}

/**
 * Get audience breakdown by category
 */
export async function getAudienceBreakdown(creatorId: string): Promise<{
  budget: { label: string; count: number; percentage: number }[];
  intent: { label: string; count: number; percentage: number }[];
  proximity: { label: string; count: number; percentage: number }[];
  passion: { label: string; count: number; percentage: number }[];
}> {
  const analytics = await getCreatorAudienceInsights(creatorId);
  
  const totalSize = analytics.totalAudienceSize;
  
  return {
    budget: [
      {
        label: 'Budget-Conscious',
        count: Math.round(totalSize * analytics.budgetDistribution.lowBudget / 100),
        percentage: analytics.budgetDistribution.lowBudget
      },
      {
        label: 'Mid-Range Spenders',
        count: Math.round(totalSize * analytics.budgetDistribution.midBudget / 100),
        percentage: analytics.budgetDistribution.midBudget
      },
      {
        label: 'High Spenders',
        count: Math.round(totalSize * analytics.budgetDistribution.highBudget / 100),
        percentage: analytics.budgetDistribution.highBudget
      }
    ],
    intent: [
      {
        label: 'Chat Enthusiasts',
        count: Math.round(totalSize * analytics.intentDistribution.chatFocused / 100),
        percentage: analytics.intentDistribution.chatFocused
      },
      {
        label: 'Call Lovers',
        count: Math.round(totalSize * analytics.intentDistribution.callFocused / 100),
        percentage: analytics.intentDistribution.callFocused
      },
      {
        label: 'Meeting Seekers',
        count: Math.round(totalSize * analytics.intentDistribution.meetingFocused / 100),
        percentage: analytics.intentDistribution.meetingFocused
      },
      {
        label: 'Event Goers',
        count: Math.round(totalSize * analytics.intentDistribution.eventExplorer / 100),
        percentage: analytics.intentDistribution.eventExplorer
      }
    ],
    proximity: [
      {
        label: 'Local Fans',
        count: Math.round(totalSize * analytics.proximityDistribution.local / 100),
        percentage: analytics.proximityDistribution.local
      },
      {
        label: 'Nearby Audience',
        count: Math.round(totalSize * analytics.proximityDistribution.nearby / 100),
        percentage: analytics.proximityDistribution.nearby
      },
      {
        label: 'Remote Followers',
        count: Math.round(totalSize * analytics.proximityDistribution.remote / 100),
        percentage: analytics.proximityDistribution.remote
      }
    ],
    passion: [
      {
        label: 'Shared Interests',
        count: Math.round(totalSize * analytics.passionDistribution.sharedInterests / 100),
        percentage: analytics.passionDistribution.sharedInterests
      },
      {
        label: 'Visual Appeal',
        count: Math.round(totalSize * analytics.passionDistribution.visualAttraction / 100),
        percentage: analytics.passionDistribution.visualAttraction
      },
      {
        label: 'Loyal Followers',
        count: Math.round(totalSize * analytics.passionDistribution.loyalFollower / 100),
        percentage: analytics.passionDistribution.loyalFollower
      }
    ]
  };
}

/**
 * Get top audience segments (readable descriptions)
 */
export async function getTopAudienceSegments(creatorId: string, limit: number = 5): Promise<{
  rank: number;
  description: string;
  count: number;
  percentage: number;
  avgRevenue: number;
  characteristics: string[];
}[]> {
  const analytics = await getCreatorAudienceInsights(creatorId);
  
  return analytics.topSegments.slice(0, limit).map((segment, index) => {
    const characteristics = [];
    
    // Budget description
    if (segment.budget === 'low') {
      characteristics.push('Budget-conscious');
    } else if (segment.budget === 'mid') {
      characteristics.push('Mid-range spender');
    } else {
      characteristics.push('High spender');
    }
    
    // Intent description
    if (segment.intent === 'chat') {
      characteristics.push('Loves chatting');
    } else if (segment.intent === 'call') {
      characteristics.push('Prefers calls');
    } else if (segment.intent === 'meeting') {
      characteristics.push('Seeks in-person meetings');
    } else {
      characteristics.push('Event enthusiast');
    }
    
    // Proximity description
    if (segment.proximity === 'local') {
      characteristics.push('Lives nearby');
    } else if (segment.proximity === 'nearby') {
      characteristics.push('Within your region');
    } else {
      characteristics.push('Long-distance');
    }
    
    // Build description
    let description = '';
    if (segment.budget === 'high') {
      description = `Premium ${segment.intent} fans`;
    } else if (segment.budget === 'mid') {
      description = `Regular ${segment.intent} enthusiasts`;
    } else {
      description = `Engaged ${segment.intent} audience`;
    }
    
    if (segment.proximity === 'local') {
      description += ' from your area';
    } else if (segment.proximity === 'nearby') {
      description += ' from nearby regions';
    }
    
    return {
      rank: index + 1,
      description,
      count: segment.count,
      percentage: segment.percentage,
      avgRevenue: segment.avgRevenue,
      characteristics
    };
  });
}

/**
 * Get monetization strategy recommendations based on audience
 */
export async function getMonetizationRecommendations(creatorId: string): Promise<{
  primaryStrategy: string;
  reasoning: string;
  tips: string[];
  opportunities: string[];
}> {
  const analytics = await getCreatorAudienceInsights(creatorId);
  
  let primaryStrategy = '';
  let reasoning = '';
  const tips: string[] = [];
  const opportunities: string[] = [];
  
  // Analyze top segment
  const topSegment = analytics.topSegments[0];
  
  // Budget-based strategy
  if (analytics.budgetDistribution.highBudget > 30) {
    primaryStrategy = 'Premium Content & Personal Connections';
    reasoning = 'You have a significant high-spending audience. Focus on exclusive offerings and personal engagement.';
    tips.push('Offer exclusive chat sessions at higher entry prices');
    tips.push('Create VIP-only content and experiences');
    tips.push('Consider offering personalized video messages');
  } else if (analytics.budgetDistribution.midBudget > 40) {
    primaryStrategy = 'Balanced Engagement & Volume';
    reasoning = 'Your audience is primarily mid-range spenders. Balance quality with accessibility.';
    tips.push('Maintain consistent chat availability');
    tips.push('Offer occasional promotions for high-value services');
    tips.push('Build loyalty through regular interactions');
  } else {
    primaryStrategy = 'Volume & Accessibility';
    reasoning = 'Your audience prefers affordable engagement. Focus on volume and building connections.';
    tips.push('Keep entry prices competitive');
    tips.push('Maximize chat availability');
    tips.push('Consider group events to serve more fans');
  }
  
  // Intent-based opportunities
  if (analytics.intentDistribution.meetingFocused > 20) {
    opportunities.push('Meeting bookings are popular - increase calendar availability');
  }
  if (analytics.intentDistribution.callFocused > 25) {
    opportunities.push('Your audience loves calls - consider offering more voice/video options');
  }
  if (analytics.intentDistribution.eventExplorer > 15) {
    opportunities.push('Event interest is high - plan regular group experiences');
  }
  
  // Proximity-based opportunities
  if (analytics.proximityDistribution.local > 40) {
    opportunities.push('Strong local following - consider in-person meetups or local events');
  }
  if (analytics.proximityDistribution.remote > 60) {
    opportunities.push('Mostly remote audience - focus on digital content and virtual experiences');
  }
  
  // Passion-based opportunities
  if (analytics.passionDistribution.sharedInterests > 50) {
    opportunities.push('High interest alignment - create content around your shared passions');
  }
  if (analytics.passionDistribution.loyalFollower > 30) {
    opportunities.push('Strong loyal base - consider launching a membership or subscription tier');
  }
  
  return {
    primaryStrategy,
    reasoning,
    tips,
    opportunities
  };
}

/**
 * Get audience growth insights
 */
export async function getAudienceGrowthInsights(creatorId: string): Promise<{
  totalAudience: number;
  payingAudience: number;
  mostValuableSegment: {
    description: string;
    avgRevenue: number;
  };
  growthOpportunities: string[];
}> {
  const analytics = await getCreatorAudienceInsights(creatorId);
  
  const mostValuable = analytics.mostValuableSegment;
  let mvDescription = 'High-value audience';
  
  if (mostValuable) {
    mvDescription = `${mostValuable.budget} budget, ${mostValuable.intent}-focused`;
    if (mostValuable.proximity === 'local') {
      mvDescription += ', local fans';
    }
  }
  
  const growthOpportunities: string[] = [];
  
  // Identify underutilized segments
  if (analytics.intentDistribution.meetingFocused < 10) {
    growthOpportunities.push('Expand meeting offerings to attract meeting-seekers');
  }
  if (analytics.intentDistribution.eventExplorer < 10) {
    growthOpportunities.push('Host more events to engage event enthusiasts');
  }
  if (analytics.proximityDistribution.local < 20) {
    growthOpportunities.push('Increase local visibility to attract nearby fans');
  }
  if (analytics.budgetDistribution.highBudget < 15) {
    growthOpportunities.push('Create premium content to attract high spenders');
  }
  
  return {
    totalAudience: analytics.totalAudienceSize,
    payingAudience: analytics.payingAudienceSize,
    mostValuableSegment: {
      description: mvDescription,
      avgRevenue: mostValuable?.avgRevenue || 0
    },
    growthOpportunities
  };
}

/**
 * Get personalized audience message suggestions
 */
export async function getAudienceMessagingSuggestions(creatorId: string): Promise<{
  welcomeMessage: string;
  engagementTips: string[];
  contentIdeas: string[];
}> {
  const analytics = await getCreatorAudienceInsights(creatorId);
  
  let welcomeMessage = 'Welcome! ';
  const engagementTips: string[] = [];
  const contentIdeas: string[] = [];
  
  // Tailor welcome based on top segment
  const topSegment = analytics.topSegments[0];
  if (topSegment) {
    if (topSegment.intent === 'chat') {
      welcomeMessage += "I love chatting and getting to know my fans. Let's talk!";
      contentIdeas.push('Share daily thoughts and experiences through chat');
    } else if (topSegment.intent === 'call') {
      welcomeMessage += "I enjoy personal conversations. Don't hesitate to call!";
      contentIdeas.push('Offer exclusive voice/video content');
    } else if (topSegment.intent === 'meeting') {
      welcomeMessage += "I'm excited to meet fans in person! Check my calendar.";
      contentIdeas.push('Share behind-the-scenes prep for meetings');
    } else {
      welcomeMessage += "I love bringing people together at events!";
      contentIdeas.push('Post event highlights and teasers');
    }
  }
  
  // Add engagement tips based on audience
  if (analytics.passionDistribution.sharedInterests > 40) {
    engagementTips.push('Post about your interests - your audience shares them!');
  }
  if (analytics.proximityDistribution.local > 30) {
    engagementTips.push('Share local experiences and spots');
  }
  if (analytics.budgetDistribution.highBudget > 25) {
    engagementTips.push('Your audience values quality - don\'t be afraid to offer premium experiences');
  }
  
  return {
    welcomeMessage,
    engagementTips,
    contentIdeas
  };
}

// ========================================================================
// Dashboard Widgets Data
// ========================================================================

/**
 * Get all dashboard data in one call (for efficiency)
 */
export async function getCreatorDashboardData(creatorId: string): Promise<{
  overview: {
    totalAudience: number;
    payingAudience: number;
    topSegmentDescription: string;
  };
  breakdown: Awaited<ReturnType<typeof getAudienceBreakdown>>;
  topSegments: Awaited<ReturnType<typeof getTopAudienceSegments>>;
  recommendations: Awaited<ReturnType<typeof getMonetizationRecommendations>>;
  growth: Awaited<ReturnType<typeof getAudienceGrowthInsights>>;
}> {
  const analytics = await getCreatorAudienceInsights(creatorId);
  
  const [breakdown, topSegments, recommendations, growth] = await Promise.all([
    getAudienceBreakdown(creatorId),
    getTopAudienceSegments(creatorId),
    getMonetizationRecommendations(creatorId),
    getAudienceGrowthInsights(creatorId)
  ]);
  
  return {
    overview: {
      totalAudience: analytics.totalAudienceSize,
      payingAudience: analytics.payingAudienceSize,
      topSegmentDescription: topSegments[0]?.description || 'Building your audience'
    },
    breakdown,
    topSegments,
    recommendations,
    growth
  };
}

// ========================================================================
// Export Functions
// ========================================================================

export const CreatorDashboard = {
  getCreatorAudienceInsights,
  getAudienceBreakdown,
  getTopAudienceSegments,
  getMonetizationRecommendations,
  getAudienceGrowthInsights,
  getAudienceMessagingSuggestions,
  getCreatorDashboardData
};