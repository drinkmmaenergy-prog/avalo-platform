import { db } from '../init';
import { FieldValue } from 'firebase-admin/firestore';
import { aiModerator } from './aiModeration';
import {
  ConflictType,
  ConflictTrend,
  ConflictContentCase,
  TrendStatus,
  SeverityLevel,
  ConflictDetectionResult,
  TrendVelocity
} from './types';

export async function detectConflictTrend(
  contentId: string,
  contentText: string,
  hashtags: string[],
  userId: string
): Promise<void> {
  const analysis = await aiModerator.analyzeContent({
    text: contentText,
    metadata: { hashtags }
  });
  
  if (analysis.isConflict) {
    await createConflictCase(contentId, userId, analysis);
    await updateTrendTracking(hashtags, analysis);
  }
  
  await storeClimateScore(contentId, analysis.climateScore);
}

async function createConflictCase(
  contentId: string,
  userId: string,
  analysis: ConflictDetectionResult
): Promise<void> {
  const caseData: Omit<ConflictContentCase, 'id'> = {
    contentId,
    userId,
    contentType: 'post',
    conflictType: analysis.conflictTypes[0] || ConflictType.CULTURE_WAR,
    severity: analysis.severity,
    climateScore: analysis.climateScore,
    status: 'pending',
    createdAt: new Date(),
    appealable: analysis.severity !== SeverityLevel.CRITICAL
  };
  
  if (analysis.recommendedAction !== 'none') {
    caseData.actionTaken = {
      type: analysis.recommendedAction === 'monitor' ? 'none' : analysis.recommendedAction,
      appliedAt: new Date(),
      reason: analysis.reasoning
    };
    caseData.status = 'action_taken';
  }
  
  await db.collection('conflict_content_cases').add(caseData);
}

async function updateTrendTracking(
  hashtags: string[],
  analysis: ConflictDetectionResult
): Promise<void> {
  for (const tag of hashtags) {
    const trendHash = generateTrendHash(tag, analysis.conflictTypes[0]);
    const trendRef = db.collection('conflict_trends').doc(trendHash);
    const trendDoc = await trendRef.get();
    
    if (trendDoc.exists) {
      const existingData = trendDoc.data() as ConflictTrend;
      const newVelocity = calculateVelocity(existingData);
      
      await trendRef.update({
        contentCount: FieldValue.increment(1),
        velocity: newVelocity,
        lastUpdated: new Date(),
        status: determineStatusFromVelocity(newVelocity, existingData.status)
      });
      
      await recordTrendVelocity(trendHash, newVelocity);
    } else {
      const newTrend: Omit<ConflictTrend, 'id'> = {
        trendHash,
        keywords: [tag],
        hashtags: [tag],
        category: analysis.conflictTypes[0] || ConflictType.CULTURE_WAR,
        severity: analysis.severity,
        velocity: 1,
        contentCount: 1,
        userCount: 1,
        status: TrendStatus.MONITORING,
        detectedAt: new Date(),
        lastUpdated: new Date(),
        conflictCommentRatio: 0,
        viralityMetrics: {
          shares: 0,
          comments: 0,
          engagementRate: 0,
          growthRate: 0
        }
      };
      
      await trendRef.set(newTrend);
    }
  }
}

async function storeClimateScore(
  contentId: string,
  climateScore: any
): Promise<void> {
  await db.collection('content_climate_scores').doc(contentId).set(climateScore);
}

function generateTrendHash(hashtag: string, conflictType: ConflictType): string {
  return `${hashtag.toLowerCase()}_${conflictType}`;
}

function calculateVelocity(trend: ConflictTrend): number {
  const timeSinceDetection = Date.now() - trend.detectedAt.getTime();
  const hoursElapsed = timeSinceDetection / (1000 * 60 * 60);
  
  if (hoursElapsed === 0) return trend.contentCount;
  
  return trend.contentCount / hoursElapsed;
}

function determineStatusFromVelocity(velocity: number, currentStatus: TrendStatus): TrendStatus {
  if (velocity > 100) return TrendStatus.FROZEN;
  if (velocity > 50) return TrendStatus.VIRALITY_DISABLED;
  if (velocity > 20) return TrendStatus.EXPOSURE_REMOVED;
  if (velocity > 10) return TrendStatus.DOWNRANKED;
  return currentStatus;
}

async function recordTrendVelocity(trendId: string, velocity: number): Promise<void> {
  const velocityData: Omit<TrendVelocity, 'id'> = {
    trendId,
    velocity,
    acceleration: 0,
    timestamp: new Date(),
    metrics: {
      shares: 0,
      comments: 0,
      views: 0,
      uniqueUsers: 0
    }
  };
  
  await db.collection('trend_velocity')
    .add(velocityData);
}

