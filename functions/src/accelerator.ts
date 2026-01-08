/**
 * PACK 197 - Avalo Global Creator Accelerator
 * 
 * Professional creator growth program with:
 * - Merit-based selection
 * - Professional mentorship
 * - Funding opportunities
 * - Strict anti-exploitation rules
 * 
 * FORBIDDEN:
 * - Romantic/sexual favoritism
 * - Beauty-based selection
 * - Parasocial mentorship
 * - Relationship-based funding
 */

import * as functions from 'firebase-functions';
import { db, serverTimestamp, increment, generateId } from './init';
import { FieldValue } from 'firebase-admin/firestore';

// Types

interface AcceleratorApplication {
  userId: string;
  userName: string;
  email: string;
  currentTier: 'starter' | 'growth' | 'pro' | 'partner';
  portfolioUrl?: string;
  socialLinks: {
    youtube?: string;
    instagram?: string;
    twitter?: string;
    tiktok?: string;
  };
  goals: string;
  experience: string;
  businessPlan: string;
  whyAccelerator: string;
  commitment: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  reviewNotes?: string;
  appliedAt: FirebaseFirestore.Timestamp;
  reviewedAt?: FirebaseFirestore.Timestamp;
  reviewedBy?: string;
  flags: {
    hasEthicsViolations: boolean;
    hasExploitationFlags: boolean;
  };
}

interface MentorshipSession {
  sessionId: string;
  participantId: string;
  mentorId: string;
  sessionType: 'one-on-one' | 'group' | 'workshop';
  topic: string;
  scheduledAt: FirebaseFirestore.Timestamp;
  duration: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  sessionNotes?: string;
  participantFeedback?: {
    rating: number;
    comment: string;
    reportedIssues: string[];
  };
  ethicsCompliance: {
    professionalBoundaries: boolean;
    noRomanticAdvances: boolean;
    noFavoritism: boolean;
    verified: boolean;
  };
  completedAt?: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

interface GrantRequest {
  requestId: string;
  participantId: string;
  userName: string;
  grantType: 'equipment' | 'marketing' | 'production' | 'studio_access';
  amount: number;
  purpose: string;
  justification: string;
  itemsRequested: Array<{
    item: string;
    cost: number;
    vendor?: string;
  }>;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'disbursed';
  reviewNotes?: string;
  approvedAmount?: number;
  disbursedAt?: FirebaseFirestore.Timestamp;
  requestedAt: FirebaseFirestore.Timestamp;
  reviewedAt?: FirebaseFirestore.Timestamp;
  reviewedBy?: string;
}

interface AcceleratorParticipant {
  userId: string;
  userName: string;
  email: string;
  tier: 'starter' | 'growth' | 'pro' | 'partner';
  joinedAt: FirebaseFirestore.Timestamp;
  mentorId?: string;
  ethicsAgreementSigned: boolean;
  ethicsAgreementSignedAt?: FirebaseFirestore.Timestamp;
  progress: {
    workshopsCompleted: number;
    mentoringSessions: number;
    grantsReceived: number;
    businessMilestones: number;
  };
  certifications: string[];
  currentGoals: string[];
  safetyTraining: {
    mentalHealth: boolean;
    boundaries: boolean;
    harassment: boolean;
    burnout: boolean;
    fanManagement: boolean;
  };
  violations: {
    count: number;
    lastViolation?: FirebaseFirestore.Timestamp;
    notes: string[];
  };
}

// Apply to Accelerator

export const applyToAccelerator = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const {
    userName,
    email,
    currentTier,
    portfolioUrl,
    socialLinks,
    goals,
    experience,
    businessPlan,
    whyAccelerator,
    commitment,
  } = data;

