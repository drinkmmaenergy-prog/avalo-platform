/**
 * Call Quality Monitoring
 * PACK 124.4 - Real-time WebRTC quality metrics
 * 
 * Features:
 * - Periodic getStats() collection
 * - Jitter, packet loss, and RTT measurement
 * - Quality rating (Excellent/Good/Fair/Poor)
 * - Aggregated metrics for session summary
 */

// ============================================================================
// TYPES
// ============================================================================

export interface QualityMetrics {
  jitterMs: number;
  packetLoss: number; // Percentage (0-100)
  rttMs: number;
  timestamp: number;
}

export interface AggregatedMetrics {
  avgJitterMs: number;
  avgPacketLoss: number;
  avgRttMs: number;
  samples: number;
}

export type QualityRating = 'Excellent' | 'Good' | 'Fair' | 'Poor';

export interface QualityStatus {
  rating: QualityRating;
  metrics: QualityMetrics;
  message: string;
}

// ============================================================================
// QUALITY RATING THRESHOLDS
// ============================================================================

const QUALITY_THRESHOLDS = {
  EXCELLENT: {
    maxJitter: 20,
    maxPacketLoss: 0.5,
    maxRtt: 100,
  },
  GOOD: {
    maxJitter: 40,
    maxPacketLoss: 2,
    maxRtt: 200,
  },
  FAIR: {
    maxJitter: 80,
    maxPacketLoss: 5,
    maxRtt: 400,
  },
  // Anything above FAIR thresholds is POOR
};

// ============================================================================
// QUALITY METRICS COLLECTION
// ============================================================================

/**
 * Extract quality metrics from WebRTC stats
 */
async function extractMetricsFromStats(
  peerConnection: RTCPeerConnection
): Promise<QualityMetrics | null> {
  try {
    const stats = await peerConnection.getStats();
    
    let jitterMs = 0;
    let packetLossRate = 0;
    let rttMs = 0;
    let hasInboundStats = false;

    stats.forEach((report) => {
      // Inbound RTP stream (receiving)
      if (report.type === 'inbound-rtp' && report.mediaType === 'audio') {
        hasInboundStats = true;
        
        // Jitter (in seconds, convert to ms)
        if (typeof report.jitter === 'number') {
          jitterMs = report.jitter * 1000;
        }

        // Packet loss calculation
        if (typeof report.packetsLost === 'number' && typeof report.packetsReceived === 'number') {
          const totalPackets = report.packetsLost + report.packetsReceived;
          if (totalPackets > 0) {
            packetLossRate = (report.packetsLost / totalPackets) * 100;
          }
        }
      }

      // Candidate pair for RTT
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        if (typeof report.currentRoundTripTime === 'number') {
          rttMs = report.currentRoundTripTime * 1000; // Convert to ms
        }
      }
    });

    if (!hasInboundStats) {
      return null;
    }

    return {
      jitterMs: Math.round(jitterMs * 100) / 100, // Round to 2 decimals
      packetLoss: Math.round(packetLossRate * 100) / 100,
      rttMs: Math.round(rttMs),
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Error extracting quality metrics:', error);
    return null;
  }
}

/**
 * Calculate quality rating from metrics
 */
function calculateQualityRating(metrics: QualityMetrics): QualityRating {
  const { jitterMs, packetLoss, rttMs } = metrics;

  // Check Excellent
  if (
    jitterMs <= QUALITY_THRESHOLDS.EXCELLENT.maxJitter &&
    packetLoss <= QUALITY_THRESHOLDS.EXCELLENT.maxPacketLoss &&
    rttMs <= QUALITY_THRESHOLDS.EXCELLENT.maxRtt
  ) {
    return 'Excellent';
  }

  // Check Good
  if (
    jitterMs <= QUALITY_THRESHOLDS.GOOD.maxJitter &&
    packetLoss <= QUALITY_THRESHOLDS.GOOD.maxPacketLoss &&
    rttMs <= QUALITY_THRESHOLDS.GOOD.maxRtt
  ) {
    return 'Good';
  }

  // Check Fair
  if (
    jitterMs <= QUALITY_THRESHOLDS.FAIR.maxJitter &&
    packetLoss <= QUALITY_THRESHOLDS.FAIR.maxPacketLoss &&
    rttMs <= QUALITY_THRESHOLDS.FAIR.maxRtt
  ) {
    return 'Fair';
  }

  // Everything else is Poor
  return 'Poor';
}

/**
 * Get user-friendly message for quality rating
 */
