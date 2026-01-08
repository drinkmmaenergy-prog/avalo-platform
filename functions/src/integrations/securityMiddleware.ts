/**
 * PACK 150: Security Middleware & Validators
 * Block forbidden integrations, detect violations, and enforce policies
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import {
  IntegrationRiskCase,
  ViolationType,
  FORBIDDEN_PATTERNS,
  FORBIDDEN_DATA_TYPES,
  DataPermissionType,
  IntegrationStatus,
  CONSENT_REFRESH_MS
} from '../types/integrations';

const db = admin.firestore();

/**
 * Validate partner registration for forbidden patterns
 */
export async function validatePartnerRegistration(
  companyName: string,
  companyWebsite: string,
  purpose: string
): Promise<{ valid: boolean; reason?: string }> {
  const combinedText = `${companyName} ${companyWebsite} ${purpose}`.toLowerCase();

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(combinedText)) {
      logger.warn('Partner registration blocked - forbidden pattern', {
        companyName,
        pattern: pattern.source
      });

      await createRiskCase(
        'pending',
        undefined,
        ViolationType.NSFW_FUNNEL,
        'critical',
        `Attempted registration with forbidden pattern: ${pattern.source}`,
        [companyName, companyWebsite, purpose]
      );

      return {
        valid: false,
        reason: 'Integration violates platform policies (NSFW/romantic/external payment features prohibited)'
      };
    }
  }

  // Check for suspicious keywords
  const suspiciousKeywords = [
    'date',
    'match',
    'companion',
    'intimate',
    'private show',
    'premium content',
    'adult',
    'explicit',
    'paypal sync',
    'venmo',
    'crypto payment',
    'contact export',
    'email scrape',
    'dm automation',
    'message bot'
  ];

  for (const keyword of suspiciousKeywords) {
    if (combinedText.includes(keyword)) {
      logger.warn('Suspicious keyword detected in registration', {
        companyName,
        keyword
      });

      await createRiskCase(
        'pending',
        undefined,
        ViolationType.TERMS_BREACH,
        'high',
        `Suspicious keyword detected: ${keyword}`,
        [companyName, companyWebsite, purpose]
      );

      return {
        valid: false,
        reason: `Suspicious keyword detected: "${keyword}". Please provide more details about integration purpose.`
      };
    }
  }

  return { valid: true };
}

/**
 * Validate data permission request
 */
export async function validateDataPermissionRequest(
  partnerId: string,
  requestedPermissions: DataPermissionType[]
): Promise<{ valid: boolean; forbiddenPermissions?: DataPermissionType[] }> {
  const forbiddenRequested = requestedPermissions.filter(perm =>
    FORBIDDEN_DATA_TYPES.includes(perm)
  );

  if (forbiddenRequested.length > 0) {
    logger.error('Forbidden data types requested', {
      partnerId,
      forbiddenRequested
    });

    await createRiskCase(
      partnerId,
      undefined,
      ViolationType.RESTRICTED_DATA_ACCESS,
      'critical',
      'Attempted to request forbidden data types',
      forbiddenRequested.map(p => p.toString())
    );

    return {
      valid: false,
      forbiddenPermissions: forbiddenRequested
    };
  }

  return { valid: true };
}

/**
 * Check for identity export attempts
 */
export async function detectIdentityExport(
  partnerId: string,
  integrationId: string,
  dataType: DataPermissionType,
  requestedFields?: string[]
): Promise<boolean> {
  const identityFields = [
    'email',
    'phone',
    'phoneNumber',
    'fullName',
    'firstName',
    'lastName',
    'address',
    'userId',
    'username',
    'contactInfo',
    'personalDetails'
  ];

  if (!requestedFields) {
    return false;
  }

  const containsIdentity = requestedFields.some(field =>
    identityFields.some(identityField =>
      field.toLowerCase().includes(identityField.toLowerCase())
    )
  );

  if (containsIdentity) {
    logger.error('Identity export attempt detected', {
      partnerId,
      integrationId,
      requestedFields
    });

    await createRiskCase(
      partnerId,
      integrationId,
      ViolationType.IDENTITY_EXPORT,
      'critical',
      'Attempted to export user identity information',
      requestedFields
    );

    return true;
  }

  return false;
}

/**
 * Check for external payment routing attempts
 */
export async function detectExternalPaymentRouting(
  partnerId: string,
  integrationId: string,
  webhookUrl?: string,
  description?: string
): Promise<boolean> {
  if (!webhookUrl && !description) {
    return false;
  }

  const paymentPatterns = [
    /paypal/i,
    /venmo/i,
    /cashapp/i,
    /zelle/i,
    /stripe/i,
    /square/i,
    /crypto/i,
    /bitcoin/i,
    /ethereum/i,
    /payment\.gateway/i,
    /checkout\.com/i,
    /payment\.processing/i
  ];

  const textToCheck = `${webhookUrl || ''} ${description || ''}`;

  for (const pattern of paymentPatterns) {
    if (pattern.test(textToCheck)) {
      logger.error('External payment routing detected', {
        partnerId,
        integrationId,
        pattern: pattern.source
      });

      await createRiskCase(
        partnerId,
        integrationId,
        ViolationType.EXTERNAL_PAYMENT_LINK,
        'critical',
        `External payment routing attempt: ${pattern.source}`,
        [webhookUrl || '', description || '']
      );

      return true;
    }
  }

  return false;
}

