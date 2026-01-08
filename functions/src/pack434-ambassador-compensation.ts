/**
 * PACK 434 — Global Ambassador Program & Offline Partner Expansion Engine
 * Ambassador Compensation Engine
 * 
 * Handles CPI, CPA, CPS, RevShare, tier promotions, and payouts
 */

import { firestore } from 'firebase-admin';
import {
  AmbassadorProfile,
  AmbassadorTier,
  ambassadorTypeService,
  TIER_REQUIREMENTS,
} from './pack434-ambassador-types';
import { ReferralTracking } from './pack434-ambassador-tracking';

// ============================================================================
// COMPENSATION TYPES
// ============================================================================

export enum CompensationType {
  CPI = 'cpi', // Cost per install
  CPA = 'cpa', // Cost per activation
  CPS = 'cps', // Cost per subscriber
  REV_SHARE = 'rev_share', // Revenue sharing
  EVENT_REWARD = 'event_reward', // Event-based rewards
  BONUS = 'bonus', // Performance bonuses
  MANUAL = 'manual', // Manual adjustment
}

export interface Earning {
  id: string;
  ambassadorId: string;
  type: CompensationType;
  
  // Amount
  amount: number;
  currency: string;
  
  // Source
  referralId?: string;
  eventId?: string;
  userId?: string; // Referred user
  
  // Calculation details
  baseAmount: number;
  tierMultiplier: number;
  regionalMultiplier: number;
  customMultiplier: number;
  
  // Metadata
  description: string;
  metadata?: Record<string, any>;
  
  // Status
  status: 'pending' | 'approved' | 'paid' | 'rejected' | 'clawed_back';
  
  // Payout
  payoutBatchId?: string;
  paidAt?: firestore.Timestamp;
  
  // Timestamps
  earnedAt: firestore.Timestamp;
  approvedAt?: firestore.Timestamp;
}

export interface PayoutBatch {
  id: string;
  
  // Batch details
  periodStart: firestore.Timestamp;
  periodEnd: firestore.Timestamp;
  
  // Ambassadors
  ambassadorIds: string[];
  totalAmbassadors: number;
  
  // Amounts
  totalAmount: number;
  currency: string;
  
  // Processing
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processedAt?: firestore.Timestamp;
  
  // Payment provider
  provider: 'stripe' | 'wise' | 'paypal' | 'manual';
  providerBatchId?: string;
  
  // Errors
  errors?: {
    ambassadorId: string;
    error: string;
  }[];
  
  createdAt: firestore.Timestamp;
}

export interface AmbassadorPayout {
  id: string;
  ambassadorId: string;
  batchId: string;
  
  // Amount
  amount: number;
  currency: string;
  
  // Earnings breakdown
  earningIds: string[];
  breakdown: {
    cpi: number;
    cpa: number;
    cps: number;
    revShare: number;
    eventRewards: number;
    bonuses: number;
  };
  
  // Payment details
  paymentMethod: string;
  paymentDetails: any; // Bank account, PayPal, etc.
  
  // Status
  status: 'pending' | 'processing' | 'sent' | 'completed' | 'failed';
  
  // Tracking
  transactionId?: string;
  receiptUrl?: string;
  
  // Timestamps
  createdAt: firestore.Timestamp;
  sentAt?: firestore.Timestamp;
  completedAt?: firestore.Timestamp;
  
  // Error handling
  error?: string;
  retryCount: number;
}

export interface TierPromotion {
  id: string;
  ambassadorId: string;
  fromTier: AmbassadorTier;
  toTier: AmbassadorTier;
  
  // Qualification
  qualifiedAt: firestore.Timestamp;
  approvedAt?: firestore.Timestamp;
  effectiveAt?: firestore.Timestamp;
  
  // Performance snapshot
  performance: {
    referrals: number;
    creators: number;
    events: number;
    revenue: number;
  };
  
  // Rewards
  bonusAmount?: number;
  certificate?: string;
  
  status: 'pending' | 'approved' | 'effective';
}

// ============================================================================
// COMPENSATION SERVICE
// ============================================================================

export class AmbassadorCompensationService {
  private db: firestore.Firestore;

  constructor(db: firestore.Firestore) {
    this.db = db;
  }

