/**
 * PACK 388 — Automated Regulatory Response Engine
 * 
 * Handles regulatory incidents and compliance automation:
 * - Government notices
 * - Store compliance warnings
 * - KYC authority alerts
 * - Payment provider investigations
 * - Automated response execution
 * 
 * Integrated with: PACK 387 (PR), PACK 300 (Support), PACK 302 (Fraud), PACK 277 (Wallet)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Regulatory incident types
 */
export enum IncidentType {
  GOVERNMENT_NOTICE = 'GOVERNMENT_NOTICE',
  STORE_COMPLIANCE = 'STORE_COMPLIANCE',
  KYC_AUTHORITY = 'KYC_AUTHORITY',
  PAYMENT_INVESTIGATION = 'PAYMENT_INVESTIGATION',
  DATA_BREACH = 'DATA_BREACH',
  GDPR_COMPLAINT = 'GDPR_COMPLAINT',
  MINOR_EXPOSURE = 'MINOR_EXPOSURE',
  AML_INVESTIGATION = 'AML_INVESTIGATION'
}

export enum IncidentSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum IncidentStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  RESPONDING = 'RESPONDING',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED'
}

interface RegulatoryIncident {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  jurisdiction: string;
  authority?: string; // Regulatory body
  affectedUsers?: string[];
  affectedData?: string[];
  createdAt: FirebaseFirestore.Timestamp;
  responseDeadline?: FirebaseFirestore.Timestamp;
  resolvedAt?: FirebaseFirestore.Timestamp;
  assignedTo?: string;
  response: {
    automated: boolean;
    actionsTaken: string[];
    documentsGenerated?: string[];
    notificationsSent?: string[];
  };
  metadata: {
    referenceNumber?: string;
    contactPerson?: string;
    contactEmail?: string;
    relatedIncidents?: string[];
  };
}

/**
 * Open regulatory incident
 */
export const pack388_openRegulatoryIncident = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  const {
    type,
    severity,
    title,
    description,
    jurisdiction,
    authority,
    affectedUsers,
    responseDeadlineDays,
    metadata
  } = data;

  try {
    const incidentRef = db.collection('regulatoryIncidents').doc();

    const responseDeadline = responseDeadlineDays
      ? admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + responseDeadlineDays * 24 * 60 * 60 * 1000)
        )
      : undefined;

    const incident: RegulatoryIncident = {
      id: incidentRef.id,
      type,
      severity,
      status: IncidentStatus.OPEN,
      title,
      description,
      jurisdiction,
      authority,
      affectedUsers,
      createdAt: admin.firestore.Timestamp.now(),
      responseDeadline,
      response: {
        automated: false,
        actionsTaken: []
      },
      metadata: metadata || {}
    };

    await incidentRef.set(incident);

    // Execute automated response actions
    const automatedActions = await pack388_executeFreezeActions({
      incidentId: incidentRef.id,
      type,
      severity,
      affectedUsers
    });

    // Update incident with automated actions
    await incidentRef.update({
      'response.automated': true,
      'response.actionsTaken': automatedActions.actionsTaken,
      status: IncidentStatus.INVESTIGATING
    });

    // Escalate to legal team
    await db.collection('legalNotifications').add({
      type: 'REGULATORY_INCIDENT',
      incidentId: incidentRef.id,
      severity,
      title,
      jurisdiction,
      responseDeadline,
      createdAt: admin.firestore.Timestamp.now(),
      priority: severity === IncidentSeverity.CRITICAL ? 'URGENT' : 'HIGH',
      read: false
    });

    console.log(`⚖️ Regulatory incident opened: ${incidentRef.id}`);

    return {
      success: true,
      incidentId: incidentRef.id,
      automatedActions: automatedActions.actionsTaken,
      message: 'Regulatory incident created and automated response executed'
    };

  } catch (error) {
    console.error('Error opening regulatory incident:', error);
    throw new functions.https.HttpsError('internal', 'Failed to open regulatory incident');
  }
});

/**
 * Execute automated freeze actions
 */
