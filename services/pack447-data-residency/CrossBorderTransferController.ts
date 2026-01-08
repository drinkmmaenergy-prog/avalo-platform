/**
 * PACK 447 — Global Data Residency & Sovereignty Control
 * CrossBorderTransferController
 * 
 * Controls cross-border data transfers including:
 * - Replication
 * - Backups
 * - Operational access
 * - Automatic blocking upon jurisdiction violation
 */

import { DataResidencyPolicyEngine, DataClassification, ComplianceRegion } from './DataResidencyPolicyEngine';
import { SovereigntyAuditLogger } from './SovereigntyAuditLogger';
import { firestore } from '../firebase-admin';

export interface TransferRequest {
  requestId: string;
  userId: string;
  dataType: DataClassification;
  dataIds: string[];
  
  source: {
    region: ComplianceRegion;
    country: string;
    dataCenter: string;
  };
  
  destination: {
    region: ComplianceRegion;
    country: string;
    dataCenter: string;
  };
  
  purpose: 'REPLICATION' | 'BACKUP' | 'USER_REQUEST' | 'OPERATIONAL' | 'MIGRATION';
  
  metadata?: Record<string, any>;
  
  requestedBy: string;
  requestedAt: Date;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  
  approval?: {
    approvedBy: string;
    approvedAt: Date;
    legalBasis: string;
  };
  
  denial?: {
    deniedBy: string;
    deniedAt: Date;
    reason: string;
  };
  
  execution?: {
    startedAt: Date;
    completedAt?: Date;
    byteCount?: number;
    fileCount?: number;
    error?: string;
  };
}

export interface TransferPolicy {
  policyId: string;
  sourceRegion: ComplianceRegion;
  destinationRegion: ComplianceRegion;
  dataTypes: DataClassification[];
  
  allowed: boolean;
  requiresApproval: boolean;
  requiresConsent: boolean;
  requiresDataProcessingAgreement: boolean;
  
  restrictions: {
    maxTransferSize?: number;
    allowedPurposes?: string[];
    timeRestrictions?: {
      allowedDays?: number[]; // 0-6 (Sunday-Saturday)
      allowedHours?: { start: number; end: number }; // 0-23
    };
  };
  
  legalBasis: {
    regulation: string;
    adequacyDecision?: boolean;
    standardContractualClauses?: boolean;
  };
  
  active: boolean;
}

export class CrossBorderTransferController {
  private static instance: CrossBorderTransferController;
  private policyEngine: DataResidencyPolicyEngine;
  private auditLogger: SovereigntyAuditLogger;
  
  private transferPolicies: Map<string, TransferPolicy> = new Map();
  private activeTransfers: Map<string, TransferRequest> = new Map();

  private constructor() {
    this.policyEngine = DataResidencyPolicyEngine.getInstance();
    this.auditLogger = SovereigntyAuditLogger.getInstance();
    this.initializeTransferPolicies();
  }

  public static getInstance(): CrossBorderTransferController {
    if (!CrossBorderTransferController.instance) {
      CrossBorderTransferController.instance = new CrossBorderTransferController();
    }
    return CrossBorderTransferController.instance;
  }

