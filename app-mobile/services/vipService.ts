/**
 * PACK 232 — VIP Repeat Payer Program Service
 * 
 * Frontend service for VIP status checking, privilege usage, and settings management.
 */

import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit,
  getDocs,
  updateDoc,
  Timestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

export type VIPLevel = 'none' | 'bronze' | 'silver' | 'gold' | 'royal';

export interface VIPProfile {
  userId: string;
  vipLevel: VIPLevel;
  vipSince: Timestamp | null;
  vipScore: number;
  vipHistory: Array<{
    level: VIPLevel;
    date: Timestamp;
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VIPSettings {
  showBadgeToCreators: boolean;
  notifyOnLevelUp: boolean;
  privacyMode: 'none' | 'creators' | 'everyone';
  updatedAt: Timestamp;
}

export interface VIPScoreComponents {
  userId: string;
  loyaltyScore: number;
  consistencyScore: number;
  valueScore: number;
  frequencyScore: number;
  totalScore: number;
  updatedAt: Timestamp;
}

export interface VIPNotification {
  id: string;
  userId: string;
  type: 'level_up' | 'privilege_unlocked' | 'exclusive_access';
  title: string;
  message: string;
  oldLevel?: VIPLevel;
  newLevel?: VIPLevel;
  read: boolean;
  readAt?: Timestamp;
  createdAt: Timestamp;
}

export interface VIPPrivilege {
  type: 'early_access' | 'priority_queue' | 'romantic_prompts' | 'exclusive_notice';
  title: string;
  description: string;
  requiredLevel: VIPLevel;
  icon: string;
}

// ============================================================================
// VIP PRIVILEGES DEFINITIONS
// ============================================================================

export const VIP_PRIVILEGES: Record<VIPLevel, VIPPrivilege[]> = {
  none: [],
  bronze: [
    {
      type: 'priority_queue',
      title: 'Visibility Boost',
      description: 'Higher visibility in Discover section',
      requiredLevel: 'bronze',
      icon: '👁️',
    },
  ],
  silver: [
    {
      type: 'priority_queue',
      title: 'Visibility Boost',
      description: 'Higher visibility in Discover section',
      requiredLevel: 'bronze',
      icon: '👁️',
    },
    {
      type: 'early_access',
      title: 'Early Chat Invitations',
      description: 'Get notified when she\'s available before others',
      requiredLevel: 'silver',
      icon: '⚡',
    },
    {
      type: 'priority_queue',
      title: 'Queue Priority Boost',
      description: '+0.5 boost in paid chat queue',
      requiredLevel: 'silver',
      icon: '🎯',
    },
  ],
  gold: [
    {
      type: 'priority_queue',
      title: 'Visibility Boost',
      description: 'Higher visibility in Discover section',
      requiredLevel: 'bronze',
      icon: '👁️',
    },
    {
      type: 'early_access',
      title: 'Early Chat Invitations',
      description: 'Get notified when she\'s available before others',
      requiredLevel: 'silver',
      icon: '⚡',
    },
    {
      type: 'priority_queue',
      title: 'Priority in Queue',
      description: '+1.0 boost in paid chat queue',
      requiredLevel: 'gold',
      icon: '⭐',
    },
    {
      type: 'romantic_prompts',
      title: 'Romantic Conversation Starters',
      description: 'Unlock smooth conversation prompts',
      requiredLevel: 'gold',
      icon: '💬',
    },
  ],
  royal: [
    {
      type: 'priority_queue',
      title: 'Visibility Boost',
      description: 'Higher visibility in Discover section',
      requiredLevel: 'bronze',
      icon: '👁️',
    },
    {
      type: 'early_access',
      title: 'Early Chat Invitations',
      description: 'Get notified when she\'s available before others',
      requiredLevel: 'silver',
      icon: '⚡',
    },
    {
      type: 'priority_queue',
      title: 'Royal Priority',
      description: '+2.0 boost in paid chat queue',
      requiredLevel: 'royal',
      icon: '👑',
    },
    {
      type: 'romantic_prompts',
      title: 'Romantic Conversation Starters',
      description: 'Unlock smooth conversation prompts',
      requiredLevel: 'gold',
      icon: '💬',
    },
    {
      type: 'exclusive_notice',
      title: 'Exclusive Recognition',
      description: 'She sees you\'re one of her loyal supporters',
      requiredLevel: 'royal',
      icon: '✨',
    },
    {
      type: 'early_access',
      title: 'Early Story Access',
      description: 'See her stories before others',
      requiredLevel: 'royal',
      icon: '📸',
    },
  ],
};

// ============================================================================
// VIP PROFILE MANAGEMENT
// ============================================================================

/**
 * Get user's VIP profile
 */
export async function getVIPProfile(userId: string): Promise<VIPProfile | null> {
  try {
    const profileDoc = await getDoc(doc(db, 'vipProfiles', userId));
    
    if (!profileDoc.exists()) {
      return null;
    }

    return profileDoc.data() as VIPProfile;
  } catch (error) {
    console.error('Error fetching VIP profile:', error);
    throw error;
  }
}

/**
 * Get VIP score breakdown
 */
export async function getVIPScoreComponents(userId: string): Promise<VIPScoreComponents | null> {
  try {
    const scoreDoc = await getDoc(doc(db, 'vipScoreComponents', userId));
    
    if (!scoreDoc.exists()) {
      return null;
    }

    return scoreDoc.data() as VIPScoreComponents;
  } catch (error) {
    console.error('Error fetching VIP score components:', error);
    throw error;
  }
}

/**
 * Subscribe to VIP profile changes (real-time)
 */
export function subscribeToVIPProfile(
  userId: string,
  onUpdate: (profile: VIPProfile | null) => void
): Unsubscribe {
  const profileRef = doc(db, 'vipProfiles', userId);
  
  return onSnapshot(
    profileRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data() as VIPProfile);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.error('Error subscribing to VIP profile:', error);
      onUpdate(null);
    }
  );
}

