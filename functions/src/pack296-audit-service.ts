import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 296 - Audit Service Stub
 * Provides audit logging functionality
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

export interface AuditLogEntry {
  action: string;
  userId?: string;
  resourceId?: string;
  resourceType?: string;
  metadata?: Record<string, any>;
  timestamp: any;
}

/**
 * Log an audit event
 */
export async function auditLog(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
  try {
    await db.collection('auditLogs').add({
      ...entry,
      timestamp: Timestamp.now(),
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

/**
 * Query audit logs
 */
export async function queryAuditLogs(
  filters: Partial<AuditLogEntry>,
  limit: number = 100
): Promise<AuditLogEntry[]> {
  let query = db.collection('auditLogs').orderBy('timestamp', 'desc').limit(limit);
  
  if (filters.action) {
    query = query.where('action', '==', filters.action);
  }
  if (filters.userId) {
    query = query.where('userId', '==', filters.userId);
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data() as AuditLogEntry);
}

























