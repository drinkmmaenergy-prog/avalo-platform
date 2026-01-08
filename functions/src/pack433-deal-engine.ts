/**
 * PACK 433 — Influencer Marketplace & Creator Deal Automation Engine
 * Part 2: Deal Engine (Smart Contract Logic)
 * 
 * Features:
 * - CPI (Cost Per Install)
 * - CPS (Cost Per Sale/Paid User)
 * - RevShare (Lifetime Revenue Share)
 * - Hybrid deals (CPI + RevShare)
 * - Auto-generated contracts
 * - Time-limited offers
 * - Country-specific pricing
 * - Anti-double-attribution lock
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp, generateId, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type DealType = 'CPI' | 'CPS' | 'REVSHARE' | 'HYBRID';
export type DealStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'TERMINATED';

export interface DealTerms {
  // CPI terms
  cpiAmount?: number; // Tokens per install
  
  // CPS terms
  cpsAmount?: number; // Tokens per paid user
  minPurchaseAmount?: number; // Minimum purchase to qualify
  
  // RevShare terms
  revSharePercentage?: number; // 0-100, creator's share of revenue
  revShareDurationDays?: number; // How long to track revenue (0 = lifetime)
  
  // Geographic restrictions
  targetCountries?: string[]; // Empty = all countries
  excludedCountries?: string[];
  
  // Caps & limits
  maxInstalls?: number;
  maxPayout?: number; // Maximum total payout in tokens
  dailyCap?: number; // Maximum installs per day
  
  // Timing
  startDate?: Timestamp;
  endDate?: Timestamp;
}

export interface Deal {
  id: string;
  creatorId: string;
  dealType: DealType;
  status: DealStatus;
  terms: DealTerms;
  
  // Tracking
  stats: {
    totalInstalls: number;
    paidUsers: number;
    totalRevenue: number;
    totalPayout: number;
  };
  
  // Contract metadata
  contractId: string;
  generatedContract?: string; // Auto-generated contract text
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  activatedAt?: Timestamp;
  expiresAt?: Timestamp;
  
  // Admin
  createdBy: string;
  adminNotes?: string;
}

export interface DealContract {
  id: string;
  dealId: string;
  creatorId: string;
  contractText: string;
  acceptedAt?: Timestamp;
  acceptedByCreator: boolean;
  ipAddress?: string;
  userAgent?: string;
}

// ============================================================================
// DEAL CREATION & MANAGEMENT
// ============================================================================

/**
 * Create a new deal (admin or automated)
 */
