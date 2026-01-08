/**
 * PACK 395 - KYC/KYB Verification & Payout Compliance
 * Handles creator verification, sanctions checks, and payout compliance
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

type KYCLevel = 'level1' | 'level2' | 'kyb';
type VerificationStatus = 'pending' | 'under_review' | 'approved' |'rejected' | 'expired';

interface KYCSubmission {
  userId: string;
  level: KYCLevel;
  governmentIdUrl: string;
  governmentIdType: 'passport' | 'drivers_license' | 'national_id';
  selfieUrl?: string;
  addressProofUrl?: string;
  addressDetails?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  dateOfBirth?: string;
  nationality?: string;
  taxResidency: string;
  submittedAt: Date;
}

interface KYBSubmission {
  userId: string;
  companyName: string;
  companyRegistration: string;
  companyCountry: string;
  companyAddress: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  taxId: string;
  vatNumber?: string;
  businessDocumentUrl: string;
  authorizedRepresentative: {
    name: string;
    position: string;
    email: string;
  };
  submittedAt: Date;
}

interface PayoutLimits {
  level: KYCLevel | 'unverified';
  dailyLimit: number;
  monthlyLimit: number;
  minimumPayout: number;
}

const PAYOUT_LIMITS: Record<string, PayoutLimits> = {
  'unverified': {
    level: 'unverified',
    dailyLimit: 0,
    monthlyLimit: 0,
    minimumPayout: 0
  },
  'level1': {
    level: 'level1',
    dailyLimit: 5000, // PLN
    monthlyLimit: 20000,
    minimumPayout: 200 // 1000 tokens
  },
  'level2': {
    level: 'level2',
    dailyLimit: 20000,
    monthlyLimit: 100000,
    minimumPayout: 200
  },
  'kyb': {
    level: 'kyb',
    dailyLimit: 100000,
    monthlyLimit: 500000,
    minimumPayout: 200
  }
};

/**
 * Submit KYC Level 1 (Basic Identity)
 */
