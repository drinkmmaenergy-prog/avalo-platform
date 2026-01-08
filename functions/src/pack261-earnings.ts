import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Constants
const AVALO_COMMISSION = 0.35; // 35% platform commission
const CREATOR_SHARE = 0.65; // 65% creator earnings
const MIN_PAYOUT_USD = 20;

// Token conversion rates per region (example rates)
const TOKEN_CONVERSION_RATES: Record<string, number> = {
  'USD': 0.01, // 1 token = $0.01
  'EUR': 0.009,
  'GBP': 0.008,
  'PLN': 0.04,
};

interface EarningSource {
  source: 'chat' | 'calls' | 'events' | 'fanClub' | 'live' | 'digitalProducts' | 'tips';
  grossTokens: number;
  commission: number;
  netTokens: number;
  payerId: string;
  payerAvatar?: string;
  feature: string;
  metadata?: any;
}

interface EarningRecord {
  creatorId: string;
  source: string;
  grossTokens: number;
  commission: number;
  netTokens: number;
  payerId: string;
  payerAvatar?: string;
  payerUsernameHidden: boolean;
  feature: string;
  timestamp: admin.firestore.Timestamp;
  metadata?: any;
}

interface EarningSummary {
  todayTokens: number;
  weekTokens: number;
  monthTokens: number;
  pendingPayout: number;
  availableTokens: number;
  bestDay: number;
  bestWeek: number;
  bestMonth: number;
  lastUpdated: admin.firestore.Timestamp;
}

// Record earning when a user spends tokens on creator content
export const recordEarning = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { creatorId, source, tokens, feature, metadata } = data;

  if (!creatorId || !source || !tokens || !feature) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const grossTokens = tokens;
    const commission = Math.floor(grossTokens * AVALO_COMMISSION);
    const netTokens = grossTokens - commission;

    // Get payer info
    const payerDoc = await db.collection('users').doc(context.auth.uid).get();
    const payerData = payerDoc.data();

    const earningRecord: EarningRecord = {
      creatorId,
      source,
      grossTokens,
      commission,
      netTokens,
      payerId: context.auth.uid,
      payerAvatar: payerData?.photoURL,
      payerUsernameHidden: payerData?.incognitoMode || false,
      feature,
      timestamp: admin.firestore.Timestamp.now(),
      metadata,
    };

    // Write earning record
    await db.collection('creators').doc(creatorId)
      .collection('earnings').add(earningRecord);

    // Update income breakdown by feature
    await db.collection('creators').doc(creatorId)
      .collection('incomeBreakdown').doc(source).collection('transactions')
      .add(earningRecord);

    // Update earnings summary (trigger aggregation)
    await updateEarningSummary(creatorId, netTokens);

    // Update top supporters
    await updateTopSupporter(creatorId, context.auth.uid, grossTokens);

    // Check for milestones
    await checkMilestones(creatorId);

    return { success: true, netTokens };
  } catch (error) {
    console.error('Error recording earning:', error);
    throw new functions.https.HttpsError('internal', 'Failed to record earning');
  }
});

// Update earnings summary with real-time aggregation
async function updateEarningSummary(creatorId: string, netTokens: number): Promise<void> {
  const summaryRef = db.collection('creators').doc(creatorId)
    .collection('earningSummary').doc('current');

  await db.runTransaction(async (transaction) => {
    const summaryDoc = await transaction.get(summaryRef);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let summary: EarningSummary;

    if (!summaryDoc.exists) {
      summary = {
        todayTokens: netTokens,
        weekTokens: netTokens,
        monthTokens: netTokens,
        pendingPayout: 0,
        availableTokens: netTokens,
        bestDay: netTokens,
        bestWeek: netTokens,
        bestMonth: netTokens,
        lastUpdated: admin.firestore.Timestamp.now(),
      };
    } else {
      const data = summaryDoc.data() as EarningSummary;
      const lastUpdate = data.lastUpdated.toDate();

      // Reset daily if new day
      const todayTokens = lastUpdate >= startOfDay ? data.todayTokens + netTokens : netTokens;
      // Reset weekly if new week
      const weekTokens = lastUpdate >= startOfWeek ? data.weekTokens + netTokens : netTokens;
      // Reset monthly if new month
      const monthTokens = lastUpdate >= startOfMonth ? data.monthTokens + netTokens : netTokens;

      summary = {
        todayTokens,
        weekTokens,
        monthTokens,
        pendingPayout: data.pendingPayout,
        availableTokens: data.availableTokens + netTokens,
        bestDay: Math.max(data.bestDay, todayTokens),
        bestWeek: Math.max(data.bestWeek, weekTokens),
        bestMonth: Math.max(data.bestMonth, monthTokens),
        lastUpdated: admin.firestore.Timestamp.now(),
      };
    }

    transaction.set(summaryRef, summary, { merge: true });
  });
}

