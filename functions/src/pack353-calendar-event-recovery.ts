/**
 * PACK 353 — Calendar + Event Failure Recovery
 * 
 * Purpose: Handle failed verifications for calendar meetings and events
 * Triggers: PACK 300/300A (support), PACK 302 (fraud), PACK 352 (KPI)
 */

import * as admin from 'firebase-admin';

interface CalendarEvent {
  eventId: string;
  type: 'meeting' | 'event';
  organizerId: string;
  participantId: string;
  scheduledAt: number;
  status: 'scheduled' | 'verified' | 'disputed' | 'cancelled' | 'completed';
  
  // Verification requirements
  requireQrScan: boolean;
  requireSelfie: boolean;
  requireGps: boolean;
  
  // Verification data
  qrScanned?: boolean;
  qrScannedAt?: number;
  selfieVerified?: boolean;
  selfieVerifiedAt?: number;
  gpsVerified?: boolean;
  gpsVerifiedAt?: number;
  gpsLocation?: {
    lat: number;
    lng: number;
  };
  
  // Dispute handling
  disputeReason?: string;
  disputedAt?: number;
  disputeResolution?: 'pending' | 'organizer_favor' | 'participant_favor' | 'mutual_cancel';
}

interface VerificationResult {
  success: boolean;
  qrValid?: boolean;
  selfieValid?: boolean;
  gpsValid?: boolean;
  errors: string[];
}

/**
 * Verify event check-in
 */
export async function verifyEventCheckIn(
  eventId: string,
  userId: string,
  verificationData: {
    qrCode?: string;
    selfieUrl?: string;
    gpsLocation?: { lat: number; lng: number };
  }
): Promise<VerificationResult> {
  const db = admin.firestore();
  const errors: string[] = [];
  let qrValid = false;
  let selfieValid = false;
  let gpsValid = false;
  
  try {
    const eventRef = db.collection('calendarEvents').doc(eventId);
    const eventDoc = await eventRef.get();
    
    if (!eventDoc.exists) {
      return {
        success: false,
        errors: ['Event not found'],
      };
    }
    
    const event = eventDoc.data() as CalendarEvent;
    
    // Check if user is participant
    if (event.participantId !== userId && event.organizerId !== userId) {
      return {
        success: false,
        errors: ['User not authorized for this event'],
      };
    }
    
    // Verify QR code
    if (event.requireQrScan) {
      if (!verificationData.qrCode) {
        errors.push('QR code scan required');
      } else {
        qrValid = await verifyQrCode(eventId, verificationData.qrCode);
        if (!qrValid) {
          errors.push('Invalid QR code');
        }
      }
    } else {
      qrValid = true; // Not required
    }
    
    // Verify selfie
    if (event.requireSelfie) {
      if (!verificationData.selfieUrl) {
        errors.push('Selfie verification required');
      } else {
        selfieValid = await verifySelfie(userId, verificationData.selfieUrl);
        if (!selfieValid) {
          errors.push('Selfie verification failed');
        }
      }
    } else {
      selfieValid = true; // Not required
    }
    
    // Verify GPS location
    if (event.requireGps) {
      if (!verificationData.gpsLocation) {
        errors.push('GPS location required');
      } else {
        gpsValid = await verifyGpsLocation(eventId, verificationData.gpsLocation);
        if (!gpsValid) {
          errors.push('GPS location verification failed');
        }
      }
    } else {
      gpsValid = true; // Not required
    }
    
    const allValid = qrValid && selfieValid && gpsValid;
    
    if (allValid) {
      // Update event verification status
      await eventRef.update({
        status: 'verified',
        qrScanned: qrValid,
        qrScannedAt: Date.now(),
        selfieVerified: selfieValid,
        selfieVerifiedAt: Date.now(),
        gpsVerified: gpsValid,
        gpsVerifiedAt: Date.now(),
        gpsLocation: verificationData.gpsLocation,
      });
    } else {
      // Mark as disputed
      await markEventDisputed(eventId, event, errors.join(', '));
    }
    
    return {
      success: allValid,
      qrValid,
      selfieValid,
      gpsValid,
      errors,
    };
  } catch (error) {
    console.error('Event verification error:', error);
    return {
      success: false,
      errors: ['Verification system error'],
    };
  }
}

