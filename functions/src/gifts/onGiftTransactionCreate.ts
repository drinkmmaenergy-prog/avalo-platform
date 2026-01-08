/**
 * PACK 79 — In-Chat Paid Gifts
 * Firebase Function: onGiftTransactionCreate
 * Trigger function that runs after gift transaction is created
 * Handles post-transaction processing and analytics
 */

import * as functions from 'firebase-functions';
import { db, increment, serverTimestamp } from '../init';

/**
 * Firestore trigger on gift_transactions creation
 * Updates user statistics and logs analytics
 */
export const onGiftTransactionCreate = functions.firestore
  .document('gift_transactions/{transactionId}')
  .onCreate(async (snapshot, context) => {
    const transaction = snapshot.data();
    const transactionId = context.params.transactionId;

    console.log(`Processing gift transaction: ${transactionId}`);

    try {
      const {
        senderId,
        receiverId,
        giftId,
        priceTokens,
        receiverEarnings,
        commissionAvalo,
        metadata,
      } = transaction;

      // Parallel updates for better performance
      const updates = [
        // Update sender's gift statistics
        updateSenderStats(senderId, giftId, priceTokens, metadata?.giftName),
        
        // Update receiver's gift statistics and earnings
        updateReceiverStats(receiverId, giftId, receiverEarnings, metadata?.giftName),
        
        // Log analytics event
        logGiftAnalytics(transactionId, transaction),
        
        // Update platform revenue statistics
        updatePlatformRevenue(commissionAvalo, transactionId),
      ];

      await Promise.all(updates);

      console.log(`Gift transaction ${transactionId} processed successfully`);
      return null;
    } catch (error) {
      console.error(`Error processing gift transaction ${transactionId}:`, error);
      
      // Mark transaction as having processing errors (non-critical)
      await snapshot.ref.update({
        processingError: true,
        processingErrorMessage: error instanceof Error ? error.message : 'Unknown error',
        processingErrorAt: serverTimestamp(),
      });
      
      // Don't throw - transaction already succeeded, this is just post-processing
      return null;
    }
  });

/**
 * Update sender's gift statistics
 */
async function updateSenderStats(
  senderId: string,
  giftId: string,
  tokensSpent: number,
  giftName?: string
): Promise<void> {
  const senderRef = db.collection('users').doc(senderId);
  
  await senderRef.update({
    'giftStats.totalSent': increment(1),
    'giftStats.tokensSpent': increment(tokensSpent),
    'giftStats.lastGiftSentAt': serverTimestamp(),
    'giftStats.lastGiftSent': giftName || null,
    [`giftStats.sentByType.${giftId}`]: increment(1),
  });

  console.log(`Updated sender stats for user: ${senderId}`);
}

/**
 * Update receiver's gift statistics and earnings
 */
async function updateReceiverStats(
  receiverId: string,
  giftId: string,
  tokensEarned: number,
  giftName?: string
): Promise<void> {
  const receiverRef = db.collection('users').doc(receiverId);
  
  await receiverRef.update({
    'giftStats.totalReceived': increment(1),
    'giftStats.tokensEarned': increment(tokensEarned),
    'giftStats.lastGiftReceivedAt': serverTimestamp(),
    'giftStats.lastGiftReceived': giftName || null,
    [`giftStats.receivedByType.${giftId}`]: increment(1),
    
    // Update earnings dashboard
    'earnings.allTime': increment(tokensEarned),
    'earnings.thisMonth': increment(tokensEarned),
    'earnings.fromGifts': increment(tokensEarned),
    'earnings.lastEarningAt': serverTimestamp(),
  });

  console.log(`Updated receiver stats for user: ${receiverId}`);
}

/**
 * Log gift analytics event for BI
 */
async function logGiftAnalytics(
  transactionId: string,
  transaction: any
): Promise<void> {
  const analyticsRef = db.collection('analytics').doc('gifts');
  const eventRef = analyticsRef.collection('events').doc(transactionId);
  
  await eventRef.set({
    eventType: 'gift_send',
    transactionId,
    senderId: transaction.senderId,
    receiverId: transaction.receiverId,
    chatId: transaction.chatId,
    giftId: transaction.giftId,
    giftName: transaction.metadata?.giftName || null,
    priceTokens: transaction.priceTokens,
    commissionAvalo: transaction.commissionAvalo,
    receiverEarnings: transaction.receiverEarnings,
    timestamp: serverTimestamp(),
    createdAt: transaction.createdAt,
  });

  // Update aggregate statistics
  await analyticsRef.set(
    {
      totalGiftsSent: increment(1),
      totalTokensSpent: increment(transaction.priceTokens),
      totalCommissionEarned: increment(transaction.commissionAvalo),
      totalReceiverEarnings: increment(transaction.receiverEarnings),
      lastUpdated: serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`Logged analytics for transaction: ${transactionId}`);
}

/**
 * Update platform revenue statistics
 */
async function updatePlatformRevenue(
  commissionAvalo: number,
  transactionId: string
): Promise<void> {
  const revenueRef = db.collection('platform').doc('revenue');
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  await revenueRef.set(
    {
      gifts: {
        totalCommission: increment(commissionAvalo),
        transactionCount: increment(1),
        lastTransactionId: transactionId,
        lastTransactionAt: serverTimestamp(),
        [`daily.${today}`]: increment(commissionAvalo),
      },
      lastUpdated: serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`Updated platform revenue: +${commissionAvalo} tokens`);
}

/**
 * Check if user unlocked gift-related achievements
 * (Optional - can be expanded based on achievement system)
 */
async function checkGiftAchievements(
  userId: string,
  giftsSent: number,
  giftsReceived: number
): Promise<void> {
  // Example achievement milestones
  const achievements = [
    { type: 'gifts_sent', milestone: 1, name: 'First Gift' },
    { type: 'gifts_sent', milestone: 10, name: 'Gift Giver' },
    { type: 'gifts_sent', milestone: 100, name: 'Gift Master' },
    { type: 'gifts_received', milestone: 1, name: 'First Gift Received' },
    { type: 'gifts_received', milestone: 10, name: 'Popular' },
    { type: 'gifts_received', milestone: 100, name: 'Gift Legend' },
  ];

  const userRef = db.collection('users').doc(userId);
  
  for (const achievement of achievements) {
    const count = achievement.type === 'gifts_sent' ? giftsSent : giftsReceived;
    
    if (count === achievement.milestone) {
      await userRef.collection('achievements').add({
        type: achievement.type,
        name: achievement.name,
        milestone: achievement.milestone,
        unlockedAt: serverTimestamp(),
      });
      
      console.log(`User ${userId} unlocked achievement: ${achievement.name}`);
    }
  }
}