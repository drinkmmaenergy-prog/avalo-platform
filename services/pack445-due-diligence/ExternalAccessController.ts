/**
 * PACK 445 – Enterprise Readiness & Due Diligence Toolkit
 * ExternalAccessController
 * 
 * Manages tokenized, temporary, read-only access for external entities
 * (investors, auditors, enterprise partners).
 */

import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

export interface ExternalAccess {
  id: string;
  token: string;
  role: 'investor' | 'auditor' | 'enterprise_partner';
  createdAt: Date;
  expiresAt: Date;
  createdBy: string;
  metadata: {
    entityName: string;
    contactEmail: string;
    purpose: string;
    ndaSigned: boolean;
    ndaDocument?: string;
  };
  permissions: AccessPermissions;
  status: 'active' | 'expired' | 'revoked';
  accessLog: AccessLogEntry[];
  restrictions: {
    ipWhitelist?: string[];
    allowedResources: string[];
    rateLimitPerHour: number;
  };
}

export interface AccessPermissions {
  dataRoom: boolean;
  kpis: boolean;
  financials: boolean;
  technicalDocs: boolean;
  complianceDocs: boolean;
  auditLogs: boolean;
  liveMetrics: boolean;
}

export interface AccessLogEntry {
  timestamp: Date;
  action: string;
  resource: string;
  ipAddress: string;
  userAgent?: string;
  status: 'success' | 'denied';
  reason?: string;
}

export interface AccessRequest {
  entityName: string;
  contactEmail: string;
  role: 'investor' | 'auditor' | 'enterprise_partner';
  purpose: string;
  requestedPermissions: string[];
  requestedDuration: number; // days
  ndaSigned: boolean;
  ndaDocument?: string;
}

export class ExternalAccessController {
  private db = admin.firestore();
  private readonly TOKEN_PREFIX = 'ext_';
  private readonly DEFAULT_EXPIRY_DAYS = 30;
  private readonly MAX_EXPIRY_DAYS = 90;

