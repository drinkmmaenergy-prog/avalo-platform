import * as functions from 'firebase-functions';
import { db, FieldValue, timestamp as Timestamp } from '../init';

interface ChatMonetizationMetrics {
  date: string;
  freeToPaidConversion: number;
  avgPaidChatLength: number;
  avgTokensSpentPerUser: number;
  refundRate: number;
  chatDropOffRate: number;
  revenueRoyalVsStandard: {
    royalRevenue: number;
    standardRevenue: number;
    royalPercentage: number;
  };
  totalChats: number;
  paidChats: number;
  totalRefunds: number;
  totalRevenue: number;
}

// Track chat start
export const trackChatStart = functions.firestore
  .document('chats/{chatId}')
  .onCreate(async (snap, context) => {
    const chatId = context.params.chatId;
    const chat = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Track chat event
      await db.collection('monetization_events').add({
        event_type: 'chat_started',
        chat_id: chatId,
        user_id: chat.user_id,
        creator_id: chat.creator_id,
        is_free: chat.is_free !== false,
        timestamp: timestamp,
        metadata: {
          chat_type: chat.type || 'standard'
        }
      });

      // Increment daily chat counter
      await db.collection('analytics_daily').doc(`chats_${today}`).set({
        metric_type: 'chats',
        date: today,
        timestamp: timestamp,
        total_chats: FieldValue.increment(1),
        free_chats: chat.is_free !== false ? FieldValue.increment(1) : FieldValue.increment(0)
      }, { merge: true });

    } catch (error) {
      console.error('Error tracking chat start:', error);
    }
  });

// Track chat message
export const trackChatMessage = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const chatId = context.params.chatId;
    const messageId = context.params.messageId;
    const message = snap.data();
    const timestamp = Timestamp.now();

    try {
      // Get chat document
      const chatDoc = await db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) return;

      const chat = chatDoc.data()!;

      // Count words in message
      const wordCount = message.text ? message.text.split(/\s+/).length : 0;

      // Update chat analytics
      await db.collection('chats').doc(chatId).update({
        total_messages: FieldValue.increment(1),
        total_words: FieldValue.increment(wordCount),
        last_message_at: timestamp
      });

      // If this is a paid chat, track monetization metrics
      if (chat.is_paid || chat.tokens_spent > 0) {
        await db.collection('monetization_events').add({
          event_type: 'paid_chat_message',
          chat_id: chatId,
          message_id: messageId,
          user_id: message.sender_id,
          creator_id: chat.creator_id,
          word_count: wordCount,
          timestamp: timestamp
        });
      }

    } catch (error) {
      console.error('Error tracking chat message:', error);
    }
  });

// Track free to paid conversion
export const trackChatPayment = functions.firestore
  .document('chats/{chatId}/payments/{paymentId}')
  .onCreate(async (snap, context) => {
    const chatId = context.params.chatId;
    const payment = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Get chat document
      const chatDoc = await db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) return;

      const chat = chatDoc.data()!;

      // Mark chat as paid
      await db.collection('chats').doc(chatId).update({
        is_paid: true,
        first_payment_at: chat.first_payment_at || timestamp,
        tokens_spent: FieldValue.increment(payment.tokens || 0)
      });

      // Track conversion if this is first payment
      if (!chat.first_payment_at || !chat.is_paid) {
        await db.collection('monetization_events').add({
          event_type: 'free_to_paid_conversion',
          chat_id: chatId,
          user_id: chat.user_id,
          creator_id: chat.creator_id,
          tokens: payment.tokens || 0,
          timestamp: timestamp
        });

        await db.collection('analytics_daily').doc(`conversions_${today}`).set({
          metric_type: 'chat_conversions',
          date: today,
          timestamp: timestamp,
          free_to_paid_conversions: FieldValue.increment(1)
        }, { merge: true });
      }

      // Track revenue by tier
      const creatorDoc = await db.collection('users').doc(chat.creator_id).get();
      const creatorTier = creatorDoc.exists ? creatorDoc.data()?.tier || 'standard' : 'standard';

      await db.collection('analytics_daily').doc(`revenue_${today}`).set({
        metric_type: 'revenue',
        date: today,
        timestamp: timestamp,
        total_revenue: FieldValue.increment(payment.tokens || 0),
        [`${creatorTier}_revenue`]: FieldValue.increment(payment.tokens || 0)
      }, { merge: true });

      // Track monetization event
      await db.collection('monetization_events').add({
        event_type: 'chat_payment',
        chat_id: chatId,
        user_id: chat.user_id,
        creator_id: chat.creator_id,
        tokens: payment.tokens || 0,
        creator_tier: creatorTier,
        timestamp: timestamp
      });

    } catch (error) {
      console.error('Error tracking chat payment:', error);
    }
  });

// Track chat end/drop-off
export const trackChatEnd = functions.firestore
  .document('chats/{chatId}')
  .onUpdate(async (change, context) => {
    const chatId = context.params.chatId;
    const before = change.before.data();
    const after = change.after.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Check if chat ended
      if (!before.ended_at && after.ended_at) {
        const duration = after.ended_at.toMillis() - after.started_at.toMillis();
        const messageCount = after.total_messages || 0;

        // Track chat end event
        await db.collection('monetization_events').add({
          event_type: 'chat_ended',
          chat_id: chatId,
          user_id: after.user_id,
          creator_id: after.creator_id,
          duration_ms: duration,
          total_messages: messageCount,
          total_words: after.total_words || 0,
          tokens_spent: after.tokens_spent || 0,
          is_paid: after.is_paid || false,
          timestamp: timestamp
        });

        // Check for drop-off (ended within 2 minutes)
        if (duration < 120000) {
          await db.collection('analytics_daily').doc(`dropoffs_${today}`).set({
            metric_type: 'chat_dropoffs',
            date: today,
            timestamp: timestamp,
            dropoff_count: FieldValue.increment(1)
          }, { merge: true });
        }
      }

    } catch (error) {
      console.error('Error tracking chat end:', error);
    }
  });

