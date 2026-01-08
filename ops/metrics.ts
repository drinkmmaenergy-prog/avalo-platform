/**
 * Avalo Operations - Metrics Layer
 * Latency histograms, error budgets, and real-time metrics
 */

export interface MetricLabels {
  [key: string]: string | number;
}

export interface Histogram {
  buckets: number[];
  counts: number[];
  sum: number;
  count: number;
}

export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: MetricLabels;
}

export interface ErrorBudget {
  target: number; // e.g., 99.9 (%)
  current: number;
  remaining: number;
  timeWindow: number; // seconds
  burnRate: number;
}

export class MetricsCollector {
  private metrics: Map<string, MetricValue[]> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();

  /**
   * Record latency metric
   */
  recordLatency(name: string, duration: number, labels?: MetricLabels): void {
    const key = this.getMetricKey(name, labels);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
        counts: new Array(11).fill(0),
        sum: 0,
        count: 0,
      });
    }

    const histogram = this.histograms.get(key)!;
    histogram.sum += duration;
    histogram.count++;

    // Update bucket counts
    for (let i = 0; i < histogram.buckets.length; i++) {
      if (duration <= histogram.buckets[i]) {
        histogram.counts[i]++;
      }
    }
    histogram.counts[histogram.counts.length - 1]++; // +Inf bucket
  }

  /**
   * Get latency percentiles
   */
  getLatencyPercentiles(name: string, labels?: MetricLabels): {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  } {
    const key = this.getMetricKey(name, labels);
    const histogram = this.histograms.get(key);

    if (!histogram || histogram.count === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    return {
      p50: this.calculatePercentile(histogram, 0.5),
      p90: this.calculatePercentile(histogram, 0.9),
      p95: this.calculatePercentile(histogram, 0.95),
      p99: this.calculatePercentile(histogram, 0.99),
    };
  }

  /**
   * Calculate percentile from histogram
   */
  private calculatePercentile(histogram: Histogram, percentile: number): number {
    const target = histogram.count * percentile;
    let cumulative = 0;

    for (let i = 0; i < histogram.buckets.length; i++) {
      cumulative += histogram.counts[i];
      if (cumulative >= target) {
        return histogram.buckets[i];
      }
    }

    return histogram.buckets[histogram.buckets.length - 1];
  }

  /**
   * Increment counter
   */
  incrementCounter(name: string, value: number = 1, labels?: MetricLabels): void {
    const key = this.getMetricKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  /**
   * Set gauge value
   */
  setGauge(name: string, value: number, labels?: MetricLabels): void {
    const key = this.getMetricKey(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Get counter value
   */
  getCounter(name: string, labels?: MetricLabels): number {
    const key = this.getMetricKey(name, labels);
    return this.counters.get(key) || 0;
  }

  /**
   * Get gauge value
   */
  getGauge(name: string, labels?: MetricLabels): number {
    const key = this.getMetricKey(name, labels);
    return this.gauges.get(key) || 0;
  }

  /**
   * Calculate error budget
   */
  calculateErrorBudget(
    totalRequests: number,
    failedRequests: number,
    target: number = 99.9
  ): ErrorBudget {
    const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
    const uptime = 100 - errorRate;
    const remaining = ((target - (100 - uptime)) / target) * 100;
    const burnRate = totalRequests > 0 ? failedRequests / totalRequests : 0;

    return {
      target,
      current: uptime,
      remaining: Math.max(0, remaining),
      timeWindow: 2592000, // 30 days
      burnRate,
    };
  }

  /**
   * Record metric value
   */
  recordMetric(name: string, value: number, labels?: MetricLabels): void {
    const key = this.getMetricKey(name, labels);
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    this.metrics.get(key)!.push({
      value,
      timestamp: Date.now(),
      labels,
    });

    // Keep only last 1000 values
    const values = this.metrics.get(key)!;
    if (values.length > 1000) {
      values.shift();
    }
  }

  /**
   * Get metric key
   */
  private getMetricKey(name: string, labels?: MetricLabels): string {
    if (!labels) return name;
    
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    return `${name}{${labelStr}}`;
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    let output = '';

    // Export counters
    for (const [key, value] of this.counters.entries()) {
      output += `# TYPE ${key} counter\n`;
      output += `${key} ${value}\n`;
    }

    // Export gauges
    for (const [key, value] of this.gauges.entries()) {
      output += `# TYPE ${key} gauge\n`;
      output += `${key} ${value}\n`;
    }

    // Export histograms
    for (const [key, histogram] of this.histograms.entries()) {
      output += `# TYPE ${key} histogram\n`;
      
      for (let i = 0; i < histogram.buckets.length; i++) {
        output += `${key}_bucket{le="${histogram.buckets[i]}"} ${histogram.counts[i]}\n`;
      }
      
      output += `${key}_bucket{le="+Inf"} ${histogram.counts[histogram.counts.length - 1]}\n`;
      output += `${key}_sum ${histogram.sum}\n`;
      output += `${key}_count ${histogram.count}\n`;
    }

    return output;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.histograms.clear();
    this.counters.clear();
    this.gauges.clear();
  }
}

/**
 * Chat latency tracker
 */
export class ChatLatencyTracker {
  private metrics: MetricsCollector;

  constructor(metrics: MetricsCollector) {
    this.metrics = metrics;
  }

  /**
   * Track message send latency
   */
  trackMessageSend(startTime: number, success: boolean): void {
    const duration = Date.now() - startTime;
    this.metrics.recordLatency('chat_message_send', duration, {
      success: success ? 'true' : 'false',
    });

    if (!success) {
      this.metrics.incrementCounter('chat_message_errors', 1);
    }
  }

  /**
   * Track message delivery latency
   */
  trackMessageDelivery(startTime: number): void {
    const duration = Date.now() - startTime;
    this.metrics.recordLatency('chat_message_delivery', duration);
  }

  /**
   * Get chat latency distribution
   */
  getLatencyDistribution(): {
    send: { p50: number; p90: number; p95: number; p99: number };
    delivery: { p50: number; p90: number; p95: number; p99: number };
  } {
    return {
      send: this.metrics.getLatencyPercentiles('chat_message_send'),
      delivery: this.metrics.getLatencyPercentiles('chat_message_delivery'),
    };
  }
}

/**
 * AI token consumption tracker
 */
export class AITokenTracker {
  private metrics: MetricsCollector;
  private dailyLimit: number;
  private currentUsage: number = 0;

  constructor(metrics: MetricsCollector, dailyLimit: number = 1000000) {
    this.metrics = metrics;
    this.dailyLimit = dailyLimit;
  }

  /**
   * Track token usage
   */
  trackTokens(tokens: number, model: string): void {
    this.currentUsage += tokens;
    
    this.metrics.incrementCounter('ai_tokens_used', tokens, { model });
    this.metrics.setGauge('ai_tokens_remaining', this.dailyLimit - this.currentUsage);
    
    const usagePercent = (this.currentUsage / this.dailyLimit) * 100;
    this.metrics.setGauge('ai_tokens_usage_percent', usagePercent);
  }

  /**
   * Get current usage
   */
  getCurrentUsage(): {
    used: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  } {
    return {
      used: this.currentUsage,
      limit: this.dailyLimit,
      remaining: this.dailyLimit - this.currentUsage,
      percentUsed: (this.currentUsage / this.dailyLimit) * 100,
    };
  }

  /**
   * Reset daily usage
   */
  resetDaily(): void {
    this.currentUsage = 0;
  }
}

/**
 * Creator revenue metrics tracker
 */
export class RevenueMetricsTracker {
  private metrics: MetricsCollector;

  constructor(metrics: MetricsCollector) {
    this.metrics = metrics;
  }

  /**
   * Track revenue event
   */
  trackRevenue(amount: number, type: string, creatorId: string): void {
    this.metrics.incrementCounter('revenue_total', amount, { type });
    this.metrics.incrementCounter('revenue_by_creator', amount, { creatorId });
    this.metrics.recordMetric('revenue_transaction', amount, { type, creatorId });
  }

  /**
   * Track payout
   */
  trackPayout(amount: number, creatorId: string): void {
    this.metrics.incrementCounter('payouts_total', amount, { creatorId });
  }

  /**
   * Get real-time revenue metrics
   */
  getRealTimeMetrics(): {
    totalRevenue: number;
    transactionCount: number;
    avgTransactionValue: number;
  } {
    const total = this.metrics.getCounter('revenue_total');
    const count = this.metrics.getCounter('revenue_transactions');
    
    return {
      totalRevenue: total,
      transactionCount: count,
      avgTransactionValue: count > 0 ? total / count : 0,
    };
  }
}

/**
 * Middleware to track HTTP request metrics
 */
export function metricsMiddleware(metrics: MetricsCollector) {
  return (req: any, res: any, next: any) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const labels = {
        method: req.method,
        path: req.route?.path || req.path,
        status: res.statusCode.toString(),
      };

      metrics.recordLatency('http_request_duration', duration, labels);
      metrics.incrementCounter('http_requests_total', 1, labels);

      if (res.statusCode >= 400) {
        metrics.incrementCounter('http_requests_errors', 1, labels);
      }
    });

    next();
  };
}

/**
 * Create default metrics collector
 */
export function createMetricsCollector(): MetricsCollector {
  return new MetricsCollector();
}

// Export default instance
export const defaultMetrics = createMetricsCollector();