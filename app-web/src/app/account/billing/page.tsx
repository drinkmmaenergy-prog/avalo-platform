/**
 * PACK 343 — Billing & Subscriptions Page
 * Manage VIP/Royal subscriptions via Stripe
 */

'use client';

import React, { useEffect, useState } from 'react';
import { AccountLayout } from '../../../components/account/AccountLayout';
import { ComplianceGate } from '../../../components/account/ComplianceGate';
import { useSubscription } from '../../../../hooks/useSubscription';
import { useCompliance } from '../../../../hooks/useCompliance';
import type { UserSubscription, SubscriptionPlan } from '../../../../hooks/useSubscription';
import type { UserComplianceStatus } from '../../../../hooks/useCompliance';

export default function BillingPage() {
  const { getCurrentSubscription, getSubscriptionPlans, createCheckoutSession, createBillingPortalSession } =
    useSubscription();
  const { getComplianceStatus, canChangeSubscription } = useCompliance();

  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [compliance, setCompliance] = useState<UserComplianceStatus | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<'PLN' | 'USD' | 'EUR'>('PLN');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [subscriptionData, complianceData] = await Promise.all([
        getCurrentSubscription(),
        getComplianceStatus(),
      ]);

      setSubscription(subscriptionData);
      setCompliance(complianceData);
      setPlans(getSubscriptionPlans());
    } catch (err: any) {
      console.error('Load billing error:', err);
      setError(err.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!subscription || !compliance) return;

    // Check compliance
    if (!canChangeSubscription(compliance)) {
      alert('You cannot change subscription at this time. Please check your account status.');
      return;
    }

    try {
      setPurchasing(planId);
      const checkoutUrl = await createCheckoutSession(planId as any);
      window.location.href = checkoutUrl;
    } catch (err: any) {
      console.error('Subscribe error:', err);
      alert(err.message || 'Failed to start subscription checkout');
    } finally {
      setPurchasing(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      setPurchasing('MANAGE');
      const portalUrl = await createBillingPortalSession();
      window.location.href = portalUrl;
    } catch (err: any) {
      console.error('Billing portal error:', err);
      alert(err.message || 'Failed to open billing portal');
    } finally {
      setPurchasing(null);
    }
  };

  const getPrice = (plan: SubscriptionPlan) => {
    switch (currency) {
      case 'USD':
        return plan.priceUSD?.toFixed(2) || plan.pricePLN.toFixed(2);
      case 'EUR':
        return plan.priceEUR?.toFixed(2) || plan.pricePLN.toFixed(2);
      default:
        return plan.pricePLN.toFixed(2);
    }
  };

  if (loading) {
    return (
      <AccountLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading billing...</p>
          </div>
        </div>
      </AccountLayout>
    );
  }

  if (error) {
    return (
      <AccountLayout>
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Billing</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={loadData}
            className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition"
          >
            Retry
          </button>
        </div>
      </AccountLayout>
    );
  }

  return (
    <AccountLayout>
      <ComplianceGate complianceStatus={compliance!} requiredFor="SUBSCRIPTION">
        <div>
          {/* Current Subscription */}
          <section className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Current Subscription</h2>
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">Active Plan</p>
                  <h3 className="text-3xl font-bold text-gray-900 mb-2">
                    {subscription?.tier || 'FREE'}
                    {subscription?.tier === 'VIP' && ' 👑'}
                    {subscription?.tier === 'ROYAL' && ' 💎'}
                  </h3>
                  {subscription?.source && subscription.source !== 'WEB_STRIPE' && (
                    <p className="text-sm text-amber-600 mb-2">
                      ⚠️ Managed via{' '}
                      {subscription.source === 'IOS_STORE' ? 'App Store' : 'Google Play'}
                    </p>
                  )}
                  {subscription?.renewsAt && subscription.isActive && (
                    <p className="text-sm text-gray-600">
                      Renews: {new Date(subscription.renewsAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {subscription?.source === 'WEB_STRIPE' && subscription.tier !== 'FREE' && (
                  <button
                    onClick={handleManageSubscription}
                    disabled={purchasing === 'MANAGE'}
                    className="bg-white border-2 border-purple-600 text-purple-600 px-6 py-2 rounded-lg hover:bg-purple-50 transition disabled:opacity-50"
                  >
                    {purchasing === 'MANAGE' ? 'Loading...' : 'Manage Subscription'}
                  </button>
                )}
                {subscription?.source !== 'WEB_STRIPE' && subscription?.tier !== 'FREE' && (
                  <button
                    onClick={() => alert('Please manage your subscription on your mobile device')}
                    className="bg-white border-2 border-gray-400 text-gray-600 px-6 py-2 rounded-lg"
                  >
                    Manage on Device
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Currency Selector */}
          {subscription?.source === 'WEB_STRIPE' && (
            <div className="mb-6 flex justify-center gap-2">
              {(['PLN', 'USD', 'EUR'] as const).map((curr) => (
                <button
                  key={curr}
                  onClick={() => setCurrency(curr)}
                  className={`px-4 py-2 rounded-lg font-semibold transition ${
                    currency === curr
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>
          )}

          {/* Subscription Plans */}
          {subscription?.source === 'WEB_STRIPE' && (
            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-6">Available Plans</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {plans.map((plan) => {
                  const isCurrentPlan = subscription?.tier === plan.id;
                  const isFree = plan.id === 'FREE';

                  return (
                    <div
                      key={plan.id}
                      className={`bg-white rounded-2xl shadow-md p-6 relative ${
                        plan.popular ? 'ring-2 ring-purple-600' : ''
                      }`}
                    >
                      {plan.popular && (
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-bold">
                          ⭐ Most Popular
                        </div>
                      )}

                      {isCurrentPlan && (
                        <div className="absolute -top-3 right-6 bg-green-600 text-white px-4 py-1 rounded-full text-sm font-bold">
                          ✓ Current
                        </div>
                      )}

                      <div className="text-center mb-6 mt-2">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                        <div className="text-4xl font-bold text-purple-600 my-4">
                          {isFree ? 'Free' : `${getPrice(plan)} ${currency}`}
                        </div>
                        {!isFree && <p className="text-gray-600 text-sm">per month</p>}
                      </div>

                      <div className="space-y-3 mb-6">
                        <div className="flex items-start gap-2 text-sm">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <span className="text-gray-700">
                            {plan.benefits.voiceCallDiscount > 0
                              ? `-${plan.benefits.voiceCallDiscount}% on voice/video calls`
                              : 'Full pay-per-use pricing'}
                          </span>
                        </div>
                        {plan.benefits.prioritySupport && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="text-green-600 mt-0.5">✓</span>
                            <span className="text-gray-700">Priority support</span>
                          </div>
                        )}
                        {plan.benefits.profileBoost && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="text-green-600 mt-0.5">✓</span>
                            <span className="text-gray-700">Profile boost</span>
                          </div>
                        )}
                        {plan.benefits.betterChatEconomics && (
                          <div className="flex items-start gap-2 text-sm">
                            <span className="text-green-600 mt-0.5">✓</span>
                            <span className="text-gray-700">Better chat economics (7-word buckets)</span>
                          </div>
                        )}
                      </div>

                      {!isFree && (
                        <button
                          onClick={() => handleSubscribe(plan.id)}
                          disabled={isCurrentPlan || purchasing === plan.id}
                          className={`w-full py-3 rounded-lg font-semibold transition ${
                            isCurrentPlan
                              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                              : 'bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50'
                          }`}
                        >
                          {isCurrentPlan
                            ? 'Current Plan'
                            : purchasing === plan.id
                            ? 'Processing...'
                            : 'Subscribe'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Comparison Table */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Plan Comparison</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Feature</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-900">Free</th>
                        <th className="text-center py-3 px-4 font-semibold text-purple-600">VIP</th>
                        <th className="text-center py-3 px-4 font-semibold text-purple-800">Royal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="py-3 px-4">Voice/Video Call Discount</td>
                        <td className="text-center py-3 px-4">0%</td>
                        <td className="text-center py-3 px-4 font-semibold text-purple-600">-30%</td>
                        <td className="text-center py-3 px-4 font-semibold text-purple-800">-50%</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4">Priority Support</td>
                        <td className="text-center py-3 px-4">—</td>
                        <td className="text-center py-3 px-4 text-green-600">✓</td>
                        <td className="text-center py-3 px-4 text-green-600">✓</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4">Profile Boost</td>
                        <td className="text-center py-3 px-4">—</td>
                        <td className="text-center py-3 px-4">—</td>
                        <td className="text-center py-3 px-4 text-green-600">✓</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4">Better Chat Economics</td>
                        <td className="text-center py-3 px-4">—</td>
                        <td className="text-center py-3 px-4">—</td>
                        <td className="text-center py-3 px-4 text-green-600">✓</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* Mobile Subscription Notice */}
          {subscription?.source !== 'WEB_STRIPE' && subscription?.tier !== 'FREE' && (
            <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-6">
              <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <span>ℹ️</span>
                <span>Mobile Subscription</span>
              </h4>
              <p className="text-blue-800 text-sm mb-3">
                Your subscription is managed through{' '}
                {subscription?.source === 'IOS_STORE' ? 'App Store' : 'Google Play'}. To make
                changes, please use your mobile device.
              </p>
              <p className="text-blue-700 text-sm">
                You can view your subscription status here, but modifications must be done through
                the app store on your device.
              </p>
            </div>
          )}
        </div>
      </ComplianceGate>
    </AccountLayout>
  );
}
