/**
 * PACK 289 — KYC (Know Your Customer) Functions
 * 
 * KYC management for withdrawal verification:
 * - Submit KYC profile
 * - Get KYC status
 * - Admin review/approval
 * - Document verification
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import {
  KYCProfile,
  SubmitKYCRequest,
  SubmitKYCResponse,
  GetKYCStatusRequest,
  GetKYCStatusResponse,
  ReviewKYCRequest,
  ReviewKYCResponse,
  IDDocument,
} from './types/pack289-withdrawals.types';

const db = admin.firestore();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Hash sensitive data (like document numbers)
 * This is a simple hash - in production, use proper encryption/tokenization
 */
function hashSensitiveData(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth: string): number {
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Validate IBAN format (basic check)
 */
function isValidIBAN(iban: string): boolean {
  // Remove spaces and convert to uppercase
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();

  // Basic format check (2 letters + 2 digits + alphanumeric)
  const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]+$/;
  if (!ibanRegex.test(cleanIban)) return false;

  // Length check (IBAN should be between 15-34 characters)
  if (cleanIban.length < 15 || cleanIban.length > 34) return false;

  return true;
}

/**
 * Validate postal code format by country
 */
function isValidPostalCode(postalCode: string, country: string): boolean {
  const patterns: Record<string, RegExp> = {
    PL: /^\d{2}-\d{3}$/,
    US: /^\d{5}(-\d{4})?$/,
    GB: /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i,
    DE: /^\d{5}$/,
    FR: /^\d{5}$/,
  };

  const pattern = patterns[country];
  return pattern ? pattern.test(postalCode) : true; // Allow if no pattern defined
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * Submit KYC profile for verification
 */
export const kyc_submit = functions.https.onCall(
  async (data: SubmitKYCRequest, context): Promise<SubmitKYCResponse> => {
    try {
      // Auth check
      if (!context.auth) {
        return {
          success: false,
          error: 'Authentication required',
          errorCode: 'AUTH_REQUIRED',
        };
      }

      const userId = context.auth.uid;

      // Check if user is 18+
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists || !userDoc.data()?.ageVerified) {
        return {
          success: false,
          error: 'Age verification required (18+)',
          errorCode: 'AGE_NOT_VERIFIED',
        };
      }

      // Validate input
      const {
        fullName,
        dateOfBirth,
        country,
        taxResidence,
        idDocument,
        address,
        payoutMethod,
      } = data;

      // Validation checks
      const errors: string[] = [];

      if (!fullName || fullName.length < 2) {
        errors.push('Invalid full name');
      }

      if (!isValidDate(dateOfBirth)) {
        errors.push('Invalid date of birth format (use YYYY-MM-DD)');
      } else {
        const age = calculateAge(dateOfBirth);
        if (age < 18) {
          errors.push('Must be 18 or older');
        }
      }

      if (!country || country.length !== 2) {
        errors.push('Invalid country code');
      }

      if (!idDocument || !idDocument.type || !idDocument.number) {
        errors.push('ID document information required');
      } else if (!isValidDate(idDocument.expiresAt)) {
        errors.push('Invalid document expiration date');
      }

      if (!address || !address.line1 || !address.city || !address.postalCode) {
        errors.push('Complete address required');
      } else if (!isValidPostalCode(address.postalCode, country)) {
        errors.push('Invalid postal code format');
      }

      if (!payoutMethod || !payoutMethod.type || !payoutMethod.currency) {
        errors.push('Payout method required');
      } else if (payoutMethod.type === 'BANK_TRANSFER' && !payoutMethod.iban) {
        errors.push('IBAN required for bank transfer');
      } else if (payoutMethod.type === 'BANK_TRANSFER' && !isValidIBAN(payoutMethod.iban!)) {
        errors.push('Invalid IBAN format');
      }

      if (errors.length > 0) {
        return {
          success: false,
          error: errors.join(', '),
          errorCode: 'VALIDATION_ERROR',
        };
      }

      // Check if KYC already exists
      const kycRef = db.collection('kycProfiles').doc(userId);
      const existingKyc = await kycRef.get();

      if (existingKyc.exists) {
        const existing = existingKyc.data() as KYCProfile;
        if (existing.status === 'VERIFIED') {
          return {
            success: false,
            error: 'KYC already verified. Contact support to update details.',
            errorCode: 'ALREADY_VERIFIED',
          };
        }
      }

      // Hash sensitive document number
      const hashedDocNumber = hashSensitiveData(idDocument.number);

      // Create/update KYC profile
      const now = admin.firestore.Timestamp.now();
      const kycProfile: KYCProfile = {
        userId,
        status: 'PENDING',
        fullName,
        dateOfBirth,
        country,
        taxResidence,
        idDocument: {
          ...idDocument,
          number: hashedDocNumber, // Store hashed version
        },
        address,
        payoutMethod,
        createdAt: existingKyc.exists ? (existingKyc.data() as KYCProfile).createdAt : now,
        updatedAt: now,
      };

      await kycRef.set(kycProfile);

      // Log KYC submission
      await db.collection('kycAuditLogs').add({
        userId,
        action: existingKyc.exists ? 'UPDATED' : 'SUBMITTED',
        status: 'PENDING',
        timestamp: now,
      });

      return {
        success: true,
        status: 'PENDING',
      };
    } catch (error) {
      console.error('Error submitting KYC:', error);
      return {
        success: false,
        error: 'Failed to submit KYC profile',
        errorCode: 'INTERNAL_ERROR',
      };
    }
  }
);

