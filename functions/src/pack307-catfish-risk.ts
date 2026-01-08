/**
 * PACK 307 — Fake Profile Detection & Catfish Risk Engine
 * 
 * Automatic risk scoring system for detecting fake profiles and catfish accounts.
 * Builds on top of PACK 306 (mandatory verification) to continuously monitor profiles.
 * 
 * Key Features:
 * - AI face detection probability scoring
 * - Filter intensity analysis
 * - Photo consistency checking across multiple images
 * - Gender/age mismatch detection
 * - Identity match scoring vs verification selfie
 * - Behavioral signals (reports, reply rates, etc.)
 * - Automated actions based on risk level (LOW/MEDIUM/HIGH/CRITICAL)
 * 
 * Dependencies:
 * - PACK 268: Global Risk & Safety Engine
 * - PACK 275/276: Profile photos rules
 * - PACK 281: Safety policies
 * - PACK 293: Notifications
 * - PACK 296: Audit logs
 * - PACK 306: Mandatory Identity Verification
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

const db = admin.firestore();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface CatfishRiskProfile {
  userId: string;
  catfishRiskScore: number;           // 0.0-1.0 where 1.0 = extremely likely fake/catfish
  aiFaceProbability: number;          // probability profile photo is AI-generated
  filterIntensityScore: number;       // very heavy filters = closer to 1.0
  photoConsistencyScore: number;      // similarity of face across photos (low = inconsistent)
  genderMismatchFlag: boolean;        // declared vs detected gender
  ageMismatchFlag: boolean;           // declared vs detected age bracket
  identityMatchScore: number;         // selfie vs profile photos from PACK 306
  profileCompletenessScore: number;   // reused from analytics
  reportCountCatfish: number;         // number of "fake profile / catfish" user reports
  lastRecomputedAt: admin.firestore.Timestamp;
  riskLevel: RiskLevel;
  autoHiddenFromDiscovery: boolean;
  autoHiddenFromSwipe: boolean;
  manualReviewRequired: boolean;
}

export interface RiskComputationInput {
  userId: string;
  profilePhotos: string[];            // URLs of profile photos
  verificationSelfieUrl?: string;     // From PACK 306
  declaredGender?: string;
  declaredAge?: number;
  profileCompleteness?: number;
  reportCountCatfish?: number;
  inboundInterestCount?: number;
  replyRate?: number;
  meetingCancellationRate?: number;
}

export interface ImageAnalysisResult {
  aiFaceProbability: number;
  filterIntensityScore: number;
  detectedGender?: string;
  detectedAgeRange?: { min: number; max: number };
  faceEmbedding?: number[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CATFISH_RISK_CONFIG = {
  // Risk score thresholds
  THRESHOLDS: {
    LOW: 0.3,      // < 0.3 = LOW
    MEDIUM: 0.6,   // 0.3-0.6 = MEDIUM
    HIGH: 0.8,     // 0.6-0.8 = HIGH
                   // >= 0.8 = CRITICAL
  },
  
  // Score weights for risk calculation
  WEIGHTS: {
    AI_FACE: 0.25,
    FILTER_INTENSITY: 0.15,
    PHOTO_CONSISTENCY: 0.20,
    IDENTITY_MATCH: 0.25,
    GENDER_MISMATCH: 0.10,
    AGE_MISMATCH: 0.10,
    REPORTS: 0.15,
  },
  
  // Detection thresholds
  DETECTION: {
    AI_FACE_THRESHOLD: 0.7,
    FILTER_INTENSITY_THRESHOLD: 0.8,
    PHOTO_CONSISTENCY_THRESHOLD: 0.5,
    IDENTITY_MATCH_THRESHOLD: 0.7,
    REPORT_COUNT_THRESHOLD: 3,
  },
  
  // Batch processing
  BATCH_SIZE: 100,
  MAX_BATCH_DURATION_MS: 540000, // 9 minutes (Cloud Functions limit is 9-10 min)
};

// ============================================================================
// CORE RISK SCORING FUNCTION
// ============================================================================

/**
 * Recompute catfish risk score for a specific user
 * This is the main entry point for risk calculation
 */
