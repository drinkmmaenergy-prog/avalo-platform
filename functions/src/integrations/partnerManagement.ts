/**
 * PACK 150: Partner Management Functions
 * Handle partner registration, verification, and profile management
 */

import * as admin from 'firebase-admin';
import { https, logger } from 'firebase-functions';
import { 
  APIPartnerProfile, 
  IntegrationCategory, 
  IntegrationStatus,
  PartnerSecurityAgreement,
  DEFAULT_RATE_LIMITS,
  FORBIDDEN_PATTERNS
} from '../types/integrations';
import * as crypto from 'crypto';

const db = admin.firestore();

/**
 * Register a new partner - requires admin approval
 */
export const registerPartner = https.onCall(async (data, context) => {
  try {
    if (!context.auth?.token.admin) {
      throw new https.HttpsError(
        'permission-denied',
        'Only admins can register partners'
      );
    }

    const {
      companyName,
      companyWebsite,
      contactEmail,
      category,
      purpose
    } = data;

    if (!companyName || !companyWebsite || !contactEmail || !category) {
      throw new https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    // Validate category
    if (!Object.values(IntegrationCategory).includes(category)) {
      throw new https.HttpsError(
        'invalid-argument',
        'Invalid integration category'
      );
    }

    // Check for forbidden patterns in company info
    const companyInfo = `${companyName} ${companyWebsite} ${purpose || ''}`.toLowerCase();
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(companyInfo)) {
        logger.warn('Partner registration rejected - forbidden pattern detected', {
          companyName,
          pattern: pattern.source
        });
        
        throw new https.HttpsError(
          'permission-denied',
          'Integration purpose violates platform policies (NSFW/romantic/external payment features prohibited)'
        );
      }
    }

    // Generate secure API credentials
    const partnerId = db.collection('api_integrations').doc().id;
    const apiKey = `avalo_${crypto.randomBytes(24).toString('hex')}`;
    const apiSecret = crypto.randomBytes(32).toString('hex');

    // Create partner profile
    const partnerProfile: APIPartnerProfile = {
      partnerId,
      companyName,
      companyWebsite,
      contactEmail,
      category,
      status: IntegrationStatus.PENDING,
      
      identityVerified: false,
      securityAgreementSigned: false,
      agreementVersion: '1.0.0',
      
      apiKey,
      apiSecret: crypto.createHash('sha256').update(apiSecret).digest('hex'),
      sandboxMode: true,
      
      rateLimit: DEFAULT_RATE_LIMITS.free,
      
      totalRequests: 0,
      violationCount: 0,
      
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: context.auth.uid
    };

    await db.collection('api_partner_profiles').doc(partnerId).set(partnerProfile);

    logger.info('Partner registered', { partnerId, companyName });

    return {
      success: true,
      partnerId,
      apiKey,
      apiSecret, // Only returned once
      message: 'Partner registered. Identity verification required before activation.'
    };

  } catch (error) {
    logger.error('Error registering partner', error);
    throw error;
  }
});

/**
 * Verify partner identity
 */
