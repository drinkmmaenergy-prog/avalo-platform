/**
 * PACK 435 — Global Events Engine: Fraud & Abuse Protection
 * 
 * Detects fake attendees, QR spoofing, bot tickets, multi-account abuse, organizer fraud
 * Depends on: PACK 302 Fraud & Risk Graph, PACK 300A Support, PACK 435 Events
 */

import * as admin from 'firebase-admin';

// ============================================================================
// FRAUD DETECTION INTERFACES
// ============================================================================

export interface EventFraudAlert {
  alertId: string;
  eventId: string;
  
  // Fraud type
  type: FraudType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  // Involved parties
  suspectedUserId?: string;
  suspectedOrganizerId?: string;
  affectedUserIds?: string[];
  
  // Detection details
  detectionMethod: 'automated' | 'manual_report' | 'pattern_analysis';
  confidence: number; // 0-100%
  evidence: FraudEvidence[];
  
  // Status
  status: 'detected' | 'investigating' | 'confirmed' | 'false_positive' | 'resolved';
  
  // Actions taken
  actionsTaken: string[];
  earningsFrozen: boolean;
  accountsFrozen: string[];
  
  // Investigation
  investigatorId?: string;
  investigationNotes?: string;
  
  // Timestamps
  detectedAt: admin.firestore.Timestamp;
  investigatedAt?: admin.firestore.Timestamp;
  resolvedAt?: admin.firestore.Timestamp;
}

export enum FraudType {
  FAKE_ATTENDEES = 'fake_attendees',
  QR_SPOOFING = 'qr_spoofing',
  BOT_TICKET_PURCHASES = 'bot_ticket_purchases',
  MULTI_ACCOUNT_ABUSE = 'multi_account_abuse',
DOUBLE_ATTENDANCE = 'double_attendance',
  ORGANIZER_REVENUE_FRAUD = 'organizer_revenue_fraud',
  FAKE_EVENT_CREATION = 'fake_event_creation',
  REFUND_ABUSE = 'refund_abuse',
  TICKET_SCALPING = 'ticket_scalping',
  IDENTITY_SPOOFING = 'identity_spoofing',
}

export interface FraudEvidence {
  type: string;
  description: string;
  data: any;
  timestamp: admin.firestore.Timestamp;
}

export interface FraudPattern {
  patternId: string;
  patternType: FraudType;
  
  // Pattern rules
  indicators: FraudIndicator[];
  thresholds: Record<string, number>;
  
  // Detection config
  isActive: boolean;
  priority: number;
  