export const createDeal = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ dealId: string; contractId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { creatorId, dealType, terms } = request.data;

    // Validation
    if (!creatorId || !dealType || !terms) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: creatorId, dealType, terms'
      );
    }

    if (!['CPI', 'CPS', 'REVSHARE', 'HYBRID'].includes(dealType)) {
      throw new HttpsError('invalid-argument', 'Invalid deal type');
    }

    // Validate terms based on deal type
    validateDealTerms(dealType, terms);

    try {
      // Check if creator exists and is active
      const creatorDoc = await db.collection('creator_profiles').doc(creatorId).get();
      
      if (!creatorDoc.exists) {
        throw new HttpsError('not-found', 'Creator not found');
      }

      const creator = creatorDoc.data();
      if (creator?.status !== 'ACTIVE') {
        throw new HttpsError('failed-precondition', 'Creator must be active to create deals');
      }

      // Generate contract
      const contractId = generateId();
      const contractText = generateContractText(dealType, terms, creator);

      // Create deal
      const deal: Omit<Deal, 'id'> = {
        creatorId,
        dealType,
        status: 'DRAFT',
        terms,
        stats: {
          totalInstalls: 0,
          paidUsers: 0,
          totalRevenue: 0,
          totalPayout: 0,
        },
        contractId,
        generatedContract: contractText,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: request.auth.uid,
      };

      if (terms.endDate) {
        deal.expiresAt = terms.endDate;
      }

      const dealRef = await db.collection('creator_deals').add(deal);

      // Create contract record
      const contract: Omit<DealContract, 'id'> = {
        dealId: dealRef.id,
        creatorId,
        contractText,
        acceptedByCreator: false,
      };

      await db.collection('deal_contracts').doc(contractId).set(contract);

      logger.info(`Deal created: ${dealRef.id}`, {
        creatorId,
        dealType,
        contractId,
      });

      return {
        dealId: dealRef.id,
        contractId,
      };
    } catch (error: any) {
      logger.error('Error creating deal', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to create deal: ${error.message}`);
    }
  }
);

/**
 * Accept a deal contract (creator)
 */
export const acceptDealContract = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean; dealId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { contractId } = request.data;

    if (!contractId) {
      throw new HttpsError('invalid-argument', 'Missing contractId');
    }

    try {
      const contractRef = db.collection('deal_contracts').doc(contractId);
      const contractDoc = await contractRef.get();

      if (!contractDoc.exists) {
        throw new HttpsError('not-found', 'Contract not found');
      }

      const contract = contractDoc.data() as DealContract;

      // Verify creator owns this contract
      const creatorQuery = await db
        .collection('creator_profiles')
        .where('userId', '==', request.auth.uid)
        .limit(1)
        .get();

      if (creatorQuery.empty) {
        throw new HttpsError('permission-denied', 'User is not a registered creator');
      }

      const creatorId = creatorQuery.docs[0].id;

      if (contract.creatorId !== creatorId) {
        throw new HttpsError('permission-denied', 'Cannot accept another creator\'s contract');
      }

      if (contract.acceptedByCreator) {
        throw new HttpsError('already-exists', 'Contract already accepted');
      }

      // Accept contract
      await contractRef.update({
        acceptedByCreator: true,
        acceptedAt: Timestamp.now(),
        ipAddress: request.rawRequest?.ip || 'unknown',
        userAgent: request.rawRequest?.headers['user-agent'] || 'unknown',
      });

      // Activate deal
      const dealRef = db.collection('creator_deals').doc(contract.dealId);
      await dealRef.update({
        status: 'ACTIVE',
        activatedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Update creator stats
      await db.collection('creator_profiles').doc(creatorId).update({
        'stats.activeDeals': increment(1),
        updatedAt: Timestamp.now(),
      });

      logger.info(`Deal contract accepted: ${contractId}`, {
        dealId: contract.dealId,
        creatorId,
      });

      return {
        success: true,
        dealId: contract.dealId,
      };
    } catch (error: any) {
      logger.error('Error accepting contract', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to accept contract: ${error.message}`);
    }
  }
);

/**
 * Get deals for a creator
 */
export const getCreatorDeals = onCall(
  { region: 'europe-west3' },
  async (request): Promise<Deal[]> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { creatorId, status } = request.data;

    try {
      let query: FirebaseFirestore.Query = db
        .collection('creator_deals')
        .where('creatorId', '==', creatorId);

      if (status) {
        query = query.where('status', '==', status);
      }

      query = query.orderBy('createdAt', 'desc');

      const snapshot = await query.get();

      const deals: Deal[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Deal));

      return deals;
    } catch (error: any) {
      logger.error('Error fetching creator deals', error);
      throw new HttpsError('internal', `Failed to fetch deals: ${error.message}`);
    }
  }
);

/**
 * Pause or resume a deal
 */
