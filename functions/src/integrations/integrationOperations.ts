/**
 * PACK 150: Integration Operations Functions
 * Handle integration requests, permissions, and consent management
 */

import * as admin from 'firebase-admin';
import { https, logger } from 'firebase-functions';
import {
  APIIntegration,
  IntegrationRequest,
  IntegrationConsent,
  DataPermissionType,
  IntegrationStatus,
  APPROVED_DATA_TYPES,
  FORBIDDEN_DATA_TYPES,
  CONSENT_REFRESH_MS
} from '../types/integrations';

const db = admin.firestore();

/**
 * Request integration permission from creator
 */
export const requestIntegrationPermission = https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required');
    }

    const {
      partnerId,
      apiKey,
      creatorId,
      integrationName,
      purpose,
      requestedPermissions
    } = data;

    if (!partnerId || !apiKey || !creatorId || !integrationName || !requestedPermissions) {
      throw new https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    // Verify partner
    const partnerDoc = await db.collection('api_partner_profiles').doc(partnerId).get();
    
    if (!partnerDoc.exists) {
      throw new https.HttpsError('not-found', 'Partner not found');
    }

    const partner = partnerDoc.data();
    
    if (partner?.apiKey !== apiKey) {
      throw new https.HttpsError('permission-denied', 'Invalid API key');
    }

    if (partner?.status !== IntegrationStatus.APPROVED && 
        partner?.status !== IntegrationStatus.ACTIVE) {
      throw new https.HttpsError(
        'failed-precondition',
        'Partner not approved for integrations'
      );
    }

    // Validate permissions
    const invalidPermissions = requestedPermissions.filter(
      (perm: DataPermissionType) => !APPROVED_DATA_TYPES.includes(perm)
    );

    if (invalidPermissions.length > 0) {
      logger.warn('Invalid permissions requested', {
        partnerId,
        invalidPermissions
      });
      
      throw new https.HttpsError(
        'invalid-argument',
        `Forbidden permissions requested: ${invalidPermissions.join(', ')}`
      );
    }

    // Check for forbidden data types
    const forbiddenRequested = requestedPermissions.filter(
      (perm: DataPermissionType) => FORBIDDEN_DATA_TYPES.includes(perm)
    );

    if (forbiddenRequested.length > 0) {
      logger.error('Forbidden data types requested', {
        partnerId,
        forbiddenRequested
      });
      
      throw new https.HttpsError(
        'permission-denied',
        'Cannot request access to restricted data types'
      );
    }

    // Create integration request
    const requestId = db.collection('integration_requests').doc().id;
    
    const integrationRequest: IntegrationRequest = {
      requestId,
      partnerId,
      creatorId,
      integrationName,
      category: partner?.category,
      purpose: purpose || '',
      requestedPermissions,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('integration_requests').doc(requestId).set(integrationRequest);

    logger.info('Integration permission requested', {
      requestId,
      partnerId,
      creatorId
    });

    return {
      success: true,
      requestId,
      message: 'Integration request submitted. Awaiting creator approval.'
    };

  } catch (error) {
    logger.error('Error requesting integration permission', error);
    throw error;
  }
});

/**
 * Approve integration request (creator only)
 */
export const approveIntegrationRequest = https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { requestId } = data;

    if (!requestId) {
      throw new https.HttpsError('invalid-argument', 'Request ID required');
    }

    const requestRef = db.collection('integration_requests').doc(requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      throw new https.HttpsError('not-found', 'Request not found');
    }

    const request = requestDoc.data() as IntegrationRequest;

    if (request.creatorId !== context.auth.uid) {
      throw new https.HttpsError(
        'permission-denied',
        'Only the creator can approve this request'
      );
    }

    if (request.status !== 'pending') {
      throw new https.HttpsError(
        'failed-precondition',
        'Request already processed'
      );
    }

    // Create integration
    const integrationId = db.collection('api_integrations').doc().id;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CONSENT_REFRESH_MS);

    const integration: APIIntegration = {
      integrationId,
      partnerId: request.partnerId,
      creatorId: request.creatorId,
      integrationName: request.integrationName,
      description: request.purpose,
      category: request.category,
      requestedPermissions: request.requestedPermissions,
      approvedPermissions: request.requestedPermissions,
      consentGrantedAt: now,
      consentExpiresAt: expiresAt,
      autoRenew: false,
      status: IntegrationStatus.ACTIVE,
      activatedAt: now,
      createdAt: now,
      updatedAt: now
    };

    // Create consent record
    const consentId = db.collection('integration_consents').doc().id;
    const consent: IntegrationConsent = {
      consentId,
      integrationId,
      creatorId: request.creatorId,
      permissions: request.requestedPermissions,
      grantedAt: now,
      expiresAt,
      renewalDue: expiresAt,
      renewalHistory: [],
      revoked: false
    };

    // Update request and create integration
    await db.runTransaction(async (transaction) => {
      transaction.update(requestRef, {
        status: 'approved',
        reviewedAt: now,
        reviewedBy: context.auth!.uid,
        updatedAt: now
      });

      transaction.set(
        db.collection('api_integrations').doc(integrationId),
        integration
      );

      transaction.set(
        db.collection('integration_consents').doc(consentId),
        consent
      );
    });

    logger.info('Integration approved', {
      integrationId,
      partnerId: request.partnerId,
      creatorId: request.creatorId
    });

    return {
      success: true,
      integrationId,
      message: 'Integration approved and activated'
    };

  } catch (error) {
    logger.error('Error approving integration', error);
    throw error;
  }
});

