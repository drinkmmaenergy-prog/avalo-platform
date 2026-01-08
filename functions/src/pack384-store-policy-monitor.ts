/**
 * PACK 384 — Store Policy Violation Monitor
 * Prevents store bans by detecting policy violations early
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface PolicyViolation {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  affectedContent?: string;
  userId?: string;
  timestamp: admin.firestore.Timestamp;
  autoRemediated: boolean;
  escalated: boolean;
  storeGuideline: string;
}

interface StoreSafetyAlert {
  platform: 'ios' | 'android' | 'both';
  violations: PolicyViolation[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
  timestamp: admin.firestore.Timestamp;
}

/**
 * Monitor for store policy violations
 */
export const storePolicyViolationMonitor = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const platform = data.platform || 'both';

  try {
    const violations: PolicyViolation[] = [];
    
    // Check for inappropriate content
    const inappropriateContent = await db.collection('contentModerationQueue')
      .where('status', '==', 'flagged')
      .where('severity', 'in', ['high', 'critical'])
      .limit(100)
      .get();

    inappropriateContent.forEach(doc => {
      const data = doc.data();
      violations.push({
        type: 'inappropriate_content',
        severity: data.severity === 'critical' ? 'critical' : 'warning',
        description: `Flagged content: ${data.reason}`,
        affectedContent: doc.id,
        userId: data.userId,
        timestamp: data.timestamp,
        autoRemediated: false,
        escalated: data.severity === 'critical',
        storeGuideline: 'App Store Review Guidelines 1.1 - Objectionable Content'
      });
    });

    // Check for payment fraud indicators
    const suspiciousPayments = await db.collection('fraudAlerts')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .where('type', '==', 'payment_fraud')
      .where('status', '==', 'confirmed')
      .get();

    if (suspiciousPayments.size > 10) {
      violations.push({
        type: 'payment_fraud_pattern',
        severity: 'critical',
        description: `${suspiciousPayments.size} confirmed payment fraud cases in last 7 days`,
        timestamp: admin.firestore.Timestamp.now(),
        autoRemediated: false,
        escalated: true,
        storeGuideline: 'App Store Review Guidelines 3.1 - Payments'
      });
    }

    // Check for user data privacy issues
    const privacyViolations = await db.collection('privacyAudits')
      .where('status', '==', 'violation')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .get();

    privacyViolations.forEach(doc => {
      const data = doc.data();
      violations.push({
        type: 'privacy_violation',
        severity: 'critical',
        description: `Privacy violation: ${data.issue}`,
        timestamp: data.timestamp,
        autoRemediated: data.remediated || false,
        escalated: true,
        storeGuideline: 'App Store Review Guidelines 5.1 - Privacy'
      });
    });

    // Check for spam/manipulation
    const spamPatterns = await db.collection('storeAbuseSignals')
      .where('type', 'in', ['fake_reviews', 'review_manipulation'])
      .where('status', '==', 'detected')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000))
      .get();

    if (spamPatterns.size > 0) {
      violations.push({
        type: 'review_manipulation',
        severity: 'critical',
        description: `${spamPatterns.size} instances of review manipulation detected`,
        timestamp: admin.firestore.Timestamp.now(),
        autoRemediated: false,
        escalated: true,
        storeGuideline: 'App Store Review Guidelines 5.6 - Developer Code of Conduct'
      });
    }

    // Check for underage users
    const minorProtectionViolations = await db.collection('minorProtectionAlerts')
      .where('status', '==', 'violation')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .get();

    minorProtectionViolations.forEach(doc => {
      const data = doc.data();
      violations.push({
        type: 'minor_protection_violation',
        severity: 'critical',
        description: `Minor protection issue: ${data.issue}`,
        userId: data.userId,
        timestamp: data.timestamp,
        autoRemediated: data.blocked || false,
        escalated: true,
        storeGuideline: 'App Store Review Guidelines 1.3 - Kids Category'
      });
    });

    // Check for crash rate violations
    const recentMetrics = await db.collection('asoHealthMetrics')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (!recentMetrics.empty) {
      const metrics = recentMetrics.docs[0].data();
      if (metrics.crashRate > 5) {
        violations.push({
          type: 'high_crash_rate',
          severity: metrics.crashRate > 10 ? 'critical' : 'warning',
          description: `Crash rate: ${metrics.crashRate.toFixed(2)} per 1000 sessions (threshold: 5)`,
          timestamp: admin.firestore.Timestamp.now(),
          autoRemediated: false,
          escalated: metrics.crashRate > 10,
          storeGuideline: 'App Store Review Guidelines 2.1 - Performance'
        });
      }
    }

    // Check for deceptive practices
    const deceptivePractices = await db.collection('userComplaints')
      .where('type', '==', 'deceptive_practice')
      .where('status', '==', 'validated')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .get();

    if (deceptivePractices.size > 5) {
      violations.push({
        type: 'deceptive_practices',
        severity: 'critical',
        description: `${deceptivePractices.size} validated complaints about deceptive practices`,
        timestamp: admin.firestore.Timestamp.now(),
        autoRemediated: false,
        escalated: true,
        storeGuideline: 'App Store Review Guidelines 5.6 - Developer Code of Conduct'
      });
    }

    // Determine risk level
    const criticalCount = violations.filter(v => v.severity === 'critical').length;
    const warningCount = violations.filter(v => v.severity === 'warning').length;

    let riskLevel: StoreSafetyAlert['riskLevel'] = 'low';
    let recommendation = 'No immediate action required. Continue monitoring.';

    if (criticalCount > 0) {
      riskLevel = 'critical';
      recommendation = 'URGENT: Critical violations detected. Immediate remediation required to prevent store removal.';
    } else if (warningCount > 5) {
      riskLevel = 'high';
      recommendation = 'Multiple warnings detected. Address issues within 48 hours to prevent escalation.';
    } else if (warningCount > 0) {
      riskLevel = 'medium';
      recommendation = 'Some policy concerns detected. Review and address within 7 days.';
    }

    const alert: StoreSafetyAlert = {
      platform,
      violations,
      riskLevel,
      recommendation,
      timestamp: admin.firestore.Timestamp.now()
    };

    // Store the alert
    await db.collection('storeSafetyAlerts').add(alert);

    // If critical, escalate to PACK 300 support
    if (riskLevel === 'critical') {
      await db.collection('supportTickets').add({
        type: 'store_policy_critical',
        priority: 'critical',
        title: 'Critical Store Policy Violations Detected',
        description: `Platform: ${platform}\nViolations: ${criticalCount}\n\nImmediate action required.`,
        alert,
        status: 'open',
        assignedTo: 'compliance_team',
        createdAt: admin.firestore.Timestamp.now()
      });

      // Generate defense dossier
      await generateStoreDefenseDossier({
        data: { alertId: alert.timestamp.toMillis().toString(), platform }
      } as any, context);
    }

    return alert;
  } catch (error) {
    console.error('Error monitoring store policy:', error);
    throw new functions.https.HttpsError('internal', 'Failed to monitor policy');
  }
});