// Update top supporters list
async function updateTopSupporter(creatorId: string, supporterId: string, tokens: number): Promise<void> {
  const supporterRef = db.collection('creators').doc(creatorId)
    .collection('topSupporters').doc(supporterId);

  await db.runTransaction(async (transaction) => {
    const supporterDoc = await transaction.get(supporterRef);
    const supporterUserDoc = await db.collection('users').doc(supporterId).get();
    const supporterData = supporterUserDoc.data();

    if (!supporterDoc.exists) {
      transaction.set(supporterRef, {
        supporterId,
        username: supporterData?.username || 'Anonymous',
        avatar: supporterData?.photoURL,
        totalSpent: tokens,
        transactionCount: 1,
        lastActivity: admin.firestore.Timestamp.now(),
        firstActivity: admin.firestore.Timestamp.now(),
      });
    } else {
      const data = supporterDoc.data();
      transaction.update(supporterRef, {
        totalSpent: admin.firestore.FieldValue.increment(tokens),
        transactionCount: admin.firestore.FieldValue.increment(1),
        lastActivity: admin.firestore.Timestamp.now(),
      });
    }
  });
}

// Check and record milestones
async function checkMilestones(creatorId: string): Promise<void> {
  const summaryDoc = await db.collection('creators').doc(creatorId)
    .collection('earningSummary').doc('current').get();

  if (!summaryDoc.exists) return;

  const summary = summaryDoc.data() as EarningSummary;
  const milestones = [];

  // Check if this is a record day/week/month
  if (summary.todayTokens >= summary.bestDay) {
    milestones.push({
      type: 'bestDay',
      value: summary.todayTokens,
      previousRecord: summary.bestDay,
      achievedAt: admin.firestore.Timestamp.now(),
    });
  }

  if (summary.weekTokens >= summary.bestWeek) {
    milestones.push({
      type: 'bestWeek',
      value: summary.weekTokens,
      previousRecord: summary.bestWeek,
      achievedAt: admin.firestore.Timestamp.now(),
    });
  }

  if (summary.monthTokens >= summary.bestMonth) {
    milestones.push({
      type: 'bestMonth',
      value: summary.monthTokens,
      previousRecord: summary.bestMonth,
      achievedAt: admin.firestore.Timestamp.now(),
    });
  }

  // Save milestones and trigger notifications
  for (const milestone of milestones) {
    await db.collection('creators').doc(creatorId)
      .collection('milestones').add(milestone);

    // Trigger notification
    await sendMilestoneNotification(creatorId, milestone);
  }
}

// Send milestone notification
async function sendMilestoneNotification(creatorId: string, milestone: any): Promise<void> {
  const userDoc = await db.collection('users').doc(creatorId).get();
  const fcmToken = userDoc.data()?.fcmToken;

  if (!fcmToken) return;

  let message = '';
  if (milestone.type === 'bestDay') {
    message = `🎉 New record! You earned ${milestone.value} tokens today - your best day ever!`;
  } else if (milestone.type === 'bestWeek') {
    message = `🔥 Amazing week! ${milestone.value} tokens - a new weekly record!`;
  } else if (milestone.type === 'bestMonth') {
    message = `🏆 Incredible! ${milestone.value} tokens this month - your best month yet!`;
  }

  await admin.messaging().send({
    token: fcmToken,
    notification: {
      title: 'Milestone Achieved! 🎊',
      body: message,
    },
    data: {
      type: 'earnings_milestone',
      milestoneType: milestone.type,
      value: milestone.value.toString(),
    },
  });
}