/**
 * Deny integration request
 */
export const denyIntegrationRequest = https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { requestId, reason } = data;

    if (!requestId) {
      throw new https.HttpsError('invalid-argument', 'Request ID required');
    }

    const requestRef = db.collection('integration_requests').doc(requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      throw new https.HttpsError('not-found', 'Request not found');
    }

    const request = requestDoc.data() as IntegrationRequest;

    if (request.creatorId !== context.auth.uid) {
      throw new https.HttpsError(
        'permission-denied',
        'Only the creator can deny this request'
      );
    }

    if (request.status !== 'pending') {
      throw new https.HttpsError(
        'failed-precondition',
        'Request already processed'
      );
    }

    await requestRef.update({
      status: 'denied',
      reviewedAt: new Date(),
      reviewedBy: context.auth.uid,
      denialReason: reason || 'No reason provided',
      updatedAt: new Date()
    });

    logger.info('Integration request denied', {
      requestId,
      partnerId: request.partnerId,
      creatorId: request.creatorId
    });

    return {
      success: true,
      message: 'Integration request denied'
    };

  } catch (error) {
    logger.error('Error denying integration', error);
    throw error;
  }
});

/**
 * Revoke integration permission
 */
export const revokeIntegrationPermission = https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { integrationId, reason } = data;

    if (!integrationId) {
      throw new https.HttpsError('invalid-argument', 'Integration ID required');
    }

    const integrationRef = db.collection('api_integrations').doc(integrationId);
    const integrationDoc = await integrationRef.get();

    if (!integrationDoc.exists) {
      throw new https.HttpsError('not-found', 'Integration not found');
    }

    const integration = integrationDoc.data() as APIIntegration;

    if (integration.creatorId !== context.auth.uid && !context.auth.token.admin) {
      throw new https.HttpsError(
        'permission-denied',
        'Only the creator or admin can revoke this integration'
      );
    }

    const now = new Date();

    // Update integration
    await integrationRef.update({
      status: IntegrationStatus.REVOKED,
      revokedAt: now,
      revocationReason: reason || 'Revoked by creator',
      updatedAt: now
    });

    // Revoke consent
    const consentSnapshot = await db
      .collection('integration_consents')
      .where('integrationId', '==', integrationId)
      .where('revoked', '==', false)
      .get();

    if (!consentSnapshot.empty) {
      const batch = db.batch();
      consentSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          revoked: true,
          revokedAt: now,
          revocationReason: reason || 'Revoked by creator'
        });
      });
      await batch.commit();
    }

    logger.info('Integration revoked', {
      integrationId,
      partnerId: integration.partnerId,
      creatorId: integration.creatorId
    });

    return {
      success: true,
      message: 'Integration revoked successfully'
    };

  } catch (error) {
    logger.error('Error revoking integration', error);
    throw error;
  }
});

/**
 * Renew integration consent
 */
