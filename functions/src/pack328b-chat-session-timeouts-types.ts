/**
 * PACK 328B — Chat & Session Inactivity Timeouts (Anti-Abuse & UX Layer)
 * 
 * TypeScript type definitions for chat session timeout and expiration logic.
 * This pack adds timeout enforcement without changing any tokenomics.
 * 
 * Key Features:
 * - Auto-expire inactive chats after 48h (free) or 72h (paid)
 * - Refund unused word buckets on expiration
 * - Manual "End Chat" button for users
 * - UX indicators showing last activity and countdown
 * - Anti-abuse protections
 */

/**
 * Extended chat status including expiration states
 */
export type Pack328bChatStatus = 
  | 'ACTIVE'      // Chat is currently active
  | 'ENDED'       // Chat was manually ended by user
  | 'EXPIRED'     // Chat auto-expired due to inactivity
  | 'CANCELLED';  // Chat was cancelled (future use)

/**
 * Timeout configuration constants
 */
export const PACK_328B_TIMEOUTS = {
  // Free chat (before paid buckets): 48 hours
  FREE_CHAT_TIMEOUT_HOURS: 48,
  
  // Paid chat (after entering paid buckets): 72 hours
  PAID_CHAT_TIMEOUT_HOURS: 72,
  
  // Call timeout: if call lasts 0 seconds, no charge
  CALL_ZERO_DURATION_SECONDS: 0,
  
  // Call fraud threshold: very short calls repeated many times
  CALL_SHORT_DURATION_SECONDS: 30,
  
  // Number of short calls to trigger fraud signal
  CALL_SHORT_REPEAT_THRESHOLD: 5,
} as const;

/**
 * Extended chat session document with timeout fields
 */
export interface Pack328bChatSession {
  chatId: string;
  participants: string[];
  roles: {
    payerId: string;
    earnerId: string | null;
  };
  mode: 'FREE_A' | 'FREE_B' | 'PAID';
  state: 'FREE_ACTIVE' | 'AWAITING_DEPOSIT' | 'PAID_ACTIVE' | 'CLOSED';
  
  // PACK 328B: New timeout fields
  status: Pack328bChatStatus;
  lastMessageAt: string;              // ISO timestamp, updated on every message
  lastPaidBucketAt?: string;          // ISO timestamp, updated when bucket charged
  autoExpireAt?: string;              // ISO timestamp, when to auto-expire
  
  // Existing billing fields
  billing: {
    wordsPerToken: number;
    freeMessagesRemaining: { [userId: string]: number };
    escrowBalance: number;
    totalConsumed: number;
    messageCount: number;
    
    // PACK 328B: Bucket tracking for refunds
    bucketsPurchased?: number;        // Total buckets purchased
    bucketsConsumed?: number;          // Full buckets consumed
    currentBucketWords?: number;       // Words used in current partial bucket
  };
  
  freeMessageLimit: number;
  needsEscrow: boolean;
  
  deposit?: {
    amount: number;
    platformFee: number;
    escrowAmount: number;
    paidAt: any; // Timestamp
  };
  
  createdAt: any; // Timestamp
  lastActivityAt: any; // Timestamp
  updatedAt: any; // Timestamp
  closedAt?: any; // Timestamp
  closedBy?: string;
  
  // PACK 328B: Expiration metadata
  expiredAt?: any; // Timestamp
  expiredReason?: 'INACTIVITY_FREE' | 'INACTIVITY_PAID' | 'MANUAL_END';
}

/**
 * Extended call session with timeout tracking
 */
export interface Pack328bCallSession {
  callId: string;
  callType: 'VOICE' | 'VIDEO';
  payerId: string;
  earnerId: string | null;
  pricePerMinute: number;
  state: 'ACTIVE' | 'ENDED';
  
  startedAt: any; // Timestamp
  endedAt?: any; // Timestamp
  durationMinutes?: number;
  durationSeconds?: number;  // PACK 328B: Track exact seconds
  totalTokens?: number;
  
  lastActivityAt: any; // Timestamp
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
  
  // PACK 328B: Call termination tracking
  endedBy?: string;
  endReason?: 'MANUAL' | 'AUTO_DISCONNECT' | 'ZERO_DURATION' | 'INSUFFICIENT_BALANCE';
}

/**
 * Refund calculation result
 */
export interface Pack328bRefundResult {
  totalBucketsPurchased: number;
  bucketsFullyConsumed: number;
  currentBucketWordsUsed: number;
  wordsPerBucket: number;
  
  unusedBuckets: number;
  unusedWordsInCurrentBucket: number;
  totalUnusedWords: number;
  
  tokensToRefund: number;
  platformFeeRetained: number;
}

/**
 * Chat expiration job result
 */
export interface Pack328bExpirationJobResult {
  scannedChats: number;
  expiredChats: number;
  errors: number;
  expiredChatIds: string[];
}

/**
 * Fraud signal for short repeated calls
 */
export interface Pack328bCallFraudSignal {
  userId: string;
  shortCallCount: number;
  timeWindow: string;
  averageDuration: number;
  flaggedAt: string;
}