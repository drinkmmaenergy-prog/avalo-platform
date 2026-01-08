/**
 * PACK 445 – Enterprise Readiness & Due Diligence Toolkit
 * Cloud Functions for Data Room Generation and External Access
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { DueDiligenceDataRoomService } from '../services/pack445-due-diligence/DueDiligenceDataRoomService';
import { EnterpriseReadinessScorer } from '../services/pack445-due-diligence/EnterpriseReadinessScorer';
import { AuditEvidenceAssembler } from '../services/pack445-due-diligence/AuditEvidenceAssembler';
import { InvestorKPICanonicalView } from '../services/pack445-due-diligence/InvestorKPICanonicalView';
import { ExternalAccessController } from '../services/pack445-due-diligence/ExternalAccessController';

/**
 * Generate a due diligence data room
 * Admin only
 */
export const generateDataRoom = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB' })
  .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Verify admin role
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Must be an admin');
    }

    try {
      const {
        packageType,
        validityDays,
        includeSections,
        exportFormats
      } = data;

      if (!packageType || !['investor', 'auditor', 'enterprise_partner'].includes(packageType)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid packageType');
      }

      const dataRoomService = new DueDiligenceDataRoomService();
      const dataRoom = await dataRoomService.generateDataRoom(
        packageType,
        context.auth.uid,
        {
          validityDays,
          includeSections,
          exportFormats
        }
      );

      return {
        success: true,
        dataRoom: {
          id: dataRoom.id,
          accessToken: dataRoom.accessToken,
          expiresAt: dataRoom.expiresAt,
          exports: dataRoom.exports
        }
      };
    } catch (error: any) {
      console.error('Error generating data room:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Calculate enterprise readiness score
 * Admin, CFO, CTO only
 */
export const calculateReadinessScore = functions
  .runWith({ timeoutSeconds: 180, memory: '1GB' })
  .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Verify role
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    const role = userDoc.data()?.role;
    if (!['admin', 'cfo', 'cto'].includes(role)) {
      throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
    }

    try {
      const scorer = new EnterpriseReadinessScorer();
      const score = await scorer.calculateReadinessScore();

      return {
        success: true,
        score
      };
    } catch (error: any) {
      console.error('Error calculating readiness score:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Assemble audit evidence package
 * Admin only
 */
export const assembleAuditEvidence = functions
  .runWith({ timeoutSeconds: 300, memory: '2GB' })
  .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Verify admin role
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Must be an admin');
    }

    try {
      const { startDate, endDate, categories, purpose } = data;

      if (!startDate || !endDate) {
        throw new functions.https.HttpsError('invalid-argument', 'Start and end dates required');
      }

      const period = {
        start: new Date(startDate),
        end: new Date(endDate)
      };

      const assembler = new AuditEvidenceAssembler();
      const evidence = await assembler.assembleEvidencePackage(
        period,
        categories,
        purpose
      );

      return {
        success: true,
        evidence: {
          id: evidence.id,
          timestamp: evidence.timestamp,
          period: evidence.period
        }
      };
    } catch (error: any) {
      console.error('Error assembling audit evidence:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Get canonical KPIs
 * Admin, CFO only
 */
export const getCanonicalKPIs = functions
  .runWith({ timeoutSeconds: 120, memory: '1GB' })
  .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Verify role
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    const role = userDoc.data()?.role;
    if (!['admin', 'cfo'].includes(role)) {
      throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
    }

    try {
      const { startDate, endDate } = data;

      let period: { start: Date; end: Date } | undefined;
      if (startDate && endDate) {
        period = {
          start: new Date(startDate),
          end: new Date(endDate)
        };
      }

      const kpiView = new InvestorKPICanonicalView();
      const kpis = await kpiView.getCanonicalKPIs(period);

      return {
        success: true,
        kpis
      };
    } catch (error: any) {
      console.error('Error getting canonical KPIs:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Create external access grant
 * Admin only
 */
export const createExternalAccess = functions
  .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Verify admin role
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Must be an admin');
    }

    try {
      const {
        entityName,
        contactEmail,
        role,
        purpose,
        requestedPermissions,
        requestedDuration,
        ndaSigned,
        ndaDocument
      } = data;

      if (!entityName || !contactEmail || !role || !purpose) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
      }

      const controller = new ExternalAccessController();
      const access = await controller.createAccess(
        {
          entityName,
          contactEmail,
          role,
          purpose,
          requestedPermissions: requestedPermissions || [],
          requestedDuration: requestedDuration || 30,
          ndaSigned: ndaSigned || false,
          ndaDocument
        },
        context.auth.uid
      );

      return {
        success: true,
        access: {
          id: access.id,
          token: access.token, // Return raw token to user
          expiresAt: access.expiresAt,
          permissions: access.permissions
        }
      };
    } catch (error: any) {
      console.error('Error creating external access:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Verify external access token
 * Public endpoint (verified by token)
 */
export const verifyExternalAccess = functions
  .https.onCall(async (data, context) => {
    try {
      const { token, resource, action, ipAddress, userAgent } = data;

      if (!token || !resource) {
        throw new functions.https.HttpsError('invalid-argument', 'Token and resource required');
      }

      const controller = new ExternalAccessController();
      const result = await controller.verifyAccess(
        token,
        resource,
        action || 'read',
        {
          ipAddress: ipAddress || context.rawRequest.ip,
          userAgent: userAgent || context.rawRequest.headers['user-agent']
        }
      );

      return {
        allowed: result.allowed,
        reason: result.reason
      };
    } catch (error: any) {
      console.error('Error verifying external access:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Revoke external access
 * Admin only
 */
export const revokeExternalAccess = functions
  .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Verify admin role
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Must be an admin');
    }

    try {
      const { accessId, reason } = data;

      if (!accessId) {
        throw new functions.https.HttpsError('invalid-argument', 'accessId required');
      }

      const controller = new ExternalAccessController();
      await controller.revokeAccess(accessId, context.auth.uid, reason);

      return {
        success: true
      };
    } catch (error: any) {
      console.error('Error revoking external access:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Extend external access expiration
 * Admin only
 */
export const extendExternalAccess = functions
  .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Verify admin role
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Must be an admin');
    }

    try {
      const { accessId, additionalDays } = data;

      if (!accessId || !additionalDays) {
        throw new functions.https.HttpsError('invalid-argument', 'accessId and additionalDays required');
      }

      const controller = new ExternalAccessController();
      const newExpiresAt = await controller.extendAccess(
        accessId,
        additionalDays,
        context.auth.uid
      );

      return {
        success: true,
        newExpiresAt
      };
    } catch (error: any) {
      console.error('Error extending external access:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * List active external access grants
 * Admin only
 */
export const listExternalAccess = functions
  .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // Verify admin role
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Must be an admin');
    }

    try {
      const { role } = data;

      const controller = new ExternalAccessController();
      const accessList = await controller.listActiveAccess(role);

      // Strip out tokens before returning
      const sanitizedList = accessList.map(access => ({
        ...access,
        token: undefined // Don't return tokens in list
      }));

      return {
        success: true,
        accessList: sanitizedList
      };
    } catch (error: any) {
      console.error('Error listing external access:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });

/**
 * Scheduled function to calculate readiness score weekly
 */
export const scheduledReadinessScore = functions
  .pubsub.schedule('every sunday 00:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      const scorer = new EnterpriseReadinessScorer();
      const score = await scorer.calculateReadinessScore();

      console.log('Weekly readiness score calculated:', score.overall);

      // Optionally send notification if score drops below threshold
      if (score.overall < 80) {
        // Send alert to admins
        console.warn('⚠️ Readiness score below threshold:', score.overall);
      }

      return null;
    } catch (error: any) {
      console.error('Error in scheduled readiness score:', error);
      return null;
    }
  });

/**
 * Scheduled function to expire old data rooms
 */
export const cleanupExpiredDataRooms = functions
  .pubsub.schedule('every day 02:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      const now = new Date();
      const expiredSnapshot = await admin.firestore()
        .collection('dueDiligenceDataRooms')
        .where('expiresAt', '<', now)
        .where('status', '==', 'ready')
        .get();

      const batch = admin.firestore().batch();
      expiredSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { status: 'expired' });
      });

      await batch.commit();

      console.log(`Expired ${expiredSnapshot.size} data rooms`);

      return null;
    } catch (error: any) {
      console.error('Error cleaning up expired data rooms:', error);
      return null;
    }
  });

/**
 * Scheduled function to expire old external access grants
 */
export const cleanupExpiredAccess = functions
  .pubsub.schedule('every day 03:00')
  .timeZone('UTC')
  .onRun(async (context) => {
    try {
      const now = new Date();
      const expiredSnapshot = await admin.firestore()
        .collection('externalAccess')
        .where('expiresAt', '<', now)
        .where('status', '==', 'active')
        .get();

      const batch = admin.firestore().batch();
      expiredSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { status: 'expired', statusChangedAt: now });
      });

      await batch.commit();

      console.log(`Expired ${expiredSnapshot.size} external access grants`);

      return null;
    } catch (error: any) {
      console.error('Error cleaning up expired access:', error);
      return null;
    }
  });
