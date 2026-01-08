/**
 * PACK 75 - Call Lifecycle Management
 * 
 * Handles call signaling and state machine for voice/video calls
 * Endpoints: create, start-ringing, accept, reject, mark-active, end
 * 
 * NO FREE CALLS - all billing enforced via callBilling module
 */

import { db, serverTimestamp, generateId } from './init.js';
import { Timestamp } from 'firebase-admin/firestore';
import { getCallPricing } from './callPricing.js';
import { billCall, checkCallBalance } from './callBilling.js';
import { logEvent } from './observability.js';
import { checkAndIncrementRateLimit, hashIpAddress, createRateLimitError } from './rateLimit.js';

type CallMode = 'VOICE' | 'VIDEO';
type CallOrigin = 'DIRECT' | 'RESERVATION';
type CallStatus = 
  | 'CREATED'
  | 'RINGING'
  | 'ACCEPTED'
  | 'ACTIVE'
  | 'ENDED'
  | 'CANCELLED'
  | 'MISSED'
  | 'FAILED'
  | 'INSUFFICIENT_FUNDS';

interface CallSession {
  callId: string;
  callerUserId: string;
  calleeUserId: string;
  mode: CallMode;
  origin: CallOrigin;
  relatedReservationId?: string | null;
  tokensPerMinute: number;
  pricingProfile?: string | null;
  status: CallStatus;
  signalingChannelId: string;
  providerSessionId?: string | null;
  createdAt: Timestamp;
  ringingAt?: Timestamp | null;
  acceptedAt?: Timestamp | null;
  startedAt?: Timestamp | null;
  endedAt?: Timestamp | null;
  billedMinutes: number;
  totalTokensCharged: number;
  billingStatus: 'PENDING' | 'CHARGED' | 'FAILED' | 'PARTIALLY_CHARGED';
  disconnectedBy?: 'CALLER' | 'CALLEE' | 'SYSTEM' | null;
  endedReason?: 'NORMAL' | 'DECLINED' | 'NO_ANSWER' | 'NETWORK_ERROR' | 'INSUFFICIENT_FUNDS' | 'OTHER';
  lastUpdatedAt: Timestamp;
}

/**
 * Create a new call session
 */
export async function createCall(params: {
  callerUserId: string;
  calleeUserId: string;
  mode: CallMode;
  origin?: CallOrigin;
  relatedReservationId?: string;
  deviceId?: string;
  ipAddress?: string;
}): Promise<{
  callId: string;
  signalingChannelId: string;
  tokensPerMinute: number;
  mode: CallMode;
}> {
  const {
    callerUserId,
    calleeUserId,
    mode,
    origin = 'DIRECT',
    relatedReservationId,
    deviceId,
    ipAddress
  } = params;

  try {
    // Rate limiting
    const rateLimitResult = await checkAndIncrementRateLimit({
      action: 'CALL_CREATE',
      context: {
        userId: callerUserId,
        deviceId: deviceId || null,
        ipHash: ipAddress ? hashIpAddress(ipAddress) : null,
        environment: 'PROD'
      }
    });

    if (!rateLimitResult.allowed) {
      throw new Error(rateLimitResult.reason || 'Rate limit exceeded');
    }

    // Validation
    if (callerUserId === calleeUserId) {
      throw new Error('Cannot call yourself');
    }

    // Check both users are active (not hard-banned)
    const [callerDoc, calleeDoc] = await Promise.all([
      db.collection('users').doc(callerUserId).get(),
      db.collection('users').doc(calleeUserId).get()
    ]);

    if (!callerDoc.exists || !calleeDoc.exists) {
      throw new Error('User not found');
    }

    // Check if users are blocked
    const callerData = callerDoc.data();
    const calleeData = calleeDoc.data();

    if (callerData?.status === 'HARD_BANNED' || calleeData?.status === 'HARD_BANNED') {
      throw new Error('User is banned');
    }

    // Check if callee has blocked caller
    const blockSnapshot = await db.collection('blocks')
      .where('blockerId', '==', calleeUserId)
      .where('blockedUserId', '==', callerUserId)
      .limit(1)
      .get();

    if (!blockSnapshot.empty) {
      throw new Error('Cannot call blocked user');
    }

    // Get call pricing
    const pricing = await getCallPricing(callerUserId, calleeUserId, mode);

    // Check caller has minimum balance (enough for 1-2 minutes)
    const balanceCheck = await checkCallBalance(callerUserId, pricing.tokensPerMinute, 2);

    if (!balanceCheck.sufficient) {
      throw new Error(`Insufficient balance. Required: ${balanceCheck.required}, Available: ${balanceCheck.balance}`);
    }

    // Generate call session
    const callId = generateId();
    const signalingChannelId = generateId();

    const callSession: CallSession = {
      callId,
      callerUserId,
      calleeUserId,
      mode,
      origin,
      relatedReservationId: relatedReservationId || null,
      tokensPerMinute: pricing.tokensPerMinute,
      pricingProfile: pricing.pricingProfile || null,
      status: 'CREATED',
      signalingChannelId,
      providerSessionId: null,
      createdAt: Timestamp.now(),
      ringingAt: null,
      acceptedAt: null,
      startedAt: null,
      endedAt: null,
      billedMinutes: 0,
      totalTokensCharged: 0,
      billingStatus: 'PENDING',
      disconnectedBy: null,
      endedReason: null,
      lastUpdatedAt: Timestamp.now()
    };

    await db.collection('call_sessions').doc(callId).set(callSession);

    await logEvent({
      level: 'INFO',
      source: 'BACKEND',
      service: 'functions.calls',
      module: 'CALLS',
      message: `Call created: ${mode} call from ${callerUserId} to ${calleeUserId}`,
      context: {
        userId: callerUserId,
        functionName: 'createCall'
      },
      details: {
        extra: {
          callId,
          mode,
          tokensPerMinute: pricing.tokensPerMinute
        }
      }
    });

    return {
      callId,
      signalingChannelId,
      tokensPerMinute: pricing.tokensPerMinute,
      mode
    };

  } catch (error: any) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.calls',
      module: 'CALLS',
      message: `Create call failed: ${error.message}`,
      context: {
        userId: callerUserId,
        functionName: 'createCall'
      },
      details: {
        stackSnippet: error.stack?.split('\n').slice(0, 10).join('\n')
      }
    });

    throw error;
  }
}

