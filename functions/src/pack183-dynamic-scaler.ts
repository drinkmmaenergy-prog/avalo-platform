import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 183 — Dynamic Scaler
 * Auto-scaling logic based on real-time load
 */

import { db, serverTimestamp } from './init';
import * as functions from 'firebase-functions';
import { LoadMetrics, TrafficAlert } from './pack183-traffic-monitor';
import { Timestamp, timestamp, logger, onSchedule } from './runtime';

export interface ScalingDecision {
  component: 'CHAT' | 'AI' | 'FEED' | 'EVENTS' | 'PAYMENTS' | 'MEDIA';
  action: 'SCALE_UP' | 'SCALE_DOWN' | 'MAINTAIN';
  currentCapacity: number;
  targetCapacity: number;
  reason: string;
  timestamp: FirebaseFirestore.Timestamp;
  region: string;
}

export interface ScalingEvent {
  decisionId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  component: string;
  action: string;
  startedAt: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  error?: string;
}

const SCALING_THRESHOLDS = {
  CHAT: {
    scaleUpAt: 0.75,
    scaleDownAt: 0.25,
    minInstances: 2,
    maxInstances: 20,
  },
  AI: {
    scaleUpAt: MONETIZATION_SPLITS.EVENT_TICKET.earner,
    scaleDownAt: MONETIZATION_SPLITS.SUBSCRIPTION.platform,
    minInstances: 3,
    maxInstances: 30,
  },
  FEED: {
    scaleUpAt: MONETIZATION_SPLITS.SUBSCRIPTION.earner,
    scaleDownAt: MONETIZATION_SPLITS.EVENT_TICKET.platform,
    minInstances: 2,
    maxInstances: 15,
  },
  EVENTS: {
    scaleUpAt: 0.85,
    scaleDownAt: 0.25,
    minInstances: 1,
    maxInstances: 10,
  },
  PAYMENTS: {
    scaleUpAt: 0.75,
    scaleDownAt: MONETIZATION_SPLITS.SUBSCRIPTION.platform,
    minInstances: 2,
    maxInstances: 10,
  },
  MEDIA: {
    scaleUpAt: MONETIZATION_SPLITS.SUBSCRIPTION.earner,
    scaleDownAt: 0.25,
    minInstances: 2,
    maxInstances: 15,
  },
};

/**
 * Determine scaling decision based on load
 */
export function determineScaling(
  component: keyof typeof SCALING_THRESHOLDS,
  currentLoad: number,
  currentCapacity: number,
  region: string
): ScalingDecision | null {
  const thresholds = SCALING_THRESHOLDS[component];
  const utilizationRate = currentLoad / currentCapacity;

  if (utilizationRate >= thresholds.scaleUpAt && currentCapacity < thresholds.maxInstances) {
    const targetCapacity = Math.min(
      Math.ceil(currentCapacity * 1.5),
      thresholds.maxInstances
    );

    return {
      component,
      action: 'SCALE_UP',
      currentCapacity,
      targetCapacity,
      reason: `Utilization at ${(utilizationRate * 100).toFixed(1)}% (threshold: ${thresholds.scaleUpAt * 100}%)`,
      timestamp: serverTimestamp() as FirebaseFirestore.Timestamp,
      region,
    };
  }

  if (utilizationRate <= thresholds.scaleDownAt && currentCapacity > thresholds.minInstances) {
    const targetCapacity = Math.max(
      Math.floor(currentCapacity * 0.75),
      thresholds.minInstances
    );

    return {
      component,
      action: 'SCALE_DOWN',
      currentCapacity,
      targetCapacity,
      reason: `Utilization at ${(utilizationRate * 100).toFixed(1)}% (threshold: ${thresholds.scaleDownAt * 100}%)`,
      timestamp: serverTimestamp() as FirebaseFirestore.Timestamp,
      region,
    };
  }

  return;
}

/**
 * Execute scaling decision
 */
export async function executeScaling(decision: ScalingDecision): Promise<ScalingEvent> {
  const eventRef = await db.collection('scaling_events').add({
    component: decision.component,
    action: decision.action,
    currentCapacity: decision.currentCapacity,
    targetCapacity: decision.targetCapacity,
    reason: decision.reason,
    region: decision.region,
    status: 'PENDING',
    startedAt: serverTimestamp(),
  });

  try {
    await db.doc(`scaling_events/${eventRef.id}`).update({
      status: 'IN_PROGRESS',
    });

    await updateComponentCapacity(
      decision.component,
      decision.targetCapacity,
      decision.region
    );

    await db.doc(`scaling_events/${eventRef.id}`).update({
      status: 'COMPLETED',
      completedAt: serverTimestamp(),
    });

    console.log(
      `[Scaler] ${decision.action} ${decision.component} from ${decision.currentCapacity} to ${decision.targetCapacity} in ${decision.region}`
    );

    return {
      decisionId: eventRef.id,
      status: 'COMPLETED',
      component: decision.component,
      action: decision.action,
      startedAt: serverTimestamp() as FirebaseFirestore.Timestamp,
      completedAt: serverTimestamp() as FirebaseFirestore.Timestamp,
    };
  } catch (error: any) {
    await db.doc(`scaling_events/${eventRef.id}`).update({
      status: 'FAILED',
      error: error.message,
      completedAt: serverTimestamp(),
    });

    console.error(`[Scaler] Failed to scale ${decision.component}:`, error);

    console.log('Scheduled job result:', {
      decisionId: eventRef.id,
      status: 'FAILED',
      component: decision.component,
      action: decision.action,
      startedAt: serverTimestamp() as FirebaseFirestore.Timestamp,
      error: error.message,
    });


    return;
  }
}

