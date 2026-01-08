/**
 * PACK 227: Desire Loop Engine - TypeScript Type Definitions
 * 
 * Type definitions for the Desire Loop system
 */

export type DesireDriver = 'curiosity' | 'intimacy' | 'recognition' | 'growth' | 'opportunity';

export type DesireFrequency = 'low' | 'medium' | 'high';

export type TriggerType = 
  | 'new_profiles'
  | 'chat_start'
  | 'call_suggestion'
  | 'meeting_plan'
  | 'profile_views'
  | 'compliment_received'
  | 'fan_milestone'
  | 'royal_progress'
  | 'level_up'
  | 'event_nearby'
  | 'travel_mode'
  | 'passport_week'
  | 'chemistry_peak'
  | 'journey_milestone';

export interface DesireState {
  userId: string;
  
  // 5 desire drivers (0-100 scale)
  curiosity: number;
  intimacy: number;
  recognition: number;
  growth: number;
  opportunity: number;
  
  // Metadata
  lastUpdated: Date;
  lastActivityAt: Date;
  
  // Settings
  frequency: DesireFrequency;
  enabledDrivers: DesireDriver[];
  
  // Safety flags
  anxietyReliefMode: boolean;
  sleepModeUntil?: Date;
  breakupCooldownUntil?: Date;
  toxicCooldownUntil?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface DesireLoopTrigger {
  triggerId: string;
  userId: string;
  driverType: DesireDriver;
  triggerType: TriggerType;
  
  // Content
  title: string;
  description: string;
  actionText: string;
  actionTarget: string;
  
  // Metadata
  priority: number;
  createdAt: Date;
  expiresAt: Date;
  
  // User actions
  dismissed: boolean;
  dismissedAt?: Date;
  actioned: boolean;
  actionedAt?: Date;
}

export interface DesireLoopSettings {
  enabled: boolean;
  frequency: DesireFrequency;
  enabledDrivers: DesireDriver[];
  
  // Quiet hours
  quietHoursStart?: number;
  quietHoursEnd?: number;
  
  // Limits
  maxTriggersPerDay: number;
}

export interface DesireStateHistory {
  historyId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  
  curiosity: number;
  intimacy: number;
  recognition: number;
  growth: number;
  opportunity: number;
  
  triggersShown: number;
  triggersActioned: number;
  
  createdAt: Date;
}

export interface DesireLoopCooldown {
  cooldownId: string;
  userId: string;
  driverType: DesireDriver;
  expiresAt: Date;
  reason: string;
  createdAt: Date;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface GetDesireStateResponse {
  success: boolean;
  state: {
    curiosity: number;
    intimacy: number;
    recognition: number;
    growth: number;
    opportunity: number;
    frequency: DesireFrequency;
    enabledDrivers: DesireDriver[];
  };
}

export interface TriggerDesireStateCheckResponse {
  success: boolean;
  state: DesireState;
  triggersGenerated: number;
}

export interface UpdateDesireLoopSettingsRequest {
  enabled?: boolean;
  frequency?: DesireFrequency;
  enabledDrivers?: DesireDriver[];
  quietHoursStart?: number;
  quietHoursEnd?: number;
  maxTriggersPerDay?: number;
}

// ============================================================================
// SDK Methods (to be implemented)
// ============================================================================

export interface DesireLoopSDK {
  /**
   * Get current user's desire state
   */
  getMyDesireState(): Promise<GetDesireStateResponse>;
  
  /**
   * Get active triggers for current user
   */
  getActiveTriggers(): Promise<DesireLoopTrigger[]>;
  
  /**
   * Dismiss a trigger
   */
  dismissTrigger(triggerId: string): Promise<void>;
  
  /**
   * Mark a trigger as actioned
   */
  actionTrigger(triggerId: string): Promise<void>;
  
  /**
   * Get user's desire loop settings
   */
  getSettings(): Promise<DesireLoopSettings>;
  
  /**
   * Update user's desire loop settings
   */
  updateSettings(settings: UpdateDesireLoopSettingsRequest): Promise<void>;
  
  /**
   * Activate anxiety relief mode (pauses all triggers)
   */
  activateAnxietyReliefMode(): Promise<void>;
  
  /**
   * Deactivate anxiety relief mode
   */
  deactivateAnxietyReliefMode(): Promise<void>;
  
  /**
   * Set sleep mode (pauses triggers until specified time)
   */
  setSleepMode(untilTimestamp: Date): Promise<void>;
  
  /**
   * Get desire state history
   */
  getHistory(limit?: number): Promise<DesireStateHistory[]>;
  
  /**
   * Manually trigger desire state check (force check all drivers)
   */
  triggerStateCheck(): Promise<TriggerDesireStateCheckResponse>;
}

// ============================================================================
// Constants
// ============================================================================

export const DESIRE_DRIVER_INFO = {
  curiosity: {
    label: 'Curiosity',
    description: 'New profiles, storytellers, discoveries',
    icon: 'sparkles',
    emoji: '✨',
    color: '#667eea',
  },
  intimacy: {
    label: 'Intimacy',
    description: 'Chat, calls, meetings, chemistry',
    icon: 'heart',
    emoji: '💕',
    color: '#f093fb',
  },
  recognition: {
    label: 'Recognition',
    description: 'Profile views, compliments, fans',
    icon: 'star',
    emoji: '⭐',
    color: '#fa709a',
  },
  growth: {
    label: 'Growth',
    description: 'Royal progress, levels, achievements',
    icon: 'trending-up',
    emoji: '📈',
    color: '#30cfd0',
  },
  opportunity: {
    label: 'Opportunity',
    description: 'Events, travel mode, passport',
    icon: 'compass',
    emoji: '🎯',
    color: '#a8edea',
  },
} as const;

export const DESIRE_FREQUENCY_INFO = {
  low: {
    label: 'Low',
    description: '2 suggestions per day max',
    triggers: 2,
  },
  medium: {
    label: 'Medium',
    description: '4 suggestions per day max',
    triggers: 4,
  },
  high: {
    label: 'High',
    description: '6 suggestions per day max',
    triggers: 6,
  },
} as const;

export const DEFAULT_DESIRE_LOOP_SETTINGS: DesireLoopSettings = {
  enabled: true,
  frequency: 'medium',
  enabledDrivers: ['curiosity', 'intimacy', 'recognition', 'growth', 'opportunity'],
  maxTriggersPerDay: 4,
};