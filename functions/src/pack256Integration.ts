/**
 * PACK 256: AI Reply Accelerator - Integration Layer
 * Connects AI suggestions with existing chat monetization system
 */

import { db, serverTimestamp, increment } from './init.js';
import { shouldShowSuggestions, type SuggestionTrigger } from './pack256AiReplySuggestions.js';

// ============================================================================
// CHAT MESSAGE HOOK
// ============================================================================

/**
 * Hook into processMessageBilling to check if suggestions should be shown
 * This should be called AFTER a message is received in a chat
 */
export async function onChatMessageReceived(
  chatId: string,
  receiverId: string,
  messageText: string
): Promise<{ shouldShowSuggestions: boolean; trigger?: SuggestionTrigger }> {
  try {
    // Check if AI suggestions should be triggered
    const result = await shouldShowSuggestions(chatId, receiverId);
    
    // Additional context-based triggers
    if (!result.should) {
      // Check for romantic/flirty keywords in received message
      const romanticKeywords = [
        'beautiful', 'gorgeous', 'sexy', 'stunning', 'attractive',
        'love', 'kiss', 'heart', 'miss you', 'thinking of you'
      ];
      
      const lowerText = messageText.toLowerCase();
      const hasRomanticContent = romanticKeywords.some(kw => lowerText.includes(kw));
      
      if (hasRomanticContent) {
        return { shouldShowSuggestions: true, trigger: 'after_romantic' };
      }
      
      // Check for questions (user expects a response)
      if (messageText.includes('?')) {
        return { shouldShowSuggestions: true, trigger: 'seen_no_reply' };
      }
    }
    
    return {
      shouldShowSuggestions: result.should,
      trigger: result.trigger,
    };
  } catch (error) {
    console.error('Error checking suggestion triggers:', error);
    return { shouldShowSuggestions: false };
  }
}

// ============================================================================
// MONETIZATION INTEGRATION
// ============================================================================

/**
 * Track when AI suggestions lead to paid chat transitions
 * This helps measure the revenue impact of the feature
 */