  if (!userName || !email || !goals || !experience || !businessPlan || !whyAccelerator || !commitment) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required application fields');
  }

  const existingApplication = await db
    .collection('accelerator_applications')
    .where('userId', '==', userId)
    .where('status', 'in', ['pending', 'under_review', 'approved'])
    .get();

  if (!existingApplication.empty) {
    throw new functions.https.HttpsError('already-exists', 'You already have an active application');
  }

  const applicationId = generateId();
  const application: AcceleratorApplication = {
    userId,
    userName,
    email,
    currentTier: currentTier || 'starter',
    portfolioUrl,
    socialLinks: socialLinks || {},
    goals,
    experience,
    businessPlan,
    whyAccelerator,
    commitment,
    status: 'pending',
    appliedAt: FieldValue.serverTimestamp() as any,
    flags: {
      hasEthicsViolations: false,
      hasExploitationFlags: false,
    },
  };

  await db.collection('accelerator_applications').doc(applicationId).set(application);

  return {
    success: true,
    applicationId,
    message: 'Application submitted successfully',
  };
});

// Review Application (Admin only)

export const reviewAcceleratorApplication = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const adminCheck = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminCheck.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { applicationId, status, reviewNotes } = data;

  if (!applicationId || !status || !['approved', 'rejected'].includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid review data');
  }

  const applicationRef = db.collection('accelerator_applications').doc(applicationId);
  const application = await applicationRef.get();

  if (!application.exists) {
    throw new functions.https.HttpsError('not-found', 'Application not found');
  }

  await applicationRef.update({
    status,
    reviewNotes: reviewNotes || '',
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedBy: context.auth.uid,
  });

  if (status === 'approved') {
    const appData = application.data() as AcceleratorApplication;
    const participantId = appData.userId;

    const participant: AcceleratorParticipant = {
      userId: participantId,
      userName: appData.userName,
      email: appData.email,
      tier: 'starter',
      joinedAt: FieldValue.serverTimestamp() as any,
      ethicsAgreementSigned: false,
      progress: {
        workshopsCompleted: 0,
        mentoringSessions: 0,
        grantsReceived: 0,
        businessMilestones: 0,
      },
      certifications: [],
      currentGoals: [],
      safetyTraining: {
        mentalHealth: false,
        boundaries: false,
        harassment: false,
        burnout: false,
        fanManagement: false,
      },
      violations: {
        count: 0,
        notes: [],
      },
    };

    await db.collection('accelerator_participants').doc(participantId).set(participant);
  }

  return {
    success: true,
    message: `Application ${status}`,
  };
});

// Assign Mentor

export const assignMentor = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const adminCheck = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminCheck.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { participantId, mentorId } = data;

  if (!participantId || !mentorId) {
    throw new functions.https.HttpsError('invalid-argument', 'Participant ID and Mentor ID required');
  }

  const mentorDoc = await db.collection('accelerator_mentors').doc(mentorId).get();
  if (!mentorDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Mentor not found');
  }

  const mentorData = mentorDoc.data();
  if (!mentorData?.ethicsAgreementSigned) {
    throw new functions.https.HttpsError('failed-precondition', 'Mentor must sign ethics agreement first');
  }

  await db.collection('accelerator_participants').doc(participantId).update({
    mentorId,
    mentorAssignedAt: FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    message: 'Mentor assigned successfully',
  };
});

// Log Mentorship Session

export const logMentorshipSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const {
    participantId,
    mentorId,
    sessionType,
    topic,
    scheduledAt,
    duration,
  } = data;

  if (!participantId || !mentorId || !sessionType || !topic || !scheduledAt || !duration) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required session fields');
  }

  const sessionId = generateId();
  const session: MentorshipSession = {
    sessionId,
    participantId,
    mentorId,
    sessionType,
    topic,
    scheduledAt,
    duration,
    status: 'scheduled',
    ethicsCompliance: {
      professionalBoundaries: true,
      noRomanticAdvances: true,
      noFavoritism: true,
      verified: false,
    },
    createdAt: FieldValue.serverTimestamp() as any,
  };

  await db.collection('mentorship_sessions').doc(sessionId).set(session);

  return {
    success: true,
    sessionId,
    message: 'Session scheduled successfully',
  };
});

