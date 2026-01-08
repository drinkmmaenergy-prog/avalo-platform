import * as functions from 'firebase-functions';
import { db, serverTimestamp, generateId, timestamp as Timestamp } from './init';
import { z } from 'zod';

const FieldValue = {
  serverTimestamp: serverTimestamp
};

// PACK 164: Global Creator Accelerator Program
// Zero Beauty Bias · Zero Romantic Angle · Skill & Productivity Focused

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

const AcceleratorTrackType = z.enum([
  'digital_products',
  'fitness_wellness',
  'photography_art',
  'business_productivity',
  'entertainment',
  'education'
]);

const ForbiddenTrackKeywords = [
  'seduction',
  'flirting',
  'dating',
  'intimacy',
  'erotic',
  'attraction',
  'romance',
  'sexual',
  'seductive'
];

const ApplicationSchema = z.object({
  user_id: z.string(),
  track_ids: z.array(z.string()).min(1).max(3),
  business_plan: z.object({
    executive_summary: z.string().min(100),
    target_audience: z.string().min(50),
    revenue_model: z.string().min(50),
    marketing_strategy: z.string().min(50),
    timeline: z.string().min(50)
  }),
  goals: z.object({
    financial_goals: z.string().min(50),
    educational_goals: z.string().min(50),
    target_revenue_6months: z.number().optional(),
    target_revenue_12months: z.number().optional()
  }),
  sample_content_urls: z.array(z.string().url()).min(2).max(5),
  sample_content_sfw: z.literal(true),
  experience_level: z.enum(['beginner', 'intermediate', 'advanced']),
  weekly_availability_hours: z.number().min(5).max(40)
});

const GrantTypeSchema = z.enum([
  'equipment',
  'production',
  'studio',
  'marketing',
  'software'
]);

interface AcceleratorApplication {
  id: string;
  user_id: string;
  track_ids: string[];
  business_plan: {
    executive_summary: string;
    target_audience: string;
    revenue_model: string;
    marketing_strategy: string;
    timeline: string;
  };
  goals: {
    financial_goals: string;
    educational_goals: string;
    target_revenue_6months?: number;
    target_revenue_12months?: number;
  };
  sample_content_urls: string[];
  sample_content_sfw: boolean;
  experience_level: string;
  weekly_availability_hours: number;
  status: 'draft' | 'pending' | 'under_review' | 'accepted' | 'rejected';
  created_at: FirebaseFirestore.Timestamp;
  updated_at: FirebaseFirestore.Timestamp;
  reviewed_at?: FirebaseFirestore.Timestamp;
  reviewer_id?: string;
  review_notes?: string;
  rejection_reason?: string;
}

interface AcceleratorMilestone {
  id: string;
  user_id: string;
  track_id: string;
  milestone_type: string;
  title: string;
  description: string;
  due_date: FirebaseFirestore.Timestamp;
  progress_percentage: number;
  completed: boolean;
  completed_at?: FirebaseFirestore.Timestamp;
  verified: boolean;
  verified_by?: string;
  verified_at?: FirebaseFirestore.Timestamp;
  submission_url?: string;
  notes?: string;
  created_at: FirebaseFirestore.Timestamp;
}

interface AcceleratorGrant {
  id: string;
  user_id: string;
  grant_type: string;
  amount: number;
  purpose: string;
  status: 'pending' | 'approved' | 'disbursed' | 'rejected';
  created_at: FirebaseFirestore.Timestamp;
  approved_at?: FirebaseFirestore.Timestamp;
  approved_by?: string;
  disbursed_at?: FirebaseFirestore.Timestamp;
  rejection_reason?: string;
}

// ============================================================================
// ANTI-BIAS VALIDATION HELPERS
// ============================================================================

function containsForbiddenContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return ForbiddenTrackKeywords.some(keyword => lowerText.includes(keyword));
}

function validateNoSuperficialCriteria(data: any): boolean {
  const superficialKeys = [
    'appearance_rating',
    'attractiveness_score',
    'beauty_rating',
    'looks_score',
    'flirt_engagement',
    'seduction_metrics',
    'body_type_preference',
    'clothing_style_rating'
  ];
  
  return !superficialKeys.some(key => key in data);
}