export const renewIntegrationConsent = https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { integrationId } = data;

    if (!integrationId) {
      throw new https.HttpsError('invalid-argument', 'Integration ID required');
    }

    const integrationRef = db.collection('api_integrations').doc(integrationId);
    const integrationDoc = await integrationRef.get();

    if (!integrationDoc.exists) {
      throw new https.HttpsError('not-found', 'Integration not found');
    }

    const integration = integrationDoc.data() as APIIntegration;

    if (integration.creatorId !== context.auth.uid) {
      throw new https.HttpsError(
        'permission-denied',
        'Only the creator can renew consent'
      );
    }

    if (integration.status !== IntegrationStatus.ACTIVE) {
      throw new https.HttpsError(
        'failed-precondition',
        'Integration is not active'
      );
    }

    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + CONSENT_REFRESH_MS);

    // Update integration
    await integrationRef.update({
      consentRenewedAt: now,
      consentExpiresAt: newExpiresAt,
      updatedAt: now
    });

    // Update consent
    const consentSnapshot = await db
      .collection('integration_consents')
      .where('integrationId', '==', integrationId)
      .where('revoked', '==', false)
      .limit(1)
      .get();

    if (!consentSnapshot.empty) {
      const consentDoc = consentSnapshot.docs[0];
      const consent = consentDoc.data() as IntegrationConsent;
      
      await consentDoc.ref.update({
        renewalHistory: admin.firestore.FieldValue.arrayUnion({
          renewedAt: now,
          expiresAt: newExpiresAt
        }),
        expiresAt: newExpiresAt,
        renewalDue: newExpiresAt
      });
    }

    logger.info('Integration consent renewed', {
      integrationId,
      partnerId: integration.partnerId,
      creatorId: integration.creatorId
    });

    return {
      success: true,
      expiresAt: newExpiresAt,
      message: 'Consent renewed for 90 days'
    };

  } catch (error) {
    logger.error('Error renewing consent', error);
    throw error;
  }
});

/**
 * List creator integrations
 */
export const listCreatorIntegrations = https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { creatorId, status } = data;
    const queryCreatorId = creatorId || context.auth.uid;

    if (queryCreatorId !== context.auth.uid && !context.auth.token.admin) {
      throw new https.HttpsError(
        'permission-denied',
        'Cannot list integrations for other users'
      );
    }

    let query = db
      .collection('api_integrations')
      .where('creatorId', '==', queryCreatorId)
      .orderBy('createdAt', 'desc');

    if (status) {
      query = query.where('status', '==', status) as any;
    }

    const snapshot = await query.get();

    const integrations = snapshot.docs.map(doc => doc.data());

    return {
      success: true,
      integrations,
      count: integrations.length
    };

  } catch (error) {
    logger.error('Error listing integrations', error);
    throw error;
  }
});

/**
 * Get integration details
 */
export const getIntegrationDetails = https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { integrationId } = data;

    if (!integrationId) {
      throw new https.HttpsError('invalid-argument', 'Integration ID required');
    }

    const integrationDoc = await db
      .collection('api_integrations')
      .doc(integrationId)
      .get();

    if (!integrationDoc.exists) {
      throw new https.HttpsError('not-found', 'Integration not found');
    }

    const integration = integrationDoc.data() as APIIntegration;

    if (integration.creatorId !== context.auth.uid && !context.auth.token.admin) {
      throw new https.HttpsError(
        'permission-denied',
        'Cannot view this integration'
      );
    }

    // Get partner info
    const partnerDoc = await db
      .collection('api_partner_profiles')
      .doc(integration.partnerId)
      .get();

    const partner = partnerDoc.exists ? partnerDoc.data() : null;

    return {
      success: true,
      integration,
      partner: partner ? {
        companyName: partner.companyName,
        category: partner.category,
        website: partner.companyWebsite
      } : null
    };

  } catch (error) {
    logger.error('Error getting integration details', error);
    throw error;
  }
});

/**
 * Update auto-renew setting
 */
export const updateAutoRenew = https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required');
    }

    const { integrationId, autoRenew } = data;

    if (!integrationId || autoRenew === undefined) {
      throw new https.HttpsError('invalid-argument', 'Missing required fields');
    }

    const integrationRef = db.collection('api_integrations').doc(integrationId);
    const integrationDoc = await integrationRef.get();

    if (!integrationDoc.exists) {
      throw new https.HttpsError('not-found', 'Integration not found');
    }

    const integration = integrationDoc.data() as APIIntegration;

    if (integration.creatorId !== context.auth.uid) {
      throw new https.HttpsError(
        'permission-denied',
        'Only the creator can update auto-renew'
      );
    }

    await integrationRef.update({
      autoRenew,
      updatedAt: new Date()
    });

    logger.info('Auto-renew updated', { integrationId, autoRenew });

    return {
      success: true,
      message: `Auto-renew ${autoRenew ? 'enabled' : 'disabled'}`
    };

  } catch (error) {
    logger.error('Error updating auto-renew', error);
    throw error;
  }
});