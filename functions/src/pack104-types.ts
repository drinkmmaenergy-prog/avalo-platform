/**
 * PACK 104 — Anti-Ring & Anti-Collusion Detection
 * Type Definitions
 * 
 * NON-NEGOTIABLE RULES:
 * - Token price per unit never changes
 * - Revenue split always 65% creator / 35% Avalo
 * - No punishment fees, appeal fees, or paid enforcement bypass
 * - Detection never reduces already-completed legitimate earnings
 * - Only restricts future abuse
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// FRAUD GRAPH EDGE TYPES
// ============================================================================

export type EdgeType = 
  | 'DEVICE'           // Shared device
  | 'NETWORK'          // Shared IP/network
  | 'PAYMENT'          // Payment patterns
  | 'BEHAVIOR'         // Behavioral patterns
  | 'SOCIAL'           // Social/audience patterns
  | 'ENFORCEMENT';     // Enforcement history

export interface FraudGraphEdge {
  edgeId: string;
  userA: string;
  userB: string;
  edgeType: EdgeType;
  weight: number;              // 0-1 correlation strength
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastSeenAt: Timestamp;
  metadata: {
    deviceId?: string;
    ipHash?: string;
    transactionCount?: number;
    mutualPaymentCount?: number;
    sharedAudiencePercent?: number;
    enforcementLinkReason?: string;
    [key: string]: any;
  };
}

// ============================================================================
// COLLUSION DETECTION
// ============================================================================

export type CollusionRiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface CollusionRing {
  ringId: string;
  memberUserIds: string[];
  ringSize: number;
  detectedAt: Timestamp;
  collusionProbability: number;  // 0-1
  riskLevel: CollusionRiskLevel;
  
  // Ring characteristics
  characteristics: {
    sharedDevices: number;
    sharedIPs: number;
    internalTransactionCount: number;
    externalTransactionCount: number;
    avgInternalWeight: number;
    isolationScore: number;        // How isolated from external users
  };
  
  // Detection signals
  signals: CollusionSignal[];
  
  // Status
  status: 'DETECTED' | 'UNDER_REVIEW' | 'CONFIRMED' | 'FALSE_POSITIVE';
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  reviewNotes?: string;
  
  // Case tracking
  moderationCaseId?: string;
  
  updatedAt: Timestamp;
}

export interface CollusionSignal {
  type: 'DEVICE_OVERLAP' | 'NETWORK_OVERLAP' | 'PAYMENT_LOOP' | 'BEHAVIORAL_SIMILARITY' | 'CLOSED_NETWORK';
  severity: number;  // 0-1
  description: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// COMMERCIAL SPAM DETECTION
// ============================================================================

export type CommercialSpamRiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface CommercialSpamCluster {
  clusterId: string;
  memberUserIds: string[];
  clusterSize: number;
  detectedAt: Timestamp;
  spamProbability: number;  // 0-1
  riskLevel: CommercialSpamRiskLevel;
  
  // Cluster characteristics
  characteristics: {
    accountCreationWindow: number;  // Hours between first and last account
    bioSimilarityScore: number;     // 0-1
    profileStructureSimilarity: number;  // 0-1
    outboundMessageCount: number;
    uniqueTargetCount: number;
    replyRate: number;              // 0-1
    kycProgressRate: number;        // 0-1
  };
  
  // Detection signals
  signals: CommercialSpamSignal[];
  
  // Status
  status: 'DETECTED' | 'UNDER_REVIEW' | 'CONFIRMED' | 'FALSE_POSITIVE';
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  reviewNotes?: string;
  
  // Case tracking
  moderationCaseId?: string;
  
  updatedAt: Timestamp;
}

export interface CommercialSpamSignal {
  type: 'RAPID_CREATION' | 'BIO_DUPLICATION' | 'MASS_MESSAGING' | 'LOW_ENGAGEMENT' | 'NO_KYC';
  severity: number;  // 0-1
  description: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// ENFORCEMENT FOR RINGS & COLLUSION
// ============================================================================

export type CollusionEnforcementLevel = 
  | 'NONE'                    // No action
  | 'VISIBILITY_REDUCED'      // Lower discovery visibility
  | 'MONETIZATION_THROTTLED'  // Temporary earning throttle
  | 'MANUAL_REVIEW_REQUIRED'; // Hard block until manual review

export interface CollusionEnforcementAction {
  actionId: string;
  targetUserId: string;
  ringId?: string;
  clusterId?: string;
  enforcementLevel: CollusionEnforcementLevel;
  reason: string;
  appliedAt: Timestamp;
  expiresAt?: Timestamp;
  appliedBy: 'SYSTEM' | string;  // System or moderator ID
  moderationCaseId?: string;
  reversedAt?: Timestamp;
  reversedBy?: string;
  reversalReason?: string;
}

// ============================================================================
// CASE GENERATION
// ============================================================================

export type ClusterCasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ClusterModerationCase {
  caseId: string;
  caseType: 'COLLUSION_RING' | 'COMMERCIAL_SPAM_CLUSTER';
  
  // Linked entities
  ringId?: string;
  clusterId?: string;
  linkedUserIds: string[];
  
  // Case details
  priority: ClusterCasePriority;
  openedAt: Timestamp;
  openedBy: 'AUTO' | string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'ESCALATED';
  
  // Evidence
  evidenceSummary: {
    graphSnapshot?: string;      // JSON snapshot of subgraph
    riskFeatures: string[];
    transactionExamples?: any[];
    signalsSummary: string;
  };
  
  // Priority factors
  priorityFactors: {
    minorSafetyRisk: boolean;
    financialClusterDepth: number;
    crossRegionSpread: boolean;
    coordinatedViolations: boolean;
  };
  
  // Resolution
  assignedTo?: string;
  assignedAt?: Timestamp;
  resolvedAt?: Timestamp;
  resolution?: ClusterResolution;
  
  updatedAt: Timestamp;
}

export interface ClusterResolution {
  outcome: 'NO_ACTION' | 'SOFT_RESTRICTION' | 'TEMPORARY_SUSPENSION' | 'PERMANENT_SUSPENSION';
  affectedUserIds: string[];
  reviewNote: string;
  reviewedBy: string;
  resolvedAt: Timestamp;
}

// ============================================================================
// GRAPH ANALYSIS RESULTS
// ============================================================================

export interface GraphAnalysisResult {
  userId: string;
  analyzedAt: Timestamp;
  
  // Connectivity metrics
  totalEdges: number;
  strongEdges: number;  // weight > 0.7
  edgeTypeDistribution: Record<EdgeType, number>;
  
  // Ring membership
  suspectedRings: string[];  // Ring IDs
  confirmedRings: string[];
  
  // Cluster membership
  suspectedClusters: string[];  // Cluster IDs
  confirmedClusters: string[];
  
  // Risk scores
  collusionRiskScore: number;  // 0-100
  spamClusterRiskScore: number;  // 0-100
  
  // Recommendations
  recommendedAction: 'NONE' | 'MONITOR' | 'SOFT_RESTRICT' | 'REVIEW_REQUIRED';
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface CollusionDetectionConfig {
  // Minimum cluster size to flag
  minRingSize: number;
  
  // Edge weight thresholds
  strongEdgeThreshold: number;
  
  // Internal vs external transaction ratio
  isolationThreshold: number;
  
  // Probability thresholds
  lowRiskThreshold: number;
  mediumRiskThreshold: number;
  highRiskThreshold: number;
  
  // Decay parameters
  edgeDecayDays: number;
}

export const DEFAULT_COLLUSION_CONFIG: CollusionDetectionConfig = {
  minRingSize: 3,
  strongEdgeThreshold: 0.7,
  isolationThreshold: 0.8,  // 80% internal transactions
  lowRiskThreshold: 0.3,
  mediumRiskThreshold: 0.6,
  highRiskThreshold: 0.85,
  edgeDecayDays: 30,
};

export interface SpamClusterDetectionConfig {
  // Account creation window (hours)
  maxCreationWindow: number;
  
  // Similarity thresholds
  minBioSimilarity: number;
  minProfileSimilarity: number;
  
  // Messaging patterns
  minOutboundMessages: number;
  maxReplyRate: number;
  
  // KYC threshold
  maxKycProgressRate: number;
  
  // Probability thresholds
  lowRiskThreshold: number;
  mediumRiskThreshold: number;
  highRiskThreshold: number;
}

export const DEFAULT_SPAM_CLUSTER_CONFIG: SpamClusterDetectionConfig = {
  maxCreationWindow: 48,  // 48 hours
  minBioSimilarity: 0.7,
  minProfileSimilarity: 0.6,
  minOutboundMessages: 50,
  maxReplyRate: 0.1,  // 10%
  maxKycProgressRate: 0.2,  // 20%
  lowRiskThreshold: 0.3,
  mediumRiskThreshold: 0.6,
  highRiskThreshold: 0.85,
};

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface EdgeUpdateInput {
  userA: string;
  userB: string;
  edgeType: EdgeType;
  weight?: number;
  metadata?: Record<string, any>;
}

export interface ClusterDetectionInput {
  minClusterSize?: number;
  analysisTimeWindowDays?: number;
  focusUserId?: string;  // Optionally focus analysis on specific user
}