export const pack388_executeFreezeActions = async (data: {
  incidentId: string;
  type: IncidentType;
  severity: IncidentSeverity;
  affectedUsers?: string[];
}) => {
  const { incidentId, type, severity, affectedUsers } = data;
  const actionsTaken: string[] = [];

  try {
    // CRITICAL incidents trigger immediate lockdown
    if (severity === IncidentSeverity.CRITICAL || type === IncidentType.MINOR_EXPOSURE) {
      
      // 1. Freeze affected wallets
      if (affectedUsers && affectedUsers.length > 0) {
        for (const userId of affectedUsers) {
          await db.collection('wallets').doc(userId).update({
            frozen: true,
            frozenReason: `REGULATORY_INCIDENT_${type}`,
            frozenAt: admin.firestore.Timestamp.now(),
            incidentId
          });
        }
        actionsTaken.push(`WALLETS_FROZEN: ${affectedUsers.length} users`);
      }

      // 2. PR escalation (PACK 387)
      await db.collection('prIncidents').add({
        type: 'REGULATORY_INCIDENT',
        incidentId,
        severity,
        createdAt: admin.firestore.Timestamp.now(),
        status: 'OPEN',
        priority: 'URGENT'
      });
      actionsTaken.push('PR_ESCALATED');

      // 3. Support escalation (PACK 300)
      await db.collection('supportEscalations').add({
        type: 'REGULATORY_INCIDENT',
        incidentId,
        severity,
        createdAt: admin.firestore.Timestamp.now(),
        assignedTo: 'LEGAL_SUPPORT_TEAM'
      });
      actionsTaken.push('SUPPORT_ESCALATED');

      // 4. Fraud analysis boost (PACK 302)
      await db.collection('fraudAnalysisTasks').add({
        type: 'REGULATORY_INVESTIGATION',
        incidentId,
        affectedUsers,
        priority: 'URGENT',
        createdAt: admin.firestore.Timestamp.now(),
        status: 'PENDING'
      });
      actionsTaken.push('FRAUD_ANALYSIS_BOOSTED');
    }

    // Store compliance warnings
    if (type === IncidentType.STORE_COMPLIANCE) {
      // Generate compliance report
      await generateComplianceReport(incidentId);
      actionsTaken.push('COMPLIANCE_REPORT_GENERATED');
    }

    // KYC authority alerts
    if (type === IncidentType.KYC_AUTHORITY) {
      // Pull all KYC records for affected users
      if (affectedUsers) {
        await exportKYCRecords(incidentId, affectedUsers);
        actionsTaken.push('KYC_RECORDS_EXPORTED');
      }
    }

    // Payment investigations
    if (type === IncidentType.PAYMENT_INVESTIGATION) {
      // Freeze payment processing
      await db.collection('systemSettings').doc('payments').update({
        processingPaused: true,
        pauseReason: `REGULATORY_INCIDENT_${incidentId}`,
        pausedAt: admin.firestore.Timestamp.now()
      });
      actionsTaken.push('PAYMENT_PROCESSING_PAUSED');
    }

    // GDPR complaints
    if (type === IncidentType.GDPR_COMPLAINT) {
      // Generate GDPR compliance report
      await generateGDPRReport(incidentId);
      actionsTaken.push('GDPR_REPORT_GENERATED');
    }

    console.log(`✅ Automated actions executed for incident ${incidentId}`);

    return {
      success: true,
      actionsTaken
    };

  } catch (error) {
    console.error('Error executing freeze actions:', error);
    throw error;
  }
};

/**
 * Generate legal report
 */
export const pack388_generateLegalReport = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  const { incidentId, reportType } = data;

  try {
    const incidentDoc = await db.collection('regulatoryIncidents').doc(incidentId).get();
    if (!incidentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Incident not found');
    }

    const incident = incidentDoc.data() as RegulatoryIncident;

    // Generate report based on type
    let report: any;

    switch (reportType) {
      case 'COMPLIANCE':
        report = await generateComplianceReport(incidentId);
        break;
      case 'GDPR':
        report = await generateGDPRReport(incidentId);
        break;
      case 'KYC_AML':
        report = await generateKYCAMLReport(incidentId, incident.affectedUsers);
        break;
      case 'INCIDENT_SUMMARY':
        report = await generateIncidentSummary(incidentId);
        break;
      default:
        throw new functions.https.HttpsError('invalid-argument', 'Invalid report type');
    }

    // Store report
    const reportRef = db.collection('legalReports').doc();
    await reportRef.set({
      id: reportRef.id,
      incidentId,
      reportType,
      generatedAt: admin.firestore.Timestamp.now(),
      generatedBy: context.auth.uid,
      data: report
    });

    // Update incident
    await incidentDoc.ref.update({
      'response.documentsGenerated': admin.firestore.FieldValue.arrayUnion(reportRef.id)
    });

    return {
      success: true,
      reportId: reportRef.id,
      message: 'Legal report generated successfully'
    };

  } catch (error) {
    console.error('Error generating legal report:', error);
    throw error;
  }
});

/**
 * Generate compliance report
 */
async function generateComplianceReport(incidentId: string): Promise<any> {
  const report = {
    incidentId,
    reportType: 'COMPLIANCE',
    generatedAt: new Date().toISOString(),
    sections: {} as any
  };

  // Platform statistics
  const stats = await db.collection('systemStats').doc('current').get();
  report.sections.platformStats = stats.data();

  // Active compliance measures
  const measures = await db.collection('complianceMeasures')
    .where('active', '==', true)
    .get();
  report.sections.activeMeasures = measures.docs.map(d => d.data());

  // Recent safety incidents
  const safetyIncidents = await db.collection('safetyIncidents')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  report.sections.recentSafetyIncidents = safetyIncidents.docs.map(d => d.data());

  return report;
}

/**
 * Generate GDPR report
 */
