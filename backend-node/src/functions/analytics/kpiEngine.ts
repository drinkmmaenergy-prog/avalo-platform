/**
 * PACK 410 - KPI Computation Engine
 * Real-time and historical KPI calculations
 */

import * as admin from 'firebase-admin';
import { KPISnapshot } from '../../types/analytics.types';

const db = admin.firestore();

/**
 * Compute all KPIs for a given period
 */
export async function computeKPIs(
  period: 'hourly' | 'daily' | 'weekly' | 'monthly',
  timestamp?: number
): Promise<KPISnapshot> {
  const now = timestamp || Date.now();
  const periodStart = getPeriodStart(period, now);
  
  try {
    // Compute all metrics in parallel
    const [
      growthMetrics,
      revenueMetrics,
      tokenMetrics,
      creatorMetrics,
      aiMetrics,
      safetyMetrics,
      engagementMetrics,
      compositeScores,
    ] = await Promise.all([
      computeGrowthMetrics(periodStart, now),
      computeRevenueMetrics(periodStart, now),
      computeTokenMetrics(periodStart, now),
      computeCreatorMetrics(periodStart, now),
      computeAIMetrics(periodStart, now),
      computeSafetyMetrics(periodStart, now),
      computeEngagementMetrics(periodStart, now),
      computeCompositeScores(periodStart, now),
    ]);
    
    const kpiSnapshot: KPISnapshot = {
      timestamp: now,
      period,
      ...growthMetrics,
      ...revenueMetrics,
      ...tokenMetrics,
      ...creatorMetrics,
      ...aiMetrics,
      ...safetyMetrics,
      ...engagementMetrics,
      ...compositeScores,
    };
    
    // Store snapshot
    await storeKPISnapshot(kpiSnapshot);
    
    // Check alert thresholds
    await checkAlertThresholds(kpiSnapshot);
    
    return kpiSnapshot;
  } catch (error) {
    console.error('Failed to compute KPIs:', error);
    throw error;
  }
}

/**
 * Compute growth metrics (DAU, WAU, MAU, churn, etc.)
 */
async function computeGrowthMetrics(startTime: number, endTime: number) {
  const lifecycleSnapshot = await db
    .collection('analytics_user_lifecycle')
    .where('lastSeen', '>=', startTime)
    .where('lastSeen', '<=', endTime)
    .get();
  
  const dau = new Set<string>();
  const wau = new Set<string>();
  const mau = new Set<string>();
  let newUsers = 0;
  let churnedUsers = 0;
  
  const oneDayAgo = endTime - 24 * 60 * 60 * 1000;
  const oneWeekAgo = endTime - 7 * 24 * 60 * 60 * 1000;
  const oneMonthAgo = endTime - 30 * 24 * 60 * 60 * 1000;
  
  lifecycleSnapshot.forEach((doc) => {
    const data = doc.data();
    const userId = data.userId;
    
    if (data.lastSeen >= oneDayAgo) {
      dau.add(userId);
    }
    if (data.lastSeen >= oneWeekAgo) {
      wau.add(userId);
    }
    if (data.lastSeen >= oneMonthAgo) {
      mau.add(userId);
    }
    
    if (data.firstSeen >= startTime) {
      newUsers++;
    }
    
    if (data.status === 'churned') {
      churnedUsers++;
    }
  });
  
  const totalUsers = mau.size || 1;
  const churnRate = (churnedUsers / totalUsers) * 100;
  
  // Calculate growth velocity (week-over-week growth rate)
  const previousWeekUsers = await getPreviousWeekUsers(startTime);
  const growthVelocity = previousWeekUsers > 0 
    ? ((wau.size - previousWeekUsers) / previousWeekUsers) * 100 
    : 0;
  
  return {
    dau: dau.size,
    wau: wau.size,
    mau: mau.size,
    newUsers,
    churnRate,
    growthVelocity,
  };
}

/**
 * Compute revenue metrics
 */
