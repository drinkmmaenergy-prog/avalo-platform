import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 433 — Influencer Marketplace & Creator Deal Automation Engine
 * Part 4: Payout Engine for Creators
 * 
 * Features:
 * - Creator earnings wallets
 * - Weekly/Monthly payouts
 * - Stripe/Wise integration
 * - Tax report generation
 * - Fraud lock enforcement
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';

import { db, serverTimestamp, increment, generateId } from './init';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { admin, auth, functions, onSchedule } from './runtime';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PAYOUT_CONFIG = {
  MINIMUM_PAYOUT_TOKENS: 1000,
  PAYOUT_PROCESSING_FEE_PERCENTAGE: 2.5, // 2.5% processing fee
  MAX_PAYOUT_AMOUNT_TOKENS: 100000,
  PAYOUT_SCHEDULE: 'WEEKLY' as 'WEEKLY' | 'MONTHLY',
} as const;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type PayoutStatus = 
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'FRAUD_HOLD';

export type PayoutMethod = 'STRIPE' | 'WISE' | 'CRYPTO' | 'BANK_TRANSFER';

export interface CreatorPayoutAccount {
  id: string;
  earnerId: string;
  method: PayoutMethod;
  
  // Stripe
  stripeAccountId?: string;
  stripeCustomerId?: string;
  
  // Wise
  wiseRecipientId?: string;
  
  // Bank
  bankName?: string;
  accountNumber?: string; // Encrypted
  routingNumber?: string;
  swiftCode?: string;
  iban?: string;
  
  // Crypto
  cryptoAddress?: string;
  cryptoNetwork?: string;
  
  // Verification
  verified: boolean;
  verifiedAt?: Timestamp;
  
