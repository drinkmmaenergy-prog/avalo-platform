/**
 * PACK 383 - Global Payment Routing, Compliance & Cross-Border Payout Engine
 * KYC / AML / Sanctions Enforcement Engine
 * 
 * Enforces:
 * - KYC verification before payouts
 * - AML screening
 * - Sanctions list screening
 * - High-risk user blocking
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// KYC Profile Interface
interface KYCProfile {
  userId: string;
  status: 'pending' | 'in_review' | 'verified' | 'rejected' | 'expired';
  verificationType: 'manual' | 'automated' | 'hybrid';
  documentType: string;
  documentNumber: string;
  documentExpiry?: Date;
  fullName: string;
  dateOfBirth: Date;
  nationality: string;
  residenceCountry: string;
  address: {
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  verifiedAt?: admin.firestore.Timestamp;
  verifiedBy?: string;
  rejectionReason?: string;
  verificationProvider?: string; // e.g., "Onfido", "Jumio", "manual"
  riskScore: number;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// AML Screening Result
interface AMLScreeningResult {
  userId: string;
  screeningId: string;
  status: 'clear' | 'review' | 'blocked';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  amount?: number;
  currency?: string;
  flags: string[];
  screeningProvider: string;
  screeningData: Record<string, any>;
  reviewedBy?: string;
  reviewedAt?: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
}

// Sanctions Screening Result
interface SanctionsScreeningResult {
  userId: string;
  screeningId: string;
  status: 'clear' | 'match' | 'potential_match';
  matchedLists: string[]; // e.g., ["OFAC", "EU Sanctions", "UN"]
  matchScore: number; // 0-100
  details: Record<string, any>;
  screeningProvider: string;
  reviewedBy?: string;
  reviewedAt?: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
}

/**
 * Submit KYC verification for a user
 */
