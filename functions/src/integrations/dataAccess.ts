/**
 * PACK 150: Data Access & Logging Functions
 * Handle read-only data access and comprehensive audit logging
 */

import * as admin from 'firebase-admin';
import { https, logger } from 'firebase-functions';
import {
  APIAccessLog,
  AnonymizedDataset,
  DataPermissionType,
  IntegrationStatus,
  ViolationType,
  RateLimitStatus
} from '../types/integrations';
import * as crypto from 'crypto';

const db = admin.firestore();

/**
 * Get anonymized dataset for integration
 */
export const getIntegrationDataset = https.onCall(async (data, context) => {
  try {
    const startTime = Date.now();
    
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required');
    }

    const {
      partnerId,
      apiKey,
      integrationId,
      dataType,
      timeRange
    } = data;

    if (!partnerId || !apiKey || !integrationId || !dataType) {
      throw new https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    // Verify partner and integration
    const [partnerDoc, integrationDoc] = await Promise.all([
      db.collection('api_partner_profiles').doc(partnerId).get(),
      db.collection('api_integrations').doc(integrationId).get()
    ]);

    if (!partnerDoc.exists) {
      await logAccessAttempt(partnerId, integrationId, dataType, 404, Date.now() - startTime, context, 'Partner not found');
      throw new https.HttpsError('not-found', 'Partner not found');
    }

    const partner = partnerDoc.data();

    if (partner?.apiKey !== apiKey) {
      await logAccessAttempt(partnerId, integrationId, dataType, 401, Date.now() - startTime, context, 'Invalid API key');
      throw new https.HttpsError('permission-denied', 'Invalid API key');
    }

    if (partner?.status === IntegrationStatus.BANNED || 
        partner?.status === IntegrationStatus.SUSPENDED) {
      await logAccessAttempt(partnerId, integrationId, dataType, 403, Date.now() - startTime, context, 'Partner suspended/banned');
      throw new https.HttpsError('permission-denied', 'Partner access suspended');
    }

    if (!integrationDoc.exists) {
      await logAccessAttempt(partnerId, integrationId, dataType, 404, Date.now() - startTime, context, 'Integration not found');
      throw new https.HttpsError('not-found', 'Integration not found');
    }

    const integration = integrationDoc.data();

    if (integration?.status !== IntegrationStatus.ACTIVE) {
      await logAccessAttempt(partnerId, integrationId, dataType, 403, Date.now() - startTime, context, 'Integration not active');
      throw new https.HttpsError('permission-denied', 'Integration not active');
    }

    // Check consent expiration
    const now = new Date();
    if (integration?.consentExpiresAt && new Date(integration.consentExpiresAt) < now) {
      await logAccessAttempt(partnerId, integrationId, dataType, 403, Date.now() - startTime, context, 'Consent expired');
      throw new https.HttpsError('permission-denied', 'Consent expired - renewal required');
    }

    // Check permissions
    if (!integration?.approvedPermissions?.includes(dataType)) {
      await logAccessAttempt(partnerId, integrationId, dataType, 403, Date.now() - startTime, context, 'Permission not granted', ViolationType.RESTRICTED_DATA_ACCESS);
      throw new https.HttpsError('permission-denied', 'Permission not granted for this data type');
    }

    // Check rate limits
    await checkRateLimit(partnerId);

    // Generate anonymized dataset
    const dataset = await generateAnonymizedDataset(
      integration.creatorId,
      partnerId,
      dataType,
      timeRange
    );

    const responseTime = Date.now() - startTime;

    // Log successful access
    await logAccessAttempt(
      partnerId,
      integrationId,
      dataType,
      200,
      responseTime,
      context,
      'Success',
      null,
      dataset.recordCount
    );

    logger.info('Dataset accessed', {
      partnerId,
      integrationId,
      dataType,
      recordCount: dataset.recordCount
    });

    return {
      success: true,
      dataset: dataset.data,
      recordCount: dataset.recordCount,
      generatedAt: dataset.generatedAt,
      expiresAt: dataset.expiresAt
    };

  } catch (error) {
    logger.error('Error getting dataset', error);
    throw error;
  }
});

/**
 * Generate anonymized dataset based on data type
 */
