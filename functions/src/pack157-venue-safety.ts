/**
 * PACK 157 — Venue Safety Middleware
 * Enforcement and violation tracking for business partners
 * 
 * CRITICAL SAFETY RULES:
 * - Auto-freeze venue after NSFW violation
 * - Auto-suspend after romantic/dating event
 * - Report to Ambassador/City Leader
 * - Permanent removal for severe violations
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, serverTimestamp, generateId, increment } from './init';
import {
  VenueSafetyCase,
  ViolationType,
  BusinessPartner,
  VenueEvent,
  PartnershipStatus,
  VENUE_CONFIG,
} from './types/pack157-business-partners.types';
import { Timestamp } from 'firebase-admin/firestore';

// ============================================================================
// VIOLATION DETECTION
// ============================================================================

/**
 * Create safety violation case
 */
export const createVenueSafetyCase = onCall<{
  venueId?: string;
  partnerId: string;
  eventId?: string;
  violationType: ViolationType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  evidenceUrls?: string[];
  witnessStatements?: string[];
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const userId = request.auth.uid;
  const data = request.data;
  
  // Validate partner exists
  const partnerDoc = await db.collection('business_partners').doc(data.partnerId).get();
  if (!partnerDoc.exists) {
    throw new HttpsError('not-found', 'Business partner not found');
  }
  
  const partner = partnerDoc.data() as BusinessPartner;
  
  // Create safety case
  const caseId = generateId();
  const now = serverTimestamp() as Timestamp;
  
  const safetyCase: VenueSafetyCase = {
    caseId,
    venueId: data.venueId,
    partnerId: data.partnerId,
    eventId: data.eventId,
    
    violationType: data.violationType,
    severity: data.severity,
    description: data.description,
    
    reportedBy: userId,
    reportedByType: 'USER',
    
    evidenceUrls: data.evidenceUrls || [],
    witnessStatements: data.witnessStatements || [],
    
    status: 'OPEN',
    
    affectedUsers: [],
    refundsIssued: 0,
    
    ambassadorNotified: false,
    cityLeaderNotified: false,
    
    createdAt: now,
    updatedAt: now,
  };
  
  await db.collection('venue_safety_cases').doc(caseId).set(safetyCase);
  
  // Auto-action for critical violations
  if (data.severity === 'CRITICAL') {
    await autoEnforceViolation(data.partnerId, data.violationType, caseId);
  }
  
  // Create admin notification
  await db.collection('admin_notifications').add({
    type: 'VENUE_SAFETY_VIOLATION',
    caseId,
    partnerId: data.partnerId,
    violationType: data.violationType,
    severity: data.severity,
    createdAt: now,
    read: false,
    priority: data.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
  });
  
  return {
    success: true,
    caseId,
    message: 'Safety case created and under investigation',
  };
});

/**
 * Auto-enforce violation based on type and severity
 */