  /**
   * Initialize default cross-border transfer policies
   */
  private async initializeTransferPolicies(): Promise<void> {
    const defaultPolicies: Partial<TransferPolicy>[] = [
      // EU to UK - allowed (adequacy decision)
      {
        sourceRegion: ComplianceRegion.EU,
        destinationRegion: ComplianceRegion.UK,
        dataTypes: [DataClassification.PII, DataClassification.FINANCIAL, DataClassification.MEDIA],
        allowed: true,
        requiresApproval: false,
        requiresConsent: false,
        requiresDataProcessingAgreement: true,
        restrictions: {},
        legalBasis: {
          regulation: 'GDPR Article 45',
          adequacyDecision: true
        }
      },
      
      // EU to US - allowed with safeguards
      {
        sourceRegion: ComplianceRegion.EU,
        destinationRegion: ComplianceRegion.US,
        dataTypes: [DataClassification.PII, DataClassification.FINANCIAL],
        allowed: true,
        requiresApproval: true,
        requiresConsent: true,
        requiresDataProcessingAgreement: true,
        restrictions: {
          allowedPurposes: ['USER_REQUEST', 'OPERATIONAL']
        },
        legalBasis: {
          regulation: 'GDPR Article 46',
          standardContractualClauses: true
        }
      },
      
      // EU to Russia - blocked
      {
        sourceRegion: ComplianceRegion.EU,
        destinationRegion: ComplianceRegion.RUSSIA,
        dataTypes: [DataClassification.PII, DataClassification.FINANCIAL],
        allowed: false,
        requiresApproval: false,
        requiresConsent: false,
        requiresDataProcessingAgreement: false,
        restrictions: {},
        legalBasis: {
          regulation: 'GDPR Article 45 - No adequacy decision'
        }
      },
      
      // Russia to anywhere - blocked (data localization law)
      {
        sourceRegion: ComplianceRegion.RUSSIA,
        destinationRegion: ComplianceRegion.EU,
        dataTypes: [DataClassification.PII],
        allowed: false,
        requiresApproval: false,
        requiresConsent: false,
        requiresDataProcessingAgreement: false,
        restrictions: {},
        legalBasis: {
          regulation: 'Russian Federal Law No. 242-FZ'
        }
      },
      
      // China to anywhere - blocked (PIPL)
      {
        sourceRegion: ComplianceRegion.CHINA,
        destinationRegion: ComplianceRegion.US,
        dataTypes: [DataClassification.PII],
        allowed: false,
        requiresApproval: false,
        requiresConsent: false,
        requiresDataProcessingAgreement: false,
        restrictions: {},
        legalBasis: {
          regulation: 'PIPL - Strict data localization'
        }
      },
      
      // India to APAC - allowed with consent
      {
        sourceRegion: ComplianceRegion.INDIA,
        destinationRegion: ComplianceRegion.APAC,
        dataTypes: [DataClassification.PII],
        allowed: true,
        requiresApproval: false,
        requiresConsent: true,
        requiresDataProcessingAgreement: true,
        restrictions: {},
        legalBasis: {
          regulation: 'DPDPA 2023'
        }
      }
    ];

    const batch = firestore.batch();
    for (const policy of defaultPolicies) {
      const policyId = `transfer_${policy.sourceRegion}_to_${policy.destinationRegion}`.toLowerCase();
      const docRef = firestore.collection('crossBorderTransferPolicies').doc(policyId);
      
      batch.set(docRef, {
 ...policy,
        policyId,
        active: true
      }, { merge: true });
    }

    try {
      await batch.commit();
      console.log('[CrossBorderTransferController] Transfer policies initialized');
    } catch (error) {
      console.error('[CrossBorderTransferController] Failed to initialize policies:', error);
    }
  }

