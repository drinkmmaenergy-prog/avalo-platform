/**
 * PACK 206c — Adult Mode Types
 * Romantic & Sexual Conversation System — Consent-Based
 * 
 * Version: REVISED v2 (OVERWRITE)
 * Date: 2025-12-01
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

/**
 * Adult Mode Settings Document
 * Stores the consent status for both users in a chat
 */
export interface AdultModeSettings {
  chatId: string;
  user1Id: string;
  user1Enabled: boolean;
  user1Timestamp: Timestamp;
  user2Id: string;
  user2Enabled: boolean;
  user2Timestamp: Timestamp;
  bothEnabled: boolean; // true only when both users have enabled
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Adult Mode Log Entry
 * Audit trail for consent changes
 */
export interface AdultModeLog {
  id: string;
  chatId: string;
  userId: string;
  action: 'enabled' | 'disabled';
  timestamp: Timestamp;
  userAgent?: string;
  ipAddress?: string; // For security auditing
  bothEnabledAfterAction: boolean;
}

/**
 * Adult Mode Report
 * User-generated report for abuse in adult mode
 */
export interface AdultModeReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  chatId: string;
  reason: AdultModeReportReason;
  description: string;
  timestamp: Timestamp;
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  moderatorId?: string;
  moderatorNotes?: string;
  actionTaken?: string;
  resolvedAt?: Timestamp;
  adultModeWasActive: boolean;
  bothUsersHadConsented: boolean;
}

/**
 * Report reasons for adult mode violations
 */
export type AdultModeReportReason =
  | 'non_consensual' // Sexual content sent without mutual consent
  | 'coercion' // Pressure or threats to engage
  | 'explicit_media' // Pornographic images/videos
  | 'escorting' // Pay-for-sex offers
  | 'minor_content' // Content involving minors
  | 'illegal_content' // Illegal or extreme content
  | 'harassment' // General harassment in adult mode
  | 'other'; // Other violations

/**
 * Adult Mode Toggle Request
 * Client request to enable/disable adult mode
 */
export interface AdultModeToggleRequest {
  chatId: string;
  enabled: boolean;
}

/**
 * Adult Mode Toggle Response
 * Server response after processing toggle
 */
export interface AdultModeToggleResponse {
  success: boolean;
  chatId: string;
  currentUserEnabled: boolean;
  otherUserEnabled: boolean;
  bothEnabled: boolean;
  message: string;
  requiresVerification?: boolean; // If user needs age verification first
}

/**
 * Adult Mode Status
 * Current status of adult mode for a chat
 */
export interface AdultModeStatus {
  chatId: string;
  user1Id: string;
  user1Enabled: boolean;
  user2Id: string;
  user2Enabled: boolean;
  bothEnabled: boolean;
  currentUserEnabled: boolean;
  otherUserEnabled: boolean;
}

/**
 * Content Filter Configuration
 * How content filtering behaves based on adult mode
 */
export interface ContentFilterConfig {
  adultModeEnabled: boolean;
  allowSexualLanguage: boolean;
  allowSensualPhotos: boolean;
  blockExplicitMedia: boolean;
  blockCoercion: boolean;
  blockIllegalContent: boolean;
  blockEscorting: boolean;
}

/**
 * Moderation Action for Adult Mode Violations
 */
export interface AdultModeModerationAction {
  userId: string;
  chatId: string;
  violation: AdultModeReportReason;
  action: 'warning' | 'chat_restriction' | 'suspension' | 'permanent_ban';
  duration?: string; // e.g., '24h', '7d', 'permanent'
  reason: string;
  timestamp: Timestamp;
  moderatorId: string;
  reportId?: string;
}

/**
 * Analytics Event for Adult Mode
 */
export interface AdultModeAnalyticsEvent {
  eventType: 'enabled' | 'disabled' | 'both_enabled' | 'reported' | 'violation';
  chatId: string;
  userId: string;
  timestamp: Timestamp;
  metadata?: Record<string, any>;
}

/**
 * Age Verification Status
 * Required before enabling adult mode
 */
export interface AgeVerificationStatus {
  userId: string;
  isVerified: boolean;
  verifiedAge: number | null;
  verificationMethod?: 'id_document' | 'credit_card' | 'third_party';
  verifiedAt?: Timestamp;
}

/**
 * Consent Dialog Data
 * Information shown to user before enabling adult mode
 */
export interface ConsentDialogData {
  title: string;
  message: string;
  warnings: string[];
  confirmButtonText: string;
  cancelButtonText: string;
  requiresAgeVerification: boolean;
}

/**
 * Adult Mode Notification
 * Notification sent when other user enables/disables
 */
export interface AdultModeNotification {
  recipientId: string;
  chatId: string;
  otherUserName: string;
  action: 'enabled' | 'disabled';
  message: string;
  timestamp: Timestamp;
}

/**
 * Firestore Data Converter Types
 */
export type AdultModeSettingsCreate = Omit<AdultModeSettings, 'id' | 'createdAt' | 'updatedAt'> & {
  createdAt?: FieldValue;
  updatedAt?: FieldValue;
};

export type AdultModeSettingsUpdate = Partial<Omit<AdultModeSettings, 'id' | 'chatId' | 'user1Id' | 'user2Id'>> & {
  updatedAt?: FieldValue;
};