/**
 * Goals Service
 * Handles all creator goals and support operations for mobile app
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

// Types
export type GoalCategory = 
  | 'equipment'
  | 'lifestyle'
  | 'travel'
  | 'content'
  | 'other';

export type GoalStatus = 'active' | 'completed' | 'cancelled';

export interface CreatorGoal {
  goalId: string;
  creatorId: string;
  title: string;
  description: string;
  category: GoalCategory;
  targetTokens: number;
  currentTokens: number;
  deadline?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date | null;
  isActive: boolean;
  status: GoalStatus;
  supportersCount: number;
}

export interface GoalSummary {
  goalId: string;
  creatorId: string;
  title: string;
  category: GoalCategory;
  targetTokens: number;
  currentTokens: number;
  progressPercentage: number;
  supportersCount: number;
  daysRemaining: number | null;
  status: GoalStatus;
  isActive: boolean;
}

export interface GoalSupporter {
  supporterId: string;
  displayName: string;
  avatar?: string;
  totalSupport: number;
  supportCount: number;
  lastSupportAt: Date;
  isVisible: boolean;
}

export interface CreateGoalInput {
  title: string;
  description: string;
  category: GoalCategory;
  targetTokens: number;
  deadline?: Date | null;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  category?: GoalCategory;
  deadline?: Date | null;
}

export interface SupportGoalInput {
  goalId: string;
  amountTokens: number;
  deviceId?: string;
  ipHash?: string;
}

export interface SupportGoalResponse {
  success: boolean;
  supportId: string;
  goalId: string;
  amountTokens: number;
  creatorReceived: number;
  avaloReceived: number;
  newBalance: number;
  goalProgress: {
    currentTokens: number;
    targetTokens: number;
    progressPercentage: number;
  };
}

export interface GetCreatorGoalsResponse {
  goals: GoalSummary[];
  total: number;
  activeCount: number;
}

export interface GetGoalSupportersResponse {
  supporters: GoalSupporter[];
  total: number;
}

export interface SuggestDescriptionResponse {
  suggestedDescription: string;
  fallback: boolean;
}

// Initialize Firebase Functions
const getFunctionsInstance = () => {
  try {
    const app = getApp();
    return getFunctions(app);
  } catch (error) {
    console.error('Error getting Functions instance:', error);
    throw error;
  }
};

/**
 * Create a new creator goal
 */
export const createGoal = async (data: CreateGoalInput): Promise<CreatorGoal> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'goals_createGoal');
    const result = await callable(data);
    return (result.data as any).goal;
  } catch (error: any) {
    console.error('Error creating goal:', error);
    throw new Error(error.message || 'Failed to create goal');
  }
};

/**
 * Update an existing goal
 */
export const updateGoal = async (
  goalId: string,
  updates: UpdateGoalInput
): Promise<void> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'goals_updateGoal');
    await callable({ goalId, ...updates });
  } catch (error: any) {
    console.error('Error updating goal:', error);
    throw new Error(error.message || 'Failed to update goal');
  }
};

/**
 * Close a goal
 */
export const closeGoal = async (goalId: string): Promise<void> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'goals_closeGoal');
    await callable({ goalId });
  } catch (error: any) {
    console.error('Error closing goal:', error);
    throw new Error(error.message || 'Failed to close goal');
  }
};

/**
 * Support a goal with tokens
 */
export const supportGoal = async (
  data: SupportGoalInput
): Promise<SupportGoalResponse> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'goals_supportGoal');
    const result = await callable(data);
    return result.data as SupportGoalResponse;
  } catch (error: any) {
    console.error('Error supporting goal:', error);
    
    // Handle specific error cases
    if (error.message?.includes('Insufficient tokens')) {
      throw new Error('INSUFFICIENT_TOKENS');
    }
    if (error.message?.includes('18+')) {
      throw new Error('AGE_RESTRICTED');
    }
    if (error.message?.includes('not active')) {
      throw new Error('GOAL_INACTIVE');
    }
    if (error.message?.includes('own goal')) {
      throw new Error('CANNOT_SUPPORT_OWN_GOAL');
    }
    
    throw new Error(error.message || 'Failed to support goal');
  }
};

/**
 * Get creator's goals
 */
export const getCreatorGoals = async (
  creatorId: string,
  includeInactive: boolean = false,
  limit: number = 10
): Promise<GetCreatorGoalsResponse> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'goals_getCreatorGoals');
    const result = await callable({ creatorId, includeInactive, limit });
    return result.data as GetCreatorGoalsResponse;
  } catch (error: any) {
    console.error('Error getting creator goals:', error);
    throw new Error(error.message || 'Failed to get goals');
  }
};