export const toggleDealStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean; newStatus: DealStatus }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { dealId } = request.data;

    if (!dealId) {
      throw new HttpsError('invalid-argument', 'Missing dealId');
    }

    try {
      const dealRef = db.collection('creator_deals').doc(dealId);
      const dealDoc = await dealRef.get();

      if (!dealDoc.exists) {
        throw new HttpsError('not-found', 'Deal not found');
      }

      const deal = dealDoc.data() as Deal;

      // Verify creator owns this deal
      const creatorQuery = await db
        .collection('creator_profiles')
        .where('userId', '==', request.auth.uid)
        .limit(1)
        .get();

      if (creatorQuery.empty) {
        throw new HttpsError('permission-denied', 'User is not a registered creator');
      }

      const creatorId = creatorQuery.docs[0].id;

      if (deal.creatorId !== creatorId) {
        throw new HttpsError('permission-denied', 'Cannot modify another creator\'s deal');
      }

      // Toggle status
      let newStatus: DealStatus;

      if (deal.status === 'ACTIVE') {
        newStatus = 'PAUSED';
      } else if (deal.status === 'PAUSED') {
        newStatus = 'ACTIVE';
      } else {
        throw new HttpsError('failed-precondition', `Cannot toggle deal in ${deal.status} status`);
      }

      await dealRef.update({
        status: newStatus,
        updatedAt: Timestamp.now(),
      });

      logger.info(`Deal status toggled: ${dealId}`, { oldStatus: deal.status, newStatus });

      return {
        success: true,
        newStatus,
      };
    } catch (error: any) {
      logger.error('Error toggling deal status', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to toggle status: ${error.message}`);
    }
  }
);

// ============================================================================
// DEAL VALIDATION & UTILITIES
// ============================================================================

/**
 * Validate deal terms based on type
 */
function validateDealTerms(dealType: DealType, terms: DealTerms): void {
  switch (dealType) {
    case 'CPI':
      if (!terms.cpiAmount || terms.cpiAmount <= 0) {
        throw new HttpsError('invalid-argument', 'CPI deals require positive cpiAmount');
      }
      break;

    case 'CPS':
      if (!terms.cpsAmount || terms.cpsAmount <= 0) {
        throw new HttpsError('invalid-argument', 'CPS deals require positive cpsAmount');
      }
      break;

    case 'REVSHARE':
      if (
        !terms.revSharePercentage ||
        terms.revSharePercentage <= 0 ||
        terms.revSharePercentage > 100
      ) {
        throw new HttpsError(
          'invalid-argument',
          'RevShare deals require percentage between 0-100'
        );
      }
      break;

    case 'HYBRID':
      if (!terms.cpiAmount || terms.cpiAmount <= 0) {
        throw new HttpsError('invalid-argument', 'Hybrid deals require positive cpiAmount');
      }
      if (
        !terms.revSharePercentage ||
        terms.revSharePercentage <= 0 ||
        terms.revSharePercentage > 100
      ) {
        throw new HttpsError(
          'invalid-argument',
          'Hybrid deals require revSharePercentage between 0-100'
        );
      }
      break;
  }
}

/**
 * Generate contract text based on deal terms
 */
function generateContractText(dealType: DealType, terms: DealTerms, creator: any): string {
  const sections: string[] = [];

  sections.push('AVALO CREATOR PARTNERSHIP AGREEMENT\n');
  sections.push(`Deal Type: ${dealType}\n`);
  sections.push(`Creator: ${creator.displayName}\n`);
  sections.push(`Date: ${new Date().toISOString().split('T')[0]}\n\n`);

  sections.push('TERMS AND CONDITIONS:\n\n');

  // Type-specific terms
  switch (dealType) {
    case 'CPI':
      sections.push(`1. COST PER INSTALL (CPI)\n`);
      sections.push(`   - Payment: ${terms.cpiAmount} tokens per verified install\n`);
      break;

    case 'CPS':
      sections.push(`1. COST PER SALE (CPS)\n`);
      sections.push(`   - Payment: ${terms.cpsAmount} tokens per paid user\n`);
      if (terms.minPurchaseAmount) {
        sections.push(`   - Minimum purchase: ${terms.minPurchaseAmount} tokens\n`);
      }
      break;

    case 'REVSHARE':
      sections.push(`1. REVENUE SHARE\n`);
      sections.push(`   - Share: ${terms.revSharePercentage}% of user's lifetime revenue\n`);
      if (terms.revShareDurationDays && terms.revShareDurationDays > 0) {
        sections.push(`   - Duration: ${terms.revShareDurationDays} days\n`);
      } else {
        sections.push(`   - Duration: Lifetime\n`);
      }
      break;

    case 'HYBRID':
      sections.push(`1. HYBRID DEAL (CPI + RevShare)\n`);
      sections.push(`   - Install bonus: ${terms.cpiAmount} tokens\n`);
      sections.push(`   - Revenue share: ${terms.revSharePercentage}% of user's revenue\n`);
      break;
  }

  // Geographic restrictions
  if (terms.targetCountries && terms.targetCountries.length > 0) {
    sections.push(`\n2. GEOGRAPHIC TARGETING\n`);
    sections.push(`   - Target countries: ${terms.targetCountries.join(', ')}\n`);
  }

  if (terms.excludedCountries && terms.excludedCountries.length > 0) {
    sections.push(`   - Excluded countries: ${terms.excludedCountries.join(', ')}\n`);
  }

  // Caps & limits
  if (terms.maxInstalls || terms.maxPayout || terms.dailyCap) {
    sections.push(`\n3. CAPS & LIMITS\n`);
    if (terms.maxInstalls) {
      sections.push(`   - Maximum installs: ${terms.maxInstalls}\n`);
    }
    if (terms.maxPayout) {
      sections.push(`   - Maximum payout: ${terms.maxPayout} tokens\n`);
    }
    if (terms.dailyCap) {
      sections.push(`   - Daily cap: ${terms.dailyCap} installs\n`);
    }
  }

  // Duration
  if (terms.startDate || terms.endDate) {
    sections.push(`\n4. DURATION\n`);
    if (terms.startDate) {
      sections.push(`   - Start: ${terms.startDate.toDate().toISOString().split('T')[0]}\n`);
    }
    if (terms.endDate) {
      sections.push(`   - End: ${terms.endDate.toDate().toISOString().split('T')[0]}\n`);
    }
  }

  // Standard terms
  sections.push(`\n5. ANTI-FRAUD POLICY\n`);
  sections.push(`   - All installs subject to fraud verification\n`);
  sections.push(`   - Fraudulent activity results in immediate termination\n`);
  sections.push(`   - Earnings may be withheld pending investigation\n`);

  sections.push(`\n6. PAYMENT TERMS\n`);
  sections.push(`   - Payouts processed weekly\n`);
  sections.push(`   - Minimum payout threshold: 1000 tokens\n`);
  sections.push(`   - Attribution locked to first creator only\n`);

  sections.push(`\n7. TERMINATION\n`);
  sections.push(`   - Either party may terminate with 7 days notice\n`);
  sections.push(`   - Earned commissions paid upon termination\n`);

  return sections.join('');
}

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

