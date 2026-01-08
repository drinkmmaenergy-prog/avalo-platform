/**
 * PACK 401 — Fraud Detection via Behavior & Support Correlation
 * Types & Interfaces
 *
 * Replaces mis-numbered PACK 352
 * Canonical fraud correlation specification
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Risk levels for fraud detection
 */
export type FraudRiskLevel = 'NORMAL' | 'WATCHLIST' | 'HIGH_RISK' | 'BANNED_RECOMMENDED';

/**
 * Comprehensive fraud behavior signals for a user
 * Collection: fraudBehaviorProfiles
 * Doc ID: userId
 */
export interface FraudBehaviorSignals {
  userId: string;
  lastUpdatedAt: Timestamp;

  // Behavior metrics
  chargebackCount: number;
  refundRequestCount: number;
  cancelledBookingsLast30d: number;

  // Support & safety metrics
  supportFraudTicketsLast30d: number;
  safetyFlagsLast30d: number;

  // Retention / engagement anomalies (0–1 scores)
  manyPaymentsFewMessagesScore: number; // High if many token spends but very few actual messages/calls
  multiRegionLoginScore: number;        // High if last N logins from radically different regions in short time
  deviceInconsistencyScore: number;     // High if many device IDs in short time

  // Aggregate
  aggregateScore: number;               // 0–1, weighted combination of all signals
  riskLevel: FraudRiskLevel;

  notes?: string;
}

/**
 * Input data for computing fraud profile
 */
export interface FraudProfileInput {
  userId: string;
  
  // Wallet data
  chargebackCount: number;
  refundRequestCount: number;
  cancelledBookingsLast30d: number;
  
  // Support data
  supportFraudTicketsLast30d: number;
  
  // Safety data
  safetyFlagsLast30d: number;
  
  // Behavior data
  totalTokenSpends: number;
  totalMessages: number;
  totalCalls: number;
  loginLocations: Array<{
    timestamp: Timestamp;
    country: string;
    region?: string;
  }>;
  deviceIds: string[];
  deviceIdTimestamps: Timestamp[];
}

/**
 * Fraud profile computation result
 */
export interface FraudProfileComputation {
  signals: FraudBehaviorSignals;
  computationDetails: {
    chargebacksNormalized: number;
    fraudTicketsNormalized: number;
    manyPaymentsFewMessagesScore: number;
    multiRegionLoginScore: number;
    deviceInconsistencyScore: number;
  };
}
