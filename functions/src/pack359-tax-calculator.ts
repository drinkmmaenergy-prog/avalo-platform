import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 359 — Legal Compliance: Tax Calculator
 * 
 * Calculates VAT, digital service tax, and other tax components
 * for all platform transactions:
 * - Token purchases
 * - Subscriptions
 * - Calendar bookings
 * - AI chat sessions
 * - Video calls
 * - Creator earnings
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getJurisdictionProfile, getUserJurisdiction } from './pack359-jurisdiction-engine';
import { FieldValue, HttpsError, auth, increment, onCall, serverTimestamp, timestamp, onDocumentCreated } from './runtime';

const db = admin.firestore();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TaxBreakdown {
  netAmount: number;           // Amount before tax
  vatAmount: number;           // VAT/Sales tax amount
  digitalTaxAmount: number;    // Digital services tax amount
  grossAmount: number;         // Total amount including all taxes (what customer pays)
  vatRate: number;             // Applied VAT rate
  digitalTaxRate: number;      // Applied digital tax rate
  countryCode: string;         // Country where tax is applied
  currency: string;            // Currency code
}

export interface CreatorEarningsTax {
  grossEarnings: number;        // Total earned before deductions
  platformFee: number;          // Platform commission
  platformFeeAmount: number;    // Platform fee in currency
  taxableIncome: number;        // Amount subject to tax
  withheldTax: number;          // Tax withheld if applicable
  withholdingRate: number;      // Withholding tax rate
  netPaidOut: number;           // Final amount to earner
  countryCode: string;
  currency: string;
}

export interface TaxTransaction {
  transactionId: string;
  userId: string;
  earnerId?: string;
  type: 'token_purchase' | 'subscription' | 'calendar_booking' | 'ai_chat' | 'video_call' | 'earner_payout';
  taxBreakdown: TaxBreakdown | CreatorEarningsTax;
  timestamp: Date;
  paymentProvider?: string;
  invoiceGenerated: boolean;
  invoiceId?: string;
}

// ============================================================================
// TAX CALCULATION - CONSUMER TRANSACTIONS
// ============================================================================

/**
 * Calculate tax for a consumer purchase (what user pays)
 */
export async function calculateConsumerTax(
  userId: string,
  netAmount: number,
  transactionType: string
): Promise<TaxBreakdown> {
  const { profile } = await getUserJurisdiction(userId);
  
  // Calculate VAT
  const vatAmount = netAmount * profile.vatRate;
  
  // Calculate digital services tax (typically on gross amount in some jurisdictions)
  const digitalTaxAmount = netAmount * profile.digitalServiceTaxRate;
  
  // Calculate gross amount (what customer actually pays)
  const grossAmount = netAmount + vatAmount + digitalTaxAmount;
  
  const taxBreakdown: TaxBreakdown = {
    netAmount,
    vatAmount,
    digitalTaxAmount,
    grossAmount,
    vatRate: profile.vatRate,
    digitalTaxRate: profile.digitalServiceTaxRate,
    countryCode: profile.countryCode,
    currency: profile.currency,
  };
  
  return taxBreakdown;
}

/**
 * Calculate reverse tax (when you have gross amount and need to extract net)
 */
export async function calculateReverseTax(
  userId: string,
  grossAmount: number
): Promise<TaxBreakdown> {
  const { profile } = await getUserJurisdiction(userId);
  
  // Calculate net amount by removing taxes
  const totalTaxRate = profile.vatRate + profile.digitalServiceTaxRate;
  const netAmount = grossAmount / (1 + totalTaxRate);
  
  const vatAmount = netAmount * profile.vatRate;
  const digitalTaxAmount = netAmount * profile.digitalServiceTaxRate;
  
  const taxBreakdown: TaxBreakdown = {
    netAmount,
    vatAmount,
    digitalTaxAmount,
    grossAmount,
    vatRate: profile.vatRate,
    digitalTaxRate: profile.digitalServiceTaxRate,
    countryCode: profile.countryCode,
    currency: profile.currency,
  };
  
  return taxBreakdown;
}

// ============================================================================
// TAX CALCULATION - CREATOR EARNINGS
// ============================================================================

/**
 * Calculate tax for earner earnings (what earner receives)
 */
export async function calculateCreatorEarningsTax(
  earnerId: string,
  grossEarnings: number,
  platformFeeRate: number = MONETIZATION_SPLITS.EVENT_TICKET.platform // Default 20% platform fee
): Promise<CreatorEarningsTax> {
  const { profile } = await getUserJurisdiction(earnerId);
  
  // Calculate platform fee
  const platformFeeAmount = grossEarnings * platformFeeRate;
  
  // Taxable income is earnings after platform fee
  const taxableIncome = grossEarnings - platformFeeAmount;
  
  // Calculate withholding tax if applicable
  const withheldTax = profile.requiresWithholdingTax 
    ? taxableIncome * profile.withholdingTaxRate 
    : 0;
  
  // Net amount paid out to earner
  const netPaidOut = taxableIncome - withheldTax;
  
  const earningsTax: CreatorEarningsTax = {
    grossEarnings,
    platformFee: platformFeeRate,
    platformFeeAmount,
    taxableIncome,
    withheldTax,
    withholdingRate: profile.withholdingTaxRate,
    netPaidOut,
    countryCode: profile.countryCode,
    currency: profile.currency,
  };
  
  return earningsTax;
}