// Track refunds
export const trackRefund = functions.firestore
  .document('refunds/{refundId}')
  .onCreate(async (snap, context) => {
    const refund = snap.data();
    const timestamp = Timestamp.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // Track refund event
      await db.collection('monetization_events').add({
        event_type: 'refund',
        refund_id: context.params.refundId,
        chat_id: refund.chat_id,
        user_id: refund.user_id,
        creator_id: refund.creator_id,
        tokens_refunded: refund.tokens || 0,
        reason: refund.reason,
        timestamp: timestamp
      });

      // Update daily refund metrics
      await db.collection('analytics_daily').doc(`refunds_${today}`).set({
        metric_type: 'refunds',
        date: today,
        timestamp: timestamp,
        refund_count: FieldValue.increment(1),
        tokens_refunded: FieldValue.increment(refund.tokens || 0)
      }, { merge: true });

    } catch (error) {
      console.error('Error tracking refund:', error);
    }
  });

// Daily aggregation for chat monetization KPIs
export const aggregateChatMonetizationKPIs = functions.pubsub
  .schedule('0 1 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    try {
      console.log(`Aggregating chat monetization KPIs for ${dateStr}`);

      // Get chat metrics
      const chatsDoc = await db.collection('analytics_daily').doc(`chats_${dateStr}`).get();
      const totalChats = chatsDoc.exists ? (chatsDoc.data()?.total_chats || 0) : 0;
      const freeChats = chatsDoc.exists ? (chatsDoc.data()?.free_chats || 0) : 0;

      // Get conversion metrics
      const conversionsDoc = await db.collection('analytics_daily').doc(`conversions_${dateStr}`).get();
      const freeToPaidConversions = conversionsDoc.exists ? (conversionsDoc.data()?.free_to_paid_conversions || 0) : 0;
      const freeToPaidConversion = totalChats > 0 ? (freeToPaidConversions / totalChats) * 100 : 0;

      // Get paid chat metrics
      const paidChatsSnapshot = await db.collection('chats')
        .where('started_at', '>=', Timestamp.fromDate(yesterday))
        .where('started_at', '<', Timestamp.fromDate(new Date(yesterday.getTime() + 86400000)))
        .where('is_paid', '==', true)
        .get();

      let totalWords = 0;
      let paidChatCount = 0;
      let totalTokensSpent = 0;
      const uniqueUsers = new Set<string>();

      paidChatsSnapshot.forEach(doc => {
        const chat = doc.data();
        totalWords += chat.total_words || 0;
        totalTokensSpent += chat.tokens_spent || 0;
        uniqueUsers.add(chat.user_id);
        paidChatCount++;
      });

      const avgPaidChatLength = paidChatCount > 0 ? totalWords / paidChatCount : 0;
      const avgTokensSpentPerUser = uniqueUsers.size > 0 ? totalTokensSpent / uniqueUsers.size : 0;

      // Get refund metrics
      const refundsDoc = await db.collection('analytics_daily').doc(`refunds_${dateStr}`).get();
      const refundCount = refundsDoc.exists ? (refundsDoc.data()?.refund_count || 0) : 0;
      const tokensRefunded = refundsDoc.exists ? (refundsDoc.data()?.tokens_refunded || 0) : 0;
      const refundRate = totalTokensSpent > 0 ? (tokensRefunded / totalTokensSpent) * 100 : 0;

      // Get drop-off metrics
      const dropoffsDoc = await db.collection('analytics_daily').doc(`dropoffs_${dateStr}`).get();
      const dropoffCount = dropoffsDoc.exists ? (dropoffsDoc.data()?.dropoff_count || 0) : 0;
      const chatDropOffRate = totalChats > 0 ? (dropoffCount / totalChats) * 100 : 0;

      // Get revenue split
      const revenueDoc = await db.collection('analytics_daily').doc(`revenue_${dateStr}`).get();
      const totalRevenue = revenueDoc.exists ? (revenueDoc.data()?.total_revenue || 0) : 0;
      const royalRevenue = revenueDoc.exists ? (revenueDoc.data()?.royal_revenue || 0) : 0;
      const standardRevenue = revenueDoc.exists ? (revenueDoc.data()?.standard_revenue || 0) : 0;
      const royalPercentage = totalRevenue > 0 ? (royalRevenue / totalRevenue) * 100 : 0;

      // Store aggregated metrics
      const metrics: ChatMonetizationMetrics = {
        date: dateStr,
        freeToPaidConversion,
        avgPaidChatLength,
        avgTokensSpentPerUser,
        refundRate,
        chatDropOffRate,
        revenueRoyalVsStandard: {
          royalRevenue,
          standardRevenue,
          royalPercentage
        },
        totalChats,
        paidChats: paidChatCount,
        totalRefunds: refundCount,
        totalRevenue
      };

      await db.collection('analytics_daily').doc(`chat_monetization_${dateStr}`).set({
        metric_type: 'chat_monetization_kpis',
        date: dateStr,
        timestamp: Timestamp.now(),
        metrics
      });

      console.log(`Chat monetization KPIs aggregated for ${dateStr}:`, metrics);

    } catch (error) {
      console.error('Error aggregating chat monetization KPIs:', error);
      throw error;
    }
  });