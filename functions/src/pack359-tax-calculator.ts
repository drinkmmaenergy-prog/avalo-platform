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
  netPaidOut: number;           // Final amount to creator
  countryCode: string;
  currency: string;
}

export interface TaxTransaction {
  transactionId: string;
  userId: string;
  creatorId?: string;
  type: 'token_purchase' | 'subscription' | 'calendar_booking' | 'ai_chat' | 'video_call' | 'creator_payout';
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
 * Calculate tax for creator earnings (what creator receives)
 */
export async function calculateCreatorEarningsTax(
  creatorId: string,
  grossEarnings: number,
  platformFeeRate: number = 0.20 // Default 20% platform fee
): Promise<CreatorEarningsTax> {
  const { profile } = await getUserJurisdiction(creatorId);
  
  // Calculate platform fee
  const platformFeeAmount = grossEarnings * platformFeeRate;
  
  // Taxable income is earnings after platform fee
  const taxableIncome = grossEarnings - platformFeeAmount;
  
  // Calculate withholding tax if applicable
  const withheldTax = profile.requiresWithholdingTax 
    ? taxableIncome * profile.withholdingTaxRate 
    : 0;
  
  // Net amount paid out to creator
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
  creatorId: string,
  bookingPrice: number
): Promise<{
  consumerTax: TaxBreakdown;
  creatorEarnings: CreatorEarningsTax;
}> {
  // Consumer pays tax on top of booking price
  const consumerTax = await calculateConsumerTax(userId, bookingPrice, 'calendar_booking');
  
  // Creator earnings calculation (from the net amount received by platform)
  const creatorEarnings = await calculateCreatorEarningsTax(creatorId, bookingPrice, 0.30); // 30% platform fee for bookings
  
  return {
    consumerTax,
    creatorEarnings,
  };
}

/**
 * Calculate tax for AI chat session
 */
export async function calculateAIChatTax(
  userId: string,
  creatorId: string,
  tokensSpent: number,
  tokenValue: number
): Promise<{
  consumerTax: TaxBreakdown;
  creatorEarnings: CreatorEarningsTax;
}> {
  const chatCost = tokensSpent * tokenValue;
  
  const consumerTax = await calculateConsumerTax(userId, chatCost, 'ai_chat');
  const creatorEarnings = await calculateCreatorEarningsTax(creatorId, chatCost, 0.20); // 20% platform fee
  
  return {
    consumerTax,
    creatorEarnings,
  };
}

/**
 * Calculate tax for video call
 */
export async function calculateVideoCallTax(
  userId: string,
  creatorId: string,
  callDurationMinutes: number,
  pricePerMinute: number
): Promise<{
  consumerTax: TaxBreakdown;
  creatorEarnings: CreatorEarningsTax;
}> {
  const callCost = callDurationMinutes * pricePerMinute;
  
  const consumerTax = await calculateConsumerTax(userId, callCost, 'video_call');
  const creatorEarnings = await calculateCreatorEarningsTax(creatorId, callCost, 0.30); // 30% platform fee
  
  return {
    consumerTax,
    creatorEarnings,
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
  creatorId?: string,
  paymentProvider?: string
): Promise<void> {
  const taxTransaction: TaxTransaction = {
    transactionId,
    userId,
    creatorId,
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
  
  // Update creator's tax summary if applicable
  if (creatorId && type !== 'token_purchase') {
    await updateCreatorTaxSummary(creatorId, taxBreakdown as CreatorEarningsTax);
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
 * Update creator's running tax summary
 */
async function updateCreatorTaxSummary(
  creatorId: string,
  earningsTax: CreatorEarningsTax
): Promise<void> {
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const summaryId = `${creatorId}_${year}_${month}`;
  
  await db.collection('creator_tax_summaries').doc(summaryId).set({
    creatorId,
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
export const calculateTax = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { amount, type } = data;
  const userId = context.auth.uid;
  
  if (!amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid amount');
  }
  
  const taxBreakdown = await calculateConsumerTax(userId, amount, type || 'token_purchase');
  
  return taxBreakdown;
});

/**
 * HTTP endpoint to calculate creator earnings
 */
export const calculateCreatorEarnings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { amount, platformFee } = data;
  const creatorId = context.auth.uid;
  
  if (!amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid amount');
  }
  
  const earningsTax = await calculateCreatorEarningsTax(
    creatorId,
    amount,
    platformFee || 0.20
  );
  
  return earningsTax;
});

/**
 * Automatically calculate and log tax on wallet transactions
 */
export const onWalletTransaction = functions.firestore
  .document('wallet_transactions/{transactionId}')
  .onCreate(async (snap, context) => {
    const transactionId = context.params.transactionId;
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
export const onCalendarBooking = functions.firestore
  .document('calendar_bookings/{bookingId}')
  .onCreate(async (snap, context) => {
    const bookingId = context.params.bookingId;
    const booking = snap.data();
    
    const { consumerTax, creatorEarnings } = await calculateCalendarBookingTax(
      booking.userId,
      booking.creatorId,
      booking.price
    );
    
    // Log both consumer and creator tax
    await logTaxTransaction(
      bookingId,
      booking.userId,
      'calendar_booking',
      consumerTax,
      booking.creatorId,
      'stripe'
    );
    
    await logTaxTransaction(
      `${bookingId}_creator`,
      booking.creatorId,
      'creator_payout',
      creatorEarnings,
      booking.creatorId
    );
  });
