/**
 * PACK 75 - Call Service (Mobile)
 * 
 * Client-side service for voice & video calling
 * Interfaces with backend call endpoints
 */

import { getAuth } from 'firebase/auth';
import { collection, doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';

export type CallMode = 'VOICE' | 'VIDEO';
export type CallType = CallMode; // Alias for backward compatibility
export type CallOrigin = 'DIRECT' | 'RESERVATION';
export type CallStatus = 
  | 'CREATED'
  | 'RINGING'
  | 'ACCEPTED'
  | 'ACTIVE'
  | 'ENDED'
  | 'CANCELLED'
  | 'MISSED'
  | 'FAILED'
  | 'INSUFFICIENT_FUNDS';

export interface CallSession {
  callId: string;
  signalingChannelId: string;
  mode: CallMode;
  tokensPerMinute: number;
  status: CallStatus;
  callerUserId?: string;
  calleeUserId?: string;
  startedAt?: number;
  endedAt?: number;
  billedMinutes?: number;
  totalTokensCharged?: number;
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
}): Promise<CallSession> {
  try {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('/api/calls/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create call');
    }

    const data = await response.json();

    return {
      callId: data.callId,
      signalingChannelId: data.signalingChannelId,
      tokensPerMinute: data.tokensPerMinute,
      mode: data.mode,
      status: 'CREATED'
    };
  } catch (error: any) {
    console.error('Create call error:', error);
    throw error;
  }
}

/**
 * Start ringing (notify callee)
 */
export async function startRinging(
  callId: string,
  callerUserId: string
): Promise<void> {
  try {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('/api/calls/start-ringing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ callId, callerUserId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to start ringing');
    }
  } catch (error: any) {
    console.error('Start ringing error:', error);
    throw error;
  }
}

/**
 * Accept an incoming call
 */
export async function acceptCall(
  callId: string,
  calleeUserId: string
): Promise<CallSession> {
  try {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('/api/calls/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ callId, calleeUserId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to accept call');
    }

    const data = await response.json();

    return {
      callId: data.callId,
      signalingChannelId: data.signalingChannelId,
      tokensPerMinute: 0, // Will be fetched from Firestore
      mode: 'VOICE', // Will be fetched from Firestore
      status: 'ACCEPTED'
    };
  } catch (error: any) {
    console.error('Accept call error:', error);
    throw error;
  }
}

/**
 * Reject an incoming call
 */
export async function rejectCall(
  callId: string,
  calleeUserId: string
): Promise<void> {
  try {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('/api/calls/reject', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ callId, calleeUserId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to reject call');
    }
  } catch (error: any) {
    console.error('Reject call error:', error);
    throw error;
  }
}

/**
 * Mark call as active (media connected)
 */
export async function markCallActive(
  callId: string,
  participantUserId: string
): Promise<void> {
  try {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('/api/calls/mark-active', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ callId, participantUserId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to mark call active');
    }
  } catch (error: any) {
    console.error('Mark call active error:', error);
    throw error;
  }
}

/**
 * End an active call
 */
export async function endCall(
  callId: string,
  endedByUserId?: string
): Promise<void> {
  try {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('/api/calls/end', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ callId, endedByUserId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to end call');
    }
  } catch (error: any) {
    console.error('End call error:', error);
    throw error;
  }
}

/**
 * Subscribe to call session updates via Firestore
 * Returns unsubscribe function
 */
export function subscribeToCallSession(
  callId: string,
  onUpdate: (session: CallSession) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  try {
    const callRef = doc(db, 'call_sessions', callId);

    return onSnapshot(
      callRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          
          const session: CallSession = {
            callId: data.callId,
            signalingChannelId: data.signalingChannelId,
            mode: data.mode,
            tokensPerMinute: data.tokensPerMinute,
            status: data.status,
            callerUserId: data.callerUserId,
            calleeUserId: data.calleeUserId,
            startedAt: data.startedAt?.toMillis(),
            endedAt: data.endedAt?.toMillis(),
            billedMinutes: data.billedMinutes,
            totalTokensCharged: data.totalTokensCharged
          };

          onUpdate(session);
        }
      },
      (error) => {
        console.error('Call session subscription error:', error);
        if (onError) {
          onError(error as Error);
        }
      }
    );
  } catch (error) {
    console.error('Subscribe to call session error:', error);
    if (onError) {
      onError(error as Error);
    }
    return () => {}; // Return no-op unsubscribe
  }
}

/**
 * Check if user has sufficient balance for a call
 */
export async function checkCallBalance(
  userId: string,
  tokensPerMinute: number
): Promise<{ sufficient: boolean; balance: number; required: number }> {
  try {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();

    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('/api/calls/check-balance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ userId, tokensPerMinute })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to check balance');
    }

    return await response.json();
  } catch (error: any) {
    console.error('Check call balance error:', error);
    // Return safe default
    return {
      sufficient: false,
      balance: 0,
      required: tokensPerMinute * 2
    };
  }
}

/**
 * Format call duration for display
 */
export function formatCallDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }
  
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Calculate estimated cost for call duration
 */
export function calculateCallCost(
  durationSeconds: number,
  tokensPerMinute: number
): number {
  const minutes = Math.ceil(durationSeconds / 60);
  return minutes * tokensPerMinute;
}