async function generateAnonymizedDataset(
  creatorId: string,
  partnerId: string,
  dataType: DataPermissionType,
  timeRange?: { start: Date; end: Date }
): Promise<AnonymizedDataset> {
  const datasetId = db.collection('anonymized_datasets').doc().id;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 3600000); // 1 hour expiry

  let data: Record<string, any> = {};
  let recordCount = 0;

  const start = timeRange?.start ? new Date(timeRange.start) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const end = timeRange?.end ? new Date(timeRange.end) : now;

  switch (dataType) {
    case DataPermissionType.EVENT_ATTENDANCE:
      data = await getEventAttendanceData(creatorId, start, end);
      recordCount = data.events?.length || 0;
      break;

    case DataPermissionType.CHALLENGE_PROGRESS:
      data = await getChallengeProgressData(creatorId, start, end);
      recordCount = data.challenges?.length || 0;
      break;

    case DataPermissionType.PRODUCT_SALES_AGGREGATE:
      data = await getProductSalesData(creatorId, start, end);
      recordCount = data.products?.length || 0;
      break;

    case DataPermissionType.CLUB_PARTICIPATION_COUNT:
      data = await getClubParticipationData(creatorId, start, end);
      recordCount = data.clubs?.length || 0;
      break;

    case DataPermissionType.CRM_SEGMENTS_AGGREGATE:
      data = await getCRMSegmentsData(creatorId, start, end);
      recordCount = data.segments?.length || 0;
      break;

    case DataPermissionType.TRAFFIC_ANALYTICS:
      data = await getTrafficAnalyticsData(creatorId, start, end);
      recordCount = data.days?.length || 0;
      break;

    case DataPermissionType.REVENUE_SUMMARY:
      data = await getRevenueSummaryData(creatorId, start, end);
      recordCount = 1;
      break;

    default:
      throw new https.HttpsError('invalid-argument', 'Unsupported data type');
  }

  return {
    datasetId,
    creatorId,
    partnerId,
    dataType,
    timeRange: { start, end },
    hashedIds: true,
    regionBucketed: true,
    segmented: true,
    timestampClustered: true,
    personalAttributesRemoved: true,
    data,
    recordCount,
    generatedAt: now,
    expiresAt
  };
}

/**
 * Get event attendance data (anonymized)
 */
async function getEventAttendanceData(creatorId: string, start: Date, end: Date) {
  const eventsSnapshot = await db
    .collection('events')
    .where('creatorId', '==', creatorId)
    .where('date', '>=', start)
    .where('date', '<=', end)
    .get();

  const events = await Promise.all(
    eventsSnapshot.docs.map(async (doc) => {
      const event = doc.data();
      const attendanceSnapshot = await db
        .collection('event_attendance')
        .where('eventId', '==', doc.id)
        .get();

      return {
        eventId: hashId(doc.id),
        eventType: event.type,
        category: event.category,
        date: event.date,
        attendeeCount: attendanceSnapshot.size,
        region: bucketRegion(event.location)
      };
    })
  );

  return { events, totalEvents: events.length };
}

/**
 * Get challenge progress data (anonymized)
 */
async function getChallengeProgressData(creatorId: string, start: Date, end: Date) {
  const challengesSnapshot = await db
    .collection('challenges')
    .where('creatorId', '==', creatorId)
    .where('createdAt', '>=', start)
    .where('createdAt', '<=', end)
    .get();

  const challenges = await Promise.all(
    challengesSnapshot.docs.map(async (doc) => {
      const challenge = doc.data();
      const participantsSnapshot = await db
        .collection('challenge_participants')
        .where('challengeId', '==', doc.id)
        .get();

      const completedCount = participantsSnapshot.docs.filter(
        d => d.data().completed
      ).length;

      return {
        challengeId: hashId(doc.id),
        challengeType: challenge.type,
        participantCount: participantsSnapshot.size,
        completionRate: participantsSnapshot.size > 0 
          ? (completedCount / participantsSnapshot.size * 100).toFixed(2) 
          : 0,
        startDate: challenge.startDate,
        endDate: challenge.endDate
      };
    })
  );

  return { challenges, totalChallenges: challenges.length };
}

/**
 * Get product sales data (aggregate only)
 */
async function getProductSalesData(creatorId: string, start: Date, end: Date) {
  const salesSnapshot = await db
    .collection('transactions')
    .where('sellerId', '==', creatorId)
    .where('type', '==', 'product_purchase')
    .where('createdAt', '>=', start)
    .where('createdAt', '<=', end)
    .get();

  const productSales: Record<string, any> = {};

  salesSnapshot.docs.forEach(doc => {
    const sale = doc.data();
    const productId = hashId(sale.productId || 'unknown');
    
    if (!productSales[productId]) {
      productSales[productId] = {
        productId,
        totalSales: 0,
        volumeCount: 0,
        regionDistribution: {}
      };
    }

    productSales[productId].totalSales += sale.amount || 0;
    productSales[productId].volumeCount += 1;
    
    const region = bucketRegion(sale.buyerLocation || 'unknown');
    productSales[productId].regionDistribution[region] = 
      (productSales[productId].regionDistribution[region] || 0) + 1;
  });

  return {
    products: Object.values(productSales),
    totalProducts: Object.keys(productSales).length,
    totalRevenue: Object.values(productSales).reduce((sum: number, p: any) => sum + p.totalSales, 0)
  };
}

