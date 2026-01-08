/**
 * PACK 123 - Two-Factor Authentication Verification
 * 
 * Enforces 2FA for sensitive team operations
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export async function verifyTwoFactor(userId: string): Promise<void> {
  const db = admin.firestore();
  
  // Check if user has 2FA enabled
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  if (!userData) {
    throw new functions.https.HttpsError(
      'not-found',
      'User not found'
    );
  }

  // For owner accounts managing teams, 2FA is mandatory
  if (!userData.twoFactorEnabled) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Two-factor authentication must be enabled for team management'
    );
  }

  // Check if 2FA session is valid (verified in last 15 minutes)
  const twoFactorSession = userData.twoFactorSession;
  if (!twoFactorSession || !twoFactorSession.verifiedAt) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Two-factor authentication verification required'
    );
  }

  const verifiedAt = twoFactorSession.verifiedAt.toMillis();
  const now = Date.now();
  const sessionValidityMs = 15 * 60 * 1000; // 15 minutes

  if (now - verifiedAt > sessionValidityMs) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Two-factor authentication session expired. Please verify again.'
    );
  }
}

export async function requireTwoFactorForRole(
  userId: string,
  role: string,
  hasContentAccess: boolean,
  hasDmAccess: boolean
): Promise<boolean> {
  // 2FA is required for:
  // 1. All roles with content posting capabilities
  // 2. Any role with DM access
  // 3. Manager role (can edit profile and view earnings)
  
  const requires2FA = 
    role === 'manager' ||
    role === 'editor' ||
    hasContentAccess ||
    hasDmAccess;

  if (requires2FA) {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    return userData?.twoFactorEnabled === true;
  }

  return false;
}