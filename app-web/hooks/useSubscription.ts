/**
 * PACK 343 — Web Subscription Hooks
 * Manage VIP/Royal subscriptions via Stripe
 */

'use client';

import { useState, useCallback } from 'react';

export type SubscriptionTier = 'FREE' | 'VIP' | 'ROYAL';
export type SubscriptionSource = 'WEB_STRIPE' | 'IOS_STORE' | 'ANDROID_PLAY';

export interface UserSubscription {
  userId: string;
  tier: SubscriptionTier;
  source: SubscriptionSource;
  renewsAt: Date | null;
  isActive: boolean;
  benefits: SubscriptionBenefits;
}

export interface SubscriptionBenefits {
  voiceCallDiscount: number; // 0, 30, or 50 percent
  videoCallDiscount: number;
  prioritySupport: boolean;
  profileBoost: boolean;
  betterChatEconomics: boolean;
}

export interface SubscriptionPlan {
  id: 'FREE' | 'VIP' | 'ROYAL';
  name: string;
  pricePLN: number;
  priceUSD?: number;
  priceEUR?: number;
  benefits: SubscriptionBenefits;
  popular?: boolean;
}

/**
 * Hook for managing subscription operations
 */
export function useSubscription() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get user's current subscription status
   */
  const getCurrentSubscription = useCallback(async (): Promise<UserSubscription> => {
    setLoading(true);
    setError(null);

    try {
      // TODO: Replace with Firestore read
      // const db = getFirestore();
      // const uid = auth.currentUser?.uid;
      // if (!uid) throw new Error('Not authenticated');
      // const docRef = doc(db, 'userSubscription', uid);
      // const docSnap = await getDoc(docRef);
      // return docSnap.data() as UserSubscription;

      // Placeholder - Free tier
      return {
        userId: 'placeholder',
        tier: 'FREE',
        source: 'WEB_STRIPE',
        renewsAt: null,
        isActive: true,
        benefits: {
          voiceCallDiscount: 0,
          videoCallDiscount: 0,
          prioritySupport: false,
          profileBoost: false,
          betterChatEconomics: false,
        },
      };
    } catch (err: any) {
      const message = err.message || 'Failed to load subscription';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get available subscription plans
   */
  const getSubscriptionPlans = useCallback((): SubscriptionPlan[] => {
    return [
      {
        id: 'FREE',
        name: 'Free',
        pricePLN: 0,
        priceUSD: 0,
        priceEUR: 0,
        benefits: {
          voiceCallDiscount: 0,
          videoCallDiscount: 0,
          prioritySupport: false,
          profileBoost: false,
          betterChatEconomics: false,
        },
      },
      {
        id: 'VIP',
        name: 'VIP',
        pricePLN: 49.99,
        priceUSD: 12.50,
        priceEUR: 11.50,
        popular: true,
        benefits: {
          voiceCallDiscount: 30,
          videoCallDiscount: 30,
          prioritySupport: true,
          profileBoost: false,
          betterChatEconomics: false,
        },
      },
      {
        id: 'ROYAL',
        name: 'Royal',
        pricePLN: 99.99,
        priceUSD: 25.00,
        priceEUR: 23.00,
        benefits: {
          voiceCallDiscount: 50,
          videoCallDiscount: 50,
          prioritySupport: true,
          profileBoost: true,
          betterChatEconomics: true,
        },
      },
    ];
  }, []);

  /**
   * Create Stripe Checkout session for subscription (PACK 343)
   * Returns URL to redirect user to Stripe Checkout
   */
  const createCheckoutSession = useCallback(async (planId: SubscriptionTier): Promise<string> => {
    setLoading(true);
    setError(null);

    try {
      // TODO: Replace with actual Firebase callable function
      // const functions = getFunctions();
      // const pack343_createStripeCheckoutSessionForSubscription = httpsCallable(
      //   functions,
      //   'pack343_createStripeCheckoutSessionForSubscription'
      // );
      // const result = await pack343_createStripeCheckoutSessionForSubscription({ planId });
      // return result.data.checkoutUrl as string;

      // Placeholder
      throw new Error('Stripe integration not yet configured');
    } catch (err: any) {
      const message = err.message || 'Failed to create checkout session';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create Stripe Billing Portal session (PACK 343)
   * Returns URL to redirect user to Stripe Billing Portal for managing subscription
   */
  const createBillingPortalSession = useCallback(async (): Promise<string> => {
    setLoading(true);
    setError(null);

    try {
      // TODO: Replace with actual Firebase callable function
      // const functions = getFunctions();
      // const pack343_createStripeBillingPortalSession = httpsCallable(
      //   functions,
      //   'pack343_createStripeBillingPortalSession'
      // );
      // const result = await pack343_createStripeBillingPortalSession();
      // return result.data.portalUrl as string;

      // Placeholder
      throw new Error('Stripe integration not yet configured');
    } catch (err: any) {
      const message = err.message || 'Failed to create billing portal session';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Cancel subscription
   */
  const cancelSubscription = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // Redirect to billing portal for cancellation
      const portalUrl = await createBillingPortalSession();
      window.location.href = portalUrl;
    } catch (err: any) {
      const message = err.message || 'Failed to cancel subscription';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [createBillingPortalSession]);

  return {
    loading,
    error,
    getCurrentSubscription,
    getSubscriptionPlans,
    createCheckoutSession,
    createBillingPortalSession,
    cancelSubscription,
  };
}