async function generateGDPRReport(incidentId: string): Promise<any> {
  const report = {
    incidentId,
    reportType: 'GDPR',
    generatedAt: new Date().toISOString(),
    sections: {} as any
  };

  // Data requests statistics
  const dataRequests = await db.collection('dataRequests')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  report.sections.dataRequests = {
    total: dataRequests.size,
    byType: {},
    averageCompletionTime: 0
  };

  // Data retention policies
  const retentionPolicies = await db.collection('dataRetentionPolicies')
    .where('active', '==', true)
    .get();
  report.sections.retentionPolicies = retentionPolicies.docs.map(d => d.data());

  // Recent purges
  const purgeLogs = await db.collection('retentionPurgeLogs')
    .orderBy('executedAt', 'desc')
    .limit(10)
    .get();
  report.sections.recentPurges = purgeLogs.docs.map(d => d.data());

  return report;
}

/**
 * Generate KYC/AML report
 */
async function generateKYCAMLReport(incidentId: string, userIds?: string[]): Promise<any> {
  const report = {
    incidentId,
    reportType: 'KYC_AML',
    generatedAt: new Date().toISOString(),
    sections: {} as any
  };

  if (userIds && userIds.length > 0) {
    // KYC verifications for affected users
    const kycVerifications = await db.collection('kycVerifications')
      .where('userId', 'in', userIds.slice(0, 10)) // Firestore 'in' limit
      .get();
    report.sections.kycVerifications = kycVerifications.docs.map(d => d.data());

    // AML alerts for affected users
    const amlAlerts = await db.collection('amlAlerts')
      .where('userId', 'in', userIds.slice(0, 10))
      .get();
    report.sections.amlAlerts = amlAlerts.docs.map(d => d.data());
  }

  // Recent AML alerts (last 30 days)
  const recentAlerts = await db.collection('amlAlerts')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ))
    .get();
  report.sections.recentAMLAlerts = recentAlerts.docs.map(d => d.data());

  return report;
}

/**
 * Generate incident summary
 */
async function generateIncidentSummary(incidentId: string): Promise<any> {
  const incidentDoc = await db.collection('regulatoryIncidents').doc(incidentId).get();
  const incident = incidentDoc.data();

  const report = {
    incidentId,
    reportType: 'INCIDENT_SUMMARY',
    generatedAt: new Date().toISOString(),
    incident,
    timeline: [] as any[],
    actions: incident?.response?.actionsTaken || [],
    status: incident?.status
  };

  // Get related events
  const relatedEvents = await db.collection('incidentEvents')
    .where('incidentId', '==', incidentId)
    .orderBy('createdAt', 'asc')
    .get();
  report.timeline = relatedEvents.docs.map(d => d.data());

  return report;
}

/**
 * Export KYC records for investigation
 */
async function exportKYCRecords(incidentId: string, userIds: string[]): Promise<void> {
  const records = [];

  for (const userId of userIds) {
    const kycDocs = await db.collection('kycVerifications')
      .where('userId', '==', userId)
      .get();
    
    records.push(...kycDocs.docs.map(d => d.data()));
  }

  // Store export
  await db.collection('kycExports').add({
    incidentId,
    userIds,
    recordCount: records.length,
    exportedAt: admin.firestore.Timestamp.now(),
    data: records
  });
}

/**
 * Update incident status
 */
export const pack388_updateIncidentStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin must be authenticated');
  }

  const { incidentId, status, notes } = data;

  try {
    const incidentRef = db.collection('regulatoryIncidents').doc(incidentId);
    const incidentDoc = await incidentRef.get();

    if (!incidentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Incident not found');
    }

    const updates: any = {
      status,
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: context.auth.uid
    };

    if (status === IncidentStatus.RESOLVED) {
      updates.resolvedAt = admin.firestore.Timestamp.now();
    }

    await incidentRef.update(updates);

    // Log status change
    await db.collection('incidentEvents').add({
      incidentId,
      type: 'STATUS_CHANGE',
      from: incidentDoc.data()?.status,
      to: status,
      notes,
      createdBy: context.auth.uid,
      createdAt: admin.firestore.Timestamp.now()
    });

    return {
      success: true,
      message: 'Incident status updated'
    };

  } catch (error) {
    console.error('Error updating incident status:', error);
    throw error;
  }
});

/**
 * Get jurisdiction compliance requirements
 */
export const pack388_getJurisdictionRequirements = functions.https.onCall(async (data, context) => {
  const { countryCode } = data;

  try {
    const jurisdictionDoc = await db.collection('legalJurisdictions').doc(countryCode).get();

    if (jurisdictionDoc.exists) {
      return {
        success: true,
        requirements: jurisdictionDoc.data()
      };
    }

    // Return default requirements
    return {
      success: true,
      requirements: {
        countryCode: 'DEFAULT',
        regulatoryRegime: 'GENERAL',
        ageLimit: 18,
        dataRetentionDays: 365,
        KYCRequired: false,
        AMLRequired: false,
        contentRestrictions: []
      },
      usingDefault: true
    };

  } catch (error) {
    console.error('Error getting jurisdiction requirements:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get jurisdiction requirements');
  }
});
