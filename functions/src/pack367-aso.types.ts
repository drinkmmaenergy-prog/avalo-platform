/**
 * PACK 367 — ASO, Reviews, Reputation & Store Defense Engine
 * ASO & Store Metadata Types
 * 
 * Defines data models for app store optimization, including
 * localized listings, metadata, and review snapshots.
 */

export type StorePlatform = "android" | "ios";

/**
 * Localized content for a specific locale
 */
export interface StoreLocaleConfig {
  locale: string;           // "en-US", "pl-PL", etc.
  title: string;            // App title (max varies by platform)
  shortDescription: string; // Short promo text
  fullDescription: string;  // Full app description
  keywords?: string[];      // iOS keywords or Android search terms
  promoText?: string;       // Featured promotional text
}

/**
 * Complete store listing configuration for a platform/country combo
 */
export interface StoreListingConfig {
  platform: StorePlatform;
  country: string;              // ISO code, e.g. "PL", "US"
  locales: StoreLocaleConfig[];
  screenshots: string[];        // Storage URLs or CDN paths
  videoUrl?: string;            // Preview video URL
  lastUpdatedAt: number;        // Timestamp
  lastUpdatedBy: string;        // adminId
  a_b_testGroup?: "A" | "B";    // A/B testing variant
  status: "draft" | "active" | "archived";
  version?: string;             // Optional version tracking
}

/**
 * Store rating snapshot for analytics
 * Note: Full review content often unavailable via API
 */
export interface StoreRatingSnapshot {
  platform: StorePlatform;
  country: string;
  capturedAt: number;           // Timestamp of snapshot
  avgRating: number;            // 1.0–5.0
  totalRatings: number;
  ratingsBreakdown: {
    "1": number;
    "2": number;
    "3": number;
    "4": number;
    "5": number;
  };
  suspiciousSpike?: boolean;    // Anomaly flag
  previousAvgRating?: number;   // For trend analysis
  ratingDelta?: number;         // Change from previous
}

/**
 * In-app feedback types
 */
export type InAppFeedbackType = 
  | "star_prompt"      // Star rating request
  | "bug"              // Bug report
  | "idea"             // Feature suggestion
  | "frustration";     // Negative experience

/**
 * In-app feedback event (before store review)
 */
export interface InAppFeedback {
  userId: string;
  createdAt: number;
  platform: StorePlatform;
  rating?: number;              // 1–5 if star_prompt
  type: InAppFeedbackType;
  message?: string;
  handledBySupport?: boolean;   // Routed to support
  supportTicketId?: string;     // Reference to PACK 300A ticket
  appVersion?: string;
  deviceInfo?: {
    os: string;
    model: string;
  };
}

/**
 * Review prompt eligibility tracking
 */
export interface ReviewPromptTracker {
  userId: string;
  lastPromptShownAt?: number;
  totalPromptsShown: number;
  hasLeftReview: boolean;       // User confirmed they reviewed
  eligibilityScore: number;     // Calculated score
  eligibilityReasons: string[]; // Why eligible/not
}

/**
 * ASO metadata change history
 */
export interface StoreListingHistory {
  id: string;
  platform: StorePlatform;
  country: string;
  changedAt: number;
  changedBy: string;            // adminId
  changeType: "create" | "update" | "activate" | "archive";
  previousConfig?: Partial<StoreListingConfig>;
  newConfig: StoreListingConfig;
  reason?: string;
}

/**
 * Review anomaly alert
 */
export interface ReviewAnomalyAlert {
  id: string;
  platform: StorePlatform;
  country: string;
  detectedAt: number;
  anomalyType: 
    | "sudden_rating_drop"
    | "suspicious_spike_1star"
    | "review_bombing"
    | "unusual_velocity";
  severity: "low" | "medium" | "high" | "critical";
  metrics: {
    previousAvg: number;
    currentAvg: number;
    delta: number;
    timeWindowHours: number;
  };
  status: "new" | "investigating" | "resolved" | "false_positive";
  assignedTo?: string;          // adminId
  notes?: string;
  resolvedAt?: number;
}
