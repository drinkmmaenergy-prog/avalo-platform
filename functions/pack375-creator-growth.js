/**
 * PACK 375: CREATOR GROWTH ENGINE
 * High-performance growth engine for creators
 * Maximizes earnings, feed exposure, subscriber growth, and conversion
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ============================================
// 1. CREATOR BOOSTER SYSTEM
// ============================================

/**
 * Apply a creator boost (paid or algorithmic)
 */
exports.pack375_applyCreatorBoost = functions.https.onCall(async (data, context) => {
  // Authenticate
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { creatorId, boostType, durationMinutes, strength, source } = data;

  // Validate input
  if (!creatorId || !boostType || !durationMinutes || !strength || !source) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Validate boost type
  const validTypes = ['feed', 'chat', 'story', 'discovery', 'event'];
  if (!validTypes.includes(boostType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid boost type');
  }

  // Validate strength (1-5)
  if (strength < 1 || strength > 5) {
    throw new functions.https.HttpsError('invalid-argument', 'Strength must be between 1 and 5');
  }

  // Check if user is creator or admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const isAdmin = userDoc.exists && userDoc.data().role === 'admin';
  const isCreatorOwner = context.auth.uid === creatorId;

  if (!isAdmin && !isCreatorOwner) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized');
  }

  // Check feature flag
  const flagDoc = await db.collection('featureFlags').doc('pack375').get();
  if (!flagDoc.exists || !flagDoc.data()['creator.boosts.enabled']) {
    throw new functions.https.HttpsError('failed-precondition', 'Creator boosts are not enabled');
  }

  const now = admin.firestore.Timestamp.now();
  const expiresAt = new admin.firestore.Timestamp(
    now.seconds + (durationMinutes * 60),
    now.nanoseconds
  );

  // If wallet source, verify wallet balance via PACK 277
  if (source === 'wallet') {
    const cost = calculateBoostCost(boostType, durationMinutes, strength);
    const walletDoc = await db.collection('wallets').doc(creatorId).get();
    
    if (!walletDoc.exists || walletDoc.data().balance < cost) {
      throw new functions.https.HttpsError('failed-precondition', 'Insufficient wallet balance');
    }

    // Deduct from wallet
    await db.collection('wallets').doc(creatorId).update({
      balance: FieldValue.increment(-cost),
      updatedAt: now
    });

    // Record transaction
    await db.collection('walletTransactions').add({
      userId: creatorId,
      type: 'boost_purchase',
      amount: -cost,
      description: `${boostType} boost for ${durationMinutes} minutes`,
      timestamp: now,
      metadata: {
        boostType,
        durationMinutes,
        strength
      }
    });
  }

  // Create boost record
  const boostRef = await db.collection('creatorBoosts').add({
    creatorId,
    boostType,
    durationMinutes,
    strength,
    source,
    status: 'active',
    createdAt: now,
    expiresAt,
    metrics: {
      impressions: 0,
      clicks: 0,
      conversions: 0
    }
  });

  // Update creator feed priority (PACK 323 integration)
  await updateCreatorFeedPriority(creatorId, boostType, strength);

  // Log to audit trail (PACK 296 integration)
  await db.collection('creatorBoostHistory').add({
    boostId: boostRef.id,
    creatorId,
    action: 'boost_applied',
    boostType,
    strength,
    durationMinutes,
    source,
    timestamp: now,
    metadata: {
      cost: source === 'wallet' ? calculateBoostCost(boostType, durationMinutes, strength) : 0
    }
  });

  // Check for fraud signals (PACK 302 integration)
  await checkBoostFraud(creatorId, boostType, source);

  return {
    success: true,
    boostId: boostRef.id,
    expiresAt: expiresAt.toMillis()
  };
});

/**
 * Expire creator boosts (scheduled function)
 */
exports.pack375_expireCreatorBoost = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();

    // Find expired boosts
    const expiredBoosts = await db.collection('creatorBoosts')
      .where('status', '==', 'active')
      .where('expiresAt', '<=', now)
      .get();

    const batch = db.batch();
    const updates = [];

    for (const doc of expiredBoosts.docs) {
      const boost = doc.data();
      
      // Update boost status
      batch.update(doc.ref, {
        status: 'expired',
        expiredAt: now
      });

      // Revert feed priority
      updates.push(revertCreatorFeedPriority(boost.creatorId, boost.boostType));

      // Log expiration
      batch.set(db.collection('creatorBoostHistory').doc(), {
        boostId: doc.id,
        creatorId: boost.creatorId,
        action: 'boost_expired',
        boostType: boost.boostType,
        timestamp: now,
        metadata: {
          metrics: boost.metrics || {}
        }
      });
    }

    await batch.commit();
    await Promise.all(updates);

    console.log(`Expired ${expiredBoosts.size} creator boosts`);
    return null;
  });