/**
 * Check for messaging overlay attempts
 */
export async function detectMessagingOverlay(
  partnerId: string,
  integrationId: string,
  requestedPermissions: DataPermissionType[]
): Promise<boolean> {
  const messagingPermissions = [
    DataPermissionType.CHAT_LOGS,
    DataPermissionType.CALL_LOGS
  ];

  const hasMessagingPermission = requestedPermissions.some(perm =>
    messagingPermissions.includes(perm)
  );

  if (hasMessagingPermission) {
    logger.error('Messaging overlay attempt detected', {
      partnerId,
      integrationId,
      requestedPermissions
    });

    await createRiskCase(
      partnerId,
      integrationId,
      ViolationType.MESSAGING_OVERLAY,
      'critical',
      'Attempted to request messaging access (prohibited)',
      requestedPermissions.map(p => p.toString())
    );

    return true;
  }

  return false;
}

/**
 * Enforce consent refresh (90 days)
 */
export async function enforceConsentRefresh(): Promise<void> {
  const now = new Date();
  
  const expiredIntegrations = await db
    .collection('api_integrations')
    .where('status', '==', IntegrationStatus.ACTIVE)
    .where('consentExpiresAt', '<=', now)
    .get();

  if (expiredIntegrations.empty) {
    return;
  }

  logger.info('Enforcing consent refresh', {
    expiredCount: expiredIntegrations.size
  });

  const batch = db.batch();

  for (const doc of expiredIntegrations.docs) {
    const integration = doc.data();

    if (integration.autoRenew) {
      const newExpiresAt = new Date(now.getTime() + CONSENT_REFRESH_MS);
      
      batch.update(doc.ref, {
        consentRenewedAt: now,
        consentExpiresAt: newExpiresAt,
        updatedAt: now
      });

      logger.info('Auto-renewed consent', {
        integrationId: doc.id,
        partnerId: integration.partnerId,
        creatorId: integration.creatorId
      });
    } else {
      batch.update(doc.ref, {
        status: IntegrationStatus.SUSPENDED,
        suspendedAt: now,
        updatedAt: now
      });

      logger.warn('Integration suspended - consent expired', {
        integrationId: doc.id,
        partnerId: integration.partnerId,
        creatorId: integration.creatorId
      });
    }
  }

  await batch.commit();
}

/**
 * Detect anomalous access patterns
 */
export async function detectAnomalousAccess(
  partnerId: string,
  integrationId: string
): Promise<number> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);

  const recentLogs = await db
    .collection('api_access_logs')
    .where('partnerId', '==', partnerId)
    .where('timestamp', '>=', oneHourAgo)
    .get();

  let anomalyScore = 0;

  if (recentLogs.size > 100) {
    anomalyScore += 30;
  }

  const failedRequests = recentLogs.docs.filter(
    doc => doc.data().statusCode >= 400
  ).length;

  if (failedRequests > 20) {
    anomalyScore += 40;
  }

  const flaggedRequests = recentLogs.docs.filter(
    doc => doc.data().flaggedForReview
  ).length;

  if (flaggedRequests > 5) {
    anomalyScore += 30;
  }

  if (anomalyScore > 50) {
    logger.warn('Anomalous access pattern detected', {
      partnerId,
      integrationId,
      anomalyScore,
      recentRequests: recentLogs.size,
      failedRequests,
      flaggedRequests
    });

    await createRiskCase(
      partnerId,
      integrationId,
      ViolationType.RATE_LIMIT_EXCEEDED,
      'high',
      'Anomalous access pattern detected',
      [
        `Recent requests: ${recentLogs.size}`,
        `Failed requests: ${failedRequests}`,
        `Flagged requests: ${flaggedRequests}`,
        `Anomaly score: ${anomalyScore}`
      ]
    );
  }

  return anomalyScore;
}

/**
 * Check for data scraping attempts
 */
export async function detectDataScraping(
  partnerId: string,
  integrationId: string
): Promise<boolean> {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 300000);

  const recentLogs = await db
    .collection('api_access_logs')
    .where('partnerId', '==', partnerId)
    .where('integrationId', '==', integrationId)
    .where('timestamp', '>=', fiveMinutesAgo)
    .get();

  if (recentLogs.size > 50) {
    const dataTypes = new Set<string>();
    recentLogs.docs.forEach(doc => {
      const log = doc.data();
      log.requestedData?.forEach((dt: string) => dataTypes.add(dt));
    });

    if (dataTypes.size > 5) {
      logger.error('Data scraping attempt detected', {
        partnerId,
        integrationId,
        requestCount: recentLogs.size,
        dataTypesAccessed: Array.from(dataTypes)
      });

      await createRiskCase(
        partnerId,
        integrationId,
        ViolationType.DATA_SCRAPING,
        'critical',
        'Excessive data access across multiple types',
        [
          `Requests in 5min: ${recentLogs.size}`,
          `Data types: ${Array.from(dataTypes).join(', ')}`
        ]
      );

      return true;
    }
  }

  return false;
}