async function computeRevenueMetrics(startTime: number, endTime: number) {
  const eventsSnapshot = await db
    .collection('analytics_events')
    .where('timestamp', '>=', startTime)
    .where('timestamp', '<=', endTime)
    .where('revenueImpact', '>', 0)
    .get();
  
  let revenueDaily = 0;
  const payingUsers = new Set<string>();
  
  eventsSnapshot.forEach((doc) => {
    const data = doc.data();
    revenueDaily += data.revenueImpact;
    if (data.revenueImpact > 0) {
      payingUsers.add(data.userId);
    }
  });
  
  // Get monthly revenue
  const monthStart = getPeriodStart('monthly', endTime);
  const monthlyEvents = await db
    .collection('analytics_events')
    .where('timestamp', '>=', monthStart)
    .where('timestamp', '<=', endTime)
    .where('revenueImpact', '>', 0)
    .get();
  
  const revenueMonthly = monthlyEvents.docs.reduce(
    (sum, doc) => sum + doc.data().revenueImpact,
    0
  );
  
  // Get total users for ARPU calculation
  const totalUsers = await getTotalActiveUsers(startTime, endTime);
  const arpu = totalUsers > 0 ? revenueMonthly / totalUsers : 0;
  const arppu = payingUsers.size > 0 ? revenueDaily / payingUsers.size : 0;
  const conversionToPaid = totalUsers > 0 ? (payingUsers.size / totalUsers) * 100 : 0;
  
  return {
    revenueDaily,
    revenueMonthly,
    arpu,
    arppu,
    conversionToPaid,
  };
}

/**
 * Compute token economy metrics
 */
async function computeTokenMetrics(startTime: number, endTime: number) {
  const tokenEvents = await db
    .collection('analytics_events')
    .where('timestamp', '>=', startTime)
    .where('timestamp', '<=', endTime)
    .where('eventType', 'in', ['token_burn', 'token_earn', 'token_purchase'])
    .get();
  
  let tokensBurned = 0;
  let tokensEarned = 0;
  let tokensPurchased = 0;
  
  tokenEvents.forEach((doc) => {
    const data = doc.data();
    const amount = Math.abs(data.revenueImpact);
    
    if (data.eventType === 'token_burn') {
      tokensBurned += amount;
    } else if (data.eventType === 'token_earn') {
      tokensEarned += amount;
    } else if (data.eventType === 'token_purchase') {
      tokensPurchased += amount;
    }
  });
  
  const tokenBalance = tokensPurchased + tokensEarned - tokensBurned;
  const tokenVelocity = tokensPurchased > 0 ? tokensBurned / tokensPurchased : 0;
  
  return {
    tokensBurned,
    tokensEarned,
    tokenBalance,
    tokenVelocity,
  };
}

/**
 * Compute creator economy metrics
 */
async function computeCreatorMetrics(startTime: number, endTime: number) {
  const date = new Date(endTime).toISOString().split('T')[0];
  
  const earningsSnapshot = await db
    .collection('analytics_creator_earnings')
    .where('date', '==', date)
    .get();
  
  let creatorEarnings = 0;
  let activeCreators = 0;
  
  earningsSnapshot.forEach((doc) => {
    const data = doc.data();
    creatorEarnings += data.netEarnings || 0;
    if (data.netEarnings > 0) {
      activeCreators++;
    }
  });
  
  const avgCreatorRevenue = activeCreators > 0 ? creatorEarnings / activeCreators : 0;
  
  return {
    activeCreators,
    creatorEarnings,
    avgCreatorRevenue,
  };
}

/**
 * Compute AI metrics
 */
async function computeAIMetrics(startTime: number, endTime: number) {
  const date = new Date(endTime).toISOString().split('T')[0];
  
  const aiUsageSnapshot = await db
    .collection('analytics_ai_usage')
    .where('date', '==', date)
    .get();
  
  let aiRevenue = 0;
  let aiInteractions = 0;
  
  aiUsageSnapshot.forEach((doc) => {
    const data = doc.data();
    aiRevenue += data.revenue || 0;
    aiInteractions += data.interactions || 0;
  });
  
  const totalRevenue = await getTotalRevenue(startTime, endTime);
  const aiRevenueShare = totalRevenue > 0 ? (aiRevenue / totalRevenue) * 100 : 0;
  
  return {
    aiRevenue,
    aiInteractions,
    aiRevenueShare,
  };
}

/**
 * Compute safety metrics
 */
async function computeSafetyMetrics(startTime: number, endTime: number) {
  const [fraudEvents, safetyEvents, suspensions] = await Promise.all([
    db
      .collection('analytics_events')
      .where('timestamp', '>=', startTime)
      .where('timestamp', '<=', endTime)
      .where('eventType', 'in', ['fraud_detected', 'fraud_blocked'])
      .get(),
    db
      .collection('analytics_safety_events')
      .where('timestamp', '>=', startTime)
      .where('timestamp', '<=', endTime)
      .get(),
    db
      .collection('analytics_events')
      .where('timestamp', '>=', startTime)
      .where('timestamp', '<=', endTime)
      .where('eventType', '==', 'account_suspended')
      .get(),
  ]);
  
  const totalEvents = await getTotalEvents(startTime, endTime);
  const fraudRate = totalEvents > 0 ? (fraudEvents.size / totalEvents) * 100 : 0;
  
  return {
    fraudRate,
    safetyIncidents: safetyEvents.size,
    accountSuspensions: suspensions.size,
  };
}

