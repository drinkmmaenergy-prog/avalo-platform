/**
 * PACK 440: Creator Revenue Integrity & Payout Freezing Framework
 * Module: Intelligent Payout Escrow Service
 * 
 * Manages risk-adjusted escrowholding periods for creator payouts
 * - Automatic escrow period calculation based on integrity score
 * - Escrow shortening for trusted creators
 * - Escrow extension for high-risk scenarios
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { CreatorRevenueIntegrityScoreService } from './CreatorRevenueIntegrityScore';

type Firestore = admin.firestore.Firestore;

export interface PayoutEscrow {
  payoutId: string;
  creatorId: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'IN_ESCROW' | 'RELEASED' | 'FROZEN' | 'DISPUTED';
  escrowPeriod: {
    startTime: Timestamp;
    plannedReleaseTime: Timestamp;
    actualReleaseTime?: Timestamp;
    cooldownHours: number;
    extensionReason?: string;
  };
  integrityScore: number;
  riskFactors: string[];
  revenueBreakdown: {
    subscriptions: number;
    media: number;
    calls: number;
  };
  complianceChecks: {
    amlPassed: boolean;
    fraudChecked: boolean;
    chargebackReview: boolean;
  };
  metadata: {
    createdAt: Timestamp;
    updatedAt: Timestamp;
    processedBy: string;
  };
}

export interface CreatePayoutRequest {
  creatorId: string;
  amount: number;
  currency: string;
  revenueBreakdown: {
    subscriptions: number;
    media: number;
    calls: number;
  };
}

export class IntelligentPayoutEscrowService {
  private db: Firestore;
  private integrityService: CreatorRevenueIntegrityScoreService;
  
  // Escrow period thresholds (in hours)
  private readonly ESCROW_PERIODS = {
    EXCELLENT: 12,    // Score >= 800
    GOOD: 24,         // Score >= 700
    FAIR: 48,         // Score >= 600
    CONCERNING: 72,   // Score >= 500
    HIGH_RISK: 120,   // Score >= 400
    CRITICAL: 168     // Score < 400 (7 days)
  };
  
  // Amount-based risk adjustments
  private readonly AMOUNT_THRESHOLDS = {
    SMALL: 100,       // < $100
    MEDIUM: 1000,     // < $1,000
    LARGE: 5000,      // < $5,000
    VERY_LARGE: 10000 // >= $10,000
  };
  
  constructor(db: Firestore, integrityService: CreatorRevenueIntegrityScoreService) {
    this.db = db;
    this.integrityService = integrityService;
  }
  
  /**
   * Create payout escrow with intelligent period calculation
   */
  async createPayoutEscrow(request: CreatePayoutRequest): Promise<PayoutEscrow> {
    // Get or calculate integrity score
    const integrity = await this.integrityService.ensureFreshScore(request.creatorId);
    
    // Calculate base escrow period
    let cooldownHours = this.calculateBaseEscrowPeriod(integrity.score);
    
    // Apply risk adjustments
    const { adjustedHours, riskFactors, extensionReason } = this.applyRiskAdjustments(
      cooldownHours,
      request.amount,
      integrity
    );
    
    cooldownHours = adjustedHours;
    
    // Run compliance checks
    const complianceChecks = await this.runComplianceChecks(request.creatorId, request.amount);
    
    // Create escrow record
    const startTime = Timestamp.now();
    const plannedReleaseTime = Timestamp.fromMillis(
      startTime.toMillis() + (cooldownHours * 60 * 60 * 1000)
    );
    
    const payoutEscrow: PayoutEscrow = {
      payoutId: this.generatePayoutId(),
      creatorId: request.creatorId,
      amount: request.amount,
      currency: request.currency,
      status: 'IN_ESCROW',
      escrowPeriod: {
        startTime,
        plannedReleaseTime,
        cooldownHours,
        extensionReason
      },
      integrityScore: integrity.score,
      riskFactors,
      revenueBreakdown: request.revenueBreakdown,
      complianceChecks,
      metadata: {
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        processedBy: 'IntelligentPayoutEscrowService'
      }
    };
    
    // Save to Firestore
    await this.savePayoutEscrow(payoutEscrow);
    
    // Log audit trail
    await this.logAuditEvent(payoutEscrow, 'ESCROW_CREATED');
    
    return payoutEscrow;
  }
  
  /**
   * Calculate base escrow period based on integrity score
   */
  private calculateBaseEscrowPeriod(score: number): number {
    if (score >= 800) return this.ESCROW_PERIODS.EXCELLENT;
    if (score >= 700) return this.ESCROW_PERIODS.GOOD;
    if (score >= 600) return this.ESCROW_PERIODS.FAIR;
    if (score >= 500) return this.ESCROW_PERIODS.CONCERNING;
    if (score >= 400) return this.ESCROW_PERIODS.HIGH_RISK;
    return this.ESCROW_PERIODS.CRITICAL;
  }
  
  /**
   * Apply risk-based adjustments to escrow period
   */
  private applyRiskAdjustments(
    baseHours: number,
    amount: number,
    integrity: any
  ): {
    adjustedHours: number;
    riskFactors: string[];
    extensionReason?: string;
  } {
    let adjustedHours = baseHours;
    const riskFactors: string[] = [];
    let extensionReason: string | undefined;
    
    // Amount-based adjustment
    if (amount >= this.AMOUNT_THRESHOLDS.VERY_LARGE) {
      adjustedHours += 24; // Add 1 day for very large payouts
      riskFactors.push('VERY_LARGE_AMOUNT');
      extensionReason = 'Large payout amount requires additional verification';
    } else if (amount >= this.AMOUNT_THRESHOLDS.LARGE) {
      adjustedHours += 12; // Add 12 hours for large payouts
      riskFactors.push('LARGE_AMOUNT');
    }
    
    // New account adjustment
    if (integrity.scoreComponents.accountAge < 50) {
      adjustedHours += 24; // Add 1 day for new accounts
      riskFactors.push('NEW_ACCOUNT');
      if (!extensionReason) {
        extensionReason = 'New account requires extended verification period';
      }
    }
    
    // Chargeback risk adjustment
    if (integrity.scoreComponents.chargebackExposure < 30) {
      adjustedHours += 48; // Add 2 days for high chargeback risk
      riskFactors.push('HIGH_CHARGEBACK_RISK');
      if (!extensionReason) {
        extensionReason = 'Chargebackhistory requires additional review';
      }
    }
    
    // Refund ratio adjustment
    if (integrity.scoreComponents.refundRatio < 40) {
      adjustedHours += 24; // Add 1 day for high refund rate
      riskFactors.push('HIGH_REFUND_RATE');
    }
    
    // Payer concentration adjustment
    if (integrity.scoreComponents.payerConcentration < 30) {
      adjustedHours += 12; // Add 12 hours for concentrated payers
      riskFactors.push('CONCENTRATED_REVENUE_SOURCES');
    }
    
    // Volatile revenue adjustment
    if (integrity.scoreComponents.transactionVelocity < 30) {
      adjustedHours += 12; // Add 12 hours for volatile patterns
      riskFactors.push('VOLATILE_REVENUE_PATTERN');
    }
    
    // Active flags from integrity score
    if (integrity.flags && integrity.flags.length > 0) {
      integrity.flags.forEach((flag: string) => {
        if (!riskFactors.includes(flag)) {
          riskFactors.push(flag);
        }
      });
    }
    
    // Cap maximum escrow at 168 hours (7 days)
    adjustedHours = Math.min(168, adjustedHours);
    
    // Floor minimum escrow at 12 hours (can't go below this)
    adjustedHours = Math.max(12, adjustedHours);
    
    return { adjustedHours, riskFactors, extensionReason };
  }
  
  /**
   * Run compliance checks
   */
  private async runComplianceChecks(
    creatorId: string,
    amount: number
  ): Promise<{
    amlPassed: boolean;
    fraudChecked: boolean;
    chargebackReview: boolean;
  }> {
    // Integration with PACK 296 (Compliance) and PACK 324B (Fraud Detection)
    const [amlResult, fraudResult, chargebackResult] = await Promise.all([
      this.checkAML(creatorId, amount),
      this.checkFraud(creatorId, amount),
      this.checkChargebacks(creatorId)
    ]);
    
    return {
      amlPassed: amlResult,
      fraudChecked: fraudResult,
      chargebackReview: chargebackResult
    };
  }
  
  /**
   * AML check (Anti-Money Laundering)
   */
  private async checkAML(creatorId: string, amount: number): Promise<boolean> {
    // Check if creator has passed KYC
    const userDoc = await this.db.collection('users').doc(creatorId).get();
    const userData = userDoc.data();
    
    if (!userData?.kyc_verified) {
      return false;
    }
    
    // Check if amount exceeds AML thresholds
    if (amount >= 10000) {
      // Flag for manual review (PACK 296 integration)
      await this.db.collection('compliance_reviews').add({
        type: 'AML_THRESHOLD_EXCEEDED',
        creatorId,
        amount,
        createdAt: Timestamp.now(),
        status: 'PENDING'
      });
    }
    
    return true;
  }
  
  /**
   * Fraud check
   */
  private async checkFraud(creatorId: string, amount: number): Promise<boolean> {
    // Integration with PACK 324B (Real-Time Fraud Detection)
    const fraudScoreDoc = await this.db
      .collection('fraud_scores')
      .doc(creatorId)
      .get();
    
    if (fraudScoreDoc.exists) {
      const fraudScore = fraudScoreDoc.data()?.score || 0;
      return fraudScore < 0.7; // Pass if fraud score is below 70%
    }
    
    return true; // Pass by default if no fraud score exists
  }
  
  /**
   * Chargeback review
   */
  private async checkChargebacks(creatorId: string): Promise<boolean> {
    // Integration with PACK 438 (Chargeback Defense)
    const recentChargebacks = await this.db
      .collection('chargebacks')
      .where('creatorId', '==', creatorId)
      .where('createdAt', '>=', Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000))
      .get();
    
    // Pass if fewer than 3 chargebacks in last 7 days
    return recentChargebacks.size < 3;
  }
  
  /**
   * Release payout from escrow
   */
  async releasePayout(payoutId: string): Promise<void> {
    const payoutRef = this.db.collection('payout_escrow').doc(payoutId);
    const payoutDoc = await payoutRef.get();
    
    if (!payoutDoc.exists) {
      throw new Error(`Payout ${payoutId} not found`);
    }
    
    const payout = payoutDoc.data() as PayoutEscrow;
    
    // Check if payout can be released
    if (payout.status !== 'IN_ESCROW') {
      throw new Error(`Payout ${payoutId} cannot be released (status: ${payout.status})`);
    }
    
    // Check if escrow period has elapsed
    const now = Date.now();
    const releaseTime = payout.escrowPeriod.plannedReleaseTime.toMillis();
    
    if (now < releaseTime) {
      throw new Error(`Payout ${payoutId} escrow period not yet complete`);
    }
    
    // Update status
    await payoutRef.update({
      status: 'RELEASED',
      'escrowPeriod.actualReleaseTime': Timestamp.now(),
      'metadata.updatedAt': Timestamp.now()
    });
    
    // Trigger actual payout to wallet (PACK 289 integration)
    await this.triggerPayout(payout);
    
    // Log audit event
    await this.logAuditEvent(payout, 'ESCROW_RELEASED');
  }
  
  /**
   * Extend escrow period
   */
  async extendEscrow(
    payoutId: string,
    additionalHours: number,
    reason: string
  ): Promise<void> {
    const payoutRef = this.db.collection('payout_escrow').doc(payoutId);
    const payoutDoc = await payoutRef.get();
    
    if (!payoutDoc.exists) {
      throw new Error(`Payout ${payoutId} not found`);
    }
    
    const payout = payoutDoc.data() as PayoutEscrow;
    
    const currentReleaseTime = payout.escrowPeriod.plannedReleaseTime.toMillis();
    const newReleaseTime = Timestamp.fromMillis(
      currentReleaseTime + (additionalHours * 60 * 60 * 1000)
    );
    
    await payoutRef.update({
      'escrowPeriod.plannedReleaseTime': newReleaseTime,
      'escrowPeriod.cooldownHours': payout.escrowPeriod.cooldownHours + additionalHours,
      'escrowPeriod.extensionReason': reason,
      'metadata.updatedAt': Timestamp.now()
    });
    
    // Log audit event
    await this.logAuditEvent(payout, 'ESCROW_EXTENDED', { additionalHours, reason });
  }
  
  /**
   * Get payout escrow by ID
   */
  async getPayoutEscrow(payoutId: string): Promise<PayoutEscrow | null> {
    const doc = await this.db.collection('payout_escrow').doc(payoutId).get();
    return doc.exists ? (doc.data() as PayoutEscrow) : null;
  }
  
  /**
   * Get all payouts for a creator
   */
  async getCreatorPayouts(creatorId: string, limit: number = 10): Promise<PayoutEscrow[]> {
    const snapshot = await this.db
      .collection('payout_escrow')
      .where('creatorId', '==', creatorId)
      .orderBy('metadata.createdAt', 'desc')
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => doc.data() as PayoutEscrow);
  }
  
  /**
   * Get payouts ready for release
   */
  async getPayoutsReadyForRelease(): Promise<PayoutEscrow[]> {
    const now = Timestamp.now();
    
    const snapshot = await this.db
      .collection('payout_escrow')
      .where('status', '==', 'IN_ESCROW')
      .where('escrowPeriod.plannedReleaseTime', '<=', now)
      .get();
    
    return snapshot.docs.map(doc => doc.data() as PayoutEscrow);
  }
  
  /**
   * Save payout escrow to Firestore
   */
  private async savePayoutEscrow(payout: PayoutEscrow): Promise<void> {
    await this.db.collection('payout_escrow').doc(payout.payoutId).set(payout);
  }
  
  /**
   * Trigger actual payout (integration with PACK 289)
   */
  private async triggerPayout(payout: PayoutEscrow): Promise<void> {
    // Integration with PACK 289 (Withdrawals)
    await this.db.collection('withdrawals').add({
      creatorId: payout.creatorId,
      amount: payout.amount,
      currency: payout.currency,
      status: 'PENDING',
      source: 'escrow_release',
      payoutId: payout.payoutId,
      createdAt: Timestamp.now()
    });
  }
  
  /**
   * Generate unique payout ID
   */
  private generatePayoutId(): string {
    return `payout_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
  
  /**
   * Log audit event
   */
  private async logAuditEvent(
    payout: PayoutEscrow,
    event: string,
    additionalData?: any
  ): Promise<void> {
    await this.db.collection('audit_logs_pack440').add({
      type: 'PAYOUT_ESCROW',
      event,
      payoutId: payout.payoutId,
      creatorId: payout.creatorId,
      amount: payout.amount,
      timestamp: Timestamp.now(),
      ...additionalData
    });
  }
}
