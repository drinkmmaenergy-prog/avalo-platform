/**
 * Safe-Meet Engine
 * Phase 25: Core business logic for safe offline meetings
 * 
 * Features:
 * - QR-based meeting confirmation
 * - Trusted contact management
 * - SOS functionality with email notifications
 * - Law enforcement queue for supported regions
 * - Integration with Trust Engine
 */

import { db, serverTimestamp, generateId } from './init.js';
import { recordRiskEvent, FraudFlagReason } from './trustEngine.js';
import { 
  SafeMeetSession,
  SafeMeetStatus,
  TrustedContact,
  SafeMeetIncident,
  SafeMeetLawEnforcementQueueItem,
  SafeMeetSOSSource,
  CreateSafeMeetSessionInput,
  JoinSafeMeetSessionInput,
  EndSafeMeetSessionInput,
  TriggerSOSInput,
  SetTrustedContactInput,
  SafeMeetSessionResponse,
  TrustedContactResponse,
} from './types/safeMeet.js';
import {
  SUPPORTED_EMERGENCY_REGIONS,
  SAFE_MEET_MAX_ACTIVE_SESSIONS_PER_USER,
  SAFE_MEET_SOS_TRUST_RISK_POINTS,
  SAFE_MEET_QR_TOKEN_LENGTH,
  SAFE_MEET_MAX_SESSIONS_QUERY,
  isEmergencyRegionSupported,
} from './config/safeMeet.js';