/**
 * Compute engagement metrics
 */
async function computeEngagementMetrics(startTime: number, endTime: number) {
  const [meetingEvents, chatEvents, sessions] = await Promise.all([
    db
      .collection('analytics_events')
      .where('timestamp', '>=', startTime)
      .where('timestamp', '<=', endTime)
      .where('eventType', 'in', ['meeting_created', 'meeting_booked', 'meeting_completed'])
      .get(),
    db
      .collection('analytics_events')
      .where('timestamp', '>=', startTime)
      .where('timestamp', '<=', endTime)
      .where('eventType', 'in', ['chat_message_sent', 'chat_unlock'])
      .get(),
    db
      .collection('analytics_events')
      .where('timestamp', '>=', startTime)
      .where('timestamp', '<=', endTime)
      .get(),
  ]);
  
  // Calculate calendar utilization (meetings / total possible meeting slots)
  const totalMeetingSlots = 100; // Placeholder - should be calculated based on creator availability
  const calendarUtilization = (meetingEvents.size / totalMeetingSlots) * 100;
  
  // Calculate chat monetization yield (revenue per chat interaction)
  let chatRevenue = 0;
  chatEvents.forEach((doc) => {
    chatRevenue += doc.data().revenueImpact || 0;
  });
  const chatMonetizationYield = chatEvents.size > 0 ? chatRevenue / chatEvents.size : 0;
  
  // Calculate average session length
  const sessionMap = new Map<string, { start: number; end: number }>();
  sessions.forEach((doc) => {
    const data = doc.data();
    const sessionId = data.sessionId;
    const timestamp = data.timestamp;
    
    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, { start: timestamp, end: timestamp });
    } else {
      const session = sessionMap.get(sessionId)!;
      session.end = Math.max(session.end, timestamp);
    }
  });
  
  let totalSessionLength = 0;
  sessionMap.forEach((session) => {
    totalSessionLength += session.end - session.start;
  });
  const avgSessionLength = sessionMap.size > 0 
    ? totalSessionLength / sessionMap.size / 1000 / 60 // Convert to minutes
    : 0;
  
  return {
    calendarUtilization,
    chatMonetizationYield,
    avgSessionLength,
  };
}

/**
 * Compute composite scores
 */
async function computeCompositeScores(startTime: number, endTime: number) {
  // Platform Health Score (0-100)
  // Factors: uptime, error rate, response time, user satisfaction
  const errorEvents = await db
    .collection('analytics_events')
    .where('timestamp', '>=', startTime)
    .where('timestamp', '<=', endTime)
    .where('eventType', '==', 'error_occurred')
    .get();
  
  const totalEvents = await getTotalEvents(startTime, endTime);
  const errorRate = totalEvents > 0 ? (errorEvents.size / totalEvents) : 0;
  const platformHealthScore = Math.max(0, 100 - (errorRate * 1000));
  
  // Creator Economy Score (0-100)
  // Factors: active creators, earnings growth, satisfaction
  const creatorMetrics = await computeCreatorMetrics(startTime, endTime);
  const creatorEconomyScore = Math.min(100, 
    (creatorMetrics.activeCreators * 0.3) + 
    (Math.min(creatorMetrics.avgCreatorRevenue / 100, 50)) +
    20 // Base score
  );
  
  // Trust & Safety Score (0-100)
  const safetyMetrics = await computeSafetyMetrics(startTime, endTime);
  const trustSafetyScore = Math.max(0, 
    100 - (safetyMetrics.fraudRate * 10) - (safetyMetrics.safetyIncidents * 0.1)
  );
  
  // Liquidity Score (0-100)
  // Factors: wallet balance, transaction volume, payout success rate
  const walletFlows = await db
    .collection('analytics_wallet_flow')
    .where('timestamp', '>=', startTime)
    .where('timestamp', '<=', endTime)
    .get();
  
  let totalInflow = 0;
  let totalOutflow = 0;
  
  walletFlows.forEach((doc) => {
    const data = doc.data();
    if (data.type === 'inflow') {
      totalInflow += data.amount;
    } else {
      totalOutflow += data.amount;
    }
  });
  
  const liquidityRatio = totalInflow > 0 ? totalOutflow / totalInflow : 0;
  const liquidityScore = Math.min(100, liquidityRatio * 100);
  
  return {
    platformHealthScore,
    creatorEconomyScore,
    trustSafetyScore,
    liquidityScore,
  };
}

