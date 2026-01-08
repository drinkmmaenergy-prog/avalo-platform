/**
 * PACK 50 — Royal Club Stripe Webhook Handler
 * Handles subscription events for Royal Club tiers
 */

import Stripe from 'stripe';
import {
  upsertRoyalSubscription,
  cancelRoyalSubscription,
} from './royalEngine';

/**
 * Handle Stripe webhook events for Royal subscriptions
 */
export async function handleRoyalStripeWebhook(
  event: Stripe.Event
): Promise<{ handled: boolean; message: string }> {
  
  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        return await handleSubscriptionCreatedOrUpdated(event);
      
      case 'customer.subscription.deleted':
        return await handleSubscriptionDeleted(event);
      
      default:
        // Not a Royal subscription event
        return { handled: false, message: 'Not a Royal subscription event' };
    }
  } catch (error: any) {
    console.error('[RoyalWebhooks] Error handling webhook:', error);
    throw error;
  }
}

/**
 * Handle subscription created or updated
 */
async function handleSubscriptionCreatedOrUpdated(
  event: Stripe.Event
): Promise<{ handled: boolean; message: string }> {
  
  const subscription = event.data.object as Stripe.Subscription;
  
  // Check if this is a Royal subscription (by product metadata or name)
  const isRoyalSubscription = checkIfRoyalSubscription(subscription);
  
  if (!isRoyalSubscription) {
    return { handled: false, message: 'Not a Royal subscription' };
  }

  // Extract user ID from subscription metadata
  const userId = subscription.metadata?.userId;
  
  if (!userId) {
    console.error('[RoyalWebhooks] No userId in subscription metadata', subscription.id);
    return { handled: false, message: 'Missing userId in metadata' };
  }

  // Determine tier from product
  const tier = determineRoyalTierFromSubscription(subscription);
  
  if (!tier) {
    console.error('[RoyalWebhooks] Could not determine Royal tier', subscription.id);
    return { handled: false, message: 'Could not determine Royal tier' };
  }

  // Upsert Royal subscription
  await upsertRoyalSubscription(userId, {
    customerId: subscription.customer as string,
    subscriptionId: subscription.id,
    tier,
    status: subscription.status as 'active' | 'canceled' | 'incomplete' | 'past_due',
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
  });

  console.log(`[RoyalWebhooks] Upserted Royal subscription for ${userId}: ${tier}`);

  return { handled: true, message: `Royal subscription updated: ${tier}` };
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(
  event: Stripe.Event
): Promise<{ handled: boolean; message: string }> {
  
  const subscription = event.data.object as Stripe.Subscription;
  
  const isRoyalSubscription = checkIfRoyalSubscription(subscription);
  
  if (!isRoyalSubscription) {
    return { handled: false, message: 'Not a Royal subscription' };
  }

  const userId = subscription.metadata?.userId;
  
  if (!userId) {
    return { handled: false, message: 'Missing userId in metadata' };
  }

  await cancelRoyalSubscription(userId);

  console.log(`[RoyalWebhooks] Canceled Royal subscription for ${userId}`);

  return { handled: true, message: 'Royal subscription canceled' };
}

/**
 * Check if subscription is a Royal Club subscription
 */
function checkIfRoyalSubscription(subscription: Stripe.Subscription): boolean {
  // Check metadata
  if (subscription.metadata?.type === 'royal_club') {
    return true;
  }

  // Check product name/metadata (if available through subscription.items)
  for (const item of subscription.items.data) {
    const priceId = item.price.id;
    
    // Check if price ID matches Royal Club patterns
    if (priceId.includes('royal_gold') || priceId.includes('royal_platinum')) {
      return true;
    }
  }

  return false;
}

/**
 * Determine Royal tier from subscription
 */
function determineRoyalTierFromSubscription(
  subscription: Stripe.Subscription
): 'ROYAL_GOLD' | 'ROYAL_PLATINUM' | null {
  
  // Check metadata first
  const tier = subscription.metadata?.tier;
  if (tier === 'ROYAL_GOLD' || tier === 'ROYAL_PLATINUM') {
    return tier;
  }

  // Check price ID patterns
  for (const item of subscription.items.data) {
    const priceId = item.price.id.toLowerCase();
    
    if (priceId.includes('platinum')) {
      return 'ROYAL_PLATINUM';
    }
    if (priceId.includes('gold')) {
      return 'ROYAL_GOLD';
    }
  }

  return null;
}

console.log('✅ Royal Webhooks initialized - PACK 50');