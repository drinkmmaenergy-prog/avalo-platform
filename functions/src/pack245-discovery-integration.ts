/**
 * PACK 245: Audience Classification & VIP Segmenting
 * Discovery & Matching Algorithm Integration
 * 
 * Uses segments to improve profile recommendations and matching
 */

import { db } from './init.js';
import type { 
  AudienceSegment,
  BudgetTier,
  IntentType,
  ProximityClass,
  SegmentFilter,
  SegmentScore
} from './pack245-audience-segments-types';

// ========================================================================
// Segment-Based Profile Ranking
// ========================================================================

/**
 * Calculate match score between viewer and creator based on segments
 */
function calculateSegmentMatchScore(
  segment: AudienceSegment | null,
  viewerPreferences: {
    preferLocal?: boolean;
    preferMeetings?: boolean;
    budget?: BudgetTier;
  }
): number {
  if (!segment) return 50; // Neutral score for unknown segments
  
  let score = 50; // Base score
  
  // Budget compatibility (higher budget = higher priority in discovery)
  if (segment.budget === 'high') {
    score += 20;
  } else if (segment.budget === 'mid') {
    score += 10;
  }
  
  // Intent matching
  if (viewerPreferences.preferMeetings && segment.intent === 'meeting') {
    score += 15;
  }
  
  // Proximity bonus
  if (viewerPreferences.preferLocal) {
    if (segment.proximity === 'local') {
      score += 20;
    } else if (segment.proximity === 'nearby') {
      score += 10;
    }
  } else {
    // Default proximity scoring
    if (segment.proximity === 'local') {
      score += 10;
    } else if (segment.proximity === 'nearby') {
      score += 5;
    }
  }
  
  // Passion signals bonus
  if (segment.passion.sharedInterests) {
    score += 10;
  }
  if (segment.passion.loyalFollower) {
    score += 15;
  }
  if (segment.passion.visualAttraction) {
    score += 5;
  }
  
  return Math.min(100, score);
}

/**
 * Get recommended creators for a viewer based on their segments
 */
export async function getSegmentBasedRecommendations(params: {
  viewerId: string;
  limit?: number;
  filters?: SegmentFilter;
  excludeIds?: string[];
}): Promise<{
  creatorId: string;
  score: number;
  reasons: string[];
}[]> {
  const { viewerId, limit = 20, filters, excludeIds = [] } = params;
  
  // Get viewer's existing segments
  const viewerSegmentsSnap = await db
    .collection('audience_segments')
    .where('viewerId', '==', viewerId)
    .get();
  
  const viewerSegments = new Map<string, AudienceSegment>();
  viewerSegmentsSnap.forEach(doc => {
    const segment = doc.data() as AudienceSegment;
    viewerSegments.set(segment.creatorId, segment);
  });
  
  // Get viewer's budget classification
  const budgetCacheDoc = await db
    .collection('budget_classification_cache')
    .doc(viewerId)
    .get();
  const viewerBudget = budgetCacheDoc.exists ? 
    budgetCacheDoc.data()!.budgetTier as BudgetTier : 'mid';
  
  // Get viewer's intent classification
  const intentCacheDoc = await db
    .collection('intent_classification_cache')
    .doc(viewerId)
    .get();
  const viewerIntent = intentCacheDoc.exists ?
    intentCacheDoc.data()!.primaryIntent as IntentType : 'chat';
  
  // Find creators that match viewer's profile
  let creatorsQuery = db.collection('users')
    .where('modes.earnFromChat', '==', true)
    .limit(100); // Get larger pool to filter
  
  const creatorsSnap = await creatorsQuery.get();
  
  const recommendations: {
    creatorId: string;
    score: number;
    reasons: string[];
  }[] = [];
  
  for (const creatorDoc of creatorsSnap.docs) {
    const creatorId = creatorDoc.id;
    
    // Skip excluded IDs
    if (excludeIds.includes(creatorId)) continue;
    
    // Skip if viewer already has segment with this creator
    const existingSegment = viewerSegments.get(creatorId);
    
    let score = 50;
    const reasons: string[] = [];
    
    // Get creator's typical audience segments
    const creatorAnalyticsDoc = await db
      .collection('creator_audience_analytics')
      .doc(creatorId)
      .get();
    
    if (creatorAnalyticsDoc.exists) {
      const analytics = creatorAnalyticsDoc.data()!;
      
      // Match viewer budget with creator's top segments
      if (viewerBudget === 'high') {
        // High budget viewers see premium creators
        score += 15;
        reasons.push('Premium creator match');
      }
      
      // Match viewer intent with creator's monetization focus
      const intentDist = analytics.intentDistribution as any;
      if (viewerIntent === 'chat' && intentDist.chatFocused > 40) {
        score += 10;
        reasons.push('Chat-focused creator');
      } else if (viewerIntent === 'call' && intentDist.callFocused > 30) {
        score += 10;
        reasons.push('Call-friendly creator');
      } else if (viewerIntent === 'meeting' && intentDist.meetingFocused > 20) {
        score += 15;
        reasons.push('Available for meetings');
      } else if (viewerIntent === 'event' && intentDist.eventExplorer > 15) {
        score += 10;
        reasons.push('Event organizer');
      }
      
      // Check if creator has similar successful audience
      const topSegment = analytics.mostValuableSegment;
      if (topSegment && topSegment.budget === viewerBudget) {
        score += 10;
        reasons.push('Attracts similar audience');
      }
    }
    
    // Apply existing segment score if available
    if (existingSegment) {
      const segmentScore = calculateSegmentMatchScore(existingSegment, {
        budget: viewerBudget
      });
      score = Math.round((score + segmentScore) / 2);
      
      if (existingSegment.passion.sharedInterests) {
        reasons.push('Shared interests');
      }
      if (existingSegment.proximity === 'local') {
        reasons.push('Local creator');
      }
    }
    
    // Apply filters
    if (filters) {
      let passesFilters = true;
      
      if (filters.budget && existingSegment) {
        if (!filters.budget.includes(existingSegment.budget)) {
          passesFilters = false;
        }
      }
      
      if (filters.proximity && existingSegment) {
        if (!filters.proximity.includes(existingSegment.proximity)) {
          passesFilters = false;
        }
      }
      
      if (!passesFilters) continue;
    }
    
    recommendations.push({
      creatorId,
      score,
      reasons: reasons.length > 0 ? reasons : ['Recommended for you']
    });
  }
  
  // Sort by score and return top N
  recommendations.sort((a, b) => b.score - a.score);
  return recommendations.slice(0, limit);
}