/**
 * Generate store defense dossier for App Store/Google Play submission
 */
export const generateStoreDefenseDossier = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  try {
    const platform = data.platform || 'both';
    const incidentType = data.incidentType || 'review_bombing';

    // Gather evidence
    const dossier = {
      generatedAt: admin.firestore.Timestamp.now(),
      platform,
      incidentType,
      executiveSummary: '',
      evidence: {} as any,
      mitigationActions: [] as string[],
      legalReadyDocuments: [] as string[]
    };

    // Get review bombing detection data
    if (incidentType === 'review_bombing') {
      const detections = await db.collection('reviewBombingDetections')
        .where('detected', '==', true)
        .orderBy('detectedAt', 'desc')
        .limit(10)
        .get();

      dossier.evidence.reviewBombingDetections = detections.docs.map(doc => doc.data());

      // Get suspicious review signals
      const suspiciousReviews = await db.collection('storeReviewSignals')
        .where('suspicious', '==', true)
        .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .limit(100)
        .get();

      dossier.evidence.suspiciousReviews = suspiciousReviews.docs.map(doc => ({
        reviewId: doc.id,
        ...doc.data()
      }));

      dossier.executiveSummary = `Coordinated review bombing attack detected with ${suspiciousReviews.size} suspicious reviews from ${new Set(suspiciousReviews.docs.map(d => d.data().ipCluster)).size} IP clusters.`;
    }

    // Get abuse signals
    const abuseSignals = await db.collection('storeAbuseSignals')
      .where('status', '==', 'active')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    dossier.evidence.abuseSignals = abuseSignals.docs.map(doc => doc.data());

    // Get fraud detection data (PACK 302)
    const fraudAlerts = await db.collection('fraudAlerts')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .where('type', '==', 'review_fraud')
      .get();

    dossier.evidence.fraudAlerts = fraudAlerts.docs.map(doc => doc.data());

    // Get audit logs (PACK 296)
    const auditLogs = await db.collection('auditLogs')
      .where('category', '==', 'store_defense')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    dossier.evidence.auditTrail = auditLogs.docs.map(doc => doc.data());

    // Document mitigation actions
    dossier.mitigationActions = [
      'Implemented automated suspicious review detection',
      'Blocked identified fake accounts',
      'Enhanced device fingerprinting and IP clustering',
      'Escalated to internal security team',
      'Prepared legal documentation for platform submission'
    ];

    // Store the dossier
    const dossierRef = await db.collection('storeDefenseDossiers').add(dossier);

    // Generate PDF-ready format (would integrate with document generation service)
    await db.collection('documentGeneration').add({
      type: 'store_defense_dossier',
      dossierId: dossierRef.id,
      platform,
      status: 'pending',
      createdAt: admin.firestore.Timestamp.now()
    });

    return {
      dossierId: dossierRef.id,
      summary: dossier.executiveSummary,
      evidenceCount: Object.keys(dossier.evidence).length,
      readyForSubmission: true
    };
  } catch (error) {
    console.error('Error generating defense dossier:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate dossier');
  }
});

