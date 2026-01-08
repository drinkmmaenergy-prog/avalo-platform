/**
 * PACK 107 — VIP Memberships, Royal Club & Prestige Identity
 * Backend Implementation
 * 
 * Core functionality:
 * - Membership subscription management
 * - Stripe integration for recurring billing
 * - Membership expiration handling
 * - Business audit logging
 * 
 * NON-NEGOTIABLE RULES:
 * - NO free tokens or bonus tokens
 * - NO cashback or discounts on token purchases
 * - NO influence on discovery algorithm or monetization logic
 * - NO faster earnings or pay-to-get-more-visibility
 * - Token price and 65/35 split remain untouched
 * - Purely cosmetic and experiential, ZERO economic advantages
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, serverTimestamp } from './init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import Stripe from 'stripe';
import {
  MembershipTier,
  MembershipBillingCycle,
  MembershipStatus,
  UserMembership,
  MembershipPurchaseRequest,
  MembershipSubscriptionSession,
  MembershipCancellationRequest,
  MembershipCancellation,
  MembershipAuditEventType,
  MembershipAuditLog,
  MEMBERSHIP_PRICING,
  Pack107ErrorCode,
} from './pack107-types';
import { CurrencyProfile } from './pack106-types';
import { getFeatureFlag, FeatureFlags } from './featureFlags';

// ============================================================================
// CONFIGURATION
// ============================================================================

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

const MEMBERSHIP_CONFIG = {
  GRACE_PERIOD_DAYS: 7, // Days after payment failure before cancellation
  SESSION_EXPIRY_MINUTES: 30, // Stripe checkout session expiry
  REFUND_WINDOW_DAYS: 0, // No refunds on subscriptions
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get membership status for a user
 */
export async function getMembershipStatus(
  userId: string
): Promise<UserMembership | null> {
  try {
    const membershipDoc = await db
      .collection('user_membership')
      .doc(userId)
      .get();

    if (!membershipDoc.exists) {
      return null;
    }

    return membershipDoc.data() as UserMembership;
  } catch (error: any) {
    logger.error(`Error getting membership status for ${userId}`, error);
    throw error;
  }
}

/**
 * Calculate localized price for membership
 */
async function calculateLocalizedPrice(
  tier: Exclude<MembershipTier, 'NONE'>,
  billingCycle: MembershipBillingCycle,
  currencyCode: string
): Promise<{ amount: number; currency: string; fxRate: number }> {
  // Get base price in EUR
  const basePricing = MEMBERSHIP_PRICING[tier];
  const basePriceEUR =
    billingCycle === 'MONTHLY'
      ? basePricing.monthlyPriceEUR
      : basePricing.annualPriceEUR;

  // If currency is EUR, return as-is
  if (currencyCode === 'EUR') {
    return {
      amount: basePriceEUR,
      currency: 'EUR',
      fxRate: 1.0,
    };
  }

  // Get currency profile for conversion
  const currencyDoc = await db
    .collection('currency_profiles')
    .doc(currencyCode)
    .get();

  if (!currencyDoc.exists) {
    // Fallback to EUR if currency not supported
    logger.warn(`Currency ${currencyCode} not found, falling back to EUR`);
    return {
      amount: basePriceEUR,
      currency: 'EUR',
      fxRate: 1.0,
    };
  }

  const currencyProfile = currencyDoc.data() as CurrencyProfile;

  // Convert using FX rate
  const convertedAmount = basePriceEUR * currencyProfile.fxRate;

  // Round to appropriate decimal places
  const roundedAmount =
    Math.round(convertedAmount * Math.pow(10, currencyProfile.decimalPlaces)) /
    Math.pow(10, currencyProfile.decimalPlaces);

  return {
    amount: roundedAmount,
    currency: currencyCode,
    fxRate: currencyProfile.fxRate,
  };
}

/**
 * Create audit log entry for membership event
 */
