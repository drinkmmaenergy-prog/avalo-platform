/**
 * PACK 202 - Referral Utilities
 * 
 * Utility functions for generating and managing ambassador referral codes.
 */

import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Generate a unique referral code for an ambassador
 */
export async function generateReferralCode(userId: string): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const code = generateRandomCode();
    
    // Check if code is unique
    const existing = await db.collection('ambassadors')
      .where('referralCode', '==', code)
      .limit(1)
      .get();

    if (existing.empty) {
      return code;
    }

    attempts++;
  }

  // Fallback to user-based code
  return `AVALO-${userId.substring(0, 8).toUpperCase()}`;
}

/**
 * Generate a random alphanumeric code
 */
function generateRandomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const prefix = 'AVALO';
  const codeLength = 6;
  
  let code = prefix + '-';
  for (let i = 0; i < codeLength; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

/**
 * Validate a referral code format
 */
export function validateReferralCodeFormat(code: string): boolean {
  // Format: AVALO-XXXXXX where X is alphanumeric
  const pattern = /^AVALO-[A-Z0-9]{6,8}$/;
  return pattern.test(code);
}

/**
 * Get ambassador by referral code
 */
export async function getAmbassadorByReferralCode(code: string): Promise<any | null> {
  if (!validateReferralCodeFormat(code)) {
    return null;
  }

  const snapshot = await db.collection('ambassadors')
    .where('referralCode', '==', code)
    .where('status', '==', 'approved')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return {
    id: snapshot.docs[0].id,
    ...snapshot.docs[0].data()
  };
}

/**
 * Track referral signup
 */
export async function trackReferralSignup(
  referralCode: string,
  newUserId: string,
  userType: 'creator' | 'user'
): Promise<string | null> {
  const ambassador = await getAmbassadorByReferralCode(referralCode);
  
  if (!ambassador) {
    return null;
  }

  // Create referral record
  const referral = {
    ambassadorId: ambassador.id,
    referralCode,
    referredUserId: newUserId,
    referredUserType: userType,
    status: 'pending',
    totalRevenueGenerated: 0,
    totalCommissionEarned: 0,
    violationDetected: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const referralRef = await db.collection('ambassador_referrals').add(referral);

  // Update ambassador's total referrals
  await db.collection('ambassadors').doc(ambassador.id).update({
    totalReferrals: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Add referral code to user's profile
  await db.collection('users').doc(newUserId).update({
    referredBy: ambassador.id,
    referralCode,
    referredAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return referralRef.id;
}

/**
 * Activate a referral (when user makes first transaction)
 */
export async function activateReferral(referralId: string): Promise<void> {
  const referralRef = db.collection('ambassador_referrals').doc(referralId);
  const referralDoc = await referralRef.get();

  if (!referralDoc.exists) {
    throw new Error('Referral not found');
  }

  const referral = referralDoc.data();

  if (referral?.status === 'active') {
    return;
  }

  await referralRef.update({
    status: 'active',
    activatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * Deactivate a referral (for violations)
 */
export async function deactivateReferral(
  referralId: string,
  reason: string
): Promise<void> {
  await db.collection('ambassador_referrals').doc(referralId).update({
    status: 'inactive',
    violationDetected: true,
    violationDetails: reason,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * Get referral statistics for an ambassador
 */
export async function getReferralStats(ambassadorId: string): Promise<{
  totalReferrals: number;
  activeReferrals: number;
  pendingReferrals: number;
  totalRevenue: number;
  totalCommission: number;
}> {
  const referralsSnapshot = await db.collection('ambassador_referrals')
    .where('ambassadorId', '==', ambassadorId)
    .get();

  let activeReferrals = 0;
  let pendingReferrals = 0;
  let totalRevenue = 0;
  let totalCommission = 0;

  referralsSnapshot.forEach(doc => {
    const referral = doc.data();
    if (referral.status === 'active') {
      activeReferrals++;
      totalRevenue += referral.totalRevenueGenerated || 0;
      totalCommission += referral.totalCommissionEarned || 0;
    } else if (referral.status === 'pending') {
      pendingReferrals++;
    }
  });

  return {
    totalReferrals: referralsSnapshot.size,
    activeReferrals,
    pendingReferrals,
    totalRevenue,
    totalCommission
  };
}