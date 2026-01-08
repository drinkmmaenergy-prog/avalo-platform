/**
 * PACK 139: Avalo Social Clubs & Private Communities Service
 * Client-side API wrapper for club functions
 */

import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

// ============================================
// TYPE DEFINITIONS
// ============================================

export enum ClubCategory {
  FITNESS_TRAINING = 'FITNESS_TRAINING',
  WELLNESS_MENTAL_HEALTH = 'WELLNESS_MENTAL_HEALTH',
  BOOK_PRODUCTIVITY = 'BOOK_PRODUCTIVITY',
  MEDITATION_MINDFULNESS = 'MEDITATION_MINDFULNESS',
  LANGUAGE_EXCHANGE = 'LANGUAGE_EXCHANGE',
  LOCAL_TRAVEL_FOOD = 'LOCAL_TRAVEL_FOOD',
  PHOTOGRAPHY_FILMMAKING = 'PHOTOGRAPHY_FILMMAKING',
  MOTORSPORTS_AUTOMOTIVE = 'MOTORSPORTS_AUTOMOTIVE',
  GAMING = 'GAMING',
  ENTREPRENEURSHIP_BUSINESS = 'ENTREPRENEURSHIP_BUSINESS',
  COSMETICS_BEAUTY = 'COSMETICS_BEAUTY',
  FASHION = 'FASHION',
}

export enum ClubAccessType {
  FREE_PUBLIC = 'FREE_PUBLIC',
  FREE_REQUEST = 'FREE_REQUEST',
  TOKEN_GATED = 'TOKEN_GATED',
  EXPERT_HOSTED = 'EXPERT_HOSTED',
}

export enum ClubRole {
  OWNER = 'OWNER',
  MODERATOR = 'MODERATOR',
  MEMBER = 'MEMBER',
  GUEST = 'GUEST',
}

export enum ClubStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ARCHIVED = 'ARCHIVED',
  SUSPENDED = 'SUSPENDED',
}

export enum ClubPostType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  POLL = 'POLL',
  RESOURCE = 'RESOURCE',
  CHALLENGE_PROGRESS = 'CHALLENGE_PROGRESS',
}

export interface Club {
  clubId: string;
  ownerId: string;
  ownerName: string;
  ownerAvatar?: string;
  name: string;
  description: string;
  category: ClubCategory;
  accessType: ClubAccessType;
  entryTokens: number;
  memberCount: number;
  maxMembers?: number;
  status: ClubStatus;
  isActive: boolean;
  isPublic: boolean;
  tags: string[];
  rules?: string;
  totalRevenue: number;
  createdAt: any;
  updatedAt: any;
}

export interface ClubMember {
  memberId: string;
  clubId: string;
  clubName: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  role: ClubRole;
  paidTokens: number;
  joinedAt: any;
  lastActiveAt: any;
  isActive: boolean;
  isBanned: boolean;
}

export interface ClubPost {
  postId: string;
  clubId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  type: ClubPostType;
  content?: string;
  mediaUrl?: string;
  resourceUrl?: string;
  pollQuestion?: string;
  pollOptions?: string[];
  pollVotes?: { [key: number]: number };
  likesCount: number;
  commentsCount: number;
  isVisible: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface ClubAnalytics {
  clubId: string;
  ownerId: string;
  memberCount: number;
  retentionRate: number;
  postsTotal: number;
  postsLast30Days: number;
  eventAttendanceTotal: number;
  totalRevenue: number;
  averageRevenuePerMember: number;
  lastUpdatedAt: any;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================
// CLUB MANAGEMENT FUNCTIONS
// ============================================

/**
 * Create a new club
 */
export async function createClub(params: {
  name: string;
  description: string;
  category: ClubCategory;
  accessType: ClubAccessType;
  entryTokens: number;
  maxMembers?: number;
  isPublic: boolean;
  tags?: string[];
  rules?: string;
}): Promise<{ clubId: string }> {
  const callable = httpsCallable<any, ApiResponse<{ clubId: string }>>(
    functions,
    'createClub'
  );

  const result = await callable(params);

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to create club');
  }

  return result.data.data;
}

/**
 * Update club details
 */
export async function updateClubDetails(params: {
  clubId: string;
  description?: string;
  rules?: string;
  maxMembers?: number;
  status?: ClubStatus;
}): Promise<void> {
  const callable = httpsCallable<any, ApiResponse>(functions, 'updateClubDetails');

  const result = await callable(params);

  if (!result.data.success) {
    throw new Error(result.data.error || 'Failed to update club');
  }
}

/**
 * Join a club
 */
export async function joinClub(clubId: string): Promise<{ memberId: string }> {
  const callable = httpsCallable<any, ApiResponse<{ memberId: string }>>(
    functions,
    'joinClub'
  );

  const result = await callable({ clubId });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to join club');
  }

  return result.data.data;
}

/**
 * Leave a club
 */
