/**
 * PACK 305 — Legal & Audit Snapshot Export
 * API endpoints for legal snapshot management
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateSnapshotRequest,
  LegalSnapshot,
  SnapshotType,
  AdminRole,
  SnapshotAuditLog,
} from './types';

const db = admin.firestore();

/**
 * Check if admin has required role for snapshot type
 */
function canAccessSnapshotType(
  adminRole: AdminRole,
  snapshotType: SnapshotType
): boolean {
  switch (snapshotType) {
    case 'INVESTOR_OVERVIEW':
      return ['FINANCE', 'SUPERADMIN'].includes(adminRole);
    case 'REGULATOR_OVERVIEW':
      return ['COMPLIANCE', 'SUPERADMIN'].includes(adminRole);
    case 'INTERNAL_COMPLIANCE':
      return ['COMPLIANCE', 'SUPERADMIN', 'LEGAL'].includes(adminRole);
    default:
      return false;
  }
}

/**
 * Verify admin authentication and role
 */
async function verifyAdmin(
  uid: string,
  requiredSnapshotType: SnapshotType
): Promise<{ valid: boolean; role?: AdminRole; error?: string }> {
  try {
    const adminDoc = await db.collection('admins').doc(uid).get();
    
    if (!adminDoc.exists) {
      return { valid: false, error: 'Not an admin user' };
    }
    
    const adminData = adminDoc.data();
    const role = adminData?.role as AdminRole;
    
    if (!role) {
      return { valid: false, error: 'Admin role not found' };
    }
    
    if (!canAccessSnapshotType(role, requiredSnapshotType)) {
      return {
        valid: false,
        error: `Role ${role} cannot access ${requiredSnapshotType} snapshots`,
      };
    }
    
    return { valid: true, role };
  } catch (error) {
    console.error('Error verifying admin:', error);
    return { valid: false, error: 'Failed to verify admin status' };
  }
}

/**
 * Log audit event for snapshot operations
 */
async function logSnapshotAudit(auditLog: SnapshotAuditLog): Promise<void> {
  try {
    await db.collection('auditLogs').add({
      ...auditLog,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Error logging snapshot audit:', error);
    // Don't fail the operation if logging fails
  }
}

/**
 * POST /admin/legal/snapshots
 * Create a new legal snapshot request
 */
export const createLegalSnapshot = functions.https.onCall(
  async (data: CreateSnapshotRequest, context) => {
    // Check authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const adminId = context.auth.uid;
    
    // Validate request data
    if (!data.type || !data.period || !data.format) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields: type, period, format'
      );
    }
    
    if (!['INVESTOR_OVERVIEW', 'REGULATOR_OVERVIEW', 'INTERNAL_COMPLIANCE'].includes(data.type)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid snapshot type'
      );
    }
    
    if (!['PDF', 'ZIP', 'JSON'].includes(data.format)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid file format'
      );
    }
    
    // Validate period
    const fromDate = new Date(data.period.from);
    const toDate = new Date(data.period.to);
    
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid date format in period'
      );
    }
    
    if (fromDate >= toDate) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Period "from" must be before "to"'
      );
    }
    
    // Verify admin has required role
    const verification = await verifyAdmin(adminId, data.type);
    if (!verification.valid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        verification.error || 'Insufficient permissions'
      );
    }
    
    // Create snapshot document
    const snapshotId = uuidv4();
    const snapshot: LegalSnapshot = {
      snapshotId,
      type: data.type,
      requestedByAdminId: adminId,
      requestedAt: new Date().toISOString(),
      period: data.period,
      status: 'PENDING',
      fileUrl: null,
      fileFormat: data.format,
      metadata: {
        notes: data.notes || null,
      },
      errorMessage: null,
    };
    
    try {
      // Save to Firestore
      await db.collection('legalSnapshots').doc(snapshotId).set(snapshot);
      
      // Log audit event
      await logSnapshotAudit({
        eventType: 'LEGAL_SNAPSHOT_REQUESTED',
        timestamp: snapshot.requestedAt,
        adminId,
        snapshotId,
        snapshotType: data.type,
        period: data.period,
        fileFormat: data.format,
        metadata: {
          notes: data.notes,
        },
      });
      
      // Trigger background processing (via Pub/Sub or direct call)
      // For now, we'll use Pub/Sub to decouple the processing
      const topic = admin.messaging().getTopic('legal-snapshot-processing');
      await admin.messaging().send({
        topic: 'legal-snapshot-processing',
        data: {
          snapshotId,
        },
      });
      
      return {
        success: true,
        snapshotId,
        message: 'Snapshot request created successfully',
      };
    } catch (error) {
      console.error('Error creating snapshot:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to create snapshot request'
      );
    }
  }
);