  // Stats
  detectionCount: number;
  falsePositiveRate: number;
  
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface FraudIndicator {
  indicator: string;
  weight: number; // 0-1
  description: string;
}

// ============================================================================
// FAKE ATTENDEE DETECTION
// ============================================================================

export async function detectFakeAttendees(eventId: string): Promise<EventFraudAlert[]> {
  const db = admin.firestore();
  const alerts: EventFraudAlert[] = [];
  
  // Get all attendees
  const attendeesSnapshot = await db.collection('eventAttendees')
    .where('eventId', '==', eventId)
    .get();
  
  const suspiciousPatterns: Map<string, number> = new Map();
  
  for (const doc of attendeesSnapshot.docs) {
    const attendee = doc.data();
    let suspicionScore = 0;
    const evidence: FraudEvidence[] = [];
    
    // Check 1: No profile picture or bio
    const userDoc = await db.collection('users').doc(attendee.userId).get();
    const user = userDoc.data();
    
    if (!user?.photoURL || !user?.bio) {
      suspicionScore += 15;
      evidence.push({
        type: 'incomplete_profile',
        description: 'User has incomplete profile',
        data: { hasPhoto: !!user?.photoURL, hasBio: !!user?.bio },
        timestamp: admin.firestore.Timestamp.now(),
      });
    }
    
    // Check 2: Account created recently (within 24 hours of event registration)
    if (user?.createdAt) {
      const accountAge = attendee.registeredAt.toMillis() - user.createdAt.toMillis();
      if (accountAge < 24 * 60 * 60 * 1000) {
        suspicionScore += 25;
        evidence.push({
          type: 'new_account',
          description: 'Account created shortly before event registration',
          data: { accountAge: accountAge / 1000 / 60 / 60 }, // hours
          timestamp: admin.firestore.Timestamp.now(),
        });
      }
    }
    
    // Check 3: No activity history
    const activityCount = user?.activityCount || 0;
    if (activityCount < 5) {
      suspicionScore += 20;
      evidence.push({
        type: 'low_activity',
        description: 'User has minimal platform activity',
        data: { activityCount },
        timestamp: admin.firestore.Timestamp.now(),
      });
    }
    
    // Check 4: Never checked in
    if (!attendee.qrVerified && attendee.status === 'paid') {
      suspicionScore += 10;
      evidence.push({
        type: 'no_check_in',
        description: 'Paid but never checked in',
        data: { status: attendee.status },
        timestamp: admin.firestore.Timestamp.now(),
      });
    }
    
    // If suspicion is high, create alert
    if (suspicionScore >= 40) {
      const alert = await createFraudAlert({
        eventId,
        type: FraudType.FAKE_ATTENDEES,
        severity: suspicionScore >= 60 ? 'high' : 'medium',
        suspectedUserId: attendee.userId,
        evidence,
        confidence: Math.min(suspicionScore, 100),
      });
      
      alerts.push(alert);
    }
  }
  
  return alerts;
}

// ============================================================================
// QR CODE SPOOFING DETECTION
// ============================================================================

export async function detectQRSpoofing(eventId: string): Promise<EventFraudAlert[]> {
  const db = admin.firestore();
  const alerts: EventFraudAlert[] = [];
  
  // Get all check-ins for this event
  const attendeesSnapshot = await db.collection('eventAttendees')
    .where('eventId', '==', eventId)
    .where('qrVerified', '==', true)
    .get();
  
  const qrScans: Map<string, any[]> = new Map();
  
  for (const doc of attendeesSnapshot.docs) {
    const attendee = doc.data();
    const qrCode = attendee.qrCode;
    
    if (!qrScans.has(qrCode)) {
      qrScans.set(qrCode, []);
    }
    
    qrScans.get(qrCode)?.push({
      userId: attendee.userId,
      checkedInAt: attendee.checkedInAt,
      location: attendee.lastLocation,
    });
  }
  
  // Detect duplicate QR scans
  for (const [qrCode, scans] of qrScans.entries()) {
    if (scans.length > 1) {
      // Multiple users with same QR code = spoofing
      const alert = await createFraudAlert({
        eventId,
        type: FraudType.QR_SPOOFING,
        severity: 'high',
        affectedUserIds: scans.map((s: any) => s.userId),
        evidence: [{
          type: 'duplicate_qr',
          description: 'Same QR code used by multiple users',
          data: { qrCode, scanCount: scans.length, scans },
          timestamp: admin.firestore.Timestamp.now(),
        }],
        confidence: 90,
      });
      
      alerts.push(alert);
    }
  }
  
  return alerts;
}

// ============================================================================
// BOT TICKET PURCHASE DETECTION
// ============================================================================

export async function detectBotTicketPurchases(eventId: string): Promise<EventFraudAlert | null> {
  const db = admin.firestore();
  
  // Get all registrations in last 5 minutes
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  
  const recentRegsSnapshot = await db.collection('eventAttendees')
    .where('eventId', '==', eventId)
    .where('registeredAt', '>', admin.firestore.Timestamp.fromMillis(fiveMinutesAgo))
    .get();
  
  const recentRegistrations = recentRegsSnapshot.size;
  
  // Suspicious if >20 registrations in 5 minutes
  if (recentRegistrations > 20) {
    // Check if from similar IPs or devices (would need device fingerprinting)
    const userIds = recentRegsSnapshot.docs.map(doc => doc.data().userId);
    
    // Check for pattern: sequential user IDs, similar names, etc.
    const suspicionScore = Math.min(100, recentRegistrations * 3);
    
    return await createFraudAlert({
      eventId,
      type: FraudType.BOT_TICKET_PURCHASES,
      severity: suspicionScore >= 80 ? 'critical' : 'high',
      affectedUserIds: userIds,
      evidence: [{
        type: 'rapid_registration',
        description: 'Unusually high registration rate',
        data: { count: recentRegistrations, timeWindow: '5 minutes' },
        timestamp: admin.firestore.Timestamp.now(),
      }],
      confidence: suspicionScore,
    });
  }
  
  return null;
}

// ============================================================================
// MULTI-ACCOUNT ABUSE DETECTION
// ============================================================================

export async function detectMultiAccountAbuse(eventId: string): Promise<EventFraudAlert[]> {
  const db = admin.firestore();
  const alerts: EventFraudAlert[] = [];
  
  // Get all attendees
  const attendeesSnapshot = await db.collection('eventAttendees')
    .where('eventId', '==', eventId)
    .get();
  
  // Group by device fingerprint, IP, payment method
  const deviceGroups: Map<string, string[]> = new Map();
  const paymentGroups: Map<string, string[]> = new Map();
  
  for (const doc of attendeesSnapshot.docs) {
    const attendee = doc.data();
    
    // Would need device fingerprinting from client
    // For now, check payment method
    if (attendee.paymentId) {
      if (!paymentGroups.has(attendee.paymentId)) {
        paymentGroups.set(attendee.paymentId, []);
      }
      paymentGroups.get(attendee.paymentId)?.push(attendee.userId);
    }
  }
  
  // Alert if same payment method used for multiple accounts
  for (const [paymentId, userIds] of paymentGroups.entries()) {
    if (userIds.length > 3) {
      const alert = await createFraudAlert({
        eventId,
        type: FraudType.MULTI_ACCOUNT_ABUSE,
        severity: 'medium',
        affectedUserIds: userIds,
        evidence: [{
          type: 'shared_payment_method',
          description: 'Multiple accounts using same payment method',
          data: { paymentId, accountCount: userIds.length },
          timestamp: admin.firestore.Timestamp.now(),
        }],
        confidence: 70,
      });
      
      alerts.push(alert);
    }
  }
  
  return alerts;
}

// ============================================================================
// ORGANIZER FRAUD DETECTION
// ============================================================================

export async function detectOrganizerFraud(eventId: string): Promise<EventFraudAlert | null> {
  const db = admin.firestore();
  
  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) {
    return null;
  }
  