// Request payout
export const requestPayout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { amount, currency, method, methodDetails } = data;

  if (!amount || !currency || !method) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    const creatorId = context.auth.uid;

    // Check KYC status
    const userDoc = await db.collection('users').doc(creatorId).get();
    if (!userDoc.data()?.kycVerified) {
      throw new functions.https.HttpsError('failed-precondition', 'KYC verification required');
    }

    // Check minimum amount
    if (amount < MIN_PAYOUT_USD) {
      throw new functions.https.HttpsError('failed-precondition', `Minimum payout is ${MIN_PAYOUT_USD} USD`);
    }

    // Check available balance
    const summaryDoc = await db.collection('creators').doc(creatorId)
      .collection('earningSummary').doc('current').get();

    const summary = summaryDoc.data() as EarningSummary;
    const conversionRate = TOKEN_CONVERSION_RATES[currency] || TOKEN_CONVERSION_RATES['USD'];
    const requiredTokens = Math.ceil(amount / conversionRate);

    if (summary.availableTokens < requiredTokens) {
      throw new functions.https.HttpsError('failed-precondition', 'Insufficient balance');
    }

    // Create payout request
    const payoutRequest = {
      creatorId,
      amount,
      currency,
      tokens: requiredTokens,
      method, // 'wise', 'paypal', 'sepa', 'swift'
      methodDetails,
      status: 'pending',
      createdAt: admin.firestore.Timestamp.now(),
      processedAt: null,
      transactionId: null,
    };

    const payoutRef = await db.collection('payoutRequests').add(payoutRequest);

    // Deduct from available tokens and add to pending
    await db.collection('creators').doc(creatorId)
      .collection('earningSummary').doc('current').update({
        availableTokens: admin.firestore.FieldValue.increment(-requiredTokens),
        pendingPayout: admin.firestore.FieldValue.increment(amount),
      });

    // Send notification
    const fcmToken = userDoc.data()?.fcmToken;
    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: 'Payout Initiated',
          body: `Your ${amount} ${currency} payout request is being processed. ETA 1-5 business days.`,
        },
        data: {
          type: 'payout_initiated',
          payoutId: payoutRef.id,
          amount: amount.toString(),
          currency,
        },
      });
    }

    return { success: true, payoutId: payoutRef.id };
  } catch (error) {
    console.error('Error requesting payout:', error);
    throw error;
  }
});

// Compute analytics (scheduled function - runs daily)
export const computeAnalytics = functions.pubsub.schedule('0 2 * * *').onRun(async (context) => {
  const creatorsSnapshot = await db.collection('users')
    .where('role', '==', 'creator').get();

  for (const creatorDoc of creatorsSnapshot.docs) {
    const creatorId = creatorDoc.id;
    await computeCreatorAnalytics(creatorId);
    await generateEarningTips(creatorId);
  }

  return null;
});

// Compute creator analytics
async function computeCreatorAnalytics(creatorId: string): Promise<void> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get earnings from last 30 days
  const earningsSnapshot = await db.collection('creators').doc(creatorId)
    .collection('earnings')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
    .get();

  const analytics = {
    totalEarnings: 0,
    transactionCount: 0,
    uniquePayers: new Set<string>(),
    sourceBreakdown: {} as Record<string, number>,
    hourlyDistribution: Array(24).fill(0),
    regionDistribution: {} as Record<string, number>,
    averageTransactionSize: 0,
  };

  for (const doc of earningsSnapshot.docs) {
    const earning = doc.data();
    analytics.totalEarnings += earning.netTokens;
    analytics.transactionCount++;
    analytics.uniquePayers.add(earning.payerId);

    // Source breakdown
    analytics.sourceBreakdown[earning.source] = 
      (analytics.sourceBreakdown[earning.source] || 0) + earning.netTokens;

    // Hourly distribution
    const hour = earning.timestamp.toDate().getHours();
    analytics.hourlyDistribution[hour]++;

    // Region distribution (from payer)
    const payerDoc = await db.collection('users').doc(earning.payerId).get();
    const region = payerDoc.data()?.region || 'Unknown';
    analytics.regionDistribution[region] = 
      (analytics.regionDistribution[region] || 0) + earning.grossTokens;
  }

  analytics.averageTransactionSize = analytics.transactionCount > 0 
    ? analytics.totalEarnings / analytics.transactionCount 
    : 0;

  // Save analytics
  await db.collection('creators').doc(creatorId)
    .collection('analytics').doc('summary').set({
      ...analytics,
      uniquePayerCount: analytics.uniquePayers.size,
      computedAt: admin.firestore.Timestamp.now(),
    }, { merge: true });
}