/**
 * GET /admin/legal/snapshots (list)
 * List legal snapshots with filtering
 */
export const listLegalSnapshots = functions.https.onCall(
  async (data: {
    type?: SnapshotType;
    status?: string;
    limit?: number;
    offset?: number;
  }, context) => {
    // Check authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const adminId = context.auth.uid;
    
    try {
      // Get admin role
      const adminDoc = await db.collection('admins').doc(adminId).get();
      if (!adminDoc.exists) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Not an admin user'
        );
      }
      
      const adminRole = adminDoc.data()?.role as AdminRole;
      
      // Build query
      let query: admin.firestore.Query = db.collection('legalSnapshots');
      
      // Filter by type if specified and user has access
      if (data.type) {
        if (!canAccessSnapshotType(adminRole, data.type)) {
          throw new functions.https.HttpsError(
            'permission-denied',
            `Role ${adminRole} cannot access ${data.type} snapshots`
          );
        }
        query = query.where('type', '==', data.type);
      }
      
      // Filter by status if specified
      if (data.status) {
        query = query.where('status', '==', data.status);
      }
      
      // Order by requested date (newest first)
      query = query.orderBy('requestedAt', 'desc');
      
      // Apply pagination
      const limit = data.limit && data.limit > 0 ? Math.min(data.limit, 100) : 20;
      const offset = data.offset && data.offset > 0 ? data.offset : 0;
      
      query = query.limit(limit);
      if (offset > 0) {
        query = query.offset(offset);
      }
      
      const snapshot = await query.get();
      
      // Filter results based on admin role
      const snapshots = snapshot.docs
        .map(doc => doc.data() as LegalSnapshot)
        .filter(snap => canAccessSnapshotType(adminRole, snap.type));
      
      return {
        success: true,
        snapshots,
        count: snapshots.length,
        limit,
        offset,
      };
    } catch (error) {
      console.error('Error listing snapshots:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        'internal',
        'Failed to list snapshots'
      );
    }
  }
);

/**
 * GET /admin/legal/snapshots/:id
 * Get a specific snapshot by ID
 */
export const getLegalSnapshot = functions.https.onCall(
  async (data: { snapshotId: string }, context) => {
    // Check authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const adminId = context.auth.uid;
    
    if (!data.snapshotId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'snapshotId is required'
      );
    }
    
    try {
      // Get snapshot
      const snapshotDoc = await db
        .collection('legalSnapshots')
        .doc(data.snapshotId)
        .get();
      
      if (!snapshotDoc.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Snapshot not found'
        );
      }
      
      const snapshot = snapshotDoc.data() as LegalSnapshot;
      
      // Verify admin has access to this snapshot type
      const verification = await verifyAdmin(adminId, snapshot.type);
      if (!verification.valid) {
        throw new functions.https.HttpsError(
          'permission-denied',
          verification.error || 'Insufficient permissions'
        );
      }
      
      // Log access
      await logSnapshotAudit({
        eventType: 'LEGAL_SNAPSHOT_ACCESSED',
        timestamp: new Date().toISOString(),
        adminId,
        snapshotId: data.snapshotId,
        snapshotType: snapshot.type,
      });
      
      return {
        success: true,
        snapshot,
      };
    } catch (error) {
      console.error('Error getting snapshot:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        'internal',
        'Failed to get snapshot'
      );
    }
  }
);