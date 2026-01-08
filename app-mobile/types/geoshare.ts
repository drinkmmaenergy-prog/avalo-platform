/**
 * PACK 76 - Real-Time Location Sharing Types
 * Type definitions for geoshare functionality
 */

export interface GeoshareSession {
  sessionId: string;
  userA: string;
  userB: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  durationMinutes: number;
  paidAmount: number;
  avaloFee: number;
  createdAt: Date;
  expiresAt: Date;
  lastUpdateAt: Date;
  cancelledAt?: Date;
  cancelledBy?: string;
}

export interface LocationUpdate {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
  sessionId: string;
}

export interface GeosharePricing {
  durationMinutes: number;
  totalTokens: number;
  avaloFee: number;
  netAmount: number;
  pricePerMinute: number;
  availableDurations: number[];
}

export interface GeoshareSessionInfo {
  sessionId: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  partnerId: string;
  durationMinutes: number;
  expiresAt: string;
  remainingSeconds: number;
}

export interface PartnerLocation {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
}

export interface GeoshareSessionResponse {
  success: boolean;
  sessionId: string;
  expiresAt: string;
  durationMinutes: number;
  paidAmount: number;
}

export interface GeoshareLocationUpdateResponse {
  success: boolean;
  locationId: string;
  remainingSeconds: number;
}

export interface GeoshareConfig {
  PRICE_PER_MINUTE: number;
  AVALO_FEE_PERCENT: number;
  DURATION_OPTIONS: number[];
  MIN_UPDATE_INTERVAL_SECONDS: number;
}