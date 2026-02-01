/**
 * ============================================================================
 * PACK 263 — CREATOR MISSIONS INTEGRATION EXAMPLES
 * ============================================================================
 * 
 * This file provides integration examples showing how to call mission tracking
 * from various systems (Chat, Live, Events, Fan Club, PPV).
 * 
 * IMPORTANT: All mission progress must be triggered by REVENUE-LINKED activities
 * to prevent exploitation and maintain integrity.
 */

import { db } from './init';
import { recordMissionProgressInternal } from './pack263-creator-missions';
import { auth, functions, onCall, timestamp, onDocumentUpdated } from './runtime';

// ============================================================================
// CHAT MONETIZATION INTEGRATION (PACK 261)
// ============================================================================

/**
 * Example: Record mission progress when paid chat messages are sent
 * 
 * Call this from your chat billing function after tokens are deducted
 */
export async function integrateWithChatMonetization(
  creatorId: string,
  messageCount: number,
  tokensEarned: number,
  payerId: string
): Promise<void> {
  try {
    // Track "reply to paid messages" mission
    await recordMissionProgressInternal(
      creatorId,
      'reply_messages',
      messageCount,
      {
        source: 'paid_chat',
        tokensEarned,
        payerId,
      }
    );

    // Track "earn tokens" mission (weekly)
    await recordMissionProgressInternal(
      creatorId,
      'earn_tokens',
      tokensEarned,
      {
        source: 'chat',
        payerId,
      }
    );

    console.log(`✅ Chat mission progress recorded for creator ${creatorId}`);
  } catch (error) {
    console.error('Error integrating chat with missions:', error);
    // Don't throw - mission tracking should not block chat functionality
  }
}

/**
 * Example: Track first paid chat initiated from Discover
 */
export async function trackPaidChatFromDiscover(
  creatorId: string,
  conversationId: string
): Promise<void> {
  try {
    await recordMissionProgressInternal(
      creatorId,
      'start_paid_chat',
      1,
      {
        source: 'discover',
        conversationId,
      }
    );

    console.log(`✅ Paid chat from Discover tracked for ${creatorId}`);
  } catch (error) {
    console.error('Error tracking paid chat from discover:', error);
  }
}

/**
 * Example: Track dormant supporter reactivation
 */
