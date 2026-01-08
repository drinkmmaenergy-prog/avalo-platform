/**
 * PACK 168 — Avalo Anti-Farming & Wealth-Protection Engine
 * Types and Interfaces
 */

import { Timestamp } from "firebase-admin/firestore";

export interface FarmingCase {
  caseId: string;
  type: FarmingCaseType;
  status: FarmingCaseStatus;
  severity: "low" | "medium" | "high" | "critical";
  involvedUserIds: string[];
  primaryTargetUserId?: string;
  detectedAt: Timestamp;
  evidence: FarmingEvidence[];
  investigationNotes: string[];
  resolution?: FarmingResolution;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  metadata: Record<string, any>;
}

export enum FarmingCaseType {
  TOKEN_LAUNDERING = "token_laundering",
  MONEY_HARVESTING = "money_harvesting",
  GROUP_FARMING = "group_farming",
  MULTI_ACCOUNT_FARMING = "multi_account_farming",
  REFUND_LAUNDERING = "refund_laundering",
  EMOTIONAL_GROOMING = "emotional_grooming",
  ROMANCE_FOR_PAYMENT = "romance_for_payment",
  ATTENTION_FOR_PAYMENT = "attention_for_payment",
  COORDINATED_EXPLOITATION = "coordinated_exploitation"
}

export enum FarmingCaseStatus {
  DETECTED = "detected",
  INVESTIGATING = "investigating",
  CONFIRMED = "confirmed",
  FALSE_POSITIVE = "false_positive",
  RESOLVED = "resolved",
  APPEALED = "appealed"
}

export interface FarmingEvidence {
  type: string;
  timestamp: Timestamp;
  data: Record<string, any>;
  confidence: number;
  description: string;
}

export interface FarmingResolution {
  action: ResolutionAction;
  reason: string;
  penaltiesApplied: string[];
  affectedAccounts: string[];
  frozenAmount?: number;
  bannedDevices?: string[];
  bannedWallets?: string[];
}

export enum ResolutionAction {
  NO_ACTION = "no_action",
  WARNING_ISSUED = "warning_issued",
  EARNINGS_FROZEN = "earnings_frozen",
  ACCOUNT_SUSPENDED = "account_suspended",
  PERMANENT_BAN = "permanent_ban",
  DEVICE_BAN = "device_ban",
  WALLET_BAN = "wallet_ban",
  MANUAL_REVIEW_REQUIRED = "manual_review_required"
}

export interface WealthProtectionProfile {
  userId: string;
  totalSpent: number;
  totalEarned: number;
  last30DaysSpent: number;
  last30DaysEarned: number;
  protectionLevel: ProtectionLevel;
  protectionSettings: WealthProtectionSettings;
  spendingAlerts: SpendingAlert[];
  blockedInteractions: BlockedInteraction[];
  healthReminders: HealthReminder[];
  lastUpdated: Timestamp;
}

export enum ProtectionLevel {
  NONE = "none",
  BASIC = "basic",
  ENHANCED = "enhanced",
  MAXIMUM = "maximum"
}

export interface WealthProtectionSettings {
  spendingAlertsEnabled: boolean;
  weeklyBudget?: number;
  safePurchaseModeEnabled: boolean;
  autoRejectRomanticMonetization: boolean;
  autoReportFarmingAttempts: boolean;
  lockedPayoutCalendar: boolean;
}

export interface SpendingAlert {
  alertId: string;
  timestamp: Timestamp;
  type: "budget_warning" | "high_risk_purchase" | "predatory_pattern";
  amount: number;
  recipientUserId: string;
  message: string;
  userResponse?: "acknowledged" | "overridden" | "cancelled";
}

export interface BlockedInteraction {
  blockId: string;
  timestamp: Timestamp;
  targetUserId: string;
  reason: string;
  blockType: "soft_filter" | "hard_block" | "investigation_block";
  canAppeal: boolean;
  expiresAt?: Timestamp;
}

export interface HealthReminder {
  reminderId: string;
  timestamp: Timestamp;
  type: "spending_health" | "budget_suggestion" | "protection_recommendation";
  message: string;
  action?: string;
  dismissed: boolean;
}

export interface SpendingRiskEvent {
  eventId: string;
  userId: string;
  targetUserId: string;
  timestamp: Timestamp;
  eventType: SpendingRiskEventType;
  amount: number;
  context: string;
  riskScore: number;
  phase: ProtectionPhase;
  action: string;
  metadata: Record<string, any>;
}