// ============================================================================
// SPECIFIC TRANSACTION TYPES
// ============================================================================

/**
 * Calculate tax for token purchase
 */
export async function calculateTokenPurchaseTax(
  userId: string,
  tokenAmount: number,
  pricePerToken: number
): Promise<{
  taxBreakdown: TaxBreakdown;
  tokensReceived: number;
  totalCost: number;
}> {
  const netAmount = tokenAmount * pricePerToken;
  const taxBreakdown = await calculateConsumerTax(userId, netAmount, 'token_purchase');
  
  return {
    taxBreakdown,
    tokensReceived: tokenAmount,
    totalCost: taxBreakdown.grossAmount,
  };
}

/**
 * Calculate tax for subscription
 */
export async function calculateSubscriptionTax(
  userId: string,
  subscriptionPrice: number,
  billingPeriod: 'monthly' | 'annual'
): Promise<TaxBreakdown> {
  return calculateConsumerTax(userId, subscriptionPrice, 'subscription');
}

/**
 * Calculate tax for calendar booking
 */
export async function calculateCalendarBookingTax(
  userId: string,
  earnerId: string,
  bookingPrice: number
): Promise<{
  consumerTax: TaxBreakdown;
  earnerEarnings: CreatorEarningsTax;
}> {
  // Consumer pays tax on top of booking price
  const consumerTax = await calculateConsumerTax(userId, bookingPrice, 'calendar_booking');
  
  // Creator earnings calculation (from the net amount received by platform)
  const earnerEarnings = await calculateCreatorEarningsTax(earnerId, bookingPrice, MONETIZATION_SPLITS.SUBSCRIPTION.platform); // 30% platform fee for bookings
  
  return {
    consumerTax,
    earnerEarnings,
  };
}

/**
 * Calculate tax for AI chat session
 */
export async function calculateAIChatTax(
  userId: string,
  earnerId: string,
  tokensSpent: number,
  tokenValue: number
): Promise<{
  consumerTax: TaxBreakdown;
  earnerEarnings: CreatorEarningsTax;
}> {
  const chatCost = tokensSpent * tokenValue;
  
  const consumerTax = await calculateConsumerTax(userId, chatCost, 'ai_chat');
  const earnerEarnings = await calculateCreatorEarningsTax(earnerId, chatCost, MONETIZATION_SPLITS.EVENT_TICKET.platform); // 20% platform fee
  
  return {
    consumerTax,
    earnerEarnings,
  };
}

/**
 * Calculate tax for video call
 */
export async function calculateVideoCallTax(
  userId: string,
  earnerId: string,
  callDurationMinutes: number,
  pricePerMinute: number
): Promise<{
  consumerTax: TaxBreakdown;
  earnerEarnings: CreatorEarningsTax;
}> {
  const callCost = callDurationMinutes * pricePerMinute;
  
  const consumerTax = await calculateConsumerTax(userId, callCost, 'video_call');
  const earnerEarnings = await calculateCreatorEarningsTax(earnerId, callCost, MONETIZATION_SPLITS.SUBSCRIPTION.platform); // 30% platform fee
  
  return {
    consumerTax,
    earnerEarnings,
  };
}

// ============================================================================
// TAX TRANSACTION LOGGING
// ============================================================================

/**
 * Log tax transaction to immutable ledger
 */