async function validateUserEligibility(userId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    return { eligible: false, reason: 'User not found' };
  }
  
  const userData = userDoc.data()!;
  
  // Must be 18+
  if (userData.age < 18) {
    return { eligible: false, reason: 'Must be 18 or older' };
  }
  
  // Must have verified identity
  const kycDoc = await db.collection('kyc_verifications').doc(userId).get();
  if (!kycDoc.exists || kycDoc.data()?.status !== 'verified') {
    return { eligible: false, reason: 'Identity verification required' };
  }
  
  // Must not have active enforcement actions
  const enforcementDoc = await db.collection('enforcement_states').doc(userId).get();
  if (enforcementDoc.exists) {
    const enforcement = enforcementDoc.data()!;
    if (enforcement.current_state === 'suspended' || enforcement.current_state === 'banned') {
      return { eligible: false, reason: 'Account has enforcement actions' };
    }
  }
  
  return { eligible: true };
}

// ============================================================================
// CALLABLE FUNCTIONS
// ============================================================================

export const applyToAccelerator = functions.https.onCall(async (data, context) => {
  // Authentication required
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const userId = context.auth.uid;
  
  try {
    // Validate input
    const validatedData = ApplicationSchema.parse(data);
    
    // Ensure user_id matches authenticated user
    if (validatedData.user_id !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Cannot apply for another user');
    }
    
    // Check eligibility
    const eligibility = await validateUserEligibility(userId);
    if (!eligibility.eligible) {
      throw new functions.https.HttpsError('failed-precondition', eligibility.reason || 'Not eligible');
    }
    
    // Check for existing active application
    const existingApplications = await db.collection('accelerator_applications')
      .where('user_id', '==', userId)
      .where('status', 'in', ['pending', 'under_review', 'accepted'])
      .limit(1)
      .get();
    
    if (!existingApplications.empty) {
      throw new functions.https.HttpsError('already-exists', 'You already have an active application');
    }
    
    // Validate no forbidden content in business plan or goals
    const textToCheck = [
      validatedData.business_plan.executive_summary,
      validatedData.business_plan.target_audience,
      validatedData.business_plan.revenue_model,
      validatedData.goals.financial_goals,
      validatedData.goals.educational_goals
    ].join(' ');
    
    if (containsForbiddenContent(textToCheck)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Application contains forbidden content related to seduction, dating, or intimacy coaching'
      );
    }
    
    // Validate tracks exist and are allowed
    const trackDocs = await Promise.all(
      validatedData.track_ids.map(trackId => 
        db.collection('accelerator_tracks').doc(trackId).get()
      )
    );
    
    for (const trackDoc of trackDocs) {
      if (!trackDoc.exists) {
        throw new functions.https.HttpsError('not-found', `Track not found: ${trackDoc.id}`);
      }
      
      const trackData = trackDoc.data()!;
      if (containsForbiddenContent(trackData.track_name || '')) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Cannot apply to forbidden track types'
        );
      }
    }
    
    // Create application
    const applicationData = {
      ...validatedData,
      status: 'pending',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    };
    
    const applicationRef = await db.collection('accelerator_applications').add(applicationData);
    
    // Send notification
    await db.collection('notifications').add({
      user_id: userId,
      type: 'accelerator_application_submitted',
      title: 'Application Submitted',
      body: 'Your accelerator program application has been submitted for review.',
      data: {
        application_id: applicationRef.id
      },
      read: false,
      created_at: serverTimestamp()
    });
    
    // Log analytics
    await db.collection('accelerator_analytics').add({
      user_id: userId,
      metric_type: 'application_submitted',
      track_ids: validatedData.track_ids,
      experience_level: validatedData.experience_level,
      recorded_at: serverTimestamp()
    });
    
    return {
      success: true,
      application_id: applicationRef.id,
      message: 'Application submitted successfully'
    };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.message);
    }
    throw error;
  }
});