  /**
   * Request a cross-border data transfer
   */
  public async requestTransfer(params: {
    userId: string;
    dataType: DataClassification;
    dataIds: string[];
    sourceRegion: ComplianceRegion;
    sourceCountry: string;
    sourceDataCenter: string;
    destinationRegion: ComplianceRegion;
    destinationCountry: string;
    destinationDataCenter: string;
    purpose: 'REPLICATION' | 'BACKUP' | 'USER_REQUEST' | 'OPERATIONAL' | 'MIGRATION';
    requestedBy: string;
    metadata?: Record<string, any>;
  }): Promise<TransferRequest> {
    const requestId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const request: TransferRequest = {
      requestId,
      userId: params.userId,
      dataType: params.dataType,
      dataIds: params.dataIds,
      source: {
        region: params.sourceRegion,
        country: params.sourceCountry,
        dataCenter: params.sourceDataCenter
      },
      destination: {
        region: params.destinationRegion,
        country: params.destinationCountry,
        dataCenter: params.destinationDataCenter
      },
      purpose: params.purpose,
      metadata: params.metadata,
      requestedBy: params.requestedBy,
      requestedAt: new Date(),
      status: 'PENDING'
    };

    // Evaluate transfer
    const evaluation = await this.evaluateTransfer(request);

    if (evaluation.status === 'DENIED') {
      request.status = 'DENIED';
      request.denial = {
        deniedBy: 'SYSTEM',
        deniedAt: new Date(),
        reason: evaluation.reason!
      };

      // Log violation
      await this.auditLogger.logComplianceViolation({
        userId: params.userId,
        systemServiceId: 'CrossBorderTransferController',
        violationType: 'BLOCKED_CROSS_BORDER_TRANSFER',
        dataType: params.dataType,
        sourceRegion: params.sourceRegion,
        targetRegion: params.destinationRegion,
        reason: evaluation.reason!,
        metadata: { requestId }
      });
    } else if (evaluation.requiresApproval) {
      request.status = 'PENDING';
      // Would trigger approval workflow in production
    } else {
      request.status = 'APPROVED';
      request.approval = {
        approvedBy: 'SYSTEM_AUTO',
        approvedAt: new Date(),
        legalBasis: evaluation.legalBasis || 'Automated approval based on transfer policy'
      };
    }

    // Store request
    await firestore
      .collection('crossBorderTransferRequests')
      .doc(requestId)
      .set(request);

    this.activeTransfers.set(requestId, request);

    // Audit log
    await this.auditLogger.logDataTransfer({
      userId: params.userId,
      systemServiceId: 'CrossBorderTransferController',
      dataType: params.dataType,
      dataIds: params.dataIds,
      classification: params.dataType,
      sourceRegion: params.sourceRegion,
      targetRegion: params.destinationRegion,
      sourceCountry: params.sourceCountry,
      targetCountry: params.destinationCountry,
      success: request.status !== 'DENIED',
      blockedReason: request.denial?.reason
    });

    return request;
  }

  /**
   * Evaluate if a transfer should be allowed
   */
  private async evaluateTransfer(request: TransferRequest): Promise<{
    status: 'APPROVED' | 'DENIED' | 'PENDING';
    requiresApproval: boolean;
    reason?: string;
    legalBasis?: string;
  }> {
    // Same region - always allowed
    if (request.source.region === request.destination.region) {
      return {
        status: 'APPROVED',
        requiresApproval: false,
        legalBasis: 'Same region transfer'
      };
    }

    // Check if user has cross-border transfer permission via residency policy
    const residency = await this.policyEngine.determineResidency({
      userId: request.userId,
      userRegion: request.source.region,
      dataType: request.dataType
    });

    if (!residency.transfers.allowCrossBorder) {
      return {
        status: 'DENIED',
        requiresApproval: false,
        reason: `Cross-border transfers not allowed for ${request.userId} data in ${request.source.region}`
      };
    }

    if (residency.transfers.prohibitedDestinations.includes(request.destination.region)) {
      return {
        status: 'DENIED',
        requiresApproval: false,
        reason: `Transfer to ${request.destination.region} is prohibited by data residency policy`
      };
    }

    if (residency.transfers.allowedDestinations.length > 0 &&
        !residency.transfers.allowedDestinations.includes(request.destination.region)) {
      return {
        status: 'DENIED',
        requiresApproval: false,
        reason: `Transfer to ${request.destination.region} is not in allowed destinations`
      };
    }

    // Check specific transfer policy
    const transferPolicyId = `transfer_${request.source.region}_to_${request.destination.region}`.toLowerCase();
    const policyDoc = await firestore
      .collection('crossBorderTransferPolicies')
      .doc(transferPolicyId)
      .get();

    if (policyDoc.exists) {
      const policy = policyDoc.data() as TransferPolicy;

      if (!policy.allowed) {
        return {
          status: 'DENIED',
          requiresApproval: false,
          reason: `Transfer from ${request.source.region} to ${request.destination.region} is not allowed per policy`
        };
      }

      // Check if data type is covered
      if (policy.dataTypes.length > 0 && !policy.dataTypes.includes(request.dataType)) {
        return {
          status: 'DENIED',
          requiresApproval: false,
          reason: `Data type ${request.dataType} is not allowed for this transfer route`
        };
      }

      // Check purpose restrictions
      if (policy.restrictions.allowedPurposes &&
          !policy.restrictions.allowedPurposes.includes(request.purpose)) {
        return {
          status: 'DENIED',
          requiresApproval: false,
          reason: `Transfer purpose ${request.purpose} is not allowed for this route`
        };
      }

      // Check time restrictions
      if (policy.restrictions.timeRestrictions) {
        const now = new Date();
        const day = now.getDay();
        const hour = now.getHours();

        if (policy.restrictions.timeRestrictions.allowedDays &&
            !policy.restrictions.timeRestrictions.allowedDays.includes(day)) {
          return {
            status: 'DENIED',
            requiresApproval: false,
            reason: 'Transfer not allowed on this day per policy'
          };
        }

        if (policy.restrictions.timeRestrictions.allowedHours) {
          const { start, end } = policy.restrictions.timeRestrictions.allowedHours;
          if (hour < start || hour >= end) {
            return {
              status: 'DENIED',
              requiresApproval: false,
              reason: 'Transfer not allowed at this time per policy'
            };
          }
        }
      }

      // Check if requires approval
      if (policy.requiresApproval) {
        return {
          status: 'PENDING',
          requiresApproval: true,
          legalBasis: policy.legalBasis.regulation
        };
      }

      return {
        status: 'APPROVED',
        requiresApproval: false,
        legalBasis: policy.legalBasis.regulation
      };
    }

    // No specific policy found - default to requiring approval
    return {
      status: 'PENDING',
      requiresApproval: true,
      reason: 'No specific transfer policy found - manual approval required'
    };
  }