/**
 * Get club participation counts (no member identities)
 */
async function getClubParticipationData(creatorId: string, start: Date, end: Date) {
  const clubsSnapshot = await db
    .collection('clubs')
    .where('creatorId', '==', creatorId)
    .get();

  const clubs = await Promise.all(
    clubsSnapshot.docs.map(async (doc) => {
      const membersSnapshot = await db
        .collection('club_members')
        .where('clubId', '==', doc.id)
        .where('joinedAt', '>=', start)
        .where('joinedAt', '<=', end)
        .get();

      return {
        clubId: hashId(doc.id),
        memberCount: membersSnapshot.size,
        category: doc.data().category
      };
    })
  );

  return { clubs, totalClubs: clubs.length };
}

/**
 * Get CRM segments (aggregate statistics only)
 */
async function getCRMSegmentsData(creatorId: string, start: Date, end: Date) {
  const segments = [
    { name: 'High Engagement', count: 0, avgSpend: 0 },
    { name: 'Medium Engagement', count: 0, avgSpend: 0 },
    { name: 'Low Engagement', count: 0, avgSpend: 0 }
  ];

  const fansSnapshot = await db
    .collection('fan_profiles')
    .where('creatorId', '==', creatorId)
    .get();

  fansSnapshot.docs.forEach(doc => {
    const fan = doc.data();
    const engagementScore = fan.engagementScore || 0;
    const totalSpent = fan.totalSpent || 0;

    let segment;
    if (engagementScore > 70) segment = segments[0];
    else if (engagementScore > 30) segment = segments[1];
    else segment = segments[2];

    segment.count += 1;
    segment.avgSpend += totalSpent;
  });

  segments.forEach(s => {
    if (s.count > 0) {
      s.avgSpend = Math.round(s.avgSpend / s.count);
    }
  });

  return { segments };
}

/**
 * Get traffic analytics
 */
async function getTrafficAnalyticsData(creatorId: string, start: Date, end: Date) {
  const analyticsSnapshot = await db
    .collection('analytics_daily')
    .where('userId', '==', creatorId)
    .where('date', '>=', start)
    .where('date', '<=', end)
    .orderBy('date', 'asc')
    .get();

  const days = analyticsSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      date: data.date,
      profileViews: data.profileViews || 0,
      contentImpressions: data.contentImpressions || 0,
      linkClicks: data.linkClicks || 0,
      conversionRate: data.conversionRate || 0
    };
  });

  return {
    days,
    totalDays: days.length,
    summary: {
      totalViews: days.reduce((sum, d) => sum + d.profileViews, 0),
      totalImpressions: days.reduce((sum, d) => sum + d.contentImpressions, 0),
      totalClicks: days.reduce((sum, d) => sum + d.linkClicks, 0)
    }
  };
}

/**
 * Get revenue summary (aggregate only)
 */
async function getRevenueSummaryData(creatorId: string, start: Date, end: Date) {
  const transactionsSnapshot = await db
    .collection('transactions')
    .where('sellerId', '==', creatorId)
    .where('createdAt', '>=', start)
    .where('createdAt', '<=', end)
    .get();

  const summary = {
    totalRevenue: 0,
    totalTransactions: transactionsSnapshot.size,
    revenueByType: {} as Record<string, number>,
    revenueByPeriod: {} as Record<string, number>
  };

  transactionsSnapshot.docs.forEach(doc => {
    const tx = doc.data();
    const amount = tx.amount || 0;
    const type = tx.type || 'other';
    const month = new Date(tx.createdAt).toISOString().substring(0, 7);

    summary.totalRevenue += amount;
    summary.revenueByType[type] = (summary.revenueByType[type] || 0) + amount;
    summary.revenueByPeriod[month] = (summary.revenueByPeriod[month] || 0) + amount;
  });

  return { summary };
}

/**
 * Helper: Hash ID for anonymization
 */
function hashId(id: string): string {
  return crypto.createHash('sha256').update(id).digest('hex').substring(0, 16);
}

/**
 * Helper: Bucket region for privacy
 */
