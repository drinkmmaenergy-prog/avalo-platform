/**
 * PACK 183 — Latency Predictor
 * Predictive analytics for load spikes and latency issues
 */

import { db, serverTimestamp } from './init';
import { LoadMetrics } from './pack183-traffic-monitor';

export interface LatencyPrediction {
  timestamp: FirebaseFirestore.Timestamp;
  region: string;
  component: 'CHAT' | 'AI' | 'FEED' | 'EVENTS' | 'PAYMENTS' | 'MEDIA';
  predictedLatencyMs: number;
  confidence: number;
  factors: string[];
  recommendation: 'NONE' | 'MONITOR' | 'SCALE_PROACTIVE' | 'URGENT_SCALE';
}

export interface TimePatterns {
  hourOfDay: number;
  dayOfWeek: number;
  isWeekend: boolean;
  isHoliday: boolean;
  avgLoad: number;
  peakLoad: number;
}

/**
 * Analyze historical patterns to predict load
 */
export async function predictLatencySpike(
  region: string,
  component: string,
  lookaheadMinutes: number = 30
): Promise<LatencyPrediction | null> {
  try {
    const now = new Date();
    const historicalData = await getHistoricalPatterns(region, component, now);
    
    if (historicalData.length < 10) {
      return null;
    }

    const currentTrend = calculateTrend(historicalData);
    const seasonalPattern = detectSeasonalPattern(now);
    const predicted = predictLoad(currentTrend, seasonalPattern, lookaheadMinutes);

    const factors = [];
    let recommendation: LatencyPrediction['recommendation'] = 'NONE';

    if (seasonalPattern.isWeekend) {
      factors.push('WEEKEND_TRAFFIC');
    }

    if (seasonalPattern.isPeakHour) {
      factors.push('PEAK_HOUR');
    }

    if (currentTrend.direction === 'INCREASING') {
      factors.push('UPWARD_TREND');
    }

    if (predicted.latencyMs > 1000) {
      recommendation = 'SCALE_PROACTIVE';
      factors.push('HIGH_LATENCY_PREDICTED');
    }

    if (predicted.latencyMs > 2000) {
      recommendation = 'URGENT_SCALE';
      factors.push('CRITICAL_LATENCY_PREDICTED');
    }

    return {
      timestamp: serverTimestamp() as FirebaseFirestore.Timestamp,
      region,
      component: component as LatencyPrediction['component'],
      predictedLatencyMs: predicted.latencyMs,
      confidence: predicted.confidence,
      factors,
      recommendation,
    };
  } catch (error) {
    console.error('[LatencyPredictor] Error predicting latency:', error);
    return null;
  }
}

/**
 * Get historical load patterns
 */
async function getHistoricalPatterns(
  region: string,
  component: string,
  currentTime: Date
): Promise<LoadMetrics[]> {
  const pastWeek = new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  const snapshot = await db.collection('load_logs')
    .where('region', '==', region)
    .where('createdAt', '>', pastWeek)
    .orderBy('createdAt', 'desc')
    .limit(1000)
    .get();

  return snapshot.docs.map(doc => doc.data() as LoadMetrics);
}

/**
 * Calculate load trend
 */
function calculateTrend(data: LoadMetrics[]): {
  direction: 'INCREASING' | 'DECREASING' | 'STABLE';
  rate: number;
} {
  if (data.length < 2) {
    return { direction: 'STABLE', rate: 0 };
  }

  const recent = data.slice(0, 10);
  const older = data.slice(-10);

  const recentAvg = recent.reduce((sum, m) => sum + m.avgResponseTimeMs, 0) / recent.length;
  const olderAvg = older.reduce((sum, m) => sum + m.avgResponseTimeMs, 0) / older.length;

  const rate = (recentAvg - olderAvg) / olderAvg;

  if (rate > 0.1) {
    return { direction: 'INCREASING', rate };
  } else if (rate < -0.1) {
    return { direction: 'DECREASING', rate };
  }

  return { direction: 'STABLE', rate };
}

/**
 * Detect seasonal patterns
 */
function detectSeasonalPattern(time: Date): {
  isPeakHour: boolean;
  isWeekend: boolean;
  hourOfDay: number;
} {
  const hour = time.getHours();
  const day = time.getDay();

  const isPeakHour = (hour >= 18 && hour <= 23) || (hour >= 11 && hour <= 14);
  const isWeekend = day === 0 || day === 6;

  return {
    isPeakHour,
    isWeekend,
    hourOfDay: hour,
  };
}

/**
 * Predict future load
 */