export async function recomputeUserCatfishRisk(userId: string): Promise<CatfishRiskProfile> {
  logger.info(`Starting catfish risk computation for user ${userId}`);
  
  try {
    // Gather all necessary data
    const userData = await gatherUserData(userId);
    
    // Initialize or get existing risk profile
    const existingRisk = await getUserRiskProfile(userId);
    
    // Analyze profile photos
    const photoAnalysis = await analyzeProfilePhotos(userData);
    
    // Compare with verification data
    const identityMatch = await compareWithVerification(userId, userData);
    
    // Calculate risk score
    const riskScore = calculateCatfishRiskScore({
      aiFaceProbability: photoAnalysis.aiFaceProbability,
      filterIntensityScore: photoAnalysis.filterIntensityScore,
      photoConsistencyScore: photoAnalysis.photoConsistencyScore,
      identityMatchScore: identityMatch.score,
      genderMismatchFlag: identityMatch.genderMismatch,
      ageMismatchFlag: identityMatch.ageMismatch,
      reportCountCatfish: userData.reportCountCatfish || 0,
    });
    
    // Determine risk level
    const riskLevel = determineRiskLevel(riskScore);
    
    // Create updated risk profile
    const riskProfile: CatfishRiskProfile = {
      userId,
      catfishRiskScore: riskScore,
      aiFaceProbability: photoAnalysis.aiFaceProbability,
      filterIntensityScore: photoAnalysis.filterIntensityScore,
      photoConsistencyScore: photoAnalysis.photoConsistencyScore,
      genderMismatchFlag: identityMatch.genderMismatch,
      ageMismatchFlag: identityMatch.ageMismatch,
      identityMatchScore: identityMatch.score,
      profileCompletenessScore: userData.profileCompleteness || 0,
      reportCountCatfish: userData.reportCountCatfish || 0,
      lastRecomputedAt: admin.firestore.Timestamp.now(),
      riskLevel,
      autoHiddenFromDiscovery: false,
      autoHiddenFromSwipe: false,
      manualReviewRequired: false,
    };
    
    // Apply automated actions based on risk level
    await applyAutomatedActions(riskProfile, existingRisk);
    
    // Save to Firestore
    await db.collection('userRisk').doc(userId).set(riskProfile, { merge: true });
    
    // Log the event
    await logRiskEvent({
      userId,
      eventType: 'CATFISH_RISK_UPDATED',
      oldScore: existingRisk?.catfishRiskScore || 0,
      newScore: riskScore,
      oldLevel: existingRisk?.riskLevel || 'LOW',
      newLevel: riskLevel,
      metadata: {
        aiFaceProbability: photoAnalysis.aiFaceProbability,
        filterIntensityScore: photoAnalysis.filterIntensityScore,
        photoConsistencyScore: photoAnalysis.photoConsistencyScore,
        identityMatchScore: identityMatch.score,
      },
    });
    
    logger.info(`Catfish risk computed for user ${userId}: score=${riskScore.toFixed(3)}, level=${riskLevel}`);
    
    return riskProfile;
    
  } catch (error) {
    logger.error(`Error computing catfish risk for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Calculate catfish risk score using heuristic algorithm
 * Score range: 0.0 (definitely real) to 1.0 (definitely fake)
 */
function calculateCatfishRiskScore(input: {
  aiFaceProbability: number;
  filterIntensityScore: number;
  photoConsistencyScore: number;
  identityMatchScore: number;
  genderMismatchFlag: boolean;
  ageMismatchFlag: boolean;
  reportCountCatfish: number;
}): number {
  let score = 0.0;
  const config = CATFISH_RISK_CONFIG;
  
  // AI face detection
  if (input.aiFaceProbability > config.DETECTION.AI_FACE_THRESHOLD) {
    score += config.WEIGHTS.AI_FACE;
  }
  
  // Heavy filters
  if (input.filterIntensityScore > config.DETECTION.FILTER_INTENSITY_THRESHOLD) {
    score += config.WEIGHTS.FILTER_INTENSITY;
  }
  
  // Low photo consistency
  if (input.photoConsistencyScore < config.DETECTION.PHOTO_CONSISTENCY_THRESHOLD) {
    score += config.WEIGHTS.PHOTO_CONSISTENCY;
  }
  
  // Low identity match
  if (input.identityMatchScore < config.DETECTION.IDENTITY_MATCH_THRESHOLD) {
    score += config.WEIGHTS.IDENTITY_MATCH;
  }
  
  // Gender mismatch
  if (input.genderMismatchFlag) {
    score += config.WEIGHTS.GENDER_MISMATCH;
  }
  
  // Age mismatch
  if (input.ageMismatchFlag) {
    score += config.WEIGHTS.AGE_MISMATCH;
  }
  
  // Multiple catfish reports
  if (input.reportCountCatfish >= config.DETECTION.REPORT_COUNT_THRESHOLD) {
    score += config.WEIGHTS.REPORTS;
  }
  
  // Clamp to 0.0-1.0
  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Determine risk level from score
 */
function determineRiskLevel(score: number): RiskLevel {
  const thresholds = CATFISH_RISK_CONFIG.THRESHOLDS;
  
  if (score >= thresholds.HIGH) {
    return 'CRITICAL';
  } else if (score >= thresholds.MEDIUM) {
    return 'HIGH';
  } else if (score >= thresholds.LOW) {
    return 'MEDIUM';
  } else {
    return 'LOW';
  }
}

// ============================================================================
// DATA GATHERING
// ============================================================================

async function gatherUserData(userId: string): Promise<RiskComputationInput> {
  // Get user profile
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (!userData) {
    throw new Error(`User ${userId} not found`);
  }
  
  // Get profile photos
  const profilePhotos: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const photoUrl = userData[`photo${i}Url`];
    if (photoUrl) {
      profilePhotos.push(photoUrl);
    }
  }
  
  // Get verification selfie from PACK 306
  const verificationDoc = await db.collection('users').doc(userId)
    .collection('verification').doc('status').get();
  const verificationData = verificationDoc.data();
  
  // Get catfish reports count
  const reportsSnapshot = await db.collection('reports')
    .where('reportedUserId', '==', userId)
    .where('reportType', '==', 'FAKE_PROFILE_OR_CATFISH')
    .get();
  
  return {
    userId,
    profilePhotos,
    verificationSelfieUrl: verificationData?.selfieUrl,
    declaredGender: userData.gender,
    declaredAge: userData.age,
    profileCompleteness: userData.profileCompleteness || 0,
    reportCountCatfish: reportsSnapshot.size,
  };
}

async function getUserRiskProfile(userId: string): Promise<CatfishRiskProfile | null> {
  const riskDoc = await db.collection('userRisk').doc(userId).get();
  return riskDoc.exists ? riskDoc.data() as CatfishRiskProfile : null;
}

// ============================================================================
// IMAGE ANALYSIS (Placeholder for AI Integration)
// ============================================================================

/**
 * Analyze profile photos for AI generation, filters, and consistency
 * 
 * TODO: Integrate with actual AI services:
 * - AWS Rekognition for face detection
 * - Sensity AI / Reality Defender for AI-generated detection
 * - Custom models for filter detection
 */
async function analyzeProfilePhotos(userData: RiskComputationInput): Promise<{
  aiFaceProbability: number;
  filterIntensityScore: number;
  photoConsistencyScore: number;
}> {
  // PLACEHOLDER: Replace with actual AI service integration
  // For now, return mock values that would come from real analysis
  
  const photoCount = userData.profilePhotos.length;
  
  if (photoCount === 0) {
    return {
      aiFaceProbability: 0.5,  // Unknown, medium risk
      filterIntensityScore: 0.5,
      photoConsistencyScore: 0.0,  // No photos to compare
    };
  }
  
  // In production, analyze each photo and aggregate results
  const mockAiFaceProbability = Math.random() * 0.3; // Most profiles are real
  const mockFilterIntensity = Math.random() * 0.6;   // Some filters are common
  const mockConsistency = 0.7 + Math.random() * 0.3; // Most real profiles are consistent
  
  logger.info(`Photo analysis for user ${userData.userId} (MOCK):`, {
    photoCount,
    aiFaceProbability: mockAiFaceProbability,
    filterIntensity: mockFilterIntensity,
    consistency: mockConsistency,
  });
  
  return {
    aiFaceProbability: mockAiFaceProbability,
    filterIntensityScore: mockFilterIntensity,
    photoConsistencyScore: mockConsistency,
  };
}

/**
 * Compare profile photos with verification selfie
 * 
 * TODO: Integrate with face recognition service (FaceNet, AWS Rekognition, Azure Face API)
 */
async function compareWithVerification(
  userId: string,
  userData: RiskComputationInput
): Promise<{
  score: number;
  genderMismatch: boolean;
  ageMismatch: boolean;
}> {
  // PLACEHOLDER: Replace with actual face comparison
  
  if (!userData.verificationSelfieUrl || userData.profilePhotos.length === 0) {
    return {
      score: 0.5,  // Unknown
      genderMismatch: false,
      ageMismatch: false,
    };
  }
  
  // In production, compute face embeddings and compare
  const mockIdentityScore = 0.8 + Math.random() * 0.2; // Most verified users match
  const mockGenderMismatch = Math.random() < 0.05;     // 5% mismatch rate
  const mockAgeMismatch = Math.random() < 0.10;        // 10% mismatch rate (age estimation less accurate)
  
  logger.info(`Identity verification for user ${userId} (MOCK):`, {
    score: mockIdentityScore,
    genderMismatch: mockGenderMismatch,
    ageMismatch: mockAgeMismatch,
  });
  
  return {
    score: mockIdentityScore,
    genderMismatch: mockGenderMismatch,
    ageMismatch: mockAgeMismatch,
  };
}

// ============================================================================
// AUTOMATED ACTIONS
// ============================================================================

async function applyAutomatedActions(
  newProfile: CatfishRiskProfile,
  oldProfile: CatfishRiskProfile | null
): Promise<void> {
  const userId = newProfile.userId;
  const riskLevel = newProfile.riskLevel;
  
  // Determine what actions to take
  let shouldHideFromDiscovery = false;
  let shouldHideFromSwipe = false;
  let shouldRequireReview = false;
  let shouldFreezeEarnings = false;
  
  switch (riskLevel) {
    case 'LOW':
      // No actions needed
      break;
      
    case 'MEDIUM':
      // Internal flag only for moderators
      shouldRequireReview = false; // Just monitor
      break;
      
    case 'HIGH':
      shouldHideFromDiscovery = true;
      shouldHideFromSwipe = true;
      shouldRequireReview = true;
      break;
      
    case 'CRITICAL':
      shouldHideFromDiscovery = true;
      shouldHideFromSwipe = true;
      shouldRequireReview = true;
      shouldFreezeEarnings = true;
      break;
  }
  
  // Update profile with action flags
  newProfile.autoHiddenFromDiscovery = shouldHideFromDiscovery;
  newProfile.autoHiddenFromSwipe = shouldHideFromSwipe;
  newProfile.manualReviewRequired = shouldRequireReview;
  
  // Apply discovery/swipe hiding
  if (shouldHideFromDiscovery && !oldProfile?.autoHiddenFromDiscovery) {
    await hideFromDiscovery(userId);
    await logAuditEvent(userId, 'CATFISH_AUTO_HIDE_APPLIED', {
      reason: 'High catfish risk detected',
      riskLevel,
      riskScore: newProfile.catfishRiskScore,
    });
  }
  
  // Add to review queue if needed
  if (shouldRequireReview && !oldProfile?.manualReviewRequired) {
    await addToReviewQueue(newProfile);
  }
  
  // Freeze earnings for CRITICAL risk
  if (shouldFreezeEarnings) {
    await freezeUserEarnings(userId, 'Catfish risk - Critical level');
  }
  
  // Send notification to user if status changed
  if (oldProfile && oldProfile.riskLevel !== newProfile.riskLevel && riskLevel !== 'LOW') {
    await notifyUserOfReview(userId, riskLevel);
  }
  
  // Release restrictions if risk level decreased
  if (oldProfile && shouldRelease(oldProfile.riskLevel, newProfile.riskLevel)) {
    await releaseRestrictions(userId, oldProfile);
  }
}

function shouldRelease(oldLevel: RiskLevel, newLevel: RiskLevel): boolean {
  const levels: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const oldIndex = levels.indexOf(oldLevel);
  const newIndex = levels.indexOf(newLevel);
  return newIndex < oldIndex && oldIndex >= 2; // Released from HIGH or CRITICAL
}

async function hideFromDiscovery(userId: string): Promise<void> {
  // Remove from discovery indices
  await db.collection('discovery_profiles').doc(userId).update({
    hidden: true,
    hiddenReason: 'catfish_risk_high',
    hiddenAt: admin.firestore.Timestamp.now(),
  });
  
  logger.info(`User ${userId} hidden from discovery due to catfish risk`);
}

async function addToReviewQueue(profile: CatfishRiskProfile): Promise<void> {
  const reviewId = `catfish_${profile.userId}_${Date.now()}`;
  
  await db.collection('verificationReviewQueue').doc(reviewId).set({
    reviewId,
    userId: profile.userId,
    status: 'PENDING_REVIEW',
    flagReason: 'catfish_risk_detected',
    priority: profile.riskLevel === 'CRITICAL' ? 10 : 5,
    catfishRiskScore: profile.catfishRiskScore,
    riskLevel: profile.riskLevel,
    aiFaceProbability: profile.aiFaceProbability,
    filterIntensityScore: profile.filterIntensityScore,
    photoConsistencyScore: profile.photoConsistencyScore,
    identityMatchScore: profile.identityMatchScore,
    reportCountCatfish: profile.reportCountCatfish,
    createdAt: admin.firestore.Timestamp.now(),
  });
  
  logger.info(`User ${profile.userId} added to review queue with priority ${profile.riskLevel === 'CRITICAL' ? 10 : 5}`);
}

async function freezeUserEarnings(userId: string, reason: string): Promise<void> {
  await db.collection('users').doc(userId).update({
    'earnings.frozen': true,
    'earnings.frozenReason': reason,
    'earnings.frozenAt': admin.firestore.Timestamp.now(),
  });
  
  logger.warn(`Earnings frozen for user ${userId}: ${reason}`);
}

async function notifyUserOfReview(userId: string, riskLevel: RiskLevel): Promise<void> {
  // Send in-app notification (PACK 293 integration)
  await db.collection('notifications').add({
    userId,
    type: 'ACCOUNT_REVIEW',
    title: 'Profile Under Review',
    message: 'Your profile is under review due to possible inconsistencies. You can continue existing chats, but some discovery features may be limited for a short time.',
    priority: riskLevel === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
    actionUrl: '/support/contact?reason=PROFILE_UNDER_REVIEW',
    createdAt: admin.firestore.Timestamp.now(),
    status: 'UNREAD',
  });
}

async function releaseRestrictions(userId: string, oldProfile: CatfishRiskProfile): Promise<void> {
  // Remove discovery hiding
  if (oldProfile.autoHiddenFromDiscovery) {
    await db.collection('discovery_profiles').doc(userId).update({
      hidden: false,
      hiddenReason: admin.firestore.FieldValue.delete(),
      hiddenAt: admin.firestore.FieldValue.delete(),
      unhiddenAt: admin.firestore.Timestamp.now(),
    });
  }
  
  // Log the release
  await logAuditEvent(userId, 'CATFISH_AUTO_HIDE_RELEASED', {
    reason: 'Risk level decreased',
    previousLevel: oldProfile.riskLevel,
  });
  
  logger.info(`Restrictions released for user ${userId}`);
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

async function logRiskEvent(event: {
  userId: string;
  eventType: string;
  oldScore: number;
  newScore: number;
  oldLevel: RiskLevel;
  newLevel: RiskLevel;
  metadata: any;
}): Promise<void> {
  await db.collection('catfishRiskEvents').add({
    ...event,
    timestamp: admin.firestore.Timestamp.now(),
  });
}

async function logAuditEvent(userId: string, action: string, metadata: any): Promise<void> {
  await db.collection('auditLogs').add({
    action,
    userId,
    timestamp: admin.firestore.Timestamp.now(),
    metadata,
    source: 'pack307-catfish-risk',
  });
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Callable function: Recompute catfish risk for a specific user
 * Can be called by admins or triggered by system events
 */
export const recomputeCatfishRisk = functions.https.onCall(async (data, context) => {
  const { userId } = data;
  
  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }
  
  // Allow admins or the user themselves
  const isAdmin = context.auth?.token?.admin === true;
  const isSelf = context.auth?.uid === userId;
  
  if (!isAdmin && !isSelf) {
    throw new functions.https.HttpsError('permission-denied', 'Not authorized to recompute risk');
  }
  
  try {
    const riskProfile = await recomputeUserCatfishRisk(userId);
    
    return {
      success: true,
      riskLevel: riskProfile.riskLevel,
      message: 'Risk score recomputed successfully',
    };
  } catch (error: any) {
    logger.error('Error recomputing catfish risk:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Scheduled function: Daily cron job to recalculate catfish risk for active users
 * Runs every day at 3:00 AM UTC
 */
export const cronRecomputeCatfishRiskDaily = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    logger.info('Starting daily catfish risk recalculation cron job');
    
    const startTime = Date.now();
    let processedCount = 0;
    let errorCount = 0;
    
    try {
      // Get users who need recalculation:
      // 1. Users who uploaded/changed photos recently (last 7 days)
      // 2. Users with new catfish reports
      // 3. Users with existing risk scores that need refresh
      
      const sevenDaysAgo = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );
      
      // Query users with recent photo updates
      const recentPhotoUpdates = await db.collection('users')
        .where('profileUpdatedAt', '>=', sevenDaysAgo)
        .limit(CATFISH_RISK_CONFIG.BATCH_SIZE)
        .get();
      
      // Query users with recent reports
      const recentReports = await db.collection('reports')
        .where('reportType', '==', 'FAKE_PROFILE_OR_CATFISH')
        .where('createdAt', '>=', sevenDaysAgo)
        .get();
      
      const reportedUserIds = new Set(
        recentReports.docs.map(doc => doc.data().reportedUserId)
      );
      
      // Combine user IDs
      const userIdsToProcess = new Set<string>();
      recentPhotoUpdates.docs.forEach(doc => userIdsToProcess.add(doc.id));
      reportedUserIds.forEach(userId => userIdsToProcess.add(userId as string));
      
      logger.info(`Found ${userIdsToProcess.size} users to process`);
      
      // Process in batches to avoid timeout
      const userIdsArray = Array.from(userIdsToProcess);
      for (const userId of userIdsArray) {
        // Check remaining time
        if (Date.now() - startTime > CATFISH_RISK_CONFIG.MAX_BATCH_DURATION_MS) {
          logger.warn('Approaching function timeout, stopping batch processing');
          break;
        }
        
        try {
          await recomputeUserCatfishRisk(userId);
          processedCount++;
          
          // Small delay to avoid rate limits
          if (processedCount % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          logger.error(`Error processing user ${userId}:`, error);
          errorCount++;
        }
      }
      
      const duration = Date.now() - startTime;
      logger.info(`Daily catfish risk cron completed:`, {
        duration: `${duration}ms`,
        processed: processedCount,
        errors: errorCount,
      });
      
      // Log completion to Firestore
      await db.collection('cronJobs').add({
        jobName: 'catfish_risk_daily',
        completedAt: admin.firestore.Timestamp.now(),
        duration,
        processed: processedCount,
        errors: errorCount,
      });
      
    } catch (error) {
      logger.error('Fatal error in daily catfish risk cron:', error);
      throw error;
    }
  });

/**
 * Firestore trigger: Recompute risk when profile photos are updated
 */
export const onProfilePhotoUpdate = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if any profile photos changed
    let photosChanged = false;
    for (let i = 1; i <= 6; i++) {
      if (before[`photo${i}Url`] !== after[`photo${i}Url`]) {
        photosChanged = true;
        break;
      }
    }
    
    if (photosChanged) {
      logger.info(`Profile photos changed for user ${userId}, triggering risk recalculation`);
      
      try {
        await recomputeUserCatfishRisk(userId);
      } catch (error) {
        logger.error(`Error recomputing risk after photo update for user ${userId}:`, error);
      }
    }
  });

/**
 * Firestore trigger: Recompute risk when verification is completed
 */
export const onVerificationComplete = functions.firestore
  .document('users/{userId}/verification/status')
  .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const before = change.before.data();
    const after = change.after.data();
    
    // Check if verification status changed to VERIFIED
    if (before?.status !== 'VERIFIED' && after?.status === 'VERIFIED') {
      logger.info(`Verification completed for user ${userId}, triggering risk recalculation`);
      
      try {
        await recomputeUserCatfishRisk(userId);
      } catch (error) {
        logger.error(`Error recomputing risk after verification for user ${userId}:`, error);
      }
    }
  });

/**
 * Firestore trigger: Recompute risk when catfish report is created
 */
export const onCatfishReport = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snapshot, context) => {
    const report = snapshot.data();
    
    if (report.reportType === 'FAKE_PROFILE_OR_CATFISH') {
      const reportedUserId = report.reportedUserId;
      
      logger.info(`Catfish report created for user ${reportedUserId}, triggering risk recalculation`);
      
      try {
        // Increment report count and recompute
        await db.collection('userRisk').doc(reportedUserId).set({
          reportCountCatfish: admin.firestore.FieldValue.increment(1),
        }, { merge: true });
        
        await recomputeUserCatfishRisk(reportedUserId);
      } catch (error) {
        logger.error(`Error handling catfish report for user ${reportedUserId}:`, error);
      }
    }
  });

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Admin callable: Override risk assessment
 */
export const adminOverrideCatfishRisk = functions.https.onCall(async (data, context) => {
  // Verify admin
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  const { userId, action, notes } = data;
  
  if (!userId || !action) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and action are required');
  }
  
  try {
    switch (action) {
      case 'confirm_legit':
        await db.collection('userRisk').doc(userId).update({
          manualReviewRequired: false,
          autoHiddenFromDiscovery: false,
          autoHiddenFromSwipe: false,
          'adminOverride.confirmed': true,
          'adminOverride.notes': notes,
          'adminOverride.by': context.auth.uid,
          'adminOverride.at': admin.firestore.Timestamp.now(),
        });
        await releaseRestrictions(userId, { autoHiddenFromDiscovery: true } as CatfishRiskProfile);
        break;
        
      case 'require_reverification':
        await db.collection('users').doc(userId).collection('verification').doc('status').update({
          status: 'FAILED',
          reasonFailed: 'Reverification required by admin',
        });
        break;
        
      case 'ban':
        await db.collection('users').doc(userId).update({
          status: 'BANNED',
          bannedReason: 'Confirmed fake profile / catfish',
          bannedAt: admin.firestore.Timestamp.now(),
          bannedBy: context.auth.uid,
        });
        break;
        
      default:
        throw new functions.https.HttpsError('invalid-argument', `Unknown action: ${action}`);
    }
    
    // Log admin action
    await db.collection('adminActions').add({
      adminId: context.auth.uid,
      actionType: `CATFISH_RISK_${action.toUpperCase()}`,
      targetUserId: userId,
      notes,
      timestamp: admin.firestore.Timestamp.now(),
    });
    
    return { success: true, message: `Action ${action} completed successfully` };
    
  } catch (error: any) {
    logger.error('Error in admin override:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Admin callable: Get catfish risk dashboard data
 */
export const getCatfishRiskDashboard = functions.https.onCall(async (data, context) => {
  // Verify admin
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  
  try {
    const { riskLevel, limit = 50 } = data;
    
    let query = db.collection('userRisk');
    
    if (riskLevel) {
      query = query.where('riskLevel', '==', riskLevel) as any;
    }
    
    const snapshot = await query
      .orderBy('catfishRiskScore', 'desc')
      .limit(limit)
      .get();
    
    const profiles = snapshot.docs.map(doc => ({
      userId: doc.id,
      ...doc.data(),
    }));
    
    // Get statistics
    const stats = await getCatfishRiskStats();
    
    return {
      profiles,
      stats,
    };
    
  } catch (error: any) {
    logger.error('Error getting dashboard data:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

async function getCatfishRiskStats(): Promise<any> {
  const counters = {
    total: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    needsReview: 0,
  };
  
  const snapshot = await db.collection('userRisk').get();
  
  snapshot.docs.forEach(doc => {
    const data = doc.data() as CatfishRiskProfile;
    counters.total++;
    
    switch (data.riskLevel) {
      case 'LOW': counters.low++; break;
      case 'MEDIUM': counters.medium++; break;
      case 'HIGH': counters.high++; break;
      case 'CRITICAL': counters.critical++; break;
    }
    
    if (data.manualReviewRequired) {
      counters.needsReview++;
    }
  });
  
  return counters;
}