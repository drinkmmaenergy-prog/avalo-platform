/**
 * PACK 387: Global PR, Reputation Intelligence & Crisis Response Engine
 * Public Communication Control Layer
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Types
type StatementStatus = 'DRAFT' | 'PENDING_LEGAL' | 'PENDING_EXECUTIVE' | 'APPROVED' | 'PUBLISHED';
type Platform = 'press' | 'X' | 'TikTok' | 'StoreReply' | 'Blog' | 'Email';

interface PublicStatement {
  id?: string;
  incidentId: string;
  platform: Platform;
  status: StatementStatus;
  title: string;
  content: string;
  legalApproval: boolean;
  legalReviewedBy?: string;
  legalReviewedAt?: admin.firestore.Timestamp;
  legalNotes?: string;
  executiveApproval: boolean;
  executiveApprovedBy?: string;
  executiveApprovedAt?: admin.firestore.Timestamp;
  executiveNotes?: string;
  safetyValidation: boolean;
  safetyValidatedBy?: string;
  safetyValidatedAt?: admin.firestore.Timestamp;
  publishedAt?: admin.firestore.Timestamp;
  publishedBy?: string;
  createdBy: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

/**
 * Prepare a public statement draft
 */
export const pack387_preparePublicStatement = functions.https.onCall(
  async (
    data: {
      incidentId: string;
      platform: Platform;
      title: string;
      content: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      // Verify incident exists
      const incidentDoc = await db.collection('prIncidents').doc(data.incidentId).get();
      if (!incidentDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Incident not found');
      }

      const statement: PublicStatement = {
        incidentId: data.incidentId,
        platform: data.platform,
        status: 'DRAFT',
        title: data.title,
        content: data.content,
        legalApproval: false,
        executiveApproval: false,
        safetyValidation: false,
        createdBy: context.auth.uid,
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      };

      const statementRef = await db.collection('publicStatements').add(statement);

      // Log statement creation
      await db.collection('crisisResponseLogs').add({
        incidentId: data.incidentId,
        actionType: 'STATEMENT_DRAFTED',
        performedBy: context.auth.uid,
        timestamp: admin.firestore.Timestamp.now(),
        metadata: { statementId: statementRef.id, platform: data.platform },
      });

      return {
        success: true,
        statementId: statementRef.id,
      };
    } catch (error: any) {
      console.error('Error preparing public statement:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Update statement content (only in DRAFT status)
 */
export const pack387_updateStatement = functions.https.onCall(
  async (
    data: {
      statementId: string;
      title?: string;
      content?: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const statementRef = db.collection('publicStatements').doc(data.statementId);
      const statement = await statementRef.get();

      if (!statement.exists) {
        throw new functions.https.HttpsError('not-found', 'Statement not found');
      }

      const statementData = statement.data() as PublicStatement;

      if (statementData.status !== 'DRAFT') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Can only update statements in DRAFT status'
        );
      }

      const updates: any = {
        updatedAt: admin.firestore.Timestamp.now(),
      };

      if (data.title) updates.title = data.title;
      if (data.content) updates.content = data.content;

      await statementRef.update(updates);

      return { success: true };
    } catch (error: any) {
      console.error('Error updating statement:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Submit statement for legal review
 */
export const pack387_submitForLegalReview = functions.https.onCall(
  async (data: { statementId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const statementRef = db.collection('publicStatements').doc(data.statementId);
      const statement = await statementRef.get();

      if (!statement.exists) {
        throw new functions.https.HttpsError('not-found', 'Statement not found');
      }

      await statementRef.update({
        status: 'PENDING_LEGAL',
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Notify legal team
      const legalUsers = await db.collection('users').where('role', 'in', ['legal', 'admin']).get();

      const notificationPromises = legalUsers.docs.map(user =>
        db.collection('notifications').add({
          userId: user.id,
          type: 'LEGAL_REVIEW_REQUIRED',
          title: 'Public Statement Requires Legal Review',
          message: `Statement "${statement.data()!.title}" needs legal approval`,
          data: { statementId: data.statementId },
          read: false,
          createdAt: admin.firestore.Timestamp.now(),
        })
      );

      await Promise.all(notificationPromises);

      return { success: true };
    } catch (error: any) {
      console.error('Error submitting for legal review:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Legal approval
 */
export const pack387_legalApproveStatement = functions.https.onCall(
  async (
    data: {
      statementId: string;
      approved: boolean;
      notes?: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // TODO: Verify user has legal role

    try {
      const statementRef = db.collection('publicStatements').doc(data.statementId);
      const statement = await statementRef.get();

      if (!statement.exists) {
        throw new functions.https.HttpsError('not-found', 'Statement not found');
      }

      if (data.approved) {
        await statementRef.update({
          legalApproval: true,
          legalReviewedBy: context.auth.uid,
          legalReviewedAt: admin.firestore.Timestamp.now(),
          legalNotes: data.notes,
          status: 'PENDING_EXECUTIVE',
          updatedAt: admin.firestore.Timestamp.now(),
        });

        // Notify executive team
        const executives = await db
          .collection('users')
          .where('role', 'in', ['executive', 'admin'])
          .get();

        const notificationPromises = executives.docs.map(user =>
          db.collection('notifications').add({
            userId: user.id,
            type: 'EXECUTIVE_APPROVAL_REQUIRED',
            title: 'Public Statement Requires Executive Approval',
            message: `Statement "${statement.data()!.title}" cleared legal, needs executive approval`,
            data: { statementId: data.statementId },
            read: false,
            createdAt: admin.firestore.Timestamp.now(),
          })
        );

        await Promise.all(notificationPromises);
      } else {
        // Rejected by legal, return to draft
        await statementRef.update({
          legalApproval: false,
          legalReviewedBy: context.auth.uid,
          legalReviewedAt: admin.firestore.Timestamp.now(),
          legalNotes: data.notes,
          status: 'DRAFT',
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error in legal approval:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Executive approval
 */
export const pack387_executiveApproveStatement = functions.https.onCall(
  async (
    data: {
      statementId: string;
      approved: boolean;
      notes?: string;
    },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    // TODO: Verify user has executive role

    try {
      const statementRef = db.collection('publicStatements').doc(data.statementId);
      const statement = await statementRef.get();

      if (!statement.exists) {
        throw new functions.https.HttpsError('not-found', 'Statement not found');
      }

      const statementData = statement.data() as PublicStatement;

      if (!statementData.legalApproval) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Statement must have legal approval first'
        );
      }

      if (data.approved) {
        await statementRef.update({
          executiveApproval: true,
          executiveApprovedBy: context.auth.uid,
          executiveApprovedAt: admin.firestore.Timestamp.now(),
          executiveNotes: data.notes,
          status: 'APPROVED',
          updatedAt: admin.firestore.Timestamp.now(),
        });
      } else {
        // Rejected, return to draft
        await statementRef.update({
          executiveApproval: false,
          executiveApprovedBy: context.auth.uid,
          executiveApprovedAt: admin.firestore.Timestamp.now(),
          executiveNotes: data.notes,
          status: 'DRAFT',
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error in executive approval:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Publish statement (requires all approvals)
 */
export const pack387_releasePublicStatement = functions.https.onCall(
  async (data: { statementId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const statementRef = db.collection('publicStatements').doc(data.statementId);
      const statement = await statementRef.get();

      if (!statement.exists) {
        throw new functions.https.HttpsError('not-found', 'Statement not found');
      }

      const statementData = statement.data() as PublicStatement;

      // Validate all approvals
      if (!statementData.legalApproval) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Statement requires legal approval'
        );
      }

      if (!statementData.executiveApproval) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Statement requires executive approval'
        );
      }

      if (statementData.status !== 'APPROVED') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Statement must be in APPROVED status'
        );
      }

      // Publish statement
      await statementRef.update({
        status: 'PUBLISHED',
        publishedAt: admin.firestore.Timestamp.now(),
        publishedBy: context.auth.uid,
        updatedAt: admin.firestore.Timestamp.now(),
      });

      // Log publication
      await db.collection('crisisResponseLogs').add({
        incidentId: statementData.incidentId,
        actionType: 'STATEMENT_PUBLISHED',
        performedBy: context.auth.uid,
        timestamp: admin.firestore.Timestamp.now(),
        metadata: {
          statementId: data.statementId,
          platform: statementData.platform,
          title: statementData.title,
        },
      });

      // TODO: Actually publish to the platform (X, TikTok, etc.)
      // This would integrate with PACK 386 (Marketing) APIs

      return { success: true };
    } catch (error: any) {
      console.error('Error releasing public statement:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get all statements for an incident
 */
export const pack387_getIncidentStatements = functions.https.onCall(
  async (data: { incidentId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      const statements = await db
        .collection('publicStatements')
        .where('incidentId', '==', data.incidentId)
        .orderBy('createdAt', 'desc')
        .get();

      return {
        statements: statements.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })),
      };
    } catch (error: any) {
      console.error('Error getting incident statements:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/**
 * Get statements pending approval
 */
export const pack387_getPendingStatements = functions.https.onCall(
  async (data: { userRole: 'legal' | 'executive' }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    try {
      let query;

      if (data.userRole === 'legal') {
        query = db.collection('publicStatements').where('status', '==', 'PENDING_LEGAL');
      } else if (data.userRole === 'executive') {
        query = db.collection('publicStatements').where('status', '==', 'PENDING_EXECUTIVE');
      } else {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid user role');
      }

      const statements = await query.orderBy('createdAt', 'desc').get();

      return {
        statements: statements.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })),
      };
    } catch (error: any) {
      console.error('Error getting pending statements:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);
