import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

const db = admin.firestore();

// Payout provider configurations (stored in Firebase Config)
interface PayoutConfig {
  wise: {
    apiKey: string;
    profileId: string;
  };
  paypal: {
    clientId: string;
    clientSecret: string;
    mode: 'sandbox' | 'live';
  };
}

// Payout status types
type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface PayoutRequest {
  id: string;
  creatorId: string;
  amount: number;
  currency: string;
  tokens: number;
  method: 'wise' | 'paypal' | 'sepa' | 'swift';
  methodDetails: any;
  status: PayoutStatus;
  createdAt: admin.firestore.Timestamp;
  processedAt?: admin.firestore.Timestamp;
  transactionId?: string;
  errorMessage?: string;
}

// Process pending payouts (scheduled function - runs every hour)
export const processPendingPayouts = functions.pubsub
  .schedule('0 * * * *')
  .onRun(async (context) => {
    const pendingPayouts = await db.collection('payoutRequests')
      .where('status', '==', 'pending')
      .limit(100)
      .get();

    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const doc of pendingPayouts.docs) {
      const payout = { id: doc.id, ...doc.data() } as PayoutRequest;
      
      try {
        await processPayoutRequest(payout);
        results.processed++;
      } catch (error) {
        console.error(`Failed to process payout ${payout.id}:`, error);
        results.failed++;
        results.errors.push(`${payout.id}: ${error}`);
        
        // Update payout status to failed
        await doc.ref.update({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          processedAt: admin.firestore.Timestamp.now(),
        });

        // Refund tokens to creator
        await refundFailedPayout(payout);
      }
    }

    console.log('Payout processing results:', results);
    return results;
  });

// Process a single payout request
async function processPayoutRequest(payout: PayoutRequest): Promise<void> {
  // Update status to processing
  await db.collection('payoutRequests').doc(payout.id).update({
    status: 'processing',
  });

  let transactionId: string;

  // Process based on method
  switch (payout.method) {
    case 'wise':
      transactionId = await processWisePayout(payout);
      break;
    case 'paypal':
      transactionId = await processPayPalPayout(payout);
      break;
    case 'sepa':
      transactionId = await processSEPAPayout(payout);
      break;
    case 'swift':
      transactionId = await processSWIFTPayout(payout);
      break;
    default:
      throw new Error(`Unsupported payout method: ${payout.method}`);
  }

  // Update payout status to completed
  await db.collection('payoutRequests').doc(payout.id).update({
    status: 'completed',
    transactionId,
    processedAt: admin.firestore.Timestamp.now(),
  });

  // Update creator's pending payout
  await db.collection('creators').doc(payout.creatorId)
    .collection('earningSummary').doc('current').update({
      pendingPayout: admin.firestore.FieldValue.increment(-payout.amount),
    });

  // Send success notification
  await sendPayoutNotification(payout.creatorId, 'completed', payout.amount, payout.currency);
}