export async function leaveClub(clubId: string): Promise<void> {
  const callable = httpsCallable<any, ApiResponse>(functions, 'leaveClub');

  const result = await callable({ clubId });

  if (!result.data.success) {
    throw new Error(result.data.error || 'Failed to leave club');
  }
}

/**
 * Post to club
 */
export async function postToClub(params: {
  clubId: string;
  type: ClubPostType;
  content?: string;
  mediaUrl?: string;
  resourceUrl?: string;
  pollQuestion?: string;
  pollOptions?: string[];
}): Promise<{ postId: string }> {
  const callable = httpsCallable<any, ApiResponse<{ postId: string }>>(
    functions,
    'postToClub'
  );

  const result = await callable(params);

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to create post');
  }

  return result.data.data;
}

/**
 * Host club event
 */
export async function hostClubEvent(params: {
  clubId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  maxAttendees?: number;
}): Promise<{ eventId: string }> {
  const callable = httpsCallable<any, ApiResponse<{ eventId: string }>>(
    functions,
    'hostClubEvent'
  );

  const result = await callable(params);

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to host event');
  }

  return result.data.data;
}

/**
 * Ban user from club
 */
export async function banClubUser(params: {
  clubId: string;
  userId: string;
  reason: string;
}): Promise<void> {
  const callable = httpsCallable<any, ApiResponse>(functions, 'banClubUser');

  const result = await callable(params);

  if (!result.data.success) {
    throw new Error(result.data.error || 'Failed to ban user');
  }
}

/**
 * Assign moderator
 */
export async function assignClubModerator(params: {
  clubId: string;
  userId: string;
}): Promise<void> {
  const callable = httpsCallable<any, ApiResponse>(functions, 'assignClubModerator');

  const result = await callable(params);

  if (!result.data.success) {
    throw new Error(result.data.error || 'Failed to assign moderator');
  }
}

// ============================================
// QUERY FUNCTIONS
// ============================================

/**
 * Get club details
 */
export async function getClubDetails(clubId: string): Promise<Club> {
  const callable = httpsCallable<any, ApiResponse<Club>>(
    functions,
    'getClubDetails'
  );

  const result = await callable({ clubId });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to get club details');
  }

  return result.data.data;
}

/**
 * List clubs
 */
export async function listClubs(params?: {
  category?: ClubCategory;
  limit?: number;
}): Promise<Club[]> {
  const callable = httpsCallable<any, ApiResponse<Club[]>>(
    functions,
    'listClubs'
  );

  const result = await callable(params || {});

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to list clubs');
  }

  return result.data.data;
}

/**
 * Get user's clubs
 */
export async function getMyClubs(): Promise<ClubMember[]> {
  const callable = httpsCallable<any, ApiResponse<ClubMember[]>>(
    functions,
    'getMyClubs'
  );

  const result = await callable({});

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to get clubs');
  }

  return result.data.data;
}

/**
 * Get club posts
 */
export async function getClubPosts(
  clubId: string,
  limit?: number
): Promise<ClubPost[]> {
  const callable = httpsCallable<any, ApiResponse<ClubPost[]>>(
    functions,
    'getClubPosts'
  );

  const result = await callable({ clubId, limit });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to get posts');
  }

  return result.data.data;
}

/**
 * Get club analytics
 */