  /**
   * Process CPI (Cost Per Install)
   */
  async processCPI(
    ambassadorId: string,
    referralId: string,
    userId: string
  ): Promise<Earning> {
    const ambassador = await this.getAmbassador(ambassadorId);
    
    if (!ambassador.compensation.cpi) {
      throw new Error('CPI not configured for this ambassador');
    }

    const multiplier = ambassadorTypeService.calculateTotalMultiplier(
      ambassador.tier,
      ambassador.region.country,
      ambassador.compensation.regionalMultiplier
    );

    const amount = ambassador.compensation.cpi * multiplier;

    return this.createEarning({
      ambassadorId,
      type: CompensationType.CPI,
      baseAmount: ambassador.compensation.cpi,
      amount,
      tierMultiplier: TIER_REQUIREMENTS[ambassador.tier].multiplier,
      regionalMultiplier: ambassador.compensation.regionalMultiplier || 1,
      customMultiplier: 1,
      referralId,
      userId,
      description: 'App install reward',
      currency: this.getCurrency(ambassador.region.country),
    });
  }

  /**
   * Process CPA (Cost Per Activation)
   */
  async processCPA(
    ambassadorId: string,
    referralId: string,
    userId: string
  ): Promise<Earning> {
    const ambassador = await this.getAmbassador(ambassadorId);
    
    if (!ambassador.compensation.cpa) {
      throw new Error('CPA not configured for this ambassador');
    }

    const multiplier = ambassadorTypeService.calculateTotalMultiplier(
      ambassador.tier,
      ambassador.region.country,
      ambassador.compensation.regionalMultiplier
    );

    const amount = ambassador.compensation.cpa * multiplier;

    return this.createEarning({
      ambassadorId,
      type: CompensationType.CPA,
      baseAmount: ambassador.compensation.cpa,
      amount,
      tierMultiplier: TIER_REQUIREMENTS[ambassador.tier].multiplier,
      regionalMultiplier: ambassador.compensation.regionalMultiplier || 1,
      customMultiplier: 1,
      referralId,
      userId,
      description: 'User activation reward (KYC + Profile)',
      currency: this.getCurrency(ambassador.region.country),
    });
  }

  /**
   * Process CPS (Cost Per Subscriber)
   */
  async processCPS(
    ambassadorId: string,
    referralId: string,
    userId: string,
    subscriptionType: 'royal' | 'vip'
  ): Promise<Earning> {
    const ambassador = await this.getAmbassador(ambassadorId);
    
    if (!ambassador.compensation.cps) {
      throw new Error('CPS not configured for this ambassador');
    }

    const multiplier = ambassadorTypeService.calculateTotalMultiplier(
      ambassador.tier,
      ambassador.region.country,
      ambassador.compensation.regionalMultiplier
    );

    const amount = ambassador.compensation.cps * multiplier;

    return this.createEarning({
      ambassadorId,
      type: CompensationType.CPS,
      baseAmount: ambassador.compensation.cps,
      amount,
      tierMultiplier: TIER_REQUIREMENTS[ambassador.tier].multiplier,
      regionalMultiplier: ambassador.compensation.regionalMultiplier || 1,
      customMultiplier: 1,
      referralId,
      userId,
      description: `${subscriptionType.toUpperCase()} subscription reward`,
      metadata: { subscriptionType },
      currency: this.getCurrency(ambassador.region.country),
    });
  }

  /**
   * Process revenue share
   */
  async processRevShare(
    ambassadorId: string,
    referralId: string,
    userId: string,
    transactionAmount: number,
    transactionType: string
  ): Promise<Earning | null> {
    const ambassador = await this.getAmbassador(ambassadorId);
    
    if (!ambassador.compensation.revShare) {
      return null; // Revenue share not configured
    }

    // Check if still within revenue share duration
    const referral = await this.getReferral(referralId);
    const monthsSinceReferral = this.getMonthsDifference(
      referral.createdAt.toDate(),
      new Date()
    );

    if (
      ambassador.compensation.revShareDuration &&
      monthsSinceReferral > ambassador.compensation.revShareDuration
    ) {
      return null; // Revenue share period expired
    }

    const shareAmount = transactionAmount * ambassador.compensation.revShare;

    return this.createEarning({
      ambassadorId,
      type: CompensationType.REV_SHARE,
      baseAmount: shareAmount,
      amount: shareAmount,
      tierMultiplier: 1,
      regionalMultiplier: 1,
      customMultiplier: 1,
      referralId,
      userId,
      description: `${ambassador.compensation.revShare * 100}% revenue share from ${transactionType}`,
      metadata: {
        transactionAmount,
        transactionType,
        sharePercentage: ambassador.compensation.revShare,
      },
      currency: this.getCurrency(ambassador.region.country),
    });
  }