async function autoEnforceViolation(
  partnerId: string,
  violationType: ViolationType,
  caseId: string
): Promise<void> {
  const partnerRef = db.collection('business_partners').doc(partnerId);
  const partnerDoc = await partnerRef.get();
  
  if (!partnerDoc.exists) {
    return;
  }
  
  const partner = partnerDoc.data() as BusinessPartner;
  const now = serverTimestamp() as Timestamp;
  
  // Increment violation count
  const newViolationCount = partner.violationCount + 1;
  
  // Determine action based on violation type
  let action: 'WARNING' | 'FREEZE' | 'SUSPEND' | 'REVOKE' = 'WARNING';
  let reason = `Violation: ${violationType}`;
  
  switch (violationType) {
    case ViolationType.NSFW_CONTENT:
    case ViolationType.ROMANTIC_EVENT:
    case ViolationType.DATING_THEME:
      // Immediate suspension for NSFW/romantic content
      action = 'SUSPEND';
      reason = 'ZERO TOLERANCE: NSFW or romantic content detected';
      break;
      
    case ViolationType.EXTERNAL_PAYMENT:
    case ViolationType.CONTACT_HARVESTING:
      // Immediate suspension for payment/contact violations
      action = 'SUSPEND';
      reason = 'External payment or contact harvesting detected';
      break;
      
    case ViolationType.UNAUTHORIZED_FILMING:
    case ViolationType.INAPPROPRIATE_MARKETING:
      // First occurrence: warning, second: freeze, third: suspend
      if (newViolationCount >= 3) {
        action = 'SUSPEND';
      } else if (newViolationCount >= 2) {
        action = 'FREEZE';
      } else {
        action = 'WARNING';
      }
      break;
      
    case ViolationType.ALCOHOL_CENTERED:
      // Warning first, then freeze
      if (newViolationCount >= 2) {
        action = 'FREEZE';
      } else {
        action = 'WARNING';
      }
      break;
  }
  
  // Check if should auto-revoke (3+ violations)
  if (newViolationCount >= VENUE_CONFIG.violationAutoSuspendThreshold) {
    action = 'REVOKE';
    reason = `${newViolationCount} violations - permanent removal`;
  }
  
  // Apply enforcement action
  const updates: any = {
    violationCount: increment(1),
    lastViolation: now,
    updatedAt: now,
  };
  
  if (action === 'FREEZE') {
    updates.canHostEvents = false;
    updates.suspensionReason = reason;
  } else if (action === 'SUSPEND') {
    updates.status = PartnershipStatus.SUSPENDED;
    updates.canHostEvents = false;
    updates.canSellTickets = false;
    updates.suspensionReason = reason;
  } else if (action === 'REVOKE') {
    updates.status = PartnershipStatus.REVOKED;
    updates.canHostEvents = false;
    updates.canSellTickets = false;
    updates.suspensionReason = reason;
  }
  
  await partnerRef.update(updates);
  
  // Cancel upcoming events if suspended or revoked
  if (action === 'SUSPEND' || action === 'REVOKE') {
    const upcomingEvents = await db.collection('venue_events')
      .where('partnerId', '==', partnerId)
      .where('status', '==', 'UPCOMING')
      .get();
    
    const batch = db.batch();
    
    for (const eventDoc of upcomingEvents.docs) {
      batch.update(eventDoc.ref, {
        status: 'CANCELLED',
        isActive: false,
        cancellationReason: reason,
        updatedAt: now,
      });
    }
    
    await batch.commit();
    
    // Notify partner owner
    await db.collection('notifications').add({
      userId: partner.ownerUserId,
      type: 'BUSINESS_PARTNER',
      title: `Partnership ${action === 'REVOKE' ? 'Revoked' : 'Suspended'}`,
      body: `Your business partnership has been ${action === 'REVOKE' ? 'permanently revoked' : 'suspended'}. Reason: ${reason}`,
      data: {
        partnerId,
        action,
        reason,
        caseId,
      },
      read: false,
      createdAt: now,
    });
  }
  
  // Update safety case with resolution
  await db.collection('venue_safety_cases').doc(caseId).update({
    status: 'RESOLVED',
    resolution: {
      action,
      notes: `Auto-enforced: ${reason}`,
      decidedBy: 'SYSTEM',
      decidedAt: now,
    },
    updatedAt: now,
  });
}

/**
 * Report to Ambassador/City Leader (PACK 152 integration)
 */
export const notifyRegionalLeaders = onCall<{
  caseId: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  const { caseId } = request.data;
  
  // Get safety case
  const caseDoc = await db.collection('venue_safety_cases').doc(caseId).get();
  if (!caseDoc.exists) {
    throw new HttpsError('not-found', 'Safety case not found');
  }
  
  const safetyCase = caseDoc.data() as VenueSafetyCase;
  
  // Get business partner to find region
  const partnerDoc = await db.collection('business_partners').doc(safetyCase.partnerId).get();
  if (!partnerDoc.exists) {
    throw new HttpsError('not-found', 'Business partner not found');
  }
  
  const partner = partnerDoc.data() as BusinessPartner;
  const region = partner.address.country;
  const city = partner.address.city;
  
  // Find ambassadors in the region
  const ambassadorSnapshot = await db.collection('ambassadors')
    .where('region', '==', region)
    .where('status', '==', 'ACTIVE')
    .limit(5)
    .get();
  
  // Find city leaders
  const cityLeaderSnapshot = await db.collection('city_leaders')
    .where('city', '==', city)
    .where('status', '==', 'ACTIVE')
    .limit(3)
    .get();
  
  const now = serverTimestamp() as Timestamp;
  
  // Notify ambassadors
  for (const ambassadorDoc of ambassadorSnapshot.docs) {
    const ambassador = ambassadorDoc.data();
    await db.collection('notifications').add({
      userId: ambassador.userId,
      type: 'AMBASSADOR_ALERT',
      title: 'Venue Safety Violation in Your Region',
      body: `A business partner in ${city}, ${region} has been reported for ${safetyCase.violationType}`,
      data: {
        caseId,
        partnerId: safetyCase.partnerId,
        violationType: safetyCase.violationType,
        severity: safetyCase.severity,
        region,
        city,
      },
      read: false,
      createdAt: now,
    });
  }
  
  // Notify city leaders
  for (const leaderDoc of cityLeaderSnapshot.docs) {
    const leader = leaderDoc.data();
    await db.collection('notifications').add({
      userId: leader.userId,
      type: 'CITY_LEADER_ALERT',
      title: 'Venue Safety Violation in Your City',
      body: `A business partner in ${city} has been reported for ${safetyCase.violationType}`,
      data: {
        caseId,
        partnerId: safetyCase.partnerId,
        violationType: safetyCase.violationType,
        severity: safetyCase.severity,
        city,
      },
      read: false,
      createdAt: now,
    });
  }
  
  // Update case
  await db.collection('venue_safety_cases').doc(caseId).update({
    ambassadorNotified: ambassadorSnapshot.size > 0,
    cityLeaderNotified: cityLeaderSnapshot.size > 0,
    updatedAt: now,
  });
  
  return {
    success: true,
    ambassadorsNotified: ambassadorSnapshot.size,
    cityLeadersNotified: cityLeaderSnapshot.size,
    message: 'Regional leaders notified',
  };
});