export enum SpendingRiskEventType {
  UNUSUAL_LARGE_PURCHASE = "unusual_large_purchase",
  RAPID_SPENDING_INCREASE = "rapid_spending_increase",
  TARGETED_BY_FARMER = "targeted_by_farmer",
  EMOTIONAL_MANIPULATION_DETECTED = "emotional_manipulation_detected",
  ROMANCE_MONETIZATION_ATTEMPT = "romance_monetization_attempt",
  COORDINATED_GROOMING = "coordinated_grooming"
}

export enum ProtectionPhase {
  PHASE_0_NORMAL = "phase_0_normal",
  PHASE_1_SOFT_FILTER = "phase_1_soft_filter",
  PHASE_2_HEALTH_REMINDER = "phase_2_health_reminder",
  PHASE_3_HARD_BLOCK = "phase_3_hard_block",
  PHASE_4_INVESTIGATION = "phase_4_investigation"
}

export interface HarvestDetectionLog {
  logId: string;
  timestamp: Timestamp;
  detectionType: string;
  involvedUserIds: string[];
  patterns: DetectedPattern[];
  confidence: number;
  actionTaken: string;
  escalated: boolean;
  caseId?: string;
}

export interface DetectedPattern {
  pattern: string;
  description: string;
  evidence: any[];
  weight: number;
}

export interface FarmingRiskScore {
  userId: string;
  score: number;
  factors: RiskFactor[];
  lastCalculated: Timestamp;
  auditFrequency: number;
  mysteryShopperTriggers: number;
  escrowProtectionDays: number;
  notes: string[];
}

export interface RiskFactor {
  factor: string;
  weight: number;
  evidence: string;
  confidence: number;
}

export interface MultiAccountCluster {
  clusterId: string;
  accountIds: string[];
  detectedAt: Timestamp;
  signals: ClusterSignal[];
  confidence: number;
  status: "suspected" | "confirmed" | "dismissed";
  investigationId?: string;
}

export interface ClusterSignal {
  signalType: "ip_correlation" | "device_correlation" | "behavior_similarity" | "message_scripts" | "referral_loop" | "synchronized_activity";
  strength: number;
  evidence: any;
  description: string;
}

export interface EmotionalGroomingPattern {
  patternId: string;
  detectedAt: Timestamp;
  groomerId: string;
  victimId: string;
  tactics: GroomingTactic[];
  severity: number;
  monetizationLinked: boolean;
  blocked: boolean;
}

export interface GroomingTactic {
  tactic: "guilt_tripping" | "forced_loyalty" | "prove_care_payment" | "buy_or_leave" | "seduction_tied_tokens" | "voice_manipulation";
  instances: GroomingInstance[];
  averageAmount?: number;
}

export interface GroomingInstance {
  timestamp: Timestamp;
  context: string;
  amount?: number;
  messageSnippet?: string;
}

export interface TokenLaunderingNetwork {
  networkId: string;
  detectedAt: Timestamp;
  accounts: string[];
  transactions: LaunderingTransaction[];
  cycleDetected: boolean;
  totalVolume: number;
  confidence: number;
  frozen: boolean;
}

export interface LaunderingTransaction {
  from: string;
  to: string;
  amount: number;
  timestamp: Timestamp;
  suspicious: boolean;
  reason?: string;
}

export interface AffiliateLoopAudit {
  auditId: string;
  timestamp: Timestamp;
  affiliateChain: string[];
  suspicious: boolean;
  circularReferrals: boolean;
  fakeAccountsDetected: number;
  action: string;
}

export interface SpendingHealthNotification {
  notificationId: string;
  userId: string;
  timestamp: Timestamp;
  type: "weekly_budget" | "spending_milestone" | "protection_enabled" | "risk_detected";
  message: string;
  actionable: boolean;
  action?: string;
  dismissed: boolean;
}

export interface FarmingAppeal {
  appealId: string;
  caseId: string;
  userId: string;
  submittedAt: Timestamp;
  reason: string;
  evidence: string[];
  status: "pending" | "under_review" | "approved" | "denied";
  reviewedBy?: string;
  reviewedAt?: Timestamp;
  decision?: string;
}

export interface NetworkGraphScanResult {
  scanId: string;
  scanTimestamp: Timestamp;
  nodesScanned: number;
  suspiciousNetworks: number;
  casesCreated: number[];
  duration: number;
}

export interface SpendingThreshold {
  level: "normal" | "high" | "very_high" | "whale";
  monthlySpending: number;
  protectionTriggered: boolean;
}

export interface EarningThreshold {
  level: "normal" | "high" | "very_high" | "top_creator";
  monthlyEarnings: number;
  protectionTriggered: boolean;
}