  /**
   * Create a new external access grant
   */
  async createAccess(
    request: AccessRequest,
    createdBy: string
  ): Promise<ExternalAccess> {
    // Validate request
    this.validateAccessRequest(request);

    // Generate secure token
    const token = this.generateSecureToken();
    const accessId = `${this.TOKEN_PREFIX}${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    // Determine expiry
    const now = new Date();
    const durationDays = Math.min(request.requestedDuration || this.DEFAULT_EXPIRY_DAYS, this.MAX_EXPIRY_DAYS);
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Map role to default permissions
    const permissions = this.getDefaultPermissions(request.role);

    // Apply requestedPermissions filter
    const filteredPermissions = this.filterPermissions(permissions, request.requestedPermissions);

    // Determine resource restrictions based on role
    const allowedResources = this.getAllowedResources(request.role, filteredPermissions);

    const access: ExternalAccess = {
      id: accessId,
      token: this.hashToken(token), // Store hashed version
      role: request.role,
      createdAt: now,
      expiresAt,
      createdBy,
      metadata: {
        entityName: request.entityName,
        contactEmail: request.contactEmail,
        purpose: request.purpose,
        ndaSigned: request.ndaSigned,
        ndaDocument: request.ndaDocument
      },
      permissions: filteredPermissions,
      status: 'active',
      accessLog: [],
      restrictions: {
        allowedResources,
        rateLimitPerHour: this.getRateLimit(request.role)
      }
    };

    // Store access grant
    await this.db.collection('externalAccess').doc(accessId).set(access);

    // Log creation
    await this.logAuditEvent({
      type: 'external_access_created',
      accessId,
      role: request.role,
      createdBy,
      entityName: request.entityName,
      timestamp: now
    });

    // Return with raw token (only time it's available)
    return {
      ...access,
      token // Return unhashed token to user
    };
  }

  /**
   * Verify access token and check permissions
   */
  async verifyAccess(
    token: string,
    resource: string,
    action: string,
    context: {
      ipAddress: string;
      userAgent?: string;
    }
  ): Promise<{ allowed: boolean; access?: ExternalAccess; reason?: string }> {
    // Hash the provided token to match stored version
    const hashedToken = this.hashToken(token);

    // Find access grant by hashed token
    const accessSnapshot = await this.db
      .collection('externalAccess')
      .where('token', '==', hashedToken)
      .limit(1)
      .get();

    if (accessSnapshot.empty) {
      await this.logAccessAttempt(null, resource, action, context, 'denied', 'Invalid token');
      return { allowed: false, reason: 'Invalid token' };
    }

    const accessDoc = accessSnapshot.docs[0];
    const access = accessDoc.data() as ExternalAccess;

    // Check if expired
    if (new Date() > access.expiresAt) {
      await this.updateAccessStatus(access.id, 'expired');
      await this.logAccessAttempt(access.id, resource, action, context, 'denied', 'Token expired');
      return { allowed: false, reason: 'Token expired' };
    }

    // Check if revoked
    if (access.status === 'revoked') {
      await this.logAccessAttempt(access.id, resource, action, context, 'denied', 'Token revoked');
      return { allowed: false, reason: 'Token revoked' };
    }

    // Check IP whitelist if configured
    if (access.restrictions.ipWhitelist && access.restrictions.ipWhitelist.length > 0) {
      if (!access.restrictions.ipWhitelist.includes(context.ipAddress)) {
        await this.logAccessAttempt(access.id, resource, action, context, 'denied', 'IP not whitelisted');
        return { allowed: false, reason: 'IP address not authorized' };
      }
    }

    // Check resource access
    if (!access.restrictions.allowedResources.includes(resource)) {
      await this.logAccessAttempt(access.id, resource, action, context, 'denied', 'Resource not allowed');
      return { allowed: false, reason: 'Resource not accessible' };
    }

    // Check rate limit
    const withinRateLimit = await this.checkRateLimit(access.id, access.restrictions.rateLimitPerHour);
    if (!withinRateLimit) {
      await this.logAccessAttempt(access.id, resource, action, context, 'denied', 'Rate limit exceeded');
      return { allowed: false, reason: 'Rate limit exceeded' };
    }

    // Check specific permission for resource
    if (!this.hasPermission(access.permissions, resource)) {
      await this.logAccessAttempt(access.id, resource, action, context, 'denied', 'Permission denied');
      return { allowed: false, reason: 'Insufficient permissions' };
    }

    // Access granted
    await this.logAccessAttempt(access.id, resource, action, context, 'success');
    return { allowed: true, access };
  }

  /**
   * Revoke external access
   */
  async revokeAccess(accessId: string, revokedBy: string, reason?: string): Promise<void> {
    await this.db.collection('externalAccess').doc(accessId).update({
      status: 'revoked',
      revokedAt: new Date(),
      revokedBy,
      revokeReason: reason
    });

    await this.logAuditEvent({
      type: 'external_access_revoked',
      accessId,
      revokedBy,
      reason,
      timestamp: new Date()
    });
  }

  /**
   * Extend access expiration
   */
  async extendAccess(
    accessId: string,
    additionalDays: number,
    extendedBy: string
  ): Promise<Date> {
    const accessDoc = await this.db.collection('externalAccess').doc(accessId).get();
    
    if (!accessDoc.exists) {
      throw new Error('Access not found');
    }

    const access = accessDoc.data() as ExternalAccess;
    const newExpiresAt = new Date(access.expiresAt.getTime() + additionalDays * 24 * 60 * 60 * 1000);

    // Enforce max expiry
    const maxExpiry = new Date(access.createdAt.getTime() + this.MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const finalExpiresAt = newExpiresAt > maxExpiry ? maxExpiry : newExpiresAt;

    await this.db.collection('externalAccess').doc(accessId).update({
      expiresAt: finalExpiresAt,
      extendedAt: new Date(),
      extendedBy
    });

    await this.logAuditEvent({
      type: 'external_access_extended',
      accessId,
      extendedBy,
      newExpiresAt: finalExpiresAt,
      timestamp: new Date()
    });

    return finalExpiresAt;
  }

  /**
   * Get access log for an external entity
   */
  async getAccessLog(accessId: string): Promise<AccessLogEntry[]> {
    const accessDoc = await this.db.collection('externalAccess').doc(accessId).get();
    
    if (!accessDoc.exists) {
      throw new Error('Access not found');
    }

    const access = accessDoc.data() as ExternalAccess;
    return access.accessLog || [];
  }

  /**
   * List all active external access grants
   */
  async listActiveAccess(role?: 'investor' | 'auditor' | 'enterprise_partner'): Promise<ExternalAccess[]> {
    let query = this.db
      .collection('externalAccess')
      .where('status', '==', 'active') as admin.firestore.Query;

    if (role) {
      query = query.where('role', '==', role);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as ExternalAccess);
  }

  /**
   * Private helper methods
   */
  private validateAccessRequest(request: AccessRequest): void {
    if (!request.entityName || !request.contactEmail) {
      throw new Error('Entity name and contact email are required');
    }

    if (!request.ndaSigned) {
      throw new Error('NDA must be signed before granting access');
    }

    if (!['investor', 'auditor', 'enterprise_partner'].includes(request.role)) {
      throw new Error('Invalid role');
    }
  }

  private generateSecureToken(): string {
    return `${this.TOKEN_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private getDefaultPermissions(role: 'investor' | 'auditor' | 'enterprise_partner'): AccessPermissions {
    const rolePermissions: Record<string, AccessPermissions> = {
      investor: {
        dataRoom: true,
        kpis: true,
        financials: true,
        technicalDocs: true,
        complianceDocs: true,
        auditLogs: false,
        liveMetrics: true
      },
      auditor: {
        dataRoom: true,
        kpis: true,
        financials: true,
        technicalDocs: true,
        complianceDocs: true,
        auditLogs: true,
        liveMetrics: false
      },
      enterprise_partner: {
        dataRoom: true,
        kpis: false,
        financials: false,
        technicalDocs: true,
        complianceDocs: true,
        auditLogs: false,
        liveMetrics: false
      }
    };

    return rolePermissions[role];
  }

  private filterPermissions(
    defaultPermissions: AccessPermissions,
    requested: string[]
  ): AccessPermissions {
    if (requested.length === 0) {
      return defaultPermissions;
    }

    const filtered = { ...defaultPermissions };
    
    // Disable permissions not requested
    Object.keys(filtered).forEach(key => {
      if (!requested.includes(key)) {
        (filtered as any)[key] = false;
      }
    });

    return filtered;
  }

  private getAllowedResources(
    role: 'investor' | 'auditor' | 'enterprise_partner',
    permissions: AccessPermissions
  ): string[] {
    const resources: string[] = [];

    if (permissions.dataRoom) resources.push('dataRoom');
    if (permissions.kpis) resources.push('kpis');
    if (permissions.financials) resources.push('financials');
    if (permissions.technicalDocs) resources.push('technicalDocs');
    if (permissions.complianceDocs) resources.push('complianceDocs');
    if (permissions.auditLogs) resources.push('auditLogs');
    if (permissions.liveMetrics) resources.push('liveMetrics');

    return resources;
  }

  private getRateLimit(role: 'investor' | 'auditor' | 'enterprise_partner'): number {
    const rateLimits = {
      investor: 100,
      auditor: 200,
      enterprise_partner: 50
    };
    return rateLimits[role];
  }

  private hasPermission(permissions: AccessPermissions, resource: string): boolean {
    return (permissions as any)[resource] === true;
  }

  private async checkRateLimit(accessId: string, limitPerHour: number): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentAccessSnapshot = await this.db
      .collection('accessLog')
      .where('accessId', '==', accessId)
      .where('timestamp', '>=', oneHourAgo)
      .get();

    return recentAccessSnapshot.size < limitPerHour;
  }

  private async logAccessAttempt(
    accessId: string | null,
    resource: string,
    action: string,
    context: { ipAddress: string; userAgent?: string },
    status: 'success' | 'denied',
    reason?: string
  ): Promise<void> {
    const logEntry: AccessLogEntry = {
      timestamp: new Date(),
      action,
      resource,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      status,
      reason
    };

    // Store in centralized access log
    await this.db.collection('accessLog').add({
      accessId,
      ...logEntry
    });

    // Also append to access document's log
    if (accessId) {
      await this.db.collection('externalAccess').doc(accessId).update({
        accessLog: admin.firestore.FieldValue.arrayUnion(logEntry)
      });
    }
  }

  private async updateAccessStatus(
    accessId: string,
    status: 'expired' | 'revoked'
  ): Promise<void> {
    await this.db.collection('externalAccess').doc(accessId).update({
      status,
      statusChangedAt: new Date()
    });
  }

  private async logAuditEvent(event: any): Promise<void> {
    await this.db.collection('auditLog').add({
      ...event,
      source: 'ExternalAccessController'
    });
  }
}