// ============================================================================
// VIP SETTINGS
// ============================================================================

/**
 * Get VIP settings
 */
export async function getVIPSettings(userId: string): Promise<VIPSettings | null> {
  try {
    const settingsDoc = await getDoc(doc(db, 'vipSettings', userId));
    
    if (!settingsDoc.exists()) {
      return null;
    }

    return settingsDoc.data() as VIPSettings;
  } catch (error) {
    console.error('Error fetching VIP settings:', error);
    throw error;
  }
}

/**
 * Update VIP badge visibility
 */
export async function updateVIPBadgeVisibility(
  userId: string,
  showToCreators: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'vipSettings', userId), {
      showBadgeToCreators: showToCreators,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating VIP badge visibility:', error);
    throw error;
  }
}

/**
 * Update VIP privacy mode
 */
export async function updateVIPPrivacyMode(
  userId: string,
  privacyMode: 'none' | 'creators' | 'everyone'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'vipSettings', userId), {
      privacyMode,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating VIP privacy mode:', error);
    throw error;
  }
}

/**
 * Toggle level-up notifications
 */
export async function toggleLevelUpNotifications(
  userId: string,
  enabled: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'vipSettings', userId), {
      notifyOnLevelUp: enabled,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error toggling level-up notifications:', error);
    throw error;
  }
}

// ============================================================================
// VIP NOTIFICATIONS
// ============================================================================

/**
 * Get unread VIP notifications
 */