/**
 * Boost creator visibility based on segment performance
 */
export async function getCreatorVisibilityBoost(
  creatorId: string,
  forAudience: 'all' | 'highBudget' | 'local' | 'meetingFocused'
): Promise<number> {
  const analyticsDoc = await db
    .collection('creator_audience_analytics')
    .doc(creatorId)
    .get();
  
  if (!analyticsDoc.exists) return 1.0; // No boost
  
  const analytics = analyticsDoc.data()!;
  let boost = 1.0;
  
  if (forAudience === 'highBudget') {
    // Boost for creators popular with high-budget audience
    if (analytics.budgetDistribution.highBudget > 30) {
      boost = 1.3;
    } else if (analytics.budgetDistribution.highBudget > 20) {
      boost = 1.15;
    }
  } else if (forAudience === 'local') {
    // Boost for creators with local appeal
    if (analytics.proximityDistribution.local > 40) {
      boost = 1.25;
    } else if (analytics.proximityDistribution.local > 25) {
      boost = 1.1;
    }
  } else if (forAudience === 'meetingFocused') {
    // Boost for creators with open calendars
    if (analytics.intentDistribution.meetingFocused > 25) {
      boost = 1.4;
    } else if (analytics.intentDistribution.meetingFocused > 15) {
      boost = 1.2;
    }
  }
  
  return boost;
}

/**
 * Filter discovery feed based on viewer segments
 */
export async function filterDiscoveryFeed(params: {
  viewerId: string;
  candidates: string[]; // Creator IDs
  context: 'swipe' | 'search' | 'featured';
}): Promise<{
  creatorId: string;
  priority: 'high' | 'medium' | 'low';
  suggestedAction: string;
}[]> {
  const { viewerId, candidates, context } = params;
  
  // Get viewer classifications
  const [budgetDoc, intentDoc] = await Promise.all([
    db.collection('budget_classification_cache').doc(viewerId).get(),
    db.collection('intent_classification_cache').doc(viewerId).get()
  ]);
  
  const viewerBudget = budgetDoc.exists ? budgetDoc.data()!.budgetTier as BudgetTier : 'mid';
  const viewerIntent = intentDoc.exists ? intentDoc.data()!.primaryIntent as IntentType : 'chat';
  
  const results: {
    creatorId: string;
    priority: 'high' | 'medium' | 'low';
    suggestedAction: string;
  }[] = [];
  
  for (const creatorId of candidates) {
    // Check if segment exists
    const segmentDoc = await db
      .collection('audience_segments')
      .doc(`${viewerId}_${creatorId}`)
      .get();
    
    let priority: 'high' | 'medium' | 'low' = 'medium';
    let suggestedAction = 'Start chatting';
    
    if (segmentDoc.exists) {
      const segment = segmentDoc.data() as AudienceSegment;
      
      // Prioritize based on compatibility
      if (segment.budget === viewerBudget && segment.intent === viewerIntent) {
        priority = 'high';
      } else if (segment.budget === viewerBudget || segment.intent === viewerIntent) {
        priority = 'medium';
      } else {
        priority = 'low';
      }
      
      // Suggest action based on intent
      if (viewerIntent === 'meeting' && segment.proximity === 'local') {
        suggestedAction = 'Book a meeting';
        priority = 'high';
      } else if (viewerIntent === 'call') {
        suggestedAction = 'Start a call';
      } else if (viewerIntent === 'event') {
        suggestedAction = 'Check events';
      }
      
      // Boost for passion signals
      if (segment.passion.sharedInterests) {
        priority = priority === 'low' ? 'medium' : 'high';
      }
    } else {
      // No existing segment - use creator analytics
      const analyticsDoc = await db
        .collection('creator_audience_analytics')
        .doc(creatorId)
        .get();
      
      if (analyticsDoc.exists) {
        const analytics = analyticsDoc.data()!;
        
        // Check if creator typically attracts similar viewers
        if (viewerBudget === 'high' && analytics.budgetDistribution.highBudget > 30) {
          priority = 'high';
        }
        
        // Match intent
        const intentDist = analytics.intentDistribution as any;
        if (viewerIntent === 'meeting' && intentDist.meetingFocused > 20) {
          suggestedAction = 'Book a meeting';
          priority = 'high';
        }
      }
    }
    
    results.push({
      creatorId,
      priority,
      suggestedAction
    });
  }
  
  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  
  return results;
}