async function logMembershipAudit(
  eventType: MembershipAuditEventType,
  userId: string,
  tier: MembershipTier,
  context: Record<string, any>,
  source: 'USER_ACTION' | 'STRIPE_WEBHOOK' | 'SCHEDULED_JOB' | 'ADMIN_ACTION' = 'USER_ACTION'
): Promise<void> {
  try {
    const auditEntry: Omit<MembershipAuditLog, 'id'> = {
      eventType,
      userId,
      tier,
      createdAt: Timestamp.now(),
      context,
      source,
      billingCycle: context.billingCycle,
      amount: context.amount,
      currency: context.currency,
      stripeSubscriptionId: context.stripeSubscriptionId,
    };

    // Store in business_audit_log (PACK 105 integration)
    await db.collection('business_audit_log').add({
      eventType,
      userId,
      relatedId: context.stripeSubscriptionId || userId,
      context: auditEntry,
      createdAt: serverTimestamp(),
      source: 'MEMBERSHIP_ENGINE',
    });

    logger.info(`Membership audit logged: ${eventType}`, { userId, tier });
  } catch (error: any) {
    logger.error('Error logging membership audit', error);
    // Don't throw - audit logging failure shouldn't break operations
  }
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Subscribe to membership tier
 * Creates Stripe Checkout session for subscription
 */
export const subscribeToMembership = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ sessionUrl: string; sessionId: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const data = request.data as MembershipPurchaseRequest;

    // Validate input
    if (!data.tier || !data.billingCycle) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    if (data.tier !== 'VIP' && data.tier !== 'ROYAL_CLUB') {
      throw new HttpsError('invalid-argument', 'Invalid membership tier');
    }

    try {
      // Check feature flag
      const featureFlagKey =
        data.tier === 'VIP'
          ? 'vip_membership_enabled'
          : 'royal_club_membership_enabled';

      const isEnabled = await getFeatureFlag(userId, featureFlagKey, false);
      if (!isEnabled) {
        throw new HttpsError(
          'failed-precondition',
          'This membership tier is not available yet'
        );
      }

      // Check if user already has active membership
      const existingMembership = await getMembershipStatus(userId);
      if (
        existingMembership &&
        existingMembership.status === 'ACTIVE' &&
        existingMembership.tier === data.tier
      ) {
        throw new HttpsError(
          'already-exists',
          'You already have an active membership of this tier'
        );
      }

      // Calculate localized price
      const pricing = await calculateLocalizedPrice(
        data.tier,
        data.billingCycle,
        data.currency
      );

      // Get or create Stripe customer
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      let stripeCustomerId = existingMembership?.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: userData?.email,
          metadata: {
            userId,
            avaloMembership: 'true',
          },
        });
        stripeCustomerId = customer.id;
      }

      // Get Stripe Price ID or create inline price
      const stripePriceId = await getOrCreateStripePrice(
        data.tier,
        data.billingCycle,
        pricing.amount,
        pricing.currency
      );

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: stripePriceId,
            quantity: 1,
          },
        ],
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
        subscription_data: {
          metadata: {
            userId,
            membershipTier: data.tier,
            billingCycle: data.billingCycle,
          },
        },
        metadata: {
          userId,
          membershipTier: data.tier,
          billingCycle: data.billingCycle,
        },
        expires_at: Math.floor(
          Date.now() / 1000 + MEMBERSHIP_CONFIG.SESSION_EXPIRY_MINUTES * 60
        ),
      });

      // Store session info
      const sessionData: Omit<MembershipSubscriptionSession, 'sessionId'> = {
        stripeSessionId: session.id,
        userId,
        tier: data.tier,
        billingCycle: data.billingCycle,
        amount: pricing.amount,
        currency: pricing.currency,
        status: 'PENDING',
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(session.expires_at * 1000),
      };

      const sessionRef = await db
        .collection('membership_sessions')
        .add(sessionData);

      // Log audit event
      await logMembershipAudit('MEMBERSHIP_PURCHASE', userId, data.tier, {
        billingCycle: data.billingCycle,
        amount: pricing.amount,
        currency: pricing.currency,
        sessionId: session.id,
      });

      logger.info(`Created membership subscription session for ${userId}`, {
        tier: data.tier,
        billingCycle: data.billingCycle,
        sessionId: session.id,
      });

      return {
        sessionUrl: session.url!,
        sessionId: sessionRef.id,
      };
    } catch (error: any) {
      logger.error('Error creating membership subscription', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        `Failed to create subscription: ${error.message}`
      );
    }
  }
);

/**
 * Get or create Stripe Price for membership tier
 */
