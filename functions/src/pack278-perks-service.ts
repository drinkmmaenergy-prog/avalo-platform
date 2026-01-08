/**
 * PACK 278 — Subscription Perks Service
 * 
 * Implements subscription perks like passport, incognito, priority, etc.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getUserSubscription } from './pack278-subscription-service';

const db = getFirestore();

/**
 * Toggle Passport feature (location change)
 * VIP and Royal only
 */
export async function togglePassport(
  userId: string,
  enabled: boolean,
  latitude?: number,
  longitude?: number,
  locationName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription.perks.passport) {
      return {
        success: false,
        error: 'Passport feature requires VIP or Royal subscription',
      };
    }
    
    const updateData: any = {
      'privacy.passport.enabled': enabled,
      updatedAt: FieldValue.serverTimestamp(),
    };
    
    if (enabled && latitude !== undefined && longitude !== undefined) {
      updateData['privacy.passport.location'] = {
        latitude,
        longitude,
        name: locationName || 'Custom Location',
      };
      updateData['privacy.passport.activatedAt'] = FieldValue.serverTimestamp();
    }
    
    await db.collection('users').doc(userId).update(updateData);
    
    return { success: true };
  } catch (error) {
    console.error('Toggle passport error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle passport',
    };
  }
}

/**
 * Toggle Incognito mode (hide from discovery)
 * VIP and Royal only
 */
export async function toggleIncognito(
  userId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription.perks.incognito) {
      return {
        success: false,
        error: 'Incognito mode requires VIP or Royal subscription',
      };
    }
    
    await db.collection('users').doc(userId).update({
      'privacy.incognito.enabled': enabled,
      'privacy.incognito.activatedAt': enabled ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    return { success: true };
  } catch (error) {
    console.error('Toggle incognito error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle incognito',
    };
  }
}

/**
 * Apply priority ranking to discovery results
 * Returns modified user list with Royal > VIP > Standard ordering
 */
export async function applyDiscoveryPriority(
  userIds: string[]
): Promise<string[]> {
  if (userIds.length === 0) return [];
  
  // Fetch subscription data for all users
  const subscriptions = await Promise.all(
    userIds.map(async (userId) => {
      const sub = await getUserSubscription(userId);
      return {
        userId,
        tier: sub.tier,
        priority: sub.tier === 'royal' ? 100 : sub.tier === 'vip' ? 50 : 0,
      };
    })
  );
  
  // Sort by priority (highest first), then maintain original order
  subscriptions.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return userIds.indexOf(a.userId) - userIds.indexOf(b.userId);
  });
  
  return subscriptions.map(s => s.userId);
}

/**
 * Check if user has priority in swipe queue
 * Royal only feature
 */
export async function hasPrioritySwipeQueue(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return Boolean(subscription.perks.prioritySwipeQueue);
}

/**
 * Check if user has unlimited discovery
 * VIP and Royal feature
 */
export async function hasUnlimitedDiscovery(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return subscription.perks.unlimitedDiscovery;
}

/**
 * Get daily boost count for user
 * VIP gets 1, Royal gets 2, Standard gets 0
 */
export async function getDailyBoostCount(userId: string): Promise<number> {
  const subscription = await getUserSubscription(userId);
  
  if (subscription.perks.dailyBoosts) {
    return subscription.perks.dailyBoosts;
  }
  
  if (subscription.perks.swipeBoostDaily) {
    return subscription.perks.swipeBoostDaily;
  }
  
  return 0;
}

/**
 * Check if user has used their daily boosts
 */
export async function hasAvailableBoosts(userId: string): Promise<{ available: boolean; used: number; total: number }> {
  const totalBoosts = await getDailyBoostCount(userId);
  
  if (totalBoosts === 0) {
    return { available: false, used: 0, total: 0 };
  }
  
  // Check boost usage today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const boostSnapshot = await db.collection('boosts')
    .where('userId', '==', userId)
    .where('createdAt', '>=', today)
    .get();
  
  const usedBoosts = boostSnapshot.size;
  
  return {
    available: usedBoosts < totalBoosts,
    used: usedBoosts,
    total: totalBoosts,
  };
}

