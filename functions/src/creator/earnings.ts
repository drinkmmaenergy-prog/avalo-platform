import * as functions from 'firebase-functions';
import { db } from '../init';
import { FieldValue } from 'firebase-admin/firestore';

// ============================================================================
// TYPES
// ============================================================================

export interface CreatorEarningsSummary {
  userId: string;
  totalTokensEarnedAllTime: number;
  totalTokensEarned30d: number;
  totalTokensEarned90d: number;
  tokensFromChatMessagesAllTime: number;
  tokensFromBoostsAllTime: number;
  tokensFromPaidMediaAllTime: number;
  tokensFromAiCompanionsAllTime: number;
  tokensFromChatMessages30d: number;
  tokensFromBoosts30d: number;
  tokensFromPaidMedia30d: number;
  tokensFromAiCompanions30d: number;
  lastUpdatedAt: FirebaseFirestore.Timestamp;
}

export interface TokenEarnEvent {
  eventId: string;
  userId: string;
  counterpartyId: string;
  type: 'CHAT_MESSAGE' | 'BOOST' | 'PAID_MEDIA' | 'AI_COMPANION';
  tokensEarned: number;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface CreatorEarningsEvent {
  id: string;
  type: 'CHAT_MESSAGE' | 'BOOST' | 'PAID_MEDIA' | 'AI_COMPANION';
  counterpartyId: string;
  tokensEarned: number;
  createdAt: number;
}

// ============================================================================
// ENDPOINT: GET /creator/earnings/summary
// ============================================================================

export const getCreatorEarningsSummary = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const requestedUserId = data.userId;
  
  // Security: users can only view their own earnings
  if (requestedUserId && requestedUserId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'You can only view your own earnings');
  }
  
  try {
    // Get earnings summary
    const earningsDoc = await db.collection('creator_earnings').doc(userId).get();
    
    if (!earningsDoc.exists) {
      // Return zero earnings if document doesn't exist
      return {
        userId,
        totalTokensEarnedAllTime: 0,
        totalTokensEarned30d: 0,
        totalTokensEarned90d: 0,
        tokensFromChatMessagesAllTime: 0,
        tokensFromBoostsAllTime: 0,
        tokensFromPaidMediaAllTime: 0,
        tokensFromAiCompanionsAllTime: 0,
        tokensFromChatMessages30d: 0,
        tokensFromBoosts30d: 0,
        tokensFromPaidMedia30d: 0,
        tokensFromAiCompanions30d: 0,
        estimatedFiatValueAllTime: 0,
        lastUpdatedAt: Date.now(),
      };
    }
    
    const earnings = earningsDoc.data() as CreatorEarningsSummary;
    
    // Format response
    const response = {
      userId: earnings.userId,
      totalTokensEarnedAllTime: earnings.totalTokensEarnedAllTime || 0,
      totalTokensEarned30d: earnings.totalTokensEarned30d || 0,
      totalTokensEarned90d: earnings.totalTokensEarned90d || 0,
      tokensFromChatMessagesAllTime: earnings.tokensFromChatMessagesAllTime || 0,
      tokensFromBoostsAllTime: earnings.tokensFromBoostsAllTime || 0,
      tokensFromPaidMediaAllTime: earnings.tokensFromPaidMediaAllTime || 0,
      tokensFromAiCompanionsAllTime: earnings.tokensFromAiCompanionsAllTime || 0,
      tokensFromChatMessages30d: earnings.tokensFromChatMessages30d || 0,
      tokensFromBoosts30d: earnings.tokensFromBoosts30d || 0,
      tokensFromPaidMedia30d: earnings.tokensFromPaidMedia30d || 0,
      tokensFromAiCompanions30d: earnings.tokensFromAiCompanions30d || 0,
      estimatedFiatValueAllTime: 0, // Optional, set to 0 as not implemented
      lastUpdatedAt: earnings.lastUpdatedAt.toMillis(),
    };
    
    return response;
  } catch (error) {
    console.error('Error fetching creator earnings summary:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch earnings summary');
  }
});

// ============================================================================
// ENDPOINT: GET /creator/earnings/activity
// ============================================================================

export const getCreatorEarningsActivity = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const requestedUserId = data.userId;
  const limit = data.limit || 20;
  const cursor = data.cursor;
  
  // Security: users can only view their own earnings
  if (requestedUserId && requestedUserId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'You can only view your own earnings');
  }
  
  try {
    // Build query
    let query = db.collection('token_earn_events')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1); // +1 for pagination
    
    // Apply cursor
    if (cursor) {
      const cursorDoc = await db.collection('token_earn_events').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    
    const snapshot = await query.get();
    
    // Process events
    const events: CreatorEarningsEvent[] = [];
    snapshot.forEach(doc => {
      const event = doc.data() as TokenEarnEvent;
      events.push({
        id: doc.id,
        type: event.type,
        counterpartyId: event.counterpartyId,
        tokensEarned: event.tokensEarned,
        createdAt: event.createdAt.toMillis(),
      });
    });
    
    // Determine pagination
    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? items[items.length - 1].id : null;
    
    return {
      items,
      nextCursor,
    };
  } catch (error) {
    console.error('Error fetching creator earnings activity:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch earnings activity');
  }
});