// ============================================================================
// AUTOMATED MONITORING
// ============================================================================

/**
 * Detect non-consensual filming from event reports
 * Triggered when event is created
 */
export const detectFilmingViolation = onDocumentCreated(
  'venue_events/{eventId}',
  async (event) => {
    const eventData = event.data?.data() as VenueEvent;
    
    if (!eventData) {
      return;
    }
    
    // Check description for filming-related keywords
    const filmingKeywords = [
      'photoshoot', 'video shoot', 'filming', 'recording',
      'camera crew', 'content creation', 'instagram shoot',
    ];
    
    const desc = eventData.description.toLowerCase();
    const hasFilmingKeyword = filmingKeywords.some(kw => desc.includes(kw));
    
    if (hasFilmingKeyword) {
      // Flag for manual review
      await db.collection('venue_safety_cases').add({
        caseId: generateId(),
        venueId: eventData.venueId,
        partnerId: eventData.partnerId,
        eventId: eventData.eventId,
        
        violationType: ViolationType.UNAUTHORIZED_FILMING,
        severity: 'MEDIUM',
        description: 'Event description mentions filming/photography - requires consent verification',
        
        reportedBy: undefined,
        reportedByType: 'SYSTEM',
        
        evidenceUrls: [],
        witnessStatements: [],
        
        status: 'OPEN',
        
        affectedUsers: [],
        refundsIssued: 0,
        
        ambassadorNotified: false,
        cityLeaderNotified: false,
        
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      // Notify admin
      await db.collection('admin_notifications').add({
        type: 'VENUE_FILMING_DETECTED',
        eventId: eventData.eventId,
        partnerId: eventData.partnerId,
        eventTitle: eventData.title,
        createdAt: serverTimestamp(),
        read: false,
        priority: 'MEDIUM',
      });
    }
  }
);

/**
 * Monitor for external payment links
 */
export async function detectExternalPayment(text: string): Promise<boolean> {
  const externalPaymentPatterns = [
    /paypal\.com/i,
    /venmo\.com/i,
    /cash\.app/i,
    /zelle/i,
    /telegram\.me/i,
    /t\.me/i,
    /wa\.me/i,
    /whatsapp/i,
    /western\s*union/i,
    /wire\s*transfer/i,
    /bank\s*transfer/i,
    /direct\s*payment/i,
    /contact\s*me\s*for\s*payment/i,
  ];
  
  return externalPaymentPatterns.some(pattern => pattern.test(text));
}

/**
 * Get venue safety statistics (ADMIN)
 */
export const getVenueSafetyStats = onCall<{
  partnerId?: string;
  startDate?: string;
  endDate?: string;
}>({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be logged in');
  }
  
  // TODO: Add proper admin role check
  
  const { partnerId, startDate, endDate } = request.data;
  
  let query = db.collection('venue_safety_cases').where('status', '==', 'OPEN');
  
  if (partnerId) {
    query = query.where('partnerId', '==', partnerId);
  }
  
  if (startDate) {
    query = query.where('createdAt', '>=', Timestamp.fromDate(new Date(startDate)));
  }
  
  if (endDate) {
    query = query.where('createdAt', '<=', Timestamp.fromDate(new Date(endDate)));
  }
  
  const snapshot = await query.get();
  
  const stats = {
    totalCases: snapshot.size,
    byViolationType: {} as Record<string, number>,
    bySeverity: {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    },
    byStatus: {
      OPEN: 0,
      INVESTIGATING: 0,
      RESOLVED: 0,
      ESCALATED: 0,
    },
  };
  
  snapshot.docs.forEach(doc => {
    const caseData = doc.data() as VenueSafetyCase;
    
    // Count by violation type
    stats.byViolationType[caseData.violationType] =
      (stats.byViolationType[caseData.violationType] || 0) + 1;
    
    // Count by severity
    stats.bySeverity[caseData.severity]++;
    
    // Count by status
    stats.byStatus[caseData.status]++;
  });
  
  return {
    success: true,
    stats,
  };
});