function getQualityMessage(rating: QualityRating): string {
  switch (rating) {
    case 'Excellent':
      return 'Call quality is excellent';
    case 'Good':
      return 'Call quality is good';
    case 'Fair':
      return 'Call quality is fair';
    case 'Poor':
      return 'Call quality is poor - check your connection';
    default:
      return 'Monitoring call quality...';
  }
}

// ============================================================================
// QUALITY MONITOR CLASS
// ============================================================================

export class CallQualityMonitor {
  private peerConnection: RTCPeerConnection;
  private intervalId: NodeJS.Timeout | null = null;
  private metricsHistory: QualityMetrics[] = [];
  private onQualityChange?: (status: QualityStatus) => void;
  
  private static readonly SAMPLE_INTERVAL_MS = 3000; // Every 3 seconds
  private static readonly MAX_HISTORY_SIZE = 100; // Keep last 100 samples

  constructor(
    peerConnection: RTCPeerConnection,
    onQualityChange?: (status: QualityStatus) => void
  ) {
    this.peerConnection = peerConnection;
    this.onQualityChange = onQualityChange;
  }

  /**
   * Start monitoring call quality
   */
  start(): void {
    if (this.intervalId) {
      console.warn('Quality monitor already running');
      return;
    }

    // Take initial sample immediately
    this.collectSample();

    // Then periodic samples
    this.intervalId = setInterval(() => {
      this.collectSample();
    }, CallQualityMonitor.SAMPLE_INTERVAL_MS);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Collect a quality sample
   */
  private async collectSample(): Promise<void> {
    const metrics = await extractMetricsFromStats(this.peerConnection);
    
    if (!metrics) {
      return;
    }

    // Add to history
    this.metricsHistory.push(metrics);

    // Limit history size
    if (this.metricsHistory.length > CallQualityMonitor.MAX_HISTORY_SIZE) {
      this.metricsHistory.shift();
    }

    // Calculate rating
    const rating = calculateQualityRating(metrics);
    const message = getQualityMessage(rating);

    // Notify callback
    if (this.onQualityChange) {
      this.onQualityChange({
        rating,
        metrics,
        message,
      });
    }
  }

  /**
   * Get current quality status
   */
  async getCurrentQuality(): Promise<QualityStatus | null> {
    const metrics = await extractMetricsFromStats(this.peerConnection);
    
    if (!metrics) {
      return null;
    }

    const rating = calculateQualityRating(metrics);
    const message = getQualityMessage(rating);

    return {
      rating,
      metrics,
      message,
    };
  }

  /**
   * Get aggregated metrics from entire session
   */
  getAggregatedMetrics(): AggregatedMetrics | null {
    if (this.metricsHistory.length === 0) {
      return null;
    }

    const totalJitter = this.metricsHistory.reduce((sum, m) => sum + m.jitterMs, 0);
    const totalPacketLoss = this.metricsHistory.reduce((sum, m) => sum + m.packetLoss, 0);
    const totalRtt = this.metricsHistory.reduce((sum, m) => sum + m.rttMs, 0);
    const samples = this.metricsHistory.length;

    return {
      avgJitterMs: Math.round((totalJitter / samples) * 100) / 100,
      avgPacketLoss: Math.round((totalPacketLoss / samples) * 100) / 100,
      avgRttMs: Math.round(totalRtt / samples),
      samples,
    };
  }

  /**
   * Get all metrics history
   */
  getMetricsHistory(): QualityMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * Clear metrics history
   */
  clearHistory(): void {
    this.metricsHistory = [];
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format metrics for display
 */
export function formatMetrics(metrics: QualityMetrics): string {
  return `Jitter: ${metrics.jitterMs.toFixed(1)}ms | ` +
         `Packet Loss: ${metrics.packetLoss.toFixed(2)}% | ` +
         `RTT: ${metrics.rttMs}ms`;
}

/**
 * Check if metrics indicate connection issues
 */
export function hasConnectionIssues(metrics: QualityMetrics): boolean {
  return (
    metrics.jitterMs > QUALITY_THRESHOLDS.FAIR.maxJitter ||
    metrics.packetLoss > QUALITY_THRESHOLDS.FAIR.maxPacketLoss ||
    metrics.rttMs > QUALITY_THRESHOLDS.FAIR.maxRtt
  );
}

/**
 * Get recommended action based on quality
 */
export function getRecommendedAction(rating: QualityRating): string | null {
  switch (rating) {
    case 'Fair':
      return 'Consider moving to a location with better network coverage';
    case 'Poor':
      return 'Poor connection detected. Try switching to Wi-Fi or finding a better signal area';
    default:
      return null;
  }
}