// Complete Mentorship Session

export const completeMentorshipSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId, sessionNotes, participantFeedback } = data;

  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Session ID required');
  }

  const sessionRef = db.collection('mentorship_sessions').doc(sessionId);
  const session = await sessionRef.get();

  if (!session.exists) {
    throw new functions.https.HttpsError('not-found', 'Session not found');
  }

  const sessionData = session.data() as MentorshipSession;

  if (sessionData.mentorId !== context.auth.uid && sessionData.participantId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized for this session');
  }

  await sessionRef.update({
    status: 'completed',
    sessionNotes,
    participantFeedback,
    completedAt: FieldValue.serverTimestamp(),
  });

  await db.collection('accelerator_participants').doc(sessionData.participantId).update({
    'progress.mentoringSessions': increment(1),
  });

  return {
    success: true,
    message: 'Session completed successfully',
  };
});

// Request Grant

export const requestGrant = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;

  const participant = await db.collection('accelerator_participants').doc(userId).get();
  if (!participant.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'Must be an accelerator participant');
  }

  const participantData = participant.data() as AcceleratorParticipant;
  if (!participantData.ethicsAgreementSigned) {
    throw new functions.https.HttpsError('failed-precondition', 'Ethics agreement must be signed first');
  }

  const {
    grantType,
    amount,
    purpose,
    justification,
    itemsRequested,
  } = data;

  if (!grantType || !amount || !purpose || !justification || !itemsRequested || itemsRequested.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required grant request fields');
  }

  if (amount <= 0 || amount > 10000) {
    throw new functions.https.HttpsError('invalid-argument', 'Grant amount must be between $1 and $10,000');
  }

  const requestId = generateId();
  const grantRequest: GrantRequest = {
    requestId,
    participantId: userId,
    userName: participantData.userName,
    grantType,
    amount,
    purpose,
    justification,
    itemsRequested,
    status: 'pending',
    requestedAt: FieldValue.serverTimestamp() as any,
  };

  await db.collection('creator_grants').doc(requestId).set(grantRequest);

  return {
    success: true,
    requestId,
    message: 'Grant request submitted successfully',
  };
});

// Issue Grant (Admin only)

export const issueGrant = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const adminCheck = await db.collection('admins').doc(context.auth.uid).get();
  if (!adminCheck.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { requestId, status, reviewNotes, approvedAmount } = data;

  if (!requestId || !status || !['approved', 'rejected'].includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid grant review data');
  }

  const grantRef = db.collection('creator_grants').doc(requestId);
  const grant = await grantRef.get();

  if (!grant.exists) {
    throw new functions.https.HttpsError('not-found', 'Grant request not found');
  }

  const updateData: any = {
    status,
    reviewNotes: reviewNotes || '',
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedBy: context.auth.uid,
  };

  if (status === 'approved') {
    updateData.approvedAmount = approvedAmount;
    updateData.disbursedAt = FieldValue.serverTimestamp();

    const grantData = grant.data() as GrantRequest;
    await db.collection('accelerator_participants').doc(grantData.participantId).update({
      'progress.grantsReceived': increment(1),
    });
  }

  await grantRef.update(updateData);

  return {
    success: true,
    message: `Grant ${status}`,
  };
});

// Sign Ethics Agreement

export const signEthicsAgreement = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { agreed, agreementVersion } = data;

  if (!agreed || agreementVersion !== '1.0') {
    throw new functions.https.HttpsError('invalid-argument', 'Must agree to current ethics agreement');
  }

  const participantRef = db.collection('accelerator_participants').doc(userId);
  const participant = await participantRef.get();

  if (!participant.exists) {
    throw new functions.https.HttpsError('not-found', 'Participant not found');
  }

  await participantRef.update({
    ethicsAgreementSigned: true,
    ethicsAgreementSignedAt: FieldValue.serverTimestamp(),
    ethicsAgreementVersion: agreementVersion,
  });

  return {
    success: true,
    message: 'Ethics agreement signed successfully',
  };
});