/**
 * Scheduled store policy check
 */
export const scheduledStorePolicyCheck = functions.pubsub.schedule('every 12 hours').onRun(async () => {
  try {
    const platforms: Array<'ios' | 'android'> = ['ios', 'android'];
    
    for (const platform of platforms) {
      await storePolicyViolationMonitor.run({
        data: { platform },
        auth: { token: { admin: true } } as any
      } as any, {} as any);
    }

    console.log('Store policy check completed');
  } catch (error) {
    console.error('Error in scheduled policy check:', error);
  }
});

/**
 * Auto-remediation for certain violations
 */
export const autoRemediateViolation = functions.firestore
  .document('storeSafetyAlerts/{alertId}')
  .onCreate(async (snap, context) => {
    const alert = snap.data() as StoreSafetyAlert;

    if (alert.riskLevel === 'critical') {
      // Auto-block users with confirmed violations
      for (const violation of alert.violations) {
        if (violation.userId && violation.type === 'inappropriate_content') {
          await db.collection('users').doc(violation.userId).update({
            contentBlocked: true,
            blockReason: violation.description,
            blockedAt: admin.firestore.Timestamp.now()
          });

          // Log remediation
          await db.collection('auditLogs').add({
            action: 'auto_block_user',
            userId: violation.userId,
            reason: violation.type,
            category: 'store_defense',
            timestamp: admin.firestore.Timestamp.now(),
            automated: true
          });
        }
      }
    }
  });