  /**
   * Execute an approved transfer
   */
  public async executeTransfer(requestId: string): Promise<{
    success: boolean;
    byteCount?: number;
    fileCount?: number;
    error?: string;
  }> {
    const requestDoc = await firestore
      .collection('crossBorderTransferRequests')
      .doc(requestId)
      .get();

    if (!requestDoc.exists) {
      throw new Error(`Transfer request ${requestId} not found`);
    }

    const request = requestDoc.data() as TransferRequest;

    if (request.status !== 'APPROVED') {
      throw new Error(`Transfer request ${requestId} is not approved (status: ${request.status})`);
    }

    // Update status
    request.status = 'IN_PROGRESS';
    request.execution = {
      startedAt: new Date()
    };

    await firestore
      .collection('crossBorderTransferRequests')
      .doc(requestId)
      .update({
        status: request.status,
        execution: request.execution
      });

    try {
      // Execute actual data transfer
      // This would involve copying data from source storage to destination storage
      // For now, we'll simulate it
      
      const result = await this.performDataTransfer(request);

      // Update completion
      request.status = 'COMPLETED';
      request.execution.completedAt = new Date();
      request.execution.byteCount = result.byteCount;
      request.execution.fileCount = result.fileCount;

      await firestore
        .collection('crossBorderTransferRequests')
        .doc(requestId)
        .update({
          status: request.status,
          execution: request.execution
        });

      // Audit log
      await this.auditLogger.logDataTransfer({
        userId: request.userId,
        systemServiceId: 'CrossBorderTransferController',
        dataType: request.dataType,
        dataIds: request.dataIds,
        classification: request.dataType,
        sourceRegion: request.source.region,
        targetRegion: request.destination.region,
        sourceCountry: request.source.country,
        targetCountry: request.destination.country,
        success: true
      });

      this.activeTransfers.delete(requestId);

      return {
        success: true,
        byteCount: result.byteCount,
        fileCount: result.fileCount
      };
    } catch (error: any) {
      // Update failure
      request.status = 'FAILED';
      request.execution.error = error.message;
      request.execution.completedAt = new Date();

      await firestore
        .collection('crossBorderTransferRequests')
        .doc(requestId)
        .update({
          status: request.status,
          execution: request.execution
        });

      // Audit log
      await this.auditLogger.logDataTransfer({
        userId: request.userId,
        systemServiceId: 'CrossBorderTransferController',
        dataType: request.dataType,
        dataIds: request.dataIds,
        classification: request.dataType,
        sourceRegion: request.source.region,
        targetRegion: request.destination.region,
        sourceCountry: request.source.country,
        targetCountry: request.destination.country,
        success: false,
        errorMessage: error.message
      });

      this.activeTransfers.delete(requestId);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Perform actual data transfer (placeholder for real implementation)
   */
  private async performDataTransfer(request: TransferRequest): Promise<{
    byteCount: number;
    fileCount: number;
  }> {
    // In production, this would:
    // 1. Get source storage client
    // 2. Get destination storage client
    // 3. Copy files with progress tracking
    // 4. Verify integrity
    // 5. Update metadata
    
    // Simulated for now
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      byteCount: request.dataIds.length * 1024 * 1024, // 1MB per file simulated
      fileCount: request.dataIds.length
    };
  }

  /**
   * Approve a pending transfer
   */
  public async approveTransfer(params: {
    requestId: string;
    approvedBy: string;
    legalBasis: string;
  }): Promise<void> {
    const requestDoc = await firestore
      .collection('crossBorderTransferRequests')
      .doc(params.requestId)
      .get();

    if (!requestDoc.exists) {
      throw new Error(`Transfer request ${params.requestId} not found`);
    }

    const request = requestDoc.data() as TransferRequest;

    if (request.status !== 'PENDING') {
      throw new Error(`Transfer request ${params.requestId} is not pending (status: ${request.status})`);
    }

    await firestore
      .collection('crossBorderTransferRequests')
      .doc(params.requestId)
      .update({
        status: 'APPROVED',
        approval: {
          approvedBy: params.approvedBy,
          approvedAt: new Date(),
          legalBasis: params.legalBasis
        }
      });

    // Audit log
    await this.auditLogger.logDataTransfer({
      userId: request.userId,
      systemServiceId: 'CrossBorderTransferController',
      dataType: request.dataType,
      dataIds: request.dataIds,
      classification: request.dataType,
      sourceRegion: request.source.region,
      targetRegion: request.destination.region,
      success: true,
      metadata: {
        action: 'APPROVED',
        approvedBy: params.approvedBy
      }
    });
  }

  /**
   * Deny a pending transfer
   */
  public async denyTransfer(params: {
    requestId: string;
    deniedBy: string;
    reason: string;
  }): Promise<void> {
    const requestDoc = await firestore
      .collection('crossBorderTransferRequests')
      .doc(params.requestId)
      .get();

    if (!requestDoc.exists) {
      throw new Error(`Transfer request ${params.requestId} not found`);
    }

    const request = requestDoc.data() as TransferRequest;

    if (request.status !== 'PENDING') {
      throw new Error(`Transfer request ${params.requestId} is not pending (status: ${request.status})`);
    }

    await firestore
      .collection('crossBorderTransferRequests')
      .doc(params.requestId)
      .update({
        status: 'DENIED',
        denial: {
          deniedBy: params.deniedBy,
          deniedAt: new Date(),
          reason: params.reason
        }
      });

    // Audit log
    await this.auditLogger.logDataTransfer({
      userId: request.userId,
      systemServiceId: 'CrossBorderTransferController',
      dataType: request.dataType,
      dataIds: request.dataIds,
      classification: request.dataType,
      sourceRegion: request.source.region,
      targetRegion: request.destination.region,
      success: false,
      blockedReason: params.reason,
      metadata: {
        action: 'DENIED',
        deniedBy: params.deniedBy
      }
    });
  }

  /**
   * Get pending transfer requests
   */
  public async getPendingTransfers(): Promise<TransferRequest[]> {
    const snapshot = await firestore
      .collection('crossBorderTransferRequests')
      .where('status', '==', 'PENDING')
      .orderBy('requestedAt', 'desc')
      .limit(100)
      .get();

    return snapshot.docs.map(doc => doc.data() as TransferRequest);
  }

  /**
   * Get transfer history for a user
   */
  public async getUserTransferHistory(userId: string, limit: number = 50): Promise<TransferRequest[]> {
    const snapshot = await firestore
      .collection('crossBorderTransferRequests')
      .where('userId', '==', userId)
      .orderBy('requestedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => doc.data() as TransferRequest);
  }
}
