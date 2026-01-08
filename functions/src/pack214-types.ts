/**
 * PACK 214 - Return Trigger Engine Types
 * Smart re-engagement without desperation or spam
 */

import { Timestamp } from "firebase-admin/firestore";

/**
 * Event types that trigger re-engagement
 */
export type ReturnTriggerEventType =
  | "NEW_HIGH_PRIORITY_MATCH"
  | "MESSAGE_FROM_MATCH"
  | "NEW_LIKES"
  | "WISHLIST_ADD"
  | "HIGH_CHEMISTRY_PROFILE_VISIT"
  | "GOOD_VIBE_BOOST"
  | "TOKEN_SALE_OPPORTUNITY"
  | "DISCOVERY_BOOST_ACTIVE"
  | "BREAK_RETURN_7DAY"
  | "BREAK_RETURN_14DAY"
  | "BREAK_RETURN_30DAY"
  | "BREAK_RETURN_60DAY"
  | "COLD_START_DAY_1"
  | "COLD_START_DAY_2"
  | "COLD_START_DAY_3"
  | "COLD_START_DAY_4"
  | "COLD_START_DAY_5"
  | "COLD_START_DAY_6"
  | "COLD_START_DAY_7";

/**
 * User types with different motivations
 */
export type UserType =
  | "MALE_PAYER"           // romantic + connection
  | "FEMALE_EARNER"        // monetization via attention
  | "ROYAL_MALE"           // premium attention
  | "NONBINARY"            // safe connection
  | "INFLUENCER_EARNER"    // maximize earnings
  | "LOW_POPULARITY";      // confidence & support

/**
 * Message tone rules
 */
export type MessageTone = "exciting" | "confident" | "flirt-coded" | "positive" | "aspirational";

/**
 * Notification channel preferences
 */
export interface ReturnTriggerChannels {
  push: boolean;
  email: boolean;
  inApp: boolean;
}

/**
 * Return trigger event document
 */
export interface ReturnTriggerEvent {
  eventId: string;
  userId: string;
  eventType: ReturnTriggerEventType;
  context?: {
    matchId?: string;
    matchProfileUrl?: string;
    chemistryScore?: number;
    messageCount?: number;
    likeCount?: number;
    counterpartyId?: string;
    counterpartyName?: string;
    boostEndTime?: Timestamp;
    saleDiscount?: number;
    deepLink?: string;
  };
  createdAt: Timestamp;
  processed: boolean;
  processedAt?: Timestamp;
}

/**
 * User return trigger settings
 */
export interface ReturnTriggerSettings {
  userId: string;
  enabled: boolean;
  userType: UserType;
  lastActiveAt: Timestamp;
  accountCreatedAt: Timestamp;
  inPanicMode: boolean;
  panicModeCooldownUntil?: Timestamp;
  hasUnresolvedIncident: boolean;
  doNotDisturb: boolean;
  inMeetingOrEvent: boolean;
  abTestGroup?: "A" | "B";  // A/B testing
  updatedAt: Timestamp;
}

/**
 * Trigger cooldown record
 */
export interface TriggerCooldown {
  userId: string;
  eventType: ReturnTriggerEventType;
  lastTriggeredAt: Timestamp;
  triggerCount: number;
  cooldownExpiresAt: Timestamp;
}

/**
 * Trigger priority by user type
 */
export interface TriggerPriority {
  userType: UserType;
  eventType: ReturnTriggerEventType;
  priority: number; // 1-10, higher = more important
  enabled: boolean;
}

/**
 * Message template
 */
export interface ReturnTriggerTemplate {
  eventType: ReturnTriggerEventType;
  userType: UserType;
  title: string;
  body: string;
  tone: MessageTone;
  emoji: string;
  channels: ReturnTriggerChannels;
}

/**
 * Cold start activation timeline entry
 */
export interface ColdStartEntry {
  day: number; // 0-7
  eventType: ReturnTriggerEventType;
  enabled: boolean;
  delayHours?: number;
  requiresTruthCheck: boolean; // must be backed by real data
}

/**
 * Return trigger statistics
 */
export interface ReturnTriggerStats {
  userId: string;
  totalTriggersSent: number;
  lastTriggerSentAt?: Timestamp;
  triggersBy7Days: number;
  triggersBy30Days: number;
  averageResponseTimeMinutes?: number;
  conversionRate?: number; // % of triggers that led to app open
  updatedAt: Timestamp;
}

/**
 * Silence rule check result
 */
export interface SilenceRuleCheck {
  allowed: boolean;
  reason?: "panic_mode" | "unresolved_incident" | "do_not_disturb" | "in_meeting_event" | "cooldown";
  cooldownExpiresAt?: Timestamp;
}

/**
 * Input for creating a return trigger
 */
export interface CreateReturnTriggerInput {
  userId: string;
  eventType: ReturnTriggerEventType;
  context?: ReturnTriggerEvent["context"];
  forceDelivery?: boolean; // bypass cooldowns for critical events
}

/**
 * Break duration tracking
 */
export interface UserBreakTracking {
  userId: string;
  lastActiveAt: Timestamp;
  breakStartedAt?: Timestamp;
  breakDays: number;
  breakNotificationsSent: {
    day7: boolean;
    day14: boolean;
    day30: boolean;
    day60Plus: boolean;
  };
  updatedAt: Timestamp;
}