export const verifyPartnerIdentity = https.onCall(async (data, context) => {
  try {
    if (!context.auth?.token.admin) {
      throw new https.HttpsError(
        'permission-denied',
        'Only admins can verify partners'
      );
    }

    const { partnerId, verified } = data;

    if (!partnerId || verified === undefined) {
      throw new https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    const partnerRef = db.collection('api_partner_profiles').doc(partnerId);
    const partnerDoc = await partnerRef.get();

    if (!partnerDoc.exists) {
      throw new https.HttpsError('not-found', 'Partner not found');
    }

    await partnerRef.update({
      identityVerified: verified,
      verificationDate: verified ? new Date() : admin.firestore.FieldValue.delete(),
      verifiedBy: verified ? context.auth.uid : admin.firestore.FieldValue.delete(),
      updatedAt: new Date()
    });

    logger.info('Partner identity verification updated', { partnerId, verified });

    return {
      success: true,
      message: verified ? 'Partner verified' : 'Partner verification revoked'
    };

  } catch (error) {
    logger.error('Error verifying partner', error);
    throw error;
  }
});

/**
 * Sign security agreement
 */
export const signSecurityAgreement = https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { partnerId, apiKey } = data;

    if (!partnerId || !apiKey) {
      throw new https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    const partnerRef = db.collection('api_partner_profiles').doc(partnerId);
    const partnerDoc = await partnerRef.get();

    if (!partnerDoc.exists) {
      throw new https.HttpsError('not-found', 'Partner not found');
    }

    const partner = partnerDoc.data() as APIPartnerProfile;

    if (partner.apiKey !== apiKey) {
      throw new https.HttpsError('permission-denied', 'Invalid API key');
    }

    if (!partner.identityVerified) {
      throw new https.HttpsError(
        'failed-precondition',
        'Identity verification required before signing agreement'
      );
    }

    // Get latest security agreement
    const agreementSnapshot = await db
      .collection('partner_security_agreements')
      .orderBy('effectiveDate', 'desc')
      .limit(1)
      .get();

    if (agreementSnapshot.empty) {
      throw new https.HttpsError(
        'not-found',
        'No active security agreement found'
      );
    }

    const agreement = agreementSnapshot.docs[0].data() as PartnerSecurityAgreement;

    await partnerRef.update({
      securityAgreementSigned: true,
      agreementSignedDate: new Date(),
      agreementVersion: agreement.version,
      status: IntegrationStatus.APPROVED,
      updatedAt: new Date()
    });

    logger.info('Security agreement signed', { partnerId });

    return {
      success: true,
      message: 'Security agreement signed. Partner approved for integration.'
    };

  } catch (error) {
    logger.error('Error signing security agreement', error);
    throw error;
  }
});

/**
 * Update partner status
 */
export const updatePartnerStatus = https.onCall(async (data, context) => {
  try {
    if (!context.auth?.token.admin) {
      throw new https.HttpsError(
        'permission-denied',
        'Only admins can update partner status'
      );
    }

    const { partnerId, status, reason } = data;

    if (!partnerId || !status) {
      throw new https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    if (!Object.values(IntegrationStatus).includes(status)) {
      throw new https.HttpsError(
        'invalid-argument',
        'Invalid status'
      );
    }

    const partnerRef = db.collection('api_partner_profiles').doc(partnerId);
    const partnerDoc = await partnerRef.get();

    if (!partnerDoc.exists) {
      throw new https.HttpsError('not-found', 'Partner not found');
    }

    const updateData: Partial<APIPartnerProfile> = {
      status,
      updatedAt: new Date()
    };

    // If banning, revoke all active integrations
    if (status === IntegrationStatus.BANNED) {
      const integrationsSnapshot = await db
        .collection('api_integrations')
        .where('partnerId', '==', partnerId)
        .where('status', '==', IntegrationStatus.ACTIVE)
        .get();

      const batch = db.batch();
      integrationsSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: IntegrationStatus.REVOKED,
          revokedAt: new Date(),
          revocationReason: `Partner banned: ${reason || 'Policy violation'}`,
          updatedAt: new Date()
        });
      });

      await batch.commit();

      logger.warn('Partner banned and integrations revoked', { 
        partnerId, 
        integrationsRevoked: integrationsSnapshot.size 
      });
    }

    await partnerRef.update(updateData);

    logger.info('Partner status updated', { partnerId, status });

    return {
      success: true,
      message: `Partner status updated to ${status}`
    };

  } catch (error) {
    logger.error('Error updating partner status', error);
    throw error;
  }
});

/**
 * Get partner profile
 */