export async function logTaxTransaction(
  transactionId: string,
  userId: string,
  type: TaxTransaction['type'],
  taxBreakdown: TaxBreakdown | CreatorEarningsTax,
  earnerId?: string,
  paymentProvider?: string
): Promise<void> {
  const taxTransaction: TaxTransaction = {
    transactionId,
    userId,
    earnerId,
    type,
    taxBreakdown,
    timestamp: new Date(),
    paymentProvider,
    invoiceGenerated: false,
  };
  
  // Store in immutable tax ledger
  await db.collection('tax_ledger').doc(transactionId).set({
    ...taxTransaction,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  // Update user's tax summary
  await updateUserTaxSummary(userId, taxBreakdown);
  
  // Update earner's tax summary if applicable
  if (earnerId && type !== 'token_purchase') {
    await updateCreatorTaxSummary(earnerId, taxBreakdown as CreatorEarningsTax);
  }
}

/**
 * Update user's running tax summary
 */
async function updateUserTaxSummary(
  userId: string,
  taxBreakdown: TaxBreakdown | CreatorEarningsTax
): Promise<void> {
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const summaryId = `${userId}_${year}_${month}`;
  
  if ('grossAmount' in taxBreakdown) {
    await db.collection('user_tax_summaries').doc(summaryId).set({
      userId,
      year,
      month,
      totalSpent: admin.firestore.FieldValue.increment(taxBreakdown.grossAmount),
      totalVAT: admin.firestore.FieldValue.increment(taxBreakdown.vatAmount),
      totalDigitalTax: admin.firestore.FieldValue.increment(taxBreakdown.digitalTaxAmount),
      transactionCount: admin.firestore.FieldValue.increment(1),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

/**
 * Update earner's running tax summary
 */
async function updateCreatorTaxSummary(
  earnerId: string,
  earningsTax: CreatorEarningsTax
): Promise<void> {
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const summaryId = `${earnerId}_${year}_${month}`;
  
  await db.collection('earner_tax_summaries').doc(summaryId).set({
    earnerId,
    year,
    month,
    grossEarnings: admin.firestore.FieldValue.increment(earningsTax.grossEarnings),
    platformFees: admin.firestore.FieldValue.increment(earningsTax.platformFeeAmount),
    taxableIncome: admin.firestore.FieldValue.increment(earningsTax.taxableIncome),
    withheldTax: admin.firestore.FieldValue.increment(earningsTax.withheldTax),
    netPaidOut: admin.firestore.FieldValue.increment(earningsTax.netPaidOut),
    transactionCount: admin.firestore.FieldValue.increment(1),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

// ============================================================================
// PAYMENT PROVIDER INTEGRATION
// ============================================================================

/**
 * Handle Apple App Store tax reconciliation
 */
export async function reconcileAppleStorePurchase(
  userId: string,
  receiptData: any
): Promise<TaxBreakdown> {
  // Apple provides gross amount (what user paid)
  // We need to extract net amount and calculate our tax records
  const grossAmount = receiptData.price;
  const taxBreakdown = await calculateReverseTax(userId, grossAmount);
  
  // Log for reconciliation
  await logTaxTransaction(
    receiptData.transactionId,
    userId,
    'token_purchase',
    taxBreakdown,
    undefined,
    'apple'
  );
  
  return taxBreakdown;
}

/**
 * Handle Google Play Store tax reconciliation
 */
export async function reconcileGooglePlayPurchase(
  userId: string,
  purchaseData: any
): Promise<TaxBreakdown> {
  const grossAmount = purchaseData.price;
  const taxBreakdown = await calculateReverseTax(userId, grossAmount);
  
  await logTaxTransaction(
    purchaseData.orderId,
    userId,
    'token_purchase',
    taxBreakdown,
    undefined,
    'google'
  );
  
  return taxBreakdown;
}

/**
 * Handle Stripe payment with tax
 */
export async function processStripePaymentWithTax(
  userId: string,
  netAmount: number,
  transactionType: string
): Promise<{
  taxBreakdown: TaxBreakdown;
  stripeAmount: number; // Amount to charge in Stripe (in cents)
}> {
  const taxBreakdown = await calculateConsumerTax(userId, netAmount, transactionType);
  
  // Stripe expects amount in cents
  const stripeAmount = Math.round(taxBreakdown.grossAmount * 100);
  
  return {
    taxBreakdown,
    stripeAmount,
  };
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

/**
 * HTTP endpoint to calculate tax for a purchase
 */
export const calculateTax = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { amount, type } = data;
  const userId = request.auth.uid;
  
  if (!amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid amount');
  }
  
  const taxBreakdown = await calculateConsumerTax(userId, amount, type || 'token_purchase');
  
  return taxBreakdown;
});

/**
 * HTTP endpoint to calculate earner earnings
 */
export const calculateCreatorEarnings = functions.https.onCall(async (request) => {
  const data = request.data;
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { amount, platformFee } = data;
  const earnerId = request.auth.uid;
  
  if (!amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid amount');
  }
  
  const earningsTax = await calculateCreatorEarningsTax(
    earnerId,
    amount,
    platformFee || MONETIZATION_SPLITS.EVENT_TICKET.platform
  );
  
  return earningsTax;
});

/**
 * Automatically calculate and log tax on wallet transactions
 */
export const onWalletTransaction = onDocumentCreated('wallet_transactions/{transactionId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const transactionId = event.params.transactionId;
    const transaction = snap.data();
    
    if (transaction.type === 'token_purchase') {
      const taxBreakdown = await calculateConsumerTax(
        transaction.userId,
        transaction.amount,
        'token_purchase'
      );
      
      await logTaxTransaction(
        transactionId,
        transaction.userId,
        'token_purchase',
        taxBreakdown,
        undefined,
        transaction.paymentProvider
      );
    }
  });

/**
 * Calculate and log tax on calendar bookings
 */
export const onCalendarBooking = onDocumentCreated('calendar_bookings/{bookingId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
    const bookingId = event.params.bookingId;
    const booking = snap.data();
    
    const { consumerTax, earnerEarnings } = await calculateCalendarBookingTax(
      booking.userId,
      booking.earnerId,
      booking.price
    );
    
    // Log both consumer and earner tax
    await logTaxTransaction(
      bookingId,
      booking.userId,
      'calendar_booking',
      consumerTax,
      booking.earnerId,
      'stripe'
    );
    
    await logTaxTransaction(
      `${bookingId}_earner`,
      booking.earnerId,
      'earner_payout',
      earnerEarnings,
      booking.earnerId
    );
  });


