// ============================================
// 2. CREATOR FUNNEL TRACKING
// ============================================

/**
 * Track creator funnel stage
 */
exports.pack375_trackCreatorFunnelStage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { creatorId, stage, metadata } = data;

  const validStages = [
    'profile_view',
    'first_message',
    'first_paid_message',
    'subscriber_conversion',
    'calendar_booking',
    'event_join',
    'repeat_purchase'
  ];

  if (!validStages.includes(stage)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid funnel stage');
  }

  const now = admin.firestore.Timestamp.now();

  // Find or create funnel document
  const funnelQuery = await db.collection('creatorFunnels')
    .where('userId', '==', context.auth.uid)
    .where('creatorId', '==', creatorId)
    .limit(1)
    .get();

  if (funnelQuery.empty) {
    // Create new funnel tracking
    await db.collection('creatorFunnels').add({
      userId: context.auth.uid,
      creatorId,
      stage,
      stages: {
        [stage]: {
          timestamp: now,
          metadata: metadata || {}
        }
      },
      createdAt: now,
      updatedAt: now
    });
  } else {
    // Update existing funnel
    const funnelDoc = funnelQuery.docs[0];
    await funnelDoc.ref.update({
      stage,
      [`stages.${stage}`]: {
        timestamp: now,
        metadata: metadata || {}
      },
      updatedAt: now
    });
  }

  // Update creator analytics
  await updateCreatorAnalytics(creatorId, stage, now);

  return { success: true };
});

/**
 * Compute creator conversion rates
 */
exports.pack375_computeCreatorConversionRates = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const creators = await db.collection('users')
      .where('isCreator', '==', true)
      .get();

    const batch = db.batch();

    for (const creatorDoc of creators.docs) {
      const creatorId = creatorDoc.id;

      // Get all funnels for this creator
      const funnels = await db.collection('creatorFunnels')
        .where('creatorId', '==', creatorId)
        .get();

      const stats = {
        profileViews: 0,
        firstMessages: 0,
        firstPaidMessages: 0,
        subscriberConversions: 0,
        calendarBookings: 0,
        eventJoins: 0,
        repeatPurchases: 0
      };

      // Count stage completions
      funnels.forEach(doc => {
        const stages = doc.data().stages || {};
        if (stages.profile_view) stats.profileViews++;
        if (stages.first_message) stats.firstMessages++;
        if (stages.first_paid_message) stats.firstPaidMessages++;
        if (stages.subscriber_conversion) stats.subscriberConversions++;
        if (stages.calendar_booking) stats.calendarBookings++;
        if (stages.event_join) stats.eventJoins++;
        if (stages.repeat_purchase) stats.repeatPurchases++;
      });

      // Calculate conversion rates
      const conversionRates = {
        viewToMessage: stats.profileViews > 0 ? stats.firstMessages / stats.profileViews : 0,
        messageToPaid: stats.firstMessages > 0 ? stats.firstPaidMessages / stats.firstMessages : 0,
        viewToSubscriber: stats.profileViews > 0 ? stats.subscriberConversions / stats.profileViews : 0,
        subscriberToRepeat: stats.subscriberConversions > 0 ? stats.repeatPurchases / stats.subscriberConversions : 0,
        overall: stats.profileViews > 0 ? stats.subscriberConversions / stats.profileViews : 0
      };

      // Store in analytics
      const analyticsRef = db.collection('creatorAnalytics').doc(creatorId)
        .collection('conversions').doc('latest');

      batch.set(analyticsRef, {
        creatorId,
        stats,
        conversionRates,
        computedAt: admin.firestore.Timestamp.now()
      }, { merge: true });

      // Generate AI optimization suggestions if rates are low
      if (conversionRates.overall < 0.05) {
        await generateOptimizationSuggestion(creatorId, 'low_conversion', conversionRates);
      }
    }

    await batch.commit();
    console.log(`Computed conversion rates for ${creators.size} creators`);
    return null;
  });

// ============================================
// 3. CREATOR ANALYTICS
// ============================================

/**
 * Update daily creator analytics
 */
exports.pack375_updateDailyAnalytics = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const creators = await db.collection('users')
      .where('isCreator', '==', true)
      .get();

    for (const creatorDoc of creators.docs) {
      const creatorId = creatorDoc.id;

      // Aggregate earnings from previous day
      const earnings = await calculateDailyEarnings(creatorId, dateStr);
      
      // Get engagement metrics
      const engagement = await calculateDailyEngagement(creatorId, dateStr);

      // Store daily metrics
      await db.collection('creatorAnalytics').doc(creatorId)
        .collection('daily').doc(dateStr).set({
          creatorId,
          date: dateStr,
          earnings,
          engagement,
          computedAt: admin.firestore.Timestamp.now()
        });

      // Update rolling averages
      await updateCreatorRollingAverages(creatorId);
    }

    console.log(`Updated daily analytics for ${creators.size} creators`);
    return null;
  });