  /**
   * Process event reward
   */
  async processEventReward(
    ambassadorId: string,
    eventId: string,
    attendeeCount: number
  ): Promise<Earning> {
    const ambassador = await this.getAmbassador(ambassadorId);
    
    if (!ambassador.compensation.eventRewards) {
      throw new Error('Event rewards not configured for this ambassador');
    }

    const { perAttendee, bonusThreshold, bonusAmount } = ambassador.compensation.eventRewards;

    let amount = (perAttendee || 0) * attendeeCount;

    // Apply bonus if threshold met
    if (bonusThreshold && bonusAmount && attendeeCount >= bonusThreshold) {
      amount += bonusAmount;
    }

    const multiplier = ambassadorTypeService.calculateTotalMultiplier(
      ambassador.tier,
      ambassador.region.country,
      ambassador.compensation.regionalMultiplier
    );

    const totalAmount = amount * multiplier;

    return this.createEarning({
      ambassadorId,
      type: CompensationType.EVENT_REWARD,
      baseAmount: amount,
      amount: totalAmount,
      tierMultiplier: TIER_REQUIREMENTS[ambassador.tier].multiplier,
      regionalMultiplier: ambassador.compensation.regionalMultiplier || 1,
      customMultiplier: 1,
      eventId,
      description: `Event reward for ${attendeeCount} attendees`,
      metadata: {
        attendeeCount,
        bonusApplied: attendeeCount >= (bonusThreshold || Infinity),
      },
      currency: this.getCurrency(ambassador.region.country),
    });
  }

  /**
   * Create earning
   */
  private async createEarning(
    data: Omit<Earning, 'id' | 'earnedAt' | 'status'>
  ): Promise<Earning> {
    const earning: Earning = {
      ...data,
      id: this.db.collection('ambassador_earnings').doc().id,
      earnedAt: firestore.Timestamp.now(),
      status: 'pending',
    };

    await this.db.collection('ambassador_earnings').doc(earning.id).set(earning);

    // Update ambassador performance
    await this.updateAmbassadorRevenue(earning.ambassadorId, earning.amount);

    return earning;
  }

  /**
   * Approve earning
   */
  async approveEarning(earningId: string, approverId: string): Promise<void> {
    await this.db.collection('ambassador_earnings').doc(earningId).update({
      status: 'approved',
      approvedAt: firestore.Timestamp.now(),
      metadata: firestore.FieldValue.arrayUnion({ approverId }),
    });
  }

  /**
   * Reject earning
   */
  async rejectEarning(earningId: string, reason: string): Promise<void> {
    const earningDoc = await this.db.collection('ambassador_earnings').doc(earningId).get();
    const earning = earningDoc.data() as Earning;

    await this.db.collection('ambassador_earnings').doc(earningId).update({
      status: 'rejected',
      metadata: { ...earning.metadata, rejectionReason: reason },
    });

    // Reverse revenue update
    await this.updateAmbassadorRevenue(earning.ambassadorId, -earning.amount);
  }

  /**
   * Check tier promotions (run nightly)
   */
  async checkTierPromotions(): Promise<TierPromotion[]> {
    const promotions: TierPromotion[] = [];

    const ambassadorsSnap = await this.db
      .collection('ambassadors')
      .where('status', '==', 'active')
      .get();

    for (const ambassadorDoc of ambassadorsSnap.docs) {
      const ambassador = ambassadorDoc.data() as AmbassadorProfile;
      
      // Calculate what tier they should be at
      const calculatedTier = ambassadorTypeService.calculateTier(ambassador.performance);

      // Check if promotion is needed
      if (this.isTierHigher(calculatedTier, ambassador.tier)) {
        const promotion = await this.promoteAmbassador(
          ambassador.id,
          ambassador.tier,
          calculatedTier,
          ambassador.performance
        );
        promotions.push(promotion);
      }
    }

    return promotions;
  }

