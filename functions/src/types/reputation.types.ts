/**
 * PACK 179 — Reputation & Risk Transparency Center
 * TypeScript Type Definitions
 * 
 * Public Trust Without Shaming · Positive Achievements Only · Zero Punitive Public Labels
 */

import { Timestamp } from 'firebase-admin/firestore';

// Allowed badge types - only positive achievements
export enum BadgeType {
  VERIFIED_IDENTITY = 'verified_identity',
  VERIFIED_SKILLS = 'verified_skills',
  COMPLETED_PROJECT = 'completed_project',
  EVENT_PARTICIPATION = 'event_participation',
  DIGITAL_PRODUCT_MILESTONE = 'digital_product_milestone',
  COLLABORATION_PASS = 'collaboration_pass',
  ACCELERATOR_GRADUATE = 'accelerator_graduate',
  COURSE_CREATOR = 'course_creator',
  WORKSHOP_HOST = 'workshop_host',
  COMMUNITY_CONTRIBUTOR = 'community_contributor'
}

// Achievement categories
export enum AchievementCategory {
  EDUCATION = 'education',
  CREATION = 'creation',
  COLLABORATION = 'collaboration',
  COMMUNITY = 'community',
  BUSINESS = 'business'
}

// Privacy levels for display settings
export enum ReputationPrivacyLevel {
  PUBLIC = 'public',
  FRIENDS_ONLY = 'friends_only',
  PRIVATE = 'private'
}