  const event = eventDoc.data();
  const organizerId = event?.organizerId;
  
  let suspicionScore = 0;
  const evidence: FraudEvidence[] = [];
  
  // Check 1: High cancellation rate
  const organizerEvents = await db.collection('events')
    .where('organizerId', '==', organizerId)
    .get();
  
  let cancelledCount = 0;
  organizerEvents.forEach(doc => {
    if (doc.data().status === 'cancelled') {
      cancelledCount++;
    }
  });
  
  const cancellationRate = organizerEvents.size > 0
    ? (cancelledCount / organizerEvents.size) * 100
    : 0;
  
  if (cancellationRate > 50) {
    suspicionScore += 30;
    evidence.push({
      type: 'high_cancellation_rate',
      description: 'Organizer has high event cancellation rate',
      data: { rate: cancellationRate, cancelled: cancelledCount, total: organizerEvents.size },
      timestamp: admin.firestore.Timestamp.now(),
    });
  }
  
  // Check 2: Low verification rate
  const attendeesSnapshot = await db.collection('eventAttendees')
    .where('eventId', '==', eventId)
    .get();
  
  let verifiedCount = 0;
  attendeesSnapshot.forEach(doc => {
    if (doc.data().qrVerified) {
      verifiedCount++;
    }
  });
  
