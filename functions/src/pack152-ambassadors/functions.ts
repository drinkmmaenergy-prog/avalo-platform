/**
 * PACK 152 - Ambassador Functions
 * Backend operations for Global Ambassadors & City Leaders Program
 * 
 * ZERO ROMANCE/NSFW/ATTENTION-FOR-PAYMENT DYNAMICS
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { AmbassadorSafetyMiddleware } from './safety-middleware';
import {
  AmbassadorProfile,
  AmbassadorApplication,
  AmbassadorEvent,
  EventAttendance,
  AmbassadorPerformance,
  AmbassadorEarningsRecord,
  AmbassadorComplianceIncident,
  EventType
} from './types';

const db = admin.firestore();

/**
 * Apply to become an Ambassador
 */
export const applyForAmbassador = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { city, country, countryCode, timezone, motivation, experienceDescription } = data;

  if (!city || !country || !countryCode || !timezone || !motivation || !experienceDescription) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  if (motivation.length < 100) {
    throw new functions.https.HttpsError('invalid-argument', 'Motivation must be at least 100 characters');
  }

  if (experienceDescription.length < 50) {
    throw new functions.https.HttpsError('invalid-argument', 'Experience description must be at least 50 characters');
  }

  const existingApplication = await db
    .collection('ambassador_applications')
    .where('userId', '==', userId)
    .where('status', 'in', ['pending', 'under_review'])
    .get();

  if (!existingApplication.empty) {
    throw new functions.https.HttpsError('already-exists', 'Application already exists');
  }

  const existingAmbassador = await db
    .collection('ambassador_profiles')
    .doc(userId)
    .get();

  if (existingAmbassador.exists) {
    throw new functions.https.HttpsError('already-exists', 'User is already an ambassador');
  }

  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }

  const userData = userDoc.data();
  const identityVerified = userData?.identityVerified || false;
  const over18 = userData?.age >= 18 || false;

  const application: AmbassadorApplication = {
    applicationId: db.collection('ambassador_applications').doc().id,
    userId,
    city,
    country,
    countryCode,
    timezone,
    motivation,
    experienceDescription,
    identityVerified,
    backgroundCheckCompleted: false,
    over18,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await db.collection('ambassador_applications').doc(application.applicationId).set(application);

  return { applicationId: application.applicationId, status: 'pending' };
});

/**
 * Approve an Ambassador application (Admin only)
 */
export const approveAmbassador = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const adminId = context.auth.uid;
  const { applicationId } = data;

  if (!applicationId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing applicationId');
  }

  const adminDoc = await db.collection('users').doc(adminId).get();
  if (!adminDoc.exists || !adminDoc.data()?.isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can approve ambassadors');
  }

  const applicationDoc = await db.collection('ambassador_applications').doc(applicationId).get();
  if (!applicationDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Application not found');
  }

  const application = applicationDoc.data() as AmbassadorApplication;
  
  if (application.status !== 'pending' && application.status !== 'under_review') {
    throw new functions.https.HttpsError('failed-precondition', 'Application is not in pending/under_review status');
  }

  if (!application.identityVerified) {
    throw new functions.https.HttpsError('failed-precondition', 'User identity must be verified');
  }

  if (!application.over18) {
    throw new functions.https.HttpsError('failed-precondition', 'User must be over 18');
  }

  const profile: AmbassadorProfile = {
    userId: application.userId,
    status: 'approved',
    role: 'ambassador',
    city: application.city,
    country: application.country,
    countryCode: application.countryCode,
    timezone: application.timezone,
    trainingCompleted: false,
    complianceSignedAt: new Date(),
    eventsHosted: 0,
    usersOnboarded: 0,
    creatorsOnboarded: 0,
    totalAttendees: 0,
    averageSatisfactionScore: 0,
    totalTokensEarned: 0,
    pendingTokens: 0,
    approvedBy: adminId,
    approvedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await db.collection('ambassador_profiles').doc(application.userId).set(profile);

  await db.collection('ambassador_applications').doc(applicationId).update({
    status: 'approved',
    reviewedBy: adminId,
    reviewedAt: new Date(),
    updatedAt: new Date()
  });

  return { success: true, ambassadorId: application.userId };
});

