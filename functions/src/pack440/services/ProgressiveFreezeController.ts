/**
 * PACK 440: Creator Revenue Integrity & Payout Freezing Framework
 * Module: Progressive Freeze Controller
 * 
 * Manages granular payout freezing:
 * - Per-payout freezes
 * - Wallet segment freezes
 * - Revenue source freezes
 * - Temporary with clear release paths
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { CreatorRevenueIntegrityScoreService } from './CreatorRevenueIntegrityScore';

type Firestore = admin.firestore.Firestore;

export type FreezeType = 'PAYOUT' | 'WALLET_SEGMENT' | 'REVENUE_SOURCE' | 'ACCOUNT';
export type FreezeStatus = 'ACTIVE' | 'RELEASED' | 'ESCALATED';
export type FreezeSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ReleaseConditionType = 'TIME_BASED' | 'MANUAL_REVIEW' | 'CONDITION_MET';

export interface FreezeReason {
  code: string;
  severity: FreezeSeverity;
  publicMessage: string; // Creator-facing
  internalNotes: string; // Staff-only
}

export interface ReleaseConditions {
  type: ReleaseConditionType;
  estimatedReleaseTime?: Timestamp;
  conditions: string[];
  progress: number; // 0-100
}

export interface PayoutFreeze {
  freezeId: string;
  creatorId: string;
  payoutId?: string;
  freezeType: FreezeType;
  status: FreezeStatus;
  reason: FreezeReason;
  affectedAmount: number;
  releaseConditions: ReleaseConditions;
  timeline: {
    frozenAt: Timestamp;
    estimatedRelease?: Timestamp;
    actualRelease?: Timestamp;
    lastReviewedAt?: Timestamp;
  };
  escalation?: {
    escalatedAt: Timestamp;
    escalatedTo: string;
    caseId: string;
  };
  auditTrail: Array<{
    timestamp: Timestamp;
    action: string;
    actor: string;
    details: any;
  }>;
}

export interface FreezeEvaluationResult {
  shouldFreeze: boolean;
  freezeType: FreezeType;
  reason: FreezeReason;
  severity: FreezeSeverity;
  affectedAmount: number;
  estimatedReleaseHours?: number;
}

export class ProgressiveFreezeController {
  private db: Firestore;
  private integrityService: CreatorRevenueIntegrityScoreService;
  
  constructor(db: Firestore, integrityService: CreatorRevenueIntegrityScoreService) {
    this.db = db;
    this.integrityService = integrityService;
  }
  
  /**
   * Evaluate if a payout should be frozen
   */
  async evaluateFreeze(
    creatorId: string,
    payoutId: string,
    amount: number
  ): Promise<FreezeEvaluationResult | null> {
    const integrity = await this.integrityService.getScore(creatorId);
    
    if (!integrity) {
      // Calculate score if not exists
      await this.integrityService.calculateScore(creatorId);
      return null; // Don't freeze on first evaluation
    }
    
    const triggers: FreezeEvaluationResult[] = [];
    
    // Check for chargeback spike
    if (integrity.scoreComponents.chargebackExposure < 30) {
      triggers.push({
        shouldFreeze: true,
        freezeType: 'PAYOUT',
        reason: {
          code: 'HIGH_CHARGEBACK_RISK',
          severity: 'HIGH',
          publicMessage: 'Your payout is under review due to recent payment disputes',
          internalNotes: `Chargeback exposure score: ${integrity.scoreComponents.chargebackExposure}`
        },
        severity: 'HIGH',
        affectedAmount: amount,
        estimatedReleaseHours: 72
      });
    }
    
    // Check for refund ratio spike
    if (integrity.scoreComponents.refundRatio < 40) {
      triggers.push({
        shouldFreeze: true,
        freezeType: 'REVENUE_SOURCE',
        reason: {
          code: 'HIGH_REFUND_RATIO',
          severity: 'MEDIUM',
          publicMessage: 'Payout delayed while we review recent refund activity',
          internalNotes: `Refund ratio score: ${integrity.scoreComponents.refundRatio}`
        },
        severity: 'MEDIUM',
        affectedAmount: amount,
        estimatedReleaseHours: 48
      });
    }
    
    // Check for new account with large payout
    if (integrity.scoreComponents.accountAge < 30 && amount > 1000) {
      triggers.push({
        shouldFreeze: true,
        freezeType: 'PAYOUT',
        reason: {
          code: 'NEW_ACCOUNT_LARGE_PAYOUT',
          severity: 'MEDIUM',
          publicMessage: 'First large payout requires additional verification',
          internalNotes: `Account age score: ${integrity.scoreComponents.accountAge}, Amount: ${amount}`
        },
        severity: 'MEDIUM',
        affectedAmount: amount,
        estimatedReleaseHours: 48
      });
    }
    
    // Check for payer concentration risk
    if (integrity.scoreComponents.payerConcentration < 30) {
      triggers.push({
        shouldFreeze: true,
        freezeType: 'PAYOUT',
        reason: {
          code: 'CONCENTRATED_PAYERS',
          severity: 'LOW',
          publicMessage: 'Routine verification in progress',
          internalNotes: `Payer concentration score: ${integrity.scoreComponents.payerConcentration}`
        },
        severity: 'LOW',
        affectedAmount: amount,
        estimatedReleaseHours: 24
      });
    }
    
    // Check for volatile revenue pattern
    if (integrity.scoreComponents.transactionVelocity < 30) {
      triggers.push({
        shouldFreeze: true,
        freezeType: 'PAYOUT',
        reason: {
          code: 'VOLATILE_REVENUE_PATTERN',
          severity: 'LOW',
          publicMessage: 'Reviewing unusual payment patterns',
          internalNotes: `Transaction velocity score: ${integrity.scoreComponents.transactionVelocity}`
        },
        severity: 'LOW',
        affectedAmount: amount,
        estimatedReleaseHours: 24
      });
    }
    
    // Check for recent chargeback spike
    if (integrity.flags.includes('RECENT_CHARGEBACK_SPIKE')) {
      triggers.push({
        shouldFreeze: true,
        freezeType: 'ACCOUNT',
        reason: {
          code: 'RECENT_CHARGEBACK_SPIKE',
          severity: 'CRITICAL',
          publicMessage: 'All payouts temporarily frozen pending dispute resolution',
          internalNotes: 'Multiple chargebacks in last 7 days'
        },
        severity: 'CRITICAL',
        affectedAmount: amount,
        estimatedReleaseHours: 168 // 7 days
      });
    }
    
    // Return highest severity trigger
    if (triggers.length > 0) {
      return triggers.sort((a, b) => {
        const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      })[0];
    }
    
    return null; // No freeze needed
  }
  
  /**
   * Create a freeze
   */
  async createFreeze(
    creatorId: string,
    evaluation: FreezeEvaluationResult,
    payoutId?: string
  ): Promise<PayoutFreeze> {
    const freezeId = this.generateFreezeId();
    const now = Timestamp.now();
    
    const estimatedRelease = evaluation.estimatedReleaseHours
      ? Timestamp.fromMillis(now.toMillis() + evaluation.estimatedReleaseHours * 60 * 60 * 1000)
      : undefined;
    
    const freeze: PayoutFreeze = {
      freezeId,
      creatorId,
      payoutId,
      freezeType: evaluation.freezeType,
      status: 'ACTIVE',
      reason: evaluation.reason,
      affectedAmount: evaluation.affectedAmount,
      releaseConditions: {
        type: evaluation.severity === 'CRITICAL' ? 'MANUAL_REVIEW' : 'TIME_BASED',
        estimatedReleaseTime: estimatedRelease,
        conditions: this.generateConditions(evaluation),
        progress: 0
      },
      timeline: {
        frozenAt: now,
        estimatedRelease
      },
      auditTrail: [{
        timestamp: now,
        action: 'FREEZE_CREATED',
        actor: 'ProgressiveFreezeController',
        details: { evaluation }
      }]
    };
    
    // Save to Firestore
    await this.db.collection('payout_freezes').doc(freezeId).set(freeze);
    
    // Update payout escrow status if specific payout
    if (payoutId) {
      await this.db.collection('payout_escrow').doc(payoutId).update({
        status: 'FROZEN',
        freezeId,
        'metadata.updatedAt': Timestamp.now()
      });
    }
    
    // Auto-escalate if CRITICAL
    if (evaluation.severity === 'CRITICAL') {
      await this.escalateToCompliance(freeze);
    }
    
    // Log audit event
    await this.logAuditEvent(freeze, 'FREEZE_CREATED');
    
    return freeze;
  }
  
  /**
   * Release a freeze
   */
  async releaseFreeze(freezeId: string, releasedBy: string, notes: string): Promise<void> {
    const freezeRef = this.db.collection('payout_freezes').doc(freezeId);
    const freezeDoc = await freezeRef.get();
    
    if (!freezeDoc.exists) {
      throw new Error(`Freeze ${freezeId} not found`);
    }
    
    const freeze = freezeDoc.data() as PayoutFreeze;
    
    if (freeze.status !== 'ACTIVE') {
      throw new Error(`Freeze ${freezeId} is not active (status: ${freeze.status})`);
    }
    
    const now = Timestamp.now();
    
    // Update freeze status
    await freezeRef.update({
      status: 'RELEASED',
      'timeline.actualRelease': now,
      'timeline.lastReviewedAt': now,
      'releaseConditions.progress': 100,
      auditTrail: admin.firestore.FieldValue.arrayUnion({
        timestamp: now,
        action: 'FREEZE_RELEASED',
        actor: releasedBy,
        details: { notes }
      })
    });
    
    // Update payout escrow if applicable
    if (freeze.payoutId) {
      await this.db.collection('payout_escrow').doc(freeze.payoutId).update({
        status: 'IN_ESCROW',
        'metadata.updatedAt': now
      });
    }
    
    // Log audit event
    await this.logAuditEvent(freeze, 'FREEZE_RELEASED', { releasedBy, notes });
  }
  
  /**
   * Update freeze progress
   */
  async updateFreezeProgress(
    freezeId: string,
    progress: number,
    updatedBy: string,
    notes: string
  ): Promise<void> {
    const freezeRef = this.db.collection('payout_freezes').doc(freezeId);
    
    await freezeRef.update({
      'releaseConditions.progress': Math.min(100, Math.max(0, progress)),
      'timeline.lastReviewedAt': Timestamp.now(),
      auditTrail: admin.firestore.FieldValue.arrayUnion({
        timestamp: Timestamp.now(),
        action: 'PROGRESS_UPDATED',
        actor: updatedBy,
        details: { progress, notes }
      })
    });
    
    // Auto-release if progress reaches 100%
    if (progress >= 100) {
      await this.releaseFreeze(freezeId, 'AUTO', 'All conditions met');
    }
  }
  
  /**
   * Escalate to compliance
   */
  async escalateToCompliance(freeze: PayoutFreeze): Promise<string> {
    const caseId = this.generateCaseId();
    
    // Create compliance escalation (ComplianceEscalationOrchestrator integration)
    await this.db.collection('compliance_escalations').doc(caseId).set({
      caseId,
      creatorId: freeze.creatorId,
      type: 'PAYOUT_FREEZE',
      severity: freeze.reason.severity,
      status: 'OPEN',
      department: 'COMPLIANCE',
      details: {
        description: freeze.reason.internalNotes,
        affectedPayouts: freeze.payoutId ? [freeze.payoutId] : [],
        affectedAmount: freeze.affectedAmount,
        riskFactors: [freeze.reason.code]
      },
      timeline: {
        createdAt: Timestamp.now(),
        slaDeadline: Timestamp.fromMillis(
          Date.now() + 24 * 60 * 60 * 1000 // 24 hour SLA
        )
      },
      actions: [],
      auditLog: [{
        timestamp: Timestamp.now(),
        event: 'CASE_CREATED_FROM_FREEZE',
        data: { freezeId: freeze.freezeId }
      }]
    });
    
    // Update freeze with escalation info
    await this.db.collection('payout_freezes').doc(freeze.freezeId).update({
      status: 'ESCALATED',
      escalation: {
        escalatedAt: Timestamp.now(),
        escalatedTo: 'COMPLIANCE',
        caseId
      }
    });
    
    return caseId;
  }
  
  /**
   * Get freeze by ID
   */
  async getFreeze(freezeId: string): Promise<PayoutFreeze | null> {
    const doc = await this.db.collection('payout_freezes').doc(freezeId).get();
    return doc.exists ? (doc.data() as PayoutFreeze) : null;
  }
  
  /**
   * Get all active freezes for a creator
   */
  async getCreatorFreezes(creatorId: string): Promise<PayoutFreeze[]> {
    const snapshot = await this.db
      .collection('payout_freezes')
      .where('creatorId', '==', creatorId)
      .where('status', '==', 'ACTIVE')
      .get();
    
    return snapshot.docs.map(doc => doc.data() as PayoutFreeze);
  }
  
  /**
   * Get freezes ready for auto-release
   */
  async getFreezesReadyForRelease(): Promise<PayoutFreeze[]> {
    const now = Timestamp.now();
    
    const snapshot = await this.db
      .collection('payout_freezes')
      .where('status', '==', 'ACTIVE')
      .where('releaseConditions.type', '==', 'TIME_BASED')
      .where('timeline.estimatedRelease', '<=', now)
      .get();
    
    return snapshot.docs.map(doc => doc.data() as PayoutFreeze);
  }
  
  /**
   * Generate freeze conditions
   */
  private generateConditions(evaluation: FreezeEvaluationResult): string[] {
    const conditions: string[] = [];
    
    switch (evaluation.reason.code) {
      case 'HIGH_CHARGEBACK_RISK':
        conditions.push('No new chargebacks for 72 hours');
        conditions.push('Compliance team review');
        break;
      case 'HIGH_REFUND_RATIO':
        conditions.push('Refund rate stabilizes below 10%');
        conditions.push('48 hour observation period');
        break;
      case 'NEW_ACCOUNT_LARGE_PAYOUT':
        conditions.push('KYC verification completed');
        conditions.push('Manual review by finance team');
        break;
      case 'CONCENTRATED_PAYERS':
        conditions.push('Verify payer identities');
        conditions.push('24 hour review period');
        break;
      case 'RECENT_CHARGEBACK_SPIKE':
        conditions.push('All chargebacks resolved');
        conditions.push('Legal team approval');
        conditions.push('7 day cooldown period');
        break;
      default:
        conditions.push('Manual review required');
    }
    
    return conditions;
  }
  
  /**
   * Generate unique freeze ID
   */
  private generateFreezeId(): string {
    return `freeze_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
  
  /**
   * Generate unique case ID
   */
  private generateCaseId(): string {
    return `case_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
  
  /**
   * Log audit event
   */
  private async logAuditEvent(
    freeze: PayoutFreeze,
    event: string,
    additionalData?: any
  ): Promise<void> {
    await this.db.collection('audit_logs_pack440').add({
      type: 'PAYOUT_FREEZE',
      event,
      freezeId: freeze.freezeId,
      creatorId: freeze.creatorId,
      payoutId: freeze.payoutId,
      timestamp: Timestamp.now(),
      ...additionalData
    });
  }
}