  const verificationRate = attendeesSnapshot.size > 0
    ? (verifiedCount / attendeesSnapshot.size) * 100
    : 0;
  
  if (verificationRate < 30 && attendeesSnapshot.size > 10) {
    suspicionScore += 40;
    evidence.push({
      type: 'low_verification_rate',
      description: 'Very few attendees actually checked in',
      data: { rate: verificationRate, verified: verifiedCount, total: attendeesSnapshot.size },
      timestamp: admin.firestore.Timestamp.now(),
    });
  }
  
  // Check 3: Revenue manipulation
  const paymentsSnapshot = await db.collection('eventPayments')
    .where('eventId', '==', eventId)
    .get();
  
  let totalPayments = 0;
  paymentsSnapshot.forEach(doc => {
    totalPayments += doc.data().amount;
  });
  
  const reportedRevenue = event?.totalRevenue || 0;
  const discrepancy = Math.abs(totalPayments - reportedRevenue);
  
  if (discrepancy > totalPayments * 0.1) { // 10% discrepancy
    suspicionScore += 30;
    evidence.push({
      type: 'revenue_discrepancy',
      description: 'Reported revenue does not match payment records',
      data: { totalPayments, reportedRevenue, discrepancy },
      timestamp: admin.firestore.Timestamp.now(),
    });
  }
  
  // Create alert if suspicious
  if (suspicionScore >= 50) {
    return await createFraudAlert({
      eventId,
      type: FraudType.ORGANIZER_REVENUE_FRAUD,
      severity: suspicionScore >= 70 ? 'high' : 'medium',
      suspectedOrganizerId: organizerId,
      evidence,
      confidence: Math.min(suspicionScore, 100),
    });
  }
  
  return null;
}

// ============================================================================
// FRAUD ALERT CREATION & MANAGEMENT
// ============================================================================

async function createFraudAlert(data: {
  eventId: string;
  type: FraudType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suspectedUserId?: string;
  suspectedOrganizerId?: string;
  affectedUserIds?: string[];
  evidence: FraudEvidence[];
  confidence: number;
}): Promise<EventFraudAlert> {
  const db = admin.firestore();
  
  const alert: EventFraudAlert = {
    alertId: '',
    eventId: data.eventId,
    type: data.type,
    severity: data.severity,
    suspectedUserId: data.suspectedUserId,
    suspectedOrganizerId: data.suspectedOrganizerId,
    affectedUserIds: data.affectedUserIds,
    detectionMethod: 'automated',
    confidence: data.confidence,
    evidence: data.evidence,
    status: 'detected',
    actionsTaken: [],
    earningsFrozen: false,
    accountsFrozen: [],
    detectedAt: admin.firestore.Timestamp.now(),
  };
  
  const alertRef = await db.collection('eventFraudAlerts').add(alert);
  alert.alertId = alertRef.id;
  
  await alertRef.update({ alertId: alert.alertId });
  
  // Auto-freeze earnings for critical alerts
  if (data.severity === 'critical') {
    await freezeEventEarnings(data.eventId, alert.alertId);
    alert.earningsFrozen = true;
    alert.actionsTaken.push('earnings_frozen');
  }
  
  // Update event risk score
  await db.collection('events').doc(data.eventId).update({
    riskScore: admin.firestore.FieldValue.increment(
      data.severity === 'critical' ? 50 :
      data.severity === 'high' ? 30 :
      data.severity === 'medium' ? 15 : 5
    ),
  });
  
  // Report to PACK 302 (Fraud & Risk Graph)
  await db.collection('fraudReports').add({
    source: 'event_engine',
    eventId: data.eventId,
    fraudType: data.type,
    severity: data.severity,
    confidence: data.confidence,
    alertId: alert.alertId,
    reportedAt: admin.firestore.Timestamp.now(),
  });
  
  return alert;
}