  // Status
  active: boolean;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreatorPayout {
  id: string;
  earnerId: string;
  dealId?: string; // Optional: can be aggregate of multiple deals
  payoutAccountId: string;
  
  // Amounts
  tokensAmount: number;
  fiatAmount: number; // USD equivalent
  fiatCurrency: string;
  processingFee: number;
  netAmount: number;
  
  // Revenue breakdown
  revenueBreakdown: {
    cpiEarnings: number;
    cpsEarnings: number;
    revShareEarnings: number;
  };
  
  // Status
  status: PayoutStatus;
  method: PayoutMethod;
  
  // Processing
  transactionId?: string;
  externalPaymentId?: string; // Stripe/Wise transaction ID
  failureReason?: string;
  
  // Fraud
  fraudChecked: boolean;
  fraudCheckResult?: 'PASS' | 'FAIL' | 'REVIEW';
  fraudNotes?: string;
  
  // Timestamps
  requestedAt: Timestamp;
  processedAt?: Timestamp;
  completedAt?: Timestamp;
  
  // Tax reporting
  taxYear: number;
  taxReportGenerated: boolean;
  taxReportUrl?: string;
}

export interface PayoutCalculation {
  totalTokens: number;
  cpiEarnings: number;
  cpsEarnings: number;
  revShareEarnings: number;
  fiatAmount: number;
  processingFee: number;
  netAmount: number;
  eligible: boolean;
  reason?: string;
}

// ============================================================================
// PAYOUT ACCOUNT MANAGEMENT
// ============================================================================

/**
 * Add payout account for earner
 */
export const addPayoutAccount = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{ accountId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { earnerId, method, accountDetails } = request.data;

    if (!earnerId || !method || !accountDetails) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: earnerId, method, accountDetails'
      );
    }

    if (!['STRIPE', 'WISE', 'CRYPTO', 'BANK_TRANSFER'].includes(method)) {
      throw new HttpsError('invalid-argument', 'Invalid payout method');
    }

    try {
      // Verify earner ownership
      const earnerDoc = await db.collection('earner_profiles').doc(earnerId).get();
      
      if (!earnerDoc.exists) {
        throw new HttpsError('not-found', 'Creator not found');
      }

      const earner = earnerDoc.data();

      if (earner?.userId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Cannot add account for another earner');
      }

      // Create payout account
      const account: Omit<CreatorPayoutAccount, 'id'> = {
        earnerId,
        method,
        verified: false,
        active: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        ...accountDetails,
      };

      const accountRef = await db.collection('earner_payout_accounts').add(account);

      logger.info(`Payout account added: ${accountRef.id}`, {
        earnerId,
        method,
      });

      console.log('Scheduled job result:', { accountId: accountRef.id });


      return;
    } catch (error: any) {
      logger.error('Error adding payout account', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to add payout account: ${error.message}`);
    }
  }
);

/**
 * Get earner's payout accounts
 */
export const getPayoutAccounts = onCall(
  { region: 'europe-west1' },
  async (request): Promise<CreatorPayoutAccount[]> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { earnerId } = request.data;

    try {
      const accountsSnapshot = await db
        .collection('earner_payout_accounts')
        .where('earnerId', '==', earnerId)
        .where('active', '==', true)
        .get();

      const accounts: CreatorPayoutAccount[] = accountsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as CreatorPayoutAccount));

      return accounts;
    } catch (error: any) {
      logger.error('Error fetching payout accounts', error);
      throw new HttpsError('internal', `Failed to fetch accounts: ${error.message}`);
    }
  }
);

// ============================================================================
// PAYOUT CALCULATIONS
// ============================================================================

/**
 * Internal calculation function (used by both API and internal  code)
 */
async function calculatePayoutInternal(earnerId: string): Promise<PayoutCalculation> {
  // Verify earner exists
  const earnerDoc = await db.collection('earner_profiles').doc(earnerId).get();
  
  if (!earnerDoc.exists) {
    throw new HttpsError('not-found', 'Creator not found');
  }

  const earner = earnerDoc.data();

  // Check fraud status
  if (earner?.status === 'BANNED' || earner?.status === 'SUSPENDED') {
    console.log('Scheduled job result:', {
      totalTokens: 0,
      cpiEarnings: 0,
      cpsEarnings: 0,
      revShareEarnings: 0,
      fiatAmount: 0,
      processingFee: 0,
      netAmount: 0,
      eligible: false,
      reason: 'Account suspended or banned',
    });

    return;
  }

  // Calculate earnings from all attributions
  const attributions = await db
    .collection('earner_attributions')
    .where('earnerId', '==', earnerId)
    .where('verified', '==', true) // Only verified attributions
    .get();

  let cpiEarnings = 0;
  let cpsEarnings = 0;
  let revShareEarnings = 0;

  for (const attrDoc of attributions.docs) {
    const attr = attrDoc.data();
    const dealDoc = await db.collection('earner_deals').doc(attr.dealId).get();
    
    if (!dealDoc.exists) continue;
    
    const deal = dealDoc.data();

    // Calculate earnings based on deal type
    switch (deal?.dealType) {
      case 'CPI':
        cpiEarnings += deal.terms.cpiAmount || 0;
        break;

      case 'CPS':
        if (attr.isPaidUser && deal.terms.cpsAmount) {
          cpsEarnings += deal.terms.cpsAmount;
        }
        break;

      case 'REVSHARE':
        if (deal.terms.revSharePercentage) {
          const share = (attr.lifetimeRevenue * deal.terms.revSharePercentage) / 100;
          revShareEarnings += share;
        }
        break;

      case 'HYBRID':
        cpiEarnings += deal.terms.cpiAmount || 0;
        if (deal.terms.revSharePercentage) {
          const share = (attr.lifetimeRevenue * deal.terms.revSharePercentage) / 100;
          revShareEarnings += share;
        }
        break;
    }
  }

  // Calculate total earnings
  const totalTokens = cpiEarnings + cpsEarnings + revShareEarnings;

  // Check if eligible for payout
  if (totalTokens < PAYOUT_CONFIG.MINIMUM_PAYOUT_TOKENS) {
    return {
      totalTokens,
      cpiEarnings,
      cpsEarnings,
      revShareEarnings,
      fiatAmount: 0,
      processingFee: 0,
      netAmount: 0,
      eligible: false,
      reason: `Minimum payout is ${PAYOUT_CONFIG.MINIMUM_PAYOUT_TOKENS} tokens`,
    };
  }

  // Convert to fiat (assuming 1 token = $0.10 USD for example)
  const TOKEN_TO_USD = 0.10;
  const fiatAmount = totalTokens * TOKEN_TO_USD;

  // Calculate processing fee
  const processingFee = (fiatAmount * PAYOUT_CONFIG.PAYOUT_PROCESSING_FEE_PERCENTAGE) / 100;
  const netAmount = fiatAmount - processingFee;

  console.log('Scheduled job result:', {
    totalTokens,
    cpiEarnings,
    cpsEarnings,
    revShareEarnings,
    fiatAmount,
    processingFee,
    netAmount,
    eligible: true,
  });


  return;
}

/**
 * Calculate earner's earnings and payout eligibility
 */
export const calculatePayoutAmount = onCall(
  { region: 'europe-west1' },
  async (request): Promise<PayoutCalculation> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { earnerId } = request.data;

    if (!earnerId) {
      throw new HttpsError('invalid-argument', 'Missing earnerId');
    }

    try {
      // Verify earner ownership
      const earnerDoc = await db.collection('earner_profiles').doc(earnerId).get();
      
      if (!earnerDoc.exists) {
        throw new HttpsError('not-found', 'Creator not found');
      }

      const earner = earnerDoc.data();

      if (earner?.userId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Cannot view another earner\'s earnings');
      }

      return await calculatePayoutInternal(earnerId);
    } catch (error: any) {
      logger.error('Error calculating payout', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to calculate payout: ${error.message}`);
    }
  }
);