export async function trackSuggestionMonetizationImpact(
  chatId: string,
  userId: string,
  event: 'chat_deposit' | 'message_sent' | 'media_unlocked',
  sessionId?: string
): Promise<void> {
  try {
    // If there was a recent suggestion session, attribute the conversion
    if (sessionId) {
      await db
        .collection('ai_suggestion_sessions')
        .doc(sessionId)
        .update({
          conversionEvent: event,
          convertedAt: serverTimestamp(),
        });
    }
    
    // Track in chat metadata
    await db
      .collection('chats')
      .doc(chatId)
      .collection('ai_metadata')
      .doc('suggestions')
      .set({
        lastConversionEvent: event,
        lastConversionAt: serverTimestamp(),
        totalConversions: increment(1),
        [`conversions.${event}`]: increment(1),
      }, { merge: true });
    
    // Update user-level analytics
    await db
      .collection('ai_suggestion_analytics')
      .doc(userId)
      .set({
        conversions: {
          [event]: increment(1),
        },
        revenueImpact: increment(event === 'chat_deposit' ? 1 : 0.1),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    
  } catch (error) {
    console.error('Error tracking monetization impact:', error);
  }
}

// ============================================================================
// PAYWALL INTEGRATION
// ============================================================================

/**
 * Show suggestion prompts at strategic monetization moments
 */
export async function getSuggestionPromptForPaywall(
  chatId: string,
  userId: string,
  context: 'free_limit' | 'escrow_low' | 'media_locked'
): Promise<{ shouldPrompt: boolean; message: string }> {
  try {
    // Check if user has AI suggestions enabled
    const prefsSnap = await db
      .collection('users')
      .doc(userId)
      .collection('ai_preferences')
      .doc('chat_suggestions')
      .get();
    
    if (prefsSnap.exists && prefsSnap.data()?.enabled === false) {
      return { shouldPrompt: false, message: '' };
    }
    
    // Context-specific prompts
    const prompts = {
      free_limit: "💡 Need help crafting the perfect message to keep the conversation going? Try AI suggestions!",
      escrow_low: "✨ AI can help you write messages that build stronger connections and extend your chats.",
      media_locked: "🎯 Use AI suggestions to write engaging messages that feel natural and authentic.",
    };
    
    return {
      shouldPrompt: true,
      message: prompts[context],
    };
  } catch (error) {
    console.error('Error getting paywall prompt:', error);
    return { shouldPrompt: false, message: '' };
  }
}

// ============================================================================
// CONSENT INTEGRATION (PACK 249)
// ============================================================================

/**
 * Check if both users have consented to adult content for NSFW suggestions
 * Integrates with PACK 249 Adult Mode
 */
export async function checkMutualAdultConsent(chatId: string): Promise<boolean> {
  try {
    const chatSnap = await db.collection('chats').doc(chatId).get();
    if (!chatSnap.exists) return false;
    
    const chat = chatSnap.data();
    const participants = chat?.participants || [];
    
    // Check both participants have adult_mode enabled
    for (const participantId of participants) {
      const userSnap = await db.collection('users').doc(participantId).get();
      if (!userSnap.exists) return false;
      
      const userData = userSnap.data();
      
      // Check PACK 249 adult mode consent
      if (!userData?.adult_mode?.enabled) return false;
      if (!userData?.adult_mode?.verified_age) return false;
      
      // Check AI suggestions NSFW consent
      const aiPrefsSnap = await db
        .collection('users')
        .doc(participantId)
        .collection('ai_preferences')
        .doc('chat_suggestions')
        .get();
      
      if (!aiPrefsSnap.exists || !aiPrefsSnap.data()?.nsfwConsent) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error checking adult consent:', error);
    return false;
  }
}

// ============================================================================
// PERFORMANCE TRACKING INTEGRATION
// ============================================================================

/**
 * Track aggregate performance metrics for optimization
 */
export async function aggregateSuggestionPerformance(
  period: 'daily' | 'weekly' | 'monthly' = 'daily'
): Promise<void> {
  try {
    const now = new Date();
    const startDate = new Date(now);
    
    // Set period window
    if (period === 'daily') {
      startDate.setDate(now.getDate() - 1);
    } else if (period === 'weekly') {
      startDate.setDate(now.getDate() - 7);
    } else {
      startDate.setMonth(now.getMonth() - 1);
    }
    
    // Query all sessions in period
    const sessionsSnap = await db
      .collection('ai_suggestion_sessions')
      .where('createdAt', '>=', startDate)
      .get();
    
    // Aggregate metrics
    let totalGenerated = 0;
    let totalAccepted = 0;
    let totalEdited = 0;
    let totalIgnored = 0;
    let totalConversions = 0;
    
    const byTone: Record<string, number> = {};
    const byTrigger: Record<string, number> = {};
    
    sessionsSnap.docs.forEach(doc => {
      const data = doc.data();
      totalGenerated++;
      
      if (data.accepted) totalAccepted++;
      if (data.edited) totalEdited++;
      if (!data.accepted && !data.edited && data.action === 'ignored') totalIgnored++;
      if (data.conversionEvent) totalConversions++;
      
      byTone[data.tone] = (byTone[data.tone] || 0) + 1;
      byTrigger[data.trigger] = (byTrigger[data.trigger] || 0) + 1;
    });
    
    // Store aggregated metrics
    await db
      .collection('ai_suggestion_performance')
      .doc(`${period}_${now.toISOString().split('T')[0]}`)
      .set({
        period,
        periodStart: startDate,
        periodEnd: now,
        metrics: {
          totalGenerated,
          totalAccepted,
          totalEdited,
          totalIgnored,
          totalConversions,
          acceptanceRate: totalGenerated > 0 ? (totalAccepted / totalGenerated) * 100 : 0,
          conversionRate: totalGenerated > 0 ? (totalConversions / totalGenerated) * 100 : 0,
        },
        byTone,
        byTrigger,
        createdAt: serverTimestamp(),
      });
    
    console.log(`Aggregated ${period} performance:`, {
      totalGenerated,
      acceptanceRate: totalGenerated > 0 ? ((totalAccepted / totalGenerated) * 100).toFixed(2) + '%' : '0%',
    });
  } catch (error) {
    console.error('Error aggregating performance:', error);
  }
}

// ============================================================================
// CLEANUP UTILITIES
// ============================================================================

/**
 * Clean up expired suggestion sessions (older than 1 hour)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const expiredSnap = await db
      .collection('ai_suggestion_sessions')
      .where('createdAt', '<', oneHourAgo)
      .limit(100)
      .get();
    
    const batch = db.batch();
    expiredSnap.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    return expiredSnap.size;
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    return 0;
  }
}