export const reviewAcceleratorApplication = functions.https.onCall(async (data, context) => {
  // Authentication required
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const reviewerId = context.auth.uid;
  
  // Check moderator role
  const reviewerDoc = await db.collection('users').doc(reviewerId).get();
  if (!reviewerDoc.exists || !['admin', 'moderator'].includes(reviewerDoc.data()?.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Moderator access required');
  }
  
  const { application_id, status, review_notes, rejection_reason } = data;
  
  if (!application_id || !status) {
    throw new functions.https.HttpsError('invalid-argument', 'application_id and status required');
  }
  
  if (!['accepted', 'rejected', 'under_review'].includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid status');
  }
  
  // Validate rejection reason doesn't contain superficial criteria
  if (rejection_reason && containsForbiddenContent(rejection_reason)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Rejection reason cannot reference appearance, attractiveness, or superficial criteria'
    );
  }
  
  const applicationRef = db.collection('accelerator_applications').doc(application_id);
  const applicationDoc = await applicationRef.get();
  
  if (!applicationDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Application not found');
  }
  
  const updateData: any = {
    status,
    reviewer_id: reviewerId,
    reviewed_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };
  
  if (review_notes) {
    updateData.review_notes = review_notes;
  }
  
  if (rejection_reason && status === 'rejected') {
    updateData.rejection_reason = rejection_reason;
  }
  
  await applicationRef.update(updateData);
  
  const applicationData = applicationDoc.data() as AcceleratorApplication;
  
  // Send notification to applicant
  const notificationBody = status === 'accepted' 
    ? 'Congratulations! Your accelerator application has been accepted.'
    : status === 'rejected'
    ? 'Your accelerator application was not accepted at this time.'
    : 'Your accelerator application is under review.';
  
  await db.collection('notifications').add({
    user_id: applicationData.user_id,
    type: `accelerator_application_${status}`,
    title: `Application ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    body: notificationBody,
    data: {
      application_id,
      status
    },
    read: false,
    created_at: serverTimestamp()
  });
  
  // If accepted, create initial milestones
  if (status === 'accepted') {
    await createInitialMilestones(applicationData.user_id, applicationData.track_ids);
  }
  
  // Log analytics
  await db.collection('accelerator_analytics').add({
    user_id: applicationData.user_id,
    metric_type: 'application_reviewed',
    review_outcome: status,
    reviewer_id: reviewerId,
    recorded_at: serverTimestamp()
  });
  
  return {
    success: true,
    message: `Application ${status}`
  };
});

export const assignAcceleratorTrack = functions.https.onCall(async (data, context) => {
  // Authentication required
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const adminId = context.auth.uid;
  
  // Check admin role
  const adminDoc = await db.collection('users').doc(adminId).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { user_id, track_id } = data;
  
  if (!user_id || !track_id) {
    throw new functions.https.HttpsError('invalid-argument', 'user_id and track_id required');
  }
  
  // Verify track exists
  const trackDoc = await db.collection('accelerator_tracks').doc(track_id).get();
  if (!trackDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Track not found');
  }
  
  // Verify user has accepted application
  const applicationQuery = await db.collection('accelerator_applications')
    .where('user_id', '==', user_id)
    .where('status', '==', 'accepted')
    .limit(1)
    .get();
  
  if (applicationQuery.empty) {
    throw new functions.https.HttpsError('failed-precondition', 'User does not have an accepted application');
  }
  
  // Create milestones for this track
  await createInitialMilestones(user_id, [track_id]);
  
  // Send notification
  await db.collection('notifications').add({
    user_id,
    type: 'accelerator_track_assigned',
    title: 'New Track Assigned',
    body: `You've been assigned to a new accelerator track.`,
    data: {
      track_id
    },
    read: false,
    created_at: serverTimestamp()
  });
  
  return {
    success: true,
    message: 'Track assigned successfully'
  };
});

export const completeMilestone = functions.https.onCall(async (data, context) => {
  // Authentication required
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const userId = context.auth.uid;
  const { milestone_id, submission_url, notes } = data;
  
  if (!milestone_id) {
    throw new functions.https.HttpsError('invalid-argument', 'milestone_id required');
  }
  
  const milestoneRef = db.collection('accelerator_milestones').doc(milestone_id);
  const milestoneDoc = await milestoneRef.get();
  
  if (!milestoneDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Milestone not found');
  }
  
  const milestoneData = milestoneDoc.data() as AcceleratorMilestone;
  
  // Verify ownership
  if (milestoneData.user_id !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot complete another user\'s milestone');
  }
  
  // Cannot re-complete
  if (milestoneData.completed) {
    throw new functions.https.HttpsError('failed-precondition', 'Milestone already completed');
  }
  
  // Submission URL required for completion
  if (!submission_url) {
    throw new functions.https.HttpsError('invalid-argument', 'submission_url required for completion');
  }
  
  // Update milestone
  await milestoneRef.update({
    completed: true,
    completed_at: serverTimestamp(),
    submission_url,
    notes: notes || '',
    progress_percentage: 100,
    updated_at: serverTimestamp()
  });
  
  // Check if all milestones for track are completed
  const allMilestones = await db.collection('accelerator_milestones')
    .where('user_id', '==', userId)
    .where('track_id', '==', milestoneData.track_id)
    .get();
  
  const allCompleted = allMilestones.docs.every(doc => 
    doc.id === milestone_id || doc.data().completed
  );
  
  if (allCompleted) {
    // Issue certificate
    await issueAcceleratorCertificateInternal(userId, milestoneData.track_id);
  }
  
  // Send notification
  await db.collection('notifications').add({
    user_id: userId,
    type: 'accelerator_milestone_completed',
    title: 'Milestone Completed',
    body: `You've completed "${milestoneData.title}". Great work!`,
    data: {
      milestone_id,
      track_id: milestoneData.track_id
    },
    read: false,
    created_at: serverTimestamp()
  });
  
  // Log analytics
  await db.collection('accelerator_analytics').add({
    user_id: userId,
    metric_type: 'milestone_completed',
    track_id: milestoneData.track_id,
    milestone_type: milestoneData.milestone_type,
    recorded_at: serverTimestamp()
  });
  
  return {
    success: true,
    message: 'Milestone completed',
    all_track_milestones_completed: allCompleted
  };
});