/**
 * Schedule an Ambassador event
 */
export const scheduleAmbassadorEvent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const ambassadorId = context.auth.uid;
  const {
    title,
    description,
    eventType,
    venue,
    address,
    city,
    country,
    countryCode,
    startTime,
    endTime,
    timezone,
    maxAttendees,
    ticketPrice,
    currency
  } = data;

  if (!title || !description || !eventType || !venue || !address || !city || !country || !countryCode || 
      !startTime || !endTime || !timezone || !maxAttendees) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const ambassadorDoc = await db.collection('ambassador_profiles').doc(ambassadorId).get();
  if (!ambassadorDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', 'User is not an ambassador');
  }

  const ambassador = ambassadorDoc.data() as AmbassadorProfile;
  if (ambassador.status !== 'approved' && ambassador.status !== 'active') {
    throw new functions.https.HttpsError('permission-denied', 'Ambassador is not active');
  }

  if (!ambassador.trainingCompleted) {
    throw new functions.https.HttpsError('failed-precondition', 'Ambassador must complete training');
  }

  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  const contentValidation = AmbassadorSafetyMiddleware.validateEventContent(title, description, eventType as EventType);
  if (!contentValidation.isValid) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Event content validation failed: ${contentValidation.violations.join(', ')}`
    );
  }

  const venueValidation = AmbassadorSafetyMiddleware.validateVenue(venue, address);
  if (!venueValidation.isValid) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Venue validation failed: ${venueValidation.violations.join(', ')}`
    );
  }

  const timingValidation = AmbassadorSafetyMiddleware.validateEventTiming(startDate, endDate);
  if (!timingValidation.isValid) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Timing validation failed: ${timingValidation.violations.join(', ')}`
    );
  }

  const eventId = db.collection('ambassador_events').doc().id;
  const checkInQRCode = `avalo://event-checkin/${eventId}`;

  const event: AmbassadorEvent = {
    eventId,
    ambassadorId,
    ambassadorRole: ambassador.role === 'regional_manager' ? 'city_leader' : ambassador.role,
    title,
    description,
    eventType: eventType as EventType,
    venue,
    address,
    city,
    country,
    countryCode,
    startTime: startDate,
    endTime: endDate,
    timezone,
    maxAttendees,
    registeredCount: 0,
    attendedCount: 0,
    safetyRulesUrl: 'https://avalo.app/ambassador-event-safety',
    photographyConsentRequired: true,
    ageRestriction: 18,
    status: 'pending_approval',
    complianceApproved: false,
    checkInQRCode,
    checkInEnabled: false,
    ticketPrice,
    currency,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await db.collection('ambassador_events').doc(eventId).set(event);

  return { 
    eventId, 
    status: 'pending_approval',
    validationScore: contentValidation.score,
    warnings: [...contentValidation.warnings, ...venueValidation.warnings, ...timingValidation.warnings]
  };
});

/**
 * Register attendance for an event
 */