// Generate AI earning tips based on analytics
async function generateEarningTips(creatorId: string): Promise<void> {
  const analyticsDoc = await db.collection('creators').doc(creatorId)
    .collection('analytics').doc('summary').get();

  if (!analyticsDoc.exists) return;

  const analytics = analyticsDoc.data();
  const tips = [];

  // Find best performing hour
  const bestHour = analytics.hourlyDistribution.indexOf(
    Math.max(...analytics.hourlyDistribution)
  );
  if (analytics.hourlyDistribution[bestHour] > 0) {
    tips.push({
      type: 'timing',
      message: `Posting at ${bestHour}:00-${bestHour + 2}:30 gives you the most engagement`,
      priority: 1,
      createdAt: admin.firestore.Timestamp.now(),
    });
  }

  // Find best performing region
  const regions = Object.entries(analytics.regionDistribution || {})
    .sort((a, b) => (b[1] as number) - (a[1] as number));
  if (regions.length > 1) {
    const topRegion = regions[0];
    const avgRegion = regions.reduce((sum, r) => sum + (r[1] as number), 0) / regions.length;
    const multiplier = ((topRegion[1] as number) / avgRegion).toFixed(1);
    tips.push({
      type: 'audience',
      message: `Your viewers from ${topRegion[0]} convert ${multiplier}× higher than others`,
      priority: 2,
      createdAt: admin.firestore.Timestamp.now(),
    });
  }

  // Find best performing feature
  const features = Object.entries(analytics.sourceBreakdown || {})
    .sort((a, b) => (b[1] as number) - (a[1] as number));
  if (features.length > 0) {
    tips.push({
      type: 'monetization',
      message: `${features[0][0]} is your top earning feature - focus more content here`,
      priority: 3,
      createdAt: admin.firestore.Timestamp.now(),
    });
  }

  // Save tips
  const tipsBatch = db.batch();
  for (const tip of tips) {
    const tipRef = db.collection('creators').doc(creatorId)
      .collection('earningTips').doc();
    tipsBatch.set(tipRef, tip);
  }
  await tipsBatch.commit();
}

// Get earnings dashboard data
export const getEarningsDashboard = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const creatorId = context.auth.uid;

    // Get summary
    const summaryDoc = await db.collection('creators').doc(creatorId)
      .collection('earningSummary').doc('current').get();

    // Get top supporters (top 10)
    const topSupportersSnapshot = await db.collection('creators').doc(creatorId)
      .collection('topSupporters')
      .orderBy('totalSpent', 'desc')
      .limit(10)
      .get();

    // Get recent earnings (last 50 transactions)
    const recentEarningsSnapshot = await db.collection('creators').doc(creatorId)
      .collection('earnings')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    // Get analytics
    const analyticsDoc = await db.collection('creators').doc(creatorId)
      .collection('analytics').doc('summary').get();

    // Get earning tips
    const tipsSnapshot = await db.collection('creators').doc(creatorId)
      .collection('earningTips')
      .orderBy('priority', 'asc')
      .limit(5)
      .get();

    return {
      summary: summaryDoc.data(),
      topSupporters: topSupportersSnapshot.docs.map(doc => doc.data()),
      recentEarnings: recentEarningsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })),
      analytics: analyticsDoc.data(),
      tips: tipsSnapshot.docs.map(doc => doc.data()),
    };
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch dashboard data');
  }
});

// Notify creator when top supporter is active
export const notifyTopSupporterActive = functions.firestore
  .document('users/{userId}/presence/status')
  .onUpdate(async (change, context) => {
    const newStatus = change.after.data();
    const oldStatus = change.before.data();

    // Check if user just came online
    if (newStatus.online && !oldStatus.online) {
      const userId = context.params.userId;

      // Find creators where this user is a top supporter
      const topSupporterQuery = await db.collectionGroup('topSupporters')
        .where('supporterId', '==', userId)
        .get();

      for (const doc of topSupporterQuery.docs) {
        const creatorId = doc.ref.parent.parent?.id;
        if (!creatorId) continue;

        // Check if they're in top 5
        const topSupportersSnapshot = await db.collection('creators').doc(creatorId)
          .collection('topSupporters')
          .orderBy('totalSpent', 'desc')
          .limit(5)
          .get();

        const isTopFive = topSupportersSnapshot.docs.some(d => d.id === userId);
        if (!isTopFive) continue;

        // Send notification to creator
        const creatorDoc = await db.collection('users').doc(creatorId).get();
        const fcmToken = creatorDoc.data()?.fcmToken;

        if (fcmToken) {
          await admin.messaging().send({
            token: fcmToken,
            notification: {
              title: 'VIP Supporter Active',
              body: 'Your top supporter is online now!',
            },
            data: {
              type: 'vip_supporter_active',
              supporterId: userId,
            },
          });
        }
      }
    }
  });