export const issueAcceleratorGrant = functions.https.onCall(async (data, context) => {
  // Authentication required
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const adminId = context.auth.uid;
  
  // Check admin role
  const adminDoc = await db.collection('users').doc(adminId).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  try {
    const validatedData = z.object({
      user_id: z.string(),
      grant_type: GrantTypeSchema,
      amount: z.number().positive().max(10000),
      purpose: z.string().min(20),
      notes: z.string().optional()
    }).parse(data);
    
    // Validate no forbidden requirements
    if (containsForbiddenContent(validatedData.purpose)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Grant purpose cannot require romantic, flirty, or intimate content'
      );
    }
    
    // Verify user is in accelerator
    const applicationQuery = await db.collection('accelerator_applications')
      .where('user_id', '==', validatedData.user_id)
      .where('status', '==', 'accepted')
      .limit(1)
      .get();
    
    if (applicationQuery.empty) {
      throw new functions.https.HttpsError('failed-precondition', 'User not in accelerator program');
    }
    
    // Create grant
    const grantData = {
      ...validatedData,
      status: 'approved',
      approved_at: serverTimestamp(),
      approved_by: adminId,
      created_at: serverTimestamp()
    };
    
    const grantRef = await db.collection('accelerator_grants').add(grantData);
    
    // Send notification
    await db.collection('notifications').add({
      user_id: validatedData.user_id,
      type: 'accelerator_grant_approved',
      title: 'Grant Approved',
      body: `You've been awarded a ${validatedData.grant_type} grant of $${validatedData.amount}.`,
      data: {
        grant_id: grantRef.id,
        amount: validatedData.amount,
        grant_type: validatedData.grant_type
      },
      read: false,
      created_at: serverTimestamp()
    });
    
    // Log analytics
    await db.collection('accelerator_analytics').add({
      user_id: validatedData.user_id,
      metric_type: 'grant_issued',
      grant_type: validatedData.grant_type,
      amount: validatedData.amount,
      recorded_at: serverTimestamp()
    });
    
    return {
      success: true,
      grant_id: grantRef.id,
      message: 'Grant issued successfully'
    };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new functions.https.HttpsError('invalid-argument', error.message);
    }
    throw error;
  }
});

