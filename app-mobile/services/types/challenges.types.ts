/**
 * PACK 137: Avalo Global Community Challenges
 * Mobile type definitions (mirror of backend types)
 */

// ============================================
// ENUMS
// ============================================

export enum ChallengeCategory {
  FITNESS = 'FITNESS',
  LIFESTYLE = 'LIFESTYLE',
  EDUCATION = 'EDUCATION',
  CREATIVE = 'CREATIVE',
  ENTERTAINMENT = 'ENTERTAINMENT',
  PRODUCTIVITY = 'PRODUCTIVITY',
  WELLNESS = 'WELLNESS',
}

export enum ChallengeDuration {
  ONE_DAY = 'ONE_DAY',
  THREE_DAYS = 'THREE_DAYS',
  ONE_WEEK = 'ONE_WEEK',
  TWO_WEEKS = 'TWO_WEEKS',
  THIRTY_DAYS = 'THIRTY_DAYS',
  SIXTY_DAYS = 'SIXTY_DAYS',
  NINETY_DAYS = 'NINETY_DAYS',
}

export enum ChallengeStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ParticipantStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  DROPPED = 'DROPPED',
  REMOVED = 'REMOVED',
}

export enum TaskFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  CUSTOM = 'CUSTOM',
}

export enum ChallengePostType {
  PROGRESS_PHOTO = 'PROGRESS_PHOTO',
  VIDEO_UPDATE = 'VIDEO_UPDATE',
  TEXT_LOG = 'TEXT_LOG',
  WORKOUT_LOG = 'WORKOUT_LOG',
  READING_LOG = 'READING_LOG',
  CREATIVE_WORK = 'CREATIVE_WORK',
}

// ============================================
// INTERFACES
// ============================================

export interface Challenge {
  challengeId: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  isPaid: boolean;
  entryTokens: number;
  duration: ChallengeDuration;
  durationDays: number;
  startDate: any; // Firestore Timestamp
  endDate: any; // Firestore Timestamp
  taskTitle: string;
  taskDescription: string;
  taskFrequency: TaskFrequency;
  tasksPerDay?: number;
  tasksPerWeek?: number;
  requiresPhoto: boolean;
  requiresVideo: boolean;
  requiresTextLog: boolean;
  maxParticipants?: number;
  currentParticipants: number;
  leaderboardMode: 'COMPLETION_RATE' | 'CONSISTENCY';
  status: ChallengeStatus;
  isActive: boolean;
  containsNSFW: boolean;
  containsForbiddenContent: boolean;
  moderationNotes?: string;
  totalRevenue: number;
  platformFee: number;
  creatorEarnings: number;
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
  tags: string[];
}

export interface ChallengeParticipant {
  participantId: string;
  challengeId: string;
  challengeTitle: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  creatorId: string;
  paidTokens: number;
  platformFee: number;
  creatorEarnings: number;
  transactionId?: string;
  tasksCompleted: number;
  tasksRequired: number;
  completionRate: number;
  currentStreak: number;
  longestStreak: number;
  status: ParticipantStatus;
  isActive: boolean;
  completedAllTasks: boolean;
  earnedBadge: boolean;
  leaderboardRank?: number;
  leaderboardScore: number;
  joinedAt: any; // Firestore Timestamp
  completedAt?: any; // Firestore Timestamp
  lastActivityAt: any; // Firestore Timestamp
}

export interface ChallengeProgress {
  progressId: string;
  challengeId: string;
  userId: string;
  participantId: string;
  taskDate: any; // Firestore Timestamp
  taskNumber: number;
  completed: boolean;
  postId?: string;
  submittedAt?: any; // Firestore Timestamp
  streakDay: number;
  createdAt: any; // Firestore Timestamp
}

export interface ChallengePost {
  postId: string;
  challengeId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  type: ChallengePostType;
  caption?: string;
  mediaUrl?: string;
  taskNumber: number;
  taskDate: any; // Firestore Timestamp
  likesCount: number;
  commentsCount: number;
  isVisible: boolean;
  moderationReason?: string;
  containsNSFW: boolean;
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
}

export interface ChallengeBadge {
  badgeId: string;
  userId: string;
  challengeId: string;
  challengeTitle: string;
  category: ChallengeCategory;
  completionRate: number;
  finalStreak: number;
  tasksCompleted: number;
  badgeImageUrl?: string;
  displayOnProfile: boolean;
  earnedAt: any; // Firestore Timestamp
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userAvatar?: string;
  completionRate: number;
  currentStreak: number;
  longestStreak: number;
  tasksCompleted: number;
  leaderboardScore: number;
}