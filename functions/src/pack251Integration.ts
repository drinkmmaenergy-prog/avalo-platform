/**
 * PACK 251 Integration — Welcome Funnel <> Chat Monetization
 *
 * This module integrates the welcome funnel with existing systems:
 * - Chat monetization (PACK 219/242)
 * - User registration flow
 * - Payment processing
 */

import { db, serverTimestamp, increment } from './init.js';
import { processMessageBilling } from './chatMonetization.js';
import {
  initializeWelcomeFunnel,
  trackFunnelConversion,
  trackGamificationAction,
  trackProfileView,
  triggerPhase3Conversion
} from './pack251WelcomeFunnel.js';

// ============================================================================
// REGISTRATION INTEGRATION
// ============================================================================

/**
 * Hook into user registration to initialize welcome funnel
 * Call this immediately after new user is created
 */
export async function onUserRegistered(
  userId: string,
  gender: 'male' | 'female' | 'other',
  hasCreatorIntent: boolean = false
): Promise<void> {
  
  try {
    await initializeWelcomeFunnel(userId, gender, hasCreatorIntent);
    console.log(`Welcome funnel initialized for user ${userId}`);
  } catch (error) {
    console.error(`Failed to initialize welcome funnel for ${userId}:`, error);
    // Non-blocking - don't fail registration if funnel init fails
  }
}

// ============================================================================
// CHAT MONETIZATION INTEGRATION
// ============================================================================

/**
 * Enhanced message billing that integrates with welcome funnel
 * Wraps existing processMessageBilling to add funnel conversion tracking
 */
export async function processMessageBillingWithFunnel(
  chatId: string,
  senderId: string,
  messageText: string
): Promise<{ allowed: boolean; reason?: string; tokensCost: number; showConversionUI?: boolean; partnerName?: string }> {
  
  // Call existing chat monetization logic
  const billingResult = await processMessageBilling(chatId, senderId, messageText);
  
  // If message not allowed due to deposit requirement, check if user is in welcome funnel Phase 3
  if (!billingResult.allowed && billingResult.reason?.includes('Deposit required')) {
    
    // Check welcome funnel state
    const funnelSnap = await db.collection('welcome_funnels').doc(senderId).get();
    
    if (funnelSnap.exists) {
      const funnel = funnelSnap.data()!;
      const now = Date.now();
      const hoursSinceStart = (now - funnel.startedAt) / (1000 * 60 * 60);
      
      // If user is within 48h and hasn't converted yet
      if (hoursSinceStart < 48 && !funnel.analytics.convertedToPaying) {
        
        // Get partner info for personalized CTA
        const chatSnap = await db.collection('chats').doc(chatId).get();
        const chat = chatSnap.exists ? chatSnap.data() : null;
        
        let partnerUserId: string | undefined;
        let partnerName: string = 'them';
        
        if (chat) {
          partnerUserId = chat.participants.find((id: string) => id !== senderId);
          
          if (partnerUserId) {
            const partnerSnap = await db.collection('users').doc(partnerUserId).get();
            if (partnerSnap.exists) {
              partnerName = partnerSnap.data()!.displayName || 'them';
            }
            
            // Trigger Phase 3 conversion moment
            await triggerPhase3Conversion(senderId, chatId, partnerUserId);
          }
        }
        
        // Return special conversion UI flag
        return {
          allowed: false,
          reason: billingResult.reason,
          tokensCost: 0,
          showConversionUI: true,
          partnerName
        };
      }
    }
  }
  
  // Track message in funnel analytics
  if (billingResult.allowed) {
    trackMessageInFunnel(senderId, chatId).catch(err => {
      console.error('Failed to track message in funnel:', err);
    });
  }
  
  return billingResult;
}

/**
 * Track message activity in welcome funnel analytics
 */
async function trackMessageInFunnel(userId: string, chatId: string): Promise<void> {
  const funnelRef = db.collection('welcome_funnels').doc(userId);
  const funnelSnap = await funnelRef.get();
  
  if (!funnelSnap.exists) return;
  
  await funnelRef.update({
    'analytics.totalMessagesSent': increment(1),
    'phase1.firstMessageSent': true,
    updatedAt: serverTimestamp()
  });
}

// ============================================================================
// PAYMENT INTEGRATION
// ============================================================================

/**
 * Hook into payment processing to track funnel conversions
 * Call this when user makes their first deposit
 */
