/**
 * PACK 440: Creator Revenue Integrity & Payout Freezing Framework
 * Module: Creator Revenue Integrity Score Service
 * 
 * Calculates and maintains dynamic integrity scores for creators based on:
 * - Revenue source diversity
 * - Refund ratio
 * - Chargeback exposure
 * - Payer concentration
 * - Account age
 * - Transaction velocity
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

type Firestore = admin.firestore.Firestore;

export interface ScoreComponents {
  revenueSourceDiversity: number; // 0-100
  refundRatio: number; // 0-100
  chargebackExposure: number; // 0-100
  payerConcentration: number; // 0-100
  accountAge: number; // 0-100
  transactionVelocity: number; // 0-100
}

export interface RevenueStats {
  totalRevenue: number;
  subscriptionRevenue: number;
  mediaRevenue: number;
  callRevenue: number;
  refundTotal: number;
  chargebackTotal: number;
  last30Days: number;
  last90Days: number;
}

export interface CreatorRevenueIntegrity {
  creatorId: string;
  score: number; // 0-1000
  scoreComponents: ScoreComponents;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  lastUpdated: Timestamp;
  historicalScores: Array<{
    score: number;
    timestamp: Timestamp;
    reason: string;
  }>;
  flags: string[];
  revenueStats: RevenueStats;
}

export interface CreatorData {
  creatorId: string;
  accountCreatedAt: Timestamp;
  transactions: Array<{
    amount: number;
    type: 'subscription' | 'media' | 'call';
    payerId: string;
    timestamp: Timestamp;
  }>;
  refunds: Array<{
    amount: number;
    timestamp: Timestamp;
  }>;
  chargebacks: Array<{
    amount: number;
    timestamp: Timestamp;
  }>;
}

export class CreatorRevenueIntegrityScoreService {
  private db: Firestore;
  
  // Scoring weights
  private readonly WEIGHTS = {
    revenueSourceDiversity: 0.15,
    refundRatio: 0.25,
    chargebackExposure: 0.30,
    payerConcentration: 0.15,
    accountAge: 0.10,
    transactionVelocity: 0.05
  };
  
  constructor(db: Firestore) {
    this.db = db;
  }
  
  /**
   * Calculate integrity score for a creator
   */
  async calculateScore(creatorId: string): Promise<CreatorRevenueIntegrity> {
    const creatorData = await this.fetchCreatorData(creatorId);
    const scoreComponents = this.calculateScoreComponents(creatorData);
    const totalScore = this.calculateTotalScore(scoreComponents);
    const riskLevel = this.determineRiskLevel(totalScore);
    const flags = this.identifyFlags(scoreComponents, creatorData);
    const revenueStats = this.calculateRevenueStats(creatorData);
    
    const integrity: CreatorRevenueIntegrity = {
      creatorId,
      score: totalScore,
      scoreComponents,
      riskLevel,
      lastUpdated: Timestamp.now(),
      historicalScores: [],
      flags,
      revenueStats
    };
    
    // Save to Firestore
    await this.saveIntegrityScore(integrity);
    
    return integrity;
  }
  
  /**
   * Calculate individual score components
   */
  private calculateScoreComponents(data: CreatorData): ScoreComponents {
    return {
      revenueSourceDiversity: this.calculateDiversityScore(data),
      refundRatio: this.calculateRefundScore(data),
      chargebackExposure: this.calculateChargebackScore(data),
      payerConcentration: this.calculateConcentrationScore(data),
      accountAge: this.calculateAccountAgeScore(data),
      transactionVelocity: this.calculateVelocityScore(data)
    };
  }
  
  /**
   * Revenue source diversity: Higher is better
   * Measures if creator has income from multiple sources (subs, media, calls)
   */
  private calculateDiversityScore(data: CreatorData): number {
    const sources = {
      subscription: 0,
      media: 0,
      call: 0
    };
    
    let totalRevenue = 0;
    
    data.transactions.forEach(tx => {
      sources[tx.type] += tx.amount;
      totalRevenue += tx.amount;
    });
    
    if (totalRevenue === 0) return 50; // Neutral for new accounts
    
    // Calculate entropy (balanced distribution = higher score)
    const proportions = Object.values(sources).map(s => s / totalRevenue);
    const activeSourceCount = proportions.filter(p => p > 0.05).length; // >5% counts as active
    
    // Balance score: 1 source = 30, 2 sources = 70, 3 sources = 100
    const balanceBonus = activeSourceCount === 3 ? 30 : activeSourceCount === 2 ? 15 : 0;
    
    // Entropy calculation (more even distribution = higher score)
    const entropy = proportions.reduce((sum, p) => {
      return p > 0 ? sum - (p * Math.log(p)) : sum;
    }, 0);
    
    const maxEntropy = Math.log(3); // Maximum entropy for 3 sources
    const entropyScore = (entropy / maxEntropy) * 70;
    
    return Math.min(100, Math.round(entropyScore + balanceBonus));
  }
  
  /**
   * Refund ratio: Lower is better
   * Measures percentage of revenue that gets refunded
   */
  private calculateRefundScore(data: CreatorData): number {
    const totalRevenue = data.transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const totalRefunds = data.refunds.reduce((sum, r) => sum + r.amount, 0);
    
    if (totalRevenue === 0) return 80; // Neutral for new accounts
    
    const refundRatio = totalRefunds / totalRevenue;
    
    // Scoring thresholds:
    // 0-2%: 100 points (excellent)
    // 2-5%: 90 points (good)
    // 5-10%: 70 points (acceptable)
    // 10-20%: 40 points (concerning)
    // 20-30%: 20 points (high risk)
    // >30%: 0 points (critical)
    
    if (refundRatio <= 0.02) return 100;
    if (refundRatio <= 0.05) return 90;
    if (refundRatio <= 0.10) return 70;
    if (refundRatio <= 0.20) return 40;
    if (refundRatio <= 0.30) return 20;
    return 0;
  }
  
  /**
   * Chargeback exposure: Lower is better
   * Most critical factor - chargebacks hurt the platform
   */
  private calculateChargebackScore(data: CreatorData): number {
    const totalRevenue = data.transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const totalChargebacks = data.chargebacks.reduce((sum, cb) => sum + cb.amount, 0);
    
    if (totalRevenue === 0) return 90; // Optimistic for new accounts
    
    const chargebackRatio = totalChargebacks / totalRevenue;
    
    // Scoring thresholds (stricter than refunds):
    // 0-0.5%: 100 points (excellent)
    // 0.5-1%: 80 points (acceptable - industry standard)
    // 1-2%: 50 points (concerning)
    // 2-3%: 20 points (high risk)
    // >3%: 0 points (critical - PSP will flag)
    
    if (chargebackRatio <= 0.005) return 100;
    if (chargebackRatio <= 0.01) return 80;
    if (chargebackRatio <= 0.02) return 50;
    if (chargebackRatio <= 0.03) return 20;
    return 0;
  }
  
  /**
   * Payer concentration: Lower concentration is better
   * Prevents scenarios where one payer funds most of creator's income (fraud risk)
   */
  private calculateConcentrationScore(data: CreatorData): number {
    const payerAmounts = new Map<string, number>();
    let totalRevenue = 0;
    
    data.transactions.forEach(tx => {
      payerAmounts.set(tx.payerId, (payerAmounts.get(tx.payerId) || 0) + tx.amount);
      totalRevenue += tx.amount;
    });
    
    if (totalRevenue === 0 || payerAmounts.size === 0) return 70; // Neutral
    
    // Calculate Herfindahl-Hirschman Index (HHI)
    let hhi = 0;
    payerAmounts.forEach(amount => {
      const share = amount / totalRevenue;
      hhi += share * share;
    });
    
    // HHI ranges from 1/n (perfect distribution) to 1 (monopoly)
    // Lower HHI = better score
    
    if (hhi <= 0.10) return 100; // Very distributed (10+ balanced payers)
    if (hhi <= 0.25) return 80;  // Good distribution (4+ balanced payers)
    if (hhi <= 0.50) return 50;  // Moderate concentration (2-3 major payers)
    if (hhi <= 0.75) return 25;  // High concentration (1-2 major payers)
    return 0; // Extreme concentration (1 payer dominates)
  }
  
  /**
   * Account age: Older accounts are more trustworthy
   */
  private calculateAccountAgeScore(data: CreatorData): number {
    const accountAgeMs = Date.now() - data.accountCreatedAt.toMillis();
    const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);
    
    // Scoring thresholds:
    // 0-7 days: 20 points (very new)
    // 7-30 days: 40 points (new)
    // 30-90 days: 70 points (established)
    // 90-180 days: 85 points (trusted)
    // 180+ days: 100 points (veteran)
    
    if (accountAgeDays >= 180) return 100;
    if (accountAgeDays >= 90) return 85;
    if (accountAgeDays >= 30) return 70;
    if (accountAgeDays >= 7) return 40;
    return 20;
  }
  
  /**
   * Transaction velocity: Sudden spikes are suspicious
   * Measures if revenue pattern is stable or erratic
   */
  private calculateVelocityScore(data: CreatorData): number {
    if (data.transactions.length < 10) return 80; // Not enough data
    
    // Group transactions by day
    const dailyRevenue = new Map<string, number>();
    data.transactions.forEach(tx => {
      const date = new Date(tx.timestamp.toMillis()).toISOString().split('T')[0];
      dailyRevenue.set(date, (dailyRevenue.get(date) || 0) + tx.amount);
    });
    
    const revenues = Array.from(dailyRevenue.values());
    const avgRevenue = revenues.reduce((a, b) => a + b, 0) / revenues.length;
    
    // Calculate coefficient of variation (CV)
    const variance = revenues.reduce((sum, r) => sum + Math.pow(r - avgRevenue, 2), 0) / revenues.length;
    const stdDev = Math.sqrt(variance);
    const cv = avgRevenue > 0 ? stdDev / avgRevenue : 0;
    
    // Lower CV = more stable = higher score
    if (cv <= 0.3) return 100; // Very stable
    if (cv <= 0.6) return 80;  // Stable
    if (cv <= 1.0) return 60;  // Moderate variation
    if (cv <= 1.5) return 40;  // High variation
    return 20; // Very volatile
  }
  
  /**
   * Calculate weighted total score
   */
  private calculateTotalScore(components: ScoreComponents): number {
    const weightedSum = Object.entries(this.WEIGHTS).reduce((sum, [key, weight]) => {
      return sum + (components[key as keyof ScoreComponents] * weight * 10);
    }, 0);
    
    return Math.round(Math.min(1000, Math.max(0, weightedSum)));
  }
  
  /**
   * Determine risk level based on score
   */
  private determineRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (score >= 800) return 'LOW';
    if (score >= 600) return 'MEDIUM';
    if (score >= 400) return 'HIGH';
    return 'CRITICAL';
  }
  
  /**
   * Identify flags that need attention
   */
  private identifyFlags(components: ScoreComponents, data: CreatorData): string[] {
    const flags: string[] = [];
    
    if (components.chargebackExposure < 30) flags.push('HIGH_CHARGEBACK_RISK');
    if (components.refundRatio < 40) flags.push('HIGH_REFUND_RATE');
    if (components.payerConcentration < 30) flags.push('CONCENTRATED_PAYERS');
    if (components.transactionVelocity < 30) flags.push('VOLATILE_REVENUE');
    if (components.accountAge < 30) flags.push('NEW_ACCOUNT');
    if (components.revenueSourceDiversity < 40) flags.push('LIMITED_REVENUE_SOURCES');
    
    // Check for recent chargeback spike
    const recentChargebacks = data.chargebacks.filter(cb => {
      const daysSince = (Date.now() - cb.timestamp.toMillis()) / (1000 * 60 * 60 * 24);
      return daysSince <= 7;
    });
    
    if (recentChargebacks.length >= 3) flags.push('RECENT_CHARGEBACK_SPIKE');
    
    return flags;
  }
  
  /**
   * Calculate revenue statistics
   */
  private calculateRevenueStats(data: CreatorData): RevenueStats {
    const now = Date.now();
    const day30Ms = 30 * 24 * 60 * 60 * 1000;
    const day90Ms = 90 * 24 * 60 * 60 * 1000;
    
    let totalRevenue = 0;
    let subscriptionRevenue = 0;
    let mediaRevenue = 0;
    let callRevenue = 0;
    let last30Days = 0;
    let last90Days = 0;
    
    data.transactions.forEach(tx => {
      totalRevenue += tx.amount;
      
      if (tx.type === 'subscription') subscriptionRevenue += tx.amount;
      if (tx.type === 'media') mediaRevenue += tx.amount;
      if (tx.type === 'call') callRevenue += tx.amount;
      
      const age = now - tx.timestamp.toMillis();
      if (age <= day30Ms) last30Days += tx.amount;
      if (age <= day90Ms) last90Days += tx.amount;
    });
    
    const refundTotal = data.refunds.reduce((sum, r) => sum + r.amount, 0);
    const chargebackTotal = data.chargebacks.reduce((sum, cb) => sum + cb.amount, 0);
    
    return {
      totalRevenue,
      subscriptionRevenue,
      mediaRevenue,
      callRevenue,
      refundTotal,
      chargebackTotal,
      last30Days,
      last90Days
    };
  }
  
  /**
   * Fetch creator data from database
   */
  private async fetchCreatorData(creatorId: string): Promise<CreatorData> {
    // Fetch from multiple collections
    const [userDoc, transactionsSnap, refundsSnap, chargebacksSnap] = await Promise.all([
      this.db.collection('users').doc(creatorId).get(),
      this.db.collection('transactions')
        .where('recipientId', '==', creatorId)
        .where('status', '==', 'completed')
        .get(),
      this.db.collection('refunds')
        .where('creatorId', '==', creatorId)
        .get(),
      this.db.collection('chargebacks')
        .where('creatorId', '==', creatorId)
        .get()
    ]);
    
    const userData = userDoc.data();
    
    const transactions = transactionsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        amount: data.amount,
        type: data.type as 'subscription' | 'media' | 'call',
        payerId: data.senderId,
        timestamp: data.completedAt || data.createdAt
      };
    });
    
    const refunds = refundsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        amount: data.amount,
        timestamp: data.createdAt
      };
    });
    
    const chargebacks = chargebacksSnap.docs.map(doc => {
      const data = doc.data();
      return {
        amount: data.amount,
        timestamp: data.createdAt
      };
    });
    
    return {
      creatorId,
      accountCreatedAt: userData?.createdAt || Timestamp.now(),
      transactions,
      refunds,
      chargebacks
    };
  }
  
  /**
   * Save integrity score to Firestore
   */
  private async saveIntegrityScore(integrity: CreatorRevenueIntegrity): Promise<void> {
    const docRef = this.db.collection('creator_revenue_integrity').doc(integrity.creatorId);
    const existing = await docRef.get();
    
    const historicalScores = existing.exists 
      ? [...(existing.data()?.historicalScores || []), {
          score: existing.data()?.score || 0,
          timestamp: existing.data()?.lastUpdated || Timestamp.now(),
          reason: 'periodic_update'
        }].slice(-30) // Keep last 30 history entries
      : [];
    
    await docRef.set({
      ...integrity,
      historicalScores
    });
  }
  
  /**
   * Get current integrity score (from cache)
   */
  async getScore(creatorId: string): Promise<CreatorRevenueIntegrity | null> {
    const doc = await this.db.collection('creator_revenue_integrity').doc(creatorId).get();
    return doc.exists ? doc.data() as CreatorRevenueIntegrity : null;
  }
  
  /**
   * Update score if stale (older than 1 hour)
   */
  async ensureFreshScore(creatorId: string): Promise<CreatorRevenueIntegrity> {
    const existing = await this.getScore(creatorId);
    
    if (!existing) {
      return this.calculateScore(creatorId);
    }
    
    const ageMs = Date.now() - existing.lastUpdated.toMillis();
    const ageHours = ageMs / (1000 * 60 * 60);
    
    if (ageHours > 1) {
      return this.calculateScore(creatorId);
    }
    
    return existing;
  }
}