export const pack383_submitKYC = functions.https.onCall(
  async (data: {
    documentType: string;
    documentNumber: string;
    documentExpiry?: string;
    fullName: string;
    dateOfBirth: string;
    nationality: string;
    residenceCountry: string;
    address: {
      street: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = context.auth.uid;

    try {
      // Check if KYC already exists
      const existingKYC = await db.collection('userKYCProfiles').doc(userId).get();
      if (existingKYC.exists && existingKYC.data()!.status === 'verified') {
        throw new functions.https.HttpsError(
          'already-exists',
          'KYC already verified for this user'
        );
      }

      // Create KYC profile
      const kycProfile: KYCProfile = {
        userId,
        status: 'pending',
        verificationType: 'automated',
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        documentExpiry: data.documentExpiry ? new Date(data.documentExpiry) : undefined,
        fullName: data.fullName,
        dateOfBirth: new Date(data.dateOfBirth),
        nationality: data.nationality,
        residenceCountry: data.residenceCountry,
        address: data.address,
        riskScore: 50, // Default medium risk
        createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
        updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
      };

      await db.collection('userKYCProfiles').doc(userId).set(kycProfile);

      // Trigger automated verification (placeholder)
      // In production, this would integrate with Onfido, Jumio, etc.
      await triggerAutomatedKYCVerification(userId);

      // Create audit log
      await db.collection('auditLogs').add({
        action: 'kyc_submitted',
        userId,
        targetType: 'kyc_profile',
        targetId: userId,
        details: {
          documentType: data.documentType,
          nationality: data.nationality,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        status: 'pending',
        message: 'KYC verification submitted for review',
      };
    } catch (error: any) {
      console.error('Error submitting KYC:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Run AML check on user
 */
export const pack383_runAMLCheck = functions.https.onCall(
  async (data: { userId: string; amount?: number; currency?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId, amount, currency } = data;

    try {
      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
      }

      const userData = userDoc.data()!;

      // Get KYC profile
      const kycDoc = await db.collection('userKYCProfiles').doc(userId).get();
      if (!kycDoc.exists || kycDoc.data()!.status !== 'verified') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'KYC verification required before AML check'
        );
      }

      const kycData = kycDoc.data()! as KYCProfile;

      // Perform AML screening
      const amlResult = await performAMLScreening({
        userId,
        fullName: kycData.fullName,
        dateOfBirth: kycData.dateOfBirth,
        nationality: kycData.nationality,
        residenceCountry: kycData.residenceCountry,
        amount,
        currency,
      });

      // Save AML result
      const screeningId = `aml_${userId}_${Date.now()}`;
      const amlScreening: AMLScreeningResult = {
        userId,
        screeningId,
        status: amlResult.status,
        riskLevel: amlResult.riskLevel,
        amount,
        currency,
        flags: amlResult.flags,
        screeningProvider: 'internal',
        screeningData: amlResult.data,
        createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
      };

      await db.collection('amlScreeningResults').add(amlScreening);

      // Create audit log
      await db.collection('auditLogs').add({
        action: 'aml_check_completed',
        userId,
        targetType: 'aml_screening',
        targetId: screeningId,
        details: {
          status: amlResult.status,
          riskLevel: amlResult.riskLevel,
          flagsCount: amlResult.flags.length,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        screeningId,
        status: amlResult.status,
        riskLevel: amlResult.riskLevel,
        blocked: amlResult.status === 'blocked',
        requiresReview: amlResult.status === 'review',
      };
    } catch (error: any) {
      console.error('Error running AML check:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Run sanctions screening on user
 */
export const pack383_runSanctionsScreening = functions.https.onCall(
  async (data: { userId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId } = data;

    try {
      // Get KYC profile
      const kycDoc = await db.collection('userKYCProfiles').doc(userId).get();
      if (!kycDoc.exists) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'KYC profile required for sanctions screening'
        );
      }

      const kycData = kycDoc.data()! as KYCProfile;

      // Perform sanctions screening
      const sanctionsResult = await performSanctionsScreening({
        userId,
        fullName: kycData.fullName,
        dateOfBirth: kycData.dateOfBirth,
        nationality: kycData.nationality,
        residenceCountry: kycData.residenceCountry,
      });

      // Save sanctions result
      const screeningId = `sanctions_${userId}_${Date.now()}`;
      const sanctionsScreening: SanctionsScreeningResult = {
        userId,
        screeningId,
        status: sanctionsResult.status,
        matchedLists: sanctionsResult.matchedLists,
        matchScore: sanctionsResult.matchScore,
        details: sanctionsResult.details,
        screeningProvider: 'internal',
        createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
      };

      await db.collection('sanctionsScreeningResults').add(sanctionsScreening);

      // If match found, block user immediately
      if (sanctionsResult.status === 'match') {
        await db.collection('users').doc(userId).update({
          sanctionsBlocked: true,
          sanctionsBlockReason: `Matched sanctions lists: ${sanctionsResult.matchedLists.join(', ')}`,
          sanctionsBlockedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Create audit log
      await db.collection('auditLogs').add({
        action: 'sanctions_screening_completed',
        userId,
        targetType: 'sanctions_screening',
        targetId: screeningId,
        details: {
          status: sanctionsResult.status,
          matchScore: sanctionsResult.matchScore,
          matchedLists: sanctionsResult.matchedLists,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        screeningId,
        status: sanctionsResult.status,
        matchScore: sanctionsResult.matchScore,
        blocked: sanctionsResult.status === 'match',
        requiresReview: sanctionsResult.status === 'potential_match',
      };
    } catch (error: any) {
      console.error('Error running sanctions screening:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Block high-risk payout
 * Callable by admin or automated systems
 */
export const pack383_blockHighRiskPayout = functions.https.onCall(
  async (data: { payoutId: string; reason: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { payoutId, reason } = data;

    try {
      // Get payout
      const payoutDoc = await db.collection('payouts').doc(payoutId).get();
      if (!payoutDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Payout not found');
      }

      // Update payout status
      await payoutDoc.ref.update({
        status: 'blocked',
        blockReason: reason,
        blockedBy: context.auth.uid,
        blockedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const payoutData = payoutDoc.data()!;

      // Create audit log
      await db.collection('auditLogs').add({
        action: 'payout_blocked',
        userId: context.auth.uid,
        targetType: 'payout',
        targetId: payoutId,
        details: {
          reason,
          targetUserId: payoutData.userId,
          amount: payoutData.amount,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: 'Payout blocked successfully',
      };
    } catch (error: any) {
      console.error('Error blocking payout:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Scheduled: Auto-run sanctions screening for new/updated users
 */
export const pack383_autoSanctionsScreening = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    try {
      // Get users created in last 24 hours or with updated KYC
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const recentKYCSnapshot = await db
        .collection('userKYCProfiles')
        .where('updatedAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
        .where('status', '==', 'verified')
        .get();

      if (recentKYCSnapshot.empty) {
        console.log('No recent KYC profiles to screen');
        return null;
      }

      const screeningPromises = recentKYCSnapshot.docs.map(async (kycDoc) => {
        const kycData = kycDoc.data() as KYCProfile;
        const userId = kycData.userId;

        try {
          // Check if already screened recently
          const recentScreening = await db
            .collection('sanctionsScreeningResults')
            .where('userId', '==', userId)
            .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(yesterday))
            .limit(1)
            .get();

          if (!recentScreening.empty) {
            console.log(`User ${userId} already screened recently`);
            return;
          }

          // Run sanctions screening
          const sanctionsResult = await performSanctionsScreening({
            userId,
            fullName: kycData.fullName,
            dateOfBirth: kycData.dateOfBirth,
            nationality: kycData.nationality,
            residenceCountry: kycData.residenceCountry,
          });

          // Save result
          const screeningId = `auto_sanctions_${userId}_${Date.now()}`;
          await db.collection('sanctionsScreeningResults').add({
            userId,
            screeningId,
            status: sanctionsResult.status,
            matchedLists: sanctionsResult.matchedLists,
            matchScore: sanctionsResult.matchScore,
            details: sanctionsResult.details,
            screeningProvider: 'auto_scheduled',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Block if match found
          if (sanctionsResult.status === 'match') {
            await db.collection('users').doc(userId).update({
              sanctionsBlocked: true,
              sanctionsBlockReason: `Auto-screening matched: ${sanctionsResult.matchedLists.join(', ')}`,
              sanctionsBlockedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        } catch (error) {
          console.error(`Error screening user ${userId}:`, error);
        }
      });

      await Promise.all(screeningPromises);

      console.log(`Auto-screened ${recentKYCSnapshot.size} users for sanctions`);
      return null;
    } catch (error) {
      console.error('Error in auto sanctions screening:', error);
      return null;
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

async function triggerAutomatedKYCVerification(userId: string) {
  // Placeholder for automated KYC verification
  // In production, this would integrate with third-party KYC providers
  console.log(`Triggered automated KYC verification for user ${userId}`);
  
  // For now, auto-approve after 1 minute (simulated)
  // In production, this would be handled by webhooks from KYC provider
  return true;
}

async function performAMLScreening(params: {
  userId: string;
  fullName: string;
  dateOfBirth: Date;
  nationality: string;
  residenceCountry: string;
  amount?: number;
  currency?: string;
}): Promise<{
  status: 'clear' | 'review' | 'blocked';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  flags: string[];
  data: Record<string, any>;
}> {
  // Placeholder AML screening logic
  // In production, this would integrate with ComplyAdvantage, Elliptic, Chainalysis, etc.
  
  const flags: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  
  // Check for high-risk countries
  const highRiskCountries = ['KP', 'IR', 'SY', 'CU', 'SD'];
  if (highRiskCountries.includes(params.nationality) || 
      highRiskCountries.includes(params.residenceCountry)) {
    flags.push('high_risk_country');
    riskLevel = 'high';
  }

  // Check for large transaction amounts
  if (params.amount && params.amount > 10000) {
    flags.push('large_transaction');
    if (riskLevel === 'low') riskLevel = 'medium';
  }

  // Check transaction history
  const userPayouts = await db
    .collection('payouts')
    .where('userId', '==', params.userId)
    .where('status', '==', 'completed')
    .limit(100)
    .get();

  if (userPayouts.size > 50) {
    const totalAmount = userPayouts.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
    if (totalAmount > 50000) {
      flags.push('high_volume_user');
      if (riskLevel === 'low' || riskLevel === 'medium') riskLevel = 'high';
    }
  }

  let status: 'clear' | 'review' | 'blocked' = 'clear';
  if (flags.length > 2 || riskLevel === 'critical') {
    status = 'blocked';
  } else if (flags.length > 0 || riskLevel === 'high') {
    status = 'review';
  }

  return {
    status,
    riskLevel,
    flags,
    data: {
      screenedAt: new Date().toISOString(),
      screeningVersion: '1.0',
    },
  };
}

async function performSanctionsScreening(params: {
  userId: string;
  fullName: string;
  dateOfBirth: Date;
  nationality: string;
  residenceCountry: string;
}): Promise<{
  status: 'clear' | 'match' | 'potential_match';
  matchedLists: string[];
  matchScore: number;
  details: Record<string, any>;
}> {
  // Placeholder sanctions screening logic
  // In production, this would integrate with OFAC, EU Sanctions, UN lists, etc.
  
  const matchedLists: string[] = [];
  let matchScore = 0;

  // Check against high-risk countries (simplified)
  const sanctionedCountries = ['KP', 'IR', 'SY', 'CU', 'VE'];
  if (sanctionedCountries.includes(params.nationality)) {
    matchedLists.push('OFAC_SDN');
    matchScore += 80;
  }

  if (sanctionedCountries.includes(params.residenceCountry)) {
    matchedLists.push('EU_SANCTIONS');
    matchScore += 60;
  }

  // Determine status based on match score
  let status: 'clear' | 'match' | 'potential_match' = 'clear';
  if (matchScore >= 80) {
    status = 'match';
  } else if (matchScore >= 40) {
    status = 'potential_match';
  }

  return {
    status,
    matchedLists,
    matchScore,
    details: {
      screenedAt: new Date().toISOString(),
      fullName: params.fullName,
      nationality: params.nationality,
    },
  };
}