export async function blockPoliticalRecruitment(contentId: string): Promise<boolean> {
  const caseQuery = await db.collection('conflict_content_cases')
    .where('contentId', '==', contentId)
    .where('conflictType', '==', ConflictType.POLITICAL_CAMPAIGNING)
    .limit(1)
    .get();
  
  if (!caseQuery.empty) {
    const caseDoc = caseQuery.docs[0];
    await caseDoc.ref.update({
      status: 'action_taken',
      actionTaken: {
        type: 'disable_virality',
        appliedAt: new Date(),
        reason: 'Political recruitment detected and blocked'
      }
    });
    return true;
  }
  
  return false;
}

export async function blockReligiousWarfare(contentId: string): Promise<boolean> {
  const caseQuery = await db.collection('conflict_content_cases')
    .where('contentId', '==', contentId)
    .where('conflictType', '==', ConflictType.RELIGIOUS_SUPERIORITY)
    .limit(1)
    .get();
  
  if (!caseQuery.empty) {
    const caseDoc = caseQuery.docs[0];
    await caseDoc.ref.update({
      status: 'action_taken',
      actionTaken: {
        type: 'disable_virality',
        appliedAt: new Date(),
        reason: 'Religious warfare detected and blocked'
      }
    });
    return true;
  }
  
  return false;
}

export async function applyToxicTrendJammer(trendHash: string): Promise<void> {
  const trendRef = db.collection('conflict_trends').doc(trendHash);
  const trendDoc = await trendRef.get();
  
  if (!trendDoc.exists) return;
  
  const trend = trendDoc.data() as ConflictTrend;
  
  if (trend.velocity > 20 || trend.severity === SeverityLevel.HIGH || trend.severity === SeverityLevel.CRITICAL) {
    await trendRef.update({
      status: TrendStatus.VIRALITY_DISABLED,
      lastUpdated: new Date()
    });
    
    await disableTagAmplification(trend.hashtags);
    await throttleRepostVelocity(trend.hashtags);
  }
}

async function disableTagAmplification(hashtags: string[]): Promise<void> {
  const batch = db.batch();
  
  for (const tag of hashtags) {
    const tagRef = db.collection('disabled_tags').doc(tag.toLowerCase());
    batch.set(tagRef, {
      tag: tag.toLowerCase(),
      reason: 'conflict_trend',
      disabledAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
  }
  
  await batch.commit();
}

async function throttleRepostVelocity(hashtags: string[]): Promise<void> {
  const batch = db.batch();
  
  for (const tag of hashtags) {
    const throttleRef = db.collection('throttled_tags').doc(tag.toLowerCase());
    batch.set(throttleRef, {
      tag: tag.toLowerCase(),
      maxRepostsPerHour: 5,
      throttledAt: new Date(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });
  }
  
  await batch.commit();
}

export async function resolveConflictContentCase(
  caseId: string,
  resolution: 'approved' | 'dismissed',
  reviewerId: string,
  notes?: string
): Promise<void> {
  const caseRef = db.collection('conflict_content_cases').doc(caseId);
  const caseDoc = await caseRef.get();
  
  if (!caseDoc.exists) {
    throw new Error('Case not found');
  }
  
  await caseRef.update({
    status: resolution === 'approved' ? 'action_taken' : 'dismissed',
    reviewedAt: new Date(),
    reviewedBy: reviewerId,
    'actionTaken.reason': notes || 'Reviewed and resolved'
  });
}

export async function analyzeCommentClimate(
  contentId: string,
  comments: Array<{ text: string; userId: string }>
): Promise<{ shouldDisableComments: boolean; conflictRatio: number }> {
  const analysis = await aiModerator.analyzeCommentClimate(comments);
  
  if (analysis.isEscalating) {
    await db.collection('content_climate_scores').doc(contentId).update({
      commentClimate: {
        conflictRatio: analysis.conflictRatio,
        sentimentScore: analysis.sentimentScore,
        isEscalating: true,
        disableRecommended: true
      }
    });
  }
  
  return {
    shouldDisableComments: analysis.isEscalating && analysis.conflictRatio > 0.4,
    conflictRatio: analysis.conflictRatio
  };
}

export async function getContentClimateScore(contentId: string): Promise<any> {
  const scoreDoc = await db.collection('content_climate_scores').doc(contentId).get();
  return scoreDoc.exists ? scoreDoc.data() : null;
}

export async function isContentAllowedInFeed(
  contentId: string,
  userId: string
): Promise<boolean> {
  const profileDoc = await db.collection('culture_safety_profiles').doc(userId).get();
  
  if (!profileDoc.exists) {
    return true;
  }
  
  const profile = profileDoc.data();
  const filters = profile?.filters || {};
  
  const scoreDoc = await db.collection('content_climate_scores').doc(contentId).get();
  
  if (!scoreDoc.exists) {
    return true;
  }
  
  const score = scoreDoc.data();
  
  if (filters.hidePolitical && score.politicalScore > 0.4) return false;
  if (filters.hideReligious && score.religiousScore > 0.4) return false;
  if (filters.hideConflictComments && score.commentClimate?.isEscalating) return false;
  
  return true;
}