export const registerAttendance = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { eventId, safetyRulesAccepted, photographyConsentGiven } = data;

  if (!eventId || safetyRulesAccepted === undefined || photographyConsentGiven === undefined) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const eventDoc = await db.collection('ambassador_events').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Event not found');
  }

  const event = eventDoc.data() as AmbassadorEvent;
  
  if (event.status !== 'approved' && event.status !== 'active') {
    throw new functions.https.HttpsError('failed-precondition', 'Event is not active');
  }

  if (!safetyRulesAccepted) {
    throw new functions.https.HttpsError('failed-precondition', 'Safety rules must be accepted');
  }

  if (event.photographyConsentRequired && !photographyConsentGiven) {
    throw new functions.https.HttpsError('failed-precondition', 'Photography consent is required for this event');
  }

  if (event.registeredCount >= event.maxAttendees) {
    throw new functions.https.HttpsError('resource-exhausted', 'Event is at capacity');
  }

  const existingAttendance = await db
    .collection('event_attendance')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .get();

  if (!existingAttendance.empty) {
    throw new functions.https.HttpsError('already-exists', 'Already registered for this event');
  }

  const attendanceId = db.collection('event_attendance').doc().id;
  
  const attendance: EventAttendance = {
    attendanceId,
    eventId,
    userId,
    ambassadorId: event.ambassadorId,
    registeredAt: new Date(),
    checkedIn: false,
    checkInMethod: 'qr_code',
    safetyRulesAccepted,
    photographyConsentGiven,
    newCreatorOnboarded: false,
    newUserOnboarded: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await db.collection('event_attendance').doc(attendanceId).set(attendance);

  await db.collection('ambassador_events').doc(eventId).update({
    registeredCount: admin.firestore.FieldValue.increment(1),
    updatedAt: new Date()
  });

  return { attendanceId, status: 'registered' };
});

/**
 * Check in to event via QR code
 */
export const checkInToEvent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { eventId, qrCode } = data;

  if (!eventId || !qrCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing eventId or qrCode');
  }

  const eventDoc = await db.collection('ambassador_events').doc(eventId).get();
  if (!eventDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Event not found');
  }

  const event = eventDoc.data() as AmbassadorEvent;
  
  if (event.checkInQRCode !== qrCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid QR code');
  }

  if (!event.checkInEnabled) {
    throw new functions.https.HttpsError('failed-precondition', 'Check-in is not enabled for this event');
  }

  const attendanceSnapshot = await db
    .collection('event_attendance')
    .where('eventId', '==', eventId)
    .where('userId', '==', userId)
    .get();

  if (attendanceSnapshot.empty) {
    throw new functions.https.HttpsError('not-found', 'No registration found. Please register first.');
  }

  const attendanceDoc = attendanceSnapshot.docs[0];
  const attendance = attendanceDoc.data() as EventAttendance;

  if (attendance.checkedIn) {
    throw new functions.https.HttpsError('already-exists', 'Already checked in');
  }

  await db.collection('event_attendance').doc(attendanceDoc.id).update({
    checkedIn: true,
    checkInTime: new Date(),
    checkInMethod: 'qr_code',
    updatedAt: new Date()
  });

  await db.collection('ambassador_events').doc(eventId).update({
    attendedCount: admin.firestore.FieldValue.increment(1),
    updatedAt: new Date()
  });

  return { success: true, checkInTime: new Date() };
});

/**
 * Evaluate Ambassador Performance
 */