export async function investigateFraudAlert(
  alertId: string,
  investigatorId: string,
  action: 'confirm' | 'false_positive' | 'escalate'
): Promise<boolean> {
  const db = admin.firestore();
  
  const alertRef = db.collection('eventFraudAlerts').doc(alertId);
  const alertDoc = await alertRef.get();
  
  if (!alertDoc.exists) {
    return false;
  }
  
  const alert = alertDoc.data() as EventFraudAlert;
  
  const updates: any = {
    investigatorId,
    investigatedAt: admin.firestore.Timestamp.now(),
    status: action === 'confirm' ? 'confirmed' :
            action === 'false_positive' ? 'false_positive' : 'investigating',
  };
  
  if (action === 'confirm') {
    // Take enforcement actions
    updates.actionsTaken = admin.firestore.FieldValue.arrayUnion('banned_users');
    
    // Ban suspected user
    if (alert.suspectedUserId) {
      await db.collection('users').doc(alert.suspectedUserId).update({
        accountState: 'banned',
        banReason: `Fraud detected: ${alert.type}`,
        bannedAt: admin.firestore.Timestamp.now(),
      });
      
      updates.accountsFrozen = [alert.suspectedUserId];
    }
    
    // Ban organizer if organizer fraud
    if (alert.suspectedOrganizerId) {
      await db.collection('users').doc(alert.suspectedOrganizerId).update({
        accountState: 'banned',
        banReason: 'Event organizer fraud',
        bannedAt: admin.firestore.Timestamp.now(),
      });
      
      updates.accountsFrozen = [alert.suspectedOrganizerId];
    }
  }
  
  if (action === 'false_positive') {
    // Unfreeze earnings
    await unfreezeEventEarnings(alert.eventId, alertId);
    updates.earningsFrozen = false;
  }
  
  await alertRef.update(updates);
  
  return true;
}

// ============================================================================
// EARNINGS FREEZE/UNFREEZE
// ============================================================================

async function freezeEventEarnings(eventId: string, reason: string): Promise<void> {
  const db = admin.firestore();
  
  // Freeze payout
  await db.collection('eventPayouts')
    .where('eventId', '==', eventId)
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        doc.ref.update({
          status: 'frozen',
          freezeReason: reason,
          frozenAt: admin.firestore.Timestamp.now(),
        });
      });
    });
  
  // Update event
  await db.collection('events').doc(eventId).update({
    'payoutStatus': 'frozen',
  });
}

async function unfreezeEventEarnings(eventId: string, alertId: string): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('eventPayouts')
    .where('eventId', '==', eventId)
    .where('freezeReason', '==', alertId)
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        doc.ref.update({
          status: 'pending',
          freezeReason: null,
          frozenAt: null,
        });
      });
    });
}

// ============================================================================
// COMPREHENSIVE FRAUD SCAN
// ============================================================================

export async function runComprehensiveFraudScan(eventId: string): Promise<EventFraudAlert[]> {
  const alerts: EventFraudAlert[] = [];
  
  // Run all fraud detection algorithms
  const [
    fakeAttendeeAlerts,
    qrSpoofingAlerts,
    botAlert,
    multiAccountAlerts,
    organizerAlert,
  ] = await Promise.all([
    detectFakeAttendees(eventId),
    detectQRSpoofing(eventId),
    detectBotTicketPurchases(eventId),
    detectMultiAccountAbuse(eventId),
    detectOrganizerFraud(eventId),
  ]);
  
  alerts.push(...fakeAttendeeAlerts);
  alerts.push(...qrSpoofingAlerts);
  if (botAlert) alerts.push(botAlert);
  alerts.push(...multiAccountAlerts);
  if (organizerAlert) alerts.push(organizerAlert);
  
  return alerts;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectFakeAttendees,
  detectQRSpoofing,
  detectBotTicketPurchases,
  detectMultiAccountAbuse,
  detectOrganizerFraud,
  investigateFraudAlert,
  runComprehensiveFraudScan,
};