// Reputation Badge document
export interface ReputationBadge {
  badgeId: string;
  userId: string;
  badgeType: BadgeType;
  badgeName: string;
  badgeDescription: string;
  badgeIcon: string;
  earnedAt: Timestamp;
  verified: boolean;
  metadata?: {
    relatedItem?: string;
    achievementDetails?: string;
    certificateUrl?: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Achievement Milestone document
export interface AchievementMilestone {
  milestoneId: string;
  userId: string;
  category: AchievementCategory;
  title: string;
  description: string;
  achievedAt: Timestamp;
  verified: boolean;
  isPublic: boolean;
  proof?: {
    type: 'url' | 'document' | 'attestation';
    value: string;
  };
  metadata?: Record<string, any>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Reputation Display Settings document
export interface ReputationDisplaySettings {
  userId: string;
  displayBadges: boolean;
  displayMilestones: boolean;
  displayAchievements: boolean;
  badgeOrder: BadgeType[];
  privacyLevel: ReputationPrivacyLevel;
  highlightedBadges: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Public Reputation View (aggregated read-only data)
export interface PublicReputation {
  userId: string;
  displayName: string;
  totalBadges: number;
  totalMilestones: number;
  topBadges: Array<{
    badgeType: BadgeType;
    badgeName: string;
    badgeIcon: string;
    earnedAt: Timestamp;
  }>;
  recentAchievements: Array<{
    category: AchievementCategory;
    title: string;
    achievedAt: Timestamp;
  }>;
  verificationStatus: {
    identityVerified: boolean;
    skillsVerified: boolean;
  };
  lastUpdated: Timestamp;
}

// Product Review document (NOT person reviews)
export interface ProductReview {
  reviewId: string;
  userId: string;
  userName: string;
  productId: string;
  productType: 'course' | 'digital_product' | 'service';
  rating: number;
  reviewText: string;
  verified: boolean;
  purchaseVerified: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Reputation Audit Log (fraud detection)
export interface ReputationAuditLog {
  logId: string;
  userId: string;
  action: 'badge_assigned' | 'badge_removed' | 'milestone_added' | 'milestone_verified' | 'fraud_detected';
  details: Record<string, any>;
  performedBy: string;
  timestamp: Timestamp;
}

// Request/Response types for Cloud Functions

export interface AssignBadgeRequest {
  userId: string;
  badgeType: BadgeType;
  metadata?: Record<string, any>;
}

export interface AssignBadgeResponse {
  success: boolean;
  badgeId?: string;
  error?: string;
}

export interface RemoveBadgeRequest {
  userId: string;
  badgeId: string;
  reason: string;
}

export interface RemoveBadgeResponse {
  success: boolean;
  error?: string;
}

export interface TrackMilestoneRequest {
  userId: string;
  category: AchievementCategory;
  title: string;
  description: string;
  isPublic: boolean;
  proof?: {
    type: 'url' | 'document' | 'attestation';
    value: string;
  };
}

export interface TrackMilestoneResponse {
  success: boolean;
  milestoneId?: string;
  error?: string;
}

export interface GetPublicReputationRequest {
  userId: string;
}

export interface GetPublicReputationResponse {
  success: boolean;
  reputation?: PublicReputation;
  error?: string;
}

export interface UpdateDisplaySettingsRequest {
  userId: string;
  settings: Partial<ReputationDisplaySettings>;
}

export interface UpdateDisplaySettingsResponse {
  success: boolean;
  error?: string;
}

// Validation helpers
export const FORBIDDEN_BADGE_FIELDS = [
  'safetyScore',
  'safety_score',
  'riskLevel',
  'risk_level',
  'suspensionHistory',
  'suspension_history',
  'moderationHistory',
  'moderation_history',
  'spendingAmount',
  'spending_amount',
  'earningsAmount',
  'earnings_amount',
  'abuseCase',
  'abuse_case',
  'fraudCase',
  'fraud_case',
  'attractiveness',
  'popularity',
  'ranking',
  'rating'
];

// Badge definitions with metadata
export const BADGE_DEFINITIONS: Record<BadgeType, {
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
}> = {
  [BadgeType.VERIFIED_IDENTITY]: {
    name: 'Verified Identity',
    description: 'Completed ID and face verification',
    icon: '✓',
    category: AchievementCategory.COMMUNITY
  },
  [BadgeType.VERIFIED_SKILLS]: {
    name: 'Verified Skills',
    description: 'Completed skills assessment and verification',
    icon: '🎓',
    category: AchievementCategory.EDUCATION
  },
  [BadgeType.COMPLETED_PROJECT]: {
    name: 'Project Complete',
    description: 'Successfully completed a learning path or project',
    icon: '🏆',
    category: AchievementCategory.CREATION
  },
  [BadgeType.EVENT_PARTICIPATION]: {
    name: 'Event Participant',
    description: 'Hosted or attended workshops and events',
    icon: '🎪',
    category: AchievementCategory.COMMUNITY
  },
  [BadgeType.DIGITAL_PRODUCT_MILESTONE]: {
    name: 'Product Milestone',
    description: 'Achieved digital product delivery milestone',
    icon: '🚀',
    category: AchievementCategory.BUSINESS
  },
  [BadgeType.COLLABORATION_PASS]: {
    name: 'Collaboration Pass',
    description: 'Successful brand collaboration review',
    icon: '🤝',
    category: AchievementCategory.COLLABORATION
  },
  [BadgeType.ACCELERATOR_GRADUATE]: {
    name: 'Accelerator Graduate',
    description: 'Graduated from Avalo Accelerator program',
    icon: '🎖️',
    category: AchievementCategory.BUSINESS
  },
  [BadgeType.COURSE_CREATOR]: {
    name: 'Course Creator',
    description: 'Published educational course or learning path',
    icon: '📚',
    category: AchievementCategory.EDUCATION
  },
  [BadgeType.WORKSHOP_HOST]: {
    name: 'Workshop Host',
    description: 'Hosted successful workshop or training session',
    icon: '👨‍🏫',
    category: AchievementCategory.EDUCATION
  },
  [BadgeType.COMMUNITY_CONTRIBUTOR]: {
    name: 'Community Contributor',
    description: 'Active contribution to Avalo community',
    icon: '⭐',
    category: AchievementCategory.COMMUNITY
  }
};