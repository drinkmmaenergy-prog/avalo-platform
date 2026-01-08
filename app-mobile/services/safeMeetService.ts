/**
 * Safe-Meet Service
 * Phase 25: Client-side wrapper for Safe-Meet functionality
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

// ============================================================================
// TYPES
// ============================================================================

export type SafeMeetStatus = 
  | 'PENDING' 
  | 'ACTIVE' 
  | 'ENDED' 
  | 'SOS_TRIGGERED' 
  | 'CANCELLED';

export type SafeMeetSOSSource = 'SOS_PIN' | 'SOS_BUTTON';

export interface SafeMeetSession {
  sessionId: string;
  hostId: string;
  guestId: string | null;
  status: SafeMeetStatus;
  sessionToken: string;
  approxLocation?: {
    city: string;
    country: string;
  };
  meetingNote?: string;
  createdAt: any;
  startedAt?: any;
  endedAt?: any;
  lastUpdatedAt: any;
}

export interface TrustedContact {
  userId: string;
  name: string;
  phone: string;
  email: string;
  lastUpdatedAt: any;
  createdAt: any;
}

export interface CreateSessionInput {
  approxLocation?: {
    city: string;
    country: string;
  };
  meetingNote?: string;
}

export interface SessionResponse {
  success: boolean;
  session?: SafeMeetSession;
  error?: string;
}

export interface TrustedContactResponse {
  success: boolean;
  contact?: TrustedContact;
  error?: string;
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Create a new Safe-Meet session
 */
export async function createSession(
  input: CreateSessionInput
): Promise<SessionResponse> {
  try {
    const functions = getFunctions(getApp());
    const createSessionFn = httpsCallable<CreateSessionInput, SessionResponse>(
      functions,
      'safeMeet_createSession'
    );
    
    const result = await createSessionFn(input);
    return result.data;
  } catch (error: any) {
    console.error('Error creating Safe-Meet session:', error);
    return {
      success: false,
      error: error.message || 'Failed to create session',
    };
  }
}

/**
 * Join a Safe-Meet session by scanning QR code
 */
export async function joinSessionByToken(
  sessionToken: string
): Promise<SessionResponse> {
  try {
    const functions = getFunctions(getApp());
    const joinSessionFn = httpsCallable<
      { sessionToken: string },
      SessionResponse
    >(functions, 'safeMeet_joinSessionByToken');
    
    const result = await joinSessionFn({ sessionToken });
    return result.data;
  } catch (error: any) {
    console.error('Error joining Safe-Meet session:', error);
    return {
      success: false,
      error: error.message || 'Failed to join session',
    };
  }
}

/**
 * End a Safe-Meet session normally
 */
export async function endSession(
  sessionId: string
): Promise<SessionResponse> {
  try {
    const functions = getFunctions(getApp());
    const endSessionFn = httpsCallable<
      { sessionId: string },
      SessionResponse
    >(functions, 'safeMeet_endSession');
    
    const result = await endSessionFn({ sessionId });
    return result.data;
  } catch (error: any) {
    console.error('Error ending Safe-Meet session:', error);
    return {
      success: false,
      error: error.message || 'Failed to end session',
    };
  }
}

/**
 * Trigger SOS for a Safe-Meet session
 */
export async function triggerSOS(
  sessionId: string,
  source: SafeMeetSOSSource
): Promise<{ success: boolean; error?: string }> {
  try {
    const functions = getFunctions(getApp());
    const triggerSOSFn = httpsCallable<
      { sessionId: string; source: SafeMeetSOSSource },
      { success: boolean; error?: string }
    >(functions, 'safeMeet_triggerSOS');
    
    const result = await triggerSOSFn({ sessionId, source });
    return result.data;
  } catch (error: any) {
    console.error('Error triggering SOS:', error);
    return {
      success: false,
      error: error.message || 'Failed to trigger SOS',
    };
  }
}

/**
 * Get user's Safe-Meet sessions
 */
export async function getUserSessions(
  limit?: number
): Promise<SafeMeetSession[]> {
  try {
    const functions = getFunctions(getApp());
    const getSessionsFn = httpsCallable<
      { limit?: number },
      { success: boolean; sessions: SafeMeetSession[] }
    >(functions, 'safeMeet_getUserSessions');
    
    const result = await getSessionsFn({ limit });
    return result.data.sessions || [];
  } catch (error: any) {
    console.error('Error getting Safe-Meet sessions:', error);
    return [];
  }
}

/**
 * Get user's trusted contact
 */
export async function getTrustedContact(): Promise<TrustedContact | null> {
  try {
    const functions = getFunctions(getApp());
    const getContactFn = httpsCallable<
      {},
      { success: boolean; contact: TrustedContact | null }
    >(functions, 'safeMeet_getTrustedContact');
    
    const result = await getContactFn({});
    return result.data.contact || null;
  } catch (error: any) {
    console.error('Error getting trusted contact:', error);
    return null;
  }
}

/**
 * Set or update user's trusted contact
 */
export async function setTrustedContact(payload: {
  name: string;
  phone: string;
  email: string;
}): Promise<TrustedContactResponse> {
  try {
    const functions = getFunctions(getApp());
    const setContactFn = httpsCallable<
      { name: string; phone: string; email: string },
      TrustedContactResponse
    >(functions, 'safeMeet_setTrustedContact');
    
    const result = await setContactFn(payload);
    return result.data;
  } catch (error: any) {
    console.error('Error setting trusted contact:', error);
    return {
      success: false,
      error: error.message || 'Failed to set trusted contact',
    };
  }
}

/**
 * Get status badge color for UI
 */
export function getStatusColor(status: SafeMeetStatus): string {
  switch (status) {
    case 'PENDING':
      return '#FFA500'; // Orange
    case 'ACTIVE':
      return '#28A745'; // Green
    case 'ENDED':
      return '#6C757D'; // Gray
    case 'SOS_TRIGGERED':
      return '#DC3545'; // Red
    case 'CANCELLED':
      return '#6C757D'; // Gray
    default:
      return '#6C757D';
  }
}

/**
 * Get status label in Polish
 */
export function getStatusLabel(status: SafeMeetStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Oczekujące';
    case 'ACTIVE':
      return 'Aktywne';
    case 'ENDED':
      return 'Zakończone';
    case 'SOS_TRIGGERED':
      return 'ALARM';
    case 'CANCELLED':
      return 'Anulowane';
    default:
      return 'Nieznane';
  }
}