// Simple logger
const logger = {
  info: (..._args: any[]) => {},
  warn: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a short random token for QR codes
 */
function generateSessionToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars
  let token = '';
  for (let i = 0; i < SAFE_MEET_QR_TOKEN_LENGTH; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Validate user exists and is active
 */
async function validateUser(userId: string): Promise<void> {
  const userSnap = await db.collection('users').doc(userId).get();
  
  if (!userSnap.exists) {
    throw new Error('User not found');
  }
  
  const userData = userSnap.data();
  const accountStatus = userData?.accountStatus?.status || 'active';
  
  if (accountStatus !== 'active') {
    throw new Error('Account is not active');
  }
  
  // Check if user is frozen by CSAM Shield
  if (userData?.csamShield?.frozen) {
    throw new Error('Account is frozen for safety review');
  }
}

/**
 * Get user's country code (for law enforcement queue logic)
 */
async function getUserCountryCode(userId: string): Promise<string | null> {
  const userSnap = await db.collection('users').doc(userId).get();
  
  if (!userSnap.exists) {
    return null;
  }
  
  const userData = userSnap.data();
  return userData?.location?.country || null;
}

/**
 * Count active sessions for a user
 */
async function countActiveSessions(userId: string): Promise<number> {
  const activeSessions = await db.collection('safeMeetSessions')
    .where('status', 'in', ['PENDING', 'ACTIVE'])
    .get();
  
  let count = 0;
  activeSessions.docs.forEach(doc => {
    const session = doc.data();
    if (session.hostId === userId || session.guestId === userId) {
      count++;
    }
  });
  
  return count;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Create a new Safe-Meet session
 */
export async function createSafeMeetSession(
  input: CreateSafeMeetSessionInput
): Promise<SafeMeetSessionResponse> {
  try {
    const { userId, approxLocation, meetingNote } = input;
    
    // Validate user
    await validateUser(userId);
    
    // Check session limit
    const activeCount = await countActiveSessions(userId);
    if (activeCount >= SAFE_MEET_MAX_ACTIVE_SESSIONS_PER_USER) {
      return {
        success: false,
        error: `Maximum ${SAFE_MEET_MAX_ACTIVE_SESSIONS_PER_USER} active sessions reached. Please close existing sessions first.`,
      };
    }
    
    // Generate session ID and token
    const sessionId = generateId();
    const sessionToken = generateSessionToken();
    
    // Create session document
    const session: SafeMeetSession = {
      sessionId,
      hostId: userId,
      guestId: null,
      status: 'PENDING',
      sessionToken,
      approxLocation,
      meetingNote,
      createdAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
    };
    
    await db.collection('safeMeetSessions').doc(sessionId).set(session);
    
    logger.info(`Safe-Meet session created: ${sessionId} by user ${userId}`);
    
    return {
      success: true,
      session: {
        ...session,
        createdAt: new Date() as any,
        lastUpdatedAt: new Date() as any,
      },
    };
  } catch (error: any) {
    logger.error('Error creating Safe-Meet session:', error);
    return {
      success: false,
      error: error.message || 'Failed to create session',
    };
  }
}

/**
 * Join a Safe-Meet session by scanning QR code
 */
export async function joinSafeMeetSession(
  input: JoinSafeMeetSessionInput
): Promise<SafeMeetSessionResponse> {
  try {
    const { userId, sessionToken } = input;
    
    // Validate user
    await validateUser(userId);
    
    // Find session by token
    const sessionsSnap = await db.collection('safeMeetSessions')
      .where('sessionToken', '==', sessionToken)
      .where('status', '==', 'PENDING')
      .limit(1)
      .get();
    
    if (sessionsSnap.empty) {
      return {
        success: false,
        error: 'Invalid or expired session token',
      };
    }
    
    const sessionDoc = sessionsSnap.docs[0];
    const session = sessionDoc.data() as SafeMeetSession;
    
    // Validate guest is not the host
    if (session.hostId === userId) {
      return {
        success: false,
        error: 'Cannot join your own session',
      };
    }
    
    // Update session to ACTIVE
    const updates: Partial<SafeMeetSession> = {
      guestId: userId,
      status: 'ACTIVE',
      startedAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
    };
    
    await sessionDoc.ref.update(updates);
    
    logger.info(`User ${userId} joined Safe-Meet session: ${session.sessionId}`);
    
    // Get updated session
    const updatedSnap = await sessionDoc.ref.get();
    const updatedSession = updatedSnap.data() as SafeMeetSession;
    
    return {
      success: true,
      session: updatedSession,
    };
  } catch (error: any) {
    logger.error('Error joining Safe-Meet session:', error);
    return {
      success: false,
      error: error.message || 'Failed to join session',
    };
  }
}

/**
 * End a Safe-Meet session normally
 */
export async function endSafeMeetSession(
  input: EndSafeMeetSessionInput
): Promise<SafeMeetSessionResponse> {
  try {
    const { userId, sessionId } = input;
    
    // Validate user
    await validateUser(userId);
    
    // Get session
    const sessionRef = db.collection('safeMeetSessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();
    
    if (!sessionSnap.exists) {
      return {
        success: false,
        error: 'Session not found',
      };
    }
    
    const session = sessionSnap.data() as SafeMeetSession;
    
    // Validate user is a participant
    if (session.hostId !== userId && session.guestId !== userId) {
      return {
        success: false,
        error: 'You are not a participant in this session',
      };
    }
    
    // Validate session can be ended
    if (session.status === 'ENDED' || session.status === 'CANCELLED') {
      return {
        success: false,
        error: 'Session is already closed',
      };
    }
    
    if (session.status === 'SOS_TRIGGERED') {
      return {
        success: false,
        error: 'Session is under emergency status',
      };
    }
    
    // Update session to ENDED
    await sessionRef.update({
      status: 'ENDED',
      endedAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
    });
    
    logger.info(`Safe-Meet session ended normally: ${sessionId} by user ${userId}`);
    
    // Get updated session
    const updatedSnap = await sessionRef.get();
    const updatedSession = updatedSnap.data() as SafeMeetSession;
    
    return {
      success: true,
      session: updatedSession,
    };
  } catch (error: any) {
    logger.error('Error ending Safe-Meet session:', error);
    return {
      success: false,
      error: error.message || 'Failed to end session',
    };
  }
}

/**
 * Get user's Safe-Meet sessions
 */
export async function getUserSafeMeetSessions(
  userId: string,
  limit: number = SAFE_MEET_MAX_SESSIONS_QUERY
): Promise<SafeMeetSession[]> {
  try {
    // Validate user
    await validateUser(userId);
    
    // Query sessions where user is host or guest
    const sessions: SafeMeetSession[] = [];
    
    // Get sessions as host
    const hostSessions = await db.collection('safeMeetSessions')
      .where('hostId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    
    hostSessions.docs.forEach(doc => {
      sessions.push(doc.data() as SafeMeetSession);
    });
    
    // Get sessions as guest
    const guestSessions = await db.collection('safeMeetSessions')
      .where('guestId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    
    guestSessions.docs.forEach(doc => {
      const session = doc.data() as SafeMeetSession;
      // Only add if not already in list (shouldn't happen, but defensive)
      if (!sessions.find(s => s.sessionId === session.sessionId)) {
        sessions.push(session);
      }
    });
    
    // Sort by creation date (most recent first)
    sessions.sort((a, b) => {
      const timeA = (a.createdAt as any)?.toMillis?.() || 0;
      const timeB = (b.createdAt as any)?.toMillis?.() || 0;
      return timeB - timeA;
    });
    
    return sessions.slice(0, limit);
  } catch (error: any) {
    logger.error('Error getting user sessions:', error);
    return [];
  }
}

// ============================================================================
// SOS FUNCTIONALITY
// ============================================================================

/**
 * Trigger SOS for a Safe-Meet session
 */
export async function triggerSafeMeetSOS(
  input: TriggerSOSInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId, sessionId, source } = input;
    
    // Validate user
    await validateUser(userId);
    
    // Get session
    const sessionRef = db.collection('safeMeetSessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();
    
    if (!sessionSnap.exists) {
      return {
        success: false,
        error: 'Session not found',
      };
    }
    
    const session = sessionSnap.data() as SafeMeetSession;
    
    // Validate user is a participant
    if (session.hostId !== userId && session.guestId !== userId) {
      return {
        success: false,
        error: 'You are not a participant in this session',
      };
    }
    
    // Update session status to SOS_TRIGGERED
    await sessionRef.update({
      status: 'SOS_TRIGGERED',
      endedAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
    });
    
    // Create incident record
    const incidentId = generateId();
    const incident: SafeMeetIncident = {
      incidentId,
      sessionId,
      hostId: session.hostId,
      guestId: session.guestId,
      triggeringUserId: userId,
      source,
      severity: 'HIGH',
      approxLocation: session.approxLocation,
      triggeredAt: serverTimestamp(),
      resolved: false,
      createdAt: serverTimestamp(),
    };
    
    await db.collection('safeMeetIncidents').doc(incidentId).set(incident);
    
    logger.warn(`SOS triggered for session ${sessionId} by user ${userId}, source: ${source}`);
    
    // Record risk event in Trust Engine
    try {
      await recordRiskEvent({
        userId,
        eventType: 'free_pool', // Using free_pool as generic type
        metadata: {
          safeMeetSOS: true,
          sessionId,
          source,
          otherUserId: session.hostId === userId ? session.guestId : session.hostId,
        },
      });
    } catch (trustError: any) {
      // Log but don't fail the SOS trigger
      logger.error('Trust Engine integration failed (non-critical):', trustError);
    }
    
    // Notify trusted contact
    await notifyTrustedContact(userId, session, source);
    
    // Create law enforcement queue if region is supported
    const userCountry = await getUserCountryCode(userId);
    if (userCountry && isEmergencyRegionSupported(userCountry)) {
      await createLawEnforcementQueueItem(
        incident,
        session,
        userId,
        userCountry
      );
    }
    
    return {
      success: true,
    };
  } catch (error: any) {
    logger.error('Error triggering SOS:', error);
    return {
      success: false,
      error: error.message || 'Failed to trigger SOS',
    };
  }
}

/**
 * Notify user's trusted contact via email
 */
async function notifyTrustedContact(
  userId: string,
  session: SafeMeetSession,
  source: SafeMeetSOSSource
): Promise<void> {
  try {
    // Get trusted contact
    const contact = await getTrustedContact(userId);
    
    if (!contact) {
      logger.warn(`No trusted contact found for user ${userId} - skipping notification`);
      return;
    }
    
    // Get user info
    const userSnap = await db.collection('users').doc(userId).get();
    const userData = userSnap.data();
    const userName = userData?.displayName || 'Your contact';
    
    // Prepare email content
    const subject = `[URGENT] Safety Alert - ${userName} Triggered Emergency`;
    
    const text = `
URGENT SAFETY ALERT

${userName} has triggered an emergency alert during a Safe-Meet session.

Session Details:
- Time: ${new Date().toLocaleString()}
- Location: ${session.approxLocation?.city || 'Unknown'}, ${session.approxLocation?.country || 'Unknown'}
- Alert Type: ${source === 'SOS_BUTTON' ? 'Manual SOS Button' : 'SOS PIN'}

This person has designated you as their trusted contact. They may need assistance.

What to do:
1. Try to contact them immediately
2. If you cannot reach them and believe they are in danger, contact local authorities
3. Provide authorities with the information above

This is an automated safety notification from Avalo.
    `.trim();
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
    .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    .content { padding: 20px; background: #f8f9fa; }
    .urgent { color: #dc3545; font-weight: bold; font-size: 18px; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ URGENT SAFETY ALERT</h1>
    </div>
    <div class="content">
      <p class="urgent">${userName} has triggered an emergency alert during a Safe-Meet session.</p>
      
      <div class="alert">
        <p><strong>Session Details:</strong></p>
        <ul>
          <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
          <li><strong>Location:</strong> ${session.approxLocation?.city || 'Unknown'}, ${session.approxLocation?.country || 'Unknown'}</li>
          <li><strong>Alert Type:</strong> ${source === 'SOS_BUTTON' ? 'Manual SOS Button' : 'SOS PIN'}</li>
        </ul>
      </div>
      
      <p>This person has designated you as their trusted contact. They may need assistance.</p>
      
      <p><strong>What to do:</strong></p>
      <ol>
        <li>Try to contact them immediately</li>
        <li>If you cannot reach them and believe they are in danger, contact local authorities</li>
        <li>Provide authorities with the information above</li>
      </ol>
    </div>
    <div class="footer">
      <p>This is an automated safety notification from Avalo.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
    
    // Send email using existing sendgrid integration
    try {
      const sendgridModule = await import('./sendgrid.js');
      
      // Use the security breach alert function as it's suitable for urgent notifications
      if (sendgridModule.sendSecurityBreachAlert) {
        await sendgridModule.sendSecurityBreachAlert(
          userId,
          contact.email,
          {
            type: 'Safe-Meet Emergency Alert',
            detectedAt: new Date().toLocaleString(),
            device: session.approxLocation?.city || 'Unknown location',
            actionTaken: `${userName} triggered SOS during a Safe-Meet session. Please contact them immediately.`,
          }
        );
        logger.info(`Trusted contact notified for user ${userId}`);
      } else {
        logger.warn('SendGrid function not available - email not sent');
      }
    } catch (emailError: any) {
      logger.error('Failed to send email via SendGrid:', emailError);
      // Continue - don't fail SOS on email error
    }
  } catch (error: any) {
    // Log but don't throw - SOS should succeed even if email fails
    logger.error('Failed to notify trusted contact:', error);
  }
}

/**
 * Create law enforcement queue item for supported regions
 */
async function createLawEnforcementQueueItem(
  incident: SafeMeetIncident,
  session: SafeMeetSession,
  reportingUserId: string,
  country: string
): Promise<void> {
  try {
    const queueId = generateId();
    
    const queueItem: SafeMeetLawEnforcementQueueItem = {
      queueId,
      incidentId: incident.incidentId,
      sessionId: session.sessionId,
      reportingUserId,
      otherUserId: session.hostId === reportingUserId ? session.guestId : session.hostId,
      country,
      city: session.approxLocation?.city,
      incidentTime: incident.triggeredAt,
      incidentType: incident.source,
      status: 'QUEUED',
      createdAt: serverTimestamp(),
    };
    
    await db.collection('safeMeetLawEnforcementQueue').doc(queueId).set(queueItem);
    
    logger.info(`Law enforcement queue item created: ${queueId} for country ${country}`);
  } catch (error: any) {
    // Log but don't throw
    logger.error('Failed to create law enforcement queue item:', error);
  }
}

// ============================================================================
// TRUSTED CONTACT MANAGEMENT
// ============================================================================

/**
 * Set or update user's trusted contact
 */
export async function setTrustedContact(
  input: SetTrustedContactInput
): Promise<TrustedContactResponse> {
  try {
    const { userId, name, phone, email } = input;
    
    // Validate user
    await validateUser(userId);
    
    // Validate inputs
    if (!name || name.trim().length === 0) {
      return {
        success: false,
        error: 'Name is required',
      };
    }
    
    if (!phone || phone.trim().length === 0) {
      return {
        success: false,
        error: 'Phone number is required',
      };
    }
    
    if (!email || !email.includes('@')) {
      return {
        success: false,
        error: 'Valid email is required',
      };
    }
    
    // Create or update trusted contact
    const contactRef = db.collection('trustedContacts').doc(userId);
    const contactSnap = await contactRef.get();
    
    const contact: TrustedContact = {
      userId,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      lastUpdatedAt: serverTimestamp(),
      createdAt: contactSnap.exists 
        ? (contactSnap.data()?.createdAt || serverTimestamp())
        : serverTimestamp(),
    };
    
    await contactRef.set(contact, { merge: true });
    
    logger.info(`Trusted contact ${contactSnap.exists ? 'updated' : 'set'} for user ${userId}`);
    
    return {
      success: true,
      contact,
    };
  } catch (error: any) {
    logger.error('Error setting trusted contact:', error);
    return {
      success: false,
      error: error.message || 'Failed to set trusted contact',
    };
  }
}

/**
 * Get user's trusted contact
 */
export async function getTrustedContact(
  userId: string
): Promise<TrustedContact | null> {
  try {
    const contactRef = db.collection('trustedContacts').doc(userId);
    const contactSnap = await contactRef.get();
    
    if (!contactSnap.exists) {
      return null;
    }
    
    return contactSnap.data() as TrustedContact;
  } catch (error: any) {
    logger.error('Error getting trusted contact:', error);
    return null;
  }
}