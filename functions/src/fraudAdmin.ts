/**
 * PACK 71 — Fraud Analytics Admin APIs
 * 
 * Admin endpoints for reviewing and managing fraud flags
 */

import { db, admin } from './init';
import * as functions from 'firebase-functions';
import { FraudProfile, FraudReviewAction } from './types/fraudTypes';
import { writeAuditLog } from './auditLogger';
import { AdminContext } from './types/adminTypes';
import { getFraudProfile, collectAndAnalyzeFraudSignals } from './fraudEngine';

// ============================================================================
// GET FRAUD PROFILE (ADMIN)
// ============================================================================

/**
 * Get fraud profile for a user with detailed information
 */
export async function adminGetFraudProfile(params: {
  userId: string;
  adminContext: AdminContext;
}): Promise<{
  profile: FraudProfile | null;
  recentActivity: {
    payouts30d: number;
    disputes30d: number;
    violations7d: number;
  };
}> {
  const { userId, adminContext } = params;
  
  // Get fraud profile
  const profile = await getFraudProfile(userId);
  
  // Get recent activity summary
  const now = Date.now();
  const date30dAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const date7dAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  
  // Count recent payouts
  const payoutsSnapshot = await db.collection('payout_requests')
    .where('userId', '==', userId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(date30dAgo))
    .get();
  
  // Count recent disputes
  const disputesSnapshot = await db.collection('disputes')
    .where('userId', '==', userId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(date30dAgo))
    .get();
  
  // Count recent rate limit violations
  const violationsSnapshot = await db.collection('rate_limits')
    .where('userId', '==', userId)
    .where('lastUpdatedAt', '>=', admin.firestore.Timestamp.fromDate(date7dAgo))
    .get();
  
  // Log admin access
  await writeAuditLog({
    admin: adminContext,
    targetType: 'USER',
    targetId: userId,
    action: 'VIEW_FRAUD_PROFILE',
    severity: 'INFO',
    userId
  });
  
  return {
    profile,
    recentActivity: {
      payouts30d: payoutsSnapshot.size,
      disputes30d: disputesSnapshot.size,
      violations7d: violationsSnapshot.size
    }
  };
}

// ============================================================================
// REVIEW FRAUD FLAG (ADMIN)
// ============================================================================

/**
 * Admin review of fraud flag - clear or confirm hold
 */
export async function adminReviewFraud(params: {
  userId: string;
  action: 'CLEAR' | 'CONFIRM_HOLD';
  note?: string;
  adminContext: AdminContext;
}): Promise<{
  success: boolean;
  profile: FraudProfile;
}> {
  const { userId, action, note, adminContext } = params;
  
  // Get current fraud profile
  const currentProfile = await getFraudProfile(userId);
  
  if (!currentProfile) {
    throw new functions.https.HttpsError(
      'not-found',
      'Fraud profile not found for user'
    );
  }
  
  const before = { ...currentProfile };
  const now = admin.firestore.Timestamp.now();
  
  // Update based on action
  let updatedProfile: FraudProfile;
  
  if (action === 'CLEAR') {
    // Clear the hold and reset risk score
    updatedProfile = {
      ...currentProfile,
      payoutHold: false,
      riskScore: Math.max(0, currentProfile.riskScore - 30), // Reduce risk score
      lastUpdatedAt: now
    };
    
    // Update risk level based on new score
    if (updatedProfile.riskScore <= 30) {
      updatedProfile.riskLevel = 'LOW';
    } else if (updatedProfile.riskScore <= 60) {
      updatedProfile.riskLevel = 'MEDIUM';
    }
    
  } else {
    // CONFIRM_HOLD - maintain the hold
    updatedProfile = {
      ...currentProfile,
      payoutHold: true,
      lastUpdatedAt: now
    };
  }
  
  // Save updated profile
  await db.collection('fraud_profiles').doc(userId).set(updatedProfile);
  
  // Create review record
  const reviewData: FraudReviewAction = {
    userId,
    action,
    note: note || null,
    reviewedBy: adminContext.adminId,
    reviewedAt: now
  };
  
  await db.collection('fraud_reviews').add(reviewData);
  
  // Write detailed audit log
  await writeAuditLog({
    admin: adminContext,
    targetType: 'USER',
    targetId: userId,
    action: action === 'CLEAR' ? 'CLEAR_FRAUD_HOLD' : 'CONFIRM_FRAUD_HOLD',
    severity: action === 'CLEAR' ? 'WARN' : 'CRITICAL',
    before,
    after: updatedProfile,
    userId,
    reason: note
  });
  
  return {
    success: true,
    profile: updatedProfile
  };
}

