/**
 * TypeScript Type Definitions for Avalo
 */

;
;
import {
  Timestamp,
  FieldValue
} from "firebase-admin/firestore";
import { Gender, ChatStatus, TransactionType, VerificationStatus, BookingStatus } from './config.js';

// =======================================================
// 🧍 USER PROFILE
// =======================================================
export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  phone?: string;
  dob: string; // ISO date string
  age: number;
  gender: Gender;
  seeking: Gender[];
  orientation?: string[];
  bio: string;
  photos: string[];
  location: {
    city: string;
    country: string;
    coords?: { lat: number; lng: number };
    manual?: boolean;
  };
  searchAreaKm: number | "country";
  modes: {
    incognito: boolean;
    passport: boolean;
    earnFromChat: boolean;
  };
  verification: {
    selfie: boolean;
    phone: boolean;
    bank: boolean;
    age18: boolean;
    status: VerificationStatus;
  };
  roles: {
    vip?: boolean;
    royal?: boolean;
    admin?: boolean;
    moderator?: boolean;
  };
  qualityScore: number;
  instagram?: {
    linked: boolean;
    username?: string;
    followers?: number;
    accountId?: string;
    lastSyncAt?: Timestamp | FieldValue;
  };
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// =======================================================
// 💰 USER WALLET
// =======================================================
export interface UserWallet {
  balance: number;
  pending: number;
  earned: number;
  settlementRate: number; // 0.20 PLN per token
}

// =======================================================
// 💬 CHAT DOCUMENT
// =======================================================
export interface Chat {
  chatId: string;
  participants: string[];
  status: ChatStatus;
  deposit?: {
    amount: number;
    fee: number;
    escrow: number;
    paidBy: string;
    paidAt: Timestamp | FieldValue;
  };
  billing: {
    currentBalance: number;
    totalSpent: number;
    wordsSent: number;
    tokensSent: number;
  };
  roles: {
    payer: string;
    earner: string | null;
  };
  freeMessagesUsed: Record<string, number>;
  autoReload?: boolean;
  queue?: { royalBypass?: boolean };
  lastActivityAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// =======================================================
// ✉️ MESSAGE
// =======================================================
export interface Message {
  messageId: string;
  chatId: string;
  senderId: string;
  text?: string;
  media?: {
    type: "photo" | "voice" | "video";
    url: string;
    duration?: number;
  };
  wordCount?: number;
  tokensCharged?: number;
  createdAt: Timestamp | FieldValue;
}

// =======================================================
// 💳 TRANSACTION
// =======================================================
export interface Transaction {
  txId: string;
  uid: string;
  type: TransactionType;
  amountTokens: number;
  split?: {
    platformTokens: number;
    creatorTokens: number;
  };
  status: "pending" | "completed" | "refunded";
  metadata?: {
    chatId?: string;
    bookingId?: string;
    packId?: string;
    subscriptionId?: string;
    stripeSessionId?: string;
  };
  createdAt: Timestamp | FieldValue;
  completedAt?: Timestamp | FieldValue;
}

// =======================================================
// 📅 CALENDAR BOOKING
// =======================================================
export interface CalendarBooking {
  bookingId: string;
  creatorId: string;
  bookerId: string;
  slot: {
    start: Timestamp | FieldValue;
    end: Timestamp | FieldValue;
    duration: number;
  };
  priceTokens: number;
  payment: {
    platformFeeTokens: number;
    escrowTokens: number;
  };
  meetingType: string;
  location: {
    type: "public" | "hotel" | "private";
    name?: string;
    coords?: { lat: number; lng: number };
  };
  acknowledgments: {
    socialOnly: boolean;
    noEscort: boolean;
    noSexWork: boolean;
    paymentForTime: boolean;
    banAware: boolean;
  };
  verification?: {
    gps?: boolean;
    qr?: boolean;
    selfie?: boolean;
    completedAt?: Timestamp | FieldValue;
  };
  status: BookingStatus;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
}

// =======================================================
// 💞 MATCH
// =======================================================
export interface Match {
  matchId: string;
  user1Id: string;
  user2Id: string;
  chatId?: string;
  createdAt: Timestamp | FieldValue;
}

// =======================================================
// 🚨 ADMIN FLAG
// =======================================================
export interface AdminFlag {
  flagId: string;
  flaggedUid: string;
  reporterUid?: string;
  reason: string;
  evidence?: {
    chatId?: string;
    messageId?: string;
    screenshot?: string;
  };
  status: "pending" | "reviewed" | "actioned" | "dismissed";
  reviewedBy?: string;
  reviewedAt?: Timestamp | FieldValue;
  action?: "warn" | "ban" | "dismiss";
  createdAt: Timestamp | FieldValue;
}

// =======================================================
// 🤖 AI COMPANION
// =======================================================
export interface AICompanion {
  id: string;
  name: string;
  gender: "female" | "male" | "nonbinary";
  ethnicity:
    | "caucasian"
    | "asian"
    | "black"
    | "latina"
    | "indian"
    | "middle-eastern"
    | "mixed";
  ageRange: string;
  personality: string;
  language: string[];
  tierAccess: ("Free" | "Plus" | "Intimate" | "Creator")[];
  nsfwAvailable: boolean;
  relationshipAvailable: boolean;
  profileImage: string;
  blurredGallery: string[];
  unblurredGallery: string[];
  unlockedGallery?: Record<string, string[]>;
  voiceSample?: string;
  popularityScore: number;
  description: string;
  systemPrompt?: string;
  ownerId?: string;
  visibility?: "private" | "public" | "pending_moderation";
  isActive: boolean;
  isFlagged?: boolean; // Moderation flag for content review
  flaggedReason?: string;
  flaggedAt?: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  // PACK 331: AI Avatar Template support
  avatarTemplateId?: string; // Reference to purchased template
  avatarImageUrl?: string; // URL from template or custom
}

// =======================================================
// 💎 AI SUBSCRIPTION
// =======================================================
export interface AISubscription {
  userId: string;
  tier: "Free" | "Plus" | "Intimate" | "Creator";
  status: "active" | "cancelled" | "expired";
  startDate: Timestamp | FieldValue;
  endDate?: Timestamp | FieldValue;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  dailyMessageCount?: number;
  lastResetDate?: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

// =======================================================
// 💬 AI CHAT
// =======================================================
export interface AIChat {
  chatId: string;
  userId: string;
  companionId: string;
  companionName: string;
  status: "active" | "closed";
  messagesCount: number;
  mediaUnlocked: number;
  tokensSpent: number;
  lastMessage: string | null;
  lastActivityAt: Timestamp | FieldValue;
  createdAt: Timestamp | FieldValue;
  conversationHistory: Array<{ role: string; content: string }>;
}

// =======================================================
// 🧩 HELPERS
// =======================================================
export interface FunctionResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ChatRoles {
  payer: string;
  earner: string | null;
  initiator: string;
  receiver: string;
}


