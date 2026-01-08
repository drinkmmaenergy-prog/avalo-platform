/**
 * PACK 289 — Payout Providers Integration
 * 
 * Integration stubs for:
 * - Wise (formerly TransferWise)
 * - Bank Transfer (direct SEPA/SWIFT)
 * - Manual payout handling
 * 
 * NOTE: This is a stub implementation. Replace with actual API integrations
 * when API keys and accounts are configured.
 * 
 * @package avaloapp
 * @version 1.0.0
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  StartPayoutRequest,
  StartPayoutResponse,
  PayoutWebhookData,
  PayoutMethod,
  WithdrawalProvider,
} from './types/pack289-withdrawals.types';

const db = admin.firestore();

// ============================================================================
// CONFIGURATION
// ============================================================================

interface WiseConfig {
  apiKey?: string;
  apiUrl: string;
  profileId?: string;
}

interface BankTransferConfig {
  enabled: boolean;
  requiresManualProcessing: boolean;
}

const WISE_CONFIG: WiseConfig = {
  apiKey: functions.config().wise?.api_key,
  apiUrl: 'https://api.transferwise.com',
  profileId: functions.config().wise?.profile_id,
};

const BANK_TRANSFER_CONFIG: BankTransferConfig = {
  enabled: true,
  requiresManualProcessing: true,
};

// ============================================================================
// WISE INTEGRATION (STUB)
// ============================================================================

/**
 * Create Wise payout
 * 
 * This is a STUB implementation. When real Wise API keys are available:
 * 1. Create recipient if not exists
 * 2. Create quote
 * 3. Create transfer
 * 4. Fund transfer
 * 5. Return transfer ID
 * 
 * @see https://api-docs.wise.com/
 */
async function createWisePayout(
  userId: string,
  withdrawalId: string,
  currency: string,
  amount: number,
  payoutMethod: PayoutMethod
): Promise<StartPayoutResponse> {
  console.log('[Wise] Creating payout:', {
    userId,
    withdrawalId,
    currency,
    amount,
    recipientId: payoutMethod.wiseRecipientId,
  });

  // Check if API key is configured
  if (!WISE_CONFIG.apiKey) {
    console.warn('[Wise] API key not configured, using manual mode');
    return {
      success: true,
      providerPayoutId: `MANUAL_WISE_${withdrawalId}`,
      provider: 'MANUAL',
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
    };
  }

  try {
    // TODO: Implement actual Wise API calls
    // 
    // Example flow:
    // 1. POST /v1/profiles/{profileId}/transfers
    //    {
    //      "targetAccount": recipientId,
    //      "quoteUuid": quoteId,
    //      "customerTransactionId": withdrawalId,
    //      "details": { "reference": `Avalo payout ${withdrawalId}` }
    //    }
    // 
    // 2. POST /v3/profiles/{profileId}/transfers/{transferId}/payments
    //    { "type": "BALANCE" }
    // 
    // 3. Return transfer ID

    // STUB: Simulate successful creation
    const mockTransferId = `wise_transfer_${Date.now()}`;

    return {
      success: true,
      providerPayoutId: mockTransferId,
      provider: 'WISE',
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days
    };
  } catch (error) {
    console.error('[Wise] Error creating payout:', error);
    return {
      success: false,
      error: 'Failed to create Wise payout',
    };
  }
}

// ============================================================================
// BANK TRANSFER INTEGRATION (STUB)
// ============================================================================

/**
 * Create bank transfer payout
 * 
 * This is a STUB for direct bank transfers (SEPA/SWIFT).
 * In production, this would integrate with your banking provider API
 * or trigger manual processing workflows.
 */
async function createBankTransferPayout(
  userId: string,
  withdrawalId: string,
  currency: string,
  amount: number,
  payoutMethod: PayoutMethod
): Promise<StartPayoutResponse> {
  console.log('[BankTransfer] Creating payout:', {
    userId,
    withdrawalId,
    currency,
    amount,
    iban: payoutMethod.iban?.substring(0, 8) + '****', // Masked for security
  });

  if (BANK_TRANSFER_CONFIG.requiresManualProcessing) {
    // Mark for manual processing
    const payoutId = `MANUAL_BANK_${withdrawalId}`;

    // TODO: In production, create task in admin panel or send notification
    // to finance team to process the bank transfer manually

    return {
      success: true,
      providerPayoutId: payoutId,
      provider: 'MANUAL',
      estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days
    };
  }

  try {
    // TODO: Implement actual bank API integration
    // This would depend on your banking provider (e.g., Stripe Treasury, Banking-as-a-Service provider)

    const mockPayoutId = `bank_transfer_${Date.now()}`;

    return {
      success: true,
      providerPayoutId: mockPayoutId,
      provider: 'BANK_TRANSFER',
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
    };
  } catch (error) {
    console.error('[BankTransfer] Error creating payout:', error);
    return {
      success: false,
      error: 'Failed to create bank transfer',
    };
  }
}

// ============================================================================
// MAIN PAYOUT FUNCTION
// ============================================================================

/**
 * Start payout process
 * Routes to appropriate provider based on payout method
 */
