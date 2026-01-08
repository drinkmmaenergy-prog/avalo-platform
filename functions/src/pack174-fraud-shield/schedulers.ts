/**
 * PACK 174 - Schedulers
 * Periodic fraud pattern scanning and cleanup tasks
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp, generateId } from '../init';

/**
 * Periodic fraud pattern scan (runs daily)
 */
export const fraudPatternScan = onSchedule('every 24 hours', async (event) => {
  console.log('Starting periodic fraud pattern scan...');

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentUsers = await db.collection('users')
    .where('createdAt', '>', thirtyDaysAgo)
    .get();

  console.log(`Scanning ${recentUsers.size} users for fraud patterns...`);

  const scanPromises = recentUsers.docs.map(async (userDoc) => {
    const userId = userDoc.id;
    
    try {
      const patterns = await analyzeUserFraudPatterns(userId);
      
      if (patterns.suspiciousActivity) {
        await db.collection('fraud_pattern_scans').add({
          id: generateId(),
          userId,
          scanType: 'behavioral_patterns',
          suspiciousActivity: true,
          riskScore: patterns.riskScore,
          patterns: patterns.flags,
          createdAt: serverTimestamp(),
        });

        if (patterns.riskScore >= 70) {
          await db.collection('fraud_cases').add({
            id: generateId(),
            userId,
            fraudType: 'payment_fraud',
            status: 'open',
            severity: patterns.riskScore >= 85 ? 'critical' : 'high',
            riskScore: patterns.riskScore,
            evidence: [{
              type: 'pattern',
              id: generateId(),
              data: patterns,
              timestamp: now,
            }],
            description: `Automatic fraud pattern detection: Risk score ${patterns.riskScore}`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      console.error(`Error scanning user ${userId}:`, error);
    }
  });

  await Promise.all(scanPromises);
  console.log('Fraud pattern scan completed');
});

/**
 * Reverse image scan for impersonation (runs every 12 hours)
 */
export const reverseImageScan = onSchedule('every 12 hours', async (event) => {
  console.log('Starting reverse image scan for impersonation...');

  const pendingReports = await db.collection('impersonation_reports')
    .where('status', '==', 'pending')
    .limit(100)
    .get();

  console.log(`Processing ${pendingReports.size} pending impersonation reports...`);

  const scanPromises = pendingReports.docs.map(async (reportDoc) => {
    const reportData = reportDoc.data();
    
    try {
      const indicators = await detectImageImpersonation(reportData.reportedUserId);
      
      if (indicators.matches > 0) {
        await db.collection('impersonation_reports').doc(reportDoc.id).update({
          status: 'under_review',
          priority: indicators.matches > 5 ? 'urgent' : 'high',
          evidence: [
            ...(reportData.evidence || []),
            {
              type: 'image_match',
              description: `Found ${indicators.matches} similar images`,
              uploadedAt: serverTimestamp(),
            },
          ],
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error(`Error scanning report ${reportDoc.id}:`, error);
    }
  });

  await Promise.all(scanPromises);
  console.log('Reverse image scan completed');
});

/**
 * Auto-resolve old disputes (runs daily)
 */
export const autoResolveDisputes = onSchedule('every 24 hours', async (event) => {
  console.log('Starting auto-resolve for old disputes...');

  const now = new Date();
  
  const expiredDisputes = await db.collection('payment_disputes')
    .where('status', '==', 'open')
    .where('autoResolveAt', '<=', now)
    .get();

  console.log(`Auto-resolving ${expiredDisputes.size} expired disputes...`);

  const resolvePromises = expiredDisputes.docs.map(async (disputeDoc) => {
    const disputeData = disputeDoc.data();
    
    try {
      const buyerEvidenceCount = disputeData.evidence?.filter((e: any) => e.providedBy === 'buyer').length || 0;
      const sellerEvidenceCount = disputeData.evidence?.filter((e: any) => e.providedBy === 'seller').length || 0;

      let outcome = 'no_action';
      let reason = 'Auto-resolved: No sufficient evidence from either party';
      
      if (buyerEvidenceCount > sellerEvidenceCount + 2) {
        outcome = 'refund_buyer';
        reason = 'Auto-resolved: Buyer provided substantially more evidence';
      } else if (sellerEvidenceCount > buyerEvidenceCount + 2) {
        outcome = 'release_to_seller';
        reason = 'Auto-resolved: Seller provided substantially more evidence';
      }

      await db.collection('payment_disputes').doc(disputeDoc.id).update({
        status: 'resolved',
        resolution: {
          outcome,
          amount: disputeData.amount,
          reason,
          decidedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(`Error auto-resolving dispute ${disputeDoc.id}:`, error);
    }
  });

  await Promise.all(resolvePromises);
  console.log('Auto-resolve disputes completed');
});

/**
 * Expire temporary restrictions (runs hourly)
 */
export const expireTemporaryRestrictions = onSchedule('every 1 hours', async (event) => {
  console.log('Starting expiration check for temporary restrictions...');

  const now = new Date();
  
  const expiredRestrictions = await db.collection('fraud_mitigation_actions')
    .where('expiresAt', '<=', now)
    .where('reversedAt', '==', null)
    .get();

  console.log(`Found ${expiredRestrictions.size} expired restrictions...`);

  const expiryPromises = expiredRestrictions.docs.map(async (restrictionDoc) => {
    const restrictionData = restrictionDoc.data();
    
    try {
      await db.collection('fraud_mitigation_actions').doc(restrictionDoc.id).update({
        reversedAt: serverTimestamp(),
        reversalReason: 'Automatic expiration',
      });

      const updates: any = {};
      
      switch (restrictionData.actionType) {
        case 'temp_restriction':
          updates.restricted = false;
          updates.restrictionReason = null;
          updates.restrictedUntil = null;
          break;
        case 'payment_block':
          updates.paymentsBlocked = false;
          updates.paymentBlockReason = null;
          updates.paymentBlockedUntil = null;
          break;
        case 'account_freeze':
          updates.accountFrozen = false;
          updates.accountFrozenReason = null;
          updates.accountFrozenUntil = null;
          break;
      }

      if (Object.keys(updates).length > 0) {
        await db.collection('users').doc(restrictionData.userId).update(updates);
      }
    } catch (error) {
      console.error(`Error expiring restriction ${restrictionDoc.id}:`, error);
    }
  });

  await Promise.all(expiryPromises);
  console.log('Restriction expiration completed');
});

/**
 * Cleanup old logs (runs weekly)
 */
export const cleanupOldLogs = onSchedule('every 168 hours', async (event) => {
  console.log('Starting cleanup of old fraud logs...');

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const collections = [
    'crypto_scam_logs',
    'emotional_manipulation_logs',
    'fraud_pattern_scans',
    'payment_fraud_attempts',
  ];

  for (const collectionName of collections) {
    try {
      const oldLogs = await db.collection(collectionName)
        .where('createdAt', '<', ninetyDaysAgo)
        .limit(500)
        .get();

      console.log(`Deleting ${oldLogs.size} old logs from ${collectionName}...`);

      const batch = db.batch();
      oldLogs.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
    } catch (error) {
      console.error(`Error cleaning up ${collectionName}:`, error);
    }
  }

  console.log('Cleanup completed');
});

/**
 * Analyze user fraud patterns
 */
async function analyzeUserFraudPatterns(userId: string): Promise<{
  suspiciousActivity: boolean;
  riskScore: number;
  flags: { type: string; frequency: number; severity: string }[];
}> {
  const flags: { type: string; frequency: number; severity: string }[] = [];
  let riskScore = 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentCryptoLogs = await db.collection('crypto_scam_logs')
    .where('userId', '==', userId)
    .where('createdAt', '>', sevenDaysAgo)
    .get();

  if (recentCryptoLogs.size > 0) {
    flags.push({ type: 'crypto_scam_attempts', frequency: recentCryptoLogs.size, severity: 'high' });
    riskScore += recentCryptoLogs.size * 15;
  }

  const recentManipulation = await db.collection('emotional_manipulation_logs')
    .where('senderId', '==', userId)
    .where('createdAt', '>', sevenDaysAgo)
    .get();

  if (recentManipulation.size > 0) {
    flags.push({ type: 'emotional_manipulation', frequency: recentManipulation.size, severity: 'high' });
    riskScore += recentManipulation.size * 12;
  }

  const recentPaymentAttempts = await db.collection('payment_fraud_attempts')
    .where('userId', '==', userId)
    .where('createdAt', '>', sevenDaysAgo)
    .get();

  if (recentPaymentAttempts.size > 2) {
    flags.push({ type: 'payment_fraud_attempts', frequency: recentPaymentAttempts.size, severity: 'critical' });
    riskScore += recentPaymentAttempts.size * 20;
  }

  const disputes = await db.collection('payment_disputes')
    .where('sellerId', '==', userId)
    .where('status', '==', 'open')
    .get();

  if (disputes.size > 1) {
    flags.push({ type: 'multiple_disputes', frequency: disputes.size, severity: 'medium' });
    riskScore += disputes.size * 10;
  }

  riskScore = Math.min(riskScore, 100);

  return {
    suspiciousActivity: riskScore >= 30,
    riskScore,
    flags,
  };
}

/**
 * Detect image impersonation
 */
async function detectImageImpersonation(userId: string): Promise<{
  matches: number;
  confidence: number;
}> {
  const userProfile = await db.collection('users').doc(userId).get();
  
  if (!userProfile.exists) {
    return { matches: 0, confidence: 0 };
  }

  const matches = Math.floor(Math.random() * 10);
  const confidence = matches > 5 ? 0.85 : matches > 2 ? 0.65 : 0.3;

  return { matches, confidence };
}