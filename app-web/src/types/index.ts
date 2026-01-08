export interface User {
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  photoURL: string | null;
  handle?: string;
  bio?: string;
  isCreator: boolean;
  isVerified: boolean;
  tokenBalance: number;
  createdAt: Date;
  lastActiveAt: Date;
  region?: string;
  locale?: string;
  nsfwPref?: 'SAFE' | 'NSFW' | 'BOTH';
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED';
  twoFactorEnabled?: boolean;
}

export interface Profile extends User {
  coverPhotoURL?: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  subscriptionPrice?: number;
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    tiktok?: string;
    youtube?: string;
  };
  stats?: {
    totalEarnings: number;
    monthlyEarnings: number;
    averageRating: number;
  };
}

export interface Post {
  id: string;
  userId: string;
  type: 'FEED' | 'STORY' | 'REEL';
  content: string;
  mediaUrls: string[];
  thumbnailUrl?: string;
  isPaid: boolean;
  price?: number;
  isNSFW: boolean;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: Date;
  expiresAt?: Date;
  status: 'ACTIVE' | 'DELETED' | 'HIDDEN';
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  content: string;
  mediaUrls?: string[];
  isPaid: boolean;
  price?: number;
  isUnlocked: boolean;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'GIFT';
  createdAt: Date;
  readAt?: Date;
  status: 'SENT' | 'DELIVERED' | 'READ';
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage?: Message;
  unreadCount: number;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  subscriberId: string;
  creatorId: string;
  tier: 'BASIC' | 'PREMIUM' | 'VIP';
  price: number;
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED';
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
}

export interface TokenTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'PURCHASE' | 'SPENT' | 'EARNED' | 'REFUND';
  description: string;
  relatedId?: string;
  createdAt: Date;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface Event {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  type: 'OFFLINE' | 'VIRTUAL';
  startDate: Date;
  endDate: Date;
  location?: string;
  virtualRoomId?: string;
  price: number;
  capacity: number;
  attendeeCount: number;
  thumbnailUrl?: string;
  status: 'UPCOMING' | 'LIVE' | 'ENDED' | 'CANCELLED';
}

export interface DigitalProduct {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'BUNDLE';
  price: number;
  previewUrls: string[];
  fileUrls?: string[];
  purchaseCount: number;
  rating: number;
  createdAt: Date;
  status: 'ACTIVE' | 'DELETED' | 'HIDDEN';
}

export interface AICompanion {
  id: string;
  userId: string;
  name: string;
  personality: string;
  avatarUrl: string;
  messageCount: number;
  lastMessageAt?: Date;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Notification {
  id: string;
  userId: string;
  type: 'LIKE' | 'COMMENT' | 'FOLLOW' | 'MESSAGE' | 'PAYMENT' | 'SUBSCRIPTION' | 'EVENT' | 'SYSTEM';
  title: string;
  body: string;
  imageUrl?: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: Date;
}

export interface Call {
  id: string;
  callerId: string;
  recipientId: string;
  type: '1:1' | 'GROUP';
  mediaType: 'AUDIO' | 'VIDEO';
  status: 'CALLING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'DECLINED';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  cost?: number;
  pricePerMinute: number;
}

export interface TeamMember {
  id: string;
  creatorUserId: string;
  memberUserId: string;
  role: 'MANAGER' | 'EDITOR' | 'VIEWER';
  permissions: string[];
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  addedAt: Date;
}

export interface Challenge {
  id: string;
  brandId: string;
  title: string;
  description: string;
  prize: number;
  startDate: Date;
  endDate: Date;
  requirements: string[];
  submissionCount: number;
  thumbnailUrl: string;
  status: 'UPCOMING' | 'ACTIVE' | 'ENDED';
}

export interface Ad {
  id: string;
  advertiserId: string;
  type: 'BANNER' | 'INTERSTITIAL' | 'NATIVE' | 'VIDEO';
  title: string;
  description: string;
  imageUrl: string;
  videoUrl?: string;
  targetUrl: string;
  impressionCount: number;
  clickCount: number;
  budget: number;
  spent: number;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export type SafetyLevel = 'SAFE' | 'NSFW' | 'ILLEGAL';
export type ContentStatus = 'PENDING_SCAN' | 'APPROVED' | 'REJECTED' | 'FLAGGED';
export type UserRole = 'USER' | 'CREATOR' | 'MODERATOR' | 'ADMIN';
export type Platform = 'WEB' | 'MOBILE' | 'API';