// ============================================
// 4. AI-ASSISTED OPTIMIZATION
// ============================================

/**
 * Generate AI optimization suggestions
 */
async function generateOptimizationSuggestion(creatorId, category, data) {
  const flagDoc = await db.collection('featureFlags').doc('pack375').get();
  if (!flagDoc.exists || !flagDoc.data()['creator.ai.suggestions.enabled']) {
    return;
  }

  const suggestions = {
    low_conversion: {
      title: 'Improve Conversion Rate',
      description: 'Your profile-to-subscriber conversion is below average. Consider optimizing your profile and pricing.',
      priority: 3,
      actions: [
        'Add more content to your profile',
        'Review your pricing strategy',
        'Respond faster to messages',
        'Offer a time-limited discount'
      ]
    },
    best_posting_time: {
      title: 'Optimal Posting Time',
      description: 'Based on your audience activity, posting between 7-9 PM gets the best engagement.',
      priority: 2,
      actions: [
        'Schedule posts for peak hours',
        'Test different time slots',
        'Analyze your engagement patterns'
      ]
    },
    pricing_optimization: {
      title: 'Pricing Strategy',
      description: 'Your pricing may be affecting conversions. Consider testing different price points.',
      priority: 2,
      actions: [
        'Compare with similar creators',
        'Test a promotional offer',
        'Bundle services for better value'
      ]
    }
  };

  const suggestion = suggestions[category] || {
    title: 'Optimization Opportunity',
    description: 'We detected an area for potential improvement.',
    priority: 1,
    actions: []
  };

  await db.collection('creatorOptimizations').add({
    creatorId,
    category,
    ...suggestion,
    source: 'ai',
    status: 'pending',
    data,
    createdAt: admin.firestore.Timestamp.now()
  });
}

// ============================================
// 5. SUBSCRIBER GROWTH MECHANICS
// ============================================

/**
 * Create a subscriber growth offer
 */
exports.pack375_createGrowthOffer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { creatorId, offerType, discountPercent, durationHours } = data;

  // Verify creator ownership
  if (context.auth.uid !== creatorId) {
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized');
    }
  }

  const now = admin.firestore.Timestamp.now();
  const expiresAt = new admin.firestore.Timestamp(
    now.seconds + (durationHours * 3600),
    now.nanoseconds
  );

  const offerRef = await db.collection('subscriberGrowthOffers').add({
    creatorId,
    offerType,
    discountPercent,
    durationHours,
    status: 'active',
    createdAt: now,
    expiresAt,
    metrics: {
      views: 0,
      conversions: 0
    }
  });

  // Log to audit trail
  await db.collection('auditLogs').add({
    action: 'growth_offer_created',
    userId: context.auth.uid,
    targetId: offerRef.id,
    details: {
      creatorId,
      offerType,
      discountPercent,
      durationHours
    },
    timestamp: now
  });

  return {
    success: true,
    offerId: offerRef.id
  };
});

// ============================================
// 6. FRAUD DETECTION
// ============================================

/**
 * Check for boost fraud signals
 */
