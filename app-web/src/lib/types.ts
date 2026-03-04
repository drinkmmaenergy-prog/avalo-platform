/**
 * Core Types for Avalo Web
 * Matches mobile types and backend schema
 */

import type { Timestamp } from 'firebase/firestore';

export type CallType = 'VOICE' | 'VIDEO';
export type UserStatus = 'STANDARD' | 'VIP' | 'ROYAL';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  gender: 'male' | 'female' | 'other';
  bio?: string;
  age?: number;
  location?: string;
  earnOnChat: boolean;
  influencerBadge: boolean;
  isRoyalMember: boolean;
  vipStatus?: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  stats?: {
    followers: number;
    following: number;
    posts: number;
  };
}

export interface Post {
  id: string;
  userId: string;
  type: 'standard' | 'premium' | 'link';
  caption: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  mediaType?: 'photo' | 'video';
  isNSFW: boolean;
  isPremium: boolean;
  unlockPrice?: number;
  createdAt: Timestamp;
  likes: number;
  comments: number;
  views: number;
}

export interface Story {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  duration: number;
  isPremium: boolean;
  unlockPrice?: number;
  isNSFW: boolean;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  views: number;
}

export interface Reel {
  id: string;
  userId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  isPremium: boolean;
  unlockPrice?: number;
  isNSFW: boolean;
  createdAt: Timestamp;
  likes: number;
  comments: number;
  views: number;
  duration: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  mediaUrl?: string;
  mediaType?: 'photo' | 'video';
  tokenCost: number;
  createdAt: Timestamp;
  readAt?: Timestamp;
}

export interface Chat {
  id: string;
  participants: string[];
  roles: {
    payerId: string;
    earnerId: string | null;
  };
  mode: 'FREE_A' | 'FREE_B' | 'PAID';
  state: 'FREE_ACTIVE' | 'AWAITING_DEPOSIT' | 'PAID_ACTIVE' | 'CLOSED';
  billing: {
    wordsPerToken: number;
    freeMessagesRemaining: Record<string, number>;
    escrowBalance: number;
    totalConsumed: number;
    messageCount: number;
  };
  lastMessage?: string;
  lastActivityAt: Timestamp;
  createdAt: Timestamp;
}

export interface CallSession {
  callId: string;
  type: 'voice' | 'video' | 'group';
  callType: 'VOICE' | 'VIDEO'; // Backward compatibility
  participants: string[];
  initiatorUserId: string;
  payerId: string;
  earnerId: string | null;
  pricePerMinute: number;
  state: 'ACTIVE' | 'ENDED';
  status: 'initiated' | 'ringing' | 'active' | 'ended' | 'failed';
  createdAt: Timestamp;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  durationMinutes?: number;
  totalTokens?: number;
  
  // Quality metrics summary
  avgJitterMs?: number;
  avgPacketLoss?: number;
  avgRttMs?: number;
  qualityRating?: 'Excellent' | 'Good' | 'Fair' | 'Poor';
}

export interface AICompanion {
  id: string;
  name: string;
  avatar: string;
  description: string;
  tier: 'basic' | 'premium' | 'nsfw';
  personality: string;
}

export interface AIConversation {
  id: string;
  companionId: string;
  userId: string;
  messages: AIMessage[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokenCost: number;
  createdAt: Timestamp;
}

export interface Event {
  id: string;
  hostId: string;
  title: string;
  description: string;
  type: 'offline' | 'virtual';
  location?: string;
  virtualLink?: string;
  date: Timestamp;
  price: number;
  maxAttendees?: number;
  currentAttendees: number;
  imageUrl?: string;
  isNSFW: boolean;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  createdAt: Timestamp;
}

export interface EventTicket {
  id: string;
  eventId: string;
  userId: string;
  qrCode: string;
  status: 'valid' | 'used' | 'refunded';
  purchasedAt: Timestamp;
}

export interface DigitalProduct {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  type: 'photo' | 'video' | 'album' | 'nft_ready';
  mediaUrls: string[];
  thumbnailUrl: string;
  price: number;
  isNSFW: boolean;
  createdAt: Timestamp;
  sales: number;
}

export interface ProductOwnership {
  userId: string;
  productId: string;
  purchasedAt: Timestamp;
  accessExpiry?: Timestamp;
}

export interface BrandChallenge {
  id: string;
  brandId: string;
  title: string;
  description: string;
  tasks: ChallengeTask[];
  reward: number;
  startDate: Timestamp;
  endDate: Timestamp;
  participants: number;
  imageUrl?: string;
}

export interface ChallengeTask {
  id: string;
  description: string;
  type: 'view' | 'engage' | 'share' | 'create';
  completed: boolean;
}

export interface CreatorEarnings {
  userId: string;
  totalEarned: number;
  breakdown: {
    chat: number;
    voice: number;
    video: number;
    content: number;
    events: number;
    store: number;
  };
  pendingBalance: number;
  withdrawableBalance: number;
  lastUpdated: Timestamp;
}

export interface CreatorAnalytics {
  userId: string;
  period: 'day' | 'week' | 'month';
  views: number;
  engagement: number;
  newFollowers: number;
  contentPerformance: {
    posts: number;
    stories: number;
    reels: number;
  };
  fanConversion: {
    freeToPaid: number;
    repeating: number;
    avgSpend: number;
  };
}

export interface Wallet {
  balance: number;
  earned: number;
  pending: number;
  spent: number;
  updatedAt: Timestamp;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'purchase' | 'earning' | 'refund' | 'withdrawal' | 'call_charge' | 'call_earning' | 'chat_charge' | 'content_unlock';
  amount: number;
  metadata?: Record<string, any>;
  createdAt: Timestamp;
}