/**
 * Mark event as disputed
 */
async function markEventDisputed(
  eventId: string,
  event: CalendarEvent,
  reason: string
): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('calendarEvents').doc(eventId).update({
    status: 'disputed',
    disputeReason: reason,
    disputedAt: Date.now(),
  });
  
  // Trigger PACK 300/300A (support system)
  await createSupportTicket(eventId, event, reason);
  
  // Trigger PACK 302 (fraud detection)
  await triggerFraudDetection(eventId, event, reason);
  
  // Trigger PACK 352 (KPI tracking)
  await trackEventDispute(eventId, event, reason);
}

/**
 * Create support ticket for disputed event
 */
async function createSupportTicket(
  eventId: string,
  event: CalendarEvent,
  reason: string
): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('supportTickets').add({
    type: 'event_verification_dispute',
    priority: 'medium',
    eventId,
    eventType: event.type,
    organizerId: event.organizerId,
    participantId: event.participantId,
    reason,
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata: {
      scheduledAt: event.scheduledAt,
      verificationRequirements: {
        qrScan: event.requireQrScan,
        selfie: event.requireSelfie,
        gps: event.requireGps,
      },
    },
  });
}

/**
 * Trigger fraud detection (PACK 302)
 */
async function triggerFraudDetection(
  eventId: string,
  event: CalendarEvent,
  reason: string
): Promise<void> {
  const db = admin.firestore();
  
  // Log fraud signal for both parties
  const usersToCheck = [event.organizerId, event.participantId];
  
  for (const userId of usersToCheck) {
    await db.collection('fraudSignals').add({
      userId,
      signalType: 'event_verification_failure',
      severity: 'medium',
      eventId,
      reason,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {
        eventType: event.type,
        verificationRequirements: {
          qrScan: event.requireQrScan,
          selfie: event.requireSelfie,
          gps: event.requireGps,
        },
      },
    });
  }
}

/**
 * Track event dispute in KPI system (PACK 352)
 */
