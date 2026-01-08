import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export type ViolationType =
  | 'emotional_debt'
  | 'ownership_claim'
  | 'access_demand'
  | 'control_attempt'
  | 'time_demand'
  | 'financial_leverage'
  | 'guilt_pressure'
  | 'jealousy_war'
  | 'harassment';

export type EventType =
  | 'emotional_debt'
  | 'ownership_claim'
  | 'access_demand'
  | 'control_attempt'
  | 'time_demand'
  | 'financial_leverage'
  | 'guilt_trip'
  | 'jealousy_display'
  | 'tracking_behavior';

export type PressureType =
  | 'guilt'
  | 'obligation'
  | 'debt'
  | 'loyalty_demand'
  | 'access_pressure'
  | 'attention_demand'
  | 'exclusivity_request';

export type RestrictionType =
  | 'chat_cooldown'
  | 'temporary_block'
  | 'permanent_ban'
  | 'access_freeze'
  | 'message_restriction';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export type CaseStatus = 'pending' | 'investigating' | 'resolved' | 'dismissed';

export type RestrictionStatus = 'active' | 'expired' | 'revoked';

export interface CreatorIndependenceCase {
  caseId: string;
  creatorId: string;
  fanId: string;
  violationType: ViolationType;
  evidence: {
    messageIds?: string[];
    screenshots?: string[];
    description: string;
    context?: string;
  };
  status: CaseStatus;
  severity: SeverityLevel;
  timestamp: Timestamp;
  reporterId: string;
  resolution?: {
    action: string;
    notes: string;
    resolvedBy: string;
    resolvedAt: Timestamp;
  };
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FanEntitlementEvent {
  eventId: string;
  fanId: string;
  creatorId: string;
  eventType: EventType;
  messageContent: string;
  severity: SeverityLevel;
  timestamp: Timestamp;
  autoDetected: boolean;
  detectionDetails?: {
    patterns: string[];
    confidence: number;
    triggers: string[];
  };
  metadata?: {
    chatId?: string;
    messageId?: string;
    context?: string;
  };
  createdAt: Timestamp;
}

export interface EmotionalPressureLog {
  logId: string;
  fanId: string;
  creatorId: string;
  messageId: string;
  pressureType: PressureType;
  detected: boolean;
  blocked: boolean;
  timestamp: Timestamp;
  analysis?: {
    patterns: string[];
    indicators: string[];
    riskScore: number;
  };
  createdAt: Timestamp;
}

export interface CreatorBoundarySettings {
  creatorId: string;
  noEmotionalLabor: boolean;
  autoDeclineRomance: boolean;
  autoBlockGuilt: boolean;
  professionalMode: boolean;
  showBoundaryBanner: boolean;
  customBannerText?: string;
  allowedInteractionTypes?: string[];
  restrictedKeywords?: string[];
  cooldownPeriods?: {
    afterDemandingMessage: number;
    afterMultipleViolations: number;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FanRestrictionRecord {
  recordId: string;
  fanId: string;
  creatorId: string;
  restrictionType: RestrictionType;
  reason: string;
  startTime: Timestamp;
  endTime: Timestamp | null;
  status: RestrictionStatus;
  issuedBy: string;
  metadata?: {
    caseId?: string;
    violationCount?: number;
    previousRestrictions?: number;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProfessionalTemplate {
  templateId: string;
  name: string;
  content: string;
  category: 'greeting' | 'boundary' | 'decline' | 'support_thanks' | 'professional';
  useCount: number;
}

export interface CreatorProfessionalTemplates {
  creatorId: string;
  templates: ProfessionalTemplate[];
  updatedAt: Timestamp;
}

export interface EntitlementDetectionPattern {
  pattern: RegExp;
  type: EventType;
  severity: SeverityLevel;
  weight: number;
  requiresContext?: boolean;
}

export interface IndependenceMeasure {
  type: 'cooldown' | 'block' | 'ban' | 'freeze' | 'warning';
  duration?: number;
  reason: string;
  severity: SeverityLevel;
  metadata?: Record<string, any>;
}

export interface IndependenceSystemConfig {
  enabled: boolean;
  autoDetectionEnabled: boolean;
  autoBanEnabled: boolean;
  detectionSensitivity: 'low' | 'medium' | 'high';
  cooldownDurations: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  banThresholds: {
    violationCount: number;
    timeWindowHours: number;
    severityWeight: Record<SeverityLevel, number>;
  };
  patterns: EntitlementDetectionPattern[];
}

export interface DetectionResult {
  detected: boolean;
  eventType?: EventType;
  severity?: SeverityLevel;
  confidence: number;
  patterns: string[];
  triggers: string[];
  recommendedAction?: IndependenceMeasure;
}

export interface BoundaryViolationContext {
  fanId: string;
  creatorId: string;
  messageContent: string;
  chatHistory?: Array<{
    content: string;
    timestamp: Timestamp;
    senderId: string;
  }>;
  fanSpendingHistory?: {
    totalSpent: number;
    recentTransactions: number;
    lastTransactionDate?: Timestamp;
  };
  previousViolations?: Array<{
    violationType: ViolationType;
    timestamp: Timestamp;
    severity: SeverityLevel;
  }>;
}

export interface IndependenceEnforcementResult {
  success: boolean;
  actionTaken: IndependenceMeasure;
  caseId?: string;
  eventId?: string;
  logId?: string;
  restrictionId?: string;
  message?: string;
  error?: string;
}

export interface CreatorIndependenceStats {
  creatorId: string;
  totalCases: number;
  casesBySeverity: Record<SeverityLevel, number>;
  casesByType: Record<ViolationType, number>;
  totalEventsDetected: number;
  totalBlocked: number;
  activeBoundaries: number;
  restrictedFans: number;
  periodStart: Timestamp;
  periodEnd: Timestamp;
}

export interface FanBehaviorProfile {
  fanId: string;
  totalViolations: number;
  violationsByType: Record<ViolationType, number>;
  lastViolation?: Timestamp;
  activeRestrictions: number;
  riskScore: number;
  isPermanentlyBanned: boolean;
  creatorsAffected: string[];
}