export async function getClubAnalytics(clubId: string): Promise<ClubAnalytics> {
  const callable = httpsCallable<any, ApiResponse<ClubAnalytics>>(
    functions,
    'getClubAnalytics'
  );

  const result = await callable({ clubId });

  if (!result.data.success || !result.data.data) {
    throw new Error(result.data.error || 'Failed to get analytics');
  }

  return result.data.data;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format club category name
 */
export function formatClubCategory(category: ClubCategory): string {
  const categoryNames: Record<ClubCategory, string> = {
    [ClubCategory.FITNESS_TRAINING]: 'Fitness & Training',
    [ClubCategory.WELLNESS_MENTAL_HEALTH]: 'Wellness & Mental Health',
    [ClubCategory.BOOK_PRODUCTIVITY]: 'Book & Productivity',
    [ClubCategory.MEDITATION_MINDFULNESS]: 'Meditation & Mindfulness',
    [ClubCategory.LANGUAGE_EXCHANGE]: 'Language Exchange',
    [ClubCategory.LOCAL_TRAVEL_FOOD]: 'Local Travel & Food',
    [ClubCategory.PHOTOGRAPHY_FILMMAKING]: 'Photography & Filmmaking',
    [ClubCategory.MOTORSPORTS_AUTOMOTIVE]: 'Motorsports & Automotive',
    [ClubCategory.GAMING]: 'Gaming',
    [ClubCategory.ENTREPRENEURSHIP_BUSINESS]: 'Entrepreneurship & Business',
    [ClubCategory.COSMETICS_BEAUTY]: 'Cosmetics & Premium Beauty',
    [ClubCategory.FASHION]: 'Fashion',
  };

  return categoryNames[category] || 'Unknown';
}

/**
 * Get category icon
 */
export function getCategoryIcon(category: ClubCategory): string {
  const icons: Record<ClubCategory, string> = {
    [ClubCategory.FITNESS_TRAINING]: '💪',
    [ClubCategory.WELLNESS_MENTAL_HEALTH]: '🧘',
    [ClubCategory.BOOK_PRODUCTIVITY]: '📚',
    [ClubCategory.MEDITATION_MINDFULNESS]: '🕉️',
    [ClubCategory.LANGUAGE_EXCHANGE]: '🗣️',
    [ClubCategory.LOCAL_TRAVEL_FOOD]: '🌍',
    [ClubCategory.PHOTOGRAPHY_FILMMAKING]: '📸',
    [ClubCategory.MOTORSPORTS_AUTOMOTIVE]: '🏎️',
    [ClubCategory.GAMING]: '🎮',
    [ClubCategory.ENTREPRENEURSHIP_BUSINESS]: '💼',
    [ClubCategory.COSMETICS_BEAUTY]: '💄',
    [ClubCategory.FASHION]: '👗',
  };

  return icons[category] || '✨';
}

/**
 * Get category color
 */
export function getCategoryColor(category: ClubCategory): string {
  const colors: Record<ClubCategory, string> = {
    [ClubCategory.FITNESS_TRAINING]: '#FF6B6B',
    [ClubCategory.WELLNESS_MENTAL_HEALTH]: '#A8E6CF',
    [ClubCategory.BOOK_PRODUCTIVITY]: '#6C5CE7',
    [ClubCategory.MEDITATION_MINDFULNESS]: '#98D8C8',
    [ClubCategory.LANGUAGE_EXCHANGE]: '#45B7D1',
    [ClubCategory.LOCAL_TRAVEL_FOOD]: '#FFA07A',
    [ClubCategory.PHOTOGRAPHY_FILMMAKING]: '#4ECDC4',
    [ClubCategory.MOTORSPORTS_AUTOMOTIVE]: '#95A5A6',
    [ClubCategory.GAMING]: '#E056FD',
    [ClubCategory.ENTREPRENEURSHIP_BUSINESS]: '#686DE0',
    [ClubCategory.COSMETICS_BEAUTY]: '#FF9FF3',
    [ClubCategory.FASHION]: '#FDA7DF',
  };

  return colors[category] || '#95A5A6';
}

/**
 * Format access type
 */
export function formatAccessType(accessType: ClubAccessType): string {
  const labels: Record<ClubAccessType, string> = {
    [ClubAccessType.FREE_PUBLIC]: 'Free Public',
    [ClubAccessType.FREE_REQUEST]: 'Free (Request)',
    [ClubAccessType.TOKEN_GATED]: 'Token Gated',
    [ClubAccessType.EXPERT_HOSTED]: 'Expert Hosted',
  };

  return labels[accessType] || 'Unknown';
}

/**
 * Format member count
 */
export function formatMemberCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Get role badge
 */
export function getRoleBadge(role: ClubRole): { label: string; color: string } {
  const badges: Record<ClubRole, { label: string; color: string }> = {
    [ClubRole.OWNER]: { label: 'Owner', color: '#FFD700' },
    [ClubRole.MODERATOR]: { label: 'Mod', color: '#4ECDC4' },
    [ClubRole.MEMBER]: { label: 'Member', color: '#95A5A6' },
    [ClubRole.GUEST]: { label: 'Guest', color: '#BDC3C7' },
  };

  return badges[role] || { label: 'Unknown', color: '#95A5A6' };
}

/**
 * Validate club name
 */
export function validateClubName(name: string): string | null {
  if (!name || name.trim().length < 5) {
    return 'Club name must be at least 5 characters';
  }
  if (name.length > 100) {
    return 'Club name must be less than 100 characters';
  }
  return null;
}

/**
 * Validate club description
 */
export function validateClubDescription(description: string): string | null {
  if (!description || description.trim().length < 20) {
    return 'Description must be at least 20 characters';
  }
  if (description.length > 1000) {
    return 'Description must be less than 1000 characters';
  }
  return null;
}

/**
 * Check if user is owner
 */
export function isClubOwner(club: Club, userId: string): boolean {
  return club.ownerId === userId;
}

/**
 * Check if user is moderator
 */
export function isClubModerator(member: ClubMember): boolean {
  return member.role === ClubRole.OWNER || member.role === ClubRole.MODERATOR;
}

/**
 * Get post type label
 */
export function getPostTypeLabel(type: ClubPostType): string {
  const labels: Record<ClubPostType, string> = {
    [ClubPostType.TEXT]: 'Text',
    [ClubPostType.IMAGE]: 'Image',
    [ClubPostType.VIDEO]: 'Video',
    [ClubPostType.POLL]: 'Poll',
    [ClubPostType.RESOURCE]: 'Resource',
    [ClubPostType.CHALLENGE_PROGRESS]: 'Challenge Progress',
  };

  return labels[type] || 'Unknown';
}