async function getOrCreateStripePrice(
  tier: Exclude<MembershipTier, 'NONE'>,
  billingCycle: MembershipBillingCycle,
  amount: number,
  currency: string
): Promise<string> {
  // Check if we have a stored price ID for this configuration
  const priceConfigDoc = await db
    .collection('membership_stripe_prices')
    .doc(`${tier}_${billingCycle}_${currency}`)
    .get();

  if (priceConfigDoc.exists) {
    const priceId = priceConfigDoc.data()?.stripePriceId;
    if (priceId) {
      return priceId;
    }
  }

  // Create new Stripe Price
  const price = await stripe.prices.create({
    unit_amount: Math.round(amount * 100), // Convert to cents
    currency: currency.toLowerCase(),
    recurring: {
      interval: billingCycle === 'MONTHLY' ? 'month' : 'year',
    },
    product_data: {
      name: `Avalo ${tier === 'VIP' ? 'VIP' : 'Royal Club'} Membership`,
      metadata: {
        membershipTier: tier,
        billingCycle,
      },
    },
    metadata: {
      membershipTier: tier,
      billingCycle,
    },
  });

  // Store price ID for future use
  await db
    .collection('membership_stripe_prices')
    .doc(`${tier}_${billingCycle}_${currency}`)
    .set({
      stripePriceId: price.id,
      tier,
      billingCycle,
      amount,
      currency,
      createdAt: serverTimestamp(),
    });

  return price.id;
}

/**
 * Apply membership after successful payment
 * Called by Stripe webhook
 */
async function applyMembership(
  userId: string,
  tier: Exclude<MembershipTier, 'NONE'>,
  billingCycle: MembershipBillingCycle,
  stripeSubscriptionId: string,
  stripeCustomerId: string,
  amount: number,
  currency: string
): Promise<void> {
  const now = Timestamp.now();
  const expiresAt =
    billingCycle === 'MONTHLY'
      ? Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000)
      : Timestamp.fromMillis(now.toMillis() + 365 * 24 * 60 * 60 * 1000);

  const nextBillingDate = expiresAt;

  // Update or create membership record
  const membershipRef = db.collection('user_membership').doc(userId);
  const existingDoc = await membershipRef.get();

  const membershipData: Partial<UserMembership> = {
    userId,
    tier,
    status: 'ACTIVE',
    billingCycle,
    stripeSubscriptionId,
    stripeCustomerId,
    currency,
    monthlyPrice: amount,
    purchasedAt: now,
    expiresAt,
    nextBillingDate,
    lastPaymentAt: now,
    autoRenew: true,
    updatedAt: now,
    lifetimeValue: existingDoc.exists
      ? (existingDoc.data()?.lifetimeValue || 0) + amount
      : amount,
    totalActiveDays: existingDoc.exists
      ? (existingDoc.data()?.totalActiveDays || 0)
      : 0,
  };

  if (!existingDoc.exists) {
    membershipData.createdAt = now;
  }

  await membershipRef.set(membershipData, { merge: true });

  // Log audit event
  await logMembershipAudit(
    'MEMBERSHIP_PURCHASE',
    userId,
    tier,
    {
      billingCycle,
      amount,
      currency,
      stripeSubscriptionId,
      expiresAt: expiresAt.toDate().toISOString(),
    },
    'STRIPE_WEBHOOK'
  );

  logger.info(`Applied membership for ${userId}`, {
    tier,
    billingCycle,
    expiresAt: expiresAt.toDate(),
  });
}

/**
 * Renew membership after recurring payment
 */
async function renewMembership(
  userId: string,
  stripeSubscriptionId: string,
  amount: number,
  currency: string
): Promise<void> {
  const membershipRef = db.collection('user_membership').doc(userId);
  const membershipDoc = await membershipRef.get();

  if (!membershipDoc.exists) {
    logger.error(`Membership not found for renewal: ${userId}`);
    return;
  }

  const membership = membershipDoc.data() as UserMembership;
  const now = Timestamp.now();

  // Calculate new expiry
  const expiresAt =
    membership.billingCycle === 'MONTHLY'
      ? Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000)
      : Timestamp.fromMillis(now.toMillis() + 365 * 24 * 60 * 60 * 1000);

  const nextBillingDate = expiresAt;

  // Update membership
  await membershipRef.update({
    status: 'ACTIVE',
    expiresAt,
    nextBillingDate,
    lastPaymentAt: now,
    updatedAt: now,
    lifetimeValue: FieldValue.increment(amount),
    gracePeriodExpiresAt: FieldValue.delete(), // Clear any grace period
  });

  // Log audit event
  await logMembershipAudit(
    'MEMBERSHIP_RENEWAL',
    userId,
    membership.tier,
    {
      billingCycle: membership.billingCycle,
      amount,
      currency,
      stripeSubscriptionId,
      expiresAt: expiresAt.toDate().toISOString(),
    },
    'STRIPE_WEBHOOK'
  );

  logger.info(`Renewed membership for ${userId}`, {
    tier: membership.tier,
    expiresAt: expiresAt.toDate(),
  });
}