  /**
   * Promote ambassador
   */
  private async promoteAmbassador(
    ambassadorId: string,
    fromTier: AmbassadorTier,
    toTier: AmbassadorTier,
    performance: AmbassadorProfile['performance']
  ): Promise<TierPromotion> {
    const promotion: TierPromotion = {
      id: this.db.collection('tier_promotions').doc().id,
      ambassadorId,
      fromTier,
      toTier,
      qualifiedAt: firestore.Timestamp.now(),
      approvedAt: firestore.Timestamp.now(),
      effectiveAt: firestore.Timestamp.now(),
      performance: {
        referrals: performance.verifiedReferrals,
        creators: performance.creatorsRecruited,
        events: performance.eventsHosted,
        revenue: performance.revenue,
      },
      status: 'effective',
    };

    // Calculate promotion bonus
    const bonusAmount = this.calculatePromotionBonus(fromTier, toTier);
    if (bonusAmount > 0) {
      promotion.bonusAmount = bonusAmount;
      
      // Create bonus earning
      await this.createEarning({
        ambassadorId,
        type: CompensationType.BONUS,
        baseAmount: bonusAmount,
        amount: bonusAmount,
        tierMultiplier: 1,
        regionalMultiplier: 1,
        customMultiplier: 1,
        description: `Tier promotion bonus: ${fromTier} → ${toTier}`,
        currency: 'USD',
      });
    }

    await this.db.collection('tier_promotions').doc(promotion.id).set(promotion);

    // Update ambassador tier
    await this.db.collection('ambassadors').doc(ambassadorId).update({
      tier: toTier,
      'compensation.tierMultiplier': TIER_REQUIREMENTS[toTier].multiplier,
    });

    return promotion;
  }

  /**
   * Create payout batch
   */
  async createPayoutBatch(
    periodStart: Date,
    periodEnd: Date,
    provider: PayoutBatch['provider']
  ): Promise<PayoutBatch> {
    // Get all approved earnings in period
    const earningsSnap = await this.db
      .collection('ambassador_earnings')
      .where('status', '==', 'approved')
      .where('earnedAt', '>=', firestore.Timestamp.fromDate(periodStart))
      .where('earnedAt', '<=', firestore.Timestamp.fromDate(periodEnd))
      .get();

    // Group by ambassador
    const ambassadorEarnings = new Map<string, Earning[]>();
    let totalAmount = 0;

    for (const earningDoc of earningsSnap.docs) {
      const earning = earningDoc.data() as Earning;
      
      if (!ambassadorEarnings.has(earning.ambassadorId)) {
        ambassadorEarnings.set(earning.ambassadorId, []);
      }
      
      ambassadorEarnings.get(earning.ambassadorId)!.push(earning);
      totalAmount += earning.amount;
    }

    const batch: PayoutBatch = {
      id: this.db.collection('payout_batches').doc().id,
      periodStart: firestore.Timestamp.fromDate(periodStart),
      periodEnd: firestore.Timestamp.fromDate(periodEnd),
      ambassadorIds: Array.from(ambassadorEarnings.keys()),
      totalAmbassadors: ambassadorEarnings.size,
      totalAmount,
      currency: 'USD', // Or determine from region
      status: 'pending',
      provider,
      createdAt: firestore.Timestamp.now(),
    };

    await this.db.collection('payout_batches').doc(batch.id).set(batch);

    // Create individual payouts
    for (const [ambassadorId, earnings] of ambassadorEarnings) {
      await this.createAmbassadorPayout(ambassadorId, batch.id, earnings);
    }

    return batch;
  }

  /**
   * Create ambassador payout
   */
  private async createAmbassadorPayout(
    ambassadorId: string,
    batchId: string,
    earnings: Earning[]
  ): Promise<AmbassadorPayout> {
    const breakdown = {
      cpi: 0,
      cpa: 0,
      cps: 0,
      revShare: 0,
      eventRewards: 0,
      bonuses: 0,
    };

    let totalAmount = 0;

    for (const earning of earnings) {
      totalAmount += earning.amount;
      
      switch (earning.type) {
        case CompensationType.CPI:
          breakdown.cpi += earning.amount;
          break;
        case CompensationType.CPA:
          breakdown.cpa += earning.amount;
          break;
        case CompensationType.CPS:
          breakdown.cps += earning.amount;
          break;
        case CompensationType.REV_SHARE:
          breakdown.revShare += earning.amount;
          break;
        case CompensationType.EVENT_REWARD:
          breakdown.eventRewards += earning.amount;
          break;
        case CompensationType.BONUS:
          breakdown.bonuses += earning.amount;
          break;
      }
    }

    const payout: AmbassadorPayout = {
      id: this.db.collection('ambassador_payouts').doc().id,
      ambassadorId,
      batchId,
      amount: totalAmount,
      currency: earnings[0]?.currency || 'USD',
      earningIds: earnings.map((e) => e.id),
      breakdown,
      paymentMethod: 'pending', // Set when ambassador configures
      paymentDetails: {},
      status: 'pending',
      retryCount: 0,
      createdAt: firestore.Timestamp.now(),
    };

    await this.db.collection('ambassador_payouts').doc(payout.id).set(payout);

    // Mark earnings as paid
    const batch = this.db.batch();
    for (const earning of earnings) {
      batch.update(this.db.collection('ambassador_earnings').doc(earning.id), {
        status: 'paid',
        payoutBatchId: batchId,
        paidAt: firestore.Timestamp.now(),
      });
    }
    await batch.commit();

    return payout;
  }

