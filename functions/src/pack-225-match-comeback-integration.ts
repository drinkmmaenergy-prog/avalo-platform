/**
 * PACK 225: Match Comeback Engine - Integration Layer
 * 
 * Integrates rekindle system with:
 * - Chat monetization
 * - Calls and meetings
 * - Romantic Journeys (PACK 221)
 * - Romantic Momentum (PACK 224)
 */

import { db, serverTimestamp } from './init.js';
import {
  createRekindleAttempt,
  markRekindleReplied,
  trackRekindleConversion,
  generateRekindleSuggestions,
  saveRekindleSuggestions,
} from './pack-225-match-comeback.js';
import { processMessageBilling } from './chatMonetization.js';

// ============================================================================
// MESSAGE SENDING
// ============================================================================

/**
 * Send a rekindle message via Cloud Function
 * This integrates with chat monetization
 */
export async function sendRekindleMessage(
  initiatorId: string,
  chatId: string,
  recipientId: string,
  messageText: string,
  templateUsed: string
): Promise<{ success: boolean; error?: string; attemptId?: string }> {
  
  // Create rekindle attempt record
  const attemptResult = await createRekindleAttempt(
    chatId,
    initiatorId,
    recipientId,
    messageText,
    templateUsed
  );
  
  if (!attemptResult.success) {
    return { success: false, error: attemptResult.error };
  }
  
  // Process message billing (if applicable)
  try {
    const billingResult = await processMessageBilling(chatId, initiatorId, messageText);
    
    if (!billingResult.allowed) {
      return {
        success: false,
        error: billingResult.reason || 'Message not allowed',
      };
    }
    
    // Save message to chat
    await db.collection('chats').doc(chatId).collection('messages').add({
      senderId: initiatorId,
      text: messageText,
      createdAt: serverTimestamp(),
      rekindleAttemptId: attemptResult.attemptId,
      type: 'rekindle_message',
    });
    
    // Update chat last activity
    await db.collection('chats').doc(chatId).update({
      lastActivityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    return { success: true, attemptId: attemptResult.attemptId };
    
  } catch (error: any) {
    console.error('Error processing rekindle message:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle when recipient replies to rekindle message
 */
export async function onRekindleReply(
  chatId: string,
  recipientId: string,
  messageText: string
): Promise<void> {
  
  // Find the most recent rekindle attempt for this chat
  const attemptsSnap = await db.collection('rekindle_attempts')
    .where('chatId', '==', chatId)
    .where('replied', '==', false)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (!attemptsSnap.empty) {
    const attemptId = attemptsSnap.docs[0].id;
    await markRekindleReplied(attemptId);
    
    // Track momentum boost for successful rekindle (PACK 224)
    try {
      const momentum = await import('./pack-224-romantic-momentum-integration.js');
      const initiatorId = attemptsSnap.docs[0].data().initiatorId;
      
      // Boost momentum for both users using onFirstMessageOfDay as proxy
      if (momentum.onFirstMessageOfDay) {
        await momentum.onFirstMessageOfDay(initiatorId, recipientId, chatId);
        await momentum.onFirstMessageOfDay(recipientId, initiatorId, chatId);
      }
    } catch (error) {
      // Non-blocking - PACK 224 might not be available
      console.error('Failed to track momentum for rekindle reply:', error);
    }
  }
}

// ============================================================================
// PAID FEATURE INTEGRATION
// ============================================================================

/**
 * Track when rekindle leads to a paid call
 */
export async function onRekindleLeadsToCall(
  chatId: string,
  callType: 'voice' | 'video',
  tokenAmount: number
): Promise<void> {
  
  // Find recent rekindle attempt
  const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
  
  const attemptsSnap = await db.collection('rekindle_attempts')
    .where('chatId', '==', chatId)
    .where('replied', '==', true)
    .where('createdAt', '>=', cutoffDate)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (!attemptsSnap.empty) {
    const attemptId = attemptsSnap.docs[0].id;
    await trackRekindleConversion(attemptId, 'call', tokenAmount);
  }
}

/**
 * Track when rekindle leads to a meeting
 */
export async function onRekindleLeadsToMeeting(
  chatId: string,
  meetingId: string,
  tokenAmount: number
): Promise<void> {
  
  const cutoffDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // Last 14 days
  
  const attemptsSnap = await db.collection('rekindle_attempts')
    .where('chatId', '==', chatId)
    .where('replied', '==', true)
    .where('createdAt', '>=', cutoffDate)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (!attemptsSnap.empty) {
    const attemptId = attemptsSnap.docs[0].id;
    await trackRekindleConversion(attemptId, 'meeting', tokenAmount);
  }
}

/**
 * Track when rekindle leads to event participation
 */
export async function onRekindleLeadsToEvent(
  chatId: string,
  eventId: string,
  tokenAmount: number
): Promise<void> {
  
  const cutoffDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  
  const attemptsSnap = await db.collection('rekindle_attempts')
    .where('chatId', '==', chatId)
    .where('replied', '==', true)
    .where('createdAt', '>=', cutoffDate)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  
  if (!attemptsSnap.empty) {
    const attemptId = attemptsSnap.docs[0].id;
    await trackRekindleConversion(attemptId, 'event', tokenAmount);
  }
}

// ============================================================================
// ROMANTIC JOURNEY INTEGRATION (PACK 221)
// ============================================================================

/**
 * Suggest rekindle when Romantic Journey ends positively
 */
export async function onJourneyCompletedPositively(
  userId: string,
  partnerId: string,
  journeyId: string
): Promise<void> {
  
  // Find their chat
  const chatsSnap = await db.collection('chats')
    .where('participants', 'array-contains', userId)
    .get();
  
  const partnerChat = chatsSnap.docs.find(doc => {
    const participants = doc.data().participants;
    return participants.includes(partnerId);
  });
  
  if (partnerChat) {
    // Generate high-priority suggestion
    const suggestions = await generateRekindleSuggestions(userId, 1);
    
    if (suggestions.length > 0) {
      // Boost chemistry score for journey completion
      suggestions[0].chemistryScore = Math.min(suggestions[0].chemistryScore + 20, 100);
      await saveRekindleSuggestions(suggestions);
    }
  }
}

/**
 * Trigger suggestion generation after breakup recovery (PACK 222)
 */
export async function onBreakupRecoveryCompleted(
  userId: string
): Promise<void> {
  
  // Generate suggestions for user who completed recovery
  const suggestions = await generateRekindleSuggestions(userId, 5);
  
  if (suggestions.length > 0) {
    await saveRekindleSuggestions(suggestions);
  }
}

// ============================================================================
// DESTINY WEEK INTEGRATION (PACK 223)
// ============================================================================

/**
 * Surface relevant cooled chats during Destiny Week themes
 */
export async function surfaceRekindleForDestinyWeek(
  userId: string,
  weekTheme: string
): Promise<void> {
  
  // Generate suggestions based on destiny week theme
  const suggestions = await generateRekindleSuggestions(userId, 3);
  
  if (suggestions.length > 0) {
    // Tag suggestions with destiny week context
    const taggedSuggestions = suggestions.map(s => ({
      ...s,
      destinyWeekTheme: weekTheme,
      chemistryScore: s.chemistryScore + 5, // Small boost for themed suggestions
    }));
    
    await saveRekindleSuggestions(taggedSuggestions);
  }
}

// ============================================================================
// MOMENTUM BOOST (PACK 224)
// ============================================================================

/**
 * Highlight cooled chats with high momentum partners
 */
export async function highlightHighMomentumMatches(
  userId: string
): Promise<void> {
  
  // This is already integrated in the suggestion generator
  // via applyMomentumBoost(), but we can trigger a refresh
  
  const suggestions = await generateRekindleSuggestions(userId, 5);
  
  if (suggestions.length > 0) {
    await saveRekindleSuggestions(suggestions);
  }
}

// ============================================================================
// ANALYTICS HELPERS
// ============================================================================

/**
 * Track rekindle suggestion impression
 */
export async function trackRekindleImpression(
  suggestionId: string,
  userId: string
): Promise<void> {
  
  await db.collection('rekindle_impressions').add({
    suggestionId,
    userId,
    viewedAt: serverTimestamp(),
  });
}

/**
 * Track rekindle suggestion dismissal
 */
export async function trackRekindleDismissal(
  suggestionId: string,
  userId: string,
  reason?: string
): Promise<void> {
  
  await db.collection('rekindle_dismissals').add({
    suggestionId,
    userId,
    reason,
    dismissedAt: serverTimestamp(),
  });
}

// ============================================================================
// NOTIFICATION TRIGGERS
// ============================================================================

/**
 * Send push notification for new rekindle suggestion
 */
export async function sendRekindleNotification(
  userId: string,
  partnerName: string
): Promise<void> {
  
  // Check if user has rekindle notifications enabled
  const settingsSnap = await db.collection('users').doc(userId)
    .collection('settings').doc('preferences').get();
  
  const settings = settingsSnap.data();
  
  if (settings?.rekindleNotificationsEnabled === false) {
    return; // User opted out
  }
  
  // Get user's FCM tokens
  const tokensSnap = await db.collection('users').doc(userId)
    .collection('fcm_tokens').get();
  
  if (tokensSnap.empty) {
    return; // No device tokens
  }
  
  const tokens = tokensSnap.docs.map(doc => doc.data().token);
  
  // Send notification (integrate with your notification service)
  // For now, this is a placeholder - implement based on your notification system
  try {
    // Dynamic import with error handling - notification service might not exist yet
    const notificationModule = await import('./notificationService.js' as any).catch(() => null);
    
    if (notificationModule && typeof notificationModule.sendMulticast === 'function') {
      await notificationModule.sendMulticast({
        tokens,
        notification: {
          title: '💜 Rekindle suggestion',
          body: `You and ${partnerName} had great chemistry. Want to reconnect?`,
        },
        data: {
          type: 'rekindle_suggestion',
          screen: 'chats',
        },
      });
    }
  } catch (error) {
    // Non-blocking - notification service might not be implemented yet
    console.error('Failed to send rekindle notification:', error);
  }
}

/**
 * Send notification when someone sends a rekindle message
 */
export async function sendRekindleMessageNotification(
  recipientId: string,
  senderName: string
): Promise<void> {
  
  const tokensSnap = await db.collection('users').doc(recipientId)
    .collection('fcm_tokens').get();
  
  if (tokensSnap.empty) {
    return;
  }
  
  const tokens = tokensSnap.docs.map(doc => doc.data().token);
  
  try {
    // Dynamic import with error handling
    const notificationModule = await import('./notificationService.js' as any).catch(() => null);
    
    if (notificationModule && typeof notificationModule.sendMulticast === 'function') {
      await notificationModule.sendMulticast({
        tokens,
        notification: {
          title: `Message from ${senderName}`,
          body: 'They want to reconnect with you',
        },
        data: {
          type: 'rekindle_message',
          screen: 'chat',
        },
      });
    }
  } catch (error) {
    // Non-blocking - notification service might not be implemented yet
    console.error('Failed to send rekindle message notification:', error);
  }
}