/**
 * Store KPI snapshot
 */
async function storeKPISnapshot(snapshot: KPISnapshot): Promise<void> {
  const docId = `${snapshot.period}_${snapshot.timestamp}`;
  await db.collection('analytics_kpi_snapshots').doc(docId).set(snapshot);
}

/**
 * Check alert thresholds
 */
async function checkAlertThresholds(snapshot: KPISnapshot): Promise<void> {
  const thresholds = await db.collection('analytics_alert_thresholds').where('enabled', '==', true).get();
  
  const alerts: any[] = [];
  
  thresholds.forEach((doc) => {
    const threshold = doc.data();
    const metricValue = (snapshot as any)[threshold.metricId];
    
    if (metricValue !== undefined) {
      let triggered = false;
      
      if (threshold.condition === 'above' && metricValue > threshold.threshold) {
        triggered = true;
      } else if (threshold.condition === 'below' && metricValue < threshold.threshold) {
        triggered = true;
      } else if (threshold.condition === 'equals' && metricValue === threshold.threshold) {
        triggered = true;
      }
      
      if (triggered) {
        alerts.push({
          thresholdId: doc.id,
          metricId: threshold.metricId,
          metricValue,
          threshold: threshold.threshold,
          condition: threshold.condition,
          channels: threshold.channels,
          recipients: threshold.recipients,
          timestamp: snapshot.timestamp,
        });
      }
    }
  });
  
  // Send alerts
  if (alerts.length > 0) {
    await sendAlerts(alerts);
  }
}

/**
 * Send alerts to configured channels
 */
async function sendAlerts(alerts: any[]): Promise<void> {
  // Store alerts
  const batch = db.batch();
  alerts.forEach((alert) => {
    const alertRef = db.collection('analytics_alerts').doc();
    batch.set(alertRef, { ...alert, sentAt: Date.now() });
  });
  await batch.commit();
  
  // TODO: Implement Slack/Email/SMS notifications
  console.log('Alerts triggered:', alerts);
}

// Helper functions

function getPeriodStart(period: 'hourly' | 'daily' | 'weekly' | 'monthly', timestamp: number): number {
  const date = new Date(timestamp);
  
  switch (period) {
    case 'hourly':
      date.setMinutes(0, 0, 0);
      break;
    case 'daily':
      date.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      date.setDate(date.getDate() - date.getDay());
      date.setHours(0, 0, 0, 0);
      break;
    case 'monthly':
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      break;
  }
  
  return date.getTime();
}

async function getPreviousWeekUsers(currentPeriodStart: number): Promise<number> {
  const previousWeekStart = currentPeriodStart - 7 * 24 * 60 * 60 * 1000;
  const previousWeekEnd = currentPeriodStart - 1;
  
  const snapshot = await db
    .collection('analytics_user_lifecycle')
    .where('lastSeen', '>=', previousWeekStart)
    .where('lastSeen', '<=', previousWeekEnd)
    .get();
  
  return snapshot.size;
}

async function getTotalActiveUsers(startTime: number, endTime: number): Promise<number> {
  const snapshot = await db
    .collection('analytics_user_lifecycle')
    .where('lastSeen', '>=', startTime)
    .where('lastSeen', '<=', endTime)
    .get();
  
  return snapshot.size;
}

async function getTotalRevenue(startTime: number, endTime: number): Promise<number> {
  const snapshot = await db
    .collection('analytics_events')
    .where('timestamp', '>=', startTime)
    .where('timestamp', '<=', endTime)
    .where('revenueImpact', '>', 0)
    .get();
  
  return snapshot.docs.reduce((sum, doc) => sum + doc.data().revenueImpact, 0);
}

async function getTotalEvents(startTime: number, endTime: number): Promise<number> {
  const snapshot = await db
    .collection('analytics_events')
    .where('timestamp', '>=', startTime)
    .where('timestamp', '<=', endTime)
    .get();
  
  return snapshot.size;
}

/**
 * Schedule KPI computation (called by Cloud Scheduler)
 */
export async function scheduleKPIComputation(): Promise<void> {
  const now = Date.now();
  
  // Compute all periods
  await Promise.all([
    computeKPIs('hourly', now),
    computeKPIs('daily', now),
    computeKPIs('weekly', now),
    computeKPIs('monthly', now),
  ]);
}
