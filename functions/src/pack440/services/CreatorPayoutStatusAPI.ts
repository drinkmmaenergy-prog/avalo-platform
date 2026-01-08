/**
 * PACK 440: Creator Revenue Integrity & Payout Freezing Framework
 * Module: Creator Payout Status API
 * 
 * Provides transparency layer for creators:
 * - Current payout status
 * - Pending payouts with ETAs
 * - Simplified integrity score tier
 * - Delay reasons (high-level, no algorithm disclosure)
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

type Firestore = admin.firestore.Firestore;

export type PayoutCurrentStatus = 'NORMAL' | 'DELAYED' | 'FROZEN' | 'UNDER_REVIEW';
export type IntegrityScoreTier = 'GOLD' | 'SILVER' | 'BRONZE' | 'PROBATION';
export type MessageType = 'INFO' | 'WARNING' | 'ACTION_REQUIRED';

export interface PayoutMessage {
  messageId: string;
  type: MessageType;
  title: string;
  body: string;
  createdAt: Timestamp;
  read: boolean;
}

export interface ActivePayoutInfo {
  payoutId: string;
  amount: number;
  status: string;
  estimatedRelease: Timestamp;
  delayReason?: string;
}

export interface PayoutStatusTransparency {
  creatorId: string;
  currentStatus: PayoutCurrentStatus;
  activePayouts: ActivePayoutInfo[];
  nextPayoutETA?: Timestamp;
  integrityScoreTier: IntegrityScoreTier;
  messages: PayoutMessage[];
  escrowPeriod: {
    currentDays: number;
    minDays: number;
    maxDays: number;
  };
  lastUpdated: Timestamp;
}

export class CreatorPayoutStatusAPI {
  private db: Firestore;
  
  constructor(db: Firestore) {
    this.db = db;
  }
  
  /**
   * Get payout status for a creator
   */
  async getStatus(creatorId: string): Promise<PayoutStatusTransparency> {
    const statusDoc = await this.db
      .collection('payout_status_transparency')
      .doc(creatorId)
      .get();
    
    if (statusDoc.exists) {
      return statusDoc.data() as PayoutStatusTransparency;
    }
    
    // Generate status if doesn't exist
    return this.generateStatus(creatorId);
  }
  
  /**
   * Generate fresh payout status
   */
  async generateStatus(creatorId: string): Promise<PayoutStatusTransparency> {
    // Get integrity score
    const integrityDoc = await this.db
      .collection('creator_revenue_integrity')
      .doc(creatorId)
      .get();
    
    const integrityScore = integrityDoc.exists 
      ? integrityDoc.data()?.score || 500 
     : 500;
    
    // Get active payouts
    const payoutsSnapshot = await this.db
      .collection('payout_escrow')
      .where('creatorId', '==', creatorId)
      .where('status', 'in', ['PENDING', 'IN_ESCROW', 'FROZEN'])
      .orderBy('metadata.createdAt', 'desc')
      .limit(10)
      .get();
    
    const activePayouts: ActivePayoutInfo[] = payoutsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        payoutId: doc.id,
        amount: data.amount,
        status: data.status,
        estimatedRelease: data.escrowPeriod.plannedReleaseTime,
        delayReason: this.getPublicDelayReason(data)
      };
    });
    
    // Get active freezes
    const freezesSnapshot = await this.db
      .collection('payout_freezes')
      .where('creatorId', '==', creatorId)
      .where('status', '==', 'ACTIVE')