// ============================================================================
// PAYOUT REQUESTS
// ============================================================================

/**
 * Request a payout
 */
export const requestPayout = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{ payoutId: string; status: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { earnerId, payoutAccountId } = request.data;

    if (!earnerId || !payoutAccountId) {
      throw new HttpsError('invalid-argument', 'Missing earnerId or payoutAccountId');
    }

    try {
      // Verify earner ownership
      const earnerDoc = await db.collection('earner_profiles').doc(earnerId).get();
      
      if (!earnerDoc.exists) {
        throw new HttpsError('not-found', 'Creator not found');
      }

      const earner = earnerDoc.data();

      if (earner?.userId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Cannot request payout for another earner');
      }

      // Check for pending payouts
      const pendingPayouts = await db
        .collection('earner_payouts')
        .where('earnerId', '==', earnerId)
        .where('status', 'in', ['PENDING', 'PROCESSING'])
        .limit(1)
        .get();

      if (!pendingPayouts.empty) {
        throw new HttpsError(
          'failed-precondition',
          'You already have a pending payout request'
        );
      }

      // Calculate payout amount
      const calculation = await calculatePayoutInternal(earnerId);

      if (!calculation.eligible) {
        throw new HttpsError('failed-precondition', calculation.reason || 'Not eligible for payout');
      }

      // Get payout account
      const accountDoc = await db
        .collection('earner_payout_accounts')
        .doc(payoutAccountId)
        .get();

      if (!accountDoc.exists) {
        throw new HttpsError('not-found', 'Payout account not found');
      }

      const account = accountDoc.data() as CreatorPayoutAccount;

      if (!account.verified) {
        throw new HttpsError('failed-precondition', 'Payout account not verified');
      }

      // Create payout request
      const payout: Omit<CreatorPayout, 'id'> = {
        earnerId,
        payoutAccountId,
        tokensAmount: calculation.totalTokens,
        fiatAmount: calculation.fiatAmount,
        fiatCurrency: 'USD',
        processingFee: calculation.processingFee,
        netAmount: calculation.netAmount,
        revenueBreakdown: {
          cpiEarnings: calculation.cpiEarnings,
          cpsEarnings: calculation.cpsEarnings,
          revShareEarnings: calculation.revShareEarnings,
        },
        status: 'PENDING',
        method: account.method,
        fraudChecked: false,
        requestedAt: Timestamp.now(),
        taxYear: new Date().getFullYear(),
        taxReportGenerated: false,
      };

      const payoutRef = await db.collection('earner_payouts').add(payout);

      logger.info(`Payout requested: ${payoutRef.id}`, {
        earnerId,
        amount: calculation.netAmount,
      });

      return {
        payoutId: payoutRef.id,
        status: 'PENDING',
      };
    } catch (error: any) {
      logger.error('Error requesting payout', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to request payout: ${error.message}`);
    }
  }
);

/**
 * Get earner's payout history
 */
export const getPayoutHistory = onCall(
  { region: 'europe-west1' },
  async (request): Promise<CreatorPayout[]> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { earnerId, limit } = request.data;

    try {
      let query: FirebaseFirestore.Query = db
        .collection('earner_payouts')
        .where('earnerId', '==', earnerId)
        .orderBy('requestedAt', 'desc');

      if (limit) {
        query = query.limit(Math.min(limit, 100));
      } else {
        query = query.limit(50);
      }

      const snapshot = await query.get();

      const payouts: CreatorPayout[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as CreatorPayout));

      return payouts;
    } catch (error: any) {
      logger.error('Error fetching payout history', error);
      throw new HttpsError('internal', `Failed to fetch history: ${error.message}`);
    }
  }
);

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Process payout (admin only)
 */
export const processPayout = onCall(
  { region: 'europe-west1', timeoutSeconds: 300 },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // TODO: Verify admin role

    const { payoutId } = request.data;

    if (!payoutId) {
      throw new HttpsError('invalid-argument', 'Missing payoutId');
    }

    try {
      const payoutRef = db.collection('earner_payouts').doc(payoutId);
      const payoutDoc = await payoutRef.get();

      if (!payoutDoc.exists) {
        throw new HttpsError('not-found', 'Payout not found');
      }

      const payout = payoutDoc.data() as CreatorPayout;

      if (payout.status !== 'PENDING') {
        throw new HttpsError('failed-precondition', `Payout is ${payout.status}, cannot process`);
      }

      // Update status to processing
      await payoutRef.update({
        status: 'PROCESSING',
        updatedAt: Timestamp.now(),
      });

      // TODO: Integrate with Stripe/Wise to send payment

      // Simulate successful payment
      const transactionId = generateId();

      // Update payout as completed
      await payoutRef.update({
        status: 'COMPLETED',
        transactionId,
        processedAt: Timestamp.now(),
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      logger.info(`Payout processed: ${payoutId}`, {
        earnerId: payout.earnerId,
        amount: payout.netAmount,
      });

      console.log('Scheduled job result:', { success: true });


      return;
    } catch (error: any) {
      logger.error('Error processing payout', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to process payout: ${error.message}`);
    }
  }
);

