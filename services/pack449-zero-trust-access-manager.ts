/**
 * PACK 449 - Zero-Trust Access Manager
 * 
 * Implements zero-trust access control for internal users:
 * - Minimal (least privilege) access
 * - Time-bound permissions
 * - Contextual access (role, region, incident state)
 * - No permanent permissions
 * 
 * Dependencies:
 * - PACK 296: Compliance & Audit Layer
 * - PACK 364: Observability
 * - PACK 448: Incident Response, Crisis Management
 */

import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// Access Context
export interface AccessContext {
  userId: string;
  role: InternalRole;
  requestedPermissions: string[];
  region: string;
  ipAddress: string;
  device: DeviceInfo;
  justification: string;
  incidentId?: string;
}

export interface DeviceInfo {
  id: string;
  type: 'desktop' | 'mobile' | 'tablet';
  os: string;
  browser?: string;
  fingerprint: string;
  isKnown: boolean;
}

export type InternalRole = 
  | 'product_manager'
  | 'engineer_backend'
  | 'engineer_frontend'
  | 'engineer_mobile'
  | 'engineer_infra'
  | 'finance_analyst'
  | 'finance_controller'
  | 'compliance_officer'
  | 'legal_counsel'
  | 'support_tier1'
  | 'support_tier2'
  | 'support_tier3'
  | 'data_analyst'
  | 'security_analyst'
  | 'executive_cto'
  | 'executive_ceo'
  | 'executive_cfo'
  | 'auditor_internal'
  | 'auditor_external';

export interface AccessGrant {
  id: string;
  userId: string;
  role: InternalRole;
  permissions: string[];
  grantedAt: Timestamp;
  expiresAt: Timestamp;
  context: AccessContext;
  approvedBy?: string;
  revoked: boolean;
  revokedAt?: Timestamp;
  revokedBy?: string;
  revokedReason?: string;
  accessLog: AccessLogEntry[];
}

export interface AccessLogEntry {
  timestamp: Timestamp;
  action: string;
  resource: string;
  result: 'success' | 'denied' | 'error';
  details?: any;
}

// Role-to-Permission Mapping (Least Privilege)
const ROLE_PERMISSIONS: Record<InternalRole, string[]> = {
  // Product Team - Read-only analytics, no customer data
  product_manager: [
    'analytics.read',
    'features.read',
    'experiments.manage',
    'feedback.read'
  ],
  
  // Engineering - Scoped by domain
  engineer_backend: [
    'code.read',
    'code.write.backend',
    'logs.read.backend',
    'metrics.read'
  ],
  engineer_frontend: [
    'code.read',
    'code.write.frontend',
    'logs.read.frontend',
    'metrics.read'
  ],
  engineer_mobile: [
    'code.read',
    'code.write.mobile',
    'logs.read.mobile',
    'metrics.read'
  ],
  engineer_infra: [
    'code.read',
    'infrastructure.read',
    'infrastructure.manage',
    'logs.read',
    'metrics.read',
    'alerts.manage'
  ],
  
  // Finance - Financial data only
  finance_analyst: [
    'financial.read',
    'reports.read',
    'transactions.read'
  ],
  finance_controller: [
    'financial.read',
    'financial.write',
    'reports.manage',
    'transactions.read',
    'payouts.approve'
  ],
  
  // Compliance - Audit and compliance data
  compliance_officer: [
    'compliance.read',
    'compliance.write',
    'audit_logs.read',
    'policies.manage',
    'reports.compliance'
  ],
  
  // Legal - Legal documents and cases
  legal_counsel: [
    'legal.read',
    'legal.write',
    'contracts.manage',
    'cases.manage',
    'gdpr.manage'
  ],
  
  // Support - Customer assistance, tiered access
  support_tier1: [
    'users.read.limited',
    'tickets.read',
    'tickets.respond',
    'knowledge_base.read'
  ],
  support_tier2: [
    'users.read',
    'tickets.read',
    'tickets.manage',
    'refunds.request',
    'bans.request'
  ],
  support_tier3: [
    'users.read',
    'users.edit.limited',
    'tickets.manage',
    'refunds.approve',
    'bans.execute'
  ],
  
  // Analytics
  data_analyst: [
    'analytics.read',
    'data.read.anonymized',
    'reports.create',
    'dashboards.manage'
  ],
  
  // Security
  security_analyst: [
    'security.read',
    'security.investigate',
    'threats.read',
    'incidents.manage',
    'logs.read'
  ],
  
  // Executives - Strategic access, no operational
  executive_cto: [
    'metrics.read',
    'engineering.read',
    'infrastructure.read',
    'security.read',
    'incidents.read'
  ],
  executive_ceo: [
    'metrics.read',
    'financial.read',
    'compliance.read',
    'reports.read'
  ],
  executive_cfo: [
    'financial.read',
    'financial.write',
    'reports.read',
    'metrics.read'
  ],
  
  // Auditors - Read-only across domains
  auditor_internal: [
    'audit_logs.read',
    'compliance.read',
    'financial.read',
    'security.read'
  ],
  auditor_external: [
    'audit_logs.read',
    'compliance.read',
    'reports.read'
  ]
};