// ============================================================================
// CANCELLATION
// ============================================================================

/**
 * Cancel membership auto-renewal
 */
export const cancelMembershipAutoRenew = onCall(
  { region: 'europe-west3' },
  async (request): Promise<{ success: boolean; effectiveDate: string }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const data = request.data as MembershipCancellationRequest;

    try {
      // Get current membership
      const membership = await getMembershipStatus(userId);

      if (!membership) {
        throw new HttpsError('not-found', 'No active membership found');
      }

      if (membership.status !== 'ACTIVE') {
        throw new HttpsError(
          'failed-precondition',
          'Membership is not active'
        );
      }

      // Cancel Stripe subscription
      if (membership.stripeSubscriptionId) {
        await stripe.subscriptions.update(membership.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      }

      const now = Timestamp.now();
      const effectiveExpiryDate = membership.expiresAt || now;

      // Update membership record
      await db
        .collection('user_membership')
        .doc(userId)
        .update({
          autoRenew: false,
          status: 'CANCELLED',
          cancellation: {
            cancelledAt: now,
            reason: data.reason,
            willExpireAt: effectiveExpiryDate,
          },
          updatedAt: now,
        });

      // Store cancellation record
      const cancellationData: Omit<MembershipCancellation, 'id'> = {
        userId,
        tier: membership.tier,
        cancelledAt: now,
        reason: data.reason,
        feedback: data.feedback,
        immediate: data.immediate,
        effectiveExpiryDate,
        refundStatus: 'NONE', // No refunds on memberships
      };

      await db.collection('membership_cancellations').add(cancellationData);

      // Log audit event
      await logMembershipAudit(
        'MEMBERSHIP_CANCELLATION',
        userId,
        membership.tier,
        {
          reason: data.reason,
          feedback: data.feedback,
          effectiveExpiryDate: effectiveExpiryDate.toDate().toISOString(),
          stripeSubscriptionId: membership.stripeSubscriptionId,
        }
      );

      logger.info(`Cancelled membership auto-renewal for ${userId}`, {
        tier: membership.tier,
        effectiveDate: effectiveExpiryDate.toDate(),
      });

      return {
        success: true,
        effectiveDate: effectiveExpiryDate.toDate().toISOString(),
      };
    } catch (error: any) {
      logger.error('Error cancelling membership', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        `Failed to cancel membership: ${error.message}`
      );
    }
  }
);

// ============================================================================
// GET MEMBERSHIP STATUS
// ============================================================================

/**
 * Get user's current membership status
 */
export const getUserMembershipStatus = onCall(
  { region: 'europe-west3' },
  async (request): Promise<UserMembership | null> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.data.userId || request.auth.uid;

    // Users can only view their own membership
    if (userId !== request.auth.uid) {
      throw new HttpsError(
        'permission-denied',
        'Cannot access another user\'s membership'
      );
    }

    try {
      return await getMembershipStatus(userId);
    } catch (error: any) {
      logger.error('Error getting membership status', error);
      throw new HttpsError('internal', `Failed to get membership status`);
    }
  }
);

// ============================================================================
// SCHEDULED JOB: EXPIRE MEMBERSHIPS
// ============================================================================

/**
 * Check and expire memberships that have passed their expiry date
 * Runs daily at 02:00 UTC
 */