/**
 * Activate a boost for user
 */
export async function activateBoost(
  userId: string
): Promise<{ success: boolean; expiresAt?: Date; error?: string }> {
  try {
    const { available, used, total } = await hasAvailableBoosts(userId);
    
    if (!available) {
      return {
        success: false,
        error: `Daily boost limit reached (${used}/${total})`,
      };
    }
    
    // Boost lasts 30 minutes
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    
    await db.collection('boosts').add({
      userId,
      type: 'premium_subscription',
      expiresAt: expiresAt.toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    });
    
    // Update user profile
    await db.collection('users').doc(userId).update({
      'boosts.activeUntil': expiresAt.toISOString(),
      'boosts.lastActivated': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    return {
      success: true,
      expiresAt,
    };
  } catch (error) {
    console.error('Activate boost error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to activate boost',
    };
  }
}

/**
 * Check if user has active boost
 */
export async function hasActiveBoost(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (!userData?.boosts?.activeUntil) {
    return false;
  }
  
  const expiresAt = new Date(userData.boosts.activeUntil);
  return expiresAt > new Date();
}

/**
 * Check if user has early access to features
 * Royal only
 */
export async function hasEarlyAccess(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return Boolean(subscription.perks.earlyAccessFeatures);
}

/**
 * Filter discovery results based on incognito mode
 * Removes users with incognito enabled who haven't swiped on the viewer
 */
export async function filterIncognitoUsers(
  viewerId: string,
  userIds: string[]
): Promise<string[]> {
  if (userIds.length === 0) return [];
  
  const filtered: string[] = [];
  
  for (const userId of userIds) {
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    // Check if user has incognito enabled
    if (userData?.privacy?.incognito?.enabled) {
      // Check if they've swiped on the viewer
      const swipeSnapshot = await db.collection('swipes')
        .where('swiperId', '==', userId)
        .where('swipedUserId', '==', viewerId)
        .limit(1)
        .get();
      
      // Only show if they've swiped on the viewer
      if (!swipeSnapshot.empty) {
        filtered.push(userId);
      }
    } else {
      // Not in incognito mode - show normally
      filtered.push(userId);
    }
  }
  
  return filtered;
}

/**
 * Get passport location for user
 */
export async function getPassportLocation(
  userId: string
): Promise<{ latitude: number; longitude: number; name: string } | null> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (!userData?.privacy?.passport?.enabled || !userData?.privacy?.passport?.location) {
    return null;
  }
  
  return userData.privacy.passport.location;
}

/**
 * Check discovery view limit for standard users
 * VIP and Royal have unlimited views
 */
export async function checkDiscoveryLimit(
  userId: string
): Promise<{ allowed: boolean; viewsRemaining: number; unlimited: boolean }> {
  const subscription = await getUserSubscription(userId);
  
  if (subscription.perks.unlimitedDiscovery) {
    return {
      allowed: true,
      viewsRemaining: -1,
      unlimited: true,
    };
  }
  
  // Standard users have 50 views per day
  const DAILY_LIMIT = 50;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const viewsSnapshot = await db.collection('discoveryViews')
    .where('userId', '==', userId)
    .where('viewedAt', '>=', today)
    .get();
  
  const viewsToday = viewsSnapshot.size;
  const remaining = Math.max(0, DAILY_LIMIT - viewsToday);
  
  return {
    allowed: remaining > 0,
    viewsRemaining: remaining,
    unlimited: false,
  };
}

/**
 * Record a discovery view (for tracking limits)
 */
export async function recordDiscoveryView(
  viewerId: string,
  viewedUserId: string
): Promise<void> {
  await db.collection('discoveryViews').add({
    userId: viewerId,
    viewedUserId,
    viewedAt: FieldValue.serverTimestamp(),
  });
}