export const issueAcceleratorCertificate = functions.https.onCall(async (data, context) => {
  // Authentication required
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  
  const adminId = context.auth.uid;
  
  // Check admin role
  const adminDoc = await db.collection('users').doc(adminId).get();
  if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { user_id, track_id } = data;
  
  if (!user_id || !track_id) {
    throw new functions.https.HttpsError('invalid-argument', 'user_id and track_id required');
  }
  
  return await issueAcceleratorCertificateInternal(user_id, track_id);
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function createInitialMilestones(userId: string, trackIds: string[]): Promise<void> {
  const batch = db.batch();
  
  for (const trackId of trackIds) {
    const trackDoc = await db.collection('accelerator_tracks').doc(trackId).get();
    if (!trackDoc.exists) continue;
    
    const trackData = trackDoc.data()!;
    const curriculum = trackData.curriculum || [];
    
    // Create milestones from curriculum
    for (let i = 0; i < curriculum.length; i++) {
      const module = curriculum[i];
      const milestoneRef = db.collection('accelerator_milestones').doc();
      
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + ((i + 1) * 7)); // Weekly milestones
      
      batch.set(milestoneRef, {
        user_id: userId,
        track_id: trackId,
        milestone_type: module.type || 'lesson',
        title: module.title,
        description: module.description || '',
        due_date: Timestamp.fromDate(dueDate),
        progress_percentage: 0,
        completed: false,
        verified: false,
        created_at: serverTimestamp(),
        order: i
      });
    }
  }
  
  await batch.commit();
}

async function issueAcceleratorCertificateInternal(userId: string, trackId: string): Promise<any> {
  // Check if certificate already exists
  const existingCert = await db.collection('accelerator_certificates')
    .where('user_id', '==', userId)
    .where('track_id', '==', trackId)
    .limit(1)
    .get();
  
  if (!existingCert.empty) {
    return {
      success: true,
      certificate_id: existingCert.docs[0].id,
      message: 'Certificate already issued'
    };
  }
  
  // Get track info
  const trackDoc = await db.collection('accelerator_tracks').doc(trackId).get();
  if (!trackDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Track not found');
  }
  
  const trackData = trackDoc.data()!;
  
  // Create certificate
  const certificateData = {
    user_id: userId,
    track_id: trackId,
    track_name: trackData.track_name,
    issued_at: serverTimestamp(),
    curriculum_completed: true,
    visibility: 'dashboard_only',
    certificate_number: `ACC-${Date.now()}-${userId.substring(0, 8)}`
  };
  
  const certRef = await db.collection('accelerator_certificates').add(certificateData);
  
  // Send notification
  await db.collection('notifications').add({
    user_id: userId,
    type: 'accelerator_certificate_issued',
    title: 'Certificate Earned!',
    body: `Congratulations! You've earned your ${trackData.track_name} certificate.`,
    data: {
      certificate_id: certRef.id,
      track_id: trackId
    },
    read: false,
    created_at: serverTimestamp()
  });
  
  // Log analytics
  await db.collection('accelerator_analytics').add({
    user_id: userId,
    metric_type: 'certificate_earned',
    track_id: trackId,
    recorded_at: serverTimestamp()
  });
  
  return {
    success: true,
    certificate_id: certRef.id,
    message: 'Certificate issued successfully'
  };
}

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

export const checkMilestoneDeadlines = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const now = Timestamp.now();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Find milestones due in next 24 hours
    const upcomingMilestones = await db.collection('accelerator_milestones')
      .where('completed', '==', false)
      .where('due_date', '<=', Timestamp.fromDate(tomorrow))
      .get();
    
    const batch = db.batch();
    
    for (const milestoneDoc of upcomingMilestones.docs) {
      const milestone = milestoneDoc.data() as AcceleratorMilestone;
      
      // Send reminder notification
      const notificationRef = db.collection('notifications').doc();
      batch.set(notificationRef, {
        user_id: milestone.user_id,
        type: 'accelerator_milestone_reminder',
        title: 'Milestone Due Soon',
        body: `Your milestone "${milestone.title}" is due soon.`,
        data: {
          milestone_id: milestoneDoc.id,
          track_id: milestone.track_id,
          due_date: milestone.due_date
        },
        read: false,
        created_at: serverTimestamp()
      });
    }
    
    await batch.commit();
    
    console.log(`Sent ${upcomingMilestones.size} milestone reminders`);
  });

export const calculateAcceleratorAnalytics = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    // Calculate retention metrics (non-emotional)
    const acceptedApplications = await db.collection('accelerator_applications')
      .where('status', '==', 'accepted')
      .get();
    
    for (const appDoc of acceptedApplications.docs) {
      const application = appDoc.data() as AcceleratorApplication;
      
      // Get milestone completion rate
      const milestones = await db.collection('accelerator_milestones')
        .where('user_id', '==', application.user_id)
        .get();
      
      const completedCount = milestones.docs.filter(doc => doc.data().completed).length;
      const totalCount = milestones.size;
      const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
      
      // Store analytics (objective metrics only)
      await db.collection('accelerator_analytics').add({
        user_id: application.user_id,
        metric_type: 'completion_rate',
        completion_percentage: completionRate,
        completed_milestones: completedCount,
        total_milestones: totalCount,
        recorded_at: serverTimestamp()
      });
    }
    
    console.log('Calculated accelerator analytics');
  });