/**
 * PACK 423 — Observability & Metrics
 * Integration with PACK 421 telemetry pipeline
 */

import { InteractionType } from '../../shared/types/pack423-ratings.types';

/**
 * Emit metrics through the unified telemetry pipeline (PACK 421)
 * These metrics will be tracked and monitored for analytics
 */

interface MetricTags {
  [key: string]: string | number;
}

/**
 * Log a metric (placeholder - actual implementation would use PACK 421 telemetry)
 */
function emitMetric(metricName: string, value: number, tags: MetricTags = {}) {
  // In production, this would emit to the telemetry pipeline from PACK 421
  console.log('[PACK423] Metric:', {
    metric: metricName,
    value,
    tags,
    timestamp: Date.now(),
  });
}

/**
 * Emit rating creation metric
 */
export function emitRatingCreatedMetric(
  interactionType: InteractionType,
  rating: number,
  source: string
): void {
  emitMetric('product.ratings.interaction.count', 1, {
    interaction_type: interactionType,
    rating_value: rating,
    source,
  });

  emitMetric('product.ratings.avg_score', rating, {
    interaction_type: interactionType,
  });
}

/**
 * Emit NPS response metric
 */
export function emitNpsResponseMetric(
  score: number,
  channel: string,
  productArea?: string
): void {
  emitMetric('product.ratings.nps.count', 1, {
    score,
    channel,
    product_area: productArea || 'GENERAL',
  });

  // Categorize as promoter, passive, or detractor
  let category: string;
  if (score >= 9) {
    category = 'promoters';
  } else if (score >= 7) {
    category = 'passives';
  } else {
    category = 'detractors';
  }

  emitMetric(`product.ratings.nps.${category}`, 1, {
    channel,
    product_area: productArea || 'GENERAL',
  });
}

/**
 * Emit rating summary update metric
 */
export function emitRatingSummaryMetric(
  userId: string,
  avgRating: number,
  totalRatings: number
): void {
  emitMetric('product.ratings.user.avg_rating', avgRating, {
    user_id: userId,
  });

  emitMetric('product.ratings.user.total', totalRatings, {
    user_id: userId,
  });
}

/**
 * Emit rating anomaly detection metric
 */
export function emitAnomalyDetectedMetric(
  userId: string,
  anomalyType: string
): void {
  emitMetric('product.ratings.anomaly.detected', 1, {
    user_id: userId,
    anomaly_type: anomalyType,
  });
}

/**
 * Emit reputation update metric
 */
export function emitReputationUpdateMetric(
  userId: string,
  source: string
): void {
  emitMetric('product.ratings.reputation.updated', 1, {
    user_id: userId,
    source,
  });
}

/**
 * Batch emit metrics at regular intervals
 */
export class MetricsBatcher {
  private buffer: Array<{
    metric: string;
    value: number;
    tags: MetricTags;
    timestamp: number;
  }> = [];

  private flushInterval = 60000; // 1 minute
  private timer?: NodeJS.Timeout;

  constructor() {
    this.startFlushTimer();
  }

  add(metric: string, value: number, tags: MetricTags = {}): void {
    this.buffer.push({
      metric,
      value,
      tags,
      timestamp: Date.now(),
    });

    // Auto-flush if buffer gets too large
    if (this.buffer.length >= 100) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;

    console.log('[PACK423] Flushing metrics batch:', {
      count: this.buffer.length,
      metrics: this.buffer,
    });

    // In production, send to telemetry pipeline
    // For now, just log

    this.buffer = [];
  }

  private startFlushTimer(): void {
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.flush(); // Flush any remaining metrics
  }
}

// Global metrics batcher instance
export const metricsBatcher = new MetricsBatcher();

/**
 * Health check metric for monitoring
 */
export function emitHealthCheckMetric(component: string, healthy: boolean): void {
  emitMetric('product.ratings.health', healthy ? 1 : 0, {
    component,
  });
}