function predictLoad(
  trend: { direction: string; rate: number },
  seasonal: { isPeakHour: boolean; isWeekend: boolean },
  lookaheadMinutes: number
): { latencyMs: number; confidence: number } {
  let baseLatency = 200;

  if (trend.direction === 'INCREASING') {
    baseLatency += Math.abs(trend.rate) * 500;
  } else if (trend.direction === 'DECREASING') {
    baseLatency -= Math.abs(trend.rate) * 200;
  }

  if (seasonal.isPeakHour) {
    baseLatency *= 1.5;
  }

  if (seasonal.isWeekend) {
    baseLatency *= 1.3;
  }

  const timeMultiplier = 1 + (lookaheadMinutes / 60) * 0.2;
  const predictedLatency = baseLatency * timeMultiplier;

  const confidence = trend.direction === 'STABLE' ? 0.7 : 0.85;

  return {
    latencyMs: Math.round(predictedLatency),
    confidence,
  };
}

/**
 * Analyze time-based patterns for better prediction
 */
export async function analyzeTimePatterns(
  region: string,
  component: string
): Promise<TimePatterns[]> {
  const patterns: TimePatterns[] = [];

  for (let hour = 0; hour < 24; hour++) {
    const pattern = await getHourlyPattern(region, component, hour);
    patterns.push(pattern);
  }

  return patterns;
}

/**
 * Get hourly pattern statistics
 */
async function getHourlyPattern(
  region: string,
  component: string,
  hour: number
): Promise<TimePatterns> {
  const pastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const snapshot = await db.collection('load_logs')
    .where('region', '==', region)
    .where('createdAt', '>', pastMonth)
    .limit(1000)
    .get();

  const hourlyData = snapshot.docs
    .map(doc => doc.data() as LoadMetrics)
    .filter(m => {
      const timestamp = (m.timestamp as any).toDate();
      return timestamp.getHours() === hour;
    });

  if (hourlyData.length === 0) {
    return {
      hourOfDay: hour,
      dayOfWeek: 0,
      isWeekend: false,
      isHoliday: false,
      avgLoad: 0,
      peakLoad: 0,
    };
  }

  const loads = hourlyData.map(m => m.activeUsers);
  const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
  const peakLoad = Math.max(...loads);

  return {
    hourOfDay: hour,
    dayOfWeek: new Date().getDay(),
    isWeekend: false,
    isHoliday: false,
    avgLoad,
    peakLoad,
  };
}

/**
 * Store prediction for historical analysis
 */
export async function storePrediction(prediction: LatencyPrediction): Promise<void> {
  await db.collection('latency_predictions').add({
    ...prediction,
    createdAt: serverTimestamp(),
  });
}

/**
 * Validate prediction accuracy
 */
export async function validatePredictions(
  region: string,
  hoursBack: number = 24
): Promise<{ accuracy: number; avgError: number }> {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const [predictionsSnapshot, actualsSnapshot] = await Promise.all([
    db.collection('latency_predictions')
      .where('region', '==', region)
      .where('createdAt', '>', cutoff)
      .get(),
    db.collection('load_logs')
      .where('region', '==', region)
      .where('createdAt', '>', cutoff)
      .get(),
  ]);

  const predictions = predictionsSnapshot.docs.map(d => d.data() as LatencyPrediction);
  const actuals = actualsSnapshot.docs.map(d => d.data() as LoadMetrics);

  if (predictions.length === 0 || actuals.length === 0) {
    return { accuracy: 0, avgError: 0 };
  }

  let totalError = 0;
  let matches = 0;

  predictions.forEach(pred => {
    const predTime = (pred.timestamp as any).toDate().getTime();
    const closest = actuals.reduce((closest, actual) => {
      const actualTime = (actual.timestamp as any).toDate().getTime();
      const closestTime = (closest.timestamp as any).toDate().getTime();
      return Math.abs(actualTime - predTime) < Math.abs(closestTime - predTime)
        ? actual
        : closest;
    });

    const error = Math.abs(pred.predictedLatencyMs - closest.avgResponseTimeMs);
    totalError += error;
    matches++;
  });

  const avgError = matches > 0 ? totalError / matches : 0;
  const accuracy = Math.max(0, 1 - (avgError / 1000));

  return { accuracy, avgError };
}

/**
 * Get peak hours for proactive scaling
 */
export function getPeakHours(): number[] {
  return [11, 12, 13, 18, 19, 20, 21, 22, 23];
}

/**
 * Check if current time is approaching peak
 */
export function isApproachingPeak(minutesAhead: number = 30): boolean {
  const now = new Date();
  const future = new Date(now.getTime() + minutesAhead * 60000);
  const futureHour = future.getHours();
  
  return getPeakHours().includes(futureHour);
}