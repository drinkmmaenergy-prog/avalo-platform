/**
 * Creator Dashboard
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { UserProfile, UserWallet, Transaction } from "@/lib/types";
import { BarChart, TrendingUp, Users, DollarSign, Clock } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Recent transactions
  useEffect(() => {
    if (!user) return;

    const fetchTransactions = async () => {
      const txnRef = collection(db, "transactions");
      const q = query(
        txnRef,
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(10)
      );

      const snapshot = await getDocs(q);
      const transactions = snapshot.docs.map((doc) => ({
        ...doc.data(),
        txnId: doc.id,
      })) as Transaction[];

      setRecentTransactions(transactions);
    };

    fetchTransactions();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const isEarner = profile?.earnFromChat || false;
  const isRoyal = profile?.isRoyalEarner || false;
  const earningsValue = wallet?.earned ? wallet.earned * 0.2 : 0; // 1 token = 0.20 PLN

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600 mt-1">
                Welcome back, {profile?.displayName || "User"}!
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/wallet")}
                className="btn-secondary"
              >
                Wallet
              </button>
              {profile?.role === "admin" && (
                <button
                  onClick={() => router.push("/admin")}
                  className="btn-primary"
                >
                  Admin Panel
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Balance */}
          <div className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Token Balance</p>
                <p className="text-3xl font-bold text-primary-500">
                  {wallet?.balance || 0}
                </p>
              </div>
              <div className="p-3 bg-primary-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-primary-500" />
              </div>
            </div>
          </div>

          {/* Earnings */}
          <div className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Earned</p>
                <p className="text-3xl font-bold text-green-600">
                  {wallet?.earned || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  ≈ {earningsValue.toFixed(2)} PLN
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          {/* Pending */}
          <div className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Pending</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {wallet?.pending || 0}
                </p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          {/* Quality Score */}
          <div className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Quality Score</p>
                <p className="text-3xl font-bold text-gray-900">
                  {profile?.qualityScore || 100}
                </p>
              </div>
              <div className="p-3 bg-gray-100 rounded-lg">
                <BarChart className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Earner Status */}
          {isEarner && (
            <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
              <h3 className="text-lg font-semibold text-green-900 mb-2">
                💰 Earning Mode Active
              </h3>
              <p className="text-sm text-green-800 mb-3">
                You're earning tokens from chat messages and bookings.
              </p>
              <div className="space-y-1 text-sm text-green-700">
                <p>• {isRoyal ? "7" : "11"} words/token rate</p>
                <p>• Receive 65% of chat deposits</p>
                <p>• 80% of booking payments</p>
              </div>
            </div>
          )}

          {/* Royal Status */}
          {isRoyal && (
            <div className="card bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
              <h3 className="text-lg font-semibold text-purple-900 mb-2 flex items-center gap-2">
                <span>👑</span> Royal Club Member
              </h3>
              <p className="text-sm text-purple-800 mb-3">
                You have exclusive Royal privileges!
              </p>
              <div className="space-y-1 text-sm text-purple-700">
                <p>• Unlimited swipes</p>
                <p>• Queue bypass priority</p>
                <p>• 7 words/token (vs 11 standard)</p>
                <p>• Exclusive badge</p>
              </div>
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              Recent Transactions
            </h2>
            <button
              onClick={() => router.push("/transactions")}
              className="text-primary-500 hover:text-primary-600 font-medium text-sm"
            >
              View All →
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No transactions yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Type
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Description
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Amount
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((txn) => (
                    <tr key={txn.txnId} className="border-b border-gray-100">
                      <td className="py-3 px-4">
                        <span
                          className={`badge ${
                            txn.type === "credit"
                              ? "badge-success"
                              : txn.type === "earning"
                              ? "badge-info"
                              : txn.type === "payout"
                              ? "badge-warning"
                              : "badge-danger"
                          }`}
                        >
                          {txn.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">
                        {txn.description}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold ${
                          txn.type === "credit" || txn.type === "earning"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {txn.type === "credit" || txn.type === "earning" ? "+" : "-"}
                        {txn.amount} 🪙
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-gray-500">
                        {txn.createdAt?.toDate?.().toLocaleDateString() || "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