// Update Tier Progress

export const updateTierProgress = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const { milestone } = data;

  if (!milestone || !['workshop', 'certification', 'business_milestone'].includes(milestone)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid milestone type');
  }

  const participantRef = db.collection('accelerator_participants').doc(userId);
  const participant = await participantRef.get();

  if (!participant.exists) {
    throw new functions.https.HttpsError('not-found', 'Participant not found');
  }

  const participantData = participant.data() as AcceleratorParticipant;

  if (milestone === 'workshop') {
    await participantRef.update({
      'progress.workshopsCompleted': increment(1),
    });
  } else if (milestone === 'business_milestone') {
    await participantRef.update({
      'progress.businessMilestones': increment(1),
    });
  }

  const updatedParticipant = await participantRef.get();
  const updatedData = updatedParticipant.data() as AcceleratorParticipant;
  const newTier = calculateTier(updatedData.progress);

  if (newTier !== participantData.tier) {
    await participantRef.update({
      tier: newTier,
      tierUpgradedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      tierUpgraded: true,
      newTier,
      message: `Congratulations! You've advanced to ${newTier} tier`,
    };
  }

  return {
    success: true,
    tierUpgraded: false,
    currentTier: participantData.tier,
    message: 'Progress updated successfully',
  };
});

// Detect Exploitation Attempt

export const detectExploitationAttempt = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { reportType, reportedUserId, description, evidence } = data;

  if (!reportType || !reportedUserId || !description) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required report fields');
  }

  const reportId = generateId();
  const report = {
    reportId,
    reporterId: context.auth.uid,
    reportType,
    reportedUserId,
    description,
    evidence: evidence || [],
    status: 'pending',
    severity: calculateSeverity(reportType, description),
    reportedAt: FieldValue.serverTimestamp(),
    investigated: false,
  };

  await db.collection('accelerator_violation_reports').doc(reportId).set(report);

  const userRef = db.collection('accelerator_participants').doc(reportedUserId);
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    await userRef.update({
      'violations.count': increment(1),
      'violations.lastViolation': FieldValue.serverTimestamp(),
      'violations.notes': FieldValue.arrayUnion(`${reportType}: ${description.substring(0, 100)}`),
    });
  }

  return {
    success: true,
    reportId,
    message: 'Report submitted. Investigation will begin immediately.',
  };
});

// Helper Functions

function calculateTier(progress: AcceleratorParticipant['progress']): 'starter' | 'growth' | 'pro' | 'partner' {
  const { workshopsCompleted, mentoringSessions, businessMilestones } = progress;

  if (workshopsCompleted >= 10 && mentoringSessions >= 15 && businessMilestones >= 5) {
    return 'partner';
  } else if (workshopsCompleted >= 6 && mentoringSessions >= 8 && businessMilestones >= 3) {
    return 'pro';
  } else if (workshopsCompleted >= 3 && mentoringSessions >= 4 && businessMilestones >= 1) {
    return 'growth';
  }
  return 'starter';
}

function calculateSeverity(reportType: string, description: string): 'low' | 'medium' | 'high' | 'critical' {
  const lowerDesc = description.toLowerCase();
  
  const criticalKeywords = ['sexual', 'romantic', 'date', 'relationship', 'beauty', 'attractive', 'coercion'];
  const highKeywords = ['favoritism', 'inappropriate', 'boundary', 'harassment'];
  const mediumKeywords = ['unprofessional', 'bias', 'preference'];

  if (criticalKeywords.some(word => lowerDesc.includes(word))) {
    return 'critical';
  } else if (highKeywords.some(word => lowerDesc.includes(word))) {
    return 'high';
  } else if (mediumKeywords.some(word => lowerDesc.includes(word))) {
    return 'medium';
  }
  
  return 'low';
}