export async function startPayout(
  userId: string,
  withdrawalId: string,
  currency: string,
  amount: number,
  payoutMethod: PayoutMethod
): Promise<StartPayoutResponse> {
  console.log('[Payout] Starting payout:', {
    userId,
    withdrawalId,
    currency,
    amount,
    method: payoutMethod.type,
  });

  try {
    let result: StartPayoutResponse;

    switch (payoutMethod.type) {
      case 'WISE':
        result = await createWisePayout(
          userId,
          withdrawalId,
          currency,
          amount,
          payoutMethod
        );
        break;

      case 'BANK_TRANSFER':
        result = await createBankTransferPayout(
          userId,
          withdrawalId,
          currency,
          amount,
          payoutMethod
        );
        break;

      default:
        result = {
          success: false,
          error: `Unsupported payout method: ${payoutMethod.type}`,
        };
    }

    // Log payout attempt
    await db.collection('payoutLogs').add({
      userId,
      withdrawalId,
      method: payoutMethod.type,
      currency,
      amount,
      result,
      timestamp: admin.firestore.Timestamp.now(),
    });

    return result;
  } catch (error) {
    console.error('[Payout] Error starting payout:', error);
    return {
      success: false,
      error: 'Failed to start payout',
    };
  }
}

// ============================================================================
// WEBHOOK HANDLERS
// ============================================================================

/**
 * Wise webhook handler
 * Handles payment status updates from Wise
 * 
 * @see https://api-docs.wise.com/webhooks
 */
export const payouts_wiseWebhook = functions.https.onRequest(async (req, res) => {
  try {
    console.log('[Wise Webhook] Received event:', req.body);

    // TODO: Verify webhook signature
    // const signature = req.headers['x-signature-sha256'];
    // if (!verifyWiseSignature(req.body, signature)) {
    //   res.status(401).send('Invalid signature');
    //   return;
    // }

    const event = req.body;

    // Handle different event types
    if (event.event_type === 'transfers#state-change') {
      const transferId = event.data.resource.id;
      const currentState = event.data.current_state;

      // Find withdrawal by provider ID
      const withdrawalsQuery = await db
        .collection('withdrawalRequests')
        .where('providerPayoutId', '==', transferId)
        .limit(1)
        .get();

      if (!withdrawalsQuery.empty) {
        const withdrawalDoc = withdrawalsQuery.docs[0];
        const withdrawalRef = db.collection('withdrawalRequests').doc(withdrawalDoc.id);

        // Update status based on transfer state
        if (currentState === 'outgoing_payment_sent') {
          await withdrawalRef.update({
            status: 'PAID',
            paidAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now(),
          });
        } else if (currentState === 'cancelled' || currentState === 'bounced_back') {
          await withdrawalRef.update({
            status: 'FAILED',
            rejectionReason: `Wise transfer ${currentState}`,
            updatedAt: admin.firestore.Timestamp.now(),
          });
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Wise Webhook] Error:', error);
    res.status(500).send('Internal error');
  }
});

/**
 * Generic payout webhook handler
 * For custom banking integrations
 */
export const payouts_genericWebhook = functions.https.onRequest(async (req, res) => {
  try {
    console.log('[Generic Webhook] Received event:', req.body);

    const { providerPayoutId, status, completedAt } = req.body as PayoutWebhookData;

    if (!providerPayoutId) {
      res.status(400).send('Missing providerPayoutId');
      return;
    }

    // Find withdrawal by provider ID
    const withdrawalsQuery = await db
      .collection('withdrawalRequests')
      .where('providerPayoutId', '==', providerPayoutId)
      .limit(1)
      .get();

    if (withdrawalsQuery.empty) {
      res.status(404).send('Withdrawal not found');
      return;
    }

    const withdrawalDoc = withdrawalsQuery.docs[0];
    const withdrawalRef = db.collection('withdrawalRequests').doc(withdrawalDoc.id);

    // Update status
    const updateData: any = {
      updatedAt: admin.firestore.Timestamp.now(),
    };

    if (status === 'COMPLETED') {
      updateData.status = 'PAID';
      updateData.paidAt = completedAt
        ? admin.firestore.Timestamp.fromDate(new Date(completedAt))
        : admin.firestore.Timestamp.now();
    } else if (status === 'FAILED') {
      updateData.status = 'FAILED';
      updateData.rejectionReason = req.body.failureReason || 'Payout failed';
    }

    await withdrawalRef.update(updateData);

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Generic Webhook] Error:', error);
    res.status(500).send('Internal error');
  }
});

// ============================================================================
// MANUAL PAYOUT HELPERS
// ============================================================================

/**
 * Get all pending manual payouts (ADMIN)
 */
export const payouts_admin_getPendingManual = functions.https.onCall(
  async (data, context) => {
    try {
      // Check admin auth
      if (!context.auth) {
        return {
          success: false,
          error: 'Authentication required',
        };
      }

      const adminDoc = await db.collection('users').doc(context.auth.uid).get();
      if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
        return {
          success: false,
          error: 'Admin access required',
        };
      }

      // Query manual payouts
      const snapshot = await db
        .collection('withdrawalRequests')
        .where('provider', '==', 'MANUAL')
        .where('status', '==', 'PROCESSING')
        .orderBy('createdAt', 'asc')
        .limit(100)
        .get();

      const payouts = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const withdrawal = doc.data();

          // Fetch KYC details
          const kycDoc = await db.collection('kycProfiles').doc(withdrawal.userId).get();
          const kycData = kycDoc.exists ? kycDoc.data() : null;

          return {
            ...withdrawal,
            kycDetails: kycData
              ? {
                  fullName: kycData.fullName,
                  iban: kycData.payoutMethod?.iban,
                  country: kycData.country,
                }
              : null,
          };
        })
      );

      return {
        success: true,
        payouts,
      };
    } catch (error) {
      console.error('[Admin] Error fetching manual payouts:', error);
      return {
        success: false,
        error: 'Failed to fetch manual payouts',
      };
    }
  }
);

// Export for testing
export {
  createWisePayout,
  createBankTransferPayout,
  WISE_CONFIG,
  BANK_TRANSFER_CONFIG,
};