export async function getUnreadVIPNotifications(userId: string): Promise<VIPNotification[]> {
  try {
    const notificationsQuery = query(
      collection(db, 'vipNotifications'),
      where('userId', '==', userId),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const snapshot = await getDocs(notificationsQuery);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as VIPNotification[];
  } catch (error) {
    console.error('Error fetching VIP notifications:', error);
    throw error;
  }
}

/**
 * Mark notification as read
 */
export async function markVIPNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'vipNotifications', notificationId), {
      read: true,
      readAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

/**
 * Subscribe to VIP notifications (real-time)
 */
export function subscribeToVIPNotifications(
  userId: string,
  onUpdate: (notifications: VIPNotification[]) => void
): Unsubscribe {
  const notificationsQuery = query(
    collection(db, 'vipNotifications'),
    where('userId', '==', userId),
    where('read', '==', false),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  
  return onSnapshot(
    notificationsQuery,
    (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as VIPNotification[];
      onUpdate(notifications);
    },
    (error) => {
      console.error('Error subscribing to VIP notifications:', error);
      onUpdate([]);
    }
  );
}

// ============================================================================
// VIP PRIVILEGES
// ============================================================================

/**
 * Get available privileges for VIP level
 */
export function getVIPPrivileges(level: VIPLevel): VIPPrivilege[] {
  return VIP_PRIVILEGES[level] || [];
}

/**
 * Check if user has specific privilege
 */
export function hasVIPPrivilege(
  userLevel: VIPLevel,
  requiredLevel: VIPLevel
): boolean {
  const levels: VIPLevel[] = ['none', 'bronze', 'silver', 'gold', 'royal'];
  return levels.indexOf(userLevel) >= levels.indexOf(requiredLevel);
}

/**
 * Get VIP badge display info
 */
export function getVIPBadgeInfo(level: VIPLevel): {
  icon: string;
  color: string;
  label: string;
} {
  const badges = {
    none: { icon: '', color: '', label: '' },
    bronze: { icon: '🥉', color: '#CD7F32', label: 'VIP Bronze' },
    silver: { icon: '🥈', color: '#C0C0C0', label: 'VIP Silver' },
    gold: { icon: '🥇', color: '#FFD700', label: 'VIP Gold' },
    royal: { icon: '👑', color: '#9B59B6', label: 'VIP Royal' },
  };

  return badges[level];
}

/**
 * Get queue priority boost for level
 */
export function getQueuePriorityBoost(level: VIPLevel): number {
  const boosts = {
    none: 0,
    bronze: 0,
    silver: 0.5,
    gold: 1,
    royal: 2,
  };

  return boosts[level];
}

// ============================================================================
// VIP STATUS CHECKS
// ============================================================================

/**
 * Check if user qualifies for VIP
 */
export async function checkVIPQualification(userId: string): Promise<{
  qualifies: boolean;
  currentScore: number;
  nextLevel: VIPLevel | null;
  pointsNeeded: number;
}> {
  try {
    const profile = await getVIPProfile(userId);
    const scoreComponents = await getVIPScoreComponents(userId);

    if (!profile || !scoreComponents) {
      return {
        qualifies: false,
        currentScore: 0,
        nextLevel: 'bronze',
        pointsNeeded: 20,
      };
    }

    const levels: VIPLevel[] = ['none', 'bronze', 'silver', 'gold', 'royal'];
    const currentLevelIndex = levels.indexOf(profile.vipLevel);
    const nextLevel = currentLevelIndex < levels.length - 1 
      ? levels[currentLevelIndex + 1] 
      : null;

    const levelScores = {
      none: 0,
      bronze: 20,
      silver: 40,
      gold: 60,
      royal: 80,
    };

    const pointsNeeded = nextLevel 
      ? levelScores[nextLevel] - scoreComponents.totalScore 
      : 0;

    return {
      qualifies: profile.vipLevel !== 'none',
      currentScore: scoreComponents.totalScore,
      nextLevel,
      pointsNeeded: Math.max(0, pointsNeeded),
    };
  } catch (error) {
    console.error('Error checking VIP qualification:', error);
    throw error;
  }
}

/**
 * Get progress to next VIP level
 */
export function getVIPLevelProgress(
  currentScore: number,
  currentLevel: VIPLevel
): {
  percentage: number;
  currentLevel: VIPLevel;
  nextLevel: VIPLevel | null;
  currentLevelScore: number;
  nextLevelScore: number | null;
} {
  const levelScores = {
    none: 0,
    bronze: 20,
    silver: 40,
    gold: 60,
    royal: 80,
  };

  const levels: VIPLevel[] = ['none', 'bronze', 'silver', 'gold', 'royal'];
  const currentLevelIndex = levels.indexOf(currentLevel);
  const nextLevel = currentLevelIndex < levels.length - 1 
    ? levels[currentLevelIndex + 1] 
    : null;

  const currentLevelScore = levelScores[currentLevel];
  const nextLevelScore = nextLevel ? levelScores[nextLevel] : null;

  let percentage = 0;
  if (nextLevelScore) {
    const range = nextLevelScore - currentLevelScore;
    const progress = currentScore - currentLevelScore;
    percentage = Math.min(100, Math.max(0, (progress / range) * 100));
  } else {
    percentage = 100; // Max level reached
  }

  return {
    percentage: Math.round(percentage),
    currentLevel,
    nextLevel,
    currentLevelScore,
    nextLevelScore,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format VIP level for display
 */
export function formatVIPLevel(level: VIPLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * Check if user should see VIP badge on profile
 */
export async function shouldShowVIPBadge(
  userId: string,
  viewerIsCreator: boolean
): Promise<boolean> {
  try {
    const settings = await getVIPSettings(userId);
    
    if (!settings) return false;

    if (settings.privacyMode === 'none') return false;
    if (settings.privacyMode === 'everyone') return true;
    if (settings.privacyMode === 'creators' && viewerIsCreator) return true;

    return false;
  } catch (error) {
    console.error('Error checking VIP badge visibility:', error);
    return false;
  }
}

/**
 * Get VIP status summary
 */
export async function getVIPStatusSummary(userId: string): Promise<{
  level: VIPLevel;
  score: number;
  privileges: VIPPrivilege[];
  progress: number;
  nextLevel: VIPLevel | null;
  badge: { icon: string; color: string; label: string };
} | null> {
  try {
    const profile = await getVIPProfile(userId);
    
    if (!profile) return null;

    const privileges = getVIPPrivileges(profile.vipLevel);
    const badge = getVIPBadgeInfo(profile.vipLevel);
    const progressInfo = getVIPLevelProgress(profile.vipScore, profile.vipLevel);

    return {
      level: profile.vipLevel,
      score: profile.vipScore,
      privileges,
      progress: progressInfo.percentage,
      nextLevel: progressInfo.nextLevel,
      badge,
    };
  } catch (error) {
    console.error('Error getting VIP status summary:', error);
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getVIPProfile,
  getVIPScoreComponents,
  subscribeToVIPProfile,
  getVIPSettings,
  updateVIPBadgeVisibility,
  updateVIPPrivacyMode,
  toggleLevelUpNotifications,
  getUnreadVIPNotifications,
  markVIPNotificationRead,
  subscribeToVIPNotifications,
  getVIPPrivileges,
  hasVIPPrivilege,
  getVIPBadgeInfo,
  getQueuePriorityBoost,
  checkVIPQualification,
  getVIPLevelProgress,
  formatVIPLevel,
  shouldShowVIPBadge,
  getVIPStatusSummary,
};