/**
 * Start ringing (caller initiated)
 */
export async function startRinging(params: {
  callId: string;
  callerUserId: string;
}): Promise<void> {
  const { callId, callerUserId } = params;

  try {
    const callDoc = await db.collection('call_sessions').doc(callId).get();

    if (!callDoc.exists) {
      throw new Error('Call not found');
    }

    const callData = callDoc.data() as CallSession;

    if (callData.callerUserId !== callerUserId) {
      throw new Error('Only caller can start ringing');
    }

    if (callData.status !== 'CREATED') {
      throw new Error(`Cannot start ringing from status ${callData.status}`);
    }

    await db.collection('call_sessions').doc(callId).update({
      status: 'RINGING',
      ringingAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp()
    });

    // TODO: Send push notification to callee (future pack)

  } catch (error: any) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.calls',
      module: 'CALLS',
      message: `Start ringing failed: ${error.message}`,
      context: {
        userId: callerUserId,
        functionName: 'startRinging'
      },
      details: {
        extra: { callId }
      }
    });

    throw error;
  }
}

/**
 * Accept call (callee action)
 */
export async function acceptCall(params: {
  callId: string;
  calleeUserId: string;
}): Promise<{ callId: string; signalingChannelId: string }> {
  const { callId, calleeUserId } = params;

  try {
    // Rate limiting
    const rateLimitResult = await checkAndIncrementRateLimit({
      action: 'CALL_ACCEPT',
      context: {
        userId: calleeUserId,
        deviceId: null,
        ipHash: null,
        environment: 'PROD'
      }
    });

    if (!rateLimitResult.allowed) {
      throw new Error(rateLimitResult.reason || 'Rate limit exceeded');
    }

    const callDoc = await db.collection('call_sessions').doc(callId).get();

    if (!callDoc.exists) {
      throw new Error('Call not found');
    }

    const callData = callDoc.data() as CallSession;

    if (callData.calleeUserId !== calleeUserId) {
      throw new Error('Only callee can accept call');
    }

    if (callData.status !== 'RINGING' && callData.status !== 'CREATED') {
      throw new Error(`Cannot accept call from status ${callData.status}`);
    }

    await db.collection('call_sessions').doc(callId).update({
      status: 'ACCEPTED',
      acceptedAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp()
    });

    return {
      callId,
      signalingChannelId: callData.signalingChannelId
    };

  } catch (error: any) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.calls',
      module: 'CALLS',
      message: `Accept call failed: ${error.message}`,
      context: {
        userId: calleeUserId,
        functionName: 'acceptCall'
      },
      details: {
        extra: { callId }
      }
    });

    throw error;
  }
}

/**
 * Reject call (callee action)
 */
export async function rejectCall(params: {
  callId: string;
  calleeUserId: string;
}): Promise<void> {
  const { callId, calleeUserId } = params;

  try {
    const callDoc = await db.collection('call_sessions').doc(callId).get();

    if (!callDoc.exists) {
      throw new Error('Call not found');
    }

    const callData = callDoc.data() as CallSession;

    if (callData.calleeUserId !== calleeUserId) {
      throw new Error('Only callee can reject call');
    }

    if (callData.status !== 'RINGING' && callData.status !== 'CREATED') {
      throw new Error(`Cannot reject call from status ${callData.status}`);
    }

    // Determine if CANCELLED or MISSED based on timing
    const status: CallStatus = callData.ringingAt ? 'MISSED' : 'CANCELLED';

    await db.collection('call_sessions').doc(callId).update({
      status,
      endedAt: serverTimestamp(),
      disconnectedBy: 'CALLEE',
      endedReason: 'DECLINED',
      billingStatus: 'CHARGED', // No billing for rejected calls
      lastUpdatedAt: serverTimestamp()
    });

  } catch (error: any) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.calls',
      module: 'CALLS',
      message: `Reject call failed: ${error.message}`,
      context: {
        userId: calleeUserId,
        functionName: 'rejectCall'
      },
      details: {
        extra: { callId }
      }
    });

    throw error;
  }
}

