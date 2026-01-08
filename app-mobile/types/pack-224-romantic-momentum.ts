/**
 * PACK 224: Dynamic Romantic Momentum Engine
 * Type definitions for mobile app
 */

import type { Timestamp } from 'firebase/firestore';

export type MomentumTrend = 'up' | 'stable' | 'down';

export type MomentumVisualLevel = 
  | 'none' 
  | 'soft_purple' 
  | 'neon_purple' 
  | 'pink_sparks' 
  | 'peak_chemistry';

export interface RomanticMomentumState {
  userId: string;
  score: number; // 0-100 (hidden from user)
  trend: MomentumTrend;
  lastUpdate: Timestamp;
  lastActivityAt: Timestamp;
  
  hasRoyalTier: boolean;
  hasInfluencerBadge: boolean;
  
  actionsToday: number;
  lastActionDate: string;
  consecutiveDaysActive: number;
  
  violationCount: number;
  lastViolationAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MomentumVisualIndicator {
  userId: string;
  indicatorLevel: MomentumVisualLevel;
  description: string;
  updatedAt: Timestamp;
}

export interface MomentumBoostCache {
  userId: string;
  boostLevel: number;
  visualIndicator: 'none' | 'soft' | 'neon' | 'pink' | 'peak';
  lastUpdate: Timestamp;
}

/**
 * Get visual styling for momentum level
 */
export function getMomentumVisualStyle(level: MomentumVisualLevel): {
  color: string;
  glowColor: string;
  borderColor: string;
  animation: 'none' | 'pulse' | 'glow' | 'sparkle';
  icon: string;
} {
  const styles = {
    none: {
      color: '#666666',
      glowColor: 'transparent',
      borderColor: 'transparent',
      animation: 'none' as const,
      icon: ''
    },
    soft_purple: {
      color: '#9B59B6',
      glowColor: 'rgba(155, 89, 182, 0.3)',
      borderColor: '#9B59B6',
      animation: 'pulse' as const,
      icon: '💜'
    },
    neon_purple: {
      color: '#8E44AD',
      glowColor: 'rgba(142, 68, 173, 0.6)',
      borderColor: '#8E44AD',
      animation: 'glow' as const,
      icon: '✨'
    },
    pink_sparks: {
      color: '#E91E63',
      glowColor: 'rgba(233, 30, 99, 0.8)',
      borderColor: '#FFD700',
      animation: 'sparkle' as const,
      icon: '🔥'
    },
    peak_chemistry: {
      color: '#FF1493',
      glowColor: 'rgba(255, 20, 147, 1.0)',
      borderColor: '#FFD700',
      animation: 'sparkle' as const,
      icon: '⚡'
    }
  };
  
  return styles[level];
}

/**
 * Get user-friendly description for momentum level
 */
export function getMomentumDescription(level: MomentumVisualLevel): string {
  const descriptions = {
    none: 'Start your romantic journey',
    soft_purple: 'Building momentum',
    neon_purple: 'Active romantic energy',
    pink_sparks: 'Trending - High activity',
    peak_chemistry: 'Peak Chemistry ⚡'
  };
  
  return descriptions[level];
}

/**
 * Get momentum badge text
 */
export function getMomentumBadgeText(level: MomentumVisualLevel): string | null {
  if (level === 'peak_chemistry') return 'Peak Chemistry';
  if (level === 'pink_sparks') return 'Trending';
  return null;
}

/**
 * Check if momentum level should show special effects
 */
export function shouldShowMomentumEffects(level: MomentumVisualLevel): boolean {
  return level === 'pink_sparks' || level === 'peak_chemistry';
}

/**
 * Get momentum trend icon
 */
export function getMomentumTrendIcon(trend: MomentumTrend): string {
  const icons = {
    up: '📈',
    stable: '➡️',
    down: '📉'
  };
  
  return icons[trend];
}

/**
 * Get momentum trend color
 */
export function getMomentumTrendColor(trend: MomentumTrend): string {
  const colors = {
    up: '#4CAF50',
    stable: '#FFC107',
    down: '#F44336'
  };
  
  return colors[trend];
}