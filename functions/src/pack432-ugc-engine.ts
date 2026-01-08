/**
 * PACK 432 — UGC Scaling Engine
 * 
 * Automated system for ingesting, tagging, testing, and rotating
 * User Generated Content (UGC) from creators, influencers, and AI
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

// ===========================
// TYPES & INTERFACES
// ===========================

export interface UGCCreative {
  id: string;
  name: string;
  type: 'video' | 'image' | 'text';
  url: string;
  text?: string;
  platform: 'meta' | 'tiktok' | 'google' | 'all';
  source: 'creator' | 'influencer' | 'ai' | 'ugc_platform';
  creatorId?: string;
  country: string;
  emotion: 'romance' | 'excitement' | 'safety' | 'money' | 'social' | 'fun';
  tags: string[];
  dimensions?: {
    width: number;
    height: number;
    duration?: number; // seconds for video
  };
  status: 'pending' | 'approved' | 'testing' | 'active' | 'paused' | 'rejected';
  performance: {
    impressions: number;
    clicks: number;
    installs: number;
    ctr: number;
    conversionRate: number;
    cpi: number;
    spend: number;
  };
  testingStats?: {
    startDate: string;
    endDate: string;
    testBudget: number;
    winner: boolean;
  };
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  approvedAt?: FirebaseFirestore.Timestamp;
  rejectedReason?: string;
}

export interface CreatorSubmission {
  id: string;
  creatorId: string;
  creativeType: 'video' | 'image';
  fileUrl: string;
  caption?: string;
  targetCountry: string;
  targetEmotion: string;
  platform: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: FirebaseFirestore.Timestamp;
  reviewedAt?: FirebaseFirestore.Timestamp;
  reviewedBy?: string;
}

// ===========================
// UGC INGESTION
// ===========================

export const submitUGCCreative = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }

  const { type, url, text, platform, country, emotion, caption } = data;

  // Validate inputs
  if (!['video', 'image', 'text'].includes(type)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid creative type');
  }

  if (!['meta', 'tiktok', 'google', 'all'].includes(platform)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid platform');
  }

  if (!['romance', 'excitement', 'safety', 'money', 'social', 'fun'].includes(emotion)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid emotion');
  }

  // Check if user is a creator
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }

  const userData = userDoc.data()!;
  const isCreator = userData.roles?.creator === true || userData.roles?.influencer === true;

  // Create submission
  const submission: Partial<CreatorSubmission> = {
    id: db.collection('ugc_submissions').doc().id,
    creatorId: context.auth.uid,
    creativeType: type,
    fileUrl: url,
    caption: caption || text,
    targetCountry: country,
    targetEmotion: emotion,
    platform,
    status: 'pending',
    submittedAt: admin.firestore.Timestamp.now()
  };

  await db.collection('ugc_submissions').doc(submission.id!).set(submission);

  // If creator has high reputation, auto-approve
  if (isCreator && userData.reputation?.score > 85) {
    await autoApproveUGC(submission.id!);
  }

  return {
    success: true,
    submissionId: submission.id
  };
});

async function autoApproveUGC(submissionId: string) {
  const submissionDoc = await db.collection('ugc_submissions').doc(submissionId).get();
  if (!submissionDoc.exists) return;

  const submission = submissionDoc.data() as CreatorSubmission;

  // Create creative
  const creative: Partial<UGCCreative> = {
    id: db.collection('ua_creatives').doc().id,
    name: `UGC-${submission.creatorId}-${Date.now()}`,
    type: submission.creativeType,
    url: submission.fileUrl,
    text: submission.caption,
    platform: submission.platform as any,
    source: 'creator',
    creatorId: submission.creatorId,
    country: submission.targetCountry,
    emotion: submission.targetEmotion as any,
    tags: [submission.targetEmotion, submission.targetCountry],
    status: 'testing',
    performance: {
      impressions: 0,
      clicks: 0,
      installs: 0,
      ctr: 0,
      conversionRate: 0,
      cpi: 0,
      spend: 0
    },
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    approvedAt: admin.firestore.Timestamp.now()
  };

  await db.collection('ua_creatives').doc(creative.id!).set(creative);

  // Update submission
  await db.collection('ugc_submissions').doc(submissionId).update({
    status: 'approved',
    reviewedAt: admin.firestore.Timestamp.now(),
    reviewedBy: 'auto'
  });

  // Pay creator
  await db.collection('creator_earnings').add({
    creatorId: submission.creatorId,
    type: 'ugc_submission',
    amount: 50, // $50 per approved UGC
    currency: 'PLN',
    creativeId: creative.id,
    timestamp: admin.firestore.Timestamp.now(),
    status: 'pending'
  });
}

// ===========================
// MANUAL REVIEW
// ===========================

export const reviewUGCSubmission = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { submissionId, approved, rejectedReason } = data;

  const submissionDoc = await db.collection('ugc_submissions').doc(submissionId).get();
  if (!submissionDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Submission not found');
  }

  const submission = submissionDoc.data() as CreatorSubmission;

  if (approved) {
    await autoApproveUGC(submissionId);
  } else {
    await db.collection('ugc_submissions').doc(submissionId).update({
      status: 'rejected',
      reviewedAt: admin.firestore.Timestamp.now(),
      reviewedBy: context.auth.uid,
      rejectedReason
    });

    // Notify creator
    await db.collection('notifications').add({
      userId: submission.creatorId,
      type: 'ugc_rejected',
      title: 'UGC Submission Rejected',
      body: rejectedReason || 'Your submission did not meet our guidelines',
      timestamp: admin.firestore.Timestamp.now(),
      read: false
    });
  }

  return { success: true };
});

// ===========================
// A/B/C TESTING
// ===========================

export const startCreativeTesting = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { campaignId, creativeIds, testBudget, testDurationHours } = data;

  if (!creativeIds || creativeIds.length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Need at least 2 creatives to test');
  }

  const endDate = new Date();
  endDate.setHours(endDate.getHours() + (testDurationHours || 24));

  // Create A/B/C test record
  const testId = db.collection('ua_creative_tests').doc().id;
  await db.collection('ua_creative_tests').doc(testId).set({
    id: testId,
    campaignId,
    creativeIds,
    testBudget: testBudget || 500,
    budgetPerCreative: (testBudget || 500) / creativeIds.length,
    startDate: admin.firestore.Timestamp.now(),
    endDate: admin.firestore.Timestamp.fromDate(endDate),
    status: 'running',
    results: {}
  });

  // Update creatives to testing status
  for (const creativeId of creativeIds) {
    await db.collection('ua_creatives').doc(creativeId).update({
      status: 'testing',
      'testingStats.startDate': new Date().toISOString().split('T')[0],
      'testingStats.testBudget': (testBudget || 500) / creativeIds.length,
      updatedAt: admin.firestore.Timestamp.now()
    });
  }

  return {
    success: true,
    testId,
    endDate: endDate.toISOString()
  };
});

// ===========================
// AUTOMATIC CREATIVE ROTATION
// ===========================

export const rotateTopCreatives = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    // Get all active campaigns
    const campaigns = await db.collection('ua_campaigns')
      .where('status', '==', 'active')
      .get();

    for (const campaignDoc of campaigns.docs) {
      const campaign = campaignDoc.data();

      // Get current active creatives for this campaign
      const activeCreativesSnap = await db.collection('ua_creatives')
        .where('status', '==', 'active')
        .where('platform', 'in', [campaign.platform, 'all'])
        .where('country', '==', campaign.country)
        .get();

      // Calculate average performance
      const avgConversionRate = activeCreativesSnap.docs.reduce((sum, doc) => 
        sum + doc.data().performance.conversionRate, 0) / activeCreativesSnap.size || 0;

      // Get testing creatives
      const testingCreativesSnap = await db.collection('ua_creatives')
        .where('status', '==', 'testing')
        .where('platform', 'in', [campaign.platform, 'all'])
        .where('country', '==', campaign.country)
        .get();

      // Promote winners (above average + 20%)
      for (const doc of testingCreativesSnap.docs) {
        const creative = doc.data() as UGCCreative;
        
        if (creative.performance.spend < 50) continue; // Min spend threshold

        const threshold = avgConversionRate * 1.2;

        if (creative.performance.conversionRate > threshold) {
          // Winner! Promote to active
          await db.collection('ua_creatives').doc(doc.id).update({
            status: 'active',
            'testingStats.winner': true,
            'testingStats.endDate': new Date().toISOString().split('T')[0],
            updatedAt: admin.firestore.Timestamp.now()
          });

          // Bonus for creator
          if (creative.creatorId) {
            await db.collection('creator_earnings').add({
              creatorId: creative.creatorId,
              type: 'ugc_performance_bonus',
              amount: 100, // $100 bonus for winners
              currency: 'PLN',
              creativeId: doc.id,
              timestamp: admin.firestore.Timestamp.now(),
              status: 'pending'
            });
          }

        } else if (creative.performance.conversionRate < threshold * 0.6) {
          // Loser - pause it
          await db.collection('ua_creatives').doc(doc.id).update({
            status: 'paused',
            'testingStats.winner': false,
            'testingStats.endDate': new Date().toISOString().split('T')[0],
            updatedAt: admin.firestore.Timestamp.now()
          });
        }
      }

      // Kill low performers
      for (const doc of activeCreativesSnap.docs) {
        const creative = doc.data() as UGCCreative;

        if (creative.performance.spend < 200) continue;

        if (creative.performance.conversionRate < avgConversionRate * 0.5) {
          await db.collection('ua_creatives').doc(doc.id).update({
            status: 'paused',
            pausedReason: 'low_performance',
            updatedAt: admin.firestore.Timestamp.now()
          });
        }
      }
    }

    return null;
  });

// ===========================
// CREATIVE PERFORMANCE UPDATE
// ===========================

export const updateCreativePerformance = functions.https.onCall(async (data, context) => {
  const { creativeId, impressions, clicks, installs, spend } = data;

  const creativeDoc = await db.collection('ua_creatives').doc(creativeId).get();
  if (!creativeDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Creative not found');
  }

  const creative = creativeDoc.data() as UGCCreative;

  // Update performance metrics
  const newImpressions = creative.performance.impressions + impressions;
  const newClicks = creative.performance.clicks + clicks;
  const newInstalls = creative.performance.installs + installs;
  const newSpend = creative.performance.spend + spend;

  const ctr = newImpressions > 0 ? newClicks / newImpressions : 0;
  const conversionRate = newClicks > 0 ? newInstalls / newClicks : 0;
  const cpi = newInstalls > 0 ? newSpend / newInstalls : 0;

  await db.collection('ua_creatives').doc(creativeId).update({
    'performance.impressions': newImpressions,
    'performance.clicks': newClicks,
    'performance.installs': newInstalls,
    'performance.spend': newSpend,
    'performance.ctr': ctr,
    'performance.conversionRate': conversionRate,
    'performance.cpi': cpi,
    updatedAt: admin.firestore.Timestamp.now()
  });

  return { success: true };
});

// ===========================
// AI CREATIVE GENERATION
// ===========================

export const generateAICreative = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { prompt, emotion, country, platform, type } = data;

  // Create AI generation request
  const requestId = db.collection('ai_creative_requests').doc().id;
  await db.collection('ai_creative_requests').doc(requestId).set({
    id: requestId,
    prompt,
    emotion,
    country,
    platform,
    type,
    status: 'pending',
    createdBy: context.auth.uid,
    createdAt: admin.firestore.Timestamp.now()
  });

  // In a real implementation, this would call an AI service like:
  // - Midjourney/DALL-E for images
  // - Runway/Synthesia for videos
  // - GPT-4 for text

  return {
    success: true,
    requestId,
    message: 'AI generation queued. Check back in 5-10 minutes.'
  };
});

// ===========================
// BULK IMPORT FROM UGC PLATFORMS
// ===========================

export const importFromUGCPlatform = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { platform, creativeUrls, country, emotion } = data;

  // Platforms: billo.app, insense.pro, etc.
  
  const imported = [];

  for (const url of creativeUrls) {
    const creative: Partial<UGCCreative> = {
      id: db.collection('ua_creatives').doc().id,
      name: `Import-${platform}-${Date.now()}`,
      type: url.includes('.mp4') ? 'video' : 'image',
      url,
      platform: 'all',
      source: 'ugc_platform',
      country,
      emotion,
      tags: [emotion, country, platform],
      status: 'pending',
      performance: {
        impressions: 0,
        clicks: 0,
        installs: 0,
        ctr: 0,
        conversionRate: 0,
        cpi: 0,
        spend: 0
      },
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    await db.collection('ua_creatives').doc(creative.id!).set(creative);
    imported.push(creative.id);
  }

  return {
    success: true,
    importedCount: imported.length,
    creativeIds: imported
  };
});

// ===========================
// CREATIVE ANALYTICS
// ===========================

export const getCreativeAnalytics = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin auth required');
  }

  const { emotion, country, platform, dateRange } = data;

  let query = db.collection('ua_creatives') as any;

  if (emotion) query = query.where('emotion', '==', emotion);
  if (country) query = query.where('country', '==', country);
  if (platform && platform !== 'all') query = query.where('platform', 'in', [platform, 'all']);

  const creativesSnap = await query.get();

  if (creativesSnap.empty) {
    return {
      totalCreatives: 0,
      byEmotion: {},
      bySource: {},
      topPerformers: [],
      avgMetrics: {}
    };
  }

  // Aggregate analytics
  const byEmotion: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalInstalls = 0;
  let totalSpend = 0;

  const performers: Array<{ id: string; name: string; conversionRate: number; cpi: number }> = [];

  for (const doc of creativesSnap.docs) {
    const creative = doc.data() as UGCCreative;

    byEmotion[creative.emotion] = (byEmotion[creative.emotion] || 0) + 1;
    bySource[creative.source] = (bySource[creative.source] || 0) + 1;

    totalImpressions += creative.performance.impressions;
    totalClicks += creative.performance.clicks;
    totalInstalls += creative.performance.installs;
    totalSpend += creative.performance.spend;

    if (creative.performance.spend > 50) {
      performers.push({
        id: doc.id,
        name: creative.name,
        conversionRate: creative.performance.conversionRate,
        cpi: creative.performance.cpi
      });
    }
  }

  // Sort top performers
  performers.sort((a, b) => b.conversionRate - a.conversionRate);

  return {
    totalCreatives: creativesSnap.size,
    byEmotion,
    bySource,
    topPerformers: performers.slice(0, 10),
    avgMetrics: {
      ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      conversionRate: totalClicks > 0 ? totalInstalls / totalClicks : 0,
      cpi: totalInstalls > 0 ? totalSpend / totalInstalls : 0,
      totalSpend
    }
  };
});

// ===========================
// EXPORTS
// ===========================

export const ugcEngine = {
  submitUGCCreative,
  reviewUGCSubmission,
  startCreativeTesting,
  rotateTopCreatives,
  updateCreativePerformance,
  generateAICreative,
  importFromUGCPlatform,
  getCreativeAnalytics
};
