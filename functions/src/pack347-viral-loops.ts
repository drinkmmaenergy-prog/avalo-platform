/**
 * PACK 347 — Growth Engine: Creator Viral Loops
 * 
 * Every creator profile generates trackable invite links for:
 * - Private chat
 * - Voice/video call
 * - Calendar booking
 * - Event invitation
 * - AI companion interaction
 * 
 * Format: avalo.app/invite/{creatorId}/{entryType}
 * 
 * Tracks conversion analytics and CPA calculation.
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, generateId } from './init';

// ============================================================================
// TYPES
// ============================================================================

export type EntryType = 
  | 'chat' 
  | 'voice' 
  | 'video' 
  | 'calendar' 
  | 'event' 
  | 'ai_companion';

export type ConversionStatus =
  | 'opened'           // Link opened
  | 'viewed_profile'   // Viewed creator profile
  | 'registered'       // User registered
  | 'converted';       // Completed paid action

export interface ViralInvite {
  inviteId: string;
  creatorId: string;
  entryType: EntryType;
  status: ConversionStatus;
  openedAt: FirebaseFirestore.Timestamp;
  viewedAt?: FirebaseFirestore.Timestamp;
  registeredAt?: FirebaseFirestore.Timestamp;
  convertedAt?: FirebaseFirestore.Timestamp;
  visitorUserId?: string; // Set when user registers
  metadata?: {
    source?: string;
    referrer?: string;
    deviceInfo?: any;
    geoLocation?: string;
  };
}

export interface ViralStats {
  creatorId: string;
  totalOpens: number;
  profileViews: number;
  registrations: number;
  conversions: number;
  conversionRate: number; // conversions / totalOpens
  cpa: number; // cost per acquisition (calculated separately)
  byEntryType: {
    [key in EntryType]?: {
      opens: number;
      conversions: number;
      conversionRate: number;
    };
  };
  updatedAt: FirebaseFirestore.Timestamp;
}

// ============================================================================
// INVITE LINK GENERATION
// ============================================================================

/**
 * Generate viral invite link for creator
 * Each creator can have multiple active invite links per entry type
 */