export const submitKYCLevel1 = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { governmentIdUrl, governmentIdType, taxResidency, dateOfBirth, nationality } = data;
  
  if (!governmentIdUrl || !governmentIdType || !taxResidency) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  // Check if already verified
  const existingDoc = await db.collection('creatorVerification').doc(userId).get();
  if (existingDoc.exists && existingDoc.data()?.status === 'approved') {
    throw new functions.https.HttpsError('already-exists', 'Already verified');
  }
  
  // Create verification record
  const verificationData: any = {
    userId,
    level: 'level1',
    status: 'pending',
    governmentIdUrl,
    governmentIdType,
    governmentIdUploaded: true,
    taxResidency,
    dateOfBirth,
    nationality,
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  await db.collection('creatorVerification').doc(userId).set(verificationData);
  
  // Create tax status record
  await db.collection('creatorTaxStatus').doc(userId).set({
    userId,
    taxResidency,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  // Run sanctions check
  await runSanctionsCheck(userId);
  
  // Create audit log
  await db.collection('complianceAuditTrail').add({
    actionType: 'kyc_submitted',
    userId,
    level: 'level1',
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return {
    success: true,
    message: 'KYC Level 1 submitted for review'
  };
});

/**
 * Submit KYC Level 2 (Proof of Residence)
 */
export const submitKYCLevel2 = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { addressProofUrl, addressDetails } = data;
  
  if (!addressProofUrl || !addressDetails) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  // Check if Level 1 is approved
  const level1Doc = await db.collection('creatorVerification').doc(userId).get();
  if (!level1Doc.exists || level1Doc.data()?.status !== 'approved') {
    throw new functions.https.HttpsError('failed-precondition', 'KYC Level 1 must be approved first');
  }
  
  // Update verification to Level 2
  await db.collection('creatorVerification').doc(userId).update({
    level: 'level2',
    status: 'pending',
    addressProofUrl,
    addressDetails,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Create audit log
  await db.collection('complianceAuditTrail').add({
    actionType: 'kyc_level2_submitted',
    userId,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return {
    success: true,
    message: 'KYC Level 2 submitted for review'
  };
});

/**
 * Submit KYB (Business Verification)
 */
export const submitKYB = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const {
    companyName,
    companyRegistration,
    companyCountry,
    companyAddress,
    taxId,
    vatNumber,
    businessDocumentUrl,
    authorizedRepresentative
  } = data;
  
  if (!companyName || !companyRegistration || !companyCountry || !companyAddress || !taxId || !businessDocumentUrl || !authorizedRepresentative) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  // Create KYB record
  await db.collection('creatorKYB').doc(userId).set({
    userId,
    companyName,
    companyRegistration,
    companyCountry,
    companyAddress,
    taxId,
    vatNumber,
    businessDocumentUrl,
    authorizedRepresentative,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Update verification to KYB level
  await db.collection('creatorVerification').doc(userId).set({
    userId,
    level: 'kyb',
    status: 'pending',
    governmentIdUploaded: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  // Update tax status
  await db.collection('creatorTaxStatus').doc(userId).update({
    isBusinessEntity: true,
    companyTaxId: taxId,
    vatNumber,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Run sanctions check on company
  await runSanctionsCheck(userId, companyName);
  
  // Create audit log
  await db.collection('complianceAuditTrail').add({
    actionType: 'kyb_submitted',
    userId,
    companyName,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return {
    success: true,
    message: 'KYB submitted for review'
  };
});

/**
 * Run sanctions list check
 */
async function runSanctionsCheck(userId: string, companyName?: string): Promise<void> {
  // Get user details
  const userDoc = await db.collection('users').doc(userId).get();
  const user = userDoc.data()!;
  
  // In production, integrate with:
  // - OFAC (Office of Foreign Assets Control)
  // - EU sanctions lists
  // - UN sanctions lists
  // - ComplyAdvantage API
  // - Dow Jones Risk & Compliance
  
  // For now, basic check
  const checkData: any = {
    userId,
    userName: user.displayName || user.username,
    companyName,
    status: 'clear', // 'clear', 'flagged', 'blocked'
    checkedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: 'internal'
  };
  
  // Simplified check - would be much more sophisticated in production
  const suspiciousKeywords = ['terrorist', 'sanctioned', 'blocked'];
  const nameToCheck = (user.displayName || user.username || '').toLowerCase();
  const companyToCheck = (companyName || '').toLowerCase();
  
  for (const keyword of suspiciousKeywords) {
    if (nameToCheck.includes(keyword) || companyToCheck.includes(keyword)) {
      checkData.status = 'flagged';
      checkData.reason = `Keyword match: ${keyword}`;
      break;
    }
  }
  
  // Save check result
  await db.collection('sanctionsChecks').doc(userId).set(checkData);
  
  // If flagged, create compliance flag
  if (checkData.status === 'flagged' || checkData.status === 'blocked') {
    await createComplianceFlag(userId, 'sanctions_check_failed', 'high', checkData.reason);
  }
}

/**
 * Create compliance flag
 */
async function createComplianceFlag(
  userId: string,
  type: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  reason: string
): Promise<void> {
  await db.collection('creatorComplianceFlags').add({
    creatorId: userId,
    type,
    severity,
    reason,
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    resolvedAt: null
  });
  
  // If high or critical, freeze earnings
  if (severity === 'high' || severity === 'critical') {
    await db.collection('users').doc(userId).update({
      earningsFrozen: true,
      earningsFrozenReason: reason,
      earningsFrozenAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Create PACK 300A Safety Ticket (integration)
    await db.collection('safetyTickets').add({
      userId,
      type: 'compliance_flag',
      severity,
      reason,
      status: 'open',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Trigger PACK 302 Fraud Detection (integration)
    await db.collection('fraudFlags').add({
      userId,
      flagType: 'compliance',
      severity,
      reason,
      status: 'pending_review',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

/**
 * Request payout
 */
export const requestPayout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const creatorId = context.auth.uid;
  const { amount, paymentMethod } = data;
  
  if (!amount || !paymentMethod) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  // Check verification status
  const verificationDoc = await db.collection('creatorVerification').doc(creatorId).get();
  if (!verificationDoc.exists || verificationDoc.data()?.status !== 'approved') {
    throw new functions.https.HttpsError('permission-denied', 'Creator must be verified first');
  }
  
  const verification = verificationDoc.data()!;
  const verificationLevel = verification.level || 'level1';
  
  // Check if earnings are frozen
  const userDoc = await db.collection('users').doc(creatorId).get();
  const user = userDoc.data()!;
  
  if (user.earningsFrozen) {
    throw new functions.https.HttpsError('permission-denied', 'Earnings are frozen: ' + user.earningsFrozenReason);
  }
  
  // Get limits
  const limits = PAYOUT_LIMITS[verificationLevel] || PAYOUT_LIMITS['level1'];
  
  // Check minimum
  if (amount < limits.minimumPayout) {
    throw new functions.https.HttpsError('invalid-argument', `Minimum payout is ${limits.minimumPayout} PLN`);
  }
  
  // Check daily limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayPayoutsQuery = await db.collection('payoutRequests')
    .where('creatorId', '==', creatorId)
    .where('status', 'in', ['pending', 'processing', 'completed'])
    .where('createdAt', '>=', today)
    .get();
  
  let todayTotal = 0;
  todayPayoutsQuery.forEach(doc => {
    todayTotal += doc.data().amount || 0;
  });
  
  if (todayTotal + amount > limits.dailyLimit) {
    throw new functions.https.HttpsError('resource-exhausted', `Daily limit exceeded (${limits.dailyLimit} PLN)`);
  }
  
  // Check monthly limit
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthPayoutsQuery = await db.collection('payoutRequests')
    .where('creatorId', '==', creatorId)
    .where('status', 'in', ['pending', 'processing', 'completed'])
    .where('createdAt', '>=', monthStart)
    .get();
  
  let monthTotal = 0;
  monthPayoutsQuery.forEach(doc => {
    monthTotal += doc.data().amount || 0;
  });
  
  if (monthTotal + amount > limits.monthlyLimit) {
    throw new functions.https.HttpsError('resource-exhausted', `Monthly limit exceeded (${limits.monthlyLimit} PLN)`);
  }
  
  // Check available balance (tokens * 0.20 PLN)
  const tokenBalance = user.tokenBalance || 0;
  const availableBalance = tokenBalance * 0.20;
  
  if (amount > availableBalance) {
    throw new functions.https.HttpsError('failed-precondition', `Insufficient balance. Available: ${availableBalance} PLN`);
  }
  
  // Velocity check (PACK 302 integration)
  const recentPayouts = await db.collection('payoutRequests')
    .where('creatorId', '==', creatorId)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();
  
  if (recentPayouts.size >= 5) {
    const firstPayout = recentPayouts.docs[recentPayouts.size - 1].data();
    const timeDiff = Date.now() - firstPayout.createdAt.toMillis();
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    if (hoursDiff < 24) {
      // More than 5 payouts in 24 hours - suspicious
      await createComplianceFlag(creatorId, 'high_velocity_payouts', 'medium', 'More than 5 payouts in 24 hours');
    }
  }
  
  // Create payout request
  const payoutRef = await db.collection('payoutRequests').add({
    creatorId,
    amount,
    currency: 'PLN',
    paymentMethod,
    status: 'pending',
    verificationLevel,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Update user token balance (deduct equivalent tokens)
  const tokensToDeduct = amount / 0.20;
  await db.collection('users').doc(creatorId).update({
    tokenBalance: admin.firestore.FieldValue.increment(-tokensToDeduct),
    pendingPayouts: admin.firestore.FieldValue.increment(amount)
  });
  
  // Create audit log
  await db.collection('complianceAuditTrail').add({
    actionType: 'payout_requested',
    userId: creatorId,
    payoutId: payoutRef.id,
    amount,
    currency: 'PLN',
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return {
    success: true,
    payoutId: payoutRef.id,
    message: 'Payout request submitted'
  };
});

/**
 * Validate payment method
 */
export const validatePaymentMethod = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { type, details } = data;
  
  if (!type || !details) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }
  
  // Validate based on type
  let isValid = false;
  let validationMessage = '';
  
  switch (type) {
    case 'bank_transfer':
      if (details.iban || (details.accountNumber && details.routingNumber)) {
        isValid = true;
        validationMessage = 'Bank details validated';
      } else {
        validationMessage = 'Invalid bank details';
      }
      break;
    
    case 'sepa':
      if (details.iban && details.iban.match(/^[A-Z]{2}\d{2}[A-Z0-9]+$/)) {
        isValid = true;
        validationMessage = 'SEPA/IBAN validated';
      } else {
        validationMessage = 'Invalid IBAN format';
      }
      break;
    
    default:
      validationMessage = 'Unsupported payment method';
  }
  
  // Save payment method
  if (isValid) {
    await db.collection('paymentMethods').add({
      userId,
      type,
      details: details, // Should encrypt in production
      validated: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  
  return {
    valid: isValid,
    message: validationMessage
  };
});

/**
 * Get creator verification status
 */
export const getVerificationStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  
  const verificationDoc = await db.collection('creatorVerification').doc(userId).get();
  if (!verificationDoc.exists) {
    return {
      verified: false,
      level: 'unverified',
      limits: PAYOUT_LIMITS['unverified']
    };
  }
  
  const verification = verificationDoc.data()!;
  const level = verification.level || 'level1';
  
  return {
    verified: verification.status === 'approved',
    status: verification.status,
    level,
    limits: PAYOUT_LIMITS[level] || PAYOUT_LIMITS['level1'],
    submittedAt: verification.submittedAt,
    updatedAt: verification.updatedAt
  };
});