/**
 * Get optimal chat/call/meeting suggestions based on segments
 */
export async function getOptimalEngagementSuggestion(
  viewerId: string,
  creatorId: string
): Promise<{
  suggestedType: 'chat' | 'call' | 'meeting' | 'event';
  confidence: number;
  reasoning: string;
}> {
  const segmentDoc = await db
    .collection('audience_segments')
    .doc(`${viewerId}_${creatorId}`)
    .get();
  
  if (!segmentDoc.exists) {
    return {
      suggestedType: 'chat',
      confidence: 50,
      reasoning: 'Start with a chat to get to know each other'
    };
  }
  
  const segment = segmentDoc.data() as AudienceSegment;
  
  let suggestedType: 'chat' | 'call' | 'meeting' | 'event' = segment.intent;
  let confidence = 70;
  let reasoning = '';
  
  // Adjust based on segments
  if (segment.intent === 'meeting' && segment.proximity === 'local' && segment.budget !== 'low') {
    confidence = 95;
    reasoning = 'You both prefer meetings and are nearby - perfect for an in-person connection!';
  } else if (segment.intent === 'call' && segment.budget === 'high') {
    confidence = 85;
    reasoning = 'Based on your preferences, a call would be a great way to connect';
  } else if (segment.intent === 'chat') {
    confidence = 75;
    reasoning = 'Start with a chat - it\'s the best way to begin your connection';
  } else if (segment.intent === 'event' && segment.proximity !== 'remote') {
    confidence = 80;
    reasoning = 'Check out upcoming events - a great way to meet in a group setting';
  }
  
  // Boost confidence for passion signals
  if (segment.passion.sharedInterests) {
    confidence = Math.min(100, confidence + 10);
    reasoning += ' (You share common interests!)';
  }
  
  return {
    suggestedType,
    confidence,
    reasoning
  };
}

/**
 * Update discovery queue order based on segments
 */
export async function reorderDiscoveryQueue(
  viewerId: string,
  queuedCreatorIds: string[]
): Promise<string[]> {
  const scores = new Map<string, number>();
  
  // Get viewer classifications
  const [budgetDoc, intentDoc] = await Promise.all([
    db.collection('budget_classification_cache').doc(viewerId).get(),
    db.collection('intent_classification_cache').doc(viewerId).get()
  ]);
  
  const viewerBudget = budgetDoc.exists ? budgetDoc.data()!.budgetTier as BudgetTier : 'mid';
  const viewerIntent = intentDoc.exists ? intentDoc.data()!.primaryIntent as IntentType : 'chat';
  
  // Score each creator
  for (const creatorId of queuedCreatorIds) {
    const segmentDoc = await db
      .collection('audience_segments')
      .doc(`${viewerId}_${creatorId}`)
      .get();
    
    let score = 50;
    
    if (segmentDoc.exists) {
      const segment = segmentDoc.data() as AudienceSegment;
      score = calculateSegmentMatchScore(segment, {
        budget: viewerBudget,
        preferMeetings: viewerIntent === 'meeting'
      });
    } else {
      // Get creator analytics for new matching
      const boost = await getCreatorVisibilityBoost(
        creatorId,
        viewerBudget === 'high' ? 'highBudget' : 'all'
      );
      score *= boost;
    }
    
    scores.set(creatorId, score);
  }
  
  // Sort by score
  return queuedCreatorIds.sort((a, b) => {
    const scoreA = scores.get(a) || 50;
    const scoreB = scores.get(b) || 50;
    return scoreB - scoreA;
  });
}

// ========================================================================
// Export Functions
// ========================================================================

export const DiscoveryIntegration = {
  getSegmentBasedRecommendations,
  getCreatorVisibilityBoost,
  filterDiscoveryFeed,
  getOptimalEngagementSuggestion,
  reorderDiscoveryQueue,
  calculateSegmentMatchScore
};