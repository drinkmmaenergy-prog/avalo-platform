/**
 * PACK 390 - AML/KYC COMPLIANCE PIPELINE
 * Automated anti-money laundering and know-your-customer verification
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// CONSTANTS
// ============================================================================

enum KYCLevel {
  NONE = 0,
  BASIC = 1,        // Phone + Email
  VERIFIED = 2,     // Selfie + ID
  ADVANCED = 3      // Bank account verification
}

enum AMLRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

enum AMLAlertStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated'
}

// Risk scoring thresholds
const RISK_THRESHOLDS = {
  tokenVelocityPerDay: 10000,          // Max tokens per day
  payoutFrequencyPerWeek: 3,            // Max payouts per week
  largePayoutAmount: 50000,             // Tokens that trigger review
  multipleCountries: 3,                 // Different countries in 30 days
  rapidAccountCreation: 7,              // Days since account creation
  suspiciousPatterns: {
    roundNumberPayouts: 0.8,            // % of round number payouts
    midnightActivity: 0.6,              // % of activity between 00:00-04:00
    vpnUsage: 0.7                       // % of sessions with VPN
  }
};

// ============================================================================
// AML SCAN
// ============================================================================

/**
 * Run comprehensive AML scan on user
 */
export const pack390_runAMLScan = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { userId, triggeredBy } = data;
  const scanUserId = userId || context.auth.uid;
  
  // Check if requester has permission to scan others
  if (userId && userId !== context.auth.uid) {
    const requesterDoc = await db.collection('users').doc(context.auth.uid).get();
    const isAuthorized = requesterDoc.exists && 
      (requesterDoc.data()?.role === 'admin' || requesterDoc.data()?.permissions?.compliance === true);
    
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'Compliance team access required');
    }
  }
  
  try {
    console.log(`Running AML scan for user: ${scanUserId}`);
    
    // Gather user data
    const userDoc = await db.collection('users').doc(scanUserId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    
    const userData = userDoc.data()!;
    
    // Run all AML checks
    const checks = await runAMLChecks(scanUserId, userData);
    
    // Calculate overall risk score
    const riskScore = calculateRiskScore(checks);
    const riskLevel = determineRiskLevel(riskScore);
    
    // Create scan record
    const scanRef = await db.collection('amlScans').add({
      userId: scanUserId,
      scanDate: admin.firestore.FieldValue.serverTimestamp(),
      triggeredBy: triggeredBy || 'manual',
      checks,
      riskScore,
      riskLevel,
      kycLevel: userData.kycLevel || KYCLevel.NONE,
      countryCode: userData.countryCode || 'UNKNOWN'
    });
    
    // Create alerts if risk is elevated
    if (riskLevel === AMLRiskLevel.HIGH || riskLevel === AMLRiskLevel.CRITICAL) {
      await createAMLAlert(scanUserId, scanRef.id, riskLevel, checks);
    }
    
    // Auto-freeze if critical risk
    if (riskLevel === AMLRiskLevel.CRITICAL) {
      await freezeUserAccount(scanUserId, scanRef.id, 'Critical AML risk detected');
    }
    
    // Log to audit trail
    await db.collection('financialAuditLogs').add({
      type: 'aml_scan',
      userId: scanUserId,
      scanId: scanRef.id,
      riskLevel,
      riskScore,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      scanId: scanRef.id,
      riskLevel,
      riskScore,
      requiresReview: riskLevel !== AMLRiskLevel.LOW
    };
    
  } catch (error) {
    console.error('AML scan error:', error);
    throw error instanceof functions.https.HttpsError 
      ? error 
      : new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Automatic AML scan on payout request
 */
export const pack390_autoAMLScanOnPayout = functions.firestore
  .document('payoutRequests/{payoutId}')
  .onCreate(async (snap, context) => {
    const payoutData = snap.data();
    const { userId, tokens, currency, fiatAmount } = payoutData;
    
    try {
      console.log(`Auto AML scan for payout ${context.params.payoutId}`);
      
      // Get user data
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }
      
      const userData = userDoc.data()!;
      
      // Run checks
      const checks = await runAMLChecks(userId, userData, {
        payoutAmount: tokens,
        payoutCurrency: currency,
        payoutFiat: fiatAmount
      });
      
      const riskScore = calculateRiskScore(checks);
      const riskLevel = determineRiskLevel(riskScore);
      
      // Create scan record
      const scanRef = await db.collection('amlScans').add({
        userId,
        scanDate: admin.firestore.FieldValue.serverTimestamp(),
        triggeredBy: 'payout_request',
        payoutId: context.params.payoutId,
        checks,
        riskScore,
        riskLevel,
        kycLevel: userData.kycLevel || KYCLevel.NONE
      });
      
      // Update payout request status based on risk
      if (riskLevel === AMLRiskLevel.LOW) {
        await snap.ref.update({
          status: 'approved',
          amlScanId: scanRef.id,
          amlRiskLevel: riskLevel
        });
      } else if (riskLevel === AMLRiskLevel.MEDIUM) {
        await snap.ref.update({
          status: 'aml_review',
          amlScanId: scanRef.id,
          amlRiskLevel: riskLevel
        });
      } else {
        await snap.ref.update({
          status: 'frozen',
          amlScanId: scanRef.id,
          amlRiskLevel: riskLevel
        });
        
        await createAMLAlert(userId, scanRef.id, riskLevel, checks);
        await freezeUserAccount(userId, scanRef.id, `High risk payout attempt: ${tokens} tokens`);
      }
      
    } catch (error) {
      console.error('Auto AML scan error:', error);
      
      // Mark payout for manual review
      await snap.ref.update({
        status: 'aml_review',
        amlError: error.message
      });
    }
  });

/**
 * Escalate financial risk to compliance team
 */
export const pack390_escalateFinancialRisk = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { userId, reason, severity, evidence } = data;
  
  // Validate inputs
  if (!userId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'userId and reason required');
  }
  
  try {
    // Create high-priority alert
    const alertRef = await db.collection('amlAlerts').add({
      userId,
      type: 'manual_escalation',
      severity: severity || 'high',
      reason,
      evidence: evidence || {},
      status: AMLAlertStatus.ESCALATED,
      escalatedBy: context.auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Notify compliance team (can integrate with email/Slack)
    await notifyComplianceTeam({
      alertId: alertRef.id,
      userId,
      severity,
      reason
    });
    
    // Log escalation
    await db.collection('financialAuditLogs').add({
      type: 'risk_escalation',
      userId,
      alertId: alertRef.id,
      reason,
      escalatedBy: context.auth.uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      alertId: alertRef.id,
      message: 'Risk escalated to compliance team'
    };
    
  } catch (error) {
    console.error('Risk escalation error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ============================================================================
// AML CHECK FUNCTIONS
// ============================================================================

async function runAMLChecks(userId: string, userData: any, payoutContext?: any) {
  const checks: any = {};
  
  // Check 1: Token velocity (transactions per day)
  checks.tokenVelocity = await checkTokenVelocity(userId);
  
  // Check 2: Payout frequency
  checks.payoutFrequency = await checkPayoutFrequency(userId);
  
  // Check 3: Geographic inconsistencies
  checks.geoMismatch = await checkGeoMismatch(userId, userData);
  
  // Check 4: Support/fraud flags
  checks.supportFlags = await checkSupportFlags(userId);
  
  // Check 5: Fraud graph connections (from PACK 302)
  checks.fraudConnections = await checkFraudConnections(userId);
  
  // Check 6: Account age vs activity
  checks.accountAge = checkAccountAge(userData);
  
  // Check 7: Suspicious patterns
  checks.suspiciousPatterns = await checkSuspiciousPatterns(userId);
  
  // Check 8: Large/unusual transactions
  if (payoutContext) {
    checks.unusualTransaction = checkUnusualTransaction(payoutContext, userData);
  }
  
  return checks;
}

async function checkTokenVelocity(userId: string) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const transactionsSnapshot = await db.collection('fiatLedgers')
    .where('userId', '==', userId)
    .where('timestamp', '>=', oneDayAgo)
    .get();
  
  const totalTokens = transactionsSnapshot.docs.reduce((sum, doc) => {
    return sum + Math.abs(doc.data().tokens || 0);
  }, 0);
  
  const risk = totalTokens > RISK_THRESHOLDS.tokenVelocityPerDay;
  
  return {
    passed: !risk,
    score: risk ? 25 : 0,
    details: { tokensLast24h: totalTokens, threshold: RISK_THRESHOLDS.tokenVelocityPerDay }
  };
}

async function checkPayoutFrequency(userId: string) {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const payoutsSnapshot = await db.collection('payoutRequests')
    .where('userId', '==', userId)
    .where('requestedAt', '>=', oneWeekAgo)
    .get();
  
  const payoutCount = payoutsSnapshot.size;
  const risk = payoutCount > RISK_THRESHOLDS.payoutFrequencyPerWeek;
  
  return {
    passed: !risk,
    score: risk ? 20 : 0,
    details: { payoutsLastWeek: payoutCount, threshold: RISK_THRESHOLDS.payoutFrequencyPerWeek }
  };
}

async function checkGeoMismatch(userId: string, userData: any) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  // This would integrate with user session logs
  // Mock implementation
  const uniqueCountries = 1; // Would be calculated from actual session data
  
  const risk = uniqueCountries > RISK_THRESHOLDS.multipleCountries;
  
  return {
    passed: !risk,
    score: risk ? 30 : 0,
    details: { uniqueCountries, threshold: RISK_THRESHOLDS.multipleCountries }
  };
}

async function checkSupportFlags(userId: string) {
  // Check if user has been flagged by support (from PACK 300A)
  const flagsSnapshot = await db.collection('supportFlags')
    .where('userId', '==', userId)
    .where('status', '==', 'open')
    .get();
  
  const activeFlagsCount = flagsSnapshot.size;
  const risk = activeFlagsCount > 0;
  
  return {
    passed: !risk,
    score: risk ? activeFlagsCount * 15 : 0,
    details: { activeFlags: activeFlagsCount }
  };
}

async function checkFraudConnections(userId: string) {
  // Check fraud graph from PACK 302
  const fraudDoc = await db.collection('fraudGraph').doc(userId).get();
  
  if (!fraudDoc.exists) {
    return { passed: true, score: 0, details: {} };
  }
  
  const fraudData = fraudDoc.data()!;
  const riskScore = fraudData.riskScore || 0;
  
  return {
    passed: riskScore < 50,
    score: riskScore > 70 ? 40 : riskScore > 50 ? 20 : 0,
    details: { fraudRiskScore: riskScore }
  };
}

function checkAccountAge(userData: any) {
  const accountCreated = userData.createdAt?.toDate() || new Date();
  const daysSinceCreation = (Date.now() - accountCreated.getTime()) / (1000 * 60 *60 * 24);
  
  const risk = daysSinceCreation < RISK_THRESHOLDS.rapidAccountCreation;
  
  return {
    passed: !risk,
    score: risk ? 25 : 0,
    details: { accountAgeDays: Math.floor(daysSinceCreation), threshold: RISK_THRESHOLDS.rapidAccountCreation }
  };
}

async function checkSuspiciousPatterns(userId: string) {
  // This would analyze transaction patterns
  // Mock implementation for now
  return {
    passed: true,
    score: 0,
    details: {}
  };
}

function checkUnusualTransaction(payoutContext: any, userData: any) {
  const { payoutAmount } = payoutContext;
  const risk = payoutAmount > RISK_THRESHOLDS.largePayoutAmount;
  
  return {
    passed: !risk,
    score: risk ? 35 : 0,
    details: { amount: payoutAmount, threshold: RISK_THRESHOLDS.largePayoutAmount }
  };
}

// ============================================================================
// RISK CALCULATION
// ============================================================================

function calculateRiskScore(checks: any): number {
  let totalScore = 0;
  
  for (const checkKey in checks) {
    const check = checks[checkKey];
    if (check && typeof check.score === 'number') {
      totalScore += check.score;
    }
  }
  
  return Math.min(totalScore, 100); // Cap at 100
}

function determineRiskLevel(riskScore: number): AMLRiskLevel {
  if (riskScore >= 70) return AMLRiskLevel.CRITICAL;
  if (riskScore >= 50) return AMLRiskLevel.HIGH;
  if (riskScore >= 25) return AMLRiskLevel.MEDIUM;
  return AMLRiskLevel.LOW;
}

// ============================================================================
// ALERT & ACTION FUNCTIONS
// ============================================================================

async function createAMLAlert(userId: string, scanId: string, riskLevel: string, checks: any) {
  const failedChecks = Object.keys(checks).filter(key => !checks[key].passed);
  
  await db.collection('amlAlerts').add({
    userId,
    scanId,
    type: 'automated_detection',
    severity: riskLevel,
    status: AMLAlertStatus.PENDING,
    failedChecks,
    checkDetails: checks,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function freezeUserAccount(userId: string, scanId: string, reason: string) {
  await db.collection('users').doc(userId).update({
    accountFrozen: true,
    frozenAt: admin.firestore.FieldValue.serverTimestamp(),
    frozenReason: reason,
    frozenBy: 'aml_system',
    frozenScanId: scanId
  });
  
  // Freeze all pending payouts
  const pendingPayouts = await db.collection('payoutRequests')
    .where('userId', '==', userId)
    .where('status', 'in', ['pending', 'approved', 'aml_review'])
    .get();
  
  const batch = db.batch();
  pendingPayouts.forEach(doc => {
    batch.update(doc.ref, {
      status: 'frozen',
      frozenAt: admin.firestore.FieldValue.serverTimestamp(),
      frozenReason: reason
    });
  });
  
  await batch.commit();
  
  console.log(`User ${userId} account frozen due to: ${reason}`);
}

async function notifyComplianceTeam(alert: any) {
  // TODO: Integrate with email/Slack notification system
  console.log('Compliance team notification:', alert);
  
  // Could integrate with SendGrid, AWS SES, or Slack webhook
  // For now, just log to audit trail
  await db.collection('financialAuditLogs').add({
    type: 'compliance_notification',
    alertId: alert.alertId,
    userId: alert.userId,
    severity: alert.severity,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}
