/**
 * PACK 180: Social Guardian Types
 * Real-time dialogue mediation and safety intervention types
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// Risk Detection Types
// ============================================================================

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type RiskCategory = 
  | 'misunderstanding_escalation'
  | 'increasing_aggression'
  | 'manipulation_pressure'
  | 'threat_hints'
  | 'harassment_loops'
  | 'coercion'
  | 'stalking'
  | 'extortion'
  | 'blackmail'
  | 'abuse_escalation'
  | 'grooming';

export interface RiskSignal {
  category: RiskCategory;
  confidence: number; // 0-1
  indicators: string[];
  severity: number; // 0-100
}

export interface ConversationContext {
  conversationId: string;
  messageHistory: MessageContext[];
  participants: string[];
  responsePatterns: ResponsePattern[];
}

export interface MessageContext {
  messageId: string;
  senderId: string;
  content: string;
  timestamp: Timestamp;
  replyToMessageId?: string;
  sentiment?: number; // -1 to 1
}

export interface ResponsePattern {
  userId: string;
  responseTime: number; // ms
  messageCount: number;
  lastResponseAt: Timestamp;
  isResponding: boolean;
}

// ============================================================================
// Intervention Types
// ============================================================================

export type InterventionType = 
  | 'soft_suggestion'
  | 'boundary_defense'
  | 'automatic_cooling'
  | 'conversation_freeze';

export type InterventionLevel = 'minimal' | 'moderate' | 'proactive';

export interface GuardianIntervention {
  interventionId: string;
  conversationId: string;
  userId: string; // User who triggered the intervention
  targetUserId: string; // User being protected
  interventionType: InterventionType;
  riskCategory: RiskCategory;
  riskLevel: RiskLevel;
  triggerMessageId: string;
  message: string; // Intervention message shown to user
  suggestedActions: string[];
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
  resolution?: InterventionResolution;
  userFeedback?: string;
  appealSubmitted?: boolean;
  appealReason?: string;
  updatedAt: Timestamp;
}

export type InterventionResolution = 
  | 'user_acknowledged'
  | 'user_took_action'
  | 'user_ignored'
  | 'auto_resolved'
  | 'escalated'
  | 'appealed';

// ============================================================================
// Risk Event Types
// ============================================================================

export interface GuardianRiskEvent {
  eventId: string;
  conversationId: string;
  userId: string;
  targetUserId: string;
  riskSignals: RiskSignal[];
  riskLevel: RiskLevel;
  messageSnapshot: {
    messageId: string;
    content: string;
    contextMessages: string[];
  };
  detectionMethod: string;
  timestamp: Timestamp;
  interventionTriggered: boolean;
  interventionId?: string;
}

// ============================================================================
// Cooling Session Types
// ============================================================================

export type CoolingMeasure = 
  | 'message_slowdown'
  | 'voice_disabled'
  | 'media_disabled'
  | 'call_disabled'
  | 'conversation_frozen';

export interface CoolingMeasureConfig {
  measure: CoolingMeasure;
  duration: number; // seconds
  reason: string;
}

export interface GuardianCoolingSession {
  sessionId: string;
  conversationId: string;
  userId: string; // User who caused the cooling
  affectedUserId: string; // User being protected
  measures: CoolingMeasureConfig[];
  reason: string;
  riskLevel: RiskLevel;
  status: 'active' | 'expired' | 'manually_lifted';
  createdAt: Timestamp;
  expiresAt: Timestamp;
  liftedAt?: Timestamp;
  acknowledged: boolean;
  acknowledgedAt?: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// Message Rewrite Types
// ============================================================================

export type RewriteIntent = 
  | 'calm_tone'
  | 'clarify_intent'
  | 'express_boundary'
  | 'apologize'
  | 'decline_politely';

export interface GuardianRewriteRequest {
  requestId: string;
  userId: string;
  conversationId: string;
  originalMessage: string;
  rewriteIntent: RewriteIntent;
  status: 'pending' | 'completed' | 'accepted' | 'rejected';
  rewrittenMessage?: string;
  alternatives?: string[];
  createdAt: Timestamp;
  completedAt?: Timestamp;
  userChoice?: 'accepted' | 'rejected' | 'modified';
  updatedAt: Timestamp;
}

// ============================================================================
// Guardian Settings Types
// ============================================================================

export interface GuardianSettings {
  userId: string;
  enabled: boolean;
  interventionLevel: InterventionLevel;
  autoRewriteSuggestions: boolean;
  notifyOnIntervention: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// Detection Result Types
// ============================================================================

export interface RiskDetectionResult {
  riskLevel: RiskLevel;
  riskSignals: RiskSignal[];
  shouldIntervene: boolean;
  recommendedIntervention?: InterventionType;
  recommendedMeasures?: CoolingMeasure[];
  confidence: number;
}

// ============================================================================
// Boundary Detection Types
// ============================================================================

export interface BoundarySignal {
  detected: boolean;
  boundaryType: 'stop' | 'no' | 'not_interested' | 'leave_alone' | 'block_threat';
  confidence: number;
  messageId: string;
  timestamp: Timestamp;
}

export interface BoundaryViolation {
  detected: boolean;
  originalBoundary: BoundarySignal;
  violatingMessages: MessageContext[];
  severity: number; // 0-100
  shouldFreeze: boolean;
}

// ============================================================================
// Pattern Analysis Types
// ============================================================================

export interface EscalationPattern {
  detected: boolean;
  startMessageId: string;
  endMessageId: string;
  escalationRate: number; // messages per minute increase
  sentimentDrop: number; // sentiment decline rate
  aggressionIncrease: number; // 0-100
}

export interface HarassmentPattern {
  detected: boolean;
  messageCount: number;
  timeSpan: number; // seconds
  persistenceAfterBoundary: boolean;
  repetitiveContent: boolean;
}

// ============================================================================
// Helper Types
// ============================================================================

export interface GuardianContext {
  conversationId: string;
  currentUserId: string;
  otherUserId: string;
  userSettings: GuardianSettings;
  activeCoolin
gSessions: GuardianCoolingSession[];
  recentInterventions: GuardianIntervention[];
}

export interface GuardianAnalysis {
  riskDetection: RiskDetectionResult;
  boundaryViolation?: BoundaryViolation;
  escalationPattern?: EscalationPattern;
  harassmentPattern?: HarassmentPattern;
  recommendations: {
    shouldIntervene: boolean;
    interventionType?: InterventionType;
    message: string;
    suggestedActions: string[];
    coolingMeasures?: CoolingMeasureConfig[];
  };
}