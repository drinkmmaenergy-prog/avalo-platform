import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * PACK 318: Daily aggregation of investor metrics
 * Runs daily at 00:00 UTC to aggregate previous day's metrics
 * NO CHANGES to tokenomics, prices, or payout rates
 */
export const aggregateInvestorMetrics = functions.pubsub
  .schedule('0 0 * * *') // Daily at midnight UTC
  .timeZone('UTC')
  .onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const dateStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log(`Aggregating investor metrics for ${dateStr}`);

    try {
      // 1. User Growth Metrics
      const usersSnapshot = await db.collection('users').get();
      const verifiedUsersSnapshot = await db.collection('users')
        .where('verified', '==', true)
        .get();

      // Calculate DAU (users active in last 24h)
      const yesterday24h = new Date(yesterday);
      yesterday24h.setHours(23, 59, 59, 999);
      const dauSnapshot = await db.collection('users')
        .where('lastActive', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('lastActive', '<=', admin.firestore.Timestamp.fromDate(yesterday24h))
        .get();

      // Calculate MAU (users active in last 30 days)
      const thirtyDaysAgo = new Date(yesterday);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const mauSnapshot = await db.collection('users')
        .where('lastActive', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
        .get();

      // 2. Engagement Metrics
      const swipesSnapshot = await db.collection('swipes')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(yesterday24h))
        .get();

      const activeChatsSnapshot = await db.collection('chats')
        .where('lastMessageAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('lastMessageAt', '<=', admin.firestore.Timestamp.fromDate(yesterday24h))
        .get();

      const meetingsSnapshot = await db.collection('calendarBookings')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(yesterday24h))
        .get();

      const eventTicketsSnapshot = await db.collection('eventTickets')
        .where('purchasedAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('purchasedAt', '<=', admin.firestore.Timestamp.fromDate(yesterday24h))
        .get();

      const aiSessionsSnapshot = await db.collection('aiCompanionSessions')
        .where('startedAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('startedAt', '<=', admin.firestore.Timestamp.fromDate(yesterday24h))
        .get();

      // 3. Monetization Metrics
      const transactionsSnapshot = await db.collection('transactions')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(yesterday24h))
        .get();

      let tokensPurchased = 0;
      let tokensSpentChat = 0;
      let tokensSpentCalls = 0;
      let tokensSpentCalendar = 0;
      let tokensSpentEvents = 0;
      let tokensSpentAI = 0;

      transactionsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.type === 'TOKEN_PURCHASE') {
          tokensPurchased += data.amount || 0;
        } else if (data.type === 'CHAT_MESSAGE') {
          tokensSpentChat += data.amount || 0;
        } else if (data.type === 'VIDEO_CALL') {
          tokensSpentCalls += data.amount || 0;
        } else if (data.type === 'CALENDAR_BOOKING') {
          tokensSpentCalendar += data.amount || 0;
        } else if (data.type === 'EVENT_TICKET') {
          tokensSpentEvents += data.amount || 0;
        } else if (data.type === 'AI_COMPANION') {
          tokensSpentAI += data.amount || 0;
        }
      });

      // Calculate platform share based on revenue splits
      // Chat/Calls/AI: 35% platform share
      // Calendar/Events: 20% platform share
      const platformShareTokens = Math.round(
        (tokensSpentChat + tokensSpentCalls + tokensSpentAI) * 0.35 +
        (tokensSpentCalendar + tokensSpentEvents) * 0.20
      );

      // 4. Safety Metrics
      const verificationsSnapshot = await db.collection('verifications')
        .where('completedAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('completedAt', '<=', admin.firestore.Timestamp.fromDate(yesterday24h))
        .where('status', '==', 'APPROVED')
        .get();

      const safetyReportsSnapshot = await db.collection('supportTickets')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(yesterday24h))
        .where('category', '==', 'SAFETY_REPORT')
        .get();

      const panicButtonSnapshot = await db.collection('supportTickets')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(yesterday24h))
        .where('category', '==', 'PANIC_BUTTON')
        .get();

      const bannedAccountsSnapshot = await db.collection('users')
        .where('bannedAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('bannedAt', '<=', admin.firestore.Timestamp.fromDate(yesterday24h))
        .get();

      // Aggregate all metrics
      const metrics = {
        date: dateStr,
        users: {
          registeredTotal: usersSnapshot.size,
          verifiedTotal: verifiedUsersSnapshot.size,
          dau: dauSnapshot.size,
          mau: mauSnapshot.size
        },
        engagement: {
          swipes: swipesSnapshot.size,
          activeChats: activeChatsSnapshot.size,
          meetingsBooked: meetingsSnapshot.size,
          eventTickets: eventTicketsSnapshot.size,
          aiSessions: aiSessionsSnapshot.size
        },
        monetization: {
          tokensPurchased,
          tokensSpentChat,
          tokensSpentCalls,
          tokensSpentCalendar,
          tokensSpentEvents,
          tokensSpentAI,
          platformShareTokens
        },
        safety: {
          verificationsCompleted: verificationsSnapshot.size,
          safetyReports: safetyReportsSnapshot.size,
          panicButtonTriggers: panicButtonSnapshot.size,
          accountsBanned: bannedAccountsSnapshot.size
        },
        aggregatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Store aggregated metrics
      await db.collection('investorMetricsDaily')
        .doc(dateStr)
        .set(metrics);

      console.log(`Successfully aggregated metrics for ${dateStr}`, metrics);

      return { success: true, date: dateStr };
    } catch (error) {
      console.error('Error aggregating investor metrics:', error);
      throw error;
    }
  });