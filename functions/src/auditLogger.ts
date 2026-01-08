/**
 * PACK 65 — Audit Logger
 * Centralized audit logging for all sensitive admin operations
 */

import { db, generateId, serverTimestamp } from './init';
import { AdminContext } from './types/adminTypes';
import {
  AuditLog,
  AuditTargetType,
  AuditAction,
  AuditSeverity,
} from './types/adminTypes';

// ============================================================================
// AUDIT LOG INPUT INTERFACE
// ============================================================================

export interface AuditLogInput {
  admin: AdminContext;
  targetType: AuditTargetType;
  targetId?: string;
  action: AuditAction;
  severity?: AuditSeverity;
  before?: any;
  after?: any;
  userId?: string;
  reason?: string;
  ipCountry?: string;
  ipCity?: string;
}

// ============================================================================
// WRITE AUDIT LOG
// ============================================================================

/**
 * Write an audit log entry
 * 
 * All sensitive admin operations must be logged through this function.
 * Logs are append-only and immutable.
 */
export async function writeAuditLog(input: AuditLogInput): Promise<string> {
  const logId = generateId();
  const now = serverTimestamp();

  const auditLog: AuditLog = {
    logId,
    timestamp: now as any,
    adminId: input.admin.adminId,
    adminEmail: input.admin.email,
    targetType: input.targetType,
    targetId: input.targetId || null,
    action: input.action,
    severity: input.severity || 'INFO',
    before: input.before || null,
    after: input.after || null,
    context: {
      reason: input.reason || null,
      ipCountry: input.ipCountry || null,
      ipCity: input.ipCity || null,
    },
    userId: input.userId || null,
    createdAt: now as any,
  };

  await db.collection('audit_logs').doc(logId).set(auditLog);

  console.log(
    `[Audit Log] ${input.action} by ${input.admin.email} on ${input.targetType}:${input.targetId || 'N/A'}`
  );

  return logId;
}

// ============================================================================
// AUDIT LOG QUERY
// ============================================================================

export interface AuditLogQueryParams {
  targetType?: AuditTargetType;
  targetId?: string;
  userId?: string;
  adminId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
  cursor?: string;
}

export interface AuditLogQueryResult {
  items: Array<{
    logId: string;
    timestamp: number;
    adminEmail?: string | null;
    targetType: AuditTargetType;
    targetId?: string | null;
    action: AuditAction;
    severity: AuditSeverity;
    context?: any;
    userId?: string | null;
  }>;
  nextCursor?: string;
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(
  params: AuditLogQueryParams
): Promise<AuditLogQueryResult> {
  const {
    targetType,
    targetId,
    userId,
    adminId,
    action,
    severity,
    fromTimestamp,
    toTimestamp,
    limit = 50,
    cursor,
  } = params;

  let query: any = db.collection('audit_logs');

  // Apply filters
  if (targetType) {
    query = query.where('targetType', '==', targetType);
  }

  if (targetId) {
    query = query.where('targetId', '==', targetId);
  }

  if (userId) {
    query = query.where('userId', '==', userId);
  }

  if (adminId) {
    query = query.where('adminId', '==', adminId);
  }

  if (action) {
    query = query.where('action', '==', action);
  }

  if (severity) {
    query = query.where('severity', '==', severity);
  }

  if (fromTimestamp) {
    query = query.where('timestamp', '>=', new Date(fromTimestamp));
  }

  if (toTimestamp) {
    query = query.where('timestamp', '<=', new Date(toTimestamp));
  }

  // Order by timestamp descending
  query = query.orderBy('timestamp', 'desc');

  // Apply limit (+1 to detect if there are more results)
  query = query.limit(limit + 1);

  // Apply cursor if provided
  if (cursor) {
    const cursorDoc = await db.collection('audit_logs').doc(cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();

  const items: AuditLogQueryResult['items'] = [];
  let nextCursor: string | undefined;

  for (let i = 0; i < snapshot.docs.length; i++) {
    if (i < limit) {
      const doc = snapshot.docs[i];
      const log = doc.data() as AuditLog;

      items.push({
        logId: log.logId,
        timestamp: log.timestamp.toMillis(),
        adminEmail: log.adminEmail,
        targetType: log.targetType,
        targetId: log.targetId,
        action: log.action,
        severity: log.severity,
        context: log.context,
        userId: log.userId,
      });
    } else {
      // There are more results
      nextCursor = snapshot.docs[i].id;
    }
  }

  return {
    items,
    nextCursor,
  };
}

// ============================================================================
// HELPER: GET AUDIT LOGS FOR SPECIFIC TARGET
// ============================================================================

/**
 * Get audit logs for a specific target (e.g., all logs for a user)
 */
export async function getAuditLogsForTarget(
  targetType: AuditTargetType,
  targetId: string,
  limit: number = 50
): Promise<AuditLog[]> {
  const snapshot = await db
    .collection('audit_logs')
    .where('targetType', '==', targetType)
    .where('targetId', '==', targetId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as AuditLog);
}

/**
 * Get audit logs by admin
 */
export async function getAuditLogsByAdmin(
  adminId: string,
  limit: number = 50
): Promise<AuditLog[]> {
  const snapshot = await db
    .collection('audit_logs')
    .where('adminId', '==', adminId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as AuditLog);
}

/**
 * Get audit logs by user (affected end-user)
 */
export async function getAuditLogsByUser(
  userId: string,
  limit: number = 50
): Promise<AuditLog[]> {
  const snapshot = await db
    .collection('audit_logs')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as AuditLog);
}