  /**
   * Process payout
   */
  async processPayout(payoutId: string): Promise<void> {
    const payoutDoc = await this.db.collection('ambassador_payouts').doc(payoutId).get();
    const payout = payoutDoc.data() as AmbassadorPayout;

    try {
      await this.db.collection('ambassador_payouts').doc(payoutId).update({
        status: 'processing',
      });

      // Integration with payment provider
      // This is a placeholder - implement actual provider integration
      const transactionId = await this.sendPayment(payout);

      await this.db.collection('ambassador_payouts').doc(payoutId).update({
        status: 'completed',
        transactionId,
        completedAt: firestore.Timestamp.now(),
      });
    } catch (error: any) {
      await this.db.collection('ambassador_payouts').doc(payoutId).update({
        status: 'failed',
        error: error.message,
        retryCount: payout.retryCount + 1,
      });
      
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async getAmbassador(ambassadorId: string): Promise<AmbassadorProfile> {
    const doc = await this.db.collection('ambassadors').doc(ambassadorId).get();
    
    if (!doc.exists) {
      throw new Error('Ambassador not found');
    }

    return doc.data() as AmbassadorProfile;
  }

  private async getReferral(referralId: string): Promise<ReferralTracking> {
    const doc = await this.db.collection('referral_tracking').doc(referralId).get();
    
    if (!doc.exists) {
      throw new Error('Referral not found');
    }

    return doc.data() as ReferralTracking;
  }

  private async updateAmbassadorRevenue(
    ambassadorId: string,
    amount: number
  ): Promise<void> {
    await this.db.collection('ambassadors').doc(ambassadorId).update({
      'performance.revenue': firestore.FieldValue.increment(amount),
    });
  }

  private getCurrency(countryCode: string): string {
    const currencyMap: Record<string, string> = {
      US: 'USD',
      UK: 'GBP',
      DE: 'EUR',
      FR: 'EUR',
      PL: 'PLN',
      BR: 'BRL',
      IN: 'INR',
    };

    return currencyMap[countryCode] || 'USD';
  }

  private getMonthsDifference(date1: Date, date2: Date): number {
    const months =
      (date2.getFullYear() - date1.getFullYear()) * 12 +
      (date2.getMonth() - date1.getMonth());
    return months;
  }

  private isTierHigher(tier1: AmbassadorTier, tier2: AmbassadorTier): boolean {
    const tierOrder = [
      AmbassadorTier.BRONZE,
      AmbassadorTier.SILVER,
      AmbassadorTier.GOLD,
      AmbassadorTier.PLATINUM,
      AmbassadorTier.TITAN,
    ];

    return tierOrder.indexOf(tier1) > tierOrder.indexOf(tier2);
  }

  private calculatePromotionBonus(from: AmbassadorTier, to: AmbassadorTier): number {
    const bonuses: Record<AmbassadorTier, number> = {
      [AmbassadorTier.BRONZE]: 0,
      [AmbassadorTier.SILVER]: 100,
      [AmbassadorTier.GOLD]: 300,
      [AmbassadorTier.PLATINUM]: 1000,
      [AmbassadorTier.TITAN]: 3000,
    };

    return bonuses[to];
  }

  private async sendPayment(payout: AmbassadorPayout): Promise<string> {
    // Integration with payment provider
    // This is a placeholder - implement actual provider integration
    // For Stripe Connect, Wise, PayPal, etc.
    
    console.log(`Sending payment: ${payout.amount} to ${payout.ambassadorId}`);
    
    // Return mock transaction ID
    return `txn_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}

// ============================================================================
// EXPORT FACTORY
// ============================================================================

export function createAmbassadorCompensationService(
  db: firestore.Firestore
): AmbassadorCompensationService {
  return new AmbassadorCompensationService(db);
}