/**
 * Get goal supporters
 */
export const getGoalSupporters = async (
  goalId: string,
  limit: number = 10
): Promise<GetGoalSupportersResponse> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'goals_getGoalSupporters');
    const result = await callable({ goalId, limit });
    return result.data as GetGoalSupportersResponse;
  } catch (error: any) {
    console.error('Error getting goal supporters:', error);
    throw new Error(error.message || 'Failed to get supporters');
  }
};

/**
 * Suggest goal description using AI
 */
export const suggestGoalDescription = async (
  title: string,
  category: GoalCategory,
  approximateTargetTokens: number
): Promise<SuggestDescriptionResponse> => {
  try {
    const functions = getFunctionsInstance();
    const callable = httpsCallable(functions, 'goals_suggestDescription');
    const result = await callable({ title, category, approximateTargetTokens });
    return result.data as SuggestDescriptionResponse;
  } catch (error: any) {
    console.error('Error suggesting description:', error);
    throw new Error(error.message || 'Failed to suggest description');
  }
};

/**
 * Format progress percentage for display
 */
export const formatProgressPercentage = (current: number, target: number): string => {
  const percentage = Math.min(100, Math.floor((current / target) * 100));
  return `${percentage}%`;
};

/**
 * Format days remaining for display
 */
export const formatDaysRemaining = (daysRemaining: number | null): string => {
  if (daysRemaining === null) {
    return 'Bez terminu';
  }
  if (daysRemaining === 0) {
    return 'Dziś';
  }
  if (daysRemaining === 1) {
    return '1 dzień';
  }
  if (daysRemaining < 7) {
    return `${daysRemaining} dni`;
  }
  if (daysRemaining < 30) {
    const weeks = Math.floor(daysRemaining / 7);
    return weeks === 1 ? '1 tydzień' : `${weeks} tygodni`;
  }
  const months = Math.floor(daysRemaining / 30);
  return months === 1 ? '1 miesiąc' : `${months} miesięcy`;
};

/**
 * Format token amount for display
 */
export const formatTokenAmount = (tokens: number): string => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
};

/**
 * Get category display name in Polish
 */
export const getCategoryDisplayName = (category: GoalCategory): string => {
  const names: Record<GoalCategory, string> = {
    equipment: 'Sprzęt',
    lifestyle: 'Życie codzienne',
    travel: 'Podróże',
    content: 'Tworzenie treści',
    other: 'Inne',
  };
  return names[category];
};

/**
 * Get category icon
 */
export const getCategoryIcon = (category: GoalCategory): string => {
  const icons: Record<GoalCategory, string> = {
    equipment: '🎥',
    lifestyle: '🏠',
    travel: '✈️',
    content: '🎬',
    other: '🎯',
  };
  return icons[category];
};

/**
 * Validate goal input before creating
 */
export const validateGoalInput = (data: CreateGoalInput): string | null => {
  if (!data.title || data.title.trim().length < 3) {
    return 'Tytuł musi mieć co najmniej 3 znaki';
  }
  if (data.title.length > 60) {
    return 'Tytuł nie może przekraczać 60 znaków';
  }
  if (!data.description || data.description.trim().length < 10) {
    return 'Opis musi mieć co najmniej 10 znaków';
  }
  if (data.description.length > 400) {
    return 'Opis nie może przekraczać 400 znaków';
  }
  if (data.targetTokens < 500) {
    return 'Cel musi wynosić co najmniej 500 tokenów';
  }
  if (data.targetTokens > 100000) {
    return 'Cel nie może przekraczać 100 000 tokenów';
  }
  if (data.deadline && new Date(data.deadline) <= new Date()) {
    return 'Termin musi być w przyszłości';
  }
  return null;
};

/**
 * Validate support amount
 */
export const validateSupportAmount = (amount: number): string | null => {
  if (amount < 10) {
    return 'Minimalne wsparcie to 10 tokenów';
  }
  if (amount > 10000) {
    return 'Maksymalne wsparcie to 10 000 tokenów';
  }
  return null;
};

/**
 * Calculate revenue split for display
 */
export const calculateRevenueSplit = (amount: number): { creator: number; avalo: number } => {
  const creator = Math.floor(amount * 0.70);
  const avalo = amount - creator;
  return { creator, avalo };
};