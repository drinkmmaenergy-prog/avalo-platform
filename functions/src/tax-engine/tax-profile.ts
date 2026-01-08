/**
 * PACK 149: Global Tax Engine & Compliance Hub
 * Tax Profile Management Functions
 * 
 * Handles tax profile registration, KYC verification, and compliance checks
 */

import { db } from '../init';
import { FieldValue } from 'firebase-admin/firestore';
import { 
  TaxProfile, 
  TaxResidencyCountry, 
  AccountType,
  AuditTrailEntry
} from './types';
import { 
  getComplianceRequirements, 
  validateTaxProfile,
  hasDoubleTaxTreaty
} from './tax-rules';

export async function registerTaxProfile(data: {
  userId: string;
  legalFullName: string;
  taxResidencyCountry: TaxResidencyCountry;
  accountType: AccountType;
  businessRegistrationNumber?: string;
  vatNumber?: string;
  eoriNumber?: string;
  taxId?: string;
  payoutAccountName: string;
  payoutAccountCountry: string;
}): Promise<{ success: boolean; profileId?: string; error?: string; missingFields?: string[] }> {
  try {
    const validation = validateTaxProfile(
      data.taxResidencyCountry,
      data.accountType,
      data
    );

    if (!validation.valid) {
      return {
        success: false,
        error: 'Missing required fields',
        missingFields: validation.missingFields
      };
    }

    const requirements = getComplianceRequirements(
      data.taxResidencyCountry,
      data.accountType
    );

    const payoutAccountNameMatch = data.legalFullName.toLowerCase().trim() === 
                                    data.payoutAccountName.toLowerCase().trim();

    const profile: Partial<TaxProfile> = {
      userId: data.userId,
      legalFullName: data.legalFullName,
      taxResidencyCountry: data.taxResidencyCountry,
      accountType: data.accountType,
      businessRegistrationNumber: data.businessRegistrationNumber,
      vatNumber: data.vatNumber,
      eoriNumber: data.eoriNumber,
      taxId: data.taxId,
      payoutAccountVerified: payoutAccountNameMatch,
      payoutAccountName: data.payoutAccountName,
      payoutAccountCountry: data.payoutAccountCountry,
      profileCompleted: true,
      verificationStatus: payoutAccountNameMatch ? 'pending' : 'rejected',
      kycDocumentsSubmitted: false,
      doubleTaxTreatyCountries: requirements.doubleTaxTreatyAvailable,
      fraudSuspected: false,
      locked: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const existingProfile = await db
      .collection('tax_profiles')
      .where('userId', '==', data.userId)
      .limit(1)
      .get();

    let profileId: string;

    if (!existingProfile.empty) {
      profileId = existingProfile.docs[0].id;
      await db.collection('tax_profiles').doc(profileId).update({
        ...profile,
        updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      const docRef = await db.collection('tax_profiles').add({
        ...profile,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      profileId = docRef.id;
    }

    await logAuditTrail({
      userId: data.userId,
      eventType: existingProfile.empty ? 'profile_created' : 'profile_updated',
      eventData: {
        country: data.taxResidencyCountry,
        accountType: data.accountType,
        verified: payoutAccountNameMatch
      }
    });

    return {
      success: true,
      profileId
    };
  } catch (error) {
    console.error('Error registering tax profile:', error);
    return {
      success: false,
      error: 'Failed to register tax profile'
    };
  }
}

export async function getTaxProfile(userId: string): Promise<TaxProfile | null> {
  try {
    const snapshot = await db
      .collection('tax_profiles')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      updatedAt: doc.data().updatedAt?.toDate(),
      lastReviewedAt: doc.data().lastReviewedAt?.toDate()
    } as TaxProfile;
  } catch (error) {
    console.error('Error fetching tax profile:', error);
    return null;
  }
}

export async function updateTaxProfile(
  userId: string,
  updates: Partial<TaxProfile>
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await getTaxProfile(userId);
    
    if (!profile) {
      return {
        success: false,
        error: 'Tax profile not found'
      };
    }

    if (profile.locked) {
      return {
        success: false,
        error: 'Profile is locked due to fraud suspicion'
      };
    }

    const snapshot = await db
      .collection('tax_profiles')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return {
        success: false,
        error: 'Tax profile not found'
      };
    }

    const profileId = snapshot.docs[0].id;

    await db.collection('tax_profiles').doc(profileId).update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp()
    });

    await logAuditTrail({
      userId,
      eventType: 'profile_updated',
      eventData: { updates }
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating tax profile:', error);
    return {
      success: false,
      error: 'Failed to update tax profile'
    };
  }
}

export async function lockTaxProfileIfFraudSuspected(
  userId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const snapshot = await db
      .collection('tax_profiles')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return {
        success: false,
        error: 'Tax profile not found'
      };
    }

    const profileId = snapshot.docs[0].id;

    await db.collection('tax_profiles').doc(profileId).update({
      fraudSuspected: true,
      locked: true,
      lockReason: reason,
      updatedAt: FieldValue.serverTimestamp()
    });

    await logAuditTrail({
      userId,
      eventType: 'profile_locked',
      eventData: { reason }
    });

    return { success: true };
  } catch (error) {
    console.error('Error locking tax profile:', error);
    return {
      success: false,
      error: 'Failed to lock tax profile'
    };
  }
}

