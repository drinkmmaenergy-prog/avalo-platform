/**
 * PACK 149: Global Tax Engine & Compliance Hub
 * Tax Calculation and Liability Functions
 * 
 * Calculates tax liabilities based on revenue data and regional rules
 */

import { db } from '../init';
import { FieldValue } from 'firebase-admin/firestore';
import {
  TaxCalculationContext,
  TaxLiabilityRecord,
  RevenueCategory,
  AnonymizedRevenueSource
} from './types';
import {
  calculateVATLiability,
  calculateGSTLiability,
  hasDoubleTaxTreaty,
  getVATRate,
  getGSTRate
} from './tax-rules';
import { getTaxProfile } from './tax-profile';

export async function calculateTaxLiability(
  context: TaxCalculationContext
): Promise<{ success: boolean; liability?: TaxLiabilityRecord; error?: string }> {
  try {
    const { userId, profile, periodStart, periodEnd, revenueData } = context;

    if (profile.locked) {
      return {
        success: false,
        error: 'Tax profile is locked'
      };
    }

    const grossRevenue = revenueData.reduce((sum, item) => sum + item.amount, 0);
    const platformFee = grossRevenue * 0.35;
    const netRevenue = grossRevenue - platformFee;

    const revenueByCategory: Record<RevenueCategory, number> = {
      mentorship: 0,
      digital_products: 0,
      clubs: 0,
      events: 0,
      subscriptions: 0,
      tips: 0,
      other: 0
    };

    const revenueByCountry: Record<string, number> = {};

    for (const item of revenueData) {
      revenueByCategory[item.category] = 
        (revenueByCategory[item.category] || 0) + item.amount;
      
      revenueByCountry[item.sourceCountry] = 
        (revenueByCountry[item.sourceCountry] || 0) + item.amount;
    }

    const estimatedVAT = calculateVATLiability(grossRevenue, profile.taxResidencyCountry);
    const estimatedGST = calculateGSTLiability(grossRevenue, profile.taxResidencyCountry);

    const taxYear = periodEnd.getFullYear();
    const taxQuarter = Math.ceil((periodEnd.getMonth() + 1) / 3);

    const liability: Omit<TaxLiabilityRecord, 'calculatedAt'> = {
      userId,
      taxYear,
      taxQuarter,
      grossRevenue,
      platformFee,
      netRevenue,
      revenueByCategory,
      revenueByCountry,
      estimatedVAT: estimatedVAT > 0 ? estimatedVAT : undefined,
      estimatedGST: estimatedGST > 0 ? estimatedGST : undefined,
      estimatedIncomeTax: undefined,
      deductions: 0,
      currency: 'USD',
      calculatedBy: 'system'
    };

    const docRef = await db.collection('tax_liability_records').add({
      ...liability,
      calculatedAt: FieldValue.serverTimestamp()
    });

    return {
      success: true,
      liability: {
        ...liability,
        calculatedAt: new Date()
      }
    };
  } catch (error) {
    console.error('Error calculating tax liability:', error);
    return {
      success: false,
      error: 'Failed to calculate tax liability'
    };
  }
}

