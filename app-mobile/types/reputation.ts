/**
 * PACK 179 — Reputation & Risk Transparency Center
 * Client-Side TypeScript Types
 * 
 * Public Trust Without Shaming · Positive Achievements Only · Zero Punitive Public Labels
 */

import { Timestamp } from 'firebase/firestore';

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

// Reputation Badge
export interface ReputationBadge {
  badgeId: string;
  userId: string;
  badgeType: BadgeType;
  badgeName: string;
  badgeDescription: string;
  badgeIcon: string;
  earnedAt: Date | Timestamp;
  verified: boolean;
  metadata?: {
    relatedItem?: string;
    achievementDetails?: string;
    certificateUrl?: string;
  };
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

// Achievement Milestone
export interface AchievementMilestone {
  milestoneId: string;
  userId: string;
  category: AchievementCategory;
  title: string;
  description: string;
  achievedAt: Date | Timestamp;
  verified: boolean;
  isPublic: boolean;
  proof?: {
    type: 'url' | 'document' | 'attestation';
    value: string;
  };
  metadata?: Record<string, any>;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

// Reputation Display Settings
export interface ReputationDisplaySettings {
  userId: string;
  displayBadges: boolean;
  displayMilestones: boolean;
  displayAchievements: boolean;
  badgeOrder: BadgeType[];
  privacyLevel: ReputationPrivacyLevel;
  highlightedBadges: string[];
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
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
    earnedAt: Date | Timestamp;
  }>;
  recentAchievements: Array<{
    category: AchievementCategory;
    title: string;
    achievedAt: Date | Timestamp;
  }>;
  verificationStatus: {
    identityVerified: boolean;
    skillsVerified: boolean;
  };
  lastUpdated: Date | Timestamp;
}

// Product Review (NOT person reviews)
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
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

// Badge definitions with metadata
export const BADGE_DEFINITIONS: Record<BadgeType, {
  name: string;
  description: string;
  icon: string;
  color: string;
  category: AchievementCategory;
}> = {
  [BadgeType.VERIFIED_IDENTITY]: {
    name: 'Verified Identity',
    description: 'Completed ID and face verification',
    icon: '✓',
    color: '#4CAF50',
    category: AchievementCategory.COMMUNITY
  },
  [BadgeType.VERIFIED_SKILLS]: {
    name: 'Verified Skills',
    description: 'Completed skills assessment and verification',
    icon: '🎓',
    color: '#2196F3',
    category: AchievementCategory.EDUCATION
  },
  [BadgeType.COMPLETED_PROJECT]: {
    name: 'Project Complete',
    description: 'Successfully completed a learning path or project',
    icon: '🏆',
    color: '#FFC107',
    category: AchievementCategory.CREATION
  },
  [BadgeType.EVENT_PARTICIPATION]: {
    name: 'Event Participant',
    description: 'Hosted or attended workshops and events',
    icon: '🎪',
    color: '#E91E63',
    category: AchievementCategory.COMMUNITY
  },
  [BadgeType.DIGITAL_PRODUCT_MILESTONE]: {
    name: 'Product Milestone',
    description: 'Achieved digital product delivery milestone',
    icon: '🚀',
    color: '#9C27B0',
    category: AchievementCategory.BUSINESS
  },
  [BadgeType.COLLABORATION_PASS]: {
    name: 'Collaboration Pass',
    description: 'Successful brand collaboration review',
    icon: '🤝',
    color: '#00BCD4',
    category: AchievementCategory.COLLABORATION
  },
  [BadgeType.ACCELERATOR_GRADUATE]: {
    name: 'Accelerator Graduate',
    description: 'Graduated from Avalo Accelerator program',
    icon: '🎖️',
    color: '#FF5722',
    category: AchievementCategory.BUSINESS
  },
  [BadgeType.COURSE_CREATOR]: {
    name: 'Course Creator',
    description: 'Published educational course or learning path',
    icon: '📚',
    color: '#3F51B5',
    category: AchievementCategory.EDUCATION
  },
  [BadgeType.WORKSHOP_HOST]: {
    name: 'Workshop Host',
    description: 'Hosted successful workshop or training session',
    icon: '👨‍🏫',
    color: '#607D8B',
    category: AchievementCategory.EDUCATION
  },
  [BadgeType.COMMUNITY_CONTRIBUTOR]: {
    name: 'Community Contributor',
    description: 'Active contribution to Avalo community',
    icon: '⭐',
    color: '#CDDC39',
    category: AchievementCategory.COMMUNITY
  }
};

// Category definitions
export const CATEGORY_DEFINITIONS: Record<AchievementCategory, {
  name: string;
  icon: string;
  color: string;
}> = {
  [AchievementCategory.EDUCATION]: {
    name: 'Education',
    icon: '📖',
    color: '#2196F3'
  },
  [AchievementCategory.CREATION]: {
    name: 'Creation',
    icon: '🎨',
    color: '#FFC107'
  },
  [AchievementCategory.COLLABORATION]: {
    name: 'Collaboration',
    icon: '🤝',
    color: '#00BCD4'
  },
  [AchievementCategory.COMMUNITY]: {
    name: 'Community',
    icon: '👥',
    color: '#4CAF50'
  },
  [AchievementCategory.BUSINESS]: {
    name: 'Business',
    icon: '💼',
    color: '#9C27B0'
  }
};

// Helper to convert Firestore timestamp to Date
export function timestampToDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (timestamp.toDate) return timestamp.toDate();
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
  return new Date(timestamp);
}