export async function onFirstDeposit(
  userId: string,
  depositAmount: number,
  depositType: 'chat' | 'general'
): Promise<void> {
  
  try {
    const funnelSnap = await db.collection('welcome_funnels').doc(userId).get();
    
    if (funnelSnap.exists) {
      const funnel = funnelSnap.data()!;
      
      // Only track if this is their first deposit and they haven't converted yet
      if (!funnel.analytics.convertedToPaying) {
        await trackFunnelConversion(userId, depositAmount);
        console.log(`User ${userId} converted in welcome funnel: ${depositAmount} tokens`);
      }
    }
  } catch (error) {
    console.error(`Failed to track funnel conversion for ${userId}:`, error);
    // Non-blocking
  }
}

// ============================================================================
// PROFILE ACTIVITY INTEGRATION
// ============================================================================

/**
 * Hook into profile view tracking
 * Call when user views another profile
 */
export async function onProfileViewed(
  viewerId: string,
  viewedUserId: string,
  viewDurationSeconds: number
): Promise<void> {
  
  try {
    await trackProfileView(viewerId, viewedUserId, viewDurationSeconds);
  } catch (error) {
    console.error('Failed to track profile view in funnel:', error);
    // Non-blocking
  }
}

/**
 * Hook into profile photo uploads
 */
export async function onPhotoUploaded(userId: string): Promise<{ reward?: string; description?: string }> {
  
  try {
    const result = await trackGamificationAction(userId, 'PHOTO_UPLOAD');
    return result || {};
  } catch (error) {
    console.error('Failed to track photo upload in funnel:', error);
    return {};
  }
}

/**
 * Hook into profile bio completion
 */
export async function onBioCompleted(userId: string): Promise<{ reward?: string; description?: string }> {
  
  try {
    const result = await trackGamificationAction(userId, 'BIO_COMPLETE');
    return result || {};
  } catch (error) {
    console.error('Failed to track bio completion in funnel:', error);
    return {};
  }
}

/**
 * Hook into profile verification
 */
export async function onProfileVerified(userId: string): Promise<{ reward?: string; description?: string }> {
  
  try {
    const result = await trackGamificationAction(userId, 'PROFILE_VERIFY');
    return result || {};
  } catch (error) {
    console.error('Failed to track profile verification in funnel:', error);
    return {};
  }
}

/**
 * Hook into interests addition
 */
export async function onInterestsAdded(userId: string): Promise<{ reward?: string; description?: string }> {
  
  try {
    const result = await trackGamificationAction(userId, 'INTERESTS_ADD');
    return result || {};
  } catch (error) {
    console.error('Failed to track interests addition in funnel:', error);
    return {};
  }
}

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Export scheduled function for Cloud Functions
 */
export { advanceFunnelPhases } from './pack251WelcomeFunnel.js';

// ============================================================================
// ANALYTICS QUERIES
// ============================================================================

/**
 * Get welcome funnel state for a user
 * Used by frontend to customize UI
 */
export async function getWelcomeFunnelState(userId: string): Promise<any | null> {
  
  try {
    const funnelSnap = await db.collection('welcome_funnels').doc(userId).get();
    
    if (!funnelSnap.exists) return null;
    
    const funnel = funnelSnap.data()!;
    const now = Date.now();
    const hoursSinceStart = (now - funnel.startedAt) / (1000 * 60 * 60);
    
    // Check if funnel is still active (<48h)
    const isActive = hoursSinceStart < 48 && !funnel.analytics.convertedToPaying;
    
    return {
      isActive,
      currentPhase: funnel.currentPhase,
      hoursSinceStart,
      analytics: {
        likesReceived: funnel.analytics.totalLikesReceived,
        profileViews: funnel.analytics.totalProfileViews,
        matches: funnel.analytics.totalMatchesCreated,
        messagesSent: funnel.analytics.totalMessagesSent
      },
      phase2: {
        visibilityBoostActive: funnel.phase2?.visibilityBoostActive || false,
        visibilityBoostEndsAt: funnel.phase2?.visibilityBoostEndsAt || null
      },
      gamification: funnel.gamification
    };
  } catch (error) {
    console.error('Failed to get welcome funnel state:', error);
    return null;
  }
}

/**
 * Check if user should see welcome funnel features
 */
export async function isInWelcomeFunnel(userId: string): Promise<boolean> {
  
  try {
    const funnelSnap = await db.collection('welcome_funnels').doc(userId).get();
    
    if (!funnelSnap.exists) return false;
    
    const funnel = funnelSnap.data()!;
    const now = Date.now();
    const hoursSinceStart = (now - funnel.startedAt) / (1000 * 60 * 60);
    
    return hoursSinceStart < 48 && !funnel.analytics.convertedToPaying;
  } catch (error) {
    return false;
  }
}