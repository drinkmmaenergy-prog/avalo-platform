/**
 * PACK 345 — Compliance Enforcement Middleware
 * Global enforcement of Terms, Privacy, and Age Verification
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { UserComplianceStatus } from './pack345-types';

const db = admin.firestore();

/**
 * Check user compliance status
 */
export async function checkUserCompliance(userId: string): Promise<UserComplianceStatus> {
  const complianceDoc = await db.doc(`users/${userId}/compliance/status`).get();
  
  if (!complianceDoc.exists) {
    // Create default compliance status if doesn't exist
    const defaultStatus: UserComplianceStatus = {
      userId,
      latestTermsAccepted: false,
      latestPrivacyAccepted: false,
      ageVerified: false,
      complianceLocked: true,
      lastCheckedAt: admin.firestore.Timestamp.now()
    };
    
    await db.doc(`users/${userId}/compliance/status`).set(defaultStatus);
    return defaultStatus;
  }

  return complianceDoc.data() as UserComplianceStatus;
}

/**
 * Verify user can access feature
 * Blocks access if compliance not met
 */
export async function requireCompliance(userId: string): Promise<{
  allowed: boolean;
  locked: boolean;
  reasons: string[];
}> {
  const status = await checkUserCompliance(userId);
  
  const reasons: string[] = [];
  
  if (!status.latestTermsAccepted) {
    reasons.push('Terms of Service not accepted');
  }
  
  if (!status.latestPrivacyAccepted) {
    reasons.push('Privacy Policy not accepted');
  }
  
  if (!status.ageVerified) {
    reasons.push('Age verification (18+) not completed');
  }
  
  const allowed = reasons.length === 0;
  const locked = status.complianceLocked || !allowed;
  
  return { allowed, locked, reasons };
}

/**
 * Accept latest Terms of Service
 */
export const pack345_acceptTerms = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { version } = data;

    // Get latest terms version
   const termsSnapshot = await db.collection('legal_terms')
      .where('active', '==', true)
      .orderBy('version', 'desc')
      .limit(1)
      .get();

    if (termsSnapshot.empty) {
      throw new functions.https.HttpsError('not-found', 'No active Terms of Service found');
    }

    const latestTerms = termsSnapshot.docs[0].data();

    // Update compliance status
    await db.doc(`users/${userId}/compliance/status`).set(
      {
        latestTermsAccepted: true,
        latestTermsVersion: latestTerms.version,
        latestTermsAcceptedAt: admin.firestore.Timestamp.now(),
        lastCheckedAt: admin.firestore.Timestamp.now()
      },
      { merge: true }
    );

    // Log acceptance
    await db.collection(`users/${userId}/compliance/acceptances`).add({
      type: 'terms',
      version: latestTerms.version,
      acceptedAt: admin.firestore.Timestamp.now(),
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null
    });

    console.log(`[Pack345] User ${userId} accepted Terms v${latestTerms.version}`);

    // Check if user is now fully compliant
    const compliance = await checkUserCompliance(userId);
    const unlocked = compliance.latestTermsAccepted && 
                     compliance.latestPrivacyAccepted && 
                     compliance.ageVerified;

    if (unlocked) {
      await db.doc(`users/${userId}/compliance/status`).update({
        complianceLocked: false
      });
    }

    return {
      success: true,
      version: latestTerms.version,
      fullyCompliant: unlocked
    };
  }
);

/**
 * Accept latest Privacy Policy
 */
export const pack345_acceptPrivacy = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    // Get latest privacy policy version
    const privacySnapshot = await db.collection('legal_privacy')
      .where('active', '==', true)
      .orderBy('version', 'desc')
      .limit(1)
      .get();

    if (privacySnapshot.empty) {
      throw new functions.https.HttpsError('not-found', 'No active Privacy Policy found');
    }

    const latestPrivacy = privacySnapshot.docs[0].data();

    // Update compliance status
    await db.doc(`users/${userId}/compliance/status`).set(
      {
        latestPrivacyAccepted: true,
        latestPrivacyVersion: latestPrivacy.version,
        latestPrivacyAcceptedAt: admin.firestore.Timestamp.now(),
        lastCheckedAt: admin.firestore.Timestamp.now()
      },
      { merge: true }
    );

    // Log acceptance
    await db.collection(`users/${userId}/compliance/acceptances`).add({
      type: 'privacy',
      version: latestPrivacy.version,
      acceptedAt: admin.firestore.Timestamp.now(),
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null
    });

    console.log(`[Pack345] User ${userId} accepted Privacy Policy v${latestPrivacy.version}`);

    // Check if user is now fully compliant
    const compliance = await checkUserCompliance(userId);
    const unlocked = compliance.latestTermsAccepted && 
                     compliance.latestPrivacyAccepted && 
                     compliance.ageVerified;

    if (unlocked) {
      await db.doc(`users/${userId}/compliance/status`).update({
        complianceLocked: false
      });
    }

    return {
      success: true,
      version: latestPrivacy.version,
      fullyCompliant: unlocked
    };
  }
);

/**
 * Verify age (18+)
 */
export const pack345_verifyAge = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { birthDate, idVerificationData } = data;

    if (!birthDate) {
      throw new functions.https.HttpsError('invalid-argument', 'birthDate required');
    }

    // Calculate age
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    if (age < 18) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You must be at least 18 years old to use this service'
      );
    }

    // Update compliance status
    await db.doc(`users/${userId}/compliance/status`).set(
      {
        ageVerified: true,
        ageVerifiedAt: admin.firestore.Timestamp.now(),
        age: age,
        lastCheckedAt: admin.firestore.Timestamp.now()
      },
      { merge: true }
    );

    // Log age verification
    await db.collection(`users/${userId}/compliance/verifications`).add({
      type: 'age',
      birthDate,
      age,
      verifiedAt: admin.firestore.Timestamp.now(),
      method: idVerificationData ? 'id_document' : 'birthdate'
    });

    console.log(`[Pack345] User ${userId} age verified: ${age} years old`);

    // Check if user is now fully compliant
    const compliance = await checkUserCompliance(userId);
    const unlocked = compliance.latestTermsAccepted && 
                     compliance.latestPrivacyAccepted && 
                     compliance.ageVerified;

    if (unlocked) {
      await db.doc(`users/${userId}/compliance/status`).update({
        complianceLocked: false
      });
    }

    return {
      success: true,
      age,
      fullyCompliant: unlocked
    };
  }
);

/**
 * Get user compliance status
 */
export const pack345_getComplianceStatus = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const status = await checkUserCompliance(context.auth.uid);
    const complianceCheck = await requireCompliance(context.auth.uid);

    return {
      status,
      ...complianceCheck
    };
  }
);

/**
 * Middleware function to enforce compliance on protected endpoints
 */
export async function enforceCompliance(userId: string): Promise<void> {
  const check = await requireCompliance(userId);
  
  if (!check.allowed) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `Compliance requirements not met: ${check.reasons.join(', ')}`
    );
  }
}