/**
 * Get KYC status for current user
 */
export const kyc_getStatus = functions.https.onCall(
  async (data: GetKYCStatusRequest, context): Promise<GetKYCStatusResponse> => {
    try {
      if (!context.auth) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const userId = data.userId || context.auth.uid;

      // Security: Only own data or admin
      if (userId !== context.auth.uid) {
        const userDoc = await db.collection('users').doc(context.auth.uid).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
          return {
            success: false,
            error: 'Unauthorized',
          };
        }
      }

      const kycDoc = await db.collection('kycProfiles').doc(userId).get();

      if (!kycDoc.exists) {
        return {
          success: true,
          status: 'NOT_STARTED',
          canWithdraw: false,
        };
      }

      const kycProfile = kycDoc.data() as KYCProfile;

      return {
        success: true,
        kycProfile,
        status: kycProfile.status,
        canWithdraw: kycProfile.status === 'VERIFIED',
      };
    } catch (error) {
      console.error('Error getting KYC status:', error);
      return {
        success: false,
        error: 'Failed to fetch KYC status',
      };
    }
  }
);

/**
 * Review KYC submission (ADMIN ONLY)
 */
export const kyc_admin_review = functions.https.onCall(
  async (data: ReviewKYCRequest, context): Promise<ReviewKYCResponse> => {
    try {
      // Check admin auth
      if (!context.auth) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const adminDoc = await db.collection('users').doc(context.auth.uid).get();
      if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
        return {
          success: false,
          error: 'Admin access required',
        };
      }

      const { userId, approved, rejectionReason, adminNotes } = data;

      if (!approved && !rejectionReason) {
        return {
          success: false,
          error: 'Rejection reason required when rejecting',
        };
      }

      // Get KYC profile
      const kycRef = db.collection('kycProfiles').doc(userId);
      const kycDoc = await kycRef.get();

      if (!kycDoc.exists) {
        return {
          success: false,
          error: 'KYC profile not found',
        };
      }

      const currentKyc = kycDoc.data() as KYCProfile;
      const now = admin.firestore.Timestamp.now();

      // Update KYC status
      const newStatus = approved ? 'VERIFIED' : 'REJECTED';
      const updateData: Partial<KYCProfile> = {
        status: newStatus,
        updatedAt: now,
        lastReviewAt: now,
      };

      if (!approved) {
        updateData.rejectionReason = rejectionReason;
      }

      await kycRef.update(updateData);

      // Log review
      await db.collection('kycAuditLogs').add({
        userId,
        reviewedBy: context.auth.uid,
        action: approved ? 'APPROVED' : 'REJECTED',
        previousStatus: currentKyc.status,
        newStatus,
        rejectionReason,
        adminNotes,
        timestamp: now,
      });

      return {
        success: true,
        userId,
        newStatus,
      };
    } catch (error) {
      console.error('Error reviewing KYC:', error);
      return {
        success: false,
        error: 'Failed to review KYC',
      };
    }
  }
);

/**
 * List pending KYC submissions (ADMIN ONLY)
 */
export const kyc_admin_listPending = functions.https.onCall(
  async (data: { limit?: number }, context) => {
    try {
      // Check admin auth
      if (!context.auth) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const adminDoc = await db.collection('users').doc(context.auth.uid).get();
      if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
        return {
          success: false,
          error: 'Admin access required',
        };
      }

      const limit = data.limit || 50;

      // Query pending KYC profiles
      const snapshot = await db
        .collection('kycProfiles')
        .where('status', '==', 'PENDING')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const profiles = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const kyc = doc.data() as KYCProfile;

          // Fetch user details
          const userDoc = await db.collection('users').doc(kyc.userId).get();
          const userData = userDoc.exists ? userDoc.data() : undefined;

          return {
            ...kyc,
            userEmail: userData?.email,
            userDisplayName: userData?.displayName,
          };
        })
      );

      return {
        success: true,
        profiles,
      };
    } catch (error) {
      console.error('Error listing pending KYC:', error);
      return {
        success: false,
        error: 'Failed to fetch pending KYC profiles',
      };
    }
  }
);

// Export helpers for testing
export {
  hashSensitiveData,
  isValidDate,
  calculateAge,
  isValidIBAN,
  isValidPostalCode,
};