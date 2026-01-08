/**
 * Phase 26 - Creator Goals & Support System Types
 * Type definitions for creator funding goals and supporter tracking
 * 
 * IMPORTANT: This module only ADDS new goals functionality.
 * It does NOT modify ANY existing monetization logic.
 */

/**
 * Goal categories
 */
export type GoalCategory = 
  | 'equipment'    // Camera, mic, lighting, etc.
  | 'lifestyle'    // Living expenses, health, etc.
  | 'travel'       // Trips, experiences
  | 'content'      // Content production costs
  | 'other';       // Custom goals

/**
 * Goal status
 */
export type GoalStatus = 'active' | 'completed' | 'cancelled';

/**
 * Creator Goal - main funding target
 */
export interface CreatorGoal {
  goalId: string;
  creatorId: string;
  
  // Goal details
  title: string;                    // Max 60 chars
  description: string;              // Max 400 chars
  category: GoalCategory;
  
  // Funding
  targetTokens: number;             // Goal target (500-100000)
  currentTokens: number;            // Aggregated support
  
  // Timing
  deadline?: Date | null;           // Optional deadline
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date | null;           // When goal was completed/cancelled
  
  // Status
  isActive: boolean;
  status: GoalStatus;
  
  // Supporters
  supportersCount: number;          // Count of unique supporters
  
  // Metadata
  metadata?: {
    lastSupportAt?: Date;
    firstSupportAt?: Date;
    averageSupport?: number;
  };
}

/**
 * Goal Support - individual support transaction
 */
export interface GoalSupport {
  supportId: string;
  goalId: string;
  creatorId: string;
  supporterId: string;
  
  // Transaction details
  amountTokens: number;
  
  // Revenue split (70% to creator, 30% to Avalo)
  creatorReceived: number;
  avaloReceived: number;
  
  // Timestamps
  createdAt: Date;
  
  // Metadata
  metadata?: {
    deviceId?: string;
    ipHash?: string;
  };
}

/**
 * Goal Summary - aggregated data for creator dashboard
 */
export interface GoalSummary {
  goalId: string;
  creatorId: string;
  title: string;
  category: GoalCategory;
  targetTokens: number;
  currentTokens: number;
  progressPercentage: number;       // currentTokens / targetTokens * 100
  supportersCount: number;
  daysRemaining: number | null;     // null if no deadline
  status: GoalStatus;
  isActive: boolean;
}

/**
 * Goal Supporter Info - for top supporters list
 */
export interface GoalSupporter {
  supporterId: string;
  displayName: string;
  avatar?: string;
  totalSupport: number;             // Total tokens supported to this goal
  supportCount: number;             // Number of support transactions
  lastSupportAt: Date;
  isVisible: boolean;               // Based on account status/blocking
}

/**
 * Payload for creating a new goal
 */
export interface CreateGoalPayload {
  title: string;
  description: string;
  category: GoalCategory;
  targetTokens: number;
  deadline?: Date | null;
}

/**
 * Payload for updating an existing goal
 */
export interface UpdateGoalPayload {
  title?: string;
  description?: string;
  category?: GoalCategory;
  deadline?: Date | null;
  // Note: targetTokens cannot be changed after support is received
}

/**
 * Payload for supporting a goal
 */
export interface SupportGoalPayload {
  goalId: string;
  amountTokens: number;
  deviceId?: string;
  ipHash?: string;
}

/**
 * Response for goal support operation
 */
export interface SupportGoalResponse {
  success: boolean;
  supportId: string;
  goalId: string;
  amountTokens: number;
  creatorReceived: number;
  avaloReceived: number;
  newBalance: number;               // Supporter's new balance
  goalProgress: {
    currentTokens: number;
    targetTokens: number;
    progressPercentage: number;
  };
}

/**
 * Request to get creator's goals
 */
export interface GetCreatorGoalsQuery {
  creatorId: string;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Response with creator's goals
 */
export interface GetCreatorGoalsResponse {
  goals: GoalSummary[];
  total: number;
  activeCount: number;
}

/**
 * Request to get goal supporters
 */
export interface GetGoalSupportersQuery {
  goalId: string;
  limit?: number;
  offset?: number;
}

/**
 * Response with goal supporters
 */
export interface GetGoalSupportersResponse {
  supporters: GoalSupporter[];
  total: number;
}

/**
 * AI description suggestion request
 */
export interface SuggestGoalDescriptionPayload {
  title: string;
  category: GoalCategory;
  approximateTargetTokens: number;
}

/**
 * AI description suggestion response
 */
export interface SuggestGoalDescriptionResponse {
  suggestedDescription: string;
  fallback: boolean;                // True if AI failed and fallback was used
}

/**
 * Goal validation constraints
 */
export const GOAL_CONSTRAINTS = {
  TITLE_MIN_LENGTH: 3,
  TITLE_MAX_LENGTH: 60,
  DESCRIPTION_MIN_LENGTH: 10,
  DESCRIPTION_MAX_LENGTH: 400,
  TARGET_MIN_TOKENS: 500,
  TARGET_MAX_TOKENS: 100000,
  MAX_ACTIVE_GOALS: 3,
  SUPPORT_MIN_TOKENS: 10,
  SUPPORT_MAX_TOKENS: 10000,
  CREATOR_SPLIT: 0.70,              // 70% to creator
  AVALO_SPLIT: 0.30,                // 30% to Avalo
} as const;

/**
 * Goal categories display metadata
 */
export const GOAL_CATEGORY_METADATA: Record<GoalCategory, { displayName: string; icon: string }> = {
  equipment: { displayName: 'Sprzęt', icon: '🎥' },
  lifestyle: { displayName: 'Życie codzienne', icon: '🏠' },
  travel: { displayName: 'Podróże', icon: '✈️' },
  content: { displayName: 'Tworzenie treści', icon: '🎬' },
  other: { displayName: 'Inne', icon: '🎯' },
};