// ============================================================================
// RECALCULATE FRAUD SCORE (ADMIN)
// ============================================================================

/**
 * Force recalculation of fraud score for a user
 */
export async function adminRecalculateFraudScore(params: {
  userId: string;
  adminContext: AdminContext;
}): Promise<{
  success: boolean;
  profile: FraudProfile;
}> {
  const { userId, adminContext } = params;
  
  // Recalculate fraud signals and update profile
  const profile = await collectAndAnalyzeFraudSignals(userId);
  
  // Log admin action
  await writeAuditLog({
    admin: adminContext,
    targetType: 'USER',
    targetId: userId,
    action: 'RECALCULATE_FRAUD_SCORE',
    severity: 'INFO',
    after: profile,
    userId
  });
  
  return {
    success: true,
    profile
  };
}

// ============================================================================
// LIST HIGH-RISK USERS (ADMIN)
// ============================================================================

/**
 * Get list of users with high fraud risk
 */
export async function adminListHighRiskUsers(params: {
  riskLevel?: 'HIGH' | 'CRITICAL';
  payoutHoldOnly?: boolean;
  limit?: number;
  adminContext: AdminContext;
}): Promise<{
  users: Array<{
    userId: string;
    riskScore: number;
    riskLevel: string;
    payoutHold: boolean;
    lastUpdatedAt: number;
  }>;
}> {
  const { riskLevel, payoutHoldOnly = false, limit = 50, adminContext } = params;
  
  let query: any = db.collection('fraud_profiles');
  
  // Filter by risk level if specified
  if (riskLevel) {
    query = query.where('riskLevel', '==', riskLevel);
  } else {
    // Default to HIGH or CRITICAL
    query = query.where('riskLevel', 'in', ['HIGH', 'CRITICAL']);
  }
  
  // Filter by payout hold if specified
  if (payoutHoldOnly) {
    query = query.where('payoutHold', '==', true);
  }
  
  // Order by risk score descending
  query = query.orderBy('riskScore', 'desc').limit(limit);
  
  const snapshot = await query.get();
  
  const users = snapshot.docs.map((doc) => {
    const data = doc.data() as FraudProfile;
    return {
      userId: data.userId,
      riskScore: data.riskScore,
      riskLevel: data.riskLevel,
      payoutHold: data.payoutHold,
      lastUpdatedAt: data.lastUpdatedAt.toMillis()
    };
  });
  
  // Log admin access
  await writeAuditLog({
    admin: adminContext,
    targetType: 'SYSTEM',
    action: 'LIST_HIGH_RISK_USERS',
    severity: 'INFO',
    reason: `Listed ${users.length} high-risk users`
  });
  
  return { users };
}

// ============================================================================
// GET FRAUD REVIEW HISTORY (ADMIN)
// ============================================================================

/**
 * Get fraud review history for a user
 */
export async function adminGetFraudReviewHistory(params: {
  userId: string;
  limit?: number;
  adminContext: AdminContext;
}): Promise<{
  reviews: Array<{
    action: string;
    note: string | null;
    reviewedBy: string;
    reviewedAt: number;
  }>;
}> {
  const { userId, limit = 20, adminContext } = params;
  
  const snapshot = await db.collection('fraud_reviews')
    .where('userId', '==', userId)
    .orderBy('reviewedAt', 'desc')
    .limit(limit)
    .get();
  
  const reviews = snapshot.docs.map((doc) => {
    const data = doc.data() as FraudReviewAction;
    return {
      action: data.action,
      note: data.note || null,
      reviewedBy: data.reviewedBy,
      reviewedAt: data.reviewedAt.toMillis()
    };
  });
  
  // Log admin access
  await writeAuditLog({
    admin: adminContext,
    targetType: 'USER',
    targetId: userId,
    action: 'VIEW_FRAUD_REVIEW_HISTORY',
    severity: 'INFO',
    userId
  });
  
  return { reviews };
}