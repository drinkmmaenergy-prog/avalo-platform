/**
 * PACK 410 - Fraud & Risk Feed Integration
 * Streams analytics to Pack 281 Risk Graph and Pack 302 Fraud Engine
 */

import * as admin from 'firebase-admin';
import { AnalyticsEvent, FraudSignal } from '../../types/analytics.types';

const db = admin.firestore();

/**
 * Stream event to fraud detection systems
 */
export async function streamToFraudSystems(event: AnalyticsEvent): Promise<void> {
  // Check if event warrants fraud analysis
  if (shouldAnalyzeForFraud(event)) {
    await Promise.all([
      streamToRiskGraph(event),
      streamToFraudEngine(event),
    ]);
  }
}

/**
 * Determine if event should be analyzed for fraud
 */
function shouldAnalyzeForFraud(event: AnalyticsEvent): boolean {
  const highRiskEvents = [
    'wallet_deposit',
    'wallet_withdrawal',
    'token_purchase',
    'payout_initiated',
    'meeting_cancelled',
    'fraud_detected',
    'account_suspended',
  ];
  
  return (
    highRiskEvents.includes(event.eventType) ||
    event.riskScore > 50 ||
    (event.revenueImpact > 1000) // High value transactions
  );
}

/**
 * Stream to Pack 281 - Risk Graph
 */
async function streamToRiskGraph(event: AnalyticsEvent): Promise<void> {
  try {
    const riskNode = {
      id: event.eventId,
      userId: event.userId,
      timestamp: event.timestamp,
      eventType: event.eventType,
      score: event.riskScore,
      metadata: {
        geo: event.geo,
        device: event.device,
        revenueImpact: event.revenueImpact,
      },
    };
    
    // Write to risk graph collection
    await db.collection('risk_graph_nodes').add(riskNode);
    
    // Update user risk profile
    await updateUserRiskProfile(event.userId, event.riskScore);
    
  } catch (error) {
    console.error('Failed to stream to risk graph:', error);
  }
}

/**
 * Stream to Pack 302 - Fraud Engine
 */
async function streamToFraudEngine(event: AnalyticsEvent): Promise<void> {
  try {
    const fraudSignal: FraudSignal = {
      userId: event.userId,
      timestamp: event.timestamp,
      signalType: 'analytics_event',
      severity: event.riskScore,
      indicators: detectFraudIndicators(event),
      metadata: {
        eventId: event.eventId,
        eventType: event.eventType,
        sourcePack: event.sourcePack,
        ...event.metadata,
      },
      actionRequired: event.riskScore > 75,
    };
    
    // Write to fraud signals collection
    await db.collection('fraud_signals').add(fraudSignal);
    
    // If critical, trigger immediate review
    if (fraudSignal.actionRequired) {
      await triggerFraudReview(fraudSignal);
    }
    
  } catch (error) {
    console.error('Failed to stream to fraud engine:', error);
  }
}

/**
 * Detect fraud indicators from event
 */
function detectFraudIndicators(event: AnalyticsEvent): string[] {
  const indicators: string[] = [];
  
  // Abnormal wallet flows
  if (event.eventType === 'wallet_withdrawal' && event.revenueImpact > 5000) {
    indicators.push('large_withdrawal');
  }
  
  // Repeated refunds
  if (event.metadata.refundCount > 3) {
    indicators.push('repeated_refunds');
  }
  
  // Fake meetings
  if (event.eventType === 'meeting_no_show' && event.metadata.noShowCount > 5) {
    indicators.push('repeated_no_shows');
  }
  
  // AI abuse
  if (event.eventType === 'ai_interaction' && event.metadata.interactionCount > 1000) {
    indicators.push('ai_abuse');
  }
  
  // Support abuse
  if (event.eventType === 'support_ticket_created' && event.metadata.ticketCount > 10) {
    indicators.push('support_abuse');
  }
  
  // Review manipulation
  if (event.metadata.suspiciousReviewPattern) {
    indicators.push('review_manipulation');
  }
  
  // Velocity checks
  if (event.metadata.actionsPerHour > 100) {
    indicators.push('high_velocity');
  }
  
  // Geo anomalies
  if (event.metadata.geoAnomaly) {
    indicators.push('geo_anomaly');
  }
  
  // Device fingerprint changes
  if (event.metadata.deviceFingerprintChange) {
    indicators.push('device_change');
  }
  
  return indicators;
}

/**
 * Update user risk profile
 */