export async function unlockTaxProfile(
  userId: string,
  reviewedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const snapshot = await db
      .collection('tax_profiles')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return {
        success: false,
        error: 'Tax profile not found'
      };
    }

    const profileId = snapshot.docs[0].id;

    await db.collection('tax_profiles').doc(profileId).update({
      fraudSuspected: false,
      locked: false,
      lockReason: FieldValue.delete(),
      lastReviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    await logAuditTrail({
      userId,
      eventType: 'profile_unlocked',
      eventData: { reviewedBy }
    });

    return { success: true };
  } catch (error) {
    console.error('Error unlocking tax profile:', error);
    return {
      success: false,
      error: 'Failed to unlock tax profile'
    };
  }
}

export async function submitKYCDocuments(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const snapshot = await db
      .collection('tax_profiles')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return {
        success: false,
        error: 'Tax profile not found'
      };
    }

    const profileId = snapshot.docs[0].id;

    await db.collection('tax_profiles').doc(profileId).update({
      kycDocumentsSubmitted: true,
      verificationStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp()
    });

    await logAuditTrail({
      userId,
      eventType: 'kyc_submitted',
      eventData: { submittedAt: new Date() }
    });

    return { success: true };
  } catch (error) {
    console.error('Error submitting KYC documents:', error);
    return {
      success: false,
      error: 'Failed to submit KYC documents'
    };
  }
}

export async function verifyTaxProfile(
  userId: string,
  approved: boolean,
  reviewedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const snapshot = await db
      .collection('tax_profiles')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return {
        success: false,
        error: 'Tax profile not found'
      };
    }

    const profileId = snapshot.docs[0].id;

    await db.collection('tax_profiles').doc(profileId).update({
      verificationStatus: approved ? 'verified' : 'rejected',
      lastReviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    await logAuditTrail({
      userId,
      eventType: 'verification_completed',
      eventData: { approved, reviewedBy }
    });

    return { success: true };
  } catch (error) {
    console.error('Error verifying tax profile:', error);
    return {
      success: false,
      error: 'Failed to verify tax profile'
    };
  }
}

export async function checkPayoutEligibility(
  userId: string
): Promise<{ eligible: boolean; reason?: string }> {
  try {
    const profile = await getTaxProfile(userId);

    if (!profile) {
      return {
        eligible: false,
        reason: 'Tax profile not found. Please complete tax registration.'
      };
    }

    if (!profile.profileCompleted) {
      return {
        eligible: false,
        reason: 'Tax profile incomplete. Please provide all required information.'
      };
    }

    if (profile.locked) {
      return {
        eligible: false,
        reason: 'Tax profile is locked due to fraud suspicion. Contact support.'
      };
    }

    if (profile.verificationStatus !== 'verified') {
      return {
        eligible: false,
        reason: 'Tax profile verification pending or rejected.'
      };
    }

    if (!profile.payoutAccountVerified) {
      return {
        eligible: false,
        reason: 'Payout account name does not match legal name.'
      };
    }

    return { eligible: true };
  } catch (error) {
    console.error('Error checking payout eligibility:', error);
    return {
      eligible: false,
      reason: 'Error checking eligibility. Please try again.'
    };
  }
}

async function logAuditTrail(data: {
  userId: string;
  eventType: AuditTrailEntry['eventType'];
  eventData: Record<string, any>;
  ledgerReferenceId?: string;
  payoutReferenceId?: string;
}): Promise<void> {
  try {
    await db.collection('tax_audit_trail').add({
      ...data,
      timestamp: FieldValue.serverTimestamp(),
      performedBy: 'system'
    });
  } catch (error) {
    console.error('Error logging audit trail:', error);
  }
}