async function checkBoostFraud(creatorId, boostType, source) {
  // Count recent boosts
  const recentBoosts = await db.collection('creatorBoosts')
    .where('creatorId', '==', creatorId)
    .where('createdAt', '>', admin.firestore.Timestamp.fromMillis(Date.now() - 86400000))
    .get();

  let fraudScore = 0;
  const signals = [];

  // Too many boosts in 24h
  if (recentBoosts.size > 10) {
    fraudScore += 30;
    signals.push('excessive_boost_frequency');
  }

  // Check for multi-account patterns via PACK 302
  const fraudDoc = await db.collection('fraudScores').doc(creatorId).get();
  if (fraudDoc.exists && fraudDoc.data().score > 70) {
    fraudScore += 40;
    signals.push('high_fraud_score');
  }

  // Update creator fraud score
  if (fraudScore > 0) {
    await db.collection('creatorFraudScores').doc(creatorId).set({
      score: FieldValue.increment(fraudScore),
      signals: FieldValue.arrayUnion(...signals),
      lastBoostCheck: admin.firestore.Timestamp.now(),
      riskLevel: fraudScore > 50 ? 'high' : 'medium',
      updatedAt: admin.firestore.Timestamp.now()
    }, { merge: true });

    // If high risk, invalidate boost
    if (fraudScore > 70) {
      await db.collection('creatorBoosts')
        .where('creatorId', '==', creatorId)
        .where('status', '==', 'active')
        .get()
        .then(snapshot => {
          const batch = db.batch();
          snapshot.forEach(doc => {
            batch.update(doc.ref, { status: 'suspended', suspendedAt: admin.firestore.Timestamp.now() });
          });
          return batch.commit();
        });
    }
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateBoostCost(boostType, durationMinutes, strength) {
  const baseCosts = {
    feed: 100,
    chat: 150,
    story: 80,
    discovery: 200,
    event: 120
  };

  const baseCost = baseCosts[boostType] || 100;
  const durationMultiplier = durationMinutes / 60;
  const strengthMultiplier = strength / 3;

  return Math.floor(baseCost * durationMultiplier * strengthMultiplier);
}

async function updateCreatorFeedPriority(creatorId, boostType, strength) {
  const multiplier = 1 + (strength * 0.2); // 1.2x to 2.0x boost

  await db.collection('creatorFeedPriority').doc(creatorId).set({
    active: true,
    boostType,
    multiplier,
    lastUpdated: admin.firestore.Timestamp.now()
  }, { merge: true });
}

async function revertCreatorFeedPriority(creatorId, boostType) {
  const priorityDoc = await db.collection('creatorFeedPriority').doc(creatorId).get();
  
  if (priorityDoc.exists) {
    const current = priorityDoc.data();
    
    // Only revert if this boost type matches
    if (current.boostType === boostType) {
      await priorityDoc.ref.update({
        active: false,
        multiplier: 1.0,
        lastUpdated: admin.firestore.Timestamp.now()
      });
    }
  }
}

async function updateCreatorAnalytics(creatorId, stage, timestamp) {
  const analyticsRef = db.collection('creatorAnalytics').doc(creatorId);
  
  await analyticsRef.set({
    [`funnel.${stage}`]: FieldValue.increment(1),
    lastActivity: timestamp,
    updatedAt: timestamp
  }, { merge: true });
}

async function calculateDailyEarnings(creatorId, dateStr) {
  const startDate = new Date(dateStr);
  const endDate = new Date(dateStr);
  endDate.setDate(endDate.getDate() + 1);

  const transactions = await db.collection('walletTransactions')
    .where('recipientId', '==', creatorId)
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('timestamp', '<', admin.firestore.Timestamp.fromDate(endDate))
    .get();

  const earnings = {
    total: 0,
    bySource: {
      chat: 0,
      calls: 0,
      calendar: 0,
      events: 0,
      tips: 0,
      subscriptions: 0
    }
  };

  transactions.forEach(doc => {
    const tx = doc.data();
    earnings.total += tx.amount || 0;
    
    const source = tx.metadata?.source || 'other';
    if (earnings.bySource[source] !== undefined) {
      earnings.bySource[source] += tx.amount || 0;
    }
  });

  return earnings;
}

async function calculateDailyEngagement(creatorId, dateStr) {
  const startDate = new Date(dateStr);
  const endDate = new Date(dateStr);
  endDate.setDate(endDate.getDate() + 1);

  // This would integrate with other packs for actual metrics
  return {
    profileViews: 0,
    messageCount: 0,
    callCount: 0,
    eventAttendees: 0,
    newSubscribers: 0
  };
}

async function updateCreatorRollingAverages(creatorId) {
  // Get last 30 days of data
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

  const daily = await db.collection('creatorAnalytics').doc(creatorId)
    .collection('daily')
    .where('date', '>=', dateStr)
    .get();

  let totalEarnings = 0;
  let totalViews = 0;
  let count = 0;

  daily.forEach(doc => {
    const data = doc.data();
    totalEarnings += data.earnings?.total || 0;
    totalViews += data.engagement?.profileViews || 0;
    count++;
  });

  await db.collection('creatorAnalytics').doc(creatorId).set({
    rolling30Days: {
      avgDailyEarnings: count > 0 ? totalEarnings / count : 0,
      avgDailyViews: count > 0 ? totalViews / count : 0,
      totalEarnings,
      computedAt: admin.firestore.Timestamp.now()
    }
  }, { merge: true });
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  pack375_applyCreatorBoost: exports.pack375_applyCreatorBoost,
  pack375_expireCreatorBoost: exports.pack375_expireCreatorBoost,
  pack375_trackCreatorFunnelStage: exports.pack375_trackCreatorFunnelStage,
  pack375_computeCreatorConversionRates: exports.pack375_computeCreatorConversionRates,
  pack375_updateDailyAnalytics: exports.pack375_updateDailyAnalytics,
  pack375_createGrowthOffer: exports.pack375_createGrowthOffer
};
