/**
 * PACK 95 — Account, Device & Session Security
 * TypeScript Type Definitions
 * 
 * NON-NEGOTIABLE RULES:
 * - No free tokens, no discounts, no promo codes, no cashback, no bonuses
 * - Do not change token price per unit
 * - Do not change revenue split (65% creator / 35% Avalo)
 * - Security actions never alter earnings, wallets, or payouts
 * - Prepares for 2FA / step-up verification (later pack)
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// DEVICE TYPES
// ============================================================================

export type Platform = 'android' | 'ios' | 'web' | 'other';

export interface UserDevice {
  id: string; // deviceId (generated client-side + server-checked)
  userId: string; // owner
  platform: Platform;
  deviceModel?: string; // e.g. "Samsung S23", "iPhone 14"
  appVersion?: string; // e.g. "1.0.0"
  lastSeenAt: Timestamp; // last time seen
  createdAt: Timestamp; // first time linked
  isTrusted: boolean; // for future 2FA step-up logic
}

// ============================================================================
// SESSION TYPES
// ============================================================================

export type RevokeReason = 
  | 'USER_LOGOUT'
  | 'USER_LOGOUT_ALL'
  | 'SECURITY_ANOMALY'
  | 'SESSION_EXPIRED'
  | 'ADMIN_ACTION'
  | 'SUSPICIOUS_ACTIVITY';

export interface UserSession {
  id: string; // sessionId (UUID)
  userId: string; // owner
  deviceId: string; // reference to user_devices.id
  createdAt: Timestamp; // time of login
  lastActiveAt: Timestamp; // refreshed on activity
  ipCountry?: string; // optional, derived country code
  userAgent?: string; // optional, limited string (no PII beyond basics)
  isActive: boolean; // false if revoked or expired
  revokedAt?: Timestamp; // if session was manually/automatically revoked
  revokeReason?: RevokeReason;
}

// ============================================================================
// ANOMALY TYPES
// ============================================================================

export type AnomalyType = 
  | 'NEW_COUNTRY'
  | 'IMPOSSIBLE_TRAVEL'
  | 'NEW_PLATFORM'
  | 'SUSPICIOUS_PATTERN'
  | 'RAPID_LOGIN_CHANGES';

export interface LoginAnomaly {
  id: string; // UUID
  userId: string;
  sessionId: string;
  type: AnomalyType;
  createdAt: Timestamp;
  metadata?: Record<string, any>;
  resolved?: boolean;
  resolvedAt?: Timestamp;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface RegisterDeviceAndSessionRequest {
  deviceId: string;
  platform: Platform;
  deviceModel?: string;
  appVersion?: string;
  userAgent?: string;
  ipCountry?: string; // header-derived server-side, not trusted from client
}

export interface RegisterDeviceAndSessionResponse {
  success: boolean;
  sessionId: string;
  deviceId: string;
  anomalies?: AnomalyType[];
  message?: string;
}

export interface LogoutSessionRequest {
  sessionId: string;
}

export interface LogoutSessionResponse {
  success: boolean;
  message?: string;
}

export interface LogoutAllSessionsResponse {
  success: boolean;
  sessionsRevoked: number;
  message?: string;
}

export interface GetActiveSessionsResponse {
  success: boolean;
  sessions: SessionInfo[];
}

export interface SessionInfo {
  sessionId: string;
  deviceId: string;
  platform: Platform;
  deviceModel?: string;
  ipCountry?: string;
  lastActiveAt: number; // timestamp in ms
  createdAt: number; // timestamp in ms
  isCurrentSession: boolean;
}

// ============================================================================
// ANOMALY DETECTION CONTEXT
// ============================================================================

export interface SessionContext {
  userId: string;
  deviceId: string;
  platform: Platform;
  ipCountry?: string;
  userAgent?: string;
  createdAt: Timestamp;
}

export interface AnomalyEvaluationResult {
  hasAnomalies: boolean;
  anomalies: AnomalyType[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  shouldNotify: boolean;
  shouldBlock: boolean;
}

// ============================================================================
// DEVICE CONTEXT (FOR REGISTRATION)
// ============================================================================

export interface DeviceContext {
  deviceId: string;
  platform: Platform;
  deviceModel?: string;
  appVersion?: string;
  userAgent?: string;
  ipCountry?: string;
}