// Stub types for pack411 reviews
export interface StoreReview  {
  id?: any;
  storeType?: StoreType;
  store?: StoreType;
  rating?: any;
  title?: any;
  content?: string;
  body?: any;
  authorName?: string;
  userPseudoId?: any;
  createdAt?: any;
  lastSeenAt?: string;
  appVersion?: any;
  language?: any;
  country?: any;
  source?: 'STORE_SCRAPE' | 'IN_APP_PROMPT' | 'SUPPORT_PORTAL';
  status?: string;
  tags?: ReviewTag[];
  metadata?: any;
  [key: string]: any;
}

export type StoreType = 'APPLE' | 'GOOGLE' | 'GOOGLE_PLAY' | 'APPLE_APP_STORE';

export type ReviewTag = string | {
  name: string;
  sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  confidence?: number;
  [key: string]: any;
};

export interface ReviewTagPattern  {
  pattern: RegExp | string;
  tag: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  [key: string]: any;
}

export const DEFAULT_TAG_PATTERNS: ReviewTagPattern[] = [
  { pattern: 'bug', tag: 'BUG', sentiment: 'NEGATIVE' },
  { pattern: 'crash', tag: 'CRASH', sentiment: 'NEGATIVE' },
  { pattern: 'love', tag: 'POSITIVE_FEEDBACK', sentiment: 'POSITIVE' },
  { pattern: 'great', tag: 'POSITIVE_FEEDBACK', sentiment: 'POSITIVE' },
];

export interface RatingPromptDecision  {
  shouldPrompt: boolean;
  reason: string;
  nextPromptDate?: any;
  [key: string]: any;
}

export interface RatingPromptLog  {
  id?: string;
  userId?: any;
  prompted?: boolean;
  decision?: any;
  timestamp?: any;
  promptedAt?: string;
  appVersion?: any;
  userAction?: any;
  redirectedToStore?: any;
  linkedSupportTicketId?: any;
  [key: string]: any;
}

export interface InAppRatingConfig  {
  minSessionCount?: number;
  minDaysSinceInstall?: number;
  minDaysSinceLastPrompt?: number;
  minPositiveActions?: number;
  enabled?: boolean;
  eligibility?: any;
  throttling?: any;
  deflection?: any;
  [key: string]: any;
}

export interface ReputationSnapshot  {
  id?: string;
  storeType?: StoreType;
  store?: StoreType;
  avgRating?: number;
  totalReviews?: number;
  recentReviews?: number;
  sentimentScore?: number;
  timestamp?: any;
  date?: string;
  appVersion?: string;
  country?: string;
  ratingCount?: number;
  ratingsDistribution?: any;
  oneStarShare?: number;
  flaggedReviewsCount?: number;
  suspectedBrigadeScore?: number;
  [key: string]: any;
}

export interface ReviewBrigadeAlert  {
  id?: string;
  storeType?: StoreType;
  affectedStore?: StoreType;
  detectedAt?: any;
  reviewCount?: number;
  avgRating?: number;
  suspiciousPatterns?: string[];
  suspectedReviewIds?: any[];
  metrics?: Record<string, any>;
  alertType?: string;
  severity?: string;
  notes?: string;
  status?: 'ACTIVE' | 'RESOLVED' | 'FALSE_POSITIVE' | 'NEW' | 'INVESTIGATING' | 'DISMISSED';
  [key: string]: any;
}

export interface ReputationDefenseConfig  {
  brigadeThreshold?: number;
  timeWindowHours?: number;
  minReviewsForAlert?: number;
  autoResponseEnabled?: boolean;
  enabled?: boolean;
  spikeDetection?: any;
  brigadingDetection?: any;
  alerting?: any;
  [key: string]: any;
}