// Wise payout processing
async function processWisePayout(payout: PayoutRequest): Promise<string> {
  const config = functions.config().payout as PayoutConfig;
  
  if (!config?.wise?.apiKey) {
    throw new Error('Wise API key not configured');
  }

  try {
    // Create Wise quote
    const quoteResponse = await axios.post(
      'https://api.transferwise.com/v1/quotes',
      {
        profile: config.wise.profileId,
        source: 'USD',
        target: payout.currency,
        rateType: 'FIXED',
        targetAmount: payout.amount,
        type: 'BALANCE_PAYOUT',
      },
      {
        headers: {
          'Authorization': `Bearer ${config.wise.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const quoteId = quoteResponse.data.id;

    // Create recipient
    const recipientResponse = await axios.post(
      'https://api.transferwise.com/v1/accounts',
      {
        profile: config.wise.profileId,
        accountHolderName: payout.methodDetails.accountHolderName,
        currency: payout.currency,
        type: payout.methodDetails.accountType || 'email',
        details: payout.methodDetails.accountDetails,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.wise.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const recipientId = recipientResponse.data.id;

    // Create transfer
    const transferResponse = await axios.post(
      'https://api.transferwise.com/v1/transfers',
      {
        targetAccount: recipientId,
        quote: quoteId,
        customerTransactionId: payout.id,
        details: {
          reference: `Avalo Creator Payout - ${payout.id}`,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${config.wise.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const transferId = transferResponse.data.id;

    // Fund transfer
    await axios.post(
      `https://api.transferwise.com/v3/profiles/${config.wise.profileId}/transfers/${transferId}/payments`,
      {
        type: 'BALANCE',
      },
      {
        headers: {
          'Authorization': `Bearer ${config.wise.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return transferId.toString();
  } catch (error) {
    console.error('Wise payout error:', error);
    throw new Error(`Wise payout failed: ${error}`);
  }
}

// PayPal payout processing
async function processPayPalPayout(payout: PayoutRequest): Promise<string> {
  const config = functions.config().payout as PayoutConfig;
  
  if (!config?.paypal?.clientId || !config?.paypal?.clientSecret) {
    throw new Error('PayPal credentials not configured');
  }

  try {
    // Get PayPal access token
    const authResponse = await axios.post(
      `https://api-m.${config.paypal.mode}.paypal.com/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        auth: {
          username: config.paypal.clientId,
          password: config.paypal.clientSecret,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const accessToken = authResponse.data.access_token;

    // Create payout
    const payoutResponse = await axios.post(
      `https://api-m.${config.paypal.mode}.paypal.com/v1/payments/payouts`,
      {
        sender_batch_header: {
          sender_batch_id: payout.id,
          email_subject: 'You have received a payment from Avalo',
          email_message: 'Your creator earnings have been transferred.',
        },
        items: [
          {
            recipient_type: 'EMAIL',
            amount: {
              value: payout.amount.toFixed(2),
              currency: payout.currency,
            },
            receiver: payout.methodDetails.email,
            note: `Avalo Creator Payout - ${payout.id}`,
            sender_item_id: payout.id,
          },
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return payoutResponse.data.batch_header.payout_batch_id;
  } catch (error) {
    console.error('PayPal payout error:', error);
    throw new Error(`PayPal payout failed: ${error}`);
  }
}

// SEPA payout processing (requires integration with banking partner)
async function processSEPAPayout(payout: PayoutRequest): Promise<string> {
  // Note: SEPA transfers require a banking partner integration
  // This is a placeholder implementation
  
  console.log('Processing SEPA payout:', payout);

  // In production, this would integrate with:
  // - Stripe Connect
  // - Adyen for Platforms
  // - Modulr
  // - Or another banking partner

  // Simulate SEPA processing
  // Real implementation would create SEPA credit transfer
  const transactionId = `SEPA-${Date.now()}-${payout.id.slice(0, 8)}`;

  // Log for manual processing
  await db.collection('manualPayouts').add({
    payoutId: payout.id,
    method: 'sepa',
    iban: payout.methodDetails.iban,
    bic: payout.methodDetails.bic,
    accountHolder: payout.methodDetails.accountHolder,
    amount: payout.amount,
    currency: payout.currency,
    status: 'requires_manual_processing',
    createdAt: admin.firestore.Timestamp.now(),
  });

  return transactionId;
}

// SWIFT payout processing (requires integration with banking partner)
async function processSWIFTPayout(payout: PayoutRequest): Promise<string> {
  // Note: SWIFT transfers require a banking partner integration
  // This is a placeholder implementation
  
  console.log('Processing SWIFT payout:', payout);

  // In production, this would integrate with banking partner
  // Simulate SWIFT processing
  const transactionId = `SWIFT-${Date.now()}-${payout.id.slice(0, 8)}`;

  // Log for manual processing
  await db.collection('manualPayouts').add({
    payoutId: payout.id,
    method: 'swift',
    accountNumber: payout.methodDetails.accountNumber,
    swiftCode: payout.methodDetails.swiftCode,
    bankName: payout.methodDetails.bankName,
    accountHolder: payout.methodDetails.accountHolder,
    amount: payout.amount,
    currency: payout.currency,
    status: 'requires_manual_processing',
    createdAt: admin.firestore.Timestamp.now(),
  });

  return transactionId;
}

// Refund failed payout
async function refundFailedPayout(payout: PayoutRequest): Promise<void> {
  // Return tokens to available balance
  await db.collection('creators').doc(payout.creatorId)
    .collection('earningSummary').doc('current').update({
      availableTokens: admin.firestore.FieldValue.increment(payout.tokens),
      pendingPayout: admin.firestore.FieldValue.increment(-payout.amount),
    });

  // Send notification
  await sendPayoutNotification(payout.creatorId, 'failed', payout.amount, payout.currency);
}

// Send payout notification
async function sendPayoutNotification(
  creatorId: string,
  status: 'completed' | 'failed',
  amount: number,
  currency: string
): Promise<void> {
  const userDoc = await db.collection('users').doc(creatorId).get();
  const fcmToken = userDoc.data()?.fcmToken;

  if (!fcmToken) return;

  let title = '';
  let body = '';

  if (status === 'completed') {
    title = 'Payout Completed ✅';
    body = `Your ${amount} ${currency} payout has been sent. It should arrive in 1-5 business days.`;
  } else {
    title = 'Payout Failed ❌';
    body = `Your ${amount} ${currency} payout failed. Tokens have been returned to your account.`;
  }

  await admin.messaging().send({
    token: fcmToken,
    notification: {
      title,
      body,
    },
    data: {
      type: `payout_${status}`,
      amount: amount.toString(),
      currency,
    },
  });
}

// Verify payout method (callable function)
export const verifyPayoutMethod = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { method, methodDetails } = data;

  if (!method || !methodDetails) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  try {
    let verified = false;
    let errorMessage = '';

    switch (method) {
      case 'wise':
        verified = await verifyWiseAccount(methodDetails);
        break;
      case 'paypal':
        verified = await verifyPayPalAccount(methodDetails);
        break;
      case 'sepa':
        verified = await verifySEPAAccount(methodDetails);
        break;
      case 'swift':
        verified = await verifySWIFTAccount(methodDetails);
        break;
      default:
        throw new functions.https.HttpsError('invalid-argument', 'Invalid payout method');
    }

    if (verified) {
      // Save verified payout method
      await db.collection('creators').doc(context.auth.uid)
        .collection('payoutMethods').add({
          type: method,
          details: methodDetails,
          verified: true,
          verifiedAt: admin.firestore.Timestamp.now(),
        });
    }

    return { verified, errorMessage };
  } catch (error) {
    console.error('Error verifying payout method:', error);
    throw new functions.https.HttpsError('internal', 'Failed to verify payout method');
  }
});

// Verify Wise account
async function verifyWiseAccount(details: any): Promise<boolean> {
  // Basic validation
  return !!(details.accountHolderName && details.accountDetails);
}

// Verify PayPal account
async function verifyPayPalAccount(details: any): Promise<boolean> {
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(details.email);
}

// Verify SEPA account
async function verifySEPAAccount(details: any): Promise<boolean> {
  // IBAN validation (basic)
  const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/;
  return !!(details.iban && details.accountHolder && ibanRegex.test(details.iban.replace(/\s/g, '')));
}

// Verify SWIFT account
async function verifySWIFTAccount(details: any): Promise<boolean> {
  // SWIFT code validation (basic)
  const swiftRegex = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
  return !!(
    details.accountNumber &&
    details.swiftCode &&
    details.bankName &&
    details.accountHolder &&
    swiftRegex.test(details.swiftCode)
  );
}

// Cancel payout (callable function)
export const cancelPayout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { payoutId } = data;

  if (!payoutId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing payout ID');
  }

  try {
    const payoutDoc = await db.collection('payoutRequests').doc(payoutId).get();
    
    if (!payoutDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Payout not found');
    }

    const payout = payoutDoc.data() as PayoutRequest;

    if (payout.creatorId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized');
    }

    if (payout.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'Can only cancel pending payouts');
    }

    // Update payout status
    await payoutDoc.ref.update({
      status: 'cancelled',
      processedAt: admin.firestore.Timestamp.now(),
    });

    // Refund tokens
    await refundFailedPayout(payout);

    return { success: true };
  } catch (error) {
    console.error('Error canceling payout:', error);
    throw error;
  }
});