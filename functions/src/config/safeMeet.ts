/**
 * Safe-Meet Configuration
 * Phase 25: Safety feature configuration
 * 
 * Contains all configurable parameters for Safe-Meet functionality
 */

/**
 * Countries/regions where digital emergency pre-fill is supported
 * These codes represent countries where we can prepare data for law enforcement
 * Note: This does NOT mean we directly contact police - only prepares data for moderators
 */
export const SUPPORTED_EMERGENCY_REGIONS: string[] = [
  'PL', // Poland
  'DE', // Germany
  'FR', // France
  'GB', // United Kingdom
  'US', // United States
  'ES', // Spain
  'IT', // Italy
  'NL', // Netherlands
  'BE', // Belgium
  'AT', // Austria
  'CH', // Switzerland
  'SE', // Sweden
  'NO', // Norway
  'DK', // Denmark
  'FI', // Finland
];

/**
 * Maximum number of active Safe-Meet sessions per user
 * Prevents abuse and ensures focus on real meetings
 */
export const SAFE_MEET_MAX_ACTIVE_SESSIONS_PER_USER = 3;

/**
 * Trust Engine risk points for SOS trigger
 * High value because SOS is a serious event
 */
export const SAFE_MEET_SOS_TRUST_RISK_POINTS = -50;

/**
 * Session expiration time (in milliseconds)
 * Sessions older than this without activity will auto-expire
 */
export const SAFE_MEET_SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * QR token length (for session identification)
 */
export const SAFE_MEET_QR_TOKEN_LENGTH = 12;

/**
 * Maximum number of sessions to return in getUserSessions
 */
export const SAFE_MEET_MAX_SESSIONS_QUERY = 50;

/**
 * Email configuration for trusted contact notifications
 */
export const SAFE_MEET_EMAIL_CONFIG = {
  FROM_NAME: 'Avalo Safety Team',
  SUBJECT_PREFIX: '[URGENT]',
  SOS_SUBJECT: 'Safety Alert - Your Contact Triggered Emergency',
};

/**
 * Validate if a country code is supported for law enforcement queue
 */
export function isEmergencyRegionSupported(countryCode: string): boolean {
  return SUPPORTED_EMERGENCY_REGIONS.includes(countryCode.toUpperCase());
}

/**
 * Get human-readable name for a region (for display purposes)
 */
export function getRegionName(countryCode: string): string {
  const names: Record<string, string> = {
    PL: 'Poland',
    DE: 'Germany',
    FR: 'France',
    GB: 'United Kingdom',
    US: 'United States',
    ES: 'Spain',
    IT: 'Italy',
    NL: 'Netherlands',
    BE: 'Belgium',
    AT: 'Austria',
    CH: 'Switzerland',
    SE: 'Sweden',
    NO: 'Norway',
    DK: 'Denmark',
    FI: 'Finland',
  };
  
  return names[countryCode.toUpperCase()] || countryCode;
}