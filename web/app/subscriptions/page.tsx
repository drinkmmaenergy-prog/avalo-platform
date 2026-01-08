/**
 * Subscriptions Page - VIP/Royal Memberships
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db, getCurrentIdToken } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { 
  getStripe, 
  SUBSCRIPTION_TIERS, 
  createSubscriptionSession,
  createPortalSession 
} from "@/lib/stripe";
import { UserProfile, MembershipTier } from "@/lib/types";

export default function SubscriptionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [managingSubscription, setManagingSubscription] = useState(false);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        router.push("/");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Profile subscription
  useEffect(() => {
    if (!user) return;

    const profileRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(profileRef, (snapshot) => {
      if (snapshot.exists()) {
        setProfile(snapshot.data() as UserProfile);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const currentTier: MembershipTier = profile?.membershipTier || "none";

  // Handle subscription purchase
  const handleSubscribe = async (tierId: string) => {
    if (!user) return;

    setSubscribing(tierId);
    try {
      const idToken = await getCurrentIdToken();
      if (!idToken) {
        throw new Error("Not authenticated");
      }

      // Create subscription session
      const sessionId = await createSubscriptionSession(tierId, user.uid, idToken);

      // Redirect to Stripe Checkout
      const stripe = await getStripe();
      if (!stripe) {
        throw new Error("Stripe not loaded");
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });

      if (error) {
        throw error;
      }
    } catch (error: any) {
      console.error("Subscription error:", error);
      alert(error.message || "Failed to start subscription");
      setSubscribing(null);
    }
  };

  // Handle manage subscription (customer portal)
  const handleManageSubscription = async () => {
    if (!user) return;

    setManagingSubscription(true);
    try {
      const idToken = await getCurrentIdToken();
      if (!idToken) {
        throw new Error("Not authenticated");
      }

      const portalUrl = await createPortalSession(idToken);
      window.location.href = portalUrl;
    } catch (error: any) {
      console.error("Portal error:", error);
      alert(error.message || "Failed to open customer portal");
      setManagingSubscription(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Memberships</h1>
              <p className="text-gray-600 mt-1">Upgrade your Avalo experience</p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="btn-secondary"
            >
              Dashboard
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Current Status */}
        <div className="card mb-8 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Current Membership
              </h2>
              <p className="text-2xl font-bold">
                {currentTier === "none" && "Standard (Free)"}
                {currentTier === "vip" && "🌟 VIP Member"}
                {currentTier === "royal" && "👑 Royal Member"}
              </p>
            </div>
            {currentTier !== "none" && (
              <button
                onClick={handleManageSubscription}
                disabled={managingSubscription}
                className="btn-secondary"
              >
                {managingSubscription ? "Loading..." : "Manage Subscription"}
              </button>
            )}
          </div>
        </div>

        {/* Subscription Tiers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {SUBSCRIPTION_TIERS.map((tier) => {
            const isCurrentTier = 
              (tier.type === "vip" && currentTier === "vip") ||
              (tier.type === "royal" && currentTier === "royal");
            const canSubscribe = 
              currentTier === "none" || 
              (currentTier === "vip" && tier.type === "royal");

            return (
              <div
                key={tier.id}
                className={`card relative ${
                  tier.popular ? "ring-2 ring-purple-500 shadow-xl" : ""
                } ${isCurrentTier ? "bg-purple-50 border-purple-300" : ""}`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="badge badge-info px-4 py-1 text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    {tier.name}
                  </h3>
                  <div className="text-5xl font-bold text-purple-600 mb-2">
                    {tier.displayPrice}
                  </div>
                  {isCurrentTier && (
                    <span className="inline-block px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                      Current Plan
                    </span>
                  )}
                </div>

                <ul className="space-y-3 mb-6">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-green-500 mr-2">✓</span>
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                {!isCurrentTier && canSubscribe && (
                  <button
                    onClick={() => handleSubscribe(tier.id)}
                    disabled={subscribing === tier.id}
                    className={`w-full ${
                      tier.popular ? "btn-primary" : "btn-secondary"
                    } ${subscribing === tier.id ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {subscribing === tier.id ? (
                      <span className="flex items-center justify-center">
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </span>
                    ) : (
                      `Subscribe to ${tier.name}`
                    )}
                  </button>
                )}

                {isCurrentTier && (
                  <div className="text-center text-purple-600 font-medium py-3">
                    You have this plan
                  </div>
                )}

                {!canSubscribe && !isCurrentTier && (
                  <div className="text-center text-gray-500 text-sm py-3">
                    {tier.type === "vip" && currentTier === "royal" && 
                      "You already have a higher tier"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Benefits Comparison */}
        <div className="card">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Why Upgrade?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-4xl mb-2">💬</div>
              <h3 className="font-bold text-gray-900 mb-2">Better Connections</h3>
              <p className="text-sm text-gray-600">
                Unlimited likes and SuperLikes to find your perfect match
              </p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-4xl mb-2">📞</div>
              <h3 className="font-bold text-gray-900 mb-2">Save on Calls</h3>
              <p className="text-sm text-gray-600">
                50% discount on all video and voice calls
              </p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-4xl mb-2">⭐</div>
              <h3 className="font-bold text-gray-900 mb-2">Stand Out</h3>
              <p className="text-sm text-gray-600">
                Priority visibility and exclusive badges
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}