.get();
    
    const hasActiveFreezes = !freezesSnapshot.empty;
    
    // Determine current status
    const currentStatus = this.determineCurrentStatus(activePayouts, hasActiveFreezes);
    
    // Calculate escrow period info
    const escrowPeriod = this.calculateEscrowPeriodInfo(integrityScore);
    
    // Convert score to tier
    const integrityScoreTier = this.scoreToTier(integrityScore);
    
    // Generate messages
    const messages = await this.generateMessages(
      creatorId,
      integrityScore,
      hasActiveFreezes,
      freezesSnapshot.docs
    );
    
    // Calculate next payout ETA
    const nextPayoutETA = activePayouts.length > 0
      ? activePayouts[0].estimatedRelease
      : undefined;
    
    const status: PayoutStatusTransparency = {
      creatorId,
      currentStatus,
      activePayouts,
      nextPayoutETA,
      integrityScoreTier,
      messages,
      escrowPeriod,
      lastUpdated: Timestamp.now()
    };
    
    // Save to Firestore
    await this.saveStatus(status);
    
    return status;
  }
  
  /**
   * Update payout status (called by background jobs)
   */
  async updateStatus(creatorId: string): Promise<void> {
    await this.generateStatus(creatorId);
  }
  
  /**
   * Mark message as read
   */
  async markMessageRead(creatorId: string, messageId: string): Promise<void> {
    const statusRef = this.db.collection('payout_status_transparency').doc(creatorId);
    const statusDoc = await statusRef.get();
    
    if (!statusDoc.exists) return;
    
    const status = statusDoc.data() as PayoutStatusTransparency;
    const updatedMessages = status.messages.map(msg => 
      msg.messageId === messageId ? { ...msg, read: true } : msg
    );
    
    await statusRef.update({
      messages: updatedMessages,
      lastUpdated: Timestamp.now()
    });
  }
  
  /**
   * Get public delay reason (sanitized, no algorithm details)
   */
  private getPublicDelayReason(payoutData: any): string | undefined {
    if (payoutData.status === 'FROZEN') {
      return 'Under review - We\'ll update you soon';
    }
    
    if (payoutData.escrowPeriod.extensionReason) {
      // Sanitize internal reasons to public-facing messages
      const reason = payoutData.escrowPeriod.extensionReason.toLowerCase();
      
      if (reason.includes('chargeback')) {
        return 'Routine security review';
      }
      if (reason.includes('new account')) {
        return 'Additional verification for new accounts';
      }
      if (reason.includes('large')) {
        return 'Standard review for large payouts';
      }
      
      return 'Routine verification in progress';
    }
    
    return undefined;
  }
  
  /**
   * Determine current status
   */
  private determineCurrentStatus(
    activePayouts: ActivePayoutInfo[],
    hasActiveFreezes: boolean
  ): PayoutCurrentStatus {
    if (hasActiveFreezes) {
      return 'FROZEN';
    }
    
    const now = Date.now();
    const delayedPayouts = activePayouts.filter(p => 
      p.estimatedRelease.toMillis() > now && p.delayReason
    );
    
    if (delayedPayouts.length > 0) {
      return 'DELAYED';
    }
    
    const underReview = activePayouts.some(p => p.status === 'PENDING');
    if (underReview) {
      return 'UNDER_REVIEW';
    }
    
    return 'NORMAL';
  }
  
  /**
   * Calculate escrow period info based on score
   */
  private calculateEscrowPeriodInfo(score: number): {
    currentDays: number;
    minDays: number;
    maxDays: number;
  } {
    let currentDays: number;
    
    if (score >= 800) currentDays = 0.5; // 12 hours
    else if (score >= 700) currentDays = 1;
    else if (score >= 600) currentDays = 2;
    else if (score >= 500) currentDays = 3;
    else if (score >= 400) currentDays = 5;
    else currentDays = 7;
    
    return {
      currentDays,
      minDays: 0.5,
      maxDays: 7
    };
  }
  
  /**
   * Convert score to simplified tier
   */
  private scoreToTier(score: number): IntegrityScoreTier {
    if (score >= 800) return 'GOLD';
    if (score >= 600) return 'SILVER';
    if (score >= 400) return 'BRONZE';
    return 'PROBATION';
  }
  
  /**
   * Generate messages for creator
   */
  private async generateMessages(
    creatorId: string,
    score: number,
    hasActiveFreezes: boolean,
    freezeDocs: any[]
  ): Promise<PayoutMessage[]> {
    const messages: PayoutMessage[] = [];
    
    // Freeze messages
    if (hasActiveFreezes) {
      freezeDocs.forEach((doc, index) => {
        const freeze = doc.data();
        messages.push({
          messageId: `freeze_${doc.id}`,
          type: 'WARNING',
          title: 'Payout Under Review',
          body: freeze.reason.publicMessage,
          createdAt: freeze.timeline.frozenAt,
          read: false
        });
      });
    }
    
    // Score-based messages
    if (score < 600 && !hasActiveFreezes) {
      messages.push({
        messageId: `score_warning_${Date.now()}`,
        type: 'INFO',
        title: 'Improve Your Payout Speed',
        body: 'Diversify your revenue sources and maintain low refund rates to reduce payout delays.',
        createdAt: Timestamp.now(),
        read: false
      });
    }
    
    if (score >= 800) {
      messages.push({
        messageId: `score_excellent_${Date.now()}`,
        type: 'INFO',
        title: 'Excellent Standing',
        body: 'You\'re in our top tier! Enjoy faster payouts (12 hours).',
        createdAt: Timestamp.now(),
        read: false
      });
    }
    
    return messages;
  }
  
  /**
   * Save status to Firestore
   */
  private async saveStatus(status: PayoutStatusTransparency): Promise<void> {
    await this.db
      .collection('payout_status_transparency')
      .doc(status.creatorId)
      .set(status);
  }
}
