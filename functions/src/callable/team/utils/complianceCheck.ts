/**
 * PACK 123 - Compliance Status Check
 * 
 * Integrates with PACK 87 (Enforcement), PACK 103, PACK 104
 * to verify account standing before allowing team operations
 */

import * as admin from 'firebase-admin';

export interface ComplianceStatus {
  canManageTeam: boolean;
  canPostContent: boolean;
  canAccessDMs: boolean;
  restrictions: string[];
  accountState?: string;
}

export async function checkComplianceStatus(userId: string): Promise<ComplianceStatus> {
  const db = admin.firestore();
  
  try {
    // Check account state from PACK 87 (Enforcement & Account State Machine)
    const accountStateDoc = await db
      .collection('account_states')
      .doc(userId)
      .get();

    const accountState = accountStateDoc.exists 
      ? accountStateDoc.data()?.state 
      : 'active';

    // Check for active restrictions or bans
    const restrictionsSnapshot = await db
      .collection('user_restrictions')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .get();

    const restrictions: string[] = [];
    let canManageTeam = true;
    let canPostContent = true;
    let canAccessDMs = true;

    // States that prevent team management
    const blockedStates = [
      'suspended',
      'banned',
      'pending_verification',
      'payment_frozen',
      'under_review',
    ];

    if (blockedStates.includes(accountState)) {
      canManageTeam = false;
      restrictions.push(`Account state: ${accountState}`);
    }

    // Check specific restrictions
    restrictionsSnapshot.forEach(doc => {
      const restriction = doc.data();
      restrictions.push(restriction.type);

      switch (restriction.type) {
        case 'content_posting':
          canPostContent = false;
          break;
        case 'messaging':
        case 'dm_restricted':
          canAccessDMs = false;
          break;
        case 'team_management':
        case 'all_features':
          canManageTeam = false;
          canPostContent = false;
          canAccessDMs = false;
          break;
      }
    });

    // Check KYC status from PACK 84
    const kycDoc = await db.collection('kyc_verifications').doc(userId).get();
    const kycData = kycDoc.data();

    // For team management, require completed KYC for payout-eligible accounts
    if (kycData && kycData.status === 'required' && kycData.completedAt === null) {
      // Don't block team management for pending KYC, but flag it
      restrictions.push('kyc_pending');
    }

    // Check for fraud flags from PACK 71
    const fraudFlagsSnapshot = await db
      .collection('fraud_flags')
      .where('userId', '==', userId)
      .where('severity', 'in', ['high', 'critical'])
      .where('resolved', '==', false)
      .limit(1)
      .get();

    if (!fraudFlagsSnapshot.empty) {
      canManageTeam = false;
      restrictions.push('fraud_investigation');
    }

    return {
      canManageTeam,
      canPostContent,
      canAccessDMs,
      restrictions,
      accountState,
    };
  } catch (error) {
    console.error('Error checking compliance status:', error);
    
    // Fail-safe: if we can't check compliance, deny team management
    return {
      canManageTeam: false,
      canPostContent: false,
      canAccessDMs: false,
      restrictions: ['compliance_check_failed'],
    };
  }
}

export async function checkMemberEligibility(userId: string): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  const db = admin.firestore();
  
  try {
    // Check if user account exists and is active
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return { eligible: false, reason: 'User account not found' };
    }

    const userData = userDoc.data();
    if (!userData?.active) {
      return { eligible: false, reason: 'User account is inactive' };
    }

    // Check compliance status
    const compliance = await checkComplianceStatus(userId);
    
    if (compliance.accountState === 'banned' || compliance.accountState === 'suspended') {
      return { 
        eligible: false, 
        reason: `Account is ${compliance.accountState}` 
      };
    }

    // Members can join teams even with minor restrictions
    // but must be in generally good standing
    const criticalRestrictions = [
      'fraud_investigation',
      'all_features',
      'team_management',
    ];

    const hasCriticalRestriction = compliance.restrictions.some(r => 
      criticalRestrictions.includes(r)
    );

    if (hasCriticalRestriction) {
      return {
        eligible: false,
        reason: 'Account has critical compliance restrictions',
      };
    }

    return { eligible: true };
  } catch (error) {
    console.error('Error checking member eligibility:', error);
    return { 
      eligible: false, 
      reason: 'Unable to verify eligibility' 
    };
  }
}