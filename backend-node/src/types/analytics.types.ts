/**
 * PACK 410 - Enterprise Analytics
 * Data Models and TypeScript Types
 */

export interface AnalyticsEvent {
  eventId: string;
  userId: string; // Hashed for GDPR
  creatorId?: string;
  aiId?: string;
  timestamp: number;
  eventType: AnalyticsEventType;
  sourcePack: string;
  geo: {
    country: string;
    region?: string;
    city?: string;
  };
  device: {
    platform: 'ios' | 'android' | 'web';
    version: string;
    model?: string;
  };
  sessionId: string;
  revenueImpact: number;
  riskScore: number;
  metadata: Record<string, any>;
  auditHash: string;
}

export enum AnalyticsEventType {
  // User Lifecycle
  USER_SIGNUP = 'user_signup',
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_DELETE = 'user_delete',
  
  // Calendar & Meetings (PACK 240+)
  MEETING_CREATED = 'meeting_created',
  MEETING_BOOKED = 'meeting_booked',
  MEETING_CANCELLED = 'meeting_cancelled',
  MEETING_COMPLETED = 'meeting_completed',
  MEETING_NO_SHOW = 'meeting_no_show',
  QR_SCAN = 'qr_scan',
  
  // Wallet & Payments (PACK 255)
  WALLET_DEPOSIT = 'wallet_deposit',
  WALLET_WITHDRAWAL = 'wallet_withdrawal',
  TOKEN_PURCHASE = 'token_purchase',
  TOKEN_EARN = 'token_earn',
  TOKEN_BURN = 'token_burn',
  PAYOUT_INITIATED = 'payout_initiated',
  PAYOUT_COMPLETED = 'payout_completed',
  PAYOUT_FAILED = 'payout_failed',
  
  // Chat & Messaging (PACK 267-268)
  CHAT_MESSAGE_SENT = 'chat_message_sent',
  CHAT_MESSAGE_RECEIVED = 'chat_message_received',
  CHAT_UNLOCK = 'chat_unlock',
  CHAT_TOKEN_SPENT = 'chat_token_spent',
  
  // AI Companions (PACK 279)
  AI_CREATED = 'ai_created',
  AI_INTERACTION = 'ai_interaction',
  AI_REVENUE = 'ai_revenue',
  AI_TRAINING = 'ai_training',
  
  // Support & Safety (PACK 300+)
  SUPPORT_TICKET_CREATED = 'support_ticket_created',
  SUPPORT_TICKET_RESOLVED = 'support_ticket_resolved',
  SAFETY_REPORT = 'safety_report',
  SAFETY_ACTION = 'safety_action',
  
  // Retention (PACK 301+)
  PUSH_SENT = 'push_sent',
  PUSH_OPENED = 'push_opened',
  EMAIL_SENT = 'email_sent',
  EMAIL_OPENED = 'email_opened',
  
  // Fraud (PACK 302)
  FRAUD_DETECTED = 'fraud_detected',
  FRAUD_BLOCKED = 'fraud_blocked',
  ACCOUNT_SUSPENDED = 'account_suspended',
  
  // Growth (PACK 399)
  REFERRAL_SENT = 'referral_sent',
  REFERRAL_SIGNUP = 'referral_signup',
  INFLUENCER_LINK_CLICK = 'influencer_link_click',
  
  // General
  PAGE_VIEW = 'page_view',
  FEATURE_USED = 'feature_used',
  ERROR_OCCURRED = 'error_occurred',
}

export interface DailyRollup {
  date: string; // YYYY-MM-DD
  dau: number;
  wau: number;
  mau: number;
  revenue: number;
  tokensBurned: number;
  tokensEarned: number;
  newUsers: number;
  churnedUsers: number;
  activeMeetings: number;
  activeChats: number;
  fraudIncidents: number;
  safetyIncidents: number;
  creatorEarnings: number;
  aiRevenue: number;
  computedAt: number;
}

export interface UserLifecycle {
  userId: string;
  firstSeen: number;
  lastSeen: number;
  totalSessions: number;
  totalRevenue: number;
  totalTokensSpent: number;
  lifetimeValue: number;
  cohort: string; // YYYY-MM
  status: 'active' | 'inactive' | 'churned' | 'suspended';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  segment: string;
}

export interface CreatorEarnings {
  creatorId: string;
  date: string;
  totalEarnings: number;
  meetingEarnings: number;
  chatEarnings: number;
  aiEarnings: number;
  tokenEarnings: number;
  conversionRate: number;
  activeFollowers: number;
  disputes: number;
  refunds: number;
  netEarnings: number;
}

export interface AIUsage {
  aiId: string;
  date: string;
  interactions: number;
  revenue: number;
  activeUsers: number;
  avgSessionLength: number;
  satisfactionScore: number;
  trainingEvents: number;
  errorRate: number;
}

export interface SafetyEvent {
  eventId: string;
  timestamp: number;
  reporterId?: string;
  reportedUserId?: string;
  reportedCreatorId?: string;
  reportedAiId?: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actionTaken: string;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface MarketingAttribution {
  userId: string;
  installSource: string;
  campaignId?: string;
  influencerId?: string;
  referralChain: string[];
  country: string;
  cpi: number; // Cost per install
  cac: number; // Customer acquisition cost
  ltv: number; // Lifetime value
  roi: number; // Return on investment
  installedAt: number;
  firstPurchaseAt?: number;
}

export interface WalletFlow {
  userId: string;
  timestamp: number;
  type: 'inflow' | 'outflow';
  amount: number;
  currency: string;
  source: string;
  destination: string;
  category: string;
  flagged: boolean;
  flagReason?: string;
}

export interface KPISnapshot {
  timestamp: number;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  
  // Growth Metrics
  dau: number;
  wau: number;
  mau: number;
  newUsers: number;
  churnRate: number;
  growthVelocity: number;
  
  // Revenue Metrics
  revenueDaily: number;
  revenueMonthly: number;
  arpu: number; // Average revenue per user
  arppu: number; // Average revenue per paying user
  conversionToPaid: number;
  
  // Token Economy
  tokensBurned: number;
  tokensEarned: number;
  tokenBalance: number;
  tokenVelocity: number;
  
  // Creator Economy
  activeCreators: number;
  creatorEarnings: number;
  avgCreatorRevenue: number;
  
  // AI Metrics
  aiRevenue: number;
  aiInteractions: number;
  aiRevenueShare: number;
  
  // Safety & Trust
  fraudRate: number;
  safetyIncidents: number;
  accountSuspensions: number;
  
  // Engagement
  calendarUtilization: number;
  chatMonetizationYield: number;
  avgSessionLength: number;
  
  // Composite Scores
  platformHealthScore: number; // 0-100
  creatorEconomyScore: number; // 0-100
  trustSafetyScore: number; // 0-100
  liquidityScore: number; // 0-100
}

export interface FraudSignal {
  userId: string;
  timestamp: number;
  signalType: string;
  severity: number; // 0-100
  indicators: string[];
  metadata: Record<string, any>;
  actionRequired: boolean;
}

export interface AnalyticsQuery {
  startDate: string;
  endDate: string;
  metric: string;
  dimension?: string;
  filters?: Record<string, any>;
  groupBy?: string;
}

export interface AnalyticsExport {
  queryId: string;
  requestedBy: string;
  requestedAt: number;
  format: 'csv' | 'json' | 'pdf';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: number;
}

export interface AlertThreshold {
  metricId: string;
  threshold: number;
  condition: 'above' | 'below' | 'equals';
  channels: ('slack' | 'email' | 'sms')[];
  recipients: string[];
  enabled: boolean;
}