async function updateUserRiskProfile(userId: string, riskScore: number): Promise<void> {
  const profileRef = db.collection('user_risk_profiles').doc(userId);
  
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(profileRef);
    
    if (!doc.exists) {
      transaction.set(profileRef, {
        userId,
        currentRiskScore: riskScore,
        maxRiskScore: riskScore,
        avgRiskScore: riskScore,
        eventCount: 1,
        lastUpdated: Date.now(),
        flags: [],
      });
    } else {
      const data = doc.data()!;
      const newAvg = ((data.avgRiskScore * data.eventCount) + riskScore) / (data.eventCount + 1);
      
      transaction.update(profileRef, {
        currentRiskScore: riskScore,
        maxRiskScore: Math.max(data.maxRiskScore, riskScore),
        avgRiskScore: newAvg,
        eventCount: admin.firestore.FieldValue.increment(1),
        lastUpdated: Date.now(),
      });
    }
  });
}

/**
 * Trigger immediate fraud review
 */
async function triggerFraudReview(signal: FraudSignal): Promise<void> {
  // Create fraud review ticket
  await db.collection('fraud_reviews').add({
    signalId: signal.userId,
    userId: signal.userId,
    severity: signal.severity,
    indicators: signal.indicators,
    status: 'pending',
    createdAt: Date.now(),
    assignedTo: null,
    notes: [],
  });
  
  // Send alert to fraud team
  await sendFraudAlert(signal);
}

/**
 * Send fraud alert to admin team
 */
async function sendFraudAlert(signal: FraudSignal): Promise<void> {
  // Create alert in analytics_alerts collection
  await db.collection('analytics_alerts').add({
    type: 'fraud',
    severity: 'critical',
    userId: signal.userId,
    indicators: signal.indicators,
    timestamp: signal.timestamp,
    message: `Critical fraud signal detected for user ${signal.userId}`,
    channels: ['slack', 'email'],
  });
  
  // TODO: Implement Slack/Email notification integration
  console.log('Fraud alert sent:', signal);
}

/**
 * Get fraud statistics for analytics dashboard
 */
export async function getFraudStatistics(startTime: number, endTime: number): Promise<any> {
  const signals = await db
    .collection('fraud_signals')
    .where('timestamp', '>=', startTime)
    .where('timestamp', '<=', endTime)
    .get();
  
  const stats = {
    totalSignals: signals.size,
    criticalSignals: 0,
    topIndicators: new Map<string, number>(),
    affectedUsers: new Set<string>(),
  };
  
  signals.forEach((doc) => {
    const signal = doc.data();
    
    if (signal.actionRequired) {
      stats.criticalSignals++;
    }
    
    stats.affectedUsers.add(signal.userId);
    
    signal.indicators.forEach((indicator: string) => {
      const count = stats.topIndicators.get(indicator) || 0;
      stats.topIndicators.set(indicator, count + 1);
    });
  });
  
  return {
    totalSignals: stats.totalSignals,
    criticalSignals: stats.criticalSignals,
    affectedUserCount: stats.affectedUsers.size,
    topIndicators: Array.from(stats.topIndicators.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
  };
}

/**
 * Analyze wallet flow anomalies
 */
export async function analyzeWalletAnomalies(userId: string): Promise<any> {
  const flows = await db
    .collection('analytics_wallet_flow')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(100)
    .get();
  
  let totalInflow = 0;
  let totalOutflow = 0;
  let flaggedTransactions = 0;
  const velocityCheck = new Map<string, number>();
  
  flows.forEach((doc) => {
    const flow = doc.data();
    
    if (flow.type === 'inflow') {
      totalInflow += flow.amount;
    } else {
      totalOutflow += flow.amount;
    }
    
    if (flow.flagged) {
      flaggedTransactions++;
    }
    
    // Check velocity (transactions per hour)
    const hourKey = new Date(flow.timestamp).toISOString().slice(0, 13);
    velocityCheck.set(hourKey, (velocityCheck.get(hourKey) || 0) + 1);
  });
  
  const maxVelocity = Math.max(...Array.from(velocityCheck.values()));
  
  return {
    totalInflow,
    totalOutflow,
    netFlow: totalInflow - totalOutflow,
    flaggedTransactions,
    maxHourlyVelocity: maxVelocity,
    anomalyScore: calculateAnomalyScore({
      totalInflow,
      totalOutflow,
      flaggedTransactions,
      maxVelocity,
    }),
  };
}

/**
 * Calculate anomaly score based on wallet patterns
 */
function calculateAnomalyScore(params: {
  totalInflow: number;
  totalOutflow: number;
  flaggedTransactions: number;
  maxVelocity: number;
}): number {
  let score = 0;
  
  // Large discrepancy between inflow and outflow
  const flowRatio = params.totalOutflow / (params.totalInflow || 1);
  if (flowRatio > 0.9) {
    score += 30; // High withdrawal rate
  }
  
  // Flagged transactions
  score += params.flaggedTransactions * 10;
  
  // High velocity
  if (params.maxVelocity > 20) {
    score += 40;
  }
  
  return Math.min(score, 100);
}
