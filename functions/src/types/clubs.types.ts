/**
 * PACK 139: Avalo Social Clubs & Private Communities
 * Type definitions for topic-driven social clubs
 * 
 * SAFETY GUARANTEES:
 * - No dating/romance/escort groups
 * - No NSFW or sexual subcultures
 * - No visibility/discovery advantages
 * - No token bonuses or giveaways
 * - No external payment links
 * - 65/35 split for token-gated clubs
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================
// ENUMS
// ============================================

/**
 * Allowed club categories (SAFE only)
 */
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

/**
 * Club access types
 */
export enum ClubAccessType {
  FREE_PUBLIC = 'FREE_PUBLIC',           // Anyone can join
  FREE_REQUEST = 'FREE_REQUEST',         // Join request approval required
  TOKEN_GATED = 'TOKEN_GATED',           // Token payment to join
  EXPERT_HOSTED = 'EXPERT_HOSTED',       // Bundled with expert mentorship
}

/**
 * Club member roles
 */
export enum ClubRole {
  OWNER = 'OWNER',           // Creator, revenue recipient
  MODERATOR = 'MODERATOR',   // Can manage posts/users
  MEMBER = 'MEMBER',         // Regular participation
  GUEST = 'GUEST',           // Preview only (public clubs)
}

/**
 * Club status
 */
export enum ClubStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ARCHIVED = 'ARCHIVED',
  SUSPENDED = 'SUSPENDED',
}

/**
 * Post types within clubs
 */
export enum ClubPostType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  POLL = 'POLL',
  RESOURCE = 'RESOURCE',
  CHALLENGE_PROGRESS = 'CHALLENGE_PROGRESS',
}

// ============================================
// CORE TYPES
// ============================================

/**
 * Club entity
 */
export interface Club {
  clubId: string;
  ownerId: string;
  ownerName: string;
  ownerAvatar?: string;
  
  name: string;                    // 5-100 chars
  description: string;             // 20-1000 chars
  category: ClubCategory;
  
  accessType: ClubAccessType;
  entryTokens: number;            // 0 for free, 1-5000 for token-gated
  
  memberCount: number;
  maxMembers?: number;            // Optional capacity limit
  
  status: ClubStatus;
  isActive: boolean;
  
  // Safety flags
  containsNSFW: boolean;
  containsForbiddenContent: boolean;
  moderationNotes?: string;
  
  // Revenue (token-gated only)
  totalRevenue: number;
  platformFee: number;            // 35%
  ownerEarnings: number;          // 65%
  
  // Privacy
  isPublic: boolean;              // Preview available
  
  tags: string[];
  rules?: string;                 // Club rules/guidelines
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Club member record
 */
export interface ClubMember {
  memberId: string;
  clubId: string;
  clubName: string;
  
  userId: string;
  userName: string;
  userAvatar?: string;
  
  role: ClubRole;
  
  // Payment (token-gated clubs)
  paidTokens: number;
  platformFee: number;
  ownerEarnings: number;
  transactionId?: string;
  
  joinedAt: Timestamp;
  lastActiveAt: Timestamp;
  
  // Access
  isActive: boolean;
  isBanned: boolean;
  banReason?: string;
}

/**
 * Club post
 */
export interface ClubPost {
  postId: string;
  clubId: string;
  
  userId: string;
  userName: string;
  userAvatar?: string;
  
  type: ClubPostType;
  content?: string;              // Text content
  mediaUrl?: string;             // Image/video URL
  resourceUrl?: string;          // Shared resource link
  
  // Poll data (if type === POLL)
  pollQuestion?: string;
  pollOptions?: string[];
  pollVotes?: { [optionIndex: number]: number };
  
  // Engagement (does NOT affect ranking)
  likesCount: number;
  commentsCount: number;
  
  // Moderation
  isVisible: boolean;
  moderationReason?: string;
  containsNSFW: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Club thread (discussion topics)
 */
export interface ClubThread {
  threadId: string;
  clubId: string;
  
  userId: string;
  userName: string;
  userAvatar?: string;
  
  title: string;
  content: string;
  