export const expireMembershipIfNeeded = onSchedule(
  {
    schedule: '0 2 * * *', // Daily at 2 AM UTC
    timeZone: 'UTC',
    memory: '512MiB' as const,
    timeoutSeconds: 300,
  },
  async (event) => {
    try {
      logger.info('Starting membership expiration check');

      const now = Timestamp.now();

      // Find all active or cancelled memberships that have expired
      const expiredQuery = await db
        .collection('user_membership')
        .where('expiresAt', '<=', now)
        .where('status', 'in', ['ACTIVE', 'CANCELLED'])
        .get();

      let expiredCount = 0;
      const batch = db.batch();

      for (const doc of expiredQuery.docs) {
        const membership = doc.data() as UserMembership;
        const membershipRef = db.collection('user_membership').doc(doc.id);

        // Update to expired
        batch.update(membershipRef, {
          tier: 'NONE',
          status: 'EXPIRED',
          updatedAt: serverTimestamp(),
        });

        // Log audit event
        await logMembershipAudit(
          'MEMBERSHIP_EXPIRE',
          membership.userId,
          membership.tier,
          {
            previousTier: membership.tier,
            expiryDate: membership.expiresAt?.toDate().toISOString(),
          },
          'SCHEDULED_JOB'
        );

        expiredCount++;
      }

      if (expiredCount > 0) {
        await batch.commit();
      }

      // Also check for payment failures in grace period
      const gracePeriodExpiredQuery = await db
        .collection('user_membership')
        .where('status', '==', 'PAYMENT_FAILED')
        .where('gracePeriodExpiresAt', '<=', now)
        .get();

      let gracePeriodExpiredCount = 0;

      for (const doc of gracePeriodExpiredQuery.docs) {
        const membership = doc.data() as UserMembership;

        await db
          .collection('user_membership')
          .doc(doc.id)
          .update({
            tier: 'NONE',
            status: 'EXPIRED',
            updatedAt: serverTimestamp(),
          });

        await logMembershipAudit(
          'MEMBERSHIP_EXPIRE',
          membership.userId,
          membership.tier,
          {
            reason: 'PAYMENT_FAILED_GRACE_PERIOD_EXPIRED',
          },
          'SCHEDULED_JOB'
        );

        gracePeriodExpiredCount++;
      }

      logger.info(
        `Membership expiration complete: ${expiredCount} expired, ${gracePeriodExpiredCount} grace period expired`
      );

      return null;
    } catch (error: any) {
      logger.error('Error in membership expiration job', error);
      throw error;
    }
  }
);

// ============================================================================
// STRIPE WEBHOOK HANDLERS
// ============================================================================

/**
 * Handle successful subscription creation/payment
 * Called from Stripe webhook handler
 */
export async function handleSubscriptionCreated(
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = subscription.metadata.userId;
  const tier = subscription.metadata.membershipTier as Exclude<
    MembershipTier,
    'NONE'
  >;
  const billingCycle = subscription.metadata.billingCycle as MembershipBillingCycle;

  if (!userId || !tier || !billingCycle) {
    logger.error('Missing metadata in subscription', { subscriptionId: subscription.id });
    return;
  }

  const amount = subscription.items.data[0].price.unit_amount! / 100;
  const currency = subscription.items.data[0].price.currency.toUpperCase();

  await applyMembership(
    userId,
    tier,
    billingCycle,
    subscription.id,
    subscription.customer as string,
    amount,
    currency
  );
}

/**
 * Handle successful recurring payment
 */
export async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<void> {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return; // Not a subscription invoice
  }

  // Get subscription to find user ID
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata.userId;

  if (!userId) {
    logger.error('Missing userId in subscription metadata', { subscriptionId });
    return;
  }

  const amount = invoice.amount_paid / 100;
  const currency = invoice.currency.toUpperCase();

  await renewMembership(userId, subscriptionId, amount, currency);
}

/**
 * Handle failed payment
 */
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = subscription.metadata.userId;

  if (!userId) {
    return;
  }

  const now = Timestamp.now();
  const gracePeriodExpiresAt = Timestamp.fromMillis(
    now.toMillis() + MEMBERSHIP_CONFIG.GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
  );

  // Update membership to payment failed with grace period
  await db
    .collection('user_membership')
    .doc(userId)
    .update({
      status: 'PAYMENT_FAILED',
      gracePeriodExpiresAt,
      updatedAt: now,
    });

  // Log audit event
  const membership = await getMembershipStatus(userId);
  if (membership) {
    await logMembershipAudit(
      'MEMBERSHIP_PAYMENT_FAILED',
      userId,
      membership.tier,
      {
        stripeSubscriptionId: subscriptionId,
        gracePeriodExpiresAt: gracePeriodExpiresAt.toDate().toISOString(),
      },
      'STRIPE_WEBHOOK'
    );
  }

  logger.warn(`Payment failed for subscription ${subscriptionId}`, {
    userId,
    gracePeriodExpiresAt: gracePeriodExpiresAt.toDate(),
  });
}

/**
 * Handle subscription cancellation
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = subscription.metadata.userId;

  if (!userId) {
    return;
  }

  const now = Timestamp.now();

  // Mark membership as cancelled/expired
  await db
    .collection('user_membership')
    .doc(userId)
    .update({
      tier: 'NONE',
      status: 'EXPIRED',
      autoRenew: false,
      updatedAt: now,
    });

  logger.info(`Subscription cancelled for user ${userId}`, {
    subscriptionId: subscription.id,
  });
}