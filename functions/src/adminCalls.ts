/**
 * PACK 75 - Admin Call Management Endpoints
 * 
 * Admin-only endpoints for viewing call history and details
 * NO MUTATING OPERATIONS - read-only for observability
 */

import { db } from './init.js';
import { Timestamp } from 'firebase-admin/firestore';

interface CallSession {
  callId: string;
  callerUserId: string;
  calleeUserId: string;
  mode: 'VOICE' | 'VIDEO';
  origin: 'DIRECT' | 'RESERVATION';
  relatedReservationId?: string | null;
  tokensPerMinute: number;
  status: string;
  createdAt: Timestamp;
  startedAt?: Timestamp | null;
  endedAt?: Timestamp | null;
  billedMinutes: number;
  totalTokensCharged: number;
  billingStatus: string;
}

interface CallSummary {
  callId: string;
  mode: 'VOICE' | 'VIDEO';
  status: string;
  billedMinutes: number;
  totalTokensCharged: number;
  origin: 'DIRECT' | 'RESERVATION';
  relatedReservationId: string | null;
  createdAt: number; // milliseconds
}

/**
 * Get call history for a specific user
 * Admin-only endpoint
 */
export async function listCallsForUser(params: {
  userId: string;
  limit?: number;
  cursor?: string;
}): Promise<{
  items: CallSummary[];
  nextCursor?: string;
}> {
  const { userId, limit = 50, cursor } = params;

  try {
    let query = db.collection('call_sessions')
      .where('callerUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (cursor) {
      const cursorDoc = await db.collection('call_sessions').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();

    const items: CallSummary[] = snapshot.docs.map(doc => {
      const data = doc.data() as CallSession;
      return {
        callId: data.callId,
        mode: data.mode,
        status: data.status,
        billedMinutes: data.billedMinutes,
        totalTokensCharged: data.totalTokensCharged,
        origin: data.origin,
        relatedReservationId: data.relatedReservationId || null,
        createdAt: data.createdAt.toMillis()
      };
    });

    const nextCursor = snapshot.docs.length === limit 
      ? snapshot.docs[snapshot.docs.length - 1].id 
      : undefined;

    return { items, nextCursor };
  } catch (error) {
    console.error('Error listing calls for user:', error);
    throw error;
  }
}

/**
 * Get detailed information about a specific call
 * Admin-only endpoint
 */
export async function getCallDetail(callId: string): Promise<{
  call: CallSession;
  callerInfo: { userId: string; displayName?: string };
  calleeInfo: { userId: string; displayName?: string };
  billingBreakdown: {
    tokensCharged: number;
    calleeEarnings: number;
    avaloRevenue: number;
  };
} | null> {
  try {
    const callDoc = await db.collection('call_sessions').doc(callId).get();

    if (!callDoc.exists) {
      return null;
    }

    const callData = callDoc.data() as CallSession;

    // Fetch user info
    const [callerDoc, calleeDoc] = await Promise.all([
      db.collection('users').doc(callData.callerUserId).get(),
      db.collection('users').doc(callData.calleeUserId).get()
    ]);

    const callerInfo = {
      userId: callData.callerUserId,
      displayName: callerDoc.exists ? callerDoc.data()?.displayName : undefined
    };

    const calleeInfo = {
      userId: callData.calleeUserId,
      displayName: calleeDoc.exists ? calleeDoc.data()?.displayName : undefined
    };

    // Calculate billing breakdown (65/35 split)
    const tokensCharged = callData.totalTokensCharged;
    const calleeEarnings = Math.floor(tokensCharged * 0.65);
    const avaloRevenue = tokensCharged - calleeEarnings;

    return {
      call: callData,
      callerInfo,
      calleeInfo,
      billingBreakdown: {
        tokensCharged,
        calleeEarnings,
        avaloRevenue
      }
    };
  } catch (error) {
    console.error('Error getting call detail:', error);
    throw error;
  }
}

/**
 * Get call statistics for admin dashboard
 */
export async function getCallStats(params: {
  periodHours?: number;
}): Promise<{
  totalCalls: number;
  activeCalls: number;
  completedCalls: number;
  totalMinutes: number;
  totalRevenue: number;
  voiceCalls: number;
  videoCalls: number;
}> {
  const { periodHours = 24 } = params;

  try {
    const threshold = Timestamp.fromDate(
      new Date(Date.now() - periodHours * 60 * 60 * 1000)
    );

    const snapshot = await db.collection('call_sessions')
      .where('createdAt', '>=', threshold)
      .get();

    let totalCalls = 0;
    let activeCalls = 0;
    let completedCalls = 0;
    let totalMinutes = 0;
    let totalRevenue = 0;
    let voiceCalls = 0;
    let videoCalls = 0;

    snapshot.forEach(doc => {
      const data = doc.data() as CallSession;
      totalCalls++;

      if (data.status === 'ACTIVE') {
        activeCalls++;
      }

      if (data.status === 'ENDED') {
        completedCalls++;
        totalMinutes += data.billedMinutes;
        totalRevenue += data.totalTokensCharged;
      }

      if (data.mode === 'VOICE') {
        voiceCalls++;
      } else if (data.mode === 'VIDEO') {
        videoCalls++;
      }
    });

    return {
      totalCalls,
      activeCalls,
      completedCalls,
      totalMinutes,
      totalRevenue,
      voiceCalls,
      videoCalls
    };
  } catch (error) {
    console.error('Error getting call stats:', error);
    throw error;
  }
}