// ============================================================================
// AGGREGATION FUNCTION (Scheduled)
// ============================================================================

export const aggregateCreatorEarnings = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    console.log('Starting creator earnings aggregation...');
    
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      
      // Get all unique earner user IDs
      const earnersSnapshot = await db.collection('creator_profiles')
        .where('earnsFromChat', '==', true)
        .get();
      
      const earnerIds: string[] = [];
      earnersSnapshot.forEach(doc => {
        earnerIds.push(doc.id);
      });
      
      console.log(`Aggregating earnings for ${earnerIds.length} creators...`);
      
      // Process in batches
      const batchSize = 10;
      for (let i = 0; i < earnerIds.length; i += batchSize) {
        const batch = earnerIds.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (userId) => {
          try {
            // Get all-time events
            const allTimeSnapshot = await db.collection('token_earn_events')
              .where('userId', '==', userId)
              .get();
            
            // Get 30-day events
            const thirtyDaySnapshot = await db.collection('token_earn_events')
              .where('userId', '==', userId)
              .where('createdAt', '>=', thirtyDaysAgo)
              .get();
            
            // Get 90-day events
            const ninetyDaySnapshot = await db.collection('token_earn_events')
              .where('userId', '==', userId)
              .where('createdAt', '>=', ninetyDaysAgo)
              .get();
            
            // Calculate aggregates
            const aggregates = {
              totalTokensEarnedAllTime: 0,
              tokensFromChatMessagesAllTime: 0,
              tokensFromBoostsAllTime: 0,
              tokensFromPaidMediaAllTime: 0,
              tokensFromAiCompanionsAllTime: 0,
              totalTokensEarned30d: 0,
              tokensFromChatMessages30d: 0,
              tokensFromBoosts30d: 0,
              tokensFromPaidMedia30d: 0,
              tokensFromAiCompanions30d: 0,
              totalTokensEarned90d: 0,
            };
            
            // All-time aggregation
            allTimeSnapshot.forEach(doc => {
              const event = doc.data() as TokenEarnEvent;
              aggregates.totalTokensEarnedAllTime += event.tokensEarned;
              
              switch (event.type) {
                case 'CHAT_MESSAGE':
                  aggregates.tokensFromChatMessagesAllTime += event.tokensEarned;
                  break;
                case 'BOOST':
                  aggregates.tokensFromBoostsAllTime += event.tokensEarned;
                  break;
                case 'PAID_MEDIA':
                  aggregates.tokensFromPaidMediaAllTime += event.tokensEarned;
                  break;
                case 'AI_COMPANION':
                  aggregates.tokensFromAiCompanionsAllTime += event.tokensEarned;
                  break;
              }
            });
            
            // 30-day aggregation
            thirtyDaySnapshot.forEach(doc => {
              const event = doc.data() as TokenEarnEvent;
              aggregates.totalTokensEarned30d += event.tokensEarned;
              
              switch (event.type) {
                case 'CHAT_MESSAGE':
                  aggregates.tokensFromChatMessages30d += event.tokensEarned;
                  break;
                case 'BOOST':
                  aggregates.tokensFromBoosts30d += event.tokensEarned;
                  break;
                case 'PAID_MEDIA':
                  aggregates.tokensFromPaidMedia30d += event.tokensEarned;
                  break;
                case 'AI_COMPANION':
                  aggregates.tokensFromAiCompanions30d += event.tokensEarned;
                  break;
              }
            });
            
            // 90-day aggregation
            ninetyDaySnapshot.forEach(doc => {
              const event = doc.data() as TokenEarnEvent;
              aggregates.totalTokensEarned90d += event.tokensEarned;
            });
            
            // Update creator_earnings document
            await db.collection('creator_earnings').doc(userId).set({
              userId,
              ...aggregates,
              lastUpdatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            
            console.log(`Aggregated earnings for user ${userId}`);
          } catch (error) {
            console.error(`Error aggregating earnings for user ${userId}:`, error);
          }
        }));
        
        // Small delay between batches to avoid overwhelming Firestore
        if (i + batchSize < earnerIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log('Creator earnings aggregation completed');
    } catch (error) {
      console.error('Error in creator earnings aggregation:', error);
    }
  });

// ============================================================================
// HELPER FUNCTION: Record Token Earn Event
// ============================================================================

export async function recordTokenEarnEvent(
  userId: string,
  counterpartyId: string,
  type: 'CHAT_MESSAGE' | 'BOOST' | 'PAID_MEDIA' | 'AI_COMPANION',
  tokensEarned: number
): Promise<void> {
  try {
    await db.collection('token_earn_events').add({
      userId,
      counterpartyId,
      type,
      tokensEarned,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Error recording token earn event:', error);
    throw error;
  }
}