/**
 * Place payout on fraud hold (admin only)
 */
export const holdPayoutForFraud = onCall(
  { region: 'europe-west1' },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // TODO: Verify admin role

    const { payoutId, reason } = request.data;

    if (!payoutId || !reason) {
      throw new HttpsError('invalid-argument', 'Missing payoutId or reason');
    }

    try {
      const payoutRef = db.collection('earner_payouts').doc(payoutId);
      const payoutDoc = await payoutRef.get();

      if (!payoutDoc.exists) {
        throw new HttpsError('not-found', 'Payout not found');
      }

      await payoutRef.update({
        status: 'FRAUD_HOLD',
        fraudCheckResult: 'REVIEW',
        fraudNotes: reason,
        updatedAt: Timestamp.now(),
      });

      logger.info(`Payout placed on fraud hold: ${payoutId}`, { reason });

      console.log('Scheduled job result:', { success: true });


      return;
    } catch (error: any) {
      logger.error('Error holding payout', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', `Failed to hold payout: ${error.message}`);
    }
  }
);

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

/**
 * Process weekly payouts automatically
 */
export const processWeeklyPayouts = onSchedule(
  {
    schedule: '0 9 * * 1',  // Every Monday at 9 AM UTC
    timeZone: 'UTC',
    memory: '1GiB' as const,
  },
  async (event) => {
    try {
      logger.info('Starting weekly payout processing');

      // Get all pending payouts
      const pendingPayouts = await db
        .collection('earner_payouts')
        .where('status', '==', 'PENDING')
        .where('fraudChecked', '==', true)
        .where('fraudCheckResult', '==', 'PASS')
        .get();

      if (pendingPayouts.empty) {
        logger.info('No pending payouts to process');
        return;
      }

      let processedCount = 0;
      let failedCount = 0;

      for (const payoutDoc of pendingPayouts.docs) {
        try {
          // TODO: Integrate with actual payment provider
          
          await payoutDoc.ref.update({
            status: 'COMPLETED',
            transactionId: generateId(),
            processedAt: Timestamp.now(),
            completedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });

          processedCount++;
        } catch (error: any) {
          logger.error(`Failed to process payout ${payoutDoc.id}`, error);
          
          await payoutDoc.ref.update({
            status: 'FAILED',
            failureReason: error.message,
            updatedAt: Timestamp.now(),
          });

          failedCount++;
        }
      }

      logger.info('Weekly payout processing completed', {
        processed: processedCount,
        failed: failedCount,
      });

      return;
    } catch (error: any) {
      logger.error('Error in weekly payout processing', error);
      throw error;
    }
  }
);

