/**
 * Mark call as active (media connected)
 */
export async function markCallActive(params: {
  callId: string;
  participantUserId: string;
}): Promise<void> {
  const { callId, participantUserId } = params;

  try {
    const callDoc = await db.collection('call_sessions').doc(callId).get();

    if (!callDoc.exists) {
      throw new Error('Call not found');
    }

    const callData = callDoc.data() as CallSession;

    if (callData.callerUserId !== participantUserId && callData.calleeUserId !== participantUserId) {
      throw new Error('Only participants can mark call active');
    }

    if (callData.status !== 'ACCEPTED') {
      throw new Error(`Cannot mark active from status ${callData.status}`);
    }

    // Only set startedAt once (first participant to call this)
    if (!callData.startedAt) {
      await db.collection('call_sessions').doc(callId).update({
        status: 'ACTIVE',
        startedAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp()
      });
    }

  } catch (error: any) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.calls',
      module: 'CALLS',
      message: `Mark call active failed: ${error.message}`,
      context: {
        userId: participantUserId,
        functionName: 'markCallActive'
      },
      details: {
        extra: { callId }
      }
    });

    throw error;
  }
}

/**
 * End call and trigger billing
 */
export async function endCall(params: {
  callId: string;
  endedByUserId?: string;
  reason?: 'NORMAL' | 'NETWORK_ERROR' | 'INSUFFICIENT_FUNDS' | 'OTHER';
}): Promise<void> {
  const { callId, endedByUserId, reason = 'NORMAL' } = params;

  try {
    const callDoc = await db.collection('call_sessions').doc(callId).get();

    if (!callDoc.exists) {
      throw new Error('Call not found');
    }

    const callData = callDoc.data() as CallSession;

    // Determine who disconnected
    let disconnectedBy: 'CALLER' | 'CALLEE' | 'SYSTEM' = 'SYSTEM';
    if (endedByUserId) {
      if (endedByUserId === callData.callerUserId) {
        disconnectedBy = 'CALLER';
      } else if (endedByUserId === callData.calleeUserId) {
        disconnectedBy = 'CALLEE';
      }
    }

    // Determine final status
    let finalStatus: CallStatus = 'ENDED';
    if (reason === 'INSUFFICIENT_FUNDS') {
      finalStatus = 'INSUFFICIENT_FUNDS';
    } else if (callData.status === 'CREATED' || callData.status === 'RINGING') {
      finalStatus = 'CANCELLED';
    } else if (callData.status === 'ACCEPTED' && !callData.startedAt) {
      finalStatus = 'FAILED';
    }

    // Update call session
    await db.collection('call_sessions').doc(callId).update({
      status: finalStatus,
      endedAt: callData.endedAt || serverTimestamp(),
      disconnectedBy,
      endedReason: reason,
      lastUpdatedAt: serverTimestamp()
    });

    // Trigger billing if call was active
    if (callData.startedAt && finalStatus !== 'CANCELLED' && finalStatus !== 'FAILED') {
      await billCall(callId);
    } else {
      // No billing for calls that never started
      await db.collection('call_sessions').doc(callId).update({
        billingStatus: 'CHARGED', // Mark as "charged" (nothing to charge)
        billedMinutes: 0,
        totalTokensCharged: 0
      });
    }

    await logEvent({
      level: 'INFO',
      source: 'BACKEND',
      service: 'functions.calls',
      module: 'CALLS',
      message: `Call ended: ${finalStatus}`,
      context: {
        userId: endedByUserId,
        functionName: 'endCall'
      },
      details: {
        extra: {
          callId,
          reason,
          disconnectedBy
        }
      }
    });

  } catch (error: any) {
    await logEvent({
      level: 'ERROR',
      source: 'BACKEND',
      service: 'functions.calls',
      module: 'CALLS',
      message: `End call failed: ${error.message}`,
      context: {
        userId: endedByUserId,
        functionName: 'endCall'
      },
      details: {
        stackSnippet: error.stack?.split('\n').slice(0, 10).join('\n'),
        extra: { callId }
      }
    });

    throw error;
  }
}

/**
 * Get call session details
 */
export async function getCallSession(callId: string): Promise<CallSession | null> {
  try {
    const callDoc = await db.collection('call_sessions').doc(callId).get();
    
    if (!callDoc.exists) {
      return null;
    }

    return callDoc.data() as CallSession;
  } catch (error) {
    console.error('Error fetching call session:', error);
    return null;
  }
}