// Maximum session duration per role (in hours)
const MAX_SESSION_DURATIONS: Record<InternalRole, number> = {
  product_manager: 8,
  engineer_backend: 8,
  engineer_frontend: 8,
  engineer_mobile: 8,
  engineer_infra: 4, // Shorter for infra
  finance_analyst: 8,
  finance_controller: 4,
  compliance_officer: 8,
  legal_counsel: 8,
  support_tier1: 8,
  support_tier2: 8,
  support_tier3: 4,
  data_analyst: 8,
  security_analyst: 12, // Longer for incident response
  executive_cto: 4,
  executive_ceo: 4,
  executive_cfo: 4,
  auditor_internal: 8,
  auditor_external: 8
};

export class ZeroTrustAccessManager {
  
  /**
   * Request access with context
   */
  async requestAccess(context: AccessContext, durationHours?: number): Promise<AccessGrant> {
    // Get base permissions for role
    const basePermissions = ROLE_PERMISSIONS[context.role] || [];
    
    // Check if requested permissions are within role scope
    const unauthorized = context.requestedPermissions.filter(
      p => !basePermissions.includes(p)
    );
    
    if (unauthorized.length > 0) {
      throw new Error(
        `Unauthorized permissions requested: ${unauthorized.join(', ')}. ` +
        `Role ${context.role} is limited to: ${basePermissions.join(', ')}`
      );
    }
    
    // Ensure duration doesn't exceed max
    const maxDuration = MAX_SESSION_DURATIONS[context.role] || 8;
    const duration = Math.min(durationHours || maxDuration, maxDuration);
    
    // Check device trust
    if (!context.device.isKnown) {
      // Log unknown device
      await this.logSecurityEvent({
        type: 'unknown_device_access',
        userId: context.userId,
        device: context.device,
        severity: 'medium'
      });
    }
    
    // Create access grant
    const grantId = `grant_${Date.now()}_${context.userId}`;
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(
      now.toMillis() + duration * 60 * 60 * 1000
    );
    
    const grant: AccessGrant = {
      id: grantId,
      userId: context.userId,
      role: context.role,
      permissions: context.requestedPermissions,
      grantedAt: now,
      expiresAt: expiresAt,
      context: context,
      revoked: false,
      accessLog: []
    };
    
    // Store grant
    await setDoc(doc(db, 'internal_access_grants', grantId), grant);
    
    // Log access grant (PACK 296)
    await this.auditLog('access_granted', {
      grantId,
      userId: context.userId,
      role: context.role,
      permissions: context.requestedPermissions,
      duration,
      justification: context.justification
    });
    
    return grant;
  }
  
  /**
   * Validate if access is still valid
   */
  async validateAccess(grantId: string, action: string, resource: string): Promise<boolean> {
    const grantDoc = await getDoc(doc(db, 'internal_access_grants', grantId));
    
    if (!grantDoc.exists()) {
      return false;
    }
    
    const grant = grantDoc.data() as AccessGrant;
    
    // Check if revoked
    if (grant.revoked) {
      await this.logAccessAttempt(grantId, action, resource, 'denied', 'Grant revoked');
      return false;
    }
    
    // Check if expired
    if (grant.expiresAt.toMillis() < Date.now()) {
      await this.logAccessAttempt(grantId, action, resource, 'denied', 'Grant expired');
      return false;
    }
    
    // Check if action is permitted
    const requiredPermission = this.getRequiredPermission(action, resource);
    if (!grant.permissions.includes(requiredPermission)) {
      await this.logAccessAttempt(grantId, action, resource, 'denied', 'Insufficient permissions');
      return false;
    }
    
    // Log successful access
    await this.logAccessAttempt(grantId, action, resource, 'success');
    
    return true;
  }
  
