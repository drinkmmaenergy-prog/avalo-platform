/**
 * PACK 324A — Post-Launch KPI Core & Platform Health Monitoring
 * TypeScript Types and Interfaces
 * 
 * READ-ONLY monitoring layer - zero tokenomics changes
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// PLATFORM KPI TYPES
// ============================================================================

export interface PlatformKpiDaily {
  date: string; // YYYY-MM-DD
  
  // User Metrics
  newUsers: number;
  verifiedUsers: number;
  activeUsers: number;
  payingUsers: number;
  
  // Revenue Metrics (tokens)
  totalTokensSpent: number;
  totalTokenRevenuePLN: number; // tokens * 0.20 PLN
  
  // Activity Metrics
  totalChats: number;
  totalVoiceMinutes: number;
  totalVideoMinutes: number;
  
  // Calendar & Events
  totalCalendarBookings: number;
  totalEventTickets: number;
  
  createdAt: Timestamp;
}

export interface PlatformKpiHourly {
  date: string; // YYYY-MM-DD
  hour: number; // 0-23
  
  // Real-time user activity
  activeUsers: number;
  
  // Real-time revenue (tokens)
  tokensSpent: number;
  tokenRevenuePLN: number;
  
  // Real-time activity counts
  chatsStarted: number;
  voiceMinutes: number;
  videoMinutes: number;
  
  createdAt: Timestamp;
}

// ============================================================================
// CREATOR KPI TYPES
// ============================================================================

export interface CreatorKpiDaily {
  date: string; // YYYY-MM-DD
  userId: string;
  
  // Earnings by source (tokens)
  earnedTokensChat: number;
  earnedTokensVoice: number;
  earnedTokensVideo: number;
  earnedTokensCalendar: number;
  earnedTokensEvents: number;
  earnedTokensOther: number;
  
  // Totals
  totalEarnedTokens: number;
  totalEarnedPLN: number; // tokens * 0.20 PLN
  
  // Activity
  sessionsCount: number;
  
  createdAt: Timestamp;
}

// ============================================================================
// SAFETY KPI TYPES
// ============================================================================

export interface SafetyKpiDaily {
  date: string; // YYYY-MM-DD
  
  // Report Metrics
  reportsTotal: number;
  reportsAI: number; // Auto-detected
  reportsHuman: number; // User-reported
  
  // Enforcement Metrics
  bansIssued: number;
  autoBlocks: number;
  panicEvents: number;
  
  createdAt: Timestamp;
}

// ============================================================================
// REVENUE SOURCE MAPPING
// ============================================================================

export enum RevenueSource {
  CHAT = 'CHAT',
  VOICE = 'VOICE',
  VIDEO = 'VIDEO',
  CALENDAR = 'CALENDAR',
  EVENTS = 'EVENTS',
  TIPS = 'TIPS',
  OTHER = 'OTHER',
}

export interface RevenueSourceMapping {
  collection: string;
  contextField?: string;
  contextValues?: string[];
}

export const REVENUE_SOURCE_MAP: Record<RevenueSource, RevenueSourceMapping> = {
  [RevenueSource.CHAT]: {
    collection: 'walletTransactions',
    contextField: 'context',
    contextValues: ['CHAT', 'AI_SESSION']
  },
  [RevenueSource.VOICE]: {
    collection: 'walletTransactions',
    contextField: 'context',
    contextValues: ['VOICE', 'AI_VOICE']
  },
  [RevenueSource.VIDEO]: {
    collection: 'walletTransactions',
    contextField: 'context',
    contextValues: ['VIDEO', 'AI_VIDEO']
  },
  [RevenueSource.CALENDAR]: {
    collection: 'calendarBookings'
  },
  [RevenueSource.EVENTS]: {
    collection: 'eventTickets'
  },
  [RevenueSource.TIPS]: {
    collection: 'walletTransactions',
    contextField: 'context',
    contextValues: ['TIP']
  },
  [RevenueSource.OTHER]: {
    collection: 'walletTransactions'
  },
};

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface PlatformKpiResponse {
  date: string;
  users: {
    new: number;
    verified: number;
    active: number;
    paying: number;
  };
  revenue: {
    tokensSpent: number;
    revenuePLN: number;
  };
  activity: {
    chats: number;
    voiceMinutes: number;
    videoMinutes: number;
    calendarBookings: number;
    eventTickets: number;
  };
  lastUpdated: Date;
}

export interface CreatorKpiResponse {
  date: string;
  userId: string;
  earnings: {
    chat: number;
    voice: number;
    video: number;
    calendar: number;
    events: number;
    other: number;
    total: number;
  };
  earningsPLN: number;
  sessions: number;
  lastUpdated: Date;
}

export interface SafetyKpiResponse {
  date: string;
  reports: {
    total: number;
    aiDetected: number;
    userReported: number;
  };
  enforcement: {
    bans: number;
    autoBlocks: number;
    panicEvents: number;
  };
  lastUpdated: Date;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const KPI_CONFIG = {
  // Revenue conversion rate
  TOKEN_TO_PLN_RATE: 0.20,
  
  // Aggregation schedule
  DAILY_AGGREGATION_HOUR_UTC: 0, // 00:10 UTC
  HOURLY_AGGREGATION_MINUTE: 10,
  
  // Collection names
  COLLECTIONS: {
    PLATFORM_DAILY: 'platformKpiDaily',
    PLATFORM_HOURLY: 'platformKpiHourly',
    CREATOR_DAILY: 'creatorKpiDaily',
    SAFETY_DAILY: 'safetyKpiDaily',
  },
  
  // Data retention (days)
  RETENTION_DAYS: {
    HOURLY: 7,
    DAILY: 365,
  },
} as const;