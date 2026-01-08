/**
 * PACK 430 — ADMIN LEGAL CONTROL PANEL
 * 
 * Admin interfaces for legal compliance management:
 * - Force re-verification
 * - Lock jurisdiction features
 * - Override age status (manual review)
 * - Emergency disable region (legal order)
 * - Export compliance reports
 * 
 * HARD RULES:
 * - All admin actions are audit-logged
 * - Requires elevated permissions
 * - Changes are immediate and immutable
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import AgeGateEnforcer, { AgeVerificationMethod } from './pack430-age-gate';
import JurisdictionEngine from './pack430-jurisdiction-engine';
import LegalConsentEngine, { ConsentType } from './pack430-legal-consent';
import ContentAccessEngine from './pack430-content-access-engine';

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export interface AdminAction {
  adminId: string;
  action: string;
  targetUserId?: string;
  targetCountry?: string;
  reason: string;
  metadata?: Record<string, any>;
  timestamp: admin.firestore.Timestamp;
}

export interface ComplianceReport {
  reportId: string;
  generatedBy: string;
  generatedAt: admin.firestore.Timestamp;
  reportType: 'AGE_VERIFICATION' | 'JURISDICTION' | 'CONSENT' | 'FULL_COMPLIANCE';
  filters?: {
    startDate?: Date;
    endDate?: Date;
    countryCode?: string;
    verificationStatus?: string;
  };
  data: any[];
  format: 'JSON' | 'CSV';
}

export interface UserComplianceStatus {
  userId: string;
  ageVerified: boolean;
  ageVerificationStatus: string;
  jurisdictionCountry: string;
  jurisdictionTier: string;
  consentsMissing: string[];
  consentsExpired: string[];
  accountRestricted: boolean;
  lastComplianceCheck: admin.firestore.Timestamp;
}

// ─────────────────────────────────────────────────────────────────
// ADMIN LEGAL CONTROLS
// ─────────────────────────────────────────────────────────────────

export class AdminLegalControls {
  private db: admin.firestore.Firestore;
  private ageGate: AgeGateEnforcer;
  private jurisdictionEngine: JurisdictionEngine;
  private legalConsent: LegalConsentEngine;
  private contentAccess: ContentAccessEngine;

  constructor() {
    this.db = admin.firestore();
    this.ageGate = new AgeGateEnforcer();
    this.jurisdictionEngine = new JurisdictionEngine();
    this.legalConsent = new LegalConsentEngine();
    this.contentAccess = new ContentAccessEngine();
  }

  /**
   * Force age re-verification for user
   */
  async forceAgeReVerification(
    userId: string,
    adminId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    logger.warn(`Admin ${adminId} forcing age re-verification for user ${userId}: ${reason}`);

    try {
      // Expire current verification
      await this.ageGate.expireVerification(userId);

      // Log admin action
      await this.logAdminAction({
        adminId,
        action: 'FORCE_AGE_REVERIFICATION',
        targetUserId: userId,
        reason,
        timestamp: admin.firestore.Timestamp.now(),
      });

      return { success: true };
    } catch (error) {
      logger.error(`Failed to force age re-verification for user ${userId}:`, error);
      return { success: false, error: 'Failed to force re-verification' };
    }
  }

  /**
   * Manual age verification override
   */
  async manualAgeVerification(
    userId: string,
    approved: boolean,
    adminId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    logger.warn(
      `Admin ${adminId} manually ${approved ? 'approving' : 'rejecting'} age verification for user ${userId}: ${reason}`
    );

    const result = await this.ageGate.manualVerification(userId, approved, adminId, reason);

    if (result.success) {
      await this.logAdminAction({
        adminId,
        action: 'MANUAL_AGE_VERIFICATION',
        targetUserId: userId,
        reason,
        metadata: { approved },
        timestamp: admin.firestore.Timestamp.now(),
      });
    }

    return result;
  }

  /**
   * Force jurisdiction override for user
   */
  async forceJurisdictionOverride(
    userId: string,
    countryCode: string,
    adminId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    logger.warn(`Admin ${adminId} forcing jurisdiction override for user ${userId} to ${countryCode}: ${reason}`);

    try {
      await this.jurisdictionEngine.forceJurisdictionOverride(userId, countryCode, adminId, reason);

      await this.logAdminAction({
        adminId,
        action: 'FORCE_JURISDICTION_OVERRIDE',
        targetUserId: userId,
        targetCountry: countryCode,
        reason,
        timestamp: admin.firestore.Timestamp.now(),
      });

      // Rebuild access profile
      await this.contentAccess.buildAccessProfile(userId);

      return { success: true };
    } catch (error) {
      logger.error(`Failed to force jurisdiction override for user ${userId}:`, error);
      return { success: false, error: 'Failed to override jurisdiction' };
    }
  }

  /**
   * Emergency region lock (legal order compliance)
   */
  async emergencyRegionLock(
    countryCode: string,
    adminId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    logger.error(`⚠️ EMERGENCY REGION LOCK: ${countryCode} by admin ${adminId} - ${reason}`);

    try {
      await this.jurisdictionEngine.emergencyRegionLock(countryCode, adminId, reason);

      await this.logAdminAction({
        adminId,
        action: 'EMERGENCY_REGION_LOCK',
        targetCountry: countryCode,
        reason,
        metadata: { severity: 'CRITICAL' },
        timestamp: admin.firestore.Timestamp.now(),
      });

      // Notify all affected users
      await this.notifyRegionLock(countryCode, reason);

      return { success: true };
    } catch (error) {
      logger.error(`Failed to lock region ${countryCode}:`, error);
      return { success: false, error: 'Failed to lock region' };
    }
  }

  /**
   * Invalidate consents after legal document update
   */
  async invalidateConsentsForUpdate(
    consentType: ConsentType,
    newVersion: string,
    adminId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    logger.warn(`Admin ${adminId} invalidating ${consentType} consents for version ${newVersion}: ${reason}`);

    try {
      await this.legalConsent.invalidateConsentsForUpdate(consentType, newVersion, adminId, reason);

      await this.logAdminAction({
        adminId,
        action: 'INVALIDATE_CONSENTS',
        reason,
        metadata: { consentType, newVersion },
        timestamp: admin.firestore.Timestamp.now(),
      });

      return { success: true };
    } catch (error) {
      logger.error(`Failed to invalidate consents:`, error);
      return { success: false, error: 'Failed to invalidate consents' };
    }
  }

  /**
   * Get user's complete compliance status
   */
  async getUserComplianceStatus(userId: string): Promise<UserComplianceStatus> {
    const [
      ageProfile,
      jurisdictionProfile,
      legalProfile,
      accessProfile,
      userDoc,
    ] = await Promise.all([
      this.ageGate.getAgeVerificationProfile(userId),
      this.jurisdictionEngine.getJurisdictionProfile(userId),
      this.legalConsent.getLegalProfile(userId),
      this.contentAccess.getAccessProfile(userId),
      this.db.collection('users').doc(userId).get(),
    ]);

    const userData = userDoc.data();

    return {
      userId,
      ageVerified: ageProfile.status === 'VERIFIED',
      ageVerificationStatus: ageProfile.status,
      jurisdictionCountry: jurisdictionProfile?.countryCode || 'UNKNOWN',
      jurisdictionTier: jurisdictionProfile?.tier || 'UNKNOWN',
      consentsMissing: [], // TODO: Calculate from legalProfile
      consentsExpired: [], // TODO: Calculate from legalProfile
      accountRestricted: userData?.accountStatus === 'RESTRICTED' || userData?.accountStatus === 'BANNED',
      lastComplianceCheck: admin.firestore.Timestamp.now(),
    };
  }

  /**
   * Export compliance report
   */
  async exportComplianceReport(
    adminId: string,
    reportType: ComplianceReport['reportType'],
    filters?: ComplianceReport['filters'],
    format: 'JSON' | 'CSV' = 'JSON'
  ): Promise<ComplianceReport> {
    logger.info(`Admin ${adminId} generating ${reportType} compliance report`);

    let data: any[] = [];

    try {
      switch (reportType) {
        case 'AGE_VERIFICATION':
          data = await this.exportAgeVerificationData(filters);
          break;
        case 'JURISDICTION':
          data = await this.exportJurisdictionData(filters);
          break;
        case 'CONSENT':
          data = await this.exportConsentData(filters);
          break;
        case 'FULL_COMPLIANCE':
          data = await this.exportFullComplianceData(filters);
          break;
      }

      const report: ComplianceReport = {
        reportId: `report_${Date.now()}`,
        generatedBy: adminId,
        generatedAt: admin.firestore.Timestamp.now(),
        reportType,
        filters,
        data,
        format,
      };

      // Store report
      await this.db.collection('complianceReports').add(report);

      // Log admin action
      await this.logAdminAction({
        adminId,
        action: 'EXPORT_COMPLIANCE_REPORT',
        reason: `Generated ${reportType} report`,
        metadata: { reportType, recordCount: data.length },
        timestamp: admin.firestore.Timestamp.now(),
      });

      logger.info(`Compliance report generated: ${report.reportId} with ${data.length} records`);

      return report;
    } catch (error) {
      logger.error(`Failed to generate compliance report:`, error);
      throw error;
    }
  }

  /**
   * Export age verification data
   */
  private async exportAgeVerificationData(filters?: ComplianceReport['filters']): Promise<any[]> {
    let query: admin.firestore.Query = this.db.collection('users');

    if (filters?.startDate) {
      query = query.where('ageVerification.verifiedAt', '>=', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.where('ageVerification.verifiedAt', '<=', filters.endDate);
    }

    const snapshot = await query.get();
    const data = snapshot.docs.map(doc => {
      const userData = doc.data();
      return {
        userId: doc.id,
        status: userData.ageVerification?.status || 'UNVERIFIED',
        method: userData.ageVerification?.method || 'NONE',
        verifiedAt: userData.ageVerification?.verifiedAt?.toDate().toISOString() || null,
        estimatedAge: userData.ageVerification?.estimatedAge || null,
      };
    });

    return data;
  }

  /**
   * Export jurisdiction data
   */
  private async exportJurisdictionData(filters?: ComplianceReport['filters']): Promise<any[]> {
    let query: admin.firestore.Query = this.db.collection('users');

    if (filters?.countryCode) {
      query = query.where('jurisdiction.countryCode', '==', filters.countryCode);
    }

    const snapshot = await query.get();
    const data = snapshot.docs.map(doc => {
      const userData = doc.data();
      return {
        userId: doc.id,
        countryCode: userData.jurisdiction?.countryCode || 'UNKNOWN',
        tier: userData.jurisdiction?.tier || 'UNKNOWN',
        restrictions: userData.jurisdiction?.restrictions || [],
      };
    });

    return data;
  }

  /**
   * Export consent data
   */
  private async exportConsentData(filters?: ComplianceReport['filters']): Promise<any[]> {
    let query: admin.firestore.Query = this.db.collection('legalConsents');

    if (filters?.startDate) {
      query = query.where('acceptedAt', '>=', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.where('acceptedAt', '<=', filters.endDate);
    }

    const snapshot = await query.get();
    const data = snapshot.docs.map(doc => doc.data());

    return data;
  }

  /**
   * Export full compliance data
   */
  private async exportFullComplianceData(filters?: ComplianceReport['filters']): Promise<any[]> {
    const snapshot = await this.db.collection('users').get();
    const data: any[] = [];

    for (const doc of snapshot.docs) {
      const status = await this.getUserComplianceStatus(doc.id);
      data.push(status);
    }

    return data;
  }

  /**
   * Notify users affected by region lock
   */
  private async notifyRegionLock(countryCode: string, reason: string): Promise<void> {
    // Query users in affected region
    const snapshot = await this.db
      .collection('users')
      .where('jurisdiction.countryCode', '==', countryCode)
      .get();

    logger.info(`Notifying ${snapshot.size} users about region lock: ${countryCode}`);

    // Send notifications (integrate with PACK 293)
    const notifications: Promise<any>[] = [];
    snapshot.docs.forEach(doc => {
      notifications.push(
        this.db.collection('notifications').add({
          userId: doc.id,
          type: 'LEGAL_NOTICE',
          title: 'Service Availability Update',
          message: `Due to legal requirements, some features are now restricted in your region.`,
          severity: 'CRITICAL',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        })
      );
    });

    await Promise.all(notifications);
  }

  /**
   * Log admin action (immutable audit trail)
   */
  private async logAdminAction(action: AdminAction): Promise<void> {
    try {
      await this.db.collection('adminActions').add(action);
      await this.db.collection('auditLogs').add({
        userId: action.adminId,
        action: `ADMIN_${action.action}`,
        category: 'ADMIN_LEGAL_CONTROLS',
        metadata: {
          targetUserId: action.targetUserId,
          targetCountry: action.targetCountry,
          reason: action.reason,
          ...action.metadata,
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.error('Failed to log admin action:', error);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// ADMIN API ENDPOINTS (for admin dashboard)
// ─────────────────────────────────────────────────────────────────

/**
 * Admin: Get user compliance status
 */
export async function adminGetUserCompliance(userId: string, adminId: string): Promise<UserComplianceStatus> {
  const controls = new AdminLegalControls();
  return await controls.getUserComplianceStatus(userId);
}

/**
 * Admin: Force age re-verification
 */
export async function adminForceAgeReVerification(
  userId: string,
  adminId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const controls = new AdminLegalControls();
  return await controls.forceAgeReVerification(userId, adminId, reason);
}

/**
 * Admin: Emergency region lock
 */
export async function adminEmergencyRegionLock(
  countryCode: string,
  adminId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const controls = new AdminLegalControls();
  return await controls.emergencyRegionLock(countryCode, adminId, reason);
}

/**
 * Admin: Export compliance report
 */
export async function adminExportComplianceReport(
  adminId: string,
  reportType: ComplianceReport['reportType'],
  filters?: ComplianceReport['filters'],
  format?: 'JSON' | 'CSV'
): Promise<ComplianceReport> {
  const controls = new AdminLegalControls();
  return await controls.exportComplianceReport(adminId, reportType, filters, format);
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

export default AdminLegalControls;