export async function trackDormantSupporterReactivation(
  creatorId: string,
  supporterId: string,
  lastActivityDate: Date
): Promise<void> {
  try {
    const daysSinceLastActivity = Math.floor(
      (Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Only count if supporter was dormant for 7+ days
    if (daysSinceLastActivity >= 7) {
      await recordMissionProgressInternal(
        creatorId,
        'reactivate_supporter',
        1,
        {
          supporterId,
          daysDormant: daysSinceLastActivity,
        }
      );

      console.log(`✅ Dormant supporter reactivation tracked for ${creatorId}`);
    }
  } catch (error) {
    console.error('Error tracking dormant supporter reactivation:', error);
  }
}

// ============================================================================
// LIVE BROADCAST INTEGRATION (PACK 260)
// ============================================================================

/**
 * Example: Record mission progress when Live session ends
 * 
 * Call this from your Live session end handler
 */
export async function integrateWithLiveBroadcast(
  creatorId: string,
  sessionData: {
    durationMinutes: number;
    averageViewers: number;
    peakViewers: number;
    giftsReceived: number;
    tokensEarned: number;
  }
): Promise<void> {
  try {
    // Track "host live" mission (requires minimum 2 viewers)
    if (sessionData.averageViewers >= 2) {
      await recordMissionProgressInternal(
        creatorId,
        'host_live',
        sessionData.durationMinutes,
        {
          viewerCount: sessionData.averageViewers,
          peakViewers: sessionData.peakViewers,
          giftsReceived: sessionData.giftsReceived,
        }
      );
    }

    // Track tokens earned from gifts
    if (sessionData.tokensEarned > 0) {
      await recordMissionProgressInternal(
        creatorId,
        'earn_tokens',
        sessionData.tokensEarned,
        {
          source: 'live_gifts',
          sessionDuration: sessionData.durationMinutes,
        }
      );
    }

    console.log(`✅ Live broadcast mission progress recorded for ${creatorId}`);
  } catch (error) {
    console.error('Error integrating live broadcast with missions:', error);
  }
}

/**
 * Example: Track PPV Live ticket sales
 */
export async function trackPPVTicketSale(
  creatorId: string,
  buyerId: string,
  ticketPrice: number,
  liveId: string
): Promise<void> {
  try {
    await recordMissionProgressInternal(
      creatorId,
      'sell_ppv_tickets',
      1,
      {
        buyerId,
        ticketPrice,
        liveId,
      }
    );

    console.log(`✅ PPV ticket sale tracked for ${creatorId}`);
  } catch (error) {
    console.error('Error tracking PPV ticket sale:', error);
  }
}

// ============================================================================
// EVENTS INTEGRATION (PACK 182)
// ============================================================================

/**
 * Example: Record mission progress when event ticket is sold
 * 
 * IMPORTANT: Only count tickets with verified check-ins (min 5) to prevent exploitation
 */
export async function integrateWithEvents(
  creatorId: string,
  eventId: string,
  buyerId: string,
  ticketPrice: number
): Promise<void> {
  try {
    // Get event check-in count
    const eventDoc = await db.collection('calendar_events').doc(eventId).get();
    const checkinCount = eventDoc.data()?.checkinCount || 0;

    // Only count if event has legitimate attendance
    if (checkinCount >= 5) {
      await recordMissionProgressInternal(
        creatorId,
        'sell_event_tickets',
        1,
        {
          eventId,
          buyerId,
          ticketPrice,
          checkinCount,
        }
      );

      console.log(`✅ Event ticket sale tracked for ${creatorId}`);
    }
  } catch (error) {
    console.error('Error integrating events with missions:', error);
  }
}

// ============================================================================
// FAN CLUB INTEGRATION (PACK 259)
// ============================================================================

/**
 * Example: Record mission progress when Fan Club subscription is purchased
 */
export async function integrateWithFanClub(
  creatorId: string,
  subscriberId: string,
  subscriptionTier: string,
  subscriptionPrice: number
): Promise<void> {
  try {
    await recordMissionProgressInternal(
      creatorId,
      'fan_club_subs',
      1,
      {
        subscriberId,
        tier: subscriptionTier,
        price: subscriptionPrice,
      }
    );

    console.log(`✅ Fan Club subscription tracked for ${creatorId}`);
  } catch (error) {
    console.error('Error integrating fan club with missions:', error);
  }
}

// ============================================================================
// STORY/CONTENT POSTING INTEGRATION
// ============================================================================

/**
 * Example: Record mission progress when story is posted
 */
export async function trackStoryPost(
  creatorId: string,
  storyId: string,
  mediaType: 'photo' | 'video'
): Promise<void> {
  try {
    await recordMissionProgressInternal(
      creatorId,
      'post_story',
      1,
      {
        storyId,
        mediaType,
        timestamp: new Date().toISOString(),
      }
    );

    console.log(`✅ Story post tracked for ${creatorId}`);
  } catch (error) {
    console.error('Error tracking story post:', error);
  }
}

// ============================================================================
// CHAT ANALYTICS INTEGRATION
// ============================================================================

/**
 * Example: Track chat reply speed ranking
 * 
 * Call this from a scheduled function that calculates creator reply speeds
 */
export async function trackChatReplySpeed(
  creatorId: string,
  percentileRanking: number // e.g., 5 for top 5%
): Promise<void> {
  try {
    // Only track if in top 10%
    if (percentileRanking <= 10) {
      await recordMissionProgressInternal(
        creatorId,
        'chat_reply_speed',
        percentileRanking,
        {
          percentile: percentileRanking,
          calculatedAt: new Date().toISOString(),
        }
      );

      console.log(`✅ Chat reply speed ranking tracked for ${creatorId}`);
    }
  } catch (error) {
    console.error('Error tracking chat reply speed:', error);
  }
}

// ============================================================================
// INTEGRATION HELPER FUNCTIONS
// ============================================================================

/**
 * Check if creator has missions system enabled
 */
export async function isCreatorMissionsEnabled(creatorId: string): Promise<boolean> {
  try {
    const missionDoc = await db.collection('creatorMissions').doc(creatorId).get();
    return missionDoc.exists;
  } catch (error) {
    console.error('Error checking missions enabled:', error);
    return false;
  }
}

/**
 * Get creator's active missions for a specific activity type
 */
export async function getActiveMissionsForActivity(
  creatorId: string,
  activityType: string
): Promise<any[]> {
  try {
    const missionsSnapshot = await db
      .collection('creatorMissions')
      .doc(creatorId)
      .collection('activeMissions')
      .where('status', '==', 'active')
      .where('objective.type', '==', activityType)
      .get();

    return missionsSnapshot.docs.map(doc => ({
      missionId: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error getting active missions:', error);
    return [];
  }
}

// ============================================================================
// USAGE EXAMPLES IN EXISTING SYSTEMS
// ============================================================================

/**
 * EXAMPLE 1: In Chat Billing Function
 * 
 * ```typescript
 * 
 * 
 * export const processChatPayment = functions.https.onCall(async (request) => {
 *   // ... existing chat billing logic ...
 *   
 *   // After tokens are deducted and chat is recorded:
 *   if (isCreatorMode) {
 *     await integrateWithChatMonetization(
 *       creatorId,
 *       1, // message count
 *       tokensDeducted,
 *       payerId
 *     );
 *   }
 *   
 *   return { success: true };
 * });
 * ```
 */

/**
 * EXAMPLE 2: In Live Session End Handler
 * 
 * ```typescript
 * 
 * 
 * export const endLiveSession = functions.firestore
 *   .document('live_sessions/{sessionId}')
 *   .onUpdate(async (change, context) => {
 *     const after = change.after.data();
 *     
 *     if (after.status === 'ended') {
 *       await integrateWithLiveBroadcast(after.hostId, {
 *         durationMinutes: after.durationMinutes,
 *         averageViewers: after.analytics.averageViewers,
 *         peakViewers: after.analytics.peakViewers,
 *         giftsReceived: after.analytics.giftsReceived,
 *         tokensEarned: after.earnings.totalTokens,
 *       });
 *     }
 *   });
 * ```
 */

/**
 * EXAMPLE 3: In Fan Club Subscription Handler
 * 
 * ```typescript
 * 
 * 
 * export const handleFanClubSubscription = functions.https.onCall(async (request) => {
 *   // ... existing subscription logic ...
 *   
 *   // After subscription is confirmed:
 *   await integrateWithFanClub(
 *     creatorId,
 *     subscriberId,
 *     subscriptionTier,
 *     subscriptionPrice
 *   );
 *   
 *   return { success: true };
 * });
 * ```
 */

// Note: All functions are already exported with 'export' keyword above
// No additional export block needed