/**
 * Validate integration is allowed to access data
 */
export async function validateIntegrationAccess(
  partnerId: string,
  integrationId: string,
  apiKey: string
): Promise<{ valid: boolean; reason?: string }> {
  const [partnerDoc, integrationDoc] = await Promise.all([
    db.collection('api_partner_profiles').doc(partnerId).get(),
    db.collection('api_integrations').doc(integrationId).get()
  ]);

  if (!partnerDoc.exists) {
    return { valid: false, reason: 'Partner not found' };
  }

  const partner = partnerDoc.data();

  if (partner?.apiKey !== apiKey) {
    logger.warn('Invalid API key attempt', { partnerId });
    return { valid: false, reason: 'Invalid API key' };
  }

  if (partner?.status === IntegrationStatus.BANNED) {
    return { valid: false, reason: 'Partner has been banned' };
  }

  if (partner?.status === IntegrationStatus.SUSPENDED) {
    return { valid: false, reason: 'Partner access is suspended' };
  }

  if (!integrationDoc.exists) {
    return { valid: false, reason: 'Integration not found' };
  }

  const integration = integrationDoc.data();

  if (integration?.status !== IntegrationStatus.ACTIVE) {
    return { valid: false, reason: 'Integration is not active' };
  }

  const now = new Date();
  const consentExpires = integration?.consentExpiresAt 
    ? new Date(integration.consentExpiresAt) 
    : null;

  if (consentExpires && consentExpires < now) {
    return { valid: false, reason: 'Consent has expired - renewal required' };
  }

  return { valid: true };
}

/**
 * Create risk case for violations
 */
async function createRiskCase(
  partnerId: string,
  integrationId: string | undefined,
  violationType: ViolationType,
  severity: 'low' | 'medium' | 'high' | 'critical',
  description: string,
  evidence: string[]
): Promise<void> {
  const caseId = db.collection('integration_risk_cases').doc().id;

  const riskCase: IntegrationRiskCase = {
    caseId,
    partnerId,
    integrationId,
    violationType,
    severity,
    description,
    evidence,
    detectedAt: new Date(),
    detectedBy: 'automatic',
    detectionMethod: 'security_middleware',
    actionTaken: severity === 'critical' ? 'suspension' : 'warning',
    actionDate: new Date(),
    actionBy: 'system',
    resolved: false,
    legalReportFiled: severity === 'critical',
    legalReportDate: severity === 'critical' ? new Date() : undefined,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await db.collection('integration_risk_cases').doc(caseId).set(riskCase);

  if (severity === 'critical') {
    await suspendPartner(partnerId, `Critical violation: ${violationType}`);
  }

  logger.warn('Risk case created', {
    caseId,
    partnerId,
    integrationId,
    violationType,
    severity
  });
}

/**
 * Suspend partner for violations
 */
async function suspendPartner(partnerId: string, reason: string): Promise<void> {
  const now = new Date();

  const partnerRef = db.collection('api_partner_profiles').doc(partnerId);
  await partnerRef.update({
    status: IntegrationStatus.SUSPENDED,
    updatedAt: now
  });

  const activeIntegrations = await db
    .collection('api_integrations')
    .where('partnerId', '==', partnerId)
    .where('status', '==', IntegrationStatus.ACTIVE)
    .get();

  if (!activeIntegrations.empty) {
    const batch = db.batch();
    activeIntegrations.docs.forEach(doc => {
      batch.update(doc.ref, {
        status: IntegrationStatus.SUSPENDED,
        suspendedAt: now,
        updatedAt: now
      });
    });
    await batch.commit();
  }

  logger.error('Partner suspended', {
    partnerId,
    reason,
    integrationsAffected: activeIntegrations.size
  });
}

/**
 * Block ranking manipulation attempts
 */
export async function detectRankingManipulation(
  partnerId: string,
  integrationId: string,
  webhookUrl?: string
): Promise<boolean> {
  if (!webhookUrl) {
    return false;
  }

  const rankingPatterns = [
    /rank/i,
    /boost/i,
    /visibility/i,
    /discovery/i,
    /algorithm/i,
    /recommendation/i,
    /featured/i,
    /trending/i
  ];

  for (const pattern of rankingPatterns) {
    if (pattern.test(webhookUrl)) {
      logger.error('Ranking manipulation attempt detected', {
        partnerId,
        integrationId,
        webhookUrl
      });

      await createRiskCase(
        partnerId,
        integrationId,
        ViolationType.RANKING_MANIPULATION,
        'critical',
        'Attempted to influence ranking/visibility',
        [webhookUrl]
      );

      return true;
    }
  }

  return false;
}