export const evaluateAmbassadorPerformance = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { ambassadorId, period } = data;

  if (!ambassadorId || !period) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing ambassadorId or period');
  }

  const adminId = context.auth.uid;
  const adminDoc = await db.collection('users').doc(adminId).get();
  if (!adminDoc.exists || !adminDoc.data()?.isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can evaluate performance');
  }

  const ambassadorDoc = await db.collection('ambassador_profiles').doc(ambassadorId).get();
  if (!ambassadorDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Ambassador not found');
  }

  const [year, month] = period.split('-');
  const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
  const endDate = new Date(parseInt(year), parseInt(month), 0);

  const eventsSnapshot = await db
    .collection('ambassador_events')
    .where('ambassadorId', '==', ambassadorId)
    .where('startTime', '>=', startDate)
    .where('startTime', '<=', endDate)
    .where('status', '==', 'completed')
    .get();

  const eventsHosted = eventsSnapshot.size;
  let totalAttendees = 0;
  let totalSatisfaction = 0;
  let satisfactionCount = 0;

  for (const eventDoc of eventsSnapshot.docs) {
    const event = eventDoc.data() as AmbassadorEvent;
    totalAttendees += event.attendedCount;

    const attendanceSnapshot = await db
      .collection('event_attendance')
      .where('eventId', '==', event.eventId)
      .where('satisfactionScore', '>', 0)
      .get();

    attendanceSnapshot.forEach(doc => {
      const attendance = doc.data() as EventAttendance;
      if (attendance.satisfactionScore) {
        totalSatisfaction += attendance.satisfactionScore;
        satisfactionCount++;
      }
    });
  }

  const newUsersSnapshot = await db
    .collection('event_attendance')
    .where('ambassadorId', '==', ambassadorId)
    .where('newUserOnboarded', '==', true)
    .where('registeredAt', '>=', startDate)
    .where('registeredAt', '<=', endDate)
    .get();

  const newCreatorsSnapshot = await db
    .collection('event_attendance')
    .where('ambassadorId', '==', ambassadorId)
    .where('newCreatorOnboarded', '==', true)
    .where('registeredAt', '>=', startDate)
    .where('registeredAt', '<=', endDate)
    .get();

  const averageSatisfactionScore = satisfactionCount > 0 ? totalSatisfaction / satisfactionCount : 0;
  const averageAttendance = eventsHosted > 0 ? totalAttendees / eventsHosted : 0;

  const performance: AmbassadorPerformance = {
    ambassadorId,
    period,
    eventsHosted,
    totalAttendees,
    averageAttendance,
    averageSatisfactionScore,
    newUsersOnboarded: newUsersSnapshot.size,
    newCreatorsOnboarded: newCreatorsSnapshot.size,
    verifiedCreators: 0,
    estimatedCreatorRevenueUplift: 0,
    ticketRevenue: 0,
    tokensEarned: 0,
    tokensPending: 0,
    complianceViolations: 0,
    warningsIssued: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await db.collection('ambassador_performance')
    .doc(`${ambassadorId}_${period}`)
    .set(performance);

  return performance;
});

/**
 * Revoke Ambassador Access
 */
export const revokeAmbassadorAccess = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const adminId = context.auth.uid;
  const { ambassadorId, reason } = data;

  if (!ambassadorId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing ambassadorId or reason');
  }

  const adminDoc = await db.collection('users').doc(adminId).get();
  if (!adminDoc.exists || !adminDoc.data()?.isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can revoke access');
  }

  const ambassadorDoc = await db.collection('ambassador_profiles').doc(ambassadorId).get();
  if (!ambassadorDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Ambassador not found');
  }

  await db.collection('ambassador_profiles').doc(ambassadorId).update({
    status: 'revoked',
    revokedBy: adminId,
    revokedAt: new Date(),
    revokedReason: reason,
    updatedAt: new Date()
  });

  const activeEvents = await db
    .collection('ambassador_events')
    .where('ambassadorId', '==', ambassadorId)
    .where('status', 'in', ['pending_approval', 'approved', 'active'])
    .get();

  const batch = db.batch();
  activeEvents.forEach(doc => {
    batch.update(doc.ref, {
      status: 'cancelled',
      updatedAt: new Date()
    });
  });
  await batch.commit();

  return { success: true, eventsCancelled: activeEvents.size };
});

/**
 * Report Compliance Incident
 */
export const reportComplianceIncident = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const reportedBy = context.auth.uid;
  const { ambassadorId, eventId, incidentType, severity, description, evidenceUrls, witnessStatements } = data;

  if (!ambassadorId || !incidentType || !severity || !description) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  const incidentId = db.collection('ambassador_compliance_incidents').doc().id;

  const incident: AmbassadorComplianceIncident = {
    incidentId,
    ambassadorId,
    eventId,
    incidentType,
    severity,
    description,
    reportedBy,
    evidenceUrls: evidenceUrls || [],
    witnessStatements: witnessStatements || [],
    status: 'reported',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await db.collection('ambassador_compliance_incidents').doc(incidentId).set(incident);

  if (severity === 'critical') {
    await db.collection('ambassador_profiles').doc(ambassadorId).update({
      status: 'suspended',
      updatedAt: new Date()
    });
  }

  return { incidentId, status: 'reported' };
});