export async function getRevenueDataForPeriod(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<TaxCalculationContext['revenueData']> {
  try {
    const transactionsSnapshot = await db
      .collection('transactions')
      .where('creatorId', '==', userId)
      .where('timestamp', '>=', periodStart)
      .where('timestamp', '<=', periodEnd)
      .where('status', '==', 'completed')
      .get();

    const revenueData: TaxCalculationContext['revenueData'] = [];

    for (const doc of transactionsSnapshot.docs) {
      const data = doc.data();
      
      const category = mapTransactionTypeToCategory(data.type);
      
      if (category) {
        revenueData.push({
          category,
          amount: data.amount || 0,
          sourceCountry: data.buyerCountry || 'OTHER',
          timestamp: data.timestamp?.toDate() || new Date()
        });
      }
    }

    return revenueData;
  } catch (error) {
    console.error('Error fetching revenue data:', error);
    return [];
  }
}

function mapTransactionTypeToCategory(type: string): RevenueCategory | null {
  const mapping: Record<string, RevenueCategory> = {
    'mentorship': 'mentorship',
    'mentorship_session': 'mentorship',
    'digital_product': 'digital_products',
    'product': 'digital_products',
    'club_subscription': 'clubs',
    'club': 'clubs',
    'event_ticket': 'events',
    'event': 'events',
    'subscription': 'subscriptions',
    'tip': 'tips',
    'gift': 'tips'
  };

  return mapping[type] || 'other';
}

export async function generateAnonymizedRevenueSources(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<AnonymizedRevenueSource[]> {
  try {
    const revenueData = await getRevenueDataForPeriod(userId, periodStart, periodEnd);

    const sourceMap = new Map<string, AnonymizedRevenueSource>();

    for (const item of revenueData) {
      const key = `${item.category}_${item.sourceCountry}`;
      
      if (sourceMap.has(key)) {
        const existing = sourceMap.get(key)!;
        existing.amount += item.amount;
        existing.transactionCount += 1;
      } else {
        sourceMap.set(key, {
          category: item.category,
          sourceCountry: item.sourceCountry,
          amount: item.amount,
          currency: 'USD',
          transactionCount: 1,
          period: `${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`
        });
      }
    }

    return Array.from(sourceMap.values());
  } catch (error) {
    console.error('Error generating anonymized revenue sources:', error);
    return [];
  }
}

export async function getTaxLiabilitiesForYear(
  userId: string,
  taxYear: number
): Promise<TaxLiabilityRecord[]> {
  try {
    const snapshot = await db
      .collection('tax_liability_records')
      .where('userId', '==', userId)
      .where('taxYear', '==', taxYear)
      .orderBy('taxQuarter', 'asc')
      .get();

    return snapshot.docs.map(doc => ({
      ...doc.data(),
      calculatedAt: doc.data().calculatedAt?.toDate()
    })) as TaxLiabilityRecord[];
  } catch (error) {
    console.error('Error fetching tax liabilities:', error);
    return [];
  }
}

export async function calculateYearlyTaxSummary(
  userId: string,
  taxYear: number
): Promise<{
  totalGrossRevenue: number;
  totalPlatformFee: number;
  totalNetRevenue: number;
  totalVAT: number;
  totalGST: number;
  revenueByCategory: Record<RevenueCategory, number>;
  revenueByCountry: Record<string, number>;
}> {
  const liabilities = await getTaxLiabilitiesForYear(userId, taxYear);

  const summary = {
    totalGrossRevenue: 0,
    totalPlatformFee: 0,
    totalNetRevenue: 0,
    totalVAT: 0,
    totalGST: 0,
    revenueByCategory: {
      mentorship: 0,
      digital_products: 0,
      clubs: 0,
      events: 0,
      subscriptions: 0,
      tips: 0,
      other: 0
    } as Record<RevenueCategory, number>,
    revenueByCountry: {} as Record<string, number>
  };

  for (const liability of liabilities) {
    summary.totalGrossRevenue += liability.grossRevenue;
    summary.totalPlatformFee += liability.platformFee;
    summary.totalNetRevenue += liability.netRevenue;
    summary.totalVAT += liability.estimatedVAT || 0;
    summary.totalGST += liability.estimatedGST || 0;

    for (const [category, amount] of Object.entries(liability.revenueByCategory)) {
      summary.revenueByCategory[category as RevenueCategory] += amount;
    }

    for (const [country, amount] of Object.entries(liability.revenueByCountry)) {
      summary.revenueByCountry[country] = (summary.revenueByCountry[country] || 0) + amount;
    }
  }

  return summary;
}

export async function recalculateTaxLiabilityForPeriod(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{ success: boolean; liability?: TaxLiabilityRecord; error?: string }> {
  try {
    const profile = await getTaxProfile(userId);
    
    if (!profile) {
      return {
        success: false,
        error: 'Tax profile not found'
      };
    }

    const revenueData = await getRevenueDataForPeriod(userId, periodStart, periodEnd);

    const existingLiabilities = await getTaxLiabilitiesForYear(
      userId,
      periodEnd.getFullYear()
    );

    const context: TaxCalculationContext = {
      userId,
      profile,
      periodStart,
      periodEnd,
      revenueData,
      existingLiabilities
    };

    return await calculateTaxLiability(context);
  } catch (error) {
    console.error('Error recalculating tax liability:', error);
    return {
      success: false,
      error: 'Failed to recalculate tax liability'
    };
  }
}