/**
 * Update component capacity in configuration
 */
async function updateComponentCapacity(
  component: string,
  targetCapacity: number,
  region: string
): Promise<void> {
  await db.collection('scaling_config').doc(region).set(
    {
      [component]: {
        capacity: targetCapacity,
        lastUpdated: serverTimestamp(),
      },
    },
    { merge: true }
  );
}

/**
 * Get current capacity for component
 */
export async function getComponentCapacity(
  component: string,
  region: string
): Promise<number> {
  const doc = await db.collection('scaling_config').doc(region).get();
  
  if (!doc.exists) {
    return SCALING_THRESHOLDS[component as keyof typeof SCALING_THRESHOLDS]?.minInstances || 2;
  }

  const data = doc.data();
  return data?.[component]?.capacity || 
    SCALING_THRESHOLDS[component as keyof typeof SCALING_THRESHOLDS]?.minInstances || 2;
}

/**
 * Analyze and execute auto-scaling
 */
export async function autoScale(metrics: LoadMetrics): Promise<ScalingEvent[]> {
  const events: ScalingEvent[] = [];
  const components: Array<keyof typeof SCALING_THRESHOLDS> = [
    'CHAT',
    'AI',
    'FEED',
    'EVENTS',
    'PAYMENTS',
    'MEDIA',
  ];

  for (const component of components) {
    try {
      const currentCapacity = await getComponentCapacity(component, metrics.region);
      const currentLoad = getComponentLoad(component, metrics);

      const decision = determineScaling(
        component,
        currentLoad,
        currentCapacity,
        metrics.region
      );

      if (decision) {
        const event = await executeScaling(decision);
        events.push(event);
      }
    } catch (error) {
      console.error(`[AutoScale] Error scaling ${component}:`, error);
    }
  }

  return events;
}

/**
 * Extract component load from metrics
 */
function getComponentLoad(
  component: keyof typeof SCALING_THRESHOLDS,
  metrics: LoadMetrics
): number {
  switch (component) {
    case 'CHAT':
      return metrics.activeChatSessions;
    case 'AI':
      return metrics.aiRequestsPerMinute;
    case 'FEED':
      return metrics.feedScrollsPerMinute;
    case 'EVENTS':
      return metrics.eventConcurrentUsers;
    case 'PAYMENTS':
      return metrics.paymentsPerMinute;
    case 'MEDIA':
      return metrics.feedScrollsPerMinute * 0.5;
    default:
      return 0;
  }
}

/**
 * Get scaling history
 */
export async function getScalingHistory(
  region: string,
  hours: number = 24
): Promise<ScalingEvent[]> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const snapshot = await db.collection('scaling_events')
    .where('region', '==', region)
    .where('startedAt', '>', cutoff)
    .orderBy('startedAt', 'desc')
    .limit(100)
    .get();

  return snapshot.docs.map(doc => ({
    decisionId: doc.id,
    ...doc.data(),
  })) as ScalingEvent[];
}

/**
 * Cloud Function: Auto-scale based on load (scheduled every 5 minutes)
 */
export const autoScaleSystem = onSchedule("every 5 minutes", async (event) => {
    console.log('[AutoScale] Starting auto-scaling check...');
    
    const regions = ['EU', 'US', 'ASIA'];
    let totalEvents = 0;

    for (const region of regions) {
      try {
        const recentLogsSnapshot = await db.collection('load_logs')
          .where('region', '==', region)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        if (recentLogsSnapshot.empty) {
          console.log(`[AutoScale] No recent metrics for ${region}`);
          continue;
        }

        const latestMetrics = recentLogsSnapshot.docs[0].data() as LoadMetrics;
        const events = await autoScale(latestMetrics);
        totalEvents += events.length;

        if (events.length > 0) {
          console.log(`[AutoScale] ${region} - Executed ${events.length} scaling actions`);
        }
      } catch (error) {
        console.error(`[AutoScale] Error in ${region}:`, error);
      }
    }

    console.log('Scheduled job result:', {
      success: true,
      totalEvents,
      timestamp: new Date().toISOString(),
    });


    return;
  });




