export const getPartnerProfile = https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { partnerId, apiKey } = data;

    if (!partnerId) {
      throw new https.HttpsError(
        'invalid-argument',
        'Partner ID required'
      );
    }

    const partnerDoc = await db
      .collection('api_partner_profiles')
      .doc(partnerId)
      .get();

    if (!partnerDoc.exists) {
      throw new https.HttpsError('not-found', 'Partner not found');
    }

    const partner = partnerDoc.data() as APIPartnerProfile;

    // Verify API key if provided
    if (apiKey && partner.apiKey !== apiKey) {
      throw new https.HttpsError('permission-denied', 'Invalid API key');
    }

    // Remove sensitive data
    const { apiSecret, ...safeProfile } = partner;

    return {
      success: true,
      profile: safeProfile
    };

  } catch (error) {
    logger.error('Error getting partner profile', error);
    throw error;
  }
});

/**
 * Update rate limits
 */
export const updateRateLimits = https.onCall(async (data, context) => {
  try {
    if (!context.auth?.token.admin) {
      throw new https.HttpsError(
        'permission-denied',
        'Only admins can update rate limits'
      );
    }

    const { partnerId, rateLimit } = data;

    if (!partnerId || !rateLimit) {
      throw new https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    const { requestsPerMinute, requestsPerHour, requestsPerDay } = rateLimit;

    if (!requestsPerMinute || !requestsPerHour || !requestsPerDay) {
      throw new https.HttpsError(
        'invalid-argument',
        'Incomplete rate limit configuration'
      );
    }

    await db.collection('api_partner_profiles').doc(partnerId).update({
      rateLimit: {
        requestsPerMinute,
        requestsPerHour,
        requestsPerDay
      },
      updatedAt: new Date()
    });

    logger.info('Rate limits updated', { partnerId, rateLimit });

    return {
      success: true,
      message: 'Rate limits updated'
    };

  } catch (error) {
    logger.error('Error updating rate limits', error);
    throw error;
  }
});

/**
 * List partners (admin only)
 */
export const listPartners = https.onCall(async (data, context) => {
  try {
    if (!context.auth?.token.admin) {
      throw new https.HttpsError(
        'permission-denied',
        'Only admins can list partners'
      );
    }

    const { status, category, limit = 50 } = data;

    let query = db.collection('api_partner_profiles').orderBy('createdAt', 'desc');

    if (status) {
      query = query.where('status', '==', status) as any;
    }

    if (category) {
      query = query.where('category', '==', category) as any;
    }

    const snapshot = await query.limit(limit).get();

    const partners = snapshot.docs.map(doc => {
      const data = doc.data() as APIPartnerProfile;
      const { apiSecret, ...safeData } = data;
      return safeData;
    });

    return {
      success: true,
      partners,
      count: partners.length
    };

  } catch (error) {
    logger.error('Error listing partners', error);
    throw error;
  }
});

/**
 * Rotate API credentials
 */
export const rotateAPICredentials = https.onCall(async (data, context) => {
  try {
    if (!context.auth?.token.admin) {
      throw new https.HttpsError(
        'permission-denied',
        'Only admins can rotate credentials'
      );
    }

    const { partnerId } = data;

    if (!partnerId) {
      throw new https.HttpsError(
        'invalid-argument',
        'Partner ID required'
      );
    }

    const partnerRef = db.collection('api_partner_profiles').doc(partnerId);
    const partnerDoc = await partnerRef.get();

    if (!partnerDoc.exists) {
      throw new https.HttpsError('not-found', 'Partner not found');
    }

    const newApiKey = `avalo_${crypto.randomBytes(24).toString('hex')}`;
    const newApiSecret = crypto.randomBytes(32).toString('hex');

    await partnerRef.update({
      apiKey: newApiKey,
      apiSecret: crypto.createHash('sha256').update(newApiSecret).digest('hex'),
      updatedAt: new Date()
    });

    logger.info('API credentials rotated', { partnerId });

    return {
      success: true,
      apiKey: newApiKey,
      apiSecret: newApiSecret, // Only returned once
      message: 'API credentials rotated successfully'
    };

  } catch (error) {
    logger.error('Error rotating credentials', error);
    throw error;
  }
});