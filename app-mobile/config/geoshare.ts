/**
 * PACK 76 - Real-Time Location Sharing Configuration
 * Pricing and configuration for geoshare functionality
 */

export const GEOSHARE_CONFIG = {
  // Pricing per minute (in tokens)
  PRICE_PER_MINUTE: 10,
  
  // Platform fee percentage (non-refundable)
  AVALO_FEE_PERCENT: 35,
  
  // Available duration options (in minutes)
  DURATION_OPTIONS: [15, 30, 60],
  
  // Maximum location update frequency (to prevent spam)
  MIN_UPDATE_INTERVAL_SECONDS: 8,
  
  // UI refresh interval for location updates (milliseconds)
  UI_UPDATE_INTERVAL_MS: 10000, // 10 seconds
  
  // Map configuration
  MAP: {
    DEFAULT_ZOOM: 15,
    MIN_ZOOM: 10,
    MAX_ZOOM: 18,
    ACCURACY_CIRCLE_OPACITY: 0.2,
    ACCURACY_CIRCLE_FILL_COLOR: '#007AFF',
    ACCURACY_CIRCLE_STROKE_COLOR: '#007AFF',
  },
  
  // Background location tracking
  BACKGROUND: {
    ACCURACY: 'high' as const,
    TIME_INTERVAL: 10000, // 10 seconds
    DISTANCE_INTERVAL: 10, // 10 meters
  },
};

// Calculate total price for a duration
export function calculateGeosharePrice(durationMinutes: number): {
  totalTokens: number;
  avaloFee: number;
  netAmount: number;
} {
  const totalTokens = durationMinutes * GEOSHARE_CONFIG.PRICE_PER_MINUTE;
  const avaloFee = Math.round(totalTokens * (GEOSHARE_CONFIG.AVALO_FEE_PERCENT / 100));
  const netAmount = totalTokens - avaloFee;

  return {
    totalTokens,
    avaloFee,
    netAmount,
  };
}

// Format duration for display
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}min`;
}

// Format remaining time
export function formatRemainingTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}