/**
 * PACK 193 — Avalo Club Intelligence Architecture
 * Type definitions for smart community ranking system
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================
// CONTRIBUTION TYPES
// ============================================

export enum ContributionType {
  KNOWLEDGE = 'knowledge',
  ENGAGEMENT = 'engagement',
  CREATIVITY = 'creativity',
  COLLABORATION = 'collaboration',
  LEADERSHIP = 'leadership',
  TUTORIAL = 'tutorial',
  GUIDE = 'guide',
  QA = 'qa',
  PROJECT = 'project',
  MENTORSHIP = 'mentorship',
  RESOURCE = 'resource',
}

export interface ClubContribution {
  contributionId: string;
  clubId: string;
  userId: string;
  userName: string;
  contributionType: ContributionType;
  description: string;
  relatedContentId?: string;
  impactScore: number;
  isValidated: boolean;
  validatedBy?: string;
  validatedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ContributionScore {
  scoreId: string;
  clubId: string;
  userId: string;
  userName: string;
  totalScore: number;
  knowledgeScore: number;
  engagementScore: number;
  creativityScore: number;
  collaborationScore: number;
  leadershipScore: number;
  contributionCount: number;
  lastContributionAt: Timestamp;
  lastUpdated: Timestamp;
}

// ============================================
// ROLE TYPES (Functional, NOT hierarchical)
// ============================================

export enum ClubRoleType {
  OWNER = 'owner',
  MODERATOR = 'moderator',
  COACH = 'coach',
  RESEARCHER = 'researcher',
  ARCHIVIST = 'archivist',
  HOST = 'host',
  MEMBER = 'member',
}

export interface ClubRole {
  roleId: string;
  clubId: string;
  userId: string;
  userName: string;
  role: ClubRoleType;
  description: string;
  isFunctional: boolean;
  isStatusBased: boolean;
  assignedBy: string;
  assignedAt: Timestamp;
  isActive: boolean;
}

// ============================================
// CHALLENGE TYPES (Safe missions only)
// ============================================

export enum ChallengeType {
  FITNESS = 'fitness',
  LANGUAGE = 'language',
  BUSINESS = 'business',
  CREATIVITY = 'creativity',
  TEAM_PROJECT = 'team_project',
}

export enum ChallengeDifficulty {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export interface ClubChallenge {
  challengeId: string;
  clubId: string;
  createdBy: string;
  title: string;
  description: string;
  type: ChallengeType;
  difficulty: ChallengeDifficulty;
  startDate: Timestamp;
  endDate: Timestamp;
  participantCount: number;
  completionCount: number;
  isSafe: boolean;
  isEducational: boolean;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MissionProgress {
  progressId: string;
  userId: string;
  clubId: string;
  challengeId: string;
  challengeTitle: string;
  progressPercent: number;
  milestones: string[];
  completedMilestones: string[];
  isCompleted: boolean;
  completedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// TOXICITY TYPES
// ============================================

export enum ToxicityType {
  FLAME_WAR = 'flame_war',
  CLUB_RAIDING = 'club_raiding',
  TOPIC_HIJACKING = 'topic_hijacking',
  DRAMA_INSTIGATION = 'drama_instigation',
  CONFLICT_ESCALATION = 'conflict_escalation',
  POLITICAL_CONFLICT = 'political_conflict',
  RELIGIOUS_CONFLICT = 'religious_conflict',
  GENDER_WAR = 'gender_war',
  BULLYING = 'bullying',
  HARASSMENT = 'harassment',
}

export enum SeverityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ToxicityEvent {
  eventId: string;
  clubId: string;
  toxicityType: ToxicityType;
  severityLevel: SeverityLevel;
  reportedUserId?: string;
  reportedContentId?: string;
  reportedContentType?: 'post' | 'comment' | 'thread';
  description: string;
  detectedBy: 'ai' | 'user_report' | 'moderator';
  detectedAt: Timestamp;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Timestamp;
  resolution?: string;
  mitigationActions: string[];
}

// ============================================
// CLIQUE DETECTION TYPES
// ============================================

export enum CliquePattern {
  EXCLUSION_GROUP = 'exclusion_group',
  NEWCOMER_BULLYING = 'newcomer_bullying',
  ELITE_SUBGROUP = 'elite_subgroup',
  COORDINATED_HUMILIATION = 'coordinated_humiliation',
  VIP_SEGREGATION = 'vip_segregation',
  COOL_GANG_VS_OUTSIDERS = 'cool_gang_vs_outsiders',
}

export interface CliqueDetection {
  detectionId: string;
  clubId: string;
  pattern: CliquePattern;
  severityScore: number;
  involvedUserIds: string[];
  excludedUserIds: string[];
  evidenceData: {
    interactionMatrix?: Record<string, number>;
    exclusionRate?: number;
    subgroupCohesion?: number;
  };
  detectedAt: Timestamp;
  isMitigated: boolean;
  mitigatedBy?: string;
  mitigatedAt?: Timestamp;
  mitigationStrategy?: string;
}

export interface NewcomerBoost {
  boostId: string;
  clubId: string;
  userId: string;
  userName: string;
  boostMultiplier: number;
  isActive: boolean;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

// ============================================
// SAFETY SETTINGS
// ============================================

export interface ClubSafetySettings {
  clubId: string;
  antiCliqueEnabled: boolean;
  antiToxicityEnabled: boolean;
  newcomerProtectionEnabled: boolean;
  autoModeration: boolean;
  toxicitySensitivity: 'low' | 'medium' | 'high';
  cliqueDetectionThreshold: number;
  newcomerBoostDuration: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================
// ANALYTICS & INSIGHTS
// ============================================

export interface ClubHealthMetrics {
  clubId: string;
  healthScore: number;
  toxicityIndex: number;
  cliqueRisk: number;
  contributionDiversity: number;
  newcomerRetention: number;
  activeContributors: number;
  averageContributionScore: number;
  lastCalculated: Timestamp;
}

export interface ContributionHeatmap {
  clubId: string;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  contributionsByType: Record<ContributionType, number>;
  contributionsByUser: Record<string, number>;
  topContributors: Array<{
    userId: string;
    userName: string;
    score: number;
    contributionCount: number;
  }>;
  generatedAt: Timestamp;
}

// ============================================
// MODERATION ACTIONS
// ============================================

export interface ModerationAction {
  actionId: string;
  clubId: string;
  moderatorId: string;
  targetUserId?: string;
  targetContentId?: string;
  actionType: 'warning' | 'cooldown' | 'visibility_reduction' | 'ban' | 'content_removal';
  reason: string;
  relatedEventId?: string;
  duration?: number;
  issuedAt: Timestamp;
  expiresAt?: Timestamp;
  isActive: boolean;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface RecordContributionRequest {
  clubId: string;
  contributionType: ContributionType;
  description: string;
  relatedContentId?: string;
}

export interface RecordContributionResponse {
  success: boolean;
  contributionId?: string;
  impactScore?: number;
  error?: string;
}

export interface AssignRoleRequest {
  clubId: string;
  userId: string;
  role: ClubRoleType;
  description: string;
}

export interface AssignRoleResponse {
  success: boolean;
  roleId?: string;
  error?: string;
}

export interface CreateChallengeRequest {
  clubId: string;
  title: string;
  description: string;
  type: ChallengeType;
  difficulty: ChallengeDifficulty;
  startDate: string;
  endDate: string;
}

export interface CreateChallengeResponse {
  success: boolean;
  challengeId?: string;
  error?: string;
}

export interface DetectCliqueRequest {
  clubId: string;
  forceRecheck?: boolean;
}

export interface DetectCliqueResponse {
  success: boolean;
  cliqueDetected: boolean;
  pattern?: CliquePattern;
  severityScore?: number;
  detectionId?: string;
  error?: string;
}

export interface ResolveToxicityRequest {
  eventId: string;
  resolution: string;
  actions: string[];
}

export interface ResolveToxicityResponse {
  success: boolean;
  error?: string;
}

export interface GetContributionScoresRequest {
  clubId: string;
  limit?: number;
  minScore?: number;
}

export interface GetContributionScoresResponse {
  success: boolean;
  scores?: ContributionScore[];
  error?: string;
}

export interface GetClubHealthRequest {
  clubId: string;
}

export interface GetClubHealthResponse {
  success: boolean;
  healthMetrics?: ClubHealthMetrics;
  recentToxicity?: ToxicityEvent[];
  cliqueDetections?: CliqueDetection[];
  error?: string;
}

// ============================================
// VALIDATION HELPERS
// ============================================

export const FORBIDDEN_CHALLENGE_TYPES = [
  'flirt',
  'seduction',
  'jealousy',
  'humiliation',
  'popularity',
  'attractiveness',
  'wealth',
  'spending',
];

export const FORBIDDEN_CONTRIBUTION_TYPES = [
  'beauty',
  'attractiveness',
  'flirting',
  'spending',
  'wealth',
  'popularity',
];

export const FORBIDDEN_ROLE_TYPES = [
  'alpha',
  'beta',
  'omega',
  'top_fan',
  'top_supporter',
  'vip_elite',
  'cool_member',
];

export function isValidContributionType(type: string): type is ContributionType {
  return Object.values(ContributionType).includes(type as ContributionType);
}

export function isForbiddenChallengeType(type: string): boolean {
  return FORBIDDEN_CHALLENGE_TYPES.includes(type.toLowerCase());
}

export function isValidRoleType(role: string): role is ClubRoleType {
  return Object.values(ClubRoleType).includes(role as ClubRoleType);
}

export function isForbiddenRoleType(role: string): boolean {
  return FORBIDDEN_ROLE_TYPES.some(forbidden => 
    role.toLowerCase().includes(forbidden.toLowerCase())
  );
}