export async function generateViralInviteLink(data: {
  creatorId: string;
  entryType: EntryType;
  campaignName?: string;
  metadata?: any;
}): Promise<{ success: boolean; inviteLink: string; inviteId: string }> {
  const { creatorId, entryType, campaignName, metadata } = data;
  
  // Validate creator exists
  const creatorSnap = await db.collection('users').doc(creatorId).get();
  if (!creatorSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Creator not found');
  }
  
  // Validate entry type
  const validEntryTypes: EntryType[] = ['chat', 'voice', 'video', 'calendar', 'event', 'ai_companion'];
  if (!validEntryTypes.includes(entryType)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Invalid entry type. Must be one of: ${validEntryTypes.join(', ')}`
    );
  }
  
  // Generate unique invite ID
  const inviteId = generateId();
  
  // Create invite document
  await db.collection('viral_invites').doc(inviteId).set({
    inviteId,
    creatorId,
    entryType,
    status: 'opened' as ConversionStatus,
    openedAt: serverTimestamp(),
    metadata: {
      campaignName: campaignName || 'default',
      ...metadata
    }
  } as ViralInvite);
  
  const inviteLink = `avalo.app/invite/${creatorId}/${entryType}?ref=${inviteId}`;
  
  return {
    success: true,
    inviteLink,
    inviteId
  };
}

// ============================================================================
// TRACKING FUNCTIONS
// ============================================================================

/**
 * Track invite link open
 * Called when someone clicks/opens the viral invite link
 */
export async function trackViralInviteOpen(data: {
  inviteId: string;
  creatorId: string;
  entryType: EntryType;
  metadata?: {
    source?: string;
    referrer?: string;
    deviceInfo?: any;
    geoLocation?: string;
  };
}): Promise<{ success: boolean; inviteId: string }> {
  const { inviteId, creatorId, entryType, metadata } = data;
  
  // Check if invite exists
  let inviteDoc = db.collection('viral_invites').doc(inviteId);
  let inviteSnap = await inviteDoc.get();
  
  if (!inviteSnap.exists) {
    // Create new invite tracking if not exists
    // This handles cases where links are generated client-side
    await inviteDoc.set({
      inviteId,
      creatorId,
      entryType,
      status: 'opened',
      openedAt: serverTimestamp(),
      metadata: metadata || {}
    } as ViralInvite);
  }
  
  // Update creator viral stats (async, non-blocking)
  updateCreatorViralStats(creatorId, entryType, 'opened').catch(err =>
    console.error('[ViralLoop] Failed to update stats:', err)
  );
  
  return { success: true, inviteId };
}

/**
 * Track profile view from viral invite
 */
export async function trackViralProfileView(data: {
  inviteId: string;
  creatorId: string;
  visitorUserId?: string;
}): Promise<{ success: boolean }> {
  const { inviteId, creatorId, visitorUserId } = data;
  
  const inviteDoc = db.collection('viral_invites').doc(inviteId);
  const inviteSnap = await inviteDoc.get();
  
  if (!inviteSnap.exists) {
    console.warn('[ViralLoop] Invite not found:', inviteId);
    return { success: false };
  }
  
  const invite = inviteSnap.data() as ViralInvite;
  
  // Update to viewed_profile status if current status is opened
  if (invite.status === 'opened') {
    await inviteDoc.update({
      status: 'viewed_profile',
      viewedAt: serverTimestamp(),
      visitorUserId: visitorUserId || null
    });
    
    // Update creator viral stats (async, non-blocking)
    updateCreatorViralStats(creatorId, invite.entryType, 'viewed_profile').catch(err =>
      console.error('[ViralLoop] Failed to update stats:', err)
    );
  }
  
  return { success: true };
}

/**
 * Track registration from viral invite
 */
export async function trackViralRegistration(data: {
  inviteId: string;
  visitorUserId: string;
}): Promise<{ success: boolean }> {
  const { inviteId, visitorUserId } = data;
  
  const inviteDoc = db.collection('viral_invites').doc(inviteId);
  const inviteSnap = await inviteDoc.get();
  
  if (!inviteSnap.exists) {
    console.warn('[ViralLoop] Invite not found:', inviteId);
    return { success: false };
  }
  
  const invite = inviteSnap.data() as ViralInvite;
  
  // Update to registered status if current status is viewed_profile
  if (invite.status === 'viewed_profile') {
    await inviteDoc.update({
      status: 'registered',
      registeredAt: serverTimestamp(),
      visitorUserId
    });
    
    // Update creator viral stats (async, non-blocking)
    updateCreatorViralStats(invite.creatorId, invite.entryType, 'registered').catch(err =>
      console.error('[ViralLoop] Failed to update stats:', err)
    );
  }
  
  return { success: true };
}

/**
 * Track conversion from viral invite
 * Called when user completes a paid action (chat, call, booking, etc.)
 */
export async function trackViralConversion(data: {
  inviteId: string;
  visitorUserId: string;
  conversionValue: number; // tokens spent
}): Promise<{ success: boolean }> {
  const { inviteId, visitorUserId, conversionValue } = data;
  
  const inviteDoc = db.collection('viral_invites').doc(inviteId);
  const inviteSnap = await inviteDoc.get();
  
  if (!inviteSnap.exists) {
    console.warn('[ViralLoop] Invite not found:', inviteId);
    return { success: false };
  }
  
  const invite = inviteSnap.data() as ViralInvite;
  
  // Update to converted status
  await inviteDoc.update({
    status: 'converted',
    convertedAt: serverTimestamp(),
    visitorUserId,
    'metadata.conversionValue': conversionValue
  });
  
  // Update creator viral stats (async, non-blocking)
  updateCreatorViralStats(invite.creatorId, invite.entryType, 'converted').catch(err =>
    console.error('[ViralLoop] Failed to update stats:', err)
  );
  
  // Update creator promotion score (non-blocking)
  updateCreatorPromotionScore(invite.creatorId).catch(err =>
    console.error('[ViralLoop] Failed to update promotion score:', err)
  );
  
  return { success: true };
}

// ============================================================================
// ANALYTICS HELPERS
// ============================================================================

/**
 * Update creator viral statistics
 */
async function updateCreatorViralStats(
  creatorId: string,
  entryType: EntryType,
  event: 'opened' | 'viewed_profile' | 'registered' | 'converted'
): Promise<void> {
  const statsRef = db.collection('viral_stats').doc(creatorId);
  
  await db.runTransaction(async (transaction) => {
    const statsSnap = await transaction.get(statsRef);
    
    if (!statsSnap.exists) {
      // Create new stats document
      const initialStats: ViralStats = {
        creatorId,
        totalOpens: event === 'opened' ? 1 : 0,
        profileViews: event === 'viewed_profile' ? 1 : 0,
        registrations: event === 'registered' ? 1 : 0,
        conversions: event === 'converted' ? 1 : 0,
        conversionRate: 0,
        cpa: 0,
        byEntryType: {
          [entryType]: {
            opens: event === 'opened' ? 1 : 0,
            conversions: event === 'converted' ? 1 : 0,
            conversionRate: 0
          }
        },
        updatedAt: serverTimestamp() as any
      };
      transaction.set(statsRef, initialStats);
    } else {
      // Update existing stats
      const stats = statsSnap.data() as ViralStats;
      const updates: any = {
        updatedAt: serverTimestamp()
      };
      
      if (event === 'opened') {
        updates.totalOpens = increment(1);
        updates[`byEntryType.${entryType}.opens`] = increment(1);
      } else if (event === 'viewed_profile') {
        updates.profileViews = increment(1);
      } else if (event === 'registered') {
        updates.registrations = increment(1);
      } else if (event === 'converted') {
        updates.conversions = increment(1);
        updates[`byEntryType.${entryType}.conversions`] = increment(1);
      }
      
      transaction.update(statsRef, updates);
    }
  });
  
  // Recalculate conversion rate (async)
  recalculateConversionRate(creatorId).catch(() => {});
}

/**
 * Recalculate conversion rate for creator
 */
async function recalculateConversionRate(creatorId: string): Promise<void> {
  const statsRef = db.collection('viral_stats').doc(creatorId);
  const statsSnap = await statsRef.get();
  
  if (!statsSnap.exists) return;
  
  const stats = statsSnap.data() as ViralStats;
  const conversionRate = stats.totalOpens > 0 
    ? (stats.conversions / stats.totalOpens) * 100 
    : 0;
  
  // Recalculate per entry type
  const byEntryType = stats.byEntryType || {};
  for (const [type, typeStats] of Object.entries(byEntryType)) {
    if (typeStats && typeStats.opens > 0) {
      typeStats.conversionRate = (typeStats.conversions / typeStats.opens) * 100;
    }
  }
  
  await statsRef.update({
    conversionRate,
    byEntryType,
    updatedAt: serverTimestamp()
  });
}

/**
 * Update creator promotion score based on viral performance
 * (Used by pack347-promotion-algorithm.ts)
 */
async function updateCreatorPromotionScore(creatorId: string): Promise<void> {
  try {
    const { calculatePromotionScore } = await import('./pack347-promotion-algorithm');
    await calculatePromotionScore({ creatorId });
  } catch (error) {
    console.warn('[ViralLoop] Failed to update promotion score:', error);
  }
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get creator's viral statistics
 */
export async function getCreatorViralStats(data: {
  creatorId: string;
}): Promise<ViralStats | null> {
  const { creatorId } = data;
  
  const statsSnap = await db.collection('viral_stats').doc(creatorId).get();
  
  if (!statsSnap.exists) {
    return null;
  }
  
  return statsSnap.data() as ViralStats;
}

/**
 * Get creator's viral invite history
 */
export async function getCreatorViralInvites(data: {
  creatorId: string;
  limit?: number;
  status?: ConversionStatus;
}): Promise<ViralInvite[]> {
  const { creatorId, limit = 100, status } = data;
  
  let query = db.collection('viral_invites')
    .where('creatorId', '==', creatorId)
    .orderBy('openedAt', 'desc')
    .limit(limit);
  
  if (status) {
    query = query.where('status', '==', status) as any;
  }
  
  const snapshot = await query.get();
  
  return snapshot.docs.map(doc => doc.data() as ViralInvite);
}

/**
 * Get top performing entry types for creator
 */
export async function getTopPerformingEntryTypes(data: {
  creatorId: string;
}): Promise<{ entryType: EntryType; conversionRate: number }[]> {
  const { creatorId } = data;
  
  const stats = await getCreatorViralStats({ creatorId });
  
  if (!stats || !stats.byEntryType) {
    return [];
  }
  
  return Object.entries(stats.byEntryType)
    .map(([type, typeStats]) => ({
      entryType: type as EntryType,
      conversionRate: typeStats?.conversionRate || 0
    }))
    .sort((a, b) => b.conversionRate - a.conversionRate);
}

// ============================================================================
// ADMIN ANALYTICS
// ============================================================================

/**
 * Calculate CPA (Cost Per Acquisition) for creator
 * Based on boost spending vs conversions
 */
export async function calculateCreatorCPA(data: {
  creatorId: string;
  timeRangeHours?: number;
}): Promise<{ cpa: number; totalSpent: number; totalConversions: number }> {
  const { creatorId, timeRangeHours = 720 } = data; // Default 30 days
  
  const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
  
  // Get total boost spending
  const boostQuery = await db.collection('boosts')
    .where('userId', '==', creatorId)
    .where('createdAt', '>=', cutoffTime)
    .get();
  
  const totalSpent = boostQuery.docs.reduce((sum, doc) => {
    return sum + (doc.data().tokensCharged || 0);
  }, 0);
  
  // Get total conversions
  const conversionQuery = await db.collection('viral_invites')
    .where('creatorId', '==', creatorId)
    .where('status', '==', 'converted')
    .where('convertedAt', '>=', cutoffTime)
    .get();
  
  const totalConversions = conversionQuery.size;
  
  const cpa = totalConversions > 0 ? totalSpent / totalConversions : 0;
  
  // Update stats document
  await db.collection('viral_stats').doc(creatorId).set({
    cpa,
    updatedAt: serverTimestamp()
  }, { merge: true });
  
  return { cpa, totalSpent, totalConversions };
}

/**
 * Get platform-wide viral performance metrics
 * Admin only
 */
export async function getPlatformViralMetrics(data: {
  timeRangeHours?: number;
}): Promise<{
  totalOpens: number;
  totalConversions: number;
  avgConversionRate: number;
  topCreators: Array<{ creatorId: string; conversions: number }>;
}> {
  const { timeRangeHours = 168 } = data; // Default 7 days
  
  const cutoffTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
  
  // Get all viral invites in timeframe
  const invitesQuery = await db.collection('viral_invites')
    .where('openedAt', '>=', cutoffTime)
    .get();
  
  const totalOpens = invitesQuery.size;
  const conversions = invitesQuery.docs.filter(doc => 
    doc.data().status === 'converted'
  );
  const totalConversions = conversions.length;
  
  const avgConversionRate = totalOpens > 0 
    ? (totalConversions / totalOpens) * 100 
    : 0;
  
  // Calculate top creators
  const creatorConversions = new Map<string, number>();
  conversions.forEach(doc => {
    const creatorId = doc.data().creatorId;
    creatorConversions.set(creatorId, (creatorConversions.get(creatorId) || 0) + 1);
  });
  
  const topCreators = Array.from(creatorConversions.entries())
    .map(([creatorId, conversions]) => ({ creatorId, conversions }))
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 10);
  
  return {
    totalOpens,
    totalConversions,
    avgConversionRate,
    topCreators
  };
}

/**
 * PACK 347: Creator Viral Loops
 * 
 * - Trackable invite links per creator/entry type
 * - Conversion funnel tracking (open → view → register → convert)
 * - CPA calculation for marketing analytics
 * - Entry type performance analysis
 * - Integration with promotion algorithm
 */