/**
 * Auto-expire deals that have passed their end date
 */
export const expireDealsDaily = onSchedule(
  {
    schedule: '0 0 * * *', // Daily at midnight UTC
    timeZone: 'UTC',
    memory: '256MiB' as const,
  },
  async (event) => {
    try {
      logger.info('Starting deal expiration check');

      const now = Timestamp.now();

      // Find active deals that have expired
      const expiredDeals = await db
        .collection('creator_deals')
        .where('status', '==', 'ACTIVE')
        .where('expiresAt', '<=', now)
        .get();

      if (expiredDeals.empty) {
        logger.info('No deals to expire');
        return null;
      }

      const batch = db.batch();
      let count = 0;

      expiredDeals.forEach((doc) => {
        batch.update(doc.ref, {
          status: 'EXPIRED',
          updatedAt: now,
        });

        const deal = doc.data() as Deal;

        // Update creator stats
        const creatorRef = db.collection('creator_profiles').doc(deal.creatorId);
        batch.update(creatorRef, {
          'stats.activeDeals': increment(-1),
          updatedAt: now,
        });

        count++;
      });

      await batch.commit();

      logger.info(`Expired ${count} deals`);

      return null;
    } catch (error: any) {
      logger.error('Error expiring deals', error);
      throw error;
    }
  }
);

/**
 * Calculate and update deal statistics daily
 */
export const updateDealStatsDaily = onSchedule(
  {
    schedule: '0 1 * * *', // Daily at 1 AM UTC
    timeZone: 'UTC',
    memory: '512MiB' as const,
  },
  async (event) => {
    try {
      logger.info('Starting deal stats update');

      const activeDeals = await db
        .collection('creator_deals')
        .where('status', '==', 'ACTIVE')
        .get();

      if (activeDeals.empty) {
        logger.info('No active deals to update');
        return null;
      }

      let processedCount = 0;

      for (const dealDoc of activeDeals.docs) {
        const deal = dealDoc.data() as Deal;

        // Aggregate stats from attributions
        const attributions = await db
          .collection('creator_attributions')
          .where('dealId', '==', dealDoc.id)
          .get();

        let totalInstalls = 0;
        let paidUsers = 0;
        let totalRevenue = 0;

        attributions.forEach((attrDoc) => {
          const attr = attrDoc.data();
          totalInstalls++;
          if (attr.isPaidUser) paidUsers++;
          if (attr.revenue) totalRevenue += attr.revenue;
        });

        // Update deal stats
        await dealDoc.ref.update({
          'stats.totalInstalls': totalInstalls,
          'stats.paidUsers': paidUsers,
          'stats.totalRevenue': totalRevenue,
          updatedAt: Timestamp.now(),
        });

        processedCount++;
      }

      logger.info(`Updated stats for ${processedCount} deals`);

      return null;
    } catch (error: any) {
      logger.error('Error updating deal stats', error);
      throw error;
    }
  }
);