function bucketRegion(location: string): string {
  if (!location) return 'Unknown';
  
  const regions: Record<string, string[]> = {
    'North America': ['US', 'CA', 'MX'],
    'Europe': ['UK', 'FR', 'DE', 'ES', 'IT', 'PL'],
    'Asia Pacific': ['JP', 'CN', 'IN', 'AU', 'SG'],
    'Latin America': ['BR', 'AR', 'CL', 'CO'],
    'Middle East': ['AE', 'SA', 'IL'],
    'Africa': ['ZA', 'NG', 'EG']
  };

  for (const [region, countries] of Object.entries(regions)) {
    if (countries.some(c => location.toUpperCase().includes(c))) {
      return region;
    }
  }

  return 'Other';
}

/**
 * Check rate limit
 */
async function checkRateLimit(partnerId: string): Promise<void> {
  const rateLimitRef = db.collection('rate_limits').doc(partnerId);
  const rateLimitDoc = await rateLimitRef.get();

  const now = new Date();
  const partnerDoc = await db.collection('api_partner_profiles').doc(partnerId).get();
  const partner = partnerDoc.data();

  if (!partner) {
    throw new https.HttpsError('not-found', 'Partner not found');
  }

  let rateLimitStatus: RateLimitStatus;

  if (!rateLimitDoc.exists) {
    rateLimitStatus = {
      partnerId,
      requestsLastMinute: 1,
      requestsLastHour: 1,
      requestsLastDay: 1,
      minuteLimit: partner.rateLimit.requestsPerMinute,
      hourLimit: partner.rateLimit.requestsPerHour,
      dayLimit: partner.rateLimit.requestsPerDay,
      throttled: false,
      resetAt: new Date(now.getTime() + 60000),
      lastUpdated: now
    };
    
    await rateLimitRef.set(rateLimitStatus);
    return;
  }

  rateLimitStatus = rateLimitDoc.data() as RateLimitStatus;

  if (rateLimitStatus.requestsLastMinute >= partner.rateLimit.requestsPerMinute ||
      rateLimitStatus.requestsLastHour >= partner.rateLimit.requestsPerHour ||
      rateLimitStatus.requestsLastDay >= partner.rateLimit.requestsPerDay) {
    
    logger.warn('Rate limit exceeded', {
      partnerId,
      minute: rateLimitStatus.requestsLastMinute,
      hour: rateLimitStatus.requestsLastHour,
      day: rateLimitStatus.requestsLastDay
    });

    throw new https.HttpsError(
      'resource-exhausted',
      'Rate limit exceeded. Please try again later.'
    );
  }

  await rateLimitRef.update({
    requestsLastMinute: admin.firestore.FieldValue.increment(1),
    requestsLastHour: admin.firestore.FieldValue.increment(1),
    requestsLastDay: admin.firestore.FieldValue.increment(1),
    lastUpdated: now
  });
}

/**
 * Log access attempt
 */
async function logAccessAttempt(
  partnerId: string,
  integrationId: string,
  dataType: DataPermissionType | string,
  statusCode: number,
  responseTime: number,
  context: any,
  message: string,
  violation?: ViolationType,
  recordCount?: number
): Promise<void> {
  const logId = db.collection('api_access_logs').doc().id;

  const accessLog: APIAccessLog = {
    logId,
    partnerId,
    integrationId,
    creatorId: context.auth?.uid || 'unknown',
    endpoint: 'getIntegrationDataset',
    method: 'POST',
    requestedData: [dataType as DataPermissionType],
    statusCode,
    responseTime,
    dataReturned: statusCode === 200,
    recordCount,
    ipAddress: context.rawRequest?.ip || 'unknown',
    userAgent: context.rawRequest?.headers['user-agent'] || 'unknown',
    timestamp: new Date(),
    anomalyScore: 0,
    flaggedForReview: violation !== undefined,
    violationDetected: violation
  };

  await db.collection('api_access_logs').doc(logId).set(accessLog);

  if (violation) {
    logger.warn('Violation detected', {
      partnerId,
      integrationId,
      violation,
      message
    });
  }
}

/**
 * Get access logs (admin only)
 */
export const getAccessLogs = https.onCall(async (data, context) => {
  try {
    if (!context.auth?.token.admin) {
      throw new https.HttpsError(
        'permission-denied',
        'Only admins can view access logs'
      );
    }

    const { partnerId, integrationId, limit = 100 } = data;

    let query = db.collection('api_access_logs').orderBy('timestamp', 'desc');

    if (partnerId) {
      query = query.where('partnerId', '==', partnerId) as any;
    }

    if (integrationId) {
      query = query.where('integrationId', '==', integrationId) as any;
    }

    const snapshot = await query.limit(limit).get();
    const logs = snapshot.docs.map(doc => doc.data());

    return {
      success: true,
      logs,
      count: logs.length
    };

  } catch (error) {
    logger.error('Error getting access logs', error);
    throw error;
  }
});