  repliesCount: number;
  lastReplyAt: Timestamp;
  isPinned: boolean;
  isLocked: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Club event (integration with PACK 117)
 */
export interface ClubEvent {
  eventId: string;
  clubId: string;
  
  hostUserId: string;
  hostName: string;
  
  title: string;
  description: string;
  
  startTime: Timestamp;
  endTime: Timestamp;
  
  attendeesCount: number;
  maxAttendees?: number;
  
  createdAt: Timestamp;
}

/**
 * Club analytics (non-competitive)
 */
export interface ClubAnalytics {
  clubId: string;
  ownerId: string;
  
  // Aggregate metrics only
  memberCount: number;
  retentionRate: number;         // % members active in last 30 days
  
  postsTotal: number;
  postsLast30Days: number;
  
  eventAttendanceTotal: number;
  
  // Revenue (token-gated only)
  totalRevenue: number;
  averageRevenuePerMember: number;
  
  // NO personal identities
  // NO ranking comparisons
  // NO buyer segmentation
  
  lastUpdatedAt: Timestamp;
}

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

export interface CreateClubRequest {
  name: string;
  description: string;
  category: ClubCategory;
  accessType: ClubAccessType;
  entryTokens: number;
  maxMembers?: number;
  isPublic: boolean;
  tags?: string[];
  rules?: string;
}

export interface UpdateClubRequest {
  clubId: string;
  description?: string;
  rules?: string;
  maxMembers?: number;
  status?: ClubStatus;
}

export interface JoinClubRequest {
  clubId: string;
}

export interface LeaveClubRequest {
  clubId: string;
}

export interface CreateClubPostRequest {
  clubId: string;
  type: ClubPostType;
  content?: string;
  mediaUrl?: string;
  resourceUrl?: string;
  pollQuestion?: string;
  pollOptions?: string[];
}

export interface BanClubUserRequest {
  clubId: string;
  userId: string;
  reason: string;
}

export interface AssignModeratorRequest {
  clubId: string;
  userId: string;
}

export interface HostClubEventRequest {
  clubId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  maxAttendees?: number;
}

export interface ClubResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================
// VALIDATION TYPES
// ============================================

export interface ClubContentValidation {
  isValid: boolean;
  violations: string[];
  warnings: string[];
  containsNSFW: boolean;
  containsForbiddenContent: boolean;
}

// ============================================
// BLOCKED CONTENT LISTS
// ============================================

/**
 * Blocked keywords for club names/descriptions (60+ terms)
 * Prevents dating, NSFW, and escort-style groups
 */
export const BLOCKED_CLUB_KEYWORDS: string[] = [
  // NSFW/Explicit
  'sexy', 'seductive', 'lingerie', 'bikini', 'nude', 'naked', 'explicit',
  'nsfw', 'adult', 'xxx', 'porn', 'erotic', 'sensual', 'bedroom', 'intimate',
  
  // Dating/Romance
  'dating', 'romance', 'romantic', 'boyfriend', 'girlfriend', 'sugar',
  'date night', 'flirt', 'flirting', 'hookup', 'meet up', 'singles',
  'looking for', 'seeking', 'arrangements', 'companionship',
  
  // Beauty/Body comparison
  'hottest', 'sexiest', 'most attractive', 'best body', 'best looking',
  'beauty contest', 'face rating', 'body rating', 'appearance', 'rate me',
  'transformation photos', 'before after body', 'hot men', 'hot women',
  
  // Escort/BDSM coded
  'private companionship', 'girlfriend experience', 'boyfriend experience',
  'gfe', 'bfe', 'sugar daddy', 'sugar baby', 'discrete', 'discretion',
  'bdsm', 'kink', 'fetish', 'dom', 'sub', 'master', 'slave',
  
  // Attention farming
  'most popular', 'most followers', 'most likes', 'attention', 'validation',
  
  // External platforms
  'onlyfans', 'fansly', 'patreon', 'snapchat premium', 'premium snap',
  
  // Payment bypass
  'dm for prices', 'dm me', 'whatsapp', 'telegram', 'kik', 'venmo',
  'cashapp', 'paypal', 'crypto', 'bitcoin',
];

/**
 * Forbidden club categories
 */
export const FORBIDDEN_CLUB_CATEGORIES: string[] = [
  'dating',
  'romance',
  'beauty',
  'appearance',
  'attraction',
  'nsfw',
  'adult',
  'relationship',
  'companionship',
  'escort',
  'sugar',
];

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate club name and description for NSFW/forbidden content
 */
export function validateClubContent(
  name: string,
  description: string,
  category: ClubCategory,
  rules?: string
): ClubContentValidation {
  const violations: string[] = [];
  const warnings: string[] = [];
  let containsNSFW = false;
  let containsForbiddenContent = false;
  
  const lowerName = name.toLowerCase();
  const lowerDescription = description.toLowerCase();
  const lowerRules = rules?.toLowerCase() || '';
  
  // Check for blocked keywords
  for (const keyword of BLOCKED_CLUB_KEYWORDS) {
    if (lowerName.includes(keyword) || 
        lowerDescription.includes(keyword) ||
        lowerRules.includes(keyword)) {
      violations.push(`Blocked keyword detected: "${keyword}"`);
      containsNSFW = true;
      containsForbiddenContent = true;
    }
  }
  
  // Check for forbidden categories
  for (const forbiddenCat of FORBIDDEN_CLUB_CATEGORIES) {
    if (lowerName.includes(forbiddenCat) || 
        lowerDescription.includes(forbiddenCat)) {
      violations.push(`Forbidden category: "${forbiddenCat}"`);
      containsForbiddenContent = true;
    }
  }
  
  // Check category validity
  const validCategories = Object.values(ClubCategory);
  if (!validCategories.includes(category)) {
    violations.push('Invalid or forbidden club category');
    containsForbiddenContent = true;
  }
  
  // Check for external links
  const urlPattern = /(https?:\/\/|www\.)/i;
  if (urlPattern.test(description) || urlPattern.test(rules || '')) {
    warnings.push('External links detected - will be removed');
  }
  
  // Check for contact info
  const contactPattern = /(whatsapp|telegram|kik|snapchat|phone|email|@)/i;
  if (contactPattern.test(description) || contactPattern.test(rules || '')) {
    violations.push('Contact information not allowed in club description');
    containsForbiddenContent = true;
  }
  
  const isValid = violations.length === 0;
  
  return {
    isValid,
    violations,
    warnings,
    containsNSFW,
    containsForbiddenContent,
  };
}

/**
 * Validate club post content
 */
export function validateClubPostContent(
  content: string,
  type: ClubPostType
): ClubContentValidation {
  const violations: string[] = [];
  const warnings: string[] = [];
  let containsNSFW = false;
  let containsForbiddenContent = false;
  
  const lowerContent = content.toLowerCase();
  
  // Check for blocked keywords
  for (const keyword of BLOCKED_CLUB_KEYWORDS) {
    if (lowerContent.includes(keyword)) {
      violations.push(`Blocked keyword: "${keyword}"`);
      containsNSFW = true;
      containsForbiddenContent = true;
    }
  }
  
  // Check for external payment links
  const paymentPattern = /(paypal|venmo|cashapp|bitcoin|crypto|buy.*outside|dm.*price)/i;
  if (paymentPattern.test(lowerContent)) {
    violations.push('External payment links not allowed');
    containsForbiddenContent = true;
  }
  
  // Check for DM solicitation
  const dmPattern = /(dm me|message me privately|contact.*outside|add.*snap)/i;
  if (dmPattern.test(lowerContent)) {
    violations.push('Private contact solicitation not allowed');
    containsForbiddenContent = true;
  }
  
  const isValid = violations.length === 0;
  
  return {
    isValid,
    violations,
    warnings,
    containsNSFW,
    containsForbiddenContent,
  };
}

/**
 * Calculate club analytics retention rate
 */
export function calculateRetentionRate(
  memberCount: number,
  activeLast30Days: number
): number {
  if (memberCount === 0) return 0;
  return Math.round((activeLast30Days / memberCount) * 100);
}

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