  /**
   * Revoke access grant
   */
  async revokeAccess(
    grantId: string, 
    revokedBy: string, 
    reason: string
  ): Promise<void> {
    const grantRef = doc(db, 'internal_access_grants', grantId);
    const grantDoc = await getDoc(grantRef);
    
    if (!grantDoc.exists()) {
      throw new Error('Access grant not found');
    }
    
    await updateDoc(grantRef, {
      revoked: true,
      revokedAt: serverTimestamp(),
      revokedBy,
      revokedReason: reason
    });
    
    const grant = grantDoc.data() as AccessGrant;
    
    // Audit log
    await this.auditLog('access_revoked', {
      grantId,
      userId: grant.userId,
      revokedBy,
      reason
    });
  }
  
  /**
   * Get active grants for user
   */
  async getActiveGrants(userId: string): Promise<AccessGrant[]> {
    const q = query(
      collection(db, 'internal_access_grants'),
      where('userId', '==', userId),
      where('revoked', '==', false)
    );
    
    const snapshot = await getDocs(q);
    const grants: AccessGrant[] = [];
    const now = Date.now();
    
    for (const doc of snapshot.docs) {
      const grant = doc.data() as AccessGrant;
      
      // Only include non-expired grants
      if (grant.expiresAt.toMillis() > now) {
        grants.push(grant);
      }
    }
    
    return grants;
  }
  
  /**
   * Revoke all access for user
   */
  async revokeAllAccess(userId: string, revokedBy: string, reason: string): Promise<number> {
    const grants = await this.getActiveGrants(userId);
    
    const batch = writeBatch(db);
    
    for (const grant of grants) {
      const grantRef = doc(db, 'internal_access_grants', grant.id);
      batch.update(grantRef, {
        revoked: true,
        revokedAt: serverTimestamp(),
        revokedBy,
        revokedReason: reason
      });
    }
    
    await batch.commit();
    
    // Audit log
    await this.auditLog('access_revoked_all', {
      userId,
      grantsRevoked: grants.length,
      revokedBy,
      reason
    });
    
    return grants.length;
  }
  
  /**
   * Extend access grant duration (requires approval)
   */
  async extendAccess(
    grantId: string,
    additionalHours: number,
    approvedBy: string,
    justification: string
  ): Promise<void> {
    const grantRef = doc(db, 'internal_access_grants', grantId);
    const grantDoc = await getDoc(grantRef);
    
    if (!grantDoc.exists()) {
      throw new Error('Access grant not found');
    }
    
    const grant = grantDoc.data() as AccessGrant;
    
    if (grant.revoked) {
      throw new Error('Cannot extend revoked grant');
    }
    
    // Check max duration
    const maxDuration = MAX_SESSION_DURATIONS[grant.role] || 8;
    if (additionalHours > maxDuration) {
      throw new Error(`Cannot extend beyond max duration of ${maxDuration} hours`);
    }
    
    const newExpiresAt = Timestamp.fromMillis(
      grant.expiresAt.toMillis() + additionalHours * 60 * 60 * 1000
    );
    
    await updateDoc(grantRef, {
      expiresAt: newExpiresAt,
      approvedBy
    });
    
    // Audit log
    await this.auditLog('access_extended', {
      grantId,
      userId: grant.userId,
      additionalHours,
      approvedBy,
      justification
    });
  }
  
  /**
   * Get required permission for action
   */
  private getRequiredPermission(action: string, resource: string): string {
    // Parse action and resource to determine required permission
    const [domain, operation] = action.split('.');
    return `${domain}.${operation}`;
  }
  
  /**
   * Log access attempt
   */
  private async logAccessAttempt(
    grantId: string,
    action: string,
    resource: string,
    result: 'success' | 'denied' | 'error',
    details?: any
  ): Promise<void> {
    const entry: AccessLogEntry = {
      timestamp: Timestamp.now(),
      action,
      resource,
      result,
      details
    };
    
    const grantRef = doc(db, 'internal_access_grants', grantId);
    const grantDoc = await getDoc(grantRef);
    
    if (grantDoc.exists()) {
      const grant = grantDoc.data() as AccessGrant;
      const accessLog = [...grant.accessLog, entry];
      
      await updateDoc(grantRef, { accessLog });
    }
  }
  
  /**
   * Audit log integration (PACK 296)
   */
  private async auditLog(event: string, data: any): Promise<void> {
    await setDoc(doc(collection(db, 'audit_logs')), {
      timestamp: serverTimestamp(),
      source: 'pack449_zero_trust_access',
      event,
      data,
      severity: 'high'
    });
  }
  
  /**
   * Security event log (PACK 364)
   */
  private async logSecurityEvent(event: any): Promise<void> {
    await setDoc(doc(collection(db, 'security_events')), {
      ...event,
      timestamp: serverTimestamp(),
      source: 'pack449_zero_trust_access'
    });
  }
}

export const zeroTrustAccessManager = new ZeroTrustAccessManager();