async function trackEventDispute(
  eventId: string,
  event: CalendarEvent,
  reason: string
): Promise<void> {
  const db = admin.firestore();
  
  // Track in KPI metrics
  await db.collection('kpiEvents').add({
    type: 'event_disputed',
    eventId,
    eventType: event.type,
    reason,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    metadata: {
      organizerId: event.organizerId,
      participantId: event.participantId,
      verificationRequirements: {
        qrScan: event.requireQrScan,
        selfie: event.requireSelfie,
        gps: event.requireGps,
      },
    },
  });
  
  // Update daily metrics
  const today = new Date().toISOString().split('T')[0];
  const metricsRef = db.collection('dailyKPIs').doc(today);
  
  await metricsRef.set({
    date: today,
    eventsDisputed: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Verify QR code
 */
async function verifyQrCode(eventId: string, qrCode: string): Promise<boolean> {
  const db = admin.firestore();
  
  try {
    const qrRef = db.collection('eventQrCodes').doc(qrCode);
    const qrDoc = await qrRef.get();
    
    if (!qrDoc.exists) {
      return false;
    }
    
    const qrData = qrDoc.data();
    
    // Check if QR code matches event
    if (qrData?.eventId !== eventId) {
      return false;
    }
    
    // Check if QR code is not expired
    if (qrData?.expiresAt && qrData.expiresAt < Date.now()) {
      return false;
    }
    
    // Check if QR code hasn't been used
    if (qrData?.used) {
      return false;
    }
    
    // Mark QR code as used
    await qrRef.update({
      used: true,
      usedAt: Date.now(),
    });
    
    return true;
  } catch (error) {
    console.error('QR code verification error:', error);
    return false;
  }
}

/**
 * Verify selfie against user profile
 */
async function verifySelfie(userId: string, selfieUrl: string): Promise<boolean> {
  // Note: This would integrate with face recognition service
  // Placeholder implementation
  
  try {
    // In real implementation:
    // 1. Fetch user's verified profile photos
    // 2. Compare selfie with profile photos using face recognition
    // 3. Return match confidence > threshold
    
    console.log('Selfie verification for user:', userId, 'URL:', selfieUrl);
    
    // Placeholder: assume verification succeeded
    return true;
  } catch (error) {
    console.error('Selfie verification error:', error);
    return false;
  }
}

/**
 * Verify GPS location matches event venue
 */
async function verifyGpsLocation(
  eventId: string,
  location: { lat: number; lng: number }
): Promise<boolean> {
  const db = admin.firestore();
  
  try {
    const eventDoc = await db.collection('calendarEvents').doc(eventId).get();
    
    if (!eventDoc.exists) {
      return false;
    }
    
    const event = eventDoc.data();
    const venueLocation = event?.venueLocation;
    
    if (!venueLocation) {
      return false;
    }
    
    // Calculate distance between user location and venue
    const distance = calculateDistance(
      location.lat,
      location.lng,
      venueLocation.lat,
      venueLocation.lng
    );
    
    // Allow 100 meters tolerance
    const MAX_DISTANCE_METERS = 100;
    
    return distance <= MAX_DISTANCE_METERS;
  } catch (error) {
    console.error('GPS verification error:', error);
    return false;
  }
}

/**
 * Calculate distance between two GPS coordinates (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c; // Distance in meters
}

/**
 * Get disputed events (for admin review)
 */
export async function getDisputedEvents(
  limit: number = 50
): Promise<CalendarEvent[]> {
  const db = admin.firestore();
  
  const snapshot = await db
    .collection('calendarEvents')
    .where('status', '==', 'disputed')
    .orderBy('disputedAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map((doc) => ({
    eventId: doc.id,
    ...doc.data(),
  })) as CalendarEvent[];
}

/**
 * Resolve event dispute (admin action)
 */
export async function resolveEventDispute(
  eventId: string,
  resolution: 'organizer_favor' | 'participant_favor' | 'mutual_cancel',
  adminId: string,
  notes?: string
): Promise<{ success: boolean }> {
  const db = admin.firestore();
  
  try {
    await db.collection('calendarEvents').doc(eventId).update({
      disputeResolution: resolution,
      resolvedBy: adminId,
      resolvedAt: Date.now(),
      resolutionNotes: notes,
      status: 'completed',
    });
    
    // Log resolution
    await db.collection('eventDisputeResolutions').add({
      eventId,
      resolution,
      adminId,
      notes,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return { success: true };
  } catch (error) {
    console.error('Dispute resolution error:', error);
    return { success: false };
  }
}

/**
 * Auto-cancel events with failed verification (scheduled function)
 */
export async function autoCancelFailedEvents(): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();
  const GRACE_PERIOD = 2 * 60 * 60 * 1000; // 2 hours after scheduled time
  
  const failedEvents = await db
    .collection('calendarEvents')
    .where('status', '==', 'scheduled')
    .where('scheduledAt', '<', now - GRACE_PERIOD)
    .limit(100)
    .get();
  
  const batch = db.batch();
  
  failedEvents.docs.forEach((doc) => {
    batch.update(doc.ref, {
      status: 'disputed',
      disputeReason: 'No verification within grace period',
      disputedAt: now,
    });
  });
  
  await batch.commit();
  
  // Process disputes for each failed event
  for (const doc of failedEvents.docs) {
    const event = doc.data() as CalendarEvent;
    await markEventDisputed(doc.id, event, 'No verification within grace period');
  }
  
  console.log(`Auto-cancelled ${failedEvents.size} failed events`);
}
