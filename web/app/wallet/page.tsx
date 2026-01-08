/**
 * Wallet Page - Token Purchase
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db, getCurrentIdToken } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { getStripe, TOKEN_PACKAGES, createCheckoutSession } from "@/lib/stripe";
import { UserWallet } from "@/lib/types";

export default function WalletPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

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

  // Wallet subscription
  useEffect(() => {
    if (!user) return;

    const walletRef = doc(db, "users", user.uid, "wallet", "current");
    const unsubscribe = onSnapshot(walletRef, (snapshot) => {
      if (snapshot.exists()) {
        setWallet(snapshot.data() as UserWallet);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Handle package purchase
  const handlePurchase = async (packageId: string) => {
    if (!user) return;

    setPurchasing(packageId);
    try {
      const idToken = await getCurrentIdToken();
      if (!idToken) {
        throw new Error("Not authenticated");
      }

      // Create checkout session
      const sessionId = await createCheckoutSession(packageId, user.uid, idToken);

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
      console.error("Purchase error:", error);
      alert(error.message || "Failed to start checkout");
      setPurchasing(null);
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
              <h1 className="text-3xl font-bold text-gray-900">Wallet</h1>
              <p className="text-gray-600 mt-1">Manage your tokens and purchases</p>
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
        {/* Balance Card */}
        <div className="card mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Available Balance</p>
              <p className="text-3xl font-bold text-primary-500">
                {wallet?.balance || 0}
                <span className="text-xl ml-1">🪙</span>
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Pending</p>
              <p className="text-2xl font-semibold text-yellow-600">
                {wallet?.pending || 0} 🪙
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Earned</p>
              <p className="text-2xl font-semibold text-green-600">
                {wallet?.earned || 0} 🪙
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Spent</p>
              <p className="text-2xl font-semibold text-gray-600">
                {wallet?.spent || 0} 🪙
              </p>
            </div>
          </div>
        </div>

        {/* Token Packages */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Buy Tokens
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TOKEN_PACKAGES.map((pkg) => (
              <div
                key={pkg.id}
                className={`card relative ${
                  pkg.popular ? "ring-2 ring-primary-500" : ""
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="badge badge-info px-3 py-1">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {pkg.name}
                  </h3>
                  <div className="text-4xl font-bold text-primary-500 mb-2">
                    {pkg.tokens}
                    <span className="text-2xl ml-1">🪙</span>
                  </div>
                  <p className="text-2xl font-semibold text-gray-900 mb-1">
                    {pkg.price} PLN
                  </p>
                  {pkg.savings && (
                    <p className="text-sm text-green-600 font-medium mb-4">
                      {pkg.savings}
                    </p>
                  )}
                  <button
                    onClick={() => handlePurchase(pkg.id)}
                    disabled={purchasing === pkg.id}
                    className={`w-full ${
                      pkg.popular ? "btn-primary" : "btn-secondary"
                    } ${purchasing === pkg.id ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {purchasing === pkg.id ? (
                      <span className="flex items-center justify-center">
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </span>
                    ) : (
                      "Buy Now"
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 card bg-blue-50 border-blue-200">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            💡 About Tokens
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• 1 token = 0.20 PLN settlement rate for creators</li>
            <li>• Tokens are used for chat messages and calendar bookings</li>
            <li>• Larger packages offer better value</li>
            <li>• Unused tokens never expire</li>
            <li>• Secure payment via Stripe</li>
          </ul>
        </div>

        {/* Transaction History Link */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push("/transactions")}
            className="text-primary-500 hover:text-primary-600 font-medium"
          >
            View Transaction History →
          </button>
        </div>
      </main>
    </div>
  );
}
